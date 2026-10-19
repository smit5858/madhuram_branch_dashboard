import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, CircleAlert, ExternalLink, PowerOff, Recycle, RefreshCw, Undo2, Wrench, Zap } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import serialService from "@/services/serial-service";
import { DateToDateTimeString, DateToDisplayDate } from "@/util/DateFormate";
import { formatPhone } from "@/util/CommonFunction";
import type { RootState } from "@/store/store";
import type { ISerialDetailModel, ISerialEventModel } from "@/models/Serial";
import { DEFAULT_EVENT_STYLE, EVENT_STYLE, formatMoney, OTHER_BRANCH_CUSTOMER } from "./serialDisplay";
import { ReturnStatusBadge, SerialStatusBadge, UnitTypeTag } from "./StatusBadges";
import RecordReturnDialog, { type ReturnTarget } from "./RecordReturnDialog";
import TransferSerialDialog from "./TransferSerialDialog";
import LicenseActionDialog, { type LicenseAction } from "./LicenseActionDialog";
import type { SerialStatus } from "@/models/Serial";

// With the customer of its current sale, so it can be returned
const HELD: SerialStatus[] = ["Sold", "Installed", "Active", "Expired"];

const daysUntil = (date: string) => Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);

interface SerialHistoryDialogProps {
    /** null keeps the dialog closed */
    serialNumber: string | null;
    onClose: () => void;
    /** A return or transfer was saved from here */
    onChanged: () => void;
}

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <span className="truncate text-sm text-slate-800">{children ?? <span className="text-slate-300">—</span>}</span>
    </div>
);

const Section = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
    <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
            {action}
        </div>
        {children}
    </section>
);

