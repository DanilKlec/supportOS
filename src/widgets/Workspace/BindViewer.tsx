import {
	Check,
	ChevronDown,
	Copy,
	Edit3,
	Files,
	History,
	Info,
	MoreHorizontal,
	Pin,
	Search,
	Sparkles,
	Star,
	Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Bind, BindTranslation } from "@/entities/bind";
import type { KnowledgeFolder } from "@/entities/knowledge";
import { languages } from "@/entities/language";
import {
	answerAssistantService,
	type CheckIssue,
} from "@/services/answer-assistant.service";
import {
	type CurrencyTable,
	loadStoredBonusToolsData,
} from "@/services/bonus-tools.service";
import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { isKeyboardCode, isTypingTarget } from "@/shared/lib/keyboard";
import { extractTemplateVariables } from "@/shared/lib/template-variables";
import { modalManager } from "@/shared/modals/modal.store";
import {
	type LanguageCode,
	useKnowledgeStore,
	useWorkspaceStore,
} from "@/store";

function getTranslation(bind: Bind, language: string): BindTranslation {
	return (
		bind.translations.find(
			(translation) => translation.language === language,
		) ??
		bind.translations.find((translation) => translation.language === "ru") ??
		bind.translations.find((translation) => translation.language === "en") ??
		bind.translations[0] ?? {
			language,
			title: bind.slug,
			content: "",
			updatedAt: new Date().toISOString(),
		}
	);
}

function getLanguageName(code: string) {
	return languages.find((language) => language.code === code)?.name ?? code;
}

function getFolderPath(folder: KnowledgeFolder, folders: KnowledgeFolder[]) {
	const names = [folder.name];
	let parentId = folder.parentId;
	let guard = 0;

	while (parentId && guard < 20) {
		const parent = folders.find((item) => item.id === parentId);

		if (!parent) break;

		names.unshift(parent.name);
		parentId = parent.parentId;
		guard += 1;
	}

	return names.join(" / ");
}

function normalizeDuplicateText(value: string) {
	return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getQualityIssues(bind: Bind, binds: Bind[]) {
	const issues: string[] = [];
	const languagesWithContent = new Set(
		bind.translations
			.filter((translation) => translation.content.trim())
			.map((translation) => translation.language),
	);
	const missingLanguages = languages
		.map((language) => language.code)
		.filter((code) => !languagesWithContent.has(code));
	const duplicateContent = normalizeDuplicateText(
		bind.translations[0]?.content ?? "",
	);

	if (missingLanguages.length > 0) {
		issues.push(
			`Missing ${missingLanguages.map((code) => code.toUpperCase()).join(", ")}`,
		);
	}

	if (bind.tags.length === 0) {
		issues.push("No tags");
	}

	if (
		bind.translations.some((translation) => translation.content.length > 1200)
	) {
		issues.push("Long text");
	}

	if (
		duplicateContent &&
		binds.some(
			(item) =>
				item.id !== bind.id &&
				!item.archived &&
				item.translations.some(
					(translation) =>
						normalizeDuplicateText(translation.content) === duplicateContent,
				),
		)
	) {
		issues.push("Possible duplicate");
	}

	return issues;
}

function formatDate(value?: string) {
	if (!value) return "Never";

	return new Date(value).toLocaleString();
}

function getCopyWarnings(issues: CheckIssue[]) {
	const importantWarnings = new Set([
		"placeholders",
		"promise",
		"glossary",
		"length",
	]);

	return issues.filter(
		(issue) => issue.severity === "error" || importantWarnings.has(issue.id),
	);
}

function buildBindComposerContext({
	title,
	language,
	baseMaterial,
}: {
	title: string;
	language: string;
	baseMaterial: string;
}) {
	return [
		`Current bind title: ${title}`,
		`Reply language: ${language}`,
		"Task: adapt the current bind into a complete ready-to-send customer support reply for the described situation.",
		"Do not answer the agent note directly. Use the note as instructions for how to adapt the bind.",
		"Make the reply fuller than the base if needed: include empathy, regret for inconvenience, clear explanation, next step, and a polite closing.",
		"Do not invent facts, statuses, deadlines, checks, approvals, payments, or promises that are not present in the bind or case note.",
		`Current bind text:\n${baseMaterial}`,
	].join("\n\n");
}

const MAP_FALLBACK_CURRENCIES = ["EUR", "USD", "CAD", "AUD", "BRL", "TRY"];
const EUR_AMOUNT_PATTERN =
	/(\u20ac\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:\u20ac|EUR))/giu;
