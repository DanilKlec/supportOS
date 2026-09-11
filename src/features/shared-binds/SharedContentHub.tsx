import { lazy, Suspense, useState } from "react";
import { BookOpen, Mail, Gift, Calculator } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../../shared/access.js";
import { SharedBindsPage } from "./SharedBindsPage";
import { BindProposals } from "./BindProposals";
const Emails = lazy(() =>
	import("@/features/project-emails/ProjectEmailsPage").then((m) => ({
		default: m.ProjectEmailsPage,
	})),
);
const Bonuses = lazy(() =>
	import("@/features/bonuses/DepositBonusesPage").then((m) => ({
		default: m.DepositBonusesPage,
	})),
);
const CalculatorPage = lazy(() =>
	import("@/features/bonuses/BonusToolsPage").then((m) => ({
		default: m.BonusToolsPage,
	})),
);
export function SharedContentHub() {
	const access = useAuthStore((s) => s.session?.user.access);
	const [section, setSection] = useState("binds");
	const sections = [
		{
			id: "proposals",
			label: "Предложения",
			icon: BookOpen,
			permission: "knowledge.write",
		},
		{
			id: "binds",
			label: "Бинды",
			icon: BookOpen,
			permission: "knowledge.write",
		},
		{
			id: "emails",
			label: "Почты проектов",
			icon: Mail,
			permission: "projects.write",
		},
		{ id: "bonuses", label: "Бонусы", icon: Gift, permission: "bonuses.write" },
		{
			id: "calculator",
			label: "Калькуляторы",
			icon: Calculator,
			permission: "bonuses.write",
		},
	] as const;
	const available = sections.filter((s) => can(access, s.permission));
	const active =
		available.find((s) => s.id === section)?.id ?? available[0]?.id;
	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="shrink-0 border-b border-border px-5 pt-5">
				<h1 className="text-xl font-semibold">Общая база команды</h1>
				<p className="mt-2 text-sm text-muted">
					Подготовка, импорт и публикация данных для сотрудников
				</p>
				<nav
					aria-label="Общие данные"
					className="mt-4 flex gap-2 overflow-x-auto pb-3"
				>
					{available.map(({ id, label, icon: Icon }) => (
						<button
							type="button"
							key={id}
							aria-pressed={active === id}
							onClick={() => setSection(id)}
							className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm ${active === id ? "bg-accent/10 text-accent ring-1 ring-accent/20" : "text-muted hover:bg-surface-elevated"}`}
						>
							<Icon size={16} />
							{label}
						</button>
					))}
				</nav>
			</header>
			<div className="flex min-h-0 flex-1 flex-col">
				<Suspense
					fallback={<p className="p-6 text-muted">Открываем раздел…</p>}
				>
					{active === "proposals" ? (
						<div className="overflow-auto p-5">
							<BindProposals />
						</div>
					) : active === "binds" ? (
						<SharedBindsPage />
					) : active === "emails" ? (
						<Emails management />
					) : active === "bonuses" ? (
						<Bonuses management />
					) : active === "calculator" ? (
						<CalculatorPage management />
					) : null}
				</Suspense>
			</div>
		</div>
	);
}
