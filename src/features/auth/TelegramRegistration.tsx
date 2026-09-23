import { Check, ExternalLink, KeyRound, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";
import {
	AmbientBackground,
	AmbientMotionButton,
} from "@/components/brand/AmbientBackground";
import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
import {
	registrationRequest,
	type TelegramChallenge,
} from "@/services/telegram-registration";

export function TelegramRegistration({
	challenge,
	initialPassword,
	onComplete,
	onCancel,
}: {
	challenge: TelegramChallenge;
	initialPassword: string;
	onComplete: (password: string) => Promise<void>;
	onCancel: () => void;
}) {
	const [busy, setBusy] = useState(false);
	const [verified, setVerified] = useState(false);
	const [message, setMessage] = useState("");
	const [password, setPassword] = useState(initialPassword);
	const [confirmation, setConfirmation] = useState("");
	async function finish() {
		setBusy(true);
		setMessage("");
		try {
			const status = await registrationRequest<{ verified: boolean }>(
				"status",
				{ browserToken: challenge.browserToken },
			);
			setVerified(status.verified);
			if (!status.verified) {
				setMessage(
					"Откройте бота, нажмите «Старт», затем «Подтвердить мою заявку». После этого вернитесь сюда.",
				);
				return;
			}
			if (password.length < 12 || password.length > 128)
				throw new Error("Введите пароль длиной от 12 до 128 символов.");
			if (!initialPassword && password !== confirmation)
				throw new Error("Пароли не совпадают");
			await onComplete(password);
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: "Не удалось завершить регистрацию",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="min-h-screen bg-background p-4 sm:p-8">
			<section
				className="approval-scene"
				aria-labelledby="telegram-registration-title"
			>
				<AmbientBackground />
				<header className="approval-header">
					<span className="flex items-center gap-3 font-semibold">
						<SupportOSLogo className="h-8 w-8" />
						SupportOS
					</span>
					<AmbientMotionButton />
				</header>
				<div className="approval-card">
					<div className="approval-visual" aria-hidden="true">
						<div className="approval-orbit" />
						<div className="approval-orbit approval-orbit-inner" />
						<div className="approval-emblem">
							<Send size={38} strokeWidth={1.4} />
						</div>
					</div>
					<span className="approval-status">
						<span />
						{verified ? "Telegram подтверждён" : "Подтверждение через Telegram"}
					</span>
					<h1 id="telegram-registration-title">Давайте познакомимся.</h1>
					<p className="approval-description">
						Подтвердите свою заявку в боте и вернитесь на эту страницу. Затем
						администратор проверит аккаунт и назначит роли.
					</p>
					<div className="approval-account">
						<span className="approval-avatar" aria-hidden="true">
							{challenge.login[0].toUpperCase()}
						</span>
						<div>
							<span>Ваш логин в SupportOS</span>
							<strong>{challenge.login}</strong>
						</div>
					</div>
					<ol className="approval-steps" aria-label="Этапы регистрации">
						<li
							className={verified ? "is-complete" : "is-current"}
							aria-current={verified ? undefined : "step"}
						>
							<span className="approval-step-icon">
								{verified ? <Check size={17} /> : <Send size={17} />}
							</span>
							<div>
								<strong>Подтвердите Telegram</strong>
								<p>Сверьте логин в боте и подтвердите свою заявку</p>
							</div>
						</li>
						<li
							className={verified ? "is-current" : undefined}
							aria-current={verified ? "step" : undefined}
						>
							<span className="approval-step-icon">
								<ShieldCheck size={17} />
							</span>
							<div>
								<strong>Завершите регистрацию здесь</strong>
								<p>Аккаунт поступит на проверку администратору</p>
							</div>
						</li>
						<li>
							<span className="approval-step-icon">
								<KeyRound size={17} />
							</span>
							<div>
								<strong>Получите доступ</strong>
								<p>После одобрения и назначения ролей</p>
							</div>
						</li>
					</ol>
					{!initialPassword && (
						<div className="mb-4 space-y-3 text-left">
							<p className="text-xs text-muted">
								После обновления страницы пароль нужно ввести снова — мы его не
								сохраняем.
							</p>
							<label className="block text-sm">
								Пароль
								<input
									type="password"
									autoComplete="new-password"
									minLength={12}
									maxLength={128}
									className="login-input mt-2"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									disabled={busy}
								/>
							</label>
							<label className="block text-sm">
								Повторите пароль
								<input
									type="password"
									autoComplete="new-password"
									className="login-input mt-2"
									value={confirmation}
									onChange={(e) => setConfirmation(e.target.value)}
									disabled={busy}
								/>
							</label>
						</div>
					)}
					{message && (
						<output className="approval-message" aria-live="polite">
							{message}
						</output>
					)}
					<div className="grid gap-3">
						<a
							className="ui-button ui-button--primary flex items-center justify-center gap-2"
							href={challenge.telegramUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							<ExternalLink size={16} />
							Подтвердить через Telegram
						</a>
						<button
							type="button"
							className="ui-button"
							disabled={busy}
							onClick={() => void finish()}
						>
							{busy ? "Проверяем…" : "Завершить регистрацию"}
						</button>
						<button
							type="button"
							className="text-xs text-muted"
							disabled={busy}
							onClick={onCancel}
						>
							Вернуться ко входу
						</button>
					</div>
					<p className="approval-footnote">
						Ссылка действует 20 минут. Не пересылайте её другим.
						<br />
						Бот не запрашивает пароль и не назначает роли.
					</p>
				</div>
				<footer className="approval-footer">
					SupportOS · Всё для хорошей поддержки
				</footer>
			</section>
		</div>
	);
}
