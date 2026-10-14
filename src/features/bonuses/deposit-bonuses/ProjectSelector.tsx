import { Plus, Search } from "lucide-react";
import type { FormEvent } from "react";
import type { BonusProject } from "@/entities/bonus";
import {
	buildBonusSearchText,
	buildProjectSearchText,
	type CurrencyGroupOption,
	formatCurrencyGroupLabel,
	getCurrencyGroupShortName,
	matchesTokens,
} from "./bonus-presentation";

export function ProjectSelector({
	canEdit,
	newProjectName,
	setNewProjectName,
	newProjectCurrencyGroup,
	setNewProjectCurrencyGroup,
	currencyGroupOptions,
	createProject,
	query,
	setQuery,
	filteredProjects,
	activeProject,
	projectCurrencyGroups,
	searchTokens,
	setActiveProject,
}: {
	canEdit: boolean;
	newProjectName: string;
	setNewProjectName: (value: string) => void;
	newProjectCurrencyGroup: string;
	setNewProjectCurrencyGroup: (value: string) => void;
	currencyGroupOptions: CurrencyGroupOption[];
	createProject: (event: FormEvent) => void;
	query: string;
	setQuery: (value: string) => void;
	filteredProjects: BonusProject[];
	activeProject?: BonusProject;
	projectCurrencyGroups: Record<string, string>;
	searchTokens: string[];
	setActiveProject: (id: string) => void;
}) {
	return (
		<div className="min-w-0 space-y-3">
			<form
				onSubmit={createProject}
				className="min-w-0 rounded-xl border border-border bg-surface p-3"
			>
				<fieldset disabled={!canEdit} className="min-w-0">
					<div className="mb-3 text-sm font-semibold">Проекты</div>
					<div className="grid min-w-0 grid-cols-1 gap-2">
						<div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
							<input
								value={newProjectName}
								onChange={(event) => setNewProjectName(event.target.value)}
								className="ui-input w-full min-w-0 border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
								placeholder="Название проекта"
							/>
							<button
								type="submit"
								className="ui-button ui-button--primary inline-flex w-full items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90 sm:w-auto"
							>
								<Plus size={16} />
								Добавить
							</button>
						</div>
						<select
							value={newProjectCurrencyGroup}
							onChange={(event) =>
								setNewProjectCurrencyGroup(event.target.value)
							}
							className="ui-input w-full min-w-0 border border-border bg-background text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
							aria-label="Группа валют нового проекта"
						>
							<option value="">Автоматический выбор группы валют</option>
							{currencyGroupOptions.map((group) => (
								<option key={group.name} value={group.name}>
									{formatCurrencyGroupLabel(group.name, group.currencies)}
								</option>
							))}
						</select>
					</div>
				</fieldset>
			</form>

			<div className="relative">
				<Search
					size={16}
					className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
				/>
				<input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					className="ui-input w-full border border-border bg-surface pl-10 pr-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
					placeholder="Поиск проектов или бонусов…"
				/>
			</div>

			<div className="supportos-scroll max-h-[28rem] overflow-auto rounded-xl border border-border bg-surface">
				{filteredProjects.length > 0 ? (
					filteredProjects.map((project) => {
						const active = project.id === activeProject?.id;
						const currencyGroup = projectCurrencyGroups[project.id];
						const visibleCount =
							searchTokens.length > 0 &&
							!matchesTokens(buildProjectSearchText(project), searchTokens)
								? project.bonuses.filter((bonus) =>
										matchesTokens(buildBonusSearchText(bonus), searchTokens),
									).length
								: project.bonuses.length;

						return (
							<button
								key={project.id}
								type="button"
								onClick={() => setActiveProject(project.id)}
								className={`flex min-h-14 w-full min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-3 text-left text-sm transition last:border-b-0 ${
									active
										? "bg-accent/10 text-foreground"
										: "text-muted hover:bg-surface-elevated hover:text-foreground"
								}`}
							>
								<span className="min-w-0">
									<span className="block truncate font-medium">
										{project.name}
									</span>
									<span className="mt-0.5 block text-xs text-muted">
										{visibleCount} бонусов
										{currencyGroup
											? ` - ${getCurrencyGroupShortName(currencyGroup)}`
											: ""}
									</span>
								</span>
								<span className="shrink-0 rounded-md bg-background px-2 py-1 text-xs text-muted">
									{project.bonuses.length}
								</span>
							</button>
						);
					})
				) : (
					<div className="px-2 py-6 text-sm text-muted">Проектов пока нет</div>
				)}
			</div>
		</div>
	);
}
