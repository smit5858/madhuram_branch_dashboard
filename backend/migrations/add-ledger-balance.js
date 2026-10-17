require("module-alias/register");
const sequelize = require("@/config/db");
const { LedgerBalance } = require("@/models/index");

// Creates the ledger_balance table (income and expense Total Balance per branch, with its unique
// index and foreign key to branch) when it doesn't exist yet. Existing tables are left untouched,
// so this is safe to run more than once. No income, expense or sale rows are changed: a branch
// without a balance row shows its full total until its balance is first updated or reset.
// server.js's sequelize.sync() would also create it on start; this script lets the table be set
// up ahead of a deploy.
const addLedgerBalance = async () => {
    try {
        await sequelize.authenticate();
        await LedgerBalance.sync();
        console.log(`${LedgerBalance.tableName} table ready`);
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

addLedgerBalance();
