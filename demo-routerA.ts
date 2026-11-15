import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import Router from "./router";
import validBody from "./valid-body";
import validResponse from "./valid-response";

const login: Router = {
    method: "POST",
    path: "/login",
    middlewares: [
        validBody({
            username: Joi.string()
                .required(),

            password: Joi.string()
                .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/)
                .required()
        }),
        asyncMiddleware(async function (req, res) {
            const username = req.valid.body.username as string;
            const password = req.valid.body.password as string;
            const id = "UUID";
            res.signToken(id);
        }),
        validResponse({
            accessToken: Joi.string()
                .required(),
        }),
    ],
}

export default [
    login,
];

