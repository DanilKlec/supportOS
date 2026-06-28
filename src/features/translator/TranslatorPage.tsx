import { Link } from "@tanstack/react-router";
import {
	Copy,
	Languages,
	Loader2,
	Repeat2,
	Settings,
	Trash2,
	Zap,
} from "lucide-react";
import {
	type FormEvent,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	type TranslatorLanguage,
	translatorService,
} from "@/services/translator.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { useTranslatorStore } from "@/store/translator.store";

const CUSTOM_LANGUAGE = "__custom__";
const LIVE_TRANSLATE_DELAY_MS = 700;

function getFallbackTargetLanguage(languageCode: string) {
	return languageCode === "en" ? "ru" : "en";
}

export function TranslatorPage() {
	const { showToast } = useToast();
	const endpoint = useTranslatorStore((state) => state.endpoint);
	const provider = useTranslatorStore((state) => state.provider);
	const [sourceText, setSourceText] = useState("");
	const [resultText, setResultText] = useState("");
	const [fromLanguage, setFromLanguage] = useState("auto");
	const [toLanguage, setToLanguage] = useState("en");
	const [customFromLanguage, setCustomFromLanguage] = useState("");
	const [customToLanguage, setCustomToLanguage] = useState("");
	const [languages, setLanguages] = useState<TranslatorLanguage[]>(
		translatorService.getFallbackLanguages(),
	);
	const [languagesLoading, setLanguagesLoading] = useState(false);
	const [languageWarning, setLanguageWarning] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [detectedLanguage, setDetectedLanguage] = useState("");
	const [liveTranslate, setLiveTranslate] = useState(true);
	const liveSignatureRef = useRef("");

	const resolvedFromLanguage =
		fromLanguage === CUSTOM_LANGUAGE ? customFromLanguage : fromLanguage;
	const resolvedToLanguage =
		toLanguage === CUSTOM_LANGUAGE ? customToLanguage : toLanguage;
	const canTranslate = Boolean(
		sourceText.trim() &&
			resolvedFromLanguage.trim() &&
			resolvedToLanguage.trim() &&
			resolvedToLanguage.trim().toLowerCase() !== "auto",
	);

	const languageOptions = useMemo(() => {
		const byCode = new Map<string, TranslatorLanguage>();

		for (const language of translatorService.getFallbackLanguages()) {
			byCode.set(language.code, language);
		}

		for (const language of languages) {
			byCode.set(language.code, language);
		}

		return Array.from(byCode.values()).sort((first, second) => {
			if (first.code === "auto") return -1;
			if (second.code === "auto") return 1;
			return first.name.localeCompare(second.name);
		});
	}, [languages]);

	const setLanguageSelection = useCallback(
		(side: "from" | "to", languageCode: string) => {
			const knownLanguage = languageOptions.some(
				(language) => language.code === languageCode,
			);

			if (side === "from") {
				setFromLanguage(knownLanguage ? languageCode : CUSTOM_LANGUAGE);
				setCustomFromLanguage(knownLanguage ? "" : languageCode);
				return;
			}

			setToLanguage(knownLanguage ? languageCode : CUSTOM_LANGUAGE);
			setCustomToLanguage(knownLanguage ? "" : languageCode);
		},
		[languageOptions],
	);

	const getLiveSignature = useCallback(
		(text = sourceText, from = resolvedFromLanguage, to = resolvedToLanguage) =>
			JSON.stringify([
				text.trim(),
				from.trim().toLowerCase(),
				to.trim().toLowerCase(),
			]),
		[sourceText, resolvedFromLanguage, resolvedToLanguage],
	);

	const getTranslationDirection = useCallback(() => {
		const detected = translatorService.detectLanguage(sourceText);
		const source = resolvedFromLanguage.trim().toLowerCase();
		const target = resolvedToLanguage.trim().toLowerCase();

		if (source === "auto") {
			const nextTarget =
				detected === target ? getFallbackTargetLanguage(detected) : target;

			setLanguageSelection("from", detected);
			if (nextTarget !== target) {
				setLanguageSelection("to", nextTarget);
			}

			return {
				fromLanguage: detected,
				toLanguage: nextTarget,
				detected,
				switched: true,
			};
		}

		const shouldSwap =
			detected === target && source !== target && Boolean(target);

		if (!shouldSwap) {
			return {
				fromLanguage: resolvedFromLanguage,
				toLanguage: resolvedToLanguage,
				detected,
				switched: false,
			};
		}

		setLanguageSelection("from", detected);
		setLanguageSelection("to", source);

		return {
			fromLanguage: detected,
			toLanguage: source,
			detected,
			switched: true,
		};
	}, [
		resolvedFromLanguage,
		resolvedToLanguage,
		setLanguageSelection,
		sourceText,
	]);

	const loadLanguages = async () => {
		if (provider === "mymemory") {
			setLanguages(translatorService.getFallbackLanguages());
			setLanguageWarning("");
			showToast("Popular languages are ready");
			return;
		}

		if (provider === "libretranslate" && !endpoint.trim()) {
			setLanguageWarning("LibreTranslate endpoint is not configured.");
			setLanguages(translatorService.getFallbackLanguages());
			return;
		}

		setLanguagesLoading(true);
		setLanguageWarning("");

		try {
			const remoteLanguages = await translatorService.getLanguages();
			setLanguages(remoteLanguages);
			showToast("Languages loaded");
		} catch (languageError) {
			setLanguageWarning(
				languageError instanceof Error
					? languageError.message
					: "Language list is unavailable. You can still type a language manually.",
			);
			setLanguages(translatorService.getFallbackLanguages());
		} finally {
			setLanguagesLoading(false);
		}
	};

	const translate = useCallback(
		async (event?: FormEvent, options?: { silent?: boolean }) => {
			event?.preventDefault();
			if (loading) return;

			if (!canTranslate) {
				setError("Enter text and choose a target language.");
				return;
			}

			setError("");
			setLoading(true);

			try {
				const direction = getTranslationDirection();
				liveSignatureRef.current = getLiveSignature(
					sourceText,
					direction.fromLanguage,
					direction.toLanguage,
				);
				const result = await translatorService.translate({
					text: sourceText,
					fromLanguage: direction.fromLanguage,
					toLanguage: direction.toLanguage,
				});

				setResultText(result.text);
				setDetectedLanguage(result.fromLanguage);
				if (!options?.silent) {
					showToast(
						direction.switched
							? `Direction switched: ${direction.fromLanguage.toUpperCase()} -> ${direction.toLanguage.toUpperCase()}`
							: "Translated",
					);
				}
			} catch (translationError) {
				setError(
					translationError instanceof Error
						? translationError.message
						: "Translation failed",
				);
			} finally {
				setLoading(false);
			}
		},
		[
			canTranslate,
			getLiveSignature,
			getTranslationDirection,
			loading,
			showToast,
			sourceText,
		],
	);

	useEffect(() => {
		if (!liveTranslate) return;

		if (!sourceText.trim()) {
			setResultText("");
			setDetectedLanguage("");
			setError("");
			liveSignatureRef.current = "";
			return;
		}

		if (loading || !canTranslate) return;

		const signature = getLiveSignature();
		if (signature === liveSignatureRef.current) return;

		const timer = window.setTimeout(() => {
			liveSignatureRef.current = signature;
			void translate(undefined, { silent: true });
		}, LIVE_TRANSLATE_DELAY_MS);

		return () => window.clearTimeout(timer);
	}, [
		canTranslate,
		getLiveSignature,
		liveTranslate,
		loading,
		sourceText,
		translate,
	]);

	const translateFromKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;

		event.preventDefault();
		void translate();
	};

	const clearTranslator = () => {
		setSourceText("");
		setResultText("");
		setError("");
		setDetectedLanguage("");
		liveSignatureRef.current = "";
	};

	const swapLanguages = () => {
		const nextFromLanguage = toLanguage;
		const nextCustomFromLanguage = customToLanguage;
		const nextToLanguage =
			resolvedFromLanguage === "auto" ? "en" : fromLanguage;
		const nextCustomToLanguage =
			resolvedFromLanguage === "auto" ? "" : customFromLanguage;

		setFromLanguage(nextFromLanguage);
		setToLanguage(nextToLanguage);
		setCustomFromLanguage(nextCustomFromLanguage);
		setCustomToLanguage(nextCustomToLanguage);
		setSourceText(resultText);
		setResultText(sourceText);
		setDetectedLanguage("");
	};

	const copyResult = async () => {
		if (!resultText.trim()) return;

		const copied = await copyToClipboard(resultText);
		showToast(copied ? "Result copied" : "Copy failed");
	};

	return (
		<div className="supportos-scroll flex h-full flex-col overflow-auto bg-background">
			<form
				onSubmit={translate}
				className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-6"
			>
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 className="text-2xl font-bold">Translator</h1>
						<p className="mt-1 text-sm text-muted">
							Quick translation with markdown and code block preservation.
						</p>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Link
							to="/settings/translator"
							className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
						>
							<Settings size={16} />
							Settings
						</Link>

						<button
							type="button"
							onClick={loadLanguages}
							disabled={loading || languagesLoading}
							className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							{languagesLoading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<Languages size={16} />
							)}
							Load Languages
						</button>

						<button
							type="button"
							onClick={swapLanguages}
							disabled={loading}
							className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
						>
							<Repeat2 size={16} />
							Swap Languages
						</button>

						<button
							type="button"
							onClick={clearTranslator}
							disabled={loading || (!sourceText && !resultText && !error)}
							className="rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
							title="Clear translator"
						>
							<Trash2 size={16} />
						</button>

						<button
							type="button"
							onClick={() => setLiveTranslate((value) => !value)}
							className={`rounded-md border p-2 transition-colors ${
								liveTranslate
									? "border-accent bg-accent/10 text-accent hover:bg-accent/15"
									: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
							}`}
							title={liveTranslate ? "Live translate on" : "Live translate off"}
							aria-pressed={liveTranslate}
						>
							<Zap size={16} />
						</button>

						<button
							type="submit"
							disabled={loading || !canTranslate}
							className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{loading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<Languages size={16} />
							)}
							Translate
						</button>
					</div>
				</div>

				{languageWarning && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
						{languageWarning}
					</div>
				)}

				{error && (
					<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
						{error}
					</div>
				)}

				<div className="grid gap-4 lg:grid-cols-2">
					<LanguagePanel
						title="From"
						value={fromLanguage}
						customValue={customFromLanguage}
						languages={languageOptions}
						allowAuto
						loading={languagesLoading}
						onChange={setFromLanguage}
						onCustomChange={setCustomFromLanguage}
						disabled={loading}
					/>

					<LanguagePanel
						title="To"
						value={toLanguage}
						customValue={customToLanguage}
						languages={languageOptions}
						allowAuto={false}
						loading={languagesLoading}
						onChange={setToLanguage}
						onCustomChange={setCustomToLanguage}
						disabled={loading}
					/>
				</div>

				<div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
					<div className="flex min-h-96 flex-col rounded-lg border border-border bg-surface">
						<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
							<div className="text-sm font-semibold">Source</div>
							{fromLanguage === "auto" && detectedLanguage && (
								<div className="rounded-full border border-border px-2 py-1 text-xs text-muted">
									Detected: {detectedLanguage.toUpperCase()}
								</div>
							)}
						</div>
						<textarea
							value={sourceText}
							onChange={(event) => setSourceText(event.target.value)}
							onKeyDown={translateFromKeyboard}
							disabled={loading}
							className="supportos-scroll min-h-96 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 outline-none disabled:cursor-not-allowed disabled:opacity-60"
							placeholder="Paste text, markdown, or code here..."
						/>
					</div>

					<div className="flex min-h-96 flex-col rounded-lg border border-border bg-surface">
						<div className="flex items-center justify-between border-b border-border px-4 py-3">
							<div className="text-sm font-semibold">Result</div>
							<button
								type="button"
								onClick={copyResult}
								disabled={loading || !resultText.trim()}
								className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
							>
								<Copy size={14} />
								Copy Result
							</button>
						</div>
						<textarea
							value={resultText}
							onChange={(event) => setResultText(event.target.value)}
							disabled={loading}
							className="supportos-scroll min-h-96 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 outline-none disabled:cursor-not-allowed disabled:opacity-60"
							placeholder="Translation result will appear here..."
						/>
					</div>
				</div>
			</form>
		</div>
	);
}

