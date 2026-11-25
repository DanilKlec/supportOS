import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type ChatwootInbox, chatwootService } from "@/services/chatwoot.service";

export function ChatwootCapacityPanel({ inboxes }: { inboxes: ChatwootInbox[] }) {
	const [open, setOpen] = useState(false);
	const [policyId, setPolicyId] = useState(0);
	const [inboxId, setInboxId] = useState(0);
	const [draft, setDraft] = useState<string | null>(null);
	const policies = useQuery({ queryKey: ["chatwoot", "capacity-policies"], queryFn: chatwootService.capacityPolicies, enabled: open, retry: false });
	const policy = policies.data?.policies.find((item) => item.id === policyId);
	const current = policy?.inbox_capacity_limits.find((item) => item.inbox_id === inboxId)?.conversation_limit;
	const value = draft ?? (current == null ? "" : String(current));
	const limit = Number(value);
	const canSave = policyId > 0 && inboxId > 0 && value !== "" && Number.isInteger(limit) && limit >= 0 && limit <= 250 && limit !== current;
	const mutation = useMutation({ mutationFn: () => chatwootService.setInboxCapacity(policyId, inboxId, limit), onSuccess: () => policies.refetch() });
	const field = "mt-1 block h-9 w-full rounded-lg border border-border bg-background px-2 text-xs";
	return <details className="chat-support-panel mt-3 p-3 text-sm sm:mt-5 sm:p-4" onToggle={(event) => setOpen(event.currentTarget.open)}>
		<summary className="cursor-pointer font-medium">Лимиты Chatwoot по источникам</summary>
		{open && <div className="mt-3">
			{policies.isPending && <output className="text-xs text-muted">Загружаем политики Chatwoot…</output>}
			{policies.isError && <p role="alert" className="text-xs chat-text-danger">{policies.error.message}</p>}
			{policies.data?.unavailable && <p className="text-xs text-muted">Подключённый Chatwoot не предоставляет API политик лимитов.</p>}
			{policies.data && !policies.data.unavailable && policies.data.policies.length === 0 && <p className="text-xs text-muted">Сначала создайте и назначьте агентам политику лимитов в Chatwoot.</p>}
			{Boolean(policies.data?.policies.length) && <form className="grid gap-2 sm:grid-cols-[1fr_1fr_minmax(90px,0.6fr)_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); if (canSave) mutation.mutate(); }}>
				<label className="min-w-0 text-xs text-muted">Политика<select value={policyId} disabled={mutation.isPending} className={field} onChange={(event) => { setPolicyId(Number(event.target.value)); setDraft(null); mutation.reset(); }}><option value={0}>Выберите политику</option>{policies.data?.policies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
				<label className="min-w-0 text-xs text-muted">Источник<select value={inboxId} disabled={mutation.isPending} className={field} onChange={(event) => { setInboxId(Number(event.target.value)); setDraft(null); mutation.reset(); }}><option value={0}>Выберите источник</option>{inboxes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
				<label className="text-xs text-muted">Максимум чатов<input type="number" value={value} className={field} min={0} max={250} disabled={mutation.isPending} onChange={(event) => { setDraft(event.target.value); mutation.reset(); }} /></label>
				<button type="submit" disabled={!canSave || mutation.isPending} className="h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-elevated disabled:opacity-50">{mutation.isPending ? "Сохраняем…" : "Сохранить в Chatwoot"}</button>
				{policy && <p className="text-xs text-muted sm:col-span-4">Лимит действует для всех агентов этой политики. Сейчас в ней {policy.assigned_agent_count}.</p>}
				{mutation.isError && <p role="alert" className="text-xs chat-text-danger sm:col-span-4">{mutation.error.message}</p>}
				{mutation.isSuccess && <output className="text-xs chat-text-success sm:col-span-4">Chatwoot подтвердил лимит {mutation.data.limit}.</output>}
			</form>}
		</div>}
	</details>;
}
