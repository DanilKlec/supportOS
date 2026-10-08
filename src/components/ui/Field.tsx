import { type ReactNode } from "react";
import { classNames } from "./classNames";

export function Field({
	label,
	description,
	error,
	className,
	children,
}: {
	label?: ReactNode;
	description?: ReactNode;
	error?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: Field implicitly labels the native control supplied through children; covered by the UI-kit behavior test.
		<label className={classNames("ui-field", className)}>
			{label && <span>{label}</span>}
			{children}
			{description && <span className="ui-help text-muted">{description}</span>}
			{error && (
				<span className="ui-help text-red-400" role="alert">
					{error}
				</span>
			)}
		</label>
	);
}
