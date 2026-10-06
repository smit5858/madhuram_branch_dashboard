import { Formik, Form, Field, useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, Plus, RotateCcw } from "lucide-react";
import { parse } from "date-fns";
import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";
import type { IProductBranchScopeModel } from "@/models/Product";
import type { ISaleModel, ISaleRequestModel, ISaleResponseModel } from "@/models/Sale";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import { Input } from '@/components/formik-fields/Input';
import { DatePicker, DATE_VALUE_FORMAT } from '@/components/formik-fields/DatePicker';
import { Button } from '@/components/Button';
import { ConfirmDialog } from "@/components/ConfirmDialog";
import productService from "@/services/product-service";
import saleService from "@/services/sale-service";
import { useDebounce } from "@/hook/useDebounce";
import { isCompleteDate, productFilterSchema } from "@/validation/validation";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import { DateToDateStringWithMonth } from "@/util/DateFormate";
import AddSaleForm from "./AddSaleForm";
import SalesSummary from "./SalesSummary";

type SaleFilterValues = Required<Pick<ISaleRequestModel, "search" | "startDate" | "endDate">>;

const emptyFilters: SaleFilterValues = { search: "", startDate: "", endDate: "" };

// The fetcher resolves to the full axios response: { data: { status, message, data: { sale, pagination } } }.
// Rows live in data.data.sale; total/totalPages are picked up from pagination automatically.
const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<ISaleResponseModel>>): ISaleModel[] =>
    response.data.data.sale;

const toDate = (value: string) => (isCompleteDate(value) ? parse(value, DATE_VALUE_FORMAT, new Date()) : undefined);

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

const formatSaleDate = (value: string | null | undefined) => DateToDateStringWithMonth(value);

// Reports filter changes to the parent, debouncing the search text. Dates are only applied
// once complete and in order, so half-typed input never reaches the API.
const SaleFilterWatcher = ({ onChange }: { onChange: (filters: SaleFilterValues) => void }) => {
    const { values } = useFormikContext<SaleFilterValues>();
    const search = useDebounce(values.search.trim());
    const startDate = isCompleteDate(values.startDate) ? values.startDate : "";
    const endDate = isCompleteDate(values.endDate) ? values.endDate : "";
    // A typed but incomplete date keeps the last applied range instead of clearing it
    const isPartial = (!!values.startDate && !startDate) || (!!values.endDate && !endDate);
    const isOrdered = !startDate || !endDate || startDate <= endDate;

    useEffect(() => {
        if (isPartial || !isOrdered) return;
        onChange({ search, startDate, endDate });
    }, [search, startDate, endDate, isPartial, isOrdered, onChange]);

    return null;
};

const SaleFilters = ({ onChange, onAdd }: { onChange: (filters: SaleFilterValues) => void; onAdd: () => void }) => {
    const today = useMemo(() => new Date(), []);

    return (
        <Formik initialValues={emptyFilters} validationSchema={productFilterSchema} onSubmit={() => undefined}>
            {({ values, resetForm }) => (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start" noValidate>
                        <SaleFilterWatcher onChange={onChange} />
                        <div className="w-full sm:w-72">
                            <Field
                                id="search"
                                name="search"
                                placeholder="Search customer, phone, product or serial no..."
                                component={Input}
                            />
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
                            <Field
                                id="startDate"
                                name="startDate"
                                maxDate={toDate(values.endDate) ?? today}
                                component={DatePicker}
                                className="w-full sm:w-44"
                            />
                            <span className="hidden h-10 items-center text-xs text-slate-400 sm:flex">to</span>
                            <Field
                                id="endDate"
                                name="endDate"
                                minDate={toDate(values.startDate)}
                                maxDate={today}
                                component={DatePicker}
                                className="w-full sm:w-44"
                            />
                        </div>
                        <Button
                            onClick={() => resetForm()}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            <RotateCcw className="size-4" />
                            Reset
                        </Button>
                    </Form>
                    <Button className="lg:w-auto" onClick={onAdd}>
                        <Plus className="size-4" />
                        Add Sales
                    </Button>
                </div>
            )}
        </Formik>
    );
};

