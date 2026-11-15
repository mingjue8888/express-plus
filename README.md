# Usage

## Define User

```typescript
import LoginAccount from "@mingjue8888/express-plus/login-account";

export interface UserAccount extends LoginAccount {}

declare global {
    namespace Express {
        interface User extends UserAccount {}
    }
}
```

## Define Error

```typescript
export class NotFoundUserError extends Error {}
```

## Write Router

```typescript
import Joi from "joi";
import asyncMiddleware from "@mingjue8888/express-plus/async-middleware";
import hasLogin from "@mingjue8888/express-plus/has-login";
import Router from "@mingjue8888/express-plus/router";
import validBody from "@mingjue8888/express-plus/valid-body";
import validParam from "@mingjue8888/express-plus/valid-param";
import validResponse from "@mingjue8888/express-plus/valid-response";

// File ./routers/routerA.ts
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

// File ./routers/routerB.ts
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
```

## Start app

```typescript
import app from "@mingjue8888/express-plus";
import routerA from "./routers/routerA";
import routerB from "./routers/routerB";
import {NotFoundUserError} from "./errors";
import NotFoundResponseError from "@mingjue8888/express-plus/not-found-response-error";

const routers = [
    routerA,
    routerB,
];

app(routers, {
    APP_PORT: 3000,

    async authenticate<UserAccount>(token: LoginToken) {
        return {
            id: token.sub,
            isLocked: false,
            isSuspended: false,
            isBanned: false,
            roles: [],
        } as UserAccount;
    },

    // Covert Error to ResponseError
    onError(err: Error) {
        if (err instanceof NotFoundUserError) {
            return new NotFoundResponseError(err.constructor.name, "Not found user");
        }
    }
});
```