import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import {WrongParamsError} from "./errors";


export default function validQuery(sch: Record<string, Joi.AnySchema>) {
    return asyncMiddleware(async function (req, _res) {
        const { error, value } = Joi
            .object(sch)
            .validate(req.query, { allowUnknown: true });

        if (error) {
            throw new WrongParamsError(error.message);
        }
        req.valid.query = value;
    });
}