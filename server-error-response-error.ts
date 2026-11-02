import ResponseError from "./response-error";

export default class ServerErrorResponseError extends ResponseError {

    getHttpResponseStatus(): number {
        return 500;
    }
}