import {
	Copy,
	FileSpreadsheet,
	Loader2,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { BonusProject, DepositBonus } from "@/entities/bonus";
import {
	type CurrencyRates,
	currencyService,
} from "@/services/currency.service";
import {
	type DepositBonusImportMode,
	type DepositBonusImportPreview,
	depositBonusImportService,
} from "@/services/deposit-bonus-import.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useBonusStore } from "@/store/bonus.store";

const FALLBACK_CURRENCIES = [
	"USD",
	"EUR",
	"GBP",
	"RUB",
	"UAH",
	"TRY",
	"BRL",
	"CAD",
	"AUD",
	"PLN",
	"RON",
	"KZT",
];

function getConvertedDeposit(
	bonus: DepositBonus,
	selectedCurrency: string,
	rates?: CurrencyRates,
) {
	if (!bonus.minDepositAmount || !bonus.minDepositCurrency || !rates) {
		return undefined;
	}

	return currencyService.convert({
		amount: bonus.minDepositAmount,
		from: bonus.minDepositCurrency,
		to: selectedCurrency,
		rates,
	});
}

function formatDeposit(
	bonus: DepositBonus,
	selectedCurrency: string,
	rates?: CurrencyRates,
) {
	if (!bonus.minDepositAmount || !bonus.minDepositCurrency) {
		return "Min deposit: not specified";
	}

	const original = currencyService.format(
		bonus.minDepositAmount,
		bonus.minDepositCurrency,
	);
	const converted = getConvertedDeposit(bonus, selectedCurrency, rates);

	if (
		!converted ||
		bonus.minDepositCurrency.toUpperCase() === selectedCurrency.toUpperCase()
	) {
		return `Min deposit: ${original}`;
	}

	return `Min deposit: ${original} (~${currencyService.format(
		converted,
		selectedCurrency,
	)})`;
}

function buildBonusBind({
	project,
	bonus,
	selectedCurrency,
	rates,
}: {
	project: BonusProject;
	bonus: DepositBonus;
	selectedCurrency: string;
	rates?: CurrencyRates;
}) {
	return [
		`${project.name} - ${bonus.name}`,
		formatDeposit(bonus, selectedCurrency, rates),
		"",
		bonus.content,
	]
		.filter((_line, index) => index !== 2 || bonus.content.trim())
		.join("\n");
}

function buildPackageBind({
	project,
	selectedCurrency,
	rates,
}: {
	project: BonusProject;
	selectedCurrency: string;
	rates?: CurrencyRates;
}) {
	return [
		`${project.name} welcome package`,
		"",
		...project.bonuses.flatMap((bonus, index) => [
			`${index + 1}. ${bonus.name}`,
			formatDeposit(bonus, selectedCurrency, rates),
			bonus.content,
			"",
		]),
	]
		.join("\n")
		.trim();
}

export function DepositBonusesPage() {
	const { showToast } = useToast();
	const projects = useBonusStore((state) => state.projects);
	const selectedCurrency = useBonusStore((state) => state.selectedCurrency);
	const upsertProjects = useBonusStore((state) => state.upsertProjects);
	const replaceProjects = useBonusStore((state) => state.replaceProjects);
	const removeProject = useBonusStore((state) => state.removeProject);
	const setSelectedCurrency = useBonusStore(
		(state) => state.setSelectedCurrency,
	);
	const [query, setQuery] = useState("");
	const [sheetUrl, setSheetUrl] = useState("");
	const [mode, setMode] = useState<DepositBonusImportMode>("upsert");
	const [preview, setPreview] = useState<DepositBonusImportPreview>();
	const [importing, setImporting] = useState(false);
	const [committing, setCommitting] = useState(false);
	const [rates, setRates] = useState<CurrencyRates>();
	const [ratesLoading, setRatesLoading] = useState(false);
	const [ratesError, setRatesError] = useState("");

	const currencies = useMemo(() => {
		const values = new Set([
			...FALLBACK_CURRENCIES,
			...(rates ? Object.keys(rates.rates) : []),
		]);

		return Array.from(values).sort();
	}, [rates]);
	const filteredProjects = useMemo(() => {
		const value = query.trim().toLowerCase();

		if (!value) return projects;

		return projects.filter((project) => {
			const haystack = [
				project.name,
				project.slug,
				...project.bonuses.flatMap((bonus) => [bonus.name, bonus.content]),
			]
				.join(" ")
				.toLowerCase();

			return haystack.includes(value);
		});
	}, [projects, query]);

	const loadRates = useCallback(
		async (force: boolean) => {
			setRatesLoading(true);
			setRatesError("");

			try {
				const nextRates = await currencyService.getRates({ force });

				setRates(nextRates);
				if (force) {
					showToast("Currency rates updated");
				}
			} catch (error) {
				setRatesError(
					error instanceof Error
						? error.message
						: "Unable to load currency rates",
				);
			} finally {
				setRatesLoading(false);
			}
		},
		[showToast],
	);

	useEffect(() => {
		void loadRates(false);
	}, [loadRates]);

	const loadPreview = async () => {
		setImporting(true);

		try {
			const nextPreview = await depositBonusImportService.preview(sheetUrl);

			setPreview(nextPreview);
			showToast("Preview loaded");
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Import failed");
		} finally {
			setImporting(false);
		}
	};

	const commitPreview = () => {
		if (!preview || preview.projects.length === 0) return;

		setCommitting(true);

		try {
			if (mode === "replace") {
				replaceProjects(preview.projects);
			} else {
				upsertProjects(preview.projects);
			}

			showToast(`Imported ${preview.projects.length} projects`);
			setPreview(undefined);
		} finally {
			setCommitting(false);
		}
	};

	const copyBonus = async (project: BonusProject, bonus: DepositBonus) => {
		const copied = await copyToClipboard(
			buildBonusBind({
				project,
				bonus,
				selectedCurrency,
				rates,
			}),
		);

		showToast(copied ? "Bonus bind copied" : "Copy failed");
	};

	const copyPackage = async (project: BonusProject) => {
		const copied = await copyToClipboard(
			buildPackageBind({
				project,
				selectedCurrency,
				rates,
			}),
		);

		showToast(copied ? "Package bind copied" : "Copy failed");
	};

	return (
		<div className="flex h-full flex-col overflow-auto bg-background">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 className="text-2xl font-bold">Deposit Bonuses</h1>
						<p className="mt-1 text-sm text-muted">
							Welcome packages, minimum deposits, currency equivalents, and
							ready-to-copy bonus binds.
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<select
							value={selectedCurrency}
							onChange={(event) => setSelectedCurrency(event.target.value)}
							className="h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
						>
							{currencies.map((currency) => (
								<option key={currency} value={currency}>
									{currency}
								</option>
							))}
						</select>

						<button
							type="button"
							onClick={() => void loadRates(true)}
							disabled={ratesLoading}
							className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							{ratesLoading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<RefreshCw size={16} />
							)}
							Rates
						</button>
					</div>
				</div>

				{ratesError && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
						{ratesError}
					</div>
				)}

				{rates && (
					<div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
						Rates source: {rates.source}. Date: {rates.date}. Base: {rates.base}
						.
					</div>
				)}

				<div className="rounded-lg border border-border bg-surface p-4">
					<div className="mb-3 flex items-center gap-2 text-sm font-semibold">
						<FileSpreadsheet size={16} />
						Google Sheets Import
					</div>

					<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
						<input
							value={sheetUrl}
							onChange={(event) => setSheetUrl(event.target.value)}
							className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
							placeholder="Paste public Google Sheets URL"
						/>

						<select
							value={mode}
							onChange={(event) =>
								setMode(event.target.value as DepositBonusImportMode)
							}
							className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
						>
							<option value="upsert">Upsert</option>
							<option value="replace">Replace all bonuses</option>
						</select>

						<button
							type="button"
							onClick={loadPreview}
							disabled={importing || !sheetUrl.trim()}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{importing ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<FileSpreadsheet size={16} />
							)}
							Preview
						</button>
					</div>

					{preview && (
						<div className="mt-4 rounded-md border border-border bg-background p-3">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div className="text-sm">
									<span className="font-semibold">
										{preview.projects.length}
									</span>{" "}
									projects found
								</div>

								<button
									type="button"
									onClick={commitPreview}
									disabled={
										committing ||
										preview.projects.length === 0 ||
										preview.errors.length > 0
									}
									className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
								>
									{committing && <Loader2 size={15} className="animate-spin" />}
									Commit Import
								</button>
							</div>

							{preview.errors.length > 0 && (
								<div className="mt-3 space-y-1 text-sm text-red-300">
									{preview.errors.map((error) => (
										<div key={error}>{error}</div>
									))}
								</div>
							)}

							{preview.warnings.length > 0 && (
								<div className="mt-3 max-h-24 overflow-auto text-xs text-amber-200">
									{preview.warnings.slice(0, 10).map((warning) => (
										<div key={warning}>{warning}</div>
									))}
								</div>
							)}
						</div>
					)}
				</div>

				<div className="relative">
					<Search
						size={16}
						className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
					/>
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="h-10 w-full rounded-md border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
						placeholder="Search projects or bonuses..."
					/>
				</div>

				<div className="grid gap-4">
					{filteredProjects.length > 0 ? (
						filteredProjects.map((project) => (
							<section
								key={project.id}
								className="rounded-lg border border-border bg-surface"
							>
								<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
									<div>
										<h2 className="font-semibold">{project.name}</h2>
										<div className="mt-1 text-xs text-muted">
											{project.bonuses.length} bonuses
										</div>
									</div>

									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => void copyPackage(project)}
											className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
										>
											<Copy size={15} />
											Copy Package
										</button>

										<button
											type="button"
											onClick={() => removeProject(project.id)}
											className="rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-red-400"
											title="Delete project"
										>
											<Trash2 size={16} />
										</button>
									</div>
								</div>

								<div className="divide-y divide-border">
									{project.bonuses
										.slice()
										.sort((first, second) => first.order - second.order)
										.map((bonus) => (
											<div
												key={bonus.id}
												className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)_auto]"
											>
												<div>
													<div className="text-sm font-medium">
														{bonus.name}
													</div>
													<div className="mt-1 text-xs text-muted">
														{formatDeposit(bonus, selectedCurrency, rates)}
													</div>
												</div>

												<div className="min-w-0 whitespace-pre-wrap text-sm leading-6 text-muted">
													{bonus.content}
												</div>

												<button
													type="button"
													onClick={() => void copyBonus(project, bonus)}
													className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-muted hover:bg-surface-elevated hover:text-foreground"
												>
													<Copy size={15} />
													Copy
												</button>
											</div>
										))}
								</div>
							</section>
						))
					) : (
						<div className="rounded-lg border border-border bg-surface px-4 py-12 text-center text-sm text-muted">
							No bonus projects yet
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
