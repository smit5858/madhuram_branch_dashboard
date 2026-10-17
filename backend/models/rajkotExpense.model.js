const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// One Rajkot Expense entry: a list of products (rajkot_expense_item) recorded against one branch.
// It starts Pending; an employee of that branch accepts it once, which adds its units to the
// branch's expense count and its amount to the branch's balance (rajkot_expense_counter).
// Stock is never moved by an entry: products and serial numbers are only checked against the
// branch's stock when the entry is added.
const RajkotExpense = sequelize.define(
    "RajkotExpense",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        branchId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        entryDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        description: {
            type: DataTypes.STRING(1000),
            allowNull: true,
        },
        // "Pending" until the branch accepts it, then "Accepted" for good
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: "Pending",
        },
        // Units across every product row; added to the branch's count on acceptance
        totalQuantity: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        // Sum of the product rows' amounts; added to the branch's balance on acceptance
        totalAmount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
        },
        // Employee who added the entry; cleared if that employee is deleted
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        acceptedBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        acceptedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        tableName: "rajkot_expense",
        timestamps: true,
        indexes: [{ fields: ["branchId", "status"] }, { fields: ["entryDate"] }],
    },
)

module.exports = RajkotExpense;
