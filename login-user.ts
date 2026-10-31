import LoginSession from "./login-session";

export default interface LoginUser<T extends LoginSession> {
    id: string;
    session: T;
    permissions: string[];
    roles: string[];
}