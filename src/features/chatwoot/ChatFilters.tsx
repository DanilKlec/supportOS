import {
	ChevronDown,
	type LucideIcon,
	RotateCcw,
	Search,
	SlidersHorizontal,
	X,
} from "lucide-react";
import { type ReactNode, useId } from "react";
import "./chat-filters.css";

export type FilterChip = {
	key: string;
	label: string;
	value: string;
	remove: () => void;
};

export function ChatSearch({
	id,
	label,
	placeholder,
	value,
	onChange,
	maxLength,
}: {
	id?: string;
	label: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	maxLength?: number;
}) {
	return (
		<div className="chat-search">
			<Search size={15} aria-hidden="true" />
			<input
				id={id}
				aria-label={label}
				type="text"
				placeholder={placeholder}
				value={value}
				maxLength={maxLength}
				onChange={(event) => onChange(event.target.value)}
			/>
			{value && (
				<button
					type="button"
					aria-label="Очистить поиск"
					title="Очистить поиск"
					onClick={() => onChange("")}
				>
					<X size={13} aria-hidden="true" />
				</button>
			)}
		</div>
	);
}

export function ChatFilterToggle({
	open,
	panel,
	count,
	onToggle,
}: {
	open: boolean;
	panel: string;
	count: number;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			id={`${panel}-toggle`}
			className="chat-menu-filter"
			aria-expanded={open}
			aria-controls={panel}
			onClick={onToggle}
		>
			<SlidersHorizontal size={15} aria-hidden="true" />
			Фильтры
			{count > 0 && (
				<span
					className="chat-filter-count"
					title={`Применено фильтров: ${count}`}
				>
					{count}
				</span>
			)}
		</button>
	);
}

export function ChatFilterPanel({
	id,
	open,
	onClose,
	children,
}: {
	id: string;
	open: boolean;
	onClose: () => void;
	children: ReactNode;
}) {
	const close = () => {
		document.getElementById(`${id}-toggle`)?.focus();
		onClose();
	};
	return (
		<fieldset
			id={id}
			hidden={!open}
			className="chat-filter-panel"
			onKeyDown={(event) => {
				if (event.key !== "Escape" || event.defaultPrevented) return;
				event.preventDefault();
				close();
			}}
		>
			<legend className="sr-only">Параметры фильтрации</legend>
			<div className="chat-filter-panel-heading">
				<span>Параметры фильтрации</span>
				<button
					type="button"
					aria-label="Закрыть фильтры"
					className="chat-filter-icon"
					onClick={close}
				>
					<X size={14} />
				</button>
			</div>
			<div className="chat-filter-fields">{children}</div>
		</fieldset>
	);
}

export function ChatFilterSelect({
	icon: Icon,
	label,
	value,
	options,
	empty,
	searchControl,
	onChange,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	options: { value: string; label: string }[];
	empty?: string;
	searchControl?: ReactNode;
	onChange: (value: string) => void;
}) {
	const id = useId();
	return (
		<div className="chat-filter-field">
			<div className="chat-filter-label">
				<label htmlFor={id}>{label}</label>
				{searchControl}
			</div>
			<span className="chat-filter-select">
				<Icon size={14} aria-hidden="true" />
				<select
					id={id}
					value={value}
					onChange={(event) => onChange(event.target.value)}
				>
					{empty && <option value="">{empty}</option>}
					{options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<ChevronDown size={12} aria-hidden="true" />
			</span>
		</div>
	);
}

export function ChatFilterSummary({
	chips,
	onReset,
}: {
	chips: FilterChip[];
	onReset: () => void;
}) {
	if (!chips.length) return null;
	return (
		<fieldset className="chat-filter-summary">
			<legend className="sr-only">Применённые фильтры</legend>
			{chips.map(({ key, label, value, remove }) => (
				<button
					key={key}
					type="button"
					className="chat-filter-chip"
					aria-label={`Убрать фильтр «${label}»`}
					title={`${label} · ${value}`}
					onClick={remove}
				>
					<span className="chat-filter-chip-label">{label}</span>
					<span className="truncate">{value}</span>
					<X size={12} aria-hidden="true" />
				</button>
			))}
			<button
				type="button"
				className="chat-filter-reset"
				aria-label="Сбросить фильтры"
				onClick={onReset}
			>
				<RotateCcw size={12} aria-hidden="true" /> Сбросить
			</button>
		</fieldset>
	);
}