const EUR_AMOUNT_TEST_PATTERN =
	/(\u20ac\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:\u20ac|EUR))/iu;

function normalizeMapBindName(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\u0451/g, "\u0435")
		.replace(/[^a-zа-я0-9]+/g, "");
}

function isMapBindMaterial(bind: Bind, translation: BindTranslation) {
	const values = [
		bind.slug,
		translation.title,
		...bind.translations.map((item) => item.title),
		...bind.tags,
	].map(normalizeMapBindName);

	return values.some((value) => value === "мапа" || value === "mapa");
}

function isDepositInstructionLine(value: string) {
	const text = value.toLowerCase();

	return [
		"депозит",
		"deposit",
		"einzahl",
		"depósito",
		"deposito",
		"κατάθεση",
	].some((marker) => text.includes(marker));
}

function isLikelyBonusBlockLine(value: string) {
	const text = value.toLowerCase();

	return (
		!isDepositInstructionLine(value) &&
		(/bonus|free spins|\bfs\b|фрисп|спин|%/.test(text) ||
			EUR_AMOUNT_TEST_PATTERN.test(value))
	);
}

function detectMapBonusBlock(content: string) {
	const lines = content.split(/\r?\n/);
	const start =
		lines.findIndex(
			(line, index) => index > 0 && isLikelyBonusBlockLine(line),
		) ?? -1;

	if (start >= 0) {
		let end = start;

		while (
			end + 1 < lines.length &&
			lines[end + 1]?.trim() &&
			!isDepositInstructionLine(lines[end + 1] ?? "")
		) {
			end += 1;
		}

		return {
			start,
			end,
			text: lines
				.slice(start, end + 1)
				.join("\n")
				.trim(),
		};
	}

	const nonEmptyIndexes = lines
		.map((line, index) => ({ line, index }))
		.filter((item) => item.line.trim());
	const fallback = nonEmptyIndexes[1];

	return fallback
		? {
				start: fallback.index,
				end: fallback.index,
				text: fallback.line.trim(),
			}
		: undefined;
}

function parseMapAmount(value: string) {
	const match = value.replace(/\s+/g, "").match(/\d+(?:[.,]\d+)?/);
	const amount = match ? Number(match[0].replace(",", ".")) : undefined;

	return Number.isFinite(amount) ? amount : undefined;
}

function findExactCurrencyValue(
	table: CurrencyTable | undefined,
	value: string,
	currency: string,
) {
	const amount = parseMapAmount(value);
	const code = currency.toUpperCase();

	if (amount === undefined || !table?.currencies.includes(code)) return "";

	const row = table.rows.find(
		(item) =>
			item.baseAmount !== undefined &&
			Math.abs(item.baseAmount - amount) < 0.001,
	);

	return row?.values[code] ?? "";
}

function replaceMapCurrencyText(
	text: string,
	table: CurrencyTable | undefined,
	currency: string,
) {
	const code = currency.toUpperCase();

	if (!table || code === "EUR") return text;

	return text.replace(EUR_AMOUNT_PATTERN, (match) => {
		return findExactCurrencyValue(table, match, code) || match;
	});
}

function buildMapBindContent({
	content,
	bonusBlock,
	table,
	currency,
}: {
	content: string;
	bonusBlock: string;
	table?: CurrencyTable;
	currency: string;
}) {
	const detectedBlock = detectMapBonusBlock(content);
	const cleanBonusBlock = bonusBlock.trim();

	if (!detectedBlock || !cleanBonusBlock) {
		return replaceMapCurrencyText(content, table, currency);
	}

	const lines = content.split(/\r?\n/);

	lines.splice(
		detectedBlock.start,
		detectedBlock.end - detectedBlock.start + 1,
		...cleanBonusBlock.split(/\r?\n/),
	);

	return replaceMapCurrencyText(lines.join("\n"), table, currency);
}

