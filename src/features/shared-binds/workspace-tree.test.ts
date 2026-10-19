import { expect, it } from "vitest";
import type { Bind } from "@/entities/bind";
import { buildLibraryTree, flattenLibrary } from "./library-tree";
import { workspaceTreeBinds } from "./workspace-tree";

const makeBind = (
	id: string,
	ownerId: string | null,
	sourceBindId?: string,
): Bind => ({
	id,
	ownerId,
	sourceBindId,
	slug: id,
	categoryId: "cat",
	folderId: "folder",
	tags: [],
	translations: [{ language: "ru", title: id, content: "text", updatedAt: "" }],
	favorite: false,
	archived: false,
	createdAt: "",
	updatedAt: "",
});
const base = makeBind("common", null),
	own = makeBind("mine", "actor", "common");
const structure = {
	categories: [{ id: "cat", name: "Материалы", ownerId: null, order: 1 }],
	folders: [
		{
			id: "folder",
			name: "Ответы",
			categoryId: "cat",
			ownerId: null,
			order: 1,
		},
	],
};

it("renders shared and personal materials in one folder and one node per linked bind without changing ownership", () => {
	const standalone = makeBind("new", "actor");
	const records = [base, own, standalone];
	const before = structuredClone(records);
	const binds = workspaceTreeBinds(
		[base],
		[own],
		records,
		{ common: "mine" },
		"actor",
	);
	const nodes = flattenLibrary(
		buildLibraryTree(structure, binds, "ru", "actor"),
	);
	expect(nodes.map((node) => node.id)).toEqual([
		"cat",
		"folder",
		"mine",
		"new",
	]);
	expect(
		nodes
			.filter((node) => node.type === "bind")
			.map((node) => node.bind?.ownerId),
	).toEqual(["actor", "actor"]);
	expect(records).toEqual(before);
});

it("keeps unrelated shared materials and never includes another employee's records", () => {
	const unrelated = makeBind("other-common", null);
	const result = workspaceTreeBinds(
		[base, unrelated],
		[own, makeBind("foreign", "someone-else")],
		[own, makeBind("foreign-local", "someone-else")],
		{ common: "mine" },
		"actor",
	);
	expect(result.map((bind) => bind.id)).toEqual(["mine", "other-common"]);
});

it("keeps an archived personal branch out of the tree without resurrecting its source", () => {
	const archived = { ...own, archived: true };
	expect(
		workspaceTreeBinds([base], [own], [archived], { common: "mine" }, "actor"),
	).toEqual([]);
	expect(
		workspaceTreeBinds([base], [archived], [own], { common: "mine" }, "actor"),
	).toEqual([own]);
});

it("uses the current cloud location of shared binds and the personal location of a moved branch", () => {
	const cloud = { ...base, folderId: "current" };
	expect(workspaceTreeBinds([cloud], [], [base], {}, "actor")[0].folderId).toBe(
		"current",
	);
	const moved = { ...own, folderId: "my-folder" };
	expect(
		workspaceTreeBinds(
			[cloud],
			[own],
			[base, moved],
			{ common: "mine" },
			"actor",
		),
	).toEqual([moved]);
});

it("retains standalone personal binds after their shared source is archived and respects deliberate unlinking", () => {
	expect(
		workspaceTreeBinds(
			[{ ...base, archived: true }],
			[own],
			[own],
			{ common: "mine" },
			"actor",
		),
	).toEqual([own]);
	expect(
		workspaceTreeBinds([base], [own], [own], { common: null }, "actor"),
	).toEqual([base, own]);
});
