import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import {WrongResponseError} from "./errors";


export default function validResponse(sch: Record<string, Joi.AnySchema>) {
    return asyncMiddleware(async function (_req, res) {
        const { error, value } = Joi
            .object(sch)
            .validate(res.body);

        if (error) {
            throw new WrongResponseError(error.message);
        }
        res.status(200).send(value);
    });
}