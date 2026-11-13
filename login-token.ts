import {JwtPayload} from "jsonwebtoken";

export default interface LoginToken extends JwtPayload {
    sub: string;
    iat: number;
    exp: number;
}