import {
    Handler,
    NextFunction,
    Request,
    RequestHandler,
    ErrorRequestHandler,
    Response
} from "express";

declare global {
    namespace Express {
        interface Request {
            valid: {
                param: any;
                query: any;
                body: any;
            }
        }
    }
}

export type Middleware =
    | Handler
    | RequestHandler
    | ErrorRequestHandler;

export type AsyncMiddlewareHandler =
    (req: Request, res: Response) => Promise<void>;

export default function asyncMiddleware(handler: AsyncMiddlewareHandler): Middleware {
    return function (req: Request, res: Response, next: NextFunction) {
        handler(req, res)
            .then(() => next())
            .catch(err => next(err));
    }
}