import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { classNames } from "./classNames";

export type InputProps = ComponentPropsWithoutRef<"input">;

export const Input = forwardRef<HTMLInputElement, InputProps>(
	({ className, ...props }, ref) => (
		<input ref={ref} className={classNames("ui-input border border-border bg-background", className)} {...props} />
	),
);
Input.displayName = "Input";
