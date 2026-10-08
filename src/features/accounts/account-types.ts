export type ManagedRole = {
	id: string;
	name: string;
	description: string;
	is_system: boolean;
	version: number;
	permissions: string[];
};
export type Permission = {
	id: string;
	name: string;
	description: string;
	creator_only: boolean;
};
export type User = {
	id: string;
	email: string;
	display_name: string;
	status: string;
	version: number;
	roles: string[];
	telegram?: {
		telegram_id: number;
		telegram_username: string | null;
		verified_at: string;
	} | null;
};
export type Audit = {
	id: number;
	actor_label: string;
	action: string;
	target_id: string;
	created_at: string;
	before_data: AuditSnapshot | null;
	after_data: AuditSnapshot | null;
};

/** Safe fields consumed by the access audit UI; other server fields are retained. */
export type AuditSnapshot = {
	[key: string]: unknown;
	email?: string;
	name?: string;
	display_name?: string;
	version?: number;
	records?: number;
	source_bind_id?: string;
	status?: string;
	translations?: { language: string; title: string; content: string }[];
	roles?: (string | { id: string })[];
	permissions?: string[];
};

export type AccessResponses = {
	catalog: { roles: ManagedRole[]; permissions: Permission[] };
	users: { users: User[]; total: number; hasMore?: boolean };
	audit: { rows: Audit[]; hasMore: boolean };
};
export type AccessMutationResponse = { ok?: boolean; warning?: string };
