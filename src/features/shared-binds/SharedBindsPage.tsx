import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BookOpen,
	Check,
	Copy,
	Globe2,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Users,
	RotateCcw,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Bind, BindTranslation } from "@/entities/bind";
import { useAuthStore } from "@/store/auth.store";
import { CommonBindImport } from "./CommonBindImport";
import { can } from "../../../shared/access.js";
import { sharedBindsService } from "@/services/shared-binds.service";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useToast } from "@/shared/hooks/useToast";
import { BaseModal } from "@/shared/modals/BaseModal";
import { languages } from "@/entities/language";

const inputClass =
	"w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
export function SharedBindsPage() {
	const user = useAuthStore((s) => s.session?.user);
	const canEdit = can(user?.access, "knowledge.write");
	const canManage = can(user?.access, "binds.manage");
	const [mode, setMode] = useState<"personal" | "common" | "manage">(
		"personal",
	);
	const [target, setTarget] = useState("");
	const [userSearch, setUserSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedSearch(userSearch), 250);
		return () => clearTimeout(timer);
	}, [userSearch]);
	const usersQuery = useQuery({
		queryKey: ["bind-users", user?.id, debouncedSearch],
		queryFn: () => sharedBindsService.users(debouncedSearch),
		enabled: canManage && mode === "manage",
	});
	const targetId = mode === "manage" && canManage ? target : (user?.id ?? "");
	const personalKey = ["personal-binds", user?.id, targetId];
	const personalQuery = useQuery({
		queryKey: personalKey,
		queryFn: () => sharedBindsService.personal(targetId),
		enabled: mode !== "common" && Boolean(targetId),
		refetchInterval: 30000,
		refetchOnWindowFocus: true,
	});
	const [resetting, setResetting] = useState(false);
	const client = useQueryClient();
	const queryKey = ["shared-binds", user?.id];
	const query = useQuery({
		queryKey,
		queryFn: () => sharedBindsService.list(),
		refetchInterval: 30000,
		refetchOnWindowFocus: true,
	});
	const [search, setSearch] = useState("");
	const [language, setLanguage] = useState("ru");
	const [selected, setSelected] = useState<string>();
	const [editor, setEditor] = useState<{
		original?: Bind;
		source?: Bind;
		userId?: string;
	} | null>(null);
	const { showToast } = useToast();
	const sources = (query.data ?? []).filter((b) => !b.archived);
	const overrides =
		mode === "common"
			? []
			: (personalQuery.data ?? []).filter((b) => !b.archived);
	const items = sources
		.map((base) => overrides.find((b) => b.sourceBindId === base.id) ?? base)
		.filter(
			(b) =>
				!search.trim() ||
				[...b.tags, ...b.translations.flatMap((t) => [t.title, t.content])]
					.join(" ")
					.toLocaleLowerCase()
					.includes(search.trim().toLocaleLowerCase()),
		);
	const bind = items.find((b) => b.id === selected) ?? items[0];
	const source = sources.find((b) => b.id === (bind?.sourceBindId ?? bind?.id));
	const personal = bind?.ownerId ? bind : undefined;
	const canPersonal =
		mode !== "common" &&
		Boolean(targetId) &&
		(mode !== "manage" || canManage) &&
		!personalQuery.isPending &&
		!personalQuery.error;
	const translation =
		bind?.translations.find((t) => t.language === language) ??
		bind?.translations[0];
	const reset = async () => {
		if (
			!source ||
			!personal ||
			!window.confirm("Удалить личную версию и снова использовать общий бинд?")
		)
			return;
		setResetting(true);
		try {
			await sharedBindsService.resetPersonal(source, personal, targetId);
			await client.invalidateQueries({ queryKey: personalKey });
			showToast("Восстановлена общая версия");
		} catch (e) {
			showToast(e instanceof Error ? e.message : "Не удалось сбросить версию");
		} finally {
			setResetting(false);
		}
	};
	const copy = async () => {
		try {
			await copyToClipboard(translation?.content ?? "");
			showToast("Текст скопирован");
		} catch {
			showToast("Не удалось скопировать текст");
		}
	};
	return (
		<div className="supportos-scroll min-h-0 flex-1 overflow-auto">
			<div className="mx-auto max-w-7xl p-4 sm:p-7 lg:p-9">
				<div className="mb-7 flex flex-wrap items-start justify-between gap-4">
					<div>
						<span className="text-[11px] font-semibold uppercase tracking-[.18em] text-accent">
							Знания команды
						</span>
						<h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
							Общие бинды
						</h1>
						<p className="mt-2 max-w-xl text-sm leading-6 text-muted">
							Общая основа для команды и личные версии ответов — с отдельными
							правами на изменения.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							aria-label="Обновить общие бинды"
							onClick={() => {
								void query.refetch();
								if (targetId && mode !== "common") void personalQuery.refetch();
							}}
							disabled={query.isFetching}
							className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted hover:bg-surface-elevated disabled:opacity-50"
						>
							<RefreshCw
								size={17}
								className={query.isFetching ? "animate-spin" : ""}
							/>
						</button>
						{canEdit && mode === "common" && (
							<button
								type="button"
								onClick={() => setEditor({})}
								className="flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
							>
								<Plus size={18} />
								Добавить бинд
							</button>
						)}
					</div>
				</div>
				<div className="mb-5 flex flex-wrap gap-2" aria-label="Варианты биндов">
					{(
						[
							{ id: "personal", label: "Мои ответы" },
							{ id: "common", label: "Общая база" },
							...(canManage
								? [{ id: "manage", label: "Бинды сотрудников" }]
								: []),
						] as { id: "personal" | "common" | "manage"; label: string }[]
					).map((item) => (
						<button
							key={item.id}
							type="button"
							aria-pressed={mode === item.id}
							onClick={() => {
								setMode(item.id);
								setSelected(undefined);
							}}
							className={`rounded-xl px-4 py-2.5 text-sm font-medium ${mode === item.id ? "bg-accent/10 text-accent ring-1 ring-accent/25" : "text-muted hover:bg-surface-elevated"}`}
						>
							{item.label}
						</button>
					))}
				</div>
				{mode === "common" && canEdit && <CommonBindImport />}
				{mode === "manage" && canManage && (
					<div className="mb-5 space-y-3 rounded-2xl border border-border bg-surface p-4">
						<p className="text-sm text-muted">
							Выберите сотрудника. Изменения его личной версии записываются в
							журнал.
						</p>
						<div className="flex flex-wrap gap-3">
							<input
								aria-label="Поиск сотрудника"
								placeholder="Поиск по имени или почте"
								value={userSearch}
								onChange={(e) => setUserSearch(e.target.value)}
								className={`${inputClass} max-w-sm`}
							/>
							<select
								aria-label="Сотрудник"
								value={target}
								onChange={(e) => {
									setTarget(e.target.value);
									setSelected(undefined);
								}}
								className={`${inputClass} max-w-sm`}
							>
								<option value="">Выберите сотрудника</option>
								{target &&
									!usersQuery.data?.users.some((u) => u.id === target) && (
										<option value={target}>Выбранный сотрудник</option>
									)}
								{usersQuery.data?.users.map((u) => (
									<option key={u.id} value={u.id}>
										{u.display_name ? `${u.display_name} · ` : ""}
										{u.email}
									</option>
								))}
							</select>
						</div>
						{usersQuery.isPending && (
							<p className="text-xs text-muted">Загрузка сотрудников…</p>
						)}
						{usersQuery.error && (
							<p role="alert" className="text-sm text-red-400">
								{usersQuery.error.message}
							</p>
						)}
						{(usersQuery.data?.total ?? 0) > 50 && (
							<p className="text-xs text-muted">
								Показаны первые 50 сотрудников. Уточните имя или почту.
							</p>
						)}
					</div>
				)}
				<div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
					<div className="relative min-w-48 flex-1">
						<Search size={17} className="absolute left-3 top-3 text-muted" />
						<input
							aria-label="Поиск общих биндов"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Найти ответ, название или тег…"
							className={`${inputClass} pl-10`}
						/>
					</div>
					<label className="flex items-center gap-2 text-sm text-muted">
						<Globe2 size={17} />
						<span className="sr-only">Язык ответа</span>
						<select
							value={language}
							onChange={(e) => setLanguage(e.target.value)}
							className={`${inputClass} w-auto`}
						>
							{languages.map((l) => (
								<option key={l.code} value={l.code}>
									{l.name}
								</option>
							))}
						</select>
					</label>
					<span className="px-2 text-xs text-muted">{items.length} биндов</span>
				</div>
				{mode !== "common" && personalQuery.error && (
					<p role="alert" className="mb-4 text-sm text-red-400">
						Личные версии не загружены: {personalQuery.error.message}
					</p>
				)}
				{query.error && (
					<p
						role="alert"
						className="mb-4 rounded-xl border border-red-400/25 bg-red-400/5 p-4 text-sm text-red-400"
					>
						Не удалось обновить общую базу. {query.error.message}
					</p>
				)}
				{mode === "manage" && !target ? (
					<p className="p-10 text-center text-muted">
						Выберите сотрудника, чтобы открыть его ответы.
					</p>
				) : query.isPending ||
					(mode !== "common" && personalQuery.isPending) ? (
					<div
						role="status"
						className="rounded-2xl border border-border bg-surface p-12 text-center text-muted"
					>
						Загружаем общую базу…
					</div>
				) : items.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-16 text-center">
						<Users size={32} className="mx-auto mb-4 text-accent" />
						<h2 className="text-lg font-semibold">
							{search
								? "Ничего не найдено"
								: "Первый общий ответ начинается здесь"}
						</h2>
						<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
							{search
								? "Попробуйте другое название или фразу из ответа."
								: canEdit
									? "Добавьте бинд — коллеги смогут найти и скопировать его со своих аккаунтов."
									: "Здесь появятся ответы, опубликованные руководителем или QC."}
						</p>
					</div>
				) : (
					<div className="grid gap-5 lg:grid-cols-[minmax(240px,350px)_minmax(0,1fr)]">
						<div className="space-y-2" aria-label="Список общих биндов">
							{items.map((item) => {
								const t =
									item.translations.find((t) => t.language === language) ??
									item.translations[0];
								return (
									<button
										type="button"
										key={item.id}
										onClick={() => setSelected(item.id)}
										aria-pressed={bind?.id === item.id}
										className={`w-full rounded-2xl border p-4 text-left transition ${bind?.id === item.id ? "border-accent/40 bg-accent/10" : "border-border bg-surface hover:border-accent/30"}`}
									>
										<div className="flex items-start gap-3">
											<BookOpen
												size={18}
												className="mt-0.5 shrink-0 text-accent"
											/>
											<div className="min-w-0">
												<h2 className="break-words text-sm font-semibold">
													{t?.title || item.slug}
												</h2>
												<p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-muted">
													{t?.content}
												</p>
												<span className="mt-3 block text-[11px] uppercase tracking-wide text-muted">
													{item.translations.map((t) => t.language).join(" · ")}
												</span>
											</div>
										</div>
									</button>
								);
							})}
						</div>
						{bind && (
							<article className="min-w-0 self-start overflow-hidden rounded-2xl border border-border bg-surface lg:sticky lg:top-0">
								<div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
									<div className="min-w-0 flex-1">
										<span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
											<Users size={12} />
											{mode === "common"
												? "Общий оригинал"
												: personal
													? mode === "manage"
														? "Версия сотрудника"
														: "Моя версия"
													: "Общая версия"}
										</span>
										<h2 className="break-words text-xl font-semibold">
											{translation?.title}
										</h2>
										<p className="mt-2 text-xs text-muted">
											Обновлён{" "}
											{new Date(bind.updatedAt).toLocaleString("ru-RU")}
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										{mode === "common" && canEdit && (
											<button
												type="button"
												onClick={() => setEditor({ original: bind })}
												className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-surface-elevated"
											>
												<Pencil size={15} />
												Изменить для всех
											</button>
										)}
										{canPersonal && source && (
											<button
												type="button"
												onClick={() =>
													setEditor({
														original: personal,
														source,
														userId: targetId,
													})
												}
												className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-surface-elevated"
											>
												<Pencil size={15} />
												{mode === "manage"
													? "Изменить версию"
													: "Изменить под себя"}
											</button>
										)}
										{canPersonal && personal && (
											<button
												type="button"
												disabled={resetting}
												onClick={() => void reset()}
												title="Вернуть общую версию"
												aria-label="Вернуть общую версию"
												className="rounded-xl border border-border px-3 text-muted disabled:opacity-50"
											>
												<RotateCcw size={16} />
											</button>
										)}
										<button
											type="button"
											onClick={() => void copy()}
											className="flex h-10 items-center gap-2 rounded-xl bg-accent/10 px-3 text-sm text-accent hover:bg-accent/20"
										>
											<Copy size={15} />
											Копировать
										</button>
									</div>
								</div>
								<div className="p-5 sm:p-6">
									{personal &&
										source &&
										new Date(personal.sourceHash ?? "").getTime() !==
											new Date(source.updatedAt).getTime() && (
											<p className="mb-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">
												Общий оригинал обновился. Ваша личная версия сохранена.
												Сравните ответ во вкладке «Общая база» или верните общую
												версию.
											</p>
										)}
									{translation?.language !== language && (
										<p className="mb-4 text-xs text-muted">
											Перевода на выбранный язык пока нет. Показан{" "}
											{translation?.language.toUpperCase()}.
										</p>
									)}
									<div className="prose prose-sm max-w-none break-words text-foreground dark:prose-invert">
										<ReactMarkdown remarkPlugins={[remarkGfm]}>
											{translation?.content ?? ""}
										</ReactMarkdown>
									</div>
									{bind.tags.length > 0 && (
										<div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
											{bind.tags.map((tag) => (
												<span
													key={tag}
													className="rounded-lg bg-background px-2.5 py-1 text-xs text-muted"
												>
													#{tag}
												</span>
											))}
										</div>
									)}
								</div>
							</article>
						)}
					</div>
				)}
			</div>
			{editor &&
				(!editor.userId
					? canEdit
					: editor.userId === user?.id || canManage) && (
					<SharedBindEditor
						original={editor.original ?? editor.source}
						personal={Boolean(editor.userId)}
						onClose={() => setEditor(null)}
						save={
							editor.userId && editor.source
								? (draft) =>
										sharedBindsService.savePersonal({
											source: editor.source!,
											original: editor.original,
											userId: editor.userId!,
											...draft,
										})
								: undefined
						}
						onSaved={(saved) => {
							const key = editor.userId
								? ["personal-binds", user?.id, editor.userId]
								: queryKey;
							client.setQueryData<Bind[]>(key, (old) => [
								saved,
								...(old ?? []).filter((b) => b.id !== saved.id),
							]);
							setSelected(saved.id);
							setSearch("");
							setEditor(null);
							showToast(
								editor.userId
									? "Личная версия сохранена. Общий бинд не изменён."
									: "Бинд сохранён для всей команды",
							);
							void client.invalidateQueries({ queryKey: key });
						}}
					/>
				)}
		</div>
	);
}

