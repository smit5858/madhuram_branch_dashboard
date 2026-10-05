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
    },
    {
        tableName: "product",
        timestamps: true,
        indexes: [{ unique: true, fields: ["name"] }],
    },
)

module.exports = Product;
