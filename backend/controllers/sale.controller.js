const { Op } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { Sale, Product, ProductStock, ProductSerial, Branch } = require("@/models/index");

// Every handler runs after loadBranchScope, so req.branchScope = { isAdmin, branchId } comes
// from the logged-in employee's record. A branchId in the request is never trusted on its own.
//
// Stock: a sale takes its quantity out of the sale branch's product_stock row. Editing a sale
// puts the old quantity back and takes the new one out; deleting it puts the quantity back.
// All of that happens in one transaction with the stock rows locked, so stock never goes
// negative and another branch's stock is never touched.
//
// Serial numbers: for a serial-tracked product the sale names the exact units sold. Those
// product_serial rows are removed from the branch's stock and their numbers saved on the sale;
// editing or deleting the sale puts them back. The quantity always equals the number of serials.

const MAX_QUANTITY = 1000000000;
const MAX_AMOUNT = 1000000000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;
// E.164, as sent by the frontend PhoneInput ("+919876543210")
const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const NOT_FOUND = "Sale not found";

// Thrown inside a transaction so it rolls back, then turned into an API error
class SaleError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const parseId = (value) => {
    const id = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return Number.isInteger(id) && id > 0 ? id : null;
};

// "yyyy-MM-dd" -> local midnight, or null when malformed or impossible (e.g. 2026-02-31)
const parseDate = (value) => {
    if (typeof value !== "string" || !DATE_REGEX.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
};

const parseText = (value, label, max) => {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) return { error: `${label} is required` };
    if (trimmed.length > max) return { error: `${label} must be at most ${max} characters` };
    return { value: trimmed };
};

const parseQuantity = (quantity) => {
    const n = typeof quantity === "string" && quantity.trim() !== "" ? Number(quantity) : quantity;
    if (n === undefined || n === null || n === "") return { error: "Quantity is required" };
    if (typeof n !== "number" || !Number.isInteger(n)) return { error: "Quantity must be a whole number" };
    if (n < 1) return { error: "Quantity must be at least 1" };
    if (n > MAX_QUANTITY) return { error: `Quantity must be at most ${MAX_QUANTITY.toLocaleString("en-IN")}` };
    return { value: n };
};

const parseAmount = (amount) => {
    const n = typeof amount === "string" && amount.trim() !== "" ? Number(amount) : amount;
    if (n === undefined || n === null || n === "") return { error: "Selling amount is required" };
    if (typeof n !== "number" || !Number.isFinite(n)) return { error: "Selling amount must be a number" };
    if (n <= 0) return { error: "Selling amount must be greater than 0" };
    if (n > MAX_AMOUNT) return { error: `Selling amount must be at most ${MAX_AMOUNT.toLocaleString("en-IN")}` };
    if (!AMOUNT_REGEX.test(String(n))) return { error: "Selling amount can have at most 2 decimal places" };
    return { value: n };
};

const parseSaleDate = (value) => {
    if (!value) return { error: "Sale date is required" };
    const date = parseDate(value);
    if (!date) return { error: "Invalid sale date" };
    // One day of slack so a client ahead of the server's timezone can still record "today"
    const latest = new Date();
    latest.setHours(0, 0, 0, 0);
    latest.setDate(latest.getDate() + 1);
    if (date > latest) return { error: "Sale date cannot be in the future" };
    return { value };
};

// Branch members always act on their own branch: a branchId they send is accepted only when
// it is that branch. Admins must say which branch. Returns { error, status } or { branchId }.
const resolveBranchId = (scope, requested) => {
    const sent = requested !== undefined && requested !== null && requested !== "";
    const parsed = parseId(requested);

    if (!scope.isAdmin) {
        if (sent && parsed !== scope.branchId) {
            return { error: "You can only manage sales for your own branch", status: 403 };
        }
        return { branchId: scope.branchId };
    }

    if (!parsed) return { error: sent ? "Invalid branch" : "Branch is required", status: 400 };
    return { branchId: parsed };
};

