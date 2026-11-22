export const mailHtmlLimit = 220_000;
const blockTypes = new Set(['heading', 'text', 'image', 'button', 'divider', 'space']);

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
	return /^(mailto|tel):[^\s<>"'\\]{1,500}$/i.test(value) ? value : '';
}

const isColor = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

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
	layout.blocks = input.blocks.map((block) => {
		if (!blockTypes.has(block?.type) || typeof block.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(block.id))
			throw new Error('В макете есть неизвестный блок.');
		const text = typeof block.text === 'string' ? block.text : '';
		if (block.type === 'image' || block.type === 'button') {
			const url = block.type === 'image' ? mailAssetUrl(block.url) : mailLinkUrl(block.url);
			if (!url) throw new Error('Проверьте ссылки в блоках изображений и кнопок.');
			if (block.type === 'button' && !text.trim()) throw new Error('Введите текст кнопки.');
			return { id: block.id, type: block.type, text, url };
		}
		return { id: block.id, type: block.type, text, url: '' };
	});
	if (new Set(layout.blocks.map(({ id }) => id)).size !== layout.blocks.length)
		throw new Error('В макете повторяются блоки.');
	return layout;
}

export function renderMailLayout(layout) {
	const color = (key) => isColor(layout[key]) ? layout[key] : defaultMailLayout[key];
	const ink = color('foreground');
	const surface = color('paper');
	const accent = color('accent');
	const background = color('background');
	const image = mailAssetUrl(layout.backgroundImage);
	const backgroundAttrs = image ? ` background="${escapeMailHtml(image)}"` : '';
	const backgroundStyle = image ? `;background-image:url('${escapeMailHtml(image)}');background-position:center top;background-size:cover;background-repeat:no-repeat` : '';
	const rows = layout.blocks.map(({ type, text, url }) => {
		const value = escapeMailHtml(text.trim()).replace(/\r?\n/g, '<br>');
		if (type === 'heading') return value ? `<h1 style="font-size:28px;line-height:1.25;margin:0 0 14px;color:${ink};font-weight:700">${value}</h1>` : '';
		if (type === 'text') return value ? `<p style="font-size:16px;line-height:1.6;margin:0 0 16px;color:${ink}">${value}</p>` : '';
		if (type === 'image') {
			const source = mailAssetUrl(url);
			return source ? `<p style="margin:0 0 16px"><img src="${escapeMailHtml(source)}" alt="${escapeMailHtml(text.trim())}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:12px"></p>` : '';
		}
		if (type === 'button') {
			const link = mailLinkUrl(url);
			return value && link ? `<p style="margin:4px 0 20px"><a href="${escapeMailHtml(link)}" style="display:inline-block;background-color:${accent};color:#ffffff;border-radius:8px;padding:11px 18px;text-decoration:none;font-weight:700">${value}</a></p>` : '';
		}
		if (type === 'divider') return '<hr style="border:0;border-top:1px solid #dce3ed;margin:20px 0">';
		if (type === 'space') return '<div style="height:20px;line-height:20px">&nbsp;</div>';
		return '';
	}).join('');
	if (!rows) return '';
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${background}"${backgroundAttrs} style="width:100%;background-color:${background}${backgroundStyle}"><tbody><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="${surface}" style="width:100%;max-width:600px;background-color:${surface};border-radius:16px"><tbody><tr><td style="padding:22px;color:${ink};font-family:Arial,sans-serif">${rows}</td></tr></tbody></table></td></tr></tbody></table>`;
}
