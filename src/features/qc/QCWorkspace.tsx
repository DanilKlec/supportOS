import { useNavigate, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { LoadingState } from "@/components/ui";
import type { AISection } from "@/features/admin/AIControlCenter";
import { OperationsWorkspace } from "@/features/operations/OperationsWorkspace";
import { qcHashRedirects, qcSections } from "@/features/operations/sections";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
import {
	materialTabs,
	problemTabs,
	qcDestination,
	qualityTabs,
} from "./navigation";
import {
	AIQuality,
	DuplicateKnowledge,
	KnowledgeHistory,
	LanguageQuality,
	QCOverview,
	ReviewInbox,
} from "./QualityPages";

// Keep related QC overview/review pages together; defer only whole workflows.
const AIControlCenter = lazy(() =>
	import("@/features/admin/AIControlCenter").then((module) => ({
		default: module.AIControlCenter,
	})),
);
const SharedBindsPage = lazy(() =>
	import("@/features/shared-binds/SharedBindsPage").then((module) => ({
		default: module.SharedBindsPage,
	})),
);
const ProjectEmailsPage = lazy(() =>
	import("@/features/project-emails/ProjectEmailsPage").then((module) => ({
		default: module.ProjectEmailsPage,
	})),
);
const DepositBonusesPage = lazy(() =>
	import("@/features/bonuses/DepositBonusesPage").then((module) => ({
		default: module.DepositBonusesPage,
	})),
);

const aiSections: Record<string, AISection> = {
	knowledge: "knowledge",
	rules: "rules",
	instructions: "projects",
	glossary: "glossary",
	playground: "playground",
	tests: "tests",
	feedback: "feedback",
};
export function QCWorkspace() {
	const access = useAuthStore((s) => s.session?.user.access);
	const hash = useRouterState({ select: (s) => s.location.hash });
	const navigate = useNavigate();
	const hashId = hash.replace(/^#/, "").split("?")[0];
	const redirectedHash = hashId ? qcHashRedirects[hashId] : undefined;
	const normalizedHash = redirectedHash ?? hash;
	const destination = qcDestination(
		normalizedHash ||
			qcSections.find((s) => canAccessPage(access, "/qc", s.id))?.id ||
			"overview",
	);
	useEffect(() => {
		if (!hash || !redirectedHash) return;
		void navigate({ to: "/qc", hash: redirectedHash, replace: true });
	}, [hash, navigate, redirectedHash]);
	const select = (id: string) => {
		if (canAccessPage(access, "/qc", id))
			void navigate({ to: "/qc", hash: id });
	};
	const tabs = (
		destination.section === "materials"
			? materialTabs
			: destination.section === "problems"
				? problemTabs
				: destination.section === "quality"
					? qualityTabs
					: []
	).filter((t) => canAccessPage(access, "/qc", t.id));
	const isContainer =
		!normalizedHash || ["materials", "problems"].includes(normalizedHash);
	const active =
		isContainer &&
		tabs.length > 0 &&
		!tabs.some((t) => t.id === destination.tab)
			? tabs[0]?.id
			: destination.tab;
	const materialDescription = [
		"knowledge",
		"rules",
		"instructions",
		"glossary",
	].includes(active ?? "")
		? "AI знания, правила ответов и инструкции проектов — дополнительные управляющие знания для Помощника. Не дублируйте здесь всю библиотеку рабочих материалов."
		: "Материалы — фактические рабочие источники команды: бинды, почты и welcome-бонусы.";
	let content: React.ReactNode;
	if (!active || !canAccessPage(access, "/qc", active))
		content = <p role="alert">Нет доступа к этому инструменту.</p>;
	else if (aiSections[active])
		content = (
			<AIControlCenter
				section={aiSections[active]}
				onSection={(id) => select(id === "projects" ? "instructions" : id)}
			/>
		);
	else if (destination.section === "overview")
		content = <QCOverview onSelect={select} />;
	else if (destination.section === "inbox")
		content = (
			<ReviewInbox
				key={hash}
				initialFilter={destination.filter}
				initialItem={destination.item}
			/>
		);
	else if (active === "binds") content = <SharedBindsPage />;
	else if (active === "emails") content = <ProjectEmailsPage management />;
	else if (active === "bonuses") content = <DepositBonusesPage management />;
	else if (active === "duplicates") content = <DuplicateKnowledge />;
	else if (active === "languages") content = <LanguageQuality />;
	else if (active === "quality") content = <AIQuality />;
	else if (active === "history") content = <KnowledgeHistory />;
	return (
		<OperationsWorkspace
			area="qc"
			sections={qcSections}
			active={destination.section}
			onSelect={select}
		>
			{tabs.length > 0 && (
				<>
					<nav className="qc-tabs" aria-label="Инструменты раздела">
						{tabs.map((t) => (
							<button
								key={t.id}
								type="button"
								className="space-tab"
								aria-pressed={active === t.id}
								onClick={() => select(t.id)}
							>
								{t.label}
							</button>
						))}
					</nav>
					<label className="ui-field qc-tab-select">
						Инструмент
						<select
							className="ui-input"
							value={active}
							onChange={(e) => select(e.target.value)}
						>
							{tabs.map((t) => (
								<option key={t.id} value={t.id}>
									{t.label}
								</option>
							))}
						</select>
					</label>
					{destination.section === "materials" && (
						<p className="text-sm text-muted">{materialDescription}</p>
					)}
				</>
			)}
			<Suspense fallback={<LoadingState message="Загружаем раздел…" />}>
				{content}
			</Suspense>
		</OperationsWorkspace>
	);
}
