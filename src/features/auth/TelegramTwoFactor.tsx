import { LoaderCircle, Send, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AmbientBackground } from "@/components/brand/AmbientBackground";
import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
import { supabaseService } from "@/services/supabase.service";
import { useAuthStore } from "@/store/auth.store";

type State = {
	status: string;
	expiresAt?: string;
	resendAt?: string;
	telegramUrl?: string;
};
export async function twoFactorRequest(
	action: string,
	body: Record<string, unknown> = {},
) {
	const token = await supabaseService.getAccessToken();
	const response = await fetch(`/api/registration?action=2fa-${action}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(body),
		cache: "no-store",
		signal: AbortSignal.timeout(15000),
	});
	const result = await response.json();
	if (response.status === 401) return { status: "invalid_session" } as State;
	if (!response.ok)
		throw new Error(result.error ?? "Не удалось проверить подтверждение");
	return result as State;
}
export function TelegramTwoFactor() {
	const [state, setState] = useState<State>({ status: "loading" });
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [now, setNow] = useState(Date.now());
	const alive = useRef(true);
	const sessionId = useAuthStore((s) => s.session?.sessionId);
	const current = useCallback(
		() =>
			alive.current && useAuthStore.getState().session?.sessionId === sessionId,
		[sessionId],
	);
	const accept = useCallback(
		async (next: State) => {
			if (!current()) return;
			if (["rejected", "expired", "invalid_session"].includes(next.status)) {
				setState(next);
				await supabaseService.signOut();
				useAuthStore
					.getState()
					.setError(
						next.status === "rejected"
							? "Вход отклонён в Telegram."
							: "Запрос истёк. Введите пароль и повторите вход.",
					);
				return;
			}
			setState((prev) => ({
				...next,
				telegramUrl:
					next.status === "link_required" ? prev.telegramUrl : undefined,
			}));
			if (next.status === "approved") await supabaseService.refreshIdentity();
		},
		[current],
	);
	useEffect(() => {
		alive.current = true;
		let timer: ReturnType<typeof setTimeout>;
		async function poll() {
			try {
				let next = await twoFactorRequest("status");
				if (next.status === "required") next = await twoFactorRequest("begin");
				await accept(next);
			} catch (e) {
				if (current())
					setError(e instanceof Error ? e.message : "Ошибка подключения");
			}
			if (current()) timer = setTimeout(poll, 3000);
		}
		void poll();
		const clock = setInterval(() => setNow(Date.now()), 1000);
		return () => {
			alive.current = false;
			clearTimeout(timer);
			clearInterval(clock);
		};
	}, [accept, current]);
	async function run(action: string) {
		setBusy(true);
		setError("");
		try {
			if (action === "cancel") {
				await supabaseService.signOut();
				return;
			}
			const next = await twoFactorRequest(action, { resend: true });
			await accept(next);
			if (current() && next.telegramUrl) setState(next);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Не удалось выполнить действие",
			);
		} finally {
			if (alive.current) setBusy(false);
		}
	}
	const linking =
		state.status === "link_required" || state.status === "link_review";
	const seconds = Math.max(
		0,
		Math.ceil(
			((state.expiresAt ? Date.parse(state.expiresAt) : now) - now) / 1000,
		),
	);
	return (
		<div className="login-scene min-h-screen">
			<AmbientBackground />
			<main className="relative z-10 m-auto w-full max-w-lg px-6 py-16">
				<SupportOSLogo className="mb-8 h-12 w-12" />
				<div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-8 shadow-2xl">
					<ShieldCheck className="mb-6 h-10 w-10 text-blue-400" />
					<h1 className="text-2xl font-semibold text-white">
						{linking ? "Привяжите Telegram" : "Подтвердите вход в Telegram"}
					</h1>
					<p className="mt-4 leading-7 text-zinc-400">
						{state.status === "link_review"
							? "Telegram подтверждён. Администратор должен одобрить первую привязку. После одобрения сюда придёт запрос на подтверждение входа."
							: linking
								? "Для защиты аккаунта подтвердите свой Telegram через бота. Первую привязку проверит администратор."
								: "Мы отправили запрос на подтверждение в Telegram, привязанный к вашему аккаунту."}
					</p>
					<output className="my-6 flex items-center gap-3 text-blue-300">
						<LoaderCircle className="h-5 w-5 animate-spin" />
						{state.status === "pending"
							? `Ожидаем подтверждение · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
							: state.status === "link_review"
								? "Ожидаем администратора"
								: state.status === "loading"
									? "Проверяем сессию…"
									: "Доступ пока закрыт"}
					</output>
					{error && (
						<p role="alert" className="my-4 text-sm text-red-300">
							{error}
						</p>
					)}
					{linking ? (
						state.status === "link_required" && (
							<>
								{state.telegramUrl && (
									<a
										className="my-4 block rounded-xl bg-blue-600 p-3 text-center text-white"
										href={state.telegramUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										Открыть бота для привязки
									</a>
								)}
								<button
									type="button"
									className="w-full rounded-xl border border-white/20 p-3 text-white disabled:opacity-40"
									disabled={busy}
									onClick={() => void run("link")}
								>
									Получить ссылку для привязки
								</button>
							</>
						)
					) : (
						<button
							type="button"
							className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 p-3 text-white disabled:opacity-40"
							disabled={
								busy ||
								state.status !== "pending" ||
								Boolean(state.resendAt && Date.parse(state.resendAt) > now)
							}
							onClick={() => void run("begin")}
						>
							<Send className="h-4 w-4" />
							Отправить повторно
						</button>
					)}
					<button
						type="button"
						className="mt-4 w-full p-3 text-zinc-400"
						disabled={busy}
						onClick={() => void run("cancel")}
					>
						Отменить вход
					</button>
				</div>
			</main>
		</div>
	);
}
