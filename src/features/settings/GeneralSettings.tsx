import { Link } from "@tanstack/react-router";
import { Cloud, LogIn, LogOut } from "lucide-react";
import { PasswordPanel } from "@/features/accounts/PasswordPanel";
import { knowledgeService } from "@/services/knowledge.service";
import { supabaseService } from "@/services/supabase.service";
import { useToast } from "@/shared/hooks/useToast";
import { useAuthStore } from "@/store/auth.store";

export function GeneralSettings() {
	const { showToast } = useToast();
	const authConfigured = useAuthStore((state) => state.configured);
	const authSession = useAuthStore((state) => state.session);

	const signOut = async () => {
		try {
			await supabaseService.signOut();
		} catch {
			showToast("Не удалось выйти. Повторите попытку.");
			return;
		}
		await knowledgeService.loadKnowledge();
		showToast("Вы вышли из аккаунта");
	};

	return (
		<>
			{authSession && <PasswordPanel />}
			<section className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
				<div className="min-w-0 rounded-lg border border-border bg-surface p-5">
					<div className="mb-4 flex items-center gap-2 text-lg font-semibold">
						<Cloud size={18} />
						Аккаунт
					</div>

					{authConfigured ? (
						authSession ? (
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="min-w-0 [overflow-wrap:anywhere]">
									<div className="break-all text-sm font-semibold">
										{authSession.user.email}
									</div>
									<div className="mt-1 text-xs text-muted">
										Роли:{" "}
										{authSession.user.access?.roles
											.map((role) => role.name)
											.join(", ") || "Без доступа"}
									</div>
								</div>
								<button
									type="button"
									onClick={signOut}
									className="ui-button ui-button--secondary inline-flex items-center gap-2 border border-border hover:bg-surface-elevated"
								>
									<LogOut size={16} />
									Выйти
								</button>
							</div>
						) : (
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="text-sm text-muted">
									Облачная синхронизация настроена, но вы не вошли в аккаунт.
								</div>
								<Link
									to="/login"
									className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
								>
									<LogIn size={16} />
									Войти
								</Link>
							</div>
						)
					) : (
						<div className="text-sm text-muted">
							SupportOS работает в режиме локального рабочего пространства.
						</div>
					)}
				</div>
			</section>
		</>
	);
}
