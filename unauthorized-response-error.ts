import ResponseError from "./response-error";

export default class UnauthorizedResponseError extends ResponseError {

    getHttpResponseStatus(): number {
        return 401;
    }
}