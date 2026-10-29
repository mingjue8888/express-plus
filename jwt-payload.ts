

export default interface JwtPayload {
    sub: string;
    exp: number;
    jti: string;
    iss: string;
    iat: number;
}