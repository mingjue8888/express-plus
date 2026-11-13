import _ from "lodash";
import asyncMiddleware, {Middleware} from "./async-middleware";
import PermissionDeniedResponseError from "./permission-denied-response-error";


export default function hasRoles(roles: string[]): Middleware {
    return asyncMiddleware(async function (req, _res) {
        const userRoles = req.user?.roles.map(r => r.name);
        const noRole = _.intersection(roles, userRoles).length === 0;
        if (noRole) throw new PermissionDeniedResponseError("NotQualifiedError", "You do not meet the qualifications");
    });
}
