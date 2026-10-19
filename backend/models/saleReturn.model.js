const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// A customer bringing back one serial-tracked unit of a sale. The sale itself is never changed:
// the return points at it, and that sale can no longer be edited or deleted. Customer, product
// and sale details are copied in so the return still reads correctly later.
//
// status:
//  - Pending: received, waiting for an admin's decision; the unit can't be sold
//  - Accepted: back in stock at branchId and available for resale
//  - Not Resellable: refund stands, but the unit is written off and kept out of stock
//  - Rejected: return refused, the unit stays with the customer and the refund doesn't count
const SaleReturn = sequelize.define(
    "SaleReturn",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        saleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        serialUnitId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        serialNumber: {
            type: DataTypes.STRING(100),
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
        // Branch of the original sale
        saleBranchId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        saleBranchName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Branch receiving the unit
        branchId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        branchName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        customerId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        customerName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        customerPhone: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        saleDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        // This unit's share of the original sale amount
        saleAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
        },
        returnDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        reason: {
            type: DataTypes.STRING(500),
            allowNull: false,
        },
        // One of RETURN_CONDITIONS in helper/serialHistory.js
        condition: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
        refundAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: "Pending",
        },
        // The unit's status when it was returned (Sold, or Installed / Active for licenses);
        // a rejected return puts it back
        unitStatusBefore: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },
        decisionNote: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        decidedBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        decidedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        tableName: "sale_return",
        timestamps: true,
        indexes: [{ fields: ["saleId"] }, { fields: ["serialUnitId"] }, { fields: ["status"] }, { fields: ["returnDate"] }],
    },
)

module.exports = SaleReturn;
