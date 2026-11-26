import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { chatwootService } from "@/services/chatwoot.service";
import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/shared/hooks/useToast";
import { subscribeToChatwootEvents } from "@/services/chatwoot-realtime";
import { assignedChats, assignedChatsKey, CHAT_SOUND_PREFERENCE, getChatAlerts } from "./chat-alerts";

function soundEnabled() {
	try {
		return localStorage.getItem(CHAT_SOUND_PREFERENCE) !== "off";
	} catch {
		return true;
	}
}

function playSound(context: AudioContext | null) {
	if (context?.state !== "running" || !soundEnabled()) return;
	const tone = context.createOscillator();
	const gain = context.createGain();
	const now = context.currentTime;
	tone.frequency.setValueAtTime(740, now);
	tone.frequency.setValueAtTime(988, now + 0.11);
	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
	gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
	tone.connect(gain);
	gain.connect(context.destination);
	tone.start();
	tone.stop(now + 0.29);
}

function showNotification(count: number, assignment: boolean) {
	if (!("Notification" in window) || Notification.permission !== "granted")
		return;
	try {
		const alert = new Notification(
			count > 1
				? "Новые события в чатах"
				: assignment
					? "Вам назначен диалог"
					: "Новое сообщение в чате",
			{
				body:
					count > 1
						? `Диалогов с новыми событиями: ${count}`
						: "Откройте чаты в SupportOS",
				icon: "/logo192.png",
				tag: "supportos-chat",
			},
		);
		alert.onclick = () => {
			window.focus();
			if (window.location.pathname !== "/inbox")
				window.location.assign("/inbox");
			alert.close();
		};
	} catch {
		/* System notifications may be disabled by the browser or OS. */
	}
}

export function ChatNotifications({
	userId,
	chatWorkspaceOpen,
}: {
	userId: string;
	chatWorkspaceOpen: boolean;
}) {
	const email = useAuthStore((state) => state.session?.user.email);
	const accessToken = useAuthStore((state) => state.session?.accessToken);
	const client = useQueryClient();
	const { showToast } = useToast();
	const audio = useRef<AudioContext | null>(null);
	const baseline = useRef<Map<number, number | undefined> | null>(null);
	const health = useQuery({
		queryKey: ["chatwoot", "health", email],
		queryFn: chatwootService.health,
		retry: false,
	});
	const snapshots = useQuery({
		queryKey: assignedChatsKey,
		queryFn: () => chatwootService.conversations(assignedChats),
		enabled: health.data?.configured === true,
		refetchInterval: 8_000,
		refetchIntervalInBackground: true,
		refetchOnWindowFocus: "always",
		refetchOnReconnect: "always",
		retry: false,
	});

	useEffect(() => {
		if (chatWorkspaceOpen || !accessToken || !health.data?.configured) return;
		let timer: number | undefined;
		const refresh = () => {
			if (timer !== undefined) return;
			timer = window.setTimeout(() => {
				timer = undefined;
				void client.invalidateQueries(
					{ queryKey: assignedChatsKey },
					{ cancelRefetch: false },
				);
			}, 0);
		};
		const unsubscribe = subscribeToChatwootEvents(
			accessToken,
			refresh,
			(status) => {
				if (status === "SUBSCRIBED") refresh();
			},
			{
				userId,
				onAssignment: () => void client.invalidateQueries({ queryKey: assignedChatsKey }),
				onStatus: (status) => {
					if (status === "SUBSCRIBED") refresh();
				},
			},
		);
		return () => {
			window.clearTimeout(timer);
			unsubscribe();
		};
	}, [accessToken, chatWorkspaceOpen, client, health.data?.configured, userId]);

	useEffect(() => {
		const unlock = () => {
			if (!soundEnabled() || !window.AudioContext) return;
			try {
				audio.current ??= new AudioContext();
			} catch {
				return;
			}
			if (audio.current.state !== "running")
				void audio.current.resume().catch(() => undefined);
		};
		window.addEventListener("pointerdown", unlock, true);
		window.addEventListener("keydown", unlock, true);
		return () => {
			window.removeEventListener("pointerdown", unlock, true);
			window.removeEventListener("keydown", unlock, true);
			void audio.current?.close().catch(() => undefined);
			audio.current = null;
		};
	}, []);

	useEffect(() => {
		if (!snapshots.data) return;
		const rows = snapshots.data.payload ?? snapshots.data.data?.payload ?? [];
		const { next, alerts } = getChatAlerts(baseline.current, rows, Date.now());
		baseline.current = next;
		if (alerts.length === 0) return;
		const notify = () => {
			if (useAuthStore.getState().session?.user.id !== userId) return;
			const now = Date.now();
			const prefix = `supportos:chat-alerts:${userId}`;
			let fresh = alerts;
			try {
				const seen: Record<string, number> = JSON.parse(
					localStorage.getItem(prefix) || "{}",
				);
				fresh = alerts.filter(
					(event) => (seen[event.key] ?? 0) < now - 120_000,
				);
				for (const key of Object.keys(seen))
					if (seen[key] < now - 120_000) delete seen[key];
				for (const event of fresh) seen[event.key] = now;
				localStorage.setItem(prefix, JSON.stringify(seen));
			} catch {
				/* In-memory detection still works without storage. */
			}
			if (fresh.length === 0) return;
			playSound(audio.current);
			if (document.hidden || !document.hasFocus()) {
				showNotification(fresh.length, fresh[0].assignment);
			} else {
				showToast(fresh.length > 1 ? `Новые события в чатах · ${fresh.length}` : fresh[0].assignment ? "Вам назначен диалог" : "Новое сообщение в чате");
			}
		};
		if (navigator.locks)
			void navigator.locks
				.request("supportos:chat-alerts", notify)
				.catch(() => undefined);
		else notify();
	}, [showToast, snapshots.data, userId]);
	return null;
}
