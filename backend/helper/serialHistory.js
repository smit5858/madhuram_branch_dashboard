const { Op } = require("sequelize");
const { Branch, ProductSerial, SerialUnit, SerialEvent } = require("@/models/index");
const { PRODUCT_TYPE, serviceUnitPrefix } = require("@/helper/productType");

// Serial number lifecycle shared by Products, Sales, Rajkot Expense, Returns and transfers.
//
// product_serial keeps working exactly as before: it holds the units in stock and drives stock
// counts. Alongside it every serial number has one permanent serial_unit row (its current status
// and branch) and an append-only list of serial_event rows (its history). Every function here
// runs inside the caller's transaction, after the caller has taken its own locks, so stock, the
// unit's status and its history are always saved together or not at all.
//
// Serial numbers recorded before tracking started have no serial_unit yet. ensureUnits creates it
// on first use from what is known (in stock, or on a sale), so old data keeps working; the
// migration (migrations/add-serial-tracking.js) backfills them all up front.

const EVENT = {
    PURCHASE: "Purchase",
    OPENING: "Opening Stock",
    STOCK_ADDED: "Stock Added",
    SALE: "Sale",
    SALE_EDITED: "Sale Edited",
    SALE_CANCELLED: "Sale Cancelled",
    REMOVED_FROM_SALE: "Removed from Sale",
    RETURN: "Return",
    REFUND: "Refund",
    RETURN_ACCEPTED: "Return Accepted",
    RETURN_REJECTED: "Return Rejected",
    WRITTEN_OFF: "Written Off",
    TRANSFER: "Branch Transfer",
    REMOVED: "Removed from Stock",
    // Software licenses and Service installations
    INSTALLATION: "Installation",
    ACTIVATION: "Activation",
    RENEWAL: "Renewal",
    RENEWAL_CANCELLED: "Renewal Cancelled",
    CANCELLED: "Cancelled",
    RELEASED: "Released for Reassignment",
};

// Once a unit has any of these on a sale, the sale is part of the license's life and stays as it is
const LIFECYCLE_EVENTS = [EVENT.INSTALLATION, EVENT.ACTIVATION, EVENT.RENEWAL, EVENT.CANCELLED];

const UNIT_STATUS = {
    AVAILABLE: "Available",
    SOLD: "Sold",
    RETURNED: "Returned",
    NOT_RESELLABLE: "Not Resellable",
    REMOVED: "Removed",
    INSTALLED: "Installed",
    ACTIVE: "Active",
    CANCELLED: "Cancelled",
    // Never stored: an Active unit whose expiryDate has passed
    EXPIRED: "Expired",
};

// Statuses in which the unit is with the customer of its current sale
const HELD_STATUSES = [UNIT_STATUS.SOLD, UNIT_STATUS.INSTALLED, UNIT_STATUS.ACTIVE];

const SALE_TYPE = { SALE: "Sale", RENEWAL: "Renewal" };

const RETURN_STATUS = {
    PENDING: "Pending",
    ACCEPTED: "Accepted",
    NOT_RESELLABLE: "Not Resellable",
    REJECTED: "Rejected",
};

const RETURN_CONDITIONS = ["Unused / Sealed", "Good", "Opened / Used", "Damaged", "Defective"];

const pad = (n) => String(n).padStart(2, "0");
// Today as yyyy-MM-dd in the server's timezone
const localDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// The status shown: an Active license past its expiry date is Expired
const effectiveStatus = (unit, today = localDate()) =>
    unit.status === UNIT_STATUS.ACTIVE && unit.expiryDate && unit.expiryDate < today ? UNIT_STATUS.EXPIRED : unit.status;

// Clears a license's installation when it leaves its customer
const NO_INSTALLATION = { installationDate: null, activationDate: null, expiryDate: null, deviceName: null, technicianName: null };

const reference = (prefix, id) => `${prefix}-${String(id).padStart(5, "0")}`;
const saleReference = (id) => reference("SALE", id);
const returnReference = (id) => reference("RET", id);
const rajkotReference = (id) => reference("RE", id);

