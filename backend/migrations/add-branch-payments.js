require("module-alias/register");
const sequelize = require("@/config/db");
const { BranchPayment, BranchPaymentEvent } = require("@/models/index");

// Creates the Branch Payments tables (branch_payment and its audit trail branch_payment_event)
// with their indexes and foreign keys when they don't exist yet. Existing tables are left
// untouched, so this is safe to run more than once. Nothing in other tables is changed.
const addBranchPayments = async () => {
    try {
        await sequelize.authenticate();
        for (const Model of [BranchPayment, BranchPaymentEvent]) {
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

addBranchPayments();
