import {
	Copy,
	Edit3,
	Files,
	History,
	Pin,
	Search,
	Star,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Bind, BindTranslation } from "@/entities/bind";
import { languages } from "@/entities/language";
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
	const { showToast } = useToast();

	const translation = useMemo(() => {
		if (!bind) return undefined;

		return getTranslation(bind, language);
	}, [bind, language]);

	const title = translation?.title || bind?.slug || "";

	const copyTranslation = async (item?: BindTranslation) => {
		if (!bind || !item) return;

		if (extractTemplateVariables(item.content).length > 0) {
			modalManager.open("copyBind", {
				bindId: bind.id,
				language: item.language,
			});
			return;
		}

		const ok = await copyToClipboard(item.content);

		addRecent(bind.id);
		if (ok) {
			knowledgeService.recordBindCopied(bind.id);
		}
		showToast(ok ? "Copied to clipboard" : "Copy failed");
	};

	const copyContent = () => copyTranslation(translation);

	const copyTitle = async () => {
		if (!bind) return;

		const ok = await copyToClipboard(title);

		addRecent(bind.id);
		showToast(ok ? "Title copied to clipboard" : "Copy failed");
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

		showToast("Bind duplicated", {
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
				Select bind
			</div>
		);
	}

	return (
		<div className="flex flex-1 overflow-auto">
			<div className={`mx-auto w-full ${contentWidthClass} p-8`}>
				<div className="mb-8 flex items-start justify-between gap-6">
					<div className="min-w-0 flex-1">
						<div className="mb-3 flex flex-wrap items-center gap-2">
							{bind.favorite && (
								<span className="rounded-full border border-yellow-400/40 px-3 py-1 text-xs text-yellow-300">
									Favorite
								</span>
							)}

							<span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
								{translation.language.toUpperCase()}
							</span>
							{bind.pinned && (
								<span className="rounded-full border border-accent/40 px-3 py-1 text-xs text-accent">
									Pinned
								</span>
							)}
						</div>

						<div className="flex min-w-0 items-center gap-2">
							<h1 className="min-w-0 truncate text-3xl font-bold">{title}</h1>

							<button
								type="button"
								onClick={copyTitle}
								title="Copy title"
								className="shrink-0 rounded-md border border-border p-1.5 text-muted transition hover:bg-surface-elevated hover:text-foreground"
							>
								<Copy size={16} />
							</button>
						</div>

						<p className="mt-2 text-sm text-muted">{bind.slug}</p>
					</div>

					<div className="flex shrink-0 gap-2">
						<button
							type="button"
							onClick={copyContent}
							title="Copy content (C)"
							className="rounded-lg border border-border p-2 transition hover:bg-surface-elevated"
						>
							<Copy size={18} />
						</button>

						<button
							type="button"
							onClick={toggleFavorite}
							title="Favorite (F)"
							className="rounded-lg border border-border p-2 transition hover:bg-surface-elevated"
						>
							<Star size={18} fill={bind.favorite ? "currentColor" : "none"} />
						</button>

						<button
							type="button"
							onClick={togglePinned}
							title="Pin in folder (P)"
							className="rounded-lg border border-border p-2 transition hover:bg-surface-elevated"
						>
							<Pin size={18} fill={bind.pinned ? "currentColor" : "none"} />
						</button>

						<button
							type="button"
							onClick={duplicateBind}
							title="Duplicate bind (D)"
							className="rounded-lg border border-border p-2 transition hover:bg-surface-elevated"
						>
							<Files size={18} />
						</button>

						<button
							type="button"
							onClick={showHistory}
							title="History"
							className="rounded-lg border border-border p-2 transition hover:bg-surface-elevated"
						>
							<History size={18} />
						</button>

						<button
							type="button"
							onClick={findDuplicates}
							title="Find duplicates"
							className="rounded-lg border border-border p-2 transition hover:bg-surface-elevated"
						>
							<Search size={18} />
						</button>

						<button
							type="button"
							onClick={editBind}
							title="Edit bind (E)"
							className="rounded-lg border border-border p-2 transition hover:bg-surface-elevated"
						>
							<Edit3 size={18} />
						</button>

						<button
							type="button"
							onClick={deleteBind}
							title="Delete"
							className="rounded-lg border border-border p-2 transition hover:bg-surface-elevated hover:text-red-400"
						>
							<Trash2 size={18} />
						</button>
					</div>
				</div>

				<div className="mb-6 flex flex-wrap gap-2">
					{languages.map((item) => {
						const code = item.code as LanguageCode;
						const exists = bind.translations.some(
							(itemTranslation) => itemTranslation.language === code,
						);

						return (
							<button
								key={code}
								type="button"
								onClick={() => setLanguage(code)}
								className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
									language === code
										? "border-accent bg-accent text-accent-foreground"
										: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
								} ${exists ? "" : "opacity-60"}`}
							>
								{code.toUpperCase()}
							</button>
						);
					})}
				</div>

				{bind.tags.length > 0 && (
					<div className="mb-6 flex flex-wrap gap-2">
						{bind.tags.map((tag) => (
							<div
								key={tag}
								className="rounded-full border border-border px-3 py-1 text-xs"
							>
								#{tag}
							</div>
						))}
					</div>
				)}

				<div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
							Quality
						</div>
						{qualityIssues.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{qualityIssues.map((issue) => (
									<span
										key={issue}
										className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-200"
									>
										{issue}
									</span>
								))}
							</div>
						) : (
							<p className="text-sm text-muted">No obvious issues</p>
						)}
					</div>

					<div className="rounded-lg border border-border bg-surface p-4">
						<div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
							Usage
						</div>
						<div className="text-sm">
							{bind.copyCount ?? 0} copies
							{bind.lastCopiedAt ? (
								<div className="mt-1 text-xs text-muted">
									Last: {new Date(bind.lastCopiedAt).toLocaleString()}
								</div>
							) : null}
						</div>
					</div>
				</div>

				<div className="mb-6 rounded-lg border border-border bg-surface p-4">
					<div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
						Translations
					</div>

					<div className="grid gap-2 sm:grid-cols-2">
						{bind.translations.map((item) => (
							<div
								key={item.language}
								className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
							>
								<button
									type="button"
									onClick={() => setLanguage(item.language as LanguageCode)}
									className="min-w-0 flex-1 text-left hover:text-accent"
								>
									<div className="text-xs font-semibold uppercase text-muted">
										{item.language}
									</div>

									<div className="truncate text-sm">
										{item.title || bind.slug}
									</div>
								</button>

								<button
									type="button"
									onClick={() => void copyTranslation(item)}
									title={`Copy ${item.language.toUpperCase()}`}
									className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-elevated hover:text-foreground"
								>
									<Copy size={15} />
								</button>
							</div>
						))}
					</div>
				</div>

				<div className="rounded-lg border border-border bg-surface p-8">
					<div className="prose max-w-none leading-8 dark:prose-invert">
						<ReactMarkdown remarkPlugins={[remarkGfm]}>
							{translation.content}
						</ReactMarkdown>
					</div>
				</div>
			</div>
		</div>
	);
}
