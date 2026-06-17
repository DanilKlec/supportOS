import {
	createLibreTranslateForm,
	handleOptions,
	readRequestBody,
	requestLibreTranslate,
	sendError,
	sendJson,
} from "./_shared.js";

export default async function handler(request, response) {
	if (handleOptions(request, response)) return;

	if (request.method !== "POST") {
		sendError(response, 405, "Method not allowed");
		return;
	}

	const body = await readRequestBody(request);
	const text = String(body.text ?? body.q ?? "");
	const source = String(body.source ?? body.fromLanguage ?? "").trim();
	const target = String(body.target ?? body.toLanguage ?? "").trim();

	if (!text.trim()) {
		sendError(response, 400, "Text is required");
		return;
	}

	if (!source) {
		sendError(response, 400, "Source language is required");
		return;
	}

	if (!target || target === "auto") {
		sendError(response, 400, "Target language is required");
		return;
	}

	try {
		const result = await requestLibreTranslate("/translate", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: createLibreTranslateForm({
				...body,
				text,
				source,
				target,
			}),
		});

		sendJson(response, 200, result.payload);
	} catch (error) {
		sendError(
			response,
			typeof error.status === "number" ? error.status : 502,
			error instanceof Error ? error.message : "Translation failed",
		);
	}
}
