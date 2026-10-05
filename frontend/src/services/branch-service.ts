import type { IBranchCreateModel, IBranchModel, IBranchRequestModel, IBranchResponseModel } from "@/models/Branch";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

const branch = async (requestBody: IBranchRequestModel): Promise<AxiosResponse<ApiResponseModel<IBranchResponseModel>>> =>
    httpService.get<ApiResponseModel<IBranchResponseModel>>(`api/branch`, { params: requestBody });

const createBranch = async (requestBody: IBranchCreateModel): Promise<AxiosResponse<ApiResponseModel<IBranchModel>>> =>
    httpService.post<ApiResponseModel<IBranchModel>>(`api/branch`, requestBody);

const updateBranch = async (id: number, requestBody: IBranchCreateModel): Promise<AxiosResponse<ApiResponseModel<IBranchModel>>> =>
    httpService.put<ApiResponseModel<IBranchModel>>(`api/branch/${id}`, requestBody);

const deleteBranch = async (id: number): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.delete<ApiResponseModel<null>>(`api/branch/${id}`);

export default {
    branch,
    createBranch,
    updateBranch,
    deleteBranch,
};
