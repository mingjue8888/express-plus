import routerA from "./demo-routerA";
import routerB, {NotFoundUserError} from "./demo-routerB";
import app from "./index";
import LoginAccount from "./login-account";
import LoginToken from "./login-token";
import NotFoundResponseError from "./not-found-response-error";

interface UserAccount extends LoginAccount {}

declare global {
    namespace Express {
        interface User extends UserAccount {}
    }
}

const routers = [
    routerA,
    routerB,
];

app(routers, {
    APP_PORT: 3000,

    async authenticate<UserAccount>(token: LoginToken) {
        return {
            id: token.sub,
            isLocked: false,
            isSuspended: false,
            isBanned: false,
            roles: [],
        } as UserAccount;
    },

    onError(err: Error) {
        if (err instanceof NotFoundUserError) {
            return new NotFoundResponseError(err.constructor.name, "Not found user");
        }
    }
});