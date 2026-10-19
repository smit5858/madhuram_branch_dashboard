import type {
    ISaleReturnCreateModel, ISaleReturnOptionsModel, ISaleReturnRequestModel, ISaleReturnResponseModel, ReturnDecision,
} from "@/models/SaleReturn";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

const list = async (requestBody: ISaleReturnRequestModel): Promise<AxiosResponse<ApiResponseModel<ISaleReturnResponseModel>>> =>
    httpService.get<ApiResponseModel<ISaleReturnResponseModel>>(`api/sale-return`, { params: requestBody });

const options = async (): Promise<AxiosResponse<ApiResponseModel<ISaleReturnOptionsModel>>> =>
    httpService.get<ApiResponseModel<ISaleReturnOptionsModel>>(`api/sale-return/options`);

/** Records a customer return of one serial number of a sale; it waits for an admin's decision */
const create = async (requestBody: ISaleReturnCreateModel): Promise<AxiosResponse<ApiResponseModel<{ id: number }>>> =>
    httpService.post<ApiResponseModel<{ id: number }>>(`api/sale-return`, requestBody);

/** Admins only */
const decide = async (id: number, decision: ReturnDecision, note?: string): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.post<ApiResponseModel<null>>(`api/sale-return/${id}/decision`, { decision, note });

export default {
    list,
    options,
    create,
    decide,
};
