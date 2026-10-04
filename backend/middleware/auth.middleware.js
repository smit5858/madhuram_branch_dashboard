const { sendError } = require("@/helper/response");
const { verifyAccessToken } = require("@/helper/token");
const { Employee } = require("@/models");

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
