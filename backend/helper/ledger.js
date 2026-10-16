const { Op } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { escapeLike } = require("@/helper/customer");
const { Branch, Employee, Sale } = require("@/models/index");

// Shared handlers for the Income and Expense modules. Both are lists of money entries owned by
// one branch, so they follow the same rules; createLedgerController builds one set of handlers
// per model.
//
// Every handler runs after loadBranchScope, so req.branchScope = { isAdmin, branchId } comes
// from the logged-in employee's record. A branchId in the request is never trusted on its own.
//
// Access:
//  - Admins see and manage every branch's entries and can add an entry for any active branch.
//  - Branch members only ever see their own branch's entries and add entries to it. They can
//    edit or delete only the entries they added themselves; an entry added by an admin or a
//    colleague is read-only for them.
//
// Totals are SUMs over the entry table only (no joins), so an entry is never counted twice.

const MAX_AMOUNT = 1000000000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;
const MIN_YEAR = 2000;
const MAX_DESCRIPTION = 1000;

const INCOME_CATEGORIES = [
    "Service Charges",
    "Repair Work",
    "Commission",
    "Rental Income",
    "Scrap Sale",
    "Interest",
    "Refund Received",
    "Other",
];

const EXPENSE_CATEGORIES = [
    "Rent",
    "Salary",
    "Electricity",
    "Utilities",
    "Transport",
    "Fuel",
    "Repair & Maintenance",
    "Office Supplies",
    "Marketing",
    "Stock Purchase",
    "Tax & Fees",
    "Food & Refreshments",
    "Other",
];

const PAYMENT_METHODS = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque"];

// Filter-only income category for product sales. Sales are read live from the sale table and
// never copied into income, so it can't be picked for a manual entry.
const SALES_CATEGORY = "Product Sales";

// Thrown inside a transaction so it rolls back, then turned into an API error
class LedgerError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const parseId = (value) => {
    const id = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return Number.isInteger(id) && id > 0 ? id : null;
};

const isSent = (value) => value !== undefined && value !== null && value !== "";

