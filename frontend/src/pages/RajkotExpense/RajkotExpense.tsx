import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Field, Form, Formik, useFormikContext } from "formik";
import { CheckCircle2, CircleAlert, Clock, Plus, RotateCcw, Trash2 } from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import type { IRajkotExpenseModel, IRajkotExpenseOptionsModel, IRajkotExpenseResponseModel, RajkotExpenseStatus } from "@/models/RajkotExpense";
import rajkotExpenseService from "@/services/rajkot-expense-service";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/Button";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { useDebounce } from "@/hook/useDebounce";
import { DateToDateStringWithMonth, DateToDateTimeString } from "@/util/DateFormate";
import { currency } from "@/pages/Ledger/ledgerConfig";
import RajkotExpenseCounter from "./RajkotExpenseCounter";
import AddRajkotExpenseForm from "./AddRajkotExpenseForm";

const ALL = "all";

const STATUS_OPTIONS: SelectOption[] = [
    { value: ALL, label: "All statuses" },
    { value: "Pending", label: "Pending" },
    { value: "Accepted", label: "Accepted" },
];

interface RajkotExpenseFilterValues {
    search: string;
    /** ALL or a branch id (admins only) */
    branchId: string;
    /** ALL, Pending or Accepted */
    status: string;
}

const DEFAULT_FILTERS: RajkotExpenseFilterValues = { search: "", branchId: ALL, status: ALL };

// Reports filter changes to the parent, debouncing the search text
const FilterWatcher = ({ onChange }: { onChange: (filters: RajkotExpenseFilterValues) => void }) => {
    const { values } = useFormikContext<RajkotExpenseFilterValues>();
    const search = useDebounce(values.search.trim());
    const { branchId, status } = values;

    useEffect(() => {
        onChange({ search, branchId, status });
    }, [search, branchId, status, onChange]);

    return null;
};

const mapResponseToColumns =(response: AxiosResponse<ApiResponseModel<IRajkotExpenseResponseModel>>): IRajkotExpenseModel[] =>
    response.data.data.entry;

const actionButton = "inline-flex size-8 items-center justify-center rounded-lg transition-colors";

const StatusBadge = ({ entry }: { entry: IRajkotExpenseModel }) => entry.status === "Accepted" ? (
    <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200"
        title={entry.acceptedAt ? `Accepted ${DateToDateTimeString(entry.acceptedAt)}${entry.acceptedByName ? ` by ${entry.acceptedByName}` : ""}` : undefined}
    >
        <CheckCircle2 className="size-3.5" /> Accepted
    </span>
) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
        <Clock className="size-3.5" /> Pending
    </span>
);

const ProductList = ({ entry }: { entry: IRajkotExpenseModel }) => (
    <ul className="flex min-w-56 flex-col gap-1.5">
        {entry.items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-slate-800">
                        {item.productName} <span className="text-slate-500">× {item.quantity.toLocaleString("en-IN")}</span>
                    </span>
                    <span className="tabular-nums text-xs text-slate-500">{currency.format(item.amount)}</span>
                </div>
                {item.hasSerialNumber && item.serialNumbers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {item.serialNumbers.map((sn) => (
                            <span key={sn} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{sn}</span>
                        ))}
                    </div>
                )}
            </li>
        ))}
    </ul>
);

interface ColumnHandlers {
    onAccept: (entry: IRajkotExpenseModel) => void;
    onDelete: (entry: IRajkotExpenseModel) => void;
}

