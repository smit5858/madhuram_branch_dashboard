export type ReturnStatus = "Pending" | "Accepted" | "Not Resellable" | "Rejected";

/** Admin decisions on a pending return */
export type ReturnDecision = "accept" | "not-resellable" | "reject";

export interface ISaleReturnRequestModel {
    page: number;
    pageSize: number;
    status?: ReturnStatus;
    /** Admins only: returns of this branch's sales or received by it */
    branchId?: number;
    /** Serial number, customer name / phone or product */
    search?: string;
    /** yyyy-MM-dd, inclusive range on the return date */
    startDate?: string;
    endDate?: string;
}

export interface ISaleReturnModel {
    id: number;
    /** RET-00001 */
    reference: string;
    saleId: number;
    saleReference: string;
    serialNumber: string;
    productId: number | null;
    productName: string;
    saleBranchId: number | null;
    saleBranchName: string | null;
    /** Branch receiving the unit */
    branchId: number | null;
    branchName: string | null;
    customerId: number | null;
    customerName: string;
    customerPhone: string | null;
    saleDate: string;
    /** This unit's share of the original sale */
    saleAmount: number;
    returnDate: string;
    reason: string;
    condition: string;
    refundAmount: number;
    status: ReturnStatus;
    /** Serialized, Software or Service; decides which decisions apply */
    productType: "Serialized" | "Software" | "Service";
    /** Software: the license may go back into a pool when the return is accepted */
    licenseReassignable: boolean;
    decisionNote: string | null;
    decidedAt: string | null;
    decidedByName: string | null;
    createdByName: string | null;
    createdAt: string;
}

export interface ISaleReturnResponseModel {
    return: ISaleReturnModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

export interface ISaleReturnOptionsModel {
    conditions: string[];
    statuses: ReturnStatus[];
    isAdmin: boolean;
}

export interface ISaleReturnCreateModel {
    saleId: number;
    serialNumber: string;
    /** yyyy-MM-dd */
    returnDate: string;
    reason: string;
    condition: string;
    refundAmount?: number;
    /** Receiving branch; admins only, defaults to the sale's branch */
    branchId?: number;
}

/** Return recorded against a sale, as listed with the sale */
export interface ISaleReturnBriefModel {
    id: number;
    saleId: number;
    serialNumber: string;
    status: ReturnStatus;
    refundAmount: number;
    returnDate: string;
}
