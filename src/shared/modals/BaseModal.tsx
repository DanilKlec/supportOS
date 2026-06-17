import { X } from "lucide-react";
import { type ReactNode, useEffect, useId } from "react";
import { createPortal } from "react-dom";

interface BaseModalProps {
	title: string;
	children: ReactNode;
	onClose: () => void;
	closeDisabled?: boolean;
	size?: "sm" | "md" | "lg" | "xl";
}

const widths = {
	sm: "max-w-md",
	md: "max-w-lg",
	lg: "max-w-2xl",
	xl: "max-w-4xl",
};

export function BaseModal({
	title,
	children,
	onClose,
	closeDisabled = false,
	size = "md",
}: BaseModalProps) {
	const titleId = useId();

	useEffect(() => {
		const previousOverflow = document.body.style.overflow;

		document.body.style.overflow = "hidden";

		return () => {
			document.body.style.overflow = previousOverflow;
		};
	}, []);

	const handleClose = () => {
		if (!closeDisabled) {
			onClose();
		}
	};

	if (typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<div className="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center">
			<button
				type="button"
				aria-label="Close modal"
				onClick={handleClose}
				disabled={closeDisabled}
				className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm disabled:cursor-not-allowed"
			/>

			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className={`relative flex max-h-[92vh] w-full ${widths[size]} animate-slide-up flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl`}
			>
				<div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
					<h2 id={titleId} className="text-lg font-semibold text-foreground">
						{title}
					</h2>

					<button
						type="button"
						title="Close"
						onClick={handleClose}
						disabled={closeDisabled}
						className="rounded-md p-1.5 text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						<X size={18} />
					</button>
				</div>

				<div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
			</section>
		</div>,
		document.body,
	);
}
