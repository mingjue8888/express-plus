import bcrypt from "bcrypt";

export function encode(password: string): string {
    return bcrypt.hashSync(password, bcrypt.genSaltSync());
}

export function check(password: string, encoded: string): boolean {
    return bcrypt.compareSync(password, encoded);
}