import { describe, expect, it } from "vitest";
import type { Bind } from "@/entities/bind";
import { reconcileBindLinks, setBindLink } from "./bind-links";

const bind = (id: string, slug = id, sourceBindId?: string) =>
	({
		id,
		slug,
		sourceBindId,
		translations: [],
		tags: [],
		categoryId: "test",
		favorite: false,
		archived: false,
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
	}) as Bind;
describe("persistent one-to-one bind matching", () => {
	it("keeps archived personal branches linked after reloading without saved browser links", () => {
		expect(
			reconcileBindLinks(
				[bind("base")],
				[{ ...bind("own", "renamed", "base"), archived: true }],
				{},
			),
		).toEqual({ base: "own" });
	});
	it("replaces an old common self-link with its archived personal override but honors deliberate unlinking", () => {
		const own = { ...bind("own", "renamed", "base"), archived: true };
		expect(reconcileBindLinks([bind("base")], [own], { base: "base" })).toEqual(
			{ base: "own" },
		);
		expect(reconcileBindLinks([bind("base")], [own], { base: null })).toEqual({
			base: null,
		});
	});
	it("keeps a saved link after either slug changes", () => {
		const links = reconcileBindLinks(
			[bind("base", "same")],
			[bind("local", "same")],
			{},
		);
		expect(links).toEqual({ base: "local" });
		expect(
			reconcileBindLinks(
				[bind("base", "renamed")],
				[bind("local", "other")],
				links,
			),
		).toEqual(links);
	});
	it("does not guess when either side has duplicate slugs", () => {
		expect(
			reconcileBindLinks(
				[bind("a", "same"), bind("b", "same")],
				[bind("local", "same")],
				{},
			),
		).toEqual({});
		expect(
			reconcileBindLinks(
				[bind("a", "same")],
				[bind("x", "same"), bind("y", "same")],
				{},
			),
		).toEqual({});
	});
	it("reserves explicit identities before matching slugs", () => {
		expect(
			reconcileBindLinks(
				[bind("a", "same"), bind("b", "other")],
				[bind("x", "same", "b")],
				{},
			),
		).toEqual({ b: "x" });
	});
	it("does not relink deliberately separated or temporarily missing records", () => {
		expect(
			reconcileBindLinks([bind("a", "same")], [bind("new", "same")], {
				a: null,
			}),
		).toEqual({ a: null });
		expect(
			reconcileBindLinks([bind("a", "same")], [bind("new", "same")], {
				a: "missing",
			}),
		).toEqual({ a: "missing" });
	});
	it("rejects assigning a personal bind twice and permits reassignment after unlink", () => {
		expect(() => setBindLink({ a: "x" }, "b", "x")).toThrow("уже связан");
		expect(setBindLink(setBindLink({ a: "x" }, "a", null), "b", "x")).toEqual({
			a: null,
			b: "x",
		});
	});
});
