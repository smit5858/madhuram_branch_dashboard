/** Standard: plain quantity. Serialized: physical units with serial numbers. Software: license
 *  keys, no physical stock. Service: installation service, no stock (installation IDs per sale). */
export type ProductType = "Standard" | "Serialized" | "Software" | "Service";

export interface IProductRequestModel {
    page: number;
    pageSize: number;
    /** Comma-separated product types to list; every type when left out */
    productTypes?: string;
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
    /** In-stock serial numbers in this branch (Software: available license keys); empty otherwise */
    serialNumbers: string[];
    /** Software only: licenses in this branch's pool (quantity is always 0); null otherwise */
    licenseCount: number | null;
    updatedAt: string;
}

/** One product with the stock of every branch the user may see */
export interface IProductModel {
    id: number;
    name: string;
    /** Each unit has its own serial number; fixed when the product is first added */
    hasSerialNumber: boolean;
    productType: ProductType;
    /** Software: a returned license may be sold again */
    licenseReassignable: boolean;
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
    /** Only used when the product is first added */
    productType?: ProductType;
    /** Software only */
    licenseReassignable?: boolean;
    /** Serial-tracked products: one per unit. Adding appends to stock; editing replaces the branch's list. */
    serialNumbers?: string[];
    /** Ignored for branch members: the API always uses their own branch */
    branchId?: number;
    /** Optional purchase details of serial-tracked units being added (recorded in each unit's history) */
    purchase?: IProductPurchaseModel;
}

export interface IProductPurchaseModel {
    supplierName?: string;
    /** yyyy-MM-dd; today when left out */
    purchaseDate?: string;
    /** Cost of one unit */
    unitAmount?: number;
    /** Supplier invoice / reference number */
    reference?: string;
}

/** Form state; Select works with string values and an empty number input is "" */
export interface IProductFormValues {
    name: string;
    productType: ProductType;
    licenseReassignable: boolean;
    /** Textarea text, one serial number per line */
    serialNumbers: string;
    quantity: number | "";
    branchId: string;
    /** Purchase details, used only when adding serial-tracked units */
    supplierName: string;
    purchaseDate: string;
    unitAmount: number | "";
    purchaseReference: string;
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
