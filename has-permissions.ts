import _ from "lodash";
import asyncMiddleware, {Middleware} from "./async-middleware";
import {PermissionDeniedError} from "./errors";


export default function hasPermissions(permissions: string[]): Middleware {
    return asyncMiddleware(async function (req, _res) {
        const noPermission = _.intersection(permissions, req.user?.permissions)
            .length === 0;

        if (noPermission) {
            throw new PermissionDeniedError();
        }
    });
}