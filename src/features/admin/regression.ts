export type RegressionCase = {
	id: string;
	title: string;
	content: string;
	project: string;
	language: string;
	intent: string;
	required: string[];
	forbidden: string[];
	reference: string;
};
export type GenerationResult = {
	text: string;
	metadata?: Record<string, unknown>;
	provider?: string;
	model?: string;
};
export type RegressionResult = {
	id: string;
	name: string;
	reference: string;
	production?: GenerationResult & {
		evaluation: ReturnType<typeof evaluateAIAnswer>;
	};
	draft?: GenerationResult & {
		evaluation: ReturnType<typeof evaluateAIAnswer>;
	};
	error?: string;
};

import { evaluateAIAnswer } from "../../../shared/ai-evaluation.js";
/** Evaluates independent requests; the expected answer never enters the model prompt. */
export async function runRegression(
	cases: RegressionCase[],
	generate: (
		test: RegressionCase,
		preview: boolean,
	) => Promise<GenerationResult>,
	compare: boolean,
	onResult: (result: RegressionResult) => void,
	signal?: AbortSignal,
) {
	for (const test of cases) {
		if (signal?.aborted) break;
		const result: RegressionResult = {
			id: test.id,
			name: test.title,
			reference: test.reference,
		};
		if (
			!test.content.trim() ||
			![...test.required, ...test.forbidden].some((term) => term.trim())
		) {
			result.error =
				"Добавьте тестовый запрос и хотя бы одно обязательное или запрещённое понятие.";
			onResult(result);
			continue;
		}
		try {
			const production = await generate(test, false);
			result.production = {
				...production,
				evaluation: evaluateAIAnswer(production.text, test),
			};
			if (compare && !signal?.aborted) {
				const draft = await generate(test, true);
				result.draft = {
					...draft,
					evaluation: evaluateAIAnswer(draft.text, test),
				};
			}
		} catch (error) {
			result.error =
				error instanceof Error ? error.message : "Ошибка генерации";
		}
		if (!signal?.aborted) onResult(result);
	}
}
