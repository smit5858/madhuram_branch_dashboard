import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, Lock, Pencil, Trash2 } from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";
import type { ILedgerEntryModel, ILedgerOptionsModel, ILedgerResponseModel } from "@/models/Ledger";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import { DateToDateStringWithMonth } from "@/util/DateFormate";
import LedgerFilters from "./LedgerFilters";
import LedgerSummary from "./LedgerSummary";
import LedgerBalance from "./LedgerBalance";
import AddLedgerEntryForm from "./AddLedgerEntryForm";
import { ALL, currency, defaultFilters, periodLabel, toFilterParams, type LedgerConfig, type LedgerFilterValues } from "./ledgerConfig";

const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<ILedgerResponseModel>>): ILedgerEntryModel[] =>
    response.data.data.entry;

const actionButton = "inline-flex size-8 items-center justify-center rounded-lg transition-colors";

interface ColumnHandlers {
    onEdit: (entry: ILedgerEntryModel) => void;
    onDelete: (entry: ILedgerEntryModel) => void;
}

// Edit and delete are shown per row: the API marks which entries the user may change
// (admins: all; members: the ones they added). Members get the Branch column hidden by default
// since every row is their own branch.
const buildColumns = (config: LedgerConfig, isAdmin: boolean, { onEdit, onDelete }: ColumnHandlers): TableColumn<ILedgerEntryModel>[] => [
    { id: "srNo", label: "Sr. No.", width: 80, renderCell: (_value, _row, _column, _rowIndex, serialNo) => serialNo },
    { id: "entryDate", label: "Date", sortable: true, renderCell: (value: string) => DateToDateStringWithMonth(value) },
    { id: "branchName", label: "Branch", sortable: true, visible: isAdmin },
    { id: "category", label: config.categoryLabel, sortable: true },
    {
        id: "description",
        label: "Description",
        className: "min-w-48 max-w-80",
        renderCell: (value: string | null) => value
            ? <span className="line-clamp-2" title={value}>{value}</span>
            : <span className="text-slate-400">—</span>,
    },
    ...(config.withPaymentMethod ? [{ id: "paymentMethod", label: "Payment Method", sortable: true } satisfies TableColumn<ILedgerEntryModel>] : []),
    {
        id: "amount",
        label: "Amount",
        align: "right",
        sortable: true,
        renderCell: (amount: number) => <span className={clsx("font-medium tabular-nums", config.accent.amount)}>{currency.format(amount)}</span>,
    },
    { id: "createdByName", label: "Created By", sortable: true, renderCell: (name: string | null) => name ?? <span className="text-slate-400">—</span> },
    {
        id: "actions",
        label: "Action",
        width: 100,
        hideable: false,
        renderCell: (_value, row) => row.canManage ? (
            <div className="inline-flex items-center gap-1">
                <button type="button" title="Edit" aria-label="Edit" onClick={(e) => { e.stopPropagation(); onEdit(row); }}
                    className={clsx(actionButton, "text-blue-500 hover:bg-blue-50 hover:text-blue-600")}>
                    <Pencil className="size-4" />
                </button>
                <button type="button" title="Delete" aria-label="Delete" onClick={(e) => { e.stopPropagation(); onDelete(row); }}
                    className={clsx(actionButton, "text-red-500 hover:bg-red-50 hover:text-red-600")}>
                    <Trash2 className="size-4" />
                </button>
            </div>
        ) : (
            <span className={clsx(actionButton, "text-slate-300")} title="Only the person who added this entry or an admin can change it">
                <Lock className="size-4" />
            </span>
        ),
    },
];

