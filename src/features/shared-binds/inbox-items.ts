import type { Bind } from "@/entities/bind";
import type { BindBranches } from "@/services/shared-binds.service";
export interface InboxItem {
	key: string;
	sourceId: string;
	branch: string;
	title: string;
	description: string;
	stamp: string;
}
export function inboxItems(
	common: Bind[],
	incoming: BindBranches["incoming"],
	baseline: Record<string, string>,
): InboxItem[] {
	const title = (b: Bind) => b.translations[0]?.title || b.slug;
	return [
		...incoming.map((s) => ({
			key: "share:" + s.id + ":" + s.bind.updatedAt,
			sourceId: s.sourceId,
			branch: s.id,
			title: title(s.bind),
			description: s.sender + " поделился своей версией",
			stamp: s.bind.updatedAt,
		})),
		...common
			.filter((b) => !b.archived && baseline[b.id] !== b.updatedAt)
			.map((b) => ({
				key: "common:" + b.id + ":" + b.updatedAt,
				sourceId: b.id,
				branch: "main",
				title: title(b),
				description: baseline[b.id]
					? "Общая версия обновлена"
					: "Новый общий бинд",
				stamp: b.updatedAt,
			})),
	].sort((a, b) => b.stamp.localeCompare(a.stamp));
}
