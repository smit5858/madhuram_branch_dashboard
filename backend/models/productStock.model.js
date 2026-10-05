const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// Stock of one product in one branch. A product has at most one row per branch.
const ProductStock = sequelize.define(
    "ProductStock",
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
        quantity: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
        },
    },
    {
        tableName: "product_stock",
        timestamps: true,
        indexes: [{ unique: true, fields: ["productId", "branchId"] }],
    },
)

module.exports = ProductStock;
