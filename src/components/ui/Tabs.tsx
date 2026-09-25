import { classNames } from "./classNames";

export type TabItem = { value: string; label: string; disabled?: boolean };

export function Tabs({
	items,
	value,
	onValueChange,
	ariaLabel,
	className,
}: {
	items: readonly TabItem[];
	value: string;
	onValueChange: (value: string) => void;
	ariaLabel: string;
	className?: string;
}) {
	return (
		<div className={classNames("ui-actions", className)} role="tablist" aria-label={ariaLabel}>
			{items.map((item) => (
				<button
					type="button"
					key={item.value}
					role="tab"
					className="space-tab"
					aria-selected={item.value === value}
					disabled={item.disabled}
					onClick={() => onValueChange(item.value)}
				>
					{item.label}
				</button>
			))}
		</div>
	);
}
