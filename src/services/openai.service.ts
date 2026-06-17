import { useAIStore } from "@/store/ai.store";

interface OpenAIResponseRequest {
	instructions: string;
	input: string;
	model?: string;
}

interface OpenAIResponseBody {
	output_text?: string;
	output?: Array<{
		content?: Array<{
			text?: string;
			type?: string;
		}>;
	}>;
	error?: {
		message?: string;
		type?: string;
	};
}

export class OpenAIServiceError extends Error {
	constructor(
		message: string,
		public readonly status?: number,
	) {
		super(message);
		this.name = "OpenAIServiceError";
	}
}

class OpenAIService {
	private readonly endpoint = "https://api.openai.com/v1/responses";

	async createTextResponse({
		instructions,
		input,
		model,
	}: OpenAIResponseRequest) {
		const { apiKey, model: storedModel } = useAIStore.getState();
		const resolvedApiKey = apiKey.trim();
		const resolvedModel = model?.trim() || storedModel.trim() || "gpt-5-mini";

		if (!resolvedApiKey) {
			throw new OpenAIServiceError("OpenAI API key is not configured");
		}

		try {
			const response = await fetch(this.endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${resolvedApiKey}`,
				},
				body: JSON.stringify({
					model: resolvedModel,
					instructions,
					input,
				}),
			});

			const data = (await response
				.json()
				.catch(() => ({}))) as OpenAIResponseBody;

			if (!response.ok) {
				throw new OpenAIServiceError(
					data.error?.message || "OpenAI request failed",
					response.status,
				);
			}

			const text = this.extractText(data);

			if (!text) {
				throw new OpenAIServiceError("OpenAI returned an empty response");
			}

			return {
				text,
				model: resolvedModel,
			};
		} catch (error) {
			if (error instanceof OpenAIServiceError) {
				throw error;
			}

			throw new OpenAIServiceError(
				error instanceof Error ? error.message : "Unable to reach OpenAI",
			);
		}
	}

	private extractText(data: OpenAIResponseBody) {
		if (typeof data.output_text === "string") {
			return data.output_text;
		}

		return (
			data.output
				?.flatMap((item) => item.content ?? [])
				.map((content) => content.text ?? "")
				.join("")
				.trim() ?? ""
		);
	}
}

export const openAIService = new OpenAIService();
