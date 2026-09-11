import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Copy, Pencil, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuthStore } from "@/store/auth.store";
import { useKnowledgeStore } from "@/store";
import { sharedBindsService } from "@/services/shared-binds.service";
import { BaseModal } from "@/shared/modals/BaseModal";
import { BindProposals } from "./BindProposals";
import type { Bind } from "@/entities/bind";
import type { BindBranches } from "@/services/shared-binds.service";
import { SharedBindEditor } from "./SharedBindsPage";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useToast } from "@/shared/hooks/useToast";
import { can } from "../../../shared/access.js";

export function useWorkspaceSharedBinds() {
	const user = useAuthStore((s) => s.session?.user);
	const enabled = can(user?.access, "binds.read");
	const common = useQuery({
		queryKey: ["shared-binds", user?.id],
		queryFn: () => sharedBindsService.list(),
		enabled,
		refetchInterval: 30000,
	});
	const personal = useQuery({
		queryKey: ["personal-binds", user?.id, user?.id],
		queryFn: () => sharedBindsService.personal(user!.id),
		enabled,
		refetchInterval: 30000,
	});
	const branches = useQuery({
		queryKey: ["bind-branches", user?.id],
		queryFn: () => sharedBindsService.branches(),
		enabled,
		refetchInterval: 30000,
	});
	return { user, common, personal, branches };
}

export function matchLocalBind(base: Bind, locals: Bind[]) {
	const exact = locals.find(
		(b) => b.id === base.id || b.sourceBindId === base.id,
	);
	if (exact) return exact;
	const matches = locals.filter((b) => b.slug === base.slug && !b.archived);
	return matches.length === 1 ? matches[0] : undefined;
}

// Keep cloud records separate from the browser's editable knowledge snapshot.
export function WorkspaceSharedBindsSync() {
	const { user, common, personal, branches } = useWorkspaceSharedBinds();
	const locals = useKnowledgeStore((s) => s.binds);
	useEffect(() => {
		const values = (common.data ?? [])
			.filter((b) => !b.archived)
			.map((base) => {
				const own = (personal.data ?? []).find(
					(b) => b.sourceBindId === base.id && !b.archived,
				);
				const local = matchLocalBind(base, locals);
				return {
					...resolveBranch(base, own ?? local, branches.data).bind,
					id: local?.id ?? base.id,
					sourceBindId: base.id,
				};
			});
		useKnowledgeStore.setState({ remoteBinds: values });
	}, [user?.id, common.data, personal.data, branches.data, locals]);
	useEffect(
		() => () => {
			useKnowledgeStore.setState({ remoteBinds: [] });
		},
		[],
	);
	return null;
}

export function WorkspaceSharedTree({
	onNavigate,
}: {
	onNavigate?: () => void;
}) {
	const { common, personal, branches } = useWorkspaceSharedBinds();
	const binds = useKnowledgeStore((s) => s.remoteBinds),
		language = useKnowledgeStore((s) => s.language),
		search = useKnowledgeStore((s) => s.search),
		active = useKnowledgeStore((s) => s.activeTab);
	const navigate = useNavigate();
	const locals = useKnowledgeStore((s) => s.binds);
	const items = binds
		.filter((b) => !locals.some((local) => local.id === b.id))
		.filter(
			(b) =>
				!search.trim() ||
				JSON.stringify(b.translations)
					.toLowerCase()
					.includes(search.trim().toLowerCase()),
		);
	return (
		<div>
			{(common.error || personal.error) && (
				<p role="alert" className="p-2 text-xs text-red-400">
					{(common.error ?? personal.error)?.message}
				</p>
			)}
			{common.isPending && (
				<p className="p-2 text-xs text-muted">Загрузка биндов…</p>
			)}
			{items.map((bind) => (
				<button
					type="button"
					key={bind.id}
					onClick={() => {
						useKnowledgeStore.getState().openBind(bind.id);
						void navigate({ to: "/" });
						onNavigate?.();
					}}
					className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${active === bind.id ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}
				>
					<FileText size={14} className="shrink-0" />
					<span className="truncate">
						{(
							bind.translations.find((t) => t.language === language) ??
							bind.translations[0]
						)?.title ?? bind.slug}
					</span>
				</button>
			))}
		</div>
	);
}

export function resolveBranch(
	base: Bind,
	own: Bind | undefined,
	branches: BindBranches | undefined,
) {
	const choice = branches?.choices[base.id] ?? "mine";
	const received = branches?.incoming.find(
		(s) => s.sourceId === base.id && s.id === choice,
	);
	if (received)
		return { branch: choice, bind: received.bind, label: received.sender };
	if (choice === "main")
		return { branch: "main", bind: base, label: "Основная" };
	return {
		branch: "mine",
		bind: own ?? base,
		label: own ? "Моя" : "Моя · из основной",
	};
}

