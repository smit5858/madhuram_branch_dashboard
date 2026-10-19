import { useState } from "react";
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import { Dialog } from "@/components/Dialog";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import SerialLink from "@/components/SerialHistory/SerialLink";
import { SerialStatusBadge } from "@/components/SerialHistory/StatusBadges";
import { useSerialHistory } from "@/components/SerialHistory/SerialHistoryContext";
import { formatMoney, statusLabel } from "@/components/SerialHistory/serialDisplay";
import serialService from "@/services/serial-service";
import { DateToDisplayDate } from "@/util/DateFormate";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import type { IProductModel } from "@/models/Product";
import type { ISerialListResponseModel, ISerialSummaryModel, ISerialUnitRowModel, SerialStatus } from "@/models/Serial";

const STATUS_ORDER: SerialStatus[] = ["Available", "Sold", "Installed", "Active", "Expired", "Returned", "Cancelled", "Removed"];

const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<ISerialListResponseModel>>): ISerialUnitRowModel[] =>
    response.data.data.unit;

const columns: TableColumn<ISerialUnitRowModel>[] = [
    { id: "srNo", label: "Sr. No.", width: 70, renderCell: (_v, _r, _c, _i, serialNo) => serialNo },
    { id: "serialNumber", label: "License Key", sortable: true, renderCell: (sn: string) => <SerialLink serialNumber={sn} /> },
    { id: "status", label: "Status", sortable: true, renderCell: (s: SerialStatus) => <SerialStatusBadge status={s} unitType="Software" /> },
    { id: "branchName", label: "Branch", sortable: true },
    {
        id: "lastCustomerName", label: "Customer",
        renderCell: (name: string | null, row) => (name && row.status !== "Available" ? name : null),
    },
    { id: "lastSaleDate", label: "Sold On", sortable: true, renderCell: (d: string | null, row) => (row.status !== "Available" ? DateToDisplayDate(d) || null : null) },
    { id: "expiryDate", label: "Valid Until", sortable: true, renderCell: (d: string | null) => DateToDisplayDate(d) || null },
    { id: "deviceName", label: "Device", visible: false },
    { id: "purchaseAmount", label: "Cost", align: "right", visible: false, renderCell: (v: number | null) => (v === null ? null : formatMoney(v)) },
];

// Every license key a software product has ever had (in a pool, sold, active, cancelled...),
// each opening its full history
const SoftwareLicensesDialog = ({ product, onClose }: { product: IProductModel | null; onClose: () => void }) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const { changeCount } = useSerialHistory();
    const [status, setStatus] = useState<SerialStatus | "">("");

    const { data: summary } = useQuery<ISerialSummaryModel>({
        queryKey: ["software-license-summary", userId, product?.id, changeCount],
        queryFn: async () => {
            const response = await serialService.summary({ productId: product!.id, productType: "Software" });
            if (!response?.data?.status) throw new Error("Could not load license counts.");
            return response.data.data;
        },
        enabled: !!product,
        retry: false,
    });
    const counts = summary?.types.find((t) => t.productType === "Software");

    const close = () => {
        setStatus("");
        onClose();
    };

    return (
        <Dialog open={!!product} onClose={close} title={`Licenses · ${product?.name ?? ""}`} className="max-w-5xl! max-h-[90vh] overflow-y-auto!">
            {product && (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setStatus("")}
                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${status === "" ? "bg-blue-500 text-white ring-blue-500" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
                        >
                            All · {counts?.total ?? 0}
                        </button>
                        {STATUS_ORDER.filter((s) => counts?.byStatus[s]).map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setStatus(s)}
                                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${status === s ? "bg-blue-500 text-white ring-blue-500" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
                            >
                                {statusLabel(s, "Software")} · {counts!.byStatus[s]}
                            </button>
                        ))}
                        {(counts?.expiringSoon ?? 0) > 0 && (
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                                {counts!.expiringSoon} expiring in {summary!.expiringDays} days
                            </span>
                        )}
                    </div>
                    <CustomTable<ISerialUnitRowModel>
                        column={columns}
                        queryKey={`software-licenses:${userId}:${product.id}:${status}`}
                        row={(page: number, limit: number) => serialService.list({ productId: product.id, productType: "Software", status: status || undefined, page, pageSize: limit })}
                        mapResponseToColumns={mapResponseToColumns}
                        refreshKey={changeCount}
                        emptyMessage={status ? `No ${statusLabel(status, "Software").toLowerCase()} licenses` : "No licenses recorded yet"}
                    />
                    <p className="text-xs text-slate-500">Click a license key to see its purchase, sale, installation, renewal and return history.</p>
                </div>
            )}
        </Dialog>
    );
};

export default SoftwareLicensesDialog;
