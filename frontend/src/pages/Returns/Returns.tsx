import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Gavel, Plus, RotateCcw } from "lucide-react";
import { parse } from "date-fns";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import type { ISaleReturnModel, ISaleReturnResponseModel, ReturnStatus } from "@/models/SaleReturn";
import type { ISerialOptionsModel } from "@/models/Serial";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import { Button } from "@/components/Button";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import SerialLink from "@/components/SerialHistory/SerialLink";
import { ReturnStatusBadge, UnitTypeTag } from "@/components/SerialHistory/StatusBadges";
import { useSerialHistory } from "@/components/SerialHistory/SerialHistoryContext";
import { formatMoney, RETURN_STATUS_LABEL } from "@/components/SerialHistory/serialDisplay";
import RecordReturnDialog from "@/components/SerialHistory/RecordReturnDialog";
import saleReturnService from "@/services/sale-return-service";
import serialService from "@/services/serial-service";
import { useDebounce } from "@/hook/useDebounce";
import { isCompleteDate, productFilterSchema } from "@/validation/validation";
import { DateToDisplayDate } from "@/util/DateFormate";
import { formatPhone } from "@/util/CommonFunction";
import DecideReturnDialog from "./DecideReturnDialog";

interface Filters {
    search: string;
    status: string;
    branchId: string;
    startDate: string;
    endDate: string;
}

const emptyFilters: Filters = { search: "", status: "", branchId: "", startDate: "", endDate: "" };

const STATUSES: ReturnStatus[] = ["Pending", "Accepted", "Not Resellable", "Rejected"];

const toDate = (value: string) => (isCompleteDate(value) ? parse(value, DATE_VALUE_FORMAT, new Date()) : undefined);

const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<ISaleReturnResponseModel>>): ISaleReturnModel[] =>
    response.data.data.return;

// Reports filter changes once typing pauses; incomplete or reversed dates are never applied
const FilterWatcher = ({ onChange }: { onChange: (filters: Filters) => void }) => {
    const { values } = useFormikContext<Filters>();
    const debounced = useDebounce(values);

    useEffect(() => {
        const { startDate, endDate } = debounced;
        if ((startDate && !isCompleteDate(startDate)) || (endDate && !isCompleteDate(endDate))) return;
        if (startDate && endDate && startDate > endDate) return;
        onChange({ ...debounced, search: debounced.search.trim() });
    }, [debounced, onChange]);

    return null;
};