export function WorkspaceSharedBindViewer({ id }: { id: string }) {
	const { user, common, personal, branches } = useWorkspaceSharedBinds();
	const client = useQueryClient();
	const { showToast } = useToast();
	const base = common.data?.find((b) => b.id === id),
		savedOwn = personal.data?.find((b) => b.sourceBindId === id && !b.archived);
	const locals = useKnowledgeStore((s) => s.binds);
	const local = base ? matchLocalBind(base, locals) : undefined;
	const own = savedOwn ?? local;
	const [editor, setEditor] = useState<Bind | null>(null),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const [compare, setCompare] = useState(false),
		[historyOpen, setHistoryOpen] = useState(false),
		[shareOpen, setShareOpen] = useState(false),
		[email, setEmail] = useState("");
	useEffect(() => {
		setEditor(null);
		setShareOpen(false);
		setError("");
		setHistoryOpen(false);
		setCompare(false);
	}, [id]);
	const language = useKnowledgeStore((s) => s.language);
	const history = useQuery({
		queryKey: ["bind-history", user?.id, id],
		queryFn: () => sharedBindsService.history(id),
		enabled: historyOpen,
	});
	const choose = async (branch: string) => {
		await sharedBindsService.branchAction("choose", { sourceId: id, branch });
		client.setQueryData<BindBranches>(["bind-branches", user?.id], (current) =>
			current
				? { ...current, choices: { ...current.choices, [id]: branch } }
				: current,
		);
		await client.invalidateQueries({ queryKey: ["bind-branches", user?.id] });
	};
	const action = async (fn: () => Promise<unknown>) => {
		setBusy(true);
		setError("");
		try {
			await fn();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	if (common.isPending || personal.isPending || branches.isPending)
		return <p className="p-6 text-muted">Открываем ветки бинда…</p>;
	if (common.error || personal.error || branches.error)
		return (
			<div className="p-6">
				<p role="alert" className="text-red-400">
					{(common.error ?? personal.error ?? branches.error)?.message}
				</p>
				<button
					onClick={() => {
						void common.refetch();
						void personal.refetch();
						void branches.refetch();
					}}
					className="mt-3 text-sm underline"
				>
					Повторить
				</button>
			</div>
		);
	if (!base) return <p className="p-6 text-muted">Бинд больше недоступен.</p>;
	const selected = resolveBranch(base, own, branches.data);
	const item = selected.bind;
	const translation =
		item.translations.find((t) => t.language === language) ??
		item.translations[0];
	const incoming =
		branches.data?.incoming.filter((s) => s.sourceId === id) ?? [];
	const outgoing =
		branches.data?.outgoing.filter((s) => s.sourceId === id) ?? [];
	const originalText = base.translations.find(
		(t) => t.language === translation?.language,
	);
	const comparison = selected.branch === "main" ? (own ?? base) : item;
	const comparisonText = comparison.translations.find(
		(t) => t.language === translation?.language,
	);
	return (
		<div className="supportos-scroll min-h-0 flex-1 overflow-auto p-5 sm:p-8">
			<div className="mx-auto max-w-5xl space-y-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div
						role="group"
						aria-label="Быстрый выбор версии"
						className="flex gap-1 rounded-xl border border-border bg-surface p-1"
					>
						{[
							{ id: "main", label: "Общая" },
							{ id: "mine", label: "Моя" },
						].map((v) => (
							<button
								key={v.id}
								type="button"
								disabled={busy}
								aria-pressed={selected.branch === v.id}
								onClick={() => void action(() => choose(v.id))}
								className="rounded-lg px-4 py-2 text-sm text-muted aria-pressed:bg-surface-elevated aria-pressed:text-foreground"
							>
								{v.label}
							</button>
						))}
					</div>
					<label className="flex items-center gap-3 text-xs text-muted">
						Ветка
						<select
							aria-label="Ветка бинда"
							value={selected.branch}
							disabled={busy}
							onChange={(e) => void action(() => choose(e.target.value))}
							className="max-w-64 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground"
						>
							<option value="main">Основная · для команды</option>
							<option value="mine">
								{own ? "Моя версия" : "Моя · наследует основную"}
							</option>
							{incoming.map((s) => (
								<option key={s.id} value={s.id}>
									От {s.sender}
								</option>
							))}
						</select>
					</label>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							aria-pressed={compare}
							onClick={() => setCompare((v) => !v)}
							className="rounded-xl border border-border px-3 py-2 text-xs"
						>
							Сравнить
						</button>
						<button
							type="button"
							aria-expanded={historyOpen}
							onClick={() => setHistoryOpen((v) => !v)}
							className="rounded-xl border border-border px-3 py-2 text-xs"
						>
							История
						</button>
						<button
							type="button"
							disabled={busy}
							onClick={() => {
								setError("");
								setShareOpen(true);
							}}
							className="rounded-xl border border-border px-3 py-2 text-xs disabled:opacity-40"
						>
							Поделиться
						</button>
					</div>
				</div>
				{error && !shareOpen && (
					<p role="alert" className="text-sm text-red-400">
						{error}
					</p>
				)}
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="mb-2 text-xs text-muted">
							{selected.label}
							{incoming.some((s) => s.id === selected.branch)
								? " · доступ только для чтения"
								: ""}
						</p>
						<h1 className="text-2xl font-semibold">{translation?.title}</h1>
					</div>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							disabled={busy}
							onClick={() => setEditor(item)}
							className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
						>
							<Pencil size={15} />
							{incoming.some((s) => s.id === selected.branch)
								? "Скопировать в мою ветку"
								: "Изменить для себя"}
						</button>
						<button
							type="button"
							onClick={() =>
								void copyToClipboard(translation?.content ?? "").then((ok) =>
									showToast(ok ? "Ответ скопирован" : "Не удалось скопировать"),
								)
							}
							className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm text-accent-foreground"
						>
							<Copy size={16} />
							Копировать
						</button>
					</div>
				</div>
				<div className="flex flex-wrap gap-2">
					{item.translations.map((t) => (
						<button
							type="button"
							key={t.language}
							onClick={() =>
								useKnowledgeStore.getState().setLanguage(t.language as any)
							}
							aria-pressed={translation?.language === t.language}
							className="rounded-lg border border-border px-3 py-1 text-xs uppercase aria-pressed:bg-surface-elevated"
						>
							{t.language}
						</button>
					))}
				</div>
				{own &&
					new Date(own.sourceHash ?? "").getTime() !==
						new Date(base.updatedAt).getTime() && (
						<p className="text-xs text-amber-400">
							Основная ветка обновилась. Сравните изменения перед
							редактированием своей.
						</p>
					)}
				<article className="rounded-2xl border border-border bg-surface p-6 leading-7 whitespace-pre-wrap break-words">
					<ReactMarkdown remarkPlugins={[remarkGfm]}>
						{translation?.content ?? ""}
					</ReactMarkdown>
				</article>
				{compare && (
					<section className="grid gap-3 md:grid-cols-2">
						<div className="rounded-xl border border-border bg-surface p-4">
							<h2 className="mb-3 text-sm font-semibold">
								Основная · {translation?.language}
							</h2>
							<p className="whitespace-pre-wrap break-words text-sm leading-6">
								{originalText?.content ?? "Нет перевода на этом языке"}
							</p>
							<p className="mt-3 text-xs text-muted">
								Теги: {base.tags.join(", ") || "нет"}
							</p>
						</div>
						<div className="rounded-xl border border-border bg-surface p-4">
							<h2 className="mb-3 text-sm font-semibold">
								{selected.branch === "main" ? "Моя" : selected.label} ·{" "}
								{translation?.language}
							</h2>
							<p className="whitespace-pre-wrap break-words text-sm leading-6">
								{comparisonText?.content ?? "Нет перевода на этом языке"}
							</p>
							<p className="mt-3 text-xs text-muted">
								Теги: {comparison.tags.join(", ") || "нет"}
							</p>
						</div>
					</section>
				)}
				{historyOpen && (
					<section className="rounded-2xl border border-border bg-surface p-4">
						<h2 className="mb-3 text-sm font-semibold">
							История основной и моей веток · последние 50 версий
						</h2>
						{history.isPending && (
							<p className="text-xs text-muted">Загрузка…</p>
						)}
						{history.error && (
							<p role="alert" className="text-red-400">
								{history.error.message}
							</p>
						)}
						{history.data?.map((revision) => (
							<details
								key={revision.id}
								className="border-t border-border py-3"
							>
								<summary className="cursor-pointer text-xs">
									{revision.owner_id ? "Моя" : "Основная"} ·{" "}
									{new Date(revision.created_at).toLocaleString("ru")}{" "}
									{revision.operation === "DELETE" ? "· удаление" : ""}
								</summary>
								{revision.snapshot.translations.map((t) => (
									<p
										key={t.language}
										className="mt-3 whitespace-pre-wrap break-words text-sm"
									>
										{t.language} · {t.title}
										{"\n"}
										{t.content}
									</p>
								))}
								<button
									type="button"
									disabled={busy}
									onClick={() => setEditor(revision.snapshot)}
									className="mt-3 rounded-lg border border-border px-3 py-2 text-xs"
								>
									Взять за основу моей версии
								</button>
							</details>
						))}
					</section>
				)}
				{savedOwn && (
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							disabled={busy}
							onClick={() =>
								void action(async () => {
									await sharedBindsService.branchAction("propose", {
										sourceId: id,
										expected: base.updatedAt,
									});
									await client.invalidateQueries({
										queryKey: ["bind-proposals"],
									});
									showToast("Предложение отправлено на проверку");
								})
							}
							className="rounded-xl border border-border px-3 py-2 text-xs"
						>
							Предложить мою версию команде
						</button>
						<button
							type="button"
							disabled={busy}
							onClick={() => {
								if (
									window.confirm(
										"Удалить свою ветку этого бинда? Доступ коллег к ней тоже будет отозван.",
									)
								)
									void action(async () => {
										if (savedOwn)
											await sharedBindsService.resetPersonal(
												base,
												savedOwn,
												user!.id,
											);
										await choose("main");
										await Promise.all([
											client.invalidateQueries({
												queryKey: ["personal-binds"],
											}),
											client.invalidateQueries({ queryKey: ["bind-branches"] }),
											client.invalidateQueries({ queryKey: ["bind-history"] }),
										]);
									});
							}}
							className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted"
						>
							<RotateCcw size={13} />
							Сбросить мою ветку
						</button>
					</div>
				)}
				<BindProposals sourceId={id} />
				{editor && user && (
					<SharedBindEditor
						personal
						original={editor}
						onClose={() => setEditor(null)}
						save={(draft) =>
							sharedBindsService.savePersonal({
								source: base,
								original: savedOwn,
								userId: user.id,
								...draft,
							})
						}
						onSaved={() => {
							setEditor(null);
							void action(async () => {
								await Promise.all([
									client.invalidateQueries({ queryKey: ["personal-binds"] }),
									client.invalidateQueries({ queryKey: ["bind-history"] }),
								]);
								await choose("mine");
							});
						}}
					/>
				)}
				{shareOpen && (
					<BaseModal
						title="Поделиться моей веткой"
						closeDisabled={busy}
						onClose={() => setShareOpen(false)}
					>
						<p className="mb-4 text-sm leading-6 text-muted">
							Сотрудник сможет читать вашу ветку и видеть её обновления. Для
							редактирования он создаст свою копию. Отзыв доступа не удаляет уже
							сделанные копии.
						</p>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								void action(async () => {
									if (!savedOwn) {
										await sharedBindsService.savePersonal({
											source: base,
											original: undefined,
											userId: user!.id,
											translations: (own ?? base).translations,
											tags: (own ?? base).tags,
										});
										await client.invalidateQueries({
											queryKey: ["personal-binds"],
										});
									}
									await sharedBindsService.branchAction("share", {
										sourceId: id,
										email,
									});
									setEmail("");
									await client.invalidateQueries({
										queryKey: ["bind-branches"],
									});
									showToast("Доступ к ветке предоставлен");
								});
							}}
							className="flex flex-wrap gap-2"
						>
							<input
								type="email"
								required
								aria-label="Почта сотрудника"
								placeholder="colleague@company.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								disabled={busy}
								className="min-w-48 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
							/>
							<button
								type="submit"
								disabled={busy}
								className="rounded-xl bg-accent px-4 py-2 text-sm text-accent-foreground"
							>
								Предоставить доступ
							</button>
						</form>
						{error && (
							<p role="alert" className="mt-3 text-sm text-red-400">
								{error}
							</p>
						)}
						<h3 className="mb-2 mt-5 text-xs font-semibold text-muted">
							У кого есть доступ
						</h3>
						{!outgoing.length && (
							<p className="text-sm text-muted">Пока только у вас.</p>
						)}
						{outgoing.map((s) => (
							<div
								key={s.id}
								className="flex items-center justify-between gap-3 border-t border-border py-3"
							>
								<div className="min-w-0">
									<p className="truncate text-sm">{s.recipient}</p>
									<p className="truncate text-xs text-muted">{s.email}</p>
								</div>
								<button
									type="button"
									disabled={busy}
									onClick={() =>
										void action(async () => {
											await sharedBindsService.branchAction("revoke", {
												shareId: s.id,
											});
											await client.invalidateQueries({
												queryKey: ["bind-branches"],
											});
										})
									}
									className="text-xs text-red-400"
								>
									Отозвать
								</button>
							</div>
						))}
					</BaseModal>
				)}
			</div>
		</div>
	);
}
