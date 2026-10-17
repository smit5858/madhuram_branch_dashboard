const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// A serial number recorded on a Rajkot Expense product row. The unique index means a unit can
// be on at most one Rajkot Expense entry, even when two entries are saved at the same moment.
const RajkotExpenseSerial = sequelize.define(
    "RajkotExpenseSerial",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        rajkotExpenseItemId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        serialNumber: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
    },
    {
        tableName: "rajkot_expense_serial",
        timestamps: true,
        indexes: [{ unique: true, fields: ["serialNumber"] }, { fields: ["rajkotExpenseItemId"] }],
    },
)

module.exports = RajkotExpenseSerial;
