const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// Permanent record of one serial number: one row per serial number ever registered, never
// deleted. product_serial still holds only the units in stock (and drives stock counts); this
// row carries the unit's current status and links its full history (serial_event).
//
// status:
//  - Available: in stock at branchId (a product_serial row exists)
//  - Sold: with the customer of currentSaleId
//  - Returned: brought back against currentSaleId, waiting for an admin's decision
//  - Not Resellable: return accepted but the unit was written off (kept out of stock)
//  - Removed: taken out of stock without a sale (stock edit or product deleted)
// Software licenses and Service installations (productType) have no product_serial row. An
// Available license is in its branch's license pool; once sold it can also be:
//  - Installed: installed on the customer's device, not activated yet (Services end here)
//  - Active: activated; shown as Expired once expiryDate has passed (never stored)
//  - Cancelled: deactivated / cancelled; never reused unless released again by an admin
const SerialUnit = sequelize.define(
    "SerialUnit",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        serialNumber: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        // Cleared if the product is removed from the catalogue; productName keeps the name
        productId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        productName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
        // Branch holding the unit, or the branch of its last sale / return
        branchId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        // Sale the unit currently belongs to (Sold / Returned); null otherwise
        currentSaleId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        // The product's type when the unit was registered (kept if the product is removed):
        // Serialized, Software or Service
        productType: {
            type: DataTypes.STRING(30),
            allowNull: false,
            defaultValue: "Serialized",
        },
        // Software / Service: current installation, activation and validity
        installationDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        activationDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        // Last day the license is valid; an Active license past it shows as Expired
        expiryDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        deviceName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        technicianName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        tableName: "serial_unit",
        timestamps: true,
        indexes: [
            // One record per serial number, across every product and branch
            { unique: true, fields: ["serialNumber"] },
            { fields: ["productId"] },
            { fields: ["status"] },
            { fields: ["branchId"] },
            { fields: ["productType", "status"] },
            { fields: ["expiryDate"] },
        ],
    },
)

module.exports = SerialUnit;
