import { classNames } from "./classNames";

export interface LoadingStateProps {
	message?: string;
	className?: string;
}

export function LoadingState({
	message = "Загружаем данные…",
	className,
}: LoadingStateProps) {
	return (
		<output
			aria-live="polite"
			aria-busy="true"
			className={classNames(
				"block min-w-0 break-words p-4 text-sm text-muted",
				className,
			)}
		>
			{message}
		</output>
	);
}
