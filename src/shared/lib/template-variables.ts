const BRACED_VARIABLE_PATTERN = /\{([a-zA-Z0-9_. -]+)\}/g;
const HASH_VARIABLE_PATTERN = /##([a-zA-Z0-9_. -]+)##/g;
const VARIABLE_PATTERN = /\{([a-zA-Z0-9_. -]+)\}|##([a-zA-Z0-9_. -]+)##/g;

export function extractTemplateVariables(content: string) {
	return Array.from(content.matchAll(VARIABLE_PATTERN), (match) =>
		(match[1] ?? match[2] ?? "").trim(),
	).filter((value, index, values) => value && values.indexOf(value) === index);
}

export function applyTemplateVariables(
	content: string,
	values: Record<string, string>,
) {
	return content
		.replace(BRACED_VARIABLE_PATTERN, (match, variableName: string) => {
			const value = values[variableName.trim()];

			return value === undefined || value === "" ? match : value;
		})
		.replace(HASH_VARIABLE_PATTERN, (match, variableName: string) => {
			const value = values[variableName.trim()];

			return value === undefined || value === "" ? match : value;
		});
}
