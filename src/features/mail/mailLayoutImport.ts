import {
	defaultMailLayout,
	mailAssetUrl,
	type MailBlock,
	type MailLayout,
} from "../../../shared/mail-layout.js";

const sectionTags = new Set([
	"BLOCKQUOTE",
	"CENTER",
	"DIV",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"HR",
	"OL",
	"P",
	"PRE",
	"TABLE",
	"UL",
]);

function parseFragment(html: string) {
	const template = document.createElement("template");
	template.innerHTML = html;
	return template;
}

function summary(fragment: DocumentFragment) {
	return (fragment.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function plainSection(
	element: Element | undefined,
): MailBlock["type"] | undefined {
	if (!element || element.attributes.length) return undefined;
	if (element.tagName === "HR") return "divider";
	if (element.tagName !== "H1" && element.tagName !== "P") return undefined;
	if (!element.textContent?.trim()) return undefined;
	for (const child of element.childNodes) {
		if (child.nodeType !== Node.TEXT_NODE && child.nodeName !== "BR")
			return undefined;
	}
	return element.tagName === "H1" ? "heading" : "text";
}

export function importMailLayout(html: string): MailLayout {
	const source = parseFragment(html);
	const blocks: MailBlock[] = [];
	let inline = document.createElement("template");

	const add = (section: HTMLTemplateElement) => {
		if (!section.innerHTML.trim()) return;
		const id = crypto.randomUUID();
		const element =
			section.content.children.length === 1
				? section.content.children[0]
				: undefined;
		const type =
			section.content.childNodes.length === 1
				? plainSection(element)
				: undefined;
		if (type && element) {
			const text = [...element.childNodes]
				.map((node) => (node.nodeName === "BR" ? "\n" : node.textContent))
				.join("");
			blocks.push({ id, type, text: text.trim(), url: "" });
		} else {
			blocks.push({
				id,
				type: "html",
				text: summary(section.content),
				url: "",
				html: section.innerHTML,
			});
		}
	};

	for (const node of [...source.content.childNodes]) {
		if (node.nodeType === Node.COMMENT_NODE) continue;
		if (node.nodeType === Node.ELEMENT_NODE && sectionTags.has(node.nodeName)) {
			add(inline);
			inline = document.createElement("template");
			const section = document.createElement("template");
			section.content.append(node);
			add(section);
		} else {
			inline.content.append(node);
		}
	}
	add(inline);
	if (!blocks.length) throw new Error("В коде нет содержимого письма.");
	return { ...defaultMailLayout, frame: "source", blocks };
}

type FieldKind = "text" | "link" | "image" | "alt" | "background";
type HtmlField = {
	kind: FieldKind;
	label: string;
	value: string;
	write: (value: string) => void;
};

const fieldNames: Record<FieldKind, string> = {
	text: "Текст",
	link: "Адрес ссылки",
	image: "Адрес изображения",
	alt: "Описание изображения",
	background: "Адрес фона",
};
const backgroundDeclaration =
	/(^|;)(\s*background-image\s*:\s*)url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/i;

export function editMailHtmlBlock(html: string) {
	const template = parseFragment(html);
	const fields: HtmlField[] = [];
	const counts: Partial<Record<FieldKind, number>> = {};
	const add = (kind: FieldKind, value: string, write: HtmlField["write"]) => {
		const number = (counts[kind] ?? 0) + 1;
		counts[kind] = number;
		fields.push({ kind, label: `${fieldNames[kind]} ${number}`, value, write });
	};
	const walker = document.createTreeWalker(
		template.content,
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
	);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node instanceof Text) {
			if (!node.data.trim()) continue;
			const text = node;
			const preserve = Boolean(text.parentElement?.closest("pre"));
			const leading = preserve ? "" : (text.data.match(/^\s*/)?.[0] ?? "");
			const trailing = preserve ? "" : (text.data.match(/\s*$/)?.[0] ?? "");
			add("text", preserve ? text.data : text.data.trim(), (value) => {
				text.data = leading + value + trailing;
			});
			continue;
		}
		if (!(node instanceof Element)) continue;
		const element = node;
		const attribute = (kind: FieldKind, attr: string) =>
			add(kind, element.getAttribute(attr) ?? "", (value) => {
				if (value || attr === "alt") element.setAttribute(attr, value);
				else element.removeAttribute(attr);
			});

		if (element.tagName === "A") attribute("link", "href");
		if (element.tagName === "IMG") {
			attribute("image", "src");
			attribute("alt", "alt");
		}
		const hasBackground = element.hasAttribute("background");
		const style = element.getAttribute("style") ?? "";
		const css = style.match(backgroundDeclaration);
		if (hasBackground || css) {
			const original = css
				? (css[3] ?? css[4] ?? css[5] ?? "").trim()
				: (element.getAttribute("background") ?? "");
			add("background", original, (value) => {
				const url = mailAssetUrl(value);
				if (hasBackground && url) element.setAttribute("background", url);
				else if (hasBackground) element.removeAttribute("background");
				if (css)
					element.setAttribute(
						"style",
						style.replace(backgroundDeclaration, (_match, before, name) =>
							url ? `${before}${name}url("${url}")` : `${before}${name}none`,
						),
					);
			});
		}
	}
	return {
		fields,
		change(index: number, value: string): Pick<MailBlock, "html" | "text"> {
			fields[index].value = value;
			fields[index].write(value);
			return { html: template.innerHTML, text: summary(template.content) };
		},
	};
}
