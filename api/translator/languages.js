import {
	handleOptions,
	requestLibreTranslate,
	sendError,
	sendJson,
} from "./_shared.js";

export default async function handler(request, response) {
	if (handleOptions(request, response)) return;

	if (request.method !== "GET") {
		sendError(response, 405, "Method not allowed");
		return;
	}

	try {
		const result = await requestLibreTranslate("/languages");

		sendJson(response, 200, result.payload);
	} catch (error) {
		sendError(
			response,
			typeof error.status === "number" ? error.status : 502,
			error instanceof Error ? error.message : "Unable to load languages",
		);
	}
}
