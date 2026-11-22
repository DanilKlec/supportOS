export const mailHtmlLimit = 220_000;
const blockTypes = new Set(['brand', 'hero', 'offer', 'signature', 'footer', 'heading', 'text', 'image', 'button', 'divider', 'space']);
const alignments = ['left', 'center', 'right'];
const heroHeights = { compact: 210, regular: 300, tall: 420 };
const heroShades = { none: 0, medium: 0.4, strong: 0.65 };
const spaceHeights = { small: 20, medium: 48, large: 96, extra: 160 };
const readText = (value) => typeof value === 'string' ? value : '';
const hasKey = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);

export const defaultMailLayout = {
	version: 1,
	background: '#eef2f7',
	paper: '#ffffff',
	foreground: '#172238',
	accent: '#394cc9',
	backgroundImage: '',
	blocks: [],
};

export function escapeMailHtml(value) {
	return value.replace(/[&<>"']/g, (char) => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	})[char]);
}

export function mailTextHtml(value) {
	return value ? `<div style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeMailHtml(value)}</div>` : '';
}

export function mailAssetUrl(value) {
	if (typeof value !== 'string') return '';
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) return '';
		return url.href.replace(/[()'\\]/g, (character) => `%${character.charCodeAt(0).toString(16)}`);
	} catch {
		return '';
	}
}

export function mailLinkUrl(value) {
	const https = mailAssetUrl(value);
	if (https) return https;
	return typeof value === 'string' && /^(mailto|tel):[^\s<>"'\\]{1,500}$/i.test(value) ? value : '';
}

const isColor = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

function normalizeMailBlock(block) {
	if (!blockTypes.has(block?.type) || typeof block.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(block.id))
		throw new Error('В макете есть неизвестный блок.');
	const text = readText(block.text);
	const isButton = block.type === 'button';
	const artwork = ['image', 'brand', 'hero', 'offer', 'signature'].includes(block.type);
	const url = isButton ? mailLinkUrl(block.url) : artwork ? mailAssetUrl(block.url) : '';
	if ((isButton || block.type === 'image' || (artwork && block.url)) && !url)
		throw new Error('Проверьте ссылки в блоках письма. Для изображений нужна HTTPS-ссылка.');
	if (isButton && !text.trim()) throw new Error('Введите текст кнопки.');
	const normalized = { id: block.id, type: block.type, text, url };
	if (alignments.includes(block.align)) normalized.align = block.align;
	if (['brand', 'hero', 'offer'].includes(block.type) && typeof block.eyebrow === 'string') normalized.eyebrow = block.eyebrow;
	if (['hero', 'offer', 'signature'].includes(block.type) && typeof block.description === 'string') normalized.description = block.description;
	if (block.type === 'hero') {
		if (typeof block.accentLine === 'string') normalized.accentLine = block.accentLine;
		if (hasKey(heroHeights, block.heroHeight)) normalized.heroHeight = block.heroHeight;
		if (alignments.includes(block.imagePosition)) normalized.imagePosition = block.imagePosition;
		if (hasKey(heroShades, block.shade)) normalized.shade = block.shade;
	}
	if (block.type === 'offer' && block.offerImagePlacement === 'above') normalized.offerImagePlacement = block.offerImagePlacement;
	if (isButton && block.buttonWidth === 'full') normalized.buttonWidth = block.buttonWidth;
	if (isButton && block.buttonShape === 'pill') normalized.buttonShape = block.buttonShape;
	if (block.type === 'space' && hasKey(spaceHeights, block.spaceHeight)) normalized.spaceHeight = block.spaceHeight;
	if (block.type === 'footer' && block.links !== undefined) {
		if (!Array.isArray(block.links) || block.links.length > 3)
			throw new Error('В подвал письма можно добавить до трёх ссылок.');
		normalized.links = block.links.map((link) => {
			const label = readText(link?.text).trim();
			const href = mailLinkUrl(link?.url);
			if (!label || !href) throw new Error('Укажите текст и адрес каждой ссылки в подвале.');
			return { text: label, url: href };
		});
	}
	return normalized;
}

export function normalizeMailLayout(input) {
	if (input?.version !== 1 || !Array.isArray(input.blocks) || JSON.stringify(input).length > mailHtmlLimit)
		throw new Error('Проверьте структуру и размер макета письма.');
	const layout = { ...defaultMailLayout };
	for (const key of ['background', 'paper', 'foreground', 'accent']) {
		if (!isColor(input[key])) throw new Error('Укажите цвета в формате #RRGGBB.');
		layout[key] = input[key];
	}
	if (input.backgroundImage) {
		layout.backgroundImage = mailAssetUrl(input.backgroundImage);
		if (!layout.backgroundImage) throw new Error('Укажите HTTPS-ссылку на фоновое изображение.');
	}
	if (input.backgroundPlacement === 'canvas') layout.backgroundPlacement = 'canvas';
	if (input.headingFont === 'serif') layout.headingFont = 'serif';
	layout.blocks = input.blocks.map(normalizeMailBlock);
	if (new Set(layout.blocks.map(({ id }) => id)).size !== layout.blocks.length)
		throw new Error('В макете повторяются блоки.');
	return layout;
}

const inline = (value) => escapeMailHtml(readText(value).trim()).replace(/\r?\n/g, '<br>');
const rgb = (hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));

function blend(base, tint, amount) {
	const channels = rgb(tint);
	return '#' + rgb(base).map((value, index) =>
		Math.round(value * (1 - amount) + channels[index] * amount).toString(16).padStart(2, '0'),
	).join('');
}

function luminance(hex) {
	const [red, green, blue] = rgb(hex).map((value) => {
		const channel = value / 255;
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});
	return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastText(hex) {
	return luminance(hex) > 0.179 ? '#000000' : '#ffffff';
}

function headlineColor(accent, background, fallback) {
	const a = luminance(accent) + 0.05;
	const b = luminance(background) + 0.05;
	return Math.max(a, b) / Math.min(a, b) >= 3 ? accent : fallback;
}

function backgroundArtwork(url, position = 'center top') {
	const source = mailAssetUrl(url);
	const safe = source && escapeMailHtml(source);
	return {
		attr: safe ? ` background="${safe}"` : '',
		css: safe ? `;background-image:url('${safe}');background-position:${position};background-size:cover;background-repeat:no-repeat` : '',
	};
}

function picture(url, alt, width) {
	const source = mailAssetUrl(url);
	return source ? `<img src="${escapeMailHtml(source)}" alt="${escapeMailHtml(readText(alt).trim())}" width="${width}" style="display:inline-block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:8px;vertical-align:middle">` : '';
}

function renderCover(block, { surface, font, align, accent }) {
	const title = inline(block.text);
	const accentLine = inline(block.accentLine);
	const kicker = inline(block.eyebrow);
	const copy = inline(block.description);
	const position = alignments.includes(block.imagePosition) ? block.imagePosition : 'right';
	const image = backgroundArtwork(block.url, `${position} center`);
	if (!title && !accentLine && !kicker && !copy && !image.attr) return '';
	const base = contrastText(surface) === '#ffffff' ? surface : '#111827';
	const height = hasKey(heroHeights, block.heroHeight) ? heroHeights[block.heroHeight] : heroHeights.regular;
	const shade = hasKey(heroShades, block.shade) ? heroShades[block.shade] : heroShades.medium;
	const overlay = shade && image.attr ? `background-color:rgba(0,0,0,${shade});` : '';
	const label = kicker ? `<p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase">${kicker}</p>` : '';
	const emphasis = accentLine ? `<span style="color:${headlineColor(accent, base, '#ffffff')}">${accentLine}</span>` : '';
	const headline = [title, emphasis].filter(Boolean).join('<br>');
	const heading = headline ? `<h1 style="margin:0;font-family:${font};font-size:36px;line-height:1.1;font-weight:700;color:#ffffff">${headline}</h1>` : '';
	const detail = copy ? `<p style="margin:12px 0 0;font-size:16px;line-height:1.5">${copy}</p>` : '';
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 22px">
		<tbody><tr><td height="${height}" bgcolor="${base}"${image.attr} style="background-color:${base}${image.css}">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
				<tbody><tr><td height="${height}" align="${align}" valign="middle" style="${overlay}padding:18px 4%;color:#ffffff">${label}${heading}${detail}</td></tr></tbody>
			</table>
		</td></tr></tbody>
	</table>`;
}

function renderCampaignBlock(block, style) {
	const { ink, accent, surface, font, rule, align } = style;
	const title = inline(block.text);
	const kicker = inline(block.eyebrow);
	const copy = inline(block.description);
	const label = kicker ? `<p style="margin:0 0 7px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${kicker}</p>` : '';
	if (block.type === 'hero') return renderCover(block, style);
	if (block.type === 'brand') {
		const logo = picture(block.url, title ? '' : block.eyebrow, 152);
		if (!logo && !title && !kicker) return '';
		return `<div style="margin:0 0 19px;text-align:${align}">${logo}${title ? `<p style="margin:4px 0;font-family:${font};font-size:20px;font-weight:700">${title}</p>` : ''}${label}</div>`;
	}
	if (block.type === 'offer') {
		const artwork = picture(block.url, '', 120);
		if (!artwork && !title && !kicker && !copy) return '';
		const fill = blend(surface, accent, 0.08);
		const split = artwork && (title || kicker || copy) && block.offerImagePlacement !== 'above';
		const imageCell = split ? `<td width="27%" align="center" valign="middle" style="padding:12px 0 12px 14px">${artwork}</td>` : '';
		const imageAbove = artwork && !split ? `<div style="margin:0 0 12px">${artwork}</div>` : '';
		const heading = title ? `<h2 style="margin:0 0 6px;font-family:${font};font-size:26px;line-height:1.2;color:${headlineColor(accent, fill, ink)}">${title}</h2>` : '';
		const detail = copy ? `<p style="margin:0;font-size:14px;line-height:1.55">${copy}</p>` : '';
		return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;background-color:${fill};border:1px solid ${rule};border-radius:14px"><tbody><tr>${imageCell}<td align="${align}" style="padding:18px;color:${ink}">${imageAbove}${label}${heading}${detail}</td></tr></tbody></table>`;
	}
	if (block.type === 'signature') {
		const artwork = picture(block.url, '', 160);
		if (!artwork && !title && !copy) return '';
		return `<div style="margin:18px 0 22px;text-align:${align}">${artwork}${title ? `<p style="margin:3px 0;font-family:${font};font-size:22px;font-weight:700">${title}</p>` : ''}${copy ? `<p style="margin:2px 0;font-size:14px;line-height:1.5">${copy}</p>` : ''}</div>`;
	}
	if (block.type === 'footer') {
		const links = (block.links ?? []).flatMap(({ text, url }) => {
			const href = mailLinkUrl(url);
			return href && text.trim() ? [`<a href="${escapeMailHtml(href)}" style="display:inline-block;color:${ink};text-decoration:underline;margin:3px 8px">${inline(text)}</a>`] : [];
		});
		if (!title && !links.length) return '';
		return `<div style="padding:16px 0 0;border-top:1px solid ${rule};text-align:${align};font-size:12px;line-height:1.6">${title ? `<p style="margin:0 0 4px">${title}</p>` : ''}${links.join(' ')}</div>`;
	}
	return '';
}

export function renderMailLayout(layout) {
	const color = (key) => isColor(layout[key]) ? layout[key] : defaultMailLayout[key];
	const ink = color('foreground');
	const surface = color('paper');
	const accent = color('accent');
	const background = color('background');
	const font = layout.headingFont === 'serif' ? 'Georgia,Times New Roman,serif' : 'Arial,Helvetica,sans-serif';
	const backdrop = backgroundArtwork(layout.backgroundImage);
	const canvas = layout.backgroundPlacement === 'canvas';
	const rule = blend(surface, ink, 0.22);
	const rows = layout.blocks.map((block) => {
		const { type, text, url } = block;
		const value = inline(text);
		const align = alignments.includes(block.align) ? block.align : 'left';
		if (type === 'heading') return value ? `<h1 style="font-family:${font};text-align:${align};font-size:28px;line-height:1.25;margin:0 0 14px;color:${ink};font-weight:700">${value}</h1>` : '';
		if (type === 'text') return value ? `<p style="text-align:${align};font-size:16px;line-height:1.6;margin:0 0 16px;color:${ink}">${value}</p>` : '';
		if (type === 'image') {
			const source = mailAssetUrl(url);
			return source ? `<p style="margin:0 0 16px"><img src="${escapeMailHtml(source)}" alt="${escapeMailHtml(text.trim())}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:12px"></p>` : '';
		}
		if (type === 'button') {
			const link = mailLinkUrl(url);
			const display = block.buttonWidth === 'full' ? 'block' : 'inline-block';
			const radius = block.buttonShape === 'pill' ? 999 : 12;
			return value && link ? `<p style="margin:4px 0 22px;text-align:${align}"><a href="${escapeMailHtml(link)}" style="display:${display};text-align:center;background-color:${accent};color:${contrastText(accent)};border-radius:${radius}px;padding:13px 21px;text-decoration:none;font-weight:700">${value}</a></p>` : '';
		}
		if (type === 'divider') return `<hr style="border:0;border-top:1px solid ${rule};margin:20px 0">`;
		if (type === 'space') {
			const height = hasKey(spaceHeights, block.spaceHeight) ? spaceHeights[block.spaceHeight] : spaceHeights.small;
			return `<div style="height:${height}px;line-height:${height}px">&nbsp;</div>`;
		}
		return renderCampaignBlock(block, { ink, accent, surface, font, rule, align });
	}).join('');
	if (!rows) return '';
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${background}"${canvas ? '' : backdrop.attr} style="width:100%;background-color:${background}${canvas ? '' : backdrop.css}">
		<tbody><tr><td align="center" style="padding:24px 3%">
			<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="${surface}"${canvas ? backdrop.attr : ''} style="width:100%;max-width:600px;background-color:${surface};border-radius:16px${canvas ? backdrop.css : ''}">
				<tbody><tr><td style="padding:22px 4%;color:${ink};font-family:Arial,sans-serif;overflow-wrap:anywhere">${rows}</td></tr></tbody>
			</table>
		</td></tr></tbody>
	</table>`;
}
