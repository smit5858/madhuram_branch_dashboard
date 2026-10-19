const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// Audit trail of a branch payment. Rows are only ever added, never edited or deleted, so who
// created, edited, completed or cancelled a payment, and what each edit changed, stays visible.
//
// action: Created / Updated / Completed / Cancelled
// changes: { field: { from, to } } for an edit; the full values for Created
const BranchPaymentEvent = sequelize.define(
    "BranchPaymentEvent",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        branchPaymentId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        action: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        statusBefore: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        statusAfter: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
        changes: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        // Reason for a cancellation or for correcting a completed payment
        note: {
            type: DataTypes.STRING(1000),
            allowNull: true,
        },
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        // Kept so the trail still names the employee after they are deleted
        createdByName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        tableName: "branch_payment_event",
        timestamps: true,
        updatedAt: false,
        indexes: [{ fields: ["branchPaymentId", "id"] }],
    },
)

module.exports = BranchPaymentEvent;
