import { Link, useNavigate } from "@tanstack/react-router";

export type SectionItem = { label: string; to: string; hash?: string };
const key = (item: SectionItem) => `${item.to}#${item.hash ?? ""}`;
/** One navigation pattern for pages and administration, including narrow screens. */
export function SectionNavigation({
	label,
	items,
	active,
}: {
	label: string;
	items: SectionItem[];
	active?: SectionItem;
}) {
	const navigate = useNavigate();
	const primary = items.slice(0, 4);
	const secondary = items.slice(4);
	const selected = active ? key(active) : "";
	const go = (value: string) => {
		const item = items.find((entry) => key(entry) === value);
		if (item) void navigate({ to: item.to, hash: item.hash ?? "" });
	};
	if (!items.length) return null;
	return (
		<nav aria-label={label} className="section-navigation">
			<div className="section-navigation-desktop">
				{primary.map((item) => (
					<Link
						key={key(item)}
						to={item.to}
						hash={item.hash ?? ""}
						className="space-tab"
						aria-current={key(item) === selected ? "page" : undefined}
					>
						{item.label}
					</Link>
				))}
				{secondary.length > 0 && (
					<select
						aria-label={`Ещё: ${label}`}
						className="ui-input section-select"
						value={
							secondary.some((item) => key(item) === selected) ? selected : ""
						}
						onChange={(event) => go(event.target.value)}
					>
						<option value="" disabled>
							Ещё…
						</option>
						{secondary.map((item) => (
							<option key={key(item)} value={key(item)}>
								{item.label}
							</option>
						))}
					</select>
				)}
			</div>
			<select
				className="ui-input section-select section-navigation-mobile"
				aria-label={`Страница: ${label}`}
				value={selected}
				onChange={(event) => go(event.target.value)}
			>
				{!active && (
					<option value="" disabled>
						Выберите страницу
					</option>
				)}
				{items.map((item) => (
					<option key={key(item)} value={key(item)}>
						{item.label}
					</option>
				))}
			</select>
		</nav>
	);
}
