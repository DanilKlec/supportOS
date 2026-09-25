import { type ComponentPropsWithoutRef } from "react";
import { classNames } from "./classNames";

export type PanelProps = ComponentPropsWithoutRef<"section">;

export function Panel({ className, ...props }: PanelProps) {
	return <section className={classNames("rounded-xl border border-border bg-surface", className)} {...props} />;
}
