import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import Joi from "joi";
import jwt from "jsonwebtoken";
import _ from "lodash";
import morgan from "morgan";
import * as crypto from "node:crypto";
import passport from "passport";
import {ExtractJwt, Strategy, StrategyOptions} from "passport-jwt";
import {Middleware} from "./async-middleware";
import JwtPayload from "./jwt-payload";
import ResponseError from "./response-error";
import Router from "./router";
import ServerError from "./server-error";
import UnauthorizedResponseError from "./unauthorized-response-error";
import LoginUser from "./user";
import "dotenv/config";

type DeepArray<T> =
    | T[]
    | DeepArray<T>[];

type ErrorConverter =
    (err: Error) => ResponseError | void;

function errorConverter(convert?: ErrorConverter): Middleware {
    return function (
        err: Error,
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
    ) {
        if (convert) {
            const resErr = convert(err);
            if (resErr) {
                next(convert(err));
            } else {
                next(err);
            }
        } else {
            next(err);
        }
    }
}

function errorHandler(
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
) {
    if (err instanceof ResponseError) {
        res
            .status(err.getHttpResponseStatus())
            .send({ error: err.error, message: err.message });
    } else {
        res
            .status(500)
            .send({ error: "ServerError", message: err.stack });
    }
}

declare global {
    namespace Express {
        interface User extends LoginUser {}
        interface Response {
            signToken: (userid: string) => void;
            refreshToken: () => void;
        }
    }
}

interface EnvOptions {
    APP_PORT: number;
    APP_REQUEST_RATE_LIMIT: number;
    APP_REQUEST_RATE_LIMIT_RANGE: number;
    JWT_SECRET?: string;
    JWT_EXPIRES_IN?: number;
    JWT_EXPIRES_BEFORE_REFRESH?: number;
}

interface StartupOptions extends EnvOptions {
    errorConverter?: ErrorConverter;

    findUser?:
        <T extends LoginUser>(id: string) => Promise<T>;

    whenTokenSigned?:
        (payload: JwtPayload, accessToken: string) => Promise<void>;
}

const oneSecond = 1000;
const oneMinute = oneSecond * 60;
const oneHour = oneMinute * 60;
const oneDay = oneHour * 24;

const optSchema = Joi.object<StartupOptions>({
    APP_PORT: Joi.number()
        .integer()
        .required()
        .default(3000),

    APP_REQUEST_RATE_LIMIT: Joi.number()
        .required()
        .default(20),

    APP_REQUEST_RATE_LIMIT_RANGE: Joi.number()
        .required()
        .default(1000),

    JWT_SECRET: Joi.string(),
    JWT_EXPIRES_IN: Joi.number()
        .integer()
        .greater(0)
        .when("JWT_SECRET", {
            is: Joi.exist(),
            then: Joi.required()
                .default(oneDay * 2)
        }),

    JWT_EXPIRES_BEFORE_REFRESH: Joi.number()
        .integer()
        .greater(0)
        .when("JWT_SECRET", {
            is: Joi.exist(),
            then: Joi.required()
                .default(oneHour * 2)
        }),
});

export default function app(routers: DeepArray<Router>, opt?: StartupOptions) {
    if (opt) {
        Reflect.ownKeys(process.env)
            .filter(key => key === key.toString().toUpperCase())
            .forEach(key => Reflect.set(opt, key, process.env[key as string]));
    }

    const conf: StartupOptions =
        Joi.attempt(opt, optSchema, { allowUnknown: true });

    if (conf.JWT_SECRET) {
        const jwtStrategy: StrategyOptions = {
            secretOrKey: conf.JWT_SECRET,
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: true,
        }

        const strategy = new Strategy(jwtStrategy, function (payload: JwtPayload, next) {
            if (conf.JWT_SECRET) {
                if (payload.exp < Math.floor(Date.now() / 1000)) {
                    next(new UnauthorizedResponseError("ExpiredTokenError", "The token has expired"), false);
                    return;
                }
                if (opt?.findUser) {
                    const isOnline = (u: LoginUser) =>
                        !u.loginToken.isLogout && u.loginToken.payload.jti === payload.jti;

                    opt.findUser(payload.sub)
                        .then(user =>
                            isOnline(user) ? user : Promise.reject(new UnauthorizedResponseError("TokenOfflineError", "Account was logout or logged in from another location")))
                        .then(user => next(null, user))
                        .catch(err => next(err, false));
                    return;
                }
            }

            next(new ServerError("ServerError", "Cannot find the logic for findUser"), false);
        });

        passport.use(strategy);
    }

    function preRoute(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) {
        res.signToken = (userid: string) => {
            if (conf.JWT_SECRET && conf.JWT_EXPIRES_IN) {
                const payload: JwtPayload = {
                    sub: userid,
                    exp: Math.floor(Date.now() / 1000 + conf.JWT_EXPIRES_IN),
                    jti: crypto.randomBytes(32).toString("hex"),
                }
                const accessToken = jwt.sign(payload, conf.JWT_SECRET)
                res.header("X-New-Access-Token", accessToken);
                opt?.whenTokenSigned?.(payload, accessToken);
            }
        }

        res.refreshToken = () => {
            if (req.user && conf.JWT_EXPIRES_BEFORE_REFRESH) {
                const diff = req.user.loginToken.payload.exp - Math.floor(Date.now() / 1000);
                const isNear = diff > 0 && diff < conf.JWT_EXPIRES_BEFORE_REFRESH;
                if (isNear) {
                    res.signToken(req.user.loginToken.payload.sub);
                }
            }
        }

        if (req.user) {
            res.refreshToken();
        }

        next();
    }

    const routes = _.flattenDeep(routers).reduce(
        (router: express.Router, route: Router): express.Router =>
            Reflect.get(router, route.path.toLowerCase()).bind(router)(route.path, ...route.middlewares),
        express.Router(),
    );

    return express()
        .use(rateLimit({ windowMs: conf.APP_REQUEST_RATE_LIMIT_RANGE, limit: conf.APP_REQUEST_RATE_LIMIT }))
        .use(cors({ optionsSuccessStatus: 200 }))
        .use(morgan(":method :url :status :res[content-length] - :response-time ms"))
        .use(compression())
        .use(express.urlencoded({ extended: true }))
        .use(express.json())
        .use(passport.initialize())
        .use(preRoute)
        .use(routes)
        .use(errorConverter(opt?.errorConverter))
        .use(errorHandler)
        .listen(conf.APP_PORT, () => console.info(`Server startup on port: ${conf.APP_PORT}`));
}