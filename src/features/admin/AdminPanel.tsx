import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { AccountsPanel } from "@/features/accounts/AccountsPanel";
import {
	AdminOverview,
	type OverviewUser,
} from "@/features/accounts/AdminOverview";
import { SectionNavigation } from "@/features/spaces/SectionNavigation";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage, canAdmin } from "../../../shared/access.js";
import { AIControlCenter, type AISection } from "./AIControlCenter";

const sections = [
	["overview", "Обзор"],
	["users", "Пользователи"],
	["roles", "Роли и права"],
	["audit", "Аудит"],
	["knowledge", "AI · База знаний"],
	["rules", "AI · Правила"],
	["projects", "AI · Проекты"],
	["glossary", "AI · Глоссарий"],
	["playground", "AI · Проверка ответов"],
	["tests", "AI · Тесты"],
	["feedback", "AI · Обратная связь"],
] as const;
export function AdminPanel() {
	const [selectedUser, setSelectedUser] = useState<OverviewUser>();
	const user = useAuthStore((s) => s.session?.user);
	const navigate = useNavigate();
	const hash = useRouterState({ select: (s) => s.location.hash });
	const available = sections.filter(([id]) =>
		canAccessPage(user?.access, "/admin", id),
	);
	if (!canAdmin(user?.access) || !available.length)
		return <p className="p-6">Нет доступа к администрированию.</p>;
	const tab = available.some(([id]) => id === hash) ? hash : available[0][0];
	const select = (id: string) => {
		if (canAccessPage(user?.access, "/admin", id))
			void navigate({ to: "/admin", hash: id });
	};
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<header className="space-header shrink-0 border-b border-border">
				<h1 className="section-eyebrow">Администрирование</h1>
				<SectionNavigation
					label="Администрирование"
					items={available.map(([id, label]) => ({
						to: "/admin",
						hash: id,
						label,
					}))}
					active={{ to: "/admin", hash: tab, label: tab }}
				/>
			</header>
			<main className="supportos-page-scroll min-w-0 flex-1 overflow-auto py-4 sm:py-6">
				{tab === "overview" && (
					<AdminOverview
						onUser={(u) => {
							setSelectedUser(u);
							select("users");
						}}
						onAudit={() => select("audit")}
					/>
				)}
				{["users", "roles", "audit"].includes(tab) && (
					<AccountsPanel
						key={user?.id + tab}
						standalone
						initialTab={tab as "users" | "roles" | "audit"}
						initialUser={selectedUser}
						embedded
					/>
				)}
				{[
					"knowledge",
					"rules",
					"projects",
					"glossary",
					"playground",
					"tests",
					"feedback",
				].includes(tab) && (
					<AIControlCenter
						key={user?.id}
						section={tab as AISection}
						onSection={select}
					/>
				)}
			</main>
		</div>
	);
}
