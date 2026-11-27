export type InvitationTemplate = {
	subject: string;
	heading: string;
	body: string;
	button: string;
	footer: string;
	accent: string;
};

export const invitationFields: {
	key: Exclude<keyof InvitationTemplate, "accent">;
	label: string;
	limit: number;
	multiline?: boolean;
	optional?: boolean;
}[];
export const defaultInvitation: InvitationTemplate;
export function validateInvitation(value: unknown): InvitationTemplate;
export function renderInvitation(
	template: InvitationTemplate,
	options: { name: string; email: string; url: string },
): { subject: string; text: string; html: string };
