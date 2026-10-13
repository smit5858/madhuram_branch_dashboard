require("module-alias/register");
const { DataTypes, Op } = require("sequelize");
const sequelize = require("@/config/db");
const { Customer, Sale } = require("@/models/index");
const { normalizePhone } = require("@/helper/customer");

// sequelize.sync() only creates missing tables, it never adds columns to an existing one, so
// customer support is set up here. Safe to run more than once:
//  - the customer table (unique phone number)
//  - sale.customerId (FK to customer.id, cleared when the customer is deleted) and its index
//  - links existing sales to customers by phone number. Sales with the same number share one
//    customer, named after that number's most recent sale; numbers already saved as a customer
//    reuse it. Sales that are already linked are left alone.
const addCustomers = async () => {
    try {
        await sequelize.authenticate();
        const queryInterface = sequelize.getQueryInterface();

        // Creates customer only when it doesn't exist yet
        await Customer.sync();
        console.log("customer table ready");

        const saleColumns = await queryInterface.describeTable("sale");
        if (!saleColumns.customerId) {
            await queryInterface.addColumn("sale", "customerId", {
                type: DataTypes.INTEGER,
                allowNull: true,
                after: "productName",
                references: { model: "customer", key: "id" },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            });
            console.log("Added column sale.customerId");
        }

        const indexes = await queryInterface.showIndex("sale");
        if (!indexes.some((index) => index.fields.length === 1 && index.fields[0].attribute === "customerId")) {
            await queryInterface.addIndex("sale", ["customerId"]);
            console.log("Added index on sale.customerId");
        }

        const linked = await sequelize.transaction(async (transaction) => {
            const sales = await Sale.findAll({
                where: { customerId: { [Op.is]: null } },
                attributes: ["id", "customerName", "customerPhone"],
                order: [["saleDate", "DESC"], ["id", "DESC"]],
                transaction,
            });

            // Newest sale first, so the first name seen for a number is its latest one
            const byPhone = new Map();
            for (const sale of sales) {
                const phone = normalizePhone(sale.customerPhone);
                if (!phone) continue;
                if (!byPhone.has(phone)) byPhone.set(phone, { name: sale.customerName.trim(), ids: [] });
                byPhone.get(phone).ids.push(sale.id);
            }

            let count = 0;
            for (const [phone, { name, ids }] of byPhone) {
                const [customer] = await Customer.findOrCreate({ where: { phone }, defaults: { name, phone }, transaction });
                await Sale.update({ customerId: customer.id }, { where: { id: ids }, transaction });
                count += ids.length;
            }
            return { count, customers: byPhone.size };
        });
        console.log(`Linked ${linked.count} existing sale(s) to ${linked.customers} customer(s)`);
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

addCustomers();
