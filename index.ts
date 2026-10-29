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
import * as encoder from "./password-encoder";
import ResponseError from "./response-error";
import Router from "./router";
import ServerError from "./server-error";
import UnauthorizedResponseError from "./unauthorized-response-error";
import {LoginSession, LoginUser} from "./user";
import "dotenv/config";

type DeepArray<T> =
    | T[]
    | DeepArray<T>[];

type ErrorConverter =
    (err: Error) => ResponseError | void;

function errorConverter(converter?: ErrorConverter): Middleware {
    return function (
        err: Error,
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction
    ) {
        if (converter) {
            const resErr = converter(err);
            if (resErr) {
                next(converter(err));
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
            .send({ message: err.message });
    } else {
        res
            .status(500)
            .send({ message: `ServerError: ${err.message}; ErrorStack: ${err.stack}` });
    }
}

declare global {
    namespace Express {
        interface User extends LoginUser<LoginSession> {}
        interface Response {
            signToken: (userid: string) => void;
            refreshToken: () => void;
        }
    }
}

interface DotEnvOptions {
    APP_PORT: number;
    APP_REQUEST_RATE_LIMIT: number;
    APP_REQUEST_RATE_LIMIT_RANGE: number;
    JWT_SECRET?: string;
    JWT_EXPIRES_IN?: number;
    JWT_EXPIRES_BEFORE_REFRESH?: number;
}

interface StartupOptions extends DotEnvOptions {
    errorConverter?: ErrorConverter;

    findUser?:
        <T extends LoginUser<LoginSession>>(userid: string) => Promise<T>;

    whenTokenSigned?:
        (payload: JwtPayload, accessToken: string) => Promise<void>;
}

const optSchema = Joi.object<StartupOptions>({
    "APP_PORT": Joi.number()
        .integer()
        .required()
        .default(3000),

    "APP_REQUEST_RATE_LIMIT": Joi.number()
        .required()
        .default(20),

    "APP_REQUEST_RATE_LIMIT_RANGE": Joi.number()
        .required()
        .default(1000),

    "JWT_SECRET": Joi.string(),
    "JWT_EXPIRES_IN": Joi.number()
        .integer()
        .greater(0),

    "JWT_EXPIRES_BEFORE_REFRESH": Joi.number()
        .integer()
        .greater(0),
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
                const key = issKey(payload, conf.JWT_SECRET);
                const isPass = encoder.check(key, payload.iss);
                if (!isPass) {
                    next(new UnauthorizedResponseError("FakeTokenError"), false);
                    return;
                }
                if (payload.exp < Math.floor(Date.now() / 1000)) {
                    next(new UnauthorizedResponseError("ExpiredTokenError"), false);
                    return;
                }
                if (opt?.findUser) {
                    opt.findUser(payload.sub)
                        .then(user => next(null, user))
                        .catch(err => next(err, false));
                    return;
                }
            }

            next(new ServerError("ServerError: Cannot find the logic for findUser."), false);
        });

        passport.use(strategy);
    }

    function issKey(payload: JwtPayload, secret: string): string {
         const params = [
            `exp=${payload.exp}`,
            `iat=${payload.iat}`,
            `jti=${payload.jti}`,
            `sub=${payload.sub}`,
            `secret=${secret}`,
        ].join("&");

        return crypto.createHash("sha256")
            .update(params)
            .digest("hex");
    }

    function signToken(userid: string, secret: string, expiresIn: number): { payload: JwtPayload, accessToken: string } {
        const payload: JwtPayload = {
            sub: userid,
            exp: Math.floor(Date.now() / 1000 + expiresIn),
            jti: crypto.randomBytes(32).toString("hex"),
            iss: "",
            iat: Math.floor(Date.now() / 1000),
        }
        payload.iss = encoder.encode(issKey(payload, secret));
        return {
            payload,
            accessToken: jwt.sign(payload, secret)
        }
    }

    function preRoute(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) {
        Reflect.set(res, "signToken", function(userid: string) {
            if (conf.JWT_SECRET && conf.JWT_EXPIRES_IN) {
                const { payload, accessToken } = signToken(userid, conf.JWT_SECRET, conf.JWT_EXPIRES_IN);
                res.header("X-New-Access-Token", accessToken);
                opt?.whenTokenSigned?.(payload, accessToken);
            }
        });

        Reflect.set(res, "refreshToken", function() {
            if (conf.JWT_EXPIRES_BEFORE_REFRESH && req.user?.session?.jwtPayload) {
                const diff = req.user.session.jwtPayload.exp - Math.floor(Date.now() / 1000);
                const isNear = diff > 0 && diff < conf.JWT_EXPIRES_BEFORE_REFRESH;
                if (isNear) {
                    res.signToken(req.user.session.jwtPayload.sub);
                }
            }
        });

        Reflect.get(res, "refreshToken")();
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