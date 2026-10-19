const { Op, UniqueConstraintError } = require("sequelize");
const sequelize = require("@/config/db");
const { sendError, sendSuccess } = require("@/helper/response");
const { escapeLike } = require("@/helper/customer");
const { LedgerError, parseId, isSent, parseAmount, parseEntryDate } = require("@/helper/ledger");
const { Branch, Employee, BranchPayment, BranchPaymentEvent } = require("@/models/index");

// Branch Payments: money one branch pays another (e.g. Pune -> Rajkot). Each transfer is ONE
// row with a paying and a receiving branch, so the payer's "sent" and the receiver's "received"
// come from the same record and company-wide totals count it once. Payments are kept apart from
// sales, income, expenses and every other money module; nothing here changes their totals.
//
// Every handler runs after loadBranchScope, so req.branchScope = { isAdmin, branchId } comes
// from the logged-in employee's record. A branchId in the request is never trusted on its own.
//
// Status workflow:
//  - Pending -> Completed: confirmed by an admin or an employee of the receiving branch.
//  - Pending -> Cancelled: an admin, or the member who recorded it.
//  - Completed -> Cancelled: admins only, with a reason (a reversal; the row is kept).
//  - Cancelled is final.
// Only Completed payments count toward sent / received / net totals. Rows are never deleted;
// every create, edit, completion and cancellation is written to branch_payment_event.
//
// Access:
//  - Admins see every payment, record payments between any two active branches (as Pending or
//    Completed), edit Pending and Completed payments (a Completed one needs a reason) and cancel.
//  - Branch members see only payments their branch sent or received. They record payments sent
//    by their own branch (always Pending, until the receiving branch confirms), and edit or
//    cancel only Pending payments they recorded themselves.

const STATUS = { PENDING: "Pending", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const STATUSES = Object.values(STATUS);
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "UPI", "Cheque", "Other"];
// Methods that always have a transaction / cheque number
const REFERENCE_REQUIRED = ["Cheque"];
const MAX_TEXT = 1000;
const MAX_REFERENCE = 100;
const REQUEST_KEY_REGEX = /^[A-Za-z0-9-]{8,64}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const NOT_FOUND = "Branch payment not found";

// Fields an edit can change; the audit trail records each one that did
const EDITABLE = ["paymentDate", "fromBranchId", "toBranchId", "amount", "paymentMethod", "referenceNumber", "notes"];

const PaymentError = LedgerError;

const paymentNo = (id) => `BP-${String(id).padStart(5, "0")}`;

const sendPaymentError = (res, error) => {
    if (error instanceof PaymentError) return sendError(res, error.message, null, error.status);
    if (error instanceof UniqueConstraintError) {
        return sendError(res, "This payment was already submitted. Please refresh the list.", null, 409);
    }
    return sendError(res, error.message, null, 500);
};

const parseText = (value, label, max, required = false) => {
    if (!isSent(value)) return required ? { error: `${label} is required` } : { value: null };
    if (typeof value !== "string") return { error: `Invalid ${label.toLowerCase()}` };
    const trimmed = value.trim();
    if (required && !trimmed) return { error: `${label} is required` };
    if (trimmed.length > max) return { error: `${label} must be at most ${max} characters` };
    return { value: trimmed || null };
};

