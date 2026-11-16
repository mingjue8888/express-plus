import hasPermissionsByRBAC0 from "@mingjue8888/base-dependencies/rbac0/has-permissions";
import asyncMiddleware, {Middleware} from "./async-middleware";
import PermissionDeniedResponseError from "./permission-denied-response-error";

export default function hasPermissions(permissions: string[]): Middleware {
    return asyncMiddleware(async function (req, _res) {
        if (!hasPermissionsByRBAC0(req.user, permissions))
            throw new PermissionDeniedResponseError("PermissionDeniedError", "You do not have permission");
    });
}