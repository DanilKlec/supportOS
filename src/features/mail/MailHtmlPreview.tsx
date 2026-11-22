import { useMemo, useState } from "react";
import { mailAssetUrl, mailLinkUrl } from "../../../shared/mail-layout.js";

function mailFragment(value: string, showLinks = false) {
	const template = document.createElement("template");
	template.innerHTML = value;
	for (const element of template.content.querySelectorAll(
		"script, iframe, frame, frameset, link, meta, object, embed, base, form, input, button, svg, math, video, audio, source, style, title, template, noscript",
	))
		element.remove();
	for (const element of template.content.querySelectorAll("*")) {
		for (const attr of [...element.attributes]) {
			if (
				attr.name.startsWith("on") ||
				["srcset", "ping", "href", "src", "background"].includes(attr.name)
			)
				element.removeAttribute(attr.name);
			if (attr.name === "src" || attr.name === "background") {
				const url = mailAssetUrl(attr.value);
				if (url) element.setAttribute(attr.name, url);
			}
			if (showLinks && attr.name === "href" && mailLinkUrl(attr.value))
				element.append(document.createTextNode(` (${attr.value})`));
		}
	}
	return template;
}

export function plainFromMailPreview(value: string) {
	return mailFragment(value, true).content.textContent ?? "";
}

export function MailHtmlPreview({
	html,
	title = "Предпросмотр HTML-письма",
	flush = false,
}: {
	html: string;
	title?: string;
	flush?: boolean;
}) {
	const [showImages, setShowImages] = useState(false);
	const fragment = useMemo(() => mailFragment(html).innerHTML, [html]);
	const hasImages =
		/(?:\bsrc\s*=|\bbackground\s*=|background(?:-image)?\s*:[^;]*url\()/i.test(
			fragment,
		);
	return (
		<div className="mail-html-preview">
			{hasImages && (
				<button
					type="button"
					className="mail-button"
					aria-pressed={showImages}
					onClick={() => setShowImages((shown) => !shown)}
				>
					{showImages ? "Скрыть изображения" : "Показать изображения"}
				</button>
			)}
			<iframe
				className="mail-html"
				title={title}
				sandbox=""
				referrerPolicy="no-referrer"
				srcDoc={`<!doctype html><meta charset="UTF-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${showImages ? "https:" : "'none'"}; base-uri 'none'; form-action 'none'"><style>body { font: 14px/1.55 system-ui; margin:0; padding:${flush ? "0" : "12px"}; overflow-wrap:anywhere; color:#172231; background:#fff; } img { max-width:100%; } pre { white-space:pre-wrap; }</style>${fragment}`}
			/>
		</div>
	);
}
