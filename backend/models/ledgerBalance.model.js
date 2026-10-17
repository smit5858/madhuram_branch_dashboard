const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// Income or expense balance of one branch (one row per module and branch, created on first use).
// Income and expense rows are separate, so changing one never touches the other.
//  - balance: the stored Total Balance. Update Balance recalculates it from the entries recorded
//    after the last reset (income also counts the branch's product sales); Reset sets it to 0.
//  - resetAfterEntryId / resetAfterSaleId: highest income / expense entry id (and, for income,
//    sale id) of the branch when it was last reset. Only later entries and sales count toward
//    the balance, so a reset keeps every entry and sale and a reload never brings the old total back.
// Every change locks this row, so concurrent updates and resets are applied one by one.
const LedgerBalance = sequelize.define(
    "LedgerBalance",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        // "income" or "expense"
        kind: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        branchId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        balance: {
            type: DataTypes.DECIMAL(16, 2),
            allowNull: false,
            defaultValue: 0,
        },
        resetAfterEntryId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        // Income only; stays 0 for expenses
        resetAfterSaleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        resetAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        resetBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        balanceUpdatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        balanceUpdatedBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        tableName: "ledger_balance",
        timestamps: true,
        indexes: [{ unique: true, fields: ["kind", "branchId"] }],
    },
)

module.exports = LedgerBalance;