function LanguagePanel({
	title,
	value,
	customValue,
	languages,
	allowAuto,
	loading,
	onChange,
	onCustomChange,
	disabled,
}: {
	title: string;
	value: string;
	customValue: string;
	languages: TranslatorLanguage[];
	allowAuto: boolean;
	loading: boolean;
	onChange: (value: string) => void;
	onCustomChange: (value: string) => void;
	disabled: boolean;
}) {
	const options = allowAuto
		? languages
		: languages.filter((language) => language.code !== "auto");

	return (
		<div className="rounded-lg border border-border bg-surface p-4">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="text-sm font-semibold">{title}</div>
				{loading && (
					<div className="inline-flex items-center gap-1.5 text-xs text-muted">
						<Loader2 size={13} className="animate-spin" />
						Loading
					</div>
				)}
			</div>
			<div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
				<select
					value={value}
					onChange={(event) => onChange(event.target.value)}
					disabled={disabled}
					className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{options.map((language) => (
						<option key={language.code} value={language.code}>
							{language.name} ({language.code})
						</option>
					))}
					<option value={CUSTOM_LANGUAGE}>Custom...</option>
				</select>

				<input
					value={customValue}
					onChange={(event) => onCustomChange(event.target.value)}
					disabled={disabled || value !== CUSTOM_LANGUAGE}
					className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
					placeholder="Language code or name"
				/>
			</div>
		</div>
	);
}
