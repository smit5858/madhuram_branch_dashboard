import type { ICustomerModel } from "./Customer";

export interface ISaleRequestModel {
    page: number;
    pageSize: number;
    /** Matches customer name, phone or company, product name or a sold serial number */
    search?: string;
    /** yyyy-MM-dd, inclusive range on the sale date */
    startDate?: string;
    endDate?: string;
}

export interface ISaleModel {
    id: number;
    /** Linked customer; null for older sales and sales whose customer was deleted */
    customerId: number | null;
    /** The linked customer's current name, or the name saved on the sale */
    customerName: string;
    /** E.164, e.g. "+919876543210" */
    customerPhone: string;
    /** Current details of the linked customer */
    customer: ICustomerModel | null;
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

/** Optional details saved when the sale creates a new customer */
export interface ISaleCustomerDetailsModel {
    email: string;
    address: string;
    pincode: string;
    city: string;
    companyName: string;
}

export interface ISaleCreateModel {
    /** A picked existing customer. Without it the API reuses the customer with this phone
     *  number (same name) or creates a new one from the details below. */
    customerId: number | null;
    customerName: string;
    customerPhone: string;
    customerDetails?: ISaleCustomerDetailsModel;
    /** null for "Other": a product outside the catalogue, named by productName, with no stock */
    productId: number | null;
    /** Required when productId is null; ignored otherwise */
    productName?: string;
    quantity: number;
    /** Required for serial-tracked products, one per unit */
    serialNumbers?: string[];
    sellingAmount: number;
    saleDate: string;
    /** Ignored for branch members: the API always uses their own branch */
    branchId?: number;
}

/** Product picker value for "Other": a product outside the catalogue, typed by the user */
export const OTHER_PRODUCT = "other";

/** Form state; Select works with string values and an empty number input is "" */
export interface ISaleFormValues {
    /** The picked existing customer; null while entering a customer's details by hand */
    customer: ICustomerModel | null;
    customerName: string;
    customerPhone: string;
    /** Details for a new customer; ignored once a customer is picked */
    customerEmail: string;
    customerAddress: string;
    customerPincode: string;
    customerCity: string;
    customerCompany: string;
    /** A product id, or OTHER_PRODUCT for a product outside the catalogue */
    productId: string;
    /** Typed product name, used only for OTHER_PRODUCT */
    productName: string;
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