// Admins also get a Branch column so each sale's branch is visible
const buildColumns = (isAdmin: boolean): TableColumn<ISaleModel>[] => [
    // Running number (1, 2, 3 ... continuing across pages), not the database id
    { id: "srNo", label: "Sr no.", width: 80, renderCell: (_value, _row, _column, _rowIndex, serialNo) => serialNo },
    { id: "customerName", label: "Customer Name", sortable: true, className: "min-w-48" },
    { id: "customerPhone", label: "Phone", visible: false },
    {
        id: "productName",
        label: "Product",
        sortable: true,
        className: "min-w-48",
        renderCell: (name: string, row) => (
            <div className="flex flex-col gap-0.5">
                <span>
                    {name}
                    {row.quantity > 1 && <span className="ml-1.5 text-xs text-slate-500">× {row.quantity.toLocaleString("en-IN")}</span>}
                </span>
                {row.serialNumbers.length > 0 && (
                    <span className="text-xs text-slate-500" title={row.serialNumbers.join(", ")}>
                        SN: {row.serialNumbers.length > 3
                            ? `${row.serialNumbers.slice(0, 3).join(", ")} +${row.serialNumbers.length - 3} more`
                            : row.serialNumbers.join(", ")}
                    </span>
                )}
            </div>
        ),
    },
    { id: "quantity", label: "Qty", align: "center", sortable: true, visible: false },
    ...(isAdmin ? [{ id: "branchName", label: "Branch", sortable: true } satisfies TableColumn<ISaleModel>] : []),
    { id: "saleDate", label: "Sale Date", sortable: true, visible: false, renderCell: formatSaleDate },
    {
        id: "sellingAmount",
        label: "Selling Amount",
        align: "right",
        sortable: true,
        renderCell: (amount: number) => <span className="font-medium tabular-nums text-slate-800">{currency.format(amount)}</span>,
    },
    { id: "actions", label: "Action", width: 100 },
];

const Sales = () => {
    const userId = useSelector((state: RootState) => state.auth.userId);

    const [filters, setFilters] = useState<SaleFilterValues>(emptyFilters);
    // sale is null when adding, set when editing
    const [form, setForm] = useState<{ open: boolean; sale: ISaleModel | null }>({ open: false, sale: null });
    const [saleToDelete, setSaleToDelete] = useState<ISaleModel | null>(null);
    // Bumped after a sale is saved or deleted so the table reloads
    const [refreshKey, setRefreshKey] = useState(0);
    const reloadTable = () => setRefreshKey((key) => key + 1);

    // Same branch access as Products, decided by the API; keyed by user so a later login in
    // the same tab never reuses another user's branch list
    const { data: scope, isPending: isScopeLoading, isError: isScopeError, refetch: refetchScope, isFetching: isScopeFetching } = useQuery<IProductBranchScopeModel>({
        queryKey: ["product-branches", userId],
        queryFn: async () => {
            const response = await productService.productBranches();
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load your branch access.");
            return response.data.data;
        },
        retry: false,
    });

    const { mutate: removeSale, isPending: isDeleting } = useMutation({
        mutationFn: (id: number) => saleService.deleteSale(id),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Sale deleted successfully");
                reloadTable();
                setSaleToDelete(null);
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    const columns = useMemo(() => buildColumns(!!scope?.isAdmin), [scope?.isAdmin]);
    const ownBranchName = scope && !scope.isAdmin ? scope.branch[0]?.name : null;

    if (isScopeLoading) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
                <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
                <div className="h-64 w-full animate-pulse rounded-2xl bg-slate-100" />
            </div>
        );
    }

    if (isScopeError || !scope) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-md">
                <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-slate-500">
                    <CircleAlert className="size-6 text-red-400" />
                    <span>We couldn't load the branches you have access to. If your account isn't assigned to a branch, contact your administrator.</span>
                    <button
                        type="button"
                        onClick={() => refetchScope()}
                        disabled={isScopeFetching}
                        className="mt-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <SalesSummary isAdmin={scope.isAdmin} filters={filters} refreshKey={refreshKey} />

            <SaleFilters onChange={setFilters} onAdd={() => setForm({ open: true, sale: null })} />

            <p className="-mt-3 text-xs text-slate-500">
                {scope.isAdmin
                    ? "Showing sales from all branches."
                    : <>Showing sales for your branch: <span className="font-semibold text-slate-700">{ownBranchName}</span></>}
            </p>

            {/* User and filters are part of the key so changing them refetches the table */}
            <CustomTable<ISaleModel>
                column={columns}
                queryKey={`sales:${userId}:${JSON.stringify(filters)}`}
                row={(page: number, limit: number) => saleService.sale({
                    page,
                    pageSize: limit,
                    search: filters.search || undefined,
                    startDate: filters.startDate || undefined,
                    endDate: filters.endDate || undefined,
                })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey}
                emptyMessage={filters.search || filters.startDate || filters.endDate ? "No sales match your filters" : "No sales found"}
                isEdit
                onEdit={(sale) => setForm({ open: true, sale })}
                isDelete
                onDelete={setSaleToDelete}
            />

            <AddSaleForm
                open={form.open}
                sale={form.sale}
                scope={scope}
                onClose={() => setForm({ open: false, sale: null })}
                onSaved={reloadTable}
            />

            <ConfirmDialog
                open={!!saleToDelete}
                onClose={() => setSaleToDelete(null)}
                onConfirm={() => saleToDelete && removeSale(saleToDelete.id)}
                loading={isDeleting}
                title="Delete Sale"
                message={
                    <>
                        Are you sure you want to permanently delete the sale of <span className="font-semibold text-gray-900">{saleToDelete?.productName}</span> to <span className="font-semibold text-gray-900">{saleToDelete?.customerName}</span>
                        {scope.isAdmin && saleToDelete?.branchName ? <> ({saleToDelete.branchName})</> : null}? The sold quantity will be returned to the branch's stock. This cannot be undone.
                    </>
                }
            />
        </div>
    );
}

export default Sales;
