import { requireUser } from "../_auth.js";
import { config, db } from "../agent-monitor/_server.js";

async function projectRows(env) {
	const result = [];
	for (let offset = 0; ; offset += 1000) {
		const rows = await db(
			env,
			`supportos_projects?select=id,name,slug&order=name.asc,id.asc&limit=1000&offset=${offset}`,
		);
		result.push(...rows);
		if (rows.length < 1000) return result;
		if (result.length >= 200000)
			throw Object.assign(new Error("Слишком много проектов."), { status: 413 });
	}
}

export default async function handler(request, response) {
	response.setHeader("Cache-Control", "private, no-store");
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	try {
		if (request.method !== "GET") {
			response.statusCode = 405;
			response.end(JSON.stringify({ error: "Method not allowed" }));
			return;
		}
		await requireUser(request, { permission: null });
		response.statusCode = 200;
		response.end(JSON.stringify({ projects: await projectRows(config()) }));
	} catch (error) {
		response.statusCode = error.status ?? 500;
		response.end(
			JSON.stringify({
				error: error.status ? error.message : "Не удалось загрузить проекты",
			}),
		);
	}
}
