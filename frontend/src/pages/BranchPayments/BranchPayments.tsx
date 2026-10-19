import { useCallback, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Ban, CheckCircle2, CircleAlert, Eye, Pencil } from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";
import type { IBranchPaymentModel, IBranchPaymentOptionsModel, IBranchPaymentResponseModel } from "@/models/BranchPayment";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import { branchPaymentService } from "@/services/branch-payment-service";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Textarea } from "@/components/formik-fields/Textarea";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import { DateToDisplayDate } from "@/util/DateFormate";
import BranchPaymentFilters from "./BranchPaymentFilters";
import BranchPaymentSummary from "./BranchPaymentSummary";
import AddBranchPaymentForm from "./AddBranchPaymentForm";
import BranchPaymentDetailsDialog from "./BranchPaymentDetailsDialog";
import { ALL, currency, defaultFilters, periodLabel, toFilterParams, type BranchPaymentFilterValues } from "./branchPaymentConfig";
import PaymentStatusBadge from "./PaymentStatusBadge";

const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<IBranchPaymentResponseModel>>): IBranchPaymentModel[] =>
    response.data.data.payment;

const actionButton = "inline-flex size-8 items-center justify-center rounded-lg transition-colors";
const EXPORT_PAGE_SIZE = 200;

const csvCell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const muted = (value: string | null) => value
    ? <span className="line-clamp-2" title={value}>{value}</span>
    : <span className="text-slate-400">—</span>;

interface ColumnHandlers {
    onView: (payment: IBranchPaymentModel) => void;
    onEdit: (payment: IBranchPaymentModel) => void;
    onComplete: (payment: IBranchPaymentModel) => void;
    onCancel: (payment: IBranchPaymentModel) => void;
}

// Actions are shown per row from the API's flags (canEdit / canComplete / canCancel).
// focusBranchId: with a branch picked, amounts are coloured as sent (out) or received (in).
const buildColumns = (focusBranchId: number | null, { onView, onEdit, onComplete, onCancel }: ColumnHandlers): TableColumn<IBranchPaymentModel>[] => [
    { id: "srNo", label: "Sr. No.", width: 80, renderCell: (_value, _row, _column, _rowIndex, serialNo) => serialNo },
    {
        id: "paymentDate",
        label: "Payment Date",
        sortable: true,
        renderCell: (value: string, row) => (
            <div className="whitespace-nowrap">
                <p>{DateToDisplayDate(value)}</p>
                <p className="text-xs text-slate-400">{row.paymentNo}</p>
            </div>
        ),
    },
    { id: "fromBranchName", label: "Paying Branch", sortable: true },
    {
        id: "toBranchName",
        label: "Receiving Branch",
        sortable: true,
        renderCell: (value: string) => <span className="inline-flex items-center gap-1.5"><ArrowRight className="size-3.5 text-slate-400" />{value}</span>,
    },
    {
        id: "amount",
        label: "Amount",
        align: "right",
        sortable: true,
        renderCell: (amount: number, row) => {
            const direction = focusBranchId === null ? null : row.fromBranchId === focusBranchId ? "out" : "in";
            return (
                <span className={clsx(
                    "font-medium tabular-nums",
                    row.status === "Cancelled" ? "text-slate-400 line-through" : direction === "out" ? "text-rose-700" : direction === "in" ? "text-emerald-700" : "text-slate-800",
                )}>
                    {direction === "out" ? "−" : direction === "in" ? "+" : ""}{currency.format(amount)}
                </span>
            );
        },
    },
    { id: "paymentMethod", label: "Payment Method", sortable: true },
    { id: "referenceNumber", label: "Transaction / Ref. No.", sortable: true, renderCell: muted },
    { id: "notes", label: "Notes", className: "min-w-48 max-w-80", renderCell: muted },
    { id: "createdByName", label: "Created By", sortable: true, renderCell: (name: string | null) => name ?? <span className="text-slate-400">—</span> },
    { id: "status", label: "Status", sortable: true, renderCell: (status: IBranchPaymentModel["status"]) => <PaymentStatusBadge status={status} /> },
    {
        id: "actions",
        label: "Actions",
        width: 150,
        hideable: false,
        renderCell: (_value, row) => (
            <div className="inline-flex items-center gap-1">
                <button type="button" title="View details" aria-label="View details" onClick={(e) => { e.stopPropagation(); onView(row); }}
                    className={clsx(actionButton, "text-slate-500 hover:bg-slate-100 hover:text-slate-700")}>
                    <Eye className="size-4" />
                </button>
                {row.canEdit && (
                    <button type="button" title={row.status === "Completed" ? "Correct payment" : "Edit"} aria-label="Edit" onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                        className={clsx(actionButton, "text-blue-500 hover:bg-blue-50 hover:text-blue-600")}>
                        <Pencil className="size-4" />
                    </button>
                )}
                {row.canComplete && (
                    <button type="button" title="Mark as completed (payment received)" aria-label="Mark as completed" onClick={(e) => { e.stopPropagation(); onComplete(row); }}
                        className={clsx(actionButton, "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700")}>
                        <CheckCircle2 className="size-4" />
                    </button>
                )}
                {row.canCancel && (
                    <button type="button" title="Cancel payment" aria-label="Cancel payment" onClick={(e) => { e.stopPropagation(); onCancel(row); }}
                        className={clsx(actionButton, "text-red-500 hover:bg-red-50 hover:text-red-600")}>
                        <Ban className="size-4" />
                    </button>
                )}
            </div>
        ),
    },
];

