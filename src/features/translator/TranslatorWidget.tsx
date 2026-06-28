import { useRouterState } from "@tanstack/react-router";
import {
	Copy,
	Languages,
	Loader2,
	Repeat2,
	Trash2,
	X,
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

const CUSTOM_LANGUAGE = "__custom__";
const LIVE_TRANSLATE_DELAY_MS = 700;

function getFallbackTargetLanguage(languageCode: string) {
	return languageCode === "en" ? "ru" : "en";
}

function isTranslatorPage(pathname: string) {
	return pathname === "/translator" || pathname === "/settings/translator";
}

export function TranslatorWidget() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const { showToast } = useToast();
	const [open, setOpen] = useState(false);
	const [sourceText, setSourceText] = useState("");
	const [resultText, setResultText] = useState("");
	const [fromLanguage, setFromLanguage] = useState("auto");
	const [toLanguage, setToLanguage] = useState("en");
	const [customFromLanguage, setCustomFromLanguage] = useState("");
	const [customToLanguage, setCustomToLanguage] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [detectedLanguage, setDetectedLanguage] = useState("");
	const [liveTranslate, setLiveTranslate] = useState(true);
	const autoManagedFromRef = useRef(true);
	const liveSignatureRef = useRef("");
	const languages = useMemo(() => translatorService.getFallbackLanguages(), []);
	const isHiddenOnCurrentPage = isTranslatorPage(pathname);

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

	const setLanguageSelection = useCallback(
		(side: "from" | "to", languageCode: string) => {
			const knownLanguage = languages.some(
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
		[languages],
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

	const handleFromLanguageChange = useCallback((languageCode: string) => {
		autoManagedFromRef.current = languageCode === "auto";
		setFromLanguage(languageCode);
		setDetectedLanguage("");
	}, []);

	const handleCustomFromLanguageChange = useCallback((languageCode: string) => {
		autoManagedFromRef.current = false;
		setCustomFromLanguage(languageCode);
	}, []);

	const getTranslationDirection = useCallback(() => {
		const detected = translatorService.detectLanguage(sourceText);
		const source = resolvedFromLanguage.trim().toLowerCase();
		const target = resolvedToLanguage.trim().toLowerCase();

		if (source === "auto") {
			const nextTarget =
				detected === target ? getFallbackTargetLanguage(detected) : target;

			autoManagedFromRef.current = true;
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

		const shouldCorrectSource =
			fromLanguage !== CUSTOM_LANGUAGE &&
			detected !== source &&
			Boolean(source);

		if (shouldCorrectSource) {
			autoManagedFromRef.current = true;
			setLanguageSelection("from", detected);
			setLanguageSelection("to", source);

			return {
				fromLanguage: detected,
				toLanguage: source,
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
		fromLanguage,
		setLanguageSelection,
		sourceText,
	]);

	useEffect(() => {
		if (!sourceText.trim()) {
			setDetectedLanguage("");
			return;
		}

		const detected = translatorService.detectLanguage(sourceText);
		setDetectedLanguage(detected);

		const source = resolvedFromLanguage.trim().toLowerCase();
		const target = resolvedToLanguage.trim().toLowerCase();
		const shouldCorrectSource =
			fromLanguage !== CUSTOM_LANGUAGE &&
			detected !== source &&
			Boolean(source);

		if (
			!(fromLanguage === "auto" || autoManagedFromRef.current) &&
			!shouldCorrectSource
		) {
			return;
		}

		const nextTarget = shouldCorrectSource
			? source
			: detected === target
				? getFallbackTargetLanguage(detected)
				: target;

		if (source !== detected) {
			autoManagedFromRef.current = true;
			setLanguageSelection("from", detected);
		}

		if (nextTarget && nextTarget !== target) {
			setLanguageSelection("to", nextTarget);
		}
	}, [
		fromLanguage,
		resolvedFromLanguage,
		resolvedToLanguage,
		setLanguageSelection,
		sourceText,
	]);

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
				if (direction.switched && !options?.silent) {
					showToast(
						`Direction switched: ${direction.fromLanguage.toUpperCase()} -> ${direction.toLanguage.toUpperCase()}`,
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
		if (isHiddenOnCurrentPage || !open || !liveTranslate) return;

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
		isHiddenOnCurrentPage,
		liveTranslate,
		loading,
		open,
		sourceText,
		translate,
	]);

	const translateFromKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== "Enter" || event.shiftKey) return;

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
		autoManagedFromRef.current = false;
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

	if (isHiddenOnCurrentPage) return null;

	return (
		<div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-3">
			{open && (
				<form
					onSubmit={translate}
					className="flex max-h-[calc(100vh-6rem)] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
				>
					<div className="flex items-center justify-between border-b border-border px-4 py-3">
						<div className="flex items-center gap-2">
							<Languages size={17} className="text-accent" />
							<div className="text-sm font-semibold">Quick Translator</div>
						</div>

						<button
							type="button"
							onClick={() => setOpen(false)}
							className="rounded-md p-1 text-muted hover:bg-surface-elevated hover:text-foreground"
							title="Close translator"
						>
							<X size={17} />
						</button>
					</div>

					<div className="supportos-scroll space-y-3 overflow-auto p-4">
						<div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
							<WidgetLanguageSelect
								label="From"
								value={fromLanguage}
								customValue={customFromLanguage}
								languages={languages}
								allowAuto
								disabled={loading}
								onChange={handleFromLanguageChange}
								onCustomChange={handleCustomFromLanguageChange}
							/>

							<button
								type="button"
								onClick={swapLanguages}
								disabled={loading}
								className="mb-0.5 rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
								title="Swap languages"
							>
								<Repeat2 size={16} />
							</button>

							<WidgetLanguageSelect
								label="To"
								value={toLanguage}
								customValue={customToLanguage}
								languages={languages}
								allowAuto={false}
								disabled={loading}
								onChange={setToLanguage}
								onCustomChange={setCustomToLanguage}
							/>
						</div>

						<textarea
							value={sourceText}
							onChange={(event) => setSourceText(event.target.value)}
							onKeyDown={translateFromKeyboard}
							disabled={loading}
							className="supportos-scroll h-28 w-full resize-none rounded-md border border-border bg-background p-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
							placeholder="Text to translate..."
						/>

						{fromLanguage === "auto" && detectedLanguage && (
							<div className="text-xs text-muted">
								Detected: {detectedLanguage.toUpperCase()}
							</div>
						)}

						{error && (
							<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
								{error}
							</div>
						)}

						<textarea
							value={resultText}
							onChange={(event) => setResultText(event.target.value)}
							disabled={loading}
							className="supportos-scroll h-28 w-full resize-none rounded-md border border-border bg-background p-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
							placeholder="Result..."
						/>
					</div>

					<div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={copyResult}
								disabled={loading || !resultText.trim()}
								className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
							>
								<Copy size={15} />
								Copy
							</button>

							<button
								type="button"
								onClick={clearTranslator}
								disabled={loading || (!sourceText && !resultText && !error)}
								className="rounded-md border border-border p-2 text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
								title="Clear translator"
							>
								<Trash2 size={15} />
							</button>

							<button
								type="button"
								onClick={() => setLiveTranslate((value) => !value)}
								className={`rounded-md border p-2 transition-colors ${
									liveTranslate
										? "border-accent bg-accent/10 text-accent hover:bg-accent/15"
										: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
								}`}
								title={
									liveTranslate ? "Live translate on" : "Live translate off"
								}
								aria-pressed={liveTranslate}
							>
								<Zap size={15} />
							</button>
						</div>

						<button
							type="submit"
							disabled={loading || !canTranslate}
							className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
							title="Translate"
						>
							{loading ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<Languages size={16} />
							)}
							Translate
						</button>
					</div>
				</form>
			)}

			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
				title={open ? "Close translator" : "Open translator"}
			>
				{open ? <X size={24} /> : <Languages size={24} />}
			</button>
		</div>
	);
}

function WidgetLanguageSelect({
	label,
	value,
	customValue,
	languages,
	allowAuto,
	disabled,
	onChange,
	onCustomChange,
}: {
	label: string;
	value: string;
	customValue: string;
	languages: TranslatorLanguage[];
	allowAuto: boolean;
	disabled: boolean;
	onChange: (value: string) => void;
	onCustomChange: (value: string) => void;
}) {
	const options = allowAuto
		? languages
		: languages.filter((language) => language.code !== "auto");

	return (
		<label className="min-w-0 space-y-1">
			<span className="text-xs font-medium text-muted">{label}</span>
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				disabled={disabled}
				className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{options.map((language) => (
					<option key={language.code} value={language.code}>
						{language.name}
					</option>
				))}
				<option value={CUSTOM_LANGUAGE}>Custom</option>
			</select>

			{value === CUSTOM_LANGUAGE && (
				<input
					value={customValue}
					onChange={(event) => onCustomChange(event.target.value)}
					disabled={disabled}
					className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
					placeholder="Code or name"
				/>
			)}
		</label>
	);
}
