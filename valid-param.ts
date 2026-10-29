import Joi from "joi";
import _ from "lodash";
import asyncMiddleware from "./async-middleware";
import WrongParamsResponseError from "./wrong-params-response-error";


export default function validParam(sch: Record<string, Joi.AnySchema>) {
    return asyncMiddleware(async function (req, _res) {
        const { error, value } = Joi
            .object(sch)
            .validate(req.params, { allowUnknown: true });

        if (error) {
            throw new WrongParamsResponseError(`WrongParamsError: ${error.details}`)
        }

        _.set(req, ["valid", "param"], value);
    });
}