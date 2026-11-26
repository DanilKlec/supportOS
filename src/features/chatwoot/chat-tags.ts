import {
	B2C_BONUS_PROJECTS,
	KNOWN_SHORT_PROJECT_KEYS,
	PROJECT_CURRENCY_TABLE_OVERRIDES,
} from "@/entities/bonus/project-aliases";
import type { ChatTagScope, ChatwootInbox } from "@/services/chatwoot.service";
import {
	normalizeSearchValue,
	scoreTextSearch,
} from "@/shared/lib/bind-search";

const b2cProjects = new Set<string>(B2C_BONUS_PROJECTS);
const b2bProjects = new Set([
	...KNOWN_SHORT_PROJECT_KEYS,
	...Object.keys(PROJECT_CURRENCY_TABLE_OVERRIDES),
]);
const segmentOf = (value: string) =>
	value
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.find((word) => word === "b2b" || word === "b2c");

export function projectTagScope(
	inbox?: ChatwootInbox,
	name = "",
): ChatTagScope {
	if (inbox?.tagScope) return inbox.tagScope;
	const source = inbox?.name || name;
	const segment = segmentOf(source);
	if (segment) return segment;
	const brand = source
		.toLowerCase()
		.trim()
		.split(/[^a-z0-9]+/, 1)[0];
	if (b2cProjects.has(brand)) return "b2c";
	if (b2bProjects.has(brand)) return "b2b";
	return "all";
}

export function tagsForProject(tags: string[], scope: ChatTagScope) {
	if (scope === "all") return tags;
	const opposite = scope === "b2b" ? "b2c" : "b2b";
	return tags.filter((tag) => segmentOf(tag) !== opposite);
}

export function searchProjectTags(
	tags: string[],
	scope: ChatTagScope,
	query: string,
	selected: string,
) {
	const visible = tagsForProject(tags, scope);
	if (!normalizeSearchValue(query)) return visible;
	return visible
		.map((tag) => ({ tag, score: scoreTextSearch(query, [tag]) }))
		.filter(({ tag, score }) => score > 0 || tag === selected)
		.sort((a, b) => b.score - a.score)
		.map(({ tag }) => tag);
}

const depositKeys = new Set([
	"totaldeposit",
	"totaldeposits",
	"totaldepositamount",
	"totaldepositsamount",
	"deposittotal",
	"depositstotal",
	"depositsum",
	"depositsamounttotal",
	"lifetimedeposits",
	"общаясуммадепозитов",
	"суммадепозитов",
]);

export function totalDepositFrom(
	...sources: Array<Record<string, unknown> | undefined>
) {
	for (const attributes of sources) {
		const match = Object.entries(attributes ?? {}).find(
			([key, value]) =>
				depositKeys.has(key.toLowerCase().replace(/[^\p{L}]/gu, "")) &&
				((typeof value === "number" && Number.isFinite(value)) ||
					(typeof value === "string" && value.trim())),
		);
		if (match) return String(match[1]).trim();
	}
}

export function depositTags(tags: string[]) {
	return tags.filter(
		(tag) =>
			/deposit|депозит/i.test(tag) && /\d/.test(tag.replace(/b2[bc]/gi, "")),
	);
}
