import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ai/assistant")({
	component: AIAssistantPage,
});

function AIAssistantPage() {
	return (
		<div className="flex h-full items-center justify-center bg-background p-6">
			<div className="max-w-md text-center">
				<h1 className="text-2xl font-bold">AI Assistant</h1>
				<p className="mt-2 text-sm text-muted">
					The assistant workspace is prepared and will be connected in a future
					iteration.
				</p>
			</div>
		</div>
	);
}
