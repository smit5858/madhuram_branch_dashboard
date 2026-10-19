const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// One money transfer from one branch to another (e.g. Pune pays Rajkot). It is a single row, so
// the paying branch's "sent" and the receiving branch's "received" totals both come from it and a
// transfer is never counted twice company-wide. Branch payments are kept apart from sales,
// income, expenses and every other money module.
//
// status (helper/branchPayment.js):
//  - Pending: recorded, not yet confirmed. Not counted in sent / received totals.
//  - Completed: confirmed by an admin or the receiving branch. The only status that counts.
//  - Cancelled: kept for the record, never counted. Final.
// Rows are never deleted; every change is written to branch_payment_event.
const BranchPayment = sequelize.define(
    "BranchPayment",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        paymentDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        // Paying (sending) branch
        fromBranchId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        // Receiving branch
        toBranchId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        amount: {
            type: DataTypes.DECIMAL(14, 2),
            allowNull: false,
        },
        paymentMethod: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
        // Transaction / UTR / cheque number
        referenceNumber: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: "Pending",
        },
        notes: {
            type: DataTypes.STRING(1000),
            allowNull: true,
        },
        // Sent by the form once per submission; a repeated submit with the same key returns the
        // payment already saved instead of adding a second one
        requestKey: {
            type: DataTypes.STRING(64),
            allowNull: true,
        },
        // Employees are links only; deleting an employee clears them, the payment stays
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        updatedBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        completedBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        completedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        cancelledBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        cancelledAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        cancelReason: {
            type: DataTypes.STRING(1000),
            allowNull: true,
        },
    },
    {
        tableName: "branch_payment",
        timestamps: true,
        indexes: [
            { unique: true, fields: ["requestKey"] },
            { fields: ["fromBranchId", "paymentDate"] },
            { fields: ["toBranchId", "paymentDate"] },
            { fields: ["status", "paymentDate"] },
            { fields: ["paymentDate"] },
            { fields: ["referenceNumber"] },
        ],
    },
)

module.exports = BranchPayment;
