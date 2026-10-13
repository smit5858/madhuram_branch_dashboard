export interface ICustomerRequestModel {
    page: number;
    pageSize: number;
    /** Matches name, phone number, company / shop / garage name, city or email */
    search?: string;
}

export interface ICustomerModel {
    id: number;
    name: string;
    /** E.164, e.g. "+919876543210"; null when not known */
    phone: string | null;
    email: string | null;
    address: string | null;
    pincode: string | null;
    city: string | null;
    /** Company / shop / garage name */
    companyName: string | null;
    createdAt: string;
    updatedAt: string;
}

/** A sale of the customer, as listed in the customer's details */
export interface ICustomerSaleModel {
    id: number;
    productName: string;
    quantity: number;
    sellingAmount: number;
    /** yyyy-MM-dd */
    saleDate: string;
    branchName: string | null;
}

/** Customer with their sales; branch members only get their own branch's sales */
export interface ICustomerDetailsModel extends ICustomerModel {
    sales: {
        count: number;
        total: number;
        lastSaleDate: string | null;
        /** Latest 10 */
        recent: ICustomerSaleModel[];
    };
}

/** Blank optional fields are sent as "" and saved as empty */
export interface ICustomerCreateModel {
    name: string;
    phone: string;
    email: string;
    address: string;
    pincode: string;
    city: string;
    companyName: string;
}

export interface ICustomerResponseModel {
    customer: ICustomerModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}
