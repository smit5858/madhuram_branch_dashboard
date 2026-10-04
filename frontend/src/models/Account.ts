export interface ILoginRequestModel {
    email: string;
    password: string;
}

export interface ILoginEmployeeModel {
    id: string,
    name: string,
    email: string,
    roleId: string,
    roleName: string | null,
    allowedBranch: string | null,
}

export interface ILoginResponseModel {
    accessToken: string,
    refreshToken: string,
    employee: ILoginEmployeeModel,
}
