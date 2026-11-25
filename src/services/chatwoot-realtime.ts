import { createClient } from "@supabase/supabase-js";

export type ChatwootRealtimeStatus =
	| "SUBSCRIBED"
	| "CHANNEL_ERROR"
	| "TIMED_OUT"
	| "CLOSED";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (
	import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
	import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

export function subscribeToChatwootEvents(
	accessToken: string,
	onEvent: () => void,
	onStatus: (status: ChatwootRealtimeStatus) => void,
	coaching?: {
		userId: string;
		onNote: () => void;
		onStatus: (status: ChatwootRealtimeStatus) => void;
	},
) {
	if (!url || !key) {
		onStatus("CHANNEL_ERROR");
		coaching?.onStatus("CHANNEL_ERROR");
		return () => undefined;
	}
	const client = createClient(url, key, {
		realtime: { worker: typeof Worker !== "undefined" },
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
		},
	});
	let disposed = false;
	const channel = client
		.channel("chatwoot:updates", { config: { private: true } })
		.on("broadcast", { event: "chatwoot_event" }, onEvent);
	const coachingChannel =
		coaching &&
		client
			.channel(`chatwoot:coaching:${coaching.userId}`, {
				config: { private: true },
			})
			.on("broadcast", { event: "coaching_note" }, coaching.onNote);
	const report = (
		status: string,
		listener: (value: ChatwootRealtimeStatus) => void,
	) => {
		if (
			!disposed &&
			["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)
		)
			listener(status as ChatwootRealtimeStatus);
	};
	void client.realtime
		.setAuth(accessToken)
		.then(() => {
			if (disposed) return;
			channel.subscribe((status) => report(status, onStatus));
			if (coachingChannel && coaching)
				coachingChannel.subscribe((status) =>
					report(status, coaching.onStatus),
				);
		})
		.catch(() => {
			report("CHANNEL_ERROR", onStatus);
			if (coaching) report("CHANNEL_ERROR", coaching.onStatus);
		});
	return () => {
		disposed = true;
		void client.removeChannel(channel);
		if (coachingChannel) void client.removeChannel(coachingChannel);
	};
}
