import { ImagePlus, Mail } from "lucide-react";
import { type CSSProperties, useState } from "react";
import type { MailboxIcon } from "@/services/mail.service";
import { labelPalette } from "./MailFolderTree";

function fallbackTone(address: string) {
	return Array.from(address.toLowerCase()).reduce(
		(sum, char) =>
			(sum * 31 + (char.codePointAt(0) ?? 0)) % labelPalette.length,
		0,
	);
}

function iconStyle(tone: number, custom?: string) {
	const color = labelPalette[tone] ?? labelPalette[0];
	if (custom && /^#[0-9a-f]{6}$/i.test(custom)) {
		const channels = [1, 3, 5].map((index) => {
			const unit = Number.parseInt(custom.slice(index, index + 2), 16) / 255;
			return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
		});
		const luminance =
			0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
		return {
			"--mailbox-color": custom,
			"--mailbox-ink": luminance > 0.179 ? "#000" : "#fff",
		} as CSSProperties;
	}
	return {
		"--mailbox-color": color.backgroundColor,
		"--mailbox-ink": color.textColor,
	} as CSSProperties;
}

export function MailboxMark({
	address,
	icon,
}: {
	address: string;
	icon?: MailboxIcon | null;
}) {
	const text =
		icon?.text ||
		Array.from(address.split("@")[0].match(/[\p{L}\p{N}]/gu) ?? [])
			.slice(0, 2)
			.join("")
			.toUpperCase();
	return (
		<span
			className="mail-mailbox-mark"
			style={iconStyle(icon?.tone ?? fallbackTone(address), icon?.color)}
			aria-hidden="true"
		>
			{icon?.image ? (
				<img src={icon.image} width={36} height={36} decoding="async" alt="" />
			) : (
				text || <Mail size={16} />
			)}
		</span>
	);
}

async function thumbnail(file: File) {
	if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5_000_000)
		throw new Error("Выберите PNG, JPEG или WebP до 5 МБ.");
	const image = await createImageBitmap(file);
	try {
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = 36;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Не удалось подготовить значок.");
		const side = Math.min(image.width, image.height);
		context.drawImage(
			image,
			(image.width - side) / 2,
			(image.height - side) / 2,
			side,
			side,
			0,
			0,
			36,
			36,
		);
		return canvas.toDataURL("image/png");
	} finally {
		image.close();
	}
}

export function MailboxIconFields({
	address,
	value,
	update,
	busy,
	setBusy,
}: {
	address: string;
	value: MailboxIcon | null;
	update: (value: MailboxIcon | null) => void;
	busy: boolean;
	setBusy: (busy: boolean) => void;
}) {
	const [error, setError] = useState("");
	const icon = value ?? { text: "", tone: fallbackTone(address) };
	return (
		<fieldset className="mail-icon-editor" disabled={busy}>
			<legend>Значок ящика</legend>
			<div className="mail-icon-editor-main">
				<MailboxMark address={address} icon={icon} />
				<label className="mail-field">
					Буквы или цифры
					<input
						type="text"
						placeholder="Авто"
						value={icon.text}
						onChange={(event) =>
							update({
								...icon,
								text: (
									event.target.value.toUpperCase().match(/[\p{L}\p{N}]/gu) ?? []
								)
									.slice(0, 3)
									.join(""),
							})
						}
					/>
				</label>
				<fieldset className="mail-icon-colors">
					<legend>Цвет</legend>
					{labelPalette.map((color, tone) => (
						<button
							type="button"
							key={color.name}
							title={color.name}
							aria-label={color.name}
							aria-pressed={!icon.color && icon.tone === tone}
							style={iconStyle(tone)}
							onClick={() => update({ ...icon, tone, color: undefined })}
						/>
					))}
					<input
						type="color"
						className="mail-custom-icon-color"
						aria-label="Свой RGB-цвет"
						title="Свой RGB-цвет"
						value={
							icon.color ??
							labelPalette[icon.tone]?.backgroundColor ??
							labelPalette[0].backgroundColor
						}
						onChange={(event) => update({ ...icon, color: event.target.value })}
					/>
				</fieldset>
			</div>
			<div className="mail-icon-editor-actions">
				<label className="mail-button">
					<ImagePlus size={15} aria-hidden="true" />{" "}
					{icon.image ? "Заменить логотип" : "Загрузить логотип"}
					<input
						className="sr-only"
						type="file"
						accept="image/png,image/jpeg,image/webp"
						onChange={async (event) => {
							const file = event.currentTarget.files?.[0];
							event.currentTarget.value = "";
							if (!file) return;
							setError("");
							setBusy(true);
							try {
								update({ ...icon, image: await thumbnail(file) });
							} catch (error) {
								setError(
									error instanceof Error && error.name === "Error"
										? error.message
										: "Не удалось открыть изображение.",
								);
							} finally {
								setBusy(false);
							}
						}}
					/>
				</label>
				{icon.image && (
					<button
						type="button"
						className="mail-button"
						onClick={() => update({ ...icon, image: undefined })}
					>
						Убрать логотип
					</button>
				)}
				{value && (
					<button
						type="button"
						className="mail-button"
						onClick={() => update(null)}
					>
						Сбросить
					</button>
				)}
			</div>
			{error && (
				<p className="mail-error" role="alert">
					{error}
				</p>
			)}
		</fieldset>
	);
}
