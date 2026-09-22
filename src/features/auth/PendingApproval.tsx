import { useNavigate } from "@tanstack/react-router";
import {
	Check,
	Clock3,
	KeyRound,
	LogOut,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import {
	AmbientBackground,
	AmbientMotionButton,
} from "@/components/brand/AmbientBackground";
import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
import { supabaseService } from "@/services/supabase.service";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
export function PendingApproval() {
	const navigate = useNavigate();
	const email = useAuthStore((s) => s.session?.user.email);
	const [busy, setBusy] = useState(false),
		[message, setMessage] = useState("");
	async function check() {
		setBusy(true);
		setMessage("");
		try {
			await supabaseService.refreshIdentity();
			const state = useAuthStore.getState();
			if (state.error) throw new Error(state.error);
			const access = state.session?.user.access;
			if (access?.status === "active") {
				const to = ["/", "/admin", "/qc", "/agent-monitor", "/settings"].find(
					(path) => canAccessPage(access, path),
				);
				if (to) await navigate({ to });
				else
					setMessage(
						"Аккаунт подтверждён, но доступные разделы пока не назначены.",
					);
			} else
				setMessage(
					access?.status === "disabled"
						? "Доступ не одобрен. Обратитесь к администратору."
						: "Заявка ещё ожидает проверки.",
				);
		} catch (error) {
			setMessage(
				error instanceof Error ? error.message : "Не удалось проверить статус",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="approval-scene" aria-labelledby="approval-title">
			<AmbientBackground />
			<header className="approval-header">
				<span className="flex items-center gap-3 font-semibold">
					<SupportOSLogo className="h-8 w-8" />
					SupportOS<span className="text-blue-400">.</span>
				</span>
				<AmbientMotionButton />
			</header>
			<div className="approval-card">
				<div className="approval-visual" aria-hidden="true">
					<div className="approval-orbit" />
					<div className="approval-orbit approval-orbit-inner" />
					<div className="approval-emblem">
						<ShieldCheck size={42} strokeWidth={1.4} />
					</div>
					<span className="approval-satellite">
						<Check size={16} />
					</span>
				</div>
				<span className="approval-status">
					<span />
					Ожидает одобрения
				</span>
				<h1 id="approval-title">Вы почти в команде.</h1>
				<p className="approval-description">
					Аккаунт создан. Остался один шаг: администратор проверит заявку и
					откроет нужные вам инструменты.
				</p>
				<div className="approval-account">
					<span className="approval-avatar" aria-hidden="true">
						{email?.[0]?.toUpperCase() || "S"}
					</span>
					<div>
						<span>Ваш аккаунт</span>
						<strong>{email}</strong>
					</div>
					<Check
						size={18}
						className="text-emerald-400 shrink-0"
						aria-hidden="true"
					/>
				</div>
				<ol className="approval-steps" aria-label="Этапы получения доступа">
					<li className="is-complete">
						<span className="approval-step-icon">
							<Check size={17} />
						</span>
						<div>
							<strong>Регистрация завершена</strong>
							<p>Ваша заявка сохранена</p>
						</div>
						<span className="approval-step-label">Готово</span>
					</li>
					<li className="is-current" aria-current="step">
						<span className="approval-step-icon">
							<Clock3 size={17} />
						</span>
						<div>
							<strong>Проверка администратором</strong>
							<p>Сейчас ожидаем подтверждения</p>
						</div>
					</li>
					<li>
						<span className="approval-step-icon">
							<KeyRound size={17} />
						</span>
						<div>
							<strong>Доступ к рабочему пространству</strong>
							<p>По ролям, которые назначит администратор</p>
						</div>
					</li>
				</ol>
				{message && (
					<output className="approval-message" aria-live="polite">
						{message}
					</output>
				)}
				<div className="approval-actions">
					<button
						type="button"
						disabled={busy}
						className="ui-button ui-button--primary"
						onClick={() => void check()}
					>
						<RefreshCw
							size={16}
							className={busy ? "animate-spin motion-reduce:animate-none" : ""}
							aria-hidden="true"
						/>
						{busy ? "Проверяем…" : "Проверить статус"}
					</button>
					<button
						type="button"
						disabled={busy}
						className="ui-button"
						onClick={() =>
							void supabaseService
								.signOut()
								.catch(() =>
									setMessage("Не удалось выйти. Попробуйте ещё раз."),
								)
						}
					>
						<LogOut size={16} aria-hidden="true" />
						Выйти
					</button>
				</div>
				<p className="approval-footnote">
					Можно закрыть страницу и вернуться позже.
					<br />
					Повторно регистрироваться не нужно.
				</p>
			</div>
			<footer className="approval-footer">
				SupportOS · Всё для хорошей поддержки
			</footer>
		</section>
	);
}
