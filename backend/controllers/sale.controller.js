const { Op, UniqueConstraintError } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { Sale, Product, ProductStock, ProductSerial, Branch, Customer, SaleReturn, SerialUnit, SerialEvent } = require("@/models/index");
const { parseCustomerFields, comparableName, duplicateMessage, toCustomerResponse } = require("@/helper/customer");
const {
    EVENT, UNIT_STATUS, RETURN_STATUS, HELD_STATUSES, LIFECYCLE_EVENTS, SALE_TYPE, saleReference, saleSnapshot,
    recordSale, releaseFromSale, recordSaleEdit, nextServiceIds, createServiceUnits, cancelRenewal,
} = require("@/helper/serialHistory");
const { PRODUCT_TYPE, MAX_SERVICE_UNITS, typeOf, tracksStock } = require("@/helper/productType");

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
// Each unit's serial number history records the sale, edit or cancellation in the same
// transaction (helper/serialHistory.js).
//
// Returns: once a unit of a sale has been returned (controllers/saleReturn.controller.js) the
// sale is part of that unit's history, so it can no longer be edited or deleted.
//
// Product types (helper/productType.js):
//  - Software: the sale names license keys from the branch's license pool (serial_unit). No
//    physical stock is checked or moved, so a license sells even when the quantity is 0. Once a
//    license has been installed, activated, renewed or cancelled, its sale is locked like a returned one.
//  - Service: no stock. Each unit sold gets a generated installation ID (INS-00012-1), saved on the
//    sale like serial numbers, so every installation has its own history.
//  - Renewal sales (saleType "Renewal") are recorded from a license's history. They can be deleted,
//    which cancels the renewal and restores the previous expiry date, but not edited.
//
// Customers: every saved sale is linked to a customer record (see resolveSaleCustomer). The
// customer is found or created inside the sale's transaction, so a sale that fails never
// leaves a new customer behind.

const MAX_QUANTITY = 1000000000;
const MAX_AMOUNT = 1000000000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;
const NOT_FOUND = "Sale not found";

// Thrown inside a transaction so it rolls back, then turned into an API error
class SaleError extends Error {
    constructor(message, status = 400, code = null, data = null) {
        super(message);
        this.status = status;
        this.code = code;
        this.data = data;
    }
}

// Another request saved the same new customer while this sale was in progress
class CustomerRaceError extends Error {}

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
    const { customerId, customerName, customerPhone, customerDetails, productId, productName, quantity, sellingAmount, saleDate, branchId, serialNumbers } = body || {};

    // A picked existing customer, or nothing for details typed into the form
    const hasCustomerId = customerId !== undefined && customerId !== null && customerId !== "";
    const parsedCustomerId = hasCustomerId ? parseId(customerId) : null;
    if (hasCustomerId && !parsedCustomerId) return { error: "Invalid customer" };

    // Optional { email, address, pincode, city, companyName } for a new customer
    if (customerDetails !== undefined && customerDetails !== null && (typeof customerDetails !== "object" || Array.isArray(customerDetails))) {
        return { error: "Invalid customer details" };
    }
    const customer = parseCustomerFields(
        { ...(customerDetails || {}), name: customerName, phone: customerPhone },
        { requirePhone: true, phoneLabel: "Customer phone number" },
    );
    if (customer.error) return { error: customer.error };

    // No productId means "Other": a product outside the catalogue, named by the user, with no stock
    const isOther = productId === undefined || productId === null || productId === "";
    const parsedProductId = isOther ? null : parseId(productId);
    if (!isOther && !parsedProductId) return { error: "Invalid product" };
    let otherName = null;
    if (isOther) {
        const parsedName = parseText(productName, "Product name", 255);
        if (parsedName.error) return { error: parsedName.error };
        otherName = parsedName.value;
    }

    const parsedQuantity = parseQuantity(quantity);
    if (parsedQuantity.error) return { error: parsedQuantity.error };

    const serials = parseSerialNumbers(serialNumbers);
    if (serials.error) return { error: serials.error };
    if (isOther && serials.value.length > 0) return { error: "Other products don't use serial numbers" };

    const amount = parseAmount(sellingAmount);
    if (amount.error) return { error: amount.error };

    const date = parseSaleDate(saleDate);
    if (date.error) return { error: date.error };

    const resolved = resolveBranchId(scope, branchId);
    if (resolved.error) return resolved;

    return {
        customer: { id: parsedCustomerId, ...customer.values },
        values: {
            customerName: customer.values.name,
            customerPhone: customer.values.phone,
            productId: parsedProductId,
            productName: otherName,
            quantity: parsedQuantity.value,
            serialNumbers: serials.value,
            sellingAmount: amount.value,
            saleDate: date.value,
            branchId: resolved.branchId,
        },
    };
};

