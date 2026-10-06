const { Op } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { Product, ProductStock, ProductSerial, Branch, Sale } = require("@/models/index");

// Every handler runs after loadBranchScope, so req.branchScope = { isAdmin, branchId } comes
// from the logged-in employee's record. A branchId in the request is never trusted on its own.
//
// Serial numbers: a product either has none (stock is a plain quantity) or tracks one serial
// number per unit (product.hasSerialNumber). For tracked products every in-stock unit is a
// product_serial row and the branch's quantity is always the number of those rows.

const MAX_QUANTITY = 1000000000;
const MAX_SERIALS = 1000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const NOT_FOUND = "Product not found";

// Thrown inside a transaction so it rolls back, then turned into an API error
class ProductError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const parseId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

// "yyyy-MM-dd" -> local midnight, or null when malformed or impossible (e.g. 2026-02-31)
const parseDate = (value) => {
    if (typeof value !== "string" || !DATE_REGEX.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
};

const parseName = (name) => {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return { error: "Product name is required" };
    if (trimmed.length > 255) return { error: "Product name must be at most 255 characters" };
    return { value: trimmed };
};

const parseQuantity = (quantity) => {
    const n = typeof quantity === "string" && quantity.trim() !== "" ? Number(quantity) : quantity;
    if (n === undefined || n === null || n === "") return { error: "Quantity is required" };
    if (typeof n !== "number" || !Number.isInteger(n)) return { error: "Quantity must be a whole number" };
    if (n < 0) return { error: "Quantity cannot be negative" };
    if (n > MAX_QUANTITY) return { error: `Quantity must be at most ${MAX_QUANTITY.toLocaleString("en-IN")}` };
    return { value: n };
};

// List of serial numbers, trimmed, blanks dropped. Duplicates are refused (case-insensitive,
// like the database's unique index). Missing means an empty list.
const parseSerialNumbers = (list) => {
    if (list === undefined || list === null) return { value: [] };
    if (!Array.isArray(list) || list.some((s) => typeof s !== "string")) return { error: "Invalid serial numbers" };

    const serials = list.map((s) => s.trim()).filter(Boolean);
    if (serials.length > MAX_SERIALS) return { error: `At most ${MAX_SERIALS} serial numbers at a time` };
    const tooLong = serials.find((s) => s.length > 100);
    if (tooLong) return { error: `Serial number "${tooLong.slice(0, 20)}..." is longer than 100 characters` };

    const seen = new Set();
    const repeated = serials.find((s) => (seen.has(s.toLowerCase()) ? true : (seen.add(s.toLowerCase()), false)));
    if (repeated) return { error: `Serial number ${repeated} is entered more than once` };

    return { value: serials };
};

const listForMessage = (serials) => (serials.length > 5 ? `${serials.slice(0, 5).join(", ")} and ${serials.length - 5} more` : serials.join(", "));

// Which of these serial numbers already exist anywhere: in stock (any product or branch) or
// recorded on a sale. A serial number is never reused once it exists.
const findExistingSerials = async (serials, transaction) => {
    if (serials.length === 0) return [];

    const inStock = await ProductSerial.findAll({ where: { serialNumber: serials }, attributes: ["serialNumber"], transaction });

    // sale.serialNumbers is a JSON array, so match each value with its surrounding quotes
    const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");
    const sales = await Sale.findAll({
        where: { [Op.or]: serials.map((sn) => ({ serialNumbers: { [Op.like]: `%${escapeLike(JSON.stringify(sn))}%` } })) },
        attributes: ["serialNumbers"],
        transaction,
    });
    const sold = new Set(sales.flatMap((sale) => sale.serialNumbers).map((sn) => sn.toLowerCase()));

    const existing = new Set([...inStock.map((r) => r.serialNumber.toLowerCase()), ...sold]);
    return serials.filter((sn) => existing.has(sn.toLowerCase()));
};

// Refuses serial numbers that already exist (in stock or sold)
const assertSerialsFree = async (serials, transaction) => {
    const existing = await findExistingSerials(serials, transaction);
    if (existing.length > 0) {
        throw new ProductError(`Serial number already exists: ${listForMessage(existing)}`, 409);
    }
};

// Branch members always act on their own branch: a branchId they send is accepted only when
// it is that branch. Admins must say which branch. Returns { error, status } or { branchId }.
const resolveBranchId = (scope, requested) => {
    const sent = requested !== undefined && requested !== null && requested !== "";
    const parsed = parseId(requested);

    if (!scope.isAdmin) {
        if (sent && parsed !== scope.branchId) {
            return { error: "You can only manage stock for your own branch", status: 403 };
        }
        return { branchId: scope.branchId };
    }

    if (!parsed) return { error: sent ? "Invalid branch" : "Branch is required", status: 400 };
    return { branchId: parsed };
};

// Stock can't be newly placed in a missing or inactive branch
const validateBranchForNewStock = async (branchId, scope) => {
    const branch = await Branch.findByPk(branchId);
    if (!branch) return "Selected branch does not exist";
    if (!branch.isActive) return scope.isAdmin ? "Selected branch is inactive" : "Your branch is inactive";
    return null;
};

// A product without stock in any branch is no longer listed anywhere, so drop it
const removeIfOrphaned = async (productId, transaction) => {
    const remaining = await ProductStock.count({ where: { productId }, transaction });
    if (remaining === 0) await Product.destroy({ where: { id: productId }, transaction });
};

// serialsByStock: Map of "productId:branchId" -> in-stock serial numbers
const toProductResponse = (product, serialsByStock) => {
    const stocks = (product.stocks ?? []).map((s) => ({
        id: s.id,
        branchId: s.branchId,
        branchName: s.Branch?.name ?? null,
        quantity: s.quantity,
        serialNumbers: serialsByStock.get(`${product.id}:${s.branchId}`) ?? [],
        updatedAt: s.updatedAt,
    }));
    const lastUpdated = stocks.reduce((latest, s) => (!latest || s.updatedAt > latest ? s.updatedAt : latest), null);

    return { id: product.id, name: product.name, hasSerialNumber: product.hasSerialNumber, updatedAt: lastUpdated ?? product.updatedAt, stocks };
};

const sendProductError = (res, error) => {
    if (error instanceof ProductError) return sendError(res, error.message, null, error.status);
    if (error.name === "SequelizeUniqueConstraintError") {
        // Two people saving at once: either the same new product name or the same serial number
        const isSerial = Object.keys(error.fields ?? {}).some((f) => f.toLowerCase().includes("serial"));
        return sendError(res, isSerial ? "One of these serial numbers was just added. Please check and try again." : "A product with this name already exists", null, 409);
    }
    return sendError(res, error.message, null, 500);
};

// Branches the employee may see, used for the table's branch columns and the branch dropdown
exports.branches = async (req, res) => {
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

        return sendSuccess(res, "Product branches...", { isAdmin, branchId, branch: branches }, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

exports.product = async (req, res) => {
    try {
        const scope = req.branchScope;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 10, 1);
        const offset = (page - 1) * pageSize;

        // Search matches the product name or any in-stock serial number the user can see
        const where = {};
        const search = req.query.search?.trim();
        if (search) {
            const pattern = sequelize.escape(`%${search}%`);
            const branchFilter = scope.isAdmin ? "" : ` AND branchId = ${Number(scope.branchId)}`;
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { id: { [Op.in]: sequelize.literal(`(SELECT productId FROM product_serial WHERE serialNumber LIKE ${pattern}${branchFilter})`) } },
            ];
        }

        // Branch members only ever get rows for their own branch
        const stockWhere = {};
        if (!scope.isAdmin) stockWhere.branchId = scope.branchId;

        // Date range applies to when the branch stock was last added/updated (inclusive days)
        const startDate = req.query.startDate ? parseDate(req.query.startDate) : null;
        const endDate = req.query.endDate ? parseDate(req.query.endDate) : null;
        if (req.query.startDate && !startDate) return sendError(res, "Invalid start date", null, 400);
        if (req.query.endDate && !endDate) return sendError(res, "Invalid end date", null, 400);
        if (startDate && endDate && startDate > endDate) {
            return sendError(res, "Start date must be on or before end date", null, 400);
        }
        if (startDate || endDate) {
            stockWhere.updatedAt = {};
            if (startDate) stockWhere.updatedAt[Op.gte] = startDate;
            if (endDate) {
                const dayAfterEnd = new Date(endDate);
                dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
                stockWhere.updatedAt[Op.lt] = dayAfterEnd;
            }
        }

        // required: only products with at least one matching (visible) stock row are listed,
        // and only those stock rows are returned
        const { count, rows } = await Product.findAndCountAll({
            where,
            attributes: ["id", "name", "hasSerialNumber", "updatedAt"],
            include: [{
                model: ProductStock,
                as: "stocks",
                where: stockWhere,
                required: true,
                attributes: ["id", "branchId", "quantity", "updatedAt"],
                include: [{ model: Branch, attributes: ["id", "name"] }],
            }],
            order: [["id", "DESC"]],
            limit: pageSize,
            offset,
            distinct: true,
        });

        // Serial numbers of this page's tracked products, loaded separately to keep the main query small
        const trackedIds = rows.filter((p) => p.hasSerialNumber).map((p) => p.id);
        const serials = trackedIds.length === 0 ? [] : await ProductSerial.findAll({
            where: { productId: trackedIds, ...(scope.isAdmin ? {} : { branchId: scope.branchId }) },
            attributes: ["productId", "branchId", "serialNumber"],
            order: [["serialNumber", "ASC"]],
            raw: true,
        });
        const serialsByStock = new Map();
        for (const s of serials) {
            const key = `${s.productId}:${s.branchId}`;
            if (!serialsByStock.has(key)) serialsByStock.set(key, []);
            serialsByStock.get(key).push(s.serialNumber);
        }

        const data = {
            product: rows.map((p) => toProductResponse(p, serialsByStock)),
            pagination: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize),
            },
        };

        return sendSuccess(res, "All Products...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Adds stock to a branch. Products are matched by name (case-insensitive), so adding an
// existing product to a branch that already stocks it increases that branch's quantity
// instead of creating a duplicate record. Serial-tracked products take one serial number per
// unit instead of a quantity; whether a product is tracked is fixed when it is first added.
exports.createProduct = async (req, res) => {
    try {
        const scope = req.branchScope;
        // Only admins add products; branch members can still edit and sell their branch's stock
        if (!scope.isAdmin) return sendError(res, "Only an admin can add products", null, 403);
        const { name, quantity, hasSerialNumber, serialNumbers, branchId: requestedBranchId } = req.body || {};

        const parsedName = parseName(name);
        if (parsedName.error) return sendError(res, parsedName.error, null, 400);

        const parsedSerials = parseSerialNumbers(serialNumbers);
        if (parsedSerials.error) return sendError(res, parsedSerials.error, null, 400);

        const resolved = resolveBranchId(scope, requestedBranchId);
        if (resolved.error) return sendError(res, resolved.error, null, resolved.status);
        const { branchId } = resolved;

        const branchError = await validateBranchForNewStock(branchId, scope);
        if (branchError) return sendError(res, branchError, null, 400);

        const result = await sequelize.transaction(async (transaction) => {
            const [product, isNewProduct] = await Product.findOrCreate({
                where: { name: parsedName.value },
                defaults: { name: parsedName.value, hasSerialNumber: hasSerialNumber === true },
                transaction,
            });

            let added;
            if (product.hasSerialNumber) {
                if (parsedSerials.value.length === 0) {
                    throw new ProductError(isNewProduct
                        ? "Enter at least one serial number"
                        : `${product.name} uses serial numbers. Enter one serial number for each unit.`);
                }
                await assertSerialsFree(parsedSerials.value, transaction);
                added = parsedSerials.value.length;
            } else {
                if (parsedSerials.value.length > 0) {
                    throw new ProductError(`${product.name} doesn't use serial numbers. Enter a quantity instead.`);
                }
                const parsedQuantity = parseQuantity(quantity);
                if (parsedQuantity.error) throw new ProductError(parsedQuantity.error);
                added = parsedQuantity.value;
            }

            const stock = await ProductStock.findOne({
                where: { productId: product.id, branchId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            const newQuantity = (stock?.quantity ?? 0) + added;
            if (newQuantity > MAX_QUANTITY) throw new ProductError(`Total quantity would exceed ${MAX_QUANTITY.toLocaleString("en-IN")}`);

            if (product.hasSerialNumber) {
                await ProductSerial.bulkCreate(
                    parsedSerials.value.map((serialNumber) => ({ productId: product.id, branchId, serialNumber })),
                    { transaction },
                );
            }

            const saved = stock
                ? await stock.update({ quantity: newQuantity }, { transaction })
                : await ProductStock.create({ productId: product.id, branchId, quantity: newQuantity }, { transaction });
            return { product, stock: saved, merged: !!stock || !isNewProduct, added };
        });

        const data = {
            productId: result.product.id,
            name: result.product.name,
            hasSerialNumber: result.product.hasSerialNumber,
            branchId,
            quantity: result.stock.quantity,
        };

        return result.merged
            ? sendSuccess(res, `Stock added to existing product. New quantity: ${result.stock.quantity}`, data, 200)
            : sendSuccess(res, "Product added successfully", data, 201);
    } catch (error) {
        return sendProductError(res, error);
    }
};

// Sets one branch's stock. Plain products take a quantity; serial-tracked products take the
// full list of that branch's in-stock serial numbers (missing ones are removed, new ones added).
// Only admins can rename a product (the name is shared by every branch) or set stock for a
// branch that doesn't have the product yet.
exports.updateProduct = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid product id", null, 400);

        const { name, quantity, serialNumbers, branchId: requestedBranchId } = req.body || {};

        const resolved = resolveBranchId(scope, requestedBranchId);
        if (resolved.error) return sendError(res, resolved.error, null, resolved.status);
        const { branchId } = resolved;

        const product = await Product.findByPk(id);
        if (!product) return sendError(res, NOT_FOUND, null, 404);

        let parsedQuantity = null;
        let parsedSerials = null;
        if (product.hasSerialNumber) {
            if (!Array.isArray(serialNumbers)) return sendError(res, "Serial numbers are required for this product", null, 400);
            parsedSerials = parseSerialNumbers(serialNumbers);
            if (parsedSerials.error) return sendError(res, parsedSerials.error, null, 400);
        } else {
            parsedQuantity = parseQuantity(quantity);
            if (parsedQuantity.error) return sendError(res, parsedQuantity.error, null, 400);
        }

        const stock = await ProductStock.findOne({ where: { productId: id, branchId } });

        let newName = product.name;
        if (scope.isAdmin) {
            const parsedName = parseName(name);
            if (parsedName.error) return sendError(res, parsedName.error, null, 400);
            newName = parsedName.value;

            if (!stock) {
                const branchError = await validateBranchForNewStock(branchId, scope);
                if (branchError) return sendError(res, branchError, null, 400);
            }
        } else {
            // Same answer as a missing product, so other branches' products aren't revealed
            if (!stock) return sendError(res, NOT_FOUND, null, 404);
            if (name !== undefined && (typeof name !== "string" || name.trim() !== product.name)) {
                return sendError(res, "Only an admin can rename a product", null, 400);
            }
        }

        const saved = await sequelize.transaction(async (transaction) => {
            if (newName !== product.name) await product.update({ name: newName }, { transaction });

            let newQuantity = parsedQuantity?.value;
            if (product.hasSerialNumber) {
                const current = await ProductSerial.findAll({ where: { productId: id, branchId }, transaction, lock: transaction.LOCK.UPDATE });
                const wanted = new Set(parsedSerials.value.map((s) => s.toLowerCase()));
                const kept = new Set(current.map((s) => s.serialNumber.toLowerCase()));

                const removed = current.filter((s) => !wanted.has(s.serialNumber.toLowerCase()));
                const added = parsedSerials.value.filter((s) => !kept.has(s.toLowerCase()));

                if (removed.length > 0) {
                    await ProductSerial.destroy({ where: { id: removed.map((s) => s.id) }, transaction });
                }
                await assertSerialsFree(added, transaction);
                if (added.length > 0) {
                    await ProductSerial.bulkCreate(added.map((serialNumber) => ({ productId: id, branchId, serialNumber })), { transaction });
                }
                newQuantity = parsedSerials.value.length;
            }

            if (stock) return stock.update({ quantity: newQuantity }, { transaction });
            return ProductStock.create({ productId: id, branchId, quantity: newQuantity }, { transaction });
        });

        const data = { productId: product.id, name: product.name, hasSerialNumber: product.hasSerialNumber, branchId, quantity: saved.quantity };
        return sendSuccess(res, "Product updated successfully", data, 200);
    } catch (error) {
        return sendProductError(res, error);
    }
};

// Hard delete. With ?branchId only that branch's stock is removed; admins can omit it to
// delete the product from every branch. Branch members can only remove their own branch's stock.
// In-stock serial numbers go with the stock; sold ones stay on their sales.
exports.deleteProduct = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid product id", null, 400);

        const requestedBranchId = req.query.branchId;
        const deleteEverywhere = scope.isAdmin && (requestedBranchId === undefined || requestedBranchId === "");

        let branchId = null;
        if (!deleteEverywhere) {
            const resolved = resolveBranchId(scope, requestedBranchId);
            if (resolved.error) return sendError(res, resolved.error, null, resolved.status);
            branchId = resolved.branchId;
        }

        const product = await Product.findByPk(id);
        if (!product) return sendError(res, NOT_FOUND, null, 404);

        if (deleteEverywhere) {
            await sequelize.transaction(async (transaction) => {
                await ProductSerial.destroy({ where: { productId: id }, transaction });
                await ProductStock.destroy({ where: { productId: id }, transaction });
                await product.destroy({ transaction });
            });
            return sendSuccess(res, "Product deleted from all branches", null, 200);
        }

        const stock = await ProductStock.findOne({ where: { productId: id, branchId } });
        if (!stock) {
            return sendError(res, scope.isAdmin ? "This product has no stock in the selected branch" : NOT_FOUND, null, 404);
        }

        await sequelize.transaction(async (transaction) => {
            await ProductSerial.destroy({ where: { productId: id, branchId }, transaction });
            await stock.destroy({ transaction });
            await removeIfOrphaned(id, transaction);
        });

        return sendSuccess(res, "Product stock deleted successfully", null, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Lets the form flag serial numbers that already exist (in stock or sold) while they're typed.
// Body: { serialNumbers: string[] }. Returns { existing: string[] }. Saving checks again.
exports.checkSerials = async (req, res) => {
    try {
        const parsed = parseSerialNumbers(req.body?.serialNumbers);
        // Repeats within the list are reported by the form itself; check each value once here
        const unique = parsed.error ? [] : parsed.value;
        if (parsed.error && Array.isArray(req.body?.serialNumbers)) {
            const seen = new Set();
            for (const sn of req.body.serialNumbers) {
                const value = typeof sn === "string" ? sn.trim() : "";
                if (value && value.length <= 100 && !seen.has(value.toLowerCase())) {
                    seen.add(value.toLowerCase());
                    unique.push(value);
                }
            }
        }
        const existing = await findExistingSerials(unique.slice(0, MAX_SERIALS));
        return sendSuccess(res, "Serial number check...", { existing }, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};
