import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";

import { isTemporaryAccessEnabled, useAccessStore } from "@/store/access.store";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const signIn = useAccessStore((state) => state.signIn);
	const [login, setLogin] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const enabled = isTemporaryAccessEnabled();

	const submit = (event: FormEvent) => {
		event.preventDefault();
		setError("");

		if (!signIn(login, password)) {
			setError("Неверный логин или пароль");
			return;
		}

		void navigate({ to: "/" });
	};

	return (
		<div className="flex min-h-screen items-center justify-center overflow-auto bg-background p-6">
			<form
				onSubmit={submit}
				className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-2xl"
			>
				<div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
					<LockKeyhole size={24} />
				</div>

				<div className="mb-6">
					<h1 className="text-2xl font-bold">Вход в SupportOS</h1>
					<p className="mt-1 text-sm text-muted">
						Введите данные временного аккаунта администратора.
					</p>
				</div>

				{!enabled ? (
					<div className="mb-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
						Временная авторизация отключена в настройках окружения.
					</div>
				) : null}

				{error ? (
					<div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
						{error}
					</div>
				) : null}

				<div className="space-y-4">
					<label className="block space-y-2">
						<span className="text-sm font-medium">Логин</span>
						<input
							type="text"
							value={login}
							onChange={(event) => setLogin(event.target.value)}
							disabled={!enabled}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
							placeholder="admin"
							autoComplete="username"
							required
						/>
					</label>

					<label className="block space-y-2">
						<span className="text-sm font-medium">Пароль</span>
						<input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							disabled={!enabled}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
							placeholder="••••••••"
							autoComplete="current-password"
							required
						/>
					</label>
				</div>

				<button
					type="submit"
					disabled={!enabled}
					className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					<LogIn size={16} />
					Войти
				</button>

				<div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted">
					<ShieldCheck size={16} className="mt-0.5 shrink-0" />
					<span>
						Это временный локальный доступ. Полноценная серверная авторизация
						будет подключена позднее.
					</span>
				</div>
			</form>
		</div>
	);
}
