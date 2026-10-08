import { Check, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Bind, BindTranslation } from "@/entities/bind";
import { languages } from "@/entities/language";
import { sharedBindsService } from "@/services/shared-binds.service";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";
import { BindDiff } from "./BindDiff";
import { draftKey, readDraft, removeDraft, writeDraft } from "./bind-drafts";

const inputClass = "w-full";

export function SharedBindEditor({
	original,
	onClose,
	onSaved,
	personal = false,
	draftSourceId,
	draftTargetId,
	save,
}: {
	original?: Bind;
	onClose: () => void;
	onSaved: (bind: Bind) => void;
	personal?: boolean;
	draftSourceId?: string;
	draftTargetId?: string;
	save?: (
		draft: {
			translations: BindTranslation[];
			tags: string[];
		},
		latest?: Bind | null,
	) => Promise<Bind>;
}) {
	const actor = useAuthStore((s) => s.session?.user.id) ?? "anonymous";
	const key = draftKey(
		actor,
		draftTargetId ?? actor,
		draftSourceId ?? original?.sourceBindId ?? original?.id ?? "new",
		personal,
	);
	const [retryBase, setRetryBase] = useState<Bind>();
	const [conflict, setConflict] = useState<Bind | null>(null);
	const [conflictLoading, setConflictLoading] = useState(false);
	const loadConflict = async () => {
		setConflictLoading(true);
		try {
			const rows = personal
				? await sharedBindsService.personal(draftTargetId ?? actor)
				: await sharedBindsService.list();
			const latest = rows.find((b) =>
				personal
					? b.sourceBindId ===
						(draftSourceId ?? original?.sourceBindId ?? original?.id)
					: b.id === original?.id,
			);
			if (!latest || latest.archived) {
				setError(
					"Версия удалена или недоступна. Ваш черновик сохранён; автоматическая перезапись запрещена.",
				);
				return;
			}
			setConflict(latest);
		} catch (e) {
			setError(
				"Не удалось загрузить актуальную версию: " + (e as Error).message,
			);
		} finally {
			setConflictLoading(false);
		}
	};
	const [recovery, setRecovery] = useState(() => readDraft(key));
	const [draftStatus, setDraftStatus] = useState("");
	const [baseVersion, setBaseVersion] = useState<string | null>(
		original?.updatedAt ?? null,
	);
	const [translations, setTranslations] = useState<BindTranslation[]>(
		() =>
			original?.translations.map((t) => ({ ...t })) ?? [
				{ language: "ru", title: "", content: "", updatedAt: "" },
			],
	);
	const [language, setLanguage] = useState(
		original?.translations[0]?.language ?? "ru",
	);
	const [tags, setTags] = useState(original?.tags.join(", ") ?? "");
	const [saving, setSaving] = useState(false);
	const [reviewed, setReviewed] = useState(false);
	const reviewDraft = {
		translations: translations
			.filter((t) => t.title.trim() || t.content.trim())
			.map((t) => ({ ...t, title: t.title.trim(), content: t.content.trim() })),
		tags: [
			...new Set(
				tags
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean),
			),
		],
	};
	const [error, setError] = useState("");
	const dirty = useRef(false);
	useEffect(() => {
		if (!dirty.current || recovery) return;
		try {
			writeDraft(key, {
				translations,
				tags,
				language,
				baseVersion,
				savedAt: new Date().toISOString(),
			});
			setDraftStatus("Черновик сохранён в этом браузере");
		} catch {
			setDraftStatus(
				"Не удалось сохранить черновик. Не закрывайте редактор до сохранения ответа.",
			);
		}
	}, [key, translations, tags, language, baseVersion, recovery]);
	const initialFocus = useRef<HTMLInputElement>(null);
	const translation = translations.find((t) => t.language === language);
	useEffect(() => {
		initialFocus.current?.focus();
		const beforeUnload = (e: BeforeUnloadEvent) => {
			if (dirty.current) {
				e.preventDefault();
				e.returnValue = "";
			}
		};
		window.addEventListener("beforeunload", beforeUnload);
		return () => window.removeEventListener("beforeunload", beforeUnload);
	}, []);
	const close = () => {
		if (
			!saving &&
			(!dirty.current ||
				window.confirm(
					"Закрыть редактор? Локальный черновик можно восстановить при следующем открытии.",
				))
		)
			onClose();
	};
	function update(
		field: "title" | "content" | "agentInstructions",
		value: string,
	) {
		dirty.current = true;
		setTranslations((current) => {
			const found = current.find((t) => t.language === language);
			return found
				? current.map((t) =>
						t.language === language ? { ...t, [field]: value } : t,
					)
				: [
						...current,
						{ language, title: "", content: "", updatedAt: "", [field]: value },
					];
		});
	}
	return (
		<BaseModal
			title={
				personal
					? "Личная версия ответа"
					: original
						? "Редактировать общий бинд"
						: "Новый общий бинд"
			}
			onClose={close}
			closeDisabled={saving}
			size="lg"
		>
			<form
				onChange={() => setReviewed(false)}
				onSubmit={async (e) => {
					e.preventDefault();
					if (saving || recovery || conflict || conflictLoading) return;
					if (!personal && !reviewed) {
						setReviewed(true);
						return;
					}
					setSaving(true);
					setError("");
					try {
						const draft = { translations, tags: tags.split(",") };
						const saved = await (save
							? save(draft, retryBase)
							: sharedBindsService.save({
									original: retryBase ?? original,
									...draft,
								}));
						dirty.current = false;
						try {
							removeDraft(key);
						} catch {
							setDraftStatus(
								"Ответ сохранён, но старый локальный черновик не удалось удалить.",
							);
						}
						onSaved(saved);
					} catch (e) {
						setError(e instanceof Error ? e.message : "Не удалось сохранить");
						if ((e as { status?: number }).status === 409) {
							setReviewed(false);
							await loadConflict();
						}
					} finally {
						setSaving(false);
					}
				}}
				className="space-y-5"
			>
				{conflict && (
					<section className="rounded-xl border border-amber-400/30 p-4">
						<h3 className="font-semibold">Ответ изменён другим сотрудником</h3>
						<p className="my-3 text-xs text-muted">
							Слева — актуальная версия, справа — ваши правки. Ваш текст
							остаётся в редакторе. Продолжение не публикует его автоматически.
						</p>
						<BindDiff
							before={{
								translations: conflict.translations,
								tags: conflict.tags,
							}}
							after={reviewDraft}
						/>
						<button
							type="button"
							onClick={() => {
								setRetryBase(conflict);
								setBaseVersion(conflict.updatedAt);
								setConflict(null);
								setError("");
								setReviewed(false);
							}}
							className="ui-button ui-button--secondary mt-3 border border-border"
						>
							Продолжить с моими правками
						</button>
					</section>
				)}
				{conflictLoading && (
					<output className="text-xs text-muted">
						Загружаем актуальную версию для сравнения…
					</output>
				)}
				{recovery && (
					<section className="rounded-xl border border-border bg-surface-elevated p-4">
						<h3 className="text-sm font-semibold">
							Найден несохранённый черновик
						</h3>
						<p className="my-2 text-xs text-muted">
							{new Date(recovery.savedAt).toLocaleString("ru")} · только в этом
							браузере
						</p>
						{recovery.baseVersion !== (original?.updatedAt ?? null) && (
							<p className="mb-3 text-xs text-amber-400">
								Сохранённый ответ изменился после создания черновика. Перед
								публикацией сравните версии.
							</p>
						)}
						<div className="ui-actions items-center flex gap-2">
							<button
								type="button"
								onClick={() => {
									setTranslations(recovery.translations);
									setTags(recovery.tags);
									setLanguage(recovery.language);
									setBaseVersion(recovery.baseVersion);
									dirty.current = true;
									setRecovery(null);
									setReviewed(false);
								}}
								className="ui-button ui-button--primary bg-accent text-accent-foreground"
							>
								Восстановить черновик
							</button>
							<button
								type="button"
								onClick={() => {
									try {
										removeDraft(key);
										setRecovery(null);
									} catch {
										setDraftStatus("Не удалось удалить черновик");
									}
								}}
								className="ui-button ui-button--secondary border border-border"
							>
								Удалить черновик
							</button>
						</div>
					</section>
				)}
				{draftStatus && (
					<output className="text-xs text-muted">{draftStatus}</output>
				)}
				{dirty.current && baseVersion !== (original?.updatedAt ?? null) && (
					<p className="text-xs text-amber-400">
						Восстановлен черновик прежней версии. Проверьте текст перед
						сохранением.
					</p>
				)}
				<p className="flex items-start gap-2 rounded-xl border border-accent/20 bg-accent/5 p-3 text-sm leading-6 text-muted">
					<Users size={18} className="mt-1 shrink-0 text-accent" />
					{personal
						? "Изменения сохранятся только для выбранного аккаунта. Общий оригинал и ответы коллег останутся прежними."
						: "После сохранения этот ответ будет доступен всей команде. Пустые языковые версии не публикуются."}
				</p>
				{error && (
					<p
						role="alert"
						className="rounded-xl border border-red-400/25 bg-red-400/5 p-3 text-sm text-red-400"
					>
						{error}
					</p>
				)}
				<fieldset
					disabled={saving || !!recovery || !!conflict || conflictLoading}
					className="space-y-4 disabled:opacity-60"
				>
					<label className="ui-field text-sm font-medium">
						Язык перевода
						<select
							value={language}
							onChange={(e) => setLanguage(e.target.value)}
							className={`ui-input ${`${inputClass} mt-2`}`}
						>
							{[
								...new Set([
									...languages.map((l) => l.code),
									...translations.map((t) => t.language),
								]),
							].map((code) => (
								<option key={code} value={code}>
									{languages.find((l) => l.code === code)?.name ?? code}
									{translations.some(
										(t) => t.language === code && t.content.trim(),
									)
										? " •"
										: ""}
								</option>
							))}
						</select>
					</label>
					<label className="ui-field text-sm font-medium">
						Название
						<input
							ref={initialFocus}
							maxLength={200}
							value={translation?.title ?? ""}
							onChange={(e) => update("title", e.target.value)}
							placeholder="Например, условия бонуса на депозит"
							className={`ui-input ${`${inputClass} mt-2`}`}
						/>
					</label>
					<label className="ui-field text-sm font-medium">
						Инструкция для агента
						<textarea
							maxLength={8000}
							value={translation?.agentInstructions ?? ""}
							onChange={(event) =>
								update("agentInstructions", event.target.value)
							}
							placeholder="Внутренние шаги и ограничения. Не копируется клиенту."
							className={`ui-input ${`${inputClass} mt-2 min-h-28 resize-y leading-6`}`}
						/>
					</label>
					<label className="ui-field text-sm font-medium">
						Текст ответа
						<textarea
							maxLength={30000}
							value={translation?.content ?? ""}
							onChange={(e) => update("content", e.target.value)}
							placeholder="Напишите готовый ответ для клиента…"
							className={`ui-input ${`${inputClass} mt-2 min-h-52 resize-y leading-6`}`}
						/>
					</label>
					<label className="ui-field text-sm font-medium">
						Теги <span className="font-normal text-muted">· через запятую</span>
						<input
							maxLength={500}
							value={tags}
							onChange={(e) => {
								dirty.current = true;
								setTags(e.target.value);
							}}
							placeholder="депозит, бонус, условия"
							className={`ui-input ${`${inputClass} mt-2`}`}
						/>
					</label>
				</fieldset>
				{!personal && reviewed && (
					<section className="rounded-2xl border border-border p-4">
						<h3 className="mb-3 font-semibold">Проверка перед публикацией</h3>
						<BindDiff
							before={
								original
									? {
											translations: (retryBase ?? original).translations,
											tags: (retryBase ?? original).tags,
										}
									: undefined
							}
							after={reviewDraft}
						/>
						<p className="mt-3 text-xs text-muted">
							Подтвердите публикацию изменений для всей команды.
						</p>
					</section>
				)}
				<div className="ui-actions items-center flex flex-wrap justify-end gap-3 border-t border-border pt-4">
					<button
						type="button"
						disabled={saving}
						onClick={close}
						className="ui-button ui-button--secondary border border-border hover:bg-surface-elevated disabled:opacity-50"
					>
						Отмена
					</button>
					<button
						type="submit"
						disabled={saving || !!recovery || !!conflict || conflictLoading}
						className="ui-button ui-button--primary flex items-center gap-2 bg-accent font-semibold text-accent-foreground disabled:opacity-50"
					>
						<Check size={17} />
						{saving
							? "Сохраняем…"
							: personal
								? "Сохранить личную версию"
								: reviewed
									? "Опубликовать для всех"
									: "Проверить изменения"}
					</button>
				</div>
			</form>
		</BaseModal>
	);
}
