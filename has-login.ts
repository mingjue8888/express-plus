import passport from "passport";
import {Middleware} from "./async-middleware";

const hasLogin: Middleware =
    passport.authenticate("jwt", { session: false });

export default hasLogin;