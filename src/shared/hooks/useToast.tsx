import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useState,
} from "react";

interface ToastAction {
	label: string;
	onClick: () => void;
}

interface Toast {
	id: number;
	message: string;
	action?: ToastAction;
}

interface ToastContextValue {
	showToast: (
		message: string,
		options?: { action?: ToastAction; duration?: number },
	) => void;
	toasts: Toast[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const showToast = useCallback(
		(
			message: string,
			options?: { action?: ToastAction; duration?: number },
		) => {
			const id = ++toastId;
			setToasts((prev) => [...prev, { id, message, action: options?.action }]);
			setTimeout(() => {
				setToasts((prev) => prev.filter((t) => t.id !== id));
			}, options?.duration ?? 3500);
		},
		[],
	);

	return (
		<ToastContext.Provider value={{ showToast, toasts }}>
			{children}
		</ToastContext.Provider>
	);
}

export function useToast() {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within ToastProvider");
	return ctx;
}
