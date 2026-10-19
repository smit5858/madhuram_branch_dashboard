import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { branchPaymentService } from "@/services/branch-payment-service";
import type { IBranchPaymentDetailsModel, IBranchPaymentOptionsModel } from "@/models/BranchPayment";
import { DateToDateTimeString, DateToDisplayDate } from "@/util/DateFormate";
import { currency, FIELD_LABEL } from "./branchPaymentConfig";
import PaymentStatusBadge from "./PaymentStatusBadge";

interface BranchPaymentDetailsDialogProps {
    paymentId: number | null;
    onClose: () => void;
    options: IBranchPaymentOptionsModel;
    /** Bumped by the page after a change so an open dialog shows the latest values */
    refreshKey: number;
}

const Item = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-slate-800">{children ?? <span className="text-slate-400">—</span>}</dd>
    </div>
);

// Audit trail values: branch ids become names, amounts and dates are formatted
const displayValue = (field: string, value: string | null, branchName: (id: number) => string) => {
    if (value === null || value === "") return "—";
    if (field === "fromBranchId" || field === "toBranchId") return branchName(Number(value));
    if (field === "amount") return currency.format(Number(value));
    if (field === "paymentDate") return DateToDisplayDate(value);
    return value;
};

// Full details of one payment and its history (who created, edited, completed or cancelled it)
const BranchPaymentDetailsDialog = ({ paymentId, onClose, options, refreshKey }: BranchPaymentDetailsDialogProps) => {
    const { data, isPending, isError } = useQuery<IBranchPaymentDetailsModel>({
        queryKey: ["branch-payment-details", paymentId, refreshKey],
        queryFn: async () => {
            const response = await branchPaymentService.details(paymentId!);
            if (!response?.data?.status) throw new Error("Could not load the payment.");
            return response.data.data;
        },
        enabled: paymentId !== null,
        retry: false,
    });

    const branchName = (id: number) => options.branch.find((b) => b.id === id)?.name ?? `Branch #${id}`;

    return (
        <Dialog open={paymentId !== null} onClose={onClose} title={data ? `Payment ${data.paymentNo}` : "Payment details"}
            className="max-w-2xl! max-h-[calc(100dvh-2rem)] overflow-y-auto!">
            {isPending ? (
                <div className="flex flex-col gap-3">
                    <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
                    <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
                </div>
            ) : isError || !data ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-500">
                    <CircleAlert className="size-6 text-red-400" />
                    Could not load this payment.
                </div>
            ) : (
                <div className="flex flex-col gap-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                        <div>
                            <p className="text-sm text-slate-600">
                                <span className="font-semibold text-slate-800">{data.fromBranchName}</span> paid{" "}
                                <span className="font-semibold text-slate-800">{data.toBranchName}</span>
                            </p>
                            <p className="text-2xl font-bold tabular-nums text-slate-900">{currency.format(data.amount)}</p>
                        </div>
                        <PaymentStatusBadge status={data.status} />
                    </div>

                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Item label="Payment Date">{DateToDisplayDate(data.paymentDate)}</Item>
                        <Item label="Payment Method">{data.paymentMethod}</Item>
                        <Item label="Transaction / Reference No.">{data.referenceNumber}</Item>
                        <Item label="Created By">{data.createdByName}</Item>
                        <Item label="Created At">{DateToDateTimeString(data.createdAt)}</Item>
                        <Item label="Last Updated">{DateToDateTimeString(data.updatedAt)}{data.updatedByName ? ` by ${data.updatedByName}` : ""}</Item>
                        {data.completedAt && <Item label="Completed">{DateToDateTimeString(data.completedAt)}{data.completedByName ? ` by ${data.completedByName}` : ""}</Item>}
                        {data.cancelledAt && <Item label="Cancelled">{DateToDateTimeString(data.cancelledAt)}{data.cancelledByName ? ` by ${data.cancelledByName}` : ""}</Item>}
                        {data.cancelReason && <Item label="Cancellation Reason">{data.cancelReason}</Item>}
                    </dl>
                    <Item label="Notes">{data.notes}</Item>

                    <section>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">History</h4>
                        <ol className="flex flex-col gap-3 border-l-2 border-slate-100 pl-4">
                            {data.events.map((e) => (
                                <li key={e.id} className="text-sm">
                                    <p className="text-slate-800">
                                        <span className="font-semibold">{e.action}</span>
                                        {e.createdByName && <> by {e.createdByName}</>}
                                        <span className="text-xs text-slate-500"> · {DateToDateTimeString(e.createdAt)}</span>
                                    </p>
                                    {e.statusBefore && e.statusBefore !== e.statusAfter && (
                                        <p className="text-xs text-slate-500">Status: {e.statusBefore} → {e.statusAfter}</p>
                                    )}
                                    {e.action === "Updated" && e.changes && (
                                        <ul className="mt-1 text-xs text-slate-600">
                                            {Object.entries(e.changes).map(([field, change]) => (
                                                <li key={field}>
                                                    {FIELD_LABEL[field] ?? field}: <span className="line-through">{displayValue(field, change.from, branchName)}</span>
                                                    {" → "}<span className="font-medium text-slate-800">{displayValue(field, change.to, branchName)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {e.note && <p className="mt-0.5 text-xs italic text-slate-600">“{e.note}”</p>}
                                </li>
                            ))}
                        </ol>
                    </section>
                </div>
            )}
        </Dialog>
    );
};

export default BranchPaymentDetailsDialog;
