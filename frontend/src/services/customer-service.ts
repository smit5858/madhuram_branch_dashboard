import type { ICustomerCreateModel, ICustomerDetailsModel, ICustomerModel, ICustomerRequestModel, ICustomerResponseModel } from "@/models/Customer";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

const customer = async (requestBody: ICustomerRequestModel): Promise<AxiosResponse<ApiResponseModel<ICustomerResponseModel>>> =>
    httpService.get<ApiResponseModel<ICustomerResponseModel>>(`api/customer`, { params: requestBody });

/** Up to 8 customers matching a name, company or phone number, best matches first */
const suggestCustomers = async (search: string, signal?: AbortSignal): Promise<AxiosResponse<ApiResponseModel<{ customer: ICustomerModel[] }>>> =>
    httpService.get<ApiResponseModel<{ customer: ICustomerModel[] }>>(`api/customer/suggest`, { params: { search }, signal });

const customerById = async (id: number): Promise<AxiosResponse<ApiResponseModel<ICustomerDetailsModel>>> =>
    httpService.get<ApiResponseModel<ICustomerDetailsModel>>(`api/customer/${id}`);

const createCustomer = async (requestBody: ICustomerCreateModel): Promise<AxiosResponse<ApiResponseModel<ICustomerModel>>> =>
    httpService.post<ApiResponseModel<ICustomerModel>>(`api/customer`, requestBody);

const updateCustomer = async (id: number, requestBody: ICustomerCreateModel): Promise<AxiosResponse<ApiResponseModel<ICustomerModel>>> =>
    httpService.put<ApiResponseModel<ICustomerModel>>(`api/customer/${id}`, requestBody);

/** Admin only */
const deleteCustomer = async (id: number): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.delete<ApiResponseModel<null>>(`api/customer/${id}`);

export default {
    customer,
    suggestCustomers,
    customerById,
    createCustomer,
    updateCustomer,
    deleteCustomer,
};
