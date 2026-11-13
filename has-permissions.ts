import _ from "lodash";
import asyncMiddleware, {Middleware} from "./async-middleware";
import PermissionDeniedResponseError from "./permission-denied-response-error";


export default function hasPermissions(permissions: string[]): Middleware {
    return asyncMiddleware(async function (req, _res) {
        const userPermissions = req.user?.roles
            .map(r => r.permissions)
            .flat();

        const noPermission = _.intersection(permissions, userPermissions).length === 0;
        if (noPermission) throw new PermissionDeniedResponseError("PermissionDeniedError", "You do not have permission");
    });
}