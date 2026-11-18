import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import WrongParamsResponseError from "./wrong-params-response-error";

export default function validBody(sch: Record<string, Joi.AnySchema>) {
    return asyncMiddleware(async function (req, _res) {
        req.valid.body = await Joi.object(sch)
            .validateAsync(req.body, { allowUnknown: true })
            .catch(err => new WrongParamsResponseError("WrongParamsError", err.message));
    });
}