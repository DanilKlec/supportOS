import type { ReactNode } from "react";

export type FieldErrors = Record<string, string>;

const COLOR_SWATCHES = [
	"#3B82F6",
	"#10B981",
	"#F59E0B",
	"#EF4444",
	"#8B5CF6",
	"#EC4899",
];

export const inputClass = "w-full";
export const textareaClass = "w-full min-h-64 md:min-h-56";

export function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: ReactNode;
}) {
	return (
		<fieldset aria-label={label} className="min-w-0 space-y-2">
			<legend className="flex items-center gap-2 text-sm font-medium">
				{label}
				{hint && <span className="text-xs font-normal text-muted">{hint}</span>}
			</legend>
			{children}
			<ErrorText message={error} />
		</fieldset>
	);
}

export function ColorField({
	value,
	onChange,
	disabled,
}: {
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
}) {
	return (
		<Field label="Цвет" hint="Необязательно">
			<div className="flex flex-wrap items-center gap-2">
				{COLOR_SWATCHES.map((color) => (
					<button
						key={color}
						type="button"
						title={color}
						aria-label={`Цвет ${color}`}
						aria-pressed={value === color}
						onClick={() => onChange(value === color ? "" : color)}
						disabled={disabled}
						className={`h-8 w-8 rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-60 ${
							value === color ? "border-foreground" : "border-transparent"
						}`}
						style={{ backgroundColor: color }}
					/>
				))}

				<input
					aria-label="Цвет HEX"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					disabled={disabled}
					className="ui-input w-32 border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
					placeholder="#3B82F6"
				/>
			</div>
		</Field>
	);
}

export function ModalActions({
	submitLabel,
	saving,
	onCancel,
	danger = false,
}: {
	submitLabel: string;
	saving: boolean;
	onCancel: () => void;
	danger?: boolean;
}) {
	return (
		<div className="ui-actions modal-actions">
			<button
				type="button"
				onClick={onCancel}
				disabled={saving}
				className="ui-button ui-button--secondary"
			>
				Отмена
			</button>

			<button
				type="submit"
				disabled={saving}
				aria-busy={saving}
				className={`ui-button ${danger ? "ui-button--danger" : "ui-button--primary"}`}
			>
				{saving ? "Сохранение…" : submitLabel}
			</button>
		</div>
	);
}

export function ErrorText({ message }: { message?: string }) {
	if (!message) return null;

	return <p className="text-xs text-red-400">{message}</p>;
}

export function FormError({ message }: { message?: string }) {
	if (!message) return null;

	return (
		<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
			{message}
		</div>
	);
}

export function optional(value: string) {
	const trimmed = value.trim();

	return trimmed || undefined;
}

export function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Something went wrong";
}
