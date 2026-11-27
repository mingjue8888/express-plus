import asyncMiddleware, {Middleware} from "./async-middleware";
import PermissionDeniedResponseError from "./permission-denied-response-error";
import UnauthorizedResponseError from "./unauthorized-response-error";

export default function hasPermissions(permissions: string[]): Middleware {
    return asyncMiddleware(async function (req, _res) {
        if (!req.user) throw new UnauthorizedResponseError("UnauthorizedError", "Please login");
        if (!req.user.roles.some(r => r.permissions.some(p => permissions.includes(p))))
            throw new PermissionDeniedResponseError("PermissionDeniedError", "You do not have permission");
    });
}