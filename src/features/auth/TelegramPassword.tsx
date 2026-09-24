import { useEffect, useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { supabaseService } from "@/services/supabase.service";
type Challenge = {
	browserToken: string;
	telegramUrl: string;
	expiresAt: string;
	status: string;
};
export async function passwordRequest(
	action: string,
	body: Record<string, unknown>,
	authenticated = false,
) {
	const token = authenticated
		? await supabaseService.getAccessToken()
		: undefined;
	const response = await fetch(`/api/registration?action=password-${action}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
		cache: "no-store",
		signal: AbortSignal.timeout(15000),
	});
	const result = await response.json();
	if (!response.ok)
		throw new Error(result.error ?? "Не удалось обработать запрос");
	return result;
}
export function TelegramPassword({
	mode,
	onBack,
}: {
	mode: "change" | "recovery";
	onBack?: () => void;
}) {
	const [login, setLogin] = useState("");
	const [challenge, setChallenge] = useState<Challenge>();
	const [password, setPassword] = useState("");
	const [repeat, setRepeat] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		if (
			!challenge ||
			!["pending", "processing", "approved"].includes(challenge.status) ||
			busy
		)
			return;
		let cancelled = false;
		const timer = setInterval(async () => {
			try {
				const result = await passwordRequest("status", {
					browserToken: challenge.browserToken,
				});
				if (!cancelled)
					setChallenge((previous) =>
						previous ? { ...previous, ...result } : previous,
					);
			} catch {
				if (!cancelled)
					setError("Не удалось проверить подтверждение. Повторяем проверку…");
			}
		}, 3000);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [challenge?.browserToken, challenge?.status, busy]);
	const completed = challenge?.status === "completed";
	useEffect(() => {
		if (completed && mode === "change")
			void supabaseService
				.signOut()
				.catch(() =>
					setError("Пароль изменён. Перезагрузите страницу и войдите заново."),
				);
	}, [completed, mode]);
	const terminal =
		challenge && ["expired", "rejected"].includes(challenge.status);
	const button = "ui-button ui-button--secondary";
	async function perform(action: string) {
		setBusy(true);
		setError("");
		try {
			if (action === "begin")
				setChallenge(
					await passwordRequest("begin", { mode, login }, mode === "change"),
				);
			if (action === "complete" && challenge) {
				if (password !== repeat) throw new Error("Пароли не совпадают");
				if (new TextEncoder().encode(password).length > 72)
					throw new Error("Пароль должен занимать не более 72 байт UTF-8.");
				const result = await passwordRequest("complete", {
					browserToken: challenge.browserToken,
					password,
				});
				setPassword("");
				setRepeat("");
				setChallenge({ ...challenge, ...result });
			}
			if (action === "cancel" && challenge) {
				await passwordRequest("cancel", {
					browserToken: challenge.browserToken,
				});
				setChallenge(undefined);
				setPassword("");
				setRepeat("");
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Не удалось обработать запрос");
			if (action === "complete" && challenge) {
				const result = await passwordRequest("status", {
					browserToken: challenge.browserToken,
				}).catch(() => undefined);
				if (result) setChallenge({ ...challenge, ...result });
			}
		} finally {
			setBusy(false);
		}
	}
	return (
		<section
			className={`space-y-5 rounded-2xl border border-border bg-surface p-6 ${mode === "recovery" ? "auth-surface" : ""}`}
		>
			<div className="flex items-center gap-3">
				<ShieldCheck className="text-primary" />
				<h2 className="text-lg font-semibold">
					{mode === "recovery" ? "Восстановить доступ" : "Изменить пароль"}
				</h2>
			</div>
			<p className="text-sm text-muted-foreground">
				Подтвердите действие через привязанный Telegram. Затем задайте новый
				пароль здесь. Все старые сеансы будут завершены.
			</p>
			{completed ? (
				<div role="status">
					<p>Пароль изменён. Войдите с новым паролем.</p>
					{onBack && (
						<button className={button} onClick={onBack}>
							Вернуться ко входу
						</button>
					)}
				</div>
			) : (
				<>
					{!challenge ? (
						<form
							className="space-y-4"
							onSubmit={(e) => {
								e.preventDefault();
								void perform("begin");
							}}
						>
							{mode === "recovery" && (
								<label className="ui-field">
									Логин или email
									<input
										className="ui-input w-full"
										autoComplete="username"
										required
										maxLength={254}
										value={login}
										onChange={(e) => setLogin(e.target.value)}
										disabled={busy}
									/>
								</label>
							)}
							<button className={button} disabled={busy}>
								{busy ? "Создаём запрос…" : "Подтвердить через Telegram"}
							</button>
						</form>
					) : terminal ? (
						<div role="status">
							<p>
								{challenge.status === "expired"
									? "Время подтверждения истекло."
									: "Запрос отклонён."}
							</p>
							<button
								className={`${button} mt-3`}
								onClick={() => {
									setChallenge(undefined);
									setPassword("");
									setRepeat("");
									setError("");
								}}
							>
								Начать заново
							</button>
						</div>
					) : challenge.status === "approved" ? (
						<form
							className="space-y-4"
							onSubmit={(e) => {
								e.preventDefault();
								void perform("complete");
							}}
						>
							<p className="text-sm">Telegram подтверждён</p>
							<label className="ui-field">
								Новый пароль
								<input
									className="ui-input w-full"
									type="password"
									autoComplete="new-password"
									required
									minLength={12}
									maxLength={128}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									disabled={busy}
								/>
							</label>
							<label className="ui-field">
								Повторите пароль
								<input
									className="ui-input w-full"
									type="password"
									autoComplete="new-password"
									required
									value={repeat}
									onChange={(e) => setRepeat(e.target.value)}
									disabled={busy}
								/>
							</label>
							<button className={button} disabled={busy}>
								{busy ? "Сохраняем…" : "Сохранить новый пароль"}
							</button>
						</form>
					) : (
						<div className="space-y-4" role="status">
							<a
								className={`${button} inline-flex items-center gap-2`}
								href={challenge.telegramUrl}
								target="_blank"
								rel="noreferrer"
							>
								<Send size={16} /> Открыть Telegram
							</a>
							<p className="text-sm text-muted-foreground">
								{challenge.status === "processing"
									? "Проверяем результат смены пароля…"
									: "Откройте бота и подтвердите запрос. Эта страница обновится автоматически."}
							</p>
							<p className="text-xs text-muted-foreground">
								Запрос действует до{" "}
								{new Date(challenge.expiresAt).toLocaleTimeString()}. Без
								одобренной привязки Telegram обратитесь к администратору.
							</p>
						</div>
					)}
					{challenge && !terminal && (
						<button
							className={button}
							disabled={busy || challenge.status === "processing"}
							onClick={() => void perform("cancel")}
						>
							Отменить запрос
						</button>
					)}
					{onBack && (
						<button
							className="block text-sm text-muted-foreground"
							disabled={busy}
							onClick={onBack}
						>
							Вернуться ко входу
						</button>
					)}
				</>
			)}
			{error && (
				<p role="alert" className="text-sm text-red-400">
					{error}
				</p>
			)}
		</section>
	);
}
