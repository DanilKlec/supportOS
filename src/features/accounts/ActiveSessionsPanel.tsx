import { useQuery } from "@tanstack/react-query";
import { Monitor, RefreshCw, Smartphone } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Panel } from "@/components/ui";
import { loadActiveSessions } from "@/services/active-sessions.service";
import { confirmedAccountAction } from "@/services/critical-confirmation.service";
import { useAuthStore } from "@/store/auth.store";
import { CriticalConfirmationModal } from "./CriticalConfirmationModal";
import "@/features/settings/account.css";

function dateLabel(value: string | null) {
	if (!value || Number.isNaN(Date.parse(value))) return "Не указано";
	return new Intl.DateTimeFormat("ru", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));
}

function deviceLabel(agent: string | null) {
	if (!agent) return "Устройство не указано";
	const browser = /Edg\//.test(agent)
		? "Edge"
		: /OPR\//.test(agent)
			? "Opera"
			: /Chrome\/|CriOS\//.test(agent)
				? "Chrome"
				: /Firefox\/|FxiOS\//.test(agent)
					? "Firefox"
					: /Safari\//.test(agent)
						? "Safari"
						: null;
	const system = /Android/.test(agent)
		? "Android"
		: /iPhone|iPad|iPod/.test(agent)
			? "iOS"
			: /Windows/.test(agent)
				? "Windows"
				: /Macintosh|Mac OS X/.test(agent)
					? "macOS"
					: /Linux/.test(agent)
						? "Linux"
						: null;
	return [browser, system].filter(Boolean).join(" · ") || "Данные устройства";
}

export function ActiveSessionsPanel() {
	const [confirm, setConfirm] = useState(false);
	const [notice, setNotice] = useState("");
	const identity = useAuthStore((state) => state.session);
	const sessions = useQuery({
		queryKey: ["active-sessions", identity?.user.id, identity?.sessionId],
		queryFn: ({ signal }) => loadActiveSessions(signal),
		enabled: Boolean(identity?.user.id && identity.sessionId),
		staleTime: 30_000,
		gcTime: 0,
		retry: false,
		refetchOnWindowFocus: "always",
		refetchOnMount: "always",
	});

	return (
		<Panel className="account-card" aria-labelledby="active-sessions-title">
			{confirm && (
				<CriticalConfirmationModal
					request={{ action: "sessions.revoke_others", payload: {} }}
					onClose={() => setConfirm(false)}
					onExecute={async (proof) => {
						await confirmedAccountAction("revoke-other-sessions", proof);
						setConfirm(false);
						setNotice("Другие сессии завершены. Текущая сессия сохранена.");
						await sessions.refetch();
					}}
				/>
			)}
			<div className="account-card-header">
				<div>
					<h3 id="active-sessions-title">Активные сессии</h3>
					<p>Устройства, на которых открыт ваш аккаунт.</p>
				</div>
				<Button
					variant="secondary"
					className="account-icon-button"
					aria-label="Обновить список"
					title="Обновить список"
					loading={sessions.isFetching}
					disabled={!identity?.sessionId}
					onClick={() => void sessions.refetch()}
				>
					<RefreshCw size={15} aria-hidden="true" />
				</Button>
			</div>
			{notice && <output className="block mb-3 text-sm">{notice}</output>}
			{!identity?.sessionId ? (
				<p className="account-empty">
					Войдите в аккаунт, чтобы увидеть активные сессии.
				</p>
			) : sessions.isPending ? (
				<output className="account-empty">Загрузка сессий…</output>
			) : sessions.isError ? (
				<p role="alert" className="account-empty">
					{sessions.error.message}
				</p>
			) : sessions.data.length === 0 ? (
				<p className="account-empty">Активные сессии не найдены.</p>
			) : (
				<ul className="account-session-list">
					{[...sessions.data]
						.sort((a, b) => Number(b.is_current) - Number(a.is_current))
						.map((session) => {
							const DeviceIcon = /Android|iPhone|iPad|iPod/.test(
								session.user_agent ?? "",
							)
								? Smartphone
								: Monitor;
							return (
								<li key={session.id} className="account-session-row">
									<div className="account-session-summary">
										<span className="account-device-icon">
											<DeviceIcon size={20} aria-hidden="true" />
										</span>
										<div className="account-session-copy">
											<div className="account-session-title">
												<strong>{deviceLabel(session.user_agent)}</strong>
												{session.is_current && (
													<Badge className="account-current-badge">
														Текущая сессия
													</Badge>
												)}
											</div>
											<p>Вход: {dateLabel(session.created_at)}</p>
										</div>
									</div>
									<details className="account-row-details">
										<summary>Подробнее</summary>
										<dl className="account-technical-grid">
											<div>
												<dt>ID сессии</dt>
												<dd className="break-all font-mono">{session.id}</dd>
											</div>
											<div>
												<dt>Создана</dt>
												<dd>{dateLabel(session.created_at)}</dd>
											</div>
											{session.updated_at && (
												<div>
													<dt>Обновлена</dt>
													<dd>{dateLabel(session.updated_at)}</dd>
												</div>
											)}
											{session.refreshed_at && (
												<div>
													<dt>Авторизация обновлена</dt>
													<dd>{dateLabel(session.refreshed_at)}</dd>
												</div>
											)}
											{session.user_agent && (
												<div className="account-technical-agent">
													<dt>Данные устройства</dt>
													<dd className="break-all">{session.user_agent}</dd>
												</div>
											)}
										</dl>
									</details>
								</li>
							);
						})}
				</ul>
			)}
			<div className="account-card-footer">
				<p>Текущая сессия останется активной.</p>
				<Button
					variant="secondary"
					className="account-small-button"
					disabled={
						!identity?.sessionId ||
						sessions.isError ||
						sessions.isPending ||
						!sessions.data?.some((session) => !session.is_current)
					}
					onClick={() => {
						setNotice("");
						setConfirm(true);
					}}
				>
					Завершить все остальные сессии
				</Button>
			</div>
			<p className="account-card-note">
				Обновление авторизации не означает действие в приложении.
			</p>
		</Panel>
	);
}
