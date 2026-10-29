import JwtPayload from "./jwt-payload";

export interface LoginSession {
    storedToken: JwtPayload;
}

export interface LoginUser<T extends LoginSession> {
    id: string;
    session: T;
}