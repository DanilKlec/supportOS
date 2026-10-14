import { expect, it } from "vitest";
import type { Bind } from "@/entities/bind";
import { employeeBinds } from "./employee-library";
import { buildLibraryTree, flattenLibrary } from "./library-tree";
const bind = (
	id: string,
	ownerId: string | null,
	extra: Partial<Bind> = {},
): Bind => ({
	id,
	ownerId,
	slug: id,
	categoryId: "common",
	translations: [
		{ language: "ru", title: id, content: id, updatedAt: "version" },
	],
	tags: [],
	favorite: false,
	archived: false,
	createdAt: "version",
	updatedAt: "version",
	...extra,
});
it("composes common originals with employee overrides and keeps standalone and orphaned personal materials", () => {
	const rows = [
		bind("base", null),
		bind("base2", null),
		bind("override", "employee", { sourceBindId: "base" }),
		bind("standalone", "employee"),
		bind("orphan", "employee", { sourceBindId: "gone" }),
		bind("archived", "employee", { archived: true }),
		bind("someone-else", "other"),
	];
	expect(employeeBinds(rows, "employee").map((b) => b.id)).toEqual([
		"override",
		"base2",
		"standalone",
		"orphan",
	]);
	expect(rows[0].ownerId).toBeNull();
});
it("renders owned folders and nested overrides without changing ownership or exposing another employee", () => {
	const structure = {
		categories: [
			{ id: "common", ownerId: null, name: "Общее", order: 1, updatedAt: "v" },
			{
				id: "mine",
				ownerId: "employee",
				name: "Личное",
				order: 2,
				updatedAt: "v",
			},
			{
				id: "other",
				ownerId: "other",
				name: "Чужое",
				order: 3,
				updatedAt: "v",
			},
		],
		folders: [
			{
				id: "folder",
				ownerId: "employee",
				categoryId: "mine",
				name: "Папка",
				order: 1,
				updatedAt: "v",
			},
		],
	};
	const personal = bind("own", "employee", {
		categoryId: "mine",
		folderId: "folder",
	});
	const tree = buildLibraryTree(
		structure,
		[
			bind("base", null),
			personal,
			bind("foreign", "other", { categoryId: "other" }),
		],
		"ru",
		"employee",
	);
	expect(tree.map((n) => n.id)).toEqual(["common", "mine"]);
	expect(tree[1].children[0].children[0].bind).toMatchObject({
		id: "own",
		ownerId: "employee",
		folderId: "folder",
	});
	expect(
		flattenLibrary(buildLibraryTree(structure, [personal], "ru")).some(
			(n) => n.bind,
		),
	).toBe(false);
});
it("keeps personal materials with missing or cyclic folders visible", () => {
	const structure = {
		categories: [
			{
				id: "mine",
				ownerId: "employee",
				name: "Личное",
				order: 1,
				updatedAt: "v",
			},
		],
		folders: [
			{
				id: "a",
				ownerId: "employee",
				categoryId: "mine",
				parentId: "b",
				name: "A",
				order: 1,
				updatedAt: "v",
			},
			{
				id: "b",
				ownerId: "employee",
				categoryId: "mine",
				parentId: "a",
				name: "B",
				order: 2,
				updatedAt: "v",
			},
		],
	};
	const nodes = flattenLibrary(
		buildLibraryTree(
			structure,
			[
				bind("cycle", "employee", { categoryId: "mine", folderId: "a" }),
				bind("missing", "employee", { categoryId: "gone", folderId: "no" }),
			],
			"ru",
			"employee",
		),
	);
	expect(
		nodes
			.filter((n) => n.bind)
			.map((n) => n.id)
			.sort(),
	).toEqual(["cycle", "missing"]);
});
