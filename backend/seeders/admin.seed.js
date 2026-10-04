require("module-alias/register");
const sequelize = require("@/config/db");
const { Employee, Roles } = require("@/models");
const { hashPassword } = require("@/helper/common");

const seedAdmin = async () => {
    try {
        await sequelize.authenticate();
        await sequelize.sync();

        const [role] = await Roles.findOrCreate({
            where: { name: "Admin" },
            defaults: { isActive: true },
        });

        const [employee, created] = await Employee.findOrCreate({
            where: { email: "admin@madhuram.com" },
            defaults: {
                name: "Admin",
                password: hashPassword("Admin@123"),
                roleId: role.id,
                isActive: true,
            },
        });

        console.log(created ? "Admin created:" : "Admin already exists:", employee.email);
    } catch (error) {
        console.error("Seeding failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

seedAdmin();
