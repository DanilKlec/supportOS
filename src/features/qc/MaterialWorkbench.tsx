import {
	ChevronDown,
	ChevronRight,
	Folder,
	FolderOpen,
	Layers3,
	ListTree,
	Search,
	X,
	type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { MoreActions } from "@/components/MoreActions";
import { BaseModal } from "@/shared/modals/BaseModal";
import "@/features/shared-binds/shared-library.css";
import "./material-workbench.css";

export interface MaterialNode {
	id: string;
	label: string;
	detail?: string;
	icon?: LucideIcon;
	children?: MaterialNode[];
	actions?: { label: string; onClick: () => void; danger?: boolean }[];
}
export function MaterialWorkbench({
	title,
	summary,
	icon: Icon,
	nodes,
	selected,
	onSelect,
	query,
	onSearch,
	searchPlaceholder,
	actions,
	banner,
	breadcrumb,
	children,
}: {
	title: string;
	summary: string;
	icon: LucideIcon;
	nodes: MaterialNode[];
	selected: string;
	onSelect: (node: MaterialNode) => void;
	query: string;
	onSearch: (query: string) => void;
	searchPlaceholder: string;
	actions: ReactNode;
	banner: ReactNode;
	breadcrumb: ReactNode;
	children: ReactNode;
}) {
	const [expanded, setExpanded] = useState(
		() => new Set(nodes.map((n) => n.id)),
	);
	const known = useRef(new Set(nodes.map((n) => n.id))),
		tree = useRef<HTMLUListElement>(null);
	useEffect(() => {
		const added = nodes.filter((n) => !known.current.has(n.id));
		added.forEach((n) => known.current.add(n.id));
		if (added.length)
			setExpanded((old) => new Set([...old, ...added.map((n) => n.id)]));
	}, [nodes]);
	function toggle(id: string) {
		setExpanded((old) => {
			const next = new Set(old);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}
	function rows(items: MaterialNode[], depth = 0): ReactNode {
		return items.map((node) => {
			const open = !!query || expanded.has(node.id),
				NodeIcon = node.icon ?? (open ? FolderOpen : Folder);
			return (
				<li
					key={node.id}
					role="treeitem"
					aria-label={node.label}
					aria-selected={selected === node.id}
					aria-expanded={node.children ? open : undefined}
				>
					<div
						className={`library-tree-row${selected === node.id ? " is-selected" : ""}`}
						style={{ paddingLeft: 8 + depth * 16 }}
					>
						{node.children ? (
							<button
								type="button"
								className="library-tree-toggle"
								aria-label={`${open ? "Свернуть" : "Раскрыть"} ${node.label}`}
								onClick={() => toggle(node.id)}
							>
								{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
							</button>
						) : (
							<span className="qc-material-indent" />
						)}
						<button
							type="button"
							className="library-tree-label"
							data-material-select
							onClick={() => onSelect(node)}
							title={node.detail ?? node.label}
						>
							<NodeIcon size={15} />
							<span>{node.label}</span>
						</button>
						{node.children && (
							<small className="qc-material-count">
								{node.children.length}
							</small>
						)}
						{!!node.actions?.length && (
							<MoreActions compact label={`Действия: ${node.label}`}>
								{node.actions.map((action) => (
									<button
										key={action.label}
										type="button"
										className={`action-menu-item${action.danger ? " text-red-400" : ""}`}
										onClick={action.onClick}
									>
										{action.label}
									</button>
								))}
							</MoreActions>
						)}
					</div>
					{node.children && open && (
						<ul role="group">{rows(node.children, depth + 1)}</ul>
					)}
				</li>
			);
		});
	}
	return (
		<div className="library-workbench qc-material-workbench">
			<header className="library-toolbar">
				<div className="library-toolbar-title">
					<Icon size={19} />
					<div>
						<h2>{title}</h2>
						<p>{summary}</p>
					</div>
				</div>
				<div className="ui-actions">{actions}</div>
			</header>
			<div className="qc-material-publication">{banner}</div>
			<div className="library-canvas">
				<aside className="library-structure" aria-label={`Структура: ${title}`}>
					<div className="library-structure-heading">
						<strong>Структура</strong>
						<div className="ui-actions">
							<button
								type="button"
								className="ui-button"
								title="Раскрыть все проекты"
								aria-label="Раскрыть все проекты"
								onClick={() => setExpanded(new Set(nodes.map((n) => n.id)))}
							>
								<Layers3 size={15} />
							</button>
							<button
								type="button"
								className="ui-button"
								title="Свернуть все проекты"
								aria-label="Свернуть все проекты"
								onClick={() => setExpanded(new Set())}
							>
								<ListTree size={15} />
							</button>
						</div>
					</div>
					<label className="library-search">
						<Search size={14} />
						<input
							aria-label={searchPlaceholder}
							placeholder={searchPlaceholder}
							value={query}
							onChange={(e) => onSearch(e.target.value)}
						/>
						{query && (
							<button
								type="button"
								aria-label="Сбросить поиск"
								onClick={() => onSearch("")}
							>
								<X size={13} />
							</button>
						)}
					</label>
					<div className="library-tree-scroll">
						<ul
							ref={tree}
							role="tree"
							aria-label={`Дерево: ${title}`}
							className="library-tree"
							onKeyDown={(e) => {
								if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
									return;
								const buttons = [
										...(tree.current?.querySelectorAll<HTMLButtonElement>(
											"[data-material-select]",
										) ?? []),
									],
									index = buttons.indexOf(e.target as HTMLButtonElement);
								if (index < 0) return;
								e.preventDefault();
								buttons[
									e.key === "Home"
										? 0
										: e.key === "End"
											? buttons.length - 1
											: index + (e.key === "ArrowDown" ? 1 : -1)
								]?.focus();
							}}
						>
							{rows(nodes)}
						</ul>
						{!nodes.length && (
							<p className="library-tree-empty">
								{query ? "Ничего не найдено" : "Проектов пока нет"}
							</p>
						)}
					</div>
					<footer className="library-structure-footer">
						<span className="qc-material-dot" />
						Общий справочник команды
					</footer>
				</aside>
				<main className="library-detail qc-material-detail">
					<nav
						className="qc-material-breadcrumb"
						aria-label="Расположение материала"
					>
						{breadcrumb}
					</nav>
					{children}
				</main>
			</div>
		</div>
	);
}

export function useMaterialNavigation(dirty: boolean) {
	const [pending, setPending] = useState<(() => void) | null>(null);
	const guard = (action: () => void) => {
		if (dirty) setPending(() => action);
		else action();
	};
	const dialog = pending && (
		<BaseModal
			title="Есть несохранённые изменения"
			onClose={() => setPending(null)}
			size="sm"
		>
			<p className="text-sm text-muted">
				Сначала примените изменения или продолжите без сохранения формы.
			</p>
			<div className="ui-actions mt-5 flex justify-end gap-2">
				<button
					type="button"
					className="ui-button"
					onClick={() => setPending(null)}
				>
					Продолжить редактирование
				</button>
				<button
					type="button"
					className="ui-button ui-button--secondary border border-border"
					onClick={() => {
						pending();
						setPending(null);
					}}
				>
					Перейти без сохранения
				</button>
			</div>
		</BaseModal>
	);
	return { guard, dialog };
}
