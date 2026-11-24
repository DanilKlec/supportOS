import {
	Folder,
	FolderPlus,
	Mail,
	Pencil,
	Search,
	ShieldAlert,
	X,
} from "lucide-react";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { usePreference } from "@/features/productivity/preferences";
import type { Mailbox, MailStats } from "@/services/mail.service";
import { labelPalette, MailFolderCount } from "./MailFolderTree";
import { MailProjectEditor, type MailProjectFolder } from "./MailProjectEditor";

const emptyProjects: MailProjectFolder[] = [];
const searchKey = (value: string) => value.trim().toLocaleLowerCase("ru");
const number = new Intl.NumberFormat("ru");

function isProject(value: unknown): value is MailProjectFolder {
	if (!value || typeof value !== "object") return false;
	const folder = value as Partial<MailProjectFolder>;
	return (
		typeof folder.id === "string" &&
		folder.id.length > 0 &&
		typeof folder.name === "string" &&
		typeof folder.color === "number" &&
		Array.isArray(folder.mailboxIds) &&
		folder.mailboxIds.every((id) => typeof id === "string")
	);
}

function markText(name: string) {
	const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
	const first = words[0] ?? "";
	if (/^[A-ZА-ЯЁ0-9]{2,3}$/u.test(first)) return first;
	if (words.length > 1)
		return words
			.slice(0, 2)
			.map((word) => [...word][0])
			.join("")
			.toUpperCase();
	return [...first].slice(0, 2).join("").toUpperCase();
}

function ProjectMark({ folder }: { folder?: MailProjectFolder }) {
	const colors = folder
		? (labelPalette[folder.color] ?? labelPalette[0])
		: undefined;
	const style = colors
		? ({
				"--mail-project-hue": colors.backgroundColor,
				"--mail-project-ink": colors.textColor,
			} as CSSProperties)
		: undefined;
	const initials = folder && markText(folder.name);
	return (
		<span className="mail-project-mark" style={style} aria-hidden="true">
			{initials || <Folder size={17} />}
		</span>
	);
}

