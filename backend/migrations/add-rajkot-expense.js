require("module-alias/register");
const sequelize = require("@/config/db");
const { RajkotExpense, RajkotExpenseItem, RajkotExpenseSerial, RajkotExpenseCounter } = require("@/models/index");

// Creates the Rajkot Expense tables (with their indexes and foreign keys) when they don't exist
// yet, parents before children. Existing tables are left untouched, so this is safe to run more
// than once. server.js's sequelize.sync() would also create them on start; this script lets
// the tables be set up ahead of a deploy.
const addRajkotExpense = async () => {
    try {
        await sequelize.authenticate();
        for (const Model of [RajkotExpense, RajkotExpenseItem, RajkotExpenseSerial, RajkotExpenseCounter]) {
            await Model.sync();
            console.log(`${Model.tableName} table ready`);
        }
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

addRajkotExpense();
