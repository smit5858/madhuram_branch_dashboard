const { sendError, sendSuccess } = require("@/helper/response");
const { Roles } = require("@/models/index");

// Active roles, for the role dropdown on the employee form
exports.role = async (req, res) => {
    try {
        const roles = await Roles.findAll({
            where: { isActive: true },
            attributes: ["id", "name"],
            order: [["name", "ASC"]],
        });

        return sendSuccess(res, "All Roles...", { role: roles }, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};
