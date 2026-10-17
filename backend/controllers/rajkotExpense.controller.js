const { Op, UniqueConstraintError } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { escapeLike } = require("@/helper/customer");
const { LedgerError, parseId, isSent, parseAmount, parseEntryDate, parseDescription } = require("@/helper/ledger");
const { findExistingSerials } = require("@/controllers/product.controller");
const {
    Branch, Employee, Product, ProductStock, ProductSerial,
    RajkotExpense, RajkotExpenseItem, RajkotExpenseSerial, RajkotExpenseCounter,
} = require("@/models/index");

// Every handler runs after loadBranchScope, so req.branchScope = { isAdmin, branchId } comes
// from the logged-in employee's record. A branchId in the request is never trusted on its own.
//
// An entry lists one or more catalogue products for one branch, serial-tracked or not.
// Non-serialized products take a quantity; serialized products take new serial numbers that
// must not exist anywhere yet (in stock, sold, or on another entry; unique index). Nothing
// moves while the entry is Pending. Accepting it adds the products to the branch's stock.
//
// Access:
//  - Admins see every branch's entries, add entries for any active branch, delete pending
//    entries, and reset the count / update the balance of one branch or of all of them.
//  - Branch members only ever see their own branch's entries.
//  - An entry is accepted by an employee assigned to the entry's branch (a Rajkot employee
//    accepts Rajkot's entries, never Surat's or Pune's). Accepting is allowed once.
//
// Count and balance live in rajkot_expense_counter, one row per branch. Accepting an entry
// adds its products to stock, 1 to the count and its amount to the balance in the same
// transaction that marks it Accepted, with the rows locked, so nothing is applied twice or partly. Reset sets the
// count to 0 and touches nothing else. Update Balance recalculates the balance as the total of
// the branch's accepted entries.

const STATUS = { PENDING: "Pending", ACCEPTED: "Accepted" };
const STATUSES = Object.values(STATUS);
const MAX_ITEMS = 100;
const MAX_QUANTITY = 1000000000;
const MAX_SERIALS = 1000;
// Fits the counter's DECIMAL(16, 2)
const MAX_BALANCE = 100000000000000 - 1;
const NOT_FOUND = "Rajkot expense entry not found";

// Thrown inside a transaction so it rolls back, then turned into an API error
const RajkotExpenseError = LedgerError;

// Amounts are added in paise so many 2-decimal amounts don't drift
const paise = (n) => Math.round(Number(n) * 100);

const listForMessage = (list) => (list.length > 5 ? `${list.slice(0, 5).join(", ")} and ${list.length - 5} more` : list.join(", "));

const sendRajkotError = (res, error) => {
    if (error instanceof RajkotExpenseError) return sendError(res, error.message, null, error.status);
    if (error instanceof UniqueConstraintError) {
        return sendError(res, "Someone else just saved the same serial number or stock. Please refresh and try again.", null, 409);
    }
    return sendError(res, error.message, null, 500);
};

const adminOnly = (scope, res, action) => {
    if (scope.isAdmin) return false;
    sendError(res, `Only an admin can ${action}`, null, 403);
    return true;
};

// Branch a list or total is narrowed to: members always get their own branch (another one is
// refused), admins may pick one or get every branch (null). Returns { error, status } or { branchId }.
const scopedBranchId = (scope, requested) => {
    if (!scope.isAdmin) {
        if (isSent(requested) && parseId(requested) !== scope.branchId) {
            return { error: "You can only view Rajkot expenses for your own branch", status: 403 };
        }
        return { branchId: scope.branchId };
    }
    if (!isSent(requested)) return { branchId: null };
    const branchId = parseId(requested);
    return branchId ? { branchId } : { error: "Invalid branch", status: 400 };
};

// A member never finds another branch's entry; it looks missing
const findScoped = (id, scope, options = {}) =>
    RajkotExpense.findOne({ where: scope.isAdmin ? { id } : { id, branchId: scope.branchId }, ...options });

// Counter rows are created on first use. Done outside the transaction that then locks them, so
// two requests creating the same row can't deadlock; an existing row is left as it is.
const ensureCounters = (branchIds) =>
    RajkotExpenseCounter.bulkCreate(branchIds.map((branchId) => ({ branchId })), { ignoreDuplicates: true });