export function SharedBindEditor({
	original,
	onClose,
	onSaved,
	personal = false,
	save,
}: {
	original?: Bind;
	onClose: () => void;
	onSaved: (bind: Bind) => void;
	personal?: boolean;
	save?: (draft: {
		translations: BindTranslation[];
		tags: string[];
	}) => Promise<Bind>;
}) {
	const [translations, setTranslations] = useState<BindTranslation[]>(
		() =>
			original?.translations.map((t) => ({ ...t })) ?? [
				{ language: "ru", title: "", content: "", updatedAt: "" },
			],
	);
	const [language, setLanguage] = useState(
		original?.translations[0]?.language ?? "ru",
	);
	const [tags, setTags] = useState(original?.tags.join(", ") ?? "");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const dirty = useRef(false);
	const initialFocus = useRef<HTMLInputElement>(null);
	const translation = translations.find((t) => t.language === language);
	useEffect(() => {
		initialFocus.current?.focus();
		const beforeUnload = (e: BeforeUnloadEvent) => {
			if (dirty.current) {
				e.preventDefault();
				e.returnValue = "";
			}
		};
		window.addEventListener("beforeunload", beforeUnload);
		return () => window.removeEventListener("beforeunload", beforeUnload);
	}, []);
	const close = () => {
		if (
			!saving &&
			(!dirty.current ||
				window.confirm("Закрыть редактор без сохранения изменений?"))
		)
			onClose();
	};
	function update(field: "title" | "content", value: string) {
		dirty.current = true;
		setTranslations((current) => {
			const found = current.find((t) => t.language === language);
			return found
				? current.map((t) =>
						t.language === language ? { ...t, [field]: value } : t,
					)
				: [
						...current,
						{ language, title: "", content: "", updatedAt: "", [field]: value },
					];
		});
	}
	return (
		<BaseModal
			title={
				personal
					? "Личная версия ответа"
					: original
						? "Редактировать общий бинд"
						: "Новый общий бинд"
			}
			onClose={close}
			closeDisabled={saving}
			size="lg"
		>
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					if (saving) return;
					setSaving(true);
					setError("");
					try {
						const draft = { translations, tags: tags.split(",") };
						const saved = await (save
							? save(draft)
							: sharedBindsService.save({ original, ...draft }));
						dirty.current = false;
						onSaved(saved);
					} catch (e) {
						setError(e instanceof Error ? e.message : "Не удалось сохранить");
					} finally {
						setSaving(false);
					}
				}}
				className="space-y-5"
			>
				<p className="flex items-start gap-2 rounded-xl border border-accent/20 bg-accent/5 p-3 text-sm leading-6 text-muted">
					<Users size={18} className="mt-1 shrink-0 text-accent" />
					{personal
						? "Изменения сохранятся только для выбранного аккаунта. Общий оригинал и ответы коллег останутся прежними."
						: "После сохранения этот ответ будет доступен всей команде. Пустые языковые версии не публикуются."}
				</p>
				{error && (
					<p
						role="alert"
						className="rounded-xl border border-red-400/25 bg-red-400/5 p-3 text-sm text-red-400"
					>
						{error}
					</p>
				)}
				<fieldset disabled={saving} className="space-y-4 disabled:opacity-60">
					<label className="block text-sm font-medium">
						Язык перевода
						<select
							value={language}
							onChange={(e) => setLanguage(e.target.value)}
							className={`${inputClass} mt-2`}
						>
							{[
								...new Set([
									...languages.map((l) => l.code),
									...translations.map((t) => t.language),
								]),
							].map((code) => (
								<option key={code} value={code}>
									{languages.find((l) => l.code === code)?.name ?? code}
									{translations.some(
										(t) => t.language === code && t.content.trim(),
									)
										? " •"
										: ""}
								</option>
							))}
						</select>
					</label>
					<label className="block text-sm font-medium">
						Название
						<input
							ref={initialFocus}
							maxLength={200}
							value={translation?.title ?? ""}
							onChange={(e) => update("title", e.target.value)}
							placeholder="Например, условия бонуса на депозит"
							className={`${inputClass} mt-2`}
						/>
					</label>
					<label className="block text-sm font-medium">
						Текст ответа
						<textarea
							maxLength={30000}
							value={translation?.content ?? ""}
							onChange={(e) => update("content", e.target.value)}
							placeholder="Напишите готовый ответ для клиента…"
							className={`${inputClass} mt-2 min-h-52 resize-y leading-6`}
						/>
					</label>
					<label className="block text-sm font-medium">
						Теги <span className="font-normal text-muted">· через запятую</span>
						<input
							maxLength={500}
							value={tags}
							onChange={(e) => {
								dirty.current = true;
								setTags(e.target.value);
							}}
							placeholder="депозит, бонус, условия"
							className={`${inputClass} mt-2`}
						/>
					</label>
				</fieldset>
				<div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
					<button
						type="button"
						disabled={saving}
						onClick={close}
						className="rounded-xl border border-border px-4 py-2.5 text-sm hover:bg-surface-elevated disabled:opacity-50"
					>
						Отмена
					</button>
					<button
						type="submit"
						disabled={saving}
						className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
					>
						<Check size={17} />
						{saving
							? "Сохраняем…"
							: personal
								? "Сохранить личную версию"
								: "Сохранить для всех"}
					</button>
				</div>
			</form>
		</BaseModal>
	);
}
