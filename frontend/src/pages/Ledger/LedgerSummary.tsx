import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { Hash, IndianRupee } from "lucide-react";
import clsx from "clsx";
import type { ILedgerFilterParams, ILedgerSummaryModel } from "@/models/Ledger";
import type { RootState } from "@/store/store";
import { currency, type LedgerConfig } from "./ledgerConfig";

interface SummaryCardProps {
    config: LedgerConfig;
    label: string;
    value: string;
    caption: string;
    icon?: "amount" | "count";
}

const SummaryCard = ({ config, label, value, caption, icon = "amount" }: SummaryCardProps) => {
    const Icon = icon === "amount" ? IndianRupee : Hash;
    return (
        <div className={clsx("rounded-2xl border bg-linear-to-br to-white p-5 shadow-sm", config.accent.card)}>
            <div className="flex items-center justify-between gap-3">
                <span className={clsx("text-sm font-semibold uppercase tracking-wide", config.accent.label)}>{label}</span>
                <span className={clsx("flex size-10 shrink-0 items-center justify-center rounded-xl", config.accent.icon)}>
                    <Icon className="size-5" />
                </span>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
            <p className="mt-1 truncate text-xs text-slate-500" title={caption}>{caption}</p>
        </div>
    );
};

interface LedgerSummaryProps {
    config: LedgerConfig;
    isAdmin: boolean;
    params: ILedgerFilterParams;
    /** "October 2026", "All time", ... */
    period: string;
    /** Name of the branch the totals cover; null for an admin's all-branches view */
    branchName: string | null;
    /** Bumped by the page after an entry is saved or deleted so totals stay in step with the table */
    refreshKey: number;
    /** Income only: the filter category that stands for product sales */
    salesCategory?: string;
}

// Totals for the list's current filters, calculated by the API from the stored entries:
// the total and number of entries, plus one card per branch in an admin's all-branches view.
const LedgerSummary = ({ config, isAdmin, params, period, branchName, refreshKey, salesCategory }: LedgerSummaryProps) => {
    const userId = useSelector((state: RootState) => state.auth.userId);

    const { data, isPending, isError } = useQuery<ILedgerSummaryModel>({
        queryKey: [`${config.kind}-summary`, userId, params, refreshKey],
        queryFn: async () => {
            const response = await config.service.summary(params);
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error(`Could not load ${config.noun} totals.`);
            return response.data.data;
        },
        placeholderData: (previous) => previous,
        retry: false,
    });

    if (isPending) {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            </div>
        );
    }

    if (isError || !data) {
        return <p className="text-xs text-red-500">Could not load {config.noun} totals. Change a filter or reload the page to try again.</p>;
    }

    const scopeLabel = branchName ?? "All branches";
    const showBranches = isAdmin && !branchName && data.branch.length > 0;
    // Income counts product sales too; they have no category or description, so a search or
    // another category leaves them out
    const hasSales = data.salesTotal !== undefined;
    const salesExcluded = !!salesCategory && (!!params.search || (!!params.category && params.category !== salesCategory));
    const totalCaption = showBranches ? `Consolidated · ${period}` : `${scopeLabel} · ${period}`;

    return (
        <section className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">
                {config.title} for <span className="font-semibold text-slate-700">{period}</span>
                {" · "}<span className="font-semibold text-slate-700">{scopeLabel}</span>
                {params.category && <> · {params.category}</>}
                {params.search && <> matching <span className="font-semibold text-slate-700">"{params.search}"</span></>}
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryCard
                    config={config}
                    label={`Total ${config.title}`}
                    value={currency.format(data.total)}
                    caption={hasSales ? `Sales + other income · ${totalCaption}` : totalCaption}
                />
                {hasSales ? (
                    <>
                        <SummaryCard
                            config={config}
                            label="Sales Income"
                            value={currency.format(data.salesTotal ?? 0)}
                            caption={`${(data.salesCount ?? 0).toLocaleString("en-IN")} ${data.salesCount === 1 ? "sale" : "sales"} · from the Sales module`}
                        />
                        <SummaryCard
                            config={config}
                            label="Other Income"
                            value={currency.format(data.entriesTotal ?? 0)}
                            caption={`${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "entry" : "entries"} added here`}
                        />
                    </>
                ) : (
                    <SummaryCard
                        config={config}
                        icon="count"
                        label="Entries"
                        value={data.count.toLocaleString("en-IN")}
                        caption={`Number of ${config.noun} entries`}
                    />
                )}
            </div>
            {salesExcluded && (
                <p className="text-xs text-slate-500">Sales aren't included while searching or filtering by another category.</p>
            )}

            {showBranches && (
                <>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Branch-wise</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {data.branch.map((b) => (
                            <div key={b.branchId} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                                <p className="truncate text-sm font-medium text-slate-700" title={b.branchName}>{b.branchName}</p>
                                <p className={clsx("mt-1 text-lg font-bold tabular-nums", config.accent.amount)}>{currency.format(b.total)}</p>
                                {hasSales ? (
                                    <p className="text-xs text-slate-500">
                                        Sales {currency.format(b.salesTotal ?? 0)} · Other {currency.format(b.entriesTotal ?? 0)}
                                    </p>
                                ) : (
                                    <p className="text-xs text-slate-500">{b.count.toLocaleString("en-IN")} {b.count === 1 ? "entry" : "entries"}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </section>
    );
};

export default LedgerSummary;
