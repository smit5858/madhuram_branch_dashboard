const { DataTypes } = require('sequelize')

// Columns shared by the income and expense tables. Both are plain money entries owned by one
// branch; expenses also record how they were paid.
const ledgerFields = ({ withPaymentMethod = false } = {}) => ({
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
    amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
    },
    // One of the fixed categories in helper/ledger.js
    category: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING(1000),
        allowNull: true,
    },
    ...(withPaymentMethod && {
        paymentMethod: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
    }),
    // Employee who added the entry; cleared if that employee is deleted
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
});

// A function, not a shared array: Sequelize writes each index's generated name back onto the
// object, so a shared one would give the second table the first table's index names
const ledgerIndexes = () => [{ fields: ["branchId", "entryDate"] }, { fields: ["entryDate"] }];

module.exports = { ledgerFields, ledgerIndexes };
