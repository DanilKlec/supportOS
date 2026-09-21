import { expect, it } from "vitest";
import { canonicalPage } from "@/features/spaces/navigation";
import { canAccessPage } from "../../../shared/access.js";
import { adminSections, qcSections } from "./sections";

const access = (permissions: string[]) => ({ status: "active", permissions });
it("keeps both workspaces closed to ordinary support including direct hashes", () => {
	const user = access([
		"work",
		"binds.read",
		"projects.read",
		"bonuses.read",
		"composer.use",
	]);
	for (const [path, sections] of [
		["/admin", adminSections],
		["/qc", qcSections],
	] as const) {
		expect(canAccessPage(user, path)).toBe(false);
		for (const section of sections)
			expect(
				canAccessPage(user, path, section.id),
				`${path}#${section.id}`,
			).toBe(false);
	}
});
it("does not infer account management or AI editing from technical or QC access", () => {
	expect(canAccessPage(access(["technical"]), "/admin", "models")).toBe(true);
	expect(canAccessPage(access(["technical"]), "/admin", "users")).toBe(false);
	expect(canAccessPage(access(["knowledge.write"]), "/qc", "inbox")).toBe(true);
	expect(canAccessPage(access(["knowledge.write"]), "/qc", "glossary")).toBe(
		false,
	);
	expect(canAccessPage(access(["ai.train"]), "/qc", "glossary")).toBe(true);
	expect(canAccessPage(access(["technical"]), "/qc", "unknown")).toBe(false);
});
it("preserves old AI and review destinations without duplicating their editors", () => {
	expect(canonicalPage("/admin", "projects")).toEqual({
		to: "/qc",
		hash: "instructions",
	});
	expect(canonicalPage("/shared-binds", "proposals")).toEqual({
		to: "/qc",
		hash: "proposals",
	});
	expect(canonicalPage("/content")).toEqual({ to: "/qc", hash: "overview" });
	expect(canonicalPage("/health")).toEqual({ to: "/health", hash: "" });
});
