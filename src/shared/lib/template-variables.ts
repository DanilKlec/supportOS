const VARIABLE_PATTERN = /\{([a-zA-Z0-9_. -]+)\}/g;

export function extractTemplateVariables(content: string) {
	return Array.from(content.matchAll(VARIABLE_PATTERN), (match) =>
		match[1].trim(),
	).filter((value, index, values) => value && values.indexOf(value) === index);
}

export function applyTemplateVariables(
	content: string,
	values: Record<string, string>,
) {
	return content.replace(VARIABLE_PATTERN, (match, variableName: string) => {
		const value = values[variableName.trim()];

		return value === undefined || value === "" ? match : value;
	});
}
