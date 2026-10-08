import type { ProjectEmailRecord, ProjectEmailAddress } from '../src/entities/project-email';
export type LegacyEmailAddress = Omit<ProjectEmailAddress,'order'> & {order?:number};
export type LegacyProjectEmailRecord = Omit<ProjectEmailRecord,'addresses'|'emails'> & {addresses?:LegacyEmailAddress[];emails?:LegacyEmailAddress[]};
export function emailAddresses(record:LegacyProjectEmailRecord):ProjectEmailAddress[];
export function normalizeProjectEmail(record:LegacyProjectEmailRecord):ProjectEmailRecord;
export function projectEmailText(record:LegacyProjectEmailRecord):string;
export function mergeEmailImport(existing:ProjectEmailRecord|undefined,incoming:LegacyProjectEmailRecord):ProjectEmailRecord;
