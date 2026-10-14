import { Pencil, Plus, Trash2, X } from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { BonusProject } from "@/entities/bonus";
import type { BonusCurrencyContext } from "@/services/bonus-currency-registry.service";
import {
	type BonusDraft,
	type CurrencyGroupOption,
	formatCurrencyGroupLabel,
} from "./bonus-presentation";
import { TranslationEditor } from "./TranslationEditor";

export function BonusEditor({
	activeProject,
	renameValue,
	setRenameValue,
	canEdit,
	saveProjectName,
	activeProjectCurrencyGroup,
	updateActiveProjectCurrencyGroup,
	currencyGroupOptions,
	activeCurrencyContext,
	setDeleteProjectId,
	submitBonus,
	bonusDraft,
	setBonusDraft,
	selectedLanguage,
	formError,
	editingBonusId,
	resetBonusForm,
}: {
	activeProject: BonusProject;
	renameValue: string;
	setRenameValue: (value: string) => void;
	canEdit: boolean;
	saveProjectName: () => void;
	activeProjectCurrencyGroup: string;
	updateActiveProjectCurrencyGroup: (tableName: string) => void;
	currencyGroupOptions: CurrencyGroupOption[];
	activeCurrencyContext?: BonusCurrencyContext;
	setDeleteProjectId: (id: string) => void;
	submitBonus: (event: FormEvent) => void;
	bonusDraft: BonusDraft;
	setBonusDraft: Dispatch<SetStateAction<BonusDraft>>;
	selectedLanguage: string;
	formError: string;
	editingBonusId?: string;
	resetBonusForm: () => void;
}) {
	return (
		<section className="min-w-0 rounded-xl border border-border bg-surface">
			<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
				<div className="min-w-0 flex-1">
					<div className="mb-2 text-xs font-semibold uppercase text-muted">
						Выбранный проект
					</div>
					<div className="ui-actions items-center flex max-w-xl gap-2">
						<input
							value={renameValue}
							onChange={(event) => setRenameValue(event.target.value)}
							className="ui-input min-w-0 flex-1 border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
						/>
						<button
							type="button"
							disabled={!canEdit}
							onClick={saveProjectName}
							className="ui-button ui-button--secondary inline-flex items-center gap-2 border border-border text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							<Pencil size={15} />
							Применить
						</button>
					</div>
					<div className="mt-3 grid min-w-0 max-w-xl grid-cols-1 gap-1">
						<label
							htmlFor="active-project-currency-group"
							className="text-xs font-medium text-muted"
						>
							Группа валют
						</label>
						<select
							id="active-project-currency-group"
							value={activeProjectCurrencyGroup}
							onChange={(event) =>
								updateActiveProjectCurrencyGroup(event.target.value)
							}
							className="ui-input border border-border bg-background text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
						>
							<option value="">Определять по названию проекта</option>
							{currencyGroupOptions.map((group) => (
								<option key={group.name} value={group.name}>
									{formatCurrencyGroupLabel(group.name, group.currencies)}
								</option>
							))}
						</select>
						<div className="text-xs text-muted [overflow-wrap:anywhere]">
							{activeCurrencyContext
								? `${activeCurrencyContext.source === "manual" ? "Вручную" : "Автоматически"} использует таблицу ${activeCurrencyContext.table.name}.`
								: "Таблица валют не найдена. Выберите группу вручную или настройте общую базу."}
						</div>
					</div>
				</div>

				<div className="ui-actions items-center flex  gap-2">
					<button
						type="button"
						disabled={!canEdit}
						onClick={() => setDeleteProjectId(activeProject.id)}
						className="ui-button ui-button--danger-quiet ui-button--icon inline-flex items-center justify-center border border-border text-muted hover:bg-surface-elevated hover:text-red-400"
						title="Удалить проект"
						aria-label="Удалить проект"
					>
						<Trash2 size={16} />
					</button>
				</div>
			</div>

			<form onSubmit={submitBonus} className="space-y-3 p-4">
				<fieldset disabled={!canEdit} className="min-w-0">
					<div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_8rem_7rem]">
						<input
							value={bonusDraft.name}
							onChange={(event) =>
								setBonusDraft((current) => ({
									...current,
									name: event.target.value,
								}))
							}
							className="ui-input border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
							placeholder="Название бонуса"
						/>
						<input
							value={bonusDraft.minDepositAmount}
							onChange={(event) =>
								setBonusDraft((current) => ({
									...current,
									minDepositAmount: event.target.value,
								}))
							}
							className="ui-input border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
							placeholder="Мин. депозит"
						/>
						<input
							value={bonusDraft.minDepositCurrency}
							list="deposit-bonus-currencies"
							onChange={(event) =>
								setBonusDraft((current) => ({
									...current,
									minDepositCurrency: event.target.value,
								}))
							}
							className="ui-input border border-border bg-background uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
							placeholder="USD"
						/>
					</div>

					<TranslationEditor
						bonusDraft={bonusDraft}
						setBonusDraft={setBonusDraft}
						selectedLanguage={selectedLanguage}
					/>

					{formError && (
						<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
							{formError}
						</div>
					)}

					<div className="ui-actions items-center flex flex-wrap justify-end gap-2">
						{editingBonusId && (
							<button
								type="button"
								onClick={resetBonusForm}
								className="ui-button ui-button--secondary inline-flex items-center gap-2 border border-border text-muted hover:bg-surface-elevated hover:text-foreground"
							>
								<X size={15} />
								Отмена
							</button>
						)}
						<button
							type="submit"
							className="ui-button ui-button--primary inline-flex items-center gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90"
						>
							<Plus size={16} />
							{editingBonusId ? "Применить изменения" : "Добавить бонус"}
						</button>
					</div>
				</fieldset>
			</form>
		</section>
	);
}
