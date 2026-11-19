import proxy from './index.js';
import webhook from './webhook.js';
import { readBytes } from './_body.js';
import mail from '../mail/index.js';
import mailCallback from '../mail/callback.js';

export default async function chatwootHttp(req, res) {
	const url = new URL(req.url ?? '/', 'http://localhost');
	const surface = url.searchParams.get('surface');
	if (url.pathname === '/api/mail/callback' || surface === 'mail-callback') return mailCallback(req, res);
	const proxyHandler = url.pathname === '/api/mail' || surface === 'mail' ? mail : proxy;
	if (proxyHandler === proxy && (url.pathname === '/api/chatwoot/webhook' || url.searchParams.get('action') === 'webhook')) {
		return webhook(req, res);
	}
	let body;
	try {
		const supplied = Object.getOwnPropertyDescriptor(req, 'body')?.value;
		if (supplied && typeof supplied === 'object' && !Buffer.isBuffer(supplied)) {
			body = supplied;
		} else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
			const bytes = await readBytes(req, 4_000_000);
			body = bytes.length ? JSON.parse(bytes.toString('utf8')) : {};
		}
	} catch (error) {
		res.statusCode = error.status === 413 ? 413 : 400;
		res.setHeader('Content-Type', 'application/json; charset=utf-8');
		res.setHeader('Cache-Control', 'no-store');
		return res.end(JSON.stringify({ error: res.statusCode === 413 ? 'Размер запроса превышает 4 МБ' : 'Некорректный запрос' }));
	}
	return proxyHandler(Object.create(req, { body: { value: body ?? {} } }), res);
}
