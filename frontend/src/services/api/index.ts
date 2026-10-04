export interface ApiResponseModel<T = any> {
    message: string;
    data: T;
    status: boolean | number;
}
