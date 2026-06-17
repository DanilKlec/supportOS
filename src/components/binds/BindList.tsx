import { BindCard } from "#/components/binds/BindCard";
import type { Bind } from "#/entities/bind";

interface BindListProps {
	binds: Bind[];
	emptyMessage?: string;
}

export function BindList({
	binds,
	emptyMessage = "Nothing found",
}: BindListProps) {
	if (binds.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center">
				<p className="text-sm text-muted">{emptyMessage}</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{binds.map((bind) => (
				<BindCard key={bind.id} bind={bind} />
			))}
		</div>
	);
}
