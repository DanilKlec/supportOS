import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { InboxModal } from "./InboxModal";
import { chatwootService } from "@/services/chatwoot.service";

export function ChatwootWebhookSettingsDialog({ onClose }: { onClose: () => void }) {
	const client = useQueryClient();
	const [secret, setSecret] = useState("");
	const [copied, setCopied] = useState(false);
	const settings = useQuery({
		queryKey: ["chatwoot", "webhook-settings"],
		queryFn: chatwootService.webhookSettings,
		refetchInterval: 10000,
	});
	const save = useMutation({
		mutationFn: () => chatwootService.saveWebhookSecret(secret),
		onSuccess: async () => {
			setSecret("");
			await client.invalidateQueries({ queryKey: ["chatwoot", "webhook-settings"] });
		},
	});
	const endpoint = typeof window === "undefined" ? "/api/chatwoot/webhook" : `${window.location.origin}/api/chatwoot/webhook`;
	const copyEndpoint = async () => {
		try {
			await navigator.clipboard.writeText(endpoint);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1800);
		} catch {
			window.prompt("Скопируйте адрес вебхука", endpoint);
		}
	};
	return (
		<InboxModal labelledBy="chatwoot-webhook-title" className="supportos-scroll max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface shadow-xl" onClose={onClose}>
				<header className="flex items-start justify-between border-b border-border px-5 py-4">
					<div className="flex items-start gap-3">
						<span className="grid size-9 place-items-center rounded-xl border border-border bg-background text-accent"><ShieldCheck size={17} /></span>
						<div><h2 id="chatwoot-webhook-title" className="text-sm font-semibold">Синхронизация Chatwoot</h2><p className="mt-1 text-[11px] text-muted">События диалогов и сообщений в реальном времени</p></div>
					</div>
					<button type="button" onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1.5 text-muted hover:bg-surface-elevated"><X size={15} /></button>
				</header>
				<div className="space-y-4 p-5">
					<div className="rounded-xl border border-border bg-background/60 p-3">
						<div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium">1. Добавьте endpoint в Chatwoot</span><button type="button" onClick={() => void copyEndpoint()} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] hover:bg-surface-elevated">{copied ? <Check size={11} /> : <Copy size={11} />}{copied ? "Скопировано" : "Копировать"}</button></div>
						<code className="mt-2 block break-all rounded-lg border border-border bg-surface px-2.5 py-2 text-[11px] text-muted">{endpoint}</code>
						<p className="mt-2 text-[10px] leading-relaxed text-muted">В Chatwoot: Настройки → Интеграции → Webhooks. Подпишитесь на conversation_created, conversation_updated, conversation_status_changed, message_created и message_updated.</p>
					</div>
					<div className="rounded-xl border border-border bg-background/60 p-3">
						<div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">2. Сохраните секрет подписи</span><span className={`rounded-full px-2 py-1 text-[10px] ${settings.data?.configured ? "bg-emerald-500/10 chat-text-success" : "bg-amber-500/10 chat-text-warning"}`}>{settings.data?.configured ? "Сохранён" : "Не настроен"}</span></div>
						<p className="mt-1 text-[10px] leading-relaxed text-muted">Скопируйте secret из формы вебхука Chatwoot и вставьте ниже. SupportOS проверяет HMAC-подпись; значение хранится в базе с доступом только сервера и не показывается повторно.</p>
						<div className="mt-3 flex flex-wrap gap-2">
							<input type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={settings.data?.configured ? "Введите новый секрет для замены" : "Секрет из Chatwoot"} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-accent" />
							<button type="button" disabled={secret.trim().length < 16 || save.isPending} onClick={() => save.mutate()} className="h-9 rounded-lg bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50">{save.isPending ? "Сохраняю…" : "Сохранить"}</button>
						</div>
					</div>
					{(settings.isError || save.isError) && <p role="alert" className="text-xs chat-text-danger">{save.error instanceof Error ? save.error.message : settings.error instanceof Error ? settings.error.message : "Не удалось настроить вебхук"}</p>}
					{settings.data?.configured && <p role="status" className="text-xs text-muted">
						{settings.data.lastReceivedAt
							? `Последнее принятое событие · ${new Date(settings.data.lastReceivedAt).toLocaleString("ru-RU")}`
							: "После сохранения секрета события ещё не поступали. Отправьте сообщение в тестовом диалоге."}
					</p>}
				</div>
		</InboxModal>
	);
}
