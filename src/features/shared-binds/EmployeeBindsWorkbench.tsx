import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	ArrowRight,
	Check,
	ChevronDown,
	ChevronRight,
	Copy,
	FileText,
	Folder,
	Layers3,
	ListTree,
	Pencil,
	RefreshCw,
	RotateCcw,
	Search,
	UserRound,
	Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import type { Bind } from "@/entities/bind";
import type { KnowledgeTreeNode } from "@/entities/knowledge";
import { languages } from "@/entities/language";
import {
	type BindEmployee,
	type EmployeeLibrary,
	sharedBindsService,
} from "@/services/shared-binds.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { EmployeePicker } from "./EmployeePicker";
import {
	employeeBinds,
	employeeInitials,
	employeeName,
} from "./employee-library";
import {
	bindCount,
	buildLibraryTree,
	flattenLibrary,
	nodeKey,
	nodeLocation,
	searchLibraryTree,
} from "./library-tree";
import { LibraryTree } from "./LibraryTree";
import { SharedBindEditor } from "./SharedBindEditor";
import { personalTree } from "./shared-tree";
import "./shared-library.css";

export function EmployeeBindsWorkbench({ onCommon }: { onCommon: () => void }) {
	const user = useAuthStore((s) => s.session?.user);
	const [employee, setEmployee] = useState<BindEmployee>(),
		[choosing, setChoosing] = useState(false);
	if (!can(user?.access, "binds.manage"))
		return <ErrorState title="Нет доступа к биндам сотрудников." />;
	const choose = (next: BindEmployee) => {
		setEmployee(next);
		setChoosing(false);
	};
	return (
		<>
			{employee ? (
				<EmployeeLibraryCanvas
					key={`${user?.id}:${employee.id}`}
					employee={employee}
					onCommon={onCommon}
					onChoose={() => setChoosing(true)}
				/>
			) : (
				<section className="library-workbench employee-library">
					<header className="library-toolbar">
						<div className="library-toolbar-title">
							<Users size={20} />
							<div>
								<h2>Бинды сотрудников</h2>
								<p>Материалы каждого сотрудника в привычной структуре базы.</p>
							</div>
						</div>
						<Button variant="secondary" onClick={onCommon}>
							<ArrowLeft size={15} />
							Общая база
						</Button>
					</header>
					<EmployeePicker onSelect={choose} />
				</section>
			)}
			{choosing && (
				<BaseModal
					title="Выбрать сотрудника"
					onClose={() => setChoosing(false)}
					size="lg"
				>
					<EmployeePicker selectedId={employee?.id} onSelect={choose} />
				</BaseModal>
			)}
		</>
	);
}

