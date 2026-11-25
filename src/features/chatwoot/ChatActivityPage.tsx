import { useQuery } from "@tanstack/react-query";
import {
	Activity,
	ArrowDown,
	Bot,
	Headphones,
	Inbox,
	UsersRound,
} from "lucide-react";
import { useState } from "react";
import {
	type ChatTeamStatus,
	chatwootService,
} from "@/services/chatwoot.service";

const metrics = [
	{ key: "online", title: "Посетители онлайн", Icon: UsersRound },
	{ key: "active", title: "Текущие диалоги", Icon: Activity },
	{ key: "queue", title: "В очереди", Icon: Inbox },
] as const;

export function ChatActivityPage({ team }: { team?: ChatTeamStatus }) {
	const [sort, setSort] = useState<"online" | "active" | "queue">("online");
	const activity = useQuery({
		queryKey: ["chatwoot", "site-activity"],
		queryFn: chatwootService.siteActivity,
		refetchInterval: 20_000,
		refetchOnWindowFocus: true,
	});
	const sites = [...(activity.data?.sites ?? [])].sort(
		(a, b) =>
			(b[sort] ?? -1) - (a[sort] ?? -1) || a.name.localeCompare(b.name, "ru"),
	);
	return (
		<section
			aria-label="Активность на сайтах"
			className="chat-secondary-workspace supportos-scroll min-h-0 min-w-0 flex-1 overflow-auto p-3 sm:p-6"
		>
			<div className="mx-auto max-w-5xl space-y-4">
				<div className="flex flex-wrap items-end justify-between gap-2">
					<h2 className="text-lg font-semibold">Активность на сайтах</h2>
					{activity.data && (
						<span className="text-xs text-muted">
							Данные на{" "}
							{new Date(activity.data.updatedAt).toLocaleTimeString("ru-RU")}
						</span>
					)}
				</div>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{[
						...metrics.map(({ key, title, Icon }) => ({
							title,
							Icon,
							value: activity.data?.[key],
						})),
						{
							title: "Принимают чаты",
							Icon: Headphones,
							value: team?.accepting,
						},
					].map(({ title, Icon, value }) => (
						<div
							key={title}
							className="chat-support-panel rounded-xl p-3 sm:p-4"
						>
							<div className="flex items-center gap-2 text-xs text-muted">
								<Icon size={15} className="shrink-0 text-accent" /> {title}
							</div>
							<strong className="mt-2 block text-2xl font-semibold tabular-nums">
								{value ?? "—"}
							</strong>
						</div>
					))}
				</div>
				<div className="chat-support-panel overflow-x-auto rounded-xl">
					<table className="w-full min-w-[520px] text-left text-xs">
						<thead className="border-b border-border text-muted">
							<tr>
								<th className="px-4 py-3 font-medium" scope="col">
									Сайт
								</th>
								{metrics.map(({ key, title }) => (
									<th
										key={key}
										className="px-4 py-3 text-right font-medium"
										scope="col"
										aria-sort={sort === key ? "descending" : "none"}
									>
										<button
											className="inline-flex items-center gap-1 hover:text-foreground"
											type="button"
											onClick={() => setSort(key)}
										>
											{title}
											{sort === key && <ArrowDown size={12} />}
										</button>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{sites.map((site) => (
								<tr
									key={site.id}
									className="border-b border-border/60 last:border-0"
								>
									<th className="px-4 py-3 font-medium" scope="row">
										{site.name}
										{site.url && (
											<span className="block break-all text-[11px] font-normal text-muted">
												{site.url}
											</span>
										)}
									</th>
									{metrics.map(({ key }) => (
										<td key={key} className="px-4 py-3 text-right tabular-nums">
											{site[key] ?? "—"}
										</td>
									))}
								</tr>
							))}
							{sites.length === 0 && (
								<tr>
									<td colSpan={4} className="px-4 py-8 text-center text-muted">
										{activity.isPending ? (
											"Загружаем активность…"
										) : activity.isError ? (
											<button
												type="button"
												className="text-accent underline"
												onClick={() => void activity.refetch()}
											>
												Не удалось загрузить. Повторить
											</button>
										) : (
											"Нет доступных источников с виджетом"
										)}
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				<p className="text-xs text-muted">
					Онлайн учитываются посетители с подключённым виджетом Chatwoot.
				</p>
			</div>
		</section>
	);
}

export function ChatTeamIndicator({
	team,
	onOpen,
}: {
	team?: ChatTeamStatus;
	onOpen: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative z-30 ml-auto shrink-0">
			<button
				type="button"
				aria-expanded={open}
				aria-label={`Принимают чаты: агенты ${team?.accepting ?? "—"}, подключённые боты ${team?.bots ?? "—"}`}
				onClick={() => setOpen((value) => !value)}
				onKeyDown={(event) => {
					if (event.key === "Escape") setOpen(false);
				}}
				className="flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-xs hover:bg-surface-elevated"
			>
				<Headphones size={14} className="text-accent" />
				<span className="hidden sm:inline">Принимают</span>
				<strong className="tabular-nums">{team?.accepting ?? "—"}</strong>
				<span className="mx-0.5 h-3 w-px bg-border" aria-hidden="true" />
				<Bot size={14} className="text-muted" />
				<strong className="tabular-nums">{team?.bots ?? "—"}</strong>
			</button>
			{open && (
				<div className="absolute right-0 top-full mt-2 w-56 space-y-2 rounded-xl border border-border bg-surface p-3 text-xs shadow-xl">
					<div className="flex justify-between gap-2">
						<span>Агенты в сети</span>
						<strong>{team?.online ?? "—"}</strong>
					</div>
					<div className="flex justify-between gap-2">
						<span>Принимают чаты</span>
						<strong>{team?.accepting ?? "—"}</strong>
					</div>
					<div className="flex justify-between gap-2">
						<span>Подключённые боты</span>
						<strong>{team?.bots ?? "—"}</strong>
					</div>
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							onOpen();
						}}
						className="mt-1 w-full rounded-md border border-border px-2 py-1.5 font-medium hover:bg-surface-elevated"
					>
						Открыть команду
					</button>
				</div>
			)}
		</div>
	);
}
