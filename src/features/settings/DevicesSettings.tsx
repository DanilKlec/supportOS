import { ActiveSessionsPanel } from "@/features/accounts/ActiveSessionsPanel";
import { LoginHistoryPanel } from "@/features/accounts/LoginHistoryPanel";

export function DevicesSettings() {
	return (
		<>
			<ActiveSessionsPanel />
			<LoginHistoryPanel />
		</>
	);
}
