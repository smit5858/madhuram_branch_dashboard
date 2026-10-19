import moment from "moment";
import type { BranchPaymentDirection, BranchPaymentStatus, IBranchPaymentFilterParams } from "@/models/BranchPayment";

export { currency } from "@/pages/Ledger/ledgerConfig";

export const ALL = "all";

/** Filter form state; Select works with string values */
export interface BranchPaymentFilterValues {
    search: string;
    /** ALL or a branch id (admins only) */
    branchId: string;
    direction: BranchPaymentDirection;
    /** ALL or a status */
    status: string;
    startDate: string;
    endDate: string;
}

export const defaultFilters = (): BranchPaymentFilterValues => ({
    search: "",
    branchId: ALL,
    direction: "all",
    status: ALL,
    startDate: "",
    endDate: "",
});

/** API query params for the applied filters. Direction only applies with a branch. */
export const toFilterParams = (f: BranchPaymentFilterValues, isAdmin: boolean): IBranchPaymentFilterParams => {
    const hasBranch = !isAdmin || f.branchId !== ALL;
    return {
        search: f.search || undefined,
        branchId: isAdmin && f.branchId !== ALL ? Number(f.branchId) : undefined,
        direction: hasBranch && f.direction !== "all" ? f.direction : undefined,
        status: f.status !== ALL ? (f.status as BranchPaymentStatus) : undefined,
        startDate: f.startDate || undefined,
        endDate: f.endDate || undefined,
    };
};

const formatDate = (value: string) => moment(value, "YYYY-MM-DD").format("DD MMM YYYY");

export const periodLabel = (startDate?: string, endDate?: string) => {
    if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
    if (startDate) return `From ${formatDate(startDate)}`;
    if (endDate) return `Up to ${formatDate(endDate)}`;
    return "All time";
};

/** Labels for the audit trail's field names */
export const FIELD_LABEL: Record<string, string> = {
    paymentDate: "Payment date",
    fromBranchId: "Paying branch",
    toBranchId: "Receiving branch",
    amount: "Amount",
    paymentMethod: "Payment method",
    referenceNumber: "Reference number",
    notes: "Notes",
};

/** Key sent with a new payment so a repeated submit saves it only once. randomUUID needs a
 * secure context, so plain-HTTP LAN access falls back to random digits. */
export const newRequestKey = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
