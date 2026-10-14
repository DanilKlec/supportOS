import { useState } from "react";
import { supabaseService } from "@/services/supabase.service";
import { useAuthStore } from "@/store/auth.store";
import { AuthenticatorForm } from "./AuthenticatorForm";

export function AuthenticatorGate() {
	const authError = useAuthStore((s) => s.error);
	const [error, setError] = useState("");
	return (
		<main className="min-h-screen bg-background px-6 py-16 text-foreground">
			<div className="mx-auto max-w-lg space-y-6 rounded-3xl border border-border bg-surface p-6 sm:p-8">
				<h1 className="text-2xl font-semibold">Двухфакторная защита</h1>
				<p className="text-sm text-muted">
					Для вашего аккаунта включена 2FA. Подтвердите вход кодом Google
					Authenticator.
				</p>
				<AuthenticatorForm
					onVerified={() => supabaseService.refreshIdentity()}
				/>
				{(error || authError) && <p role="alert">{error || authError}</p>}
				<p className="text-xs text-muted">
					Если вы потеряли доступ к приложению, обратитесь к администратору для
					восстановления второго фактора.
				</p>
				<button
					type="button"
					className="ui-button"
					onClick={() =>
						void supabaseService
							.signOut()
							.catch((e: unknown) =>
								setError(e instanceof Error ? e.message : "Не удалось выйти"),
							)
					}
				>
					Отменить вход
				</button>
			</div>
		</main>
	);
}
