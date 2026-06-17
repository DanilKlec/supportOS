import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ai/knowledge")({
	component: AIKnowledgePage,
});

function AIKnowledgePage() {
	return (
		<div className="flex h-full items-center justify-center bg-background p-6">
			<div className="max-w-md text-center">
				<h1 className="text-2xl font-bold">AI Knowledge</h1>
				<p className="mt-2 text-sm text-muted">
					AI knowledge search is prepared and will be connected to the knowledge
					base later.
				</p>
			</div>
		</div>
	);
}
