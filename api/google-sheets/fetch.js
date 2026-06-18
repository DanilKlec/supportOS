const ALLOWED_GOOGLE_HOSTS = new Set([
	"docs.google.com",
	"spreadsheets.google.com",
]);

function allowCors(response) {
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
	response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendText(response, status, text) {
	allowCors(response);
	response.setHeader("Cache-Control", "no-store");
	response.setHeader("Content-Type", "text/plain; charset=utf-8");
	response.status(status).send(text);
}

function handleOptions(request, response) {
	if (request.method !== "OPTIONS") return false;

	allowCors(response);
	response.status(204).end();
	return true;
}

function readTargetUrl(request) {
	const value =
		typeof request.query?.url === "string"
			? request.query.url
			: new URL(request.url ?? "", "https://supportos.local").searchParams.get(
					"url",
				);

	if (!value) {
		throw new Error("Google Sheets URL is required");
	}

	const target = new URL(value);

	if (target.protocol !== "https:") {
		throw new Error("Only HTTPS Google Sheets URLs are supported");
	}

	if (!ALLOWED_GOOGLE_HOSTS.has(target.hostname)) {
		throw new Error("Only Google Sheets URLs are supported");
	}

	return target.toString();
}

export default async function handler(request, response) {
	if (handleOptions(request, response)) return;

	if (request.method !== "GET") {
		sendText(response, 405, "Method not allowed");
		return;
	}

	let targetUrl;

	try {
		targetUrl = readTargetUrl(request);
	} catch (error) {
		sendText(
			response,
			400,
			error instanceof Error ? error.message : "Invalid Google Sheets URL",
		);
		return;
	}

	try {
		const googleResponse = await fetch(targetUrl, {
			redirect: "follow",
			headers: {
				"User-Agent": "SupportOS Google Sheets Import",
			},
		});
		const text = await googleResponse.text();

		sendText(response, googleResponse.status, text);
	} catch (error) {
		sendText(
			response,
			502,
			error instanceof Error ? error.message : "Unable to load Google Sheet",
		);
	}
}
