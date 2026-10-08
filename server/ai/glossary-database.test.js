import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("backfills published terms and follows QC draft, publish and archive atomically", async () => {
	const pg = new PGlite();
	const admin = "11111111-1111-4111-8111-111111111111";
	try {
		await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,is_anonymous boolean default false); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
		await pg.query(
			"insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)",
			[admin, "admin@example.test", JSON.stringify({ role: "admin" })],
		);
		await pg.exec(await readFile(new URL("../../supabase/schema.sql", import.meta.url), "utf8"));
		await pg.exec(await readFile(new URL("../../supabase/migrations/20260913013915_admin_ai_runtime.sql", import.meta.url), "utf8"));
		const published = { kind: "glossary", title: "KYC", content: "Проверка", language: "ru", enabled: true };
		const entry = { id: "term-1", kind: "glossary", status: "published", ...published, published };
		await pg.query("update supportos_ai_guidance set document=$1 where id='main'", [JSON.stringify({ entries: [entry], feedback: [] })]);
		await pg.exec(await readFile(new URL("../../supabase/migrations/20261006132526_normalized_team_glossary.sql", import.meta.url), "utf8"));
		const terms = () => pg.query("select id,source,target,active from supportos_glossary_terms order by id");
		expect((await terms()).rows).toEqual([{ id: "term-1", source: "KYC", target: "Проверка", active: true }]);
		const save = (expected, operation, entries) => pg.query("select supportos_save_ai_runtime($1,$2,$3,$4)", [admin, expected, operation, JSON.stringify({ entries, feedback: [] })]);
		await save(1, "save", [{ ...entry, status: "draft", content: "Непроверенный текст" }]);
		expect((await terms()).rows[0].target).toBe("Проверка");
		await save(2, "publish", [{ ...entry, published: { ...published, content: "Документы" }, content: "Документы" }]);
		expect((await terms()).rows[0].target).toBe("Документы");
		await save(3, "archive", [{ ...entry, status: "archived", published: null }]);
		expect((await terms()).rows[0].active).toBe(false);
		await pg.exec("set role authenticated");
		await expect(terms()).rejects.toThrow("permission denied");
	} finally {
		await pg.close();
	}
}, 30000);