// Branch Payments: money one branch pays another. Totals, filters, the payments table, export,
// and the add / edit / view / complete / cancel dialogs. Access comes from the API (options and
// per-row flags), and every list, total and change is checked again by the API.
const BranchPayments = () => {
    const userId = useSelector((state: RootState) => state.auth.userId);

    const [filters, setFilters] = useState<BranchPaymentFilterValues>(defaultFilters);
    // Bumped to remount the filter form with filters picked elsewhere (a branch's History link)
    const [filterFormKey, setFilterFormKey] = useState(0);
    const [form, setForm] = useState<{ open: boolean; payment: IBranchPaymentModel | null }>({ open: false, payment: null });
    const [viewId, setViewId] = useState<number | null>(null);
    const [toComplete, setToComplete] = useState<IBranchPaymentModel | null>(null);
    const [toCancel, setToCancel] = useState<IBranchPaymentModel | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelError, setCancelError] = useState("");
    // Bumped after a change so the table, totals and an open details dialog reload
    const [refreshKey, setRefreshKey] = useState(0);
    const reload = () => setRefreshKey((key) => key + 1);

    const { data: options, isPending, isError, refetch, isFetching } = useQuery<IBranchPaymentOptionsModel>({
        queryKey: ["branch-payment-options", userId],
        queryFn: async () => {
            const response = await branchPaymentService.options();
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load your branch access.");
            return response.data.data;
        },
        retry: false,
    });

    const actionDone = (response: AxiosResponse<ApiResponseModel<unknown>> | undefined, close: () => void) => {
        // http-service shows its own toast and resolves undefined for handled API errors
        if (response?.data?.status) {
            toast.success(response.data.message);
            reload();
            close();
        }
    };

    const { mutate: completePayment, isPending: isCompleting } = useMutation({
        mutationFn: (id: number) => branchPaymentService.complete(id),
        onSuccess: (response) => actionDone(response, () => setToComplete(null)),
        onError: (error) => toast.error(typeof error === "string" ? error : "Something went wrong"),
    });

    const { mutate: cancelPayment, isPending: isCancelling } = useMutation({
        mutationFn: ({ id, reason }: { id: number; reason: string }) => branchPaymentService.cancel(id, reason),
        onSuccess: (response) => actionDone(response, () => setToCancel(null)),
        onError: (error) => toast.error(typeof error === "string" ? error : "Something went wrong"),
    });

    const isAdmin = !!options?.isAdmin;
    const params = useMemo(() => toFilterParams(filters, isAdmin), [filters, isAdmin]);
    // The branch the page is narrowed to: a member's own branch, or the one an admin picked
    const focusBranchId = !options ? null : !isAdmin ? options.ownBranchId : filters.branchId !== ALL ? Number(filters.branchId) : null;
    const branchName = focusBranchId ? options?.branch.find((b) => b.id === focusBranchId)?.name ?? null : null;
    const period = periodLabel(params.startDate, params.endDate);

    const columns = useMemo(() => buildColumns(focusBranchId, {
        onView: (p) => setViewId(p.id),
        onEdit: (p) => setForm({ open: true, payment: p }),
        onComplete: setToComplete,
        onCancel: (p) => { setCancelReason(""); setCancelError(""); setToCancel(p); },
    }), [focusBranchId]);

    const viewBranch = useCallback((branchId: number) => {
        setFilters((f) => ({ ...f, branchId: String(branchId), direction: "all" }));
        setFilterFormKey((k) => k + 1);
    }, []);

    const { mutate: exportCsv, isPending: isExporting } = useMutation({
        mutationFn: async () => {
            const rows: IBranchPaymentModel[] = [];
            for (let page = 1; ; page++) {
                const response = await branchPaymentService.list({ ...params, page, pageSize: EXPORT_PAGE_SIZE });
                if (!response?.data?.status) throw new Error("Export failed");
                rows.push(...response.data.data.payment);
                if (page >= response.data.data.pagination.totalPages) break;
            }
            return rows;
        },
        onSuccess: (rows) => {
            if (rows.length === 0) {
                toast.error("Nothing to export for these filters");
                return;
            }
            const header = ["Sr. No.", "Payment No.", "Payment Date", "Paying Branch", "Receiving Branch", "Amount", "Payment Method",
                "Transaction / Reference No.", "Notes", "Status", "Created By", "Created At", "Cancellation Reason"];
            const lines = rows.map((r, i) => [
                i + 1, r.paymentNo, DateToDisplayDate(r.paymentDate), r.fromBranchName, r.toBranchName, r.amount.toFixed(2), r.paymentMethod,
                r.referenceNumber, r.notes, r.status, r.createdByName, DateToDisplayDate(r.createdAt), r.cancelReason,
            ].map(csvCell).join(","));
            // BOM so Excel reads the file as UTF-8
            const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `branch-payments${branchName ? `-${branchName.toLowerCase().replace(/\s+/g, "-")}` : ""}-${DateToDisplayDate(new Date())}.csv`;
            link.click();
            URL.revokeObjectURL(url);
            toast.success(`Exported ${rows.length.toLocaleString("en-IN")} payment${rows.length === 1 ? "" : "s"}`);
        },
        onError: () => toast.error("Could not export. Please try again."),
    });

    if (isPending) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
                <div className="h-36 w-full animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
                <div className="h-64 w-full animate-pulse rounded-2xl bg-slate-100" />
            </div>
        );
    }

    if (isError || !options) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-md">
                <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-slate-500">
                    <CircleAlert className="size-6 text-red-400" />
                    <span>We couldn't load the branches you have access to. If your account isn't assigned to a branch, contact your administrator.</span>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="mt-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    const isFiltered = !!(params.search || params.status || params.direction);

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-800">Branch Payments</h3>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                    Money paid from one branch to another. Each transfer is one record, kept separate from sales, income and expenses.
                    Pending and cancelled payments are not counted as sent or received.
                </p>
            </div>

            <BranchPaymentSummary
                isAdmin={isAdmin}
                branchId={params.branchId}
                startDate={params.startDate}
                endDate={params.endDate}
                period={period}
                branchName={branchName}
                refreshKey={refreshKey}
                onViewBranch={viewBranch}
            />

            <BranchPaymentFilters
                key={filterFormKey}
                options={options}
                initialValues={filters}
                onChange={setFilters}
                onAdd={() => setForm({ open: true, payment: null })}
                onExport={() => exportCsv()}
                isExporting={isExporting}
            />

            <p className="-mt-3 text-xs text-slate-500">
                {branchName
                    ? <>Payment history of <span className="font-semibold text-slate-700">{branchName}</span>: every payment it sent (−) or received (+).</>
                    : <>Showing payments between all branches.</>}
            </p>

            {/* User and filters are part of the key so changing them refetches the table */}
            <CustomTable<IBranchPaymentModel>
                column={columns}
                queryKey={`branch-payment:${userId}:${JSON.stringify(params)}`}
                row={(page: number, limit: number) => branchPaymentService.list({ page, pageSize: limit, ...params })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey}
                onRowClick={(row) => setViewId(row.id)}
                emptyMessage={isFiltered ? "No payments match your filters" : `No branch payments for ${period.toLowerCase() === "all time" ? "any date" : period}`}
            />

            <AddBranchPaymentForm
                open={form.open}
                payment={form.payment}
                options={options}
                onClose={() => setForm({ open: false, payment: null })}
                onSaved={reload}
            />

            <BranchPaymentDetailsDialog paymentId={viewId} onClose={() => setViewId(null)} options={options} refreshKey={refreshKey} />

            <ConfirmDialog
                open={!!toComplete}
                onClose={() => setToComplete(null)}
                onConfirm={() => toComplete && completePayment(toComplete.id)}
                loading={isCompleting}
                tone="primary"
                confirmLabel="Mark Completed"
                title="Confirm Payment Received"
                message={toComplete && (
                    <>
                        Confirm that <span className="font-semibold text-gray-900">{toComplete.toBranchName}</span> received{" "}
                        <span className="font-semibold text-gray-900">{currency.format(toComplete.amount)}</span> from{" "}
                        <span className="font-semibold text-gray-900">{toComplete.fromBranchName}</span> ({DateToDisplayDate(toComplete.paymentDate)}).
                        It will then count toward both branches' totals.
                    </>
                )}
            />

            <ConfirmDialog
                open={!!toCancel}
                onClose={() => setToCancel(null)}
                onConfirm={() => {
                    if (!toCancel) return;
                    const reason = cancelReason.trim();
                    if (!reason) { setCancelError("Enter a reason for cancelling"); return; }
                    cancelPayment({ id: toCancel.id, reason });
                }}
                loading={isCancelling}
                confirmLabel="Cancel Payment"
                cancelLabel="Keep"
                title={`Cancel Payment ${toCancel?.paymentNo ?? ""}`}
                message={toCancel && (
                    <div className="flex flex-col gap-3">
                        <p>
                            Cancel the {toCancel.status.toLowerCase()} payment of{" "}
                            <span className="font-semibold text-gray-900">{currency.format(toCancel.amount)}</span> from{" "}
                            {toCancel.fromBranchName} to {toCancel.toBranchName}?
                            {toCancel.status === "Completed" && " It will be removed from both branches' totals."} The record and its history are kept.
                        </p>
                        <Textarea
                            name="cancelReason"
                            label="Reason"
                            rows={2}
                            value={cancelReason}
                            error={cancelError || undefined}
                            onChange={(e) => { setCancelReason(e.target.value); setCancelError(""); }}
                            placeholder="Why is this payment being cancelled?"
                        />
                    </div>
                )}
            />
        </div>
    );
};

export default BranchPayments;
