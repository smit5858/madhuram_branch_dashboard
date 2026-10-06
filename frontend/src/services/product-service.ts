import type { IProductBranchScopeModel, IProductCreateModel, IProductRequestModel, IProductResponseModel } from "@/models/Product";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

const product = async (requestBody: IProductRequestModel): Promise<AxiosResponse<ApiResponseModel<IProductResponseModel>>> =>
    httpService.get<ApiResponseModel<IProductResponseModel>>(`api/product`, { params: requestBody });

const productBranches = async (): Promise<AxiosResponse<ApiResponseModel<IProductBranchScopeModel>>> =>
    httpService.get<ApiResponseModel<IProductBranchScopeModel>>(`api/product/branches`);

const createProduct = async (requestBody: IProductCreateModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.post<ApiResponseModel<null>>(`api/product`, requestBody);

const updateProduct = async (id: number, requestBody: IProductCreateModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.put<ApiResponseModel<null>>(`api/product/${id}`, requestBody);

/** Which of these serial numbers already exist (in stock anywhere or sold) */
const checkSerials = async (serialNumbers: string[]): Promise<AxiosResponse<ApiResponseModel<{ existing: string[] }>>> =>
    httpService.post<ApiResponseModel<{ existing: string[] }>>(`api/product/serials/check`, { serialNumbers });

/** Without branchId (admin only) the product is removed from every branch */
const deleteProduct = async (id: number, branchId?: number): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.delete<ApiResponseModel<null>>(`api/product/${id}`, { params: { branchId } });

export default {
    product,
    productBranches,
    createProduct,
    updateProduct,
    deleteProduct,
    checkSerials,
};
