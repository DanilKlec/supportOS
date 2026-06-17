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
import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
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

	const submit = (event: FormEvent) => {
		event.preventDefault();

		if (!payload.type || !payload.id || !target) {
			setErrors({ form: "Object was not found" });
			return;
		}

		setSaving(true);

		try {
			if (payload.type === "category") {
				knowledgeService.deleteCategory(payload.id);
			}

			if (payload.type === "folder") {
				knowledgeService.deleteFolder(payload.id);
			}

			if (payload.type === "bind") {
				knowledgeService.deleteBind(payload.id);
			}

			showToast("Deleted");
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
				</div>

				<ModalActions
					submitLabel="Delete"
					saving={saving}
					onCancel={onClose}
					danger
				/>
			</form>
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
					folderId: folderId || undefined,
					color: normalizedColor,
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
