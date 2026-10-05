import type { IRoleResponseModel } from "@/models/Role";
import httpService from "./http-service";
import type { AxiosResponse } from "axios";
import type { ApiResponseModel } from "./api";

const role = async (): Promise<AxiosResponse<ApiResponseModel<IRoleResponseModel>>> =>
    httpService.get<ApiResponseModel<IRoleResponseModel>>(`api/role`);

export default {
    role,
};
