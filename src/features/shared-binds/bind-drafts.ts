import type { BindTranslation } from "@/entities/bind";
export interface BindDraft {
	translations: BindTranslation[];
	tags: string;
	language: string;
	baseVersion: string | null;
	savedAt: string;
}
export function draftKey(
	actor: string,
	target: string,
	source: string,
	personal: boolean,
) {
	return (
		"supportos:bind-draft:v1:" +
		JSON.stringify([actor, target, source, personal ? "personal" : "common"])
	);
}
export function readDraft(key: string): BindDraft | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const d = JSON.parse(raw);
		if (
			!Array.isArray(d.translations) ||
			!d.translations.every(
				(t: any) =>
					typeof t?.language === "string" &&
					typeof t.title === "string" &&
					typeof t.content === "string",
			) ||
			typeof d.tags !== "string" ||
			typeof d.language !== "string" ||
			typeof d.savedAt !== "string" ||
			(d.baseVersion !== null && typeof d.baseVersion !== "string")
		)
			return null;
		return d;
	} catch {
		return null;
	}
}
export function writeDraft(key: string, draft: BindDraft) {
	localStorage.setItem(key, JSON.stringify(draft));
}
export function removeDraft(key: string) {
	localStorage.removeItem(key);
}
