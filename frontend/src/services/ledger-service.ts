import type {
    ILedgerCreateModel, ILedgerFilterParams, ILedgerOptionsModel, ILedgerRequestModel,
    ILedgerResponseModel, ILedgerSummaryModel, LedgerKind,
} from "@/models/Ledger";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

// Income and expenses expose the same API under api/income and api/expense
const createLedgerService = (kind: LedgerKind) => {
    const base = `api/${kind}`;

    /** Branches the user can pick, categories and (expenses) payment methods */
    const options = async (): Promise<AxiosResponse<ApiResponseModel<ILedgerOptionsModel>>> =>
        httpService.get<ApiResponseModel<ILedgerOptionsModel>>(`${base}/options`);

    const list = async (requestBody: ILedgerRequestModel): Promise<AxiosResponse<ApiResponseModel<ILedgerResponseModel>>> =>
        httpService.get<ApiResponseModel<ILedgerResponseModel>>(base, { params: requestBody });

    /** Total and entry count per branch for the list's filters */
    const summary = async (filters: ILedgerFilterParams): Promise<AxiosResponse<ApiResponseModel<ILedgerSummaryModel>>> =>
        httpService.get<ApiResponseModel<ILedgerSummaryModel>>(`${base}/summary`, { params: filters });

    const create = async (requestBody: ILedgerCreateModel): Promise<AxiosResponse<ApiResponseModel<{ id: number }>>> =>
        httpService.post<ApiResponseModel<{ id: number }>>(base, requestBody);

    const update = async (id: number, requestBody: ILedgerCreateModel): Promise<AxiosResponse<ApiResponseModel<{ id: number }>>> =>
        httpService.put<ApiResponseModel<{ id: number }>>(`${base}/${id}`, requestBody);

    const remove = async (id: number): Promise<AxiosResponse<ApiResponseModel<null>>> =>
        httpService.delete<ApiResponseModel<null>>(`${base}/${id}`);

    return { options, list, summary, create, update, remove };
};

export type LedgerService = ReturnType<typeof createLedgerService>;

export const incomeService = createLedgerService("income");
export const expenseService = createLedgerService("expense");
