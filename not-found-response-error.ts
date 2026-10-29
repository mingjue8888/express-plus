import ResponseError from "./response-error";

export default class NotFoundResponseError extends ResponseError {

    getHttpResponseStatus(): number {
        return 404;
    }
}