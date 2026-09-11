import { changedText, type BindContent } from "./bind-diff";
function TextChange({
	before = "",
	after = "",
	label,
}: {
	before?: string;
	after?: string;
	label: string;
}) {
	if (before === after) return null;
	const diff = changedText(before, after);
	return (
		<div className="mt-3">
			<h4 className="mb-2 text-xs font-medium">{label}</h4>
			<div className="grid gap-2 sm:grid-cols-2">
				<div className="min-w-0 rounded-lg bg-background p-3">
					<span className="text-[10px] text-muted">Было · − удалено</span>
					<p className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
						{diff.prefix}
						<del className="bg-red-400/15 text-red-300 no-underline">
							{diff.removed}
						</del>
						{diff.suffix}
						{!before && "—"}
					</p>
				</div>
				<div className="min-w-0 rounded-lg bg-background p-3">
					<span className="text-[10px] text-muted">Будет · + добавлено</span>
					<p className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
						{diff.prefix}
						<ins className="bg-emerald-400/15 text-emerald-300 no-underline">
							{diff.added}
						</ins>
						{diff.suffix}
						{!after && "—"}
					</p>
				</div>
			</div>
		</div>
	);
}
export function BindDiff({
	before,
	after,
}: {
	before?: BindContent;
	after: BindContent;
}) {
	const languages = [
		...new Set([
			...(before?.translations ?? []).map((t) => t.language),
			...after.translations.map((t) => t.language),
		]),
	];
	const removed = (before?.tags ?? []).filter((t) => !after.tags.includes(t)),
		added = after.tags.filter((t) => !before?.tags.includes(t));
	return (
		<div className="space-y-3">
			<TextChange label="Slug" before={before?.slug} after={after.slug} />
			{languages.map((language) => {
				const old = before?.translations.find((t) => t.language === language),
					next = after.translations.find((t) => t.language === language);
				if (old?.title === next?.title && old?.content === next?.content)
					return null;
				return (
					<section
						key={language}
						className="rounded-xl border border-border p-3"
					>
						<h3 className="text-xs font-semibold uppercase">
							{language} ·{" "}
							{!old
								? "Добавлен перевод"
								: !next
									? "Удалён перевод"
									: "Изменён перевод"}
						</h3>
						<TextChange
							label="Название"
							before={old?.title}
							after={next?.title}
						/>
						<TextChange
							label="Текст"
							before={old?.content}
							after={next?.content}
						/>
					</section>
				);
			})}
			{(removed.length > 0 || added.length > 0) && (
				<div className="rounded-xl border border-border p-3 text-xs">
					<h3 className="mb-2 font-semibold">Теги</h3>
					{removed.map((t) => (
						<span key={"-" + t} className="mr-2 text-red-300">
							− {t}
						</span>
					))}
					{added.map((t) => (
						<span key={"+" + t} className="mr-2 text-emerald-300">
							+ {t}
						</span>
					))}
				</div>
			)}
		</div>
	);
}
