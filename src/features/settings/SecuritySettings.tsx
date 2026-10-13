import { ChevronDown, KeyRound } from "lucide-react";
import { useState } from "react";
import { AuthenticatorPanel } from "@/features/accounts/AuthenticatorPanel";
import { PasswordPanel } from "@/features/accounts/PasswordPanel";

export function SecuritySettings() {
	const [changingPassword, setChangingPassword] = useState(false);
	return (
		<>
			<AuthenticatorPanel />
			<section className="account-card">
				<div className="account-setting-row">
					<span className="account-row-icon">
						<KeyRound size={20} />
					</span>
					<div className="account-row-copy">
						<h3>Пароль</h3>
						<p>Обновите пароль для входа в аккаунт.</p>
					</div>
					<button
						type="button"
						className="ui-button ui-button--secondary account-small-button"
						aria-expanded={changingPassword}
						onClick={() => setChangingPassword((value) => !value)}
					>
						{changingPassword ? "Скрыть" : "Изменить пароль"}
						<ChevronDown size={14} aria-hidden="true" />
					</button>
				</div>
				{changingPassword && (
					<div className="account-password-editor">
						<PasswordPanel />
					</div>
				)}
			</section>
		</>
	);
}
