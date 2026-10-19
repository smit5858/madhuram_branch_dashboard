const { Op } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { escapeLike } = require("@/helper/customer");
const { LedgerError, parseId, isSent, parseEntryDate } = require("@/helper/ledger");
const { Sale, Branch, Product, ProductStock, ProductSerial, SaleReturn, SerialEvent, SerialUnit, Employee } = require("@/models/index");
const {
    EVENT, UNIT_STATUS, HELD_STATUSES, RETURN_STATUS, RETURN_CONDITIONS, SALE_TYPE, NO_INSTALLATION, localDate, paise,
    saleReference, returnReference, shareOf, ensureUnits, branchNames,
} = require("@/helper/serialHistory");
const { PRODUCT_TYPE } = require("@/helper/productType");

// Customer returns of serial-tracked units. Every handler runs after loadBranchScope.
//
// A return points at the original sale and one of its serial numbers; the sale is never edited or
// deleted (and is locked against both from then on). The unit goes to Returned and can't be sold
// until an admin decides:
//  - Accept: back into the receiving branch's stock, available for resale (a new sale later is a
//    separate transaction in the same history)
//  - Not resellable: the refund stands, the unit is written off and stays out of stock
//  - Reject: the unit stays with the customer and the refund no longer counts
//
// Access:
//  - Recording a return: admins for any sale (and any active receiving branch); branch members
//    only for their own branch's sales, received into their own branch.
//  - Deciding: admins only.
//  - Listing: admins see every return; members the returns of their own branch's sales or
//    received by their branch.
//
// Every change locks the sale, the return and the unit's serial_unit row, so the same unit can't
// be returned twice, resold while a return is pending, or decided twice.
//
// Software licenses and Service installations (no physical stock) can be returned while they are
// with the customer (Sold, Installed or Active). For them:
//  - Accept: only for software whose license terms allow reassignment; the license is deactivated
//    and goes back into the receiving branch's license pool. Physical stock never changes.
//  - Not resellable: the license / installation is cancelled (deactivated) and never reused
//  - Reject: it goes back to the status it had when returned

const MAX_REASON = 500;
const MAX_NOTE = 500;
const DECISIONS = {
    accept: RETURN_STATUS.ACCEPTED,
    "not-resellable": RETURN_STATUS.NOT_RESELLABLE,
    reject: RETURN_STATUS.REJECTED,
};

const sendReturnError = (res, error) => {
    if (error instanceof LedgerError) return sendError(res, error.message, null, error.status);
    if (error.name === "SequelizeUniqueConstraintError") {
        return sendError(res, "This serial number was just put back in stock by someone else. Please refresh.", null, 409);
    }
    return sendError(res, error.message, null, 500);
};

const parseText = (value, label, max, required) => {
    if (!isSent(value)) return required ? { error: `${label} is required` } : { value: null };
    if (typeof value !== "string") return { error: `Invalid ${label.toLowerCase()}` };
    const trimmed = value.trim();
    if (required && !trimmed) return { error: `${label} is required` };
    if (trimmed.length > max) return { error: `${label} must be at most ${max} characters` };
    return { value: trimmed || null };
};

const parseRefund = (value, max) => {
    if (!isSent(value)) return { value: 0 };
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) return { error: "Refund amount must be a number" };
    if (n < 0) return { error: "Refund amount cannot be negative" };
    if (!/^\d+(\.\d{1,2})?$/.test(String(n))) return { error: "Refund amount can have at most 2 decimal places" };
    if (paise(n) > paise(max)) return { error: `Refund can't be more than this unit's selling amount (₹${Number(max).toLocaleString("en-IN")})` };
    return { value: n };
};

