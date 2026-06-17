import { createFileRoute } from "@tanstack/react-router";

import { useAIStore } from "@/store/ai.store";

export const Route = createFileRoute("/settings/ai")({
	component: AISettingsPage,
});

function AISettingsPage() {
	const apiKey = useAIStore((state) => state.apiKey);
	const model = useAIStore((state) => state.model);
	const setApiKey = useAIStore((state) => state.setApiKey);
	const setModel = useAIStore((state) => state.setModel);

	return (
		<div className="h-full overflow-auto bg-background">
			<div className="mx-auto max-w-3xl p-6">
				<div className="mb-6">
					<h1 className="text-2xl font-bold">AI Settings</h1>
					<p className="mt-1 text-sm text-muted">
						Configure the OpenAI API key and default model for AI tools.
					</p>
				</div>

				<div className="space-y-5 rounded-lg border border-border bg-surface p-5">
					<label className="block space-y-2">
						<span className="text-sm font-medium">OpenAI API Key</span>
						<input
							type="password"
							value={apiKey}
							onChange={(event) => setApiKey(event.target.value)}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							placeholder="sk-..."
						/>
					</label>

					<label className="block space-y-2">
						<span className="text-sm font-medium">Model</span>
						<input
							value={model}
							onChange={(event) => setModel(event.target.value)}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							placeholder="gpt-5-mini"
						/>
					</label>

					<div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
						Settings are saved automatically in localStorage.
					</div>
				</div>
			</div>
		</div>
	);
}
