import { Copy, Pencil, Trash2 } from "lucide-react";
import type { BonusProject, DepositBonus } from "@/entities/bonus";
import type { CurrencyRates } from "@/services/currency.service";
import { BonusFreshnessControls } from "./BonusFreshnessControls";
import {
	formatDeposit,
	getBonusTranslations,
	getDisplayBonusContent,
	getLanguageLabel,
} from "./bonus-presentation";

export function BonusList({
	activeProject,
	visibleBonuses,
	selectedLanguage,
	selectedCurrency,
	activeProjectCurrencyGroup,
	canEdit,
	updateBonus,
	rates,
	setSelectedLanguage,
	copyBonus,
	editBonus,
	setDeleteBonusId,
	searchTokens,
}: {
	activeProject: BonusProject;
	visibleBonuses: DepositBonus[];
	selectedLanguage: string;
	selectedCurrency: string;
	activeProjectCurrencyGroup: string;
	canEdit: boolean;
	updateBonus: (
		projectId: string,
		bonusId: string,
		patch: Partial<Omit<DepositBonus, "id">>,
	) => void;
	rates?: CurrencyRates;
	setSelectedLanguage: (language: string) => void;
	copyBonus: (bonus: DepositBonus) => Promise<void>;
	editBonus: (bonus: DepositBonus) => void;
	setDeleteBonusId: (id: string) => void;
	searchTokens: string[];
}) {
	return (
		<section className="min-w-0 rounded-xl border border-border bg-surface">
			<div className="border-b border-border px-4 py-3">
				<div className="font-semibold [overflow-wrap:anywhere]">
					{activeProject.name}
				</div>
				<div className="mt-1 text-xs text-muted">
					{visibleBonuses.length}
					{visibleBonuses.length !== activeProject.bonuses.length
						? ` of ${activeProject.bonuses.length}`
						: ""}{" "}
					бонусов
				</div>
			</div>

			<div className="divide-y divide-border">
				{visibleBonuses.length > 0 ? (
					visibleBonuses
						.slice()
						.sort((first, second) => first.order - second.order)
						.map((bonus) => {
							const content = getDisplayBonusContent({
								bonus,
								project: activeProject,
								language: selectedLanguage,
								selectedCurrency,
								currencyTableName: activeProjectCurrencyGroup,
							});
							const languages = getBonusTranslations(bonus).map(
								(translation) => translation.language,
							);

							return (
								<div
									key={bonus.id}
									className="grid min-w-0 grid-cols-1 gap-3 px-4 py-4 xl:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)_auto]"
								>
									<div className="min-w-0 [overflow-wrap:anywhere]">
										<div className="text-sm font-medium">{bonus.name}</div>
										<BonusFreshnessControls
											bonus={bonus}
											canEdit={canEdit}
											onChange={(patch) =>
												updateBonus(activeProject.id, bonus.id, patch)
											}
										/>
										<div className="mt-1 text-xs text-muted">
											{formatDeposit(bonus, selectedCurrency, rates)}
										</div>
										<div className="mt-2 flex flex-wrap gap-1">
											{languages.map((language) => (
												<button
													key={language}
													type="button"
													onClick={() => setSelectedLanguage(language)}
													title={`Переключить на ${getLanguageLabel(language)}`}
													className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition ${
														selectedLanguage === language
															? "border-accent bg-accent/10 text-foreground"
															: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
													}`}
												>
													{getLanguageLabel(language)}
												</button>
											))}
										</div>
									</div>

									<div className="min-w-0 whitespace-pre-wrap rounded-lg bg-background px-3 py-2 text-sm leading-6 text-muted [overflow-wrap:anywhere]">
										{content}
									</div>

									<div className="ui-actions items-center flex  gap-2">
										<button
											type="button"
											onClick={() => void copyBonus(bonus)}
											className="ui-button ui-button--primary inline-flex items-center justify-center gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90"
										>
											<Copy size={15} />
											Копировать
										</button>
										<button
											type="button"
											disabled={!canEdit}
											onClick={() => editBonus(bonus)}
											className="ui-button ui-button--secondary ui-button--icon inline-flex items-center justify-center border border-border text-muted hover:bg-surface-elevated hover:text-foreground"
											title="Редактировать бонус"
											aria-label="Редактировать бонус"
										>
											<Pencil size={15} />
										</button>
										<button
											type="button"
											disabled={!canEdit}
											onClick={() => setDeleteBonusId(bonus.id)}
											className="ui-button ui-button--danger-quiet ui-button--icon inline-flex items-center justify-center border border-border text-muted hover:bg-surface-elevated hover:text-red-400"
											title="Удалить бонус"
											aria-label="Удалить бонус"
										>
											<Trash2 size={15} />
										</button>
									</div>
								</div>
							);
						})
				) : (
					<div className="px-4 py-12 text-center text-sm text-muted">
						{searchTokens.length > 0
							? "По запросу ничего не найдено"
							: "В проекте пока нет бонусов"}
					</div>
				)}
			</div>
		</section>
	);
}
