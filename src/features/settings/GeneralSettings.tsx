import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, LogIn, Palette, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { accountIdentity } from "./account-sections";

export function GeneralSettings() {
	const configured = useAuthStore((state) => state.configured);
	const session = useAuthStore((state) => state.session);
	const identity = accountIdentity(
		session?.user.email,
		session?.user.access?.display_name,
	);
	if (!session)
		return (
			<section className="account-card">
				<h3>Ваш аккаунт</h3>
				<p className="mt-2 text-sm text-muted">
					{configured
						? "Подключение к серверу настроено. Войдите в аккаунт, чтобы загрузить рабочие данные."
						: "Подключение к серверу не настроено. Рабочие данные недоступны."}
				</p>
				{configured && (
					<Link
						to="/login"
						className="ui-button mt-4 inline-flex items-center gap-2"
					>
						<LogIn size={16} />
						Войти
					</Link>
				)}
			</section>
		);
	const active = session.user.access?.status === "active";
	return (
		<>
			<section className="account-card account-profile-card">
				<div className="account-profile-identity">
					<div
						className="account-avatar account-avatar--large"
						aria-hidden="true"
					>
						{identity.initials}
					</div>
					<div className="min-w-0">
						<h3>{identity.name}</h3>
						<p>
							{session.user.access?.roles
								.map((role) => role.name)
								.join(" · ") || "Роли ещё не назначены"}
						</p>
					</div>
					<span
						className={`account-status ${active ? "account-status--success" : ""}`}
					>
						<span />
						{active
							? "Аккаунт активен"
							: session.user.access?.status === "disabled"
								? "Доступ отключён"
								: "Ожидает доступа"}
					</span>
				</div>
				<dl className="account-profile-fields">
					<div>
						<dt>Имя в команде</dt>
						<dd>{identity.name}</dd>
					</div>
					<div>
						<dt>{identity.addressLabel}</dt>
						<dd className="break-all">{identity.address || "Не указана"}</dd>
					</div>
				</dl>
				<div className="account-profile-roles">
					<span>Роли и доступ</span>
					<div>
						{session.user.access?.roles.length ? (
							session.user.access.roles.map((role) => (
								<span className="account-role" key={role.id}>
									<Check size={12} aria-hidden="true" />
									{role.name}
								</span>
							))
						) : (
							<span className="text-sm text-muted">Назначит администратор</span>
						)}
					</div>
				</div>
				<p className="account-card-note">
					Имя, рабочую почту и роли помогает изменить администратор команды.
				</p>
			</section>
			<div className="account-shortcuts">
				<Link to="/settings" hash="security" className="account-shortcut">
					<span
						className={`account-shortcut-icon ${session.mfaEnabled ? "account-shortcut-icon--success" : ""}`}
					>
						<ShieldCheck size={20} />
					</span>
					<span>
						<strong>Защита аккаунта</strong>
						<small>
							{session.mfaEnabled
								? "Двухфакторная защита включена"
								: "Подключите двухфакторную защиту"}
						</small>
					</span>
					<ArrowUpRight size={17} aria-hidden="true" />
				</Link>
				<Link to="/settings" hash="appearance" className="account-shortcut">
					<span className="account-shortcut-icon">
						<Palette size={20} />
					</span>
					<span>
						<strong>Ваш интерфейс</strong>
						<small>Тема, язык и удобный вид приложения</small>
					</span>
					<ArrowUpRight size={17} aria-hidden="true" />
				</Link>
			</div>
		</>
	);
}
