import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import ServerError from "./server-error";


export default function validResponse(sch: Record<string, Joi.AnySchema>) {
    return asyncMiddleware(async function (_req, res) {
        const { error, value } = Joi
            .object(sch)
            .validate(res.body);

        if (error) {
            throw new ServerError("WrongResponseError", error.message);
        }
        res.status(200).send(value);
    });
}