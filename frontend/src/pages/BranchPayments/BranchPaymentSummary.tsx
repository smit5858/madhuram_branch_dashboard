import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock, History } from "lucide-react";
import clsx from "clsx";
import type { IBranchPaymentSummaryModel } from "@/models/BranchPayment";
import type { RootState } from "@/store/store";
import { branchPaymentService } from "@/services/branch-payment-service";
import { currency } from "./branchPaymentConfig";

interface SummaryCardProps {
    label: string;
    value: string;
    caption: string;
    Icon: typeof Clock;
    tone: "blue" | "emerald" | "violet" | "amber";
}

const TONE = {
    blue: { card: "border-blue-100 from-blue-50", label: "text-blue-700", icon: "bg-blue-100 text-blue-600" },
    emerald: { card: "border-emerald-100 from-emerald-50", label: "text-emerald-700", icon: "bg-emerald-100 text-emerald-600" },
    violet: { card: "border-violet-100 from-violet-50", label: "text-violet-700", icon: "bg-violet-100 text-violet-600" },
    amber: { card: "border-amber-100 from-amber-50", label: "text-amber-700", icon: "bg-amber-100 text-amber-600" },
};

const SummaryCard = ({ label, value, caption, Icon, tone }: SummaryCardProps) => (
    <div className={clsx("rounded-2xl border bg-linear-to-br to-white p-5 shadow-sm", TONE[tone].card)}>
        <div className="flex items-center justify-between gap-3">
            <span className={clsx("text-sm font-semibold uppercase tracking-wide", TONE[tone].label)}>{label}</span>
            <span className={clsx("flex size-10 shrink-0 items-center justify-center rounded-xl", TONE[tone].icon)}>
                <Icon className="size-5" />
            </span>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
        <p className="mt-1 truncate text-xs text-slate-500" title={caption}>{caption}</p>
    </div>
);

const count = (n: number, word: string) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

const NetAmount = ({ net }: { net: number }) => (
    <span className={clsx("font-semibold tabular-nums", net > 0 ? "text-emerald-700" : net < 0 ? "text-rose-700" : "text-slate-600")}>
        {net > 0 ? "+" : net < 0 ? "−" : ""}{currency.format(Math.abs(net))}
    </span>
);

interface BranchPaymentSummaryProps {
    isAdmin: boolean;
    branchId?: number;
    startDate?: string;
    endDate?: string;
    period: string;
    /** Branch the totals are for; null for an admin's all-branches view */
    branchName: string | null;
    refreshKey: number;
    /** Admins: narrows the page to one branch's history */
    onViewBranch: (branchId: number) => void;
}

// Totals from the stored payments for the date range and branch: cards on top, then one row per
// branch with sent, received and net. Only completed payments count as sent / received.
const BranchPaymentSummary = ({ isAdmin, branchId, startDate, endDate, period, branchName, refreshKey, onViewBranch }: BranchPaymentSummaryProps) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const params = { branchId, startDate, endDate };

    const { data, isPending, isError } = useQuery<IBranchPaymentSummaryModel>({
        queryKey: ["branch-payment-summary", userId, params, refreshKey],
        queryFn: async () => {
            const response = await branchPaymentService.summary(params);
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load branch payment totals.");
            return response.data.data;
        },
        placeholderData: (previous) => previous,
        retry: false,
    });

    if (isPending) {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
        );
    }

    if (isError || !data) {
        return <p className="text-xs text-red-500">Could not load branch payment totals. Change a filter or reload the page to try again.</p>;
    }

    const scope = branchName ?? "All branches";
    const consolidated = !branchName;

    return (
        <section className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">
                Totals for <span className="font-semibold text-slate-700">{period}</span>
                {" · "}<span className="font-semibold text-slate-700">{scope}</span>
                {" · "}only completed payments count as sent or received
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                    tone="blue"
                    Icon={ArrowUpRight}
                    label="Total Sent"
                    value={currency.format(data.totalSent)}
                    caption={consolidated ? "All branches · each transfer counted once" : `Paid by ${branchName} to other branches`}
                />
                <SummaryCard
                    tone="violet"
                    Icon={ArrowDownLeft}
                    label="Total Received"
                    value={currency.format(data.totalReceived)}
                    caption={consolidated ? "Equals total sent company-wide" : `Received by ${branchName} from other branches`}
                />
                <SummaryCard
                    tone="emerald"
                    Icon={CheckCircle2}
                    label="Completed"
                    value={currency.format(data.completed.amount)}
                    caption={`${count(data.completed.count, "payment")}${data.cancelled.count ? ` · ${data.cancelled.count} cancelled (not counted)` : ""}`}
                />
                <SummaryCard
                    tone="amber"
                    Icon={Clock}
                    label="Pending"
                    value={currency.format(data.pending.amount)}
                    caption={`${count(data.pending.count, "payment")} awaiting confirmation`}
                />
            </div>

            {!consolidated && (
                <p className="text-sm text-slate-600">
                    Net transfer for <span className="font-semibold text-slate-800">{branchName}</span>: <NetAmount net={data.net} />
                    <span className="text-xs text-slate-500"> ({data.net < 0 ? "net outflow" : data.net > 0 ? "net inflow" : "balanced"}: received − sent)</span>
                </p>
            )}

            {isAdmin && consolidated && data.branch.length > 0 && (
                <>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Branch-wise</p>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-4 py-2.5">Branch</th>
                                    <th className="px-4 py-2.5 text-right">Sent</th>
                                    <th className="px-4 py-2.5 text-right">Received</th>
                                    <th className="px-4 py-2.5 text-right">Net</th>
                                    <th className="px-4 py-2.5 text-right">Completed</th>
                                    <th className="px-4 py-2.5 text-right">Pending</th>
                                    <th className="px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {data.branch.map((b) => (
                                    <tr key={b.branchId} className="hover:bg-slate-50/60">
                                        <td className="px-4 py-2.5 font-medium text-slate-700">{b.branchName}{!b.isActive && <span className="ml-1 text-xs text-slate-400">(Inactive)</span>}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{currency.format(b.sent)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{currency.format(b.received)}</td>
                                        <td className="px-4 py-2.5 text-right"><NetAmount net={b.net} /></td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{b.completedCount}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{b.pendingCount}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <button
                                                type="button"
                                                onClick={() => onViewBranch(b.branchId)}
                                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                                            >
                                                <History className="size-3.5" /> History
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
};

export default BranchPaymentSummary;
