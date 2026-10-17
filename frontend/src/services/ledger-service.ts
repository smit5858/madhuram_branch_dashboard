import type {
    ILedgerBalanceModel, ILedgerBalanceTargetModel, ILedgerCreateModel, ILedgerFilterParams, ILedgerOptionsModel,
    ILedgerRequestModel, ILedgerResponseModel, ILedgerSummaryModel, LedgerKind,
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

    /** Stored Total Balance per branch, with the balance recalculated from the records */
    const balance = async (branchId?: number): Promise<AxiosResponse<ApiResponseModel<ILedgerBalanceModel>>> =>
        httpService.get<ApiResponseModel<ILedgerBalanceModel>>(`${base}/balance`, { params: { branchId } });

    /** Saves the amount entered (admins), or recalculates the balance (no branch: own branch, or every branch for admins) */
    const updateBalance = async (target: ILedgerBalanceTargetModel): Promise<AxiosResponse<ApiResponseModel<{ balance: number }>>> =>
        httpService.post<ApiResponseModel<{ balance: number }>>(`${base}/balance/update`, target);

    /** Admins only: sets one branch's balance to 0; entries and sales are kept */
    const resetBalance = async (target: { branchId: number }): Promise<AxiosResponse<ApiResponseModel<{ previousBalance: number; balance: number }>>> =>
        httpService.post<ApiResponseModel<{ previousBalance: number; balance: number }>>(`${base}/balance/reset`, target);

    return { options, list, summary, create, update, remove, balance, updateBalance, resetBalance };
};

export type LedgerService = ReturnType<typeof createLedgerService>;

export const incomeService = createLedgerService("income");
export const expenseService = createLedgerService("expense");
