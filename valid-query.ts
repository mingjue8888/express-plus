import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import WrongParamsResponseError from "./wrong-params-response-error";

export default function validQuery(sch: Record<string, Joi.AnySchema>) {
    return asyncMiddleware(async function (req, _res) {
        req.valid.query = await Joi.object(sch)
            .validateAsync(req.query, { allowUnknown: true })
            .catch(err => new WrongParamsResponseError("WrongParamsError", err.message));
    });
}