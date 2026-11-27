import "dotenv/config";
import logger from "@mingjue8888/base-dependencies/logger";
import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import Joi from "joi";
import jwt, {JwtPayload} from "jsonwebtoken";
import _ from "lodash";
import morgan from "morgan";
import passport from "passport";
import {ExtractJwt, Strategy, StrategyOptions} from "passport-jwt";
import {Middleware} from "./async-middleware";
import PermissionDeniedResponseError from "./permission-denied-response-error";
import {LoginAccount} from "./rbac0";
import ResponseError from "./response-error";
import Router from "./router";
import ServerErrorResponseError from "./server-error-response-error";
import TooManyRequestsResponseError from "./too-many-requests-response-error";
import UnauthorizedResponseError from "./unauthorized-response-error";

function errorConverter(onError?: (err: Error) => ResponseError | void): Middleware {
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
        logger.error(err);
        res
            .status(500)
            .send({ error: "ServerError", message: err.stack });
    }
}

declare global {
    namespace Express {
        interface User extends LoginAccount {}
        interface Response {
            signToken: (sub: string) => { accessToken: string; jwtPayload: JWTPayload; };
            body?: any;
        }
    }
}

interface EnvOptions {
    APP_PORT?: number;
    APP_REQUEST_RATE_LIMIT?: number;
    APP_REQUEST_RATE_LIMIT_RANGE?: number;
    APP_CORS_ALLOW_ORIGIN?: string;
    JWT_SECRET?: string;
    JWT_EXPIRE?: number;
}

type JWTPayload =
    Required<Pick<JwtPayload, "exp" | "sub" | "iat" | "jti">>;

interface StartupOptions extends EnvOptions {
    authenticate?: <T extends LoginAccount>(token: JWTPayload) => Promise<T>;
    onError?: (err: Error) => ResponseError | void;
}

const optSchema = Joi.object<Required<StartupOptions>, StartupOptions>({
    APP_PORT: Joi.number()
        .integer()
        .default(8086),

    APP_REQUEST_RATE_LIMIT: Joi.number()
        .default(20),

    APP_REQUEST_RATE_LIMIT_RANGE: Joi.number()
        .default(1000),

    APP_CORS_ALLOW_ORIGIN: Joi.string()
        .default("*"),

    JWT_SECRET: Joi.string()
        .default("DefaultSecret"),

    JWT_EXPIRE: Joi.number()
        .integer()
        .greater(0)
        .default(1000 * 60 * 60 * 24 * 7),
});

type DeepArray<T> =
    | T[]
    | DeepArray<T>[];

export default function app(routers: DeepArray<Router>, opt?: StartupOptions) {
    if (opt) {
        Reflect.ownKeys(process.env)
            .filter(key => key === key.toString().toUpperCase())
            .forEach(key => Reflect.set(opt, key, process.env[key as string]));
    }

    const conf: Required<StartupOptions> =
        Joi.attempt(opt || {}, optSchema, { allowUnknown: true });

    const jwtStrategy: StrategyOptions = {
        secretOrKey: conf.JWT_SECRET,
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: true,
    }

    const strategy = new Strategy(jwtStrategy, function (payload: JWTPayload, next) {
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
            .then(user => user.isUnauthorized ? Promise.reject(new UnauthorizedResponseError(user.unauthorizedError, user.unauthorizedMessage)) : user)
            .then(user => user.isLocked ? Promise.reject(new PermissionDeniedResponseError(user.lockedError, user.lockedMessage)) : user)
            .then(user => next(null, user))
            .catch(err => next(err, false));
    });

    passport.use(strategy);

    function addSignToken(_req: express.Request, res: express.Response, next: express.NextFunction) {
        res.signToken = (sub: string) => {
            const now = Math.floor(Date.now() /1000);
            const jwtPayload = {
                sub,
                iat: now,
                exp: now + conf.JWT_EXPIRE,
                jti: crypto.randomUUID().replaceAll("-", ""),
            };
            const accessToken = jwt.sign(jwtPayload, conf.JWT_SECRET);
            return { accessToken, jwtPayload };
        }
        next();
    }

    const routes = _.flattenDeep(routers).reduce(
        (router: express.Router, route: Router): express.Router =>
            Reflect.get(router, route.path.toLowerCase()).bind(router)(route.path, ...route.middlewares),
        express.Router(),
    );

     express()
        .use(rateLimit({
            windowMs: conf.APP_REQUEST_RATE_LIMIT_RANGE, limit: conf.APP_REQUEST_RATE_LIMIT,
            handler: (_req, _res, next) =>
                next(new TooManyRequestsResponseError("TooManyRequestsError", "Too many requests, please try again later"))
        }))
        .use(cors({ origin: conf.APP_CORS_ALLOW_ORIGIN }))
        .use(morgan(":method :url :status :res[content-length] - :response-time ms", {
            stream: {
                write: message => logger.http(message.trim())
            }
        }))
        .use(compression())
        .use(express.urlencoded({ extended: true }))
        .use(express.json())
        .use(passport.initialize())
        .use(addSignToken)
        .use(routes)
        .use(errorConverter(opt?.onError))
        .use(errorHandler)
        .listen(conf.APP_PORT, () => logger.info(`Server startup on port: ${conf.APP_PORT}`));
}