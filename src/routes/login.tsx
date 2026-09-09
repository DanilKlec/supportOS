import { useAuthStore } from "@/store/auth.store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LockKeyhole } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { safeAuthRedirect } from "@/app/auth-redirect";
import { supabaseService } from "@/services/supabase.service";

export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: safeAuthRedirect(search.redirect),
	}),
	component: LoginPage,
});
function LoginPage() {
	const navigate = useNavigate();
	const { redirect } = Route.useSearch();
	const session = useAuthStore((state) => state.session);
	const loading = useAuthStore((state) => state.loading);
	useEffect(() => {
		if (session && !loading)
			void navigate({ href: safeAuthRedirect(redirect), replace: true });
	}, [session, loading, redirect, navigate]);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const enabled = supabaseService.isConfigured();
	async function submit(event: FormEvent) {
		event.preventDefault();
		setError("");
		setBusy(true);
		try {
			await supabaseService.signIn(email, password);
			await navigate({ href: safeAuthRedirect(redirect), replace: true });
		} catch (error) {
			setError(error instanceof Error ? error.message : "Не удалось войти");
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-6">
			<form
				onSubmit={submit}
				className="w-full max-w-md space-y-5 rounded-xl border border-border bg-surface p-6 shadow-xl"
			>
				<LockKeyhole className="text-accent" size={28} />
				<h1 className="text-2xl font-bold">Вход в SupportOS</h1>
				<p className="text-sm text-muted">
					Войдите с личным аккаунтом. Для доступа обратитесь к администратору.
				</p>
				{!enabled && (
					<p role="alert">
						Укажите VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в
						окружении приложения.
					</p>
				)}
				{error && (
					<p role="alert" className="text-red-400">
						{error}
					</p>
				)}
				<label className="block">
					Email
					<input
						type="email"
						autoComplete="username"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						disabled={!enabled || busy}
						className="mt-2 w-full rounded-md border border-border bg-background p-2"
					/>
				</label>
				<label className="block">
					Пароль
					<input
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={!enabled || busy}
						className="mt-2 w-full rounded-md border border-border bg-background p-2"
					/>
				</label>
				<button
					type="submit"
					disabled={!enabled || busy}
					className="w-full rounded-md bg-accent p-2 font-semibold text-accent-foreground disabled:opacity-50"
				>
					{busy ? "Вход…" : "Войти"}
				</button>
			</form>
		</div>
	);
}
