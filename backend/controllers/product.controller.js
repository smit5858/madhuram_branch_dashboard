const { Op } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { Product, ProductStock, Branch } = require("@/models/index");

// Every handler runs after loadBranchScope, so req.branchScope = { isAdmin, branchId } comes
// from the logged-in employee's record. A branchId in the request is never trusted on its own.

const MAX_QUANTITY = 1000000000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const NOT_FOUND = "Product not found";

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

const toProductResponse = (product) => {
    const stocks = (product.stocks ?? []).map((s) => ({
        id: s.id,
        branchId: s.branchId,
        branchName: s.Branch?.name ?? null,
        quantity: s.quantity,
        updatedAt: s.updatedAt,
    }));
    const lastUpdated = stocks.reduce((latest, s) => (!latest || s.updatedAt > latest ? s.updatedAt : latest), null);

    return { id: product.id, name: product.name, updatedAt: lastUpdated ?? product.updatedAt, stocks };
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

        const where = {};
        const search = req.query.search?.trim();
        if (search) {
            where.name = { [Op.like]: `%${search}%` };
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
            attributes: ["id", "name", "updatedAt"],
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

        const data = {
            product: rows.map(toProductResponse),
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
// instead of creating a duplicate record.
exports.createProduct = async (req, res) => {
    try {
        const scope = req.branchScope;
        const { name, quantity, branchId: requestedBranchId } = req.body || {};

        const parsedName = parseName(name);
        if (parsedName.error) return sendError(res, parsedName.error, null, 400);

        const parsedQuantity = parseQuantity(quantity);
        if (parsedQuantity.error) return sendError(res, parsedQuantity.error, null, 400);

        const resolved = resolveBranchId(scope, requestedBranchId);
        if (resolved.error) return sendError(res, resolved.error, null, resolved.status);
        const { branchId } = resolved;

        const branchError = await validateBranchForNewStock(branchId, scope);
        if (branchError) return sendError(res, branchError, null, 400);

        const result = await sequelize.transaction(async (transaction) => {
            const [product] = await Product.findOrCreate({
                where: { name: parsedName.value },
                defaults: { name: parsedName.value },
                transaction,
            });

            const stock = await ProductStock.findOne({
                where: { productId: product.id, branchId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (stock) {
                const newQuantity = stock.quantity + parsedQuantity.value;
                if (newQuantity > MAX_QUANTITY) return { overflow: true };
                await stock.update({ quantity: newQuantity }, { transaction });
                return { product, stock, merged: true };
            }

            const created = await ProductStock.create(
                { productId: product.id, branchId, quantity: parsedQuantity.value },
                { transaction },
            );
            return { product, stock: created, merged: false };
        });

        if (result.overflow) {
            return sendError(res, `Total quantity would exceed ${MAX_QUANTITY.toLocaleString("en-IN")}`, null, 400);
        }

        const data = {
            productId: result.product.id,
            name: result.product.name,
            branchId,
            quantity: result.stock.quantity,
        };

        return result.merged
            ? sendSuccess(res, `Stock added to existing product. New quantity: ${result.stock.quantity}`, data, 200)
            : sendSuccess(res, "Product added successfully", data, 201);
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            return sendError(res, "This product was just added by someone else. Please try again.", null, 409);
        }
        return sendError(res, error.message, null, 500);
    }
};

// Sets the quantity of one branch's stock. Only admins can rename a product (the name is
// shared by every branch) or set stock for a branch that doesn't have the product yet.
exports.updateProduct = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid product id", null, 400);

        const { name, quantity, branchId: requestedBranchId } = req.body || {};

        const parsedQuantity = parseQuantity(quantity);
        if (parsedQuantity.error) return sendError(res, parsedQuantity.error, null, 400);

        const resolved = resolveBranchId(scope, requestedBranchId);
        if (resolved.error) return sendError(res, resolved.error, null, resolved.status);
        const { branchId } = resolved;

        const product = await Product.findByPk(id);
        if (!product) return sendError(res, NOT_FOUND, null, 404);

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

            if (stock) return stock.update({ quantity: parsedQuantity.value }, { transaction });
            return ProductStock.create({ productId: id, branchId, quantity: parsedQuantity.value }, { transaction });
        });

        const data = { productId: product.id, name: product.name, branchId, quantity: saved.quantity };
        return sendSuccess(res, "Product updated successfully", data, 200);
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            return sendError(res, "A product with this name already exists", null, 409);
        }
        return sendError(res, error.message, null, 500);
    }
};

// Hard delete. With ?branchId only that branch's stock is removed; admins can omit it to
// delete the product from every branch. Branch members can only remove their own branch's stock.
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
            await stock.destroy({ transaction });
            await removeIfOrphaned(id, transaction);
        });

        return sendSuccess(res, "Product stock deleted successfully", null, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};