// New sales can't be recorded against a missing or inactive branch
const validateBranchForSale = async (branchId, scope) => {
    const branch = await Branch.findByPk(branchId);
    if (!branch) return "Selected branch does not exist";
    if (!branch.isActive) return scope.isAdmin ? "Selected branch is inactive" : "Your branch is inactive";
    return null;
};

// Optional list of serial numbers; trimmed, blanks dropped, no repeats (case-insensitive)
const parseSerialNumbers = (list) => {
    if (list === undefined || list === null) return { value: [] };
    if (!Array.isArray(list) || list.some((x) => typeof x !== "string")) return { error: "Invalid serial numbers" };
    const serials = list.map((x) => x.trim()).filter(Boolean);
    const lower = serials.map((x) => x.toLowerCase());
    const repeated = serials.find((_, i) => lower.indexOf(lower[i]) !== i);
    if (repeated) return { error: `Serial number ${repeated} is selected more than once` };
    return { value: serials };
};

// Shared body validation for create and update. Returns { error, status } or { values }.
const parseSaleBody = (scope, body) => {
    const { customerName, customerPhone, productId, quantity, sellingAmount, saleDate, branchId, serialNumbers } = body || {};

    const name = parseText(customerName, "Customer name", 255);
    if (name.error) return { error: name.error };

    const phone = typeof customerPhone === "string" ? customerPhone.trim() : "";
    if (!phone) return { error: "Customer phone number is required" };
    if (!PHONE_REGEX.test(phone)) return { error: "Enter a valid phone number" };

    const parsedProductId = parseId(productId);
    if (!parsedProductId) return { error: productId ? "Invalid product" : "Product is required" };

    const parsedQuantity = parseQuantity(quantity);
    if (parsedQuantity.error) return { error: parsedQuantity.error };

    const serials = parseSerialNumbers(serialNumbers);
    if (serials.error) return { error: serials.error };

    const amount = parseAmount(sellingAmount);
    if (amount.error) return { error: amount.error };

    const date = parseSaleDate(saleDate);
    if (date.error) return { error: date.error };

    const resolved = resolveBranchId(scope, branchId);
    if (resolved.error) return resolved;

    return {
        values: {
            customerName: name.value,
            customerPhone: phone,
            productId: parsedProductId,
            quantity: parsedQuantity.value,
            serialNumbers: serials.value,
            sellingAmount: amount.value,
            saleDate: date.value,
            branchId: resolved.branchId,
        },
    };
};

const lockStock = (productId, branchId, transaction) =>
    ProductStock.findOne({ where: { productId, branchId }, transaction, lock: transaction.LOCK.UPDATE });

// Takes quantity out of one branch's stock. `credit` is stock this same sale already holds in
// that row (when editing), which counts as available.
const takeStock = async ({ productId, branchId, quantity, credit = 0, transaction }) => {
    const stock = await lockStock(productId, branchId, transaction);
    if (!stock) throw new SaleError("This product is not available in the selected branch");

    const available = stock.quantity + credit;
    if (available < quantity) {
        throw new SaleError(`Not enough stock. Only ${available.toLocaleString("en-IN")} available in this branch`);
    }
    await stock.update({ quantity: available - quantity }, { transaction });
};

// Puts quantity back into a branch's stock. If the product was removed from that branch since
// the sale, there is nothing to return it to, so it's skipped.
const returnStock = async ({ productId, branchId, quantity, transaction }) => {
    if (!productId) return;
    const stock = await lockStock(productId, branchId, transaction);
    if (stock) await stock.update({ quantity: Math.min(stock.quantity + quantity, MAX_QUANTITY) }, { transaction });
};

