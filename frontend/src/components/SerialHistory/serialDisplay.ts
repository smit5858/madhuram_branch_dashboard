import {
    ArrowRightLeft, Ban, CalendarX, CircleX, IndianRupee, PackageCheck, PackageMinus, PackagePlus, Pencil, PowerOff,
    Recycle, RefreshCw, ShoppingCart, TriangleAlert, Undo2, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import type { SerialStatus, SerialUnitType } from "@/models/Serial";
import type { ProductType } from "@/models/Product";
import type { ReturnStatus } from "@/models/SaleReturn";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** ₹ amount, or "—" when unknown */
export const formatMoney = (amount: number | null | undefined) =>
    amount === null || amount === undefined ? "—" : currency.format(amount);

/** Shown instead of the customer of another branch's sale or return (set by the API) */
export const OTHER_BRANCH_CUSTOMER = "Customer of another branch";

/** What each unit status is called on screen */
export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
    Available: "In Stock",
    Sold: "Sold",
    Returned: "Returned · Under Inspection",
    "Not Resellable": "Not Resellable",
    Removed: "Removed",
    Installed: "Installed",
    Active: "Active",
    Cancelled: "Cancelled",
    Expired: "Expired",
};

/** Status names for licenses, where Available / Sold mean a license in the pool / assigned to a customer */
export const statusLabel = (status: SerialStatus, unitType?: SerialUnitType) => {
    if (unitType === "Software") {
        if (status === "Available") return "Available (in pool)";
        if (status === "Sold") return "Assigned · Not installed";
    }
    if (unitType === "Service" && status === "Sold") return "Sold · Pending installation";
    return SERIAL_STATUS_LABEL[status] ?? status;
};

export const SERIAL_STATUS_CLASS: Record<SerialStatus, string> = {
    Available: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    Sold: "bg-blue-50 text-blue-700 ring-blue-200",
    Returned: "bg-amber-50 text-amber-700 ring-amber-200",
    "Not Resellable": "bg-red-50 text-red-700 ring-red-200",
    Removed: "bg-slate-100 text-slate-600 ring-slate-200",
    Installed: "bg-sky-50 text-sky-700 ring-sky-200",
    Active: "bg-violet-50 text-violet-700 ring-violet-200",
    Cancelled: "bg-slate-100 text-slate-600 ring-slate-300",
    Expired: "bg-orange-50 text-orange-700 ring-orange-200",
};

/** What each product type is called on screen */
export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
    Standard: "Standard (quantity)",
    Serialized: "Physical Serialized",
    Software: "Software / License",
    Service: "Installation Service",
};

/** Short name of a kind of serial number */
export const UNIT_TYPE_LABEL: Record<SerialUnitType, string> = {
    Serialized: "Physical",
    Software: "License",
    Service: "Installation",
};

export const UNIT_TYPE_CLASS: Record<SerialUnitType, string> = {
    Serialized: "bg-slate-100 text-slate-600",
    Software: "bg-violet-100 text-violet-700",
    Service: "bg-sky-100 text-sky-700",
};

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
    Pending: "Pending Decision",
    Accepted: "Restocked",
    "Not Resellable": "Written Off",
    Rejected: "Rejected",
};

export const RETURN_STATUS_CLASS: Record<ReturnStatus, string> = {
    Pending: "bg-amber-50 text-amber-700 ring-amber-200",
    Accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    "Not Resellable": "bg-red-50 text-red-700 ring-red-200",
    Rejected: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** Icon and colour of each history row type */
export const EVENT_STYLE: Record<string, { icon: LucideIcon; className: string }> = {
    Purchase: { icon: PackagePlus, className: "bg-emerald-100 text-emerald-700" },
    "Opening Stock": { icon: PackagePlus, className: "bg-emerald-100 text-emerald-700" },
    "Stock Added": { icon: PackagePlus, className: "bg-emerald-100 text-emerald-700" },
    Sale: { icon: ShoppingCart, className: "bg-blue-100 text-blue-700" },
    "Sale Edited": { icon: Pencil, className: "bg-slate-100 text-slate-600" },
    "Sale Cancelled": { icon: CircleX, className: "bg-slate-100 text-slate-600" },
    "Removed from Sale": { icon: CircleX, className: "bg-slate-100 text-slate-600" },
    Return: { icon: Undo2, className: "bg-amber-100 text-amber-700" },
    Refund: { icon: IndianRupee, className: "bg-orange-100 text-orange-700" },
    "Return Accepted": { icon: PackageCheck, className: "bg-emerald-100 text-emerald-700" },
    "Return Rejected": { icon: Ban, className: "bg-slate-100 text-slate-600" },
    "Written Off": { icon: TriangleAlert, className: "bg-red-100 text-red-700" },
    "Branch Transfer": { icon: ArrowRightLeft, className: "bg-violet-100 text-violet-700" },
    "Removed from Stock": { icon: PackageMinus, className: "bg-slate-100 text-slate-600" },
    Installation: { icon: Wrench, className: "bg-sky-100 text-sky-700" },
    Activation: { icon: Zap, className: "bg-violet-100 text-violet-700" },
    Renewal: { icon: RefreshCw, className: "bg-violet-100 text-violet-700" },
    "Renewal Cancelled": { icon: CalendarX, className: "bg-slate-100 text-slate-600" },
    Cancelled: { icon: PowerOff, className: "bg-red-100 text-red-700" },
    "Released for Reassignment": { icon: Recycle, className: "bg-emerald-100 text-emerald-700" },
};

export const DEFAULT_EVENT_STYLE = { icon: PackagePlus, className: "bg-slate-100 text-slate-600" };

/** A sale's amount split across its serial numbers the way the API does it (in paise, so the
 *  shares add up to the total): every unit gets the same share, the first ones the spare paise. */
export const unitShares = (total: number, count: number) => {
    if (count <= 0) return [];
    const totalPaise = Math.round(total * 100);
    const base = Math.floor(totalPaise / count);
    const extra = totalPaise - base * count;
    return Array.from({ length: count }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
};
