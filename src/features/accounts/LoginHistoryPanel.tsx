import { useInfiniteQuery } from "@tanstack/react-query";
import { History, RefreshCw } from "lucide-react";
import { useId } from "react";
import { Badge, Button, Panel } from "@/components/ui";
import {
	type LoginEventType,
	loadLoginHistory,
} from "@/services/login-history.service";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import "@/features/settings/account.css";

const eventLabels: Record<LoginEventType, string> = {
	login_approved: "Вход подтверждён",
	login_rejected: "Вход отклонён",
	password_changed: "Пароль изменён",
	sessions_revoked: "Сессии завершены",
};
const telegramLabels = {
	approved: "Подтверждено",
	rejected: "Отклонено",
	not_confirmed: "Не подтверждалось",
};

export function LoginHistoryPanel({
	userId,
	embedded = false,
}: {
	userId?: string;
	embedded?: boolean;
}) {
	const headingId = useId();
	const identity = useAuthStore((state) => state.session);
	const permitted =
		userId && userId !== identity?.user.id
			? can(identity?.user.access, "users.manage")
			: can(identity?.user.access, "work") ||
				can(identity?.user.access, "users.manage");
	const history = useInfiniteQuery({
		queryKey: [
			"login-history",
			identity?.user.id,
			identity?.sessionId,
			userId ?? identity?.user.id,
		],
		queryFn: ({ pageParam, signal }) =>
			loadLoginHistory(userId, pageParam, signal),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled: Boolean(identity?.sessionId && permitted),
		gcTime: 0,
		staleTime: 30_000,
		retry: false,
		refetchOnWindowFocus: "always",
	});
	const Wrapper = embedded ? "section" : Panel;
	const events = history.data?.pages.flatMap((page) => page.events) ?? [];
	return (
		<Wrapper
			className={embedded ? "min-w-0 space-y-3" : "account-card"}
			aria-labelledby={headingId}
		>
			<div className="account-card-header">
				<div className="min-w-0">
					<h3 id={headingId}>История входов</h3>
					<p>Входы и важные изменения в вашем аккаунте.</p>
				</div>
				<Button
					variant="secondary"
					className="account-icon-button"
					aria-label="Обновить историю"
					title="Обновить историю"
					loading={history.isFetching}
					disabled={!identity?.sessionId || !permitted}
					onClick={() => void history.refetch()}
				>
					<RefreshCw size={15} aria-hidden="true" />
				</Button>
			</div>
			{!permitted ? (
				<p className="text-sm text-muted">Нет доступа к истории входов.</p>
			) : !identity?.sessionId ? (
				<p className="text-sm text-muted">
					Войдите в аккаунт, чтобы увидеть историю входов.
				</p>
			) : history.isPending ? (
				<output className="block">Загрузка истории…</output>
			) : history.isError ? (
				<p role="alert">{history.error.message}</p>
			) : !events.length ? (
				<p className="text-sm text-muted">Событий безопасности пока нет.</p>
			) : (
				<ul className="account-event-list">
					{events.map((event) => (
						<li key={event.id} className="account-event-row">
							<span className="account-event-icon">
								<History size={16} aria-hidden="true" />
							</span>
							<div className="account-event-content">
								<div className="account-event-title">
									<span className="font-semibold">
										{eventLabels[event.event_type]}
									</span>
									{event.session_id &&
										event.session_id === identity?.sessionId && (
											<Badge>Текущая сессия</Badge>
										)}
								</div>
								<div className="account-event-meta">
									<span>
										{[event.browser, event.os].filter(Boolean).join(" · ") ||
											"Устройство не указано"}
									</span>
									<span>
										{Number.isNaN(Date.parse(event.created_at))
											? "Время не указано"
											: new Date(event.created_at).toLocaleString("ru")}
									</span>
								</div>
								<details className="account-row-details">
									<summary>Подробности события</summary>
									<dl className="account-technical-grid">
										<div className="min-w-0">
											<dt className="text-muted">ID сессии</dt>
											<dd className="break-all font-mono">
												{event.session_id || "Не указано"}
											</dd>
										</div>
										{event.telegram_result && (
											<div>
												<dt className="text-muted">Подтверждение Telegram</dt>
												<dd>{telegramLabels[event.telegram_result]}</dd>
											</div>
										)}
										{event.ip_hash && (
											<div className="min-w-0">
												<dt className="text-muted">Отпечаток IP</dt>
												<dd className="break-all font-mono">{event.ip_hash}</dd>
											</div>
										)}
									</dl>
								</details>
							</div>
						</li>
					))}
				</ul>
			)}
			{history.hasNextPage && !history.isError && permitted && (
				<div className="ui-actions">
					<Button
						loading={history.isFetchingNextPage}
						disabled={history.isFetching}
						onClick={() => void history.fetchNextPage()}
					>
						Показать ещё
					</Button>
				</div>
			)}
		</Wrapper>
	);
}