const empty: EmployeeLibrary = { categories: [], folders: [], binds: [] };
function EmployeeLibraryCanvas({
	employee,
	onCommon,
	onChoose,
}: {
	employee: BindEmployee;
	onCommon: () => void;
	onChoose: () => void;
}) {
	const user = useAuthStore((s) => s.session?.user),
		client = useQueryClient(),
		{ showToast } = useToast();
	const queryKey = ["employee-bind-library", user?.id, employee.id];
	const query = useQuery({
		queryKey,
		queryFn: ({ signal }) =>
			sharedBindsService.employeeLibrary(employee.id, signal),
		enabled: can(user?.access, "binds.manage"),
		refetchInterval: 30000,
	});
	const data = query.data ?? empty,
		items = employeeBinds(data.binds, employee.id),
		ownCount = items.filter((b) => b.ownerId === employee.id).length;
	const personalStructureIds = new Set([
		...data.categories
			.filter((c) => c.ownerId === employee.id)
			.map((c) => `category:${c.id}`),
		...data.folders
			.filter((f) => f.ownerId === employee.id)
			.map((f) => `folder:${f.id}`),
	]);
	const [onlyPersonal, setOnlyPersonal] = useState(false),
		[search, setSearch] = useState(""),
		[language, setLanguage] = useState("ru"),
		[selection, setSelection] = useState("");
	const [expanded, setExpanded] = useState(new Set<string>()),
		known = useRef(new Set<string>());
	const [comparison, setComparison] = useState(false),
		[notice, setNotice] = useState("");
	const [editor, setEditor] = useState<{
			key: string;
			source: Bind;
			original?: Bind;
		} | null>(null),
		[dirty, setDirty] = useState(false);
	const [pending, setPending] = useState<(() => void) | null>(null),
		[reset, setReset] = useState<{ source: Bind; personal: Bind } | null>(null),
		[resetting, setResetting] = useState(false),
		[resetError, setResetError] = useState("");
	const completeTree = buildLibraryTree(data, items, language, employee.id);
	const tree = onlyPersonal
		? personalTree(completeTree, data.categories, data.folders)
		: completeTree;
	const all = flattenLibrary(tree),
		visible = searchLibraryTree(tree, search),
		selected = all.find((n) => nodeKey(n) === selection),
		bind = selected?.bind;
	const source = bind
		? data.binds.find(
				(b) => b.ownerId === null && b.id === (bind.sourceBindId ?? bind.id),
			)
		: undefined;
	const personal = bind?.ownerId === employee.id ? bind : undefined;
	const translation =
			bind?.translations.find((t) => t.language === language) ??
			bind?.translations[0],
		originalTranslation =
			source?.translations.find((t) => t.language === language) ??
			source?.translations[0];
	const canEdit =
		can(user?.access, "binds.manage") &&
		Boolean(source) &&
		!source?.archived &&
		!query.error;
	const location = nodeLocation(selected, data);
	const path = [
		{
			label: "Бинды сотрудника",
			node: undefined as KnowledgeTreeNode | undefined,
		},
	];
	if (selected) {
		const category = all.find(
			(n) => n.type === "category" && n.id === location.categoryId,
		);
		path.push({ label: category?.name ?? "Без раздела", node: category });
		const chain: typeof path = [],
			seen = new Set<string>();
		let folder = data.folders.find((f) => f.id === location.folderId);
		while (folder && !seen.has(folder.id)) {
			seen.add(folder.id);
			chain.unshift({
				label: folder.name,
				node: all.find((n) => n.type === "folder" && n.id === folder?.id),
			});
			folder = data.folders.find((f) => f.id === folder?.parentId);
		}
		path.push(...chain);
	}
	useEffect(() => {
		const added = data.categories.filter((c) => !known.current.has(c.id));
		for (const c of added) known.current.add(c.id);
		if (added.length)
			setExpanded((old) => new Set([...old, ...added.map((c) => c.id)]));
	}, [query.data]);
	function guard(action: () => void) {
		if (dirty) setPending(() => action);
		else action();
	}
	function navigate(action: () => void) {
		guard(() => {
			setEditor(null);
			setDirty(false);
			setComparison(false);
			action();
		});
	}
	function reveal(node: KnowledgeTreeNode) {
		const loc = nodeLocation(node, data);
		setExpanded((old) => {
			const next = new Set(old);
			next.add(loc.categoryId);
			let folder = data.folders.find((f) => f.id === loc.folderId);
			const seen = new Set<string>();
			while (folder && !seen.has(folder.id)) {
				seen.add(folder.id);
				next.add(folder.id);
				folder = data.folders.find((f) => f.id === folder?.parentId);
			}
			return next;
		});
	}
	function select(node?: KnowledgeTreeNode) {
		navigate(() => {
			setSelection(node ? nodeKey(node) : "");
			if (node) reveal(node);
		});
	}
	function saved(bind: Bind) {
		client.setQueryData<EmployeeLibrary>(queryKey, (old) =>
			old
				? {
						...old,
						binds: [bind, ...old.binds.filter((b) => b.id !== bind.id)],
					}
				: old,
		);
		setEditor(null);
		setDirty(false);
		setSearch("");
		setSelection(`bind:${bind.id}`);
		setNotice(
			`Личная версия сохранена для ${employeeName(employee)}. Общий оригинал не изменён.`,
		);
		void client.invalidateQueries({ queryKey });
	}
	return (
		<section
			className="library-workbench employee-library"
			aria-label="Библиотека сотрудника"
		>
			<header className="library-toolbar">
				<div className="library-toolbar-title">
					<Users size={20} />
					<div>
						<h2>Бинды сотрудников</h2>
						<p>Общие ответы и личные материалы в одном дереве.</p>
					</div>
				</div>
				<div className="ui-actions">
					<Button
						variant="ghost"
						aria-label="Обновить бинды сотрудника"
						disabled={query.isFetching}
						onClick={() => void query.refetch()}
					>
						<RefreshCw size={16} />
					</Button>
					<Button variant="secondary" onClick={() => navigate(onCommon)}>
						<ArrowLeft size={15} />
						Общая база
					</Button>
				</div>
			</header>
			<div className="employee-library-profile">
				<button
					type="button"
					className="employee-profile-picker"
					aria-label="Выбрать другого сотрудника"
					onClick={() => navigate(onChoose)}
				>
					<span className="employee-avatar">{employeeInitials(employee)}</span>
					<span>
						<strong>{employeeName(employee)}</strong>
						<small>{employee.email}</small>
					</span>
					<ChevronDown size={16} />
				</button>
				<div className="employee-library-summary">
					<strong>
						{items.length}
						<small>доступно</small>
					</strong>
					<strong>
						{ownCount}
						<small>личных материалов</small>
					</strong>
				</div>
				<div
					className="employee-library-filters"
					role="group"
					aria-label="Материалы сотрудника"
				>
					<button
						type="button"
						aria-pressed={!onlyPersonal}
						onClick={() =>
							navigate(() => {
								setOnlyPersonal(false);
								setSelection("");
							})
						}
					>
						Все бинды
					</button>
					<button
						type="button"
						aria-pressed={onlyPersonal}
						onClick={() =>
							navigate(() => {
								setOnlyPersonal(true);
								setSelection("");
							})
						}
					>
						<UserRound size={13} />
						Личные материалы
					</button>
				</div>
			</div>
			{notice && (
				<output className="library-notice">
					<Check size={14} />
					{notice}
				</output>
			)}
			{query.error && (
				<ErrorState
					title="Не удалось загрузить бинды сотрудника."
					description={
						query.data
							? "Показана последняя загруженная версия."
							: "Повторите загрузку библиотеки."
					}
					onRetry={() => void query.refetch()}
					retrying={query.isFetching}
					className="mb-4"
				/>
			)}
			{!query.data ? (
				!query.error && (
					<LoadingState message="Загружаем папки и бинды сотрудника…" />
				)
			) : (
				<div className="library-canvas">
					<aside
						className="library-structure"
						aria-label="Структура биндов сотрудника"
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
							</div>
						</div>
						<div className="library-search">
							<Search size={14} />
							<input
								aria-label="Поиск в дереве сотрудника"
								placeholder="Папка, название или текст…"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
							{search && (
								<button
									type="button"
									aria-label="Очистить поиск биндов"
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
							{onlyPersonal ? "Личные материалы" : "Все материалы"}
							<small>{onlyPersonal ? ownCount : items.length}</small>
						</button>
						<div className="library-tree-scroll">
							<LibraryTree
								nodes={visible}
								selected={selection}
								expanded={expanded}
								searching={Boolean(search.trim())}
								personalOwnerId={employee.id}
								personalStructureIds={personalStructureIds}
								canEdit={false}
								onExpand={(id) =>
									setExpanded((old) => {
										const next = new Set(old);
										next.has(id) ? next.delete(id) : next.add(id);
										return next;
									})
								}
								onSelect={select}
								onAction={() => {}}
								onDropNode={() => {}}
							/>
							{!visible.length && (
								<p className="library-tree-empty">
									{search ? "Ничего не найдено" : "Личных материалов пока нет"}
								</p>
							)}
						</div>
						<footer className="library-structure-footer">
							<UserRound size={12} />
							<span>Личный материал сотрудника</span>
							<p>Общие оригиналы дополняются его личными версиями.</p>
						</footer>
					</aside>
					<div className="library-detail">
						<nav
							className="library-breadcrumbs"
							aria-label="Расположение материала"
						>
							{path.map((part, i) => (
								<span key={i}>
									{i > 0 && <ChevronRight size={12} />}
									<button
										type="button"
										disabled={i > 0 && !part.node}
										onClick={() => select(part.node)}
									>
										{part.label}
									</button>
								</span>
							))}
							{bind && (
								<>
									<ChevronRight size={12} />
									<strong>{selected?.name}</strong>
								</>
							)}
						</nav>
						{editor ? (
							<SharedBindEditor
								key={editor.key}
								embedded
								personal
								original={editor.original ?? editor.source}
								initialLanguage={language}
								draftSourceId={editor.source.id}
								draftTargetId={employee.id}
								onDirtyChange={setDirty}
								onClose={() => navigate(() => {})}
								save={(draft, latest) =>
									sharedBindsService.savePersonal({
										source: editor.source,
										original:
											latest === undefined
												? editor.original
												: (latest ?? undefined),
										userId: employee.id,
										...draft,
									})
								}
								onSaved={saved}
							/>
						) : bind ? (
							<>
								<header className="library-material-heading">
									<div>
										<span
											className={`employee-version-badge${personal ? " is-personal" : ""}`}
										>
											{personal ? <UserRound size={12} /> : <Users size={12} />}{" "}
											{personal
												? source
													? "Личная версия сотрудника"
													: "Личный материал"
												: "Общая версия"}
										</span>
										<h1>{translation?.title || selected?.name}</h1>
										<p>
											Обновлён{" "}
											{new Date(bind.updatedAt).toLocaleString("ru-RU")}
										</p>
									</div>
									<div className="ui-actions">
										{canEdit && (
											<>
												<Button
													variant="primary"
													onClick={() =>
														navigate(() =>
															setEditor({
																key: crypto.randomUUID(),
																source: source!,
																original: personal,
															}),
														)
													}
												>
													<Pencil size={15} />
													{personal
														? "Редактировать личную версию"
														: "Создать личную версию"}
												</Button>
												{personal && (
													<Button
														variant="secondary"
														onClick={() => {
															setResetError("");
															setReset({ source: source!, personal });
														}}
													>
														<RotateCcw size={15} />
														Вернуть общую
													</Button>
												)}
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
								{personal && source && (
									<div className="employee-source-note">
										<span>
											{new Date(personal.sourceHash ?? "").getTime() !==
											new Date(source.updatedAt).getTime()
												? "Общий оригинал обновился. Личная версия сотрудника сохранена."
												: "Этот ответ отличается от общей версии только для выбранного сотрудника."}
										</span>
										<Button
											variant="ghost"
											size="small"
											aria-pressed={comparison}
											onClick={() => setComparison(!comparison)}
										>
											{comparison ? "Закрыть сравнение" : "Сравнить с общей"}
										</Button>
									</div>
								)}
								<div
									className="library-language-tabs"
									aria-label="Язык материала"
								>
									{languages.map((l) => (
										<button
											type="button"
											key={l.code}
											aria-pressed={language === l.code}
											onClick={() => setLanguage(l.code)}
										>
											{l.code.toUpperCase()}
											<span
												className={
													bind.translations.some(
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
								{comparison && personal && source ? (
									<section
										className="employee-comparison"
										aria-label="Сравнение версий"
									>
										<div>
											<h2>
												Общий оригинал ·{" "}
												{originalTranslation?.language.toUpperCase()}
											</h2>
											<article className="library-reading prose prose-sm dark:prose-invert">
												<ReactMarkdown remarkPlugins={[remarkGfm]}>
													{originalTranslation?.content ?? ""}
												</ReactMarkdown>
											</article>
										</div>
										<div>
											<h2>
												Версия сотрудника ·{" "}
												{translation?.language.toUpperCase()}
											</h2>
											<article className="library-reading prose prose-sm dark:prose-invert">
												<ReactMarkdown remarkPlugins={[remarkGfm]}>
													{translation?.content ?? ""}
												</ReactMarkdown>
											</article>
										</div>
									</section>
								) : (
									<article className="library-reading prose prose-sm dark:prose-invert">
										<ReactMarkdown remarkPlugins={[remarkGfm]}>
											{translation?.content ?? ""}
										</ReactMarkdown>
									</article>
								)}
								{translation?.agentInstructions && (
									<details className="library-agent-note">
										<summary>Инструкция для сотрудника</summary>
										<p>{translation.agentInstructions}</p>
									</details>
								)}
								{bind.tags.length > 0 && (
									<div className="library-tags">
										{bind.tags.map((tag) => (
											<span key={tag}>#{tag}</span>
										))}
									</div>
								)}
							</>
						) : (
							<div className="library-folder-view">
								<header className="library-material-heading">
									<div>
										<span className="library-eyebrow">
											{selected?.type === "folder"
												? "Папка"
												: onlyPersonal
													? "Личные материалы"
													: "Библиотека сотрудника"}
										</span>
										<h1>{selected?.name ?? employeeName(employee)}</h1>
										<p>
											{selected
												? bindCount(selected)
												: onlyPersonal
													? ownCount
													: items.length}{" "}
											материалов · выберите папку или бинд
										</p>
									</div>
								</header>
								<div className="library-folder-grid">
									{(selected?.children ?? tree)
										.filter((n) => n.type !== "bind")
										.map((n) => (
											<button
												type="button"
												key={nodeKey(n)}
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
									{(selected?.children ?? tree)
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
														{n.bind?.ownerId === employee.id
															? "Личный материал"
															: "Общая версия"}{" "}
														·{" "}
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
											onlyPersonal
												? "У сотрудника пока нет личных материалов"
												: "В этой папке пока пусто"
										}
										description={
											onlyPersonal
												? "Общие ответы доступны во вкладке «Все бинды»."
												: "Материалы появятся здесь после добавления."
										}
									/>
								)}
							</div>
						)}
					</div>
				</div>
			)}
			{pending && (
				<BaseModal
					title="Перейти без сохранения?"
					size="sm"
					onClose={() => setPending(null)}
				>
					<p className="library-dialog-note">
						Правки личной версии ещё не сохранены для сотрудника. Можно остаться
						в редакторе и завершить работу.
					</p>
					<div className="ui-actions justify-end">
						<Button variant="secondary" onClick={() => setPending(null)}>
							Остаться
						</Button>
						<Button
							variant="primary"
							onClick={() => {
								const next = pending;
								setPending(null);
								next();
							}}
						>
							Перейти
						</Button>
					</div>
				</BaseModal>
			)}
			{reset && (
				<BaseModal
					title="Вернуть общую версию?"
					size="sm"
					onClose={() => !resetting && setReset(null)}
					closeDisabled={resetting}
				>
					<p className="library-dialog-note">
						Личная версия «{reset.personal.translations[0]?.title}» будет
						сброшена только для {employeeName(employee)}. Сотрудник снова увидит
						общий оригинал.
					</p>
					{resetError && (
						<p role="alert" className="library-error">
							{resetError}
						</p>
					)}
					<div className="ui-actions justify-end">
						<Button
							variant="secondary"
							disabled={resetting}
							onClick={() => setReset(null)}
						>
							Отмена
						</Button>
						<Button
							variant="primary"
							loading={resetting}
							onClick={async () => {
								setResetting(true);
								setResetError("");
								try {
									await sharedBindsService.resetPersonal(
										reset.source,
										reset.personal,
										employee.id,
									);
									client.setQueryData<EmployeeLibrary>(queryKey, (old) =>
										old
											? {
													...old,
													binds: old.binds.filter(
														(b) => b.id !== reset.personal.id,
													),
												}
											: old,
									);
									setSelection(`bind:${reset.source.id}`);
									setReset(null);
									setComparison(false);
									setNotice("Для сотрудника восстановлена общая версия");
									void client.invalidateQueries({ queryKey });
								} catch (error) {
									setResetError(
										error instanceof Error
											? error.message
											: "Не удалось восстановить общую версию",
									);
								} finally {
									setResetting(false);
								}
							}}
						>
							Вернуть общую
						</Button>
					</div>
				</BaseModal>
			)}
		</section>
	);
}
