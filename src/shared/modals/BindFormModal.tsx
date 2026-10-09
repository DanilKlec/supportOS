import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { BindTranslation } from "@/entities/bind";
import { languages } from "@/entities/language";
import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { useKnowledgeStore } from "@/store";

import { BaseModal } from "./BaseModal";
import { getFolderPath } from "./knowledge-modal-helpers";
import {
	ColorField,
	ErrorText,
	Field,
	type FieldErrors,
	FormError,
	getErrorMessage,
	inputClass,
	ModalActions,
	textareaClass,
} from "./ModalFormHelpers";
import type { ModalPayload } from "./modal.types";

interface TranslationDraft {
	language: string;
	title: string;
	content: string;
	agentInstructions?: string;
}

const DEFAULT_BIND_LANGUAGES = ["ru", "en", "de", "pt", "el"];

export function BindFormModal({
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
							className="ui-button ui-button--secondary border border-border hover:bg-surface-elevated"
						>
							Закрыть
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
			setAddLanguageError("Укажите код языка, например es или pt-br");
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
						Есть несохранённые изменения
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
									aria-label="Код нового языка"
									value={newLanguage}
									onChange={(event) => {
										setNewLanguage(event.target.value);
										setAddLanguageError("");
									}}
									disabled={saving}
									className="ui-input w-28 border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
									placeholder="es"
								/>
								<ErrorText message={addLanguageError} />
							</div>

							<button
								type="button"
								onClick={addLanguage}
								disabled={saving}
								className="ui-button ui-button--secondary ui-button--small inline-flex items-center gap-1.5 border border-border font-medium hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
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
										className={`ui-input ${inputClass}`}
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
										className={`ui-input ${textareaClass}`}
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
										className={`ui-input ${textareaClass}`}
									/>
								</Field>
							</div>
						</div>
					) : (
						<div className="rounded-lg border border-border bg-background px-4 py-6 text-center text-sm text-muted">
							Добавьте хотя бы один язык
						</div>
					)}
				</div>

				<details className="rounded-xl border border-border bg-background">
					<summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-muted hover:text-foreground">
						Раздел, папка и оформление
					</summary>

					<div className="space-y-4 border-t border-border p-4">
						<div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr]">
							<Field label="Идентификатор" error={errors.slug}>
								<input
									value={slug}
									onChange={(event) => setSlug(event.target.value)}
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

							<Field label="Папка" hint="Необязательно">
								<select
									value={folderId}
									onChange={(event) => setFolderId(event.target.value)}
									disabled={saving || !categoryId}
									className={`ui-input ${inputClass}`}
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
								className={`ui-input ${inputClass}`}
								placeholder="KYC, вывод, бонус"
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
											className="ui-button ui-button--secondary rounded-full border border-border text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
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
									Отменить изменения
								</button>
							</div>
						</div>
					</div>
				)}
			</form>
		</BaseModal>
	);
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
