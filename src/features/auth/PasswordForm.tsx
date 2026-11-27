import {
	ArrowLeft,
	ArrowRight,
	Eye,
	EyeOff,
	KeyRound,
	Mail,
	ShieldCheck,
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui";
import { supabaseService } from "@/services/supabase.service";

function PasswordField({
	label,
	value,
	onChange,
	disabled,
	description,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	description?: string;
}) {
	const id = useId();
	const [visible, setVisible] = useState(false);
	return (
		<div className="grid gap-1.5">
			<label htmlFor={id} className="text-sm font-medium">
				{label}
			</label>
			<div className="relative">
				<input
					id={id}
					className="ui-input h-11 w-full rounded-xl pe-12"
					type={visible ? "text" : "password"}
					autoComplete="new-password"
					aria-describedby={description}
					required
					minLength={12}
					maxLength={128}
					disabled={disabled}
					value={value}
					onChange={(event) => onChange(event.target.value)}
				/>
				<button
					type="button"
					aria-label={`${visible ? "Скрыть" : "Показать"} поле «${label}»`}
					aria-controls={id}
					disabled={disabled}
					className="absolute inset-y-1 end-1 grid w-10 place-items-center rounded-lg text-muted hover:bg-surface-elevated hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
					onClick={() => setVisible((current) => !current)}
				>
					{visible ? (
						<EyeOff size={17} aria-hidden="true" />
					) : (
						<Eye size={17} aria-hidden="true" />
					)}
				</button>
			</div>
		</div>
	);
}

export function PasswordForm({
	recovery = false,
	invitation = false,
	onBack,
}: {
	recovery?: boolean;
	invitation?: boolean;
	onBack?: () => void;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const headingId = useId();
	const hintId = useId();
	const Icon = recovery ? Mail : invitation ? ShieldCheck : KeyRound;
	const title = recovery
		? "Восстановление пароля"
		: invitation
			? "Активируйте аккаунт SupportOS"
			: "Новый пароль";
	const description = recovery
		? "Введите рабочий email, чтобы получить ссылку для восстановления."
		: invitation
			? "Почта подтверждена. Установите пароль для первого входа."
			: "Установите новый пароль для входа в SupportOS.";
	async function submit(event: FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError("");
		setMessage("");
		try {
			if (recovery) {
				await supabaseService.resetPassword(email);
				setMessage(
					"Если аккаунт с этой почтой существует, на неё придёт ссылка для восстановления пароля.",
				);
			} else {
				if (password !== confirmation) throw new Error("Пароли не совпадают");
				await supabaseService.updatePassword(password);
				if (invitation) {
					window.location.replace("/login?invite=done");
					return;
				}
				setPassword("");
				setConfirmation("");
				setMessage("Пароль обновлён. Войдите снова с новым паролем.");
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Не удалось обновить пароль");
		} finally {
			setBusy(false);
		}
	}
	return (
		<main className="grid min-h-dvh place-items-center bg-background px-4 py-8 text-foreground sm:px-6">
			<section
				aria-labelledby={headingId}
				className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-xl sm:p-8"
			>
				<header className="mb-7 text-center">
					<span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
						<Icon size={27} strokeWidth={1.6} aria-hidden="true" />
					</span>
					<h1 id={headingId} className="text-2xl font-semibold tracking-tight">
						{title}
					</h1>
					<p className="mt-2 text-sm leading-relaxed text-muted">
						{description}
					</p>
				</header>
				<form onSubmit={submit} className="space-y-4">
					{recovery ? (
						<label className="ui-field">
							Почта
							<input
								className="ui-input h-11 w-full rounded-xl"
								type="email"
								autoComplete="email"
								required
								disabled={busy}
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</label>
					) : (
						<>
							<PasswordField
								label="Новый пароль"
								value={password}
								onChange={setPassword}
								disabled={busy}
								description={hintId}
							/>
							<PasswordField
								label="Повторите пароль"
								value={confirmation}
								onChange={setConfirmation}
								disabled={busy}
							/>
							<p id={hintId} className="text-xs leading-relaxed text-muted">
								От 12 до 128 символов.
							</p>
						</>
					)}
					{error && (
						<p
							role="alert"
							className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-sm text-danger"
						>
							{error}
						</p>
					)}
					{message && (
						<output className="block rounded-xl border border-accent/25 bg-accent/10 p-3 text-sm leading-relaxed">
							{message}
						</output>
					)}
					<Button
						variant="primary"
						className="mt-1 min-h-11 w-full justify-center gap-2 rounded-xl font-semibold"
						type="submit"
						loading={busy}
					>
						{busy
							? "Обработка…"
							: recovery
								? "Отправить ссылку"
								: "Сохранить пароль"}
						{!busy && <ArrowRight size={16} aria-hidden="true" />}
					</Button>
				</form>
				{onBack && (
					<footer className="mt-5 border-t border-border pt-4 text-center">
						<Button
							type="button"
							variant="ghost"
							disabled={busy}
							onClick={onBack}
						>
							<ArrowLeft size={15} aria-hidden="true" /> Вернуться ко входу
						</Button>
					</footer>
				)}
			</section>
		</main>
	);
}