const Returns = () => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const { changeCount } = useSerialHistory();
    const [searchParams] = useSearchParams();
    const initialFilters = useMemo<Filters>(() => ({ ...emptyFilters, search: searchParams.get("search") ?? "" }), [searchParams]);
    const [filters, setFilters] = useState<Filters>(initialFilters);
    const [recordOpen, setRecordOpen] = useState(false);
    const [toDecide, setToDecide] = useState<ISaleReturnModel | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const reloadTable = () => setRefreshKey((key) => key + 1);
    const today = useMemo(() => new Date(), []);

    const { data: options, isPending, isError, refetch, isFetching } = useQuery<ISerialOptionsModel>({
        queryKey: ["serial-options", userId],
        queryFn: async () => {
            const response = await serialService.options();
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load your branch access.");
            return response.data.data;
        },
        retry: false,
    });
    const isAdmin = !!options?.isAdmin;

    const statusOptions = useMemo<SelectOption[]>(
        () => [{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: RETURN_STATUS_LABEL[s] }))],
        [],
    );
    const branchOptions = useMemo<SelectOption[]>(() => [
        { value: "", label: "All branches" },
        ...(options?.branch ?? []).map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    ], [options]);

    const columns = useMemo<TableColumn<ISaleReturnModel>[]>(() => [
        { id: "srNo", label: "Sr. No.", width: 80, renderCell: (_v, _r, _c, _i, serialNo) => serialNo },
        { id: "reference", label: "Return", sortable: true },
        {
            id: "serialNumber", label: "Serial Number", sortable: true,
            renderCell: (sn: string, row) => (
                <div className="flex flex-col items-start gap-0.5">
                    <SerialLink serialNumber={sn} />
                    {row.productType !== "Serialized" && <UnitTypeTag unitType={row.productType} />}
                </div>
            ),
        },
        { id: "productName", label: "Product", sortable: true, className: "min-w-40" },
        {
            id: "customerName", label: "Customer", sortable: true, className: "min-w-40",
            renderCell: (name: string, row) => (
                <div className="flex flex-col">
                    <span>{name}</span>
                    {row.customerPhone && <span className="text-xs text-slate-500">{formatPhone(row.customerPhone)}</span>}
                </div>
            ),
        },
        {
            id: "saleReference", label: "Original Sale",
            renderCell: (ref: string, row) => (
                <div className="flex flex-col">
                    <span>{ref}</span>
                    <span className="text-xs text-slate-500">{DateToDisplayDate(row.saleDate)} · {formatMoney(row.saleAmount)}</span>
                </div>
            ),
        },
        { id: "returnDate", label: "Return Date", sortable: true, renderCell: (d: string) => DateToDisplayDate(d) },
        {
            id: "reason", label: "Reason & Condition", className: "min-w-48",
            renderCell: (reason: string, row) => (
                <div className="flex flex-col">
                    <span className="line-clamp-2" title={reason}>{reason}</span>
                    <span className="text-xs text-slate-500">{row.condition}</span>
                </div>
            ),
        },
        {
            id: "refundAmount", label: "Refund", align: "right", sortable: true,
            renderCell: (v: number, row) => (
                <span className={row.status === "Rejected" ? "tabular-nums text-slate-400 line-through" : "font-medium tabular-nums text-orange-700"}>{formatMoney(v)}</span>
            ),
        },
        ...(isAdmin ? [{ id: "branchName", label: "Received At", sortable: true } satisfies TableColumn<ISaleReturnModel>] : []),
        {
            id: "status", label: "Status", sortable: true,
            renderCell: (s: ReturnStatus, row) => (
                <div className="flex flex-col items-start gap-0.5">
                    <ReturnStatusBadge status={s} />
                    {row.decidedByName && <span className="text-[11px] text-slate-400">by {row.decidedByName}{row.decidedAt ? `, ${DateToDisplayDate(row.decidedAt)}` : ""}</span>}
                </div>
            ),
        },
        { id: "createdByName", label: "Recorded By", visible: false },
        {
            id: "actions", label: "Action", align: "right", hideable: false,
            renderCell: (_v, row) => (isAdmin && row.status === "Pending" ? (
                <button
                    type="button"
                    onClick={() => setToDecide(row)}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                    <Gavel className="size-4" /> Decide
                </button>
            ) : row.status === "Pending" ? <span className="text-xs text-slate-400">Awaiting admin</span> : null),
        },
    ], [isAdmin]);

    if (isPending) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
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

    const hasFilters = Object.values(filters).some(Boolean);

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <Formik initialValues={initialFilters} validationSchema={productFilterSchema} onSubmit={() => undefined} key={initialFilters.search}>
                {({ values, resetForm }) => (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start" noValidate>
                            <FilterWatcher onChange={setFilters} />
                            <div className="w-full sm:w-72">
                                <Field name="search" placeholder="Search serial, customer, phone, product, RET-/SALE-..." component={Input} />
                            </div>
                            <div className="w-full sm:w-48">
                                <Field name="status" options={statusOptions} placeholder="All statuses" component={Select} />
                            </div>
                            {isAdmin && (
                                <div className="w-full sm:w-44">
                                    <Field name="branchId" options={branchOptions} placeholder="All branches" component={Select} />
                                </div>
                            )}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
                                <Field name="startDate" maxDate={toDate(values.endDate) ?? today} component={DatePicker} className="w-full sm:w-44" />
                                <span className="hidden h-10 items-center text-xs text-slate-400 sm:flex">to</span>
                                <Field name="endDate" minDate={toDate(values.startDate)} maxDate={today} component={DatePicker} className="w-full sm:w-44" />
                            </div>
                            <Button
                                onClick={() => resetForm({ values: emptyFilters })}
                                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                            >
                                <RotateCcw className="size-4" />
                                Reset
                            </Button>
                        </Form>
                        <Button className="lg:w-auto" onClick={() => setRecordOpen(true)}>
                            <Plus className="size-4" />
                            Record Return
                        </Button>
                    </div>
                )}
            </Formik>

            <p className="-mt-3 text-xs text-slate-500">
                {isAdmin
                    ? "Showing returns from all branches. Pending returns need your decision before the unit can be sold again."
                    : <>Showing returns of your branch's sales and returns received by your branch: <span className="font-semibold text-slate-700">{options.branch[0]?.name}</span></>}
            </p>

            <CustomTable<ISaleReturnModel>
                column={columns}
                queryKey={`returns:${userId}:${JSON.stringify(filters)}`}
                row={(page: number, limit: number) => saleReturnService.list({
                    page,
                    pageSize: limit,
                    search: filters.search || undefined,
                    status: (filters.status || undefined) as ReturnStatus | undefined,
                    branchId: filters.branchId ? Number(filters.branchId) : undefined,
                    startDate: filters.startDate || undefined,
                    endDate: filters.endDate || undefined,
                })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey + changeCount}
                emptyMessage={hasFilters ? "No returns match your filters" : "No returns recorded yet"}
            />

            <RecordReturnDialog open={recordOpen} target={null} onClose={() => setRecordOpen(false)} onSaved={reloadTable} />
            <DecideReturnDialog entry={toDecide} onClose={() => setToDecide(null)} onDecided={reloadTable} />
        </div>
    );
};

export default Returns;
