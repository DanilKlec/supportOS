import { useQuery } from "@tanstack/react-query";

import { chatwootService } from "@/services/chatwoot.service";

export function ChatPresenceHeartbeat({ userId }: { userId: string }) {
	useQuery({
		queryKey: ["chat-presence-heartbeat", userId],
		queryFn: ({ signal }) => chatwootService.presenceHeartbeat(signal),
		refetchInterval: 25_000,
		refetchIntervalInBackground: true,
		refetchOnReconnect: "always",
		refetchOnWindowFocus: "always",
		retry: false,
	});

	return null;
}
