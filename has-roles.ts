import hasRolesByRBAC0 from "@mingjue8888/base-dependencies/rbac0/has-roles";
import asyncMiddleware, {Middleware} from "./async-middleware";
import PermissionDeniedResponseError from "./permission-denied-response-error";

export default function hasRoles(roles: string[]): Middleware {
    return asyncMiddleware(async function (req, _res) {
        if (!hasRolesByRBAC0(req.user, roles))
            throw new PermissionDeniedResponseError("NotQualifiedError", "You do not meet the qualifications");
    });
}