const isValidDate = (value) => {
    if (typeof value !== "string" || !DATE_REGEX.test(value)) return false;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

// Who may do what with one payment. The list returns these flags so the UI only offers what
// the API will allow; every action checks them again.
const permissionsFor = (payment, scope, employeeId) => {
    const ownRecorded = !scope.isAdmin && payment.createdBy === employeeId && payment.fromBranchId === scope.branchId;
    const isPending = payment.status === STATUS.PENDING;
    const isCompleted = payment.status === STATUS.COMPLETED;
    return {
        canEdit: (scope.isAdmin && (isPending || isCompleted)) || (ownRecorded && isPending),
        canComplete: isPending && (scope.isAdmin || payment.toBranchId === scope.branchId),
        canCancel: (isPending && (scope.isAdmin || ownRecorded)) || (isCompleted && scope.isAdmin),
    };
};

// Members only ever find payments their branch sent or received; any other id looks missing
const visibleWhere = (scope) =>
    scope.isAdmin ? {} : { [Op.or]: [{ fromBranchId: scope.branchId }, { toBranchId: scope.branchId }] };

const findScoped = (id, scope, options = {}) =>
    BranchPayment.findOne({ ...options, where: { [Op.and]: [{ id }, visibleWhere(scope)] } });

const PAYMENT_INCLUDE = [
    { model: Branch, as: "fromBranch", attributes: ["id", "name"], required: false },
    { model: Branch, as: "toBranch", attributes: ["id", "name"], required: false },
    { model: Employee, as: "creator", attributes: ["id", "name"], required: false },
    { model: Employee, as: "updater", attributes: ["id", "name"], required: false },
    { model: Employee, as: "completer", attributes: ["id", "name"], required: false },
    { model: Employee, as: "canceller", attributes: ["id", "name"], required: false },
];

const toResponse = (payment, scope, employeeId) => ({
    id: payment.id,
    paymentNo: paymentNo(payment.id),
    paymentDate: payment.paymentDate,
    fromBranchId: payment.fromBranchId,
    fromBranchName: payment.fromBranch?.name ?? null,
    toBranchId: payment.toBranchId,
    toBranchName: payment.toBranch?.name ?? null,
    amount: Number(payment.amount),
    paymentMethod: payment.paymentMethod,
    referenceNumber: payment.referenceNumber,
    notes: payment.notes,
    status: payment.status,
    createdBy: payment.createdBy,
    createdByName: payment.creator?.name ?? null,
    updatedByName: payment.updater?.name ?? null,
    completedByName: payment.completer?.name ?? null,
    completedAt: payment.completedAt,
    cancelledByName: payment.canceller?.name ?? null,
    cancelledAt: payment.cancelledAt,
    cancelReason: payment.cancelReason,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    ...permissionsFor(payment, scope, employeeId),
});

// Shared body validation for create and edit. Returns { error, status } or { values }.
const parseBody = (scope, body) => {
    const { paymentDate, fromBranchId, toBranchId, amount, paymentMethod, referenceNumber, notes } = body || {};

    const date = parseEntryDate(paymentDate);
    if (date.error) return { error: date.error === "Date is required" ? "Payment date is required" : date.error };

    const from = parseId(fromBranchId);
    const to = parseId(toBranchId);
    if (!from) return { error: isSent(fromBranchId) ? "Invalid paying branch" : "Paying branch is required" };
    if (!to) return { error: isSent(toBranchId) ? "Invalid receiving branch" : "Receiving branch is required" };
    if (from === to) return { error: "Paying and receiving branches must be different" };
    if (!scope.isAdmin && from !== scope.branchId) {
        return { error: "You can only record payments sent by your own branch", status: 403 };
    }

    const parsedAmount = parseAmount(amount);
    if (parsedAmount.error) return { error: parsedAmount.error };

    const method = typeof paymentMethod === "string"
        ? PAYMENT_METHODS.find((m) => m.toLowerCase() === paymentMethod.trim().toLowerCase())
        : null;
    if (!method) return { error: isSent(paymentMethod) ? "Invalid payment method" : "Payment method is required" };

    const reference = parseText(referenceNumber, "Reference number", MAX_REFERENCE, REFERENCE_REQUIRED.includes(method));
    if (reference.error) return { error: method === "Cheque" && !isSent(referenceNumber) ? "Cheque number is required" : reference.error };

    const parsedNotes = parseText(notes, "Notes", MAX_TEXT);
    if (parsedNotes.error) return { error: parsedNotes.error };

    return {
        values: {
            paymentDate: date.value,
            fromBranchId: from,
            toBranchId: to,
            amount: parsedAmount.value,
            paymentMethod: method,
            referenceNumber: reference.value,
            notes: parsedNotes.value,
        },
    };
};

// Both branches must exist; a new payment (or a branch an edit moves it to) must be active
const checkBranches = async (values, transaction, existing = null) => {
    const branches = await Branch.findAll({ where: { id: [values.fromBranchId, values.toBranchId] }, transaction });
    for (const [id, label, current] of [
        [values.fromBranchId, "Paying", existing?.fromBranchId],
        [values.toBranchId, "Receiving", existing?.toBranchId],
    ]) {
        const branch = branches.find((b) => b.id === id);
        if (!branch) throw new PaymentError(`${label} branch does not exist`);
        if (!branch.isActive && id !== current) throw new PaymentError(`${label} branch ${branch.name} is inactive`);
    }
};

const logEvent = (payment, action, { statusBefore = null, changes = null, note = null }, employee, transaction) =>
    BranchPaymentEvent.create({
        branchPaymentId: payment.id,
        action,
        statusBefore,
        statusAfter: payment.status,
        changes,
        note,
        createdBy: employee.id,
        createdByName: employee.name,
    }, { transaction });

// Comparable form of a field, so 50000 and "50000.00" are the same amount
const comparable = (field, value) => {
    if (value === null || value === undefined) return null;
    return field === "amount" ? Number(value).toFixed(2) : String(value);
};

// Filters for the list and the export. Returns { error, status } or { where }.
//  - branchId: payments the branch sent or received (members: always their own branch);
//    direction "sent" / "received" narrows to one side.
//  - startDate / endDate: inclusive payment date range.
//  - status: one status.
//  - search: branch name, reference number, notes or payment number (BP-00012).
const buildDateWhere = (query) => {
    const { startDate, endDate } = query;
    if (isSent(startDate) && !isValidDate(startDate)) return { error: "Invalid start date" };
    if (isSent(endDate) && !isValidDate(endDate)) return { error: "Invalid end date" };
    if (isSent(startDate) && isSent(endDate) && startDate > endDate) return { error: "Start date must be on or before end date" };
    if (!isSent(startDate) && !isSent(endDate)) return { where: null, startDate: null, endDate: null };
    const where = {};
    if (isSent(startDate)) where[Op.gte] = startDate;
    if (isSent(endDate)) where[Op.lte] = endDate;
    return { where, startDate: startDate || null, endDate: endDate || null };
};

// Branch the request is narrowed to: members always get their own branch (another one is
// refused), admins may pick one or get every branch (null).
const scopedBranchId = (scope, requested) => {
    if (!scope.isAdmin) {
        if (isSent(requested) && parseId(requested) !== scope.branchId) {
            return { error: "You can only view payments of your own branch", status: 403 };
        }
        return { branchId: scope.branchId };
    }
    if (!isSent(requested)) return { branchId: null };
    const branchId = parseId(requested);
    return branchId ? { branchId } : { error: "Invalid branch", status: 400 };
};

const buildListWhere = (scope, query) => {
    const and = [];

    const scoped = scopedBranchId(scope, query.branchId);
    if (scoped.error) return scoped;
    const direction = isSent(query.direction) ? String(query.direction) : "all";
    if (!["all", "sent", "received"].includes(direction)) return { error: "Invalid direction" };
    if (scoped.branchId) {
        if (direction === "sent") and.push({ fromBranchId: scoped.branchId });
        else if (direction === "received") and.push({ toBranchId: scoped.branchId });
        else and.push({ [Op.or]: [{ fromBranchId: scoped.branchId }, { toBranchId: scoped.branchId }] });
    }

    const dates = buildDateWhere(query);
    if (dates.error) return dates;
    if (dates.where) and.push({ paymentDate: dates.where });

    if (isSent(query.status)) {
        const status = STATUSES.find((s) => s.toLowerCase() === String(query.status).toLowerCase());
        if (!status) return { error: "Invalid status" };
        and.push({ status });
    }

    const search = typeof query.search === "string" ? query.search.trim() : "";
    if (search) {
        const like = { [Op.like]: `%${escapeLike(search)}%` };
        const or = [
            { referenceNumber: like },
            { notes: like },
            { "$fromBranch.name$": like },
            { "$toBranch.name$": like },
        ];
        const no = search.match(/^bp-?0*(\d+)$/i);
        if (no) or.push({ id: Number(no[1]) });
        and.push({ [Op.or]: or });
    }

    return { where: { [Op.and]: and }, branchId: scoped.branchId };
};

// Branches for the form and filters. Members get every branch too (names only), since they pick
// the receiving branch; their own branch is ownBranchId.
exports.options = async (req, res) => {
    try {
        const { isAdmin, branchId } = req.branchScope;
        const branches = await Branch.findAll({ attributes: ["id", "name", "isActive"], order: [["name", "ASC"]] });

        if (!isAdmin && !branches.some((b) => b.id === branchId)) {
            return sendError(res, "Your assigned branch no longer exists. Contact your administrator.", null, 400);
        }

        const data = {
            isAdmin,
            ownBranchId: req.employee.branchId ?? null,
            branch: branches,
            paymentMethods: PAYMENT_METHODS,
            referenceRequired: REFERENCE_REQUIRED,
            statuses: STATUSES,
            // Members' new payments always start Pending
            createStatuses: isAdmin ? [STATUS.PENDING, STATUS.COMPLETED] : [STATUS.PENDING],
        };
        return sendSuccess(res, "Branch payment options...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

exports.list = async (req, res) => {
    try {
        const scope = req.branchScope;
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 500);
        const offset = (page - 1) * pageSize;

        const filter = buildListWhere(scope, req.query);
        if (filter.error) return sendError(res, filter.error, null, filter.status ?? 400);

        const { count, rows } = await BranchPayment.findAndCountAll({
            where: filter.where,
            include: PAYMENT_INCLUDE,
            order: [["paymentDate", "DESC"], ["id", "DESC"]],
            limit: pageSize,
            offset,
            distinct: true,
            subQuery: false,
        });

        const data = {
            payment: rows.map((row) => toResponse(row, scope, req.employee.id)),
            pagination: { total: count, page, pageSize, totalPages: Math.ceil(count / pageSize) },
        };
        return sendSuccess(res, "All branch payments...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// Totals from the stored payments for a date range and (optionally) one branch.
//  - Per branch: sent and received (Completed only), net = received - sent, and the number of
//    completed / pending / cancelled payments the branch is part of.
//  - Overall: each payment counted ONCE (a transfer between two branches is not added twice).
//    With a branch picked, sent / received are that branch's.
exports.summary = async (req, res) => {
    try {
        const scope = req.branchScope;
        const scoped = scopedBranchId(scope, req.query.branchId);
        if (scoped.error) return sendError(res, scoped.error, null, scoped.status ?? 400);
        const dates = buildDateWhere(req.query);
        if (dates.error) return sendError(res, dates.error, null, 400);

        const dateWhere = dates.where ? { paymentDate: dates.where } : {};
        const groupBy = (column) => BranchPayment.findAll({
            where: dateWhere,
            attributes: [
                column,
                "status",
                [sequelize.fn("SUM", sequelize.col("amount")), "total"],
                [sequelize.fn("COUNT", sequelize.col("id")), "count"],
            ],
            group: [column, "status"],
            raw: true,
        });

        const involving = scoped.branchId
            ? { [Op.or]: [{ fromBranchId: scoped.branchId }, { toBranchId: scoped.branchId }] }
            : {};

        const [sentRows, receivedRows, overallRows, branches] = await Promise.all([
            groupBy("fromBranchId"),
            groupBy("toBranchId"),
            BranchPayment.findAll({
                where: { ...dateWhere, ...involving },
                attributes: ["status", [sequelize.fn("SUM", sequelize.col("amount")), "total"], [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
                group: ["status"],
                raw: true,
            }),
            Branch.findAll({
                where: scoped.branchId ? { id: scoped.branchId } : {},
                attributes: ["id", "name", "isActive"],
                order: [["name", "ASC"]],
                raw: true,
            }),
        ]);

        // Amounts are added in paise so many 2-decimal amounts don't drift
        const paise = (n) => Math.round(Number(n || 0) * 100);
        const index = (rows, column) => {
            const map = new Map();
            for (const r of rows) map.set(`${r[column]}:${r.status}`, { total: paise(r.total), count: Number(r.count) || 0 });
            return (branchId, status) => map.get(`${branchId}:${status}`) ?? { total: 0, count: 0 };
        };
        const sent = index(sentRows, "fromBranchId");
        const received = index(receivedRows, "toBranchId");

        const branch = branches.map((b) => {
            const s = sent(b.id, STATUS.COMPLETED);
            const r = received(b.id, STATUS.COMPLETED);
            // A branch is on one side of a payment only, so adding both sides never counts one twice
            const both = (status) => sent(b.id, status).count + received(b.id, status).count;
            return {
                branchId: b.id,
                branchName: b.name,
                isActive: !!b.isActive,
                sent: s.total / 100,
                received: r.total / 100,
                net: (r.total - s.total) / 100,
                sentCount: s.count,
                receivedCount: r.count,
                completedCount: both(STATUS.COMPLETED),
                pendingCount: both(STATUS.PENDING),
                cancelledCount: both(STATUS.CANCELLED),
                pendingSent: sent(b.id, STATUS.PENDING).total / 100,
                pendingReceived: received(b.id, STATUS.PENDING).total / 100,
            };
        });

        const overall = (status) => {
            const row = overallRows.find((r) => r.status === status);
            return { amount: paise(row?.total) / 100, count: Number(row?.count) || 0 };
        };
        const completed = overall(STATUS.COMPLETED);
        const selected = scoped.branchId ? branch[0] : null;

        const data = {
            branchId: scoped.branchId,
            // With a branch: that branch's side. Without: every completed transfer once, which is
            // both what was sent and what was received company-wide.
            totalSent: selected ? selected.sent : completed.amount,
            totalReceived: selected ? selected.received : completed.amount,
            net: selected ? selected.net : 0,
            completed,
            pending: overall(STATUS.PENDING),
            cancelled: overall(STATUS.CANCELLED),
            branch,
            startDate: dates.startDate,
            endDate: dates.endDate,
        };
        return sendSuccess(res, "Branch payment summary...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

// One payment with its full audit trail
exports.details = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid id", null, 400);

        const payment = await findScoped(id, scope, { include: PAYMENT_INCLUDE });
        if (!payment) return sendError(res, NOT_FOUND, null, 404);

        const events = await BranchPaymentEvent.findAll({
            where: { branchPaymentId: id },
            include: [{ model: Employee, as: "creator", attributes: ["id", "name"], required: false }],
            order: [["id", "ASC"]],
        });

        const data = {
            ...toResponse(payment, scope, req.employee.id),
            events: events.map((e) => ({
                id: e.id,
                action: e.action,
                statusBefore: e.statusBefore,
                statusAfter: e.statusAfter,
                changes: e.changes,
                note: e.note,
                createdByName: e.creator?.name ?? e.createdByName,
                createdAt: e.createdAt,
            })),
        };
        return sendSuccess(res, "Branch payment details...", data, 200);
    } catch (error) {
        return sendError(res, error.message, null, 500);
    }
};

exports.create = async (req, res) => {
    try {
        const scope = req.branchScope;
        const parsed = parseBody(scope, req.body);
        if (parsed.error) return sendError(res, parsed.error, null, parsed.status ?? 400);
        const { values } = parsed;

        let status = STATUS.PENDING;
        if (isSent(req.body.status)) {
            status = STATUSES.find((s) => s.toLowerCase() === String(req.body.status).toLowerCase());
            if (!status || status === STATUS.CANCELLED) return sendError(res, "A new payment can be Pending or Completed", null, 400);
            if (status === STATUS.COMPLETED && !scope.isAdmin) {
                return sendError(res, "Your payment is saved as Pending until the receiving branch confirms it", null, 400);
            }
        }

        const requestKey = isSent(req.body.requestKey) ? String(req.body.requestKey) : null;
        if (requestKey && !REQUEST_KEY_REGEX.test(requestKey)) return sendError(res, "Invalid request key", null, 400);

        // A repeated submission (double click, retry after a timeout) returns the saved payment
        if (requestKey) {
            const existing = await BranchPayment.findOne({ where: { requestKey } });
            if (existing) {
                if (existing.createdBy !== req.employee.id) return sendError(res, "Invalid request key", null, 400);
                return sendSuccess(res, "Payment already saved", { id: existing.id, paymentNo: paymentNo(existing.id), duplicate: true }, 200);
            }
        }

        const payment = await sequelize.transaction(async (transaction) => {
            await checkBranches(values, transaction);
            const now = new Date();
            const created = await BranchPayment.create({
                ...values,
                status,
                requestKey,
                createdBy: req.employee.id,
                ...(status === STATUS.COMPLETED && { completedBy: req.employee.id, completedAt: now }),
            }, { transaction });
            await logEvent(created, "Created", { changes: Object.fromEntries(EDITABLE.map((f) => [f, { from: null, to: comparable(f, values[f]) }])) }, req.employee, transaction);
            return created;
        });

        return sendSuccess(res, "Branch payment added successfully", { id: payment.id, paymentNo: paymentNo(payment.id) }, 201);
    } catch (error) {
        // Two identical submissions raced past the lookup; the unique key let only one in
        if (error instanceof UniqueConstraintError && isSent(req.body?.requestKey)) {
            const existing = await BranchPayment.findOne({ where: { requestKey: String(req.body.requestKey) } }).catch(() => null);
            if (existing) return sendSuccess(res, "Payment already saved", { id: existing.id, paymentNo: paymentNo(existing.id), duplicate: true }, 200);
        }
        return sendPaymentError(res, error);
    }
};

// Edits the details, never the status (Complete / Cancel do that). Correcting a Completed payment
// is admin only and needs a reason; totals follow at once since they are read from the rows.
exports.update = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid id", null, 400);

        const parsed = parseBody(scope, req.body);
        if (parsed.error) return sendError(res, parsed.error, null, parsed.status ?? 400);
        const { values } = parsed;
        const reason = parseText(req.body.reason, "Reason", MAX_TEXT);
        if (reason.error) return sendError(res, reason.error, null, 400);

        const result = await sequelize.transaction(async (transaction) => {
            const payment = await findScoped(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (!payment) throw new PaymentError(NOT_FOUND, 404);
            if (!permissionsFor(payment, scope, req.employee.id).canEdit) {
                throw new PaymentError(payment.status === STATUS.CANCELLED
                    ? "A cancelled payment can't be edited"
                    : payment.status === STATUS.COMPLETED
                        ? "Only an admin can correct a completed payment"
                        : "You can only edit pending payments you recorded", 403);
            }
            if (payment.status === STATUS.COMPLETED && !reason.value) {
                throw new PaymentError("Add a reason for correcting a completed payment");
            }

            const changes = {};
            for (const field of EDITABLE) {
                const from = comparable(field, payment[field]);
                const to = comparable(field, values[field]);
                if (from !== to) changes[field] = { from, to };
            }
            if (Object.keys(changes).length === 0) return { changed: false };

            await checkBranches(values, transaction, payment);
            await payment.update({ ...values, updatedBy: req.employee.id }, { transaction });
            await logEvent(payment, "Updated", { statusBefore: payment.status, changes, note: reason.value }, req.employee, transaction);
            return { changed: true };
        });

        return sendSuccess(res, result.changed ? "Branch payment updated successfully" : "Nothing changed", { id }, 200);
    } catch (error) {
        return sendPaymentError(res, error);
    }
};

// Pending -> Completed. Done once, with the row locked, so a second click changes nothing.
exports.complete = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid id", null, 400);
        const note = parseText(req.body?.note, "Note", MAX_TEXT);
        if (note.error) return sendError(res, note.error, null, 400);

        await sequelize.transaction(async (transaction) => {
            const payment = await findScoped(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (!payment) throw new PaymentError(NOT_FOUND, 404);
            if (payment.status !== STATUS.PENDING) throw new PaymentError(`This payment is already ${payment.status.toLowerCase()}`, 409);
            if (!permissionsFor(payment, scope, req.employee.id).canComplete) {
                throw new PaymentError("Only an admin or the receiving branch can confirm this payment", 403);
            }
            await payment.update({ status: STATUS.COMPLETED, completedBy: req.employee.id, completedAt: new Date() }, { transaction });
            await logEvent(payment, "Completed", { statusBefore: STATUS.PENDING, note: note.value }, req.employee, transaction);
        });

        return sendSuccess(res, "Payment marked as completed", { id }, 200);
    } catch (error) {
        return sendPaymentError(res, error);
    }
};

// Pending or Completed -> Cancelled, with a reason. The payment stays on record but stops counting.
exports.cancel = async (req, res) => {
    try {
        const scope = req.branchScope;
        const id = parseId(req.params.id);
        if (!id) return sendError(res, "Invalid id", null, 400);
        const reason = parseText(req.body?.reason, "Reason for cancelling", MAX_TEXT, true);
        if (reason.error) return sendError(res, reason.error, null, 400);

        await sequelize.transaction(async (transaction) => {
            const payment = await findScoped(id, scope, { transaction, lock: transaction.LOCK.UPDATE });
            if (!payment) throw new PaymentError(NOT_FOUND, 404);
            if (payment.status === STATUS.CANCELLED) throw new PaymentError("This payment is already cancelled", 409);
            if (!permissionsFor(payment, scope, req.employee.id).canCancel) {
                throw new PaymentError(payment.status === STATUS.COMPLETED
                    ? "Only an admin can cancel a completed payment"
                    : "You can only cancel pending payments you recorded", 403);
            }
            const statusBefore = payment.status;
            await payment.update({
                status: STATUS.CANCELLED,
                cancelledBy: req.employee.id,
                cancelledAt: new Date(),
                cancelReason: reason.value,
            }, { transaction });
            await logEvent(payment, "Cancelled", { statusBefore, note: reason.value }, req.employee, transaction);
        });

        return sendSuccess(res, "Payment cancelled", { id }, 200);
    } catch (error) {
        return sendPaymentError(res, error);
    }
};

exports.STATUS = STATUS;
exports.PAYMENT_METHODS = PAYMENT_METHODS;
