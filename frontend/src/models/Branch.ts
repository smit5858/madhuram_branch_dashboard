export interface IBranchRequestModel {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
}

export interface IBranchModel {
    id: number;
    name: string;
    address: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface IBranchCreateModel {
    name: string;
    address: string;
    isActive: boolean;
}

export interface IBranchResponseModel {
    branch: IBranchModel[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
}
