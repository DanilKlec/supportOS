import { useToast } from "#/shared/hooks/useToast";

export function ToastContainer() {
	const { toasts } = useToast();

	if (toasts.length === 0) return null;

	return (
		<div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
			{toasts.map((toast) => (
				<div
					key={toast.id}
					className="flex items-center gap-3 rounded-lg bg-surface-elevated px-4 py-2.5 text-sm text-foreground shadow-lg border border-border animate-slide-up"
				>
					<span>{toast.message}</span>
					{toast.action && (
						<button
							type="button"
							onClick={toast.action.onClick}
							className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent/10"
						>
							{toast.action.label}
						</button>
					)}
				</div>
			))}
		</div>
	);
}
