import LoginToken from "./login-token";

export default interface LoginSession {
    token: LoginToken;
    isLogout: boolean;
}