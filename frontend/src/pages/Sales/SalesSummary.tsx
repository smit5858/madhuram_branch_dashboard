import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { IndianRupee } from "lucide-react";
import moment from "moment";
import type { ISaleRequestModel, ISaleSummaryModel } from "@/models/Sale";
import type { RootState } from "@/store/store";
import saleService from "@/services/sale-service";

type SaleSummaryFilters = Required<Pick<ISaleRequestModel, "search" | "startDate" | "endDate">>;

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

const TYPE_LABEL: Record<string, string> = {
    Software: "Software licenses",
    Renewal: "License renewals",
    Service: "Installation services",
};

const formatDate = (value: string) => moment(value, "YYYY-MM-DD").format("DD MMM YYYY");

// "All time", "01 Jan 2026 – 31 Jan 2026", "From 01 Jan 2026" or "Up to 31 Jan 2026"
const rangeLabel = ({ startDate, endDate }: SaleSummaryFilters) => {
    if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
    if (startDate) return `From ${formatDate(startDate)}`;
    if (endDate) return `Up to ${formatDate(endDate)}`;
    return "All time";
};

// refunds: of these sales' returns; shown with the net only when there are any
const SalesCard = ({ label, total, refunds, net, caption }: { label: string; total: number; refunds: number; net: number; caption: string }) => (
    <div className="rounded-2xl border border-blue-100 bg-linear-to-br from-blue-50 to-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-blue-700">{label}</span>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <IndianRupee className="size-5" />
            </span>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{currency.format(total)}</p>
        {refunds > 0 && (
            <p className="mt-1 text-xs tabular-nums text-slate-600">
                Refunds <span className="font-semibold text-orange-700">−{currency.format(refunds)}</span> · Net <span className="font-semibold text-slate-800">{currency.format(net)}</span>
            </p>
        )}
        <p className="mt-1 truncate text-xs text-slate-500" title={caption}>{caption}</p>
    </div>
);

// Total sales for the list's current filters: a single "My Total Sells" card for branch members,
// one "Total Sells" card per branch for admins. refreshKey is bumped by the page after a sale is
// saved or deleted so the totals stay in step with the table.
const SalesSummary = ({ isAdmin, filters, refreshKey }: { isAdmin: boolean; filters: SaleSummaryFilters; refreshKey: number }) => {
    const userId = useSelector((state: RootState) => state.auth.userId);

    const { data, isPending, isError } = useQuery<ISaleSummaryModel>({
        queryKey: ["sales-summary", userId, filters, refreshKey],
        queryFn: async () => {
            const response = await saleService.salesSummary({
                search: filters.search || undefined,
                startDate: filters.startDate || undefined,
                endDate: filters.endDate || undefined,
            });
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load sales totals.");
            return response.data.data;
        },
        placeholderData: (previous) => previous,
        retry: false,
    });

    if (isPending) {
        return <div className="h-36 w-full animate-pulse rounded-2xl bg-slate-100 sm:w-80" />;
    }

    if (isError || !data) return null;

    const range = rangeLabel(filters);

    return (
        <section className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">
                Sales for <span className="font-semibold text-slate-700">{range}</span>
                {filters.search && <> matching <span className="font-semibold text-slate-700">"{filters.search}"</span></>}
                {isAdmin && <> · All branches: <span className="font-semibold text-slate-700">{currency.format(data.total)}</span></>}
                {isAdmin && data.refunds > 0 && <> (net of refunds: <span className="font-semibold text-slate-700">{currency.format(data.net)}</span>)</>}
            </p>
            {/* Software licenses, renewals and installation services shown apart from physical goods */}
            {data.byType.some((t) => TYPE_LABEL[t.productType] && t.total > 0) && (
                <p className="-mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {data.byType.filter((t) => t.total > 0).sort((a, b) => b.total - a.total).map((t) => (
                        <span key={t.productType}>
                            {TYPE_LABEL[t.productType] ?? t.productType}: <span className="font-semibold tabular-nums text-slate-700">{currency.format(t.total)}</span>
                        </span>
                    ))}
                </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {isAdmin ? (
                    data.branch.map((b) => (
                        <SalesCard key={b.branchId} label="Total Sells" total={b.total} refunds={b.refunds} net={b.net} caption={b.branchName} />
                    ))
                ) : (
                    <SalesCard label="My Total Sells" total={data.total} refunds={data.refunds} net={data.net} caption="Your total sales contribution" />
                )}
            </div>
        </section>
    );
};

export default SalesSummary;
