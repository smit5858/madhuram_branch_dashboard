import clsx from "clsx";
import { Ban, CheckCircle2, Clock } from "lucide-react";
import type { BranchPaymentStatus } from "@/models/BranchPayment";

const STATUS_STYLE: Record<BranchPaymentStatus, { className: string; Icon: typeof Clock }> = {
    Pending: { className: "bg-amber-50 text-amber-700 ring-amber-200", Icon: Clock },
    Completed: { className: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
    Cancelled: { className: "bg-slate-100 text-slate-500 ring-slate-200", Icon: Ban },
};

const PaymentStatusBadge = ({ status }: { status: BranchPaymentStatus }) => {
    const { className, Icon } = STATUS_STYLE[status] ?? STATUS_STYLE.Cancelled;
    return (
        <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1", className)}>
            <Icon className="size-3.5" /> {status}
        </span>
    );
};

export default PaymentStatusBadge;
