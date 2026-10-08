import generate from "./generate.js";
import glossary from "./glossary.js";
import knowledge from "./knowledge.js";
import status from "./status.js";

const handlers = { generate, glossary, knowledge, status };

export default async function handler(request, response) {
	// Route by the URL path, not a caller-supplied query/body parameter.
	const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
	const endpoint = /^\/api\/ai\/(generate|glossary|knowledge|status)\/?$/
		.exec(pathname)?.[1];
	if (!endpoint) {
		response.setHeader("Cache-Control", "no-store");
		response.setHeader("Content-Type", "application/json; charset=utf-8");
		response.statusCode = 404;
		response.end(JSON.stringify({ error: "API endpoint не найден" }));
		return;
	}

	// Existing handlers own authentication, RBAC, methods and response contracts.
	return handlers[endpoint](request, response);
}
