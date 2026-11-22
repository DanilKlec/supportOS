import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	ChevronRight,
	FileCode2,
	Heading,
	Image,
	LayoutTemplate,
	Minus,
	Monitor,
	MousePointer2,
	PenLine,
	Plus,
	RectangleHorizontal,
	Smartphone,
	SquareStack,
	Text,
	Trash2,
	Type,
} from "lucide-react";
import { useDeferredValue, useRef, useState } from "react";
import {
	defaultMailLayout,
	mailHtmlLimit,
	type MailBlock,
	type MailBlockType,
	type MailLayout,
	renderMailLayout,
} from "../../../shared/mail-layout.js";
import { MailBlockFields, MailLayoutSelect } from "./MailBlockFields";
import { MailHtmlPreview } from "./MailHtmlPreview";
import { MailImportedBlockFields } from "./MailImportedBlockFields";

const colors = [
	["background", "Внешний фон"],
	["paper", "Фон письма"],
	["foreground", "Текст"],
	["accent", "Акцент"],
] as const;

const palettes = [
	{ label: "Светлая", colors: ["#eef2f7", "#ffffff", "#172238", "#394cc9"] },
	{ label: "Графит", colors: ["#101419", "#1a222a", "#f0f4f7", "#a7c5ff"] },
	{ label: "Изумруд", colors: ["#071211", "#10221d", "#eaf6ef", "#80e5ab"] },
	{ label: "Слива", colors: ["#120a1b", "#25162f", "#fcf1ff", "#df9cf5"] },
	{ label: "Золото", colors: ["#13100d", "#24201a", "#fff4df", "#e7c284"] },
] as const;

const blockOptions = {
	brand: { title: "Бренд", Icon: Type },
	hero: { title: "Обложка", Icon: LayoutTemplate },
	offer: { title: "Карточка", Icon: RectangleHorizontal },
	signature: { title: "Подпись", Icon: PenLine },
	footer: { title: "Подвал", Icon: SquareStack },
	heading: { title: "Заголовок", Icon: Heading },
	text: { title: "Текст", Icon: Text },
	image: { title: "Картинка / GIF", Icon: Image },
	button: { title: "Кнопка", Icon: MousePointer2 },
	divider: { title: "Линия", Icon: Minus },
	space: { title: "Отступ", Icon: Plus },
	html: { title: "HTML-блок", Icon: FileCode2 },
};

