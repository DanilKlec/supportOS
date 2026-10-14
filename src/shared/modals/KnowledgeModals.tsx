import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import type { Bind } from "@/entities/bind";
import type { KnowledgeCategory, KnowledgeFolder } from "@/entities/knowledge";
import {
	knowledgeService,
	type RestoreDeletedItemsInput,
} from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { useKnowledgeStore } from "@/store";

import { BaseModal } from "./BaseModal";
import { FolderDestination } from "./FolderDestination";
import {
	getBindLocation,
	getBindTitle,
	getFolderPath,
} from "./knowledge-modal-helpers";
import {
	ColorField,
	Field,
	type FieldErrors,
	FormError,
	getErrorMessage,
	inputClass,
	ModalActions,
	optional,
} from "./ModalFormHelpers";
import type { KnowledgeObjectType, ModalPayload } from "./modal.types";

export function CreateCategoryModal({ onClose }: { onClose: () => void }) {
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
						className={`ui-input ${inputClass}`}
					/>
				</Field>

				<Field label="Значок" hint="Необязательно">
					<input
						value={icon}
						onChange={(event) => setIcon(event.target.value)}
						disabled={saving}
						className={`ui-input ${inputClass}`}
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

export function CreateFolderModal({
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
						className={`ui-input ${inputClass}`}
					/>
				</Field>

				<Field label="Категория" error={errors.categoryId}>
					<select
						value={categoryId}
						onChange={(event) => setCategoryId(event.target.value)}
						disabled={saving || categories.length === 0}
						className={`ui-input ${inputClass}`}
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
						className={`ui-input ${inputClass}`}
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
						className={`ui-input ${inputClass}`}
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

export function RenameModal({
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
						className={`ui-input ${inputClass}`}
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

export function DeleteModal({
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

export function MoveBindModal({
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
							className={`ui-input ${inputClass}`}
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
