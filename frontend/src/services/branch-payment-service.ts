import type {
    IBranchPaymentCreateModel, IBranchPaymentDetailsModel, IBranchPaymentFilterParams, IBranchPaymentOptionsModel,
    IBranchPaymentRequestModel, IBranchPaymentResponseModel, IBranchPaymentSummaryModel,
} from "@/models/BranchPayment";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

const base = "api/branch-payment";

/** Branches, payment methods and statuses for the form and filters */
const options = async (): Promise<AxiosResponse<ApiResponseModel<IBranchPaymentOptionsModel>>> =>
    httpService.get<ApiResponseModel<IBranchPaymentOptionsModel>>(`${base}/options`);

const list = async (requestBody: IBranchPaymentRequestModel): Promise<AxiosResponse<ApiResponseModel<IBranchPaymentResponseModel>>> =>
    httpService.get<ApiResponseModel<IBranchPaymentResponseModel>>(base, { params: requestBody });

/** Sent / received / net per branch and overall for a date range and (optionally) one branch */
const summary = async (filters: Pick<IBranchPaymentFilterParams, "branchId" | "startDate" | "endDate">): Promise<AxiosResponse<ApiResponseModel<IBranchPaymentSummaryModel>>> =>
    httpService.get<ApiResponseModel<IBranchPaymentSummaryModel>>(`${base}/summary`, { params: filters });

/** One payment with its audit trail */
const details = async (id: number): Promise<AxiosResponse<ApiResponseModel<IBranchPaymentDetailsModel>>> =>
    httpService.get<ApiResponseModel<IBranchPaymentDetailsModel>>(`${base}/${id}`);

const create = async (requestBody: IBranchPaymentCreateModel): Promise<AxiosResponse<ApiResponseModel<{ id: number; paymentNo: string; duplicate?: boolean }>>> =>
    httpService.post<ApiResponseModel<{ id: number; paymentNo: string; duplicate?: boolean }>>(base, requestBody);

const update = async (id: number, requestBody: IBranchPaymentCreateModel): Promise<AxiosResponse<ApiResponseModel<{ id: number }>>> =>
    httpService.put<ApiResponseModel<{ id: number }>>(`${base}/${id}`, requestBody);

/** Pending -> Completed (admins or the receiving branch) */
const complete = async (id: number): Promise<AxiosResponse<ApiResponseModel<{ id: number }>>> =>
    httpService.post<ApiResponseModel<{ id: number }>>(`${base}/${id}/complete`, {});

const cancel = async (id: number, reason: string): Promise<AxiosResponse<ApiResponseModel<{ id: number }>>> =>
    httpService.post<ApiResponseModel<{ id: number }>>(`${base}/${id}/cancel`, { reason });

export const branchPaymentService = { options, list, summary, details, create, update, complete, cancel };
