import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, KeyRound, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";
import type { IProductBranchScopeModel, IProductModel, IProductResponseModel } from "@/models/Product";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import { Input } from "@/components/formik-fields/Input";
import { Button } from "@/components/Button";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import SerialLink from "@/components/SerialHistory/SerialLink";
import { useSerialHistory } from "@/components/SerialHistory/SerialHistoryContext";
import productService from "@/services/product-service";
import { useDebounce } from "@/hook/useDebounce";
import { DateToDisplayDate } from "@/util/DateFormate";
import AddProductForm from "@/pages/Products/AddProductForm";
import DeleteProductDialog from "@/pages/Products/DeleteProductDialog";
import SoftwareLicensesDialog from "./SoftwareLicensesDialog";

// Software products and their license keys. Uses the same product API as Products (filtered to
// Software), so adding, editing and removing keys follow the same rules and branch access.
// Licenses are never physical stock: each branch has a pool of available keys.

const KEYS_SHOWN = 4;

const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<IProductResponseModel>>): IProductModel[] =>
    response.data.data.product;

// Reports the search once typing pauses
const SearchWatcher = ({ onChange }: { onChange: (search: string) => void }) => {
    const { values } = useFormikContext<{ search: string }>();
    const search = useDebounce(values.search.trim());
    useEffect(() => onChange(search), [search, onChange]);
    return null;
};

const IconButton = ({ label, icon: Icon, className, onClick }: { label: string; icon: typeof Pencil; className: string; onClick: () => void }) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        onClick={(e) => {
            e.stopPropagation();
            onClick();
        }}
        className={`inline-flex size-8 items-center justify-center rounded-lg transition-colors ${className}`}
    >
        <Icon className="size-4" />
    </button>
);

// Available keys of every branch the user may see, the ones matching the search first
const AvailableKeys = ({ product, search }: { product: IProductModel; search: string }) => {
    const all = product.stocks.flatMap((s) => s.serialNumbers);
    if (all.length === 0) return <span className="text-xs text-slate-400">No keys available</span>;
    const term = search.toLowerCase();
    const matches = term ? all.filter((sn) => sn.toLowerCase().includes(term)) : [];
    const ordered = [...matches, ...all.filter((sn) => !matches.includes(sn))];
    return (
        <div className="flex flex-wrap items-center gap-1" title={all.join(", ")}>
            {ordered.slice(0, KEYS_SHOWN).map((sn) => <SerialLink key={sn} serialNumber={sn} variant="chip" highlight={matches.includes(sn)} />)}
            {all.length > KEYS_SHOWN && <span className="text-xs text-slate-400">+{all.length - KEYS_SHOWN} more</span>}
        </div>
    );
};

interface Actions {
    onView: (product: IProductModel) => void;
    onEdit: (product: IProductModel) => void;
    onDelete: (product: IProductModel) => void;
}

