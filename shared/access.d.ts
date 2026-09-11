export type Role = 'support'|'shift'|'admin'|'qc'|'creator'|'pending';
export type Permission = 'work'|'binds.read'|'binds.manage'|'projects.read'|'projects.write'|'bonuses.read'|'bonuses.write'|'tools'|'monitor.read'|'monitor.write'|'knowledge.write'|'ai.train'|'users.manage'|'roles.manage'|'technical';
export interface Access {status:'active'|'disabled'|'pending';roles:{id:string;name:string}[];permissions:string[];version:number;display_name:string;}
export const roles: Exclude<Role,'pending'>[];
export const roleLabels: Record<Role,string>;
export function normalizeRole(value:unknown): Role;
export function can(access:unknown,permission:Permission):boolean;
export function routePermission(path:string):Permission;
