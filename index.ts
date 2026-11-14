import "dotenv/config";
import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import Joi from "joi";
import jwt from "jsonwebtoken";
import _ from "lodash";
import morgan from "morgan";
import passport from "passport";
import {ExtractJwt, Strategy, StrategyOptions} from "passport-jwt";
import {Middleware} from "./async-middleware";
import LoginAccount from "./login-account";
import LoginToken from "./login-token";
import PermissionDeniedResponseError from "./permission-denied-response-error";
import ResponseError from "./response-error";
import Router from "./router";
import ServerErrorResponseError from "./server-error-response-error";
import TooManyRequestsResponseError from "./too-many-requests-response-error";
import UnauthorizedResponseError from "./unauthorized-response-error";

type DeepArray<T> =
    | T[]
    | DeepArray<T>[];

type ResponseErrorConverter =
    (err: Error) => ResponseError | void;

function errorConverter(onError?: ResponseErrorConverter): Middleware {
    return function (
        err: Error,
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
    ) {
        if (onError) {
            const resErr = onError(err);
            if (resErr) {
                next(onError(err));
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
        interface User extends LoginAccount {}
        interface Response {
            signToken: (sub: string) => void;
            body?: any;
        }
    }
}

interface EnvOptions {
    APP_PORT: number;
    APP_REQUEST_RATE_LIMIT: number;
    APP_REQUEST_RATE_LIMIT_RANGE: number;
    APP_CORS_ALLOW_ORIGIN: string;
    JWT_SECRET: string;
    JWT_EXPIRE: number;
}

interface StartupOptions extends EnvOptions {
    authenticate?: <T extends LoginAccount>(token: LoginToken) => Promise<T>;
    onError?: ResponseErrorConverter;
}

const oneSecond = 1000;
const oneMinute = oneSecond * 60;
const oneHour = oneMinute * 60;
const oneDay = oneHour * 24;

const optSchema = Joi.object<StartupOptions>({
    APP_PORT: Joi.number()
        .integer()
        .required()
        .default(8086),

    APP_REQUEST_RATE_LIMIT: Joi.number()
        .required()
        .default(20),

    APP_REQUEST_RATE_LIMIT_RANGE: Joi.number()
        .required()
        .default(oneSecond),

    APP_CORS_ALLOW_ORIGIN: Joi.string()
        .required()
        .default("*"),

    JWT_SECRET: Joi.string()
        .required()
        .default("DefaultSecret"),

    JWT_EXPIRE: Joi.number()
        .integer()
        .greater(0)
        .when("JWT_SECRET", {
            is: Joi.exist(),
            then: Joi.required()
                .default(oneDay * 7)
        }),
});

export default function app(routers: DeepArray<Router>, opt?: StartupOptions) {
    if (opt) {
        Reflect.ownKeys(process.env)
            .filter(key => key === key.toString().toUpperCase())
            .forEach(key => Reflect.set(opt, key, process.env[key as string]));
    }

    const conf: StartupOptions =
        Joi.attempt(opt || {}, optSchema, { allowUnknown: true });

    const jwtStrategy: StrategyOptions = {
        secretOrKey: conf.JWT_SECRET,
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: true,
    }

    const strategy = new Strategy(jwtStrategy, function (payload: LoginToken, next) {
        if (!opt?.authenticate) {
            next(new ServerErrorResponseError("AuthenticationError", "Missing authentication logic"), false);
            return;
        }
        const isExpired = (exp: number): boolean =>
            exp < Math.floor(Date.now() / 1000);

        if (isExpired(payload.exp)) {
            next(new UnauthorizedResponseError("TokenExpiredError", "The token has expired"), false);
            return;
        }

        opt.authenticate(payload)
            .then(user => user.isLocked    ? Promise.reject(new PermissionDeniedResponseError("AccountLockedError", "Your account has been locked")) : user)
            .then(user => user.isSuspended ? Promise.reject(new PermissionDeniedResponseError("AccountSuspendedError", "Your account is disabled")) : user)
            .then(user => user.isBanned    ? Promise.reject(new PermissionDeniedResponseError("AccountBannedError", "Your account has been permanently banned")) : user)
            .then(user => next(null, user))
            .catch(err => next(err, false));
    });

    passport.use(strategy);

    function addSignToken(_req: express.Request, res: express.Response, next: express.NextFunction) {
        const now = Math.floor(Date.now() /1000);
        res.signToken = (sub: string) => {
            const payload = {
                sub,
                iat: now,
                exp: now + conf.JWT_EXPIRE
            };
            const accessToken = jwt.sign(payload, conf.JWT_SECRET);
            res.body = { accessToken };
        }
        next();
    }

    const routes = _.flattenDeep(routers).reduce(
        (router: express.Router, route: Router): express.Router =>
            Reflect.get(router, route.path.toLowerCase()).bind(router)(route.path, ...route.middlewares),
        express.Router(),
    );

    return express()
        .use(rateLimit({
            windowMs: conf.APP_REQUEST_RATE_LIMIT_RANGE, limit: conf.APP_REQUEST_RATE_LIMIT,
            handler: (_req, _res, next) =>
                next(new TooManyRequestsResponseError("TooManyRequests", "Too many requests, please try again later"))
        }))
        .use(cors({ origin: conf.APP_CORS_ALLOW_ORIGIN }))
        .use(morgan(":method :url :status :res[content-length] - :response-time ms"))
        .use(compression())
        .use(express.urlencoded({ extended: true }))
        .use(express.json())
        .use(passport.initialize())
        .use(addSignToken)
        .use(routes)
        .use(errorConverter(opt?.onError))
        .use(errorHandler)
        .listen(conf.APP_PORT, () => console.info(`Server startup on port: ${conf.APP_PORT}`));
}