// Accept and delete are shown per row: the API marks which entries the user may act on
// (accept: an employee of the entry's branch; delete: admins, pending entries only).
const buildColumns = (isAdmin: boolean, { onAccept, onDelete }: ColumnHandlers): TableColumn<IRajkotExpenseModel>[] => [
    { id: "srNo", label: "Sr. No.", width: 80, renderCell: (_value, _row, _column, _rowIndex, serialNo) => serialNo },
    { id: "entryDate", label: "Date", sortable: true, renderCell: (value: string) => DateToDateStringWithMonth(value) },
    { id: "branchName", label: "Branch", sortable: true, visible: isAdmin },
    { id: "items", label: "Products", hideable: false, renderCell: (_value, row) => <ProductList entry={row} /> },
    { id: "totalQuantity", label: "Qty", align: "right", sortable: true, renderCell: (value: number) => <span className="tabular-nums">{value.toLocaleString("en-IN")}</span> },
    {
        id: "totalAmount",
        label: "Amount",
        align: "right",
        sortable: true,
        renderCell: (value: number) => <span className="font-medium tabular-nums text-rose-700">{currency.format(value)}</span>,
    },
    { id: "status", label: "Status", sortable: true, renderCell: (_value, row) => <StatusBadge entry={row} /> },
    {
        id: "description",
        label: "Description",
        visible: false,
        className: "min-w-48 max-w-80",
        renderCell: (value: string | null) => value ? <span className="line-clamp-2" title={value}>{value}</span> : <span className="text-slate-400">—</span>,
    },
    { id: "createdByName", label: "Added By", sortable: true, renderCell: (name: string | null) => name ?? <span className="text-slate-400">—</span> },
    {
        id: "acceptedByName",
        label: "Accepted By",
        renderCell: (name: string | null, row) => row.status === "Accepted"
            ? <span className="flex flex-col"><span>{name ?? "—"}</span>{row.acceptedAt && <span className="text-xs text-slate-500">{DateToDateTimeString(row.acceptedAt)}</span>}</span>
            : <span className="text-slate-400">—</span>,
    },
    {
        id: "actions",
        label: "Action",
        width: 140,
        hideable: false,
        renderCell: (_value, row) => (
            <div className="inline-flex items-center gap-1">
                {row.canAccept && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAccept(row); }}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-500 px-2.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                    >
                        <CheckCircle2 className="size-3.5" /> Accept
                    </button>
                )}
                {row.canDelete && (
                    <button type="button" title="Delete" aria-label="Delete" onClick={(e) => { e.stopPropagation(); onDelete(row); }}
                        className={clsx(actionButton, "text-red-500 hover:bg-red-50 hover:text-red-600")}>
                        <Trash2 className="size-4" />
                    </button>
                )}
                {!row.canAccept && !row.canDelete && <span className="text-slate-400">—</span>}
            </div>
        ),
    },
];

