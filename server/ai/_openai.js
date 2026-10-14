import OpenAI from "openai";

import { buildSupportPrompt } from "./_prompt.js";

const DEFAULT_MODEL = "gpt-5.6-luna";

export function getOpenAIConfig() {
	return {
		apiKey: String(process.env.OPENAI_API_KEY ?? "").trim(),
		model: String(process.env.OPENAI_MODEL ?? DEFAULT_MODEL).trim(),
	};
}

export async function generateOpenAIReply(body) {
	const { apiKey, model } = getOpenAIConfig();

	if (!apiKey) {
		const error = new Error(
			"OpenAI is not configured. Add OPENAI_API_KEY in Vercel.",
		);
		error.status = 503;
		throw error;
	}

	const client = new OpenAI({ apiKey });
	let response;

	try {
		response = await client.responses.create({
			model,
			input: buildSupportPrompt(body),
			max_output_tokens: body.responseStyle === "expanded-bind" ? 1_200 : 700,
			store: false,
			text: { verbosity: "low" },
		});
	} catch (cause) {
		const error = new Error(
			cause instanceof Error ? cause.message : "OpenAI request failed",
		);
		error.status = cause?.status === 429 ? 429 : 502;
		throw error;
	}
	const text = response.output_text?.trim() ?? "";

	if (!text) {
		const error = new Error("OpenAI returned an empty answer");
		error.status = 502;
		throw error;
	}

	return { text, model, provider: "openai" };
}
