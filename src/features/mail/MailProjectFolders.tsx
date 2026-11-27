import { Folder, FolderPlus, Inbox, Pencil } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { usePreference } from "@/features/productivity/preferences";
import type { Mailbox, MailStats } from "@/services/mail.service";
import { labelPalette } from "./MailFolderTree";
import { MailProjectEditor, type MailProjectFolder } from "./MailProjectEditor";

const emptyProjects: MailProjectFolder[] = [];
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

export function useMailProjects(mailboxes: Mailbox[]) {
	const [stored, setFolders] = usePreference(
		"mail-project-folders",
		emptyProjects,
	);
	const folders = Array.isArray(stored)
		? stored.filter(isProject)
		: emptyProjects;
	const owners = new Map<string, MailProjectFolder>();
	for (const folder of folders)
		for (const id of folder.mailboxIds) owners.set(id, folder);
	const groups = new Map<string, Mailbox[]>();
	for (const mailbox of mailboxes) {
		const key = owners.get(mailbox.id)?.id ?? "";
		const group = groups.get(key) ?? [];
		group.push(mailbox);
		groups.set(key, group);
	}
	return { folders, setFolders, owners, groups };
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
	return (
		<span className="mail-project-mark" style={style} aria-hidden="true">
			{(folder && markText(folder.name)) || <Folder size={17} />}
		</span>
	);
}

export function MailProjectFolders({
	projects,
	selected,
	mailboxes,
	statusByMailbox,
	onSelect,
}: {
	projects: ReturnType<typeof useMailProjects>;
	selected: string | null;
	mailboxes: Mailbox[];
	statusByMailbox: ReadonlyMap<string, MailStats>;
	onSelect: (id: string | null) => void;
}) {
	const { folders, setFolders, owners, groups } = projects;
	const [editing, setEditing] = useState<{ folder?: MailProjectFolder }>();
	const project = folders.find(({ id }) => id === selected);
	const sorted = folders.toSorted((left, right) =>
		left.name.localeCompare(right.name, "ru", { numeric: true }),
	);

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
		onSelect(saved.id);
	};

	return (
		<aside className="mail-project-rail" aria-label="Папки проектов">
			<div className="mail-project-rail-heading">
				<button
					type="button"
					className="mail-icon mail-project-add"
					aria-label="Создать папку проекта"
					title="Создать папку проекта"
					onClick={() => setEditing({})}
				>
					<FolderPlus size={18} aria-hidden="true" />
				</button>
			</div>
			<nav
				className="mail-project-shortcuts supportos-scroll"
				aria-label="Проекты"
			>
				<button
					type="button"
					className="mail-project-shortcut"
					aria-label="Все ящики"
					title="Все ящики"
					aria-pressed={selected === null}
					data-active={selected === null}
					onClick={() => {
						if (selected !== null) onSelect(null);
					}}
				>
					<span className="mail-project-mark" aria-hidden="true">
						<Inbox size={17} />
					</span>
				</button>
				{[undefined, ...sorted].map((folder) => {
					const key = folder?.id ?? "";
					const name = folder?.name ?? "Без проекта";
					const statuses = (groups.get(key) ?? []).map(({ id }) =>
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
							aria-pressed={selected === key}
							data-active={selected === key}
							onClick={() => {
								if (selected !== key) onSelect(key);
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
			{project && (
				<div className="mail-project-rail-heading mail-project-rail-settings">
					<button
						type="button"
						className="mail-icon"
						aria-label="Настроить папку"
						title={`Настроить папку «${project.name}»`}
						onClick={() => setEditing({ folder: project })}
					>
						<Pencil size={17} aria-hidden="true" />
					</button>
				</div>
			)}
			{editing && (
				<MailProjectEditor
					folder={editing.folder}
					folders={folders}
					mailboxes={mailboxes}
					owners={owners}
					onSave={saveFolder}
					onRemove={(id) => {
						setFolders(folders.filter((folder) => folder.id !== id));
						setEditing(undefined);
						onSelect("");
					}}
					onClose={() => setEditing(undefined)}
				/>
			)}
		</aside>
	);
}
