import { type ComponentPropsWithoutRef } from "react";
import { classNames } from "./classNames";

export type BadgeProps = ComponentPropsWithoutRef<"span">;

export function Badge({ className, ...props }: BadgeProps) {
	return <span className={classNames("inline-flex items-center rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-xs font-medium text-muted", className)} {...props} />;
}
