import type { IncomingMessage, ServerResponse } from 'node:http';
export function authorize(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
export function requireIdentity(request: IncomingMessage, env?: NodeJS.ProcessEnv): Promise<{id:string;sessionId:string}>;
export function requireUser(request: IncomingMessage, options?: {supervisor?: boolean; permission?: import('../shared/access.js').Permission|null; env?: NodeJS.ProcessEnv}): Promise<{id: string; sessionId:string; email?: string; app_metadata?: Record<string, unknown>;access:import('../shared/access.js').Access}>;
