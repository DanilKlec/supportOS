import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { TranslatorSettingsPage } from "@/features/translator/TranslatorSettingsPage";
import { authenticatedFetch } from "@/services/authenticated-fetch";
import { useAuthStore } from "@/store/auth.store";
import { useTranslatorStore } from "@/store/translator.store";
import { can } from "../../../shared/access.js";
import { AISettingsPage } from "./AISettingsPage";
export function IntegrationsPanel() {
	const hash = useRouterState({ select: (s) => s.location.hash });
	const user = useAuthStore((s) => s.session?.user);
	const configured = useAuthStore((s) => s.configured);
	const provider = useTranslatorStore((s) => s.provider);
	const ai = useQuery({
		queryKey: ["admin-overview-ai", user?.id],
		enabled: can(user?.access, "technical"),
		queryFn: async () => {
			const r = await authenticatedFetch("/api/ai/status");
			const d = await r.json();
			if (!r.ok) throw new Error("Не удалось проверить AI");
			return d;
		},
	});
	if (!can(user?.access, "technical")) return null;
	if (hash === "integrations-ai" || hash === "integrations-translator")
		return (
			<div className="space-y-4">
				<Link className="space-tab" to="/settings" hash="integrations">
					← Все интеграции
				</Link>
				{hash === "integrations-ai" ? (
					<AISettingsPage />
				) : (
					<TranslatorSettingsPage embedded />
				)}
			</div>
		);
	return (
		<div className="divide-y divide-border">
			<section className="py-4">
				<h3 className="font-semibold">AI</h3>
				{can(user?.access, "technical") ? (
					<>
						<p className="text-sm text-muted">
							{ai.isPending
								? "Проверяем…"
								: ai.error
									? "Проверка недоступна"
									: ai.data?.configured
										? "Настроен"
										: "Не настроен"}{" "}
							{ai.data?.provider}
						</p>
						{ai.error && (
							<button type="button" onClick={() => void ai.refetch()}>
								Повторить
							</button>
						)}
						<Link className="space-tab" to="/settings" hash="integrations-ai">
							Настроить AI →
						</Link>
					</>
				) : (
					<p>Настройки доступны администратору интеграций.</p>
				)}
			</section>
			<section className="py-4">
				<h3>Translator</h3>
				<p className="text-sm text-muted">
					Провайдер: {provider}. Доступность проверяется при переводе.
				</p>
				{can(user?.access, "technical") && (
					<Link
						className="space-tab"
						to="/settings"
						hash="integrations-translator"
					>
						Настроить →
					</Link>
				)}
			</section>
			<section className="py-4">
				<h3>Supabase</h3>
				<p className="text-sm text-muted">
					{configured ? "Подключение настроено" : "Подключение не настроено"}
				</p>
			</section>
			<section className="py-4">
				<h3>LiveChat</h3>
				{can(user?.access, "monitor.read") ? (
					<Link className="space-tab" to="/agent-monitor">
						Проверить связь в мониторинге →
					</Link>
				) : (
					<p className="text-sm text-muted">Статус доступен руководителю.</p>
				)}
			</section>
			<section className="py-4">
				<h3>Sports API</h3>
				<p className="text-sm text-muted">
					Доступность проверяется при загрузке событий.
				</p>
				{can(user?.access, "tools") && (
					<Link className="space-tab" to="/sports-betting">
						Открыть инструмент →
					</Link>
				)}
			</section>
		</div>
	);
}