const MoneyTile = ({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "good" | "bad" }) => (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={clsx(
            "mt-1 text-lg font-bold tabular-nums",
            tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-900",
        )}>
            {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
);

// The sale / return list a history row came from, when the user can open it there
const sourceLink = (event: ISerialEventModel) => {
    if (event.partyName === OTHER_BRANCH_CUSTOMER) return null;
    if (event.saleReturnId && event.reference?.startsWith("RET-")) return { label: "Open return", to: `/returns?search=${encodeURIComponent(event.reference)}` };
    // A cancelled sale no longer exists, so there is nothing to open
    if (event.saleId && event.type !== "Sale Cancelled" && event.type !== "Renewal Cancelled" && event.reference) {
        return { label: "Open sale", to: `/sales?search=${encodeURIComponent(event.reference)}` };
    }
    return null;
};

const TimelineItem = ({ event, isLast, onOpen, unitType }: { event: ISerialEventModel; isLast: boolean; onOpen: (to: string) => void; unitType: ISerialDetailModel["productType"] }) => {
    const style = EVENT_STYLE[event.type] ?? DEFAULT_EVENT_STYLE;
    const Icon = style.icon;
    const link = sourceLink(event);
    const isSale = event.type === "Sale";
    const isPurchase = event.type === "Purchase" || event.type === "Opening Stock" || event.type === "Stock Added";

    return (
        <li className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast && <span aria-hidden="true" className="absolute left-4 top-9 -bottom-0 w-px bg-slate-200" />}
            <span className={clsx("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full", style.className)}>
                <Icon className="size-4" />
            </span>
            <div className={clsx("min-w-0 flex-1 rounded-xl border px-4 py-3", event.voided ? "border-dashed border-slate-200 bg-slate-50/60" : "border-slate-200 bg-white")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={clsx("text-sm font-semibold", event.voided ? "text-slate-400 line-through" : "text-slate-800")}>{event.label}</span>
                        {event.voided && <span className="text-xs text-slate-400">Voided — return rejected</span>}
                        <SerialStatusBadge status={event.status} unitType={unitType} className="py-0.5!" />
                    </div>
                    <span className="text-xs font-medium tabular-nums text-slate-500">{DateToDisplayDate(event.date)}</span>
                </div>

                <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
                    {event.partyName && (
                        <div className="flex gap-1.5">
                            <dt className="text-slate-400">{isPurchase ? "Supplier:" : "Customer:"}</dt>
                            <dd className="font-medium text-slate-700">
                                {event.partyName}
                                {event.customerPhone && <span className="ml-1 font-normal text-slate-500">({formatPhone(event.customerPhone)})</span>}
                            </dd>
                        </div>
                    )}
                    <div className="flex gap-1.5">
                        <dt className="text-slate-400">Branch:</dt>
                        <dd className="font-medium text-slate-700">
                            {event.branchName ?? "—"}
                            {event.toBranchName && <> → {event.toBranchName}</>}
                        </dd>
                    </div>
                    <div className="flex gap-1.5">
                        <dt className="text-slate-400">Quantity:</dt>
                        <dd className="font-medium text-slate-700">1</dd>
                    </div>
                    {event.purchaseAmount !== null && (
                        <div className="flex gap-1.5"><dt className="text-slate-400">Purchase price:</dt><dd className="font-medium tabular-nums text-slate-700">{formatMoney(event.purchaseAmount)}</dd></div>
                    )}
                    {event.sellingAmount !== null && (
                        <div className="flex gap-1.5">
                            <dt className="text-slate-400">{isSale ? "Selling price:" : event.type === "Renewal" || event.type === "Renewal Cancelled" ? "Renewal amount:" : "Sale amount:"}</dt>
                            <dd className="font-medium tabular-nums text-slate-700">{formatMoney(event.sellingAmount)}</dd>
                        </div>
                    )}
                    {event.refundAmount !== null && (
                        <div className="flex gap-1.5"><dt className="text-slate-400">Refund / adjustment:</dt><dd className="font-medium tabular-nums text-orange-700">{formatMoney(event.refundAmount)}</dd></div>
                    )}
                    {event.reference && (
                        <div className="flex gap-1.5"><dt className="text-slate-400">Reference:</dt><dd className="font-medium text-slate-700">{event.reference}</dd></div>
                    )}
                    {event.deviceName && (
                        <div className="flex gap-1.5"><dt className="text-slate-400">Device:</dt><dd className="font-medium text-slate-700">{event.deviceName}</dd></div>
                    )}
                    {event.technicianName && (
                        <div className="flex gap-1.5"><dt className="text-slate-400">Technician:</dt><dd className="font-medium text-slate-700">{event.technicianName}</dd></div>
                    )}
                    {event.expiryDate && (
                        <div className="flex gap-1.5"><dt className="text-slate-400">Valid until:</dt><dd className="font-medium tabular-nums text-slate-700">{DateToDisplayDate(event.expiryDate)}</dd></div>
                    )}
                    {event.purchase && (
                        <div className="flex gap-1.5"><dt className="text-slate-400">Purchase source:</dt><dd className="font-medium text-slate-700">{event.purchase.source} · {event.purchase.quantity} unit{event.purchase.quantity === 1 ? "" : "s"}</dd></div>
                    )}
                </dl>

                {event.note && <p className="mt-2 text-xs text-slate-500">{event.note}</p>}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span title={DateToDateTimeString(event.createdAt)}>
                        Recorded {DateToDisplayDate(event.createdAt)}{event.createdByName ? ` by ${event.createdByName}` : ""}
                    </span>
                    {link && (
                        <button
                            type="button"
                            onClick={() => onOpen(link.to)}
                            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline"
                        >
                            {link.label} <ExternalLink className="size-3" />
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
};

const ActionButton = ({ onClick, icon: Icon, label, className = "" }: { onClick: () => void; icon: typeof Wrench; label: string; className?: string }) => (
    <Button onClick={onClick} className={`h-8! w-auto! px-3! text-xs ${className}`}>
        <Icon className="size-3.5" /> {label}
    </Button>
);

const HistoryContent = ({ unit, onOpen, onReturn, onTransfer, onLicenseAction }: {
    unit: ISerialDetailModel;
    onOpen: (to: string) => void;
    onReturn: (() => void) | null;
    onTransfer: (() => void) | null;
    onLicenseAction: (action: LicenseAction) => void;
}) => {
    const f = unit.financials;
    const latestSale = unit.sales.filter((s) => s.saleType !== "Renewal").at(-1);
    const isLicense = unit.productType === "Software";
    const isService = unit.productType === "Service";
    const { installation } = unit;
    const left = installation.expiryDate ? daysUntil(installation.expiryDate) : null;

    return (
        <div className="flex flex-col gap-6">
            <Section
                title="Current Details"
                action={(
                    <div className="flex flex-wrap justify-end gap-2">
                        {unit.canInstall && <ActionButton onClick={() => onLicenseAction("install")} icon={Wrench} label="Install" />}
                        {unit.canActivate && <ActionButton onClick={() => onLicenseAction("activate")} icon={Zap} label="Activate" />}
                        {unit.canRenew && <ActionButton onClick={() => onLicenseAction("renew")} icon={RefreshCw} label="Renew" />}
                        {unit.canRelease && <ActionButton onClick={() => onLicenseAction("release")} icon={Recycle} label="Release for Reassignment" />}
                        {onReturn && (
                            <ActionButton onClick={onReturn} icon={Undo2} label="Record Return" className="bg-amber-500! hover:bg-amber-600! focus-visible:ring-amber-500!" />
                        )}
                        {unit.canDeactivate && (
                            <ActionButton onClick={() => onLicenseAction("deactivate")} icon={PowerOff} label={isService ? "Cancel" : "Deactivate"} className="bg-red-500! hover:bg-red-600! focus-visible:ring-red-500!" />
                        )}
                        {onTransfer && <ActionButton onClick={onTransfer} icon={ArrowRightLeft} label="Transfer" />}
                    </div>
                )}
            >
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
                    <Detail label={isLicense ? "License Key / Serial" : isService ? "Installation ID" : "Serial Number"}><span className="font-semibold">{unit.serialNumber}</span></Detail>
                    <Detail label="Product">{unit.productName}</Detail>
                    <Detail label="Current Status"><SerialStatusBadge status={unit.status} unitType={unit.productType} /></Detail>
                    <Detail label={unit.status === "Available" ? (isLicense ? "License Pool" : "Current Branch") : "Branch"}>{unit.branchName}</Detail>
                    <Detail label="Last Transaction">{DateToDisplayDate(unit.lastTransactionDate) || null}</Detail>
                    <Detail label="Last Selling Price">{unit.lastSellingAmount !== null ? formatMoney(unit.lastSellingAmount) : null}</Detail>
                    {unit.currentHolder && (
                        <Detail label={isLicense ? "Assigned Customer" : "With Customer"}>
                            {unit.currentHolder.customerName}
                            {unit.currentHolder.customerPhone && <span className="ml-1 text-slate-500">({formatPhone(unit.currentHolder.customerPhone)})</span>}
                        </Detail>
                    )}
                    {unit.currentHolder && <Detail label="Current Sale">{unit.currentHolder.saleReference} · {DateToDisplayDate(unit.currentHolder.saleDate)}</Detail>}
                    {unit.pendingReturn && <Detail label="Pending Return">{unit.pendingReturn.reference}</Detail>}
                </div>
            </Section>

            {(isLicense || isService) && (
                <Section title={isLicense ? "License & Installation" : "Installation"}>
                    <div className="grid grid-cols-2 gap-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4 sm:grid-cols-3">
                        <Detail label="Installed On">{DateToDisplayDate(installation.installationDate) || null}</Detail>
                        <Detail label="Device">{installation.deviceName}</Detail>
                        <Detail label="Technician">{installation.technicianName}</Detail>
                        {isLicense && <Detail label="Activated On">{DateToDisplayDate(installation.activationDate) || null}</Detail>}
                        {isLicense && (
                            <Detail label="Valid Until">
                                {installation.expiryDate ? (
                                    <>
                                        {DateToDisplayDate(installation.expiryDate)}
                                        {left !== null && left < 0 && <span className="ml-1.5 text-xs font-medium text-orange-600">expired</span>}
                                        {left !== null && left >= 0 && left <= 30 && <span className="ml-1.5 text-xs font-medium text-amber-600">{left} day{left === 1 ? "" : "s"} left</span>}
                                    </>
                                ) : installation.activationDate ? "No expiry" : null}
                            </Detail>
                        )}
                        {isLicense && <Detail label="Renewals">{f.renewalsCount > 0 ? `${f.renewalsCount} · ${formatMoney(f.renewalRevenue)}` : "None"}</Detail>}
                        {isLicense && <Detail label="Reassignment">{unit.licenseReassignable ? "Allowed after a return" : "Not allowed (single-use)"}</Detail>}
                    </div>
                    {!installation.installationDate && unit.status === "Sold" && (
                        <p className="-mt-1 px-1 text-xs text-slate-500">Not installed yet. Use Install once it is set up on the customer's device.</p>
                    )}
                </Section>
            )}

            {!isService && <Section title={isLicense ? "License Purchase" : "Purchase"}>
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-4">
                    <Detail label="Purchase Date">{DateToDisplayDate(unit.originalPurchaseDate) || null}</Detail>
                    <Detail label="Purchase Price">{unit.originalPurchaseAmount !== null ? formatMoney(unit.originalPurchaseAmount) : null}</Detail>
                    <Detail label="Supplier / Dealer">{unit.originalSupplier}</Detail>
                    <Detail label="Invoice / Reference">{unit.originalPurchaseReference}</Detail>
                </div>
                {!unit.originalPurchaseDate && (
                    <p className="-mt-1 px-1 text-xs text-slate-500">No purchase was recorded for this unit (added as opening stock or in a stock edit).</p>
                )}
            </Section>}

            <Section title="Profitability">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MoneyTile label="Purchase Cost" value={formatMoney(f.purchaseCost)} hint={f.costRealized ? "Counted in profit" : "Unit still held, not counted yet"} />
                    <MoneyTile
                        label="Sales Revenue"
                        value={formatMoney(f.grossSales)}
                        hint={`${f.salesCount} sale${f.salesCount === 1 ? "" : "s"}${f.renewalsCount ? ` · ${f.renewalsCount} renewal${f.renewalsCount === 1 ? "" : "s"}` : ""}`}
                    />
                    <MoneyTile label="Refunds / Adjustments" value={formatMoney(f.totalRefunds)} hint={`${f.returnsCount} return${f.returnsCount === 1 ? "" : "s"}`} />
                    <MoneyTile label="Net Revenue" value={formatMoney(f.netSales)} hint="Revenue − refunds" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <MoneyTile
                        label="Profit / Loss"
                        value={f.profit === null ? "Unknown" : formatMoney(f.profit)}
                        tone={f.profit === null ? "default" : f.profit >= 0 ? "good" : "bad"}
                        hint={f.profit === null
                            ? "The purchase price was never entered"
                            : f.costRealized ? "Net revenue − purchase cost" : "Net revenue so far; the unit's cost counts once it is sold"}
                    />
                    <MoneyTile
                        label="Latest Sale"
                        value={latestSale ? formatMoney(latestSale.amount) : "—"}
                        hint={latestSale ? `${latestSale.label} · ${DateToDisplayDate(latestSale.saleDate)}` : "Never sold"}
                    />
                </div>
            </Section>

            {unit.sales.length > 0 && (
                <Section title="Sales">
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-3 py-2">Sale</th>
                                    <th className="px-3 py-2">Date</th>
                                    <th className="px-3 py-2">Customer</th>
                                    <th className="px-3 py-2">Branch</th>
                                    <th className="px-3 py-2 text-right">Amount</th>
                                    <th className="px-3 py-2">Outcome</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unit.sales.map((s, i) => {
                                    const isLatest = i === unit.sales.length - 1;
                                    return (
                                        <tr key={s.saleId} className="border-t border-slate-100">
                                            <td className="px-3 py-2">
                                                <span className="font-medium text-slate-800">{s.label}</span>
                                                <span className="ml-1.5 text-xs text-slate-400">{s.reference}</span>
                                            </td>
                                            <td className="px-3 py-2 tabular-nums">{DateToDisplayDate(s.saleDate)}</td>
                                            <td className="px-3 py-2">{s.customerName}</td>
                                            <td className="px-3 py-2">{s.branchName ?? "—"}</td>
                                            <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(s.amount)}</td>
                                            <td className="px-3 py-2 text-xs">
                                                {s.saleType === "Renewal"
                                                    ? <span className="text-violet-700">Renewal</span>
                                                    : s.returned
                                                    ? <span className="text-amber-700">Returned</span>
                                                    : isLatest && unit.status === "Sold"
                                                        ? <span className="text-blue-700">Current sale</span>
                                                        : <span className="text-slate-500">Completed</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Section>
            )}

            <Section title={`Transaction Timeline (${unit.history.length})`}>
                {unit.history.length === 0 ? (
                    <p className="text-sm text-slate-500">No transactions recorded yet.</p>
                ) : (
                    <ol className="flex flex-col">
                        {unit.history.map((event, i) => (
                            <TimelineItem key={event.id} event={event} isLast={i === unit.history.length - 1} onOpen={onOpen} unitType={unit.productType} />
                        ))}
                    </ol>
                )}
            </Section>
        </div>
    );
};

// Full history of one serial number: current details, purchase, money totals, every sale and the
// complete timeline. Opened from anywhere through useSerialHistory().openHistory.
const SerialHistoryDialog = ({ serialNumber, onClose, onChanged }: SerialHistoryDialogProps) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const navigate = useNavigate();
    const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
    const [transferOpen, setTransferOpen] = useState(false);
    const [licenseAction, setLicenseAction] = useState<LicenseAction | null>(null);

    const { data: unit, isPending, isError, refetch, isFetching } = useQuery<ISerialDetailModel>({
        queryKey: ["serial-detail", userId, serialNumber],
        queryFn: async () => {
            const response = await serialService.detail(serialNumber!);
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load this serial number's history.");
            return response.data.data;
        },
        enabled: !!serialNumber,
        retry: false,
        refetchOnWindowFocus: false,
    });

    const saved = () => {
        refetch();
        onChanged();
    };

    const open = (to: string) => {
        onClose();
        navigate(to);
    };

    // Customers of other branches' sales are hidden from members, and only their branch may return them
    const holder = unit?.currentHolder;
    const canReturn = !!unit && HELD.includes(unit.status) && holder && holder.customerName !== OTHER_BRANCH_CUSTOMER;
    const startReturn = canReturn ? () => setReturnTarget({
        saleId: holder.saleId,
        saleReference: holder.saleReference,
        customerName: holder.customerName,
        saleDate: holder.saleDate,
        branchId: unit.branchId,
        branchName: unit.branchName,
        units: [{ serialNumber: unit.serialNumber, amount: unit.sales.find((s) => s.saleId === holder.saleId)?.amount ?? null }],
    }) : null;

    let body: ReactNode;
    if (isPending) {
        body = (
            <div className="flex flex-col gap-4">
                <div className="h-28 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
            </div>
        );
    } else if (isError || !unit) {
        body = (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-slate-500">
                <CircleAlert className="size-6 text-red-400" />
                <span>We couldn't load the history of {serialNumber}. It may not exist, or your branch may not have handled it.</span>
                <button
                    type="button"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="mt-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    Try again
                </button>
            </div>
        );
    } else {
        body = (
            <HistoryContent
                unit={unit}
                onOpen={open}
                onReturn={startReturn}
                onTransfer={unit.canTransfer ? () => setTransferOpen(true) : null}
                onLicenseAction={setLicenseAction}
            />
        );
    }

    return (
        <>
            <Dialog
                open={!!serialNumber}
                onClose={onClose}
                title={(
                    <span className="flex flex-wrap items-center gap-2">
                        Serial Number History
                        {serialNumber && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-700">{serialNumber}</span>}
                        {unit && <UnitTypeTag unitType={unit.productType} />}
                        {unit?.pendingReturn && <ReturnStatusBadge status="Pending" />}
                    </span>
                )}
                className="max-w-4xl! max-h-[90vh] overflow-y-auto!"
            >
                {body}
            </Dialog>

            {unit && (
                <>
                    <RecordReturnDialog
                        open={!!returnTarget}
                        target={returnTarget}
                        onClose={() => setReturnTarget(null)}
                        onSaved={saved}
                    />
                    <TransferSerialDialog
                        open={transferOpen}
                        serialNumber={unit.serialNumber}
                        productName={unit.productName}
                        fromBranchId={unit.branchId}
                        fromBranchName={unit.branchName}
                        onClose={() => setTransferOpen(false)}
                        onSaved={saved}
                    />
                    <LicenseActionDialog action={licenseAction} unit={unit} onClose={() => setLicenseAction(null)} onSaved={saved} />
                </>
            )}
        </>
    );
};

export default SerialHistoryDialog;
