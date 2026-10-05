import type { IEmployeeCreateModel, IEmployeeModel, IEmployeeRequestModel, IEmployeeResponseModel } from "@/models/Employee";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

const employee = async (requestBody: IEmployeeRequestModel): Promise<AxiosResponse<ApiResponseModel<IEmployeeResponseModel>>> =>
    httpService.get<ApiResponseModel<IEmployeeResponseModel>>(`api/employee`, { params: requestBody });

const createEmployee = async (requestBody: IEmployeeCreateModel): Promise<AxiosResponse<ApiResponseModel<IEmployeeModel>>> =>
    httpService.post<ApiResponseModel<IEmployeeModel>>(`api/employee`, requestBody);

const updateEmployee = async (id: number, requestBody: IEmployeeCreateModel): Promise<AxiosResponse<ApiResponseModel<IEmployeeModel>>> =>
    httpService.put<ApiResponseModel<IEmployeeModel>>(`api/employee/${id}`, requestBody);

const deleteEmployee = async (id: number): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.delete<ApiResponseModel<null>>(`api/employee/${id}`);

export default {
    employee,
    createEmployee,
    updateEmployee,
    deleteEmployee,
};
