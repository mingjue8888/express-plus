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

interface StartupOptions {
    port?: number;

    rateLimit?: {
        windowMs: number;
        limit: number;
    };

    jwt?: {
        secret: string;
        expiresIn: number;
        refreshNearIn?: number;
    }

    findUser?:
        <T extends LoginUser<LoginSession>>(userid: string) => Promise<T>;

    whenTokenSigned?:
        (payload: JwtPayload, accessToken: string) => Promise<void>;

    errorConverter?: ErrorConverter;
}

const optSchema = Joi.object<StartupOptions>({
    port: Joi.number()
        .integer()
        .required()
        .default(3000),

    jwt: Joi.object({
        secret: Joi.string()
            .required(),

        expiresIn: Joi.number()
            .integer()
            .greater(0)
            .required(),

        refreshNearIn: Joi.number()
            .integer()
            .greater(0),
    }),

    rateLimit: Joi.object({
        windowMs: Joi.number()
            .required()
            .default(1000),

        limit: Joi.number()
            .required()
            .default(20),
    }),
});

export default function app(routers: DeepArray<Router>, opt?: StartupOptions) {
    const conf: StartupOptions =
        Joi.attempt(opt, optSchema, { allowUnknown: true });

    if (opt?.jwt?.secret) {
        const jwtStrategy: StrategyOptions = {
            secretOrKey: opt.jwt.secret,
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: true,
        }

        const strategy = new Strategy(jwtStrategy, function (payload: JwtPayload, next) {
            if (opt?.jwt?.secret) {
                const key = issKey(payload, opt.jwt.secret);
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
            if (opt?.jwt?.secret && opt?.jwt.expiresIn) {
                const { payload, accessToken } = signToken(userid, opt.jwt.secret, opt.jwt.expiresIn);
                res.header("X-New-Access-Token", accessToken);
                opt?.whenTokenSigned?.(payload, accessToken);
            }
        });

        Reflect.set(res, "refreshToken", function() {
            if (opt?.jwt?.refreshNearIn && req.user?.session?.jwtPayload) {
                const diff = req.user.session.jwtPayload.exp - Math.floor(Date.now() / 1000);
                const isNear = diff > 0 && diff < opt.jwt.refreshNearIn;
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
        .use(rateLimit({ windowMs: conf.rateLimit?.windowMs, limit: conf.rateLimit?.limit }))
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
        .listen(conf.port, () => console.info(`Server startup on port: ${conf.port}`));
}