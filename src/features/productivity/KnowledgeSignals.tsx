import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";
import { useBonusStore } from "@/store/bonus.store";
import { can } from "../../../shared/access.js";
import { safeKnowledgeTopic } from "../../../shared/knowledge-gap.js";

async function signals<T>(action: string, payload?: object): Promise<T> {
	const response = await authenticatedFetch(
		`/api/binds?action=${action}`,
		payload
			? {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ ...payload, action }),
				}
			: undefined,
	);
	const result = await response.json();
	if (!response.ok)
		throw new Error(result.error ?? "Сервис отметок недоступен");
	return result;
}
export function KnowledgeGapButton() {
	const [open, setOpen] = useState(false),
		[topic, setTopic] = useState("");
	const user = useAuthStore((s) => s.session?.user),
		projectId = useBonusStore((s) => s.activeProjectId),
		client = useQueryClient();
	const save = useMutation({
		mutationFn: () =>
			signals("gap", { topic: safeKnowledgeTopic(topic), projectId }),
		onSuccess: () => {
			setTopic("");
			setOpen(false);
			void client.invalidateQueries({ queryKey: ["quality-signals"] });
		},
	});
	if (!can(user?.access, "binds.read")) return null;
	return (
		<>
			<button
				type="button"
				className="min-h-10 px-3 text-sm text-muted"
				onClick={() => {
					save.reset();
					setOpen(true);
				}}
			>
				Не нашёл нужный ответ
			</button>
			{open && (
				<BaseModal
					title="Пробел в знаниях"
					onClose={() => setOpen(false)}
					closeDisabled={save.isPending}
				>
					<p className="mb-3 text-sm">
						Укажите только общую тему, например «условия вывода бонуса». Не
						вставляйте сообщение клиента, имена, номера, ссылки или реквизиты.
					</p>
					<label className="ui-field text-sm">
						Тема
						<input
							maxLength={120}
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							className="ui-input my-3 w-full border border-border bg-background"
						/>
					</label>
					{topic && !safeKnowledgeTopic(topic) && (
						<p className="text-sm">
							Нужна короткая тема без чувствительных данных.
						</p>
					)}
					{save.error && <p role="alert">{save.error.message}</p>}
					<button
						type="button"
						disabled={!safeKnowledgeTopic(topic) || save.isPending}
						onClick={() => save.mutate()}
						className="min-h-10 rounded-lg border border-border px-3 disabled:opacity-40"
					>
						{save.isPending ? "Сохранение…" : "Сообщить команде качества"}
					</button>
				</BaseModal>
			)}
		</>
	);
}
export function BindFeedback({ bindId }: { bindId: string }) {
	const user = useAuthStore((s) => s.session?.user),
		client = useQueryClient();
	const queryKey = ["my-feedback", user?.id];
	const query = useQuery({
		queryKey,
		queryFn: () => signals<{ bind_id: string; kind: string }[]>("my-feedback"),
		enabled: can(user?.access, "binds.read"),
		staleTime: 60000,
	});
	const save = useMutation({
		mutationFn: (kind: string) => signals("feedback", { bindId, kind }),
		onSuccess: () => {
			void client.invalidateQueries({ queryKey });
			void client.invalidateQueries({ queryKey: ["quality-signals"] });
		},
	});
	if (!can(user?.access, "binds.read")) return null;
	const current = query.data?.find((row) => row.bind_id === bindId)?.kind;
	return (
		<div className="my-3">
			<div className="flex gap-2">
				{[
					["helpful", "Полезно"],
					["outdated", "Устарело"],
				].map(([kind, label]) => (
					<button
						type="button"
						key={kind}
						aria-pressed={current === kind}
						disabled={save.isPending || query.isPending || query.isError}
						className="min-h-10 rounded-lg border border-border px-3 text-sm aria-pressed:bg-accent/20 disabled:opacity-40"
						onClick={() => save.mutate(kind)}
					>
						{label}
					</button>
				))}
			</div>
			{(save.error || query.error) && (
				<p role="alert" className="text-sm">
					{(save.error || query.error)?.message}
				</p>
			)}
		</div>
	);
}
export function QualitySignals() {
	const user = useAuthStore((s) => s.session?.user);
	const query = useQuery({
		queryKey: ["quality-signals", user?.id],
		queryFn: () =>
			signals<{
				feedback: { bind_id: string; kind: string; updated_at: string }[];
				gaps: {
					id: number;
					topic: string;
					project_id: string | null;
					created_at: string;
				}[];
			}>("quality-signals"),
		enabled: can(user?.access, "knowledge.write"),
		staleTime: 60000,
	});
	if (!can(user?.access, "knowledge.write")) return null;
	const totals = new Map<string, { helpful: number; outdated: number }>();
	for (const row of query.data?.feedback ?? []) {
		const count = totals.get(row.bind_id) ?? { helpful: 0, outdated: 0 };
		if (row.kind === "helpful") count.helpful++;
		else count.outdated++;
		totals.set(row.bind_id, count);
	}
	return (
		<section className="my-5 rounded-xl border border-border p-4">
			<h2 className="font-semibold">Обратная связь команды</h2>
			{query.isPending && <p>Загрузка отметок…</p>}
			{query.error && (
				<p role="alert">
					{query.error.message}{" "}
					<button type="button" onClick={() => void query.refetch()}>
						Повторить
					</button>
				</p>
			)}
			{query.data && (
				<>
					<p className="my-2 text-xs text-muted">
						Сводка последних 100 отметок и сообщений о пробелах.
					</p>
					<ul>
						{[...totals].map(([id, count]) => (
							<li key={id} className="py-1 text-sm">
								<a href={`/#bind=${encodeURIComponent(id)}`}>{id}</a> · полезно:{" "}
								{count.helpful} · устарело: {count.outdated}
							</li>
						))}
					</ul>
					<h3 className="mt-4 font-semibold">Не найдено</h3>
					{query.data.gaps.length ? (
						<ul>
							{query.data.gaps.map((row) => (
								<li
									key={row.id}
									className="border-b border-border py-2 text-sm"
								>
									{row.topic} · {new Date(row.created_at).toLocaleDateString()}
								</li>
							))}
						</ul>
					) : (
						<p className="py-2 text-sm text-muted">
							Пока нет сообщений о пробелах в знаниях.
						</p>
					)}
				</>
			)}
		</section>
	);
}
