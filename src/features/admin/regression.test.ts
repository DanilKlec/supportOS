import { expect, it, vi } from "vitest";
import {
	type RegressionCase,
	type RegressionResult,
	runRegression,
} from "./regression";

const sample: RegressionCase = {
	id: "a",
	title: "Withdrawal",
	content: "Where is my withdrawal?",
	project: "p",
	language: "en",
	intent: "withdrawal",
	required: ["review"],
	forbidden: ["guaranteed"],
	reference: "Expected answer kept out of generation",
};
it("compares independent production and draft outputs and continues after a failure", async () => {
	const generate = vi.fn(async (test: RegressionCase, preview: boolean) => {
		if (test.id === "broken") throw new Error("Provider down");
		return { text: preview ? "Under review" : "Guaranteed tomorrow" };
	});
	const results: RegressionResult[] = [];
	await runRegression(
		[{ ...sample, id: "broken" }, sample],
		generate,
		true,
		(result) => results.push(result),
	);
	expect(results[0].error).toBe("Provider down");
	expect(results[1].production?.evaluation.passed).toBe(false);
	expect(results[1].draft?.evaluation.passed).toBe(true);
	expect(generate.mock.calls.map((call) => call[1])).toEqual([
		false,
		false,
		true,
	]);
});
it("skips invalid tests without charging for generation", async () => {
	const generate = vi.fn();
	const results: RegressionResult[] = [];
	await runRegression(
		[{ ...sample, required: [], forbidden: [] }],
		generate,
		false,
		(result) => results.push(result),
	);
	expect(generate).not.toHaveBeenCalled();
	expect(results[0].error).toBeTruthy();
});
it("cancellation stops subsequent requests", async () => {
	const controller = new AbortController();
	const generate = vi.fn(async () => {
		controller.abort();
		return { text: "review" };
	});
	const result = vi.fn();
	await runRegression(
		[sample, { ...sample, id: "b" }],
		generate,
		true,
		result,
		controller.signal,
	);
	expect(generate).toHaveBeenCalledTimes(1);
	expect(result).not.toHaveBeenCalled();
});
