import { KeyRound, LogOut, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { BaseModal } from "@/shared/modals/BaseModal";
import type { User } from "./account-types";

const accountActions = {
	password: {
		action: "user.password",
		title: "Изменить пароль?",
		prompt: "сменить пароль пользователя",
		detail:
			"Все сессии сотрудника завершатся. Для нового входа потребуется новый пароль.",
		confirm: "Да, сменить пароль",
	},
	delete: {
		action: "user.delete",
		title: "Удалить аккаунт?",
		prompt: "удалить аккаунт пользователя",
		detail:
			"Аккаунт и личные данные будут удалены без возможности восстановления. Общие материалы и журнал сохранятся.",
		confirm: "Да, удалить аккаунт",
	},
	mfa: {
		action: "user.mfa.reset",
		title: "Отключить 2FA?",
		prompt: "отключить двухфакторную защиту пользователя",
		detail:
			"Google Authenticator будет отвязан, а все сессии завершатся. Сотрудник сможет войти снова и включить 2FA в личном кабинете.",
		confirm: "Да, отключить 2FA",
	},
	sessions: {
		action: "user.sessions.revoke",
		title: "Завершить все сессии?",
		prompt: "завершить все сессии пользователя",
		detail:
			"Сотрудник выйдет из аккаунта на всех устройствах при следующей проверке сессии. Пароль и настройки 2FA сохранятся; новый вход останется доступен.",
		confirm: "Да, завершить все сессии",
	},
};

export function UserAccountActions({
	user,
	disabled,
	onSave,
}: {
	user: User;
	disabled: boolean;
	onSave: (body: unknown) => Promise<void>;
}) {
	const [password, setPassword] = useState("");
	const [repeat, setRepeat] = useState("");
	const [confirmation, setConfirmation] = useState<
		keyof typeof accountActions | null
	>(null);
	const [error, setError] = useState("");
	const selectedAction = confirmation ? accountActions[confirmation] : null;
	return (
		<div className="employee-security">
			<div className="employee-info">
				<ShieldCheck size={18} />
				<p>
					Управляйте защитой аккаунта и завершайте сессии сотрудника. Все
					действия сохраняются в журнале.
				</p>
			</div>
			<div className="employee-security-tools">
				<section className="employee-card employee-security-tool">
					<div className="employee-card-heading">
						<ShieldOff size={18} />
						<div>
							<h3>Двухфакторная защита</h3>
							<p>Google Authenticator</p>
						</div>
					</div>
					<p className="employee-hint">
						Отвяжите аутентификатор, если сотрудник потерял доступ к кодам. Все
						его сессии завершатся.
					</p>
					<div className="employee-card-actions">
						<Button
							variant="danger-quiet"
							disabled={disabled}
							onClick={() => setConfirmation("mfa")}
						>
							Отключить 2FA
						</Button>
					</div>
				</section>
				<section className="employee-card employee-security-tool">
					<div className="employee-card-heading">
						<LogOut size={18} />
						<div>
							<h3>Выйти на всех устройствах</h3>
							<p>Принудительное завершение сессий</p>
						</div>
					</div>
					<p className="employee-hint">
						Завершите все текущие сессии сотрудника. Пароль и 2FA сохранятся,
						новый вход останется доступен.
					</p>
					<div className="employee-card-actions">
						<Button
							variant="secondary"
							disabled={disabled}
							onClick={() => setConfirmation("sessions")}
						>
							Завершить все сессии
						</Button>
					</div>
				</section>
			</div>
			<form
				className="employee-card"
				onSubmit={(event) => {
					event.preventDefault();
					if (password !== repeat) {
						setError("Пароли не совпадают");
						return;
					}
					setError("");
					setConfirmation("password");
				}}
			>
				<div className="employee-card-heading">
					<KeyRound size={18} />
					<div>
						<h3>Изменить пароль</h3>
						<p>Задайте новый пароль для этого сотрудника.</p>
					</div>
				</div>
				<div className="employee-fields">
					<label className="employee-field">
						<span>Новый пароль</span>
						<Input
							type="password"
							autoComplete="new-password"
							required
							minLength={12}
							maxLength={128}
							value={password}
							disabled={disabled}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</label>
					<label className="employee-field">
						<span>Повторите новый пароль</span>
						<Input
							type="password"
							autoComplete="new-password"
							required
							minLength={12}
							maxLength={128}
							value={repeat}
							disabled={disabled}
							onChange={(e) => setRepeat(e.target.value)}
						/>
					</label>
				</div>
				<p className="employee-hint">
					От 12 до 128 символов. Текущий пароль не показывается. Передайте новый
					пароль сотруднику лично.
				</p>
				{error && (
					<p role="alert" className="text-sm text-red-400">
						{error}
					</p>
				)}
				<div className="employee-card-actions">
					<Button
						variant="primary"
						type="submit"
						disabled={disabled || password.length < 12 || !repeat}
					>
						Сменить пароль
					</Button>
				</div>
			</form>
			<section className="employee-card employee-card--danger">
				<div className="employee-card-heading">
					<Trash2 size={18} />
					<div>
						<h3>Удаление аккаунта</h3>
						<p>Без возможности восстановления.</p>
					</div>
				</div>
				<p className="employee-hint">
					Аккаунт, личные бинды и персональные данные будут удалены. Общие
					материалы и журнал действий сохранятся.
				</p>
				<div className="employee-card-actions">
					<Button
						variant="danger"
						disabled={disabled}
						onClick={() => setConfirmation("delete")}
					>
						Удалить аккаунт
					</Button>
				</div>
			</section>
			{confirmation && selectedAction && (
				<BaseModal
					title={selectedAction.title}
					onClose={() => setConfirmation(null)}
					closeDisabled={disabled}
					size="sm"
				>
					<p className="text-sm leading-7">
						Вы уверены, что хотите {selectedAction.prompt}{" "}
						<strong className="break-all">{user.email}</strong>?
					</p>
					<p className="mt-3 text-xs leading-6 text-muted">
						{selectedAction.detail}
					</p>
					<div className="ui-actions justify-end gap-2 mt-5">
						<Button
							variant="secondary"
							disabled={disabled}
							onClick={() => setConfirmation(null)}
						>
							Отмена
						</Button>
						<Button
							variant={confirmation === "delete" ? "danger" : "primary"}
							disabled={disabled}
							onClick={() => {
								const action = confirmation;
								setConfirmation(null);
								void onSave({
									action: accountActions[action].action,
									confirmed: true,
									payload: {
										id: user.id,
										version: user.version,
										...(action === "password" ? { password } : {}),
									},
								});
							}}
						>
							{selectedAction.confirm}
						</Button>
					</div>
				</BaseModal>
			)}
		</div>
	);
}
