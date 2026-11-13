import ResponseError from "./response-error";

export default class CatchCrawlerResponseError extends ResponseError {
    getHttpResponseStatus(): number {
        return 418;
    }
}