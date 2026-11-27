

export interface Role {
    name: string;
    permissions: string[];
}

export interface RBAC0User {
    roles: Role[];
}

export interface LoginAccount extends RBAC0User {
    isUnauthorized: boolean;
    unauthorizedError: string;
    unauthorizedMessage: string;
    isLocked: boolean;
    lockedError: string;
    lockedMessage: string;
}