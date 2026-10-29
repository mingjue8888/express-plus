import * as crypto from "node:crypto";

export default function idgen(): string {
    return crypto.randomUUID().replaceAll("-", "");
}