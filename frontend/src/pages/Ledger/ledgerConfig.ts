import moment from "moment";
import type { ILedgerFilterParams, LedgerKind } from "@/models/Ledger";
import { expenseService, incomeService, type LedgerService } from "@/services/ledger-service";

// What differs between the Income and Expense pages. Tailwind classes are written out in full
// so the build picks them up.
export interface LedgerConfig {
    kind: LedgerKind;
    /** "Income" / "Expense" */
    title: string;
    /** Lower-case noun for messages: "income" / "expense" */
    noun: string;
    service: LedgerService;
    withPaymentMethod: boolean;
    categoryLabel: string;
    accent: {
        card: string;
        label: string;
        icon: string;
        amount: string;
    };
}

export const INCOME_CONFIG: LedgerConfig = {
    kind: "income",
    title: "Income",
    noun: "income",
    service: incomeService,
    withPaymentMethod: false,
    categoryLabel: "Income Category / Source",
    accent: {
        card: "border-emerald-100 from-emerald-50",
        label: "text-emerald-700",
        icon: "bg-emerald-100 text-emerald-600",
        amount: "text-emerald-700",
    },
};

export const EXPENSE_CONFIG: LedgerConfig = {
    kind: "expense",
    title: "Expense",
    noun: "expense",
    service: expenseService,
    withPaymentMethod: true,
    categoryLabel: "Expense Category",
    accent: {
        card: "border-rose-100 from-rose-50",
        label: "text-rose-700",
        icon: "bg-rose-100 text-rose-600",
        amount: "text-rose-700",
    },
};

export const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export const ALL = "all";

/** Filter form state; Select works with string values */
export interface LedgerFilterValues {
    search: string;
    /** ALL or a branch id (admins only) */
    branchId: string;
    /** ALL or a category */
    category: string;
    period: "month" | "range";
    /** ALL (whole year) or "1".."12" */
    month: string;
    year: string;
    startDate: string;
    endDate: string;
}

export const defaultFilters = (): LedgerFilterValues => {
    const now = new Date();
    return {
        search: "",
        branchId: ALL,
        category: ALL,
        period: "month",
        month: String(now.getMonth() + 1),
        year: String(now.getFullYear()),
        startDate: "",
        endDate: "",
    };
};

const formatDate = (value: string) => moment(value, "YYYY-MM-DD").format("DD MMM YYYY");

// "October 2026", "Year 2026", "01 Oct 2026 – 16 Oct 2026", "From ...", "Up to ..." or "All time"
export const periodLabel = (f: LedgerFilterValues) => {
    if (f.period === "month") {
        return f.month === ALL ? `Year ${f.year}` : moment({ year: Number(f.year), month: Number(f.month) - 1 }).format("MMMM YYYY");
    }
    if (f.startDate && f.endDate) return `${formatDate(f.startDate)} – ${formatDate(f.endDate)}`;
    if (f.startDate) return `From ${formatDate(f.startDate)}`;
    if (f.endDate) return `Up to ${formatDate(f.endDate)}`;
    return "All time";
};

/** API query params for the applied filters. Only one period mode is sent. */
export const toFilterParams = (f: LedgerFilterValues, isAdmin: boolean): ILedgerFilterParams => ({
    search: f.search || undefined,
    branchId: isAdmin && f.branchId !== ALL ? Number(f.branchId) : undefined,
    category: f.category !== ALL ? f.category : undefined,
    ...(f.period === "month"
        ? { year: Number(f.year), month: f.month !== ALL ? Number(f.month) : undefined }
        : { startDate: f.startDate || undefined, endDate: f.endDate || undefined }),
});
