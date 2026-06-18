import { Link, useNavigate } from "@tanstack/react-router";
import {
	Cloud,
	Download,
	FileSpreadsheet,
	Languages,
	LogIn,
	LogOut,
	Moon,
	Plus,
	Search,
	Settings,
	Sun,
	Upload,
} from "lucide-react";
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { PWAInstallButton } from "@/components/pwa/PWAInstallButton";
import type { Bind } from "@/entities/bind";
import { languages } from "@/entities/language";
import { knowledgeService } from "@/services/knowledge.service";
import { supabaseService } from "@/services/supabase.service";
import { supportOSExportService } from "@/services/supportos-export.service";
import { useToast } from "@/shared/hooks/useToast";
import { modalManager } from "@/shared/modals/modal.store";
import { type LanguageCode, useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";

function getBindTitle(bind: Bind, language: string) {
	return (
		bind.translations.find((translation) => translation.language === language)
			?.title ??
		bind.translations.find((translation) => translation.language === "ru")
			?.title ??
		bind.translations.find((translation) => translation.language === "en")
			?.title ??
		bind.slug
	);
}

export function Topbar() {
	const navigate = useNavigate();
	const [theme, setTheme] = useState<"dark" | "light">(() => {
		if (typeof window === "undefined") return "dark";

		return (
			(localStorage.getItem("supportos-theme") as "dark" | "light" | null) ??
			"dark"
		);
	});
	const [searchFocused, setSearchFocused] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);
	const importInputRef = useRef<HTMLInputElement>(null);
	const { showToast } = useToast();

	const authConfigured = useAuthStore((s) => s.configured);
	const authSession = useAuthStore((s) => s.session);
	const searchValue = useKnowledgeStore((s) => s.search);
	const setSearch = useKnowledgeStore((s) => s.setSearch);
	const language = useKnowledgeStore((s) => s.language);
	const setLanguage = useKnowledgeStore((s) => s.setLanguage);
	const activeTab = useKnowledgeStore((s) => s.activeTab);
	const categories = useKnowledgeStore((s) => s.categories);
	const folders = useKnowledgeStore((s) => s.folders);
	const selectedCategory = useKnowledgeStore((s) => s.selectedCategory);
	const selectedFolder = useKnowledgeStore((s) => s.selectedFolder);
	const binds = useKnowledgeStore((s) => s.binds);
	const openBind = useKnowledgeStore((s) => s.openBind);

	const searchQuery = searchValue.trim().toLowerCase();
	const searchResults = searchQuery
		? binds
				.filter((bind) => {
					if (bind.archived) return false;

					const translations = bind.translations
						.map((translation) => `${translation.title} ${translation.content}`)
						.join(" ");
					const haystack = [bind.slug, bind.tags.join(" "), translations]
						.join(" ")
						.toLowerCase();

					return haystack.includes(searchQuery);
				})
				.slice(0, 8)
		: [];

	const createBind = useCallback(() => {
		const categoryId = selectedCategory ?? categories[0]?.id;

		if (!categoryId) {
			showToast("Create a category first");
			return;
		}

		const selectedFolderEntity = folders.find(
			(folder) => folder.id === selectedFolder,
		);
		modalManager.open("createBind", {
			categoryId,
			folderId:
				selectedFolderEntity?.categoryId === categoryId
					? selectedFolderEntity.id
					: undefined,
		});
	}, [categories, folders, selectedCategory, selectedFolder, showToast]);

	const toggleTheme = () => {
		const next = theme === "dark" ? "light" : "dark";

		setTheme(next);

		document.documentElement.classList.toggle("dark", next === "dark");

		localStorage.setItem("supportos-theme", next);
	};

	const cycleLanguage = () => {
		const enabled = languages.map((item) => item.code as LanguageCode);
		const index = enabled.indexOf(language);
		const next = enabled[(index + 1) % enabled.length] ?? "ru";

		setLanguage(next);
		showToast(`Language: ${next.toUpperCase()}`);
	};

	const exportJson = () => {
		const blob = new Blob([supportOSExportService.exportJson()], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");

		link.href = url;
		link.download = `supportos-${new Date().toISOString().slice(0, 10)}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
		showToast("SupportOS JSON exported");
	};

	const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];

		if (!file) return;

		try {
			const text = await file.text();

			supportOSExportService.importJson(text);
			showToast("SupportOS JSON imported");
		} catch {
			showToast("Import failed");
		} finally {
			event.target.value = "";
		}
	};

	const signOut = async () => {
		await supabaseService.signOut();
		await knowledgeService.loadKnowledge();
		showToast("Signed out");
	};

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;

			const key = event.key.toLowerCase();

			if (key === "f" || key === "p") {
				event.preventDefault();
				searchInputRef.current?.focus();
				searchInputRef.current?.select();
			}

			if (key === "n") {
				event.preventDefault();
				createBind();
			}

			if (key === "d" && activeTab) {
				event.preventDefault();
				const favorite = knowledgeService.toggleFavorite(activeTab);

				showToast(favorite ? "Added to favorites" : "Removed from favorites");
			}

			if (key === "s") {
				event.preventDefault();

				const detail = { handled: false };

				window.dispatchEvent(
					new CustomEvent("supportos:save-active-bind", {
						detail,
					}),
				);

				if (!detail.handled) {
					knowledgeService.saveKnowledge();
					showToast("Saved");
				}
			}
		};

		window.addEventListener("keydown", handler);

		return () => window.removeEventListener("keydown", handler);
	}, [activeTab, createBind, showToast]);

	return (
		<header className="flex h-14 items-center justify-between border-b border-border bg-surface px-5">
			<div className="flex items-center gap-3">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
					S
				</div>

				<div>
					<div className="font-semibold">SupportOS</div>

					<div className="text-xs text-muted">Knowledge Workspace</div>
				</div>
			</div>

			<div className="flex flex-1 justify-center px-10">
				<div className="relative w-full max-w-xl">
					<Search size={16} className="absolute left-3 top-3 text-muted" />

					<input
						ref={searchInputRef}
						value={searchValue}
						onChange={(event) => setSearch(event.target.value)}
						onFocus={() => setSearchFocused(true)}
						onBlur={() => {
							window.setTimeout(() => setSearchFocused(false), 120);
						}}
						className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="Search binds..."
					/>

					{searchFocused && searchValue.trim() && (
						<div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
							{searchResults.length > 0 ? (
								searchResults.map((bind) => (
									<button
										key={bind.id}
										type="button"
										onMouseDown={(event) => {
											event.preventDefault();
											openBind(bind.id);
											void navigate({ to: "/" });
											setSearchFocused(false);
										}}
										className="block w-full border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-elevated"
									>
										<div className="truncate text-sm font-medium">
											{getBindTitle(bind, language)}
										</div>

										<div className="mt-1 truncate text-xs text-muted">
											{bind.slug}
											{bind.tags.length > 0 ? ` - ${bind.tags.join(", ")}` : ""}
										</div>
									</button>
								))
							) : (
								<div className="px-4 py-3 text-sm text-muted">
									Nothing found
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			<div className="flex items-center gap-2">
				<button
					type="button"
					title="New bind"
					onClick={createBind}
					className="rounded-lg p-2 hover:bg-surface-elevated"
				>
					<Plus size={18} />
				</button>

				<Link
					to="/import/google-sheets"
					title="Import Google Sheets"
					className="rounded-lg p-2 hover:bg-surface-elevated"
				>
					<FileSpreadsheet size={18} />
				</Link>

				<button
					type="button"
					title="Import JSON"
					onClick={() => importInputRef.current?.click()}
					className="rounded-lg p-2 hover:bg-surface-elevated"
				>
					<Upload size={18} />
				</button>

				<input
					ref={importInputRef}
					type="file"
					accept="application/json,.json"
					className="hidden"
					onChange={importJson}
				/>

				<button
					type="button"
					title="Export JSON"
					onClick={exportJson}
					className="rounded-lg p-2 hover:bg-surface-elevated"
				>
					<Download size={18} />
				</button>

				<button
					type="button"
					title="Switch language"
					onClick={cycleLanguage}
					className="rounded-lg p-2 hover:bg-surface-elevated"
				>
					<Languages size={18} />
				</button>

				<Link
					to="/settings/translator"
					title="Translator settings"
					className="rounded-lg p-2 hover:bg-surface-elevated"
				>
					<Settings size={18} />
				</Link>

				{authConfigured &&
					(authSession ? (
						<button
							type="button"
							title={`Cloud: ${authSession.user.email}`}
							onClick={signOut}
							className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs hover:bg-surface-elevated"
						>
							<Cloud size={16} />
							<LogOut size={16} />
						</button>
					) : (
						<Link
							to="/login"
							title="Cloud login"
							className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs hover:bg-surface-elevated"
						>
							<Cloud size={16} />
							<LogIn size={16} />
						</Link>
					))}

				<PWAInstallButton />

				<button
					type="button"
					title="Toggle theme"
					className="rounded-lg p-2 hover:bg-surface-elevated"
					onClick={toggleTheme}
				>
					{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
				</button>
			</div>
		</header>
	);
}
