import { convert } from 'html-to-text';
import { mailAssetUrl, mailLinkUrl } from '../../shared/mail-layout.js';
// npm postinstall bundles the ESM parser so Vercel can load the CommonJS sanitizer.
import sanitizeHtml from './mail-sanitizer.cjs';

const color = /^(?:#[0-9a-f]{3,8}|[a-z]{3,24}|rgba?\([\d\s.,%]+\))$/i;
const size = /^(?:auto|0|\d+(?:\.\d+)?(?:px|em|rem|%|pt)?)$/i;
const responsiveFontSize = /^clamp\(\d+px,\s*\d+(?:\.\d+)?vw,\s*\d+px\)$/i;
const sizes = /^(?:(?:auto|0|-?\d+(?:\.\d+)?(?:px|em|rem|%|pt))(?:\s+|$)){1,4}$/i;
const words = /^[a-z-]+(?:\s+[a-z-]+){0,3}$/i;
const border = /^(?:0|none|\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted)\s+(?:#[0-9a-f]{3,8}|[a-z]{3,24}))$/i;
const backgroundUrl = /^url\(\s*(["']?)(https:\/\/[^\s"'()<>\\]+)\1\s*\)$/i;

const styles = {
	color: [color], 'background-color': [color], background: [color],
	'background-image': [backgroundUrl], 'background-size': [words, sizes],
	'background-position': [words, sizes], 'background-repeat': [words],
	width: [size], 'min-width': [size], 'max-width': [size], height: [size],
	'max-height': [size], 'min-height': [size], 'font-size': [size, responsiveFontSize],
	'line-height': [size], 'letter-spacing': [size],
	padding: [sizes], 'padding-top': [size], 'padding-bottom': [size],
	'padding-left': [size], 'padding-right': [size],
	margin: [sizes], 'margin-top': [size], 'margin-bottom': [size],
	'margin-left': [size], 'margin-right': [size],
	border: [border], 'border-top': [border], 'border-bottom': [border],
	'border-left': [border], 'border-right': [border], 'border-radius': [sizes],
	'border-collapse': [words], 'border-spacing': [sizes],
	'font-family': [/^[a-z0-9, "'-]+$/i], 'font-weight': [words, /^[1-9]00$/],
	'font-style': [words], 'text-align': [words], 'vertical-align': [words],
	'text-decoration': [words], 'text-transform': [words],
	'white-space': [words], 'overflow-wrap': [words], 'word-break': [words], display: [words],
	'list-style-type': [words],
};

export function sanitizeMailHtml(html) {
	return sanitizeHtml(html, {
		allowedTags: ['a', 'b', 'blockquote', 'br', 'center', 'code', 'div', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'],
		allowedAttributes: {
			'*': ['style', 'align', 'dir', 'lang', 'title'],
			a: ['href'], img: ['src', 'alt', 'width', 'height'],
			table: ['role', 'width', 'height', 'cellpadding', 'cellspacing', 'border', 'bgcolor', 'background'],
			tr: ['bgcolor'], td: ['width', 'height', 'valign', 'colspan', 'rowspan', 'bgcolor', 'background'],
			th: ['width', 'height', 'valign', 'colspan', 'rowspan', 'bgcolor', 'background'],
			font: ['color', 'face', 'size'],
		},
		allowedSchemes: ['https', 'mailto', 'tel'],
		allowedSchemesAppliedToAttributes: ['href', 'src', 'background'],
		allowProtocolRelative: false,
		allowedStyles: { '*': styles },
		nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'svg', 'title'],
		transformTags: {
			'*': (tagName, attrs) => {
				for (const attr of ['href', 'src', 'background']) {
					if (!attrs[attr]) continue;
					const value = attr === 'href' ? mailLinkUrl(attrs[attr]) : mailAssetUrl(attrs[attr]);
					if (value) attrs[attr] = value;
					else delete attrs[attr];
				}
				return { tagName: tagName === 'body' ? 'div' : tagName, attribs: attrs };
			},
		},
		exclusiveFilter: (frame) => (frame.tag === 'img' && !frame.attribs.src),
	}).trim();
}

export function plainFromMailHtml(html) {
	return convert(html, {
		wordwrap: false,
		selectors: [
			{ selector: 'img', format: 'mailImage' },
			...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((selector) => ({ selector, options: { uppercase: false } })),
		],
		formatters: {
			mailImage: (element, _walk, builder) => builder.addInline(element.attribs.alt?.trim() || '[Изображение]'),
		},
	}).trim();
}
