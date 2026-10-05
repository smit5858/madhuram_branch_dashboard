const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// One sale of a product from one branch's stock. productName keeps the name at the time of
// sale so the record still reads correctly if the product is later removed from the catalogue.
const Sale = sequelize.define(
    "Sale",
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
        productId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        productName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        customerName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        // E.164, as sent by the frontend PhoneInput ("+919876543210")
        customerPhone: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        quantity: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
        },
        // Final amount charged for the whole sale
        sellingAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
        },
        saleDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        // Employee who recorded the sale
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        tableName: "sale",
        timestamps: true,
        indexes: [{ fields: ["branchId", "saleDate"] }],
    },
)

module.exports = Sale;
