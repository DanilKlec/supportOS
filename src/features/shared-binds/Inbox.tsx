import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useKnowledgeStore } from "@/store";
import { sharedBindsService } from "@/services/shared-binds.service";
import { can } from "../../../shared/access.js";
import { useWorkspaceSharedBinds } from "./WorkspaceSharedBinds";
import { inboxItems, type InboxItem } from "./inbox-items";
type Profile = { baseline: Record<string, string>; read: string[] };
const useInbox = create<{
	profiles: Record<string, Profile>;
	init: (id: string, baseline: Record<string, string>) => void;
	mark: (id: string, keys: string[]) => void;
}>()(
	persist(
		(set) => ({
			profiles: {},
			init: (id, baseline) =>
				set((s) =>
					s.profiles[id]
						? s
						: { profiles: { ...s.profiles, [id]: { baseline, read: [] } } },
				),
			mark: (id, keys) =>
				set((s) => {
					const p = s.profiles[id];
					return p
						? {
								profiles: {
									...s.profiles,
									[id]: {
										...p,
										read: [...new Set([...p.read, ...keys])].slice(-2000),
									},
								},
							}
						: s;
				}),
		}),
		{ name: "supportos:inbox:v1" },
	),
);
export function Inbox() {
	const { user, common, branches } = useWorkspaceSharedBinds();
	const navigate = useNavigate();
	const client = useQueryClient();
	const results = useQuery({
		queryKey: ["proposal-results", user?.id],
		queryFn: () => sharedBindsService.proposalResults(),
		enabled: can(user?.access, "binds.read"),
		staleTime: 30000,
		refetchInterval: 30000,
	});
	const profile = useInbox((s) => (user ? s.profiles[user.id] : undefined));
	const [open, setOpen] = useState(false),
		[filter, setFilter] = useState("unread"),
		[busy, setBusy] = useState(""),
		[error, setError] = useState("");
	useEffect(() => {
		if (user && common.data && !profile)
			useInbox
				.getState()
				.init(
					user.id,
					Object.fromEntries(common.data.map((b) => [b.id, b.updatedAt])),
				);
	}, [user?.id, common.data, profile]);
	if (!user || !can(user.access, "binds.read")) return null;
	const updates = profile
		? inboxItems(
				common.data ?? [],
				branches.data?.incoming ?? [],
				profile.baseline,
			)
		: [];
	const items: InboxItem[] = [
		...updates,
		...(results.data ?? []).map((r) => ({
			key: "proposal:" + r.id + ":" + r.status,
			sourceId: r.sourceId,
			branch: r.status === "accepted" ? "main" : "mine",
			title: r.title,
			description:
				r.status === "accepted"
					? "Ваше предложение принято и опубликовано"
					: "Ваше предложение отклонено",
			stamp: r.resolvedAt,
		})),
	].sort((a, b) => b.stamp.localeCompare(a.stamp));
	const unread = items.filter((i) => !profile?.read.includes(i.key));
	const visible = filter === "unread" ? unread : items;
	const show = async (item: InboxItem) => {
		setBusy(item.key);
		setError("");
		try {
			await sharedBindsService.branchAction("choose", {
				sourceId: item.sourceId,
				branch: item.branch,
			});
			await client.invalidateQueries({ queryKey: ["bind-branches", user.id] });
			const state = useKnowledgeStore.getState();
			const target = state.remoteBinds.find(
				(b) => b.sourceBindId === item.sourceId || b.id === item.sourceId,
			);
			if (!target)
				throw new Error("Бинд больше недоступен. Обновите входящие.");
			state.openBind(target.id);
			await navigate({ to: "/" });
			useInbox.getState().mark(user.id, [item.key]);
			setOpen(false);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy("");
		}
	};
	return (
		<>
			<button
				type="button"
				aria-label={`Входящие: ${unread.length} непрочитанных`}
				onClick={() => setOpen(true)}
				className="relative flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm"
			>
				<Bell size={16} />
				<span className="hidden lg:inline">Входящие</span>
				{unread.length > 0 && (
					<span className="rounded-full bg-surface-elevated px-1.5 text-xs">
						{unread.length}
					</span>
				)}
			</button>
			{open && (
				<BaseModal
					title="Входящие"
					onClose={() => setOpen(false)}
					closeDisabled={!!busy}
					size="lg"
				>
					<div className="mb-4 flex flex-wrap gap-2">
						{[
							{ id: "unread", label: "Непрочитанные" },
							{ id: "all", label: "Все" },
						].map((t) => (
							<button
								type="button"
								key={t.id}
								aria-pressed={filter === t.id}
								onClick={() => setFilter(t.id)}
								className="rounded-lg border border-border px-3 py-2 text-xs aria-pressed:bg-surface-elevated"
							>
								{t.label}
							</button>
						))}
						<button
							type="button"
							disabled={!unread.length || !!busy}
							onClick={() =>
								useInbox.getState().mark(
									user.id,
									unread.map((i) => i.key),
								)
							}
							className="ml-auto text-xs text-muted disabled:opacity-40"
						>
							Прочитать всё
						</button>
					</div>
					{(error || common.error || branches.error || results.error) && (
						<p role="alert" className="mb-3 text-sm text-red-400">
							{error ||
								common.error?.message ||
								branches.error?.message ||
								results.error?.message}
							<button
								className="ml-2 underline"
								onClick={() => {
									void common.refetch();
									void branches.refetch();
									void results.refetch();
								}}
							>
								Обновить
							</button>
						</p>
					)}
					{(common.isPending || branches.isPending) && (
						<p className="text-sm text-muted">Загружаем входящие…</p>
					)}
					<div className="max-h-[60vh] space-y-2 overflow-auto">
						{visible.map((item) => (
							<article
								key={item.key}
								className="rounded-xl border border-border p-4"
							>
								<p className="text-xs text-muted">{item.description}</p>
								<h3 className="my-2 text-sm font-semibold">{item.title}</h3>
								<div className="flex items-center gap-3">
									<span className="text-xs text-muted">
										{new Date(item.stamp).toLocaleString("ru")}
									</span>
									<button
										type="button"
										disabled={!!busy}
										onClick={() => void show(item)}
										className="ml-auto rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground"
									>
										{busy === item.key ? "Открываем…" : "Открыть бинд"}
									</button>
									{!profile?.read.includes(item.key) && (
										<button
											type="button"
											onClick={() =>
												useInbox.getState().mark(user.id, [item.key])
											}
											className="text-xs text-muted"
										>
											Прочитано
										</button>
									)}
								</div>
							</article>
						))}
						{!visible.length && !common.isPending && !branches.isPending && (
							<p className="py-8 text-center text-sm text-muted">
								{filter === "unread"
									? "Новых уведомлений нет"
									: "Входящих пока нет"}
							</p>
						)}
					</div>
					<p className="mt-4 text-xs text-muted">
						Отметки прочтения сохраняются в этом браузере. Обновления
						проверяются каждые 30 секунд.
					</p>
				</BaseModal>
			)}
		</>
	);
}
