import {
	Archive,
	Ellipsis,
	Inbox,
	MailCheck,
	MailOpen,
	RotateCcw,
	ShieldAlert,
	ShieldCheck,
	Star,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionMenuPortal } from "@/components/ActionMenuPortal";

export function MailThreadActions({
	labels,
	folder,
	busy,
	onAction,
}: {
	labels: string[];
	folder: string;
	busy: boolean;
	onAction: (action: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const items = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const outside = (event: PointerEvent) => {
			if (!(event.target instanceof Node)) return;
			if (
				!trigger.current?.contains(event.target) &&
				!items.current?.contains(event.target)
			)
				setOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			event.preventDefault();
			setOpen(false);
			trigger.current?.focus();
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [open]);

	const unread = labels.includes("UNREAD");
	const inbox = labels.includes("INBOX");
	const starred = labels.includes("STARRED");
	const trash = folder === "TRASH" || labels.includes("TRASH");
	const spam = folder === "SPAM" || labels.includes("SPAM");
	const actions = [
		unread
			? { id: "read", text: "Отметить прочитанным", Icon: MailCheck }
			: { id: "unread", text: "Отметить непрочитанным", Icon: MailOpen },
		trash
			? { id: "untrash", text: "Восстановить из корзины", Icon: RotateCcw }
			: inbox
				? { id: "archive", text: "В архив", Icon: Archive }
				: { id: "inbox", text: "Во входящие", Icon: Inbox },
		spam
			? { id: "unspam", text: "Не спам", Icon: ShieldCheck }
			: { id: "spam", text: "В спам", Icon: ShieldAlert, danger: true },
		...(!trash
			? [{ id: "trash", text: "В корзину", Icon: Trash2, danger: true }]
			: []),
	];
	return (
		<div className="mail-thread-actions">
			<button
				type="button"
				className="mail-icon mail-star-button"
				aria-label="Пометить письмо"
				aria-pressed={starred}
				title={starred ? "Снять отметку" : "Пометить письмо"}
				disabled={busy}
				onClick={() => onAction(starred ? "unstar" : "star")}
			>
				<Star
					size={17}
					fill={starred ? "currentColor" : "none"}
					aria-hidden="true"
				/>
			</button>
			<button
				ref={trigger}
				type="button"
				className="mail-icon"
				aria-label="Действия с перепиской"
				title="Действия с перепиской"
				aria-haspopup="menu"
				aria-expanded={open}
				disabled={busy && !open}
				onClick={() => setOpen(!open)}
				onKeyDown={(event) => {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						setOpen(true);
					}
				}}
			>
				<Ellipsis size={20} aria-hidden="true" />
			</button>
			{open && (
				<ActionMenuPortal anchor={trigger}>
					<div ref={items} className="mail-action-items" role="presentation">
						{actions.map(({ id, text, Icon, danger }) => (
							<button
								key={id}
								type="button"
								role="menuitem"
								data-danger={danger}
								onClick={() => {
									setOpen(false);
									trigger.current?.focus();
									onAction(id);
								}}
							>
								<Icon size={16} aria-hidden="true" />
								{text}
							</button>
						))}
					</div>
				</ActionMenuPortal>
			)}
		</div>
	);
}
