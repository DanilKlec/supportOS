import {
	AmbientBackground,
	AmbientMotionButton,
} from "@/components/brand/AmbientBackground";
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
			<AmbientBackground />
			<header className="relative z-10 flex items-center gap-3 px-6 py-7 sm:px-10 lg:px-14">
				<SupportOSLogo className="h-9 w-9" />
				<span className="text-lg font-semibold tracking-tight">
					SupportOS<span className="text-blue-400">.</span>
				</span>
				<span className="ml-auto hidden text-xs tracking-wide text-zinc-400 sm:block">
					РАБОЧЕЕ ПРОСТРАНСТВО КОМАНДЫ
				</span>
			</header>
			<div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 md:grid-cols-2 lg:gap-24 lg:py-16">
				<section className="hidden md:block">
					<span className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300">
						<span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Единая
						среда поддержки
					</span>
					<h1 className="login-headline max-w-lg text-5xl font-semibold leading-[1.12] tracking-tight lg:text-6xl">
						Поддержка.
						<br />
						<span className="text-zinc-400">В полном фокусе.</span>
					</h1>
					<p className="mt-6 max-w-sm text-base leading-7 text-zinc-400">
						Знания, точные ответы и рабочие инструменты — рядом, когда они
						нужны.
					</p>
					<div className="mt-10 grid gap-3">
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
							<div
								key={title}
								className="login-feature flex items-center gap-4"
							>
								<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-zinc-300">
									<Icon size={20} />
								</span>
								<div>
									<h2 className="text-sm font-medium text-zinc-200">{title}</h2>
									<p className="mt-1 text-xs text-zinc-400">{text}</p>
								</div>
							</div>
						))}
					</div>
				</section>
				<section className="login-card mx-auto w-full max-w-md rounded-3xl border border-white/10 p-7 shadow-2xl sm:p-10">
					<span className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-300">
						<ShieldCheck size={23} />
					</span>
					<p className="mb-3 text-[10px] font-medium uppercase tracking-[.22em] text-zinc-400">
						Ваше рабочее пространство
					</p>
					<h2 className="text-3xl font-semibold tracking-tight">
						С возвращением
					</h2>
					<p className="mt-3 text-sm leading-6 text-zinc-400">
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
						<label className="block text-sm font-medium text-zinc-300">
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
								className="block text-sm font-medium text-zinc-300"
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
									className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-200"
								>
									{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
								</button>
							</div>
						</div>
						<button
							type="submit"
							disabled={!enabled || busy}
							className="login-submit flex h-13 w-full items-center justify-center gap-3 rounded-xl text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
						>
							{busy ? (
								<LoaderCircle size={18} className="animate-spin" />
							) : null}
							{busy ? "Входим…" : "Войти в пространство"}
							{!busy && <ArrowRight size={17} />}
						</button>
					</form>
					<p className="mt-7 border-t border-white/10 pt-6 text-center text-xs leading-5 text-zinc-500">
						Нет аккаунта или забыли пароль?
						<br />
						<span className="text-zinc-400">
							Обратитесь к администратору команды.
						</span>
					</p>
				</section>
			</div>
			<footer className="relative z-10 flex flex-wrap items-center justify-center gap-4 px-6 py-6 text-center text-xs text-zinc-400">
				<span>SupportOS · Пространство для качественной поддержки</span>
				<AmbientMotionButton />
			</footer>
		</div>
	);
}
