import JwtPayload from "./jwt-payload";

export default interface JwtStored {
    payload: JwtPayload;
    isLogout: boolean;
}