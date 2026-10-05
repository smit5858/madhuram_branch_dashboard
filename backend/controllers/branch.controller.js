const { Op } = require("sequelize");
const { sendError, sendSuccess } = require("@/helper/response");
const { Branch } = require("@/models/index");

exports.branch = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.max(parseInt(req.query.pageSize, 10) || 10, 1);
        const offset = (page - 1) * pageSize;

        const where = {};

        const search = req.query.search?.trim();
        if (search) {
            where.name = { [Op.like]: `%${search}%` };
        }

        // status: "active" | "inactive" (also accepts "true" | "false")
        const status = req.query.status?.toLowerCase();
        if (status === "active" || status === "true") where.isActive = true;
        else if (status === "inactive" || status === "false") where.isActive = false;

        const { count, rows } = await Branch.findAndCountAll({
            where,
            order: [["id", "DESC"]],
            limit: pageSize,
            offset,
        });

        const data = {
            branch: rows,
            pagination: {
                total: count,
                page,
                pageSize,
                totalPages: Math.ceil(count / pageSize),
            },
        };

        return sendSuccess(res, "All Branches...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Validates and normalises the body shared by create and update.
// Returns { error } or { values }.
const parseBranchBody = (body) => {
    const { name, address, isActive } = body || {};

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) return { error: "Branch name is required" };
    if (trimmedName.length > 255) return { error: "Branch name must be at most 255 characters" };

    const trimmedAddress = typeof address === "string" ? address.trim() : "";
    if (trimmedAddress.length > 500) return { error: "Address must be at most 500 characters" };

    if (isActive !== undefined && typeof isActive !== "boolean") {
        return { error: "isActive must be true or false" };
    }

    return {
        values: {
            name: trimmedName,
            address: trimmedAddress || null,
            isActive: isActive ?? true,
        },
    };
};

const parseId = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

exports.createBranch = async (req, res) => {
    try {
        const { error, values } = parseBranchBody(req.body);
        if (error) return sendError(res, error, null, 400);

        const branch = await Branch.create(values);

        return sendSuccess(res, "Branch created successfully", branch, 201);
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            return sendError(res, "A branch with this name already exists", null, 409);
        }
        return sendError(res, error.message, null, 500);
    }
};

exports.updateBranch = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid branch id", null, 400);

        const { error, values } = parseBranchBody(req.body);
        if (error) return sendError(res, error, null, 400);

        const branch = await Branch.findByPk(id);
        if (!branch) return sendError(res, "Branch not found", null, 404);

        await branch.update(values);

        return sendSuccess(res, "Branch updated successfully", branch, 200);
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            return sendError(res, "A branch with this name already exists", null, 409);
        }
        return sendError(res, error.message, null, 500);
    }
};

// Hard delete: the row is removed from the table permanently
exports.deleteBranch = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid branch id", null, 400);

        const branch = await Branch.findByPk(id);
        if (!branch) return sendError(res, "Branch not found", null, 404);

        await branch.destroy({ force: true });

        return sendSuccess(res, "Branch deleted successfully", null, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};
