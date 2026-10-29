import ResponseError from "./response-error";

export default class WrongParamsResponseError extends ResponseError {

    getHttpResponseStatus(): number {
        return 400;
    }
}