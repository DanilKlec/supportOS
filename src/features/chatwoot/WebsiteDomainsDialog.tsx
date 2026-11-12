import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	ArrowRight,
	Check,
	ChevronRight,
	Copy,
	Globe2,
	LoaderCircle,
	MessageCircle,
	Plus,
	RefreshCw,
	Search,
	Settings2,
	Trash2,
	UsersRound,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
	type ChatwootAgent,
	type ChatwootWebsiteInbox,
	chatwootService,
} from "@/services/chatwoot.service";

type SourceForm = {
	id?: number;
	name: string;
	websiteUrl: string;
	allowedDomains: string[];
	widgetColor: string;
	widgetPosition: "left" | "right";
	widgetType: "standard" | "expanded_bubble";
	widgetLocale: string;
	launcherTitle: string;
	welcomeTitle: string;
	welcomeTagline: string;
	greetingEnabled: boolean;
	greetingMessage: string;
	operatorIds: number[];
};

const blankSource: SourceForm = {
	name: "",
	websiteUrl: "https://",
	allowedDomains: [],
	widgetColor: "#2563eb",
	widgetPosition: "right",
	widgetType: "standard",
	widgetLocale: "ru",
	launcherTitle: "",
	welcomeTitle: "Привет!",
	welcomeTagline: "Связаться с нами просто: напишите нам или задайте вопрос.",
	greetingEnabled: false,
	greetingMessage: "",
	operatorIds: [],
};

