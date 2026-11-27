export const invitationFields = [
	{ key: 'subject', label: 'Тема письма', limit: 180 },
	{ key: 'heading', label: 'Заголовок', limit: 100 },
	{ key: 'body', label: 'Текст письма', limit: 2400, multiline: true },
	{ key: 'button', label: 'Текст кнопки', limit: 65 },
	{ key: 'footer', label: 'Подпись', limit: 400, multiline: true, optional: true },
];

export const defaultInvitation = {
	subject: 'Приглашение в SupportOS',
	heading: 'Добро пожаловать в SupportOS',
	body: 'Здравствуйте, {{name}}!\n\nМы подготовили для вас аккаунт {{email}}. Подтвердите адрес и задайте пароль, чтобы начать работу.',
	button: 'Активировать аккаунт',
	footer: 'Команда SupportOS',
	accent: '#335ad6',
};

export function validateInvitation(value) {
	const template = {};
	for (const { key, label, limit, multiline, optional } of invitationFields) {
		const field = value?.[key];
		if (typeof field !== 'string' || field.length > limit || (!optional && !field.trim()) ||
			(field.includes('\0') || !multiline && /[\r\n]/.test(field))) {
			throw new Error(`Проверьте поле «${label}» (до ${limit} знаков).`);
		}
		template[key] = field.trim();
	}
	if (typeof value?.accent !== 'string' || !/^#[a-f\d]{6}$/i.test(value.accent))
		throw new Error('Выберите корректный цвет кнопки.');
	return { ...template, accent: value.accent.toLowerCase() };
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) =>
	({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function renderInvitation(template, { name, email, url }) {
	const personalize = (value) => value.replace(/\{\{(name|email)\}\}/g, (_, key) => key === 'name' ? name : email);
	const lines = (value) => escapeHtml(value).replace(/\r?\n/g, '<br>');
	const subject = personalize(template.subject).replace(/[\r\n\0]/g, ' ').slice(0, 500);
	const heading = personalize(template.heading);
	const body = personalize(template.body);
	const button = personalize(template.button);
	const footer = personalize(template.footer);
	const accent = /^#[a-f\d]{6}$/i.test(template.accent) ? template.accent : defaultInvitation.accent;
	const rgb = [1, 3, 5].map((index) => Number.parseInt(accent.slice(index, index + 2), 16) / 255);
	const [r, g, b] = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
	const ink = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#111827' : '#ffffff';
	return {
		subject,
		text: [heading, body, `${button}: ${url}`, footer].filter(Boolean).join('\n\n'),
		html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background-color:#eef2f8;font-family:Arial,sans-serif;color:#162039">
<tr><td align="center" style="padding:26px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:16px">
<tr><td style="padding:28px 28px 14px;border-top:5px solid ${accent};font-size:14px;font-weight:bold;color:#42536f">SupportOS</td></tr>
<tr><td style="padding:0 28px 18px"><h1 style="margin:0;font-size:27px;line-height:1.25;color:#162039">${escapeHtml(heading)}</h1></td></tr>
<tr><td style="padding:0 28px 24px;font-size:16px;line-height:1.6;overflow-wrap:anywhere">${lines(body)}</td></tr>
<tr><td style="padding:0 28px 28px"><a href="${escapeHtml(url)}" style="display:inline-block;background-color:${accent};color:${ink};border-radius:8px;padding:13px 18px;font-size:15px;font-weight:bold;text-decoration:none">${escapeHtml(button)}</a></td></tr>
${footer ? `<tr><td style="padding:18px 28px 24px;border-top:1px solid #e3e8f1;font-size:13px;line-height:1.5;color:#4a5974">${lines(footer)}</td></tr>` : ''}
</table></td></tr></table>`,
	};
}
