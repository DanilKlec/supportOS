import { expect, it } from "vitest";
import type { Bind } from "@/entities/bind";
import {
	buildKnowledgeTree,
	type KnowledgeCategory,
	type KnowledgeFolder,
} from "@/entities/knowledge";
import { buildSharedTree, personalTree } from "./shared-tree";

const categories: KnowledgeCategory[] = [
	{ id: "common", name: "Раздел", ownerId: null, color: "#3B82F6", order: 1 },
	{ id: "mine", name: "Личное", ownerId: "me", order: 2 },
];
const folders: KnowledgeFolder[] = [
	{
		id: "folder",
		categoryId: "common",
		name: "Папка",
		ownerId: null,
		color: "#10B981",
		order: 1,
	},
	{
		id: "nested",
		categoryId: "common",
		parentId: "folder",
		name: "Вложенная",
		ownerId: null,
		order: 1,
	},
];
function bind(id: string, patch: Partial<Bind> = {}): Bind {
	return {
		id,
		ownerId: null,
		slug: id,
		categoryId: "common",
		tags: [],
		translations: [],
		createdAt: "",
		updatedAt: "",
		favorite: false,
		archived: false,
		...patch,
	};
}
it("groups existing and new common binds by category and nested folder without changing records", () => {
	const records = [
		bind("existing", { folderId: "nested" }),
		bind("new"),
		bind("personal", { ownerId: "me", categoryId: "mine" }),
		bind("archived", { archived: true }),
	];
	const before = structuredClone(records);
	const tree = buildSharedTree(categories, folders, records);
	expect(tree).toHaveLength(1);
	expect(tree[0].id).toBe("common");
	expect(tree[0].children[0].children[0].children[0].id).toBe("existing");
	expect(tree[0].children[1].id).toBe("new");
	expect(records).toEqual(before);
});
it("inherits the nearest folder then category color while preserving explicit bind colors", () => {
	const tree = buildSharedTree(categories, folders, [
		bind("root"),
		bind("inherited", { folderId: "nested" }),
		bind("explicit", { folderId: "nested", color: "#EF4444" }),
	]);
	expect(tree[0].children[1].color).toBe("#3B82F6");
	const nested = tree[0].children[0].children[0];
	expect(nested.color).toBe("#10B981");
	expect(nested.children.find((n) => n.id === "inherited")?.color).toBe(
		"#10B981",
	);
	expect(nested.children.find((n) => n.id === "explicit")?.color).toBe(
		"#EF4444",
	);
});
it("shows a bind at its category root if its old folder is missing or from another category", () => {
	const tree = buildSharedTree(categories, folders, [
		bind("missing", { folderId: "missing" }),
		bind("private", { folderId: "private" }),
	]);
	expect(
		tree[0].children.filter((n) => n.type === "bind").map((n) => n.id),
	).toEqual(["missing", "private"]);
});
it("excludes common originals from the personal tree but keeps personal branches and empty personal sections", () => {
	const tree = buildKnowledgeTree(categories, folders, [
		bind("common"),
		bind("branch", {
			ownerId: "me",
			sourceBindId: "common",
			folderId: "nested",
		}),
	]);
	const personal = personalTree(tree, categories, folders);
	expect(personal[0].children[0].children[0].children.map((n) => n.id)).toEqual(
		["branch"],
	);
	expect(personal[0].children).toHaveLength(1);
	expect(personal[1].id).toBe("mine");
});
