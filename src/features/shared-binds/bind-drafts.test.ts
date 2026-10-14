// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { readDraft } from "./bind-drafts";

afterEach(() => localStorage.clear());

const draft = {
	translations: [{ language: "ru", title: "Ответ", content: "Текст" }],
	tags: "tag",
	language: "ru",
	baseVersion: null,
	savedAt: "stamp",
};

it("keeps legacy translations without updatedAt and additional stored fields", () => {
	localStorage.setItem(
		"draft",
		JSON.stringify({ ...draft, extra: "retained" }),
	);
	expect(readDraft("draft")).toEqual({ ...draft, extra: "retained" });
});

it.each([
	null,
	42,
	{ language: "ru", title: 42, content: "Text" },
	{ language: "ru", title: "Title" },
])("rejects the same malformed translation fields (%j)", (translation) => {
	localStorage.setItem(
		"draft",
		JSON.stringify({ ...draft, translations: [translation] }),
	);
	expect(readDraft("draft")).toBeNull();
});

it("keeps empty translation arrays valid and unreadable JSON unchanged", () => {
	localStorage.setItem("draft", JSON.stringify({ ...draft, translations: [] }));
	expect(readDraft("draft")?.translations).toEqual([]);
	localStorage.setItem("draft", "{invalid");
	expect(readDraft("draft")).toBeNull();
	expect(localStorage.getItem("draft")).toBe("{invalid");
});
