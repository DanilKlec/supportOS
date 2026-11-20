import { Check, ChevronDown, Mail, Search, ShieldAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Mailbox, MailStats } from "@/services/mail.service";

export function MailAccountPicker({
	active,
	mailboxes,
	statusByMailbox,
	onChange,
}: {
	active: Mailbox;
	mailboxes: Mailbox[];
	statusByMailbox: ReadonlyMap<string, MailStats>;
	onChange: (id: string) => void;
}) {
	const id = useId();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const container = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const visible = mailboxes.filter(({ address }) =>
		address.toLowerCase().includes(search.trim().toLowerCase()),
	);

	useEffect(() => {
		if (!open) return;
		if (!window.matchMedia("(max-width: 780px)").matches)
			input.current?.focus({ preventScroll: true });
		const outside = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				!container.current?.contains(event.target)
			) {
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open]);

	return (
		<div ref={container} className="mail-account-switch">
			<button
				type="button"
				ref={trigger}
				className="mail-account-trigger"
				aria-label="Почтовый ящик"
				aria-describedby={`${id}-active`}
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				onClick={() => {
					setSearch("");
					setOpen(!open);
				}}
			>
				<span className="mail-account-icon">
					<Mail size={17} aria-hidden="true" />
				</span>
				<span className="mail-account-caption">
					<span>Почтовый ящик</span>
					<strong id={`${id}-active`} title={active.address}>
						{active.address}
					</strong>
				</span>
				<ChevronDown size={15} aria-hidden="true" />
			</button>
			{open && (
				<section
					id={id}
					aria-label="Выбор почтового ящика"
					className="mail-account-options mail-float"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							setOpen(false);
							trigger.current?.focus();
						}
					}}
				>
					<label className="mail-search">
						<Search size={15} aria-hidden="true" />
						<input
							ref={input}
							aria-label="Найти ящик"
							placeholder="Найти ящик"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</label>
					<ul className="supportos-scroll">
						{visible.map((item) => {
							const status = statusByMailbox.get(item.id);
							const selected = active.id === item.id;
							return (
								<li key={item.id}>
									<button
										type="button"
										className="mail-nav mail-account-option"
										aria-pressed={selected}
										onClick={() => {
											onChange(item.id);
											setOpen(false);
											trigger.current?.focus();
										}}
										title={item.address}
									>
										<span>{item.address}</span>
										{status?.reconnect ? (
											<ShieldAlert
												size={13}
												aria-label="Нужно переподключить"
											/>
										) : status?.unread ? (
											<b className="mail-mailbox-count">
												<span className="sr-only">Непрочитанных: </span>
												{status.unread}
											</b>
										) : selected ? (
											<Check size={14} aria-hidden="true" />
										) : null}
									</button>
								</li>
							);
						})}
					</ul>
					{!visible.length && (
						<p className="mail-picker-empty">Ящики не найдены</p>
					)}
				</section>
			)}
		</div>
	);
}
