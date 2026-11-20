import { FolderInput, Plus, Tag } from "lucide-react";
import { useId, useState } from "react";
import type { MailLabel } from "@/services/mail.service";

export function MailLabelCreator({
	create,
}: {
	create: (name: string) => Promise<unknown>;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	if (!open) {
		return (
			<button
				type="button"
				className="mail-button"
				onClick={() => setOpen(true)}
			>
				<Plus size={14} aria-hidden="true" /> Новый ярлык
			</button>
		);
	}
	return (
		<form
			className="mail-label-form"
			onSubmit={async (event) => {
				event.preventDefault();
				if (!name.trim() || saving) return;
				setSaving(true);
				setError("");
				try {
					await create(name.trim());
					setName("");
					setOpen(false);
				} catch (issue) {
					setError(
						issue instanceof Error
							? issue.message
							: "Не удалось создать ярлык.",
					);
				} finally {
					setSaving(false);
				}
			}}
		>
			<label className="mail-field">
				Название ярлыка
				<input
					required
					maxLength={225}
					value={name}
					disabled={saving}
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<div className="mail-label-form-actions">
				<button
					type="submit"
					className="mail-button"
					data-primary="true"
					disabled={!name.trim() || saving}
				>
					{saving ? "Создаём…" : "Создать"}
				</button>
				<button
					type="button"
					className="mail-button"
					disabled={saving}
					onClick={() => {
						setName("");
						setError("");
						setOpen(false);
					}}
				>
					Отмена
				</button>
			</div>
			{error && (
				<p className="mail-error" role="alert">
					{error}
				</p>
			)}
		</form>
	);
}

export function MailLabelControls({
	labels,
	applied,
	source,
	disabled,
	canMove,
	onToggle,
	onMove,
	onCreate,
}: {
	labels: MailLabel[];
	applied: string[];
	source?: string;
	disabled: boolean;
	canMove: boolean;
	onToggle: (id: string) => void;
	onMove: (id: string) => void;
	onCreate: (name: string) => Promise<unknown>;
}) {
	const id = useId();
	const [panel, setPanel] = useState<"labels" | "move">();
	const [destination, setDestination] = useState("");
	const [filter, setFilter] = useState("");
	const moveOptions = [{ id: "INBOX", name: "Входящие" }, ...labels].filter(
		(label) => label.id !== source,
	);
	const visibleLabels = labels.filter(({ name }) =>
		name.toLowerCase().includes(filter.trim().toLowerCase()),
	);
	const activeLabels = labels.filter(({ id }) => applied.includes(id));
	const validDestination = moveOptions.some(({ id }) => id === destination);
	return (
		<div className="mail-thread-organizer">
			<div className="mail-organizer-actions">
				<button
					type="button"
					className="mail-button"
					aria-expanded={panel === "labels"}
					aria-controls={`${id}-labels`}
					onClick={() => setPanel(panel === "labels" ? undefined : "labels")}
				>
					<Tag size={14} aria-hidden="true" /> Ярлыки
				</button>
				{canMove && (
					<button
						type="button"
						className="mail-button"
						aria-expanded={panel === "move"}
						aria-controls={`${id}-move`}
						onClick={() => setPanel(panel === "move" ? undefined : "move")}
					>
						<FolderInput size={15} aria-hidden="true" /> В папку
					</button>
				)}
				{activeLabels.slice(0, 3).map(({ id, name }) => (
					<span key={id} className="mail-tag" title={name}>
						{name}
					</span>
				))}
				{activeLabels.length > 3 && (
					<span className="mail-tag">+{activeLabels.length - 3}</span>
				)}
			</div>
			{panel === "labels" && (
				<div id={`${id}-labels`} className="mail-organizer-panel">
					{labels.length > 0 && (
						<>
							<label className="mail-field">
								<span className="sr-only">Найти ярлык</span>
								<input
									type="search"
									value={filter}
									onChange={(event) => setFilter(event.target.value)}
									placeholder="Найти ярлык"
								/>
							</label>
							<div className="mail-label-options">
								{visibleLabels.map(({ id, name }) => (
									<label className="mail-label-option" key={id}>
										<input
											type="checkbox"
											disabled={disabled}
											checked={applied.includes(id)}
											onChange={() => onToggle(id)}
										/>
										<span>{name}</span>
									</label>
								))}
								{!visibleLabels.length && (
									<p className="mail-muted">Ярлыки не найдены.</p>
								)}
							</div>
						</>
					)}
					<div>
						<MailLabelCreator create={onCreate} />
					</div>
				</div>
			)}
			{panel === "move" && canMove && (
				<div id={`${id}-move`} className="mail-organizer-panel">
					{moveOptions.length ? (
						<form
							className="mail-move-form"
							onSubmit={(event) => {
								event.preventDefault();
								if (!disabled && validDestination) onMove(destination);
							}}
						>
							<label className="mail-field">
								Папка назначения
								<select
									disabled={disabled}
									value={destination}
									onChange={(event) => setDestination(event.target.value)}
								>
									<option value="">Выберите папку</option>
									{moveOptions.map(({ id, name }) => (
										<option key={id} value={id}>
											{name}
										</option>
									))}
								</select>
							</label>
							<button
								type="submit"
								className="mail-button"
								data-primary="true"
								disabled={disabled || !validDestination}
							>
								Переместить
							</button>
						</form>
					) : (
						<MailLabelCreator create={onCreate} />
					)}
				</div>
			)}
		</div>
	);
}
