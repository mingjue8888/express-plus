import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import ServerErrorResponseError from "./server-error-response-error";

export default function validSend(sch: Record<string, Joi.AnySchema>) {
    return asyncMiddleware(async function (_req, res) {
        const data = await Joi.object(sch)
            .validateAsync(res.body)
            .catch(err => new ServerErrorResponseError("WrongResponseError", err.message));

        res.status(200)
            .send(data);
    });
}