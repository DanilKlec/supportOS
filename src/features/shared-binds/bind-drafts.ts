import type { BindTranslation } from "@/entities/bind";
export interface BindDraft {
	translations: BindTranslation[];
	tags: string;
	language: string;
	baseVersion: string | null;
	savedAt: string;
}
function isDraftTranslation(
	value: unknown,
): value is Pick<BindTranslation, "language" | "title" | "content"> {
	const translation = value as Partial<BindTranslation> | null;
	// Keep the legacy acceptance rules: updatedAt is not required in old drafts.
	return (
		typeof translation?.language === "string" &&
		typeof translation.title === "string" &&
		typeof translation.content === "string"
	);
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
		const d = JSON.parse(raw) as Record<keyof BindDraft, unknown>;
		if (
			!Array.isArray(d.translations) ||
			!d.translations.every(isDraftTranslation) ||
			typeof d.tags !== "string" ||
			typeof d.language !== "string" ||
			typeof d.savedAt !== "string" ||
			(d.baseVersion !== null && typeof d.baseVersion !== "string")
		)
			return null;
		return d as BindDraft;
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
