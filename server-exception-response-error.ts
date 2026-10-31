import ResponseError from "./response-error";

export default class ServerExceptionResponseError extends ResponseError {

    getHttpResponseStatus(): number {
        return 500;
    }
}