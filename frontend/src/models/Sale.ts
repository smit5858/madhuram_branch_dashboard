export interface ISaleRequestModel {
    page: number;
    pageSize: number;
    /** Matches customer name, customer phone, product name or a sold serial number */
    search?: string;
    /** yyyy-MM-dd, inclusive range on the sale date */
    startDate?: string;
    endDate?: string;
}

export interface ISaleModel {
    id: number;
    customerName: string;
    /** E.164, e.g. "+919876543210" */
    customerPhone: string;
    /** null once the product has been removed from the catalogue */
    productId: number | null;
    productName: string;
    /** Serial numbers of the units sold; empty for products without serial numbers */
    serialNumbers: string[];
    quantity: number;
    sellingAmount: number;
    /** yyyy-MM-dd */
    saleDate: string;
    branchId: number;
    branchName: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ISaleCreateModel {
    customerName: string;
    customerPhone: string;
    productId: number;
    quantity: number;
    /** Required for serial-tracked products, one per unit */
    serialNumbers?: string[];
    sellingAmount: number;
    saleDate: string;
    /** Ignored for branch members: the API always uses their own branch */
    branchId?: number;
}

/** Form state; Select works with string values and an empty number input is "" */
export interface ISaleFormValues {
    customerName: string;
    customerPhone: string;
    productId: string;
    quantity: number | "";
    serialNumbers: string[];
    sellingAmount: number | "";
    saleDate: string;
    branchId: string;
}

/** A product stocked in the selected branch, with that branch's current quantity */
export interface ISaleProductModel {
    id: number;
    name: string;
    hasSerialNumber: boolean;
    /** In-stock serial numbers in this branch */
    serialNumbers: string[];
    quantity: number;
}

export interface ISaleProductResponseModel {
    branchId: number;
    product: ISaleProductModel[];
}

/** Totals for the same search and date filters as the sales list */
export interface ISaleSummaryModel {
    /** Branch members get only their own branch; admins get every branch */
    branch: { branchId: number; branchName: string; total: number }[];
    total: number;
}

export interface ISaleResponseModel {
    sale: ISaleModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}
