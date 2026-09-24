import type { ProjectEmailRecord, ProjectEmailAddress } from '../src/entities/project-email';
export function emailAddresses(record:ProjectEmailRecord):ProjectEmailAddress[];
export function normalizeProjectEmail(record:ProjectEmailRecord):ProjectEmailRecord & {emails:ProjectEmailAddress[]};
export function projectEmailText(record:ProjectEmailRecord):string;
export function mergeEmailImport(existing:ProjectEmailRecord|undefined,incoming:ProjectEmailRecord):ProjectEmailRecord;