function splitDomains(value?: string | null) {
	return [
		...new Set(
			(value ?? "")
				.split(/[\n,]/)
				.map((item) =>
					item
						.trim()
						.toLowerCase()
						.replace(/^https?:\/\//, "")
						.split(/[/?#]/, 1)[0]
						.replace(/:\d+$/, "")
						.replace(/\.$/, ""),
				)
				.filter(Boolean),
		),
	];
}

function sourceForm(inbox: ChatwootWebsiteInbox): SourceForm {
	return {
		id: inbox.id,
		name: inbox.name,
		websiteUrl: inbox.website_url ?? "",
		allowedDomains: splitDomains(inbox.allowed_domains),
		widgetColor: inbox.widget_color || "#2563eb",
		widgetPosition: inbox.widget_position || "right",
		widgetType: inbox.widget_type || "standard",
		widgetLocale: inbox.widget_locale || "ru",
		launcherTitle: inbox.launcher_title || "",
		welcomeTitle: inbox.welcome_title || "Привет!",
		welcomeTagline:
			inbox.welcome_tagline ||
			"Связаться с нами просто: напишите нам или задайте вопрос.",
		greetingEnabled: inbox.greeting_enabled === true,
		greetingMessage: inbox.greeting_message || "",
		operatorIds: [],
	};
}

export function WebsiteDomainsDialog({ onClose }: { onClose: () => void }) {
	const client = useQueryClient();
	const [mode, setMode] = useState<"list" | "types" | "form" | "operators">(
		"list",
	);
	const [form, setForm] = useState<SourceForm>(blankSource);
	const [domainInput, setDomainInput] = useState("");
	const [search, setSearch] = useState("");
	const [agentSearch, setAgentSearch] = useState("");
	const [copiedSourceId, setCopiedSourceId] = useState<number | null>(null);
	const query = useQuery({
		queryKey: ["chatwoot", "website-inboxes"],
		queryFn: chatwootService.websiteInboxes,
	});
	const directory = useQuery({
		queryKey: ["chatwoot", "directory"],
		queryFn: chatwootService.inboxDirectory,
	});
	const inboxes = query.data?.inboxes ?? [];
	const baseUrl = query.data?.baseUrl ?? "";
	const agents = directory.data?.agents ?? [];
	const editing = form.id !== undefined;
	const members = useQuery({
		queryKey: ["chatwoot", "website-inbox-members", form.id],
		queryFn: () =>
			form.id === undefined
				? Promise.resolve({ operatorIds: [] })
				: chatwootService.websiteInboxMembers(form.id),
		enabled: mode === "operators" && form.id !== undefined,
	});
	useEffect(() => {
		const operatorIds = members.data?.operatorIds;
		if (operatorIds)
			setForm((current) => ({
				...current,
				operatorIds,
			}));
	}, [members.data]);
	const filteredInboxes = useMemo(
		() =>
			inboxes.filter((item) =>
				`${item.name} ${item.website_url ?? ""}`
					.toLowerCase()
					.includes(search.toLowerCase()),
			),
		[inboxes, search],
	);
	const filteredAgents = useMemo(
		() =>
			agents.filter((agent) =>
				`${agent.name} ${agent.email ?? ""}`
					.toLowerCase()
					.includes(agentSearch.toLowerCase()),
			),
		[agents, agentSearch],
	);
	const save = useMutation({
		mutationFn: () => chatwootService.saveWebsiteSource(form),
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: ["chatwoot", "website-inboxes"] }),
				client.invalidateQueries({ queryKey: ["chatwoot", "directory"] }),
			]);
			setMode("list");
			setForm(blankSource);
		},
	});
	const remove = useMutation({
		mutationFn: chatwootService.deleteWebsiteSource,
		onSuccess: async () => {
			await Promise.all([
				client.invalidateQueries({ queryKey: ["chatwoot", "website-inboxes"] }),
				client.invalidateQueries({ queryKey: ["chatwoot", "directory"] }),
			]);
		},
	});
	const set = <K extends keyof SourceForm>(key: K, value: SourceForm[K]) =>
		setForm((current) => ({ ...current, [key]: value }));
	const openNew = () => {
		save.reset();
		setForm(blankSource);
		setMode("types");
	};
	const openEdit = (inbox: ChatwootWebsiteInbox) => {
		save.reset();
		remove.reset();
		setForm(sourceForm(inbox));
		setMode("form");
	};
	const addDomains = () => {
		const values = splitDomains(domainInput);
		if (values.length)
			set("allowedDomains", [...new Set([...form.allowedDomains, ...values])]);
		setDomainInput("");
	};
	const toggleAgent = (agent: ChatwootAgent) =>
		set(
			"operatorIds",
			form.operatorIds.includes(agent.id)
				? form.operatorIds.filter((id) => id !== agent.id)
				: [...form.operatorIds, agent.id],
		);
	const domainHasError = form.allowedDomains.some(
		(value) =>
			!/^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
				value,
			),
	);
	const sourceValid =
		form.name.trim().length > 0 &&
		/^https?:\/\//i.test(form.websiteUrl) &&
		!domainHasError;
	const testHost =
		typeof window === "undefined" ? "" : window.location.hostname;
	const copyWidgetCode = async (inbox: ChatwootWebsiteInbox) => {
		if (!baseUrl || !inbox.website_token) return;
		const code = widgetSnippet(baseUrl, inbox.website_token, inbox);
		try {
			await navigator.clipboard.writeText(code);
			setCopiedSourceId(inbox.id);
			window.setTimeout(
				() =>
					setCopiedSourceId((current) =>
						current === inbox.id ? null : current,
					),
				1800,
			);
		} catch {
			window.prompt("Скопируйте код виджета", code);
		}
	};

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby="source-dialog-title"
				className="flex max-h-[min(820px,94vh)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
			>
				<header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
					<div className="flex min-w-0 items-center gap-3">
						<span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-background text-accent">
							<Globe2 size={18} />
						</span>
						<div className="min-w-0">
							<h2 id="source-dialog-title" className="text-sm font-semibold">
								Источники чатов
							</h2>
							<p className="mt-0.5 text-[11px] text-muted">
								Сайты, настройки виджета и доступ операторов
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{mode !== "list" && (
							<button
								type="button"
								onClick={() => {
									save.reset();
									setMode(
										mode === "operators"
											? "form"
											: mode === "form"
												? editing
													? "list"
													: "types"
												: "list",
									);
								}}
								className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted hover:bg-surface-elevated"
							>
								<ArrowLeft size={13} /> Назад
							</button>
						)}
						<button
							type="button"
							onClick={onClose}
							aria-label="Закрыть"
							className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated"
						>
							<X size={16} />
						</button>
					</div>
				</header>

				{mode === "list" ? (
					<>
						<div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
							<div className="relative min-w-[220px] flex-1">
								<Search
									size={14}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
								/>
								<input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Поиск по названию или домену"
									className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-accent"
								/>
							</div>
							<span className="text-xs text-muted">
								Источников: {inboxes.length}
							</span>
							<button
								type="button"
								onClick={openNew}
								className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-white hover:brightness-110"
							>
								<Plus size={14} /> Добавить источник
							</button>
						</div>
						<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto px-5">
							{query.isLoading || directory.isLoading ? (
								<div className="flex min-h-56 items-center justify-center text-xs text-muted">
									<LoaderCircle size={15} className="mr-2 animate-spin" />{" "}
									Загружаем источники
								</div>
							) : query.isError || directory.isError ? (
								<div
									role="alert"
									className="my-5 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300"
								>
									{query.error instanceof Error
										? query.error.message
										: directory.error instanceof Error
											? directory.error.message
											: "Не удалось загрузить источники"}
									<button
										type="button"
										onClick={() => {
											void query.refetch();
											void directory.refetch();
										}}
										className="inline-flex items-center gap-1 underline"
									>
										<RefreshCw size={12} /> Повторить
									</button>
								</div>
							) : filteredInboxes.length === 0 ? (
								<div className="flex min-h-64 flex-col items-center justify-center text-center">
									<div className="grid size-12 place-items-center rounded-2xl border border-border bg-background text-muted">
										<Globe2 size={20} />
									</div>
									<p className="mt-3 text-sm font-medium">
										{inboxes.length
											? "Источников не найдено"
											: "Здесь пока нет источников"}
									</p>
									<p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
										Добавьте сайт, настройте виджет и назначьте операторов. Всё
										можно будет изменить позже.
									</p>
									{!inboxes.length && (
										<button
											type="button"
											onClick={openNew}
											className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-white"
										>
											<Plus size={14} /> Добавить сайт
										</button>
									)}
								</div>
							) : (
								<div className="divide-y divide-border/80">
									{filteredInboxes.map((inbox) => (
										<article
											key={inbox.id}
											className="flex items-center gap-3 py-4"
										>
											<div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background text-accent">
												<MessageCircle size={17} />
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-semibold">
													{inbox.name}
												</div>
												<div className="mt-1 truncate text-xs text-muted">
													Сайт · {inbox.website_url || "домен не указан"}
												</div>
												<div className="mt-1 text-[10px] text-muted">
													{splitDomains(inbox.allowed_domains).length || "Все"}{" "}
													разрешённых доменов
												</div>
											</div>
											{inbox.website_token && (
												<button
													type="button"
													onClick={() => void copyWidgetCode(inbox)}
													title="Скопировать код виджета"
													className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[10px] text-muted hover:bg-surface-elevated hover:text-foreground"
												>
													{copiedSourceId === inbox.id ? (
														<Check size={13} />
													) : (
														<Copy size={13} />
													)}
													{copiedSourceId === inbox.id
														? "Скопировано"
														: "Код виджета"}
												</button>
											)}
											<button
												type="button"
												onClick={() => openEdit(inbox)}
												title="Настроить источник"
												className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted hover:bg-surface-elevated hover:text-foreground"
											>
												<Settings2 size={15} />
											</button>
											<button
												type="button"
												disabled={remove.isPending}
												onClick={() => {
													if (
														window.confirm(
															`Удалить источник «${inbox.name}»? Чаты и настройки этого Website-канала будут удалены в Chatwoot.`,
														)
													)
														remove.mutate(inbox.id);
												}}
												title="Удалить источник"
												className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
											>
												<Trash2 size={15} />
											</button>
										</article>
									))}
								</div>
							)}
							{remove.isError && (
								<p role="alert" className="mb-4 text-xs text-red-400">
									{remove.error instanceof Error
										? remove.error.message
										: "Не удалось удалить источник"}
								</p>
							)}
						</div>
						<footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
							<span className="text-[10px] text-muted">
								Управление каналами и операторами выполняется в SupportOS
							</span>
							<button
								type="button"
								onClick={onClose}
								className="h-8 rounded-lg border border-border px-3 text-xs hover:bg-surface-elevated"
							>
								Готово
							</button>
						</footer>
					</>
				) : mode === "types" ? (
					<>
						<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
							<div className="mx-auto max-w-3xl">
								<div className="mb-6">
									<h3 className="text-base font-semibold">Выберите источник</h3>
									<p className="mt-1 text-xs text-muted">
										Выберите канал, из которого клиенты будут обращаться к
										команде.
									</p>
								</div>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									<button
										type="button"
										onClick={() => setMode("form")}
										className="group min-h-40 rounded-2xl border border-accent/40 bg-accent/5 p-5 text-left transition hover:border-accent hover:bg-accent/10"
									>
										<span className="grid size-10 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
											<Globe2 size={18} />
										</span>
										<span className="mt-4 block text-sm font-semibold">
											Сайт
										</span>
										<span className="mt-1.5 block text-xs leading-relaxed text-muted">
											Добавьте виджет онлайн-чата на сайт и настройте его
											внешний вид.
										</span>
										<span className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
											Настроить <ArrowRight size={12} />
										</span>
									</button>
									<div className="min-h-40 rounded-2xl border border-border bg-background/50 p-5 opacity-60">
										<span className="grid size-10 place-items-center rounded-xl border border-border bg-surface text-muted">
											<MessageCircle size={18} />
										</span>
										<span className="mt-4 block text-sm font-semibold">
											Другие каналы
										</span>
										<span className="mt-1.5 block text-xs leading-relaxed text-muted">
											Мессенджеры и почта будут подключаться отдельными
											мастерами.
										</span>
										<span className="mt-4 inline-flex rounded-full border border-border px-2 py-1 text-[10px] text-muted">
											Скоро
										</span>
									</div>
								</div>
							</div>
						</div>
						<footer className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
							<span className="text-[10px] text-muted">
								Пока доступно подключение сайта
							</span>
							<button
								type="button"
								onClick={() => setMode("list")}
								className="h-8 rounded-lg border border-border px-3 text-xs hover:bg-surface-elevated"
							>
								Отмена
							</button>
						</footer>
					</>
				) : mode === "form" ? (
					<>
						<div className="flex min-h-0 flex-1 flex-col md:flex-row">
							<aside className="flex shrink-0 gap-3 border-b border-border bg-background/40 px-5 py-3 md:w-56 md:flex-col md:gap-4 md:border-b-0 md:border-r md:py-6">
								<Step label="Источник" icon={Globe2} done />
								<Step label="Настройка сайта" icon={Settings2} active />
								<Step label="Операторы" icon={UsersRound} />
							</aside>
							<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
								<div className="mx-auto max-w-2xl">
									<div className="mb-5 flex items-start gap-3">
										<div className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
											<Globe2 size={18} />
										</div>
										<div>
											<h3 className="text-base font-semibold">Сайт</h3>
											<p className="mt-1 text-xs leading-relaxed text-muted">
												Создайте источник для сайта и подключите чат-виджет.
												Другие каналы добавим в этом разделе отдельно.
											</p>
										</div>
									</div>
									<Field label="Название сайта">
										<input
											aria-label="Название сайта"
											value={form.name}
											onChange={(event) => set("name", event.target.value)}
											placeholder="Например, Основной сайт"
											maxLength={120}
											className={inputClass}
										/>
									</Field>
									<Field label="Адрес сайта">
										<input
											aria-label="Адрес сайта"
											value={form.websiteUrl}
											onChange={(event) =>
												set("websiteUrl", event.target.value)
											}
											placeholder="https://example.com"
											type="url"
											className={inputClass}
										/>
										<p className="mt-1.5 text-[10px] text-muted">
											Основной адрес, который будет показан в настройках
											источника.
										</p>
									</Field>
									<Field label="Разрешённые домены">
										<p className="mb-2 text-[10px] text-muted">
											Укажите домены, на которых разрешено открывать виджет.
											Можно добавлять поддомены через <code>*.example.com</code>
											.
										</p>
										<div className="flex gap-2">
											<input
												value={domainInput}
												aria-label="Домен для добавления"
												onChange={(event) => setDomainInput(event.target.value)}
												onKeyDown={(event) => {
													if (event.key === "Enter") {
														event.preventDefault();
														addDomains();
													}
												}}
												placeholder="example.com"
												className={inputClass}
											/>
											<button
												type="button"
												onClick={addDomains}
												disabled={!domainInput.trim()}
												className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs disabled:opacity-40"
											>
												<Plus size={13} /> Добавить
											</button>
										</div>
										{testHost && !form.allowedDomains.includes(testHost) && (
											<button
												type="button"
												onClick={() =>
													set("allowedDomains", [
														...form.allowedDomains,
														testHost,
													])
												}
												className="mt-2 text-[10px] text-accent hover:underline"
											>
												Разрешить текущий домен ({testHost})
											</button>
										)}
										{form.allowedDomains.length > 0 && (
											<div className="mt-2 flex flex-wrap gap-1.5">
												{form.allowedDomains.map((domain) => (
													<span
														key={domain}
														className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 font-mono text-[10px]"
													>
														{domain}
														<button
															type="button"
															aria-label={`Удалить домен ${domain}`}
															onClick={() =>
																set(
																	"allowedDomains",
																	form.allowedDomains.filter(
																		(item) => item !== domain,
																	),
																)
															}
															className="text-muted hover:text-red-300"
														>
															<X size={11} />
														</button>
													</span>
												))}
											</div>
										)}
									</Field>
									<div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
										<Field label="Цвет виджета">
											<div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-2.5">
												<input
													aria-label="Цвет виджета"
													type="color"
													value={form.widgetColor}
													onChange={(event) =>
														set("widgetColor", event.target.value)
													}
													className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
												/>
												<span className="font-mono text-xs text-muted">
													{form.widgetColor}
												</span>
											</div>
										</Field>
										<Field label="Заголовок виджета">
											<input
												value={form.welcomeTitle}
												aria-label="Заголовок виджета"
												onChange={(event) =>
													set("welcomeTitle", event.target.value)
												}
												placeholder="Привет!"
												maxLength={100}
												className={inputClass}
											/>
										</Field>
									</div>
									<div className="grid gap-4 sm:grid-cols-2">
										<Field label="Положение пузырька">
							<select
								value={form.widgetPosition}
								onChange={(event) => set("widgetPosition", event.target.value as SourceForm["widgetPosition"])}
								className={inputClass}
							>
								<option value="right">Справа</option>
								<option value="left">Слева</option>
											</select>
										</Field>
										<Field label="Вариант пузырька">
							<select
								value={form.widgetType}
								onChange={(event) => set("widgetType", event.target.value as SourceForm["widgetType"])}
								className={inputClass}
							>
								<option value="standard">Стандартный</option>
								<option value="expanded_bubble">Расширенный</option>
											</select>
										</Field>
									</div>
									<div className="grid gap-4 sm:grid-cols-2">
										<Field label="Язык интерфейса виджета">
							<select
								value={form.widgetLocale}
								onChange={(event) => set("widgetLocale", event.target.value)}
								className={inputClass}
							>
								<option value="ru">Русский</option>
								<option value="en">English</option>
								<option value="de">Deutsch</option>
								<option value="pt">Português</option>
								<option value="el">Ελληνικά</option>
											</select>
										</Field>
						{form.widgetType === "expanded_bubble" && (
							<Field label="Подпись пузырька">
								<input
									value={form.launcherTitle}
									onChange={(event) => set("launcherTitle", event.target.value)}
									placeholder="Например, Напишите нам"
									maxLength={80}
									className={inputClass}
								/>
							</Field>
						)}
									</div>
									<Field label="Текст под заголовком">
										<textarea
											aria-label="Текст под заголовком"
											value={form.welcomeTagline}
											onChange={(event) =>
												set("welcomeTagline", event.target.value)
											}
											maxLength={255}
											rows={2}
											placeholder="Напишите нам — мы поможем"
											className={`${inputClass} min-h-20 resize-y py-2.5`}
										/>
									</Field>
									<div className="rounded-xl border border-border bg-background p-3.5">
										<label className="flex cursor-pointer items-center justify-between gap-3">
											<span>
												<span className="block text-xs font-medium">
													Приветственное сообщение
												</span>
												<span className="mt-1 block text-[10px] text-muted">
													Автоматически отправлять приветствие в новом диалоге
												</span>
											</span>
											<input
												type="checkbox"
												checked={form.greetingEnabled}
												onChange={(event) =>
													set("greetingEnabled", event.target.checked)
												}
												className="size-4 accent-blue-500"
											/>
										</label>
										{form.greetingEnabled && (
											<textarea
												value={form.greetingMessage}
												onChange={(event) =>
													set("greetingMessage", event.target.value)
												}
												maxLength={5000}
												rows={3}
												placeholder="Здравствуйте! Чем мы можем помочь?"
												className={`${inputClass} mt-3 min-h-20 resize-y py-2.5`}
											/>
										)}
									</div>
									<div className="mt-5 rounded-xl border border-border bg-background/70 p-3">
										<div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
											Предпросмотр
										</div>
										<div className="ml-auto max-w-[260px] overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
											<div
												className="px-3 py-3 text-white"
												style={{ backgroundColor: form.widgetColor }}
											>
												<div className="text-xs font-semibold">
													{form.welcomeTitle || "Привет!"}
												</div>
												<div className="mt-1 text-[10px] opacity-85">
													{form.welcomeTagline || "Напишите нам"}
												</div>
											</div>
											<div className="p-3">
												<div className="w-fit rounded-lg bg-surface-elevated px-2.5 py-2 text-[10px] text-muted">
													{form.greetingEnabled && form.greetingMessage
														? form.greetingMessage
														: "Напишите сообщение…"}
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
						<footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
							<span className="text-[10px] text-muted">
								Шаг 1 из 2 · Настройка сайта
							</span>
							<button
								type="button"
								disabled={!sourceValid}
								onClick={() => {
									save.reset();
									setMode("operators");
								}}
								className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-xs font-semibold text-white disabled:opacity-40"
							>
								Операторы <ArrowRight size={14} />
							</button>
						</footer>
					</>
				) : (
					<>
						<div className="flex min-h-0 flex-1 flex-col md:flex-row">
							<aside className="flex shrink-0 gap-3 border-b border-border bg-background/40 px-5 py-3 md:w-56 md:flex-col md:gap-4 md:border-b-0 md:border-r md:py-6">
								<Step label="Источник" icon={Globe2} done />
								<Step label="Настройка сайта" icon={Settings2} done />
								<Step label="Операторы" icon={UsersRound} active />
							</aside>
							<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
								<div className="mx-auto max-w-2xl">
									<div className="mb-5">
										<h3 className="text-base font-semibold">Операторы</h3>
										<p className="mt-1 text-xs leading-relaxed text-muted">
											Назначьте сотрудников, которые будут работать с чатами
											этого источника. Они получат доступ к его диалогам в
											Chatwoot.
										</p>
									</div>
									<div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
										<div className="flex items-center gap-2">
											<UsersRound size={15} className="text-accent" />
											<span className="text-xs font-medium">
												Выбрано: {form.operatorIds.length}
											</span>
										</div>
										<div className="relative w-56">
											<Search
												size={13}
												className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
											/>
											<input
												value={agentSearch}
												onChange={(event) => setAgentSearch(event.target.value)}
												placeholder="Найти сотрудника"
												className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-2 text-[11px] outline-none focus:border-accent"
											/>
										</div>
									</div>
									{members.isLoading || directory.isLoading ? (
										<div className="flex min-h-40 items-center justify-center text-xs text-muted">
											<LoaderCircle size={15} className="mr-2 animate-spin" />{" "}
											Загружаем операторов
										</div>
									) : members.isError || directory.isError ? (
										<div
											role="alert"
											className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-red-300"
										>
											{members.error instanceof Error
												? members.error.message
												: directory.error instanceof Error
													? directory.error.message
													: "Не удалось загрузить операторов"}
										</div>
									) : (
										<div className="divide-y divide-border rounded-xl border border-border bg-background">
											{filteredAgents.map((agent) => (
												<button
													key={agent.id}
													type="button"
													onClick={() => toggleAgent(agent)}
													className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-elevated"
												>
													<span
														className={`grid size-8 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${form.operatorIds.includes(agent.id) ? "border-accent/40 bg-accent/15 text-accent" : "border-border bg-surface text-muted"}`}
													>
														{agent.name
															.split(/\s+/)
															.slice(0, 2)
															.map((part) => part[0])
															.join("")
															.toUpperCase()}
													</span>
													<span className="min-w-0 flex-1">
														<span className="block truncate text-xs font-medium">
															{agent.name}
														</span>
														<span className="mt-0.5 block truncate text-[10px] text-muted">
															{agent.email || "Почта не указана"}
														</span>
													</span>
													<span
														className={`grid size-5 shrink-0 place-items-center rounded-md border ${form.operatorIds.includes(agent.id) ? "border-accent bg-accent text-white" : "border-border text-transparent"}`}
													>
														<Check size={13} />
													</span>
												</button>
											))}
											{filteredAgents.length === 0 && (
												<div className="p-8 text-center text-xs text-muted">
													Сотрудники не найдены
												</div>
											)}
										</div>
									)}
									{form.operatorIds.length === 0 && !members.isLoading && (
										<p className="mt-3 text-[11px] text-amber-300">
											Выберите хотя бы одного оператора, чтобы сохранить
											источник.
										</p>
									)}
									<div className="mt-5 rounded-xl border border-border bg-background/70 p-3 text-[10px] leading-relaxed text-muted">
										<span className="font-medium text-foreground">
											{form.name || "Новый источник"}
										</span>{" "}
										· {form.websiteUrl} ·{" "}
										{form.allowedDomains.length
											? form.allowedDomains.join(", ")
											: "без ограничения доменов"}
									</div>
								</div>
							</div>
						</div>
						<footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
							<span className="text-[10px] text-muted">
								Шаг 2 из 2 · Доступ к диалогам
							</span>
							<div className="flex items-center gap-2">
								{save.isError && (
									<span
										role="alert"
										className="max-w-60 text-[10px] text-red-400"
									>
										{save.error instanceof Error
											? save.error.message
											: "Не удалось сохранить источник"}
									</span>
								)}
								<button
									type="button"
									disabled={
										!form.operatorIds.length ||
										save.isPending ||
										members.isLoading ||
										!sourceValid
									}
									onClick={() => save.mutate()}
									className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-xs font-semibold text-white disabled:opacity-40"
								>
									{save.isPending ? (
										<LoaderCircle size={14} className="animate-spin" />
									) : (
										<Check size={14} />
									)}
									{save.isPending
										? "Сохраняем…"
										: editing
											? "Сохранить источник"
											: "Создать источник"}
								</button>
							</div>
						</footer>
					</>
				)}
			</section>
		</div>
	);
}

