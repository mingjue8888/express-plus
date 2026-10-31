import {JwtPayload} from "jsonwebtoken";

export default interface LoginToken extends JwtPayload {
    sub: string;
    exp: number;
    jti: string;
}