// The customer a sale belongs to, found or created inside the sale's transaction:
//  - A picked customer (customer.id) is used as is; their saved details are never overwritten
//    from the sale form. The only exception is filling in a phone number they don't have yet.
//  - Otherwise the phone number decides: an existing customer with that number and the same
//    name is reused, so repeat customers are never saved twice. The same number under a
//    different name is refused, so the user picks the right customer instead of a silent merge.
//  - No match: a new customer is created with the details typed in the form.
const resolveSaleCustomer = async (customer, { employeeId, transaction }) => {
    const { id, ...details } = customer;

    if (id) {
        const picked = await Customer.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!picked) throw new SaleError("The selected customer no longer exists. Search again or enter the customer's details.");
        if (picked.phone && picked.phone !== details.phone) {
            throw new SaleError("The phone number doesn't match the selected customer. Change the customer to use a different number.");
        }
        if (!picked.phone) {
            const owner = await Customer.findOne({ where: { phone: details.phone }, transaction });
            if (owner) {
                throw new SaleError(duplicateMessage(owner, details), 409, "CUSTOMER_EXISTS", { customer: toCustomerResponse(owner) });
            }
            await picked.update({ phone: details.phone }, { transaction });
        }
        return picked;
    }

    const existing = await Customer.findOne({ where: { phone: details.phone }, transaction });
    if (existing) {
        if (comparableName(existing.name) === comparableName(details.name)) return existing;
        throw new SaleError(
            `${duplicateMessage(existing, details)}. Select that customer from the suggestions, or use a different phone number.`,
            409,
            "CUSTOMER_EXISTS",
            { customer: toCustomerResponse(existing) },
        );
    }

    try {
        return await Customer.create({ ...details, createdBy: employeeId }, { transaction });
    } catch (error) {
        if (error instanceof UniqueConstraintError) throw new CustomerRaceError();
        throw error;
    }
};

// Sale fields copied from the linked customer
const customerFields = (customer) => ({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
});

