import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	ArrowRight,
	Check,
	ChevronRight,
	Copy,
	FileText,
	Folder,
	FolderPlus,
	Layers3,
	ListTree,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Upload,
	Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import type { Bind } from "@/entities/bind";
import type { KnowledgeTreeNode } from "@/entities/knowledge";
import { languages } from "@/entities/language";
import { sharedBindsService } from "@/services/shared-binds.service";
import {
	sharedLibraryService,
	type LibraryStructure,
	type StructureChange,
} from "@/services/shared-library.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { CommonBindImport } from "./CommonBindImport";
import {
	LibraryStructureDialog,
	type StructureDialogState,
} from "./LibraryStructureDialog";
import { LibraryTree, type LibraryNodeAction } from "./LibraryTree";
import {
	bindCount,
	buildLibraryTree,
	flattenLibrary,
	nodeKey,
	nodeLocation,
	searchLibraryTree,
} from "./library-tree";
import { SharedBindEditor } from "./SharedBindEditor";
import "./shared-library.css";

const emptyStructure: LibraryStructure = { categories: [], folders: [] };
export function SharedBindWorkbench({ onManage }: { onManage?: () => void }) {
	const user = useAuthStore((s) => s.session?.user),
		allowed = can(user?.access, "knowledge.write"),
		client = useQueryClient(),
		{ showToast } = useToast();
	const bindsKey = ["shared-binds", user?.id],
		structureKey = ["shared-library-structure", user?.id];
	const binds = useQuery({
		queryKey: bindsKey,
		queryFn: () => sharedBindsService.list(),
		refetchInterval: 30000,
	});
	const metadata = useQuery({
		queryKey: structureKey,
		queryFn: ({ signal }) => sharedLibraryService.load(signal),
		refetchInterval: 30000,
	});
	const structure = metadata.data ?? emptyStructure,
		sources = (binds.data ?? []).filter((b) => !b.archived);
	const [language, setLanguage] = useState("ru"),
		[search, setSearch] = useState(""),
		[selection, setSelection] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const knownCategories = useRef(new Set<string>());
	const [editor, setEditor] = useState<{
		key: string;
		original?: Bind;
		location: { categoryId: string; folderId?: string };
	} | null>(null);
	const [dirty, setDirty] = useState(false),
		[pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(
			null,
		);
	const [dialog, setDialog] = useState<StructureDialogState | null>(null),
		[importOpen, setImportOpen] = useState(false),
		[structureBusy, setStructureBusy] = useState(false);
	const [notice, setNotice] = useState("");
	const tree = buildLibraryTree(structure, sources, language),
		all = flattenLibrary(tree),
		visible = searchLibraryTree(tree, search);
	const selected = all.find((n) => nodeKey(n) === selection),
		location = nodeLocation(selected, structure);
	const translation =
		selected?.bind?.translations.find((t) => t.language === language) ??
		selected?.bind?.translations[0];
	const path = [
		{ label: "Общая база", node: undefined as KnowledgeTreeNode | undefined },
		...(location.categoryId && selected
			? [
					{
						label:
							structure.categories.find((c) => c.id === location.categoryId)
								?.name ?? "Без раздела",
						node: all.find(
							(n) => n.type === "category" && n.id === location.categoryId,
						),
					},
				]
			: []),
	];
	if (selected) {
		const ancestors: typeof path = [],
			seen = new Set<string>();
		let folder = structure.folders.find((f) => f.id === location.folderId);
		while (folder && !seen.has(folder.id)) {
			seen.add(folder.id);
			ancestors.unshift({
				label: folder.name,
				node: all.find((n) => n.type === "folder" && n.id === folder?.id),
			});
			folder = structure.folders.find((f) => f.id === folder?.parentId);
		}
		path.push(...ancestors);
	}
	useEffect(() => {
		const added = structure.categories.filter(
			(c) => !knownCategories.current.has(c.id),
		);
		for (const c of added) knownCategories.current.add(c.id);
		if (added.length)
			setExpanded((old) => new Set([...old, ...added.map((c) => c.id)]));
	}, [metadata.data]);
	function guard(action: () => void) {
		if (dirty) setPendingNavigation(() => action);
		else action();
	}
	function reveal(node: KnowledgeTreeNode) {
		const loc = nodeLocation(node, structure);
		setExpanded((old) => {
			const next = new Set(old);
			next.add(loc.categoryId);
			let f = structure.folders.find((f) => f.id === loc.folderId),
				seen = new Set<string>();
			while (f && !seen.has(f.id)) {
				seen.add(f.id);
				next.add(f.id);
				f = structure.folders.find((p) => p.id === f?.parentId);
			}
			return next;
		});
	}
	function select(node?: KnowledgeTreeNode) {
		guard(() => {
			setDirty(false);
			setEditor(null);
			setSelection(node ? nodeKey(node) : "");
			if (node) reveal(node);
		});
	}
	function edit(node?: KnowledgeTreeNode, newLocation = location) {
		guard(() => {
			setDirty(false);
			if (node) setSelection(nodeKey(node));
			setEditor({
				key: crypto.randomUUID(),
				original: node?.bind,
				location: node?.bind ? nodeLocation(node, structure) : newLocation,
			});
		});
	}
	async function refresh() {
		await Promise.all([binds.refetch(), metadata.refetch()]);
	}
	async function change(change: StructureChange) {
		setStructureBusy(true);
		setNotice("");
		try {
			await sharedLibraryService.change(change);
			const fresh = await metadata.refetch();
			if (fresh.data) {
				const data = fresh.data;
				useKnowledgeStore.setState((s) => ({
					categories: [
						...s.categories.filter((c) => c.ownerId !== null),
						...data.categories,
					],
					folders: [
						...s.folders.filter((f) => f.ownerId !== null),
						...data.folders,
					],
				}));
			}
			setNotice(
				change.operation === "delete"
					? "Пустая папка удалена"
					: "Структура сохранена для всей команды",
			);
		} finally {
			setStructureBusy(false);
		}
	}
	async function moveBind(
		node: KnowledgeTreeNode,
		categoryId: string,
		folderId?: string,
	) {
		if (!node.bind) throw new Error("Бинд не найден");
		const saved = await sharedBindsService.save({
			original: node.bind,
			translations: node.bind.translations,
			tags: node.bind.tags,
			categoryId,
			folderId: folderId ?? null,
		});
		client.setQueryData<Bind[]>(bindsKey, (old) =>
			(old ?? []).map((b) => (b.id === saved.id ? saved : b)),
		);
		setSelection(`bind:${saved.id}`);
		setSearch("");
		reveal({ ...node, bind: saved });
		setNotice("Бинд перемещён. Текст и переводы сохранены.");
		void client.invalidateQueries({ queryKey: bindsKey });
	}
	function action(kind: LibraryNodeAction, node: KnowledgeTreeNode) {
		if (kind === "bind") {
			edit(undefined, nodeLocation(node, structure));
			return;
		}
		if (kind === "folder") {
			setDialog({ kind: "folder", node });
			return;
		}
		if (kind === "edit" && node.type === "bind") {
			edit(node);
			return;
		}
		if (kind === "up" || kind === "down") {
			const original = (
				node.type === "category" ? structure.categories : structure.folders
			).find((n) => n.id === node.id);
			if (original)
				void change({
					entity: node.type as "category" | "folder",
					operation: kind,
					payload: { id: node.id, expected: original.updatedAt },
				}).catch((e) => showToast(e.message));
			return;
		}
		guard(() => {
			setDirty(false);
			setEditor(null);
			setDialog({ kind: kind as "edit" | "move" | "delete", node });
		});
	}
	const problem = binds.error ?? metadata.error;
	const hasLoaded = binds.data !== undefined && metadata.data !== undefined;
	return (
		<section className="library-workbench" aria-label="Редактор общей базы">
			<header className="library-toolbar">
				<div className="library-toolbar-title">
					<ListTree size={20} />
					<div>
						<h2>Общие бинды</h2>
						<p>
							Материалы: {sources.length} · Разделы:{" "}
							{structure.categories.length} · Папки: {structure.folders.length}
						</p>
					</div>
				</div>
				<div className="ui-actions">
					<Button
						variant="ghost"
						aria-label="Обновить общие бинды"
						disabled={binds.isFetching || metadata.isFetching}
						onClick={() => void refresh()}
					>
						<RefreshCw size={16} />
					</Button>
					{onManage && (
						<Button variant="ghost" onClick={() => guard(onManage)}>
							<Users size={15} />
							Бинды сотрудников
						</Button>
					)}
					{allowed && (
						<>
							<Button variant="secondary" onClick={() => setImportOpen(true)}>
								<Upload size={15} />
								Импорт
							</Button>
							<Button
								variant="primary"
								disabled={!structure.categories.length || Boolean(problem)}
								onClick={() => edit()}
							>
								<Plus size={16} />
								Новый бинд
							</Button>
						</>
					)}
				</div>
			</header>
			{notice && (
				<output className="library-notice">
					<Check size={14} />
					{notice}
				</output>
			)}
			{problem && (
				<ErrorState
					title="Не удалось загрузить общие материалы."
					description={
						hasLoaded
							? "Показана последняя загруженная версия. Повторите обновление."
							: "Проверьте соединение и повторите загрузку."
					}
					onRetry={() => void refresh()}
					retrying={binds.isFetching || metadata.isFetching}
					className="mb-4"
				/>
			)}
			{!hasLoaded ? (
				!problem && <LoadingState message="Загружаем материалы команды…" />
			) : (
				<div className="library-canvas">
					<aside
						className="library-structure"
						aria-label="Структура общей базы"
					>
						<div className="library-structure-heading">
							<strong>Структура</strong>
							<div className="ui-actions">
								<Button
									size="small"
									variant="ghost"
									aria-label="Раскрыть все папки"
									onClick={() =>
										setExpanded(
											new Set(
												all.filter((n) => n.type !== "bind").map((n) => n.id),
											),
										)
									}
								>
									<Layers3 size={14} />
								</Button>
								<Button
									size="small"
									variant="ghost"
									aria-label="Свернуть все папки"
									onClick={() => setExpanded(new Set())}
								>
									<ArrowLeft size={14} />
								</Button>
								{allowed && (
									<Button
										size="small"
										variant="ghost"
										aria-label="Новый раздел"
										onClick={() => setDialog({ kind: "category" })}
									>
										<FolderPlus size={15} />
									</Button>
								)}
							</div>
						</div>
						<div className="library-search">
							<Search size={14} />
							<input
								aria-label="Поиск в дереве"
								placeholder="Папка, бинд или текст…"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
							{search && (
								<button
									type="button"
									aria-label="Очистить поиск"
									onClick={() => setSearch("")}
								>
									×
								</button>
							)}
						</div>
						<button
							type="button"
							className={`library-root${!selection ? " is-selected" : ""}`}
							onClick={() => select()}
						>
							<ListTree size={15} />
							Все материалы<small>{sources.length}</small>
						</button>
						<div className="library-tree-scroll">
							<LibraryTree
								nodes={visible}
								selected={selection}
								expanded={expanded}
								searching={Boolean(search.trim())}
								canEdit={allowed && !structureBusy}
								onExpand={(id) =>
									setExpanded((old) => {
										const next = new Set(old);
										next.has(id) ? next.delete(id) : next.add(id);
										return next;
									})
								}
								onSelect={select}
								onAction={action}
								onDropNode={(key, target) => {
									const source = all.find((n) => nodeKey(n) === key);
									if (!source) return;
									if (
										source.type === "folder" &&
										nodeLocation(source, structure).categoryId !==
											nodeLocation(target, structure).categoryId
									) {
										showToast("Папки перемещаются внутри своего раздела");
										return;
									}
									guard(() => {
										setDirty(false);
										setEditor(null);
										setDialog({ kind: "move", node: source, target });
									});
								}}
							/>
							{!visible.length && (
								<p className="library-tree-empty">
									{search ? "Ничего не найдено" : "Создайте первый раздел"}
								</p>
							)}
						</div>
						<footer className="library-structure-footer">
							<span className="library-live-dot" />
							Общая база команды
							{allowed && <p>Перетаскивайте бинды и папки для перемещения</p>}
						</footer>
					</aside>
					<div className="library-detail">
						<nav
							className="library-breadcrumbs"
							aria-label="Расположение материала"
						>
							{path.map((item, i) => (
								<span key={i}>
									{i > 0 && <ChevronRight size={12} />}
									<button
										type="button"
										disabled={i > 0 && !item.node}
										onClick={() => select(item.node)}
									>
										{item.label}
									</button>
								</span>
							))}
							{selected?.type === "bind" && (
								<>
									<ChevronRight size={12} />
									<strong>{selected.name}</strong>
								</>
							)}
						</nav>
						{editor ? (
							<SharedBindEditor
								key={editor.key}
								embedded
								original={editor.original}
								initialLocation={editor.location}
								initialLanguage={language}
								structure={structure}
								onDirtyChange={setDirty}
								onClose={() =>
									guard(() => {
										setEditor(null);
										setDirty(false);
									})
								}
								onSaved={(saved) => {
									client.setQueryData<Bind[]>(bindsKey, (old) => [
										saved,
										...(old ?? []).filter((b) => b.id !== saved.id),
									]);
									setDirty(false);
									setEditor(null);
									setSearch("");
									setSelection(`bind:${saved.id}`);
									reveal({
										id: saved.id,
										type: "bind",
										name: saved.slug,
										children: [],
										bind: saved,
									});
									setNotice("Бинд опубликован для всей команды");
									void client.invalidateQueries({ queryKey: bindsKey });
								}}
							/>
						) : selected?.bind ? (
							<>
								<header className="library-material-heading">
									<div>
										<span className="library-eyebrow">Общий материал</span>
										<h1>{translation?.title || selected.name}</h1>
										<p>
											Обновлён{" "}
											{new Date(selected.bind.updatedAt).toLocaleString(
												"ru-RU",
											)}
										</p>
									</div>
									<div className="ui-actions">
										{allowed && (
											<>
												<Button
													variant="secondary"
													onClick={() => action("move", selected)}
												>
													Переместить
												</Button>
												<Button
													variant="primary"
													onClick={() => edit(selected)}
												>
													<Pencil size={15} />
													Редактировать
												</Button>
											</>
										)}
										<Button
											variant="ghost"
											aria-label="Копировать текст ответа"
											onClick={() =>
												void copyToClipboard(translation?.content ?? "")
													.then(() => showToast("Текст скопирован"))
													.catch(() => showToast("Не удалось скопировать"))
											}
										>
											<Copy size={16} />
										</Button>
									</div>
								</header>
								<div
									className="library-language-tabs"
									aria-label="Язык материала"
								>
									{languages.map((l) => (
										<button
											key={l.code}
											type="button"
											aria-pressed={language === l.code}
											onClick={() => setLanguage(l.code)}
										>
											{l.code.toUpperCase()}
											<span
												className={
													selected.bind?.translations.some(
														(t) => t.language === l.code && t.content.trim(),
													)
														? "is-available"
														: ""
												}
											/>
										</button>
									))}
								</div>
								{translation?.language !== language && (
									<p className="library-missing-language">
										Перевода на выбранный язык пока нет. Показана версия{" "}
										{translation?.language.toUpperCase()}.
									</p>
								)}
								<article className="library-reading prose prose-sm dark:prose-invert">
									<ReactMarkdown remarkPlugins={[remarkGfm]}>
										{translation?.content ?? ""}
									</ReactMarkdown>
								</article>
								{translation?.agentInstructions && (
									<details className="library-agent-note">
										<summary>Инструкция для сотрудника</summary>
										<p>{translation.agentInstructions}</p>
									</details>
								)}
								{selected.bind.tags.length > 0 && (
									<div className="library-tags">
										{selected.bind.tags.map((t) => (
											<span key={t}>#{t}</span>
										))}
									</div>
								)}
							</>
						) : (
							<div className="library-folder-view">
								<header className="library-material-heading">
									<div>
										<span className="library-eyebrow">
											{selected?.type === "folder" ? "Папка" : "Общая база"}
										</span>
										<h1>{selected?.name ?? "Библиотека команды"}</h1>
										<p>
											{selected ? bindCount(selected) : sources.length}{" "}
											материалов · изменения видны всем сотрудникам
										</p>
									</div>
									{allowed && (
										<div className="ui-actions">
											<Button
												variant="secondary"
												disabled={!location.categoryId}
												onClick={() =>
													setDialog({ kind: "folder", node: selected })
												}
											>
												<FolderPlus size={15} />
												Новая папка
											</Button>
											<Button
												variant="secondary"
												onClick={() => setDialog({ kind: "category" })}
											>
												Новый раздел
											</Button>
										</div>
									)}
								</header>
								<div className="library-folder-grid">
									{(selected?.children ?? tree)
										.filter((n) => n.type !== "bind")
										.map((n) => (
											<button
												key={nodeKey(n)}
												type="button"
												onClick={() => select(n)}
											>
												<Folder
													size={22}
													style={n.color ? { color: n.color } : undefined}
												/>
												<span>
													<strong>{n.name}</strong>
													<small>Материалы: {bindCount(n)}</small>
												</span>
												<ArrowRight size={15} />
											</button>
										))}
								</div>
								<div className="library-material-list">
									{(selected?.children ?? all)
										.filter((n) => n.type === "bind")
										.map((n) => (
											<button
												type="button"
												key={nodeKey(n)}
												onClick={() => select(n)}
											>
												<FileText size={16} />
												<span>
													<strong>{n.name}</strong>
													<small>
														{n.bind?.translations
															.map((t) => t.language.toUpperCase())
															.join(" · ")}
													</small>
												</span>
												<ChevronRight size={15} />
											</button>
										))}
								</div>
								{(selected?.children ?? tree).length === 0 && (
									<EmptyState
										title={
											selected
												? "Здесь пока пусто"
												: "Общих материалов пока нет"
										}
										description="Добавьте папку или создайте первый бинд в этом разделе."
									/>
								)}
							</div>
						)}
					</div>
				</div>
			)}
			{dialog && (
				<LibraryStructureDialog
					state={dialog}
					structure={structure}
					onClose={() => setDialog(null)}
					onChange={change}
					onMoveBind={moveBind}
				/>
			)}
			{importOpen && (
				<BaseModal
					title="Импорт общих биндов"
					size="lg"
					onClose={() => {
						setImportOpen(false);
						void refresh();
					}}
				>
					<CommonBindImport />
				</BaseModal>
			)}
			{pendingNavigation && (
				<BaseModal
					title="Перейти без публикации?"
					size="sm"
					onClose={() => setPendingNavigation(null)}
				>
					<p className="library-dialog-note">
						Правки ещё не опубликованы. При переходе они не попадут в общую
						базу. Можно остаться в редакторе и завершить публикацию.
					</p>
					<div className="ui-actions justify-end">
						<Button
							variant="secondary"
							onClick={() => setPendingNavigation(null)}
						>
							Остаться
						</Button>
						<Button
							variant="primary"
							onClick={() => {
								const next = pendingNavigation;
								setPendingNavigation(null);
								next();
							}}
						>
							Перейти
						</Button>
					</div>
				</BaseModal>
			)}
		</section>
	);
}
