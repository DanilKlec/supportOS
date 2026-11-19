import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { mailService } from "@/services/mail.service";
import { useToast } from "@/shared/hooks/useToast";
import { useAuthStore } from "@/store/auth.store";

const notificationEvent = "supportos-mail-notification-change";

function readingEnabled(key: string) {
	try {
		return key !== "" && localStorage.getItem(key) === "true";
	} catch {
		return false;
	}
}

export function useMailNotificationPreference(userId?: string) {
	const key = userId ? `supportos:mail:notifications:${userId}` : "";
	const [enabled, setEnabled] = useState(() => readingEnabled(key));
	useEffect(() => {
		const update = () => setEnabled(readingEnabled(key));
		update();
		window.addEventListener(notificationEvent, update);
		window.addEventListener("storage", update);
		return () => {
			window.removeEventListener(notificationEvent, update);
			window.removeEventListener("storage", update);
		};
	}, [key]);
	const change = (value: boolean) => {
		if (!key) return;
		try {
			localStorage.setItem(key, String(value));
		} catch {
			return;
		}
		window.dispatchEvent(new Event(notificationEvent));
	};
	return [enabled, change] as const;
}

export function MailNotifications() {
	const userId = useAuthStore((state) => state.session?.user.id);
	const [enabled] = useMailNotificationPreference(userId);
	return userId && enabled ? (
		<MailNotificationsSession key={userId} userId={userId} />
	) : null;
}

function MailNotificationsSession({ userId }: { userId: string }) {
	const { showToast } = useToast();
	const baseline = useRef(new Map<string, number>());
	const list = useQuery({
		queryKey: ["mail", "list", userId],
		queryFn: ({ signal }) => mailService.list(signal),
		staleTime: 15_000,
		refetchInterval: 75_000,
		retry: false,
	});
	const hasMail = Boolean(list.data?.mailboxes.length);
	const stats = useQuery({
		queryKey: ["mail", "stats", userId],
		queryFn: ({ signal }) => mailService.stats(signal),
		enabled: hasMail,
		refetchInterval: 75_000,
		refetchIntervalInBackground: true,
		staleTime: 30_000,
		retry: false,
	});
	useEffect(() => {
		const arrivals: string[] = [];
		for (const status of stats.data?.stats ?? []) {
			const box = list.data?.mailboxes.find(({ id }) => id === status.id);
			if (!box || status.unread === null) continue;
			const previous = baseline.current.get(status.id);
			const latest = status.recentDate ?? 0;
			if (previous !== undefined && latest > previous && status.unread > 0)
				arrivals.push(box.address);
			baseline.current.set(status.id, Math.max(previous ?? 0, latest));
		}
		if (!arrivals.length) return;
		const text =
			arrivals.length === 1
				? `Новое письмо в ${arrivals[0]}`
				: `Новая почта в ${arrivals.length} ящиках`;
		if (document.visibilityState === "visible") showToast(text);
		if (
			typeof Notification !== "undefined" &&
			Notification.permission === "granted"
		) {
			try {
				const alert = new Notification("SupportOS", {
					body: text,
					tag: "supportos-mail",
				});
				alert.onclick = () => {
					window.focus();
					window.location.assign("/mail");
					alert.close();
				};
			} catch {
				/* Browser notifications are optional. */
			}
		}
	}, [list.data, stats.data, showToast]);
	return null;
}
