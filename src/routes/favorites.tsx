import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { BindList } from "#/components/binds/BindList";
import { useKnowledgeStore } from "#/store";

export const Route = createFileRoute("/favorites")({
	component: FavoritesPage,
});

function FavoritesPage() {
	const binds = useKnowledgeStore((state) => state.binds);
	const favorites = useKnowledgeStore((state) => state.favorites);
	const favoriteBinds = favorites
		.map((id) => binds.find((bind) => bind.id === id))
		.filter((bind): bind is (typeof binds)[number] => Boolean(bind));

	return (
		<div className="flex h-full">
			<main className="flex-1 overflow-auto">
				<div className="p-6 max-w-4xl mx-auto">
					<div className="flex items-center gap-3 mb-6">
						<Star size={28} className="text-yellow-400" fill="currentColor" />
						<div>
							<h1 className="text-3xl font-bold text-foreground">Favorites</h1>
							<p className="text-sm text-muted mt-1">
								Quick access to your favorite binds
							</p>
						</div>
					</div>
					<BindList binds={favoriteBinds} emptyMessage="No favorites yet" />
				</div>
			</main>
		</div>
	);
}
