export interface IEmployeeRequestModel {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    branchId?: string;
}

export interface IEmployeeModel {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    roleId: number | null;
    branchId: number | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    Branch: { id: number; name: string; isActive: boolean } | null;
    Role: { id: number; name: string } | null;
}

export interface IEmployeeCreateModel {
    name: string;
    email: string;
    phone: string;
    /** Empty on update keeps the current password */
    password: string;
    roleId: number;
    branchId: number;
    isActive: boolean;
}

/** Form state; Select works with string values */
export interface IEmployeeFormValues extends Omit<IEmployeeCreateModel, "roleId" | "branchId"> {
    roleId: string;
    branchId: string;
}

export interface IEmployeeResponseModel {
    employee: IEmployeeModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}
