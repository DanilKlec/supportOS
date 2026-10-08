import { useInfiniteQuery } from "@tanstack/react-query";
import { useId } from "react";
import { Badge, Button, Panel } from "@/components/ui";
import {
	type LoginEventType,
	loadLoginHistory,
} from "@/services/login-history.service";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";

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
			className={
				embedded ? "min-w-0 space-y-3" : "min-w-0 space-y-3 p-4 sm:p-5"
			}
			aria-labelledby={headingId}
		>
			<div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 id={headingId} className="text-lg font-semibold">
						История входов
					</h3>
					<p className="mt-1 text-xs text-muted">
						Подтверждения входа, смена пароля и завершение сессий. Журнал
						ведётся с момента подключения.
					</p>
				</div>
				<Button
					variant="secondary"
					loading={history.isFetching}
					disabled={!identity?.sessionId || !permitted}
					onClick={() => void history.refetch()}
				>
					Обновить историю
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
				<ul className="grid min-w-0 gap-3">
					{events.map((event) => (
						<li
							key={event.id}
							className="min-w-0 rounded-lg border border-border p-3 text-sm"
						>
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="font-semibold">
									{eventLabels[event.event_type]}
								</span>
								{event.session_id &&
									event.session_id === identity?.sessionId && (
										<Badge>Текущая сессия</Badge>
									)}
							</div>
							<p className="mt-1 text-xs text-muted">
								{Number.isNaN(Date.parse(event.created_at))
									? "Время не указано"
									: new Date(event.created_at).toLocaleString("ru")}
							</p>
							<dl className="mt-3 grid min-w-0 gap-2 text-xs">
								<div>
									<dt className="text-muted">Устройство</dt>
									<dd>
										{[event.browser, event.os].filter(Boolean).join(" · ") ||
											"Не указано"}
									</dd>
								</div>
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
