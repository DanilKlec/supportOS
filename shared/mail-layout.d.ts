export type MailBlockType = "heading" | "text" | "image" | "button" | "divider" | "space";
export type MailBlock = { id: string; type: MailBlockType; text: string; url: string };
export type MailLayout = {
	version: 1;
	background: string;
	paper: string;
	foreground: string;
	accent: string;
	backgroundImage: string;
	blocks: MailBlock[];
};
export const mailHtmlLimit: number;
export const defaultMailLayout: MailLayout;
export function escapeMailHtml(value: string): string;
export function mailTextHtml(value: string): string;
export function mailAssetUrl(value: unknown): string;
export function mailLinkUrl(value: unknown): string;
export function normalizeMailLayout(input: unknown): MailLayout;
export function renderMailLayout(layout: MailLayout): string;
