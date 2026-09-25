import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Button } from "./Button";
import { classNames } from "./classNames";

export type IconButtonProps = Omit<ComponentPropsWithoutRef<typeof Button>, "children" | "aria-label"> & {
	label: string;
	children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
	({ className, label, title, size = "default", children, ...props }, ref) => (
		<Button
			ref={ref}
			aria-label={label}
			title={title ?? label}
			size={size}
			className={classNames("ui-button--icon", className)}
			{...props}
		>
			{children}
		</Button>
	),
);
IconButton.displayName = "IconButton";
