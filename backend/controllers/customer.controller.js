const { Op, UniqueConstraintError } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { Customer, Sale, Product, Branch } = require("@/models/index");
const {
    escapeLike,
    parseCustomerFields,
    findDuplicateCustomer,
    duplicateMessage,
    toCustomerResponse,
} = require("@/helper/customer");

// Every handler runs after loadBranchScope, so req.branchScope = { isAdmin, branchId }.
// Customers are shared by all branches (like the product catalogue): everyone can find, add and
// edit them. Deleting one affects every branch's sales, so only an admin can do that. A
// customer's sales are still branch-scoped: branch members only see their own branch's sales.

const NOT_FOUND = "Customer not found";
const SUGGESTION_LIMIT = 8;
const DUPLICATE_CODE = "CUSTOMER_EXISTS";

// Digits of the search text when it looks like (part of) a phone number, e.g. "98765" or
// "+91 98765-43210"; null for other text, so "Shop 24" doesn't match phones containing 24
const phoneDigits = (text) => {
    if (!/^[+\d\s()-]+$/.test(text)) return null;
    const digits = text.replace(/\D/g, "");
    return digits.length >= 3 ? digits : null;
};

const parseId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

// Matches name, company / shop / garage name, city, email, or the digits of the phone number
const buildSearchWhere = (search) => {
    const text = search?.trim();
    if (!text) return {};
    const like = { [Op.like]: `%${escapeLike(text)}%` };
    // Phones are stored as "+919876543210", so match on the typed digits only
    const digits = phoneDigits(text);
    return {
        [Op.or]: [
            { name: like },
            { companyName: like },
            { city: like },
            { email: like },
            ...(digits ? [{ phone: { [Op.like]: `%${digits}%` } }] : []),
        ],
    };
};

const sendDuplicate = (res, existing, values) =>
    sendError(res, duplicateMessage(existing, values), DUPLICATE_CODE, 409, { customer: toCustomerResponse(existing) });

