import { useAuthStore } from "@/store/auth.store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	ArrowRight,
	BookOpen,
	Eye,
	EyeOff,
	Headphones,
	Layers3,
	LoaderCircle,
	ShieldCheck,
} from "lucide-react";
import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
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
	const [showPassword, setShowPassword] = useState(false);
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
		<div className="login-scene">
			<div className="login-orbit login-orbit-one" aria-hidden="true" />
			<div className="login-orbit login-orbit-two" aria-hidden="true" />
			<header className="relative z-10 flex items-center gap-3 px-6 py-7 sm:px-10 lg:px-14">
				<SupportOSLogo className="h-9 w-9" />
				<span className="text-lg font-semibold tracking-tight">
					SupportOS<span className="text-blue-400">.</span>
				</span>
				<span className="ml-auto hidden text-xs tracking-wide text-slate-400 sm:block">
					РАБОЧЕЕ ПРОСТРАНСТВО КОМАНДЫ
				</span>
			</header>
			<div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 md:grid-cols-2 lg:gap-24 lg:py-16">
				<section className="hidden md:block">
					<span className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/5 px-3 py-1.5 text-xs text-blue-300">
						<span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Единая
						среда поддержки
					</span>
					<h1 className="max-w-lg text-5xl font-semibold leading-[1.12] tracking-tight lg:text-6xl">
						Всё для команды.
						<br />
						<span className="text-slate-400">В одном месте.</span>
					</h1>
					<p className="mt-6 max-w-sm text-base leading-7 text-slate-400">
						Знания, точные ответы и рабочие инструменты — рядом, когда они
						нужны.
					</p>
					<div className="mt-12 space-y-5">
						{[
							{
								icon: BookOpen,
								title: "Общая база знаний",
								text: "Бинды и информация для всей команды",
							},
							{
								icon: Headphones,
								title: "Инструменты поддержки",
								text: "Бонусы, почты проектов и AI-помощник",
							},
							{
								icon: Layers3,
								title: "Ваше рабочее пространство",
								text: "Разделы и возможности по вашей роли",
							},
						].map(({ icon: Icon, title, text }) => (
							<div key={title} className="flex items-center gap-4">
								<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-blue-300">
									<Icon size={20} />
								</span>
								<div>
									<h2 className="text-sm font-medium text-slate-200">
										{title}
									</h2>
									<p className="mt-1 text-xs text-slate-500">{text}</p>
								</div>
							</div>
						))}
					</div>
				</section>
				<section className="login-card mx-auto w-full max-w-md rounded-3xl border border-white/10 p-7 shadow-2xl sm:p-10">
					<span className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/10 text-blue-300">
						<ShieldCheck size={23} />
					</span>
					<h2 className="text-3xl font-semibold tracking-tight">
						С возвращением
					</h2>
					<p className="mt-3 text-sm leading-6 text-slate-400">
						Войдите в свой аккаунт SupportOS,
						<br />
						чтобы продолжить работу.
					</p>
					<form onSubmit={submit} className="mt-8 space-y-5">
						{!enabled && (
							<p
								role="alert"
								className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200"
							>
								Вход ещё не настроен. Обратитесь к администратору.
							</p>
						)}
						{error && (
							<p
								role="alert"
								className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-300"
							>
								{error}
							</p>
						)}
						<label className="block text-sm font-medium text-slate-300">
							Рабочая почта
							<input
								type="email"
								autoComplete="username"
								autoCapitalize="none"
								spellCheck={false}
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								disabled={!enabled || busy}
								placeholder="name@company.com"
								className="login-input mt-2"
							/>
						</label>
						<div>
							<label
								htmlFor="login-password"
								className="block text-sm font-medium text-slate-300"
							>
								Пароль
							</label>
							<div className="relative mt-2">
								<input
									id="login-password"
									type={showPassword ? "text" : "password"}
									autoComplete="current-password"
									required
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									disabled={!enabled || busy}
									placeholder="Введите пароль"
									className="login-input pr-12"
								/>
								<button
									type="button"
									aria-label={
										showPassword ? "Скрыть пароль" : "Показать пароль"
									}
									aria-pressed={showPassword}
									onClick={() => setShowPassword((v) => !v)}
									className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-xl text-slate-500 hover:text-slate-200"
								>
									{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
								</button>
							</div>
						</div>
						<button
							type="submit"
							disabled={!enabled || busy}
							className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-blue-500 text-sm font-semibold text-white shadow-lg shadow-blue-500/15 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{busy ? (
								<LoaderCircle size={18} className="animate-spin" />
							) : null}
							{busy ? "Входим…" : "Войти в пространство"}
							{!busy && <ArrowRight size={17} />}
						</button>
					</form>
					<p className="mt-7 border-t border-white/10 pt-6 text-center text-xs leading-5 text-slate-500">
						Нет аккаунта или забыли пароль?
						<br />
						<span className="text-slate-400">
							Обратитесь к администратору команды.
						</span>
					</p>
				</section>
			</div>
			<footer className="relative z-10 px-6 py-6 text-center text-xs text-slate-600">
				SupportOS · Пространство для качественной поддержки
			</footer>
		</div>
	);
}
