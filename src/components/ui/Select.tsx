import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { classNames } from "./classNames";

export type SelectProps = ComponentPropsWithoutRef<"select">;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
	({ className, children, ...props }, ref) => (
		<select ref={ref} className={classNames("ui-input border border-border bg-background", className)} {...props}>
			{children}
		</select>
	),
);
Select.displayName = "Select";
