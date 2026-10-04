const { checkPassword } = require("@/helper/common");
const { sendError, sendSuccess } = require("@/helper/response");
const { Employee, Roles } = require("@/models");
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require("@/helper/token");

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (!email || !password) {
            return sendError(res, "Email and password are required", null, 400);
        }

        const employee = await Employee.findOne({
            where: { email }, include: { model: Roles },
        });

        if (!employee || !employee.isActive || employee.deletedAt || (employee.Role && !employee.Role.isActive)) {
            return sendError(res, "Invalid credentials", null, 401);
        }

        const isValid = checkPassword(password, employee.password);
        if (!isValid) {
            return sendError(res, "Invalid credentials", null, 401);
        }

        const roleName = employee.Role ? employee.Role.name : null;

        const payload = {
            id: employee.id,
            email: employee.email,
            roleId: employee.roleId,
            roleName: roleName,
        };

        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken({ id: employee.id });

        await employee.update({ refreshToken });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        const data = {
            accessToken,
            refreshToken,
            employee: {
                id: employee.id,
                name: employee.name,
                email: employee.email,
                roleId: employee.roleId,
                roleName: roleName,
                allowedBranch: employee.allowedBranch || null,
            },
        };

        return sendSuccess(res, "Login successful", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

exports.logout = async (req, res) => {
    try {
        if (req.employee && req.employee.id) {
            await Employee.update(
                { tokenInvalidatedAt: new Date(), refreshToken: null },
                { where: { id: req.employee.id } },
            );
        }

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: false,
            sameSite: "strict",
        });

        return sendSuccess(res, "Logout successful", null, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

exports.refreshToken = async (req, res) => {
    try {
        const token = (req.cookies && req.cookies.refreshToken) || (req.body && req.body.refreshToken) || (req.headers.authorization && req.headers.authorization.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);

        if (!token) {
            return sendError(res, "Refresh token is required", null, 401);
        }

        let decoded;

        try {
            decoded = verifyRefreshToken(token);
        } catch (error) {
            return sendError(res, "Invalid or expired refresh token", null, 401);
        }

        const employee = await Employee.findByPk(decoded.id,{
            include: {model: role}
        });

        if (!employee || !employee.isActive || employee.deletedAt || (employee.Role && !employee.Role.isActive)) {
            return sendError(res, "employee no longer active or exists", null, 401);
        }

        if (employee.tokenInvalidatedAt) {
            const tokenIssuedAt = (decoded.iat || 0) * 1000;
            if (tokenIssuedAt < employee.tokenInvalidatedAt.getTime()) {
                return sendError(res, "Session revoked", null, 401);
            }
        }

        if (employee.refreshToken && employee.refreshToken !== token) {
            return sendError(res, "Refresh token revoked or mismatched", null, 401);
        }
            
        const roleName = employee.Role ? employee.Role.name : null;
        const payload = {
            id: employee.id,
            email: employee.email,
            roleId: employee.roleId,
            roleName: roleName,
        };

        const newAccessToken = generateAccessToken(payload);
        const newRefreshToken = generateRefreshToken({ id: employee.id });

        await employee.update({ refreshToken: newRefreshToken });

        if (res.cookie) {
            res.cookie("refreshToken", newRefreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
        }

        const data = {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        }

        return sendSuccess(res, "Token refress ...", data, 200)
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
}