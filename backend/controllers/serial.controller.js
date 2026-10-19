const { Op } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { escapeLike } = require("@/helper/customer");
const { LedgerError, parseId, isSent, parseEntryDate } = require("@/helper/ledger");
const {
    Branch, Product, ProductStock, ProductSerial, Sale, SaleReturn, SerialUnit, SerialEvent, ProductPurchase, Employee,
} = require("@/models/index");
const {
    EVENT, UNIT_STATUS, HELD_STATUSES, RETURN_STATUS, SALE_TYPE, NO_INSTALLATION, effectiveStatus,
    localDate, paise, saleReference, returnReference, shareOf, ensureUnits, branchNames,
} = require("@/helper/serialHistory");
const { PRODUCT_TYPE } = require("@/helper/productType");

// Serial number tracking: search units, open one unit's full history and money totals, (admins)
// move an available unit to another branch, and run a license's lifecycle (install, activate,
// renew, deactivate, release). Every handler runs after loadBranchScope.
//
// Access: admins see every serial number. Branch members see the serial numbers their branch has
// been part of (held it, sold it, received its return or transfer); in those histories the
// customers of other branches' sales and returns are hidden, as in the Sales module. License
// actions are allowed to admins and to the branch whose sale the license is on.
//
// Money for one unit comes from the records themselves, never by adding up history rows:
//  - Gross sales: this unit's share of every sale it is on, renewals included (deleted sales are
//    gone, so they don't count)
//  - Refunds: refunds of its returns, except rejected ones
//  - Net sales = gross sales − refunds
//  - Cost: its latest purchase amount. It is realized only while the unit is with a customer or
//    written off / cancelled; a unit back in stock (or waiting on a return) still holds its cost.
//  - Realized profit / loss = net sales − realized cost (unknown when the cost was never entered)
//
// Software licenses and Service installations have no physical stock: none of these actions
// touches product_stock quantities or product_serial.

const SALE_TYPES = [EVENT.SALE, EVENT.SALE_EDITED, EVENT.SALE_CANCELLED, EVENT.REMOVED_FROM_SALE];
const LICENSE_TYPES = [EVENT.INSTALLATION, EVENT.ACTIVATION, EVENT.RENEWAL, EVENT.RENEWAL_CANCELLED, EVENT.CANCELLED];
const CUSTOMER_TYPES = [...SALE_TYPES, EVENT.RETURN, EVENT.REFUND, EVENT.RETURN_ACCEPTED, EVENT.RETURN_REJECTED, EVENT.WRITTEN_OFF, ...LICENSE_TYPES];
const OTHER_BRANCH_CUSTOMER = "Customer of another branch";
const UNIT_TYPES = [PRODUCT_TYPE.SERIALIZED, PRODUCT_TYPE.SOFTWARE, PRODUCT_TYPE.SERVICE];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 255;
const MAX_NOTE = 500;
const MAX_AMOUNT = 1000000000;
const EXPIRING_DAYS = 30;

const sendSerialError = (res, error) => {
    if (error instanceof LedgerError) return sendError(res, error.message, null, error.status);
    return sendError(res, error.message, null, 500);
};

// SQL for "this unit has a history row matching `condition`"
const hasEvent = (condition) =>
    sequelize.literal(`(SELECT DISTINCT e.serialUnitId FROM serial_event e WHERE ${condition})`);

// Units a member may see: held by their branch now, or with any history row at their branch
const memberCondition = (branchId) => ({
    [Op.or]: [
        { branchId },
        { id: { [Op.in]: hasEvent(`e.branchId = ${Number(branchId)} OR e.toBranchId = ${Number(branchId)}`) } },
    ],
});

const canSee = async (unit, scope) => {
    if (scope.isAdmin || unit.branchId === scope.branchId) return true;
    const count = await SerialEvent.count({
        where: { serialUnitId: unit.id, [Op.or]: [{ branchId: scope.branchId }, { toBranchId: scope.branchId }] },
    });
    return count > 0;
};

// Sales (still existing) that this serial number is on, oldest first, with this unit's share.
// License renewals are sales too (saleType "Renewal").
const salesOf = async (serialNumber) => {
    // sale.serialNumbers is a JSON array, so match the value with its surrounding quotes
    const pattern = `%${escapeLike(JSON.stringify(serialNumber))}%`;
    const rows = await Sale.findAll({
        where: { serialNumbers: { [Op.like]: pattern } },
        include: [{ model: Branch, attributes: ["id", "name"], required: false }],
        order: [["saleDate", "ASC"], ["id", "ASC"]],
    });
    return rows
        .filter((s) => s.serialNumbers.some((sn) => sn.toLowerCase() === serialNumber.toLowerCase()))
        .map((s) => ({ sale: s, share: shareOf(s, serialNumber) }));
};

const realizesCost = (status) => [
    UNIT_STATUS.SOLD, UNIT_STATUS.NOT_RESELLABLE, UNIT_STATUS.INSTALLED, UNIT_STATUS.ACTIVE, UNIT_STATUS.CANCELLED,
].includes(status);

// Money totals for one unit; see the header comment
const financialsOf = ({ unit, sales, returns, purchases }) => {
    const grossSales = sales.reduce((sum, s) => sum + paise(s.share), 0) / 100;
    const renewals = sales.filter((s) => s.sale.saleType === SALE_TYPE.RENEWAL);
    const renewalRevenue = renewals.reduce((sum, s) => sum + paise(s.share), 0) / 100;
    const counted = returns.filter((r) => r.status !== RETURN_STATUS.REJECTED);
    const totalRefunds = counted.reduce((sum, r) => sum + paise(r.refundAmount), 0) / 100;
    const netSales = (paise(grossSales) - paise(totalRefunds)) / 100;

    const latestCost = [...purchases].reverse().find((p) => p.purchaseAmount !== null)?.purchaseAmount ?? null;
    const realized = realizesCost(unit.status);
    const realizedCost = realized ? latestCost : 0;
    const profit = realized && latestCost === null ? null : (paise(netSales) - paise(realizedCost ?? 0)) / 100;

    return {
        purchaseCost: latestCost,
        grossSales,
        totalRefunds,
        netSales,
        costRealized: realized,
        realizedCost,
        profit,
        salesCount: sales.length - renewals.length,
        returnsCount: counted.length,
        renewalsCount: renewals.length,
        renewalRevenue,
    };
};

