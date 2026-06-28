import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";

import type { Bind, BindTranslation } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import { languages } from "@/entities/language";
import {
	knowledgeService,
	type RestoreDeletedItemsInput,
} from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import {
	applyTemplateVariables,
	extractTemplateVariables,
} from "@/shared/lib/template-variables";
import { useModalStore } from "@/shared/modals/modal.store";
import { useKnowledgeStore } from "@/store";

import { BaseModal } from "./BaseModal";
import type {
	ActiveModal,
	KnowledgeObjectType,
	ModalPayload,
} from "./modal.types";

type FieldErrors = Record<string, string>;

interface TranslationDraft {
	language: string;
	title: string;
	content: string;
}

const DEFAULT_BIND_LANGUAGES = ["ru", "en", "de", "pt", "el"];
const COLOR_SWATCHES = [
	"#3B82F6",
	"#10B981",
	"#F59E0B",
	"#EF4444",
	"#8B5CF6",
	"#EC4899",
];

const inputClass =
	"w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60";
const textareaClass =
	"min-h-40 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60";

export function ModalRoot() {
	const activeModal = useModalStore((state) => state.activeModal);
	const closeModal = useModalStore((state) => state.closeModal);

	if (!activeModal) return null;

	const key = [
		activeModal.type,
		activeModal.payload?.bindId,
		activeModal.payload?.id,
		activeModal.payload?.categoryId,
		activeModal.payload?.folderId,
		activeModal.payload?.parentId,
		activeModal.payload?.language,
	]
		.filter(Boolean)
		.join(":");

	return (
		<ModalContent
			key={key || activeModal.type}
			activeModal={activeModal}
			onClose={closeModal}
		/>
	);
}

function ModalContent({
	activeModal,
	onClose,
}: {
	activeModal: ActiveModal;
	onClose: () => void;
}) {
	const payload = activeModal.payload ?? {};

	if (activeModal.type === "createCategory") {
		return <CreateCategoryModal onClose={onClose} />;
	}

	if (activeModal.type === "createFolder") {
		return <CreateFolderModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "renameNode") {
		return <RenameModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "deleteNode") {
		return <DeleteModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "moveBind") {
		return <MoveBindModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "copyBind") {
		return <CopyBindModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "bindHistory") {
		return <BindHistoryModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "findDuplicates") {
		return <FindDuplicatesModal payload={payload} onClose={onClose} />;
	}

	if (activeModal.type === "createBind") {
		return <BindFormModal mode="create" payload={payload} onClose={onClose} />;
	}

	return <BindFormModal mode="edit" payload={payload} onClose={onClose} />;
}