const toReturnResponse = (r) => ({
    id: r.id,
    reference: returnReference(r.id),
    saleId: r.saleId,
    saleReference: saleReference(r.saleId),
    serialNumber: r.serialNumber,
    productId: r.productId,
    productName: r.productName,
    saleBranchId: r.saleBranchId,
    saleBranchName: r.saleBranchName,
    branchId: r.branchId,
    branchName: r.branchName,
    customerId: r.customerId,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    saleDate: r.saleDate,
    saleAmount: Number(r.saleAmount),
    returnDate: r.returnDate,
    reason: r.reason,
    condition: r.condition,
    refundAmount: Number(r.refundAmount),
    status: r.status,
    // Serialized, Software or Service: decides which decisions apply
    productType: r.SerialUnit?.productType ?? PRODUCT_TYPE.SERIALIZED,
    licenseReassignable: !!r.Product?.licenseReassignable,
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt,
    decidedByName: r.decider?.name ?? null,
    createdByName: r.creator?.name ?? null,
    createdAt: r.createdAt,
});

// Fixed lists for the return form and filters
exports.options = async (req, res) => {
    const data = { conditions: RETURN_CONDITIONS, statuses: Object.values(RETURN_STATUS), isAdmin: req.branchScope.isAdmin };
    return sendSuccess(res, "Return options...", data, 200);
};

// Query: page, pageSize, status, branchId (admins), search (serial, customer, product), startDate / endDate (return date)
exports.list = async (req, res) => {
    try {
        const scope = req.branchScope;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 500);

        const and = [];
        if (!scope.isAdmin) {
            and.push({ [Op.or]: [{ branchId: scope.branchId }, { saleBranchId: scope.branchId }] });
        } else if (isSent(req.query.branchId)) {
            const branchId = parseId(req.query.branchId);
            if (!branchId) return sendError(res, "Invalid branch", null, 400);
            and.push({ [Op.or]: [{ branchId }, { saleBranchId: branchId }] });
        }
        if (isSent(req.query.status)) {
            if (!Object.values(RETURN_STATUS).includes(req.query.status)) return sendError(res, "Invalid status", null, 400);
            and.push({ status: req.query.status });
        }
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        if (search) {
            const like = { [Op.like]: `%${escapeLike(search)}%` };
            // "RET-00003" finds that return and "SALE-00012" the returns of that sale
            const returnRef = /^RET-0*(\d{1,9})$/i.exec(search);
            const saleRef = /^SALE-0*(\d{1,9})$/i.exec(search);
            and.push({ [Op.or]: [
                { serialNumber: like }, { customerName: like }, { productName: like }, { customerPhone: like },
                ...(returnRef ? [{ id: Number(returnRef[1]) }] : []),
                ...(saleRef ? [{ saleId: Number(saleRef[1]) }] : []),
            ] });
        }
        for (const [param, op] of [["startDate", Op.gte], ["endDate", Op.lte]]) {
            if (!isSent(req.query[param])) continue;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query[param])) return sendError(res, `Invalid ${param === "startDate" ? "start" : "end"} date`, null, 400);
            and.push({ returnDate: { [op]: req.query[param] } });
        }

        const { count, rows } = await SaleReturn.findAndCountAll({
            where: { [Op.and]: and },
            include: [
                { model: Employee, as: "creator", attributes: ["id", "name"], required: false },
                { model: Employee, as: "decider", attributes: ["id", "name"], required: false },
                { model: SerialUnit, attributes: ["id", "productType"], required: false },
                { model: Product, attributes: ["id", "licenseReassignable"], required: false },
            ],
            order: [["returnDate", "DESC"], ["id", "DESC"]],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            distinct: true,
        });

        const data = {
            return: rows.map(toReturnResponse),
            pagination: { total: count, page, pageSize, totalPages: Math.ceil(count / pageSize) },
        };
        return sendSuccess(res, "Returns...", data, 200);
    } catch (error) {
        return sendReturnError(res, error);
    }
};