// The Rajkot Expense page: count and balance (top right), filters, the entries table, and the
// add / accept / delete dialogs. Branch access comes from the API (options endpoint), and every
// list, total and change is checked again by the API.
const RajkotExpense = () => {
    const userId = useSelector((state: RootState) => state.auth.userId);

    const [filters, setFilters] = useState<RajkotExpenseFilterValues>(DEFAULT_FILTERS);
    const [formOpen, setFormOpen] = useState(false);
    const [entryToAccept, setEntryToAccept] = useState<IRajkotExpenseModel | null>(null);
    const [entryToDelete, setEntryToDelete] = useState<IRajkotExpenseModel | null>(null);
    // Bumped after any change so the table and the counter reload together
    const [refreshKey, setRefreshKey] = useState(0);
    const reload = () => setRefreshKey((key) => key + 1);

    // Keyed by user so a later login in the same tab never reuses another user's branch list
    const { data: options, isPending, isError, refetch, isFetching } = useQuery<IRajkotExpenseOptionsModel>({
        queryKey: ["rajkot-expense-options", userId],
        queryFn: async () => {
            const response = await rajkotExpenseService.options();
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load your branch access.");
            return response.data.data;
        },
        retry: false,
    });

    const { mutate: acceptEntry, isPending: isAccepting } = useMutation({
        mutationFn: (id: number) => rajkotExpenseService.accept(id),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) toast.success(response.data.message || "Rajkot expense accepted successfully");
            // Reload either way: a 409 means someone else already accepted it
            setEntryToAccept(null);
            reload();
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Something went wrong"),
    });

    const { mutate: removeEntry, isPending: isDeleting } = useMutation({
        mutationFn: (id: number) => rajkotExpenseService.remove(id),
        onSuccess: (response) => {
            if (response?.data?.status) toast.success(response.data.message || "Rajkot expense deleted successfully");
            setEntryToDelete(null);
            reload();
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Something went wrong"),
    });

    const isAdmin = !!options?.isAdmin;
    const columns = useMemo(() => buildColumns(isAdmin, { onAccept: setEntryToAccept, onDelete: setEntryToDelete }), [isAdmin]);
    const branchOptions = useMemo<SelectOption[]>(() => [
        { value: ALL, label: "All branches" },
        ...(options?.branch ?? []).map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    ], [options]);

    if (isPending) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
                <div className="h-24 w-full animate-pulse rounded-2xl bg-slate-100" />
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

    // The branch the page is narrowed to: a member's own branch, or the one an admin picked
    const filterBranchId = !isAdmin ? options.branch[0]?.id ?? null : filters.branchId !== ALL ? Number(filters.branchId) : null;
    const branchName = filterBranchId ? options.branch.find((b) => b.id === filterBranchId)?.name ?? null : null;
    const params = {
        search: filters.search || undefined,
        branchId: isAdmin && filterBranchId ? filterBranchId : undefined,
        status: filters.status !== ALL ? (filters.status as RajkotExpenseStatus) : undefined,
    };
    const isFiltered = !!(params.search || params.status);

    return (
        <div className="p-4 sm:p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-slate-800">Rajkot Expense</h3>
                    <p className="mt-1 max-w-xl text-sm text-slate-500">
                        Products recorded as expenses for a branch. An employee of that branch accepts each entry once, which adds the
                        products to the branch's stock, 1 to the expense count and the amount to the balance.
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                        {isAdmin
                            ? branchName
                                ? <>Showing <span className="font-semibold text-slate-700">{branchName}</span>.</>
                                : <>Showing all branches.</>
                            : <>Showing your branch: <span className="font-semibold text-slate-700">{branchName}</span></>}
                    </p>
                </div>
                <RajkotExpenseCounter isAdmin={isAdmin} branchId={filterBranchId} branchName={branchName} refreshKey={refreshKey} onChanged={reload} />
            </div>

            <Formik initialValues={DEFAULT_FILTERS} onSubmit={() => undefined}>
                {({ resetForm }) => (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" noValidate>
                            <FilterWatcher onChange={setFilters} />
                            <div className="w-full sm:w-64">
                                <Field id="search" name="search" placeholder="Search product or serial no..." component={Input} />
                            </div>
                            {isAdmin && (
                                <Field id="branchId" name="branchId" options={branchOptions} component={Select} className="w-full sm:w-44" />
                            )}
                            <Field id="status" name="status" options={STATUS_OPTIONS} component={Select} className="w-full sm:w-40" />
                            <Button
                                onClick={() => resetForm({ values: DEFAULT_FILTERS })}
                                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                            >
                                <RotateCcw className="size-4" />
                                Reset
                            </Button>
                        </Form>
                        {isAdmin && (
                            <Button onClick={() => setFormOpen(true)} className="shrink-0 lg:w-auto">
                                <Plus className="size-4" />
                                Add Rajkot Expense
                            </Button>
                        )}
                    </div>
                )}
            </Formik>

            {/* User and filters are part of the key so changing them refetches the table */}
            <CustomTable<IRajkotExpenseModel>
                column={columns}
                queryKey={`rajkot-expense:${userId}:${JSON.stringify(params)}`}
                row={(page: number, limit: number) => rajkotExpenseService.list({ page, pageSize: limit, ...params })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey}
                emptyMessage={isFiltered ? "No Rajkot expense entries match your filters" : "No Rajkot expense entries yet"}
            />

            {isAdmin && (
                <AddRajkotExpenseForm
                    open={formOpen}
                    options={options}
                    filterBranchId={filterBranchId}
                    onClose={() => setFormOpen(false)}
                    onSaved={reload}
                />
            )}

            <ConfirmDialog
                open={!!entryToAccept}
                onClose={() => setEntryToAccept(null)}
                onConfirm={() => entryToAccept && acceptEntry(entryToAccept.id)}
                loading={isAccepting}
                tone="primary"
                title="Accept Rajkot Expense"
                confirmLabel="Accept"
                message={entryToAccept && (
                    <div className="flex flex-col gap-2">
                        <p>
                            Accept this entry of <span className="font-semibold text-gray-900">{entryToAccept.totalQuantity.toLocaleString("en-IN")}</span>{" "}
                            {entryToAccept.totalQuantity === 1 ? "unit" : "units"} worth{" "}
                            <span className="font-semibold text-gray-900">{currency.format(entryToAccept.totalAmount)}</span> for{" "}
                            {entryToAccept.branchName ?? "your branch"}?
                        </p>
                        <ul className="list-disc pl-5">
                            {entryToAccept.items.map((item) => (
                                <li key={item.id}>{item.productName} × {item.quantity.toLocaleString("en-IN")}</li>
                            ))}
                        </ul>
                        <p>These products are added to your branch's stock, and the expense count and balance are updated right away. This can't be undone.</p>
                    </div>
                )}
            />

            <ConfirmDialog
                open={!!entryToDelete}
                onClose={() => setEntryToDelete(null)}
                onConfirm={() => entryToDelete && removeEntry(entryToDelete.id)}
                loading={isDeleting}
                title="Delete Rajkot Expense"
                message={entryToDelete && (
                    <>
                        Are you sure you want to permanently delete the pending entry of{" "}
                        <span className="font-semibold text-gray-900">{currency.format(entryToDelete.totalAmount)}</span>
                        {" "}({DateToDateStringWithMonth(entryToDelete.entryDate)}{entryToDelete.branchName ? `, ${entryToDelete.branchName}` : ""})?
                        Its serial numbers become available again. This cannot be undone.
                    </>
                )}
            />
        </div>
    );
};

export default RajkotExpense;
