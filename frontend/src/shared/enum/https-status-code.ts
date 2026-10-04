export const HttpStatusCode = {
    ConflictError: 409,
    InternalServerError: 500,
    Success: 200,
    Error: 201,
    UserNotFound: 204,
    BadRequest: 400,
    Unauthorized: 401,
    Forbidden: 403,
    NotFound: 404,
} as const;

export type HttpStatusCode = (typeof HttpStatusCode)[keyof typeof HttpStatusCode];
