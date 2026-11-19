export default function callback(req, res) {
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('Referrer-Policy', 'no-referrer');
	if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
	const params = new URL(req.url, 'http://localhost').searchParams;
	const code = params.get('code');
	const state = params.get('state');
	const target = code && state && code.length <= 2048 && state.length <= 1800 ? new URLSearchParams({ mail_code: code, mail_state: state })
		: new URLSearchParams({ mail_error: 'denied' });
	res.setHeader('Location', `/mail#${target}`);
	res.statusCode = 303;
	return res.end();
}
