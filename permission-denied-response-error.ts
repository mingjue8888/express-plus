import ResponseError from "./response-error";

export default class PermissionDeniedResponseError extends ResponseError {

    getHttpResponseStatus(): number {
        return 403;
    }
}