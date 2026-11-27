import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { supabaseService } from "@/services/supabase.service";
import { useAuthStore } from "@/store/auth.store";
import { AuthenticatorForm } from "./AuthenticatorForm";

export function AuthenticatorGate() {
	const authError = useAuthStore((s) => s.error);
	const email = useAuthStore((s) => s.session?.user.email);
	const [error, setError] = useState("");
	return (
		<main className="grid min-h-dvh place-items-center bg-background px-4 py-8 text-foreground sm:px-6">
			<section
				aria-labelledby="mfa-title"
				className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-xl sm:p-8"
			>
				<header className="mb-7 text-center">
					<span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-accent/25 bg-accent/10 text-accent">
						<ShieldCheck size={28} strokeWidth={1.6} aria-hidden="true" />
					</span>
					<h1 id="mfa-title" className="text-2xl font-semibold tracking-tight">
						Подтвердите вход
					</h1>
					{email && (
						<p className="mt-1 break-all text-sm text-muted">{email}</p>
					)}
					<p className="mt-3 text-sm leading-relaxed text-muted">
						Введите шестизначный код из приложения Google Authenticator.
					</p>
				</header>
				<AuthenticatorForm
					submitLabel="Войти"
					onVerified={() => supabaseService.refreshIdentity()}
				/>
				{(error || authError) && (
					<p className="mt-3 text-sm text-danger" role="alert">
						{error || authError}
					</p>
				)}
				<footer className="mt-6 space-y-3 border-t border-border pt-4 text-center">
					<p className="text-xs leading-relaxed text-muted">
						Если у вас больше нет доступа к Authenticator, обратитесь к
						администратору.
					</p>
					<Button
						type="button"
						variant="ghost"
						onClick={() =>
							void supabaseService
								.signOut()
								.catch((e: unknown) =>
									setError(e instanceof Error ? e.message : "Не удалось выйти"),
								)
						}
					>
						<ArrowLeft size={15} aria-hidden="true" /> Отменить вход
					</Button>
				</footer>
			</section>
		</main>
	);
}
