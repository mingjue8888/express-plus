import passport from "passport";
import {Middleware} from "./async-middleware";

const needLogin: Middleware =
    passport.authenticate("jwt", { session: false });

export default needLogin;