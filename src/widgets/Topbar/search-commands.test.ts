import { describe, expect, it } from "vitest";
import { searchCommands } from "./search-commands";

const access = (permissions: string[], status = "active") => ({
	status,
	permissions,
});

describe("global search commands", () => {
	it("offers the six commands using existing destinations and actions", () => {
		const commands = searchCommands(
			access([
				"work",
				"users.manage",
				"projects.read",
				"binds.read",
				"composer.use",
				"knowledge.write",
			]),
		);
		expect(commands.map((command) => command.label)).toEqual([
			"Открыть пользователя",
			"Открыть проект",
			"Открыть настройки",
			"Создать бинд",
			"Открыть Помощник",
			"Открыть QC → Материалы",
		]);
		expect(commands.map((command) => command.action)).toEqual([
			{ type: "navigate", to: "/admin", hash: "users" },
			{ type: "navigate", to: "/project-emails", hash: "" },
			{ type: "navigate", to: "/settings", hash: "" },
			{ type: "create-bind" },
			{ type: "navigate", to: "/", hash: "composer-answer" },
			{ type: "navigate", to: "/qc", hash: "materials" },
		]);
	});

	it("does not expose administration or QC to ordinary Support", () => {
		expect(
			searchCommands(access(["work", "binds.read"])).map(
				(command) => command.id,
			),
		).toEqual(["settings", "create-bind"]);
	});

	it.each([
		"disabled",
		"pending",
	])("hides all commands for %s accounts", (status) => {
		expect(
			searchCommands(
				access(
					[
						"work",
						"users.manage",
						"projects.read",
						"binds.read",
						"composer.use",
						"knowledge.write",
					],
					status,
				),
			),
		).toEqual([]);
	});

	it("hides commands without a session", () => {
		expect(searchCommands(undefined)).toEqual([]);
	});

	it("requires both Workspace and composer permissions for the Assistant", () => {
		for (const permissions of [["binds.read"], ["composer.use"], ["tools"]]) {
			expect(
				searchCommands(access(permissions)).some(
					(command) => command.id === "assistant",
				),
			).toBe(false);
		}
		expect(
			searchCommands(access(["binds.read", "composer.use"])).some(
				(command) => command.id === "assistant",
			),
		).toBe(true);
	});

	it("uses the existing bonus project picker when email access is unavailable", () => {
		expect(searchCommands(access(["bonuses.read"]))[0]?.action).toEqual({
			type: "navigate",
			to: "/bonuses",
			hash: "",
		});
		expect(
			searchCommands(access(["work"])).some(
				(command) => command.id === "project",
			),
		).toBe(false);
	});

	it("uses the shared QC Materials permission gate including guidance-only access", () => {
		expect(
			searchCommands(access(["ai.train"])).map((command) => command.id),
		).toEqual(["materials"]);
		expect(
			searchCommands(access(["ai.rules"])).map((command) => command.id),
		).toEqual(["materials"]);
		expect(searchCommands(access(["ai.playground"]))).toEqual([]);
	});

	it("filters commands by normalized labels and aliases without bypassing permissions", () => {
		const support = access(["work", "binds.read", "composer.use"]);
		expect(
			searchCommands(support, " НОВЫЙ   БИНД ").map((command) => command.id),
		).toEqual(["create-bind"]);
		expect(
			searchCommands(support, "AI ответ").map((command) => command.id),
		).toEqual(["assistant"]);
		expect(searchCommands(support, "QC → Материалы")).toEqual([]);
		expect(
			searchCommands(access(["knowledge.write"]), "QC → Материалы").map(
				(command) => command.id,
			),
		).toEqual(["materials"]);
		expect(searchCommands(support, "несуществующая команда")).toEqual([]);
	});
});
