import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { classNames } from "./classNames";

export type TextareaProps = ComponentPropsWithoutRef<"textarea">;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
	({ className, ...props }, ref) => (
		<textarea ref={ref} className={classNames("ui-input border border-border bg-background", className)} {...props} />
	),
);
Textarea.displayName = "Textarea";
