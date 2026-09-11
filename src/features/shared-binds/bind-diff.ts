export interface BindContent {
	slug?: string;
	tags: string[];
	translations: { language: string; title: string; content: string }[];
}
export function contentKey(value: BindContent) {
	return JSON.stringify({
		slug: value.slug,
		tags: [...new Set(value.tags)].sort(),
		translations: value.translations
			.map(({ language, title, content }) => ({ language, title, content }))
			.sort((a, b) => a.language.localeCompare(b.language)),
	});
}
export function bindChange(
	before: BindContent | undefined,
	after: BindContent,
) {
	return !before
		? "added"
		: contentKey(before) === contentKey(after)
			? "unchanged"
			: "changed";
}
// Linear time and bounded memory, including very large imported answers.
export function changedText(before: string, after: string) {
	let start = 0,
		end = 0;
	while (
		start < before.length &&
		start < after.length &&
		before[start] === after[start]
	)
		start++;
	while (
		end < before.length - start &&
		end < after.length - start &&
		before[before.length - 1 - end] === after[after.length - 1 - end]
	)
		end++;
	return {
		prefix: before.slice(0, start),
		removed: before.slice(start, before.length - end),
		added: after.slice(start, after.length - end),
		suffix: end ? before.slice(-end) : "",
	};
}