exports.customer = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 100);
        const offset = (page - 1) * pageSize;

        const { count, rows } = await Customer.findAndCountAll({
            where: buildSearchWhere(req.query.search),
            order: [["id", "DESC"]],
            limit: pageSize,
            offset,
        });

        const data = {
            customer: rows.map(toCustomerResponse),
            pagination: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize),
            },
        };
        return sendSuccess(res, "All Customers...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Autocomplete for the sale form: a few customers matching a name or phone number, best
// matches first (phone starting or ending with the digits, then name starting with the text,
// then the rest).
exports.suggestCustomers = async (req, res) => {
    try {
        const text = req.query.search?.trim() ?? "";
        if (!text) return sendSuccess(res, "Customer suggestions...", { customer: [] }, 200);

        const escaped = escapeLike(text);
        const digits = phoneDigits(text);
        const where = {
            [Op.or]: [
                { name: { [Op.like]: `%${escaped}%` } },
                { companyName: { [Op.like]: `%${escaped}%` } },
                ...(digits ? [{ phone: { [Op.like]: `%${digits}%` } }] : []),
            ],
        };

        const rank = sequelize.literal(`CASE
            WHEN ${digits ? `phone LIKE ${sequelize.escape(`%${digits}`)} OR phone LIKE ${sequelize.escape(`+${digits}%`)}` : "FALSE"} THEN 0
            WHEN name LIKE ${sequelize.escape(`${escaped}%`)} THEN 1
            ${digits ? `WHEN phone LIKE ${sequelize.escape(`%${digits}%`)} THEN 2` : ""}
            ELSE 3 END`);

        const rows = await Customer.findAll({
            where,
            order: [[rank, "ASC"], ["name", "ASC"], ["id", "ASC"]],
            limit: SUGGESTION_LIMIT,
        });

        return sendSuccess(res, "Customer suggestions...", { customer: rows.map(toCustomerResponse) }, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Customer details plus their sales the user may see (own branch only for branch members)
exports.customerById = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid customer id", null, 400);

        const customer = await Customer.findByPk(id);
        if (!customer) return sendError(res, NOT_FOUND, null, 404);

        const saleWhere = { customerId: id, ...(scope.isAdmin ? {} : { branchId: scope.branchId }) };
        const [totals, recent] = await Promise.all([
            Sale.findOne({
                where: saleWhere,
                attributes: [
                    [sequelize.fn("COUNT", sequelize.col("id")), "count"],
                    [sequelize.fn("SUM", sequelize.col("sellingAmount")), "total"],
                    [sequelize.fn("MAX", sequelize.col("saleDate")), "lastSaleDate"],
                ],
                raw: true,
            }),
            Sale.findAll({
                where: saleWhere,
                include: [
                    { model: Product, attributes: ["id", "name"], required: false },
                    { model: Branch, attributes: ["id", "name"], required: false },
                ],
                order: [["saleDate", "DESC"], ["id", "DESC"]],
                limit: 10,
            }),
        ]);

        const data = {
            ...toCustomerResponse(customer),
            sales: {
                count: Number(totals?.count) || 0,
                total: Number(totals?.total) || 0,
                lastSaleDate: totals?.lastSaleDate ?? null,
                recent: recent.map((sale) => ({
                    id: sale.id,
                    productName: sale.Product?.name ?? sale.productName,
                    quantity: sale.quantity,
                    sellingAmount: Number(sale.sellingAmount),
                    saleDate: sale.saleDate,
                    branchName: sale.Branch?.name ?? null,
                })),
            },
        };
        return sendSuccess(res, "Customer details...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

exports.createCustomer = async (req, res) => {
    try {
        const parsed = parseCustomerFields(req.body);
        if (parsed.error) return sendError(res, parsed.error, null, 400);
        const { values } = parsed;

        const existing = await findDuplicateCustomer(values);
        if (existing) return sendDuplicate(res, existing, values);

        const customer = await Customer.create({ ...values, createdBy: req.employee.id });
        return sendSuccess(res, "Customer added successfully", toCustomerResponse(customer), 201);
    } catch (error) {
        // Another request saved the same phone number between the check and the insert
        if (error instanceof UniqueConstraintError) {
            return sendError(res, "A customer with this phone number already exists", DUPLICATE_CODE, 409);
        }
        return sendError(res, error.message, null, 500);
    }
};

exports.updateCustomer = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid customer id", null, 400);

        const parsed = parseCustomerFields(req.body);
        if (parsed.error) return sendError(res, parsed.error, null, 400);
        const { values } = parsed;

        const customer = await Customer.findByPk(id);
        if (!customer) return sendError(res, NOT_FOUND, null, 404);

        const existing = await findDuplicateCustomer(values, { excludeId: id });
        if (existing) return sendDuplicate(res, existing, values);

        await customer.update(values);
        return sendSuccess(res, "Customer updated successfully", toCustomerResponse(customer), 200);
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return sendError(res, "A customer with this phone number already exists", DUPLICATE_CODE, 409);
        }
        return sendError(res, error.message, null, 500);
    }
};

// Admin only. The customer's sales stay; they keep the customer's latest name and phone as
// their own details and lose only the link.
exports.deleteCustomer = async (req, res) => {
    try {
        if (!req.branchScope.isAdmin) return sendError(res, "Only an admin can delete customers", null, 403);

        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid customer id", null, 400);

        const found = await sequelize.transaction(async (transaction) => {
            const customer = await Customer.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!customer) return false;

            await Sale.update(
                { customerId: null, customerName: customer.name, ...(customer.phone ? { customerPhone: customer.phone } : {}) },
                { where: { customerId: id }, transaction },
            );
            await customer.destroy({ transaction });
            return true;
        });

        if (!found) return sendError(res, NOT_FOUND, null, 404);
        return sendSuccess(res, "Customer deleted successfully", null, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};
