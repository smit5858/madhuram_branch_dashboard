require("module-alias/register");
const sequelize = require("@/config/db");
const { Income, Expense } = require("@/models/index");

// Creates the income and expense tables (with their indexes and foreign keys to branch and
// employee) when they don't exist yet. Existing tables are left untouched, so this is safe to
// run more than once. server.js's sequelize.sync() would also create them on start; this
// script lets the tables be set up ahead of a deploy.
const addIncomeExpense = async () => {
    try {
        await sequelize.authenticate();
        await Income.sync();
        console.log("income table ready");
        await Expense.sync();
        console.log("expense table ready");
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

addIncomeExpense();
