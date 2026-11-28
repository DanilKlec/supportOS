import { Check, Folder, Search, Trash2, X } from "lucide-react";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import type { Mailbox } from "@/services/mail.service";
import { labelPalette } from "./MailFolderTree";

export type MailProjectFolder = {
	id: string;
	name: string;
	color: number;
	mailboxIds: string[];
};

export function MailProjectEditor({
	folder,
	folders,
	mailboxes,
	owners,
	onSave,
	onRemove,
	onClose,
}: {
	folder?: MailProjectFolder;
	folders: MailProjectFolder[];
	mailboxes: Mailbox[];
	owners: ReadonlyMap<string, MailProjectFolder>;
	onSave: (folder: MailProjectFolder) => void;
	onRemove: (id: string) => void;
	onClose: () => void;
}) {
	const title = useId();
	const dialog = useRef<HTMLDialogElement>(null);
	const [name, setName] = useState(folder?.name ?? "");
	const [color, setColor] = useState(
		folder?.color ?? folders.length % labelPalette.length,
	);
	const [selected, setSelected] = useState(() => new Set(folder?.mailboxIds));
	const [query, setQuery] = useState("");
	const [confirmRemoval, setConfirmRemoval] = useState(false);
	const trimmedName = name.trim();
	const comparableName = trimmedName.toLocaleLowerCase("ru");
	const duplicate =
		["без проекта", "все ящики"].includes(comparableName) ||
		folders.some(
			(item) =>
				item.id !== folder?.id &&
				item.name.toLocaleLowerCase("ru") === comparableName,
		);
	const filter = query.trim().toLowerCase();
	const visible = mailboxes.filter(({ address }) =>
		address.toLowerCase().includes(filter),
	);
	const selectedCount = mailboxes.filter(({ id }) => selected.has(id)).length;

	useEffect(() => {
		const instance = dialog.current;
		instance?.showModal();
		return () => instance?.close();
	}, []);

	return (
		<dialog
			ref={dialog}
			className="mail-modal mail-project-editor"
			aria-labelledby={title}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<header className="mail-modal-heading">
				<div className="mail-project-editor-title">
					<Folder size={17} aria-hidden="true" />
					<h2 id={title}>
						{folder ? "Настроить папку проекта" : "Новая папка проекта"}
					</h2>
				</div>
				<button
					type="button"
					className="mail-icon"
					aria-label="Закрыть настройки папки"
					onClick={onClose}
				>
					<X size={17} aria-hidden="true" />
				</button>
			</header>
			<form
				className="mail-project-form"
				onSubmit={(event) => {
					event.preventDefault();
					if (trimmedName && !duplicate && !confirmRemoval) {
						onSave({
							id: folder?.id ?? crypto.randomUUID(),
							name: trimmedName,
							color,
							mailboxIds: [...selected],
						});
					}
				}}
			>
				<label className="mail-field">
					Название папки
					<input
						required
						maxLength={44}
						value={name}
						placeholder="Например, VIP-поддержка"
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				{duplicate && (
					<p className="mail-error" role="alert">
						Папка с таким названием уже есть.
					</p>
				)}
				<fieldset className="mail-project-colors">
					<legend>Цвет значка</legend>
					{labelPalette.map(
						({ name: label, backgroundColor, textColor }, index) => (
							<label
								key={label}
								className="mail-project-color"
								data-selected={index === color}
								title={label}
								style={
									{
										"--mail-project-hue": backgroundColor,
										"--mail-project-ink": textColor,
									} as CSSProperties
								}
							>
								<input
									type="radio"
									name={`${title}-color`}
									aria-label={label}
									checked={index === color}
									onChange={() => setColor(index)}
								/>
								{index === color && <Check size={15} aria-hidden="true" />}
							</label>
						),
					)}
				</fieldset>
				<div className="mail-project-editor-accounts">
					<div className="mail-project-picker-title">
						<h3>Почтовые ящики</h3>
						<span>Выбрано {selectedCount}</span>
					</div>
					{mailboxes.length > 5 && (
						<label className="mail-search">
							<Search size={15} aria-hidden="true" />
							<input
								type="search"
								aria-label="Найти ящик для папки"
								placeholder="Найти ящик"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</label>
					)}
					{visible.length ? (
						<ul className="mail-project-options supportos-scroll">
							{visible.map(({ id, address }) => {
								const owner = owners.get(id);
								return (
									<li key={id}>
										<label>
											<input
												type="checkbox"
												aria-label={address}
												checked={selected.has(id)}
												onChange={(event) => {
													const checked = event.target.checked;
													setSelected((previous) => {
														const next = new Set(previous);
														if (checked) next.add(id);
														else next.delete(id);
														return next;
													});
												}}
											/>
											<span>
												<strong title={address}>{address}</strong>
												{owner && owner.id !== folder?.id && (
													<small title={owner.name}>{owner.name}</small>
												)}
											</span>
										</label>
									</li>
								);
							})}
						</ul>
					) : (
						<p className="mail-project-empty">Ящики не найдены</p>
					)}
				</div>
				{folder && confirmRemoval ? (
					<div className="mail-notice">
						<p>Ящики папки появятся в разделе «Без проекта».</p>
						<div className="mail-template-actions">
							<button
								type="button"
								className="mail-button"
								onClick={() => setConfirmRemoval(false)}
							>
								Отмена
							</button>
							<button
								type="button"
								className="mail-button mail-delete"
								onClick={() => onRemove(folder.id)}
							>
								Удалить папку
							</button>
						</div>
					</div>
				) : (
					<footer className="mail-project-form-actions">
						{folder && (
							<button
								type="button"
								className="mail-button mail-delete"
								onClick={() => setConfirmRemoval(true)}
							>
								<Trash2 size={16} aria-hidden="true" />
								Удалить папку
							</button>
						)}
						<button type="button" className="mail-button" onClick={onClose}>
							Отмена
						</button>
						<button
							type="submit"
							className="mail-button"
							data-primary="true"
							disabled={!trimmedName || duplicate}
						>
							{folder ? "Сохранить" : "Создать папку"}
						</button>
					</footer>
				)}
			</form>
		</dialog>
	);
}
