import clsx from "clsx";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Ban, PackageCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import toast from "react-hot-toast";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { Textarea } from "@/components/formik-fields/Textarea";
import saleReturnService from "@/services/sale-return-service";
import { formatMoney } from "@/components/SerialHistory/serialDisplay";
import { DateToDisplayDate } from "@/util/DateFormate";
import type { ISaleReturnModel, ReturnDecision } from "@/models/SaleReturn";

const CHOICES: { value: ReturnDecision; label: string; description: string; icon: LucideIcon; className: string }[] = [
    {
        value: "accept",
        label: "Restock",
        description: "Back into the receiving branch's stock and available for resale. The refund stands.",
        icon: PackageCheck,
        className: "text-emerald-600",
    },
    {
        value: "not-resellable",
        label: "Not resellable",
        description: "The refund stands, but the unit is written off (damaged / defective) and kept out of stock.",
        icon: TriangleAlert,
        className: "text-red-600",
    },
    {
        value: "reject",
        label: "Reject return",
        description: "The unit stays with the customer as sold, and the refund no longer counts.",
        icon: Ban,
        className: "text-slate-600",
    },
];

// What each decision means for a software license / installation service (no physical stock)
const choicesFor = (entry: ISaleReturnModel) => {
    if (entry.productType === "Serialized") return CHOICES.map((c) => ({ ...c, disabledReason: null as string | null }));
    const isLicense = entry.productType === "Software";
    return CHOICES
        .filter((c) => !(c.value === "accept" && !isLicense))
        .map((c) => {
            if (c.value === "accept") {
                return {
                    ...c,
                    label: "Release for reassignment",
                    description: `License deactivated and back in ${entry.branchName ?? "the receiving branch"}'s license pool, to be sold again. The refund stands.`,
                    disabledReason: entry.licenseReassignable ? null : "This product's license terms don't allow reassignment (single-use).",
                };
            }
            if (c.value === "not-resellable") {
                return {
                    ...c,
                    label: isLicense ? "Deactivate license" : "Cancel installation",
                    description: isLicense
                        ? "The refund stands and the license is deactivated for good. It is never sold again."
                        : "The refund stands and the installation is cancelled.",
                    disabledReason: null,
                };
            }
            return { ...c, description: isLicense ? "The license stays with the customer as it was (installed / active), and the refund no longer counts." : "The installation stays with the customer and the refund no longer counts.", disabledReason: null };
        });
};

interface DecideReturnDialogProps {
    entry: ISaleReturnModel | null;
    onClose: () => void;
    onDecided: () => void;
}

// Admins only: the decision that ends a pending return
const DecideReturnDialog = ({ entry, onClose, onDecided }: DecideReturnDialogProps) => {
    const [decision, setDecision] = useState<ReturnDecision | null>(null);
    const [note, setNote] = useState("");

    const close = () => {
        setDecision(null);
        setNote("");
        onClose();
    };

    const { mutate: decide, isPending } = useMutation({
        mutationFn: () => saleReturnService.decide(entry!.id, decision!, note.trim() || undefined),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Return updated");
                onDecided();
                close();
            }
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Something went wrong"),
    });

    return (
        <Dialog open={!!entry} onClose={close} title={`Decide Return ${entry?.reference ?? ""}`} preventClose={isPending} className="max-w-xl!">
            {entry && (
                <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                        <div><span className="text-xs text-slate-400">Serial number</span><p className="font-semibold text-slate-800">{entry.serialNumber}</p></div>
                        <div><span className="text-xs text-slate-400">Product</span><p className="text-slate-800">{entry.productName}</p></div>
                        <div><span className="text-xs text-slate-400">Customer</span><p className="text-slate-800">{entry.customerName}</p></div>
                        <div><span className="text-xs text-slate-400">Condition</span><p className="text-slate-800">{entry.condition}</p></div>
                        <div><span className="text-xs text-slate-400">Sold</span><p className="text-slate-800">{formatMoney(entry.saleAmount)} · {DateToDisplayDate(entry.saleDate)}</p></div>
                        <div><span className="text-xs text-slate-400">Refund</span><p className="font-medium text-orange-700">{formatMoney(entry.refundAmount)}</p></div>
                        <div className="col-span-2"><span className="text-xs text-slate-400">Reason</span><p className="text-slate-800">{entry.reason}</p></div>
                    </div>

                    <div role="radiogroup" aria-label="Decision" className="flex flex-col gap-2">
                        {choicesFor(entry).map((choice) => (
                            <button
                                key={choice.value}
                                type="button"
                                role="radio"
                                aria-checked={decision === choice.value}
                                aria-disabled={!!choice.disabledReason}
                                disabled={!!choice.disabledReason}
                                onClick={() => setDecision(choice.value)}
                                className={clsx(
                                    "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                                    decision === choice.value ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500" : "border-slate-200 hover:bg-slate-50",
                                )}
                            >
                                <choice.icon className={clsx("mt-0.5 size-5 shrink-0", choice.className)} />
                                <span>
                                    <span className="block text-sm font-semibold text-slate-800">{choice.label}</span>
                                    <span className="block text-xs text-slate-500">
                                        {choice.value === "accept" && entry.productType === "Serialized"
                                            ? `Back into ${entry.branchName ?? "the receiving branch"}'s stock and available for resale. The refund stands.`
                                            : choice.description}
                                    </span>
                                    {choice.disabledReason && <span className="mt-0.5 block text-xs font-medium text-red-500">{choice.disabledReason}</span>}
                                </span>
                            </button>
                        ))}
                    </div>

                    <Textarea name="decisionNote" label="Note (optional)" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />

                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            onClick={close}
                            disabled={isPending}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            Cancel
                        </Button>
                        <Button onClick={() => decide()} loading={isPending} disabled={!decision} className="sm:w-auto">Confirm Decision</Button>
                    </div>
                </div>
            )}
        </Dialog>
    );
};

export default DecideReturnDialog;
