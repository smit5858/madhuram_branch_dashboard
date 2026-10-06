import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { IndianRupee } from "lucide-react";
import moment from "moment";
import type { ISaleRequestModel, ISaleSummaryModel } from "@/models/Sale";
import type { RootState } from "@/store/store";
import saleService from "@/services/sale-service";

type SaleSummaryFilters = Required<Pick<ISaleRequestModel, "search" | "startDate" | "endDate">>;

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

const formatDate = (value: string) => moment(value, "YYYY-MM-DD").format("DD MMM YYYY");

// "All time", "01 Jan 2026 – 31 Jan 2026", "From 01 Jan 2026" or "Up to 31 Jan 2026"
const rangeLabel = ({ startDate, endDate }: SaleSummaryFilters) => {
    if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
    if (startDate) return `From ${formatDate(startDate)}`;
    if (endDate) return `Up to ${formatDate(endDate)}`;
    return "All time";
};

const SalesCard = ({ label, total, caption }: { label: string; total: number; caption: string }) => (
    <div className="rounded-2xl border border-blue-100 bg-linear-to-br from-blue-50 to-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-blue-700">{label}</span>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <IndianRupee className="size-5" />
            </span>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{currency.format(total)}</p>
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
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {isAdmin ? (
                    data.branch.map((b) => (
                        <SalesCard key={b.branchId} label="Total Sells" total={b.total} caption={b.branchName} />
                    ))
                ) : (
                    <SalesCard label="My Total Sells" total={data.total} caption="Your total sales contribution" />
                )}
            </div>
        </section>
    );
};

export default SalesSummary;
