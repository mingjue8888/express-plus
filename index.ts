import "dotenv/config";
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
import {
    CannotFindUserError,
    NotQualifiedError,
    PermissionDeniedError,
    TokenExpiredError,
    TokenOfflineError,
    WrongParamsError,
    WrongResponseError
} from "./errors";
import LoginSession from "./login-session";
import LoginToken from "./login-token";
import JwtPayload from "./login-token";
import LoginUser from "./login-user";
import PermissionDeniedResponseError from "./permission-denied-response-error";
import ResponseError from "./response-error";
import Router from "./router";
import ServerExceptionResponseError from "././server-exception-response-error";
import UnauthorizedResponseError from "./unauthorized-response-error";
import WrongParamsResponseError from "./wrong-params-response-error";

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

const defaultErrorConverter: ErrorConverter = function(err: Error) {
    if (err instanceof WrongParamsError) {
        return new WrongParamsResponseError(err.constructor.name, err.message);
    }
    if (err instanceof TokenExpiredError
        || err instanceof TokenOfflineError) {
        return new UnauthorizedResponseError(err.constructor.name, err.message);
    }
    if (err instanceof PermissionDeniedError
        || err instanceof NotQualifiedError) {
        return new PermissionDeniedResponseError(err.constructor.name, err.message);
    }
    if (err instanceof CannotFindUserError
        || err instanceof WrongResponseError) {
        return new ServerExceptionResponseError(err.constructor.name, err.message);
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
        interface User extends LoginUser<LoginSession> {}
        interface Response {
            signToken: (userid: string) => void;
            body?: any;
        }
    }
}

interface EnvOptions {
    APP_PORT: number;
    APP_REQUEST_RATE_LIMIT: number;
    APP_REQUEST_RATE_LIMIT_RANGE: number;
    JWT_SECRET: string;
    JWT_EXPIRES_IN: number;
    JWT_EXPIRED_BEFORE_REFRESH: number;
}

interface StartupOptions extends EnvOptions {
    errorConverter?: ErrorConverter;
    findUser?:
        <T extends LoginUser<LoginSession>>(id: string) => Promise<T>;

    whenTokenSigned?:
        (payload: LoginToken, accessToken: string) => Promise<void>;
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
        .default(1000),

    JWT_SECRET: Joi.string()
        .required()
        .default("DefaultSecret"),

    JWT_EXPIRES_IN: Joi.number()
        .integer()
        .greater(0)
        .when("JWT_SECRET", {
            is: Joi.exist(),
            then: Joi.required()
                .default(oneDay * 2)
        }),

    JWT_EXPIRED_BEFORE_REFRESH: Joi.number()
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

    const jwtStrategy: StrategyOptions = {
        secretOrKey: conf.JWT_SECRET,
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: true,
    }

    const strategy = new Strategy(jwtStrategy, function (payload: JwtPayload, next) {
        if (!opt?.findUser) {
            next(new CannotFindUserError(), false);
            return;
        }
        const isExpired = (exp: number): boolean =>
            exp < Math.floor(Date.now() / 1000);

        if (isExpired(payload.exp)) {
            next(new TokenExpiredError(), false);
            return;
        }
        const isOnline = (u: LoginUser<LoginSession>): boolean =>
            !u.session.isLogout && u.session.token.jti === payload.jti;

        opt.findUser(payload.sub)
            .then(user =>
                isOnline(user) ? user : Promise.reject(new TokenExpiredError()))
            .then(user => next(null, user))
            .catch(err => next(err, false));
    });

    passport.use(strategy);

    function jwtSettings(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) {
        const now = ~~(Date.now() /1000);
        const makeExp = () => now + conf.JWT_EXPIRES_IN;
        const makeJti = () => crypto.randomBytes(32).toString("hex");
        res.signToken = function(userid: string) {
            const token = { sub: userid, exp: makeExp(), jti: makeJti() };
            const accessToken = jwt.sign(token, userid);
            res.header("X-New-Access-Token", accessToken);
            opt?.whenTokenSigned?.(token, accessToken);
        }
        if (req.user) {
            const tokenExp = req.user.session.token.exp;
            const diffCurr = tokenExp - now;
            const isNearRefreshTime =
                diffCurr > 0 &&
                diffCurr < conf.JWT_EXPIRED_BEFORE_REFRESH;
            if (isNearRefreshTime) {
                res.signToken(req.user.session.token.sub);
            }
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
        .use(cors())
        .use(morgan(":method :url :status :res[content-length] - :response-time ms"))
        .use(compression())
        .use(express.urlencoded({ extended: true }))
        .use(express.json())
        .use(passport.initialize())
        .use(jwtSettings)
        .use(routes)
        .use(errorConverter(defaultErrorConverter))
        .use(errorConverter(opt?.errorConverter))
        .use(errorHandler)
        .listen(conf.APP_PORT, () => console.info(`Server startup on port: ${conf.APP_PORT}`));
}