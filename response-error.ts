

export default abstract class ResponseError extends Error {

    abstract getHttpResponseStatus(): number;
}

