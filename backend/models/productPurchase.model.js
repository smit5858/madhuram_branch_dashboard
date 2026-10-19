const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

// One purchase of serial-tracked units into one branch: added from the Products module (Add
// Product / Add Stock) or by accepting a Rajkot Expense entry. Each unit's serial_event of type
// Purchase links back here. productName, branchName and supplierName are kept as they were, so
// the record still reads correctly if the product or branch is later removed.
const ProductPurchase = sequelize.define(
    "ProductPurchase",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        productId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        productName: {
            type: DataTypes.STRING,
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
        // Supplier / dealer; null when it wasn't entered
        supplierName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        purchaseDate: {
            type: DataTypes.DATEONLY,
            allowNull: false,
        },
        // Cost of one unit; null when it wasn't entered
        unitAmount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
        },
        quantity: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        // Supplier invoice / reference number, if any
        reference: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        // "Products" or "Rajkot Expense"
        source: {
            type: DataTypes.STRING(30),
            allowNull: false,
        },
        rajkotExpenseId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        createdBy: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    },
    {
        tableName: "product_purchase",
        timestamps: true,
        indexes: [{ fields: ["productId"] }, { fields: ["purchaseDate"] }],
    },
)

module.exports = ProductPurchase;
