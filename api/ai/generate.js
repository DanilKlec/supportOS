import { generateGeminiReply, sendJson } from "./_gemini.js";

export default async function handler(request, response) {
	if (request.method !== "POST") {
		sendJson(response, 405, { error: "Method not allowed" });
		return;
	}

	try {
		const result = await generateGeminiReply(request.body ?? {});
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
