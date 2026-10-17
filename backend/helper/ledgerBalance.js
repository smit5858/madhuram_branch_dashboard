const { Op } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { LedgerError, parseId, isSent } = require("@/helper/ledger");
const { Branch, Sale, LedgerBalance } = require("@/models/index");

// Total Balance of the Income and Expense modules, one stored balance per module and branch in
// ledger_balance (see models/ledgerBalance.model.js). Income rows and expense rows are separate,
// so updating or resetting one module never changes the other.
//
// The balance uses the same totals as the module's summary: the SUM of the branch's entries,
// plus, for income, the branch's product sales read live from the sale table. Only entries and
// sales recorded after the branch's last reset count:
//  - Update Balance recalculates the stored balance from them, or (admins, like Rajkot Expense)
//    saves the amount entered. It sets a value rather than adding to it, so a repeated request
//    never changes anything twice.
//  - Reset Balance sets the balance to 0 and moves the cutoff to the newest entry / sale, so the
//    old total stays at 0 after a reload. No entry, sale, stock or history is deleted or changed.
//
// Access (every handler runs after loadBranchScope):
//  - Admins see every branch (or the one they filter on), update one branch or every branch, set
//    one branch's balance to an amount, and reset one branch at a time.
//  - Branch members see and recalculate only their own branch's balance. Setting an amount and
//    resetting are admin only.

// Fits ledger_balance.balance DECIMAL(16, 2)
const MAX_BALANCE = 100000000000000 - 1;
const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;

const paise = (n) => Math.round(Number(n) * 100);
const sumAmount = (list, key) => list.reduce((total, item) => total + paise(item[key]), 0) / 100;

// Balance rows are created on first use. Done outside the transaction that then locks them, so
// two requests creating the same row can't deadlock; an existing row is left as it is.
const ensureBalances = (kind, branchIds) =>
    LedgerBalance.bulkCreate(branchIds.map((branchId) => ({ kind, branchId })), { ignoreDuplicates: true });

