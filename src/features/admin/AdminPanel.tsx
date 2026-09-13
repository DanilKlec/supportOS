import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { AccountsPanel } from "@/features/accounts/AccountsPanel";
import {
	AdminOverview,
	type OverviewUser,
} from "@/features/accounts/AdminOverview";
import { QualitySignals } from "@/features/productivity/KnowledgeSignals";
import { IntegrationsPanel } from "@/features/spaces/IntegrationsPanel";
import { ProposalWorkflow } from "@/features/spaces/ProposalWorkflow";
import { HealthPage } from "@/routes/health";
import { useAuthStore } from "@/store/auth.store";
import { can, canAdmin } from "../../../shared/access.js";
import { AIControlCenter, type AISection } from "./AIControlCenter";

const sections = [
	["overview", "Обзор", ""],
	["users", "Пользователи", "users.manage"],
	["roles", "Роли и права", "roles.manage"],
	["qc", "QC и контент", "knowledge.write"],
	["knowledge", "AI · Knowledge", "ai.train"],
	["rules", "AI · Rules", "ai.rules"],
	["projects", "AI · Projects", "ai.train"],
	["glossary", "AI · Glossary", "ai.train"],
	["playground", "AI · Playground", "ai.playground"],
	["tests", "AI · Tests", "ai.tests"],
	["feedback", "AI · Feedback", "ai.train"],
	["integrations", "Интеграции", "technical"],
	["audit", "Аудит", "users.manage"],
	["system", "Система", "technical"],
] as const;
export function AdminPanel() {
	const [selectedUser, setSelectedUser] = useState<OverviewUser>();
	const [quality, setQuality] = useState(false);
	const user = useAuthStore((s) => s.session?.user),
		navigate = useNavigate(),
		hash = useRouterState({ select: (s) => s.location.hash });
	if (!canAdmin(user?.access))
		return <p className="p-6">Нет доступа к Admin Panel.</p>;
	const available = sections.filter(
		([, , permission]) => !permission || can(user?.access, permission),
	);
	const tab = available.some(([id]) => id === hash) ? hash : "overview";
	const select = (id: string) => {
		void navigate({ to: "/admin", hash: id });
	};
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
			<nav
				aria-label="Admin Panel"
				className="flex shrink-0 gap-1 overflow-auto border-b border-border bg-surface p-3 md:w-52 md:flex-col md:border-b-0 md:border-r"
			>
				<h1 className="hidden px-3 py-2 font-semibold md:block">Admin Panel</h1>
				{available.map(([id, label]) => (
					<button
						type="button"
						key={id}
						aria-current={tab === id ? "page" : undefined}
						className="min-h-10 shrink-0 rounded-lg px-3 text-left text-sm aria-[current=page]:bg-accent/10"
						onClick={() => select(id)}
					>
						{label}
					</button>
				))}
			</nav>
			<main className="min-w-0 flex-1 overflow-auto p-4 lg:p-6">
				{tab === "overview" && can(user?.access, "users.manage") && (
					<AdminOverview
						onUser={(u) => {
							setSelectedUser(u);
							select("users");
						}}
						onAudit={() => select("audit")}
					/>
				)}
				{tab === "overview" && !can(user?.access, "users.manage") && (
					<p>Выберите доступный раздел администрирования слева.</p>
				)}
				{["users", "roles", "audit"].includes(tab) && (
					<AccountsPanel
						key={tab}
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
				{tab === "qc" && (
					<>
						<h2 className="mb-4 text-xl font-semibold">QC и контент</h2>
						<div className="mb-3 flex gap-2">
							<button
								type="button"
								className="space-tab"
								aria-pressed={!quality}
								onClick={() => setQuality(false)}
							>
								Очередь, feedback и пробелы знаний
							</button>
							<button
								type="button"
								className="space-tab"
								aria-pressed={quality}
								onClick={() => setQuality(true)}
							>
								Качество и устаревшие материалы
							</button>
						</div>
						{quality ? (
							<HealthPage />
						) : (
							<>
								<ProposalWorkflow />
								<QualitySignals />
							</>
						)}
					</>
				)}
				{tab === "integrations" && <IntegrationsPanel />}
				{tab === "system" && (
					<>
						<h2 className="text-xl font-semibold">Система</h2>
						<p className="my-3 text-sm">
							Сервер проверяет доступ по текущим разрешениям. Ключи провайдеров
							хранятся в серверной конфигурации.
						</p>
						<IntegrationsPanel />
					</>
				)}
			</main>
		</div>
	);
}
