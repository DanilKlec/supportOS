import { getGeminiConfig, sendJson } from "./_gemini.js";

export default function handler(request, response) {
	if (request.method !== "GET") {
		sendJson(response, 405, { error: "Method not allowed" });
		return;
	}

	const { apiKey, model } = getGeminiConfig();

	sendJson(response, 200, {
		configured: Boolean(apiKey),
		model,
	});
}
