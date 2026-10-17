const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// One product row of a Rajkot Expense entry. productName and hasSerialNumber keep the product's
// details at the time, so the row still reads correctly if the product is later removed.
// Serial-tracked rows list their units in rajkot_expense_serial; quantity equals their number.
const RajkotExpenseItem = sequelize.define(
    "RajkotExpenseItem",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        rajkotExpenseId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        productName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        hasSerialNumber: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        quantity: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
        },
    },
    {
        tableName: "rajkot_expense_item",
        timestamps: true,
        indexes: [{ fields: ["rajkotExpenseId"] }, { fields: ["productId"] }],
    },
)

module.exports = RajkotExpenseItem;
