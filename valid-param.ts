import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import WrongParamsResponseError from "./wrong-params-response-error";

export default function validParam(sch: Record<string, Joi.AnySchema>) {
    return asyncMiddleware(async function (req, _res) {
        req.valid.param = await Joi.object(sch)
            .validateAsync(req.params, { allowUnknown: true })
            .catch(err => new WrongParamsResponseError("WrongParamsError", err.message));
    });
}