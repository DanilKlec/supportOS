import { describe, expect, it } from "vitest";

import type { Bind } from "@/entities/bind";
import { searchBinds } from "./bind-search";

function makeBind(
	id: string,
	title: string,
	content: string,
	tags: string[] = [],
): Bind {
	return {
		id,
		slug: id,
		categoryId: "general",
		tags,
		translations: [{ language: "ru", title, content, updatedAt: "2026-01-01" }],
		favorite: false,
		archived: false,
		createdAt: "2026-01-01",
		updatedAt: "2026-01-01",
	};
}

describe("searchBinds", () => {
	const binds = [
		makeBind("refund", "Возврат депозита", "Срок возврата составляет 5 дней"),
		makeBind("bonus", "Приветственный бонус", "Бонус за депозит", ["промо"]),
		makeBind("verification", "Верификация аккаунта", "Проверка документов"),
	];

	it("ranks title matches above content matches", () => {
		expect(searchBinds(binds, "депозит", { language: "ru" })[0]?.id).toBe(
			"refund",
		);
	});

	it("requires every query word to match", () => {
		expect(
			searchBinds(binds, "бонус документы", { language: "ru" }),
		).toHaveLength(0);
	});

	it("tolerates a one-character typo in a meaningful word", () => {
		expect(searchBinds(binds, "верификаця", { language: "ru" })[0]?.id).toBe(
			"verification",
		);
	});

	it("finds exact tags", () => {
		expect(searchBinds(binds, "промо", { language: "ru" })[0]?.id).toBe(
			"bonus",
		);
	});
});
