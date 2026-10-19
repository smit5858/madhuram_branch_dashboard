import type {
    ISerialActivateModel, ISerialDeactivateModel, ISerialDetailModel, ISerialInstallModel, ISerialListRequestModel,
    ISerialListResponseModel, ISerialOptionsModel, ISerialReleaseModel, ISerialRenewModel, ISerialSummaryModel, ISerialTransferModel,
} from "@/models/Serial";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

/** Admins see every serial number; branch members the ones their branch has been part of */
const list = async (requestBody: ISerialListRequestModel): Promise<AxiosResponse<ApiResponseModel<ISerialListResponseModel>>> =>
    httpService.get<ApiResponseModel<ISerialListResponseModel>>(`api/serial`, { params: requestBody });

const options = async (): Promise<AxiosResponse<ApiResponseModel<ISerialOptionsModel>>> =>
    httpService.get<ApiResponseModel<ISerialOptionsModel>>(`api/serial/options`);

/** One serial number with its current details, money totals and full history */
const detail = async (serialNumber: string): Promise<AxiosResponse<ApiResponseModel<ISerialDetailModel>>> =>
    httpService.get<ApiResponseModel<ISerialDetailModel>>(`api/serial/detail`, { params: { serialNumber } });

/** Admins only: moves an in-stock unit to another branch */
const transfer = async (requestBody: ISerialTransferModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.post<ApiResponseModel<null>>(`api/serial/transfer`, requestBody);

/** Counts by kind of unit and status for the list's filters (status itself is ignored) */
const summary = async (filters: Omit<ISerialListRequestModel, "page" | "pageSize">): Promise<AxiosResponse<ApiResponseModel<ISerialSummaryModel>>> =>
    httpService.get<ApiResponseModel<ISerialSummaryModel>>(`api/serial/summary`, { params: filters });

// Software licenses and installation services
const install = async (requestBody: ISerialInstallModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.post<ApiResponseModel<null>>(`api/serial/install`, requestBody);

const activate = async (requestBody: ISerialActivateModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.post<ApiResponseModel<null>>(`api/serial/activate`, requestBody);

const renew = async (requestBody: ISerialRenewModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.post<ApiResponseModel<null>>(`api/serial/renew`, requestBody);

const deactivate = async (requestBody: ISerialDeactivateModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.post<ApiResponseModel<null>>(`api/serial/deactivate`, requestBody);

/** Admins only: a cancelled license goes back into a pool, when its terms allow reassignment */
const release = async (requestBody: ISerialReleaseModel): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.post<ApiResponseModel<null>>(`api/serial/release`, requestBody);

export default {
    list,
    options,
    detail,
    transfer,
    summary,
    install,
    activate,
    renew,
    deactivate,
    release,
};
