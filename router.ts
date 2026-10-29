import {Middleware} from "./async-middleware";


type Method =
    | "GET"
    | "POST"
    | "PUT"
    | "DELETE";


type Path =
    string;

export default interface Router {
    method: Method,
    path: Path,
    middlewares: Middleware[];
}