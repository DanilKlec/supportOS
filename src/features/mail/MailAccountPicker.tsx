import { ChevronDown, Search, ShieldAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Mailbox, MailStats } from "@/services/mail.service";
import { MailboxMark } from "./MailboxIcon";
import { MailFolderCount } from "./MailFolderTree";

export function MailAccountPicker({
	active,
	mailboxes,
	statusByMailbox,
	onChange,
}: {
	active?: Mailbox;
	mailboxes: Mailbox[];
	statusByMailbox: ReadonlyMap<string, MailStats>;
	onChange: (id: string) => void;
}) {
	const id = useId();
	const [open, setOpen] = useState<"mobile" | "search" | null>(null);
	const [search, setSearch] = useState("");
	const container = useRef<HTMLDivElement>(null);
	const mobileTrigger = useRef<HTMLButtonElement>(null);
	const searchTrigger = useRef<HTMLButtonElement>(null);
	const searchInput = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLUListElement>(null);
	const selectedId = `${id}-mailbox-${active?.id ?? ""}`;
	const query = search.trim().toLowerCase();
	const visible = mailboxes.filter(({ address }) =>
		address.toLowerCase().includes(query),
	);

	useEffect(() => {
		const viewport = list.current;
		const row = document.getElementById(selectedId);
		if (!viewport?.clientHeight || !row) return;
		const bounds = viewport.getBoundingClientRect();
		const selected = row.getBoundingClientRect();
		if (selected.top < bounds.top)
			viewport.scrollTop += selected.top - bounds.top;
		else if (selected.bottom > bounds.bottom)
			viewport.scrollTop += selected.bottom - bounds.bottom;
	}, [selectedId]);
	useEffect(() => {
		if (open !== "search") return;
		searchInput.current?.focus();
		const outside = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				!container.current?.contains(event.target)
			)
				setOpen(null);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open]);

	const toggle = (mode: "mobile" | "search") => {
		setSearch("");
		setOpen(open === mode ? null : mode);
	};
	const close = () => {
		setOpen(null);
		(open === "search" ? searchTrigger : mobileTrigger).current?.focus({
			preventScroll: true,
		});
	};

	return (
		<div ref={container} className="mail-account-switch">
			<nav className="mail-account-rail" aria-label="Ящики">
				<div className="mail-account-rail-heading">
					<button
						type="button"
						className="mail-icon"
						ref={searchTrigger}
						aria-label="Найти почтовый ящик"
						title="Найти почтовый ящик"
						aria-expanded={open === "search"}
						aria-controls={open === "search" ? id : undefined}
						disabled={!mailboxes.length}
						onClick={() => toggle("search")}
					>
						<Search size={17} aria-hidden="true" />
					</button>
				</div>
				<ul ref={list} className="supportos-scroll">
					{mailboxes.map((box) => {
						const status = statusByMailbox.get(box.id);
						const unread = status?.unread ?? 0;
						const label = [
							box.address,
							unread > 0 && `Непрочитанных: ${unread}`,
							status?.reconnect && "Нужно переподключить",
						]
							.filter(Boolean)
							.join(" · ");
						return (
							<li key={box.id} id={`${id}-mailbox-${box.id}`}>
								<button
									type="button"
									className="mail-account-shortcut"
									title={label}
									aria-label={label}
									aria-pressed={active?.id === box.id}
									onClick={() => {
										if (box.id !== active?.id) onChange(box.id);
									}}
								>
									<MailboxMark address={box.address} icon={box.icon} />
									{status?.reconnect ? (
										<span
											className="mail-account-badge"
											data-warning="true"
											aria-hidden="true"
										>
											!
										</span>
									) : (
										unread > 0 && (
											<span className="mail-account-badge" aria-hidden="true">
												{unread > 99 ? "99+" : unread}
											</span>
										)
									)}
								</button>
							</li>
						);
					})}
				</ul>
			</nav>
			<button
				type="button"
				ref={mobileTrigger}
				className="mail-account-trigger"
				aria-label="Почтовый ящик"
				aria-describedby={`${id}-active`}
				aria-expanded={open === "mobile"}
				aria-controls={open === "mobile" ? id : undefined}
				disabled={!mailboxes.length}
				onClick={() => toggle("mobile")}
			>
				<MailboxMark address={active?.address ?? ""} icon={active?.icon} />
				<span className="mail-account-caption">
					<strong>Ящики</strong>
					<span id={`${id}-active`} className="sr-only">
						{active?.address}
					</span>
				</span>
				<ChevronDown size={15} aria-hidden="true" />
			</button>
			{open && (
				<section
					id={id}
					aria-label="Выбор почтового ящика"
					className="mail-account-options"
					data-mode={open}
					onKeyDown={(event) => {
						if (event.key !== "Escape") return;
						event.preventDefault();
						close();
					}}
				>
					{(open === "search" || mailboxes.length > 5) && (
						<label className="mail-search">
							<Search size={15} aria-hidden="true" />
							<input
								ref={searchInput}
								type="search"
								aria-label="Найти ящик"
								placeholder="Найти ящик"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
							/>
						</label>
					)}
					{visible.length > 0 ? (
						<ul className="supportos-scroll">
							{visible.map((box) => {
								const status = statusByMailbox.get(box.id);
								return (
									<li key={box.id}>
										<button
											type="button"
											className="mail-nav mail-account-option"
											title={box.address}
											aria-label={
												open === "mobile"
													? [
															box.address,
															status?.unread &&
																`Непрочитанных: ${status.unread}`,
														]
															.filter(Boolean)
															.join(" · ")
													: undefined
											}
											aria-pressed={active?.id === box.id}
											onClick={() => {
												if (box.id !== active?.id) onChange(box.id);
												close();
											}}
										>
											<MailboxMark address={box.address} icon={box.icon} />
											{open === "search" && <span>{box.address}</span>}
											{status?.reconnect && (
												<ShieldAlert
													size={14}
													aria-label="Нужно переподключить"
												/>
											)}
											<MailFolderCount count={status?.unread} />
										</button>
									</li>
								);
							})}
						</ul>
					) : (
						<output className="mail-picker-empty">Ящики не найдены</output>
					)}
				</section>
			)}
		</div>
	);
}