function Step({
	label,
	icon: Icon,
	active = false,
	done = false,
}: {
	label: string;
	icon: typeof Globe2;
	active?: boolean;
	done?: boolean;
}) {
	return (
		<div
			className={`flex items-center gap-2 text-xs md:items-start md:gap-3 ${active ? "font-semibold text-accent" : done ? "font-medium text-foreground" : "text-muted"}`}
		>
			<span
				className={`grid size-7 shrink-0 place-items-center rounded-full border ${active ? "border-accent/40 bg-accent/10" : "border-border bg-surface"}`}
			>
				{done ? <Check size={13} /> : <Icon size={13} />}
			</span>
			<span className="pt-1">{label}</span>
			<ChevronRight size={12} className="ml-auto text-muted/50" />
		</div>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="mb-4 block">
			<span className="mb-1.5 block text-xs font-medium">{label}</span>
			{children}
		</div>
	);
}

const inputClass =
	"h-10 w-full rounded-lg border border-border bg-background px-3 text-xs outline-none placeholder:text-muted focus:border-accent";

function widgetSnippet(baseUrl: string, websiteToken: string, inbox: ChatwootWebsiteInbox) {
	const settings = {
		locale: inbox.widget_locale || "ru",
		position: inbox.widget_position || "right",
		type: inbox.widget_type || "standard",
		...(inbox.launcher_title ? { launcherTitle: inbox.launcher_title } : {}),
	};
	return `<script>\nwindow.chatwootSettings = ${JSON.stringify(settings)};\n(function(d,t){var BASE_URL=${JSON.stringify(baseUrl)};var g=d.createElement(t),s=d.getElementsByTagName(t)[0];g.src=BASE_URL+"/packs/js/sdk.js";g.async=true;s.parentNode.insertBefore(g,s);g.onload=function(){window.chatwootSDK.run({websiteToken:${JSON.stringify(websiteToken)},baseUrl:BASE_URL});};})(document,"script");\n</script>`;
}
