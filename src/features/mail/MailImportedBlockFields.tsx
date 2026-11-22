import { useId, useState } from "react";
import { mailHtmlLimit, type MailBlock } from "../../../shared/mail-layout.js";
import { editMailHtmlBlock } from "./mailLayoutImport";

export function MailImportedBlockFields({
	html,
	onChange,
}: {
	html: string;
	onChange: (patch: Partial<MailBlock>) => void;
}) {
	const [source, setSource] = useState(!html);
	return (
		<div className="mail-block-fields">
			<nav
				className="mail-template-scopes"
				aria-label="Режим редактирования HTML-блока"
			>
				<button
					type="button"
					className="mail-category"
					aria-pressed={!source}
					onClick={() => setSource(false)}
				>
					Содержимое
				</button>
				<button
					type="button"
					className="mail-category"
					aria-pressed={source}
					onClick={() => setSource(true)}
				>
					Код блока
				</button>
			</nav>
			{source ? (
				<label className="mail-field">
					HTML блока
					<textarea
						className="mail-html-source"
						value={html}
						spellCheck={false}
						maxLength={mailHtmlLimit}
						onChange={(event) =>
							onChange({ html: event.target.value, text: "" })
						}
					/>
				</label>
			) : (
				<VisualHtmlFields html={html} onChange={onChange} />
			)}
		</div>
	);
}

function VisualHtmlFields({
	html,
	onChange,
}: {
	html: string;
	onChange: (patch: Partial<MailBlock>) => void;
}) {
	const [draft] = useState(() => editMailHtmlBlock(html));
	const [visible, setVisible] = useState(20);
	const prefix = useId();
	return (
		<>
			{draft.fields.length === 0 && (
				<p className="mail-muted">
					В этом блоке нет текста, ссылок или изображений для правки.
				</p>
			)}
			{draft.fields.slice(0, visible).map(({ label, kind, value }, index) => (
				<label
					className="mail-field"
					key={label}
					htmlFor={`${prefix}-${index}`}
				>
					{label}
					{kind === "text" ? (
						<textarea
							id={`${prefix}-${index}`}
							rows={2}
							value={value}
							onChange={(event) =>
								onChange(draft.change(index, event.target.value))
							}
						/>
					) : (
						<input
							id={`${prefix}-${index}`}
							inputMode={kind === "alt" ? "text" : "url"}
							value={value}
							onChange={(event) =>
								onChange(draft.change(index, event.target.value))
							}
						/>
					)}
				</label>
			))}
			{draft.fields.length > visible && (
				<button
					type="button"
					className="mail-button mail-add-link"
					onClick={() => setVisible(visible + 20)}
				>
					Показать ещё поля
				</button>
			)}
		</>
	);
}
