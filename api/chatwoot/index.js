// Server-only Chatwoot proxy. Keep API credentials out of the browser bundle.
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };
export { default } from '../../server/chatwoot/index.js';
