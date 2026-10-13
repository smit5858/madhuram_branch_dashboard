const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// Shared customer directory, used by every branch. A customer is identified by phone number:
// stored normalised to E.164 ("+919876543210") and unique, so the same number can never be
// saved twice, even by two requests at once. Phone is optional (MySQL allows many NULLs in a
// unique index); customers without one are never matched by name alone.
const Customer = sequelize.define(
    "Customer",
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
        phone: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        address: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        pincode: {
            type: DataTypes.STRING(10),
            allowNull: true,
        },
        city: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        // Company / shop / garage name
        companyName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Employee who added the customer
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        tableName: "customer",
        timestamps: true,
        indexes: [
            { unique: true, fields: ["phone"] },
            { fields: ["name"] },
        ],
    },
)

module.exports = Customer;
