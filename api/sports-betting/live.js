import { loadSportsBettingLive } from "./_live.js";

function allowCors(response) {
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
	response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getSuccessCacheControl(data) {
	const ttl =
		typeof data?.cacheTtlSeconds === "number" ? data.cacheTtlSeconds : 7200;
	const staleTtl = Math.min(600, Math.max(60, Math.floor(ttl / 6)));

	return `public, s-maxage=${ttl}, stale-while-revalidate=${staleTtl}`;
}

function sendJson(response, status, body, cacheControl = "no-store") {
	allowCors(response);
	response.setHeader("Cache-Control", cacheControl);
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	response.status(status).json(body);
}

function handleOptions(request, response) {
	if (request.method !== "OPTIONS") return false;

	allowCors(response);
	response.status(204).end();
	return true;
}

export default async function handler(request, response) {
	if (handleOptions(request, response)) return;

	if (request.method !== "GET") {
		sendJson(response, 405, { error: "Method not allowed" });
		return;
	}

	try {
		const data = await loadSportsBettingLive({
			query: request.query,
			env: process.env,
		});

		sendJson(response, 200, data, getSuccessCacheControl(data));
	} catch (error) {
		sendJson(response, error?.status ?? 502, {
			error:
				error instanceof Error
					? error.message
					: "Unable to load sports betting data",
			details: error?.details,
		});
	}
}
