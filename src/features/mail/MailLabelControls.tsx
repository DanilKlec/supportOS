import {
	Check,
	ChevronDown,
	FolderInput,
	FolderOpen,
	Plus,
	Search,
	Tag,
	X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type {
	MailLabel,
	MailLabelChanges,
	MailLabelColor,
} from "@/services/mail.service";
import {
	labelPalette,
	labelStyle,
	MailFolderTree,
	MailLabelChip,
} from "./MailFolderTree";

type CreateLabel = (name: string, color?: MailLabelColor) => Promise<unknown>;

function LabelPalette({
	color,
	change,
	disabled,
}: {
	color?: MailLabelColor;
	change: (color: MailLabelColor) => void;
	disabled?: boolean;
}) {
	return (
		<fieldset className="mail-label-palette">
			<legend className="sr-only">Цвет ярлыка</legend>
			{labelPalette.map(({ name, backgroundColor, textColor }) => {
				const active =
					color?.backgroundColor?.toLowerCase() === backgroundColor;
				return (
					<button
						key={name}
						type="button"
						aria-label={name}
						title={name}
						aria-pressed={active}
						disabled={disabled}
						style={{ backgroundColor, color: textColor }}
						onClick={() => change({ backgroundColor, textColor })}
					>
						{active && <Check size={14} aria-hidden="true" />}
					</button>
				);
			})}
		</fieldset>
	);
}

function MailLabelCreator({
	create,
	labels,
	folder = false,
	onClose,
}: {
	create: CreateLabel;
	labels: MailLabel[];
	folder?: boolean;
	onClose: () => void;
}) {
	const [name, setName] = useState("");
	const [parent, setParent] = useState("");
	const [color, setColor] = useState<MailLabelColor>();
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const prefix = labels.find(({ id }) => id === parent)?.name;
	return (
		<form
			className="mail-label-form"
			onSubmit={async (event) => {
				event.preventDefault();
				if (!name.trim() || saving) return;
				const path = prefix ? `${prefix}/${name.trim()}` : name.trim();
				setSaving(true);
				setError("");
				try {
					await create(path, color);
					onClose();
				} catch (issue) {
					setError(
						issue instanceof Error
							? issue.message
							: "Не удалось создать папку.",
					);
				} finally {
					setSaving(false);
				}
			}}
		>
			<label className="mail-field">
				{folder ? "Название папки" : "Название ярлыка"}
				<input
					required
					maxLength={Math.max(0, 225 - (prefix ? prefix.length + 1 : 0))}
					value={name}
					disabled={saving}
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			{folder && labels.length > 0 && (
				<label className="mail-field">
					Родительская папка
					<select
						value={parent}
						disabled={saving}
						onChange={(event) => setParent(event.target.value)}
					>
						<option value="">Верхний уровень</option>
						{labels
							.filter(({ name }) => name.length < 223)
							.map(({ id, name }) => (
								<option key={id} value={id}>
									{name}
								</option>
							))}
					</select>
				</label>
			)}
			<LabelPalette color={color} change={setColor} disabled={saving} />
			<div className="mail-label-form-actions">
				<button
					type="button"
					className="mail-button"
					disabled={saving}
					onClick={onClose}
				>
					Отмена
				</button>
				<button
					type="submit"
					className="mail-button"
					data-primary="true"
					disabled={!name.trim() || saving}
				>
					{saving ? "Создаём…" : "Создать"}
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

export function MailFolderNavigation({
	labels,
	active,
	loading,
	error,
	onSelect,
	onCreate,
}: {
	labels: MailLabel[];
	active: string;
	loading: boolean;
	error: boolean;
	onSelect: (id: string) => void;
	onCreate: CreateLabel;
}) {
	const [expanded, setExpanded] = useState(false);
	const [creating, setCreating] = useState(false);
	const folderId = useId();
	return (
		<nav
			aria-label="Папки ящика"
			className="mail-custom-folders"
			data-expanded={expanded || creating}
		>
			<div className="mail-folders-heading">
				<h3>Папки</h3>
				<button
					type="button"
					className="mail-folders-disclosure"
					aria-expanded={expanded || creating}
					aria-controls={folderId}
					onClick={() => {
						if (creating) setCreating(false);
						setExpanded(!expanded && !creating);
					}}
				>
					<FolderOpen size={16} aria-hidden="true" /> Папки
					<ChevronDown size={14} aria-hidden="true" />
				</button>
				<button
					type="button"
					className="mail-icon"
					title="Новая папка"
					aria-label="Новая папка"
					aria-expanded={creating}
					onClick={() => {
						setExpanded(true);
						setCreating((value) => !value);
					}}
				>
					<Plus size={16} aria-hidden="true" />
				</button>
			</div>
			<div id={folderId} className="mail-custom-folder-content">
				{creating && (
					<MailLabelCreator
						folder
						create={onCreate}
						labels={labels}
						onClose={() => setCreating(false)}
					/>
				)}
				{labels.length > 0 ? (
					<MailFolderTree labels={labels} active={active} onSelect={onSelect} />
				) : (
					<p className="mail-picker-empty">
						{loading
							? "Загружаем папки…"
							: error
								? "Не удалось загрузить папки"
								: "Нет пользовательских папок"}
					</p>
				)}
			</div>
		</nav>
	);
}

function MailThreadPicker({
	mode,
	labels,
	applied,
	source,
	onClose,
	onApply,
	onMove,
	onCreate,
	onColor,
}: {
	mode: "labels" | "move";
	labels: MailLabel[];
	applied: string[];
	source?: string;
	onClose: () => void;
	onApply: (changes: MailLabelChanges) => Promise<unknown>;
	onMove: (id: string) => Promise<unknown>;
	onCreate: CreateLabel;
	onColor: (id: string, color: MailLabelColor) => Promise<unknown>;
}) {
	const [filter, setFilter] = useState("");
	const [staged, setStaged] = useState<Record<string, boolean>>({});
	const [destination, setDestination] = useState("");
	const [editingColor, setEditingColor] = useState<MailLabel>();
	const [creating, setCreating] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const search = useRef<HTMLInputElement>(null);
	useEffect(() => search.current?.focus({ preventScroll: true }), []);
	const isMove = mode === "move";
	const visibleLabels = labels.filter(({ name }) =>
		name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()),
	);
	const changes = { add: [] as string[], remove: [] as string[] };
	for (const label of labels) {
		const checked = Object.hasOwn(staged, label.id)
			? staged[label.id]
			: undefined;
		if (checked !== undefined && checked !== applied.includes(label.id))
			changes[checked ? "add" : "remove"].push(label.id);
	}
	const hasChanges = changes.add.length + changes.remove.length > 0;
	const chosen =
		destination &&
		(destination === "INBOX" || labels.some(({ id }) => id === destination));
	const save = async (action: () => Promise<unknown>, after: () => void) => {
		if (busy) return;
		setBusy(true);
		setError("");
		try {
			await action();
			after();
		} catch (issue) {
			setError(
				issue instanceof Error
					? issue.message
					: "Не удалось сохранить изменения.",
			);
		} finally {
			setBusy(false);
		}
	};
	return (
		<>
			<div className="mail-picker-heading">
				<h3>{isMove ? "Переместить в папку" : "Ярлыки письма"}</h3>
				<button
					type="button"
					className="mail-picker-close"
					aria-label="Закрыть выбор"
					onClick={onClose}
				>
					<X size={16} />
				</button>
			</div>
			<div className="mail-picker-body">
				{creating ? (
					<MailLabelCreator
						folder={isMove}
						create={onCreate}
						labels={labels}
						onClose={() => setCreating(false)}
					/>
				) : (
					<>
						<label className="mail-search">
							<Search size={16} aria-hidden="true" />
							<input
								ref={search}
								type="search"
								aria-label={isMove ? "Найти папку" : "Найти ярлык"}
								placeholder={isMove ? "Найти папку" : "Найти ярлык"}
								value={filter}
								onChange={(event) => setFilter(event.target.value)}
							/>
						</label>
						{editingColor && (
							<div className="mail-picker-color">
								<span title={editingColor.name}>{editingColor.name}</span>
								<LabelPalette
									color={editingColor.color}
									disabled={busy}
									change={(color) =>
										void save(
											() => onColor(editingColor.id, color),
											() => setEditingColor(undefined),
										)
									}
								/>
							</div>
						)}
						<div className="mail-picker-options">
							{isMove ? (
								<MailFolderTree
									labels={labels}
									active={destination}
									unavailable={source}
									onSelect={setDestination}
									inbox
									search={filter}
								/>
							) : visibleLabels.length ? (
								<ul className="mail-label-options">
									{visibleLabels.map((label) => {
										const checked = Object.hasOwn(staged, label.id)
											? staged[label.id]
											: applied.includes(label.id);
										return (
											<li
												key={label.id}
												className="mail-label-option"
												style={labelStyle(label)}
											>
												<label className="mail-label-choice">
													<input
														type="checkbox"
														checked={checked}
														disabled={busy}
														onChange={(event) => {
															const value = event.target.checked;
															setStaged((current) => ({
																...current,
																[label.id]: value,
															}));
														}}
													/>
													<span className="mail-label-check" aria-hidden="true">
														{checked && <Check size={12} aria-hidden="true" />}
													</span>
													<span
														className="mail-label-choice-name"
														title={label.name}
													>
														{label.name}
													</span>
												</label>
												<button
													type="button"
													className="mail-label-color-button"
													aria-label={`Цвет ярлыка ${label.name}`}
													title="Изменить цвет"
													aria-expanded={editingColor?.id === label.id}
													onClick={() =>
														setEditingColor(
															editingColor?.id === label.id ? undefined : label,
														)
													}
												>
													<span />
												</button>
											</li>
										);
									})}
								</ul>
							) : (
								<p className="mail-picker-empty">
									{filter
										? "Ярлыки не найдены"
										: "Нет пользовательских ярлыков"}
								</p>
							)}
						</div>
					</>
				)}
				{error && (
					<p role="alert" className="mail-picker-error mail-error">
						{error}
					</p>
				)}
			</div>
			{!creating && (
				<div className="mail-picker-footer">
					<button
						type="button"
						className="mail-button mail-picker-add"
						onClick={() => {
							setEditingColor(undefined);
							setCreating(true);
						}}
						disabled={busy}
					>
						<Plus size={15} aria-hidden="true" />{" "}
						{isMove ? "Новая папка" : "Новый ярлык"}
					</button>
					<button
						type="button"
						className="mail-button"
						data-primary="true"
						disabled={
							busy || (isMove ? !chosen || source === destination : !hasChanges)
						}
						onClick={() =>
							void save(
								() => (isMove ? onMove(destination) : onApply(changes)),
								onClose,
							)
						}
					>
						{busy ? "Сохраняем…" : isMove ? "Переместить" : "Применить"}
					</button>
				</div>
			)}
		</>
	);
}

export function MailLabelControls({
	labels,
	applied,
	source,
	disabled,
	canMove,
	onApply,
	onMove,
	onCreate,
	onColor,
}: {
	labels: MailLabel[];
	applied: string[];
	source?: string;
	disabled: boolean;
	canMove: boolean;
	onApply: (changes: MailLabelChanges) => Promise<unknown>;
	onMove: (id: string) => Promise<unknown>;
	onCreate: CreateLabel;
	onColor: (id: string, color: MailLabelColor) => Promise<unknown>;
}) {
	const id = useId();
	const root = useRef<HTMLDivElement>(null);
	const [panel, setPanel] = useState<"labels" | "move">();
	const activeLabels = labels.filter(({ id }) => applied.includes(id));
	useEffect(() => {
		if (!panel) return;
		const closeOutside = (event: PointerEvent) => {
			if (event.target instanceof Node && !root.current?.contains(event.target))
				setPanel(undefined);
		};
		const closeEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setPanel(undefined);
				root.current
					?.querySelector<HTMLElement>('[aria-expanded="true"]')
					?.focus();
			}
		};
		document.addEventListener("pointerdown", closeOutside);
		document.addEventListener("keydown", closeEscape);
		return () => {
			document.removeEventListener("pointerdown", closeOutside);
			document.removeEventListener("keydown", closeEscape);
		};
	}, [panel]);
	return (
		<div ref={root} className="mail-thread-organizer">
			<div className="mail-organizer-actions">
				<button
					type="button"
					className="mail-button"
					aria-expanded={panel === "labels"}
					aria-controls={id}
					disabled={disabled && !panel}
					onClick={() => setPanel(panel === "labels" ? undefined : "labels")}
				>
					<Tag size={15} aria-hidden="true" /> Ярлыки{" "}
					<ChevronDown size={12} aria-hidden="true" />
				</button>
				{canMove && (
					<button
						type="button"
						className="mail-button"
						aria-expanded={panel === "move"}
						aria-controls={id}
						disabled={disabled && !panel}
						onClick={() => setPanel(panel === "move" ? undefined : "move")}
					>
						<FolderInput size={16} aria-hidden="true" /> В папку{" "}
						<ChevronDown size={12} aria-hidden="true" />
					</button>
				)}
				{activeLabels.slice(0, 3).map((label) => (
					<MailLabelChip key={label.id} label={label} />
				))}
				{activeLabels.length > 3 && (
					<button
						type="button"
						className="mail-tag mail-tag-more"
						onClick={() => setPanel("labels")}
						aria-label="Показать все ярлыки"
					>
						+{activeLabels.length - 3}
					</button>
				)}
			</div>
			{panel && (
				<section
					id={id}
					className="mail-organizer-panel"
					aria-label={panel === "move" ? "Выбор папки" : "Выбор ярлыков"}
				>
					<MailThreadPicker
						key={panel}
						mode={panel}
						labels={labels}
						applied={applied}
						source={source}
						onClose={() => setPanel(undefined)}
						onApply={onApply}
						onMove={onMove}
						onCreate={onCreate}
						onColor={onColor}
					/>
				</section>
			)}
		</div>
	);
}
