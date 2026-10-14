import { Button } from "./Button";
import { classNames } from "./classNames";

export interface ErrorStateProps {
	title?: string;
	description?: string;
	onRetry?: () => void;
	retrying?: boolean;
	className?: string;
}

export function ErrorState({
	title = "Не удалось загрузить данные.",
	description = "Попробуйте ещё раз.",
	onRetry,
	retrying = false,
	className,
}: ErrorStateProps) {
	return (
		<div
			role="alert"
			className={classNames(
				"min-w-0 break-words rounded-xl border border-border bg-background p-4 text-sm",
				className,
			)}
		>
			<p className="font-medium text-foreground">{title}</p>
			{description && <p className="mt-2 text-muted">{description}</p>}
			{onRetry && (
				<div className="ui-actions mt-3">
					<Button variant="secondary" onClick={onRetry} loading={retrying}>
						Повторить
					</Button>
				</div>
			)}
		</div>
	);
}
