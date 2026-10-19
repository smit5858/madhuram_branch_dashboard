import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, Download, Eye, RotateCcw } from "lucide-react";
import { parse } from "date-fns";
import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import type { ISerialListRequestModel, ISerialListResponseModel, ISerialOptionsModel, ISerialUnitRowModel, SerialStatus } from "@/models/Serial";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import { Button } from "@/components/Button";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import SerialLink from "@/components/SerialHistory/SerialLink";
import { SerialStatusBadge, UnitTypeTag } from "@/components/SerialHistory/StatusBadges";
import SerialSummary from "./SerialSummary";
import { useSerialHistory } from "@/components/SerialHistory/SerialHistoryContext";
import { formatMoney, statusLabel, UNIT_TYPE_LABEL } from "@/components/SerialHistory/serialDisplay";
import serialService from "@/services/serial-service";
import { useDebounce } from "@/hook/useDebounce";
import { isCompleteDate } from "@/validation/validation";
import { DateToDisplayDate } from "@/util/DateFormate";
import { formatPhone } from "@/util/CommonFunction";

type Filters = Required<Omit<ISerialListRequestModel, "page" | "pageSize" | "branchId" | "status" | "productType" | "productId">>
    & { branchId: string; status: string; productType: string };

const emptyFilters: Filters = {
    serialNumber: "", productName: "", customer: "", supplier: "", type: "", branchId: "", status: "", productType: "",
    purchaseStartDate: "", purchaseEndDate: "", saleStartDate: "", saleEndDate: "", returnStartDate: "", returnEndDate: "",
    installationStartDate: "", installationEndDate: "", expiryStartDate: "", expiryEndDate: "",
};

const TEXT_FIELDS = ["serialNumber", "productName", "customer", "supplier"] as const;
// [start, end, label, future dates allowed]
const DATE_RANGES = [
    ["purchaseStartDate", "purchaseEndDate", "Purchase", false],
    ["saleStartDate", "saleEndDate", "Sale", false],
    ["returnStartDate", "returnEndDate", "Return", false],
    ["installationStartDate", "installationEndDate", "Installation", false],
    ["expiryStartDate", "expiryEndDate", "License expiry", true],
] as const;

const toDate = (value: string) => (isCompleteDate(value) ? parse(value, DATE_VALUE_FORMAT, new Date()) : undefined);

// Only what is set goes to the API
const toRequest = (filters: Filters): Omit<ISerialListRequestModel, "page" | "pageSize"> => {
    const request: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(filters)) {
        if (value) request[key] = key === "branchId" ? Number(value) : value;
    }
    return request as Omit<ISerialListRequestModel, "page" | "pageSize">;
};

const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<ISerialListResponseModel>>): ISerialUnitRowModel[] =>
    response.data.data.unit;

// Every date range is empty or complete and in order
const datesReady = (values: Filters) => DATE_RANGES.every(([start, end]) => {
    const s = values[start];
    const e = values[end];
    if ((s && !isCompleteDate(s)) || (e && !isCompleteDate(e))) return false;
    return !s || !e || s <= e;
});

// Reports filter changes once typing pauses. A half-typed or reversed date range keeps the last
// applied filters, so it never reaches the API.
const FilterWatcher = ({ onChange }: { onChange: (filters: Filters) => void }) => {
    const { values } = useFormikContext<Filters>();
    const debounced = useDebounce(values);

    useEffect(() => {
        if (!datesReady(debounced)) return;
        const next = { ...debounced };
        for (const key of TEXT_FIELDS) next[key] = debounced[key].trim();
        onChange(next);
    }, [debounced, onChange]);

    return null;
};

const csvCell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const EXPORT_PAGE_SIZE = 200;

