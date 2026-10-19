require("module-alias/register");
const { DataTypes } = require("sequelize");
const sequelize = require("@/config/db");
const { ProductPurchase, SerialUnit, SerialEvent, SaleReturn } = require("@/models/index");

// Product types (Standard / Serialized / Software / Service) and software license tracking.
// sequelize.sync() never adds columns to existing tables, so they are added here. Only adds
// columns and indexes; nothing is dropped or rewritten, and it is safe to run more than once.
//  - product.productType: existing products get Serialized (hasSerialNumber) or Standard
//  - product.licenseReassignable
//  - sale.saleType ("Sale", or "Renewal" for license renewals)
//  - serial_unit: productType, installationDate, activationDate, expiryDate, deviceName, technicianName
//  - serial_event: expiryDate, deviceName, technicianName
//  - sale_return.unitStatusBefore
// Run after migrate:serial-tracking (the serial tables are created here too if they are missing).
const addColumns = async (queryInterface, table, columns) => {
    const existing = await queryInterface.describeTable(table);
    const added = [];
    for (const [name, definition] of Object.entries(columns)) {
        if (existing[name]) continue;
        await queryInterface.addColumn(table, name, definition);
        added.push(name);
    }
    console.log(added.length ? `${table}: added ${added.join(", ")}` : `${table}: up to date`);
    return added;
};

const addIndex = async (queryInterface, table, fields) => {
    const indexes = await queryInterface.showIndex(table);
    const exists = indexes.some((index) => index.fields.map((f) => f.attribute).join() === fields.join());
    if (!exists) {
        await queryInterface.addIndex(table, fields);
        console.log(`${table}: index on ${fields.join(", ")}`);
    }
};

const addSoftwareLicenses = async () => {
    try {
        await sequelize.authenticate();
        const queryInterface = sequelize.getQueryInterface();
        // Missing tables get every column straight away. Existing ones are not synced: sync() would
        // try to add the model's new indexes before their columns exist.
        const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === "string" ? t : t.tableName).toLowerCase());
        for (const Model of [ProductPurchase, SerialUnit, SerialEvent, SaleReturn]) {
            if (!tables.includes(Model.tableName.toLowerCase())) {
                await Model.sync();
                console.log(`${Model.tableName}: created`);
            }
        }

        const productAdded = await addColumns(queryInterface, "product", {
            productType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "Standard", after: "hasSerialNumber" },
            licenseReassignable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, after: "productType" },
        });
        if (productAdded.includes("productType")) {
            const [result] = await sequelize.query("UPDATE product SET productType = 'Serialized' WHERE hasSerialNumber = 1");
            console.log(`product: ${result.affectedRows ?? 0} serial-tracked products set to Serialized`);
        }

        await addColumns(queryInterface, "sale", {
            saleType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Sale", after: "saleDate" },
        });

        await addColumns(queryInterface, "serial_unit", {
            productType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "Serialized" },
            installationDate: { type: DataTypes.DATEONLY, allowNull: true },
            activationDate: { type: DataTypes.DATEONLY, allowNull: true },
            expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
            deviceName: { type: DataTypes.STRING, allowNull: true },
            technicianName: { type: DataTypes.STRING, allowNull: true },
        });
        await addIndex(queryInterface, "serial_unit", ["productType", "status"]);
        await addIndex(queryInterface, "serial_unit", ["expiryDate"]);

        await addColumns(queryInterface, "serial_event", {
            expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
            deviceName: { type: DataTypes.STRING, allowNull: true },
            technicianName: { type: DataTypes.STRING, allowNull: true },
        });

        await addColumns(queryInterface, "sale_return", {
            unitStatusBefore: { type: DataTypes.STRING(30), allowNull: true },
        });
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

addSoftwareLicenses();
