import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	Globe2,
	LoaderCircle,
	Plus,
	RefreshCw,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	type ChatwootWebsiteInbox,
	chatwootService,
} from "@/services/chatwoot.service";

function parseDomains(value?: string | null) {
	return [
		...new Set(
			(value ?? "")
				.split(/[\n,]/)
				.map((item) => item.trim().toLowerCase())
				.filter(Boolean),
		),
	];
}

export function WebsiteDomainsDialog({ onClose }: { onClose: () => void }) {
	const client = useQueryClient();
	const query = useQuery({
		queryKey: ["chatwoot", "website-inboxes"],
		queryFn: chatwootService.websiteInboxes,
	});
	const inboxes = query.data?.inboxes ?? [];
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [domains, setDomains] = useState<string[]>([]);
	const [input, setInput] = useState("");
	const [saved, setSaved] = useState(false);
	const selected =
		inboxes.find((inbox) => inbox.id === selectedId) ?? inboxes[0];
	const savedDomains = parseDomains(selected?.allowed_domains);
	const testHost = typeof window === "undefined" ? "" : window.location.hostname;
	const testHostAllowed = domains.some((domain) => domain === testHost || (domain.startsWith("*.") && testHost.endsWith(domain.slice(1))));
	useEffect(() => {
		if (!selected) return;
		setSelectedId(selected.id);
		setDomains(parseDomains(selected.allowed_domains));
		setSaved(false);
	}, [selected]);
	const update = useMutation({
		mutationFn: (inbox: ChatwootWebsiteInbox) =>
			chatwootService.setWebsiteDomains(inbox.id, domains),
		onSuccess: async (result) => {
			setSaved(true);
			client.setQueryData<{ inboxes: ChatwootWebsiteInbox[] }>(
				["chatwoot", "website-inboxes"],
				(current) =>
					current
						? {
								inboxes: current.inboxes.map((item) =>
									item.id === result.id ? { ...item, ...result } : item,
								),
							}
						: current,
			);
			await client.invalidateQueries({
				queryKey: ["chatwoot", "website-inboxes"],
			});
		},
	});
	const addDomains = () => {
		const additions = parseDomains(input);
		if (!additions.length) return;
		setDomains((current) => [...new Set([...current, ...additions])]);
		setInput("");
		setSaved(false);
	};
	const dirty = domains.join(",") !== savedDomains.join(",");
	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm">
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby="site-domains-title"
				className="flex max-h-[min(760px,92vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
			>
				<header className="flex items-center justify-between border-b border-border px-5 py-4">
					<div className="flex items-center gap-3">
						<span className="grid size-9 place-items-center rounded-xl border border-border bg-background text-accent">
							<Globe2 size={18} />
						</span>
						<div>
							<h2 id="site-domains-title" className="text-sm font-semibold">
								Интеграция с сайтами
							</h2>
							<p className="mt-0.5 text-[11px] text-muted">
								Управляйте доменами, с которых открыт чат игроков
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Закрыть"
						className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground"
					>
						<X size={16} />
					</button>
				</header>
				{query.isLoading ? (
					<div className="flex min-h-64 items-center justify-center text-sm text-muted">
						<LoaderCircle className="mr-2 animate-spin" size={17} />
						Загружаем сайты
					</div>
				) : query.isError ? (
					<div className="m-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
						{query.error instanceof Error
							? query.error.message
							: "Не удалось загрузить website inbox"}
						<button
							type="button"
							onClick={() => void query.refetch()}
							className="ml-3 inline-flex items-center gap-1 text-xs underline"
						>
							<RefreshCw size={12} /> Повторить
						</button>
					</div>
				) : inboxes.length === 0 ? (
					<div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
						<Globe2 size={26} className="text-muted" />
						<p className="mt-3 text-sm font-medium">
							Website-каналы не найдены
						</p>
						<p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
							Создайте Website inbox в Chatwoot, затем вернитесь сюда, чтобы
							добавлять домены.
						</p>
					</div>
				) : (
					<div className="grid min-h-0 flex-1 md:grid-cols-[230px_minmax(0,1fr)]">
						<aside className="supportos-scroll flex max-h-36 flex-col gap-1 overflow-y-auto border-b border-border p-3 md:max-h-none md:border-b-0 md:border-r">
							{inboxes.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => {
										setSelectedId(item.id);
										setDomains(parseDomains(item.allowed_domains));
										setSaved(false);
										update.reset();
									}}
									className={`rounded-lg px-3 py-2.5 text-left ${selected?.id === item.id ? "bg-accent/10 text-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}
								>
									<span className="block truncate text-xs font-semibold">
										{item.name}
									</span>
									<span className="mt-0.5 block truncate text-[10px] opacity-70">
										{item.website_url || "Website inbox"}
									</span>
								</button>
							))}
						</aside>
						<div className="supportos-scroll min-h-0 overflow-y-auto p-4 sm:p-5">
							<div className="flex items-start justify-between gap-3">
								<div>
									<h3 className="text-sm font-semibold">{selected?.name}</h3>
									<p className="mt-1 break-all text-[11px] text-muted">
										{selected?.website_url || "Адрес основного сайта не задан"}
									</p>
								</div>
								<span className="shrink-0 rounded-full bg-surface-elevated px-2.5 py-1 text-[10px] text-muted">
									{domains.length} доменов
								</span>
							</div>
							<div className="mt-5 rounded-xl border border-border bg-background p-3 sm:p-4">
								<label
									htmlFor="new-site-domain"
									className="text-xs font-medium"
								>
									Добавить домены
								</label>
								<p className="mt-1 text-[10px] leading-relaxed text-muted">
									Можно указать домен, URL или поддомен с wildcard, например{" "}
									<code>*.example.com</code>. Несколько значений разделяйте
									запятой или новой строкой.
								</p>
								<div className="mt-3 flex gap-2">
									<textarea
										id="new-site-domain"
										value={input}
										onChange={(event) => setInput(event.target.value)}
										onKeyDown={(event) => {
											if (
												event.key === "Enter" &&
												(event.ctrlKey || event.metaKey)
											) {
												event.preventDefault();
												addDomains();
											}
										}}
										placeholder="example.com"
										rows={2}
										className="min-h-10 flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none placeholder:text-muted focus:border-accent"
									/>
									<button
										type="button"
										onClick={addDomains}
										disabled={!input.trim()}
										className="inline-flex h-10 items-center gap-1.5 self-start rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-40"
									>
										<Plus size={14} /> Добавить
									</button>
								</div>
								{selected?.allowed_domains?.trim() && testHost && !testHostAllowed && (
									<button
										type="button"
										onClick={() => {
										setDomains((current) => [...new Set([...current, testHost])]);
										setSaved(false);
									}}
										className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:underline"
									>
										<Globe2 size={12} /> Разрешить тестовую страницу ({testHost})
									</button>
								)}
							</div>
							<div className="mt-5">
								<div className="mb-2 text-xs font-semibold">
									Разрешённые домены
								</div>
								{domains.length ? (
									<ul className="space-y-1.5">
										{domains.map((domain) => (
											<li
												key={domain}
												className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
											>
												<span className="break-all font-mono text-xs">
													{domain}
												</span>
												<button
													type="button"
													aria-label={`Удалить ${domain}`}
													onClick={() => {
														setDomains((current) =>
															current.filter((item) => item !== domain),
														);
														setSaved(false);
													}}
													className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-red-500/10 hover:text-red-300"
												>
													<Trash2 size={13} />
												</button>
											</li>
										))}
									</ul>
								) : (
									<div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted">
										Ограничение доменов не настроено. Чат будет доступен с
										любого сайта.
									</div>
								)}
							</div>
							{update.isError && (
								<p role="alert" className="mt-3 text-xs text-red-400">
									{update.error instanceof Error
										? update.error.message
										: "Не удалось сохранить домены"}
								</p>
							)}
							{saved && (
								<p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-400">
									<Check size={13} /> Домены обновлены в Chatwoot
								</p>
							)}
						</div>
					</div>
				)}
				<footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
					<span className="text-[10px] text-muted">
						Изменения применятся к виджету выбранного сайта
					</span>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onClose}
							className="h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-elevated"
						>
							Закрыть
						</button>
						{inboxes.length > 0 && (
							<button
								type="button"
								disabled={!dirty || update.isPending}
								onClick={() => selected && update.mutate(selected)}
								className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-white disabled:opacity-40"
							>
								{update.isPending ? (
									<LoaderCircle size={13} className="animate-spin" />
								) : (
									<Check size={13} />
								)}
								Сохранить
							</button>
						)}
					</div>
				</footer>
			</section>
		</div>
	);
}
