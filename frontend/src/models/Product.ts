export interface IProductRequestModel {
    page: number;
    pageSize: number;
    /** Matches product name or any in-stock serial number */
    search?: string;
    /** yyyy-MM-dd, matched against when a branch's stock was last added/updated */
    startDate?: string;
    endDate?: string;
}

export interface IProductStockModel {
    id: number;
    branchId: number;
    branchName: string | null;
    quantity: number;
    /** In-stock serial numbers in this branch; empty for products without serial numbers */
    serialNumbers: string[];
    updatedAt: string;
}

/** One product with the stock of every branch the user may see */
export interface IProductModel {
    id: number;
    name: string;
    /** Each unit has its own serial number; fixed when the product is first added */
    hasSerialNumber: boolean;
    /** Latest stock update across the listed branches */
    updatedAt: string;
    stocks: IProductStockModel[];
}

export interface IProductCreateModel {
    name: string;
    /** Plain products only */
    quantity?: number;
    /** Only used when the product is first added */
    hasSerialNumber?: boolean;
    /** Serial-tracked products: one per unit. Adding appends to stock; editing replaces the branch's list. */
    serialNumbers?: string[];
    /** Ignored for branch members: the API always uses their own branch */
    branchId?: number;
}

/** Form state; Select works with string values and an empty number input is "" */
export interface IProductFormValues {
    name: string;
    hasSerialNumber: boolean;
    /** Textarea text, one serial number per line */
    serialNumbers: string;
    quantity: number | "";
    branchId: string;
}

export interface IProductBranchModel {
    id: number;
    name: string;
    isActive: boolean;
}

/** Which branches the logged-in user may see, as decided by the API */
export interface IProductBranchScopeModel {
    isAdmin: boolean;
    /** The member's own branch; null for admins */
    branchId: number | null;
    branch: IProductBranchModel[];
}

export interface IProductResponseModel {
    product: IProductModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}
