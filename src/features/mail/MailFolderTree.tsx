import { ChevronRight, Folder, FolderOpen, Inbox } from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import type { MailLabel, MailLabelColor } from "@/services/mail.service";

export const labelPalette: (MailLabelColor & { name: string })[] = [
	{ name: "Синий", backgroundColor: "#a4c2f4", textColor: "#0d3472" },
	{ name: "Фиолетовый", backgroundColor: "#d0bcf1", textColor: "#41236d" },
	{ name: "Зелёный", backgroundColor: "#89d3b2", textColor: "#0b4f30" },
	{ name: "Розовый", backgroundColor: "#fbc8d9", textColor: "#711a36" },
	{ name: "Янтарный", backgroundColor: "#ffd6a2", textColor: "#7a4706" },
	{ name: "Бирюзовый", backgroundColor: "#98d7e4", textColor: "#0d3b44" },
	{ name: "Красный", backgroundColor: "#efa093", textColor: "#8a1c0a" },
];

export function labelStyle(label: MailLabel): CSSProperties {
	let index = 0;
	for (const char of label.id)
		index = (index * 31 + char.charCodeAt(0)) % labelPalette.length;
	const { backgroundColor, textColor } = label.color ?? labelPalette[index];
	return {
		"--mail-tag-bg": backgroundColor,
		"--mail-tag-fg": textColor,
	} as CSSProperties;
}

export function MailLabelChip({ label }: { label: MailLabel }) {
	return (
		<span className="mail-tag" style={labelStyle(label)} title={label.name}>
			{label.name.split("/").filter(Boolean).at(-1) ?? label.name}
		</span>
	);
}

const countFormat = new Intl.NumberFormat("ru");

export function MailFolderCount({
	count,
	drafts = false,
}: {
	count?: number | null;
	drafts?: boolean;
}) {
	if (!count || count < 1) return null;
	const label = drafts ? "Черновиков" : "Непрочитанных";
	return (
		<b
			className="mail-folder-count"
			title={`${label}: ${countFormat.format(count)}`}
			data-drafts={drafts}
		>
			<span className="sr-only">{label} </span>
			{countFormat.format(count)}
		</b>
	);
}

type Node = {
	name: string;
	path: string;
	label?: MailLabel;
	children: Map<string, Node>;
};

function folderTree(labels: MailLabel[]) {
	const tree = new Map<string, Node>();
	for (const label of labels) {
		let children = tree;
		let path = "";
		const parts = label.name.split("/");
		for (const [index, name] of parts.entries()) {
			path = index ? `${path}/${name}` : name;
			let node = children.get(name);
			if (!node) {
				node = { name: name || "/", path, children: new Map() };
				children.set(name, node);
			}
			if (index === parts.length - 1) node.label = label;
			children = node.children;
		}
	}
	return tree;
}

export function MailFolderTree({
	labels,
	active,
	onSelect,
	inbox = false,
	search = "",
	unavailable,
	counts,
}: {
	labels: MailLabel[];
	active?: string;
	onSelect: (id: string) => void;
	inbox?: boolean;
	search?: string;
	unavailable?: string;
	counts?: Record<string, number | null>;
}) {
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
	const tree = useMemo(() => folderTree(labels), [labels]);
	const filter = search.toLocaleLowerCase().trim();
	const matches = filter
		? labels.filter(({ name }) => name.toLocaleLowerCase().includes(filter))
		: [];
	const offerInbox = inbox && (!filter || "входящие".includes(filter));

	const render = (nodes: Map<string, Node>): ReactNode[] =>
		[...nodes.values()].map((node) => {
			const { path, name, label, children } = node;
			const open = !collapsed.has(path);
			const toggle = () =>
				setCollapsed((previous) => {
					const next = new Set(previous);
					if (next.has(path)) next.delete(path);
					else next.add(path);
					return next;
				});
			return (
				<li key={path} className="mail-folder-node">
					<div className="mail-folder-line">
						{children.size > 0 && (
							<button
								type="button"
								className="mail-folder-expand"
								aria-expanded={open}
								aria-label={`${open ? "Свернуть" : "Раскрыть"} папку ${path}`}
								onClick={toggle}
							>
								<ChevronRight size={14} aria-hidden="true" />
							</button>
						)}
						<button
							type="button"
							className="mail-folder-item"
							aria-pressed={label ? active === label.id : undefined}
							title={path}
							disabled={Boolean(label && label.id === unavailable)}
							onClick={label ? () => onSelect(label.id) : toggle}
							style={label && labelStyle(label)}
						>
							{active && label?.id === active ? (
								<FolderOpen size={16} aria-hidden="true" />
							) : (
								<Folder size={16} aria-hidden="true" />
							)}
							<span>{name}</span>
							{label && counts && <MailFolderCount count={counts[label.id]} />}
						</button>
					</div>
					{open && children.size > 0 && (
						<ul className="mail-folder-branch">{render(children)}</ul>
					)}
				</li>
			);
		});
	return (
		<ul className="mail-folder-tree">
			{offerInbox && (
				<li>
					<button
						type="button"
						className="mail-folder-item"
						aria-pressed={active === "INBOX"}
						disabled={unavailable === "INBOX"}
						onClick={() => onSelect("INBOX")}
					>
						<Inbox size={16} aria-hidden="true" />
						<span>Входящие</span>
						{counts && <MailFolderCount count={counts.INBOX} />}
					</button>
				</li>
			)}
			{filter
				? matches.map((label) => (
						<li key={label.id}>
							<button
								type="button"
								className="mail-folder-item"
								style={labelStyle(label)}
								aria-pressed={active === label.id}
								disabled={unavailable === label.id}
								onClick={() => onSelect(label.id)}
							>
								<Folder size={16} aria-hidden="true" />
								<span>{label.name}</span>
								{counts && <MailFolderCount count={counts[label.id]} />}
							</button>
						</li>
					))
				: render(tree)}
			{filter && !offerInbox && !matches.length && (
				<li className="mail-picker-empty">Папки не найдены</li>
			)}
		</ul>
	);
}
