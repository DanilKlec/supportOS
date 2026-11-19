import { useEffect, useRef, type ReactNode } from "react";

export function InboxModal({
	labelledBy,
	className,
	onClose,
	children,
}: {
	labelledBy: string;
	className: string;
	onClose: () => void;
	children: ReactNode;
}) {
	const dialog = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const element = dialog.current;
		element?.showModal();
		return () => element?.close();
	}, []);

	return (
		<dialog
			ref={dialog}
			aria-labelledby={labelledBy}
			className={`chat-dialog ${className}`}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onPointerDown={(event) => {
				if (event.target !== event.currentTarget) return;
				const bounds = event.currentTarget.getBoundingClientRect();
				if (
					event.clientX < bounds.left ||
					event.clientX > bounds.right ||
					event.clientY < bounds.top ||
					event.clientY > bounds.bottom
				)
					onClose();
			}}
		>
			{children}
		</dialog>
	);
}
