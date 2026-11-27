import { Check, ChevronDown, Mail, Search, ShieldAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Mailbox, MailStats } from "@/services/mail.service";
import { MailFolderCount } from "./MailFolderTree";

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
	const trigger = useRef<HTMLButtonElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const selectedId = `${id}-mailbox-${active.id}`;
	const query = search.trim().toLowerCase();
	const visible = mailboxes.filter(({ address }) =>
		address.toLowerCase().includes(query),
	);

	useEffect(() => {
		const viewport = list.current;
		if (
			query ||
			(!open && trigger.current?.getClientRects().length) ||
			!viewport?.clientHeight
		)
			return;
		const row = document.getElementById(selectedId);
		if (!row) return;
		const bounds = viewport.getBoundingClientRect();
		const selected = row.getBoundingClientRect();
		if (selected.top < bounds.top)
			viewport.scrollTop += selected.top - bounds.top;
		else if (selected.bottom > bounds.bottom)
			viewport.scrollTop += selected.bottom - bounds.bottom;
	}, [selectedId, open, query]);

	const close = () => {
		setOpen(false);
		trigger.current?.focus({ preventScroll: true });
	};

	return (
		<div className="mail-account-switch" data-expanded={open}>
			<button
				type="button"
				ref={trigger}
				className="mail-account-trigger"
				aria-label="Почтовый ящик"
				aria-describedby={`${id}-active`}
				aria-expanded={open}
				aria-controls={id}
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
			<section
				id={id}
				aria-label="Выбор почтового ящика"
				className="mail-account-options"
				onKeyDown={(event) => {
					if (event.key === "Escape" && open) {
						event.preventDefault();
						close();
					}
				}}
			>
				<header className="mail-accounts-heading">
					<h2>Ящики</h2>
					<span title={`Доступно ящиков: ${mailboxes.length}`}>
						{mailboxes.length}
					</span>
				</header>
				{mailboxes.length > 5 && (
					<label className="mail-search">
						<Search size={15} aria-hidden="true" />
						<input
							type="search"
							aria-label="Найти ящик"
							placeholder="Найти ящик"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</label>
				)}
				{visible.length > 0 ? (
					<ul ref={list} className="supportos-scroll">
						{visible.map((item) => {
							const status = statusByMailbox.get(item.id);
							const selected = active.id === item.id;
							return (
								<li key={item.id} id={`${id}-mailbox-${item.id}`}>
									<button
										type="button"
										className="mail-nav mail-account-option"
										aria-pressed={selected}
										onClick={() => {
											if (!selected) onChange(item.id);
											if (open) close();
										}}
										title={item.address}
									>
										<Mail
											size={14}
											aria-hidden="true"
											className="mail-account-row-icon"
										/>
										<span>{item.address}</span>
										{status?.reconnect && (
											<ShieldAlert
												size={14}
												aria-label="Нужно переподключить"
											/>
										)}
										<MailFolderCount count={status?.unread} />
										{selected && !status?.unread && !status?.reconnect && (
											<Check
												size={14}
												aria-hidden="true"
												className="mail-account-selected"
											/>
										)}
									</button>
								</li>
							);
						})}
					</ul>
				) : (
					<output className="mail-picker-empty">Ящики не найдены</output>
				)}
			</section>
		</div>
	);
}
