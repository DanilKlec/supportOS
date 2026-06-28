import { useNavigate } from "@tanstack/react-router";
import {
	Download,
	FileText,
	FolderPlus,
	Search,
	Settings,
	ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Bind } from "@/entities/bind";
import { useToast } from "@/shared/hooks/useToast";
import { modalManager } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";

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

export function CommandPalette() {
	const navigate = useNavigate();
	const inputRef = useRef<HTMLInputElement>(null);
	const { showToast } = useToast();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const binds = useKnowledgeStore((state) => state.binds);
	const categories = useKnowledgeStore((state) => state.categories);
	const selectedCategory = useKnowledgeStore((state) => state.selectedCategory);
	const selectedFolder = useKnowledgeStore((state) => state.selectedFolder);
	const folders = useKnowledgeStore((state) => state.folders);
	const language = useKnowledgeStore((state) => state.language);
	const openBind = useKnowledgeStore((state) => state.openBind);
	const normalizedQuery = query.trim().toLowerCase();
	const bindResults = useMemo(
		() =>
			normalizedQuery
				? binds
						.filter((bind) => {
							if (bind.archived) return false;

							const translations = bind.translations
								.map(
									(translation) =>
										`${translation.title} ${translation.content}`,
								)
								.join(" ");
							const haystack = [bind.slug, bind.tags.join(" "), translations]
								.join(" ")
								.toLowerCase();

							return haystack.includes(normalizedQuery);
						})
						.slice(0, 8)
				: binds.filter((bind) => !bind.archived).slice(0, 5),
		[binds, normalizedQuery],
	);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (
				(!event.ctrlKey && !event.metaKey) ||
				event.key.toLowerCase() !== "k"
			) {
				return;
			}

			event.preventDefault();
			setOpen(true);
			window.setTimeout(() => inputRef.current?.focus(), 0);
		};

		window.addEventListener("keydown", handler);

		return () => window.removeEventListener("keydown", handler);
	}, []);

	useEffect(() => {
		if (!open) return undefined;

		const handler = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
			}
		};

		window.addEventListener("keydown", handler);

		return () => window.removeEventListener("keydown", handler);
	}, [open]);

	if (!open) return null;

	const close = () => {
		setOpen(false);
		setQuery("");
	};
	const createBind = () => {
		const categoryId = selectedCategory ?? categories[0]?.id;

		if (!categoryId) {
			showToast("Create a category first");
			return;
		}

		const folder = folders.find((item) => item.id === selectedFolder);

		modalManager.open("createBind", {
			categoryId,
			folderId: folder?.categoryId === categoryId ? folder.id : undefined,
		});
		close();
	};
	const runFindDuplicates = () => {
		modalManager.open("findDuplicates");
		close();
	};
	const exportCurrentScope = () => {
		const folder = folders.find((item) => item.id === selectedFolder);
		const categoryId =
			folder?.categoryId ?? selectedCategory ?? categories[0]?.id;
		const category = categories.find((item) => item.id === categoryId);
		const folderIds = new Set<string>();

		if (folder) {
			folderIds.add(folder.id);

			let changed = true;

			while (changed) {
				changed = false;

				for (const item of folders) {
					if (
						item.parentId &&
						folderIds.has(item.parentId) &&
						!folderIds.has(item.id)
					) {
						folderIds.add(item.id);
						changed = true;
					}
				}
			}
		}

		const exportedFolders = folder
			? folders.filter((item) => folderIds.has(item.id))
			: folders.filter((item) => item.categoryId === categoryId);
		const exportedFolderIds = new Set(exportedFolders.map((item) => item.id));
		const exportedBinds = binds.filter((bind) =>
			folder
				? Boolean(bind.folderId) && exportedFolderIds.has(bind.folderId)
				: bind.categoryId === categoryId,
		);
		const blob = new Blob(
			[
				JSON.stringify(
					{
						categories: category ? [category] : [],
						folders: exportedFolders,
						binds: exportedBinds,
					},
					null,
					2,
				),
			],
			{ type: "application/json" },
		);
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");

		anchor.href = url;
		anchor.download = `${folder?.name ?? category?.name ?? "supportos-export"}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
		close();
	};
	const goTo = (to: "/" | "/settings") => {
		void navigate({ to });
		close();
	};
	const openResult = (bind: Bind) => {
		openBind(bind.id);
		void navigate({ to: "/" });
		close();
	};

	return (
		<div className="fixed inset-0 z-50 bg-black/50 p-4 backdrop-blur-sm">
			<button
				type="button"
				aria-label="Close command palette"
				className="absolute inset-0 h-full w-full cursor-default"
				onClick={close}
			/>
			<div className="relative mx-auto mt-20 w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
				<div className="flex items-center gap-3 border-b border-border px-4 py-3">
					<Search size={18} className="text-muted" />
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search or run command"
						className="h-9 flex-1 bg-transparent text-sm outline-none"
					/>
				</div>

				<div className="max-h-[60vh] overflow-auto py-2">
					<PaletteButton
						icon={<FolderPlus size={16} />}
						title="New bind"
						subtitle="Create in current category or folder"
						onClick={createBind}
					/>
					<PaletteButton
						icon={<ShieldCheck size={16} />}
						title="Check duplicates"
						subtitle="Find binds with repeated content"
						onClick={runFindDuplicates}
					/>
					<PaletteButton
						icon={<Download size={16} />}
						title="Export current scope"
						subtitle="Download selected folder or category as JSON"
						onClick={exportCurrentScope}
					/>
					<PaletteButton
						icon={<Settings size={16} />}
						title="Settings"
						subtitle="Open app settings"
						onClick={() => goTo("/settings")}
					/>

					<div className="mt-2 border-t border-border pt-2">
						{bindResults.map((bind) => (
							<PaletteButton
								key={bind.id}
								icon={<FileText size={16} />}
								title={getBindTitle(bind, language)}
								subtitle={bind.slug}
								onClick={() => openResult(bind)}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function PaletteButton({
	icon,
	title,
	subtitle,
	onClick,
}: {
	icon: ReactNode;
	title: string;
	subtitle: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-elevated"
		>
			<span className="text-muted">{icon}</span>
			<span className="min-w-0">
				<span className="block truncate text-sm font-medium">{title}</span>
				<span className="block truncate text-xs text-muted">{subtitle}</span>
			</span>
		</button>
	);
}
