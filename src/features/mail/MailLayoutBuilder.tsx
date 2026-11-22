import {
	ArrowDown,
	ArrowUp,
	Heading,
	Image,
	Minus,
	MousePointer2,
	Plus,
	Text,
	Trash2,
} from "lucide-react";
import { useDeferredValue } from "react";
import {
	defaultMailLayout,
	type MailBlock,
	type MailBlockType,
	type MailLayout,
	renderMailLayout,
} from "../../../shared/mail-layout.js";
import { MailHtmlPreview } from "./MailHtmlPreview";

const colors = [
	["background", "Фон письма"],
	["paper", "Фон карточки"],
	["foreground", "Текст"],
	["accent", "Кнопки"],
] as const;

const blockOptions = {
	heading: { title: "Заголовок", Icon: Heading },
	text: { title: "Текст", Icon: Text },
	image: { title: "Картинка / GIF", Icon: Image },
	button: { title: "Кнопка", Icon: MousePointer2 },
	divider: { title: "Линия", Icon: Minus },
	space: { title: "Отступ", Icon: Plus },
};

export function MailLayoutBuilder({
	layout = defaultMailLayout,
	onChange,
}: {
	layout?: MailLayout;
	onChange: (layout: MailLayout) => void;
}) {
	const preview = renderMailLayout(useDeferredValue(layout));
	const replace = (id: string, patch: Partial<MailBlock>) =>
		onChange({
			...layout,
			blocks: layout.blocks.map((block) =>
				block.id === id ? { ...block, ...patch } : block,
			),
		});
	const add = (type: MailBlockType) =>
		onChange({
			...layout,
			blocks: [
				...layout.blocks,
				{ id: crypto.randomUUID(), type, text: "", url: "" },
			],
		});
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
				<ol className="mail-layout-blocks">
					{layout.blocks.map((block, index) => {
						const { title, Icon } = blockOptions[block.type];
						return (
							<li className="mail-layout-block" key={block.id}>
								<div className="mail-layout-block-heading">
									<Icon size={15} aria-hidden="true" />
									<strong>{title}</strong>
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
								{block.type === "image" || block.type === "button" ? (
									<>
										<label className="mail-field">
											{block.type === "image"
												? "Ссылка на картинку или GIF"
												: "Ссылка кнопки"}
											<input
												required
												type="url"
												maxLength={2048}
												value={block.url}
												onChange={(event) =>
													replace(block.id, { url: event.target.value })
												}
												placeholder="https://…"
											/>
										</label>
										<label className="mail-field">
											{block.type === "image"
												? "Описание картинки"
												: "Текст кнопки"}
											<input
												maxLength={300}
												required={block.type === "button"}
												value={block.text}
												onChange={(event) =>
													replace(block.id, { text: event.target.value })
												}
											/>
										</label>
									</>
								) : (
									(block.type === "heading" || block.type === "text") && (
										<label className="mail-field">
											{block.type === "heading"
												? "Текст заголовка"
												: "Текст блока"}
											<textarea
												rows={block.type === "heading" ? 2 : 4}
												value={block.text}
												onChange={(event) =>
													replace(block.id, { text: event.target.value })
												}
											/>
										</label>
									)
								)}
							</li>
						);
					})}
				</ol>
			</div>
			<section
				className="mail-layout-preview"
				aria-label="Предпросмотр конструктора"
			>
				<h4>Предпросмотр</h4>
				{preview ? (
					<MailHtmlPreview html={preview} />
				) : (
					<p className="mail-layout-empty">
						Добавьте блок, чтобы увидеть письмо.
					</p>
				)}
			</section>
		</div>
	);
}
