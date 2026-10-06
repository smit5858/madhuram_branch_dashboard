require("module-alias/register");
const { DataTypes } = require("sequelize");
const sequelize = require("@/config/db");
const { ProductSerial } = require("@/models/index");

// sequelize.sync() only creates missing tables, it never adds columns to an existing one, so
// per-unit serial number support is set up here. Safe to run more than once:
//  - product.hasSerialNumber (and drops the short-lived product.serialNumber column if present)
//  - sale.serialNumbers
//  - the product_serial table
const addProductSerialNumbers = async () => {
    try {
        await sequelize.authenticate();
        const queryInterface = sequelize.getQueryInterface();

        const productColumns = await queryInterface.describeTable("product");
        if (productColumns.serialNumber) {
            const indexes = await queryInterface.showIndex("product");
            for (const index of indexes) {
                if (!index.primary && index.fields.some((f) => f.attribute === "serialNumber")) {
                    await queryInterface.removeIndex("product", index.name);
                }
            }
            await queryInterface.removeColumn("product", "serialNumber");
            console.log("Removed column product.serialNumber");
        }
        if (!productColumns.hasSerialNumber) {
            await queryInterface.addColumn("product", "hasSerialNumber", {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
                after: "name",
            });
            console.log("Added column product.hasSerialNumber");
        }

        const saleColumns = await queryInterface.describeTable("sale");
        if (!saleColumns.serialNumbers) {
            await queryInterface.addColumn("sale", "serialNumbers", {
                type: DataTypes.TEXT,
                allowNull: true,
                after: "productName",
            });
            console.log("Added column sale.serialNumbers");
        }

        // Creates product_serial only when it doesn't exist yet
        await ProductSerial.sync();
        console.log("product_serial table ready");
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

addProductSerialNumbers();
