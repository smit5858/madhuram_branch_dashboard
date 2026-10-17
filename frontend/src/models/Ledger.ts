// Shared by the Income and Expense modules, which have the same shape; expenses also carry a
// payment method.

export type LedgerKind = "income" | "expense";

export interface ILedgerRequestModel {
    page: number;
    pageSize: number;
    /** Matches the description or category */
    search?: string;
    /** Admins only: one branch. Members always get their own branch. */
    branchId?: number;
    category?: string;
    /** A whole year, or one month of it when month (1-12) is also set */
    year?: number;
    month?: number;
    /** yyyy-MM-dd, inclusive; takes precedence over year/month */
    startDate?: string;
    endDate?: string;
}

export type ILedgerFilterParams = Omit<ILedgerRequestModel, "page" | "pageSize">;

export interface ILedgerEntryModel {
    id: number;
    branchId: number;
    branchName: string | null;
    /** yyyy-MM-dd */
    entryDate: string;
    amount: number;
    category: string;
    description: string | null;
    /** Expenses only */
    paymentMethod?: string;
    createdBy: number | null;
    /** null once the employee who added it has been deleted */
    createdByName: string | null;
    /** Whether the logged-in user may edit or delete this entry (decided by the API) */
    canManage: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ILedgerResponseModel {
    entry: ILedgerEntryModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

/** Income only: product sales counted toward the totals, read live from the Sales module */
export interface ILedgerSalesTotals {
    /** Manual income entries only */
    entriesTotal: number;
    salesTotal: number;
    /** Number of sales */
    salesCount: number;
}

/** Totals for the same filters as the list */
export interface ILedgerSummaryModel extends Partial<ILedgerSalesTotals> {
    /** Members get only their own branch; admins every branch, or the one they filtered on */
    branch: ({ branchId: number; branchName: string; total: number; count: number } & Partial<ILedgerSalesTotals>)[];
    /** Income: manual entries + sales */
    total: number;
    /** Number of manual entries */
    count: number;
    startDate: string | null;
    endDate: string | null;
}

export interface ILedgerBranchModel {
    id: number;
    name: string;
    isActive: boolean;
}

export interface ILedgerOptionsModel {
    isAdmin: boolean;
    /** The user's assigned branch (admins may have one too) */
    ownBranchId: number | null;
    /** Every branch for admins, only their own for members */
    branch: ILedgerBranchModel[];
    categories: string[];
    /** Expenses only */
    paymentMethods?: string[];
    /** Income only: filter-only category that narrows the totals to product sales */
    salesCategory?: string;
}

export interface ILedgerCreateModel {
    entryDate: string;
    amount: number;
    category: string;
    description: string;
    paymentMethod?: string;
    /** Ignored for branch members: the API always uses their own branch */
    branchId?: number;
}

/** Form state; Select works with string values and an empty number input is "" */
export interface ILedgerFormValues {
    entryDate: string;
    amount: number | "";
    category: string;
    description: string;
    paymentMethod: string;
    branchId: string;
}

/** Total Balance of one branch (income and expense balances are kept apart) */
export interface ILedgerBalanceBranchModel {
    branchId: number;
    branchName: string;
    /** Stored balance; for a branch never updated or reset, the calculated one */
    balance: number;
    /** Recalculated from the entries (income: and sales) recorded after the last reset */
    calculatedBalance: number;
    /** Income only: parts of calculatedBalance */
    entriesTotal?: number;
    salesTotal?: number;
    resetAt: string | null;
    balanceUpdatedAt: string | null;
}

export interface ILedgerBalanceModel {
    /** Members get only their own branch; admins every branch, or the one they filtered on */
    branch: ILedgerBalanceBranchModel[];
    balance: number;
    calculatedBalance: number;
    entriesTotal?: number;
    salesTotal?: number;
    /** Decided by the API, which checks it again on update / reset */
    canUpdate: boolean;
    /** Admins: Update Balance can save an amount they enter */
    canSetAmount: boolean;
    canReset: boolean;
}

/** No branch: the member's own branch, or every branch for an admin's update */
export interface ILedgerBalanceTargetModel {
    branchId?: number;
    /** Update Balance, admins only: save this amount as the branch's balance (needs branchId) */
    balance?: number;
}

/** Update Balance form state */
export interface ILedgerBalanceFormValues {
    branchId: string;
    balance: number | "";
}
