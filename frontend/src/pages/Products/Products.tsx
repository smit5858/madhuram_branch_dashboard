import { Formik, Form, Field, useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Plus, RotateCcw } from "lucide-react";
import { format, parse } from "date-fns";
import type { AxiosResponse } from "axios";
import type { IProductBranchScopeModel, IProductModel, IProductRequestModel, IProductResponseModel } from "@/models/Product";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import { Input } from '@/components/formik-fields/Input';
import { DatePicker, DATE_VALUE_FORMAT } from '@/components/formik-fields/DatePicker';
import { Button } from '@/components/Button';
import productService from "@/services/product-service";
import { useDebounce } from "@/hook/useDebounce";
import { isCompleteDate, productFilterSchema } from "@/validation/validation";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import AddProductForm from "./AddProductForm";
import DeleteProductDialog from "./DeleteProductDialog";

type ProductFilterValues = Required<Pick<IProductRequestModel, "search" | "startDate" | "endDate">>;

const emptyFilters: ProductFilterValues = { search: "", startDate: "", endDate: "" };

// The fetcher resolves to the full axios response: { data: { status, message, data: { product, pagination } } }.
// Rows live in data.data.product; total/totalPages are picked up from pagination automatically.
const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<IProductResponseModel>>): IProductModel[] =>
    response.data.data.product;

const toDate = (value: string) => (isCompleteDate(value) ? parse(value, DATE_VALUE_FORMAT, new Date()) : undefined);

// Reports filter changes to the parent, debouncing the search text. Dates are only applied
// once complete and in order, so half-typed input never reaches the API.
const ProductFilterWatcher = ({ onChange }: { onChange: (filters: ProductFilterValues) => void }) => {
    const { values } = useFormikContext<ProductFilterValues>();
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

const ProductFilters = ({ onChange, onAdd }: { onChange: (filters: ProductFilterValues) => void; onAdd: () => void }) => {
    const today = useMemo(() => new Date(), []);

    return (
        <Formik initialValues={emptyFilters} validationSchema={productFilterSchema} onSubmit={() => undefined}>
            {({ values, resetForm }) => (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start" noValidate>
                        <ProductFilterWatcher onChange={onChange} />
                        <div className="w-full sm:w-72">
                            <Field
                                id="search"
                                name="search"
                                placeholder="Search product name..."
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
                        Add Product
                    </Button>
                </div>
            )}
        </Formik>
    );
};

const formatDate = (value: string | null | undefined) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? format(date, "dd MMM yyyy, hh:mm a") : "-";
};

// One quantity column per visible branch: every branch for admins, only their own for members
const buildColumns = (scope: IProductBranchScopeModel): TableColumn<IProductModel>[] => [
    // Running number (1, 2, 3 ... continuing across pages), not the database id
    { id: "srNo", label: "Sr no.", width: 80, renderCell: (_value, _row, _column, _rowIndex, serialNo) => serialNo },
    // Capped so the spare width goes to the branch columns instead of a long empty Name column
    { id: "name", label: "Name", sortable: true, width: "30%", className: "min-w-48" },
    ...scope.branch.map<TableColumn<IProductModel>>((branch) => ({
        id: `branch-${branch.id}`,
        label: branch.isActive ? branch.name : `${branch.name} (Inactive)`,
        align: "center",
        sortable: true,
        accessor: (row) => row.stocks.find((s) => s.branchId === branch.id)?.quantity ?? null,
        renderCell: (quantity: number | null, row) => {
            if (quantity === null) return <span className="text-slate-300" title={`No stock in ${branch.name}`}>—</span>;
            const stock = row.stocks.find((s) => s.branchId === branch.id);
            return (
                <span
                    title={`${branch.name} · updated ${formatDate(stock?.updatedAt)}`}
                    className={quantity === 0 ? "font-medium tabular-nums text-red-500" : "font-medium tabular-nums text-slate-800"}
                >
                    {quantity.toLocaleString("en-IN")}
                </span>
            );
        },
    })),
    { id: "updatedAt", label: "Last Updated", sortable: true, visible: false, renderCell: formatDate },
    { id: "actions", label: "Action", width: 100 },
];

const Products = () => {
    const userId = useSelector((state: RootState) => state.auth.userId);

    const [filters, setFilters] = useState<ProductFilterValues>(emptyFilters);
    // product is null when adding, set when editing
    const [form, setForm] = useState<{ open: boolean; product: IProductModel | null }>({ open: false, product: null });
    const [productToDelete, setProductToDelete] = useState<IProductModel | null>(null);
    // Bumped after a product is saved or deleted so the table reloads
    const [refreshKey, setRefreshKey] = useState(0);
    const reloadTable = () => setRefreshKey((key) => key + 1);

    // The API decides which branches this user may see; keyed by user so a later login in
    // the same tab never reuses another user's branch list
    const { data: scope, isPending: isScopeLoading, isError: isScopeError, refetch: refetchScope, isFetching: isScopeFetching } = useQuery({
        queryKey: ["product-branches", userId],
        queryFn: async () => {
            const response = await productService.productBranches();
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load your branch access.");
            return response.data.data;
        },
        retry: false,
    });

    const columns = useMemo(() => (scope ? buildColumns(scope) : []), [scope]);
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
            <ProductFilters onChange={setFilters} onAdd={() => setForm({ open: true, product: null })} />

            <p className="-mt-3 text-xs text-slate-500">
                {scope.isAdmin
                    ? "Stock quantity is shown separately for each branch."
                    : <>Showing stock for your branch: <span className="font-semibold text-slate-700">{ownBranchName}</span></>}
            </p>

            {/* User and filters are part of the key so changing them refetches the table */}
            <CustomTable<IProductModel>
                column={columns}
                queryKey={`products:${userId}:${JSON.stringify(filters)}`}
                row={(page: number, limit: number) => productService.product({
                    page,
                    pageSize: limit,
                    search: filters.search || undefined,
                    startDate: filters.startDate || undefined,
                    endDate: filters.endDate || undefined,
                })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey}
                emptyMessage={filters.search || filters.startDate || filters.endDate ? "No products match your filters" : "No products found"}
                isEdit
                onEdit={(product) => setForm({ open: true, product })}
                isDelete
                onDelete={setProductToDelete}
            />

            <AddProductForm
                open={form.open}
                product={form.product}
                scope={scope}
                onClose={() => setForm({ open: false, product: null })}
                onSaved={reloadTable}
            />

            <DeleteProductDialog
                product={productToDelete}
                isAdmin={scope.isAdmin}
                onClose={() => setProductToDelete(null)}
                onDeleted={reloadTable}
            />
        </div>
    );
}

export default Products;
