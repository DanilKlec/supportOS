import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Panel } from "@/components/ui";
import { loadActiveSessions } from "@/services/active-sessions.service";
import { confirmedAccountAction } from "@/services/critical-confirmation.service";
import { useAuthStore } from "@/store/auth.store";
import { CriticalConfirmationModal } from "./CriticalConfirmationModal";

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
		<Panel
			className="min-w-0 p-4 sm:p-5"
			aria-labelledby="active-sessions-title"
		>
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
			<div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 id="active-sessions-title" className="text-lg font-semibold">
						Активные сессии
					</h3>
					<p className="mt-1 text-sm text-muted">Входы только в ваш аккаунт.</p>
				</div>
				<Button
					variant="secondary"
					loading={sessions.isFetching}
					disabled={!identity?.sessionId}
					onClick={() => void sessions.refetch()}
				>
					Обновить список
				</Button>
			</div>
			<Button
				variant="secondary"
				className="mb-3"
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
			{notice && <output className="block mb-3 text-sm">{notice}</output>}
			<p className="mb-4 text-xs text-muted">
				Время обновления авторизации — это обновление сессии, а не последнее
				действие в приложении.
			</p>
			{!identity?.sessionId ? (
				<p className="text-sm text-muted">
					Войдите в аккаунт, чтобы увидеть активные сессии.
				</p>
			) : sessions.isPending ? (
				<output className="block text-sm text-muted">Загрузка сессий…</output>
			) : sessions.isError ? (
				<p role="alert" className="text-sm text-muted">
					{sessions.error.message}
				</p>
			) : sessions.data.length === 0 ? (
				<p className="text-sm text-muted">Активные сессии не найдены.</p>
			) : (
				<ul className="grid min-w-0 gap-3">
					{sessions.data.map((session) => (
						<li
							key={session.id}
							className="min-w-0 rounded-lg border border-border p-3"
						>
							<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
								<span className="min-w-0 text-sm font-semibold">
									{deviceLabel(session.user_agent)}
								</span>
								{session.is_current && <Badge>Текущая сессия</Badge>}
							</div>
							<dl className="mt-3 grid min-w-0 gap-2 text-sm">
								<div className="min-w-0">
									<dt className="text-xs text-muted">ID сессии</dt>
									<dd className="break-all font-mono text-xs">{session.id}</dd>
								</div>
								<div>
									<dt className="text-xs text-muted">Создана</dt>
									<dd>{dateLabel(session.created_at)}</dd>
								</div>
								{session.updated_at && (
									<div>
										<dt className="text-xs text-muted">Обновлена</dt>
										<dd>{dateLabel(session.updated_at)}</dd>
									</div>
								)}
								{session.refreshed_at && (
									<div>
										<dt className="text-xs text-muted">
											Авторизация обновлена
										</dt>
										<dd>{dateLabel(session.refreshed_at)}</dd>
									</div>
								)}
							</dl>
							{session.user_agent && (
								<details className="mt-3 min-w-0 text-xs text-muted">
									<summary className="cursor-pointer">
										Данные устройства
									</summary>
									<p className="mt-2 break-all">{session.user_agent}</p>
								</details>
							)}
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}
