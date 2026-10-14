export const materialTabs = [
	{ id: "binds", label: "Бинды" },
	{ id: "emails", label: "Почты" },
	{ id: "bonuses", label: "Welcome-бонусы" },
];
export const problemTabs = [
	{ id: "duplicates", label: "Дубли" },
	{ id: "languages", label: "Переводы" },
];
export function qcDestination(hash: string) {
	const [id, query = ""] = hash.replace(/^#/, "").split("?");
	const params = new URLSearchParams(query);
	const filter =
		id === "proposals"
			? "proposal"
			: id === "gaps"
				? "gap"
				: id === "outdated"
					? "outdated"
					: params.get("type") || "all";
	if (["inbox", "proposals", "gaps", "outdated"].includes(id))
		return {
			section: "inbox",
			tab: "inbox",
			filter,
			item: params.get("item") || "",
		};
	if (id === "materials" || materialTabs.some((t) => t.id === id))
		return {
			section: "materials",
			tab: id === "materials" ? "binds" : id,
			filter,
			item: "",
		};
	if (id === "problems" || problemTabs.some((t) => t.id === id))
		return {
			section: "problems",
			tab: id === "problems" ? "duplicates" : id,
			filter,
			item: "",
		};
	return {
		section: id === "history" ? "history" : "overview",
		tab: id === "history" ? "history" : "overview",
		filter,
		item: "",
	};
}