const createBalanceController = ({ Model, kind, title, includeSales = false }) => {
    // Branch the balance is read for: members always get their own branch (another one is
    // refused), admins may pick one or get every branch (null). Returns { error, status } or { branchId }.
    const scopedBranchId = (scope, requested, action) => {
        if (!scope.isAdmin) {
            if (isSent(requested) && parseId(requested) !== scope.branchId) {
                return { error: `You can only ${action} the ${kind} balance of your own branch`, status: 403 };
            }
            return { branchId: scope.branchId };
        }
        if (!isSent(requested)) return { branchId: null };
        const branchId = parseId(requested);
        return branchId ? { branchId } : { error: "Invalid branch", status: 400 };
    };

    const findBranches = async (branchId) => {
        const branches = await Branch.findAll({
            where: branchId ? { id: branchId } : {},
            attributes: ["id", "name"],
            order: [["name", "ASC"]],
            raw: true,
        });
        if (branchId && branches.length === 0) throw new LedgerError("Selected branch does not exist", 404);
        return branches;
    };

    // SUM of one table per branch, counting only the rows after that branch's cutoff
    const totalsAfter = async (TableModel, amountColumn, branchIds, cutoffOf, transaction) => {
        if (branchIds.length === 0) return new Map();
        const rows = await TableModel.findAll({
            where: { [Op.or]: branchIds.map((branchId) => ({ branchId, id: { [Op.gt]: cutoffOf(branchId) } })) },
            attributes: ["branchId", [sequelize.fn("SUM", sequelize.col(amountColumn)), "total"]],
            group: ["branchId"],
            raw: true,
            transaction,
        });
        return new Map(rows.map((r) => [r.branchId, Number(r.total) || 0]));
    };

    // Balance per branch from the entries (and, for income, sales) after its last reset.
    // Branches without a balance row have never been reset, so everything counts.
    const calculate = async (branchIds, rowBy, transaction) => {
        const [entries, sales] = await Promise.all([
            totalsAfter(Model, "amount", branchIds, (id) => rowBy.get(id)?.resetAfterEntryId ?? 0, transaction),
            includeSales
                ? totalsAfter(Sale, "sellingAmount", branchIds, (id) => rowBy.get(id)?.resetAfterSaleId ?? 0, transaction)
                : null,
        ]);
        return new Map(branchIds.map((id) => {
            const entriesTotal = entries.get(id) ?? 0;
            const salesTotal = sales?.get(id) ?? 0;
            return [id, { entriesTotal, salesTotal, total: (paise(entriesTotal) + paise(salesTotal)) / 100 }];
        }));
    };

    // Stored balance per branch and overall, plus the balance recalculated from the records
    // (shown so a balance that is out of step with new entries can be spotted). A branch whose
    // balance has never been saved shows the calculated one. Query: { branchId? }.
    const balance = async (req, res) => {
        try {
            const scope = req.branchScope;
            const scoped = scopedBranchId(scope, req.query.branchId, "view");
            if (scoped.error) return sendError(res, scoped.error, null, scoped.status);

            const branches = await findBranches(scoped.branchId);
            const branchIds = branches.map((b) => b.id);
            const rows = branchIds.length > 0
                ? await LedgerBalance.findAll({ where: { kind, branchId: branchIds }, raw: true })
                : [];
            const rowBy = new Map(rows.map((r) => [r.branchId, r]));
            const calculated = await calculate(branchIds, rowBy);

            const branch = branches.map((b) => {
                const row = rowBy.get(b.id);
                const calc = calculated.get(b.id);
                const saved = !!row?.balanceUpdatedAt;
                return {
                    branchId: b.id,
                    branchName: b.name,
                    balance: saved ? Number(row.balance) : calc.total,
                    calculatedBalance: calc.total,
                    ...(includeSales && { entriesTotal: calc.entriesTotal, salesTotal: calc.salesTotal }),
                    resetAt: row?.resetAt ?? null,
                    balanceUpdatedAt: row?.balanceUpdatedAt ?? null,
                };
            });

            const data = {
                branch,
                balance: sumAmount(branch, "balance"),
                calculatedBalance: sumAmount(branch, "calculatedBalance"),
                ...(includeSales && { entriesTotal: sumAmount(branch, "entriesTotal"), salesTotal: sumAmount(branch, "salesTotal") }),
                // What this user may do here; the update and reset endpoints check it again
                canUpdate: branch.length > 0,
                canSetAmount: scope.isAdmin && branch.length > 0,
                canReset: scope.isAdmin && branch.length > 0,
            };
            return sendSuccess(res, `${title} balance...`, data, 200);
        } catch (error) {
            if (error instanceof LedgerError) return sendError(res, error.message, null, error.status);
            return sendError(res, error.message, null, 500);
        }
    };

    // Admins only, like Rajkot Expense. Body: { branchId, balance }: saves the amount entered as
    // that branch's balance (the form starts on the calculated balance). Later updates without
    // an amount recalculate it from the records again.
    const setBalance = async (req, res) => {
        if (!req.branchScope.isAdmin) return sendError(res, `Only an admin can set the ${kind} balance to an amount`, null, 403);
        if (!isSent(req.body.branchId)) return sendError(res, "Select the branch whose balance to set", null, 400);
        const branchId = parseId(req.body.branchId);
        if (!branchId) return sendError(res, "Invalid branch", null, 400);

        const raw = req.body.balance;
        const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
        if (typeof n !== "number" || !Number.isFinite(n)) return sendError(res, "Balance must be a number", null, 400);
        if (n < 0) return sendError(res, "Balance cannot be negative", null, 400);
        if (n > MAX_BALANCE) return sendError(res, `Balance must be at most ${MAX_BALANCE.toLocaleString("en-IN")}`, null, 400);
        if (!AMOUNT_REGEX.test(String(n))) return sendError(res, "Balance can have at most 2 decimal places", null, 400);

        const [branch] = await findBranches(branchId);
        await ensureBalances(kind, [branch.id]);
        const previousBalance = await sequelize.transaction(async (transaction) => {
            const row = await LedgerBalance.findOne({ where: { kind, branchId: branch.id }, transaction, lock: transaction.LOCK.UPDATE });
            const previous = Number(row.balance);
            await row.update({ balance: n, balanceUpdatedAt: new Date(), balanceUpdatedBy: req.employee.id }, { transaction });
            return previous;
        });

        const data = { branch: [{ branchId: branch.id, branchName: branch.name, previousBalance, balance: n }], balance: n };
        return sendSuccess(res, `${title} balance of ${branch.name} updated successfully`, data, 200);
    };

    // Body: { branchId?, balance? }. With balance: see setBalance (admins only). Without it:
    // members update their own branch, admins the branch sent or every branch; each branch's
    // balance is saved as recalculated from its records after the last reset.
    const updateBalance = async (req, res) => {
        try {
            if (isSent(req.body?.balance)) return await setBalance(req, res);

            const scope = req.branchScope;
            const scoped = scopedBranchId(scope, req.body?.branchId, "update");
            if (scoped.error) return sendError(res, scoped.error, null, scoped.status);

            const branches = await findBranches(scoped.branchId);
            const branchIds = branches.map((b) => b.id);
            if (branchIds.length === 0) return sendError(res, "There are no branches to update", null, 400);
            await ensureBalances(kind, branchIds);

            const updated = await sequelize.transaction(async (transaction) => {
                // Locked first, so a reset or update of the same balance waits for this one
                const rows = await LedgerBalance.findAll({ where: { kind, branchId: branchIds }, transaction, lock: transaction.LOCK.UPDATE });
                const rowBy = new Map(rows.map((r) => [r.branchId, r]));
                const calculated = await calculate(branchIds, rowBy, transaction);
                const now = new Date();

                const result = [];
                for (const row of rows) {
                    const value = calculated.get(row.branchId).total;
                    result.push({ branchId: row.branchId, previousBalance: Number(row.balance), balance: value });
                    await row.update({ balance: value, balanceUpdatedAt: now, balanceUpdatedBy: req.employee.id }, { transaction });
                }
                return result;
            });

            const nameOf = new Map(branches.map((b) => [b.id, b.name]));
            const branch = updated.map((b) => ({ ...b, branchName: nameOf.get(b.branchId) }));
            const message = scoped.branchId
                ? `${title} balance of ${nameOf.get(scoped.branchId)} updated successfully`
                : `${title} balance of all branches updated successfully`;
            return sendSuccess(res, message, { branch, balance: sumAmount(branch, "balance") }, 200);
        } catch (error) {
            if (error instanceof LedgerError) return sendError(res, error.message, null, error.status);
            return sendError(res, error.message, null, 500);
        }
    };

    // Admins only. Body: { branchId } (required: one branch at a time). Sets that branch's
    // balance to 0 and moves its cutoff to its newest entry (and sale, for income), so only
    // entries recorded afterwards count. Nothing is deleted; who reset it and when is kept on the row.
    const resetBalance = async (req, res) => {
        try {
            const scope = req.branchScope;
            if (!scope.isAdmin) return sendError(res, `Only an admin can reset the ${kind} balance`, null, 403);
            if (!isSent(req.body?.branchId)) return sendError(res, "Select the branch whose balance to reset", null, 400);
            const branchId = parseId(req.body.branchId);
            if (!branchId) return sendError(res, "Invalid branch", null, 400);

            const [branch] = await findBranches(branchId);
            await ensureBalances(kind, [branch.id]);

            const previousBalance = await sequelize.transaction(async (transaction) => {
                const row = await LedgerBalance.findOne({ where: { kind, branchId: branch.id }, transaction, lock: transaction.LOCK.UPDATE });
                // Shared locks on the branch's rows: an entry or sale still being saved is waited
                // for, so it is either before the cutoff or after it, never lost in between
                const lastId = (TableModel) => TableModel.max("id", { where: { branchId: branch.id }, transaction, lock: transaction.LOCK.SHARE });
                const [lastEntryId, lastSaleId] = await Promise.all([lastId(Model), includeSales ? lastId(Sale) : null]);

                const previous = row.balanceUpdatedAt
                    ? Number(row.balance)
                    : (await calculate([branch.id], new Map([[branch.id, row]]), transaction)).get(branch.id).total;
                const now = new Date();
                await row.update({
                    balance: 0,
                    resetAfterEntryId: Math.max(row.resetAfterEntryId, Number(lastEntryId) || 0),
                    ...(includeSales && { resetAfterSaleId: Math.max(row.resetAfterSaleId, Number(lastSaleId) || 0) }),
                    resetAt: now,
                    resetBy: req.employee.id,
                    balanceUpdatedAt: now,
                    balanceUpdatedBy: req.employee.id,
                }, { transaction });
                return previous;
            });

            const data = { branchId: branch.id, branchName: branch.name, previousBalance, balance: 0 };
            return sendSuccess(res, `${title} balance of ${branch.name} reset to 0`, data, 200);
        } catch (error) {
            if (error instanceof LedgerError) return sendError(res, error.message, null, error.status);
            return sendError(res, error.message, null, 500);
        }
    };

    return { balance, updateBalance, resetBalance };
};

module.exports = { createBalanceController };
