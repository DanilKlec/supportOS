import { type FormEvent, useState } from "react";
import { supabaseService } from "@/services/supabase.service";

export function PasswordForm({
	recovery = false,
	onBack,
}: {
	recovery?: boolean;
	onBack?: () => void;
}) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
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
		<section className="mx-auto w-full max-w-lg space-y-4 rounded-xl border border-border bg-surface p-6">
			<h2 className="text-xl font-semibold">
				{recovery ? "Восстановление пароля" : "Новый пароль"}
			</h2>
			<form onSubmit={submit} className="space-y-4">
				{recovery ? (
					<label className="ui-field">
						Почта
						<input
							className="ui-input"
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
						<label className="ui-field">
							Новый пароль
							<input
								className="ui-input"
								type="password"
								autoComplete="new-password"
								required
								minLength={12}
								maxLength={128}
								disabled={busy}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</label>
						<label className="ui-field">
							Повторите пароль
							<input
								className="ui-input"
								type="password"
								autoComplete="new-password"
								required
								minLength={12}
								maxLength={128}
								disabled={busy}
								value={confirmation}
								onChange={(e) => setConfirmation(e.target.value)}
							/>
						</label>
					</>
				)}
				<button className="ui-button" type="submit" disabled={busy}>
					{busy
						? "Обработка…"
						: recovery
							? "Отправить ссылку"
							: "Сохранить пароль"}
				</button>
			</form>
			{error && (
				<p role="alert" className="text-sm text-red-500">
					{error}
				</p>
			)}
			{message && <output>{message}</output>}
			{onBack && (
				<button
					type="button"
					className="ui-button"
					disabled={busy}
					onClick={onBack}
				>
					Вернуться ко входу
				</button>
			)}
		</section>
	);
}
