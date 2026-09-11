import { createFileRoute } from "@tanstack/react-router";
import { UsersRound, ShieldCheck } from "lucide-react";
import { AccountsPanel } from "@/features/accounts/AccountsPanel";
export const Route = createFileRoute("/settings/users")({
	component: UsersPage,
});
function UsersPage() {
	return (
		<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto">
			<div className="mx-auto max-w-7xl px-4 py-7 sm:px-8 lg:py-10">
				<div className="mb-8 flex items-start gap-4">
					<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent">
						<UsersRound size={23} />
					</span>
					<div>
						<p className="text-[11px] font-medium uppercase tracking-[.16em] text-accent">
							Команда и доступы
						</p>
						<h1 className="mt-1 text-3xl font-semibold tracking-tight">
							Реестр пользователей
						</h1>
						<p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
							Личные аккаунты, роли и права сотрудников. Управляйте командой и
							отслеживайте изменения в одном разделе.
						</p>
					</div>
				</div>
				<AccountsPanel standalone />
				<div className="mt-5 flex items-center gap-2 text-xs text-muted">
					<ShieldCheck size={15} />
					Изменения ролей и доступов сохраняются в журнале.
				</div>
			</div>
		</div>
	);
}