const addDays = (date, days) => {
    const [y, m, d] = date.split("-").map(Number);
    return localDate(new Date(y, m - 1, d + days));
};

// Branches, statuses, product types and history types for the filters
exports.options = async (req, res) => {
    try {
        const { isAdmin, branchId } = req.branchScope;
        const branches = await Branch.findAll({ attributes: ["id", "name", "isActive"], order: [["name", "ASC"]] });
        const data = {
            isAdmin,
            branchId,
            branch: isAdmin ? branches : branches.filter((b) => b.id === branchId),
            // Every branch, for picking a transfer target
            allBranches: isAdmin ? branches : [],
            statuses: Object.values(UNIT_STATUS),
            productTypes: UNIT_TYPES,
            eventTypes: Object.values(EVENT),
        };
        return sendSuccess(res, "Serial tracking options...", data, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};

// Per-type date range filters: query prefix -> history types it matches
const DATE_RANGE_TYPES = {
    purchase: [EVENT.PURCHASE],
    sale: [EVENT.SALE],
    return: [EVENT.RETURN],
    installation: [EVENT.INSTALLATION],
};

const checkDate = (value, label) => {
    if (!DATE_REGEX.test(value)) throw new LedgerError(`Invalid ${label}`, 400);
};

// Status filter; Expired / Active are told apart by the expiry date (Expired is never stored)
const statusCondition = (status, today) => {
    if (status === UNIT_STATUS.EXPIRED) return { status: UNIT_STATUS.ACTIVE, expiryDate: { [Op.lt]: today } };
    if (status === UNIT_STATUS.ACTIVE) {
        return { status: UNIT_STATUS.ACTIVE, [Op.or]: [{ expiryDate: null }, { expiryDate: { [Op.gte]: today } }] };
    }
    return { status };
};

// Shared by the list and the summary. Query: serialNumber, productId, productName, customer, supplier,
// type, startDate, endDate, branchId, status (skipped with withStatus false), productType,
// expiryStartDate / expiryEndDate, and purchase / sale / return / installation StartDate /
// EndDate. Throws LedgerError for bad input.
const buildListWhere = (scope, q, { withStatus = true } = {}) => {
    const text = (value) => (typeof value === "string" ? value.trim() : "");
    const like = (value) => sequelize.escape(`%${escapeLike(value)}%`);
    const today = localDate();

    const and = [];
    if (!scope.isAdmin) {
        if (isSent(q.branchId) && parseId(q.branchId) !== scope.branchId) {
            throw new LedgerError("You can only view serial numbers of your own branch", 403);
        }
        and.push(memberCondition(scope.branchId));
    } else if (isSent(q.branchId)) {
        const branchId = parseId(q.branchId);
        if (!branchId) throw new LedgerError("Invalid branch", 400);
        and.push({ [Op.or]: [{ branchId }, { id: { [Op.in]: hasEvent(`e.branchId = ${branchId} OR e.toBranchId = ${branchId}`) } }] });
    }

    if (text(q.serialNumber)) and.push({ serialNumber: { [Op.like]: `%${escapeLike(text(q.serialNumber))}%` } });
    // Every serial number / license of one product (e.g. a software product's licenses)
    if (isSent(q.productId)) {
        const productId = parseId(q.productId);
        if (!productId) throw new LedgerError("Invalid product", 400);
        and.push({ productId });
    }
    if (text(q.productName)) {
        const value = `%${escapeLike(text(q.productName))}%`;
        and.push({ [Op.or]: [{ productName: { [Op.like]: value } }, { "$Product.name$": { [Op.like]: value } }] });
    }
    if (withStatus && isSent(q.status)) {
        if (!Object.values(UNIT_STATUS).includes(q.status)) throw new LedgerError("Invalid status", 400);
        and.push(statusCondition(q.status, today));
    }
    if (isSent(q.productType)) {
        if (!UNIT_TYPES.includes(q.productType)) throw new LedgerError("Invalid product type", 400);
        and.push({ productType: q.productType });
    }
    if (text(q.supplier)) {
        and.push({ id: { [Op.in]: hasEvent(`e.type = ${sequelize.escape(EVENT.PURCHASE)} AND e.partyName LIKE ${like(text(q.supplier))}`) } });
    }
    if (text(q.customer)) {
        const types = CUSTOMER_TYPES.map((t) => sequelize.escape(t)).join(", ");
        // Members only match customers of their own branch's transactions
        const own = scope.isAdmin ? "" : ` AND e.branchId = ${Number(scope.branchId)}`;
        const value = text(q.customer);
        const phone = value.replace(/[\s()-]/g, "");
        const phoneMatch = phone ? ` OR e.customerPhone LIKE ${like(phone)}` : "";
        and.push({ id: { [Op.in]: hasEvent(`e.type IN (${types}) AND (e.partyName LIKE ${like(value)}${phoneMatch})${own}`) } });
    }

    const eventConditions = [];
    if (isSent(q.type)) {
        if (!Object.values(EVENT).includes(q.type)) throw new LedgerError("Invalid transaction type", 400);
        eventConditions.push(`e.type = ${sequelize.escape(q.type)}`);
    }
    for (const [param, op] of [["startDate", ">="], ["endDate", "<="]]) {
        if (!isSent(q[param])) continue;
        checkDate(q[param], param === "startDate" ? "start date" : "end date");
        eventConditions.push(`e.eventDate ${op} ${sequelize.escape(q[param])}`);
    }
    if (isSent(q.startDate) && isSent(q.endDate) && q.startDate > q.endDate) {
        throw new LedgerError("Start date must be on or before end date", 400);
    }
    if (eventConditions.length > 0) and.push({ id: { [Op.in]: hasEvent(eventConditions.join(" AND ")) } });

    for (const [prefix, types] of Object.entries(DATE_RANGE_TYPES)) {
        const start = q[`${prefix}StartDate`];
        const end = q[`${prefix}EndDate`];
        if (!isSent(start) && !isSent(end)) continue;
        const conditions = [`e.type IN (${types.map((t) => sequelize.escape(t)).join(", ")})`];
        for (const [value, op, label] of [[start, ">=", "start"], [end, "<=", "end"]]) {
            if (!isSent(value)) continue;
            checkDate(value, `${prefix} ${label} date`);
            conditions.push(`e.eventDate ${op} ${sequelize.escape(value)}`);
        }
        if (isSent(start) && isSent(end) && start > end) {
            throw new LedgerError(`${prefix[0].toUpperCase()}${prefix.slice(1)} start date must be on or before end date`, 400);
        }
        and.push({ id: { [Op.in]: hasEvent(conditions.join(" AND ")) } });
    }

    // License validity, on the unit itself
    const expiry = {};
    if (isSent(q.expiryStartDate)) {
        checkDate(q.expiryStartDate, "expiry start date");
        expiry[Op.gte] = q.expiryStartDate;
    }
    if (isSent(q.expiryEndDate)) {
        checkDate(q.expiryEndDate, "expiry end date");
        expiry[Op.lte] = q.expiryEndDate;
    }
    if (isSent(q.expiryStartDate) && isSent(q.expiryEndDate) && q.expiryStartDate > q.expiryEndDate) {
        throw new LedgerError("Expiry start date must be on or before end date", 400);
    }
    if (Reflect.ownKeys(expiry).length > 0) and.push({ expiryDate: expiry });

    return and;
};

exports.list = async (req, res) => {
    try {
        const scope = req.branchScope;
        const q = req.query;
        const page = Math.max(parseInt(q.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(q.pageSize, 10) || 10, 1), 200);
        const and = buildListWhere(scope, q);
        const today = localDate();

        const { count, rows } = await SerialUnit.findAndCountAll({
            where: { [Op.and]: and },
            include: [
                { model: Product, attributes: ["id", "name"], required: false },
                { model: Branch, attributes: ["id", "name"], required: false },
            ],
            order: [["updatedAt", "DESC"], ["id", "DESC"]],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            distinct: true,
            subQuery: false,
        });

        // History of this page's units, for the summary columns
        const ids = rows.map((u) => u.id);
        const [events, returns] = ids.length === 0 ? [[], []] : await Promise.all([
            SerialEvent.findAll({ where: { serialUnitId: ids }, order: [["eventDate", "ASC"], ["id", "ASC"]], raw: true }),
            SaleReturn.findAll({ where: { serialUnitId: ids }, attributes: ["serialUnitId", "status"], raw: true }),
        ]);
        const eventsOf = new Map(ids.map((id) => [id, []]));
        for (const e of events) eventsOf.get(e.serialUnitId).push(e);
        // Sales still on record for each unit (a cancelled sale is deleted, an edited-off one no
        // longer lists the unit), so the latest sale's date, amount and customer are current
        const cancelledOf = (history) => new Set(history
            .filter((e) => e.type === EVENT.SALE_CANCELLED || e.type === EVENT.REMOVED_FROM_SALE)
            .map((e) => e.saleId));
        const lastSaleIdOf = new Map(rows.map((u) => {
            const history = eventsOf.get(u.id);
            const cancelled = cancelledOf(history);
            return [u.id, history.filter((e) => e.type === EVENT.SALE && !cancelled.has(e.saleId)).at(-1)?.saleId ?? null];
        }));
        const saleIds = [...new Set([...rows.map((u) => u.currentSaleId), ...lastSaleIdOf.values()].filter(Boolean))];
        const liveSales = saleIds.length === 0 ? [] : await Sale.findAll({ where: { id: saleIds } });
        const saleBy = new Map(liveSales.map((s) => [s.id, s]));

        const money = (v) => (v === undefined || v === null ? null : Number(v));
        const unit = rows.map((u) => {
            const history = eventsOf.get(u.id);
            const purchase = history.find((e) => e.type === EVENT.PURCHASE);
            const cancelled = cancelledOf(history);
            const sales = history.filter((e) => e.type === EVENT.SALE && !cancelled.has(e.saleId));
            const lastSale = saleBy.get(lastSaleIdOf.get(u.id)) ?? null;
            const current = u.currentSaleId ? saleBy.get(u.currentSaleId) : null;
            const showHolder = current && (scope.isAdmin || current.branchId === scope.branchId);
            const showLastCustomer = lastSale && (scope.isAdmin || lastSale.branchId === scope.branchId);
            return {
                id: u.id,
                serialNumber: u.serialNumber,
                productId: u.productId,
                productName: u.Product?.name ?? u.productName,
                productType: u.productType,
                status: effectiveStatus(u, today),
                branchId: u.branchId,
                branchName: u.Branch?.name ?? null,
                supplierName: purchase?.partyName ?? null,
                purchaseDate: purchase?.eventDate ?? null,
                purchaseAmount: money(purchase?.purchaseAmount),
                salesCount: sales.length,
                returnsCount: returns.filter((r) => r.serialUnitId === u.id && r.status !== RETURN_STATUS.REJECTED).length,
                lastSaleId: lastSale?.id ?? null,
                lastSaleDate: lastSale?.saleDate ?? null,
                lastSellingAmount: lastSale ? money(shareOf(lastSale, u.serialNumber)) : null,
                lastCustomerName: lastSale ? (showLastCustomer ? lastSale.customerName : OTHER_BRANCH_CUSTOMER) : null,
                lastCustomerPhone: showLastCustomer ? lastSale.customerPhone : null,
                currentHolder: current ? (showHolder ? current.customerName : OTHER_BRANCH_CUSTOMER) : null,
                installationDate: u.installationDate,
                activationDate: u.activationDate,
                expiryDate: u.expiryDate,
                deviceName: showHolder || !current ? u.deviceName : null,
                lastActivity: history.at(-1)?.eventDate ?? null,
            };
        });

        const data = { unit, pagination: { total: count, page, pageSize, totalPages: Math.ceil(count / pageSize) } };
        return sendSuccess(res, "Serial numbers...", data, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};

// Counts by product type and status for the list's filters (the status filter itself is
// ignored), so physical units, licenses and installations are reported apart. Active licenses
// past their expiry count as Expired; expiringSoon counts Active ones ending within 30 days.
exports.summary = async (req, res) => {
    try {
        const scope = req.branchScope;
        const and = buildListWhere(scope, req.query, { withStatus: false });
        const today = sequelize.escape(localDate());
        const soon = sequelize.escape(addDays(localDate(), EXPIRING_DAYS));

        const rows = await SerialUnit.findAll({
            where: { [Op.and]: and },
            include: [{ model: Product, attributes: [], required: false }],
            attributes: [
                "productType",
                [sequelize.literal(`CASE WHEN SerialUnit.status = 'Active' AND SerialUnit.expiryDate < ${today} THEN 'Expired' ELSE SerialUnit.status END`), "shownStatus"],
                [sequelize.fn("COUNT", sequelize.col("SerialUnit.id")), "count"],
                [sequelize.literal(`SUM(CASE WHEN SerialUnit.status = 'Active' AND SerialUnit.expiryDate >= ${today} AND SerialUnit.expiryDate <= ${soon} THEN 1 ELSE 0 END)`), "expiringSoon"],
            ],
            group: ["SerialUnit.productType", "shownStatus"],
            raw: true,
        });

        const types = UNIT_TYPES.map((productType) => {
            const own = rows.filter((r) => r.productType === productType);
            const byStatus = Object.fromEntries(own.map((r) => [r.shownStatus, Number(r.count)]));
            return {
                productType,
                total: own.reduce((sum, r) => sum + Number(r.count), 0),
                byStatus,
                expiringSoon: own.reduce((sum, r) => sum + Number(r.expiringSoon || 0), 0),
            };
        });
        return sendSuccess(res, "Serial number summary...", { types, expiringDays: EXPIRING_DAYS }, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};

// What the logged-in user may do with a license / installation right now
const licenseActions = (unit, holderSale, scope, product) => {
    const isLicense = unit.productType === PRODUCT_TYPE.SOFTWARE;
    const isService = unit.productType === PRODUCT_TYPE.SERVICE;
    const mayAct = !!holderSale && (scope.isAdmin || holderSale.branchId === scope.branchId);
    return {
        canInstall: (isLicense || isService) && mayAct && unit.status === UNIT_STATUS.SOLD,
        canActivate: isLicense && mayAct && unit.status === UNIT_STATUS.INSTALLED,
        canRenew: isLicense && mayAct && unit.status === UNIT_STATUS.ACTIVE,
        canDeactivate: (isLicense || isService) && mayAct && HELD_STATUSES.includes(unit.status),
        canRelease: isLicense && scope.isAdmin && unit.status === UNIT_STATUS.CANCELLED && !!product?.licenseReassignable,
        canTransfer: scope.isAdmin && unit.status === UNIT_STATUS.AVAILABLE && unit.productType !== PRODUCT_TYPE.SERVICE,
    };
};

// Query: serialNumber. One unit with its summary, money totals and full history.
exports.detail = async (req, res) => {
    try {
        const scope = req.branchScope;
        const serialNumber = typeof req.query.serialNumber === "string" ? req.query.serialNumber.trim() : "";
        if (!serialNumber) return sendError(res, "Serial number is required", null, 400);

        const include = [
            { model: Product, attributes: ["id", "name", "licenseReassignable"], required: false },
            { model: Branch, attributes: ["id", "name"], required: false },
        ];
        let unit = await SerialUnit.findOne({ where: { serialNumber }, include });
        // Recorded before tracking and never touched since: register it from stock or its sale
        if (!unit) {
            const created = await sequelize.transaction(async (transaction) => {
                const stock = await ProductSerial.findOne({ where: { serialNumber }, include: [{ model: Product, attributes: ["name"] }], transaction });
                if (stock) {
                    await ensureUnits([stock.serialNumber], { kind: "stock", productId: stock.productId, productName: stock.Product?.name ?? "", branchId: stock.branchId }, { transaction });
                    return true;
                }
                const [sold] = await salesOf(serialNumber);
                if (sold) {
                    const sn = sold.sale.serialNumbers.find((x) => x.toLowerCase() === serialNumber.toLowerCase());
                    await ensureUnits([sn], { kind: "sale", sale: sold.sale }, { transaction });
                    return true;
                }
                return false;
            });
            if (created) unit = await SerialUnit.findOne({ where: { serialNumber }, include });
        }
        if (!unit || !(await canSee(unit, scope))) return sendError(res, "Serial number not found", null, 404);

        const [eventRows, returnRows, sales] = await Promise.all([
            SerialEvent.findAll({
                where: { serialUnitId: unit.id },
                include: [{ model: Employee, as: "creator", attributes: ["id", "name"], required: false }],
                order: [["eventDate", "ASC"], ["id", "ASC"]],
            }),
            SaleReturn.findAll({ where: { serialUnitId: unit.id }, order: [["id", "ASC"]], raw: true }),
            salesOf(unit.serialNumber),
        ]);
        const purchaseIds = [...new Set(eventRows.map((e) => e.purchaseId).filter(Boolean))];
        const purchaseRows = purchaseIds.length === 0 ? [] : await ProductPurchase.findAll({ where: { id: purchaseIds }, raw: true });
        const purchaseBy = new Map(purchaseRows.map((p) => [p.id, p]));
        const returnBy = new Map(returnRows.map((r) => [r.id, r]));

        // Members don't see who bought or returned at another branch
        const hideCustomer = (branchId) => !scope.isAdmin && branchId !== scope.branchId;
        const money = (v) => (v === null || v === undefined ? null : Number(v));

        // Sales are numbered in order; a sale later cancelled or edited off this unit is marked as such
        const cancelled = new Set(eventRows.filter((e) => e.type === EVENT.SALE_CANCELLED || e.type === EVENT.REMOVED_FROM_SALE).map((e) => e.saleId));
        let saleNo = 0;
        const history = eventRows.map((e, index) => {
            let label = e.type;
            if (e.type === EVENT.SALE) {
                if (cancelled.has(e.saleId)) label = "Sale (Cancelled)";
                else label = ++saleNo === 1 ? "Sale (Original)" : `Resale #${saleNo - 1}`;
            }
            const linkedReturn = e.saleReturnId ? returnBy.get(e.saleReturnId) : null;
            const hidden = CUSTOMER_TYPES.includes(e.type) && hideCustomer(e.branchId) && hideCustomer(linkedReturn?.saleBranchId);
            const purchase = e.purchaseId ? purchaseBy.get(e.purchaseId) : null;
            return {
                id: e.id,
                srNo: index + 1,
                date: e.eventDate,
                type: e.type,
                label,
                partyName: hidden ? OTHER_BRANCH_CUSTOMER : e.partyName,
                customerPhone: hidden ? null : e.customerPhone,
                branchId: e.branchId,
                branchName: e.branchName,
                toBranchName: e.toBranchName,
                purchaseAmount: money(e.purchaseAmount),
                sellingAmount: money(e.sellingAmount),
                refundAmount: money(e.refundAmount),
                reference: e.reference,
                status: e.status,
                note: hidden ? null : e.note,
                expiryDate: e.expiryDate,
                deviceName: hidden ? null : e.deviceName,
                technicianName: hidden ? null : e.technicianName,
                saleId: e.saleId,
                saleReturnId: e.saleReturnId,
                // A refund of a rejected return doesn't count
                voided: e.type === EVENT.REFUND && linkedReturn?.status === RETURN_STATUS.REJECTED,
                purchase: purchase ? {
                    id: purchase.id, supplierName: purchase.supplierName, purchaseDate: purchase.purchaseDate,
                    reference: purchase.reference, source: purchase.source, quantity: purchase.quantity,
                } : null,
                createdByName: e.creator?.name ?? null,
                createdAt: e.createdAt,
            };
        });

        const purchases = history.filter((h) => h.type === EVENT.PURCHASE);
        const original = purchases[0] ?? null;
        const financials = financialsOf({
            unit,
            sales,
            returns: returnRows.map((r) => ({ status: r.status, refundAmount: Number(r.refundAmount) })),
            purchases,
        });
        const lastSale = sales.filter((s) => s.sale.saleType !== SALE_TYPE.RENEWAL).at(-1);
        const currentSale = unit.currentSaleId ? sales.find((s) => s.sale.id === unit.currentSaleId)?.sale : null;
        const holderHidden = currentSale && hideCustomer(currentSale.branchId);

        let saleIndex = 0;
        const data = {
            id: unit.id,
            serialNumber: unit.serialNumber,
            productId: unit.productId,
            productName: unit.Product?.name ?? unit.productName,
            productType: unit.productType,
            licenseReassignable: !!unit.Product?.licenseReassignable,
            status: effectiveStatus(unit),
            branchId: unit.branchId,
            branchName: unit.Branch?.name ?? null,
            originalSupplier: original?.partyName ?? null,
            originalPurchaseAmount: original?.purchaseAmount ?? null,
            originalPurchaseDate: original?.date ?? null,
            originalPurchaseReference: original?.reference ?? null,
            lastSellingAmount: lastSale?.share ?? null,
            lastSaleDate: lastSale?.sale.saleDate ?? null,
            lastTransactionDate: history.at(-1)?.date ?? null,
            // Current installation and validity (licenses and services)
            installation: {
                installationDate: unit.installationDate,
                activationDate: unit.activationDate,
                expiryDate: unit.expiryDate,
                deviceName: holderHidden ? null : unit.deviceName,
                technicianName: holderHidden ? null : unit.technicianName,
            },
            currentHolder: currentSale ? {
                saleId: currentSale.id,
                saleReference: saleReference(currentSale.id),
                customerName: holderHidden ? OTHER_BRANCH_CUSTOMER : currentSale.customerName,
                customerPhone: holderHidden ? null : currentSale.customerPhone,
                saleDate: currentSale.saleDate,
            } : null,
            pendingReturn: (() => {
                const pending = returnRows.find((r) => r.status === RETURN_STATUS.PENDING);
                return pending ? { id: pending.id, reference: returnReference(pending.id) } : null;
            })(),
            financials,
            sales: sales.map(({ sale, share }) => {
                const isRenewal = sale.saleType === SALE_TYPE.RENEWAL;
                const label = isRenewal ? "Renewal" : (++saleIndex === 1 ? "Original Sale" : `Resale #${saleIndex - 1}`);
                return {
                    saleId: sale.id,
                    reference: saleReference(sale.id),
                    saleType: sale.saleType,
                    label,
                    saleDate: sale.saleDate,
                    branchName: sale.Branch?.name ?? null,
                    customerName: hideCustomer(sale.branchId) ? OTHER_BRANCH_CUSTOMER : sale.customerName,
                    amount: share,
                    returned: returnRows.some((r) => r.saleId === sale.id && r.status !== RETURN_STATUS.REJECTED),
                };
            }),
            history,
            ...licenseActions(unit, currentSale, scope, unit.Product),
        };
        return sendSuccess(res, "Serial number history...", data, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};

const parseNote = (value, label = "Note", max = MAX_NOTE, required = false) => {
    if (!isSent(value)) {
        if (required) throw new LedgerError(`${label} is required`, 400);
        return null;
    }
    if (typeof value !== "string") throw new LedgerError(`Invalid ${label.toLowerCase()}`, 400);
    const trimmed = value.trim();
    if (required && !trimmed) throw new LedgerError(`${label} is required`, 400);
    if (trimmed.length > max) throw new LedgerError(`${label} must be at most ${max} characters`, 400);
    return trimmed || null;
};

// A date that can't be in the future (transactions)
const pastDate = (value, label) => {
    const parsed = parseEntryDate(value);
    if (parsed.error) throw new LedgerError(parsed.error.replace("Date", label), 400);
    return parsed.value;
};

// A real calendar date, future allowed (validity)
const anyDate = (value, label) => {
    if (typeof value !== "string" || !DATE_REGEX.test(value)) throw new LedgerError(`Invalid ${label.toLowerCase()}`, 400);
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) throw new LedgerError(`Invalid ${label.toLowerCase()}`, 400);
    return value;
};

const serialFrom = (body) => {
    const serialNumber = typeof body?.serialNumber === "string" ? body.serialNumber.trim() : "";
    if (!serialNumber) throw new LedgerError("Serial number is required", 400);
    return serialNumber;
};

// The license / installation an action is for, locked, with the sale it is on. Members may only
// act on their own branch's sales; anything else looks missing.
const loadLicense = async (serialNumber, scope, transaction) => {
    const unit = await SerialUnit.findOne({ where: { serialNumber }, transaction, lock: transaction.LOCK.UPDATE });
    if (!unit) throw new LedgerError("Serial number not found", 404);
    if (unit.productType !== PRODUCT_TYPE.SOFTWARE && unit.productType !== PRODUCT_TYPE.SERVICE) {
        throw new LedgerError("Installations, activations and renewals apply to software licenses and installation services only", 400);
    }
    const sale = unit.currentSaleId ? await Sale.findByPk(unit.currentSaleId, { transaction }) : null;
    if (!scope.isAdmin && (!sale || sale.branchId !== scope.branchId)) throw new LedgerError("Serial number not found", 404);
    return { unit, sale };
};

// History fields shared by the lifecycle events of a license on its current sale
const holderFields = async (unit, sale, transaction) => {
    const names = await branchNames([sale.branchId], transaction);
    return {
        serialUnitId: unit.id,
        branchId: sale.branchId, branchName: names.get(sale.branchId) ?? null,
        partyName: sale.customerName, customerId: sale.customerId, customerPhone: sale.customerPhone,
        reference: saleReference(sale.id), saleId: sale.id,
    };
};

// Body: { serialNumber, installationDate, deviceName?, technicianName?, activate?, expiryDate?, note? }
// A sold license or installation service is installed for its customer. Software can be
// activated at the same time (Active, with an optional expiry date); otherwise it is Installed
// and activated later. Services end as Installed.
exports.install = async (req, res) => {
    try {
        const body = req.body || {};
        const serialNumber = serialFrom(body);
        const installationDate = pastDate(body.installationDate, "Installation date");
        const deviceName = parseNote(body.deviceName, "Device name", MAX_TEXT);
        const technicianName = parseNote(body.technicianName, "Technician", MAX_TEXT) ?? req.employee.name;
        const note = parseNote(body.note);
        if (body.activate !== undefined && typeof body.activate !== "boolean") throw new LedgerError("Invalid activation choice", 400);
        const expiryDate = isSent(body.expiryDate) ? anyDate(body.expiryDate, "Expiry date") : null;

        const result = await sequelize.transaction(async (transaction) => {
            const { unit, sale } = await loadLicense(serialNumber, req.branchScope, transaction);
            if (unit.status !== UNIT_STATUS.SOLD || !sale) {
                throw new LedgerError(`${unit.serialNumber} can't be installed now (it is ${effectiveStatus(unit).toLowerCase()})`, 409);
            }
            if (installationDate < sale.saleDate) throw new LedgerError("Installation date can't be before the sale date", 400);
            const isLicense = unit.productType === PRODUCT_TYPE.SOFTWARE;
            const activate = isLicense && body.activate === true;
            if (!isLicense && (body.activate === true || expiryDate)) throw new LedgerError("Installation services aren't activated and have no expiry", 400);
            if (expiryDate && !activate) throw new LedgerError("Set the expiry date when the license is activated", 400);
            if (expiryDate && expiryDate <= installationDate) throw new LedgerError("Expiry date must be after the activation date", 400);

            const common = await holderFields(unit, sale, transaction);
            const status = activate ? UNIT_STATUS.ACTIVE : UNIT_STATUS.INSTALLED;
            await unit.update({
                status, installationDate, deviceName, technicianName,
                activationDate: activate ? installationDate : null, expiryDate: activate ? expiryDate : null,
            }, { transaction });
            await SerialEvent.create({
                ...common, type: EVENT.INSTALLATION, eventDate: installationDate, status: UNIT_STATUS.INSTALLED,
                deviceName, technicianName, note, createdBy: req.employee.id,
            }, { transaction });
            if (activate) {
                await SerialEvent.create({
                    ...common, type: EVENT.ACTIVATION, eventDate: installationDate, status: UNIT_STATUS.ACTIVE,
                    expiryDate, note: expiryDate ? `Valid until ${expiryDate}` : "Activated with no expiry date", createdBy: req.employee.id,
                }, { transaction });
            }
            return { serialNumber: unit.serialNumber, status };
        });
        return sendSuccess(res, `${result.serialNumber} ${result.status === UNIT_STATUS.ACTIVE ? "installed and activated" : "installed"}`, result, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};

// Body: { serialNumber, activationDate, expiryDate?, note? }. An installed license becomes Active.
exports.activate = async (req, res) => {
    try {
        const body = req.body || {};
        const serialNumber = serialFrom(body);
        const activationDate = pastDate(body.activationDate, "Activation date");
        const expiryDate = isSent(body.expiryDate) ? anyDate(body.expiryDate, "Expiry date") : null;
        const note = parseNote(body.note);

        const result = await sequelize.transaction(async (transaction) => {
            const { unit, sale } = await loadLicense(serialNumber, req.branchScope, transaction);
            if (unit.productType !== PRODUCT_TYPE.SOFTWARE) throw new LedgerError("Only software licenses are activated", 400);
            if (unit.status !== UNIT_STATUS.INSTALLED || !sale) {
                throw new LedgerError(`${unit.serialNumber} can't be activated now (it is ${effectiveStatus(unit).toLowerCase()})`, 409);
            }
            if (unit.installationDate && activationDate < unit.installationDate) throw new LedgerError("Activation date can't be before the installation date", 400);
            if (expiryDate && expiryDate <= activationDate) throw new LedgerError("Expiry date must be after the activation date", 400);

            const common = await holderFields(unit, sale, transaction);
            await unit.update({ status: UNIT_STATUS.ACTIVE, activationDate, expiryDate }, { transaction });
            await SerialEvent.create({
                ...common, type: EVENT.ACTIVATION, eventDate: activationDate, status: UNIT_STATUS.ACTIVE, expiryDate,
                note: [expiryDate ? `Valid until ${expiryDate}` : "Activated with no expiry date", note].filter(Boolean).join(". "),
                createdBy: req.employee.id,
            }, { transaction });
            return { serialNumber: unit.serialNumber };
        });
        return sendSuccess(res, `${result.serialNumber} activated`, result, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};

// Body: { serialNumber, renewalDate, expiryDate, amount, note? }. An active (or expired) license
// gets a new expiry date. A paid renewal is saved as a sale of type Renewal for the same customer
// and branch, so its revenue is in Sales and the ledger like any other sale; deleting that sale
// cancels the renewal. The license itself stays the same record.
exports.renew = async (req, res) => {
    try {
        const body = req.body || {};
        const serialNumber = serialFrom(body);
        const renewalDate = pastDate(body.renewalDate, "Renewal date");
        const expiryDate = anyDate(body.expiryDate, "New expiry date");
        const note = parseNote(body.note);
        const raw = typeof body.amount === "string" && body.amount.trim() !== "" ? Number(body.amount) : body.amount;
        const amount = isSent(raw) ? raw : 0;
        if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) throw new LedgerError("Renewal amount must be 0 or more", 400);
        if (amount > MAX_AMOUNT || !/^\d+(\.\d{1,2})?$/.test(String(amount))) throw new LedgerError("Invalid renewal amount", 400);

        const result = await sequelize.transaction(async (transaction) => {
            const { unit, sale } = await loadLicense(serialNumber, req.branchScope, transaction);
            if (unit.productType !== PRODUCT_TYPE.SOFTWARE) throw new LedgerError("Only software licenses are renewed", 400);
            if (unit.status !== UNIT_STATUS.ACTIVE || !sale) {
                throw new LedgerError(`${unit.serialNumber} can't be renewed now (it is ${effectiveStatus(unit).toLowerCase()}). Only active or expired licenses are renewed.`, 409);
            }
            if (unit.activationDate && renewalDate < unit.activationDate) throw new LedgerError("Renewal date can't be before the activation date", 400);
            if (expiryDate <= renewalDate) throw new LedgerError("New expiry date must be after the renewal date", 400);
            if (unit.expiryDate && expiryDate <= unit.expiryDate) throw new LedgerError(`New expiry date must be after the current one (${unit.expiryDate})`, 400);

            const branch = await Branch.findByPk(sale.branchId, { transaction });
            if (!branch?.isActive) throw new LedgerError("The license's branch is inactive, so a renewal can't be recorded there", 400);

            // The renewal's own sale; free renewals only extend the validity
            const renewalSale = amount > 0 ? await Sale.create({
                branchId: sale.branchId,
                productId: unit.productId,
                productName: unit.productName,
                customerId: sale.customerId,
                customerName: sale.customerName,
                customerPhone: sale.customerPhone,
                serialNumbers: [unit.serialNumber],
                quantity: 1,
                sellingAmount: amount,
                saleDate: renewalDate,
                saleType: SALE_TYPE.RENEWAL,
                createdBy: req.employee.id,
            }, { transaction }) : null;

            const previous = unit.expiryDate;
            await unit.update({ expiryDate }, { transaction });
            const common = await holderFields(unit, sale, transaction);
            await SerialEvent.create({
                ...common,
                ...(renewalSale ? { reference: saleReference(renewalSale.id), saleId: renewalSale.id } : {}),
                type: EVENT.RENEWAL, eventDate: renewalDate, status: UNIT_STATUS.ACTIVE, expiryDate,
                sellingAmount: amount,
                note: [`Valid until ${expiryDate}${previous ? ` (was ${previous})` : ""}`, renewalSale ? null : "Free renewal", note].filter(Boolean).join(". "),
                createdBy: req.employee.id,
            }, { transaction });
            return { serialNumber: unit.serialNumber, expiryDate, saleId: renewalSale?.id ?? null };
        });
        return sendSuccess(res, `${result.serialNumber} renewed until ${result.expiryDate}`, result, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};

// Body: { serialNumber, date, reason }. A license or installation with its customer is cancelled
// / deactivated. Its sales and history stay; it is never sold again unless an admin later
// releases it (and the product's license terms allow reassignment).
exports.deactivate = async (req, res) => {
    try {
        const body = req.body || {};
        const serialNumber = serialFrom(body);
        const date = pastDate(body.date, "Cancellation date");
        const reason = parseNote(body.reason, "Reason", MAX_NOTE, true);

        const result = await sequelize.transaction(async (transaction) => {
            const { unit, sale } = await loadLicense(serialNumber, req.branchScope, transaction);
            if (!HELD_STATUSES.includes(unit.status) || !sale) {
                throw new LedgerError(`${unit.serialNumber} can't be cancelled now (it is ${effectiveStatus(unit).toLowerCase()})`, 409);
            }
            const common = await holderFields(unit, sale, transaction);
            await unit.update({ status: UNIT_STATUS.CANCELLED, currentSaleId: null }, { transaction });
            await SerialEvent.create({
                ...common, type: EVENT.CANCELLED, eventDate: date, status: UNIT_STATUS.CANCELLED, expiryDate: unit.expiryDate,
                note: `${unit.productType === PRODUCT_TYPE.SERVICE ? "Installation cancelled" : "License deactivated"}. ${reason}`,
                createdBy: req.employee.id,
            }, { transaction });
            return { serialNumber: unit.serialNumber };
        });
        return sendSuccess(res, `${result.serialNumber} cancelled`, result, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};

// Makes sure a branch lists the product (quantity 0), so its licenses can be sold there
const ensureOffered = async (productId, branchId, transaction) => {
    if (!productId) return;
    const stock = await ProductStock.findOne({ where: { productId, branchId }, transaction });
    if (!stock) await ProductStock.create({ productId, branchId, quantity: 0 }, { transaction });
};

// Admins only. Body: { serialNumber, branchId?, note? }. A cancelled license goes back into a
// license pool (its own branch by default) to be sold again, only when the product's license
// terms allow reassignment.
exports.release = async (req, res) => {
    try {
        const scope = req.branchScope;
        if (!scope.isAdmin) return sendError(res, "Only an admin can release a license for reassignment", null, 403);
        const body = req.body || {};
        const serialNumber = serialFrom(body);
        const note = parseNote(body.note);
        const requestedBranchId = isSent(body.branchId) ? parseId(body.branchId) : null;
        if (isSent(body.branchId) && !requestedBranchId) throw new LedgerError("Invalid branch", 400);

        const result = await sequelize.transaction(async (transaction) => {
            const unit = await SerialUnit.findOne({ where: { serialNumber }, transaction, lock: transaction.LOCK.UPDATE });
            if (!unit) throw new LedgerError("Serial number not found", 404);
            if (unit.productType !== PRODUCT_TYPE.SOFTWARE || unit.status !== UNIT_STATUS.CANCELLED) {
                throw new LedgerError("Only cancelled software licenses can be released for reassignment", 409);
            }
            const product = unit.productId ? await Product.findByPk(unit.productId, { transaction }) : null;
            if (!product) throw new LedgerError(`${unit.productName} has been removed from the products list`, 409);
            if (!product.licenseReassignable) throw new LedgerError(`${product.name}'s license terms don't allow reassignment`, 409);
            const branchId = requestedBranchId ?? unit.branchId;
            const branch = branchId ? await Branch.findByPk(branchId, { transaction }) : null;
            if (!branch || !branch.isActive) throw new LedgerError("Choose an active branch for the license pool", 400);

            await ensureOffered(product.id, branch.id, transaction);
            await unit.update({ status: UNIT_STATUS.AVAILABLE, branchId: branch.id, currentSaleId: null, ...NO_INSTALLATION }, { transaction });
            await SerialEvent.create({
                serialUnitId: unit.id, type: EVENT.RELEASED, eventDate: localDate(), branchId: branch.id, branchName: branch.name,
                status: UNIT_STATUS.AVAILABLE, note: [`Back in ${branch.name}'s license pool`, note].filter(Boolean).join(". "),
                createdBy: req.employee.id,
            }, { transaction });
            return { serialNumber: unit.serialNumber, branchName: branch.name };
        });
        return sendSuccess(res, `${result.serialNumber} is available for reassignment in ${result.branchName}`, result, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};

// Admins only. Body: { serialNumber, toBranchId, transferDate?, note? }. Moves an available unit
// to another branch, recorded as a Branch Transfer: a physical unit takes one unit of stock with
// it; a license only moves between license pools (no stock).
exports.transfer = async (req, res) => {
    try {
        const scope = req.branchScope;
        if (!scope.isAdmin) return sendError(res, "Only an admin can transfer stock between branches", null, 403);
        const body = req.body || {};
        const serialNumber = typeof body.serialNumber === "string" ? body.serialNumber.trim() : "";
        if (!serialNumber) return sendError(res, "Serial number is required", null, 400);
        const toBranchId = parseId(body.toBranchId);
        if (!toBranchId) return sendError(res, isSent(body.toBranchId) ? "Invalid branch" : "Select the branch to transfer to", null, 400);
        const note = parseNote(body.note);
        let eventDate = localDate();
        if (isSent(body.transferDate)) {
            if (!DATE_REGEX.test(body.transferDate) || body.transferDate > localDate(new Date(Date.now() + 86400000))) {
                return sendError(res, "Invalid transfer date", null, 400);
            }
            eventDate = body.transferDate;
        }

        const result = await sequelize.transaction(async (transaction) => {
            const target = await Branch.findByPk(toBranchId, { transaction });
            if (!target) throw new LedgerError("Selected branch does not exist");
            if (!target.isActive) throw new LedgerError("Selected branch is inactive");

            const row = await ProductSerial.findOne({ where: { serialNumber }, transaction, lock: transaction.LOCK.UPDATE });
            let unit;
            let fromBranchId;
            if (row) {
                if (row.branchId === toBranchId) throw new LedgerError("The unit is already in that branch");
                const product = await Product.findByPk(row.productId, { transaction });
                const units = await ensureUnits([row.serialNumber], { kind: "stock", productId: row.productId, productName: product?.name ?? "", branchId: row.branchId }, { transaction, employeeId: req.employee.id });
                unit = units.get(row.serialNumber.toLowerCase());

                // Both stock rows locked in id order so two opposite transfers can't deadlock
                const stocks = await ProductStock.findAll({
                    where: { productId: row.productId, branchId: [row.branchId, toBranchId] },
                    order: [["id", "ASC"]],
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                const from = stocks.find((s) => s.branchId === row.branchId);
                const to = stocks.find((s) => s.branchId === toBranchId);
                if (!from || from.quantity < 1) throw new LedgerError("The source branch's stock count is out of step. Please check the product's stock.", 409);

                await from.update({ quantity: from.quantity - 1 }, { transaction });
                if (to) await to.update({ quantity: to.quantity + 1 }, { transaction });
                else await ProductStock.create({ productId: row.productId, branchId: toBranchId, quantity: 1 }, { transaction });
                fromBranchId = row.branchId;
                await row.update({ branchId: toBranchId }, { transaction });
            } else {
                // A license in a pool: no physical stock to move
                unit = await SerialUnit.findOne({ where: { serialNumber }, transaction, lock: transaction.LOCK.UPDATE });
                if (!unit || unit.productType !== PRODUCT_TYPE.SOFTWARE || unit.status !== UNIT_STATUS.AVAILABLE) {
                    throw new LedgerError(`${serialNumber} is not in stock or in a license pool, so it can't be transferred`, 409);
                }
                if (unit.branchId === toBranchId) throw new LedgerError("The license is already in that branch");
                fromBranchId = unit.branchId;
                await ensureOffered(unit.productId, toBranchId, transaction);
            }
            await unit.update({ branchId: toBranchId }, { transaction });

            const names = await branchNames([fromBranchId], transaction);
            await SerialEvent.create({
                serialUnitId: unit.id, type: EVENT.TRANSFER, eventDate,
                branchId: fromBranchId, branchName: names.get(fromBranchId) ?? null,
                toBranchId, toBranchName: target.name,
                status: UNIT_STATUS.AVAILABLE, note, createdBy: req.employee.id,
            }, { transaction });
            return { serialNumber: unit.serialNumber, from: names.get(fromBranchId) ?? null, to: target.name };
        });

        return sendSuccess(res, `${result.serialNumber} transferred from ${result.from ?? "its branch"} to ${result.to}`, result, 200);
    } catch (error) {
        return sendSerialError(res, error);
    }
};
