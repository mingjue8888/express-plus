import _ from "lodash";
import asyncMiddleware, {Middleware} from "./async-middleware";
import {NotQualifiedError} from "./errors";


export default function hasRoles(roles: string[]): Middleware {
    return asyncMiddleware(async function (req, _res) {
        const noRole = _.intersection(roles, req.user?.roles)
            .length === 0;

        if (noRole) {
            throw new NotQualifiedError();
        }
    });
}
