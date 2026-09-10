import { useState } from "react";
import { supabase } from "@/services/supabase-client";
export function PasswordPanel() {
	const [password, setPassword] = useState("");
	const [repeat, setRepeat] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	return (
		<form
			className="space-y-3 rounded-lg border border-border bg-surface p-5"
			onSubmit={async (e) => {
				e.preventDefault();
				setMessage("");
				if (password !== repeat) {
					setMessage("Пароли не совпадают");
					return;
				}
				setBusy(true);
				try {
					if (!supabase) throw new Error("Авторизация не настроена");
					const { error } = await supabase.auth.updateUser({ password });
					if (error) throw error;
					setPassword("");
					setRepeat("");
					setMessage("Пароль изменён");
				} catch (e) {
					setMessage(
						e instanceof Error ? e.message : "Не удалось изменить пароль",
					);
				} finally {
					setBusy(false);
				}
			}}
		>
			<h2 className="font-semibold">Изменить мой пароль</h2>
			<input
				aria-label="Новый пароль"
				className="rounded border border-border bg-background p-2"
				type="password"
				placeholder="Новый пароль"
				autoComplete="new-password"
				required
				minLength={12}
				maxLength={128}
				value={password}
				onChange={(e) => setPassword(e.target.value)}
				disabled={busy}
			/>
			<input
				aria-label="Повторите новый пароль"
				className="rounded border border-border bg-background p-2"
				type="password"
				placeholder="Повторите пароль"
				autoComplete="new-password"
				required
				value={repeat}
				onChange={(e) => setRepeat(e.target.value)}
				disabled={busy}
			/>
			<button className="rounded border border-border p-2" disabled={busy}>
				Изменить пароль
			</button>
			{message && <p role="status">{message}</p>}
		</form>
	);
}
