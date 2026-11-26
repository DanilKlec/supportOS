import { useToast } from "#/shared/hooks/useToast";

export function ToastContainer({ aboveChat = false }: { aboveChat?: boolean }) {
	const { toasts } = useToast();

	return (
		<div
			aria-live="polite"
			className={`pointer-events-none fixed inset-x-3 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-96 ${aboveChat ? "top-[calc(3.75rem+env(safe-area-inset-top))]" : "bottom-[calc(1rem+env(safe-area-inset-bottom))]"}`}
		>
			{toasts.map((toast) => (
				<div
					key={toast.id}
					className="flex items-center gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-2.5 text-sm text-foreground shadow-lg animate-slide-up"
				>
					<span>{toast.message}</span>
					{toast.action && (
						<button
							type="button"
							onClick={toast.action.onClick}
							className="ui-button ui-button--primary pointer-events-auto font-medium text-accent hover:bg-accent/10"
						>
							{toast.action.label}
						</button>
					)}
				</div>
			))}
		</div>
	);
}
