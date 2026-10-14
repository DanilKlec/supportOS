import { useKnowledgeStore } from "@/store";

export function FolderDestination({
	value,
	onChange,
	excluded = [],
}: {
	value: string;
	onChange: (value: string) => void;
	excluded?: string[];
}) {
	const categories = useKnowledgeStore((s) => s.categories),
		folders = useKnowledgeStore((s) => s.folders);
	const options: Array<{ value: string; label: string; disabled?: boolean }> =
		[];
	const visit = (
		category: string,
		parent: string | undefined,
		depth: number,
		seen: Set<string>,
	) => {
		for (const folder of folders
			.filter(
				(f) =>
					f.categoryId === category && (f.parentId ?? "") === (parent ?? ""),
			)
			.sort((a, b) => a.order - b.order)) {
			if (seen.has(folder.id)) continue;
			const next = new Set(seen).add(folder.id);
			options.push({
				value: JSON.stringify([category, folder.id]),
				label: `${"　".repeat(depth)}↳ ${folder.name}`,
				disabled: excluded.includes(folder.id),
			});
			visit(category, folder.id, depth + 1, next);
		}
	};
	for (const category of [...categories].sort((a, b) => a.order - b.order)) {
		options.push({
			value: JSON.stringify([category.id, ""]),
			label: category.name,
		});
		visit(category.id, undefined, 1, new Set());
	}
	return (
		<label className="ui-field text-sm">
			Куда переместить
			<select
				aria-label="Куда переместить"
				className="ui-input mt-2 w-full border border-border bg-background"
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				{options.map((o) => (
					<option key={o.value} value={o.value} disabled={o.disabled}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}