// Body: { saleId, serialNumber, returnDate, reason, condition, refundAmount?, branchId? }
exports.create = async (req, res) => {
    try {
        const scope = req.branchScope;
        const body = req.body || {};

        const saleId = parseId(body.saleId);
        if (!saleId) return sendError(res, "Select the sale being returned", null, 400);
        const serial = parseText(body.serialNumber, "Serial number", 100, true);
        if (serial.error) return sendError(res, serial.error, null, 400);
        const date = parseEntryDate(body.returnDate);
        if (date.error) return sendError(res, date.error.replace("Date", "Return date"), null, 400);
        const reason = parseText(body.reason, "Return reason", MAX_REASON, true);
        if (reason.error) return sendError(res, reason.error, null, 400);
        const condition = RETURN_CONDITIONS.find((c) => c === body.condition);
        if (!condition) return sendError(res, isSent(body.condition) ? "Invalid return condition" : "Return condition is required", null, 400);

        // Members receive returns into their own branch; admins choose, defaulting to the sale's branch
        let requestedBranchId = null;
        if (isSent(body.branchId)) {
            requestedBranchId = parseId(body.branchId);
            if (!requestedBranchId) return sendError(res, "Invalid branch", null, 400);
            if (!scope.isAdmin && requestedBranchId !== scope.branchId) {
                return sendError(res, "You can only receive returns into your own branch", null, 403);
            }
        }

        const created = await sequelize.transaction(async (transaction) => {
            const sale = await Sale.findOne({
                where: scope.isAdmin ? { id: saleId } : { id: saleId, branchId: scope.branchId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!sale) throw new LedgerError("Sale not found", 404);
            if (sale.saleType === SALE_TYPE.RENEWAL) {
                throw new LedgerError("Returns are recorded against the license's original sale. To undo a renewal, delete the renewal sale.");
            }

            const serialNumber = sale.serialNumbers.find((sn) => sn.toLowerCase() === serial.value.toLowerCase());
            if (!serialNumber) throw new LedgerError(`${serial.value} is not one of the serial numbers on this sale`);
            if (date.value < sale.saleDate) throw new LedgerError("Return date can't be before the sale date");

            const units = await ensureUnits([serialNumber], { kind: "sale", sale }, { transaction, employeeId: req.employee.id });
            const unit = units.get(serialNumber.toLowerCase());
            if (unit.currentSaleId !== sale.id || !HELD_STATUSES.includes(unit.status)) {
                if (unit.status === UNIT_STATUS.RETURNED && unit.currentSaleId === sale.id) {
                    throw new LedgerError(`${serialNumber} has already been returned and is waiting for a decision`, 409);
                }
                throw new LedgerError(`${serialNumber} is no longer with this sale's customer (it is ${unit.status.toLowerCase()}${unit.currentSaleId && unit.currentSaleId !== sale.id ? ` on ${saleReference(unit.currentSaleId)}` : ""}), so it can't be returned against this sale`, 409);
            }

            const saleAmount = shareOf(sale, serialNumber);
            const refund = parseRefund(body.refundAmount, saleAmount);
            if (refund.error) throw new LedgerError(refund.error);

            const branchId = requestedBranchId ?? (scope.isAdmin ? sale.branchId : scope.branchId);
            const branch = await Branch.findByPk(branchId, { transaction });
            if (!branch) throw new LedgerError("Receiving branch does not exist");
            if (!branch.isActive) throw new LedgerError(scope.isAdmin ? "Receiving branch is inactive" : "Your branch is inactive");
            const names = await branchNames([sale.branchId], transaction);

            const record = await SaleReturn.create({
                saleId: sale.id,
                serialUnitId: unit.id,
                serialNumber,
                productId: sale.productId,
                productName: sale.productName,
                saleBranchId: sale.branchId,
                saleBranchName: names.get(sale.branchId) ?? null,
                branchId,
                branchName: branch.name,
                customerId: sale.customerId,
                customerName: sale.customerName,
                customerPhone: sale.customerPhone,
                saleDate: sale.saleDate,
                saleAmount,
                returnDate: date.value,
                reason: reason.value,
                condition,
                refundAmount: refund.value,
                status: RETURN_STATUS.PENDING,
                unitStatusBefore: unit.status,
                createdBy: req.employee.id,
            }, { transaction });

            await unit.update({ status: UNIT_STATUS.RETURNED, branchId }, { transaction });

            const common = {
                serialUnitId: unit.id, eventDate: date.value, branchId, branchName: branch.name,
                partyName: sale.customerName, customerId: sale.customerId, customerPhone: sale.customerPhone,
                reference: returnReference(record.id), saleId: sale.id, saleReturnId: record.id,
                status: UNIT_STATUS.RETURNED, createdBy: req.employee.id,
            };
            await SerialEvent.create({
                ...common, type: EVENT.RETURN,
                note: `Returned against ${saleReference(sale.id)} (sold for ₹${saleAmount.toLocaleString("en-IN")} on ${sale.saleDate}). Condition: ${condition}. Reason: ${reason.value}`,
            }, { transaction });
            if (refund.value > 0) {
                await SerialEvent.create({ ...common, type: EVENT.REFUND, refundAmount: refund.value, note: `Refund for ${saleReference(sale.id)}` }, { transaction });
            }
            return record;
        });

        return sendSuccess(res, `Return ${returnReference(created.id)} recorded. It is waiting for an admin's decision.`, { id: created.id }, 201);
    } catch (error) {
        return sendReturnError(res, error);
    }
};

// Admins only. Body: { decision: "accept" | "not-resellable" | "reject", note? }
exports.decide = async (req, res) => {
    try {
        const scope = req.branchScope;
        if (!scope.isAdmin) return sendError(res, "Only an admin can decide on a return", null, 403);
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid return", null, 400);
        const status = DECISIONS[req.body?.decision];
        if (!status) return sendError(res, "Choose accept, not-resellable or reject", null, 400);
        const note = parseText(req.body?.note, "Note", MAX_NOTE, false);
        if (note.error) return sendError(res, note.error, null, 400);

        const result = await sequelize.transaction(async (transaction) => {
            const record = await SaleReturn.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!record) throw new LedgerError("Return not found", 404);
            if (record.status !== RETURN_STATUS.PENDING) throw new LedgerError(`This return has already been decided (${record.status})`, 409);

            const units = await ensureUnits([record.serialNumber], { kind: "stock", productId: record.productId, productName: record.productName, branchId: record.branchId }, { transaction });
            const unit = units.get(record.serialNumber.toLowerCase());
            if (unit.status !== UNIT_STATUS.RETURNED || unit.currentSaleId !== record.saleId) {
                throw new LedgerError(`${record.serialNumber} is no longer waiting on this return (it is ${unit.status.toLowerCase()})`, 409);
            }

            const common = {
                serialUnitId: unit.id, eventDate: localDate(), branchId: record.branchId, branchName: record.branchName,
                partyName: record.customerName, customerId: record.customerId, customerPhone: record.customerPhone,
                reference: returnReference(record.id), saleId: record.saleId, saleReturnId: record.id,
                createdBy: req.employee.id,
            };
            const withNote = (text) => (note.value ? `${text}. ${note.value}` : text);
            const isLicense = unit.productType === PRODUCT_TYPE.SOFTWARE;
            const isService = unit.productType === PRODUCT_TYPE.SERVICE;

            if (status === RETURN_STATUS.ACCEPTED && isService) {
                throw new LedgerError("An installation service can't go back into stock. Choose Not resellable to cancel it.", 409);
            }
            if (status === RETURN_STATUS.ACCEPTED && isLicense) {
                // Deactivated and back into a license pool, only when the license terms allow it
                const product = record.productId ? await Product.findByPk(record.productId, { transaction }) : null;
                if (!product) throw new LedgerError(`${record.productName} has been removed from the products list, so the license can't be reassigned. Choose Not resellable instead.`, 409);
                if (!product.licenseReassignable) {
                    throw new LedgerError(`${product.name}'s license terms don't allow reassignment. Choose Not resellable to deactivate the license.`, 409);
                }
                const branch = record.branchId ? await Branch.findByPk(record.branchId, { transaction }) : null;
                if (!branch) throw new LedgerError("The receiving branch no longer exists, so the license can't go back into a pool", 409);
                const offered = await ProductStock.findOne({ where: { productId: product.id, branchId: branch.id }, transaction });
                if (!offered) await ProductStock.create({ productId: product.id, branchId: branch.id, quantity: 0 }, { transaction });
                await unit.update({ status: UNIT_STATUS.AVAILABLE, branchId: branch.id, currentSaleId: null, productId: product.id, productName: product.name, ...NO_INSTALLATION }, { transaction });
                await SerialEvent.create({ ...common, type: EVENT.RETURN_ACCEPTED, status: UNIT_STATUS.AVAILABLE, note: withNote(`License deactivated and back in ${branch.name}'s license pool, available for reassignment`) }, { transaction });
            } else if (status === RETURN_STATUS.NOT_RESELLABLE && (isLicense || isService)) {
                await unit.update({ status: UNIT_STATUS.CANCELLED, currentSaleId: null }, { transaction });
                await SerialEvent.create({ ...common, type: EVENT.CANCELLED, status: UNIT_STATUS.CANCELLED, expiryDate: unit.expiryDate, note: withNote(isLicense ? "Return accepted; license deactivated and never reused" : "Return accepted; installation cancelled") }, { transaction });
            } else if (status === RETURN_STATUS.ACCEPTED) {
                // Back into the receiving branch's stock, the same way Products adds a unit
                const product = record.productId ? await Product.findByPk(record.productId, { transaction }) : null;
                if (!product) throw new LedgerError(`${record.productName} has been removed from the products list, so the unit can't go back into stock. Mark it not resellable instead.`, 409);
                const branch = record.branchId ? await Branch.findByPk(record.branchId, { transaction }) : null;
                if (!branch) throw new LedgerError("The receiving branch no longer exists, so the unit can't go back into stock", 409);
                const inStock = await ProductSerial.findOne({ where: { serialNumber: record.serialNumber }, transaction });
                if (inStock) throw new LedgerError(`${record.serialNumber} is already in stock`, 409);

                const stock = await ProductStock.findOne({ where: { productId: product.id, branchId: branch.id }, transaction, lock: transaction.LOCK.UPDATE });
                await ProductSerial.create({ productId: product.id, branchId: branch.id, serialNumber: record.serialNumber }, { transaction });
                if (stock) await stock.update({ quantity: stock.quantity + 1 }, { transaction });
                else await ProductStock.create({ productId: product.id, branchId: branch.id, quantity: 1 }, { transaction });

                await unit.update({ status: UNIT_STATUS.AVAILABLE, branchId: branch.id, currentSaleId: null, productId: product.id, productName: product.name }, { transaction });
                await SerialEvent.create({ ...common, type: EVENT.RETURN_ACCEPTED, status: UNIT_STATUS.AVAILABLE, note: withNote(`Back in stock at ${branch.name}, available for resale`) }, { transaction });
            } else if (status === RETURN_STATUS.NOT_RESELLABLE) {
                await unit.update({ status: UNIT_STATUS.NOT_RESELLABLE, currentSaleId: null }, { transaction });
                await SerialEvent.create({ ...common, type: EVENT.WRITTEN_OFF, status: UNIT_STATUS.NOT_RESELLABLE, note: withNote("Return accepted, unit written off and kept out of stock") }, { transaction });
            } else {
                // Back to how it was when returned (Sold, or Installed / Active for licenses)
                const restored = HELD_STATUSES.includes(record.unitStatusBefore) ? record.unitStatusBefore : UNIT_STATUS.SOLD;
                await unit.update({ status: restored, branchId: record.saleBranchId ?? unit.branchId }, { transaction });
                const voided = Number(record.refundAmount) > 0 ? `; refund of ₹${Number(record.refundAmount).toLocaleString("en-IN")} voided` : "";
                await SerialEvent.create({ ...common, type: EVENT.RETURN_REJECTED, status: restored, note: withNote(`Return rejected, the unit stays with the customer${voided}`) }, { transaction });
            }

            await record.update({ status, decisionNote: note.value, decidedBy: req.employee.id, decidedAt: new Date() }, { transaction });
            return { id: record.id, status, serialNumber: record.serialNumber };
        });

        const messages = {
            [RETURN_STATUS.ACCEPTED]: `${result.serialNumber} is back in stock and available for resale`,
            [RETURN_STATUS.NOT_RESELLABLE]: `${result.serialNumber} was written off as not resellable`,
            [RETURN_STATUS.REJECTED]: `Return rejected. ${result.serialNumber} stays with the customer`,
        };
        return sendSuccess(res, messages[result.status], result, 200);
    } catch (error) {
        return sendReturnError(res, error);
    }
};
