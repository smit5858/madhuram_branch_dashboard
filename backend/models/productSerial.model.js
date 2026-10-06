const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// One in-stock unit of a serial-tracked product in one branch. Selling the unit removes its
// row (the serial number moves to the sale); deleting or editing that sale puts it back.
// For these products the branch's product_stock.quantity always equals its number of rows here.
const ProductSerial = sequelize.define(
    "ProductSerial",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        branchId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        serialNumber: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
    },
    {
        tableName: "product_serial",
        timestamps: true,
        indexes: [
            // A serial number is in stock at most once, across every product and branch
            { unique: true, fields: ["serialNumber"] },
            { fields: ["productId", "branchId"] },
        ],
    },
)

module.exports = ProductSerial;
