import { buildSupportPrompt } from "./_prompt.js";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";

export function sendJson(response, status, payload) {
	response.setHeader("Cache-Control", "no-store");
	response.status(status).json(payload);
}

export function getGeminiConfig() {
	return {
		apiKey: String(process.env.GEMINI_API_KEY ?? "").trim(),
		model: String(process.env.GEMINI_MODEL ?? DEFAULT_MODEL).trim(),
	};
}

function extractText(payload) {
	return (
		payload?.candidates?.[0]?.content?.parts
			?.map((part) => (typeof part?.text === "string" ? part.text : ""))
			.join("")
			.trim() ?? ""
	);
}

export async function generateGeminiReply(body) {
	const { apiKey, model } = getGeminiConfig();

	if (!apiKey) {
		const error = new Error(
			"Gemini is not configured. Add GEMINI_API_KEY in Vercel.",
		);
		error.status = 503;
		throw error;
	}

	const prompt = buildSupportPrompt(body);
	const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
		model,
	)}:generateContent`;
	const upstream = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-goog-api-key": apiKey,
		},
		body: JSON.stringify({
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			generationConfig: {
				temperature: 0.25,
				maxOutputTokens: 700,
			},
		}),
	});
	const payload = await upstream.json().catch(() => ({}));

	if (!upstream.ok) {
		const error = new Error(
			payload?.error?.message || `Gemini returned HTTP ${upstream.status}`,
		);
		error.status = upstream.status === 429 ? 429 : 502;
		throw error;
	}

	const text = extractText(payload);

	if (!text) {
		const error = new Error("Gemini returned an empty answer");
		error.status = 502;
		throw error;
	}

	return { text, model };
}
