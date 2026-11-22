import { Plus, X } from "lucide-react";
import { useId } from "react";
import type { MailBlock, MailBlockType } from "../../../shared/mail-layout.js";

const mainFields: Partial<Record<MailBlockType, string>> = {
	brand: "Название бренда",
	hero: "Заголовок обложки",
	offer: "Заголовок карточки",
	signature: "Имя в подписи",
	footer: "Текст подвала",
	heading: "Текст заголовка",
	text: "Текст блока",
	image: "Описание картинки",
	button: "Текст кнопки",
};

const urlFields: Partial<Record<MailBlockType, string>> = {
	brand: "Логотип",
	hero: "Изображение или GIF обложки",
	offer: "Иллюстрация карточки",
	signature: "Изображение подписи",
	image: "Ссылка на картинку или GIF",
	button: "Ссылка кнопки",
};

const alignmentOptions = [
	["left", "Слева"],
	["center", "По центру"],
	["right", "Справа"],
] as const;

export function MailLayoutSelect<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: ReadonlyArray<readonly [T, string]>;
	onChange: (value: T) => void;
}) {
	return (
		<label className="mail-field">
			{label}
			<select
				value={value}
				onChange={(event) => {
					const option = options.find(([key]) => key === event.target.value);
					if (option) onChange(option[0]);
				}}
			>
				{options.map(([key, title]) => (
					<option key={key} value={key}>
						{title}
					</option>
				))}
			</select>
		</label>
	);
}

export function MailBlockFields({
	block,
	onChange,
}: {
	block: MailBlock;
	onChange: (patch: Partial<MailBlock>) => void;
}) {
	const { type } = block;
	const fieldId = useId();
	const main = mainFields[type];
	const url = urlFields[type];
	if (type === "space")
		return (
			<MailLayoutSelect
				label="Высота отступа"
				value={block.spaceHeight ?? "small"}
				options={[
					["small", "20 px"],
					["medium", "48 px"],
					["large", "96 px"],
					["extra", "160 px"],
				]}
				onChange={(spaceHeight) => onChange({ spaceHeight })}
			/>
		);
	if (!main) return null;
	const multiline = ["hero", "heading", "text", "footer"].includes(type);
	return (
		<div className="mail-block-fields">
			{(type === "hero" || type === "offer" || type === "brand") && (
				<label className="mail-field">
					{type === "brand" ? "Слоган" : "Надзаголовок"}
					<input
						value={block.eyebrow ?? ""}
						maxLength={100}
						onChange={(event) => onChange({ eyebrow: event.target.value })}
					/>
				</label>
			)}
			<label className="mail-field" htmlFor={fieldId}>
				{main}
				{multiline ? (
					<textarea
						id={fieldId}
						rows={type === "text" ? 4 : 2}
						maxLength={type === "hero" || type === "heading" ? 200 : 4000}
						value={block.text}
						onChange={(event) => onChange({ text: event.target.value })}
					/>
				) : (
					<input
						id={fieldId}
						maxLength={300}
						value={block.text}
						onChange={(event) => onChange({ text: event.target.value })}
					/>
				)}
			</label>
			{type === "hero" && (
				<label className="mail-field">
					Акцентная строка
					<input
						value={block.accentLine ?? ""}
						maxLength={100}
						onChange={(event) => onChange({ accentLine: event.target.value })}
					/>
				</label>
			)}
			{(type === "hero" || type === "offer" || type === "signature") && (
				<label className="mail-field">
					{type === "signature"
						? "Должность и контакты"
						: "Дополнительный текст"}
					<textarea
						rows={3}
						maxLength={1200}
						value={block.description ?? ""}
						onChange={(event) => onChange({ description: event.target.value })}
					/>
				</label>
			)}
			{url && (
				<label className="mail-field">
					{url}
					<input
						type="url"
						inputMode="url"
						maxLength={2048}
						value={block.url}
						placeholder="https://…"
						onChange={(event) => onChange({ url: event.target.value })}
					/>
				</label>
			)}
			{type !== "image" && (
				<div className="mail-layout-fields-row">
					<MailLayoutSelect
						label="Выравнивание"
						value={block.align ?? "left"}
						options={alignmentOptions}
						onChange={(align) => onChange({ align })}
					/>
					{type === "hero" && (
						<MailLayoutSelect
							label="Высота обложки"
							value={block.heroHeight ?? "regular"}
							options={[
								["compact", "Компактная"],
								["regular", "Средняя"],
								["tall", "Высокая"],
							]}
							onChange={(heroHeight) => onChange({ heroHeight })}
						/>
					)}
					{type === "button" && (
						<MailLayoutSelect
							label="Ширина кнопки"
							value={block.buttonWidth ?? "auto"}
							options={[
								["auto", "По тексту"],
								["full", "На всю ширину"],
							]}
							onChange={(buttonWidth) => onChange({ buttonWidth })}
						/>
					)}
					{type === "offer" && (
						<MailLayoutSelect
							label="Изображение в карточке"
							value={block.offerImagePlacement ?? "left"}
							options={[
								["left", "Слева от текста"],
								["above", "Над текстом"],
							]}
							onChange={(offerImagePlacement) =>
								onChange({ offerImagePlacement })
							}
						/>
					)}
				</div>
			)}
			{type === "hero" && (
				<div className="mail-layout-fields-row">
					<MailLayoutSelect
						label="Фокус изображения"
						value={block.imagePosition ?? "right"}
						options={alignmentOptions}
						onChange={(imagePosition) => onChange({ imagePosition })}
					/>
					<MailLayoutSelect
						label="Затемнение изображения"
						value={block.shade ?? "medium"}
						options={[
							["none", "Без затемнения"],
							["medium", "Среднее"],
							["strong", "Сильное"],
						]}
						onChange={(shade) => onChange({ shade })}
					/>
				</div>
			)}
			{type === "button" && (
				<MailLayoutSelect
					label="Форма кнопки"
					value={block.buttonShape ?? "rounded"}
					options={[
						["rounded", "Скруглённая"],
						["pill", "Овальная"],
					]}
					onChange={(buttonShape) => onChange({ buttonShape })}
				/>
			)}
			{type === "footer" && (
				<FooterLinks
					links={block.links ?? []}
					onChange={(links) => onChange({ links })}
				/>
			)}
		</div>
	);
}