const SerialTracking = () => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const { openHistory, changeCount } = useSerialHistory();
    const [searchParams] = useSearchParams();
    const initialFilters = useMemo<Filters>(() => ({ ...emptyFilters, serialNumber: searchParams.get("serialNumber") ?? "" }), [searchParams]);
    const [filters, setFilters] = useState<Filters>(initialFilters);
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

    const statusOptions = useMemo<SelectOption[]>(() => [
        { value: "", label: "All statuses" },
        ...(options?.statuses ?? []).map((s) => ({ value: s, label: statusLabel(s) })),
    ], [options]);
    const unitTypeOptions = useMemo<SelectOption[]>(() => [
        { value: "", label: "All product types" },
        ...(options?.productTypes ?? []).map((t) => ({ value: t, label: t === "Serialized" ? "Physical serialized" : t === "Software" ? "Software licenses" : "Installation services" })),
    ], [options]);
    const typeOptions = useMemo<SelectOption[]>(() => [
        { value: "", label: "All transaction types" },
        ...(options?.eventTypes ?? []).map((t) => ({ value: t, label: t })),
    ], [options]);
    const branchOptions = useMemo<SelectOption[]>(() => [
        { value: "", label: "All branches" },
        ...(options?.branch ?? []).map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    ], [options]);

    const columns = useMemo<TableColumn<ISerialUnitRowModel>[]>(() => [
        // Running number (1, 2, 3 ... continuing across pages), not the database id
        { id: "srNo", label: "Sr. No.", width: 80, renderCell: (_v, _r, _c, _i, serialNo) => serialNo },
        {
            id: "serialNumber", label: "Serial Number", sortable: true,
            renderCell: (sn: string, row) => (
                <div className="flex flex-col items-start gap-0.5">
                    <SerialLink serialNumber={sn} />
                    {row.productType !== "Serialized" && <UnitTypeTag unitType={row.productType} />}
                </div>
            ),
        },
        { id: "productName", label: "Product Name", sortable: true, className: "min-w-44" },
        { id: "purchaseDate", label: "Purchase Date", sortable: true, renderCell: (d: string | null) => DateToDisplayDate(d) || null },
        {
            id: "purchaseAmount", label: "Purchase Price", align: "right", sortable: true,
            renderCell: (v: number | null) => (v === null ? null : <span className="tabular-nums">{formatMoney(v)}</span>),
        },
        {
            id: "lastSaleDate", label: "Latest Sale Date", sortable: true,
            renderCell: (d: string | null, row) => (d ? (
                <div className="flex flex-col">
                    <span>{DateToDisplayDate(d)}</span>
                    {row.salesCount > 1 && <span className="text-xs text-slate-500">{row.salesCount} sales{row.returnsCount ? ` · ${row.returnsCount} returned` : ""}</span>}
                </div>
            ) : null),
        },
        {
            id: "lastSellingAmount", label: "Latest Sale Price", align: "right", sortable: true,
            renderCell: (v: number | null) => (v === null ? null : <span className="font-medium tabular-nums text-slate-800">{formatMoney(v)}</span>),
        },
        {
            id: "lastCustomerName", label: "Customer", className: "min-w-40",
            renderCell: (name: string | null, row) => (name ? (
                <div className="flex flex-col">
                    <span>{name}</span>
                    {row.lastCustomerPhone && <span className="text-xs text-slate-500">{formatPhone(row.lastCustomerPhone)}</span>}
                </div>
            ) : null),
        },
        { id: "supplierName", label: "Supplier", visible: false },
        { id: "branchName", label: "Current Branch", sortable: true },
        { id: "status", label: "Current Status", sortable: true, renderCell: (s: SerialStatus, row) => <SerialStatusBadge status={s} unitType={row.productType} /> },
        {
            id: "expiryDate", label: "License Expiry", sortable: true,
            renderCell: (d: string | null, row) => (d ? (
                <span className={row.status === "Expired" ? "font-medium text-orange-600" : undefined}>{DateToDisplayDate(d)}</span>
            ) : null),
        },
        { id: "installationDate", label: "Installed On", visible: false, renderCell: (d: string | null) => DateToDisplayDate(d) || null },
        { id: "deviceName", label: "Device", visible: false },
        {
            id: "actions", label: "Action", align: "right", hideable: false,
            renderCell: (_v, row) => (
                <button
                    type="button"
                    onClick={() => openHistory(row.serialNumber)}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                    <Eye className="size-4" /> View History
                </button>
            ),
        },
    ], [openHistory]);

    const { mutate: exportCsv, isPending: isExporting } = useMutation({
        mutationFn: async () => {
            const rows: ISerialUnitRowModel[] = [];
            for (let page = 1; ; page++) {
                const response = await serialService.list({ ...toRequest(filters), page, pageSize: EXPORT_PAGE_SIZE });
                if (!response?.data?.status) throw new Error("Export failed");
                rows.push(...response.data.data.unit);
                if (page >= response.data.data.pagination.totalPages) break;
            }
            return rows;
        },
        onSuccess: (rows) => {
            if (rows.length === 0) {
                toast.error("Nothing to export for these filters");
                return;
            }
            const header = ["Sr. No.", "Serial Number", "Type", "Product Name", "Purchase Date", "Purchase Price", "Supplier", "Sales", "Returns",
                "Latest Sale Date", "Latest Sale Price", "Customer", "Customer Phone", "Current Branch", "Current Status",
                "Installed On", "Device", "Activated On", "License Expiry"];
            const lines = rows.map((r, i) => [
                i + 1, r.serialNumber, UNIT_TYPE_LABEL[r.productType], r.productName, DateToDisplayDate(r.purchaseDate), r.purchaseAmount, r.supplierName, r.salesCount, r.returnsCount,
                DateToDisplayDate(r.lastSaleDate), r.lastSellingAmount, r.lastCustomerName, r.lastCustomerPhone, r.branchName, statusLabel(r.status, r.productType),
                DateToDisplayDate(r.installationDate), r.deviceName, DateToDisplayDate(r.activationDate), DateToDisplayDate(r.expiryDate),
            ].map(csvCell).join(","));
            // BOM so Excel reads the file as UTF-8
            const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `serial-tracking-${DateToDisplayDate(new Date())}.csv`;
            link.click();
            URL.revokeObjectURL(url);
            toast.success(`Exported ${rows.length.toLocaleString("en-IN")} serial number${rows.length === 1 ? "" : "s"}`);
        },
        onError: () => toast.error("Could not export. Please try again."),
    });

    if (isPending) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
                <div className="h-28 w-full animate-pulse rounded-xl bg-slate-100" />
                <div className="h-64 w-full animate-pulse rounded-2xl bg-slate-100" />
            </div>
        );
    }

    if (isError || !options) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-md">
                <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-slate-500">
                    <CircleAlert className="size-6 text-red-400" />
                    <span>We couldn't load serial number tracking. If your account isn't assigned to a branch, contact your administrator.</span>
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
            <SerialSummary filters={toRequest(filters)} refreshKey={changeCount} />

            <Formik initialValues={initialFilters} onSubmit={() => undefined} key={initialFilters.serialNumber}>
                {({ values, resetForm }) => (
                    <Form className="flex flex-col gap-3" noValidate>
                        <FilterWatcher onChange={setFilters} />
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Field name="serialNumber" placeholder="Serial number..." component={Input} />
                            <Field name="productName" placeholder="Product name..." component={Input} />
                            <Field name="customer" placeholder="Customer name or phone..." component={Input} />
                            <Field name="supplier" placeholder="Supplier / dealer..." component={Input} />
                            <Field name="type" options={typeOptions} placeholder="All transaction types" component={Select} />
                            {options.isAdmin
                                ? <Field name="branchId" options={branchOptions} placeholder="All branches" component={Select} />
                                : <p className="flex h-10 items-center px-1 text-xs text-slate-500">Branch: <span className="ml-1 font-semibold text-slate-700">{options.branch[0]?.name}</span></p>}
                            <Field name="status" options={statusOptions} placeholder="All statuses" component={Select} />
                            <Field name="productType" options={unitTypeOptions} placeholder="All product types" component={Select} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {DATE_RANGES.map(([start, end, label, future]) => (
                                <div key={label} className="flex flex-col gap-1">
                                    <span className="px-1 text-xs font-medium text-slate-500">{label} date</span>
                                    <div className="flex items-start gap-2">
                                        <Field name={start} maxDate={toDate(values[end]) ?? (future ? undefined : today)} component={DatePicker} className="w-full" />
                                        <span className="flex h-10 items-center text-xs text-slate-400">to</span>
                                        <Field name={end} minDate={toDate(values[start])} maxDate={future ? undefined : today} component={DatePicker} className="w-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs text-slate-500">
                                {options.isAdmin
                                    ? "Showing serial numbers from all branches."
                                    : "Showing serial numbers your branch has held, sold, received or transferred."}
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button
                                    onClick={() => resetForm({ values: emptyFilters })}
                                    className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                                >
                                    <RotateCcw className="size-4" />
                                    Reset
                                </Button>
                                <Button onClick={() => exportCsv()} loading={isExporting} className="sm:w-auto">
                                    <Download className="size-4" />
                                    Export CSV
                                </Button>
                            </div>
                        </div>
                    </Form>
                )}
            </Formik>

            {/* User and filters are part of the key so changing them refetches the table */}
            <CustomTable<ISerialUnitRowModel>
                column={columns}
                queryKey={`serials:${userId}:${JSON.stringify(filters)}`}
                row={(page: number, limit: number) => serialService.list({ ...toRequest(filters), page, pageSize: limit })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={changeCount}
                emptyMessage={hasFilters ? "No serial numbers match your filters" : "No serial numbers recorded yet"}
            />
        </div>
    );
};

export default SerialTracking;
