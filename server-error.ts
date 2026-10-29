import ResponseError from "./response-error";

export default class ServerError extends ResponseError {

    getHttpResponseStatus(): number {
        return 500;
    }
}