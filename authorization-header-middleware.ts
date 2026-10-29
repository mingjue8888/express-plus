import passport from "passport";

const needLogin =
    passport.authenticate("jwt", { session: false });

export default needLogin;