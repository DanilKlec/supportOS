export type Role = 'support'|'shift'|'admin'|'qc'|'creator'|'pending';
export type Permission = 'work'|'binds.read'|'binds.manage'|'projects.read'|'projects.write'|'bonuses.read'|'bonuses.write'|'tools'|'translator.use'|'composer.use'|'ai.rules'|'ai.playground'|'ai.tests'|'ai.publish'|'monitor.read'|'monitor.write'|'knowledge.write'|'ai.train'|'users.manage'|'roles.manage'|'technical';
export interface Access {status:'active'|'disabled'|'pending';roles:{id:string;name:string}[];permissions:string[];version:number;display_name:string;}
export const roles: Exclude<Role,'pending'>[];
export const roleLabels: Record<Role,string>;
export function normalizeRole(value:unknown): Role;
export function can(access:unknown,permission:Permission):boolean;
export function canAdmin(access:unknown):boolean;
export function canTrain(access:unknown):boolean;
export const adminPermissions: Record<string,Permission>;
export function routePermission(path:string,hash?:string):Permission;
export function canAccessPage(access:unknown,path:string,hash?:string):boolean;