// Branches an admin's reset / update applies to: the one sent, or every branch
const targetBranches = async (requested) => {
    if (isSent(requested)) {
        const branchId = parseId(requested);
        if (!branchId) throw new RajkotExpenseError("Invalid branch");
        const branch = await Branch.findByPk(branchId, { attributes: ["id", "name"] });
        if (!branch) throw new RajkotExpenseError("Selected branch does not exist", 404);
        return [branch];
    }
    return Branch.findAll({ attributes: ["id", "name"], order: [["name", "ASC"]] });
};

// Product rows of an entry. Returns { error } or { value: [{ productId, quantity, serialNumbers, amount }] }.
// Quantity is optional for serial-tracked products (it is the number of serial numbers).
const parseItems = (items) => {
    if (!Array.isArray(items) || items.length === 0) return { error: "Add at least one product" };
    if (items.length > MAX_ITEMS) return { error: `At most ${MAX_ITEMS} products in one entry` };

    const productIds = new Set();
    const serialsSeen = new Set();
    const parsed = [];

    for (const [index, item] of items.entries()) {
        const row = `Row ${index + 1}`;
        if (!item || typeof item !== "object" || Array.isArray(item)) return { error: `${row}: invalid product` };

        const productId = parseId(item.productId);
        if (!productId) return { error: `${row}: select a product` };
        if (productIds.has(productId)) return { error: `${row}: this product is already added in another row. Combine them into one row.` };
        productIds.add(productId);

        const { serialNumbers } = item;
        if (serialNumbers !== undefined && serialNumbers !== null
            && (!Array.isArray(serialNumbers) || serialNumbers.some((s) => typeof s !== "string"))) {
            return { error: `${row}: invalid serial numbers` };
        }
        const serials = (serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
        if (serials.length > MAX_SERIALS) return { error: `${row}: at most ${MAX_SERIALS} serial numbers` };
        const tooLong = serials.find((s) => s.length > 100);
        if (tooLong) return { error: `${row}: serial number "${tooLong.slice(0, 20)}..." is longer than 100 characters` };
        for (const sn of serials) {
            if (serialsSeen.has(sn.toLowerCase())) return { error: `Serial number ${sn} is selected more than once` };
            serialsSeen.add(sn.toLowerCase());
        }

        let quantity = null;
        if (isSent(item.quantity)) {
            const n = typeof item.quantity === "string" ? Number(item.quantity) : item.quantity;
            if (typeof n !== "number" || !Number.isInteger(n)) return { error: `${row}: quantity must be a whole number` };
            if (n < 1) return { error: `${row}: quantity must be at least 1` };
            if (n > MAX_QUANTITY) return { error: `${row}: quantity must be at most ${MAX_QUANTITY.toLocaleString("en-IN")}` };
            quantity = n;
        }

        const amount = parseAmount(item.amount);
        if (amount.error) return { error: `${row}: ${amount.error.toLowerCase()}` };

        parsed.push({ productId, quantity, serialNumbers: serials, amount: amount.value });
    }

    return { value: parsed };
};

// Checks every row and returns what is stored for it:
// { productId, productName, hasSerialNumber, quantity, amount, serialNumbers }.
//  - Non-serialized products must be stocked in the branch with enough quantity.
//  - Serialized products take new serial numbers: each must not exist yet anywhere (in stock,
//    sold, or on another Rajkot Expense entry). The product needn't be stocked in the branch.
const checkItems = async (branchId, items, transaction) => {
    const productIds = items.map((item) => item.productId);
    const products = await Product.findAll({ where: { id: productIds }, transaction });
    const productById = new Map(products.map((p) => [p.id, p]));

    const checked = items.map((item, index) => {
        const product = productById.get(item.productId);
        if (!product) throw new RajkotExpenseError(`Row ${index + 1}: the selected product no longer exists`);
        let quantity;
        if (product.hasSerialNumber) {
            if (item.serialNumbers.length === 0) throw new RajkotExpenseError(`Enter the serial numbers of ${product.name}`);
            if (item.quantity !== null && item.quantity !== item.serialNumbers.length) {
                throw new RajkotExpenseError(`Quantity of ${product.name} must match the number of serial numbers selected`);
            }
            quantity = item.serialNumbers.length;
        } else {
            if (item.serialNumbers.length > 0) throw new RajkotExpenseError(`${product.name} doesn't use serial numbers`);
            if (item.quantity === null) throw new RajkotExpenseError(`Enter the quantity of ${product.name}`);
            quantity = item.quantity;
        }

        return { productId: product.id, productName: product.name, hasSerialNumber: product.hasSerialNumber, quantity, amount: item.amount, serialNumbers: item.serialNumbers };
    });

    const allSerials = checked.flatMap((item) => item.serialNumbers);
    if (allSerials.length === 0) return checked;

    // Same rule as the Products module: a serial number that exists (in stock or sold) is never reused
    const existing = await findExistingSerials(allSerials, transaction);
    if (existing.length > 0) {
        throw new RajkotExpenseError(`Serial number already exists: ${listForMessage(existing)}`, 409);
    }

    const used = await RajkotExpenseSerial.findAll({ where: { serialNumber: allSerials }, attributes: ["serialNumber"], transaction });
    if (used.length > 0) {
        throw new RajkotExpenseError(`Already on another Rajkot Expense entry: ${listForMessage(used.map((s) => s.serialNumber))}`, 409);
    }

    return checked;
};

const toEntryResponse = (entry, items, { scope, employee }) => {
    const isPending = entry.status === STATUS.PENDING;
    return {
        id: entry.id,
        branchId: entry.branchId,
        branchName: entry.Branch?.name ?? null,
        entryDate: entry.entryDate,
        description: entry.description,
        status: entry.status,
        totalQuantity: entry.totalQuantity,
        totalAmount: Number(entry.totalAmount),
        items: items.map((item) => ({
            id: item.id,
            productId: item.productId,
            // Follows a product rename; falls back to the saved name once the product is gone
            productName: item.Product?.name ?? item.productName,
            hasSerialNumber: item.hasSerialNumber,
            quantity: item.quantity,
            amount: Number(item.amount),
            serialNumbers: (item.serials ?? []).map((s) => s.serialNumber).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
        })),
        createdBy: entry.createdBy,
        createdByName: entry.creator?.name ?? null,
        acceptedBy: entry.acceptedBy,
        acceptedByName: entry.acceptor?.name ?? null,
        acceptedAt: entry.acceptedAt,
        // Decided here so the page only shows actions the API will allow
        canAccept: isPending && employee.branchId === entry.branchId,
        canDelete: isPending && scope.isAdmin,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
    };
};

// Branches the user can pick: every branch for admins, only their own for members.
// ownBranchId is the user's assigned branch (also for admins), which is the branch whose
// entries they can accept.
exports.options = async (req, res) => {
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

        return sendSuccess(res, "Rajkot expense options...", { isAdmin, ownBranchId: req.employee.branchId ?? null, branch: branches }, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Every catalogue product, for the add form, with its stock in the branch (0 when not stocked
// there). Serialized products take new serial numbers, so they can be added either way;
// non-serialized ones need stock in the branch.
exports.products = async (req, res) => {
    try {
        if (adminOnly(req.branchScope, res, "add Rajkot expenses")) return;
        const branchId = parseId(req.query.branchId);
        if (!branchId) return sendError(res, isSent(req.query.branchId) ? "Invalid branch" : "Branch is required", null, 400);

        const products = await Product.findAll({
            attributes: ["id", "name", "hasSerialNumber"],
            include: [{ model: ProductStock, as: "stocks", where: { branchId }, attributes: ["quantity"], required: false }],
            order: [["name", "ASC"]],
        });

        const data = {
            branchId,
            product: products.map((p) => ({
                id: p.id,
                name: p.name,
                hasSerialNumber: p.hasSerialNumber,
                quantity: p.stocks?.[0]?.quantity ?? 0,
            })),
        };
        return sendSuccess(res, "Rajkot expense products...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Filters: branchId (admins), status (Pending / Accepted), search (product name, serial number
// or description). Newest first.
exports.list = async (req, res) => {
    try {
        const scope = req.branchScope;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 500);
        const offset = (page - 1) * pageSize;

        const scoped = scopedBranchId(scope, req.query.branchId);
        if (scoped.error) return sendError(res, scoped.error, null, scoped.status);

        const where = {};
        if (scoped.branchId) where.branchId = scoped.branchId;

        if (isSent(req.query.status)) {
            const status = STATUSES.find((s) => s.toLowerCase() === String(req.query.status).toLowerCase());
            if (!status) return sendError(res, "Invalid status", null, 400);
            where.status = status;
        }

        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        if (search) {
            const pattern = sequelize.escape(`%${escapeLike(search)}%`);
            where[Op.or] = [
                { description: { [Op.like]: `%${escapeLike(search)}%` } },
                {
                    id: {
                        [Op.in]: sequelize.literal(
                            `(SELECT i.rajkotExpenseId FROM rajkot_expense_item i LEFT JOIN rajkot_expense_serial s ON s.rajkotExpenseItemId = i.id`
                            + ` WHERE i.productName LIKE ${pattern} OR s.serialNumber LIKE ${pattern})`,
                        ),
                    },
                },
            ];
        }

        const { count, rows } = await RajkotExpense.findAndCountAll({
            where,
            include: [
                { model: Branch, attributes: ["id", "name"], required: false },
                { model: Employee, as: "creator", attributes: ["id", "name"], required: false },
                { model: Employee, as: "acceptor", attributes: ["id", "name"], required: false },
            ],
            order: [["entryDate", "DESC"], ["id", "DESC"]],
            limit: pageSize,
            offset,
            distinct: true,
        });

        // Product rows of this page's entries, loaded separately to keep the paged query simple
        const items = rows.length === 0 ? [] : await RajkotExpenseItem.findAll({
            where: { rajkotExpenseId: rows.map((r) => r.id) },
            include: [
                { model: RajkotExpenseSerial, as: "serials", attributes: ["serialNumber"], required: false },
                { model: Product, attributes: ["id", "name"], required: false },
            ],
            order: [["id", "ASC"]],
        });
        const itemsByEntry = new Map();
        for (const item of items) {
            if (!itemsByEntry.has(item.rajkotExpenseId)) itemsByEntry.set(item.rajkotExpenseId, []);
            itemsByEntry.get(item.rajkotExpenseId).push(item);
        }

        const context = { scope, employee: req.employee };
        const data = {
            entry: rows.map((row) => toEntryResponse(row, itemsByEntry.get(row.id) ?? [], context)),
            pagination: { total: count, page, pageSize, totalPages: Math.ceil(count / pageSize) },
        };
        return sendSuccess(res, "All Rajkot expenses...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Stored count and balance per branch, plus the number of pending entries and the balance
// recalculated from the accepted entries (shown so a balance that is out of step can be
// spotted). Members get their own branch; admins every branch, or the one they filtered on.
exports.summary = async (req, res) => {
    try {
        const scoped = scopedBranchId(req.branchScope, req.query.branchId);
        if (scoped.error) return sendError(res, scoped.error, null, scoped.status);

        const branches = await Branch.findAll({
            where: scoped.branchId ? { id: scoped.branchId } : {},
            attributes: ["id", "name"],
            order: [["name", "ASC"]],
            raw: true,
        });
        const branchIds = branches.map((b) => b.id);

        const [counters, totals] = await Promise.all([
            RajkotExpenseCounter.findAll({ where: { branchId: branchIds }, raw: true }),
            RajkotExpense.findAll({
                where: { branchId: branchIds },
                attributes: [
                    "branchId",
                    "status",
                    [sequelize.fn("COUNT", sequelize.col("id")), "entries"],
                    [sequelize.fn("SUM", sequelize.col("totalAmount")), "total"],
                ],
                group: ["branchId", "status"],
                raw: true,
            }),
        ]);

        const counterBy = new Map(counters.map((c) => [c.branchId, c]));
        const totalOf = (branchId, status) => totals.find((t) => t.branchId === branchId && t.status === status);

        const branch = branches.map((b) => {
            const counter = counterBy.get(b.id);
            const accepted = totalOf(b.id, STATUS.ACCEPTED);
            return {
                branchId: b.id,
                branchName: b.name,
                count: counter?.count ?? 0,
                balance: Number(counter?.balance ?? 0),
                calculatedBalance: Number(accepted?.total ?? 0),
                pendingEntries: Number(totalOf(b.id, STATUS.PENDING)?.entries ?? 0),
                acceptedEntries: Number(accepted?.entries ?? 0),
                countResetAt: counter?.countResetAt ?? null,
                balanceUpdatedAt: counter?.balanceUpdatedAt ?? null,
            };
        });

        const sum = (key) => branch.reduce((total, b) => total + b[key], 0);
        const sumAmount = (key) => branch.reduce((total, b) => total + paise(b[key]), 0) / 100;
        const data = {
            branch,
            count: sum("count"),
            balance: sumAmount("balance"),
            calculatedBalance: sumAmount("calculatedBalance"),
            pendingEntries: sum("pendingEntries"),
            acceptedEntries: sum("acceptedEntries"),
        };
        return sendSuccess(res, "Rajkot expense summary...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Admins only. Body: { branchId, entryDate, description?, items: [{ productId, quantity?, serialNumbers?, amount }] }.
// Saved as one transaction: the entry, all of its product rows and serial numbers, or nothing.
exports.create = async (req, res) => {
    try {
        const scope = req.branchScope;
        if (adminOnly(scope, res, "add Rajkot expenses")) return;
        const { branchId: requestedBranchId, entryDate, description, items } = req.body || {};

        const branchId = parseId(requestedBranchId);
        if (!branchId) return sendError(res, isSent(requestedBranchId) ? "Invalid branch" : "Branch is required", null, 400);

        const date = parseEntryDate(entryDate);
        if (date.error) return sendError(res, date.error, null, 400);

        const parsedDescription = parseDescription(description);
        if (parsedDescription.error) return sendError(res, parsedDescription.error, null, 400);

        const parsedItems = parseItems(items);
        if (parsedItems.error) return sendError(res, parsedItems.error, null, 400);

        const entry = await sequelize.transaction(async (transaction) => {
            const branch = await Branch.findByPk(branchId, { transaction });
            if (!branch) throw new RajkotExpenseError("Selected branch does not exist");
            if (!branch.isActive) throw new RajkotExpenseError("Selected branch is inactive");

            const checked = await checkItems(branchId, parsedItems.value, transaction);
            const totalQuantity = checked.reduce((sum, item) => sum + item.quantity, 0);
            if (totalQuantity > MAX_QUANTITY) throw new RajkotExpenseError(`Total quantity must be at most ${MAX_QUANTITY.toLocaleString("en-IN")}`);
            const totalAmount = checked.reduce((sum, item) => sum + paise(item.amount), 0) / 100;

            const created = await RajkotExpense.create({
                branchId,
                entryDate: date.value,
                description: parsedDescription.value,
                status: STATUS.PENDING,
                totalQuantity,
                totalAmount,
                createdBy: req.employee.id,
            }, { transaction });

            for (const { serialNumbers, ...item } of checked) {
                const row = await RajkotExpenseItem.create({ ...item, rajkotExpenseId: created.id }, { transaction });
                if (serialNumbers.length > 0) {
                    await RajkotExpenseSerial.bulkCreate(
                        serialNumbers.map((serialNumber) => ({ rajkotExpenseItemId: row.id, serialNumber })),
                        { transaction },
                    );
                }
            }
            return created;
        });

        return sendSuccess(res, "Rajkot expense added successfully", { id: entry.id }, 201);
    } catch (error) {
        return sendRajkotError(res, error);
    }
};

// Puts an accepted entry's products into its branch's stock, the same way the Products module
// adds stock: plain products gain their quantity, serialized products gain one product_serial
// row per serial number (and the matching quantity). A missing stock row is created. Any
// problem throws, so the whole accept rolls back and nothing is applied partly.
const addEntryToStock = async (entry, transaction) => {
    const items = await RajkotExpenseItem.findAll({
        where: { rajkotExpenseId: entry.id },
        include: [{ model: RajkotExpenseSerial, as: "serials", attributes: ["serialNumber"], required: false }],
        order: [["id", "ASC"]],
        transaction,
    });

    for (const item of items) {
        if (!item.productId) throw new RajkotExpenseError(`${item.productName} has been removed from the products list, so it can't be added to stock. Ask an admin to delete this entry.`, 409);
        const product = await Product.findByPk(item.productId, { transaction });
        if (!product) throw new RajkotExpenseError(`${item.productName} no longer exists`, 409);

        const serials = (item.serials ?? []).map((s) => s.serialNumber);
        if (product.hasSerialNumber !== serials.length > 0) {
            throw new RajkotExpenseError(`${product.name} has changed since this entry was added. Ask an admin to delete this entry.`, 409);
        }
        if (serials.length > 0) {
            // Checked again: a serial number may have been added through Products since the entry was saved
            const existing = await findExistingSerials(serials, transaction);
            if (existing.length > 0) throw new RajkotExpenseError(`Serial number already exists: ${listForMessage(existing)}`, 409);
            await ProductSerial.bulkCreate(serials.map((serialNumber) => ({ productId: product.id, branchId: entry.branchId, serialNumber })), { transaction });
        }

        const stock = await ProductStock.findOne({ where: { productId: product.id, branchId: entry.branchId }, transaction, lock: transaction.LOCK.UPDATE });
        const quantity = (stock?.quantity ?? 0) + item.quantity;
        if (quantity > MAX_QUANTITY) throw new RajkotExpenseError(`Stock of ${product.name} would exceed ${MAX_QUANTITY.toLocaleString("en-IN")}`);
        if (stock) await stock.update({ quantity }, { transaction });
        else await ProductStock.create({ productId: product.id, branchId: entry.branchId, quantity }, { transaction });
    }
};

// Accepts a pending entry: adds its products to the branch's stock, 1 to the branch's count
// and its amount to the branch's balance, in one transaction with the entry and the counter
// row locked. A second accept (a
// double click or another tab) finds the entry already Accepted and changes nothing.
exports.accept = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid id", null, 400);

        const existing = await findScoped(id, scope, { attributes: ["id", "branchId"] });
        if (!existing) return sendError(res, NOT_FOUND, null, 404);
        await ensureCounters([existing.branchId]);

        const result = await sequelize.transaction(async (transaction) => {
            const entry = await findScoped(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (!entry) throw new RajkotExpenseError(NOT_FOUND, 404);
            if (entry.status !== STATUS.PENDING) throw new RajkotExpenseError("This entry has already been accepted", 409);
            if (req.employee.branchId !== entry.branchId) {
                const branch = await Branch.findByPk(entry.branchId, { attributes: ["name"], transaction });
                throw new RajkotExpenseError(`Only an employee of ${branch?.name ?? "this branch"} can accept this entry`, 403);
            }

            const counter = await RajkotExpenseCounter.findByPk(entry.branchId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!counter) throw new RajkotExpenseError("Could not load this branch's expense count. Please try again.", 500);

            await addEntryToStock(entry, transaction);

            const count = counter.count + 1;
            const balance = (paise(counter.balance) + paise(entry.totalAmount)) / 100;
            await counter.update({ count, balance }, { transaction });
            await entry.update({ status: STATUS.ACCEPTED, acceptedBy: req.employee.id, acceptedAt: new Date() }, { transaction });

            return { id, branchId: entry.branchId, count, balance };
        });

        return sendSuccess(res, "Rajkot expense accepted successfully", result, 200);
    } catch (error) {
        return sendRajkotError(res, error);
    }
};

// Admins only. Pending entries can be removed (freeing their serial numbers); accepted entries
// are history and stay.
exports.remove = async (req, res) => {
    try {
        const scope = req.branchScope;
        if (adminOnly(scope, res, "delete Rajkot expenses")) return;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid id", null, 400);

        await sequelize.transaction(async (transaction) => {
            const entry = await findScoped(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (!entry) throw new RajkotExpenseError(NOT_FOUND, 404);
            if (entry.status !== STATUS.PENDING) throw new RajkotExpenseError("An accepted entry can't be deleted", 409);

            const itemIds = (await RajkotExpenseItem.findAll({ where: { rajkotExpenseId: id }, attributes: ["id"], transaction })).map((i) => i.id);
            if (itemIds.length > 0) await RajkotExpenseSerial.destroy({ where: { rajkotExpenseItemId: itemIds }, transaction });
            await RajkotExpenseItem.destroy({ where: { rajkotExpenseId: id }, transaction });
            await entry.destroy({ transaction });
        });

        return sendSuccess(res, "Rajkot expense deleted successfully", null, 200);
    } catch (error) {
        return sendRajkotError(res, error);
    }
};

// Admins only. Body: { branchId? } (no branch = every branch). Sets the count to 0; entries,
// products, serial numbers, stock and the balance are left untouched. Who reset it and when is
// kept on the counter row.
exports.resetCount = async (req, res) => {
    try {
        if (adminOnly(req.branchScope, res, "reset the expense count")) return;
        const branches = await targetBranches(req.body?.branchId);
        const branchIds = branches.map((b) => b.id);
        if (branchIds.length > 0) await ensureCounters(branchIds);

        const previousCount = await sequelize.transaction(async (transaction) => {
            const counters = await RajkotExpenseCounter.findAll({ where: { branchId: branchIds }, transaction, lock: transaction.LOCK.UPDATE });
            const previous = counters.reduce((sum, c) => sum + c.count, 0);
            if (counters.length > 0) {
                await RajkotExpenseCounter.update(
                    { count: 0, countResetAt: new Date(), countResetBy: req.employee.id },
                    { where: { branchId: branchIds }, transaction },
                );
            }
            return previous;
        });

        return sendSuccess(res, "Expense count reset to 0", { branchIds, previousCount, count: 0 }, 200);
    } catch (error) {
        return sendRajkotError(res, error);
    }
};

// Admins only. Body: { branchId, balance }: sets that branch's balance to the amount entered.
// Without balance: { branchId? } (no branch = every branch) recalculates each branch's balance
// as the total of its accepted entries. Either way it sets a value rather than adding to it,
// so a repeated request never changes anything twice.
exports.updateBalance = async (req, res) => {
    try {
        if (adminOnly(req.branchScope, res, "update the balance")) return;

        if (isSent(req.body?.balance)) {
            if (!isSent(req.body.branchId)) return sendError(res, "Select the branch whose balance to set", null, 400);
            const raw = req.body.balance;
            const n = typeof raw === "string" ? Number(raw) : raw;
            if (typeof n !== "number" || !Number.isFinite(n)) return sendError(res, "Balance must be a number", null, 400);
            if (n < 0) return sendError(res, "Balance cannot be negative", null, 400);
            if (n > MAX_BALANCE) return sendError(res, `Balance must be at most ${MAX_BALANCE.toLocaleString("en-IN")}`, null, 400);
            if (!/^\d+(\.\d{1,2})?$/.test(String(n))) return sendError(res, "Balance can have at most 2 decimal places", null, 400);

            const [branch] = await targetBranches(req.body.branchId);
            await ensureCounters([branch.id]);
            const previousBalance = await sequelize.transaction(async (transaction) => {
                const counter = await RajkotExpenseCounter.findByPk(branch.id, { transaction, lock: transaction.LOCK.UPDATE });
                const previous = Number(counter.balance);
                await counter.update({ balance: n, balanceUpdatedAt: new Date(), balanceUpdatedBy: req.employee.id }, { transaction });
                return previous;
            });
            const data = { branch: [{ branchId: branch.id, previousBalance, balance: n }], balance: n };
            return sendSuccess(res, `Balance of ${branch.name} updated successfully`, data, 200);
        }

        const branches = await targetBranches(req.body?.branchId);
        const branchIds = branches.map((b) => b.id);
        if (branchIds.length > 0) await ensureCounters(branchIds);

        const branch = await sequelize.transaction(async (transaction) => {
            // Locked first: an accept that is waiting for this row adds its amount after this
            // recalculation commits, so it is neither lost nor counted twice
            const counters = await RajkotExpenseCounter.findAll({ where: { branchId: branchIds }, transaction, lock: transaction.LOCK.UPDATE });
            const totals = await RajkotExpense.findAll({
                where: { branchId: branchIds, status: STATUS.ACCEPTED },
                attributes: ["branchId", [sequelize.fn("SUM", sequelize.col("totalAmount")), "total"]],
                group: ["branchId"],
                raw: true,
                transaction,
            });
            const totalBy = new Map(totals.map((t) => [t.branchId, Number(t.total) || 0]));
            const now = new Date();

            const updated = [];
            for (const counter of counters) {
                const balance = totalBy.get(counter.branchId) ?? 0;
                updated.push({ branchId: counter.branchId, previousBalance: Number(counter.balance), balance });
                await counter.update({ balance, balanceUpdatedAt: now, balanceUpdatedBy: req.employee.id }, { transaction });
            }
            return updated;
        });

        const balance = branch.reduce((sum, b) => sum + paise(b.balance), 0) / 100;
        return sendSuccess(res, "Balance updated successfully", { branch, balance }, 200);
    } catch (error) {
        return sendRajkotError(res, error);
    }
};
