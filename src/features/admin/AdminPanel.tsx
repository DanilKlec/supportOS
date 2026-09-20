import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
	BookOpen,
	FlaskConical,
	Folder,
	History,
	KeyRound,
	Languages,
	LayoutDashboard,
	ListChecks,
	MessageSquare,
	ShieldCheck,
	SlidersHorizontal,
	Users,
} from "lucide-react";
import { useState } from "react";
import { AccountsPanel } from "@/features/accounts/AccountsPanel";
import {
	AdminOverview,
	type OverviewUser,
} from "@/features/accounts/AdminOverview";

import { useAuthStore } from "@/store/auth.store";
import { canAccessPage, canAdmin } from "../../../shared/access.js";
import { AIControlCenter, type AISection } from "./AIControlCenter";

const sectionIcons = {
	overview: LayoutDashboard,
	users: Users,
	roles: KeyRound,
	audit: History,
	knowledge: BookOpen,
	rules: SlidersHorizontal,
	projects: Folder,
	glossary: Languages,
	playground: FlaskConical,
	tests: ListChecks,
	feedback: MessageSquare,
};
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
		<div className="admin-layout flex min-h-0 flex-1 overflow-hidden">
			<aside className="admin-sidebar">
				<div className="admin-sidebar-heading">
					<ShieldCheck size={20} />
					<div>
						<h1>Администрирование</h1>
						<p>Команда и рабочая среда</p>
					</div>
				</div>
				<nav aria-label="Администрирование">
					{[
						{
							title: "Управление",
							ids: ["overview", "users", "roles", "audit"],
						},
						{
							title: "AI и база знаний",
							ids: [
								"knowledge",
								"rules",
								"projects",
								"glossary",
								"playground",
								"tests",
								"feedback",
							],
						},
					].map((group) => {
						const entries = available.filter(([id]) => group.ids.includes(id));
						return (
							entries.length > 0 && (
								<section key={group.title}>
									<h2>{group.title}</h2>
									{entries.map(([id, label]) => {
										const Icon = sectionIcons[id];
										return (
											<button
												key={id}
												type="button"
												className="admin-nav-item"
												aria-current={tab === id ? "page" : undefined}
												onClick={() => select(id)}
											>
												<Icon size={17} />
												<span>{label.replace("AI · ", "")}</span>
											</button>
										);
									})}
								</section>
							)
						);
					})}
				</nav>
			</aside>
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