function FooterLinks({
	links,
	onChange,
}: {
	links: NonNullable<MailBlock["links"]>;
	onChange: (links: NonNullable<MailBlock["links"]>) => void;
}) {
	const change = (slot: number, field: "text" | "url", value: string) =>
		onChange(
			links.map((link, i) => (i === slot ? { ...link, [field]: value } : link)),
		);
	return (
		<div className="mail-block-fields">
			{[0, 1, 2].slice(0, links.length).map((slot) => (
				<div className="mail-layout-footer-link" key={slot}>
					<label className="mail-field">
						{`Текст ссылки ${slot + 1}`}
						<input
							maxLength={80}
							value={links[slot].text}
							onChange={(event) => change(slot, "text", event.target.value)}
						/>
					</label>
					<label className="mail-field">
						{`Адрес ссылки ${slot + 1}`}
						<input
							type="url"
							maxLength={2048}
							placeholder="https://…"
							value={links[slot].url}
							onChange={(event) => change(slot, "url", event.target.value)}
						/>
					</label>
					<button
						type="button"
						className="mail-icon mail-delete"
						aria-label={`Удалить ссылку ${slot + 1}`}
						onClick={() => onChange(links.filter((_, i) => i !== slot))}
					>
						<X size={15} />
					</button>
				</div>
			))}
			{links.length < 3 && (
				<button
					type="button"
					className="mail-button mail-add-link"
					onClick={() => onChange([...links, { text: "", url: "" }])}
				>
					<Plus size={14} aria-hidden="true" /> Добавить ссылку
				</button>
			)}
		</div>
	);
}
