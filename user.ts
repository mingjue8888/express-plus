import JwtPayload from "./jwt-payload";

export interface LoginSession {
    jwtPayload: JwtPayload;
}

export interface LoginUser<T extends LoginSession> {
    id: string;
    session: T;
}