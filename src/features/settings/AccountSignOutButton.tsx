import { LogOut } from "lucide-react";
import { useState } from "react";
import { knowledgeService } from "@/services/knowledge.service";
import { supabaseService } from "@/services/supabase.service";
import { useToast } from "@/shared/hooks/useToast";

export function AccountSignOutButton() {
	const { showToast } = useToast();
	const [busy, setBusy] = useState(false);
	async function signOut() {
		setBusy(true);
		try {
			await supabaseService.signOut();
		} catch {
			showToast("Не удалось выйти. Повторите попытку.");
			setBusy(false);
			return;
		}
		await knowledgeService.loadKnowledge();
		showToast("Вы вышли из аккаунта");
		setBusy(false);
	}
	return (
		<button
			type="button"
			className="account-signout"
			disabled={busy}
			onClick={() => void signOut()}
		>
			<LogOut size={16} aria-hidden="true" />
			{busy ? "Выходим…" : "Выйти"}
		</button>
	);
}
