const { sendError } = require("@/helper/response");
const { verifyAccessToken } = require("@/helper/token");
const { Employee, Roles } = require("@/models");

exports.authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || "";
        const [scheme, token] = authHeader.split(" ");

        if (scheme !== "Bearer" || !token) {
            return sendError(res, "Access token missing", null, 401);
        }

        let decoded;
        try {
            decoded = verifyAccessToken(token);
        } catch (err) {
            return sendError(res, "Invalid or expired token", null, 401);
        }

        const employee = await Employee.findByPk(decoded.id);
        if (!employee || !employee.isActive || employee.deletedAt) {
            return sendError(res, "Unauthorized", null, 401);
        }

        // Token issued before logout is no longer valid
        if (
            employee.tokenInvalidatedAt &&
            decoded.iat * 1000 < employee.tokenInvalidatedAt.getTime()
        ) {
            return sendError(res, "Session expired, please login again", null, 401);
        }

        req.employee = employee;
        next();
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Lower-cased name of the employee's role, or null when it has none or it is inactive
const getActiveRoleName = async (employee) => {
    const role = employee?.roleId ? await Roles.findByPk(employee.roleId) : null;
    return role && role.isActive ? role.name.toLowerCase() : null;
};

// Use after authenticate. Allows the request only when the employee's role name
// matches one of the given roles (case-insensitive), e.g. authorize("admin").
exports.authorize = (...roles) => async (req, res, next) => {
    try {
        const roleName = await getActiveRoleName(req.employee);

        if (!roleName || !roles.map((r) => r.toLowerCase()).includes(roleName)) {
            return sendError(res, "You do not have permission to perform this action", null, 403);
        }

        next();
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Use after authenticate. Sets req.branchScope = { isAdmin, branchId } from the logged-in
// employee's record, never from the request: admins can reach every branch (branchId null),
// everyone else only their assigned branch.
exports.loadBranchScope = async (req, res, next) => {
    try {
        const isAdmin = (await getActiveRoleName(req.employee)) === "admin";

        if (!isAdmin && !req.employee.branchId) {
            return sendError(res, "Your account is not assigned to a branch. Contact your administrator.", null, 400);
        }

        req.branchScope = { isAdmin, branchId: isAdmin ? null : req.employee.branchId };
        next();
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};
