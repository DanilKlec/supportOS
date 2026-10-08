// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import type { Bind } from "@/entities/bind";
import type { KnowledgeFolder } from "@/entities/knowledge";
import { useKnowledgeStore } from "@/store";
import {
	collectFolderIds,
	getNextBindOrder,
	getReorderedItemOrders,
	revealLocation,
	search,
} from "./knowledge-tree";

const initialKnowledge = useKnowledgeStore.getState();
afterEach(() => useKnowledgeStore.setState(initialKnowledge));

function bind(id: string, patch: Partial<Bind> = {}): Bind {
	return {
		id,
		slug: id,
		categoryId: "category",
		tags: ["payments"],
		translations: [
			{
				language: "ru",
				title: "Вывод средств",
				content: "Проверьте статус",
				updatedAt: "2026-10-01T12:00:00Z",
			},
			{
				language: "en",
				title: "Withdrawal",
				content: "Check the transfer",
				updatedAt: "2026-10-01T12:00:00Z",
			},
		],
		favorite: false,
		archived: false,
		createdAt: "2026-10-01T12:00:00Z",
		updatedAt: "2026-10-01T12:00:00Z",
		...patch,
	};
}

it("searches the runtime titles, multilingual content, tags and slugs while excluding archives", () => {
	const active = bind("active"),
		archived = bind("archive", { archived: true });
	useKnowledgeStore.setState({ binds: [active, archived] });
	for (const query of ["  ", "ВЫВОД", "TRANSFER", "payments", "active"]) {
		expect(search(query)).toEqual([active]);
	}
	expect(search("missing")).toEqual([]);
	expect(useKnowledgeStore.getState().binds).toEqual([active, archived]);
});

it("calculates bind order only within the destination category and folder", () => {
	const binds = [
		bind("root", { order: 2 }),
		bind("folder", { folderId: "folder", order: 5 }),
		bind("other", { categoryId: "other", order: 99 }),
	];
	expect(getNextBindOrder(binds, "category")).toBe(3);
	expect(getNextBindOrder(binds, "category", "folder")).toBe(6);
	expect(getNextBindOrder(binds, "category", "empty")).toBe(1);
});

it("reorders siblings without mutating them and preserves boundary no-ops", () => {
	const items = [
		{ id: "second", order: 20 },
		{ id: "first", order: 10 },
		{ id: "third", order: 30 },
	];
	expect(getReorderedItemOrders(items, "second", "up")).toEqual(
		new Map([
			["second", 1],
			["first", 2],
			["third", 3],
		]),
	);
	expect(getReorderedItemOrders(items, "second", "down")).toEqual(
		new Map([
			["first", 1],
			["third", 2],
			["second", 3],
		]),
	);
	expect(getReorderedItemOrders(items, "first", "up")).toBeUndefined();
	expect(getReorderedItemOrders(items, "third", "down")).toBeUndefined();
	expect(getReorderedItemOrders(items, "missing", "up")).toBeUndefined();
	expect(items.map((item) => item.order)).toEqual([20, 10, 30]);
});

it("collects nested folder ids into the provided set without unrelated siblings", () => {
	const folders: KnowledgeFolder[] = [
		{ id: "parent", categoryId: "category", name: "Parent", order: 1 },
		{
			id: "child",
			parentId: "parent",
			categoryId: "category",
			name: "Child",
			order: 1,
		},
		{
			id: "grandchild",
			parentId: "child",
			categoryId: "category",
			name: "Grandchild",
			order: 1,
		},
		{ id: "sibling", categoryId: "category", name: "Sibling", order: 2 },
	];
	const result = new Set(["existing"]);
	expect(collectFolderIds("parent", folders, result)).toBe(result);
	expect([...result]).toEqual(["existing", "parent", "child", "grandchild"]);
});

it("reveals the ancestor path while preserving expansions and stopping repeated parents", () => {
	useKnowledgeStore.setState({
		expandedFolders: ["existing"],
		folders: [
			{
				id: "parent",
				parentId: "child",
				categoryId: "category",
				name: "Parent",
				order: 1,
			},
			{
				id: "child",
				parentId: "parent",
				categoryId: "category",
				name: "Child",
				order: 1,
			},
		],
	});
	revealLocation("category", "child");
	expect(useKnowledgeStore.getState().expandedFolders).toEqual([
		"existing",
		"category",
		"child",
		"parent",
	]);
	revealLocation("category", "child");
	expect(useKnowledgeStore.getState().expandedFolders).toEqual([
		"existing",
		"category",
		"child",
		"parent",
	]);
});
