import { useState } from "react";
import { Button, Panel } from "@/components/ui";
import { confirmedAccountAction } from "@/services/critical-confirmation.service";
import { useAuthStore } from "@/store/auth.store";
import { CriticalConfirmationModal } from "./CriticalConfirmationModal";

export function TelegramLinkPanel() {
	const sessionId = useAuthStore((s) => s.session?.sessionId);
	const [action, setAction] = useState<
		"telegram.unlink" | "telegram.change" | null
	>(null);
	return (
		<Panel className="min-w-0 p-4 sm:p-5">
			<h3 className="text-lg font-semibold">Привязка Telegram</h3>
			<p className="mt-2 text-sm text-muted">
				Отключение и смена требуют подтверждения в текущем Telegram. Это не
				отключает обязательную проверку входа: новую привязку подтвердит
				администратор.
			</p>
			<div className="ui-actions mt-4 gap-2">
				<Button
					variant="secondary"
					disabled={!sessionId}
					onClick={() => setAction("telegram.change")}
				>
					Сменить Telegram
				</Button>
				<Button
					variant="secondary"
					disabled={!sessionId}
					onClick={() => setAction("telegram.unlink")}
				>
					Отключить привязку
				</Button>
			</div>
			{action && (
				<CriticalConfirmationModal
					request={{ action, payload: {} }}
					onClose={() => setAction(null)}
					onExecute={async (proof) => {
						await confirmedAccountAction(
							action === "telegram.change"
								? "telegram-change"
								: "telegram-unlink",
							proof,
						);
						// Re-enter the existing link/2FA gate; never create a parallel linking flow.
						window.location.reload();
					}}
				/>
			)}
		</Panel>
	);
}