// "yyyy-MM-dd" -> local midnight, or null when malformed or impossible (e.g. 2026-02-31)
const parseDate = (value) => {
    if (typeof value !== "string" || !DATE_REGEX.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
};

const pad = (n) => String(n).padStart(2, "0");

// Inclusive "yyyy-MM-dd" bounds of a month (or a whole year when month is null). The last day
// comes from the calendar, so 28/29/30/31-day months all include their final day.
const periodBounds = (year, month) => {
    if (!month) return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
    const lastDay = new Date(year, month, 0).getDate();
    return { startDate: `${year}-${pad(month)}-01`, endDate: `${year}-${pad(month)}-${pad(lastDay)}` };
};

const parseAmount = (amount) => {
    const n = typeof amount === "string" && amount.trim() !== "" ? Number(amount) : amount;
    if (!isSent(n)) return { error: "Amount is required" };
    if (typeof n !== "number" || !Number.isFinite(n)) return { error: "Amount must be a number" };
    if (n <= 0) return { error: "Amount must be greater than 0" };
    if (n > MAX_AMOUNT) return { error: `Amount must be at most ${MAX_AMOUNT.toLocaleString("en-IN")}` };
    if (!AMOUNT_REGEX.test(String(n))) return { error: "Amount can have at most 2 decimal places" };
    return { value: n };
};

const parseEntryDate = (value) => {
    if (!value) return { error: "Date is required" };
    if (!parseDate(value)) return { error: "Invalid date" };
    // One day of slack so a client ahead of the server's timezone can still record "today"
    const latest = new Date();
    latest.setHours(0, 0, 0, 0);
    latest.setDate(latest.getDate() + 1);
    if (parseDate(value) > latest) return { error: "Date cannot be in the future" };
    return { value };
};

const parseChoice = (value, list, label) => {
    if (!isSent(value)) return { error: `${label} is required` };
    const match = typeof value === "string" ? list.find((item) => item.toLowerCase() === value.trim().toLowerCase()) : null;
    return match ? { value: match } : { error: `Invalid ${label.toLowerCase()}` };
};

const parseDescription = (value) => {
    if (!isSent(value)) return { value: null };
    if (typeof value !== "string") return { error: "Invalid description" };
    const trimmed = value.trim();
    if (trimmed.length > MAX_DESCRIPTION) return { error: `Description must be at most ${MAX_DESCRIPTION} characters` };
    return { value: trimmed || null };
};

// Branch members always act on their own branch: a branchId they send is accepted only when
// it is that branch. Admins must say which branch. Returns { error, status } or { branchId }.
const resolveBranchId = (scope, requested, label) => {
    const parsed = parseId(requested);

    if (!scope.isAdmin) {
        if (isSent(requested) && parsed !== scope.branchId) {
            return { error: `You can only manage ${label} for your own branch`, status: 403 };
        }
        return { branchId: scope.branchId };
    }

    if (!parsed) return { error: isSent(requested) ? "Invalid branch" : "Branch is required", status: 400 };
    return { branchId: parsed };
};

// Filters shared by the list and its totals. Returns { error, status } or { where, period }.
//  - branchId: admins may narrow to one branch; members get their own branch whatever is sent
//    (another branch is refused).
//  - startDate / endDate: inclusive date range. Takes precedence over month / year.
//  - year (+ optional month 1-12): the whole month, or the whole year.
//  - category: exact category; search: text in the description or category.
const buildLedgerWhere = (scope, query, label) => {
    const where = {};

    if (scope.isAdmin) {
        if (isSent(query.branchId)) {
            const branchId = parseId(query.branchId);
            if (!branchId) return { error: "Invalid branch" };
            where.branchId = branchId;
        }
    } else {
        if (isSent(query.branchId) && parseId(query.branchId) !== scope.branchId) {
            return { error: `You can only view ${label} for your own branch`, status: 403 };
        }
        where.branchId = scope.branchId;
    }

    let startDate = null;
    let endDate = null;
    if (isSent(query.startDate) || isSent(query.endDate)) {
        if (isSent(query.startDate) && !parseDate(query.startDate)) return { error: "Invalid start date" };
        if (isSent(query.endDate) && !parseDate(query.endDate)) return { error: "Invalid end date" };
        startDate = query.startDate || null;
        endDate = query.endDate || null;
        // yyyy-MM-dd strings compare correctly as text
        if (startDate && endDate && startDate > endDate) return { error: "Start date must be on or before end date" };
    } else if (isSent(query.year)) {
        const year = Number(query.year);
        if (!Number.isInteger(year) || year < MIN_YEAR || year > 9999) return { error: "Invalid year" };
        let month = null;
        if (isSent(query.month)) {
            month = Number(query.month);
            if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Invalid month" };
        }
        ({ startDate, endDate } = periodBounds(year, month));
    } else if (isSent(query.month)) {
        return { error: "Year is required with month" };
    }

    if (startDate || endDate) {
        where.entryDate = {};
        if (startDate) where.entryDate[Op.gte] = startDate;
        if (endDate) where.entryDate[Op.lte] = endDate;
    }

    if (isSent(query.category)) where.category = String(query.category);

    const search = typeof query.search === "string" ? query.search.trim() : "";
    if (search) {
        const like = { [Op.like]: `%${escapeLike(search)}%` };
        where[Op.or] = [{ description: like }, { category: like }];
    }

    return { where, period: { startDate, endDate } };
};

// Admins manage every entry; members only the entries they added in their own branch
const canManage = (entry, scope, employeeId) =>
    scope.isAdmin || (entry.branchId === scope.branchId && entry.createdBy === employeeId);

// Sales total and count per branch for the same branch and date filters as the ledger. Sales
// have no category or description, so they only count when no search is applied and the
// category filter is empty or SALES_CATEGORY. Returns a Map of branchId -> { total, count }.
const salesTotalsByBranch = async (filter, query) => {
    const category = isSent(query.category) ? String(query.category) : null;
    const search = typeof query.search === "string" ? query.search.trim() : "";
    if (search || (category && category !== SALES_CATEGORY)) return new Map();

    const where = {};
    if (filter.where.branchId) where.branchId = filter.where.branchId;
    const { startDate, endDate } = filter.period;
    if (startDate || endDate) {
        where.saleDate = {};
        if (startDate) where.saleDate[Op.gte] = startDate;
        if (endDate) where.saleDate[Op.lte] = endDate;
    }

    const rows = await Sale.findAll({
        where,
        attributes: [
            "branchId",
            [sequelize.fn("SUM", sequelize.col("sellingAmount")), "total"],
            [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        group: ["branchId"],
        raw: true,
    });
    return new Map(rows.map((r) => [r.branchId, { total: Number(r.total) || 0, count: Number(r.count) || 0 }]));
};

// includeSales (income): totals also count the branch's product sales, read live from the
// sale table, so editing or deleting a sale is reflected immediately and never double counted.
const createLedgerController = ({ Model, label, singular, categories, withPaymentMethod = false, includeSales = false }) => {
    const NOT_FOUND = `${singular[0].toUpperCase()}${singular.slice(1)} entry not found`;

    // A member never finds another branch's entry; it looks missing
    const findScoped = (id, scope, options = {}) =>
        Model.findOne({ where: scope.isAdmin ? { id } : { id, branchId: scope.branchId }, ...options });

    const toResponse = (entry, scope, employeeId) => ({
        id: entry.id,
        branchId: entry.branchId,
        branchName: entry.Branch?.name ?? null,
        entryDate: entry.entryDate,
        amount: Number(entry.amount),
        category: entry.category,
        description: entry.description,
        ...(withPaymentMethod && { paymentMethod: entry.paymentMethod }),
        createdBy: entry.createdBy,
        createdByName: entry.creator?.name ?? null,
        canManage: canManage(entry, scope, employeeId),
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
    });

    // Shared body validation for create and update. Returns { error, status } or { values }.
    const parseBody = (scope, body) => {
        const { entryDate, amount, category, description, paymentMethod, branchId } = body || {};

        const date = parseEntryDate(entryDate);
        if (date.error) return { error: date.error };

        const parsedAmount = parseAmount(amount);
        if (parsedAmount.error) return { error: parsedAmount.error };

        const parsedCategory = parseChoice(category, categories, "Category");
        if (parsedCategory.error) return { error: parsedCategory.error };

        const parsedDescription = parseDescription(description);
        if (parsedDescription.error) return { error: parsedDescription.error };
        if (parsedCategory.value === "Other" && !parsedDescription.value) {
            return { error: "Add a description for the Other category" };
        }

        let parsedPayment = null;
        if (withPaymentMethod) {
            const payment = parseChoice(paymentMethod, PAYMENT_METHODS, "Payment method");
            if (payment.error) return { error: payment.error };
            parsedPayment = payment.value;
        }

        const resolved = resolveBranchId(scope, branchId, label);
        if (resolved.error) return resolved;

        return {
            values: {
                entryDate: date.value,
                amount: parsedAmount.value,
                category: parsedCategory.value,
                description: parsedDescription.value,
                ...(withPaymentMethod && { paymentMethod: parsedPayment }),
                branchId: resolved.branchId,
            },
        };
    };

    // New entries can't be recorded against a missing or inactive branch
    const checkBranch = async (branchId, scope, transaction) => {
        const branch = await Branch.findByPk(branchId, { transaction });
        if (!branch) throw new LedgerError("Selected branch does not exist");
        if (!branch.isActive) throw new LedgerError(scope.isAdmin ? "Selected branch is inactive" : "Your branch is inactive");
    };

    const sendLedgerError = (res, error) => {
        if (error instanceof LedgerError) return sendError(res, error.message, null, error.status);
        return sendError(res, error.message, null, 500);
    };

    // Branches the user can pick plus the fixed lists for the form. ownBranchId is the user's
    // assigned branch (also for admins, so their form starts on their own branch).
    const options = async (req, res) => {
        try {
            const { isAdmin, branchId } = req.branchScope;
            const branches = await Branch.findAll({
                where: isAdmin ? {} : { id: branchId },
                attributes: ["id", "name", "isActive"],
                order: [["name", "ASC"]],
            });

            if (!isAdmin && branches.length === 0) {
                return sendError(res, "Your assigned branch no longer exists. Contact your administrator.", null, 400);
            }

            const data = {
                isAdmin,
                ownBranchId: req.employee.branchId ?? null,
                branch: branches,
                categories,
                ...(withPaymentMethod && { paymentMethods: PAYMENT_METHODS }),
                ...(includeSales && { salesCategory: SALES_CATEGORY }),
            };
            return sendSuccess(res, `${label} options...`, data, 200);
        } catch (error) {
            return sendError(res, error.message, null, 500);
        }
    };

    const list = async (req, res) => {
        try {
            const scope = req.branchScope;
            const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
            const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 500);
            const offset = (page - 1) * pageSize;

            const filter = buildLedgerWhere(scope, req.query, label);
            if (filter.error) return sendError(res, filter.error, null, filter.status ?? 400);

            const { count, rows } = await Model.findAndCountAll({
                where: filter.where,
                include: [
                    { model: Branch, attributes: ["id", "name"], required: false },
                    { model: Employee, as: "creator", attributes: ["id", "name"], required: false },
                ],
                order: [["entryDate", "DESC"], ["id", "DESC"]],
                limit: pageSize,
                offset,
                distinct: true,
            });

            const data = {
                entry: rows.map((row) => toResponse(row, scope, req.employee.id)),
                pagination: {
                    total: count,
                    page,
                    pageSize,
                    totalPages: Math.ceil(count / pageSize),
                },
            };
            return sendSuccess(res, `All ${label}...`, data, 200);
        } catch (error) {
            return sendError(res, error.message, null, 500);
        }
    };

    // Total amount and number of entries for the list's filters, per branch and overall.
    // Members only get their own branch; admins get every branch (or the one they filtered
    // on), including branches with nothing in the period.
    const summary = async (req, res) => {
        try {
            const scope = req.branchScope;
            const filter = buildLedgerWhere(scope, req.query, label);
            if (filter.error) return sendError(res, filter.error, null, filter.status ?? 400);

            const [rows, branches, sales] = await Promise.all([
                Model.findAll({
                    where: filter.where,
                    attributes: [
                        "branchId",
                        [sequelize.fn("SUM", sequelize.col("amount")), "total"],
                        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
                    ],
                    group: ["branchId"],
                    raw: true,
                }),
                Branch.findAll({
                    where: filter.where.branchId ? { id: filter.where.branchId } : {},
                    attributes: ["id", "name"],
                    order: [["name", "ASC"]],
                    raw: true,
                }),
                includeSales ? salesTotalsByBranch(filter, req.query) : null,
            ]);

            // Amounts are summed in paise so many 2-decimal amounts don't drift
            const paise = (n) => Math.round(n * 100);
            const sumOf = (list, key) => list.reduce((sum, item) => sum + paise(item[key]), 0) / 100;
            const countOf = (list, key) => list.reduce((sum, item) => sum + item[key], 0);

            const totals = new Map(rows.map((r) => [r.branchId, { total: Number(r.total) || 0, count: Number(r.count) || 0 }]));
            const branch = branches.map((br) => {
                const entries = totals.get(br.id) ?? { total: 0, count: 0 };
                const base = { branchId: br.id, branchName: br.name, total: entries.total, count: entries.count };
                if (!sales) return base;
                // total = manual entries + sales; count stays the number of manual entries
                const sold = sales.get(br.id) ?? { total: 0, count: 0 };
                return {
                    ...base,
                    total: (paise(entries.total) + paise(sold.total)) / 100,
                    entriesTotal: entries.total,
                    salesTotal: sold.total,
                    salesCount: sold.count,
                };
            });

            const data = {
                branch,
                total: sumOf(branch, "total"),
                count: countOf(branch, "count"),
                ...(sales && {
                    entriesTotal: sumOf(branch, "entriesTotal"),
                    salesTotal: sumOf(branch, "salesTotal"),
                    salesCount: countOf(branch, "salesCount"),
                }),
                startDate: filter.period.startDate,
                endDate: filter.period.endDate,
            };
            return sendSuccess(res, `${label} summary...`, data, 200);
        } catch (error) {
            return sendError(res, error.message, null, 500);
        }
    };

    const create = async (req, res) => {
        try {
            const scope = req.branchScope;
            const parsed = parseBody(scope, req.body);
            if (parsed.error) return sendError(res, parsed.error, null, parsed.status ?? 400);

            const entry = await sequelize.transaction(async (transaction) => {
                await checkBranch(parsed.values.branchId, scope, transaction);
                return Model.create({ ...parsed.values, createdBy: req.employee.id }, { transaction });
            });

            return sendSuccess(res, `${singular[0].toUpperCase()}${singular.slice(1)} added successfully`, { id: entry.id }, 201);
        } catch (error) {
            return sendLedgerError(res, error);
        }
    };

    // Members can't move an entry to another branch (resolveBranchId pins it). Admins can.
    const update = async (req, res) => {
        try {
            const scope = req.branchScope;
            const id = parseId(req.params.id);
            if (!id) return sendError(res, "Invalid id", null, 400);

            const parsed = parseBody(scope, req.body);
            if (parsed.error) return sendError(res, parsed.error, null, parsed.status ?? 400);
            const { values } = parsed;

            await sequelize.transaction(async (transaction) => {
                const entry = await findScoped(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
                if (!entry) throw new LedgerError(NOT_FOUND, 404);
                if (!canManage(entry, scope, req.employee.id)) {
                    throw new LedgerError(`You can only edit ${label} you added`, 403);
                }
                // An entry may stay on a branch that has since been deactivated, but can't be moved to one
                if (entry.branchId !== values.branchId) await checkBranch(values.branchId, scope, transaction);
                await entry.update(values, { transaction });
            });

            return sendSuccess(res, `${singular[0].toUpperCase()}${singular.slice(1)} updated successfully`, { id }, 200);
        } catch (error) {
            return sendLedgerError(res, error);
        }
    };

    // Hard delete, like sales
    const remove = async (req, res) => {
        try {
            const scope = req.branchScope;
            const id = parseId(req.params.id);
            if (!id) return sendError(res, "Invalid id", null, 400);

            await sequelize.transaction(async (transaction) => {
                const entry = await findScoped(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
                if (!entry) throw new LedgerError(NOT_FOUND, 404);
                if (!canManage(entry, scope, req.employee.id)) {
                    throw new LedgerError(`You can only delete ${label} you added`, 403);
                }
                await entry.destroy({ transaction });
            });

            return sendSuccess(res, `${singular[0].toUpperCase()}${singular.slice(1)} deleted successfully`, null, 200);
        } catch (error) {
            return sendLedgerError(res, error);
        }
    };

    return { options, list, summary, create, update, remove };
};

module.exports = {
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
    PAYMENT_METHODS,
    SALES_CATEGORY,
    periodBounds,
    buildLedgerWhere,
    canManage,
    createLedgerController,
};
