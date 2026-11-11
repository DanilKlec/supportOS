import { loadEnv } from 'vite';
import handler from './index.js';

export function chatwootPlugin() {
	return {
		name: 'supportos-chatwoot-api',
		configureServer(server) {
			const env = loadEnv(server.config.mode, server.config.root, '');
			for (const [key, value] of Object.entries(env)) {
				if (/^CHATWOOT_/.test(key) && process.env[key] === undefined) process.env[key] = value;
			}
			server.middlewares.use(async (req, res, next) => {
				if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/api/chatwoot') return next();
				try {
					let raw = '';
					for await (const chunk of req) {
						raw += chunk.toString();
						if (Buffer.byteLength(raw) > 30000) { res.statusCode = 413; res.end('{"error":"Request too large"}'); return; }
					}
					req.body = raw ? JSON.parse(raw) : {};
					await handler(req, res);
				} catch {
					res.statusCode = 400;
					res.setHeader('Content-Type', 'application/json; charset=utf-8');
					res.end('{"error":"Invalid request"}');
				}
			});
		},
	};
}
