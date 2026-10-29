import JwtStored from "./jwt-stored";

export default interface LoginUser {
    id: string;
    loginToken: JwtStored;
    roles: string[];
    permissions: string[];
}