import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { classNames } from "./classNames";

type ButtonVariant = "default" | "primary" | "secondary" | "ghost" | "danger" | "danger-quiet";
type ButtonSize = "default" | "small";

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant = "default", size = "default", loading = false, disabled, children, ...props }, ref) => (
		<button
			ref={ref}
			type="button"
			className={classNames(
				"ui-button",
				variant !== "default" && `ui-button--${variant}`,
				size === "small" && "ui-button--small",
				className,
			)}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			{...props}
		>
			{loading && <span aria-hidden="true">…</span>}
			{children}
		</button>
	),
);
Button.displayName = "Button";
