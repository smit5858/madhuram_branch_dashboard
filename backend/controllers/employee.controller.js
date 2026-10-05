const { Op } = require("sequelize");
const { sendError, sendSuccess } = require("@/helper/response");
const { hashPassword } = require("@/helper/common");
const { Employee, Branch, Roles } = require("@/models/index");

// Never send credentials or session data back to the client
const SAFE_ATTRIBUTES = { exclude: ["password", "refreshToken", "tokenInvalidatedAt"] };

const INCLUDE_RELATIONS = [
    { model: Branch, attributes: ["id", "name", "isActive"] },
    { model: Roles, attributes: ["id", "name"] },
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164, as sent by the frontend PhoneInput ("+919876543210")
const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

const parseId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const findEmployee = (id) =>
    Employee.findByPk(id, { attributes: SAFE_ATTRIBUTES, include: INCLUDE_RELATIONS });

exports.employee = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 10, 1);
        const offset = (page - 1) * pageSize;

        const where = {};

        const search = req.query.search?.trim();
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } },
            ];
        }

        // status: "active" | "inactive" (also accepts "true" | "false")
        const status = req.query.status?.toLowerCase();
        if (status === "active" || status === "true") where.isActive = true;
        else if (status === "inactive" || status === "false") where.isActive = false;

        const branchId = parseId(req.query.branchId);
        if (branchId) where.branchId = branchId;

        const { count, rows } = await Employee.findAndCountAll({
            where,
            attributes: SAFE_ATTRIBUTES,
            include: INCLUDE_RELATIONS,
            order: [["id", "DESC"]],
            limit: pageSize,
            offset,
            distinct: true,
        });

        const data = {
            employee: rows,
            pagination: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize),
            },
        };

        return sendSuccess(res, "All Employees...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

exports.employeeById = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid employee id", null, 400);

        const employee = await findEmployee(id);
        if (!employee) return sendError(res, "Employee not found", null, 404);

        return sendSuccess(res, "Employee details", employee, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Validates and normalises the body shared by create and update.
// On update an empty password keeps the current one.
// Returns { error } or { values }.
const parseEmployeeBody = (body, { isUpdate }) => {
    const { name, email, phone, password, roleId, branchId, isActive } = body || {};

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) return { error: "Employee name is required" };
    if (trimmedName.length > 255) return { error: "Employee name must be at most 255 characters" };

    const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!trimmedEmail) return { error: "Email is required" };
    if (trimmedEmail.length > 255 || !EMAIL_REGEX.test(trimmedEmail)) return { error: "Enter a valid email address" };

    const trimmedPhone = typeof phone === "string" ? phone.trim() : "";
    if (trimmedPhone && !PHONE_REGEX.test(trimmedPhone)) return { error: "Enter a valid phone number" };

    const rawPassword = typeof password === "string" ? password : "";
    if (!isUpdate && !rawPassword) return { error: "Password is required" };
    if (rawPassword && rawPassword.length < 6) return { error: "Password must be at least 6 characters" };
    if (rawPassword.length > 100) return { error: "Password must be at most 100 characters" };

    const parsedRoleId = parseId(roleId);
    if (!parsedRoleId) return { error: "Role is required" };

    const parsedBranchId = parseId(branchId);
    if (!parsedBranchId) return { error: "Branch is required" };

    if (isActive !== undefined && typeof isActive !== "boolean") {
        return { error: "isActive must be true or false" };
    }

    const values = {
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || null,
        roleId: parsedRoleId,
        branchId: parsedBranchId,
        isActive: isActive ?? true,
    };
    if (rawPassword) values.password = hashPassword(rawPassword);

    return { values };
};

// Branch and role must exist. An inactive branch/role can't be newly assigned,
// but an employee already on one can be saved without being forced to move.
const validateRelations = async (values, current) => {
    const branch = await Branch.findByPk(values.branchId);
    if (!branch) return "Selected branch does not exist";
    if (!branch.isActive && current?.branchId !== values.branchId) return "Selected branch is inactive";

    const role = await Roles.findByPk(values.roleId);
    if (!role) return "Selected role does not exist";
    if (!role.isActive && current?.roleId !== values.roleId) return "Selected role is inactive";

    return null;
};

const DUPLICATE_EMAIL = "An employee with this email already exists";

exports.createEmployee = async (req, res) => {
    try {
        const { error, values } = parseEmployeeBody(req.body, { isUpdate: false });
        if (error) return sendError(res, error, null, 400);

        const relationError = await validateRelations(values, null);
        if (relationError) return sendError(res, relationError, null, 400);

        const created = await Employee.create(values);
        const employee = await findEmployee(created.id);

        return sendSuccess(res, "Employee created successfully", employee, 201);
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            return sendError(res, DUPLICATE_EMAIL, null, 409);
        }
        return sendError(res, error.message, null, 500);
    }
};

exports.updateEmployee = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid employee id", null, 400);

        const { error, values } = parseEmployeeBody(req.body, { isUpdate: true });
        if (error) return sendError(res, error, null, 400);

        const employee = await Employee.findByPk(id);
        if (!employee) return sendError(res, "Employee not found", null, 404);

        // Stop admins from locking themselves out
        if (employee.id === req.employee.id) {
            if (!values.isActive) return sendError(res, "You cannot deactivate your own account", null, 400);
            if (values.roleId !== employee.roleId) return sendError(res, "You cannot change your own role", null, 400);
        }

        const relationError = await validateRelations(values, employee);
        if (relationError) return sendError(res, relationError, null, 400);

        // Deactivating or changing the password ends the employee's current sessions
        if (values.password || (employee.isActive && !values.isActive)) {
            values.tokenInvalidatedAt = new Date();
            values.refreshToken = null;
        }

        await employee.update(values);
        const updated = await findEmployee(id);

        return sendSuccess(res, "Employee updated successfully", updated, 200);
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            return sendError(res, DUPLICATE_EMAIL, null, 409);
        }
        return sendError(res, error.message, null, 500);
    }
};

// Hard delete: the row is removed from the table permanently
exports.deleteEmployee = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid employee id", null, 400);

        if (id === req.employee.id) return sendError(res, "You cannot delete your own account", null, 400);

        const employee = await Employee.findByPk(id);
        if (!employee) return sendError(res, "Employee not found", null, 404);

        await employee.destroy({ force: true });

        return sendSuccess(res, "Employee deleted successfully", null, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};
