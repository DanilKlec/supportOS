import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { BindList } from "#/components/binds/BindList";
import { useKnowledgeStore } from "#/store";

export const Route = createFileRoute("/recent")({
	component: RecentPage,
});

function RecentPage() {
	const binds = useKnowledgeStore((state) => state.binds);
	const recent = useKnowledgeStore((state) => state.recent);
	const recentBinds = recent
		.map((id) => binds.find((bind) => bind.id === id))
		.filter((bind): bind is (typeof binds)[number] => Boolean(bind));

	return (
		<div className="flex h-full">
			<main className="flex-1 overflow-auto">
				<div className="p-6 max-w-4xl mx-auto">
					<div className="flex items-center gap-3 mb-6">
						<Clock size={28} className="text-accent" />
						<div>
							<h1 className="text-3xl font-bold text-foreground">Recent</h1>
							<p className="text-sm text-muted mt-1">
								Binds you recently copied
							</p>
						</div>
					</div>
					<BindList
						binds={recentBinds}
						emptyMessage="No recently copied binds"
					/>
				</div>
			</main>
		</div>
	);
}