const paise = (n) => Math.round(Number(n) * 100);
const key = (serialNumber) => serialNumber.toLowerCase();

// A sale's amount split across its units in paise, so the shares always add up to the total:
// every unit gets the same share and the first ones take the leftover paise.
const allocateAmount = (total, count) => {
    if (count <= 0) return [];
    const totalPaise = paise(total);
    const base = Math.floor(totalPaise / count);
    const extra = totalPaise - base * count;
    return Array.from({ length: count }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
};

// This unit's share of a sale (sale.serialNumbers is the list the share is based on)
const shareOf = (sale, serialNumber) => {
    const list = sale.serialNumbers ?? [];
    const index = list.findIndex((sn) => key(sn) === key(serialNumber));
    if (index === -1) return null;
    return allocateAmount(sale.sellingAmount, list.length)[index];
};

// Plain copy of a sale, taken before it is edited
const saleSnapshot = (sale) => ({
    id: sale.id,
    branchId: sale.branchId,
    productId: sale.productId,
    productName: sale.productName,
    customerId: sale.customerId,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    serialNumbers: [...(sale.serialNumbers ?? [])],
    sellingAmount: Number(sale.sellingAmount),
    saleDate: sale.saleDate,
});

const branchNames = async (ids, transaction) => {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await Branch.findAll({ where: { id: unique }, attributes: ["id", "name"], raw: true, transaction });
    return new Map(rows.map((b) => [b.id, b.name]));
};

const saleEventFields = (sale, serialNumber, names) => ({
    branchId: sale.branchId,
    branchName: names.get(sale.branchId) ?? null,
    partyName: sale.customerName,
    customerId: sale.customerId ?? null,
    customerPhone: sale.customerPhone ?? null,
    sellingAmount: shareOf(sale, serialNumber),
    reference: saleReference(sale.id),
    saleId: sale.id,
});

// The units of these serial numbers, locked, keyed by lower-case serial number. Any without a
// serial_unit yet (recorded before tracking) are created from `origin`:
//  - { kind: "stock", productId, productName, branchId }: was in stock -> Available + Opening Stock
//  - { kind: "sale", sale }: was on this sale -> Sold + its Sale event
const ensureUnits = async (serials, origin, { transaction, employeeId = null } = {}) => {
    const units = new Map();
    if (serials.length === 0) return units;

    const found = await SerialUnit.findAll({ where: { serialNumber: serials }, transaction, lock: transaction.LOCK.UPDATE });
    for (const unit of found) units.set(key(unit.serialNumber), unit);

    const missing = serials.filter((sn) => !units.has(key(sn)));
    if (missing.length === 0) return units;

    const note = "Recorded before serial number tracking started";
    if (origin.kind === "stock") {
        const names = await branchNames([origin.branchId], transaction);
        for (const serialNumber of missing) {
            const unit = await SerialUnit.create({
                serialNumber, productId: origin.productId, productName: origin.productName,
                status: UNIT_STATUS.AVAILABLE, branchId: origin.branchId, productType: origin.productType ?? PRODUCT_TYPE.SERIALIZED,
            }, { transaction });
            await SerialEvent.create({
                serialUnitId: unit.id, type: EVENT.OPENING, eventDate: localDate(unit.createdAt),
                branchId: origin.branchId, branchName: names.get(origin.branchId) ?? null,
                status: UNIT_STATUS.AVAILABLE, note, createdBy: employeeId,
            }, { transaction });
            units.set(key(serialNumber), unit);
        }
    } else {
        const { sale } = origin;
        const names = await branchNames([sale.branchId], transaction);
        for (const serialNumber of missing) {
            const unit = await SerialUnit.create({
                serialNumber, productId: sale.productId, productName: sale.productName,
                status: UNIT_STATUS.SOLD, branchId: sale.branchId, currentSaleId: sale.id,
            }, { transaction });
            await SerialEvent.create({
                serialUnitId: unit.id, type: EVENT.SALE, eventDate: sale.saleDate,
                ...saleEventFields(sale, serialNumber, names),
                status: UNIT_STATUS.SOLD, note, createdBy: employeeId,
            }, { transaction });
            units.set(key(serialNumber), unit);
        }
    }
    return units;
};

// New stock: the units become Available at branchId. A serial number seen before (removed from
// stock earlier) keeps its record and history; a new one gets a record. `purchase` is the
// product_purchase row for purchases, null for other stock additions. `unitAmounts` (same order
// as serials) overrides purchase.unitAmount when a purchase total was split across the units.
// productType: Serialized for physical units (the caller adds their product_serial rows), Software for
// licenses (no product_serial row: they only join the branch's license pool).
const registerStock = async ({ serials, productId, productName, branchId, type, purchase = null, unitAmounts = null, eventDate, note = null, employeeId, transaction, productType = PRODUCT_TYPE.SERIALIZED }) => {
    if (serials.length === 0) return;
    const names = await branchNames([branchId], transaction);
    const existing = await SerialUnit.findAll({ where: { serialNumber: serials }, transaction, lock: transaction.LOCK.UPDATE });
    const byKey = new Map(existing.map((u) => [key(u.serialNumber), u]));

    const events = [];
    for (const [index, serialNumber] of serials.entries()) {
        const values = { productId, productName, status: UNIT_STATUS.AVAILABLE, branchId, currentSaleId: null, productType, ...NO_INSTALLATION };
        let unit = byKey.get(key(serialNumber));
        if (unit) await unit.update(values, { transaction });
        else unit = await SerialUnit.create({ serialNumber, ...values }, { transaction });

        events.push({
            serialUnitId: unit.id, type, eventDate: eventDate ?? localDate(),
            branchId, branchName: names.get(branchId) ?? null,
            partyName: purchase?.supplierName ?? null,
            purchaseAmount: unitAmounts ? unitAmounts[index] : purchase?.unitAmount ?? null,
            reference: purchase?.reference ?? null,
            purchaseId: purchase?.id ?? null,
            status: UNIT_STATUS.AVAILABLE, note, createdBy: employeeId,
        });
    }
    await SerialEvent.bulkCreate(events, { transaction });
};

// Units taken out of stock without a sale (a stock edit removed them, or the product was deleted)
const removeFromStock = async ({ serials, productId, productName, branchId, note, employeeId, transaction }) => {
    if (serials.length === 0) return;
    const units = await ensureUnits(serials, { kind: "stock", productId, productName, branchId }, { transaction, employeeId });
    const names = await branchNames([branchId], transaction);

    const events = [];
    for (const serialNumber of serials) {
        const unit = units.get(key(serialNumber));
        await unit.update({ status: UNIT_STATUS.REMOVED, branchId, currentSaleId: null }, { transaction });
        events.push({
            serialUnitId: unit.id, type: EVENT.REMOVED, eventDate: localDate(),
            branchId, branchName: names.get(branchId) ?? null,
            status: UNIT_STATUS.REMOVED, note, createdBy: employeeId,
        });
    }
    await SerialEvent.bulkCreate(events, { transaction });
};

// A sale took these units out of stock. Each gets a Sale event with its share of the amount.
const recordSale = async ({ sale, serials, employeeId, transaction }) => {
    if (serials.length === 0) return;
    const units = await ensureUnits(
        serials,
        { kind: "stock", productId: sale.productId, productName: sale.productName, branchId: sale.branchId },
        { transaction, employeeId },
    );
    const names = await branchNames([sale.branchId], transaction);

    const events = [];
    for (const serialNumber of serials) {
        const unit = units.get(key(serialNumber));
        await unit.update({
            status: UNIT_STATUS.SOLD, branchId: sale.branchId, currentSaleId: sale.id,
            productId: sale.productId, productName: sale.productName,
        }, { transaction });
        events.push({
            serialUnitId: unit.id, type: EVENT.SALE, eventDate: sale.saleDate,
            ...saleEventFields(sale, serialNumber, names),
            status: UNIT_STATUS.SOLD, createdBy: employeeId,
        });
    }
    await SerialEvent.bulkCreate(events, { transaction });
};

// Units that left a sale because it was deleted (SALE_CANCELLED) or edited (REMOVED_FROM_SALE).
// `sale` is the sale as it was before. Call after the stock has been put back:
//  - physical units in stock again are Available; ones that couldn't go back (product no longer
//    stocked) are Removed
//  - licenses go back into the sale branch's license pool (the sale was a correction; licenses
//    with an installation lock their sale, so they never get here)
//  - Service installations are Cancelled; their IDs are never reused
const releaseFromSale = async ({ sale, serials, type, employeeId, transaction }) => {
    if (serials.length === 0) return;
    const units = await ensureUnits(serials, { kind: "sale", sale }, { transaction, employeeId });
    const names = await branchNames([sale.branchId], transaction);
    const inStock = await ProductSerial.findAll({ where: { serialNumber: serials }, attributes: ["serialNumber", "branchId"], raw: true, transaction });
    const stockBranch = new Map(inStock.map((r) => [key(r.serialNumber), r.branchId]));

    const events = [];
    for (const serialNumber of serials) {
        const unit = units.get(key(serialNumber));
        let status;
        let branchId;
        let note;
        if (unit.productType === PRODUCT_TYPE.SOFTWARE) {
            status = UNIT_STATUS.AVAILABLE;
            branchId = sale.branchId;
            note = "License back in the branch's license pool";
        } else if (unit.productType === PRODUCT_TYPE.SERVICE) {
            status = UNIT_STATUS.CANCELLED;
            branchId = sale.branchId;
            note = "Installation cancelled with the sale";
        } else {
            branchId = stockBranch.get(key(serialNumber));
            status = branchId ? UNIT_STATUS.AVAILABLE : UNIT_STATUS.REMOVED;
            note = branchId ? "Back in stock" : "The product is no longer stocked in this branch, so the unit is out of stock";
            branchId = branchId ?? sale.branchId;
        }
        await unit.update({ status, branchId, currentSaleId: null, ...NO_INSTALLATION }, { transaction });
        events.push({
            serialUnitId: unit.id, type, eventDate: localDate(),
            ...saleEventFields(sale, serialNumber, names),
            status, note, createdBy: employeeId,
        });
    }
    await SerialEvent.bulkCreate(events, { transaction });
};

// Next `count` installation IDs of a Service sale (INS-00012-1, -2, ...). Numbering continues
// after every ID the sale ever had, so an ID cancelled in an edit is never handed out again.
const nextServiceIds = async (saleId, count, transaction) => {
    const prefix = serviceUnitPrefix(saleId);
    const used = await SerialUnit.count({ where: { serialNumber: { [Op.like]: `${prefix}%` } }, transaction });
    return Array.from({ length: count }, (_, i) => `${prefix}${used + i + 1}`);
};

// Registers the installation units of a Service sale (no stock): Sold, with the Sale in their history
const createServiceUnits = async ({ sale, serials, employeeId, transaction }) => {
    if (serials.length === 0) return;
    const names = await branchNames([sale.branchId], transaction);
    for (const serialNumber of serials) {
        const unit = await SerialUnit.create({
            serialNumber, productId: sale.productId, productName: sale.productName, productType: PRODUCT_TYPE.SERVICE,
            status: UNIT_STATUS.SOLD, branchId: sale.branchId, currentSaleId: sale.id,
        }, { transaction });
        await SerialEvent.create({
            serialUnitId: unit.id, type: EVENT.SALE, eventDate: sale.saleDate,
            ...saleEventFields(sale, serialNumber, names),
            status: UNIT_STATUS.SOLD, note: "Installation service sold", createdBy: employeeId,
        }, { transaction });
    }
};

// A sale kept these units but its amount, customer or date changed: one Sale Edited event each,
// with the new values. `before` is the sale as it was before the edit.
const recordSaleEdit = async ({ before, sale, serials, employeeId, transaction }) => {
    if (serials.length === 0) return;
    const units = await ensureUnits(serials, { kind: "sale", sale: before }, { transaction, employeeId });
    const names = await branchNames([sale.branchId], transaction);

    const events = [];
    for (const serialNumber of serials) {
        const changes = [];
        const oldShare = shareOf(before, serialNumber);
        const newShare = shareOf(sale, serialNumber);
        if (paise(oldShare) !== paise(newShare)) changes.push(`amount ${oldShare} → ${newShare}`);
        if (before.customerId !== sale.customerId || before.customerName !== sale.customerName) {
            changes.push(`customer ${before.customerName} → ${sale.customerName}`);
        }
        if (before.saleDate !== sale.saleDate) changes.push(`date ${before.saleDate} → ${sale.saleDate}`);
        if (changes.length === 0) continue;

        const unit = units.get(key(serialNumber));
        events.push({
            serialUnitId: unit.id, type: EVENT.SALE_EDITED, eventDate: localDate(),
            ...saleEventFields(sale, serialNumber, names),
            status: unit.status, note: `Sale edited: ${changes.join(", ")}`, createdBy: employeeId,
        });
    }
    if (events.length > 0) await SerialEvent.bulkCreate(events, { transaction });
};

// A renewal sale is being deleted. Its Renewal row stays in the history and a Renewal Cancelled
// row is added. If the license's expiry is still the one this renewal set, it goes back to the
// expiry before it (ignoring renewals that were themselves cancelled).
const cancelRenewal = async ({ sale, employeeId, transaction }) => {
    const unit = await SerialUnit.findOne({ where: { serialNumber: sale.serialNumbers[0] ?? "" }, transaction, lock: transaction.LOCK.UPDATE });
    if (!unit) return;
    const history = await SerialEvent.findAll({ where: { serialUnitId: unit.id }, order: [["id", "ASC"]], transaction });
    const renewal = history.find((e) => e.type === EVENT.RENEWAL && e.saleId === sale.id);
    const cancelled = new Set(history.filter((e) => e.type === EVENT.RENEWAL_CANCELLED).map((e) => e.saleId));
    cancelled.add(sale.id);

    let expiryDate = unit.expiryDate;
    let reverted = false;
    if (renewal && unit.expiryDate === renewal.expiryDate) {
        reverted = true;
        const earlier = history.filter((e) => e.id < renewal.id && e.expiryDate && !(e.type === EVENT.RENEWAL && cancelled.has(e.saleId)));
        expiryDate = earlier.at(-1)?.expiryDate ?? null;
        await unit.update({ expiryDate }, { transaction });
    }
    const names = await branchNames([sale.branchId], transaction);
    await SerialEvent.create({
        serialUnitId: unit.id, type: EVENT.RENEWAL_CANCELLED, eventDate: localDate(),
        branchId: sale.branchId, branchName: names.get(sale.branchId) ?? null,
        partyName: sale.customerName, customerId: sale.customerId, customerPhone: sale.customerPhone,
        sellingAmount: Number(sale.sellingAmount), reference: saleReference(sale.id), saleId: sale.id,
        expiryDate, status: unit.status,
        note: reverted ? `Renewal cancelled; validity back to ${expiryDate ?? "no expiry date"}` : "Renewal cancelled",
        createdBy: employeeId,
    }, { transaction });
};

module.exports = {
    EVENT,
    LIFECYCLE_EVENTS,
    cancelRenewal,
    UNIT_STATUS,
    HELD_STATUSES,
    SALE_TYPE,
    NO_INSTALLATION,
    effectiveStatus,
    nextServiceIds,
    createServiceUnits,
    RETURN_STATUS,
    RETURN_CONDITIONS,
    localDate,
    saleReference,
    returnReference,
    rajkotReference,
    paise,
    allocateAmount,
    shareOf,
    saleSnapshot,
    branchNames,
    ensureUnits,
    registerStock,
    removeFromStock,
    recordSale,
    releaseFromSale,
    recordSaleEdit,
};
