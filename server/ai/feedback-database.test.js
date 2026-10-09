import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("keeps feedback reviews server-only with RLS and a verified actor FK", async () => {
	const pg = new PGlite();
	const actor = "11111111-1111-4111-8111-111111111111";
	try {
		await pg.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); grant usage on schema public to service_role;");
		await pg.query("insert into auth.users values ($1)", [actor]);
		await pg.exec(await readFile(new URL("../../supabase/migrations/20261006214000_ai_feedback_reviews.sql", import.meta.url), "utf8"));
		expect((await pg.query("select relrowsecurity from pg_class where oid='public.supportos_ai_feedback_reviews'::regclass")).rows[0].relrowsecurity).toBe(true);
		await pg.exec("set role service_role");
		await pg.query("insert into public.supportos_ai_feedback_reviews(id,comment,answer_ref,actor_id) values ('synthetic-review','Не тот язык','synthetic-answer-hash',$1)", [actor]);
		expect((await pg.query("select count(*)::int as count from public.supportos_ai_feedback_reviews")).rows[0].count).toBe(1);
		await expect(pg.query("insert into public.supportos_ai_feedback_reviews(id,comment,answer_ref,actor_id) values ('unknown','Synthetic','ref','22222222-2222-4222-8222-222222222222')")).rejects.toThrow("foreign key");
		await pg.exec("reset role");
		for (const role of ["anon", "authenticated"]) {
			await pg.exec(`set role ${role}`);
			await expect(pg.query("select * from public.supportos_ai_feedback_reviews")).rejects.toThrow("permission denied");
			await expect(pg.query("insert into public.supportos_ai_feedback_reviews(id,comment,answer_ref,actor_id) values ('forged','Synthetic','ref',$1)", [actor])).rejects.toThrow("permission denied");
			await pg.exec("reset role");
		}
	} finally {
		await pg.close();
	}
}, 30000);
