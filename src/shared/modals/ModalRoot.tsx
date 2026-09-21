import { useNavigate } from "@tanstack/react-router";
import { Plus, Search, Trash2 } from "lucide-react";
import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import type { Bind, BindTranslation } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import { languages } from "@/entities/language";
import type { ProjectEmailRecord } from "@/entities/project-email";
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
import { useKnowledgeStore, useProjectEmailStore } from "@/store";

import { BaseModal } from "./BaseModal";
import { FolderDestination } from "./FolderDestination";
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
	agentInstructions?: string;
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
	"min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60";
const textareaClass =
	"min-h-64 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60 md:min-h-56";

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
			nextErrors.name = "Укажите название";
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
			showToast("Категория создана");
			void navigate({ to: "/" });
			onClose();
		} catch (error) {
			setErrors({ form: getErrorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal title="Новая категория" onClose={onClose} closeDisabled={saving}>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={errors.form} />

				<Field label="Название" error={errors.name}>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						disabled={saving}
						className={inputClass}
					/>
				</Field>

				<Field label="Значок" hint="Необязательно">
					<input
						value={icon}
						onChange={(event) => setIcon(event.target.value)}
						disabled={saving}
						className={inputClass}
						placeholder="Shield"
					/>
				</Field>

				<ColorField value={color} onChange={setColor} disabled={saving} />

				<ModalActions
					submitLabel="Создать"
					saving={saving}
					onCancel={onClose}
				/>
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
			nextErrors.name = "Укажите название";
		}

		if (!categoryId) {
			nextErrors.categoryId = "Выберите категорию";
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
			showToast("Папка создана");
			void navigate({ to: "/" });
			onClose();
		} catch (error) {
			setErrors({ form: getErrorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal title="Новая папка" onClose={onClose} closeDisabled={saving}>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={errors.form} />

				<Field label="Название" error={errors.name}>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						disabled={saving}
						className={inputClass}
					/>
				</Field>

				<Field label="Категория" error={errors.categoryId}>
					<select
						value={categoryId}
						onChange={(event) => setCategoryId(event.target.value)}
						disabled={saving || categories.length === 0}
						className={inputClass}
					>
						{categories.length === 0 ? (
							<option value="">Нет категорий</option>
						) : (
							categories.map((category) => (
								<option key={category.id} value={category.id}>
									{category.name}
								</option>
							))
						)}
					</select>
				</Field>

				<Field label="Родительская папка" hint="Необязательно">
					<select
						value={parentId}
						onChange={(event) => setParentId(event.target.value)}
						disabled={saving || !categoryId}
						className={inputClass}
					>
						<option value="">Корень категории</option>
						{availableParents.map((folder) => (
							<option key={folder.id} value={folder.id}>
								{getFolderPath(folder, folders)}
							</option>
						))}
					</select>
				</Field>

				<Field label="Значок" hint="Необязательно">
					<input
						value={icon}
						onChange={(event) => setIcon(event.target.value)}
						disabled={saving}
						className={inputClass}
						placeholder="Папка"
					/>
				</Field>

				<ColorField value={color} onChange={setColor} disabled={saving} />

				<ModalActions
					submitLabel="Создать"
					saving={saving}
					onCancel={onClose}
				/>
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
			setErrors({ form: "Объект не найден" });
			return;
		}

		const trimmedName = name.trim();

		if (!trimmedName) {
			setErrors({ name: "Укажите название" });
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

			showToast("Название изменено");
			onClose();
		} catch (error) {
			setErrors({ form: getErrorMessage(error) });
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal title="Переименовать" onClose={onClose} closeDisabled={saving}>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={errors.form} />

				<Field label="Название" error={errors.name}>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						disabled={saving || !target}
						className={inputClass}
					/>
				</Field>

				<ColorField value={color} onChange={setColor} disabled={saving} />

				<ModalActions
					submitLabel="Сохранить"
					saving={saving}
					onCancel={onClose}
				/>
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
			setErrors({ form: "Объект не найден" });
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

			showToast(payload.type === "bind" ? "Архивировано" : "Удалено", {
				action: {
					label: "Отменить",
					onClick: () => {
						if (payload.type === "bind") {
							knowledgeService.updateBind(payload.id as string, {
								archived: false,
							});
							showToast("Восстановлено");
							return;
						}

						knowledgeService.restoreDeletedItems(deletedItems);
						showToast("Восстановлено");
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
			title="Удалить"
			onClose={onClose}
			closeDisabled={saving}
			size="sm"
		>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={errors.form} />

				<div className="space-y-2">
					<p className="text-sm font-medium">Подтвердите действие</p>
					<p className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
						{target?.name ?? payload.name ?? "Неизвестный объект"}
					</p>
					<DeletePreview snapshot={deletePreview} type={payload.type} />
				</div>

				<ModalActions
					submitLabel={payload.type === "bind" ? "Архивировать" : "Удалить"}
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
	const navigate = useNavigate(),
		{ showToast } = useToast();
	const categories = useKnowledgeStore((s) => s.categories),
		folders = useKnowledgeStore((s) => s.folders),
		binds = useKnowledgeStore((s) => s.binds),
		language = useKnowledgeStore((s) => s.language);
	const fixedIds = payload.bindIds ?? (payload.bindId ? [payload.bindId] : []);
	const sourceFolder = folders.find((f) => f.id === payload.moveFolderId);
	const [destination, setDestination] = useState(
		JSON.stringify([
			payload.categoryId ?? sourceFolder?.categoryId ?? categories[0]?.id ?? "",
			payload.folderId ?? "",
		]),
	);
	const [bindId, setBindId] = useState(
		binds.find((b) => !b.archived)?.id ?? "",
	);
	const [error, setError] = useState("");
	const excluded = sourceFolder
		? Array.from(knowledgeService.collectFolderIds(sourceFolder.id, folders))
		: [];
	const submit = (event: FormEvent) => {
		event.preventDefault();
		try {
			const [categoryId, folderId] = JSON.parse(destination) as [
				string,
				string,
			];
			if (!categories.some((c) => c.id === categoryId))
				throw new Error("Выберите категорию");
			if (payload.moveFolderId) {
				knowledgeService.moveFolderTo(payload.moveFolderId, {
					categoryId,
					parentId: folderId || undefined,
				});
			} else {
				const ids = fixedIds.length ? fixedIds : [bindId];
				if (
					!ids.length ||
					ids.some((id) => !binds.some((b) => b.id === id && !b.archived))
				)
					throw new Error("Выберите доступный бинд");
				const selected = useKnowledgeStore.getState().selectedBind;
				let keep = selected;
				for (const id of ids) {
					const moved = knowledgeService.moveBind(id, {
						categoryId,
						folderId: folderId || undefined,
					});
					if (id === selected || ids.length === 1) keep = moved.id;
				}
				if (keep) useKnowledgeStore.getState().openBind(keep);
			}
			knowledgeService.revealLocation(categoryId, folderId);
			showToast("Перемещение выполнено");
			void navigate({ to: "/" });
			onClose();
		} catch (e) {
			setError(getErrorMessage(e));
		}
	};
	return (
		<BaseModal
			title={
				payload.moveFolderId
					? "Переместить папку"
					: fixedIds.length
						? "Переместить бинд" + (fixedIds.length > 1 ? "ы" : "")
						: "Добавить существующий бинд"
			}
			onClose={onClose}
		>
			<form onSubmit={submit} className="space-y-4">
				<FormError message={error} />
				{!fixedIds.length && !payload.moveFolderId && (
					<Field label="Бинд">
						<select
							className={inputClass}
							value={bindId}
							onChange={(e) => setBindId(e.target.value)}
						>
							{binds
								.filter((b) => !b.archived)
								.map((b) => (
									<option key={b.id} value={b.id}>
										{getBindTitle(b, language)} ·{" "}
										{getBindLocation(b, categories, folders)}
									</option>
								))}
						</select>
					</Field>
				)}
				<FolderDestination
					value={destination}
					onChange={setDestination}
					excluded={excluded}
				/>
				<ModalActions
					submitLabel="Переместить"
					saving={false}
					onCancel={onClose}
				/>
			</form>
		</BaseModal>
	);
}
function isEmailVariable(variable: string) {
	return variable.trim().toLowerCase() === "email";
}

function normalizeProjectEmailSearch(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\u0451/g, "е")
		.replace(/[^a-z0-9а-я@._-]+/g, " ")
		.trim();
}

function buildProjectEmailOptions(records: ProjectEmailRecord[]) {
	return records.flatMap((record) =>
		[
			{ type: "Support", value: record.supportEmail },
			{ type: "KYC", value: record.kycEmail },
			{ type: "VIP", value: record.vipEmail },
		]
			.filter((item) => item.value.trim())
			.map((item) => ({
				id: `${record.id}:${item.type}`,
				label: `${record.projectName} - ${item.type}`,
				projectName: record.projectName,
				type: item.type,
				value: item.value,
				searchText: normalizeProjectEmailSearch(
					`${record.projectName} ${item.type} ${item.value}`,
				),
			})),
	);
}

function filterProjectEmailOptions(
	options: ReturnType<typeof buildProjectEmailOptions>,
	query: string,
) {
	const tokens = normalizeProjectEmailSearch(query)
		.split(/\s+/)
		.filter(Boolean);

	if (tokens.length === 0) return options;

	return options.filter((option) =>
		tokens.every((token) => option.searchText.includes(token)),
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
	const projectEmailRecords = useProjectEmailStore((state) => state.records);
	const variables = useMemo(
		() => extractTemplateVariables(translation?.content ?? ""),
		[translation?.content],
	);
	const projectEmailOptions = useMemo(
		() => buildProjectEmailOptions(projectEmailRecords),
		[projectEmailRecords],
	);
	const [emailQuery, setEmailQuery] = useState("");
	const filteredProjectEmailOptions = useMemo(
		() => filterProjectEmailOptions(projectEmailOptions, emailQuery),
		[emailQuery, projectEmailOptions],
	);
	const [values, setValues] = useState<Record<string, string>>(() => {
		const preset = readVariablePreset(variables);
		const defaultEmail = projectEmailOptions[0]?.value;

		if (defaultEmail) {
			for (const variable of variables) {
				if (isEmailVariable(variable) && !preset[variable]) {
					preset[variable] = defaultEmail;
				}
			}
		}

		return preset;
	});
	const hasEmailVariable = variables.some(isEmailVariable);
	const content = applyTemplateVariables(translation?.content ?? "", values);

	useEffect(
		() =>
			setValues((current) => {
				let changed = false;
				const next = { ...current };
				const defaultEmail = projectEmailOptions[0]?.value;

				for (const variable of variables) {
					if (next[variable] === undefined) {
						next[variable] = "";
						changed = true;
					}

					if (isEmailVariable(variable) && !next[variable] && defaultEmail) {
						next[variable] = defaultEmail;
						changed = true;
					}
				}

				return changed ? next : current;
			}),
		[projectEmailOptions, variables],
	);
	const [saving, setSaving] = useState(false);

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
						{variables.map((variable) => {
							const emailVariable = isEmailVariable(variable);

							return (
								<div
									key={variable}
									className={emailVariable ? "sm:col-span-2" : ""}
								>
									<Field label={emailVariable ? "Email" : `{${variable}}`}>
										{emailVariable && projectEmailOptions.length > 0 ? (
											<div className="space-y-2">
												<div className="relative">
													<Search
														size={15}
														className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
													/>
													<input
														type="search"
														value={emailQuery}
														onChange={(event) =>
															setEmailQuery(event.target.value)
														}
														className="min-h-11 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
														placeholder="Search project, type or email..."
													/>
												</div>

												<div className="supportos-scroll max-h-56 overflow-auto rounded-lg border border-border bg-background">
													{filteredProjectEmailOptions.length > 0 ? (
														filteredProjectEmailOptions.map((option) => {
															const active = values[variable] === option.value;

															return (
																<button
																	key={option.id}
																	type="button"
																	onClick={() =>
																		setValues((current) => ({
																			...current,
																			[variable]: option.value,
																		}))
																	}
																	className={`flex min-h-12 w-full min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${
																		active
																			? "bg-accent/10 text-foreground"
																			: "text-muted hover:bg-surface-elevated hover:text-foreground"
																	}`}
																>
																	<span className="min-w-0">
																		<span className="block truncate font-medium">
																			{option.projectName}
																		</span>
																		<span className="block truncate text-xs text-muted">
																			{option.value}
																		</span>
																	</span>
																	<span className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-semibold uppercase text-muted">
																		{option.type}
																	</span>
																</button>
															);
														})
													) : (
														<div className="px-3 py-5 text-sm text-muted">
															No emails match this search
														</div>
													)}
												</div>
											</div>
										) : (
											<input
												value={values[variable] ?? ""}
												onChange={(event) =>
													setValues((current) => ({
														...current,
														[variable]: event.target.value,
													}))
												}
												className={inputClass}
												placeholder={
													emailVariable
														? "Add project emails or enter email manually"
														: variable
												}
											/>
										)}
									</Field>
								</div>
							);
						})}
					</div>
				) : (
					<p className="text-sm text-muted">
						This bind has no variables. It will be copied as is.
					</p>
				)}

				{hasEmailVariable && projectEmailOptions.length === 0 && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
						No project emails found yet. Add them in Project Emails to choose
						from a list.
					</div>
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
			<BaseModal title="История" onClose={onClose}>
				<p className="text-sm text-muted">Bind was not found</p>
			</BaseModal>
		);
	}

	const restore = (historyId: string) => {
		knowledgeService.restoreBindHistory(bind.id, historyId);
		showToast("Версия восстановлена");
		onClose();
	};

	return (
		<BaseModal title="История" onClose={onClose} size="lg">
			<div className="space-y-3">
				{history.length === 0 ? (
					<p className="text-sm text-muted">Предыдущих версий пока нет</p>
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
										className="ui-button ui-button--secondary shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-elevated"
									>
										Restore
									</button>
								</div>

								<p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
									{translation?.content ?? "Нет содержания"}
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
				Бинд будет архивирован. Его можно восстановить из архива.
			</p>
		);
	}

	if (folderCount === 0 && bindCount === 0) return null;

	return (
		<div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
			Будет удалено папок: {folderCount}, биндов: {bindCount}.
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
		<BaseModal title="Найти дубликаты" onClose={onClose} size="lg">
			<div className="space-y-3">
				{duplicates.length === 0 ? (
					<p className="text-sm text-muted">Дубликаты не найдены</p>
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
					agentInstructions: translation.agentInstructions,
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
	const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
	const initialFingerprintRef = useRef("");

	if (!initialFingerprintRef.current) {
		initialFingerprintRef.current = JSON.stringify({
			slug: bind?.slug ?? "",
			color: bind?.color ?? "",
			tags: bind?.tags.join(", ") ?? "",
			categoryId: initialCategoryId,
			folderId: initialFolderId,
			translationDrafts: initialTranslations,
		});
	}

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
	const currentFingerprint = JSON.stringify({
		slug,
		color,
		tags,
		categoryId,
		folderId,
		translationDrafts,
	});
	const dirty = currentFingerprint !== initialFingerprintRef.current;
	const requestClose = () => {
		if (saving) return;

		if (dirty) {
			setCloseConfirmationOpen(true);
			return;
		}

		onClose();
	};

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
			<BaseModal title="Редактировать бинд" onClose={requestClose} size="lg">
				<div className="space-y-4">
					<FormError message="Бинд не найден" />
					<div className="ui-actions items-center flex justify-end">
						<button
							type="button"
							onClick={requestClose}
							className="ui-button ui-button--secondary rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-elevated"
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
			setAddLanguageError("Язык уже добавлен");
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
		const trimmedSlug =
			slug.trim() ||
			(mode === "create"
				? (translationDrafts.find((t) => t.title.trim())?.title.trim() ?? "")
				: "");

		if (!trimmedSlug) {
			nextErrors.slug = "Укажите заголовок или идентификатор";
		}

		if (!categoryId) {
			nextErrors.categoryId = "Выберите категорию";
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
				showToast("Бинд создан");
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
				showToast("Бинд сохранён");
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
			title={mode === "create" ? "Новый бинд" : "Редактировать бинд"}
			onClose={requestClose}
			closeDisabled={saving}
			size="xl"
		>
			<form onSubmit={submit} className="space-y-5">
				<FormError message={errors.form} />

				{dirty && (
					<div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
						Unsaved changes
					</div>
				)}

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

						<div className="ui-actions items-center flex min-w-0  gap-2">
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
								className="ui-button ui-button--secondary ui-button--small inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
							>
								<Plus size={15} />
								Добавить язык
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
										title="Удалить язык"
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
									label="Заголовок"
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

								<Field label="Инструкция для агента">
									<textarea
										value={activeDraft.agentInstructions ?? ""}
										maxLength={8000}
										onChange={(event) =>
											updateDraft(activeDraft.language, {
												agentInstructions: event.target.value,
											})
										}
										disabled={saving}
										className={textareaClass}
										placeholder="Внутренние шаги и ограничения. Не копируется клиенту."
									/>
								</Field>
								<Field
									label="Содержание"
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

				<details className="rounded-xl border border-border bg-background">
					<summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-muted hover:text-foreground">
						Metadata
					</summary>

					<div className="space-y-4 border-t border-border p-4">
						<div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr]">
							<Field label="Slug" error={errors.slug}>
								<input
									value={slug}
									onChange={(event) => setSlug(event.target.value)}
									disabled={saving}
									className={inputClass}
								/>
							</Field>

							<Field label="Категория" error={errors.categoryId}>
								<select
									value={categoryId}
									onChange={(event) => setCategoryId(event.target.value)}
									disabled={saving || categories.length === 0}
									className={inputClass}
								>
									{categories.length === 0 ? (
										<option value="">Нет категорий</option>
									) : (
										categories.map((category) => (
											<option key={category.id} value={category.id}>
												{category.name}
											</option>
										))
									)}
								</select>
							</Field>

							<Field label="Папка" hint="Необязательно">
								<select
									value={folderId}
									onChange={(event) => setFolderId(event.target.value)}
									disabled={saving || !categoryId}
									className={inputClass}
								>
									<option value="">Корень категории</option>
									{availableFolders.map((folder) => (
										<option key={folder.id} value={folder.id}>
											{getFolderPath(folder, folders)}
										</option>
									))}
								</select>
							</Field>
						</div>

						<ColorField value={color} onChange={setColor} disabled={saving} />

						<Field label="Теги" hint="Через запятую">
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
											onClick={() =>
												setTags((current) => toggleTag(current, tag))
											}
											disabled={saving}
											className="ui-button ui-button--secondary rounded-full border border-border px-2 py-1 text-xs text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
										>
											#{tag}
										</button>
									))}
								</div>
							)}
						</Field>
					</div>
				</details>

				<ModalActions
					submitLabel={mode === "create" ? "Создать" : "Сохранить"}
					saving={saving}
					onCancel={requestClose}
				/>

				{closeConfirmationOpen && (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
						<div
							role="alertdialog"
							aria-modal="true"
							aria-label="Отменить изменения"
							className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl"
						>
							<div className="text-base font-semibold">Отменить изменения?</div>
							<p className="mt-2 text-sm leading-6 text-muted">
								Несохранённые изменения будут потеряны.
							</p>
							<div className="ui-actions items-center mt-5 flex justify-end gap-2">
								<button
									type="button"
									onClick={() => setCloseConfirmationOpen(false)}
									className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
								>
									Продолжить редактирование
								</button>
								<button
									type="button"
									onClick={onClose}
									className="min-h-10 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-400"
								>
									Discard
								</button>
							</div>
						</div>
					</div>
				)}
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
		<fieldset aria-label={label} className="min-w-0 space-y-1.5">
			<legend className="flex items-center gap-2 text-sm font-medium">
				{label}
				{hint && <span className="text-xs font-normal text-muted">{hint}</span>}
			</legend>
			{children}
			<ErrorText message={error} />
		</fieldset>
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
		<Field label="Цвет" hint="Необязательно">
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
		<div className="ui-actions items-center sticky bottom-0 -mx-4 -mb-4 flex justify-end gap-2 border-t border-border bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:-mx-5 sm:-mb-4 sm:px-5">
			<button
				type="button"
				onClick={onCancel}
				disabled={saving}
				className="ui-button ui-button--secondary"
			>
				Отмена
			</button>

			<button
				type="submit"
				disabled={saving}
				aria-busy={saving}
				className={`ui-button ${danger ? "ui-button--danger" : "ui-button--primary"}`}
			>
				{saving ? "Сохранение…" : submitLabel}
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
		return `${category?.name ?? "Категория"} / ${getFolderPath(folder, folders)}`;
	}

	return category?.name ?? "Без категории";
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
			errors[`language.${draft.language}`] = "Некорректный код языка";
		}

		if (seen.has(language)) {
			errors[`language.${draft.language}`] = "Язык повторяется";
		}

		if (!title) {
			errors[`title.${draft.language}`] = "Укажите заголовок";
		}

		if (!content) {
			errors[`content.${draft.language}`] = "Введите содержание";
		}

		seen.add(language);

		if (title && content && isValidLanguageCode(language)) {
			translations.push({
				language,
				title,
				content,
				agentInstructions: draft.agentInstructions?.trim() || undefined,
				updatedAt: new Date().toISOString(),
			});
		}
	}

	if (translations.length === 0 && Object.keys(errors).length === 0) {
		errors.translations =
			"Добавьте заголовок и содержание хотя бы на одном языке";
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
					(bind.folderId !== undefined && categoryFolderIds.has(bind.folderId)),
			),
		};
	}

	if (type === "folder") {
		const folderIds = collectNestedFolderIds(id, folders);

		return {
			folders: folders.filter((folder) => folderIds.has(folder.id)),
			binds: binds.filter(
				(bind) => bind.folderId !== undefined && folderIds.has(bind.folderId),
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
