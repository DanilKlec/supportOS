import {
	createDetailsWidget,
	type ICustomerProfile,
	type IDetailsWidget,
} from "@livechat/agent-app-sdk";
import {
	Check,
	ChevronRight,
	Languages,
	Loader2,
	Search,
	Send,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Bind, BindTranslation } from "@/entities/bind";
import { languages } from "@/entities/language";
import { knowledgeService } from "@/services/knowledge.service";
import { searchBinds } from "@/shared/lib/bind-search";
import {
	applyTemplateVariables,
	extractTemplateVariables,
} from "@/shared/lib/template-variables";
import { useKnowledgeStore } from "@/store";

function isInsideIframe() {
	try {
		return window.self !== window.top;
	} catch {
		return true;
	}
}

function getPreferredTranslation(bind: Bind, language: string) {
	return (
		bind.translations.find((item) => item.language === language) ??
		bind.translations.find((item) => item.language === "en") ??
		bind.translations.find((item) => item.language === "ru") ??
		bind.translations[0]
	);
}

function getBindTitle(bind: Bind, language: string) {
	return getPreferredTranslation(bind, language)?.title || bind.slug;
}

function getBindLocation(
	bind: Bind,
	categories: ReturnType<typeof useKnowledgeStore.getState>["categories"],
	folders: ReturnType<typeof useKnowledgeStore.getState>["folders"],
) {
	const category = categories.find((item) => item.id === bind.categoryId)?.name;
	const folder = folders.find((item) => item.id === bind.folderId)?.name;
	return [category, folder].filter(Boolean).join(" / ");
}

function getSearchSnippet(bind: Bind, language: string, query: string) {
	const content = getPreferredTranslation(bind, language)
		?.content.replace(/\s+/g, " ")
		.trim();
	if (!content) return bind.tags.join(" · ") || bind.slug;

	const token = query.trim().toLowerCase().split(/\s+/).find(Boolean);
	const matchIndex = token ? content.toLowerCase().indexOf(token) : -1;
	const start = matchIndex > 45 ? matchIndex - 35 : 0;
	const snippet = content.slice(start, start + 115);
	return `${start > 0 ? "…" : ""}${snippet}${start + 115 < content.length ? "…" : ""}`;
}