// The Income and Expense pages: totals for the selected period, filters, the entries table and
// the add / edit / delete dialogs. Branch access comes from the API (options endpoint), and every
// list, total and change is checked again by the API.
const LedgerPage = ({ config }: { config: LedgerConfig }) => {
    const userId = useSelector((state: RootState) => state.auth.userId);

    const [filters, setFilters] = useState<LedgerFilterValues>(defaultFilters);
    // entry is null when adding, set when editing
    const [form, setForm] = useState<{ open: boolean; entry: ILedgerEntryModel | null }>({ open: false, entry: null });
    const [entryToDelete, setEntryToDelete] = useState<ILedgerEntryModel | null>(null);
    // Bumped after an entry is saved or deleted so the table and totals reload
    const [refreshKey, setRefreshKey] = useState(0);
    const reloadTable = () => setRefreshKey((key) => key + 1);

    // Keyed by user so a later login in the same tab never reuses another user's branch list
    const { data: options, isPending, isError, refetch, isFetching } = useQuery<ILedgerOptionsModel>({
        queryKey: [`${config.kind}-options`, userId],
        queryFn: async () => {
            const response = await config.service.options();
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load your branch access.");
            return response.data.data;
        },
        retry: false,
    });

    const { mutate: removeEntry, isPending: isDeleting } = useMutation({
        mutationFn: (id: number) => config.service.remove(id),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || `${config.title} deleted successfully`);
                reloadTable();
                setEntryToDelete(null);
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    const isAdmin = !!options?.isAdmin;
    const columns = useMemo(
        () => buildColumns(config, isAdmin, { onEdit: (entry) => setForm({ open: true, entry }), onDelete: setEntryToDelete }),
        [config, isAdmin],
    );
    const params = useMemo(() => toFilterParams(filters, isAdmin), [filters, isAdmin]);

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

    // The branch the page is narrowed to: a member's own branch, or the one an admin picked
    const filterBranchId = !isAdmin ? options.branch[0]?.id ?? null : filters.branchId !== ALL ? Number(filters.branchId) : null;
    const branchName = filterBranchId ? options.branch.find((b) => b.id === filterBranchId)?.name ?? null : null;
    const period = periodLabel(filters);
    const isFiltered = !!(filters.search || filters.category !== ALL);

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-slate-800">{config.title}</h3>
                    <p className="mt-1 max-w-xl text-sm text-slate-500">
                        Total Balance counts the {config.noun} entries{config.kind === "income" ? " and product sales" : ""} recorded since
                        the branch's last reset. The totals below follow the selected filters.
                    </p>
                </div>
                <LedgerBalance config={config} branchId={filterBranchId} branchName={branchName} refreshKey={refreshKey} />
            </div>

            <LedgerSummary config={config} isAdmin={isAdmin} params={params} period={period} branchName={branchName} refreshKey={refreshKey} salesCategory={options.salesCategory} />

            <LedgerFilters config={config} options={options} onChange={setFilters} onAdd={() => setForm({ open: true, entry: null })} />

            <p className="-mt-3 text-xs text-slate-500">
                {isAdmin
                    ? branchName
                        ? <>Showing {config.noun} entries for <span className="font-semibold text-slate-700">{branchName}</span>.</>
                        : <>Showing {config.noun} entries from all branches.</>
                    : <>Showing {config.noun} entries for your branch: <span className="font-semibold text-slate-700">{branchName}</span></>}
            </p>

            {/* User and filters are part of the key so changing them refetches the table */}
            <CustomTable<ILedgerEntryModel>
                column={columns}
                queryKey={`${config.kind}:${userId}:${JSON.stringify(params)}`}
                row={(page: number, limit: number) => config.service.list({ page, pageSize: limit, ...params })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey}
                emptyMessage={
                    options.salesCategory && params.category === options.salesCategory
                        ? "Product sales are counted in the totals above. Open the Sales module to see each sale."
                        : isFiltered ? `No ${config.noun} entries match your filters` : `No ${config.noun} entries for ${period}`
                }
            />

            <AddLedgerEntryForm
                config={config}
                open={form.open}
                entry={form.entry}
                options={options}
                filterBranchId={filterBranchId}
                onClose={() => setForm({ open: false, entry: null })}
                onSaved={reloadTable}
            />

            <ConfirmDialog
                open={!!entryToDelete}
                onClose={() => setEntryToDelete(null)}
                onConfirm={() => entryToDelete && removeEntry(entryToDelete.id)}
                loading={isDeleting}
                title={`Delete ${config.title}`}
                message={
                    <>
                        Are you sure you want to permanently delete the {config.noun} entry of{" "}
                        <span className="font-semibold text-gray-900">{entryToDelete ? currency.format(entryToDelete.amount) : ""}</span>
                        {" "}({entryToDelete?.category}, {entryToDelete ? DateToDateStringWithMonth(entryToDelete.entryDate) : ""}
                        {isAdmin && entryToDelete?.branchName ? `, ${entryToDelete.branchName}` : ""})? This cannot be undone.
                    </>
                }
            />
        </div>
    );
};

export default LedgerPage;