function ViewerMenuItem({
	icon,
	label,
	onClick,
	danger = false,
}: {
	icon: ReactNode;
	label: string;
	onClick: () => void;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			role="menuitem"
			onClick={onClick}
			className={`flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
				danger
					? "text-red-400 hover:bg-red-500/10"
					: "text-muted hover:bg-surface-elevated hover:text-foreground"
			}`}
		>
			<span className="shrink-0">{icon}</span>
			<span className="truncate">{label}</span>
		</button>
	);
}

export function BindViewer() {
	const activeTab = useKnowledgeStore((state) => state.activeTab);
	const contentWidth = useWorkspaceStore((state) => state.layout.contentWidth);
	const bind = useKnowledgeStore((state) =>
		activeTab ? state.getBind(activeTab) : undefined,
	);
	const language = useKnowledgeStore((state) => state.language);
	const setLanguage = useKnowledgeStore((state) => state.setLanguage);
	const addRecent = useKnowledgeStore((state) => state.addRecent);
	const binds = useKnowledgeStore((state) => state.binds);
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const { showToast } = useToast();
	const actionsRef = useRef<HTMLDivElement>(null);
	const copyTimerRef = useRef<number | undefined>(undefined);
	const [actionsOpen, setActionsOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [composerBrief, setComposerBrief] = useState("");
	const [composerAnswer, setComposerAnswer] = useState("");
	const [composerLoading, setComposerLoading] = useState(false);
	const [composerIssues, setComposerIssues] = useState<CheckIssue[]>([]);
	const [composerMeta, setComposerMeta] = useState("");
	const [mapBonusBlock, setMapBonusBlock] = useState("");
	const [mapCurrency, setMapCurrency] = useState("EUR");
	const [mapTableName, setMapTableName] = useState("");

	const translation = useMemo(() => {
		if (!bind) return undefined;

		return getTranslation(bind, language);
	}, [bind, language]);

	const exactTranslation = bind?.translations.find(
		(item) => item.language === language,
	);
	const title = translation?.title || bind?.slug || "";
	const bonusToolsData = useMemo(() => loadStoredBonusToolsData(), []);
	const mapCurrencyTables = bonusToolsData?.currencyTables ?? [];
	const activeMapCurrencyTable =
		mapCurrencyTables.find((table) => table.name === mapTableName) ??
		mapCurrencyTables[0];
	const mapCurrencyOptions = useMemo(
		() =>
			Array.from(
				new Set([
					...(activeMapCurrencyTable?.currencies ?? []),
					...MAP_FALLBACK_CURRENCIES,
				]),
			).sort(),
		[activeMapCurrencyTable?.currencies],
	);
	const isMapBind = Boolean(
		bind && translation && isMapBindMaterial(bind, translation),
	);
	const mapPreparedContent = useMemo(() => {
		if (!isMapBind || !translation) return undefined;

		return buildMapBindContent({
			content: translation.content,
			bonusBlock: mapBonusBlock,
			table: activeMapCurrencyTable,
			currency: mapCurrency,
		});
	}, [
		activeMapCurrencyTable,
		isMapBind,
		mapBonusBlock,
		mapCurrency,
		translation,
	]);
	const displayContent = mapPreparedContent ?? translation?.content ?? "";
	const category = bind
		? categories.find((item) => item.id === bind.categoryId)
		: undefined;
	const folder = bind?.folderId
		? folders.find((item) => item.id === bind.folderId)
		: undefined;
	const folderPath = folder ? getFolderPath(folder, folders) : "";
	const languageCodes = useMemo(() => {
		if (!bind) return languages.map((item) => item.code);

		return Array.from(
			new Set([
				...languages.map((item) => item.code),
				...bind.translations.map((item) => item.language),
			]),
		);
	}, [bind]);

	const copyTranslation = async (item?: BindTranslation) => {
		if (!bind || !item) return;

		const contentToCopy =
			isMapBind && item.language === translation?.language
				? displayContent
				: item.content;

		if (extractTemplateVariables(contentToCopy).length > 0) {
			modalManager.open("copyBind", {
				bindId: bind.id,
				language: item.language,
			});
			return;
		}

		const assistantData = answerAssistantService.load();
		const copyWarnings = getCopyWarnings(
			answerAssistantService.checkAnswer({
				answer: contentToCopy,
				customerMessage: title,
				glossary: assistantData.glossary,
				language: item.language,
			}),
		);

		const ok = await copyToClipboard(contentToCopy);

		addRecent(bind.id);
		if (ok) {
			knowledgeService.recordBindCopied(bind.id);
			window.clearTimeout(copyTimerRef.current);
			setCopied(true);
			copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
		}
		if (copyWarnings.length > 0) {
			showToast(`Copy check: ${copyWarnings[0]?.title}`);
		}
		showToast(ok ? "Copied to clipboard" : "Copy failed");
	};

	const generateComposerAnswer = async () => {
		if (!bind || !translation || !composerBrief.trim()) return;

		setComposerLoading(true);
		setComposerIssues([]);
		setComposerMeta("");

		try {
			const assistantData = answerAssistantService.load();
			const composerTone =
				assistantData.settings.tone === "concise"
					? "friendly"
					: assistantData.settings.tone;
			const result = await answerAssistantService.generateReadyAnswer({
				customerMessage: composerBrief,
				context: buildBindComposerContext({
					title,
					language: translation.language,
					baseMaterial: displayContent,
				}),
				referenceAnswer: displayContent,
				responseStyle: "expanded-bind",
				settings: {
					...assistantData.settings,
					tone: composerTone,
					language: translation.language,
				},
				glossary: assistantData.glossary,
				memory: assistantData.memory,
			});

			setComposerAnswer(result.answer);
			setComposerIssues(result.issues);
			setComposerMeta(
				`${result.language.toUpperCase()} / ${
			result.mode === "openai"
				? "OpenAI"
				: result.mode === "gemini"
					? "Gemini"
					: "Free mode"
				}`,
			);
			showToast("AI answer ready");
		} catch (error) {
			showToast(error instanceof Error ? error.message : "AI answer failed");
		} finally {
			setComposerLoading(false);
		}
	};

	const copyComposerAnswer = async () => {
		if (!composerAnswer.trim()) return;

		const ok = await copyToClipboard(composerAnswer);

		if (ok && bind) {
			addRecent(bind.id);
		}
		showToast(ok ? "AI answer copied" : "Copy failed");
	};

	const copyContent = () => copyTranslation(translation);

	const copyTitle = async () => {
		if (!bind) return;

		const ok = await copyToClipboard(title);

		addRecent(bind.id);
		showToast(ok ? "Title copied" : "Copy failed");
	};

	const toggleFavorite = () => {
		if (!bind) return;

		const favorite = knowledgeService.toggleFavorite(bind.id);

		showToast(favorite ? "Added to favorites" : "Removed from favorites");
	};

	const togglePinned = () => {
		if (!bind) return;

		const pinned = knowledgeService.togglePinnedBind(bind.id);

		showToast(pinned ? "Pinned in folder" : "Unpinned");
	};

	const editBind = () => {
		if (!bind) return;

		modalManager.open("editBind", { bindId: bind.id });
	};

	const deleteBind = () => {
		if (!bind) return;

		modalManager.open("deleteNode", {
			id: bind.id,
			type: "bind",
			name: title,
		});
	};

	const duplicateBind = () => {
		if (!bind) return;

		const duplicate = knowledgeService.duplicateBind(bind.id);

		showToast("Material duplicated", {
			action: {
				label: "Undo",
				onClick: () => {
					knowledgeService.deleteBind(duplicate.id);
					showToast("Duplicate removed");
				},
			},
			duration: 6000,
		});
	};

	const showHistory = () => {
		if (!bind) return;

		modalManager.open("bindHistory", { bindId: bind.id });
	};

	const findDuplicates = () => {
		if (!bind) return;

		modalManager.open("findDuplicates", { bindId: bind.id });
	};

	const runAction = (action: () => void) => {
		action();
		setActionsOpen(false);
	};

	const qualityIssues = useMemo(
		() => (bind ? getQualityIssues(bind, binds) : []),
		[bind, binds],
	);
	const contentWidthClass = {
		standard: "max-w-5xl",
		wide: "max-w-7xl",
		full: "max-w-none",
	}[contentWidth];

	useEffect(() => {
		if (!isMapBind || !translation) {
			setMapBonusBlock("");
			return;
		}

		setMapBonusBlock(detectMapBonusBlock(translation.content)?.text ?? "");
	}, [isMapBind, translation]);

	useEffect(() => {
		if (!isMapBind || mapCurrencyTables.length === 0) return;

		if (
			!mapTableName ||
			!mapCurrencyTables.some((table) => table.name === mapTableName)
		) {
			setMapTableName(mapCurrencyTables[0]?.name ?? "");
		}
	}, [isMapBind, mapCurrencyTables, mapTableName]);

	useEffect(() => {
		if (!isMapBind || mapCurrencyOptions.length === 0) return;

		if (!mapCurrencyOptions.includes(mapCurrency)) {
			setMapCurrency(
				mapCurrencyOptions.includes("EUR") ? "EUR" : mapCurrencyOptions[0],
			);
		}
	}, [isMapBind, mapCurrency, mapCurrencyOptions]);

	useEffect(() => {
		return () => {
			window.clearTimeout(copyTimerRef.current);
		};
	}, []);

	useEffect(() => {
		if (!actionsOpen) return undefined;

		const closeOnOutsideClick = (event: PointerEvent) => {
			if (actionsRef.current?.contains(event.target as Node)) return;

			setActionsOpen(false);
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setActionsOpen(false);
			}
		};

		window.addEventListener("pointerdown", closeOnOutsideClick);
		window.addEventListener("keydown", closeOnEscape);

		return () => {
			window.removeEventListener("pointerdown", closeOnOutsideClick);
			window.removeEventListener("keydown", closeOnEscape);
		};
	}, [actionsOpen]);

	useEffect(() => {
		if (!bind || !translation) return undefined;

		const handler = (event: KeyboardEvent) => {
			if (
				isTypingTarget(event.target) ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey
			) {
				return;
			}

			if (isKeyboardCode(event, "KeyC")) {
				event.preventDefault();
				void copyContent();
			}

			if (isKeyboardCode(event, "KeyE")) {
				event.preventDefault();
				editBind();
			}

			if (isKeyboardCode(event, "KeyD")) {
				event.preventDefault();
				duplicateBind();
			}

			if (isKeyboardCode(event, "KeyF")) {
				event.preventDefault();
				toggleFavorite();
			}

			if (isKeyboardCode(event, "KeyP")) {
				event.preventDefault();
				togglePinned();
			}

			if (
				isKeyboardCode(event, "ArrowRight") ||
				isKeyboardCode(event, "ArrowLeft")
			) {
				const existingLanguages = bind.translations.map(
					(item) => item.language,
				);
				if (existingLanguages.length === 0) return;

				const currentIndex = existingLanguages.indexOf(language);
				const direction = isKeyboardCode(event, "ArrowRight") ? 1 : -1;
				const next =
					existingLanguages[
						(currentIndex + direction + existingLanguages.length) %
							existingLanguages.length
					];

				if (next) {
					event.preventDefault();
					setLanguage(next as LanguageCode);
				}
			}
		};

		window.addEventListener("keydown", handler);

		return () => window.removeEventListener("keydown", handler);
	});

	if (!bind || !translation) {
		return (
			<div className="flex flex-1 items-center justify-center text-muted">
				No material selected
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto">
				<div
					className={`mx-auto w-full ${contentWidthClass} px-4 py-5 pb-28 sm:px-6 md:px-8 md:py-7 md:pb-8`}
				>
					<nav
						aria-label="Breadcrumbs"
						className="mb-4 flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap text-xs text-muted"
					>
						<span className="truncate">{category?.name ?? "No category"}</span>
						{folderPath && (
							<>
								<span>/</span>
								<span className="truncate">{folderPath}</span>
							</>
						)}
					</nav>

					<div className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-start md:justify-between">
						<div className="min-w-0 flex-1">
							<div className="flex min-w-0 items-start gap-3">
								<h1 className="min-w-0 text-2xl font-semibold leading-tight tracking-normal sm:text-3xl">
									{title}
								</h1>
								{bind.pinned && (
									<span className="mt-1 inline-flex h-6 items-center gap-1 rounded-full bg-accent/10 px-2 text-xs font-medium text-accent">
										<Pin size={12} fill="currentColor" />
										Pinned
									</span>
								)}
							</div>

							{bind.tags.length > 0 && (
								<div className="mt-3 flex flex-wrap gap-1.5">
									{bind.tags.map((tag) => (
										<span
											key={tag}
											className="max-w-full truncate rounded-full bg-surface-elevated px-2.5 py-1 text-xs text-muted"
										>
											#{tag}
										</span>
									))}
								</div>
							)}
						</div>

						<div className="flex shrink-0 flex-wrap items-center gap-2">
							<div className="hidden rounded-xl bg-surface p-1 sm:flex">
								{languageCodes.map((code) => {
									const exists = bind.translations.some(
										(item) => item.language === code,
									);

									return (
										<button
											key={code}
											type="button"
											onClick={() => setLanguage(code as LanguageCode)}
											title={
												exists
													? getLanguageName(code)
													: `${getLanguageName(code)} missing`
											}
											className={`h-8 rounded-lg px-2.5 text-xs font-semibold uppercase transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
												language === code
													? "bg-accent text-accent-foreground"
													: exists
														? "text-muted hover:bg-surface-elevated hover:text-foreground"
														: "text-muted/55 hover:bg-surface-elevated"
											}`}
										>
											{code}
										</button>
									);
								})}
							</div>

							<div className="relative sm:hidden">
								<select
									value={language}
									onChange={(event) =>
										setLanguage(event.target.value as LanguageCode)
									}
									aria-label="Language"
									className="h-10 appearance-none rounded-xl border border-border bg-surface pl-3 pr-9 text-sm font-medium uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
								>
									{languageCodes.map((code) => {
										const exists = bind.translations.some(
											(item) => item.language === code,
										);

										return (
											<option key={code} value={code}>
												{code.toUpperCase()}
												{exists ? "" : " missing"}
											</option>
										);
									})}
								</select>
								<ChevronDown
									size={16}
									className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
								/>
							</div>

							<button
								type="button"
								onClick={() => void copyContent()}
								className="hidden h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:inline-flex"
							>
								{copied ? <Check size={17} /> : <Copy size={17} />}
								{copied ? "Copied" : "Copy"}
							</button>

							<div ref={actionsRef} className="relative">
								<button
									type="button"
									aria-label="Material actions"
									aria-haspopup="menu"
									aria-expanded={actionsOpen}
									onClick={() => setActionsOpen((value) => !value)}
									className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-muted transition hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
								>
									<MoreHorizontal size={19} />
								</button>

								{actionsOpen && (
									<div
										role="menu"
										className="absolute right-0 top-11 z-30 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-2xl"
									>
										<ViewerMenuItem
											icon={<Copy size={15} />}
											label="Copy title"
											onClick={() => runAction(() => void copyTitle())}
										/>
										<ViewerMenuItem
											icon={<Edit3 size={15} />}
											label="Edit"
											onClick={() => runAction(editBind)}
										/>
										<ViewerMenuItem
											icon={
												<Star
													size={15}
													fill={bind.favorite ? "currentColor" : "none"}
												/>
											}
											label={
												bind.favorite
													? "Remove from favorites"
													: "Add to favorites"
											}
											onClick={() => runAction(toggleFavorite)}
										/>
										<ViewerMenuItem
											icon={
												<Pin
													size={15}
													fill={bind.pinned ? "currentColor" : "none"}
												/>
											}
											label={bind.pinned ? "Unpin" : "Pin in folder"}
											onClick={() => runAction(togglePinned)}
										/>
										<ViewerMenuItem
											icon={<Files size={15} />}
											label="Duplicate"
											onClick={() => runAction(duplicateBind)}
										/>
										<ViewerMenuItem
											icon={<History size={15} />}
											label="History"
											onClick={() => runAction(showHistory)}
										/>
										<ViewerMenuItem
											icon={<Search size={15} />}
											label="Find duplicates"
											onClick={() => runAction(findDuplicates)}
										/>
										<div className="my-1 border-t border-border" />
										<ViewerMenuItem
											icon={<Trash2 size={15} />}
											label="Delete"
											danger
											onClick={() => runAction(deleteBind)}
										/>
									</div>
								)}
							</div>
						</div>
					</div>

					{!exactTranslation && (
						<div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
							{language.toUpperCase()} is missing. Showing{" "}
							{translation.language.toUpperCase()} instead.
						</div>
					)}

					{isMapBind && (
						<section className="mt-5 rounded-xl border border-border bg-surface">
							<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
								<div>
									<div className="text-sm font-semibold">MAP bind</div>
									<div className="mt-1 text-xs text-muted">
										Bonus block and currency for this copy.
									</div>
								</div>
								<button
									type="button"
									onClick={() => void copyContent()}
									className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
								>
									<Copy size={15} />
									Copy MAP
								</button>
							</div>

							<div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)_minmax(8rem,10rem)]">
								<label className="min-w-0">
									<span className="mb-1 block text-xs font-medium text-muted">
										Bonus block
									</span>
									<textarea
										value={mapBonusBlock}
										onChange={(event) => setMapBonusBlock(event.target.value)}
										className="supportos-scroll min-h-24 w-full min-w-0 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
										placeholder="130% bonus up to €1000 + 100 FS"
									/>
								</label>

								<label className="min-w-0">
									<span className="mb-1 block text-xs font-medium text-muted">
										Currency group
									</span>
									<select
										value={activeMapCurrencyTable?.name ?? ""}
										onChange={(event) => setMapTableName(event.target.value)}
										className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									>
										{mapCurrencyTables.length > 0 ? (
											mapCurrencyTables.map((table) => (
												<option key={table.name} value={table.name}>
													{table.name}
												</option>
											))
										) : (
											<option value="">No tables loaded</option>
										)}
									</select>
									{mapCurrencyTables.length === 0 && (
										<div className="mt-1 text-xs text-muted">
											Load Bonus Tools for exact currency values.
										</div>
									)}
								</label>

								<label className="min-w-0">
									<span className="mb-1 block text-xs font-medium text-muted">
										Currency
									</span>
									<select
										value={mapCurrency}
										onChange={(event) => setMapCurrency(event.target.value)}
										className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									>
										{mapCurrencyOptions.map((currency) => (
											<option key={currency} value={currency}>
												{currency}
											</option>
										))}
									</select>
								</label>
							</div>
						</section>
					)}

					<section className="mt-6 rounded-xl bg-surface px-4 py-5 sm:px-6 md:p-8">
						{displayContent.trim() ? (
							<div className="prose max-w-none leading-7 dark:prose-invert prose-headings:tracking-normal prose-pre:rounded-xl prose-pre:border prose-pre:border-border prose-pre:bg-background">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>
									{displayContent}
								</ReactMarkdown>
							</div>
						) : (
							<div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
								No content in this translation
							</div>
						)}
					</section>

					<section className="mt-4 rounded-xl border border-border bg-surface">
						<div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
							<div className="min-w-0">
								<div className="flex items-center gap-2 text-sm font-semibold">
									<Sparkles size={16} />
									AI composer
								</div>
								<div className="mt-1 text-xs text-muted">
									Build a fuller support reply from this bind and your case
									notes.
								</div>
							</div>
							{composerMeta && (
								<div className="rounded-lg bg-background px-2.5 py-1 text-xs text-muted">
									{composerMeta}
								</div>
							)}
						</div>

						<div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
							<div className="flex flex-col gap-3">
								<textarea
									value={composerBrief}
									onChange={(event) => setComposerBrief(event.target.value)}
									className="supportos-scroll min-h-32 resize-y rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
									placeholder="Example: adapt this bind for a player who is upset because the withdrawal is still pending. Add empathy and explain what they should do next..."
								/>
								<button
									type="button"
									onClick={() => void generateComposerAnswer()}
									disabled={composerLoading || !composerBrief.trim()}
									className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{composerLoading ? (
										<Sparkles size={16} className="animate-pulse" />
									) : (
										<Sparkles size={16} />
									)}
									Generate full answer
								</button>
							</div>

							<div className="flex min-h-44 flex-col rounded-lg bg-background">
								<div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
									<div className="text-xs font-semibold uppercase text-muted">
										Ready reply
									</div>
									<button
										type="button"
										onClick={() => void copyComposerAnswer()}
										disabled={!composerAnswer.trim()}
										className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
									>
										<Copy size={14} />
										Copy
									</button>
								</div>
								<textarea
									value={composerAnswer}
									onChange={(event) => setComposerAnswer(event.target.value)}
									className="supportos-scroll min-h-32 flex-1 resize-y bg-transparent px-3 py-3 text-sm leading-6 outline-none"
									placeholder="Generated answer will appear here."
								/>
								{composerIssues.length > 0 && composerAnswer && (
									<div className="grid gap-2 border-t border-border p-3">
										{composerIssues.map((issue) => (
											<div
												key={issue.id}
												className={`rounded-lg border px-3 py-2 text-xs ${
													issue.severity === "error"
														? "border-red-500/30 bg-red-500/10"
														: issue.severity === "warning"
															? "border-amber-500/30 bg-amber-500/10"
															: "border-emerald-500/30 bg-emerald-500/10"
												}`}
											>
												<div className="font-semibold">{issue.title}</div>
												<div className="mt-0.5 text-muted">{issue.detail}</div>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</section>

					<details className="mt-4 rounded-xl border border-border bg-surface">
						<summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium text-muted hover:text-foreground">
							<Info size={16} />
							Information
						</summary>

						<div className="grid gap-5 border-t border-border px-4 py-4 text-sm md:grid-cols-2">
							<div className="space-y-3">
								<div>
									<div className="text-xs font-semibold uppercase tracking-wide text-muted">
										Slug
									</div>
									<div className="mt-1 break-all">{bind.slug}</div>
								</div>

								<div>
									<div className="text-xs font-semibold uppercase tracking-wide text-muted">
										Usage
									</div>
									<div className="mt-1 text-muted">
										{bind.copyCount ?? 0} copies
										<span className="mx-2">·</span>
										Last copied: {formatDate(bind.lastCopiedAt)}
									</div>
								</div>

								<div>
									<div className="text-xs font-semibold uppercase tracking-wide text-muted">
										Quality
									</div>
									<div className="mt-2 flex flex-wrap gap-1.5">
										{qualityIssues.length > 0 ? (
											qualityIssues.map((issue) => (
												<span
													key={issue}
													className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-200"
												>
													{issue}
												</span>
											))
										) : (
											<span className="text-muted">No obvious issues</span>
										)}
									</div>
								</div>
							</div>

							<div className="space-y-3">
								<div>
									<div className="text-xs font-semibold uppercase tracking-wide text-muted">
										Translations
									</div>
									<div className="mt-2 space-y-1">
										{bind.translations.map((item) => (
											<div
												key={item.language}
												className="flex min-h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 hover:bg-surface-elevated"
											>
												<button
													type="button"
													onClick={() =>
														setLanguage(item.language as LanguageCode)
													}
													className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
												>
													<span className="mr-2 text-xs font-semibold uppercase text-muted">
														{item.language}
													</span>
													<span className="truncate">
														{item.title || bind.slug}
													</span>
												</button>
												<button
													type="button"
													aria-label={`Copy ${item.language.toUpperCase()}`}
													onClick={(event) => {
														event.stopPropagation();
														void copyTranslation(item);
													}}
													className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground"
												>
													<Copy size={14} />
												</button>
											</div>
										))}
									</div>
								</div>

								<div>
									<div className="text-xs font-semibold uppercase tracking-wide text-muted">
										Updated
									</div>
									<div className="mt-1 text-muted">
										{formatDate(bind.updatedAt)}
									</div>
								</div>
							</div>
						</div>
					</details>
				</div>
			</div>

			<div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
				<button
					type="button"
					onClick={() => void copyContent()}
					className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
				>
					{copied ? <Check size={18} /> : <Copy size={18} />}
					{copied ? "Copied" : "Copy answer"}
				</button>
			</div>
		</div>
	);
}
