require("module-alias/register");
const { DataTypes } = require("sequelize");
const sequelize = require("@/config/db");

// sequelize.sync() only creates missing tables, it never adds columns to an existing one,
// so the new branch.address column is added here. Safe to run more than once.
const addBranchAddress = async () => {
    try {
        await sequelize.authenticate();
        const queryInterface = sequelize.getQueryInterface();
        const columns = await queryInterface.describeTable("branch");

        if (columns.address) {
            console.log("branch.address already exists, nothing to do");
            return;
        }

        await queryInterface.addColumn("branch", "address", {
            type: DataTypes.STRING(500),
            allowNull: true,
            after: "name",
        });
        console.log("Added column branch.address");
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

addBranchAddress();
