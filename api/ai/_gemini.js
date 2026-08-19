const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const MAX_CUSTOMER_MESSAGE_LENGTH = 8_000;
const MAX_CONTEXT_LENGTH = 8_000;

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

function cleanText(value, maxLength) {
	return String(value ?? "").trim().slice(0, maxLength);
}

function buildPrompt(body) {
	const customerMessage = cleanText(
		body.customerMessage,
		MAX_CUSTOMER_MESSAGE_LENGTH,
	);
	const context = cleanText(body.context, MAX_CONTEXT_LENGTH);
	const language = cleanText(body.language, 40) || "auto";
	const tone = cleanText(body.tone, 40) || "calm";
	const intent = cleanText(body.intent, 60) || "general";
	const glossary = Array.isArray(body.glossary)
		? body.glossary
				.slice(0, 30)
				.map((term) => {
					const source = cleanText(term?.source, 100);
					const target = cleanText(term?.target, 100);
					return source && target ? `${source} -> ${target}` : "";
				})
				.filter(Boolean)
				.join("\n")
		: "";
	const memory = Array.isArray(body.memory)
		? body.memory
				.slice(0, 3)
				.map((entry) => {
					const source = cleanText(entry?.source, 600);
					const target = cleanText(entry?.target, 1_200);
					return source && target
						? `Previous message: ${source}\nApproved reply: ${target}`
						: "";
				})
				.filter(Boolean)
				.join("\n\n")
		: "";

	if (!customerMessage) {
		throw new Error("Customer message is required");
	}

	return [
		"You write concise customer-support chat replies.",
		"Return only the ready-to-send reply. Do not add a title or explanation.",
		"Start immediately with the answer.",
		"Do not add greetings, thanks for contacting us, closing phrases, signatures, or the company name.",
		"Do not invent statuses, policies, deadlines, transaction details, promises, or actions.",
		"Use only facts explicitly provided in the internal context.",
		"If an essential fact is missing, ask one short and specific clarification question.",
		"Keep the tone calm, soft, empathetic, and natural for live chat.",
		"Do not promote gambling or encourage participation in age-restricted services.",
		`Reply language: ${language === "auto" ? "the customer's language" : language}`,
		`Tone: ${tone}`,
		`Topic: ${intent}`,
		glossary ? `Required terminology:\n${glossary}` : "",
		memory ? `Relevant approved examples:\n${memory}` : "",
		`Customer message:\n${customerMessage}`,
		`Verified internal facts:\n${context || "No verified facts were provided."}`,
	]
		.filter(Boolean)
		.join("\n\n");
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

	const prompt = buildPrompt(body);
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
