import ResponseError from "./response-error";

export default class TooManyRequestsResponseError extends ResponseError {
    getHttpResponseStatus(): number {
        return 429;
    }
}