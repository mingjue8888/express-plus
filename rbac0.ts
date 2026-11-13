
interface Role {
    name: string;
    permissions: string[];
}

export default interface RBAC0 {
    roles: Role[];
}