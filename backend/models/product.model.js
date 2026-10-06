const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// Shared product catalogue. Quantities live per branch in product_stock.
const Product = sequelize.define(
    "Product",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        "name": {
            type: DataTypes.STRING,
            allowNull: false,
        },
        // Each unit of a serial-tracked product has its own serial number (see product_serial).
        // Chosen when the product is first added.
        hasSerialNumber: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
    },
    {
        tableName: "product",
        timestamps: true,
        indexes: [{ unique: true, fields: ["name"] }],
    },
)

module.exports = Product;
