import RBAC0 from "./rbac0";

export default interface LoginAccount extends RBAC0 {
    id: string;
    isLocked: boolean;
    isSuspended: boolean;
    isBanned: boolean;
    LockedReason?: string;
    SuspendedReason?: string;
    BannedReason?: string;
}