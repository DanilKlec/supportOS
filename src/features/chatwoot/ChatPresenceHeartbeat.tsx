import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabaseService } from "@/services/supabase.service";
import { useAuthStore } from "@/store/auth.store";
import { assignedChatsKey } from "./chat-alerts";
import {
	runPresenceHeartbeat,
	sendPresenceHeartbeat,
} from "./presence-heartbeat";

export function ChatPresenceHeartbeat({ userId }: { userId: string }) {
	const client = useQueryClient();
	useEffect(() => {
		let worker: Worker | undefined;
		let fallback: ReturnType<typeof runPresenceHeartbeat> | undefined;
		let fallbackPoll: number | undefined;

		const accessToken = () => {
			const session = useAuthStore.getState().session;
			return session?.user.id === userId ? session.accessToken : "";
		};
		const updateToken = () => worker?.postMessage(accessToken());
		const refreshChats = () => {
			if (document.hidden && accessToken())
				void client.invalidateQueries(
					{ queryKey: assignedChatsKey },
					{ cancelRefetch: false },
				);
		};
		const wake = () => {
			updateToken();
			fallback?.wake();
		};
		const startFallback = () => {
			worker?.terminate();
			worker = undefined;
			fallback ??= runPresenceHeartbeat(async () => {
				if (!accessToken()) return false;
				const token = await supabaseService.getAccessToken();
				return (
					token === accessToken() && (await sendPresenceHeartbeat(token)).ok
				);
			});
			fallbackPoll ??= window.setInterval(refreshChats, 8_000);
			wake();
		};
		try {
			worker = new Worker(
				new URL("./presence-heartbeat.worker.ts", import.meta.url),
				{
					type: "module",
				},
			);
			worker.onerror = startFallback;
			worker.onmessage = ({
				data,
			}: MessageEvent<"refresh-auth" | "refresh-chats">) => {
				if (data === "refresh-chats") {
					refreshChats();
					return;
				}
				// The existing Auth client owns refresh-token rotation across tabs.
				if (accessToken())
					void supabaseService.getAccessToken().then(updateToken, () => {});
			};
			wake();
		} catch {
			startFallback();
		}
		const unsubscribe = useAuthStore.subscribe((current, previous) => {
			if (current.session?.accessToken !== previous.session?.accessToken)
				wake();
		});
		document.addEventListener("visibilitychange", wake);
		window.addEventListener("online", wake);
		window.addEventListener("pageshow", wake);
		return () => {
			unsubscribe();
			document.removeEventListener("visibilitychange", wake);
			window.removeEventListener("online", wake);
			window.removeEventListener("pageshow", wake);
			worker?.terminate();
			worker = undefined;
			fallback?.stop();
			window.clearInterval(fallbackPoll);
		};
	}, [client, userId]);

	return null;
}
