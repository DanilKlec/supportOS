import { expect, it } from "vitest";
import {
	buildLibraryTree,
	flattenLibrary,
	searchLibraryTree,
	folderPath,
} from "./library-tree";
const structure = {
	categories: [
		{ id: "cat", name: "Общее", ownerId: null, order: 1, updatedAt: "v1" },
	],
	folders: [
		{
			id: "a",
			name: "Бонусы",
			categoryId: "cat",
			ownerId: null,
			order: 1,
			updatedAt: "v1",
		},
		{
			id: "b",
			name: "Депозиты",
			categoryId: "cat",
			parentId: "a",
			ownerId: null,
			order: 1,
			updatedAt: "v1",
		},
	],
};
const bind = {
	id: "bind",
	slug: "answer",
	categoryId: "cat",
	folderId: "b",
	ownerId: null,
	tags: [],
	favorite: false,
	archived: false,
	createdAt: "",
	updatedAt: "",
	translations: [
		{
			language: "ru",
			title: "Отыгрыш",
			content: "Условия для клиента",
			updatedAt: "",
		},
	],
};
it("keeps search matches in their complete ancestor tree and uses the chosen language", () => {
	const tree = buildLibraryTree(structure, [bind], "ru"),
		filtered = searchLibraryTree(tree, "клиента");
	expect(flattenLibrary(filtered).map((n) => n.name)).toEqual([
		"Общее",
		"Бонусы",
		"Депозиты",
		"Отыгрыш",
	]);
	expect(folderPath("b", structure)).toEqual(["Бонусы", "Депозиты"]);
});
it("does not hide binds with missing category metadata or cyclic folder metadata", () => {
	const tree = buildLibraryTree(
		{
			...structure,
			folders: structure.folders.map((f) => ({
				...f,
				parentId: f.id === "a" ? "b" : "a",
			})),
		},
		[bind, { ...bind, id: "orphan", categoryId: "gone" }],
		"ru",
	);
	expect(
		flattenLibrary(tree)
			.filter((n) => n.type === "bind")
			.map((n) => n.id)
			.sort(),
	).toEqual(["bind", "orphan"]);
});
