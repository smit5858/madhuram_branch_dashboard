require("module-alias/register");
const sequelize = require("@/config/db");
const { Op } = require("sequelize");
const { Sale, ProductSerial, Product, ProductPurchase, SerialUnit, SerialEvent, SaleReturn } = require("@/models/index");
const { UNIT_STATUS, ensureUnits } = require("@/helper/serialHistory");

// Serial number tracking: creates product_purchase, serial_unit, serial_event and sale_return
// when they don't exist yet, then gives every serial number recorded before tracking its
// permanent record:
//  - serial numbers on a sale -> Sold, with that sale as the first row of their history
//  - serial numbers in stock  -> Available, with an Opening Stock row
// Serial numbers that already have a record are left as they are, so this is safe to run more
// than once. Nothing in product, product_serial, product_stock or sale is changed.
// (The app also creates a missing record on first use, so this only makes old data show up in
// Serial Tracking right away.)
const BATCH = 200;

const addSerialTracking = async () => {
    try {
        await sequelize.authenticate();
        for (const Model of [ProductPurchase, SerialUnit, SerialEvent, SaleReturn]) {
            await Model.sync();
            console.log(`${Model.tableName} table ready`);
        }

        let sold = 0;
        const sales = await Sale.findAll({ where: { serialNumbers: { [Op.ne]: null } }, order: [["saleDate", "ASC"], ["id", "ASC"]] });
        for (let i = 0; i < sales.length; i += BATCH) {
            await sequelize.transaction(async (transaction) => {
                for (const sale of sales.slice(i, i + BATCH)) {
                    if (sale.serialNumbers.length === 0) continue;
                    const before = await SerialUnit.count({ where: { serialNumber: sale.serialNumbers }, transaction });
                    await ensureUnits(sale.serialNumbers, { kind: "sale", sale }, { transaction });
                    sold += sale.serialNumbers.length - before;
                }
            });
        }
        console.log(`Sold serial numbers registered: ${sold}`);

        let inStock = 0;
        const stock = await ProductSerial.findAll({ include: [{ model: Product, attributes: ["name"] }], order: [["id", "ASC"]] });
        for (let i = 0; i < stock.length; i += BATCH) {
            await sequelize.transaction(async (transaction) => {
                for (const row of stock.slice(i, i + BATCH)) {
                    const existing = await SerialUnit.findOne({ where: { serialNumber: row.serialNumber }, transaction });
                    if (existing) {
                        // In stock wins: the unit is physically there
                        if (existing.status !== UNIT_STATUS.AVAILABLE) {
                            await existing.update({ status: UNIT_STATUS.AVAILABLE, branchId: row.branchId, currentSaleId: null }, { transaction });
                        }
                        continue;
                    }
                    await ensureUnits([row.serialNumber], { kind: "stock", productId: row.productId, productName: row.Product?.name ?? "", branchId: row.branchId }, { transaction });
                    inStock++;
                }
            });
        }
        console.log(`In-stock serial numbers registered: ${inStock}`);
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await sequelize.close();
    }
};

addSerialTracking();
