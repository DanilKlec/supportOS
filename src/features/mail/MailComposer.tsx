import { useMutation } from "@tanstack/react-query";
import { Clock3, Paperclip, Send, X } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";
import {
	type Mailbox,
	type MailDraft,
	mailService,
} from "@/services/mail.service";

export const emptyMailDraft: MailDraft = {
	to: "",
	cc: "",
	bcc: "",
	subject: "",
	text: "",
	attachments: [],
};

async function encodeFile(file: File) {
	const data = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
		reader.onerror = () =>
			reject(new Error(`Не удалось прочитать ${file.name}`));
		reader.readAsDataURL(file);
	});
	return { name: file.name, data };
}

function recipientAddresses(value: string) {
	return value
		.split(/[,;](?=(?:[^"]*"[^"]*")*[^"]*$)/)
		.map((part) => {
			const entry = part.trim();
			return /<([^<>]+)>$/.exec(entry)?.[1] ?? entry;
		})
		.filter(Boolean);
}

function readRecentRecipients(key: string | undefined): string[] {
	try {
		const saved: unknown = key && JSON.parse(localStorage.getItem(key) ?? "[]");
		return Array.isArray(saved)
			? saved.filter((email): email is string => typeof email === "string")
			: [];
	} catch {
		return [];
	}
}

export function MailComposer({
	box,
	userId,
	draft,
	onDone,
	onClose,
}: {
	box: Mailbox;
	userId?: string;
	draft: MailDraft;
	onDone: (message: string) => void;
	onClose: () => void;
}) {
	const [fields, setFields] = useState(draft);
	const [files, setFiles] = useState<{ id: string; file: File }[]>([]);
	const [copies, setCopies] = useState(Boolean(draft.cc || draft.bcc));
	const [error, setError] = useState("");
	const [confirmClose, setConfirmClose] = useState(false);
	const recentKey =
		userId && `supportos:mail:recent-recipients:${userId}:${box.id}`;
	const [recentRecipients] = useState(() => readRecentRecipients(recentKey));
	const [showRecent, setShowRecent] = useState(false);
	const recentId = useId();
	const addressesInField = new Set(
		recipientAddresses(fields.to).map((email) => email.toLowerCase()),
	);
	const availableRecipients = recentRecipients.filter(
		(email) => !addressesInField.has(email.toLowerCase()),
	);
	const fileInput = useRef<HTMLInputElement>(null);
	const toInput = useRef<HTMLInputElement>(null);
	const mutation = useMutation({
		mutationFn: async (action: "send" | "save" | "delete") => {
			if (action === "delete" && fields.draftId)
				return mailService.deleteDraft(box.id, fields.draftId);
			const payload = {
				...fields,
				attachments: await Promise.all(
					files.map(({ file }) => encodeFile(file)),
				),
			};
			return action === "send"
				? mailService.send(box.id, payload)
				: mailService.save(box.id, payload);
		},
		onSuccess: (_, action) => {
			if (action === "send" && recentKey) {
				const recipients = new Map<string, string>();
				for (const email of [
					...recipientAddresses(fields.to),
					...readRecentRecipients(recentKey),
				]) {
					const normalized = email.toLowerCase();
					if (!recipients.has(normalized)) recipients.set(normalized, email);
				}
				try {
					localStorage.setItem(
						recentKey,
						JSON.stringify([...recipients.values()].slice(0, 12)),
					);
				} catch {
					// A browser storage failure must not affect an already sent message.
				}
			}
			onDone(
				action === "send"
					? "Письмо отправлено"
					: action === "delete"
						? "Черновик удалён"
						: "Черновик сохранён",
			);
		},
		onError: (issue) => setError(issue.message),
	});
	const change = (
		key: "to" | "cc" | "bcc" | "subject" | "text",
		value: string,
	) => setFields((current) => ({ ...current, [key]: value }));
	const close = () => {
		if (mutation.isPending) return;
		if (fields !== draft || files.length) setConfirmClose(true);
		else onClose();
	};
	const send = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!mutation.isPending) mutation.mutate("send");
	};
	return (
		<div className="mail-overlay">
			<section
				aria-label={draft.threadId ? "Ответ на письмо" : "Редактор письма"}
				className="mail-modal mail-composer"
			>
				<header className="mail-modal-heading">
					<div>
						<h2>
							{draft.threadId
								? "Ответ на письмо"
								: draft.draftId
									? "Черновик"
									: "Новое письмо"}
						</h2>
						<p>{box.address}</p>
					</div>
					<button
						type="button"
						className="mail-icon"
						aria-label="Закрыть редактор"
						disabled={mutation.isPending}
						onClick={close}
					>
						<X size={17} />
					</button>
				</header>
				<form
					className="mail-compose-fields"
					onSubmit={send}
					onKeyDown={(event) => {
						if (event.key === "Escape") close();
					}}
				>
					<fieldset className="contents" disabled={mutation.isPending}>
						<legend className="sr-only">Письмо</legend>
						<div className="flex items-center gap-2">
							<label className="mail-field grow">
								Кому
								<input
									ref={toInput}
									autoComplete="off"
									value={fields.to}
									onChange={(e) => change("to", e.target.value)}
									placeholder="Адреса через запятую"
								/>
							</label>
							{!copies && (
								<button
									type="button"
									className="mail-button self-end"
									onClick={() => setCopies(true)}
								>
									Копия
								</button>
							)}
						</div>
						{availableRecipients.length > 0 && (
							<div className="mail-recent">
								<button
									type="button"
									className="mail-button"
									aria-expanded={showRecent}
									aria-controls={recentId}
									onClick={() => setShowRecent(!showRecent)}
								>
									<Clock3 size={14} aria-hidden="true" /> Недавние адресаты
								</button>
								{showRecent && (
									<ul
										className="mail-recent-options"
										id={recentId}
										aria-label="Недавние адресаты"
									>
										{availableRecipients.map((email) => (
											<li key={email}>
												<button
													type="button"
													className="mail-button"
													onClick={() => {
														const current = fields.to.trim();
														change(
															"to",
															current
																? `${current.replace(/[,;]\s*$/, "")}, ${email}`
																: email,
														);
														setShowRecent(false);
														toInput.current?.focus();
													}}
												>
													{email}
												</button>
											</li>
										))}
									</ul>
								)}
							</div>
						)}
						{copies && (
							<div className="mail-copies">
								<label className="mail-field">
									Копия
									<input
										value={fields.cc}
										onChange={(e) => change("cc", e.target.value)}
									/>
								</label>
								<label className="mail-field">
									Скрытая копия
									<input
										value={fields.bcc}
										onChange={(e) => change("bcc", e.target.value)}
									/>
								</label>
							</div>
						)}
						<label className="mail-field">
							Тема
							<input
								maxLength={500}
								value={fields.subject}
								onChange={(e) => change("subject", e.target.value)}
							/>
						</label>
						<label className="mail-field mail-body-field">
							Сообщение
							<textarea
								maxLength={200000}
								value={fields.text}
								onChange={(e) => change("text", e.target.value)}
							/>
						</label>
						{fields.preservedAttachments && (
							<p className="mail-muted">
								Вложения черновика сохранятся при отправке.
							</p>
						)}
						{files.length > 0 && (
							<ul className="mail-files">
								{files.map(({ id, file }) => (
									<li key={id}>
										<span>{file.name}</span>
										<button
											type="button"
											className="mail-icon"
											aria-label={`Убрать ${file.name}`}
											onClick={() =>
												setFiles((current) =>
													current.filter((item) => item.id !== id),
												)
											}
										>
											<X size={13} />
										</button>
									</li>
								))}
							</ul>
						)}
						{error && (
							<p role="alert" className="mail-error">
								{error}
							</p>
						)}
						{confirmClose ? (
							<div className="mail-notice">
								<p>
									{fields.draftId
										? "Закрыть редактор без сохранения изменений?"
										: "Сохранить письмо как черновик?"}
								</p>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										className="mail-button"
										onClick={() => mutation.mutate("save")}
									>
										Сохранить
									</button>
									<button
										type="button"
										className="mail-button"
										onClick={onClose}
									>
										Закрыть без сохранения
									</button>
									<button
										type="button"
										className="mail-button"
										onClick={() => setConfirmClose(false)}
									>
										Продолжить
									</button>
								</div>
							</div>
						) : null}
						<footer className="mail-compose-actions">
							<button type="submit" className="mail-button" data-primary="true">
								<Send size={14} /> Отправить
							</button>
							<button
								type="button"
								className="mail-button"
								onClick={() => mutation.mutate("save")}
							>
								Сохранить черновик
							</button>
							<button
								type="button"
								className="mail-icon"
								title="Прикрепить файлы"
								aria-label="Прикрепить файлы"
								onClick={() => fileInput.current?.click()}
							>
								<Paperclip size={17} />
							</button>
							{fields.draftId && (
								<button
									type="button"
									className="mail-button mail-delete"
									onClick={() => {
										if (window.confirm("Удалить этот черновик из Gmail?"))
											mutation.mutate("delete");
									}}
								>
									Удалить черновик
								</button>
							)}
						</footer>
						<input
							ref={fileInput}
							className="hidden"
							type="file"
							multiple
							onChange={(event) => {
								const next = [
									...files,
									...Array.from(event.target.files ?? [], (file) => ({
										id: crypto.randomUUID(),
										file,
									})),
								];
								event.target.value = "";
								if (
									next.some(({ file }) => file.size === 0) ||
									next.length > 8 ||
									next.reduce((total, { file }) => total + file.size, 0) >
										2_500_000
								) {
									setError(
										"Можно прикрепить до 8 непустых файлов общим размером до 2,5 МБ.",
									);
									return;
								}
								setError("");
								setFiles(next);
							}}
						/>
					</fieldset>
				</form>
			</section>
		</div>
	);
}
