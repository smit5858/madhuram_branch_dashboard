import type { ISaleCreateModel, ISaleProductResponseModel, ISaleRequestModel, ISaleResponseModel } from "@/models/Sale";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

const sale = async (requestBody: ISaleRequestModel): Promise<AxiosResponse<ApiResponseModel<ISaleResponseModel>>> =>
    httpService.get<ApiResponseModel<ISaleResponseModel>>(`api/sale`, { params: requestBody });

/** Products in stock at a branch. Branch members always get their own branch, whatever is sent. */
const saleProducts = async (branchId?: number): Promise<AxiosResponse<ApiResponseModel<ISaleProductResponseModel>>> =>
    httpService.get<ApiResponseModel<ISaleProductResponseModel>>(`api/sale/products`, { params: { branchId } });

const createSale = async (requestBody: ISaleCreateModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.post<ApiResponseModel<null>>(`api/sale`, requestBody);

const updateSale = async (id: number, requestBody: ISaleCreateModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.put<ApiResponseModel<null>>(`api/sale/${id}`, requestBody);

const deleteSale = async (id: number): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.delete<ApiResponseModel<null>>(`api/sale/${id}`);

export default {
    sale,
    saleProducts,
    createSale,
    updateSale,
    deleteSale,
};
