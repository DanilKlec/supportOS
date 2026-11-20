import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Search, X } from "lucide-react";
import { useState } from "react";
import { ShareRecipientPicker } from "@/features/shared-binds/ShareRecipientPicker";
import { type Mailbox, mailService } from "@/services/mail.service";

export const oauthSessionKey = "supportos:mail:oauth";

export function MailAdministration({
	box,
	mode,
	onClose,
}: {
	box: Mailbox | undefined;
	mode: "connect" | "access";
	onClose: () => void;
}) {
	const client = useQueryClient();
	const [address, setAddress] = useState(box?.address ?? "");
	const [recipient, setRecipient] = useState("");
	const [revoke, setRevoke] = useState<string>();
	const members = useQuery({
		queryKey: ["mail", "members", box?.id],
		queryFn: () => mailService.members(box?.id ?? ""),
		enabled: mode === "access" && !!box,
	});
	const connect = useMutation({
		mutationFn: async () => {
			const { url, state } = await mailService.start(address.trim());
			sessionStorage.setItem(oauthSessionKey, state);
			window.location.assign(url);
		},
	});
	const access = useMutation({
		mutationFn: (operation: { id: string } | { email: string }) =>
			"id" in operation
				? mailService.revoke(box?.id ?? "", operation.id)
				: mailService.grant(box?.id ?? "", operation.email),
		onSuccess: () => {
			setRecipient("");
			setRevoke(undefined);
			void client.invalidateQueries({ queryKey: ["mail", "members", box?.id] });
		},
	});
	return (
		<div className="mail-overlay">
			<section
				className="mail-modal"
				aria-label={mode === "connect" ? "Подключение Gmail" : "Доступ к ящику"}
			>
				<header className="mail-modal-heading">
					<div>
						<h2>
							{mode === "connect" ? "Подключить Gmail" : "Доступ к ящику"}
						</h2>
						{mode === "access" && <p>{box?.address}</p>}
					</div>
					<button
						type="button"
						className="mail-icon"
						aria-label="Закрыть настройки почты"
						onClick={onClose}
					>
						<X size={17} />
					</button>
				</header>
				{mode === "connect" ? (
					<form
						className="mail-admin-body"
						onSubmit={(event) => {
							event.preventDefault();
							connect.mutate();
						}}
					>
						<label className="mail-field">
							Рабочий адрес
							<input
								type="email"
								required
								maxLength={254}
								value={address}
								onChange={(event) => setAddress(event.target.value)}
								placeholder="support@example.com"
							/>
						</label>
						<p className="mail-muted">
							Войдите в этот ящик и пройдите проверку Google на следующем
							экране.
						</p>
						{connect.error && (
							<p role="alert" className="mail-error">
								{connect.error.message}
							</p>
						)}
						<button
							type="submit"
							className="mail-button self-start"
							data-primary="true"
							disabled={connect.isPending}
						>
							<ExternalLink size={15} /> Продолжить в Google
						</button>
					</form>
				) : (
					<div className="mail-admin-body">
						<h3>Кто работает с ящиком</h3>
						{members.isPending ? <p className="mail-muted">Загрузка…</p> : null}
						{members.error && (
							<p role="alert" className="mail-error">
								{members.error.message}
							</p>
						)}
						{members.data?.members.length === 0 && (
							<p className="mail-muted">Доступ сотрудникам пока не выдан.</p>
						)}
						<ul className="mail-members">
							{members.data?.members.map((member) => (
								<li key={member.id}>
									<div>
										<b>{member.display_name || member.email}</b>
										<p>{member.email}</p>
									</div>
									{revoke === member.id ? (
										<div className="flex flex-wrap gap-1">
											<button
												type="button"
												className="mail-button"
												onClick={() => access.mutate({ id: member.id })}
												disabled={access.isPending}
											>
												Подтвердить отзыв
											</button>
											<button
												type="button"
												className="mail-button"
												onClick={() => setRevoke(undefined)}
											>
												Отмена
											</button>
										</div>
									) : (
										<button
											type="button"
											className="mail-button"
											onClick={() => setRevoke(member.id)}
										>
											Отозвать
										</button>
									)}
								</li>
							))}
						</ul>
						<label className="mail-field">
							Адрес сотрудника
							<input
								type="email"
								value={recipient}
								onChange={(event) => setRecipient(event.target.value)}
								placeholder="account@example.com"
							/>
						</label>
						<details className="mail-admin-directory">
							<summary className="mail-directory-heading">
								<Search size={15} aria-hidden="true" />
								<span>Найти сотрудника</span>
								<ChevronDown size={14} aria-hidden="true" />
							</summary>
							<div className="mail-directory-body">
								<ShareRecipientPicker
									value={recipient}
									onChange={setRecipient}
									disabled={access.isPending}
									sharedEmails={
										members.data?.members.map(({ email }) => email) ?? []
									}
								/>
							</div>
						</details>
						{access.error && (
							<p role="alert" className="mail-error">
								{access.error.message}
							</p>
						)}
						<button
							type="button"
							className="mail-button self-start"
							data-primary="true"
							disabled={!recipient.trim() || access.isPending}
							onClick={() => access.mutate({ email: recipient.trim() })}
						>
							Выдать доступ
						</button>
					</div>
				)}
			</section>
		</div>
	);
}
