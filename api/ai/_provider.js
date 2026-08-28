import { generateGeminiReply, getGeminiConfig } from "./_gemini.js";
import { generateOpenAIReply, getOpenAIConfig } from "./_openai.js";

function getRequestedProvider() {
	const configured = String(process.env.AI_PROVIDER ?? "")
		.trim()
		.toLowerCase();

	if (configured === "gemini" || configured === "openai") return configured;
	if (getOpenAIConfig().apiKey) return "openai";

	return "gemini";
}

export function getAIStatus() {
	const provider = getRequestedProvider();
	const config =
		provider === "openai" ? getOpenAIConfig() : getGeminiConfig();

	return {
		configured: Boolean(config.apiKey),
		model: config.model,
		provider,
	};
}

export async function generateAIReply(body) {
	const provider = getRequestedProvider();

	if (provider === "openai") return generateOpenAIReply(body);

	const result = await generateGeminiReply(body);
	return { ...result, provider: "gemini" };
}
