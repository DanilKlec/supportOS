import { loadEnv } from 'vite';
import handler from './_http.js';

export function chatwootPlugin() {
	return {
		name: 'supportos-chatwoot-api',
		configureServer(server) {
			const env = loadEnv(server.config.mode, server.config.root, '');
			for (const [key, value] of Object.entries(env)) {
				if (/^CHATWOOT_/.test(key) && process.env[key] === undefined) process.env[key] = value;
			}
			server.middlewares.use(async (req, res, next) => {
				const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
				if (pathname !== '/api/chatwoot' && pathname !== '/api/chatwoot/webhook') return next();
				return handler(req, res);
			});
		},
	};
}
