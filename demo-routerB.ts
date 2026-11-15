import Joi from "joi";
import asyncMiddleware from "./async-middleware";
import hasLogin from "./has-login";
import Router from "./router";
import validParam from "./valid-param";
import validResponse from "./valid-response";

export class NotFoundUserError extends Error {}

const findUser: Router = {
    method: "GET",
    path: "/users/:userId",
    middlewares: [
        hasLogin,
        validParam({
            userId: Joi.string()
                .required(),
        }),
        asyncMiddleware(async function (req, res) {
            throw new NotFoundUserError();
        }),
        validResponse({
            id: Joi.string()
                .required(),

            name: Joi.string()
                .required(),
        }),
    ],
}

const findUserPosts: Router = {
    method: "GET",
    path: "/users/:userId/posts",
    middlewares: [
        hasLogin,
        validParam({
            userId: Joi.string()
                .required(),
        }),
        asyncMiddleware(async function (req, res) {
            res.body = {
                posts: []
            }
        }),
        validResponse({
            posts: Joi.array().items(Joi.object().keys({
                id: Joi.string().required(),
                content: Joi.string().required().default(""),
            }))
        })
    ],
}

export default [
    findUser,
    findUserPosts,
];