function CreateCategoryModal({ onClose }: { onClose: () => void }) {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const [name, setName] = useState("");
	const [icon, setIcon] = useState("");
	const [color, setColor] = useState("");
	const [errors, setErrors] = useState<FieldErrors>({});
	const [saving, setSaving] = useState(false);

	const submit = (event: FormEvent) => {
		event.preventDefault();

		const nextErrors: FieldErrors = {};
		const trimmedName = name.trim();

		if (!trimmedName) {
			nextErrors.name = "Name is required";
		}

		if (Object.keys(nextErrors).length > 0) {
			setErrors(nextErrors);
			return;
		}

		setSaving(true);

		try {
			knowledgeService.createCategory({
				name: trimmedName,
				icon: optional(icon),
				color: optional(color),
			});
			showToast("Category created");
			void navigate({ to: "/" });
			onClose();
		} catch (error) {
			setErrors({ form: getErrorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal title="Create category" onClose={onClose} closeDisabled={saving}>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={errors.form} />

				<Field label="Name" error={errors.name}>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						disabled={saving}
						className={inputClass}
					/>
				</Field>

				<Field label="Icon" hint="Optional">
					<input
						value={icon}
						onChange={(event) => setIcon(event.target.value)}
						disabled={saving}
						className={inputClass}
						placeholder="Shield"
					/>
				</Field>

				<ColorField value={color} onChange={setColor} disabled={saving} />

				<ModalActions submitLabel="Create" saving={saving} onCancel={onClose} />
			</form>
		</BaseModal>
	);
}

function CreateFolderModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const selectedCategory = useKnowledgeStore((state) => state.selectedCategory);
	const [name, setName] = useState("");
	const [categoryId, setCategoryId] = useState(
		payload.categoryId ?? selectedCategory ?? categories[0]?.id ?? "",
	);
	const [parentId, setParentId] = useState(payload.parentId ?? "");
	const [icon, setIcon] = useState("");
	const [color, setColor] = useState("");
	const [errors, setErrors] = useState<FieldErrors>({});
	const [saving, setSaving] = useState(false);

	const availableParents = useMemo(
		() => folders.filter((folder) => folder.categoryId === categoryId),
		[categoryId, folders],
	);

	useEffect(() => {
		if (
			parentId &&
			!availableParents.some((folder) => folder.id === parentId)
		) {
			setParentId("");
		}
	}, [availableParents, parentId]);

	const submit = (event: FormEvent) => {
		event.preventDefault();

		const nextErrors: FieldErrors = {};
		const trimmedName = name.trim();

		if (!trimmedName) {
			nextErrors.name = "Name is required";
		}

		if (!categoryId) {
			nextErrors.categoryId = "Category is required";
		}

		if (Object.keys(nextErrors).length > 0) {
			setErrors(nextErrors);
			return;
		}

		setSaving(true);

		try {
			knowledgeService.createFolder({
				name: trimmedName,
				categoryId,
				parentId: parentId || undefined,
				icon: optional(icon),
				color: optional(color),
			});
			showToast("Folder created");
			void navigate({ to: "/" });
			onClose();
		} catch (error) {
			setErrors({ form: getErrorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal title="Create folder" onClose={onClose} closeDisabled={saving}>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={errors.form} />

				<Field label="Name" error={errors.name}>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						disabled={saving}
						className={inputClass}
					/>
				</Field>

				<Field label="Category" error={errors.categoryId}>
					<select
						value={categoryId}
						onChange={(event) => setCategoryId(event.target.value)}
						disabled={saving || categories.length === 0}
						className={inputClass}
					>
						{categories.length === 0 ? (
							<option value="">No categories</option>
						) : (
							categories.map((category) => (
								<option key={category.id} value={category.id}>
									{category.name}
								</option>
							))
						)}
					</select>
				</Field>

				<Field label="Parent folder" hint="Optional">
					<select
						value={parentId}
						onChange={(event) => setParentId(event.target.value)}
						disabled={saving || !categoryId}
						className={inputClass}
					>
						<option value="">No parent</option>
						{availableParents.map((folder) => (
							<option key={folder.id} value={folder.id}>
								{getFolderPath(folder, folders)}
							</option>
						))}
					</select>
				</Field>

				<Field label="Icon" hint="Optional">
					<input
						value={icon}
						onChange={(event) => setIcon(event.target.value)}
						disabled={saving}
						className={inputClass}
						placeholder="Folder"
					/>
				</Field>

				<ColorField value={color} onChange={setColor} disabled={saving} />

				<ModalActions submitLabel="Create" saving={saving} onCancel={onClose} />
			</form>
		</BaseModal>
	);
}

function RenameModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const { showToast } = useToast();
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const binds = useKnowledgeStore((state) => state.binds);
	const language = useKnowledgeStore((state) => state.language);
	const target = getTarget(
		payload.type,
		payload.id,
		categories,
		folders,
		binds,
		language,
	);
	const [name, setName] = useState(target?.name ?? payload.name ?? "");
	const [color, setColor] = useState(target?.color ?? "");
	const [errors, setErrors] = useState<FieldErrors>({});
	const [saving, setSaving] = useState(false);

	const submit = (event: FormEvent) => {
		event.preventDefault();

		if (!payload.type || !payload.id || !target) {
			setErrors({ form: "Object was not found" });
			return;
		}

		const trimmedName = name.trim();

		if (!trimmedName) {
			setErrors({ name: "Name is required" });
			return;
		}

		setSaving(true);

		try {
			if (payload.type === "category") {
				knowledgeService.updateCategory(payload.id, {
					name: trimmedName,
					color: optional(color),
				});
			}

			if (payload.type === "folder") {
				knowledgeService.updateFolder(payload.id, {
					name: trimmedName,
					color: optional(color),
				});
			}

			if (payload.type === "bind" && target.bind) {
				knowledgeService.updateBind(payload.id, {
					language: target.translationLanguage,
					title: trimmedName,
					color: color.trim(),
				});
			}

			showToast("Renamed");
			onClose();
		} catch (error) {
			setErrors({ form: getErrorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal title="Rename" onClose={onClose} closeDisabled={saving}>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={errors.form} />

				<Field label="Name" error={errors.name}>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						disabled={saving || !target}
						className={inputClass}
					/>
				</Field>

				<ColorField value={color} onChange={setColor} disabled={saving} />

				<ModalActions submitLabel="Save" saving={saving} onCancel={onClose} />
			</form>
		</BaseModal>
	);
}

function DeleteModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const { showToast } = useToast();
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const binds = useKnowledgeStore((state) => state.binds);
	const language = useKnowledgeStore((state) => state.language);
	const target = getTarget(
		payload.type,
		payload.id,
		categories,
		folders,
		binds,
		language,
	);
	const [errors, setErrors] = useState<FieldErrors>({});
	const [saving, setSaving] = useState(false);
	const deletePreview = getDeletedItemsSnapshot(
		payload.type,
		payload.id,
		categories,
		folders,
		binds,
	);

	const submit = (event: FormEvent) => {
		event.preventDefault();

		if (!payload.type || !payload.id || !target) {
			setErrors({ form: "Object was not found" });
			return;
		}

		setSaving(true);

		try {
			const deletedItems = deletePreview;

			if (payload.type === "category") {
				knowledgeService.deleteCategory(payload.id);
			}

			if (payload.type === "folder") {
				knowledgeService.deleteFolder(payload.id);
			}

			if (payload.type === "bind") {
				knowledgeService.archiveBind(payload.id);
			}

			showToast(payload.type === "bind" ? "Archived" : "Deleted", {
				action: {
					label: "Undo",
					onClick: () => {
						if (payload.type === "bind") {
							knowledgeService.updateBind(payload.id as string, {
								archived: false,
							});
							showToast("Restored");
							return;
						}

						knowledgeService.restoreDeletedItems(deletedItems);
						showToast("Restored");
					},
				},
				duration: 6000,
			});
			onClose();
		} catch (error) {
			setErrors({ form: getErrorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal
			title="Delete"
			onClose={onClose}
			closeDisabled={saving}
			size="sm"
		>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={errors.form} />

				<div className="space-y-2">
					<p className="text-sm font-medium">Are you sure?</p>
					<p className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
						{target?.name ?? payload.name ?? "Unknown object"}
					</p>
					<DeletePreview snapshot={deletePreview} type={payload.type} />
				</div>

				<ModalActions
					submitLabel={payload.type === "bind" ? "Archive" : "Delete"}
					saving={saving}
					onCancel={onClose}
					danger
				/>
			</form>
		</BaseModal>
	);
}

function MoveBindModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const binds = useKnowledgeStore((state) => state.binds);
	const language = useKnowledgeStore((state) => state.language);
	const expandedFolders = useKnowledgeStore((state) => state.expandedFolders);
	const toggleFolder = useKnowledgeStore((state) => state.toggleFolder);
	const openBind = useKnowledgeStore((state) => state.openBind);
	const targetFolder = folders.find((folder) => folder.id === payload.folderId);
	const targetCategoryId =
		payload.categoryId ?? targetFolder?.categoryId ?? categories[0]?.id ?? "";
	const targetFolderId = payload.folderId ?? "";
	const targetCategory = categories.find(
		(category) => category.id === targetCategoryId,
	);
	const targetName = targetFolder
		? `${targetCategory?.name ?? "Category"} / ${getFolderPath(
				targetFolder,
				folders,
			)}`
		: (targetCategory?.name ?? "Unknown destination");
	const availableBinds = useMemo(
		() =>
			binds
				.filter(
					(bind) =>
						!bind.archived &&
						!(
							bind.categoryId === targetCategoryId &&
							(bind.folderId ?? "") === targetFolderId
						),
				)
				.sort((a, b) =>
					getBindTitle(a, language).localeCompare(getBindTitle(b, language)),
				),
		[binds, language, targetCategoryId, targetFolderId],
	);
	const [bindId, setBindId] = useState(availableBinds[0]?.id ?? "");
	const [errors, setErrors] = useState<FieldErrors>({});
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!availableBinds.some((bind) => bind.id === bindId)) {
			setBindId(availableBinds[0]?.id ?? "");
		}
	}, [availableBinds, bindId]);

	const submit = (event: FormEvent) => {
		event.preventDefault();

		if (!targetCategoryId || !targetCategory) {
			setErrors({ form: "Destination was not found" });
			return;
		}

		if (!bindId) {
			setErrors({ bindId: "Bind is required" });
			return;
		}

		setSaving(true);

		try {
			const previousBind = binds.find((bind) => bind.id === bindId);
			const movedBind = knowledgeService.moveBind(bindId, {
				categoryId: targetCategoryId,
				folderId: targetFolderId || undefined,
			});

			for (const id of [targetCategoryId, targetFolderId]) {
				if (id && !expandedFolders.includes(id)) {
					toggleFolder(id);
				}
			}

			openBind(movedBind.id);
			showToast("Bind moved", {
				action: previousBind
					? {
							label: "Undo",
							onClick: () => {
								knowledgeService.moveBind(movedBind.id, {
									categoryId: previousBind.categoryId,
									folderId: previousBind.folderId,
								});
								showToast("Move undone");
							},
						}
					: undefined,
				duration: 6000,
			});
			void navigate({ to: "/" });
			onClose();
		} catch (error) {
			setErrors({ form: getErrorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal
			title="Add existing bind"
			onClose={onClose}
			closeDisabled={saving}
			size="md"
		>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={errors.form} />

				<div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
					{targetName}
				</div>

				<Field label="Bind" error={errors.bindId}>
					<select
						value={bindId}
						onChange={(event) => setBindId(event.target.value)}
						disabled={saving || availableBinds.length === 0}
						className={inputClass}
					>
						{availableBinds.length === 0 ? (
							<option value="">No binds to move</option>
						) : (
							availableBinds.map((bind) => (
								<option key={bind.id} value={bind.id}>
									{getBindTitle(bind, language)} -{" "}
									{getBindLocation(bind, categories, folders)}
								</option>
							))
						)}
					</select>
				</Field>

				<ModalActions submitLabel="Move" saving={saving} onCancel={onClose} />
			</form>
		</BaseModal>
	);
}

function CopyBindModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const { showToast } = useToast();
	const language = useKnowledgeStore((state) => state.language);
	const bind = useKnowledgeStore((state) =>
		payload.bindId ? state.getBind(payload.bindId) : undefined,
	);
	const targetLanguage = payload.language ?? language;
	const translation = bind
		? getBindTranslation(bind, targetLanguage)
		: undefined;
	const variables = useMemo(
		() => extractTemplateVariables(translation?.content ?? ""),
		[translation?.content],
	);
	const [values, setValues] = useState<Record<string, string>>(() =>
		readVariablePreset(variables),
	);
	const [saving, setSaving] = useState(false);
	const content = applyTemplateVariables(translation?.content ?? "", values);

	if (!bind || !translation) {
		return (
			<BaseModal title="Copy bind" onClose={onClose}>
				<p className="text-sm text-muted">Bind was not found</p>
			</BaseModal>
		);
	}

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setSaving(true);

		try {
			const ok = await copyToClipboard(content);

			if (ok) {
				writeVariablePreset(values);
				knowledgeService.recordBindCopied(bind.id);
			}
			showToast(ok ? "Copied to clipboard" : "Copy failed");
			if (ok) onClose();
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal title="Copy with variables" onClose={onClose} size="lg">
			<form onSubmit={submit} className="space-y-4">
				<div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
					{translation.title || bind.slug}
				</div>

				{variables.length > 0 ? (
					<div className="grid gap-3 sm:grid-cols-2">
						{variables.map((variable) => (
							<Field key={variable} label={`{${variable}}`}>
								<input
									value={values[variable] ?? ""}
									onChange={(event) =>
										setValues((current) => ({
											...current,
											[variable]: event.target.value,
										}))
									}
									className={inputClass}
									placeholder={variable}
								/>
							</Field>
						))}
					</div>
				) : (
					<p className="text-sm text-muted">
						This bind has no variables. It will be copied as is.
					</p>
				)}

				<div className="max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-sm leading-6 text-muted">
					<pre className="whitespace-pre-wrap font-sans">{content}</pre>
				</div>

				<ModalActions submitLabel="Copy" saving={saving} onCancel={onClose} />
			</form>
		</BaseModal>
	);
}

function BindHistoryModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const { showToast } = useToast();
	const language = useKnowledgeStore((state) => state.language);
	const bind = useKnowledgeStore((state) =>
		payload.bindId ? state.getBind(payload.bindId) : undefined,
	);
	const history = bind?.history ?? [];

	if (!bind) {
		return (
			<BaseModal title="History" onClose={onClose}>
				<p className="text-sm text-muted">Bind was not found</p>
			</BaseModal>
		);
	}

	const restore = (historyId: string) => {
		knowledgeService.restoreBindHistory(bind.id, historyId);
		showToast("Version restored");
		onClose();
	};

	return (
		<BaseModal title="History" onClose={onClose} size="lg">
			<div className="space-y-3">
				{history.length === 0 ? (
					<p className="text-sm text-muted">No previous versions yet</p>
				) : (
					history.map((entry) => {
						const translation =
							entry.translations.find((item) => item.language === language) ??
							entry.translations[0];

						return (
							<div
								key={entry.id}
								className="rounded-md border border-border bg-background p-3"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="truncate text-sm font-semibold">
											{translation?.title ?? entry.slug}
										</div>
										<div className="mt-1 text-xs text-muted">
											{new Date(entry.createdAt).toLocaleString()} -{" "}
											{entry.translations.length} languages
										</div>
									</div>

									<button
										type="button"
										onClick={() => restore(entry.id)}
										className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-elevated"
									>
										Restore
									</button>
								</div>

								<p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
									{translation?.content ?? "No content"}
								</p>
							</div>
						);
					})
				)}
			</div>
		</BaseModal>
	);
}

function DeletePreview({
	snapshot,
	type,
}: {
	snapshot: RestoreDeletedItemsInput;
	type?: KnowledgeObjectType;
}) {
	const folderCount = snapshot.folders?.length ?? 0;
	const bindCount = snapshot.binds?.length ?? 0;

	if (type === "bind") {
		return (
			<p className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
				The bind will be archived and can be restored later.
			</p>
		);
	}

	if (folderCount === 0 && bindCount === 0) return null;

	return (
		<div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
			This will remove {folderCount} folder{folderCount === 1 ? "" : "s"} and{" "}
			{bindCount} bind{bindCount === 1 ? "" : "s"}.
		</div>
	);
}

function FindDuplicatesModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const language = useKnowledgeStore((state) => state.language);
	const binds = useKnowledgeStore((state) => state.binds);
	const openBind = useKnowledgeStore((state) => state.openBind);
	const target = payload.bindId
		? binds.find((bind) => bind.id === payload.bindId)
		: undefined;
	const duplicates = useMemo(
		() => getDuplicateCandidates(binds, language, target),
		[binds, language, target],
	);

	const openCandidate = (id: string) => {
		openBind(id);
		void navigate({ to: "/" });
		onClose();
	};

	return (
		<BaseModal title="Duplicate check" onClose={onClose} size="lg">
			<div className="space-y-3">
				{duplicates.length === 0 ? (
					<p className="text-sm text-muted">No obvious duplicates found</p>
				) : (
					duplicates.map((bind) => (
						<button
							key={bind.id}
							type="button"
							onClick={() => openCandidate(bind.id)}
							className="block w-full rounded-md border border-border bg-background p-3 text-left hover:bg-surface-elevated"
						>
							<div className="truncate text-sm font-semibold">
								{getBindTitle(bind, language)}
							</div>
							<div className="mt-1 truncate text-xs text-muted">
								{bind.slug}
								{bind.tags.length > 0 ? ` - ${bind.tags.join(", ")}` : ""}
							</div>
						</button>
					))
				)}
			</div>
		</BaseModal>
	);
}

function BindFormModal({
	mode,
	payload,
	onClose,
}: {
	mode: "create" | "edit";
	payload: ModalPayload;
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const categories = useKnowledgeStore((state) => state.categories);
	const folders = useKnowledgeStore((state) => state.folders);
	const selectedCategory = useKnowledgeStore((state) => state.selectedCategory);
	const selectedFolder = useKnowledgeStore((state) => state.selectedFolder);
	const binds = useKnowledgeStore((state) => state.binds);
	const bind = useKnowledgeStore((state) =>
		payload.bindId ? state.getBind(payload.bindId) : undefined,
	);
	const initialCategoryId =
		mode === "edit"
			? (bind?.categoryId ?? "")
			: (payload.categoryId ?? selectedCategory ?? categories[0]?.id ?? "");
	const initialFolderId =
		mode === "edit"
			? (bind?.folderId ?? "")
			: (payload.folderId ?? selectedFolder ?? "");
	const initialTranslations =
		mode === "edit" && bind
			? bind.translations.map((translation) => ({
					language: translation.language,
					title: translation.title,
					content: translation.content,
				}))
			: DEFAULT_BIND_LANGUAGES.map((code) => createTranslationDraft(code));

	const [slug, setSlug] = useState(bind?.slug ?? "");
	const [color, setColor] = useState(bind?.color ?? "");
	const [tags, setTags] = useState(bind?.tags.join(", ") ?? "");
	const [categoryId, setCategoryId] = useState(initialCategoryId);
	const [folderId, setFolderId] = useState(initialFolderId);
	const [translationDrafts, setTranslationDrafts] =
		useState<TranslationDraft[]>(initialTranslations);
	const [activeLanguage, setActiveLanguage] = useState(
		initialTranslations[0]?.language ?? "ru",
	);
	const [newLanguage, setNewLanguage] = useState("");
	const [addLanguageError, setAddLanguageError] = useState("");
	const [errors, setErrors] = useState<FieldErrors>({});
	const [saving, setSaving] = useState(false);

	const availableFolders = useMemo(
		() => folders.filter((folder) => folder.categoryId === categoryId),
		[categoryId, folders],
	);
	const tagSuggestions = useMemo(
		() =>
			Array.from(new Set(binds.flatMap((item) => item.tags)))
				.filter(Boolean)
				.sort((a, b) => a.localeCompare(b))
				.slice(0, 20),
		[binds],
	);

	const activeDraft =
		translationDrafts.find(
			(translation) => translation.language === activeLanguage,
		) ?? translationDrafts[0];

	useEffect(() => {
		if (
			folderId &&
			!availableFolders.some((folder) => folder.id === folderId)
		) {
			setFolderId("");
		}
	}, [availableFolders, folderId]);

	if (mode === "edit" && !bind) {
		return (
			<BaseModal title="Edit bind" onClose={onClose} size="lg">
				<div className="space-y-4">
					<FormError message="Bind was not found" />
					<div className="flex justify-end">
						<button
							type="button"
							onClick={onClose}
							className="rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-elevated"
						>
							Close
						</button>
					</div>
				</div>
			</BaseModal>
		);
	}

	const updateDraft = (
		languageCode: string,
		patch: Partial<TranslationDraft>,
	) => {
		setTranslationDrafts((current) =>
			current.map((translation) =>
				translation.language === languageCode
					? { ...translation, ...patch }
					: translation,
			),
		);
	};

	const addLanguage = () => {
		const code = normalizeLanguageCode(newLanguage);

		if (!isValidLanguageCode(code)) {
			setAddLanguageError("Use a language code like es or pt-br");
			return;
		}

		if (
			translationDrafts.some((translation) => translation.language === code)
		) {
			setAddLanguageError("Language already exists");
			return;
		}

		setTranslationDrafts((current) => [
			...current,
			createTranslationDraft(code),
		]);
		setActiveLanguage(code);
		setNewLanguage("");
		setAddLanguageError("");
	};

	const removeLanguage = (languageCode: string) => {
		const next = translationDrafts.filter(
			(translation) => translation.language !== languageCode,
		);

		setTranslationDrafts(next);
		setActiveLanguage((current) =>
			current === languageCode ? (next[0]?.language ?? "") : current,
		);
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();

		const nextErrors: FieldErrors = {};
		const trimmedSlug = slug.trim();

		if (!trimmedSlug) {
			nextErrors.slug = "Slug is required";
		}

		if (!categoryId) {
			nextErrors.categoryId = "Category is required";
		}

		const prepared = prepareTranslations(translationDrafts, mode === "edit");

		Object.assign(nextErrors, prepared.errors);

		if (Object.keys(nextErrors).length > 0) {
			setErrors(nextErrors);
			return;
		}

		setSaving(true);

		try {
			const normalizedColor = color.trim();

			if (mode === "create") {
				knowledgeService.createBind({
					slug: trimmedSlug,
					categoryId,
					folderId: folderId || undefined,
					color: normalizedColor || undefined,
					tags: splitTags(tags),
					translations: prepared.translations,
					title: prepared.translations[0]?.title ?? trimmedSlug,
					content: prepared.translations[0]?.content ?? "",
					language: prepared.translations[0]?.language,
				});
				showToast("Bind created");
				void navigate({ to: "/" });
			} else if (bind) {
				knowledgeService.updateBind(bind.id, {
					slug: trimmedSlug,
					categoryId,
					folderId: folderId || null,
					color: normalizedColor,
					tags: splitTags(tags),
					translations: prepared.translations,
				});
				showToast("Bind saved");
			}

			onClose();
		} catch (error) {
			setErrors({ form: getErrorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal
			title={mode === "create" ? "Create bind" : "Edit bind"}
			onClose={onClose}
			closeDisabled={saving}
			size="xl"
		>
			<form onSubmit={submit} className="space-y-5">
				<FormError message={errors.form} />

				<div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr]">
					<Field label="Slug" error={errors.slug}>
						<input
							value={slug}
							onChange={(event) => setSlug(event.target.value)}
							disabled={saving}
							className={inputClass}
						/>
					</Field>

					<Field label="Category" error={errors.categoryId}>
						<select
							value={categoryId}
							onChange={(event) => setCategoryId(event.target.value)}
							disabled={saving || categories.length === 0}
							className={inputClass}
						>
							{categories.length === 0 ? (
								<option value="">No categories</option>
							) : (
								categories.map((category) => (
									<option key={category.id} value={category.id}>
										{category.name}
									</option>
								))
							)}
						</select>
					</Field>

					<Field label="Folder" hint="Optional">
						<select
							value={folderId}
							onChange={(event) => setFolderId(event.target.value)}
							disabled={saving || !categoryId}
							className={inputClass}
						>
							<option value="">No folder</option>
							{availableFolders.map((folder) => (
								<option key={folder.id} value={folder.id}>
									{getFolderPath(folder, folders)}
								</option>
							))}
						</select>
					</Field>
				</div>

				<ColorField value={color} onChange={setColor} disabled={saving} />

				<Field label="Tags" hint="Comma separated">
					<input
						value={tags}
						onChange={(event) => setTags(event.target.value)}
						disabled={saving}
						className={inputClass}
						placeholder="kyc, withdrawal, bonus"
					/>
					{tagSuggestions.length > 0 && (
						<div className="mt-2 flex flex-wrap gap-1">
							{tagSuggestions.map((tag) => (
								<button
									key={tag}
									type="button"
									onClick={() => setTags((current) => toggleTag(current, tag))}
									disabled={saving}
									className="rounded-full border border-border px-2 py-1 text-xs text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
								>
									#{tag}
								</button>
							))}
						</div>
					)}
				</Field>

				<div className="space-y-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex flex-wrap gap-2">
							{translationDrafts.map((translation) => (
								<button
									key={translation.language}
									type="button"
									onClick={() => setActiveLanguage(translation.language)}
									disabled={saving}
									className={`h-9 rounded-md border px-3 text-xs font-semibold uppercase transition disabled:cursor-not-allowed disabled:opacity-60 ${
										activeDraft?.language === translation.language
											? "border-accent bg-accent text-accent-foreground"
											: "border-border text-muted hover:bg-surface-elevated hover:text-foreground"
									}`}
								>
									{translation.language}
								</button>
							))}
						</div>

						<div className="flex min-w-0 items-start gap-2">
							<div className="min-w-28">
								<input
									value={newLanguage}
									onChange={(event) => {
										setNewLanguage(event.target.value);
										setAddLanguageError("");
									}}
									disabled={saving}
									className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
									placeholder="es"
								/>
								<ErrorText message={addLanguageError} />
							</div>

							<button
								type="button"
								onClick={addLanguage}
								disabled={saving}
								className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
							>
								<Plus size={15} />
								Add Language
							</button>
						</div>
					</div>

					<ErrorText message={errors.translations} />

					{activeDraft ? (
						<div className="rounded-lg border border-border bg-background p-4">
							<div className="mb-4 flex items-center justify-between gap-3">
								<div className="text-xs font-semibold uppercase tracking-wide text-muted">
									{getLanguageLabel(activeDraft.language)}
								</div>

								{mode === "edit" && translationDrafts.length > 1 && (
									<button
										type="button"
										title="Delete language"
										onClick={() => removeLanguage(activeDraft.language)}
										disabled={saving}
										className="rounded-md p-1.5 text-muted hover:bg-surface-elevated hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
									>
										<Trash2 size={16} />
									</button>
								)}
							</div>

							<div className="space-y-4">
								<Field
									label="Title"
									error={errors[`title.${activeDraft.language}`]}
								>
									<input
										value={activeDraft.title}
										onChange={(event) =>
											updateDraft(activeDraft.language, {
												title: event.target.value,
											})
										}
										disabled={saving}
										className={inputClass}
									/>
								</Field>

								<Field
									label="Content"
									error={errors[`content.${activeDraft.language}`]}
								>
									<textarea
										value={activeDraft.content}
										onChange={(event) =>
											updateDraft(activeDraft.language, {
												content: event.target.value,
											})
										}
										disabled={saving}
										className={textareaClass}
									/>
								</Field>
							</div>
						</div>
					) : (
						<div className="rounded-lg border border-border bg-background px-4 py-6 text-center text-sm text-muted">
							Add at least one language
						</div>
					)}
				</div>

				<ModalActions
					submitLabel={mode === "create" ? "Create" : "Save"}
					saving={saving}
					onCancel={onClose}
				/>
			</form>
		</BaseModal>
	);
}

function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: ReactNode;
}) {
	return (
		<div className="block space-y-1.5">
			<div className="flex items-center gap-2 text-sm font-medium">
				{label}
				{hint && <span className="text-xs font-normal text-muted">{hint}</span>}
			</div>
			{children}
			<ErrorText message={error} />
		</div>
	);
}

function ColorField({
	value,
	onChange,
	disabled,
}: {
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
}) {
	return (
		<Field label="Color" hint="Optional">
			<div className="flex flex-wrap items-center gap-2">
				{COLOR_SWATCHES.map((color) => (
					<button
						key={color}
						type="button"
						title={color}
						onClick={() => onChange(value === color ? "" : color)}
						disabled={disabled}
						className={`h-8 w-8 rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-60 ${
							value === color ? "border-foreground" : "border-transparent"
						}`}
						style={{ backgroundColor: color }}
					/>
				))}

				<input
					value={value}
					onChange={(event) => onChange(event.target.value)}
					disabled={disabled}
					className="h-9 w-32 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
					placeholder="#3B82F6"
				/>
			</div>
		</Field>
	);
}

function ModalActions({
	submitLabel,
	saving,
	onCancel,
	danger = false,
}: {
	submitLabel: string;
	saving: boolean;
	onCancel: () => void;
	danger?: boolean;
}) {
	return (
		<div className="flex justify-end gap-2 border-t border-border pt-4">
			<button
				type="button"
				onClick={onCancel}
				disabled={saving}
				className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
			>
				Cancel
			</button>

			<button
				type="submit"
				disabled={saving}
				className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
					danger
						? "bg-red-500 hover:bg-red-400"
						: "bg-accent hover:bg-accent/90"
				}`}
			>
				{saving ? "Saving..." : submitLabel}
			</button>
		</div>
	);
}

function ErrorText({ message }: { message?: string }) {
	if (!message) return null;

	return <p className="text-xs text-red-400">{message}</p>;
}

function FormError({ message }: { message?: string }) {
	if (!message) return null;

	return (
		<div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
			{message}
		</div>
	);
}

function optional(value: string) {
	const trimmed = value.trim();

	return trimmed || undefined;
}

function splitTags(value: string) {
	return Array.from(
		new Set(
			value
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean),
		),
	);
}

function toggleTag(current: string, tag: string) {
	const tags = splitTags(current);

	return tags.includes(tag)
		? tags.filter((item) => item !== tag).join(", ")
		: [...tags, tag].join(", ");
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Something went wrong";
}

function createTranslationDraft(language: string): TranslationDraft {
	return {
		language,
		title: "",
		content: "",
	};
}

function normalizeLanguageCode(value: string) {
	return value.trim().toLowerCase().replace(/_/g, "-");
}

function isValidLanguageCode(value: string) {
	return /^[a-z]{2,8}(-[a-z0-9]{2,8})?$/.test(value);
}

function getLanguageLabel(code: string) {
	const language = languages.find((item) => item.code === code);

	return language
		? `${code.toUpperCase()} - ${language.name}`
		: code.toUpperCase();
}

function getBindTitle(bind: Bind, language: string) {
	return (
		bind.translations.find((translation) => translation.language === language)
			?.title ??
		bind.translations.find((translation) => translation.language === "ru")
			?.title ??
		bind.translations.find((translation) => translation.language === "en")
			?.title ??
		bind.translations[0]?.title ??
		bind.slug
	);
}

function getBindTranslation(bind: Bind, language: string) {
	return (
		bind.translations.find(
			(translation) => translation.language === language,
		) ??
		bind.translations.find((translation) => translation.language === "ru") ??
		bind.translations.find((translation) => translation.language === "en") ??
		bind.translations[0]
	);
}

function normalizeDuplicateText(value: string) {
	return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getDuplicateCandidates(
	binds: Bind[],
	language: string,
	target?: Bind,
) {
	const visibleBinds = binds.filter((bind) => !bind.archived);

	if (target) {
		const targetTranslation = getBindTranslation(target, language);
		const targetContent = normalizeDuplicateText(
			targetTranslation?.content ?? "",
		);
		const targetTitle = normalizeDuplicateText(targetTranslation?.title ?? "");

		return visibleBinds
			.filter((bind) => bind.id !== target.id)
			.filter((bind) =>
				bind.translations.some((translation) => {
					const content = normalizeDuplicateText(translation.content);
					const title = normalizeDuplicateText(translation.title);

					return (
						(targetContent && content === targetContent) ||
						(targetTitle && title === targetTitle)
					);
				}),
			);
	}

	const seen = new Map<string, string>();
	const duplicateIds = new Set<string>();

	for (const bind of visibleBinds) {
		for (const translation of bind.translations) {
			const content = normalizeDuplicateText(translation.content);

			if (!content) continue;

			const previousId = seen.get(content);

			if (previousId) {
				duplicateIds.add(previousId);
				duplicateIds.add(bind.id);
			} else {
				seen.set(content, bind.id);
			}
		}
	}

	return visibleBinds.filter((bind) => duplicateIds.has(bind.id));
}

function getBindLocation(
	bind: Bind,
	categories: KnowledgeCategory[],
	folders: KnowledgeFolder[],
) {
	const category = categories.find((item) => item.id === bind.categoryId);
	const folder = bind.folderId
		? folders.find((item) => item.id === bind.folderId)
		: undefined;

	if (folder) {
		return `${category?.name ?? "Category"} / ${getFolderPath(folder, folders)}`;
	}

	return category?.name ?? "No category";
}

function prepareTranslations(
	drafts: TranslationDraft[],
	requireEveryDraft: boolean,
) {
	const errors: FieldErrors = {};
	const translations: BindTranslation[] = [];
	const seen = new Set<string>();

	for (const draft of drafts) {
		const language = normalizeLanguageCode(draft.language);
		const title = draft.title.trim();
		const content = draft.content.trim();
		const isEmpty = !title && !content;

		if (!requireEveryDraft && isEmpty) {
			continue;
		}

		if (!isValidLanguageCode(language)) {
			errors[`language.${draft.language}`] = "Language code is invalid";
		}

		if (seen.has(language)) {
			errors[`language.${draft.language}`] = "Language is duplicated";
		}

		if (!title) {
			errors[`title.${draft.language}`] = "Title is required";
		}

		if (!content) {
			errors[`content.${draft.language}`] = "Content is required";
		}

		seen.add(language);

		if (title && content && isValidLanguageCode(language)) {
			translations.push({
				language,
				title,
				content,
				updatedAt: new Date().toISOString(),
			});
		}
	}

	if (translations.length === 0 && Object.keys(errors).length === 0) {
		errors.translations = "Add at least one language with title and content";
	}

	return { translations, errors };
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

function getTarget(
	type: KnowledgeObjectType | undefined,
	id: string | undefined,
	categories: KnowledgeCategory[],
	folders: KnowledgeFolder[],
	binds: Bind[],
	language: string,
) {
	if (!type || !id) return undefined;

	if (type === "category") {
		const category = categories.find((item) => item.id === id);

		return category
			? {
					name: category.name,
					color: category.color,
				}
			: undefined;
	}

	if (type === "folder") {
		const folder = folders.find((item) => item.id === id);

		return folder
			? {
					name: folder.name,
					color: folder.color,
				}
			: undefined;
	}

	const bind = binds.find((item) => item.id === id);
	const translation =
		bind?.translations.find((item) => item.language === language) ??
		bind?.translations.find((item) => item.language === "ru") ??
		bind?.translations.find((item) => item.language === "en") ??
		bind?.translations[0];

	return bind
		? {
				name: translation?.title ?? bind.slug,
				color: bind.color,
				bind,
				translationLanguage: translation?.language ?? language,
			}
		: undefined;
}

function getDeletedItemsSnapshot(
	type: KnowledgeObjectType | undefined,
	id: string | undefined,
	categories: KnowledgeCategory[],
	folders: KnowledgeFolder[],
	binds: Bind[],
): RestoreDeletedItemsInput {
	if (!type || !id) return {};

	if (type === "category") {
		const category = categories.find((item) => item.id === id);
		const categoryFolders = folders.filter(
			(folder) => folder.categoryId === id,
		);
		const categoryFolderIds = new Set(
			categoryFolders.map((folder) => folder.id),
		);

		return {
			categories: category ? [category] : [],
			folders: categoryFolders,
			binds: binds.filter(
				(bind) =>
					bind.categoryId === id ||
					(Boolean(bind.folderId) && categoryFolderIds.has(bind.folderId)),
			),
		};
	}

	if (type === "folder") {
		const folderIds = collectNestedFolderIds(id, folders);

		return {
			folders: folders.filter((folder) => folderIds.has(folder.id)),
			binds: binds.filter(
				(bind) => Boolean(bind.folderId) && folderIds.has(bind.folderId),
			),
		};
	}

	const bind = binds.find((item) => item.id === id);

	return {
		binds: bind ? [bind] : [],
	};
}

function collectNestedFolderIds(id: string, folders: KnowledgeFolder[]) {
	const result = new Set<string>([id]);
	let changed = true;

	while (changed) {
		changed = false;

		for (const folder of folders) {
			if (
				folder.parentId &&
				result.has(folder.parentId) &&
				!result.has(folder.id)
			) {
				result.add(folder.id);
				changed = true;
			}
		}
	}

	return result;
}

const VARIABLE_PRESET_KEY = "supportos:variable-presets:v1";

function readVariablePreset(variables: string[]) {
	if (typeof localStorage === "undefined") return {};

	try {
		const stored = JSON.parse(
			localStorage.getItem(VARIABLE_PRESET_KEY) ?? "{}",
		) as Record<string, string>;

		return Object.fromEntries(
			variables.map((variable) => [variable, stored[variable] ?? ""]),
		);
	} catch {
		return {};
	}
}

function writeVariablePreset(values: Record<string, string>) {
	if (typeof localStorage === "undefined") return;

	try {
		const stored = JSON.parse(
			localStorage.getItem(VARIABLE_PRESET_KEY) ?? "{}",
		) as Record<string, string>;

		localStorage.setItem(
			VARIABLE_PRESET_KEY,
			JSON.stringify({
				...stored,
				...values,
			}),
		);
	} catch {
		localStorage.setItem(VARIABLE_PRESET_KEY, JSON.stringify(values));
	}
}
