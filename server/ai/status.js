import { authorize } from '../_auth.js';
import { sendJson } from "./_gemini.js";
import { getAIStatus } from "./_provider.js";

export default async function handler(request, response) {
 if (!await authorize(request, response)) return;
	if (request.method !== "GET") {
		sendJson(response, 405, { error: "Method not allowed" });
		return;
	}

	sendJson(response, 200, getAIStatus());
}
