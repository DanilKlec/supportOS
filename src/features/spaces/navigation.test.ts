import { describe, expect, it } from "vitest";
import { canAccessPage, canAdmin } from "../../../shared/access.js";
import { canonicalPage, spaces } from "./navigation";

const access = (permissions: string[], status = "active") => ({
	status,
	permissions,
	roles: [],
	version: 1,
	display_name: "",
});
describe("role-aware navigation", () => {
	it("hides privileged destinations for support", () => {
		const user = access(["work", "binds.read", "bonuses.read"]);
		for (const [path, hash] of [
			["/admin", ""],
			["/settings", "integrations"],
			["/settings", "integrations-ai"],
			["/health", ""],
			["/team", ""],
			["/bonuses", "manage"],
		])
			expect(canAccessPage(user, path, hash)).toBe(false);
		expect(canAccessPage(user, "/settings", "appearance")).toBe(true);
		expect(canAccessPage(user, "/bonuses", "calculator")).toBe(true);
	});
	it("uses individual permissions for custom administration roles", () => {
		const user = access(["roles.manage"]);
		expect(canAdmin(user)).toBe(true);
		expect(canAccessPage(user, "/admin", "roles")).toBe(true);
		for (const section of ["users", "audit", "knowledge", "rules", "tests"])
			expect(canAccessPage(user, "/admin", section)).toBe(false);
		expect(canAccessPage(access(["monitor.read"]), "/team")).toBe(true);
		expect(canAccessPage(access(["knowledge.write"]), "/health")).toBe(true);
		expect(canAdmin(access(["technical"]))).toBe(true);
	});
	it.each([
		"pending",
		"disabled",
		"deleted",
	])("blocks %s accounts", (status) => {
		const user = access(
			["work", "users.manage", "technical", "monitor.read"],
			status,
		);
		for (const path of ["/admin", "/settings", "/team"])
			expect(canAccessPage(user, path)).toBe(false);
	});
	it("requires all capabilities for nested tools and editing", () => {
		expect(
			canAccessPage(access(["translator.use"]), "/", "composer-translate"),
		).toBe(false);
		expect(
			canAccessPage(
				access(["binds.read", "composer.use", "translator.use"]),
				"/",
				"composer-translate",
			),
		).toBe(true);
		expect(
			canAccessPage(access(["bonuses.write"]), "/bonuses", "calculator-manage"),
		).toBe(false);
		expect(
			canAccessPage(
				access(["bonuses.read", "bonuses.write"]),
				"/bonuses",
				"calculator-manage",
			),
		).toBe(true);
	});
	it.each([
		["/settings/users", "roles", "/admin", "roles"],
		["/ai/knowledge", "", "/qc", "knowledge"],
		["/settings/ai", "", "/settings", "integrations-ai"],
		["/settings/translator", "", "/settings", "integrations-translator"],
		["/admin", "system", "/settings", "integrations"],
		["/admin", "qc", "/qc", "proposals"],
		["/bonus-tools", "manage", "/bonuses", "calculator-manage"],
	])("redirects duplicate %s#%s", (path, hash, to, targetHash) => {
		expect(canonicalPage(path, hash)).toEqual({ to, hash: targetHash });
	});
	it("only advertises canonical pages", () => {
		for (const space of spaces)
			for (const item of space.items)
				expect(canonicalPage(item.to, "hash" in item ? item.hash : "")).toEqual(
					{ to: item.to, hash: "hash" in item ? item.hash : "" },
				);
	});
});
