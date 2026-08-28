import { sendJson } from "./_gemini.js";
import { getAIStatus } from "./_provider.js";

export default function handler(request, response) {
	if (request.method !== "GET") {
		sendJson(response, 405, { error: "Method not allowed" });
		return;
	}

	sendJson(response, 200, getAIStatus());
}
