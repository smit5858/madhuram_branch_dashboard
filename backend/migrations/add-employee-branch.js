require("module-alias/register");
const { DataTypes } = require("sequelize");
const sequelize = require("@/config/db");

// sequelize.sync() only creates missing tables, it never adds columns to an existing one,
// so the new employee.branchId column (FK to branch.id) is added here. Safe to run more than once.
const addEmployeeBranch = async () => {
    try {
        await sequelize.authenticate();
        const queryInterface = sequelize.getQueryInterface();
        const columns = await queryInterface.describeTable("employee");

        if (columns.branchId) {
            console.log("employee.branchId already exists, nothing to do");
            return;
        }

        await queryInterface.addColumn("employee", "branchId", {
            type: DataTypes.INTEGER,
            allowNull: true,
            after: "phone",
            references: { model: "branch", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });
        console.log("Added column employee.branchId");
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

addEmployeeBranch();
