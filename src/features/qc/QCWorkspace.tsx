import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
	AIControlCenter,
	type AISection,
} from "@/features/admin/AIControlCenter";
import {
	OperationsWorkspace,
	Panel,
	Unavailable,
} from "@/features/operations/OperationsWorkspace";
import { qcSections } from "@/features/operations/sections";
import { SharedBindsPage } from "@/features/shared-binds/SharedBindsPage";
import { ProposalWorkflow } from "@/features/spaces/ProposalWorkflow";
import { operationsCapabilities } from "@/services/operations-capabilities";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage } from "../../../shared/access.js";
import {
	AIQuality,
	DuplicateKnowledge,
	KnowledgeHistory,
	LanguageQuality,
	MaterialLifecycle,
	ReviewInbox,
} from "./QualityPages";

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
	const hash = useRouterState({ select: (s) => s.location.hash }),
		navigate = useNavigate();
	const active =
		hash ||
		qcSections.find((s) => canAccessPage(access, "/qc", s.id))?.id ||
		"overview";
	const select = (id: string) => {
		if (canAccessPage(access, "/qc", id))
			void navigate({ to: "/qc", hash: id });
	};
	let content: React.ReactNode;
	if (aiSections[active])
		content = (
			<AIControlCenter
				section={aiSections[active]}
				onSection={(id) => select(id === "projects" ? "instructions" : id)}
			/>
		);
	else if (active === "overview" || active === "inbox" || active === "gaps")
		content = (
			<ReviewInbox
				key={active}
				overview={active === "overview"}
				gapsOnly={active === "gaps"}
			/>
		);
	else if (active === "proposals") content = <ProposalWorkflow />;
	else if (active === "materials")
		content = (
			<div className="ops-stack">
				<SharedBindsPage />
				<MaterialLifecycle />
			</div>
		);
	else if (active === "duplicates") content = <DuplicateKnowledge />;
	else if (active === "languages") content = <LanguageQuality />;
	else if (active === "quality") content = <AIQuality />;
	else if (active === "history") content = <KnowledgeHistory />;
	else {
		const kind =
			active === "reviews"
				? "schedules"
				: active === "trends"
					? "trends"
					: active === "conflicts"
						? "conflicts"
						: "candidates";
		const state = operationsCapabilities[kind]();
		content = (
			<Panel
				title={
					active === "candidates"
						? "Learning candidates"
						: active === "reviews"
							? "Review policies"
							: active === "trends"
								? "Historical quality"
								: "Knowledge conflicts"
				}
			>
				<Unavailable
					message={
						state.state === "not-configured" ? state.reason : "Нет записей."
					}
				/>
				{active === "candidates" && (
					<div className="ops-note">
						Кандидат будет содержать источники, доказательства, текущий и
						предлагаемый текст, риск и уверенность. Публикация до подключения
						серверного процесса недоступна.
					</div>
				)}
			</Panel>
		);
	}
	return (
		<OperationsWorkspace
			area="qc"
			sections={qcSections}
			active={active}
			onSelect={select}
		>
			{[
				"materials",
				"knowledge",
				"rules",
				"instructions",
				"quality",
				"playground",
				"tests",
				"feedback",
			].includes(active) && (
				<nav className="ops-toolbar" aria-label="Инструменты качества">
					{qcSections
						.filter(
							(s) =>
								(s.id ===
									(["materials", "knowledge", "rules", "instructions"].includes(
										active,
									)
										? "materials"
										: "quality") ||
									s.parent ===
										([
											"materials",
											"knowledge",
											"rules",
											"instructions",
										].includes(active)
											? "materials"
											: "quality")) &&
								canAccessPage(access, "/qc", s.id),
						)
						.map((s) => (
							<button
								type="button"
								key={s.id}
								className="space-tab"
								aria-pressed={s.id === active}
								onClick={() => select(s.id)}
							>
								{s.label}
							</button>
						))}
				</nav>
			)}
			{content}
		</OperationsWorkspace>
	);
}