export function MailProjectFolders({
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
	const [stored, setFolders] = usePreference(
		"mail-project-folders",
		emptyProjects,
	);
	const folders = Array.isArray(stored)
		? stored.filter(isProject)
		: emptyProjects;
	const [opened, setOpened] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState<{ folder?: MailProjectFolder }>();
	const rail = useRef<HTMLElement>(null);
	const panel = useRef<HTMLElement>(null);
	const panelId = useId();
	const selectedButton = useRef<HTMLButtonElement>(null);

	const accountsByFolder = new Map<string, Mailbox[]>();
	const owners = new Map<string, MailProjectFolder>();
	for (const folder of folders) {
		for (const id of folder.mailboxIds) {
			owners.set(id, folder);
		}
	}
	for (const mailbox of mailboxes) {
		const key = owners.get(mailbox.id)?.id ?? "";
		const accounts = accountsByFolder.get(key) ?? [];
		accounts.push(mailbox);
		accountsByFolder.set(key, accounts);
	}
	const project = folders.find(({ id }) => id === opened);
	const accounts = accountsByFolder.get(opened ?? "") ?? [];
	const filtered = accounts.filter(({ address }) =>
		searchKey(address).includes(searchKey(search)),
	);
	const sorted = folders.toSorted((left, right) =>
		left.name.localeCompare(right.name, "ru", { numeric: true }),
	);

	const closePanel = (returnFocus = false) => {
		setOpened(null);
		if (returnFocus) {
			if (selectedButton.current?.isConnected) selectedButton.current.focus();
			else rail.current?.querySelector("button")?.focus();
		}
	};

	useEffect(() => {
		if (opened === null) return;
		panel.current?.focus({ preventScroll: true });
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && !rail.current?.contains(event.target))
				setOpened(null);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [opened]);

	const saveFolder = (draft: MailProjectFolder) => {
		const accessible = new Set(mailboxes.map(({ id }) => id));
		const selected = new Set(
			draft.mailboxIds.filter((id) => accessible.has(id)),
		);
		const previous = folders.find(({ id }) => id === draft.id);
		const hidden =
			previous?.mailboxIds.filter((id) => !accessible.has(id)) ?? [];
		const saved = { ...draft, mailboxIds: [...hidden, ...selected] };
		setFolders([
			...folders
				.filter(({ id }) => id !== saved.id)
				.map((folder) => ({
					...folder,
					mailboxIds: folder.mailboxIds.filter((id) => !selected.has(id)),
				})),
			saved,
		]);
		setEditing(undefined);
		setSearch("");
		setOpened(saved.id);
	};

	return (
		<aside ref={rail} className="mail-project-rail" aria-label="Папки проектов">
			<div className="mail-project-rail-heading">
				<button
					type="button"
					className="mail-icon mail-project-add"
					aria-label="Создать папку проекта"
					title="Создать папку проекта"
					onClick={(event) => {
						selectedButton.current = event.currentTarget;
						setEditing({});
					}}
				>
					<FolderPlus size={18} aria-hidden="true" />
				</button>
			</div>
			<nav
				className="mail-project-shortcuts supportos-scroll"
				aria-label="Проекты"
			>
				{[undefined, ...sorted].map((folder) => {
					const key = folder?.id ?? "";
					const name = folder?.name ?? "Без проекта";
					const statuses = (accountsByFolder.get(key) ?? []).map(({ id }) =>
						statusByMailbox.get(id),
					);
					const unread = statuses.reduce(
						(sum, status) => sum + (status?.unread ?? 0),
						0,
					);
					const reconnect = statuses.some((status) => status?.reconnect);
					const hint = unread
						? `${name} · ${number.format(unread)} непрочитанных`
						: reconnect
							? `${name} · нужно переподключить ящик`
							: name;
					return (
						<button
							type="button"
							key={key}
							className="mail-project-shortcut"
							aria-label={hint}
							title={hint}
							aria-expanded={opened === key}
							aria-controls={opened === key ? panelId : undefined}
							data-active={(owners.get(active.id)?.id ?? "") === key}
							onClick={(event) => {
								selectedButton.current = event.currentTarget;
								setSearch("");
								setOpened(opened === key ? null : key);
							}}
						>
							<ProjectMark folder={folder} />
							{unread > 0 ? (
								<span className="mail-project-badge" aria-hidden="true">
									{unread > 99 ? "99+" : unread}
								</span>
							) : (
								reconnect && (
									<span
										className="mail-project-badge"
										data-warning="true"
										aria-hidden="true"
									>
										!
									</span>
								)
							)}
						</button>
					);
				})}
			</nav>
			{opened !== null && (
				<section
					ref={panel}
					tabIndex={-1}
					id={panelId}
					aria-label={project?.name ?? "Без проекта"}
					className="mail-project-panel mail-float"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							closePanel(true);
						}
					}}
				>
					<header className="mail-project-panel-heading">
						<ProjectMark folder={project} />
						<div>
							<h2>{project?.name ?? "Без проекта"}</h2>
							<span className="mail-project-meta">
								Почтовые ящики · {accounts.length}
							</span>
						</div>
						{project && (
							<button
								type="button"
								className="mail-icon"
								title="Настроить папку"
								aria-label="Настроить папку"
								onClick={() => setEditing({ folder: project })}
							>
								<Pencil size={15} aria-hidden="true" />
							</button>
						)}
						<button
							type="button"
							className="mail-icon"
							aria-label="Закрыть папку"
							title="Закрыть папку"
							onClick={() => closePanel(true)}
						>
							<X size={16} aria-hidden="true" />
						</button>
					</header>
					{accounts.length > 5 && (
						<label className="mail-search mail-project-search">
							<Search size={15} aria-hidden="true" />
							<input
								aria-label="Найти ящик в папке"
								placeholder="Найти ящик"
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
							/>
						</label>
					)}
					{filtered.length ? (
						<ul className="mail-project-accounts supportos-scroll">
							{filtered.map((mailbox) => {
								const status = statusByMailbox.get(mailbox.id);
								return (
									<li key={mailbox.id}>
										<button
											type="button"
											className="mail-nav mail-project-account"
											aria-pressed={active.id === mailbox.id}
											title={mailbox.address}
											onClick={() => {
												onChange(mailbox.id);
												closePanel(true);
											}}
										>
											<Mail size={15} aria-hidden="true" />
											<span>{mailbox.address}</span>
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
						<p className="mail-project-empty">
							{search
								? "Ящики не найдены"
								: project
									? "Добавьте ящики в настройках папки."
									: "Все ящики уже распределены по проектам."}
						</p>
					)}
				</section>
			)}
			{editing && (
				<MailProjectEditor
					folder={editing.folder}
					folders={folders}
					mailboxes={mailboxes}
					owners={owners}
					onClose={() => setEditing(undefined)}
					onSave={saveFolder}
					onRemove={(id) => {
						setFolders(folders.filter((folder) => folder.id !== id));
						setEditing(undefined);
						setSearch("");
						setOpened("");
					}}
				/>
			)}
		</aside>
	);
}
