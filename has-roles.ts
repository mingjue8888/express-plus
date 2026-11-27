import asyncMiddleware, {Middleware} from "./async-middleware";
import PermissionDeniedResponseError from "./permission-denied-response-error";
import UnauthorizedResponseError from "./unauthorized-response-error";

export default function hasRoles(roles: string[]): Middleware {
    return asyncMiddleware(async function (req, _res) {
        if (!req.user) throw new UnauthorizedResponseError("UnauthorizedError", "Please login");
        if (!req.user.roles.some(r => roles.includes(r.name)))
            throw new PermissionDeniedResponseError("RoleRequiredError", "You do not have the required role permissions.");
    });
}
