// Keep the webhook's original bytes and share one Vercel function with the proxy.
export const config = { api: { bodyParser: false } };
export { default } from '../../server/chatwoot/_http.js';
