import { MessageSquareText } from "lucide-react";
import { useWorkspaceStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";

export function ComposerLauncher() {
	const access = useAuthStore((s) => s.session?.user.access);
	const visible = useWorkspaceStore((s) => s.layout.showTranslatorWidget);
	if (!visible || !can(access, "composer.use")) return null;
	return (
		<button
			type="button"
			aria-label="Помощник ответа"
			title="Подготовить, перевести или проверить ответ"
			className="shell-button"
			onClick={() => window.dispatchEvent(new Event("supportos:open-composer"))}
		>
			<MessageSquareText size={17} />
			<span className="hidden xl:inline">Помощник</span>
		</button>
	);
}
