import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface BaseModalProps {
	title: string;
	children: ReactNode;
	onClose: () => void;
	closeDisabled?: boolean;
	size?: "sm" | "md" | "lg" | "xl";
	placement?: "center" | "right";
}

const widths = {
	sm: "max-w-md",
	md: "max-w-lg",
	lg: "max-w-2xl",
	xl: "max-w-4xl",
};
const modalStack: string[] = [];

export function BaseModal({
	title,
	children,
	onClose,
	closeDisabled = false,
	size = "md",
	placement = "center",
}: BaseModalProps) {
	const titleId = useId();
	const dialog = useRef<HTMLElement>(null);
	const close = useRef({ onClose, closeDisabled });
	close.current = { onClose, closeDisabled };

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (modalStack.at(-1) !== titleId) return;
			if (event.key === "Escape" && !close.current.closeDisabled) {
				event.preventDefault();
				event.stopImmediatePropagation();
				close.current.onClose();
			}
			if (event.key === "Tab") {
				const nodes = Array.from(
					dialog.current?.querySelectorAll<HTMLElement>(
						'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
					) ?? [],
				).filter((node) => node.getClientRects().length > 0);
				const first = nodes[0];
				const last = nodes.at(-1);
				if (!first) {
					event.preventDefault();
					dialog.current?.focus();
				} else if (
					event.shiftKey &&
					(document.activeElement === first ||
						document.activeElement === dialog.current)
				) {
					event.preventDefault();
					last?.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			}
		};
		const previous = document.activeElement;
		modalStack.push(titleId);
		dialog.current?.focus();
		window.addEventListener("keydown", handleEscape, true);
		return () => {
			modalStack.splice(modalStack.indexOf(titleId), 1);
			window.removeEventListener("keydown", handleEscape, true);
			if (previous instanceof HTMLElement && previous.isConnected)
				previous.focus();
		};
	}, [titleId]);

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
		<div
			className={`fixed inset-0 z-40 flex items-end justify-center p-0 sm:items-center sm:p-4 ${placement === "right" ? "ops-drawer" : ""}`}
		>
			<button
				type="button"
				aria-label="Закрыть окно"
				onClick={handleClose}
				disabled={closeDisabled}
				className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm disabled:cursor-not-allowed"
			/>

			<section
				ref={dialog}
				tabIndex={-1}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className={`relative flex h-[100dvh] max-h-[100dvh] w-full ${widths[size]} animate-slide-up flex-col overflow-hidden rounded-none border border-border bg-surface shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-xl`}
			>
				<div className="flex min-h-14 shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-5">
					<h2 id={titleId} className="text-lg font-semibold text-foreground">
						{title}
					</h2>

					<button
						type="button"
						title="Закрыть"
						onClick={handleClose}
						disabled={closeDisabled}
						className="ui-button ui-button--ghost ui-button--icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						<X size={18} />
					</button>
				</div>

				<div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-5">
					{children}
				</div>
			</section>
		</div>,
		document.body,
	);
}