const buildColumns = (scope: IProductBranchScopeModel, search: string, actions: Actions): TableColumn<IProductModel>[] => [
    { id: "srNo", label: "Sr no.", width: 80, renderCell: (_v, _r, _c, _i, serialNo) => serialNo },
    {
        id: "name", label: "Software Name", sortable: true, className: "min-w-48",
        renderCell: (name: string, row) => (
            <div className="flex flex-col items-start gap-0.5">
                <span className="font-medium text-slate-800">{name}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${row.licenseReassignable ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {row.licenseReassignable ? "Reassignable after return" : "Single-use license"}
                </span>
            </div>
        ),
    },
    {
        id: "keys", label: "Available License Keys", className: "min-w-56",
        accessor: (row) => row.stocks.reduce((sum, s) => sum + (s.licenseCount ?? 0), 0),
        renderCell: (_v, row) => <AvailableKeys product={row} search={search} />,
    },
    ...scope.branch.map<TableColumn<IProductModel>>((branch) => ({
        id: `branch-${branch.id}`,
        label: branch.isActive ? branch.name : `${branch.name} (Inactive)`,
        align: "center",
        sortable: true,
        accessor: (row) => row.stocks.find((s) => s.branchId === branch.id)?.licenseCount ?? null,
        renderCell: (count: number | null) => (count === null
            ? <span className="text-slate-300" title={`${branch.name} has no licenses of this software`}>—</span>
            : <span className={count === 0 ? "text-xs font-medium text-red-500" : "text-xs font-medium tabular-nums text-violet-700"}>{count} available</span>),
    })),
    { id: "updatedAt", label: "Last Updated", sortable: true, visible: false, renderCell: (d: string) => DateToDisplayDate(d) },
    {
        id: "actions", label: "Action", align: "right", hideable: false,
        renderCell: (_v, row) => (
            <div className="inline-flex items-center gap-1">
                <IconButton label="View all licenses" icon={KeyRound} onClick={() => actions.onView(row)} className="text-violet-600 hover:bg-violet-50 hover:text-violet-700" />
                <IconButton label="Edit software / license keys" icon={Pencil} onClick={() => actions.onEdit(row)} className="text-blue-500 hover:bg-blue-50 hover:text-blue-600" />
                <IconButton label="Remove" icon={Trash2} onClick={() => actions.onDelete(row)} className="text-red-500 hover:bg-red-50 hover:text-red-600" />
            </div>
        ),
    },
];

const Software = () => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const { changeCount } = useSerialHistory();
    const [search, setSearch] = useState("");
    // product is null when adding, set when editing
    const [form, setForm] = useState<{ open: boolean; product: IProductModel | null }>({ open: false, product: null });
    const [toDelete, setToDelete] = useState<IProductModel | null>(null);
    const [toView, setToView] = useState<IProductModel | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const reloadTable = () => setRefreshKey((key) => key + 1);

    // Same branch access as Products
    const { data: scope, isPending, isError, refetch, isFetching } = useQuery<IProductBranchScopeModel>({
        queryKey: ["product-branches", userId],
        queryFn: async () => {
            const response = await productService.productBranches();
            if (!response?.data?.status) throw new Error("Could not load your branch access.");
            return response.data.data;
        },
        retry: false,
    });

    const ownBranchName = scope && !scope.isAdmin ? scope.branch.find((b) => b.id === scope.branchId)?.name : null;

    // Members only change their own branch's license pool, which this software may not have
    const columns = useMemo(() => (scope ? buildColumns(scope, search, {
        onView: setToView,
        onEdit: (product) => {
            if (scope.isAdmin || product.stocks.some((s) => s.branchId === scope.branchId)) setForm({ open: true, product });
            else toast.error(`This software has no licenses in ${ownBranchName ?? "your branch"}`);
        },
        onDelete: (product) => {
            if (scope.isAdmin || product.stocks.some((s) => s.branchId === scope.branchId)) setToDelete(product);
            else toast.error(`This software has no licenses in ${ownBranchName ?? "your branch"}`);
        },
    }) : []), [scope, search, ownBranchName]);

    if (isPending) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
                <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
                <div className="h-64 w-full animate-pulse rounded-2xl bg-slate-100" />
            </div>
        );
    }

    if (isError || !scope) {
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

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <Formik initialValues={{ search: "" }} onSubmit={() => undefined}>
                {({ resetForm }) => (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <Form className="flex flex-col gap-3 sm:flex-row sm:items-start" noValidate>
                            <SearchWatcher onChange={setSearch} />
                            <div className="w-full sm:w-80">
                                <Field name="search" placeholder="Search software name or license key..." component={Input} />
                            </div>
                            <Button
                                onClick={() => resetForm()}
                                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                            >
                                <RotateCcw className="size-4" />
                                Reset
                            </Button>
                        </Form>
                        {scope.isAdmin && (
                            <Button className="lg:w-auto" onClick={() => setForm({ open: true, product: null })}>
                                <Plus className="size-4" />
                                Add Software
                            </Button>
                        )}
                    </div>
                )}
            </Formik>

            <p className="-mt-3 text-xs text-slate-500">
                Licenses are tracked by key, not as physical stock: each branch has a pool of available keys, sold even when stock is 0.
                {scope.isAdmin ? "" : <> You can change license keys in your branch: <span className="font-semibold text-slate-700">{ownBranchName}</span></>}
            </p>

            <CustomTable<IProductModel>
                column={columns}
                queryKey={`software:${userId}:${search}`}
                row={(page: number, limit: number) => productService.product({ productTypes: "Software", page, pageSize: limit, search: search || undefined })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey + changeCount}
                emptyMessage={search ? "No software matches your search" : "No software added yet"}
            />

            <AddProductForm
                open={form.open}
                product={form.product}
                scope={scope}
                softwareOnly
                onClose={() => setForm({ open: false, product: null })}
                onSaved={reloadTable}
            />
            <DeleteProductDialog product={toDelete} scope={scope} onClose={() => setToDelete(null)} onDeleted={reloadTable} />
            <SoftwareLicensesDialog product={toView} onClose={() => setToView(null)} />
        </div>
    );
};

export default Software;
