export interface IProductRequestModel {
    page: number;
    pageSize: number;
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
    updatedAt: string;
}

/** One product with the stock of every branch the user may see */
export interface IProductModel {
    id: number;
    name: string;
    /** Latest stock update across the listed branches */
    updatedAt: string;
    stocks: IProductStockModel[];
}

export interface IProductCreateModel {
    name: string;
    quantity: number;
    /** Ignored for branch members: the API always uses their own branch */
    branchId?: number;
}

/** Form state; Select works with string values and an empty number input is "" */
export interface IProductFormValues {
    name: string;
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
