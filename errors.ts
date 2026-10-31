export class WrongParamsError extends Error {}
export class WrongResponseError extends Error {}

export class TokenExpiredError extends Error {
    constructor() {
        super("The token has expired");
    }
}

export class TokenOfflineError extends Error {
    constructor() {
        super("Account was logout or logged in from another location");
    }
}

export class CannotFindUserError extends Error {
    constructor() {
        super("Cannot find the logic for findUser");
    }
}

export class PermissionDeniedError extends Error {
    constructor() {
        super("You do not have permission");
    }
}

export class NotQualifiedError extends Error {
    constructor() {
        super("You do not meet the qualifications");
    }
}