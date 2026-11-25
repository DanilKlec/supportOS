const HEARTBEAT_INTERVAL = 25_000;
const HEARTBEAT_RETRY = 8_000;

export function sendPresenceHeartbeat(token: string) {
	return fetch("/api/chatwoot?action=presence-heartbeat", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	});
}

export function runPresenceHeartbeat(send: () => Promise<boolean>) {
	let timer: ReturnType<typeof setTimeout>;
	let stopped = false;
	let sending = false;
	let lastSent = -Infinity;

	async function tick() {
		if (stopped || sending) return;
		clearTimeout(timer);
		sending = true;
		lastSent = Date.now();
		const ok = await send().catch(() => false);
		sending = false;
		if (!stopped)
			timer = setTimeout(tick, ok ? HEARTBEAT_INTERVAL : HEARTBEAT_RETRY);
	}

	return {
		wake() {
			if (Date.now() - lastSent >= 3_000) void tick();
		},
		stop() {
			stopped = true;
			clearTimeout(timer);
		},
	};
}
