import { ActiveSessionsPanel } from "@/features/accounts/ActiveSessionsPanel";
import { AuthenticatorPanel } from "@/features/accounts/AuthenticatorPanel";
import { LoginHistoryPanel } from "@/features/accounts/LoginHistoryPanel";

export function SecuritySettings() {
	return (
		<>
			<ActiveSessionsPanel />
			<AuthenticatorPanel />
			<LoginHistoryPanel />
		</>
	);
}
