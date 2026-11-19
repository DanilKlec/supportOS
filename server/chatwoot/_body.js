export async function readBytes(req, limit) {
	// Vercel's req.body getter may parse JSON and consume the original stream.
	// Only use already provided values when they still contain the original bytes.
	const supplied = req.rawBody ?? Object.getOwnPropertyDescriptor(req, 'body')?.value;
	if (typeof supplied === 'string' || Buffer.isBuffer(supplied)) {
		const bytes = Buffer.isBuffer(supplied) ? supplied : Buffer.from(supplied);
		if (bytes.length > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
		return bytes;
	}
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += bytes.length;
		if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 });
		chunks.push(bytes);
	}
	return Buffer.concat(chunks);
}