// Checks the sale's serial numbers against the product: tracked products need exactly one
// serial number per unit, others none.
const checkSerialsForProduct = (product, { serialNumbers, quantity }) => {
    if (!product.hasSerialNumber) {
        if (serialNumbers.length > 0) throw new SaleError(`${product.name} doesn't use serial numbers`);
        return;
    }
    if (serialNumbers.length === 0) throw new SaleError("Select the serial number of each unit sold");
    if (serialNumbers.length !== quantity) throw new SaleError("Quantity must match the number of serial numbers selected");
};

// Removes the sold units from the branch's stock and returns their stored serial numbers.
// Each one must be in stock for this product in this branch.
const takeSerials = async ({ productId, branchId, serialNumbers, transaction }) => {
    if (serialNumbers.length === 0) return [];
    const rows = await ProductSerial.findAll({
        where: { productId, branchId, serialNumber: serialNumbers },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    if (rows.length !== serialNumbers.length) {
        const found = new Set(rows.map((r) => r.serialNumber.toLowerCase()));
        const missing = serialNumbers.filter((x) => !found.has(x.toLowerCase()));
        throw new SaleError(`Not in stock in this branch: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}`);
    }
    await ProductSerial.destroy({ where: { id: rows.map((r) => r.id) }, transaction });
    return rows.map((r) => r.serialNumber);
};

// Puts a sale's units back into stock. Skipped, like returnStock, when the product is no longer
// stocked in that branch; a serial number already back in stock elsewhere is left alone.
const returnSerials = async ({ productId, branchId, serialNumbers, transaction }) => {
    if (!productId || serialNumbers.length === 0) return;
    const stock = await ProductStock.findOne({ where: { productId, branchId }, transaction });
    if (!stock) return;
    await ProductSerial.bulkCreate(
        serialNumbers.map((serialNumber) => ({ productId, branchId, serialNumber })),
        { transaction, ignoreDuplicates: true },
    );
};

// A branch member only ever finds sales of their own branch; anything else looks missing
const findScopedSale = (id, scope, options = {}) =>
    Sale.findOne({ where: scope.isAdmin ? { id } : { id, branchId: scope.branchId }, ...options });

const toSaleResponse = (sale) => ({
    id: sale.id,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    productId: sale.productId,
    // Follows a product rename; falls back to the name at sale time once the product is gone
    productName: sale.Product?.name ?? sale.productName,
    serialNumbers: sale.serialNumbers,
    quantity: sale.quantity,
    sellingAmount: Number(sale.sellingAmount),
    saleDate: sale.saleDate,
    branchId: sale.branchId,
    branchName: sale.Branch?.name ?? null,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
});

const sendSaleError = (res, error) => {
    if (error instanceof SaleError) return sendError(res, error.message, null, error.status);
    return sendError(res, error.message, null, 500);
};

// Products the user can sell from a branch, with that branch's current stock.
// Branch members always get their own branch; admins pass ?branchId.
exports.saleProducts = async (req, res) => {
    try {
        const resolved = resolveBranchId(req.branchScope, req.query.branchId);
        if (resolved.error) return sendError(res, resolved.error, null, resolved.status);

        const stocks = await ProductStock.findAll({
            where: { branchId: resolved.branchId },
            attributes: ["productId", "quantity"],
            include: [{ model: Product, attributes: ["id", "name", "hasSerialNumber"], required: true }],
            order: [[Product, "name", "ASC"]],
        });

        // In-stock serial numbers of this branch, for picking the exact units sold
        const serials = await ProductSerial.findAll({
            where: { branchId: resolved.branchId },
            attributes: ["productId", "serialNumber"],
            order: [["serialNumber", "ASC"]],
            raw: true,
        });
        const serialsByProduct = new Map();
        for (const row of serials) {
            if (!serialsByProduct.has(row.productId)) serialsByProduct.set(row.productId, []);
            serialsByProduct.get(row.productId).push(row.serialNumber);
        }

        const data = {
            branchId: resolved.branchId,
            product: stocks.map((s) => ({
                id: s.productId,
                name: s.Product.name,
                hasSerialNumber: s.Product.hasSerialNumber,
                serialNumbers: serialsByProduct.get(s.productId) ?? [],
                quantity: s.quantity,
            })),
        };
        return sendSuccess(res, "Sale products...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Filters shared by the sales list and its totals: branch scope, search text and an inclusive
// sale date range. Search also matches the current product name and the sold serial numbers,
// so callers must include Product.
// Returns { error } or { where }.
const buildSaleWhere = (scope, query) => {
    // Branch members only ever get their own branch's sales
    const where = {};
    if (!scope.isAdmin) where.branchId = scope.branchId;

    const search = query.search?.trim();
    if (search) {
        const like = { [Op.like]: `%${search}%` };
        // Phone numbers are stored without spaces or dashes, so match the typed digits that way
        const phoneSearch = search.replace(/[\s()-]/g, "");
        where[Op.or] = [
            { customerName: like },
            { productName: like },
            { "$Product.name$": like },
            { serialNumbers: like },
            ...(phoneSearch ? [{ customerPhone: { [Op.like]: `%${phoneSearch}%` } }] : []),
        ];
    }

    // Inclusive range on the sale date
    const startDate = query.startDate ? parseDate(query.startDate) : null;
    const endDate = query.endDate ? parseDate(query.endDate) : null;
    if (query.startDate && !startDate) return { error: "Invalid start date" };
    if (query.endDate && !endDate) return { error: "Invalid end date" };
    if (startDate && endDate && startDate > endDate) return { error: "Start date must be on or before end date" };
    if (startDate || endDate) {
        where.saleDate = {};
        if (startDate) where.saleDate[Op.gte] = query.startDate;
        if (endDate) where.saleDate[Op.lte] = query.endDate;
    }

    return { where };
};

exports.sale = async (req, res) => {
    try {
        const scope = req.branchScope;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 10, 1);
        const offset = (page - 1) * pageSize;

        const filter = buildSaleWhere(scope, req.query);
        if (filter.error) return sendError(res, filter.error, null, 400);
        const { where } = filter;

        const { count, rows } = await Sale.findAndCountAll({
            where,
            include: [
                { model: Product, attributes: ["id", "name"], required: false },
                { model: Branch, attributes: ["id", "name"], required: false },
            ],
            order: [["saleDate", "DESC"], ["id", "DESC"]],
            limit: pageSize,
            offset,
            distinct: true,
        });

        const data = {
            sale: rows.map(toSaleResponse),
            pagination: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize),
            },
        };

        return sendSuccess(res, "All Sales...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Total selling amount per branch for the same search and date filters as the list (no dates
// means all time). Branch members only get their own branch; admins get every branch,
// including ones with nothing matching.
exports.salesSummary = async (req, res) => {
    try {
        const scope = req.branchScope;
        const filter = buildSaleWhere(scope, req.query);
        if (filter.error) return sendError(res, filter.error, null, 400);

        const [rows, branches] = await Promise.all([
            Sale.findAll({
                where: filter.where,
                include: [{ model: Product, attributes: [], required: false }],
                attributes: ["branchId", [sequelize.fn("SUM", sequelize.col("Sale.sellingAmount")), "total"]],
                group: ["Sale.branchId"],
                raw: true,
            }),
            Branch.findAll({
                where: scope.isAdmin ? {} : { id: scope.branchId },
                attributes: ["id", "name"],
                order: [["name", "ASC"]],
                raw: true,
            }),
        ]);

        const totals = new Map(rows.map((r) => [r.branchId, Number(r.total) || 0]));
        const branch = branches.map((br) => ({ branchId: br.id, branchName: br.name, total: totals.get(br.id) ?? 0 }));

        const data = { branch, total: branch.reduce((sum, br) => sum + br.total, 0) };
        return sendSuccess(res, "Sales summary...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

exports.createSale = async (req, res) => {
    try {
        const scope = req.branchScope;
        const parsed = parseSaleBody(scope, req.body);
        if (parsed.error) return sendError(res, parsed.error, null, parsed.status ?? 400);
        const { values } = parsed;

        const branchError = await validateBranchForSale(values.branchId, scope);
        if (branchError) return sendError(res, branchError, null, 400);

        const sale = await sequelize.transaction(async (transaction) => {
            const product = await Product.findByPk(values.productId, { transaction });
            if (!product) throw new SaleError("Selected product does not exist");
            checkSerialsForProduct(product, values);

            await takeStock({ ...values, transaction });
            const serialNumbers = await takeSerials({ ...values, transaction });

            return Sale.create(
                { ...values, serialNumbers, productName: product.name, createdBy: req.employee.id },
                { transaction },
            );
        });

        return sendSuccess(res, "Sale added successfully", { id: sale.id }, 201);
    } catch (error) {
        return sendSaleError(res, error);
    }
};

// Branch members can edit only their own branch's sales and can't move a sale to another
// branch (resolveBranchId pins it). Admins can edit any sale, including its branch.
exports.updateSale = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid sale id", null, 400);

        const parsed = parseSaleBody(scope, req.body);
        if (parsed.error) return sendError(res, parsed.error, null, parsed.status ?? 400);
        const { values } = parsed;

        const existing = await findScopedSale(id, scope);
        if (!existing) return sendError(res, NOT_FOUND, null, 404);

        if (existing.branchId !== values.branchId) {
            const branchError = await validateBranchForSale(values.branchId, scope);
            if (branchError) return sendError(res, branchError, null, 400);
        }

        await sequelize.transaction(async (transaction) => {
            // Re-read under lock so two edits of the same sale can't both return its stock
            const sale = await findScopedSale(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (!sale) throw new SaleError(NOT_FOUND, 404);

            const product = await Product.findByPk(values.productId, { transaction });
            if (!product) throw new SaleError("Selected product does not exist");
            checkSerialsForProduct(product, values);

            // Units go back first, so the sale can keep some or all of its serial numbers
            await returnSerials({ productId: sale.productId, branchId: sale.branchId, serialNumbers: sale.serialNumbers, transaction });

            const sameStock = sale.productId === values.productId && sale.branchId === values.branchId;
            if (sameStock) {
                // Same branch and product: only the difference in quantity moves
                const delta = values.quantity - sale.quantity;
                if (delta > 0) {
                    await takeStock({ ...values, quantity: values.quantity, credit: sale.quantity, transaction });
                } else if (delta < 0) {
                    await returnStock({ productId: sale.productId, branchId: sale.branchId, quantity: -delta, transaction });
                }
            } else {
                await returnStock({ productId: sale.productId, branchId: sale.branchId, quantity: sale.quantity, transaction });
                await takeStock({ ...values, transaction });
            }

            const serialNumbers = await takeSerials({ ...values, transaction });
            await sale.update({ ...values, serialNumbers, productName: product.name }, { transaction });
        });

        return sendSuccess(res, "Sale updated successfully", { id }, 200);
    } catch (error) {
        return sendSaleError(res, error);
    }
};

// Hard delete; the sold quantity (and serial numbers) go back into the sale branch's stock
exports.deleteSale = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid sale id", null, 400);

        await sequelize.transaction(async (transaction) => {
            const sale = await findScopedSale(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (!sale) throw new SaleError(NOT_FOUND, 404);

            await returnStock({ productId: sale.productId, branchId: sale.branchId, quantity: sale.quantity, transaction });
            await returnSerials({ productId: sale.productId, branchId: sale.branchId, serialNumbers: sale.serialNumbers, transaction });
            await sale.destroy({ transaction });
        });

        return sendSuccess(res, "Sale deleted successfully", null, 200);
    } catch (error) {
        return sendSaleError(res, error);
    }
};
