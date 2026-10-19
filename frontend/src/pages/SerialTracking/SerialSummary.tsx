import clsx from "clsx";
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Package, Wrench, type LucideIcon } from "lucide-react";
import serialService from "@/services/serial-service";
import type { RootState } from "@/store/store";
import type { ISerialListRequestModel, ISerialSummaryModel, SerialStatus, SerialUnitType } from "@/models/Serial";
import { statusLabel } from "@/components/SerialHistory/serialDisplay";

// Which statuses each report shows, in lifecycle order
const REPORTS: { type: SerialUnitType; title: string; caption: string; icon: LucideIcon; className: string; statuses: SerialStatus[] }[] = [
    {
        type: "Serialized",
        title: "Physical Units",
        caption: "Counted in physical stock",
        icon: Package,
        className: "border-slate-200 bg-slate-50/60 text-slate-700",
        statuses: ["Available", "Sold", "Returned", "Not Resellable", "Removed"],
    },
    {
        type: "Software",
        title: "Software Licenses",
        caption: "Not physical stock",
        icon: KeyRound,
        className: "border-violet-200 bg-violet-50/60 text-violet-700",
        statuses: ["Available", "Sold", "Installed", "Active", "Expired", "Returned", "Cancelled"],
    },
    {
        type: "Service",
        title: "Installations",
        caption: "Service, no stock",
        icon: Wrench,
        className: "border-sky-200 bg-sky-50/60 text-sky-700",
        statuses: ["Sold", "Installed", "Returned", "Cancelled"],
    },
];

// Physical stock, licenses and installations reported apart, for the page's filters
const SerialSummary = ({ filters, refreshKey }: { filters: Omit<ISerialListRequestModel, "page" | "pageSize">; refreshKey: number }) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    // The status filter would empty every other count, so the report ignores it
    const rest = { ...filters, status: undefined };

    const { data } = useQuery<ISerialSummaryModel>({
        queryKey: ["serial-summary", userId, rest, refreshKey],
        queryFn: async () => {
            const response = await serialService.summary(rest);
            if (!response?.data?.status) throw new Error("Could not load the summary.");
            return response.data.data;
        },
        placeholderData: (previous) => previous,
        retry: false,
    });

    if (!data) return <div className="h-28 w-full animate-pulse rounded-2xl bg-slate-100" />;

    const shown = REPORTS.filter((r) => (data.types.find((t) => t.productType === r.type)?.total ?? 0) > 0 || r.type === "Serialized");

    return (
        <div className={clsx("grid gap-3", shown.length === 3 ? "lg:grid-cols-3" : shown.length === 2 ? "md:grid-cols-2" : "")}>
            {shown.map((report) => {
                const counts = data.types.find((t) => t.productType === report.type);
                const Icon = report.icon;
                return (
                    <section key={report.type} className={clsx("rounded-2xl border p-4", report.className)}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                                <Icon className="size-4" /> {report.title}
                            </span>
                            <span className="text-xs opacity-75">{report.caption}</span>
                        </div>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{(counts?.total ?? 0).toLocaleString("en-IN")}</p>
                        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                            {report.statuses.filter((s) => counts?.byStatus[s]).map((s) => (
                                <div key={s} className="flex gap-1">
                                    <dt>{statusLabel(s, report.type)}:</dt>
                                    <dd className="font-semibold tabular-nums text-slate-800">{counts!.byStatus[s]}</dd>
                                </div>
                            ))}
                            {report.type === "Software" && (counts?.expiringSoon ?? 0) > 0 && (
                                <div className="flex gap-1 text-amber-700">
                                    <dt>Expiring in {data.expiringDays} days:</dt>
                                    <dd className="font-semibold tabular-nums">{counts!.expiringSoon}</dd>
                                </div>
                            )}
                        </dl>
                    </section>
                );
            })}
        </div>
    );
};

export default SerialSummary;
