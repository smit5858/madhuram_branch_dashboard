import type {
    IRajkotExpenseCreateModel, IRajkotExpenseOptionsModel, IRajkotExpenseProductsResponseModel,
    IRajkotExpenseRequestModel, IRajkotExpenseResponseModel, IRajkotExpenseSummaryModel, IRajkotExpenseTargetModel,
} from "@/models/RajkotExpense";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

const base = "api/rajkot-expense";

/** Branches the user can see; ownBranchId is the branch whose entries they can accept */
const options = async (): Promise<AxiosResponse<ApiResponseModel<IRajkotExpenseOptionsModel>>> =>
    httpService.get<ApiResponseModel<IRajkotExpenseOptionsModel>>(`${base}/options`);

/** Admins only: products stocked in a branch, with the serial numbers still free to pick */
const products = async (branchId: number): Promise<AxiosResponse<ApiResponseModel<IRajkotExpenseProductsResponseModel>>> =>
    httpService.get<ApiResponseModel<IRajkotExpenseProductsResponseModel>>(`${base}/products`, { params: { branchId } });

const list = async (requestBody: IRajkotExpenseRequestModel): Promise<AxiosResponse<ApiResponseModel<IRajkotExpenseResponseModel>>> =>
    httpService.get<ApiResponseModel<IRajkotExpenseResponseModel>>(base, { params: requestBody });

/** Stored count and balance per branch */
const summary = async (branchId?: number): Promise<AxiosResponse<ApiResponseModel<IRajkotExpenseSummaryModel>>> =>
    httpService.get<ApiResponseModel<IRajkotExpenseSummaryModel>>(`${base}/summary`, { params: { branchId } });

const create = async (requestBody: IRajkotExpenseCreateModel): Promise<AxiosResponse<ApiResponseModel<{ id: number }>>> =>
    httpService.post<ApiResponseModel<{ id: number }>>(base, requestBody);

const accept = async (id: number): Promise<AxiosResponse<ApiResponseModel<{ id: number; branchId: number; count: number; balance: number }>>> =>
    httpService.post<ApiResponseModel<{ id: number; branchId: number; count: number; balance: number }>>(`${base}/${id}/accept`);

const remove = async (id: number): Promise<AxiosResponse<ApiResponseModel<null>>> =>
    httpService.delete<ApiResponseModel<null>>(`${base}/${id}`);

/** Admins only: sets the count to 0; entries, stock and the balance stay as they are */
const resetCount = async (target: IRajkotExpenseTargetModel): Promise<AxiosResponse<ApiResponseModel<{ previousCount: number; count: number }>>> =>
    httpService.post<ApiResponseModel<{ previousCount: number; count: number }>>(`${base}/count/reset`, target);

/** Admins only: recalculates the balance from the accepted entries */
const updateBalance = async (target: IRajkotExpenseTargetModel): Promise<AxiosResponse<ApiResponseModel<{ balance: number }>>> =>
    httpService.post<ApiResponseModel<{ balance: number }>>(`${base}/balance/update`, target);

export default { options, products, list, summary, create, accept, remove, resetCount, updateBalance };