export function MailLayoutBuilder({
	layout = defaultMailLayout,
	onChange,
	onImport,
	importing,
	saving,
}: {
	layout?: MailLayout;
	onChange: (layout: MailLayout) => void;
	onImport: (html: string) => Promise<MailLayout>;
	importing: boolean;
	saving: boolean;
}) {
	const [expanded, setExpanded] = useState(layout.blocks[0]?.id ?? "");
	const [mobile, setMobile] = useState(false);
	const [importSource, setImportSource] = useState("");
	const importPanel = useRef<HTMLDetailsElement>(null);
	const previewPane = useRef<HTMLElement>(null);
	const jumpToPreview = useRef<HTMLButtonElement>(null);
	const preview = renderMailLayout(useDeferredValue(layout));
	const replace = (id: string, patch: Partial<MailBlock>) =>
		onChange({
			...layout,
			blocks: layout.blocks.map((block) =>
				block.id === id ? { ...block, ...patch } : block,
			),
		});
	const add = (type: MailBlockType) => {
		const id = crypto.randomUUID();
		onChange({
			...layout,
			blocks: [...layout.blocks, { id, type, text: "", url: "" }],
		});
		setExpanded(id);
	};
	const move = (index: number, direction: number) => {
		const blocks = [...layout.blocks];
		const next = index + direction;
		if (next < 0 || next >= blocks.length) return;
		[blocks[index], blocks[next]] = [blocks[next], blocks[index]];
		onChange({ ...layout, blocks });
	};
	return (
		<div className="mail-layout-studio">
			<div className="mail-layout-settings">
				<button
					type="button"
					className="mail-button mail-layout-jump"
					ref={jumpToPreview}
					onClick={() => previewPane.current?.focus()}
				>
					<Monitor size={15} aria-hidden="true" /> К предпросмотру
				</button>
				<details className="mail-layout-appearance" ref={importPanel}>
					<summary>Вставить HTML</summary>
					<div className="mail-layout-appearance-content">
						<label className="mail-field">
							HTML для импорта
							<textarea
								className="mail-html-source"
								placeholder="<table>…</table>"
								value={importSource}
								maxLength={mailHtmlLimit}
								spellCheck={false}
								disabled={importing || saving}
								onChange={(event) => setImportSource(event.target.value)}
							/>
						</label>
						<button
							type="button"
							className="mail-button mail-add-link"
							disabled={importing || saving || !importSource.trim()}
							onClick={() => {
								void onImport(importSource)
									.then(({ blocks }) => {
										setImportSource("");
										setExpanded(blocks[0]?.id ?? "");
										if (importPanel.current) importPanel.current.open = false;
									})
									.catch(() => {});
							}}
						>
							{importing ? "Импортируем…" : "Добавить HTML в письмо"}
						</button>
					</div>
				</details>
				<details className="mail-layout-appearance" open>
					<summary>Оформление письма</summary>
					<div className="mail-layout-appearance-content">
						<fieldset className="mail-layout-palettes" aria-label="Палитры">
							{palettes.map(({ label, colors: palette }) => {
								const [background, paper, foreground, accent] = palette;
								return (
									<button
										key={label}
										type="button"
										className="mail-layout-palette"
										aria-pressed={colors.every(
											([key], index) => layout[key] === palette[index],
										)}
										onClick={() =>
											onChange({
												...layout,
												background,
												paper,
												foreground,
												accent,
											})
										}
									>
										<span
											aria-hidden="true"
											style={{ background: accent, borderColor: paper }}
										/>
										{label}
									</button>
								);
							})}
						</fieldset>
						<div className="mail-layout-swatches">
							{colors.map(([key, title]) => (
								<label className="mail-layout-swatch" key={key}>
									<input
										type="color"
										value={layout[key]}
										onChange={(event) =>
											onChange({ ...layout, [key]: event.target.value })
										}
									/>
									<span>{title}</span>
								</label>
							))}
						</div>
						<label className="mail-field">
							Фоновое изображение или GIF
							<input
								type="url"
								inputMode="url"
								placeholder="https://…"
								maxLength={2048}
								value={layout.backgroundImage}
								onChange={(event) =>
									onChange({ ...layout, backgroundImage: event.target.value })
								}
							/>
						</label>
						<div className="mail-layout-fields-row">
							<MailLayoutSelect
								label="Рамка письма"
								value={layout.frame ?? "builder"}
								options={[
									["builder", "Оформление конструктора"],
									["source", "Исходная вёрстка"],
								]}
								onChange={(frame) =>
									onChange({
										...layout,
										frame: frame === "source" ? frame : undefined,
									})
								}
							/>
							<MailLayoutSelect
								label="Расположение фона"
								value={layout.backgroundPlacement ?? "outer"}
								options={[
									["outer", "Вокруг письма"],
									["canvas", "За содержимым"],
								]}
								onChange={(backgroundPlacement) =>
									onChange({ ...layout, backgroundPlacement })
								}
							/>
							<MailLayoutSelect
								label="Шрифт заголовков"
								value={layout.headingFont ?? "sans"}
								options={[
									["sans", "Без засечек"],
									["serif", "С засечками"],
								]}
								onChange={(headingFont) => onChange({ ...layout, headingFont })}
							/>
						</div>
					</div>
				</details>
				<fieldset className="mail-layout-tools">
					<legend>Добавить блок</legend>
					{Object.entries(blockOptions).map(([type, { title, Icon }]) => (
						<button
							key={type}
							type="button"
							className="mail-button"
							onClick={() => add(type as MailBlockType)}
						>
							<Icon size={15} aria-hidden="true" /> {title}
						</button>
					))}
				</fieldset>
				<ol className="mail-layout-blocks" aria-label="Блоки письма">
					{layout.blocks.map((block, index) => {
						const { title, Icon } = blockOptions[block.type];
						const editable = block.type !== "divider";
						const open = editable && expanded === block.id;
						const Chevron = open ? ChevronDown : ChevronRight;
						return (
							<li className="mail-layout-block" key={block.id}>
								<div className="mail-layout-block-heading">
									{editable ? (
										<button
											type="button"
											className="mail-layout-block-toggle"
											aria-expanded={open}
											onClick={() => setExpanded(open ? "" : block.id)}
										>
											<Icon size={15} aria-hidden="true" />
											<span>
												<strong>{title}</strong>
												{block.text.trim() && (
													<small>{block.text.trim()}</small>
												)}
											</span>
											<Chevron size={14} aria-hidden="true" />
										</button>
									) : (
										<div className="mail-layout-block-toggle">
											<Icon size={15} aria-hidden="true" />{" "}
											<strong>{title}</strong>
										</div>
									)}
									<button
										type="button"
										className="mail-icon"
										aria-label={`Поднять блок ${index + 1}`}
										disabled={index === 0}
										onClick={() => move(index, -1)}
									>
										<ArrowUp size={14} />
									</button>
									<button
										type="button"
										className="mail-icon"
										aria-label={`Опустить блок ${index + 1}`}
										disabled={index === layout.blocks.length - 1}
										onClick={() => move(index, 1)}
									>
										<ArrowDown size={14} />
									</button>
									<button
										type="button"
										className="mail-icon mail-delete"
										aria-label={`Удалить блок ${index + 1}`}
										onClick={() =>
											onChange({
												...layout,
												blocks: layout.blocks.filter(
													({ id }) => id !== block.id,
												),
											})
										}
									>
										<Trash2 size={14} />
									</button>
								</div>
								{open &&
									(block.type === "html" ? (
										<MailImportedBlockFields
											html={block.html ?? ""}
											onChange={(patch) => replace(block.id, patch)}
										/>
									) : (
										<MailBlockFields
											block={block}
											onChange={(patch) => replace(block.id, patch)}
										/>
									))}
							</li>
						);
					})}
				</ol>
			</div>
			<section
				className="mail-layout-preview"
				aria-label="Предпросмотр конструктора"
				ref={previewPane}
				tabIndex={-1}
			>
				<div className="mail-layout-preview-header">
					<h4>Предпросмотр</h4>
					<fieldset
						className="mail-layout-preview-modes"
						aria-label="Размер предпросмотра"
					>
						<button
							type="button"
							className="mail-icon"
							aria-label="Широкий экран"
							title="Широкий экран"
							aria-pressed={!mobile}
							onClick={() => setMobile(false)}
						>
							<Monitor size={15} />
						</button>
						<button
							type="button"
							className="mail-icon"
							aria-label="Мобильный экран"
							title="Мобильный экран"
							aria-pressed={mobile}
							onClick={() => setMobile(true)}
						>
							<Smartphone size={15} />
						</button>
					</fieldset>
				</div>
				{preview ? (
					<div className="mail-layout-preview-screen" data-mobile={mobile}>
						<MailHtmlPreview
							html={preview}
							flush
							fit={mobile ? "mobile" : "desktop"}
						/>
					</div>
				) : (
					<p className="mail-layout-empty">
						Добавьте блок и заполните его, чтобы увидеть письмо.
					</p>
				)}
				<button
					type="button"
					className="mail-button mail-layout-jump"
					onClick={() => jumpToPreview.current?.focus()}
				>
					<ArrowUp size={15} aria-hidden="true" /> К редактору
				</button>
			</section>
		</div>
	);
}
