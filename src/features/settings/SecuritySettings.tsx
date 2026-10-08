import { ActiveSessionsPanel } from "@/features/accounts/ActiveSessionsPanel";
import { LoginHistoryPanel } from "@/features/accounts/LoginHistoryPanel";
import { TelegramLinkPanel } from "@/features/accounts/TelegramLinkPanel";

export function SecuritySettings() {
	return (
		<>
			<ActiveSessionsPanel />
			<TelegramLinkPanel />
			<LoginHistoryPanel />
		</>
	);
}