export function LiveChatAssistantPage() {
	const widgetRef = useRef<IDetailsWidget | undefined>(undefined);
	const binds = useKnowledgeStore((state) => state.binds);
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const defaultLanguage = useKnowledgeStore((state) => state.language);
	const [profile, setProfile] = useState<ICustomerProfile | null>(null);
	const [connected, setConnected] = useState(false);
	const [connectionError, setConnectionError] = useState("");
	const [query, setQuery] = useState("");
	const [selectedBindId, setSelectedBindId] = useState<string>();
	const [language, setLanguage] = useState<string>(defaultLanguage);
	const [draft, setDraft] = useState("");
	const [variableValues, setVariableValues] = useState<Record<string, string>>(
		{},
	);
	const [inserting, setInserting] = useState(false);
	const [inserted, setInserted] = useState(false);

	const results = useMemo(
		() =>
			searchBinds(
				binds.filter((bind) => !bind.archived),
				query,
				{ categories, folders, language },
			).slice(0, 20),
		[binds, categories, folders, language, query],
	);
	const selectedBind = useMemo(
		() => binds.find((bind) => bind.id === selectedBindId),
		[binds, selectedBindId],
	);
	const selectedTranslation = selectedBind
		? getPreferredTranslation(selectedBind, language)
		: undefined;
	const availableLanguages = useMemo(
		() =>
			selectedBind
				? Array.from(
						new Set(
							selectedBind.translations
								.filter((item) => item.content.trim())
								.map((item) => item.language),
						),
					)
				: [],
		[selectedBind],
	);
	const templateVariables = useMemo(
		() => extractTemplateVariables(draft),
		[draft],
	);
	const unresolvedVariables = templateVariables.filter(
		(variable) => !variableValues[variable]?.trim(),
	);

	useEffect(() => {
		const selectionIsVisible = results.some(
			(bind) => bind.id === selectedBindId,
		);
		if ((!selectedBind || (query && !selectionIsVisible)) && results[0]) {
			setSelectedBindId(results[0].id);
		}
	}, [query, results, selectedBind, selectedBindId]);

	useEffect(() => {
		if (!selectedBind) return;

		const exactTranslation = selectedBind.translations.find(
			(item) => item.language === language && item.content.trim(),
		);
		const nextTranslation =
			exactTranslation ?? getPreferredTranslation(selectedBind, language);

		if (nextTranslation) {
			setLanguage(nextTranslation.language);
			setDraft(nextTranslation.content);
			setVariableValues({});
			setInserted(false);
		}
	}, [language, selectedBind]);

	useEffect(() => {
		if (!isInsideIframe()) {
			setConnectionError(
				"Preview mode. Add this URL as a LiveChat Details Widget to insert replies.",
			);
			return undefined;
		}

		let active = true;
		let widget: IDetailsWidget | undefined;
		const handleProfile = (nextProfile: ICustomerProfile) => {
			if (!active) return;
			setProfile(nextProfile);
			setInserted(false);
		};

		void createDetailsWidget()
			.then((createdWidget) => {
				if (!active) return;
				widget = createdWidget;
				widgetRef.current = createdWidget;
				setConnected(true);
				setProfile(createdWidget.getCustomerProfile());
				createdWidget.on("customer_profile", handleProfile);
			})
			.catch((error: unknown) => {
				if (!active) return;
				setConnectionError(
					error instanceof Error
						? error.message
						: "Unable to connect to LiveChat Agent App.",
				);
			});

		return () => {
			active = false;
			widget?.off("customer_profile", handleProfile);
			widgetRef.current = undefined;
		};
	}, []);

	const selectBind = (bind: Bind) => {
		const translation = getPreferredTranslation(bind, language);

		setSelectedBindId(bind.id);
		if (translation) {
			setLanguage(translation.language);
			setDraft(translation.content);
		}
		setVariableValues({});
		setInserted(false);
	};

	const selectTranslation = (translation: BindTranslation) => {
		setLanguage(translation.language);
		setDraft(translation.content);
		setVariableValues({});
		setInserted(false);
	};

	const insertIntoMessageBox = async () => {
		const widget = widgetRef.current;
		if (!widget || !draft.trim() || unresolvedVariables.length > 0) return;

		setInserting(true);
		try {
			await widget.putMessage(
				applyTemplateVariables(draft.trim(), variableValues),
			);
			if (selectedBind) knowledgeService.recordBindCopied(selectedBind.id);
			setInserted(true);
		} finally {
			setInserting(false);
		}
	};

	return (
		<div className="supportos-scroll min-h-screen overflow-auto bg-background p-3 text-foreground">
			<header className="mb-3 rounded-xl border border-border bg-surface p-3">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="font-semibold">SupportOS Knowledge</div>
						<div className="mt-0.5 text-[11px] text-muted">
							Find, review and insert an approved reply
						</div>
					</div>
					<span
						className={`rounded-full px-2 py-1 text-[11px] ${
							connected
								? "bg-emerald-500/15 text-emerald-300"
								: "bg-amber-500/15 text-amber-200"
						}`}
					>
						{connected ? "Connected" : "Preview"}
					</span>
				</div>
				<div className="mt-2 truncate text-xs text-muted">
					{profile
						? `${profile.name || "Customer"}${profile.email ? ` · ${profile.email}` : ""}`
						: connectionError || "Open a chat to load the customer profile."}
				</div>
			</header>

			<div className="relative mb-3">
				<Search
					size={16}
					className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
				/>
				<input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && results[0]) {
							event.preventDefault();
							selectBind(results[0]);
						}
						if (event.key === "Escape") setQuery("");
					}}
					placeholder="Search by topic, phrase or tag…"
					className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-9 text-sm outline-none focus:border-accent"
				/>
				{query ? (
					<button
						type="button"
						onClick={() => setQuery("")}
						className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-muted hover:text-foreground"
						aria-label="Clear search"
					>
						<X size={15} />
					</button>
				) : null}
			</div>

			<section className="mb-3 overflow-hidden rounded-xl border border-border bg-surface">
				<div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
					<span className="font-semibold uppercase text-muted">
						{query ? "Search results" : "Suggested replies"}
					</span>
					<span className="text-muted">{results.length}</span>
				</div>
				<div className="supportos-scroll max-h-64 overflow-auto p-1.5">
					{results.length ? (
						results.map((bind, index) => (
							<button
								type="button"
								key={bind.id}
								onClick={() => selectBind(bind)}
								className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${
									selectedBindId === bind.id
										? "bg-accent/15 text-foreground"
										: "text-muted hover:bg-surface-elevated hover:text-foreground"
								}`}
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="min-w-0 flex-1 truncate text-sm font-medium">
											{getBindTitle(bind, language)}
										</span>
										{query && index === 0 ? (
											<span className="shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent">
												Best
											</span>
										) : null}
									</div>
									<div className="mt-0.5 truncate text-[10px] font-medium text-muted">
										{getBindLocation(bind, categories, folders) || bind.slug}
									</div>
									<div className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">
										{getSearchSnippet(bind, language, query)}
									</div>
								</div>
								<ChevronRight size={15} className="shrink-0" />
							</button>
						))
					) : (
						<div className="px-5 py-8 text-center text-xs text-muted">
							<div className="font-medium text-foreground">Nothing found</div>
							<div className="mt-1 leading-4">
								Try fewer words, a tag, or part of the reply text.
							</div>
						</div>
					)}
				</div>
			</section>

			<section className="rounded-xl border border-border bg-surface p-3">
				<div className="mb-2 flex items-center justify-between gap-2">
					<div className="min-w-0">
						<div className="truncate text-sm font-semibold">
							{selectedTranslation?.title || "Select a reply"}
						</div>
						{selectedBind ? (
							<div className="mt-0.5 text-[11px] text-muted">
								{selectedBind.slug}
							</div>
						) : null}
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<Languages size={14} className="text-muted" />
						<select
							value={language}
							onChange={(event) => {
								const translation = selectedBind?.translations.find(
									(item) => item.language === event.target.value,
								);
								if (translation) selectTranslation(translation);
							}}
							disabled={!selectedBind}
							className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none"
						>
							{availableLanguages.map((code) => (
								<option key={code} value={code}>
									{languages.find((item) => item.code === code)?.name ??
										code.toUpperCase()}
								</option>
							))}
						</select>
					</div>
				</div>

				<textarea
					value={draft}
					onChange={(event) => {
						setDraft(event.target.value);
						setInserted(false);
					}}
					placeholder="Select a bind to preview its reply."
					className="min-h-44 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm leading-5 outline-none focus:border-accent"
				/>

				{templateVariables.length > 0 ? (
					<div className="mt-3 rounded-lg border border-border bg-background p-3">
						<div className="mb-2 text-xs font-semibold uppercase text-muted">
							Template variables
						</div>
						<div className="grid gap-2">
							{templateVariables.map((variable) => (
								<label key={variable} className="grid gap-1">
									<span className="text-[11px] text-muted">{variable}</span>
									<input
										value={variableValues[variable] ?? ""}
										onChange={(event) => {
											setVariableValues((current) => ({
												...current,
												[variable]: event.target.value,
											}));
											setInserted(false);
										}}
										placeholder={`Value for ${variable}`}
										className="h-9 rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-accent"
									/>
								</label>
							))}
						</div>
					</div>
				) : null}

				<button
					type="button"
					onClick={() => void insertIntoMessageBox()}
					disabled={
						!connected ||
						!draft.trim() ||
						inserting ||
						unresolvedVariables.length > 0
					}
					className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"
				>
					{inserting ? (
						<Loader2 size={17} className="animate-spin" />
					) : inserted ? (
						<Check size={17} />
					) : (
						<Send size={17} />
					)}
					{unresolvedVariables.length > 0
						? `Fill ${unresolvedVariables.length} variable${unresolvedVariables.length === 1 ? "" : "s"}`
						: inserted
							? "Inserted — review and send"
							: "Insert into Message Box"}
				</button>
			</section>
		</div>
	);
}
