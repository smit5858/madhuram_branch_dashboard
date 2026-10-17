const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// Rajkot Expense count and balance of one branch (one row per branch, created on first use).
//  - count: number of entries accepted since the last reset. Reset sets it to 0 and touches
//    nothing else.
//  - balance: total amount of the branch's accepted entries. Acceptance adds to it; Update
//    Balance recalculates it from the accepted entries.
// Every change locks this row, so concurrent accepts, resets and updates are applied one by one.
const RajkotExpenseCounter = sequelize.define(
    "RajkotExpenseCounter",
    {
        branchId: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
        count: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
        balance: {
            type: DataTypes.DECIMAL(16, 2),
            allowNull: false,
            defaultValue: 0,
        },
        countResetAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        countResetBy: {
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
        tableName: "rajkot_expense_counter",
        timestamps: true,
    },
)

module.exports = RajkotExpenseCounter;
