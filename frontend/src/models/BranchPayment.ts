// Branch Payments: money one branch pays another. One record per transfer; the API keeps it
// apart from sales, income and expenses.

export type BranchPaymentStatus = "Pending" | "Completed" | "Cancelled";

/** Relative to the branch filter: payments it sent, received, or both */
export type BranchPaymentDirection = "all" | "sent" | "received";

export interface IBranchPaymentFilterParams {
    /** Branch name, reference number, notes or payment number (BP-00012) */
    search?: string;
    /** Admins only: payments this branch sent or received. Members always get their own branch. */
    branchId?: number;
    direction?: BranchPaymentDirection;
    status?: BranchPaymentStatus;
    /** yyyy-MM-dd, inclusive */
    startDate?: string;
    endDate?: string;
}

export interface IBranchPaymentRequestModel extends IBranchPaymentFilterParams {
    page: number;
    pageSize: number;
}

export interface IBranchPaymentModel {
    id: number;
    /** BP-00012 */
    paymentNo: string;
    /** yyyy-MM-dd */
    paymentDate: string;
    fromBranchId: number;
    fromBranchName: string | null;
    toBranchId: number;
    toBranchName: string | null;
    amount: number;
    paymentMethod: string;
    referenceNumber: string | null;
    notes: string | null;
    status: BranchPaymentStatus;
    createdBy: number | null;
    createdByName: string | null;
    updatedByName: string | null;
    completedByName: string | null;
    completedAt: string | null;
    cancelledByName: string | null;
    cancelledAt: string | null;
    cancelReason: string | null;
    createdAt: string;
    updatedAt: string;
    /** Decided by the API, which checks them again on every action */
    canEdit: boolean;
    canComplete: boolean;
    canCancel: boolean;
}

export interface IBranchPaymentEventModel {
    id: number;
    action: "Created" | "Updated" | "Completed" | "Cancelled";
    statusBefore: BranchPaymentStatus | null;
    statusAfter: BranchPaymentStatus;
    /** field -> { from, to } */
    changes: Record<string, { from: string | null; to: string | null }> | null;
    note: string | null;
    createdByName: string | null;
    createdAt: string;
}

export interface IBranchPaymentDetailsModel extends IBranchPaymentModel {
    events: IBranchPaymentEventModel[];
}

export interface IBranchPaymentResponseModel {
    payment: IBranchPaymentModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

export interface IBranchPaymentBranchSummary {
    branchId: number;
    branchName: string;
    isActive: boolean;
    /** Completed payments only */
    sent: number;
    received: number;
    /** received - sent; negative is a net outflow */
    net: number;
    sentCount: number;
    receivedCount: number;
    completedCount: number;
    pendingCount: number;
    cancelledCount: number;
    pendingSent: number;
    pendingReceived: number;
}

export interface IBranchPaymentSummaryModel {
    branchId: number | null;
    /** The branch's side, or (no branch) every completed transfer counted once */
    totalSent: number;
    totalReceived: number;
    net: number;
    completed: { amount: number; count: number };
    pending: { amount: number; count: number };
    cancelled: { amount: number; count: number };
    branch: IBranchPaymentBranchSummary[];
    startDate: string | null;
    endDate: string | null;
}

export interface IBranchPaymentBranchModel {
    id: number;
    name: string;
    isActive: boolean;
}

export interface IBranchPaymentOptionsModel {
    isAdmin: boolean;
    ownBranchId: number | null;
    /** Every branch (members pick the receiving branch from it) */
    branch: IBranchPaymentBranchModel[];
    paymentMethods: string[];
    /** Methods that need a reference / cheque number */
    referenceRequired: string[];
    statuses: BranchPaymentStatus[];
    /** Statuses a new payment can start with (members: Pending only) */
    createStatuses: BranchPaymentStatus[];
}

export interface IBranchPaymentCreateModel {
    paymentDate: string;
    fromBranchId: number;
    toBranchId: number;
    amount: number;
    paymentMethod: string;
    referenceNumber: string;
    notes: string;
    /** Create only */
    status?: BranchPaymentStatus;
    /** Create only: same key for repeated submits of one form, so only one payment is saved */
    requestKey?: string;
    /** Edit only: required when correcting a completed payment */
    reason?: string;
}

/** Form state; Select works with string values and an empty number input is "" */
export interface IBranchPaymentFormValues {
    paymentDate: string;
    fromBranchId: string;
    toBranchId: string;
    amount: number | "";
    paymentMethod: string;
    referenceNumber: string;
    status: string;
    notes: string;
    reason: string;
}
