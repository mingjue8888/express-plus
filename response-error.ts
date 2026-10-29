

export default abstract class ResponseError extends Error {

    abstract getHttpResponseStatus(): number;

    constructor(public error: string, message?: string) {
        super(message);
    }
}

