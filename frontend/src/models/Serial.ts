/** Current status of one serial number. Installed / Active / Cancelled are for software licenses
 *  and installations; Expired is shown for an Active license past its expiry date. */
export type SerialStatus = "Available" | "Sold" | "Returned" | "Not Resellable" | "Removed" | "Installed" | "Active" | "Cancelled" | "Expired";

/** Kind of unit: a physical unit, a software license or an installation service */
export type SerialUnitType = "Serialized" | "Software" | "Service";

export interface ISerialListRequestModel {
    page: number;
    pageSize: number;
    serialNumber?: string;
    /** Every serial number / license of one product */
    productId?: number;
    productName?: string;
    /** Customer name or phone of any sale / return of the unit */
    customer?: string;
    /** Supplier / dealer of a purchase */
    supplier?: string;
    /** Units with a history row of this type (one of the options' eventTypes) */
    type?: string;
    /** Admins only: units held by, or with history at, this branch */
    branchId?: number;
    status?: SerialStatus;
    productType?: SerialUnitType;
    /** yyyy-MM-dd, inclusive ranges on the unit's purchase / sale / return / installation / expiry dates */
    installationStartDate?: string;
    installationEndDate?: string;
    expiryStartDate?: string;
    expiryEndDate?: string;
    purchaseStartDate?: string;
    purchaseEndDate?: string;
    saleStartDate?: string;
    saleEndDate?: string;
    returnStartDate?: string;
    returnEndDate?: string;
}

/** One serial number in the tracking list */
export interface ISerialUnitRowModel {
    id: number;
    serialNumber: string;
    productId: number | null;
    productName: string;
    productType: SerialUnitType;
    status: SerialStatus;
    branchId: number | null;
    branchName: string | null;
    supplierName: string | null;
    installationDate: string | null;
    activationDate: string | null;
    expiryDate: string | null;
    deviceName: string | null;
    /** yyyy-MM-dd of the first purchase; null for units added without one */
    purchaseDate: string | null;
    purchaseAmount: number | null;
    salesCount: number;
    returnsCount: number;
    lastSaleId: number | null;
    lastSaleDate: string | null;
    /** This unit's share of its latest sale */
    lastSellingAmount: number | null;
    /** "Customer of another branch" when a branch member may not see it */
    lastCustomerName: string | null;
    lastCustomerPhone: string | null;
    currentHolder: string | null;
    lastActivity: string | null;
}

export interface ISerialListResponseModel {
    unit: ISerialUnitRowModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}

export interface ISerialBranchModel {
    id: number;
    name: string;
    isActive: boolean;
}

export interface ISerialOptionsModel {
    isAdmin: boolean;
    branchId: number | null;
    /** Branches the user may filter by */
    branch: ISerialBranchModel[];
    /** Every branch, for picking a transfer target (admins only) */
    allBranches: ISerialBranchModel[];
    statuses: SerialStatus[];
    productTypes: SerialUnitType[];
    eventTypes: string[];
}

/** Counts by kind of unit and status, for the list's filters */
export interface ISerialSummaryModel {
    types: {
        productType: SerialUnitType;
        total: number;
        byStatus: Partial<Record<SerialStatus, number>>;
        /** Active licenses ending within expiringDays */
        expiringSoon: number;
    }[];
    expiringDays: number;
}

/** One row of a serial number's history, oldest first */
export interface ISerialEventModel {
    id: number;
    srNo: number;
    /** yyyy-MM-dd */
    date: string;
    type: string;
    /** type, or for sales "Sale (Original)", "Resale #1", "Sale (Cancelled)" */
    label: string;
    partyName: string | null;
    customerPhone: string | null;
    branchId: number | null;
    branchName: string | null;
    toBranchName: string | null;
    purchaseAmount: number | null;
    sellingAmount: number | null;
    refundAmount: number | null;
    reference: string | null;
    /** The unit's status right after this event */
    status: SerialStatus;
    note: string | null;
    /** Licenses: validity after this event */
    expiryDate: string | null;
    deviceName: string | null;
    technicianName: string | null;
    saleId: number | null;
    saleReturnId: number | null;
    /** A refund whose return was later rejected; it doesn't count */
    voided: boolean;
    purchase: {
        id: number;
        supplierName: string | null;
        purchaseDate: string;
        reference: string | null;
        source: string;
        quantity: number;
    } | null;
    createdByName: string | null;
    createdAt: string;
}

/** Money totals for one unit, from its sales and returns (never by adding up history rows) */
export interface ISerialFinancialsModel {
    /** Latest purchase amount; null when never entered */
    purchaseCost: number | null;
    /** This unit's share of every sale still on record */
    grossSales: number;
    /** Refunds of its returns, except rejected ones */
    totalRefunds: number;
    netSales: number;
    /** The cost counts only while the unit is sold or written off */
    costRealized: boolean;
    realizedCost: number | null;
    /** null when the cost is realized but was never entered */
    profit: number | null;
    salesCount: number;
    returnsCount: number;
    renewalsCount: number;
    renewalRevenue: number;
}

export interface ISerialSaleSummaryModel {
    saleId: number;
    reference: string;
    saleType: "Sale" | "Renewal";
    label: string;
    saleDate: string;
    branchName: string | null;
    customerName: string;
    amount: number;
    /** A return (not rejected) was recorded against this sale */
    returned: boolean;
}

export interface ISerialDetailModel {
    id: number;
    serialNumber: string;
    productId: number | null;
    productName: string;
    productType: SerialUnitType;
    licenseReassignable: boolean;
    status: SerialStatus;
    branchId: number | null;
    branchName: string | null;
    originalSupplier: string | null;
    originalPurchaseAmount: number | null;
    originalPurchaseDate: string | null;
    originalPurchaseReference: string | null;
    lastSellingAmount: number | null;
    lastSaleDate: string | null;
    lastTransactionDate: string | null;
    /** Licenses and installations: current installation and validity */
    installation: {
        installationDate: string | null;
        activationDate: string | null;
        expiryDate: string | null;
        deviceName: string | null;
        technicianName: string | null;
    };
    currentHolder: {
        saleId: number;
        saleReference: string;
        customerName: string;
        customerPhone: string | null;
        saleDate: string;
    } | null;
    pendingReturn: { id: number; reference: string } | null;
    financials: ISerialFinancialsModel;
    sales: ISerialSaleSummaryModel[];
    history: ISerialEventModel[];
    canTransfer: boolean;
    canInstall: boolean;
    canActivate: boolean;
    canRenew: boolean;
    canDeactivate: boolean;
    /** Admins: a cancelled license whose terms allow reassignment */
    canRelease: boolean;
}

export interface ISerialInstallModel {
    serialNumber: string;
    installationDate: string;
    deviceName?: string;
    technicianName?: string;
    /** Software only: activate at the same time */
    activate?: boolean;
    expiryDate?: string;
    note?: string;
}

export interface ISerialActivateModel {
    serialNumber: string;
    activationDate: string;
    expiryDate?: string;
    note?: string;
}

export interface ISerialRenewModel {
    serialNumber: string;
    renewalDate: string;
    expiryDate: string;
    /** 0 for a free renewal; otherwise recorded as a Renewal sale */
    amount: number;
    note?: string;
}

export interface ISerialDeactivateModel {
    serialNumber: string;
    date: string;
    reason: string;
}

export interface ISerialReleaseModel {
    serialNumber: string;
    branchId?: number;
    note?: string;
}

export interface ISerialTransferModel {
    serialNumber: string;
    toBranchId: number;
    /** yyyy-MM-dd; today when left out */
    transferDate?: string;
    note?: string;
}
