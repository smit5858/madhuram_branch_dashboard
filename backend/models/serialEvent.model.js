const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// One entry in a serial number's history. Rows are only ever added, never edited or deleted, so
// the purchase, every sale, return, refund, transfer and cancellation stays visible. Names and
// amounts are copied in as they were at the time; ids (branch, sale, return, purchase) are links
// without foreign keys so the history survives a deleted branch, sale or product.
//
// type: one of EVENT in helper/serialHistory.js
const SerialEvent = sequelize.define(
    "SerialEvent",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        serialUnitId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
        eventDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        branchId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        branchName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Branch Transfer only: where the unit went
        toBranchId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        toBranchName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        // Supplier / dealer for purchases, customer for sales and returns
        partyName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        customerId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        customerPhone: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        purchaseAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        // This unit's share of the sale amount
        sellingAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        refundAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        // Invoice / reference number shown in the history (supplier invoice, SALE-…, RET-…, RE-…)
        reference: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        purchaseId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        saleId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        saleReturnId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        // The unit's status right after this event
        status: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
        note: {
            type: DataTypes.STRING(1000),
            allowNull: true,
        },
        // Licenses: validity after this event (activation, installation or renewal)
        expiryDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        // Installations: where and by whom
        deviceName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        technicianName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        tableName: "serial_event",
        timestamps: true,
        updatedAt: false,
        indexes: [
            { fields: ["serialUnitId", "eventDate"] },
            { fields: ["type"] },
            { fields: ["saleId"] },
            { fields: ["eventDate"] },
        ],
    },
)

module.exports = SerialEvent;
