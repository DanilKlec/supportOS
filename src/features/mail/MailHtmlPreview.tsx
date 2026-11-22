import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function fitMailDocument(
	frame: HTMLIFrameElement,
	viewport: HTMLDivElement,
	content: HTMLDivElement,
) {
	const doc = content.ownerDocument;
	const range = doc.createRange();
	range.selectNodeContents(content);
	let scale = 1;
	let pending = 0;
	const updateScale = () => {
		pending = 0;
		const { clientWidth: width, clientHeight: height } = frame;
		if (!width || !height) return;

		const origin = content.getBoundingClientRect();
		const bounds = range.getBoundingClientRect();
		const left = bounds.width
			? Math.min(0, (bounds.left - origin.left) / scale)
			: 0;
		const top = bounds.height
			? Math.min(0, (bounds.top - origin.top) / scale)
			: 0;
		const right = bounds.width ? (bounds.right - origin.left) / scale : 0;
		const bottom = bounds.height ? (bounds.bottom - origin.top) / scale : 0;
		const contentWidth = Math.max(content.scrollWidth, right, 1) - left;
		const contentHeight = Math.max(content.scrollHeight, bottom, 1) - top;

		scale = Math.min(1, width / contentWidth, height / contentHeight);
		const x = (width - contentWidth * scale) / 2 - left * scale;
		const y = -top * scale;
		const renderedHeight = Math.min(height, Math.ceil(contentHeight * scale));
		const stageColor = getComputedStyle(viewport).backgroundColor;
		content.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
		content.style.visibility = "visible";
		doc.body.style.background = `linear-gradient(#fff,#fff) center top / ${contentWidth * scale}px ${renderedHeight}px no-repeat ${stageColor}`;
		viewport.style.height = `${renderedHeight}px`;
	};
	const scheduleFit = () => {
		if (!pending) pending = requestAnimationFrame(updateScale);
	};
	updateScale();
	const observer = new ResizeObserver(scheduleFit);
	observer.observe(frame);
	observer.observe(content);
	doc.addEventListener("load", scheduleFit, true);
	doc.addEventListener("error", scheduleFit, true);
	return () => {
		observer.disconnect();
		doc.removeEventListener("load", scheduleFit, true);
		doc.removeEventListener("error", scheduleFit, true);
		cancelAnimationFrame(pending);
	};
}

export function MailHtmlPreview({
	html,
	title = "Предпросмотр HTML-письма",
	flush = false,
	fit,
}: {
	html: string;
	title?: string;
	flush?: boolean;
	fit?: "desktop" | "mobile";
}) {
	const [showImages, setShowImages] = useState(false);
	const frameRef = useRef<HTMLIFrameElement>(null);
	const viewport = useRef<HTMLDivElement>(null);
	const stopFitting = useRef<(() => void) | undefined>(undefined);
	useEffect(() => () => stopFitting.current?.(), []);
	const fragment = useMemo(() => mailFragment(html).innerHTML, [html]);
	const hasImages =
		/(?:\bsrc\s*=|\bbackground\s*=|background(?:-image)?\s*:[^;]*url\()/i.test(
			fragment,
		);
	const padding = flush ? "0" : "12px";
	const fitKey = fit ? `${fit}-${showImages}-${flush}` : "";
	const paintFittedPreview = useCallback(() => {
		const frame = frameRef.current;
		const area = viewport.current;
		if (!fitKey || !frame || !area) return;
		const content = frame.contentDocument?.querySelector<HTMLDivElement>(
			`[data-mail-fit-content="${fitKey}"]`,
		);
		if (!content) return;
		stopFitting.current?.();
		content.style.removeProperty("transform");
		// Populate the isolated document after load so slow images never delay the first fit.
		content.innerHTML = fragment;
		stopFitting.current = fitMailDocument(frame, area, content);
	}, [fitKey, fragment]);
	useEffect(() => paintFittedPreview(), [paintFittedPreview]);
	const styles = `
		body { font: 14px/1.55 system-ui; margin:0; padding:${fit ? "0" : padding}; overflow-wrap:anywhere; color:#172231; background:${fit ? "transparent" : "#fff"}; }
		img { max-width:100%; } pre { white-space:pre-wrap; }
		${fit ? "html, body { overflow: hidden; }" : ""}
	`;
	const content = fit
		? `<div data-mail-fit-content="${fitKey}" style="display:flow-root;box-sizing:border-box;width:${fit === "mobile" ? 376 : 640}px;padding:${padding};transform-origin:top left;visibility:hidden"></div>`
		: fragment;
	const preview = (
		<iframe
			className="mail-html"
			title={title}
			ref={frameRef}
			// Only the parent measures the preview. The sandbox and CSP keep scripts disabled.
			sandbox={fit ? "allow-same-origin" : ""}
			referrerPolicy="no-referrer"
			onLoad={paintFittedPreview}
			srcDoc={`<!doctype html><meta charset="UTF-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src ${showImages ? "https:" : "'none'"}; base-uri 'none'; form-action 'none'"><style>${styles}</style>${content}`}
		/>
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
			{fit ? (
				<div className="mail-html-fit" ref={viewport}>
					{preview}
				</div>
			) : (
				preview
			)}
		</div>
	);
}
