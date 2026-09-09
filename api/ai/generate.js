import { authorize } from '../_auth.js';
import { sendJson } from "./_gemini.js";
import { generateAIReply } from "./_provider.js";

export default async function handler(request, response) {
 if (!await authorize(request, response)) return;
	if (request.method !== "POST") {
		sendJson(response, 405, { error: "Method not allowed" });
		return;
	}

	try {
		const result = await generateAIReply(request.body ?? {});
		sendJson(response, 200, result);
	} catch (error) {
		sendJson(
			response,
			typeof error?.status === "number" ? error.status : 500,
			{
				error:
					error instanceof Error ? error.message : "Unable to generate answer",
			},
		);
	}
}
