// Rajkot Expense: entries of products recorded against one branch, accepted once by an employee
// of that branch. Acceptance adds the entry's units to the branch's count and its amount to the
// branch's balance; both are stored and calculated by the API.

export type RajkotExpenseStatus = "Pending" | "Accepted";

export interface IRajkotExpenseRequestModel {
    page: number;
    pageSize: number;
    /** Matches a product name, a serial number or the description */
    search?: string;
    /** Admins only: one branch. Members always get their own branch. */
    branchId?: number;
    status?: RajkotExpenseStatus;
}

export interface IRajkotExpenseItemModel {
    id: number;
    /** null once the product has been removed from the catalogue */
    productId: number | null;
    productName: string;
    hasSerialNumber: boolean;
    quantity: number;
    amount: number;
    /** Serialized products only */
    serialNumbers: string[];
}

export interface IRajkotExpenseModel {
    id: number;
    branchId: number;
    branchName: string | null;
    /** yyyy-MM-dd */
    entryDate: string;
    description: string | null;
    status: RajkotExpenseStatus;
    totalQuantity: number;
    totalAmount: number;
    items: IRajkotExpenseItemModel[];
    createdBy: number | null;
    createdByName: string | null;
    acceptedBy: number | null;
    acceptedByName: string | null;
    acceptedAt: string | null;
    /** Pending and the user is an employee of the entry's branch (decided by the API) */
    canAccept: boolean;
    /** Pending and the user is an admin (decided by the API) */
    canDelete: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface IRajkotExpenseResponseModel {
    entry: IRajkotExpenseModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

export interface IRajkotExpenseBranchSummary {
    branchId: number;
    branchName: string;
    /** Number of entries accepted since the last reset */
    count: number;
    /** Stored balance: total of accepted entries as of the last acceptance or update */
    balance: number;
    /** Total of accepted entries right now; differs from balance only if it went out of step */
    calculatedBalance: number;
    pendingEntries: number;
    acceptedEntries: number;
    countResetAt: string | null;
    balanceUpdatedAt: string | null;
}

export interface IRajkotExpenseSummaryModel {
    /** Members get only their own branch; admins every branch, or the one they filtered on */
    branch: IRajkotExpenseBranchSummary[];
    count: number;
    balance: number;
    calculatedBalance: number;
    pendingEntries: number;
    acceptedEntries: number;
}

export interface IRajkotExpenseBranchModel {
    id: number;
    name: string;
    isActive: boolean;
}

export interface IRajkotExpenseOptionsModel {
    isAdmin: boolean;
    /** The user's assigned branch: the branch whose entries they can accept */
    ownBranchId: number | null;
    /** Every branch for admins, only their own for members */
    branch: IRajkotExpenseBranchModel[];
}

/** A catalogue product with its stock in the chosen branch (0 when not stocked there) */
export interface IRajkotExpenseProductModel {
    id: number;
    name: string;
    hasSerialNumber: boolean;
    quantity: number;
}

export interface IRajkotExpenseProductsResponseModel {
    branchId: number;
    product: IRajkotExpenseProductModel[];
}

export interface IRajkotExpenseCreateModel {
    branchId: number;
    entryDate: string;
    description: string;
    items: {
        productId: number;
        /** Non-serialized products; serialized ones use the number of serial numbers */
        quantity?: number;
        /** Serialized products: new serial numbers, one per unit */
        serialNumbers?: string[];
        amount: number;
    }[];
}

/** One product row of the add form; Select works with string values and an empty number input is "" */
export interface IRajkotExpenseItemFormValues {
    /** Stable React key for the row */
    key: string;
    productId: string;
    /** Copied from the picked product so validation knows which fields apply */
    hasSerialNumber: boolean;
    quantity: number | "";
    /** Serialized products: new serial numbers typed one per line */
    serialText: string;
    amount: number | "";
}

export interface IRajkotExpenseFormValues {
    branchId: string;
    entryDate: string;
    description: string;
    items: IRajkotExpenseItemFormValues[];
}

/** Body for reset and update: one branch, or every branch when branchId is left out */
export interface IRajkotExpenseTargetModel {
    branchId?: number;
    /** Update Balance only: set this branch's balance to this amount (needs branchId) */
    balance?: number;
}

/** Update Balance form state */
export interface IRajkotExpenseBalanceFormValues {
    branchId: string;
    balance: number | "";
}
