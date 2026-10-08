import { requireUser } from "../_auth.js";
import { can } from "../../shared/access.js";
import { readPublishedGlossary } from "./_glossary.js";

export default async function handler(request, response) {
	response.setHeader("Cache-Control", "private, no-store");
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	const send = (status, body) => {
		response.statusCode = status;
		response.end(JSON.stringify(body));
	};
	try {
		if (request.method !== "GET") return send(405, { error: "Method not allowed" });
		const actor = await requireUser(request, { permission: null });
		if (
			!can(actor.access, "binds.read") &&
			!can(actor.access, "composer.use") &&
			!can(actor.access, "ai.train") &&
			!can(actor.access, "technical")
		)
			return send(403, { error: "Нет доступа к глоссарию" });
		return send(200, { terms: await readPublishedGlossary() });
	} catch (error) {
		return send(error.status ?? 500, {
			error: error.status ? error.message : "Не удалось загрузить глоссарий",
		});
	}
}
