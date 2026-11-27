import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mailAssetUrl, mailLinkUrl } from "../../../shared/mail-layout.js";

function mailFragment(value: string, showLinks = false, reading = false) {
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
	if (reading) {
		for (const image of template.content.querySelectorAll("img")) {
			image.loading = "lazy";
			image.decoding = "async";
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

function sizeMailDocument(frame: HTMLIFrameElement, content: HTMLDivElement) {
	let pending = 0;
	const measure = () => {
		pending = 0;
		const height = Math.ceil(
			Math.max(content.scrollHeight, content.getBoundingClientRect().height),
		);
		const border = frame.offsetHeight - frame.clientHeight;
		const size = `${Math.min(height, 24_000) + border}px`;
		if (frame.style.height !== size) frame.style.height = size;
	};
	const observer = new ResizeObserver(() => {
		if (!pending) pending = requestAnimationFrame(measure);
	});
	observer.observe(content);
	measure();
	return () => {
		observer.disconnect();
		cancelAnimationFrame(pending);
	};
}

export function MailHtmlPreview({
	html,
	title = "Предпросмотр HTML-письма",
	flush = false,
	fit,
	reading = false,
}: {
	html: string;
	title?: string;
	flush?: boolean;
	fit?: "desktop" | "mobile";
	reading?: boolean;
}) {
	const [showImages, setShowImages] = useState(false);
	const frameRef = useRef<HTMLIFrameElement>(null);
	const viewport = useRef<HTMLDivElement>(null);
	const stopMeasuring = useRef<(() => void) | undefined>(undefined);
	const painted = useRef<
		{ content: HTMLDivElement; fragment: string } | undefined
	>(undefined);
	useEffect(
		() => () => {
			stopMeasuring.current?.();
			painted.current = undefined;
		},
		[],
	);
	const fragment = useMemo(
		() => mailFragment(html, false, reading).innerHTML,
		[html, reading],
	);
	const hasImages =
		/(?:\bsrc\s*=|\bbackground\s*=|background(?:-image)?\s*:[^;]*url\()/i.test(
			fragment,
		);
	const padding = flush ? "0" : "12px";
	const documentKey =
		fit || reading ? `${fit ?? "reading"}-${showImages}-${flush}` : "";
	const paintMeasuredDocument = useCallback(() => {
		const frame = frameRef.current;
		const area = viewport.current;
		if (!documentKey || !frame || (!reading && !area)) return;
		const content = frame.contentDocument?.querySelector<HTMLDivElement>(
			`[data-mail-measured-content="${documentKey}"]`,
		);
		if (!content) return;
		if (
			painted.current?.content === content &&
			painted.current.fragment === fragment
		)
			return;
		painted.current = { content, fragment };
		stopMeasuring.current?.();
		content.style.removeProperty("transform");
		// Populate the isolated document after load so slow images never delay measurement of the text.
		content.innerHTML = fragment;
		stopMeasuring.current = area
			? fitMailDocument(frame, area, content)
			: sizeMailDocument(frame, content);
	}, [documentKey, fragment, reading]);
	useEffect(() => paintMeasuredDocument(), [paintMeasuredDocument]);
	const styles = `
		body { font: ${reading ? 16 : 14}px/1.55 system-ui; margin:0; padding:${documentKey ? "0" : padding}; overflow-wrap:anywhere; color:#172231; background:${fit ? "transparent" : "#fff"}; }
		img { max-width:100%; } pre { white-space:pre-wrap; }
		${fit ? "html, body { overflow: hidden; }" : ""}
		${reading ? "img { height: auto; } table { max-width: 100%; }" : ""}
	`;
	const content = fit
		? `<div data-mail-measured-content="${documentKey}" style="display:flow-root;box-sizing:border-box;width:${fit === "mobile" ? 376 : 640}px;padding:${padding};transform-origin:top left;visibility:hidden"></div>`
		: reading
			? `<div data-mail-measured-content="${documentKey}" style="display:flow-root;box-sizing:border-box;padding:clamp(12px,2vw,24px)"></div>`
			: fragment;
	const preview = (
		<iframe
			className={reading ? "mail-html mail-html-reading" : "mail-html"}
			title={title}
			ref={frameRef}
			// Only the parent measures the preview. The sandbox and CSP keep scripts disabled.
			sandbox={documentKey ? "allow-same-origin" : ""}
			referrerPolicy="no-referrer"
			onLoad={paintMeasuredDocument}
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
