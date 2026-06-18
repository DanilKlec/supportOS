const DEFAULT_ENDPOINTS = ["https://translate.argosopentech.com"];

function normalizeEndpoint(endpoint) {
	return String(endpoint ?? "").trim().replace(/\/+$/, "");
}

function parseEndpointList(value) {
	return String(value ?? "")
		.split(",")
		.map(normalizeEndpoint)
		.filter(Boolean);
}

function getLibreTranslateEndpoints() {
	const endpoints = [
		normalizeEndpoint(process.env.LIBRETRANSLATE_ENDPOINT),
		normalizeEndpoint(process.env.LIBRETRANSLATE_URL),
		...parseEndpointList(process.env.LIBRETRANSLATE_ENDPOINTS),
		...parseEndpointList(process.env.LIBRETRANSLATE_FALLBACK_ENDPOINTS),
		...DEFAULT_ENDPOINTS,
	].filter(Boolean);

	return Array.from(new Set(endpoints));
}

function getPublicEndpointHint() {
	return "Configure LIBRETRANSLATE_ENDPOINT in Vercel with a reachable LibreTranslate server.";
}

async function readPayload(response) {
	const text = await response.text();

	if (!text) return {};

	try {
		return JSON.parse(text);
	} catch {
		return { message: text };
	}
}

function getErrorMessage(payload, fallback) {
	if (!payload || typeof payload !== "object") return fallback;

	const message = payload.message ?? payload.error ?? payload.error_description;

	return typeof message === "string" && message.trim() ? message : fallback;
}

export async function readRequestBody(request) {
	if (!request.body) return {};

	if (typeof request.body === "object") return request.body;

	try {
		return JSON.parse(request.body);
	} catch {
		return {};
	}
}

export function allowCors(response) {
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
	response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function sendJson(response, status, payload) {
	allowCors(response);
	response.status(status).json(payload);
}

export function sendError(response, status, message) {
	sendJson(response, status, { error: message });
}

export function handleOptions(request, response) {
	if (request.method !== "OPTIONS") return false;

	allowCors(response);
	response.status(204).end();
	return true;
}

export async function requestLibreTranslate(path, options = {}) {
	const endpoints = getLibreTranslateEndpoints();
	let lastStatus = 502;
	let lastMessage = "LibreTranslate request failed";
	const attempts = [];

	for (const endpoint of endpoints) {
		try {
			const response = await fetch(`${endpoint}${path}`, {
				method: options.method ?? "GET",
				headers: options.headers,
				body: options.body,
			});
			const payload = await readPayload(response);

			if (response.ok) {
				return {
					endpoint,
					payload,
					status: response.status,
				};
			}

			lastStatus = response.status;
			lastMessage = getErrorMessage(payload, lastMessage);
			attempts.push(`${endpoint}: ${response.status} ${lastMessage}`);
		} catch (error) {
			lastMessage =
				error instanceof Error ? error.message : "Unable to reach translator";
			attempts.push(`${endpoint}: ${lastMessage}`);
		}
	}

	const details = attempts.length ? ` Tried: ${attempts.join("; ")}` : "";
	const error = new Error(
		`${getPublicEndpointHint()} Last error: ${lastMessage}.${details}`,
	);

	error.status = lastStatus;
	throw error;
}

export function createLibreTranslateForm(body) {
	const form = new URLSearchParams();
	const apiKey =
		String(process.env.LIBRETRANSLATE_API_KEY ?? "").trim() ||
		String(body.apiKey ?? "").trim();

	form.set("q", String(body.text ?? body.q ?? ""));
	form.set("source", String(body.source ?? body.fromLanguage ?? ""));
	form.set("target", String(body.target ?? body.toLanguage ?? ""));
	form.set("format", String(body.format ?? "text"));

	if (apiKey) {
		form.set("api_key", apiKey);
	}

	return form;
}
