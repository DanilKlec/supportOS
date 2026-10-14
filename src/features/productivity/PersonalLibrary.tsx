import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Bind } from "@/entities/bind";
import { useToast } from "@/shared/hooks/useToast";
import { getBindTitle, searchBinds } from "@/shared/lib/bind-search";
import { copyToClipboard } from "@/shared/lib/clipboard";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";
import { useKnowledgeStore } from "@/store/knowledge.store";
import { can } from "../../../shared/access.js";
import { BindFeedback, KnowledgeGapButton } from "./KnowledgeSignals";
import { usePreference } from "./preferences";

const emptyIds: string[] = [];
const emptyNotes: Record<string, string> = {};
export function PersonalLibrary() {
	const { binds, remoteBinds, activeTab, language, openBind } =
		useKnowledgeStore();
	const access = useAuthStore((s) => s.session?.user.access);
	const hash = useRouterState({ select: (s) => s.location.hash });
	const navigate = useNavigate();
	const { showToast } = useToast();
	const [pins, setPins] = usePreference("pinned-materials", emptyIds);
	const [recent, setRecent] = usePreference("recent-materials", emptyIds);
	const [notes, setNotes] = usePreference("private-notes", emptyNotes);
	const [open, setOpen] = useState(false);
	const [previewId, setPreviewId] = useState<string>();
	const [compareId, setCompareId] = useState<string>();
	const [note, setNote] = useState("");
	const [allPins, setAllPins] = useState(false);
	const values = Array.from(
		new Map([...binds, ...remoteBinds].map((b) => [b.id, b])).values(),
	).filter((b) => !b.archived);
	const preview = values.find((b) => b.id === previewId);
	const comparison = values.find((b) => b.id === compareId);
	useEffect(() => {
		const show = () => setOpen(true);
		window.addEventListener("supportos:library", show);
		return () => window.removeEventListener("supportos:library", show);
	}, []);
	useEffect(() => {
		if (!hash.startsWith("bind=") || !can(access, "binds.read")) return;
		let id: string;
		try {
			id = decodeURIComponent(hash.slice(5));
		} catch {
			return;
		}
		if ([...binds, ...remoteBinds].some((b) => b.id === id && !b.archived))
			openBind(id);
	}, [hash, binds, remoteBinds, openBind, access]);
	useEffect(() => {
		if (activeTab && can(access, "binds.read") && recent[0] !== activeTab)
			setRecent(
				[activeTab, ...recent.filter((id) => id !== activeTab)].slice(0, 20),
			);
	}, [activeTab, access, recent, setRecent]);
	if (!can(access, "binds.read")) return null;
	const inspect = (bind: Bind) => {
		setPreviewId(bind.id);
		setNote(notes[bind.id] ?? "");
	};
	const visit = (id: string) => {
		openBind(id);
		void navigate({ to: "/", hash: `bind=${encodeURIComponent(id)}` });
		setOpen(false);
		setPreviewId(undefined);
		setCompareId(undefined);
	};
	const text = (bind: Bind) =>
		(
			bind.translations.find((t) => t.language === language) ??
			bind.translations[0]
		)?.content ?? "";
	const copy = async (value: string) =>
		showToast(
			(await copyToClipboard(value)) ? "Скопировано" : "Не удалось скопировать",
		);
	const rows = (ids: string[]) =>
		ids
			.map((id) => values.find((b) => b.id === id))
			.filter((b): b is Bind => !!b)
			.map((b) => (
				<div
					key={b.id}
					className="ui-actions items-center flex  gap-2 border-b border-border py-2"
				>
					<button
						type="button"
						className="min-h-10 flex-1 text-left"
						onClick={() => visit(b.id)}
					>
						{getBindTitle(b, language)}
					</button>
					<button
						type="button"
						className="min-h-10 px-2 text-sm"
						onClick={() => inspect(b)}
					>
						Просмотр
					</button>
				</div>
			));
	return (
		<>
			{open && (
				<BaseModal title="Рабочая подборка" onClose={() => setOpen(false)}>
					{activeTab && (
						<button
							type="button"
							className="mb-4 min-h-10 rounded-lg border border-border px-3"
							onClick={() => {
								const bind = values.find((b) => b.id === activeTab);
								if (bind) inspect(bind);
							}}
						>
							Текущий материал · заметка и действия
						</button>
					)}
					<h3 className="font-semibold">Закреплённое</h3>
					<KnowledgeGapButton />
					<KnowledgeGapButton />
					{pins.length ? (
						rows(allPins ? pins : pins.slice(0, 10))
					) : (
						<p className="py-3 text-sm text-muted">
							Закрепите материал в его предпросмотре.
						</p>
					)}
					{pins.length > 10 && (
						<button
							type="button"
							onClick={() => setAllPins(!allPins)}
							className="min-h-10"
						>
							{allPins ? "Свернуть" : "Показать все"}
						</button>
					)}
					<h3 className="mt-5 font-semibold">Недавнее</h3>
					{rows(recent)}
				</BaseModal>
			)}
			{preview && (
				<BaseModal
					title={comparison ? "Два материала" : getBindTitle(preview, language)}
					size={comparison ? "xl" : "lg"}
					onClose={() => {
						setPreviewId(undefined);
						setCompareId(undefined);
					}}
				>
					<div className={comparison ? "grid gap-4 md:grid-cols-2" : ""}>
						{[preview, ...(comparison ? [comparison] : [])].map((b) => (
							<article key={b.id} className="min-w-0">
								<h3 className="font-semibold">{getBindTitle(b, language)}</h3>
								<p className="my-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">
									{text(b)}
								</p>
								<button
									type="button"
									className="min-h-10 px-2 text-sm"
									onClick={() => void copy(text(b))}
								>
									Копировать текст
								</button>
								<button
									type="button"
									className="min-h-10 px-2 text-sm"
									onClick={() => visit(b.id)}
								>
									Открыть
								</button>
							</article>
						))}
					</div>
					<div className="ui-actions items-center my-3 flex flex-wrap gap-2">
						<button
							type="button"
							className="min-h-10 rounded-lg border border-border px-3"
							onClick={() => {
								const previous = pins;
								setPins(
									pins.includes(preview.id)
										? pins.filter((id) => id !== preview.id)
										: [...pins, preview.id],
								);
								showToast("Подборка обновлена", {
									action: {
										label: "Отменить",
										onClick: () => setPins(previous),
									},
								});
							}}
						>
							{pins.includes(preview.id) ? "Открепить" : "Закрепить"}
						</button>
						<button
							type="button"
							className="min-h-10 px-3"
							onClick={() =>
								void copy(
									`${location.origin}/#bind=${encodeURIComponent(preview.id)}`,
								)
							}
						>
							Копировать ссылку
						</button>
						{comparison && (
							<button
								type="button"
								className="min-h-10 px-3"
								onClick={() => {
									setPreviewId(comparison.id);
									setCompareId(preview.id);
									setNote(notes[comparison.id] ?? "");
								}}
							>
								Поменять местами
							</button>
						)}
					</div>
					{remoteBinds.some((b) => b.id === preview.id) && (
						<BindFeedback bindId={preview.sourceBindId ?? preview.id} />
					)}
					<label className="ui-field text-sm">
						Личная заметка · только в этом браузере
						<textarea
							maxLength={4000}
							value={note}
							onChange={(e) => setNote(e.target.value)}
							className="ui-input mt-2 w-full border border-border bg-background"
						/>
					</label>
					<button
						type="button"
						className="min-h-10 px-3 text-sm"
						onClick={() => {
							const previous = notes;
							setNotes({ ...notes, [preview.id]: note });
							showToast("Личная заметка сохранена", {
								action: {
									label: "Отменить",
									onClick: () => {
										setNotes(previous);
										setNote(previous[preview.id] ?? "");
									},
								},
							});
						}}
					>
						Сохранить заметку
					</button>
					<label className="ui-field mt-4  text-sm">
						Открыть рядом
						<select
							value={compareId ?? ""}
							onChange={(e) => setCompareId(e.target.value || undefined)}
							className="ui-input ml-2 max-w-full border border-border bg-background"
						>
							<option value="">Не выбрано</option>
							{values
								.filter((b) => b.id !== preview.id)
								.map((b) => (
									<option key={b.id} value={b.id}>
										{getBindTitle(b, language)}
									</option>
								))}
						</select>
					</label>
					<h3 className="mt-4 font-semibold">Похожие материалы</h3>
					{rows(
						searchBinds(
							values.filter((b) => b.id !== preview.id),
							getBindTitle(preview, language),
							{ language },
						)
							.slice(0, 5)
							.map((b) => b.id),
					)}
				</BaseModal>
			)}
		</>
	);
}
