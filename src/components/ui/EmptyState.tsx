import type { ReactNode } from "react";
import { classNames } from "./classNames";

export interface EmptyStateProps {
	title?: string;
	description?: ReactNode;
	action?: ReactNode;
	className?: string;
}

export function EmptyState({
	title = "Здесь пока нет данных.",
	description,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={classNames(
				"min-w-0 break-words rounded-xl border border-dashed border-border bg-background p-4 text-sm",
				className,
			)}
		>
			<p className="font-medium text-foreground">{title}</p>
			{description && <p className="mt-2 text-muted">{description}</p>}
			{action && <div className="ui-actions mt-3">{action}</div>}
		</div>
	);
}