// Runs a sale transaction. If a concurrent request created the same new customer first, runs
// it once more so this sale picks up that customer instead of failing or duplicating it.
// The first attempt was fully rolled back, so nothing is applied twice.
const saleTransaction = async (work) => {
    try {
        return await sequelize.transaction(work);
    } catch (error) {
        if (!(error instanceof CustomerRaceError)) throw error;
        return sequelize.transaction(work);
    }
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
// Services take a quantity only (their installation IDs are generated), at most MAX_SERVICE_UNITS.
const checkSerialsForProduct = (product, { serialNumbers, quantity }) => {
    const type = typeOf(product);
    if (type === PRODUCT_TYPE.SERVICE && quantity > MAX_SERVICE_UNITS) {
        throw new SaleError(`At most ${MAX_SERVICE_UNITS} installations in one sale`);
    }
    if (!product.hasSerialNumber) {
        if (serialNumbers.length > 0) {
            throw new SaleError(type === PRODUCT_TYPE.SERVICE
                ? `${product.name} is a service. Its installation IDs are created with the sale.`
                : `${product.name} doesn't use serial numbers`);
        }
        return;
    }
    const word = type === PRODUCT_TYPE.SOFTWARE ? "license key" : "serial number";
    if (serialNumbers.length === 0) throw new SaleError(`Select the ${word} of each unit sold`);
    if (serialNumbers.length !== quantity) throw new SaleError(`Quantity must match the number of ${word}s selected`);
};

// Licenses picked for a Software sale. Each must be in this branch's license pool, or already
// on this same sale (when editing). Locked, so two sales can never take the same license.
// Returns the stored keys. No stock is touched.
const takeLicenses = async ({ productId, branchId, serialNumbers, saleId = null, transaction }) => {
    if (serialNumbers.length === 0) return [];
    const units = await SerialUnit.findAll({
        where: { serialNumber: serialNumbers, productId, productType: PRODUCT_TYPE.SOFTWARE },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
    const usable = units.filter((u) => (u.status === UNIT_STATUS.AVAILABLE && u.branchId === branchId)
        || (saleId && u.currentSaleId === saleId && HELD_STATUSES.includes(u.status)));
    const byKey = new Map(usable.map((u) => [u.serialNumber.toLowerCase(), u.serialNumber]));
    const missing = serialNumbers.filter((sn) => !byKey.has(sn.toLowerCase()));
    if (missing.length > 0) {
        throw new SaleError(`Not available in this branch's license pool: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}`);
    }
    return serialNumbers.map((sn) => byKey.get(sn.toLowerCase()));
};

// Installation IDs of a Service sale with `quantity` units: the ones it already has (same
// product) are kept in order, extra units get new IDs, surplus ones drop off (and are cancelled).
const serviceIdsFor = async ({ saleId, before, productId, quantity, transaction }) => {
    const kept = before && before.productId === productId ? before.serialNumbers.slice(0, quantity) : [];
    const extra = quantity - kept.length;
    return extra > 0 ? [...kept, ...(await nextServiceIds(saleId, extra, transaction))] : kept;
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

// A sale with a recorded return, or whose license / installation has moved on (installed,
// activated, renewed, cancelled), is history for that unit and stays as it is
const assertNoReturns = async (saleId, action, transaction) => {
    const count = await SaleReturn.count({ where: { saleId }, transaction });
    if (count > 0) {
        throw new SaleError(`This sale has a recorded return, so it can't be ${action}. Its history is kept with the serial number.`, 409);
    }
    const lifecycle = await SerialEvent.count({ where: { saleId, type: LIFECYCLE_EVENTS }, transaction });
    if (lifecycle > 0) {
        throw new SaleError(`This sale's license or installation has already been installed, activated, renewed or cancelled, so the sale can't be ${action}. Record a return or deactivate it from the serial number's history instead.`, 409);
    }
};

// A branch member only ever finds sales of their own branch; anything else looks missing
const findScopedSale = (id, scope, options = {}) =>
    Sale.findOne({ where: scope.isAdmin ? { id } : { id, branchId: scope.branchId }, ...options });

// returnInfo: { returns, returnable } for the sale, from loadReturnInfo
const toSaleResponse = (sale, returnInfo) => ({
    id: sale.id,
    reference: saleReference(sale.id),
    // "Sale" or "Renewal"
    saleType: sale.saleType,
    // Standard / Serialized / Software / Service; null for "Other" or a removed product
    productType: sale.Product ? typeOf(sale.Product) : null,
    customerId: sale.customerId,
    // Follow edits made in the Customers module; fall back to the sale's own copy otherwise
    customerName: sale.Customer?.name ?? sale.customerName,
    customerPhone: sale.Customer?.phone ?? sale.customerPhone,
    customer: sale.Customer ? toCustomerResponse(sale.Customer) : null,
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
    // Returns recorded against this sale; any return locks the sale against edits and deletion
    returns: returnInfo?.returns ?? [],
    // Serial numbers of this sale that are still with the customer and can be returned
    returnableSerials: returnInfo?.returnable ?? [],
});

// Returns and still-returnable serial numbers of a page of sales. A unit is returnable from a
// sale only while that sale is the unit's current sale and the unit is Sold, so a unit resold
// later can't be returned against its earlier sale.
const loadReturnInfo = async (sales) => {
    const info = new Map(sales.map((s) => [s.id, { returns: [], returnable: [] }]));
    const ids = sales.map((s) => s.id);
    if (ids.length === 0) return info;

    const serials = sales.flatMap((s) => s.serialNumbers);
    const [returns, units] = await Promise.all([
        SaleReturn.findAll({
            where: { saleId: ids },
            attributes: ["id", "saleId", "serialNumber", "status", "refundAmount", "returnDate"],
            order: [["id", "ASC"]],
            raw: true,
        }),
        serials.length === 0 ? [] : SerialUnit.findAll({
            where: { serialNumber: serials },
            attributes: ["serialNumber", "status", "currentSaleId"],
            raw: true,
        }),
    ]);
    // A license or installation that is still with the customer can be returned too
    for (const r of returns) {
        info.get(r.saleId).returns.push({ ...r, refundAmount: Number(r.refundAmount) });
    }
    const unitBy = new Map(units.map((u) => [u.serialNumber.toLowerCase(), u]));
    for (const sale of sales) {
        const returned = new Set(info.get(sale.id).returns
            .filter((r) => r.status !== RETURN_STATUS.REJECTED)
            .map((r) => r.serialNumber.toLowerCase()));
        info.get(sale.id).returnable = sale.serialNumbers.filter((sn) => {
            const unit = unitBy.get(sn.toLowerCase());
            // Recorded before tracking: still on this sale and never returned
            if (sale.saleType === SALE_TYPE.RENEWAL) return false;
            if (!unit) return !returned.has(sn.toLowerCase());
            return HELD_STATUSES.includes(unit.status) && unit.currentSaleId === sale.id;
        });
    }
    return info;
};

const sendSaleError = (res, error) => {
    if (error instanceof SaleError) return sendError(res, error.message, error.code, error.status, error.data);
    if (error instanceof CustomerRaceError) {
        return sendError(res, "This customer was just saved by someone else. Please submit again.", "CUSTOMER_EXISTS", 409);
    }
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
            include: [{ model: Product, attributes: ["id", "name", "hasSerialNumber", "productType"], required: true }],
            order: [[Product, "name", "ASC"]],
        });

        // In-stock serial numbers of this branch, for picking the exact units sold
        const serials = await ProductSerial.findAll({
            where: { branchId: resolved.branchId },
            attributes: ["productId", "serialNumber"],
            order: [["serialNumber", "ASC"]],
            raw: true,
        });
        // Licenses in this branch's pool, for Software products
        const licenses = await SerialUnit.findAll({
            where: { branchId: resolved.branchId, productType: PRODUCT_TYPE.SOFTWARE, status: UNIT_STATUS.AVAILABLE },
            attributes: ["productId", "serialNumber"],
            order: [["serialNumber", "ASC"]],
            raw: true,
        });
        serials.push(...licenses);
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
                productType: typeOf(s.Product),
                serialNumbers: serialsByProduct.get(s.productId) ?? [],
                // Software: licenses in the pool; Service: null (no limit from stock)
                quantity: typeOf(s.Product) === PRODUCT_TYPE.SOFTWARE
                    ? (serialsByProduct.get(s.productId) ?? []).length
                    : typeOf(s.Product) === PRODUCT_TYPE.SERVICE ? null : s.quantity,
            })),
        };
        return sendSuccess(res, "Sale products...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Filters shared by the sales list and its totals: branch scope, search text and an inclusive
// sale date range. Search also matches the current product name, the linked customer's
// current name / phone / company and the sold serial numbers, so callers must include Product
// and Customer.
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
        // "SALE-00012" finds that sale, so a serial number history can link to it
        const reference = /^SALE-0*(\d{1,9})$/i.exec(search);
        where[Op.or] = [
            ...(reference ? [{ id: Number(reference[1]) }] : []),
            { customerName: like },
            { productName: like },
            { "$Product.name$": like },
            { "$Customer.name$": like },
            { "$Customer.companyName$": like },
            { serialNumbers: like },
            ...(phoneSearch ? [
                { customerPhone: { [Op.like]: `%${phoneSearch}%` } },
                { "$Customer.phone$": { [Op.like]: `%${phoneSearch}%` } },
            ] : []),
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
                { model: Product, attributes: ["id", "name", "productType", "hasSerialNumber"], required: false },
                { model: Branch, attributes: ["id", "name"], required: false },
                { model: Customer, required: false },
            ],
            order: [["saleDate", "DESC"], ["id", "DESC"]],
            limit: pageSize,
            offset,
            distinct: true,
        });

        const returnInfo = await loadReturnInfo(rows);
        const data = {
            sale: rows.map((row) => toSaleResponse(row, returnInfo.get(row.id))),
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
// refunds: refunds of those sales' returns (rejected returns don't count), so net = total − refunds.
exports.salesSummary = async (req, res) => {
    try {
        const scope = req.branchScope;
        const filter = buildSaleWhere(scope, req.query);
        if (filter.error) return sendError(res, filter.error, null, 400);

        const [rows, refundRows, typeRows, branches] = await Promise.all([
            Sale.findAll({
                where: filter.where,
                include: [
                    { model: Product, attributes: [], required: false },
                    { model: Customer, attributes: [], required: false },
                ],
                attributes: ["branchId", [sequelize.fn("SUM", sequelize.col("Sale.sellingAmount")), "total"]],
                group: ["Sale.branchId"],
                raw: true,
            }),
            // Each return joins its one sale, so summing the returns never counts a sale twice
            Sale.findAll({
                where: filter.where,
                include: [
                    { model: Product, attributes: [], required: false },
                    { model: Customer, attributes: [], required: false },
                    { model: SaleReturn, as: "returns", attributes: [], required: true, where: { status: { [Op.ne]: RETURN_STATUS.REJECTED } } },
                ],
                attributes: ["branchId", [sequelize.fn("SUM", sequelize.col("returns.refundAmount")), "refunds"]],
                group: ["Sale.branchId"],
                raw: true,
            }),
            // Revenue split by product type, so software and service sales are visible on their own
            Sale.findAll({
                where: filter.where,
                include: [
                    { model: Product, attributes: [], required: false },
                    { model: Customer, attributes: [], required: false },
                ],
                attributes: [
                    [sequelize.col("Product.productType"), "productType"],
                    "saleType",
                    [sequelize.fn("SUM", sequelize.col("Sale.sellingAmount")), "total"],
                ],
                group: ["Product.productType", "Sale.saleType"],
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
        const refunds = new Map(refundRows.map((r) => [r.branchId, Number(r.refunds) || 0]));
        const toPaise = (n) => Math.round(n * 100);
        const branch = branches.map((br) => {
            const total = totals.get(br.id) ?? 0;
            const refund = refunds.get(br.id) ?? 0;
            return { branchId: br.id, branchName: br.name, total, refunds: refund, net: (toPaise(total) - toPaise(refund)) / 100 };
        });

        const sum = (field) => branch.reduce((acc, br) => acc + toPaise(br[field]), 0) / 100;
        // "Other" covers sales of products outside (or removed from) the catalogue; renewals are their own line
        const byType = new Map();
        for (const r of typeRows) {
            const label = r.saleType === SALE_TYPE.RENEWAL ? "Renewal" : r.productType ?? "Other";
            byType.set(label, (byType.get(label) ?? 0) + toPaise(Number(r.total) || 0));
        }
        const data = {
            branch, total: sum("total"), refunds: sum("refunds"), net: sum("net"),
            byType: [...byType].map(([productType, total]) => ({ productType, total: total / 100 })),
        };
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

        const sale = await saleTransaction(async (transaction) => {
            // Rolled back with the sale if anything below fails
            const customer = await resolveSaleCustomer(parsed.customer, { employeeId: req.employee.id, transaction });
            const linked = { ...values, ...customerFields(customer), createdBy: req.employee.id };

            // "Other" products aren't in the catalogue, so no stock or serial numbers move
            if (!values.productId) {
                return Sale.create(linked, { transaction });
            }

            const product = await Product.findByPk(values.productId, { transaction });
            if (!product) throw new SaleError("Selected product does not exist");
            checkSerialsForProduct(product, values);
            const type = typeOf(product);

            // Only Standard and Serialized products hold physical stock
            let serialNumbers = [];
            if (tracksStock(product)) {
                await takeStock({ ...values, transaction });
                serialNumbers = await takeSerials({ ...values, transaction });
            } else if (type === PRODUCT_TYPE.SOFTWARE) {
                serialNumbers = await takeLicenses({ ...values, transaction });
            }

            const created = await Sale.create({ ...linked, serialNumbers, productName: product.name }, { transaction });
            if (type === PRODUCT_TYPE.SERVICE) {
                const ids = await nextServiceIds(created.id, values.quantity, transaction);
                await created.update({ serialNumbers: ids }, { transaction });
                await createServiceUnits({ sale: created, serials: ids, employeeId: req.employee.id, transaction });
            } else {
                await recordSale({ sale: created, serials: serialNumbers, employeeId: req.employee.id, transaction });
            }
            return created;
        });

        return sendSuccess(res, "Sale added successfully", { id: sale.id, customerId: sale.customerId }, 201);
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

        const customerId = await saleTransaction(async (transaction) => {
            // Re-read under lock so two edits of the same sale can't both return its stock
            const sale = await findScopedSale(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (!sale) throw new SaleError(NOT_FOUND, 404);
            if (sale.saleType === SALE_TYPE.RENEWAL) {
                throw new SaleError("A renewal can't be edited. Delete it to cancel the renewal, then renew the license again.", 409);
            }
            await assertNoReturns(sale.id, "edited", transaction);
            const before = saleSnapshot(sale);
            // The product the sale was for decides what goes back (a removed product has nothing to return to)
            const oldProduct = sale.productId ? await Product.findByPk(sale.productId, { transaction }) : null;
            const oldTracksStock = !oldProduct || tracksStock(oldProduct);
            let isService = false;

            // Units that left, joined or stayed on the sale, for their serial number history
            const recordHistory = async () => {
                const now = sale.serialNumbers;
                const has = (list, sn) => list.some((x) => x.toLowerCase() === sn.toLowerCase());
                const employeeId = req.employee.id;
                await releaseFromSale({ sale: before, serials: before.serialNumbers.filter((sn) => !has(now, sn)), type: EVENT.REMOVED_FROM_SALE, employeeId, transaction });
                const joined = now.filter((sn) => !has(before.serialNumbers, sn));
                if (isService) await createServiceUnits({ sale, serials: joined, employeeId, transaction });
                else await recordSale({ sale, serials: joined, employeeId, transaction });
                await recordSaleEdit({ before, sale, serials: now.filter((sn) => has(before.serialNumbers, sn)), employeeId, transaction });
            };

            // Only this sale's link changes; the customer record (shared with their other
            // sales) is never edited from here
            const customer = await resolveSaleCustomer(parsed.customer, { employeeId: req.employee.id, transaction });
            Object.assign(values, customerFields(customer));

            // No product means "Other", which has no stock to take
            const product = values.productId ? await Product.findByPk(values.productId, { transaction }) : null;
            if (values.productId && !product) throw new SaleError("Selected product does not exist");
            if (product) checkSerialsForProduct(product, values);

            // Units go back first, so the sale can keep some or all of its serial numbers
            if (oldTracksStock) await returnSerials({ productId: sale.productId, branchId: sale.branchId, serialNumbers: sale.serialNumbers, transaction });

            if (!product) {
                // Changed to "Other": everything the sale held goes back to stock
                if (oldTracksStock) await returnStock({ productId: sale.productId, branchId: sale.branchId, quantity: sale.quantity, transaction });
                await sale.update({ ...values, serialNumbers: [] }, { transaction });
                await recordHistory();
                return customer.id;
            }

            const newTracksStock = tracksStock(product);
            const sameStock = sale.productId === values.productId && sale.branchId === values.branchId && oldTracksStock && newTracksStock;
            if (sameStock) {
                // Same branch and product: only the difference in quantity moves
                const delta = values.quantity - sale.quantity;
                if (delta > 0) {
                    await takeStock({ ...values, quantity: values.quantity, credit: sale.quantity, transaction });
                } else if (delta < 0) {
                    await returnStock({ productId: sale.productId, branchId: sale.branchId, quantity: -delta, transaction });
                }
            } else {
                if (oldTracksStock) await returnStock({ productId: sale.productId, branchId: sale.branchId, quantity: sale.quantity, transaction });
                if (newTracksStock) await takeStock({ ...values, transaction });
            }

            const type = typeOf(product);
            let serialNumbers;
            if (type === PRODUCT_TYPE.SOFTWARE) {
                serialNumbers = await takeLicenses({ ...values, saleId: sale.id, transaction });
            } else if (type === PRODUCT_TYPE.SERVICE) {
                isService = true;
                serialNumbers = await serviceIdsFor({ saleId: sale.id, before, productId: product.id, quantity: values.quantity, transaction });
            } else {
                serialNumbers = await takeSerials({ ...values, transaction });
            }
            await sale.update({ ...values, serialNumbers, productName: product.name }, { transaction });
            await recordHistory();
            return customer.id;
        });

        return sendSuccess(res, "Sale updated successfully", { id, customerId }, 200);
    } catch (error) {
        return sendSaleError(res, error);
    }
};

// Hard delete; the sold quantity (and serial numbers) go back into the sale branch's stock.
// Each unit's history keeps the sale and records its cancellation. Refused once a return exists.
exports.deleteSale = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid sale id", null, 400);

        await sequelize.transaction(async (transaction) => {
            const sale = await findScopedSale(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (!sale) throw new SaleError(NOT_FOUND, 404);
            // Deleting a renewal cancels it: the license keeps its history, its expiry goes back
            if (sale.saleType === SALE_TYPE.RENEWAL) {
                await cancelRenewal({ sale, employeeId: req.employee.id, transaction });
                await sale.destroy({ transaction });
                return;
            }
            await assertNoReturns(sale.id, "deleted", transaction);

            // Software and Service sales never took physical stock, so none goes back
            const product = sale.productId ? await Product.findByPk(sale.productId, { transaction }) : null;
            if (!product || tracksStock(product)) {
                await returnStock({ productId: sale.productId, branchId: sale.branchId, quantity: sale.quantity, transaction });
                await returnSerials({ productId: sale.productId, branchId: sale.branchId, serialNumbers: sale.serialNumbers, transaction });
            }
            await releaseFromSale({ sale: saleSnapshot(sale), serials: sale.serialNumbers, type: EVENT.SALE_CANCELLED, employeeId: req.employee.id, transaction });
            await sale.destroy({ transaction });
        });

        return sendSuccess(res, "Sale deleted successfully", null, 200);
    } catch (error) {
        return sendSaleError(res, error);
    }
};
