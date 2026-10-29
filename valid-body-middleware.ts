import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import WrongParamsResponseError from "./wrong-params-response-error";


export default function validBody(sch: Record<string, Joi.AnySchema>) {
    return asyncMiddleware(async function (req, _res) {
        const { error, value } = Joi
            .object(sch)
            .validate(req.body, { allowUnknown: true });

        if (error) {
            throw new WrongParamsResponseError(`WrongParamsError: ${error.details}`)
        }
        req.valid.body = value;
    });
}