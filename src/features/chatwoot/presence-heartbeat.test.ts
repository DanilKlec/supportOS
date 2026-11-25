import { afterEach, expect, test, vi } from "vitest";
import {
	runPresenceHeartbeat,
	sendPresenceHeartbeat,
} from "./presence-heartbeat";

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test("heartbeats keep running without focus events and recover from a failed request", async () => {
	vi.useFakeTimers();
	const send = vi
		.fn(async () => true)
		.mockRejectedValueOnce(new Error("offline"));
	const heartbeat = runPresenceHeartbeat(send);
	heartbeat.wake();
	heartbeat.wake();
	expect(send).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(8_000);
	expect(send).toHaveBeenCalledTimes(2);
	await vi.advanceTimersByTimeAsync(25_000 * 4);
	expect(send).toHaveBeenCalledTimes(6);
	heartbeat.stop();
	await vi.advanceTimersByTimeAsync(90_000);
	expect(send).toHaveBeenCalledTimes(6);
});

test("the worker sends the current token only to the presence endpoint", async () => {
	const fetch = vi.fn(async () => new Response(null));
	vi.stubGlobal("fetch", fetch);
	await sendPresenceHeartbeat("test-token");
	expect(fetch).toHaveBeenCalledWith(
		"/api/chatwoot?action=presence-heartbeat",
		{
			method: "POST",
			headers: { Authorization: "Bearer test-token" },
			redirect: "error",
			signal: expect.any(AbortSignal),
		},
	);
});
