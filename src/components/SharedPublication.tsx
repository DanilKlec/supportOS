import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { projectCatalogQueryKey } from "@/services/project-catalog.service";
import {
	contentApi,
	type Publication,
} from "@/services/shared-content.service";
import { useAuthStore } from "@/store/auth.store";
import { clearLegacyBonusRecords } from "@/store/bonus.store";
import { clearLegacyBonusToolsRecords } from "@/store/bonus-tools.store";
import { clearLegacyProjectEmailRecords } from "@/store/project-email.store";
import { can } from "../../shared/access.js";

const serialize = (value: unknown): string =>
	JSON.stringify(value, (_key, item: unknown) =>
		item && typeof item === "object" && !Array.isArray(item)
			? Object.fromEntries(
					Object.keys(item)
						.sort()
						.map((key) => [key, (item as Record<string, unknown>)[key]]),
				)
			: item,
	);
const drafts = new Map<
	string,
	{ data: unknown[]; base: string; version: number; stamp: string }
>();

export function useSharedPublication<Row>(
	dataset: "emails" | "bonuses" | "bonus-tools",
	data: Row[],
	replace: (rows: Row[]) => void,
	management = true,
) {
	const user = useAuthStore((s) => s.session?.user);
	const queryClient = useQueryClient();
	const writable = management
		? can(
				user?.access,
				dataset === "emails" ? "projects.write" : "bonuses.write",
			)
		: dataset !== "emails" && can(user?.access, "bonuses.read");
	const [ready, setReady] = useState(false),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const [base, setBase] = useState(""),
		[version, setVersion] = useState(0),
		[stamp, setStamp] = useState("");
	const current = serialize(data);
	const draftKey = `${user?.id}:${dataset}:${management ? "shared" : "personal"}`;
	const initial = useRef(data);
	const latest = useRef({ current, base, ready, replace });
	latest.current = { current, base, ready, replace };
	const generation = useRef(0);
	const loadDocument = useCallback(async () => {
		if (management || dataset === "emails")
			return contentApi<typeof dataset, Row>(dataset);
		const [shared, personal] = await Promise.all([
			contentApi<typeof dataset, Row>(dataset),
			contentApi<typeof dataset, Row>(
				dataset,
				undefined,
				undefined,
				"personal",
			),
		]);
		return personal ?? (shared ? { ...shared, version: 0 } : null);
	}, [management, dataset]);
	const apply = useCallback(
		(row: Publication<Row> | null | undefined) => {
			const values = row?.data ?? [];
			latest.current.replace(values);
			setBase(serialize(values));
			setVersion(row?.version ?? 0);
			setStamp(row?.updated_at ?? "");
			setReady(true);
			setError("");
			if (!row) return;
			if (dataset === "emails") clearLegacyProjectEmailRecords();
			if (dataset === "bonuses") clearLegacyBonusRecords();
			if (dataset === "bonus-tools") clearLegacyBonusToolsRecords();
		},
		[dataset],
	);
	const query = useQuery({
		queryKey: [
			"shared-publication",
			user?.id,
			dataset,
			management ? "shared" : "personal",
		],
		queryFn: loadDocument,
		enabled: Boolean(user?.id),
		refetchInterval: 30000,
		refetchOnWindowFocus: true,
		retry: false,
	});
	useEffect(() => {
		return () => {
			generation.current++;
		};
	}, []);
	useEffect(() => {
		if (!query.isSuccess) return;
		const state = latest.current;
		const draft = !state.ready && writable ? drafts.get(draftKey) : undefined;
		if (draft) {
			state.replace(draft.data as Row[]);
			setBase(draft.base);
			setVersion(draft.version);
			setStamp(draft.stamp);
			setReady(true);
			setError("");
		} else if (!state.ready || state.current === state.base) {
			apply(query.data);
		}
	}, [apply, draftKey, query.data, query.isSuccess, writable]);
	useEffect(() => {
		if (query.error) setError(query.error.message);
	}, [query.error]);
	const dirty = ready && current !== base;
	useEffect(() => {
		if (!ready) return;
		if (dirty && writable)
			drafts.set(draftKey, {
				data: JSON.parse(current) as unknown[],
				base,
				version,
				stamp,
			});
		else drafts.delete(draftKey);
	}, [draftKey, ready, dirty, writable, current, base, version, stamp]);
	useEffect(() => {
		const warn = (e: BeforeUnloadEvent) => {
			if (dirty) {
				e.preventDefault();
				e.returnValue = "";
			}
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);
	const publish = async () => {
		if (!writable || !ready || busy) return;
		const run = generation.current;
		const snapshot = JSON.parse(current) as Row[];
		setBusy(true);
		setError("");
		try {
			const row = management
				? await contentApi<typeof dataset, Row>(dataset, snapshot, version)
				: await contentApi<typeof dataset, Row>(
						dataset,
						snapshot,
						version,
						"personal",
					);
			if (run === generation.current && row) {
				setBase(serialize(row.data));
				setVersion(row.version);
				setStamp(row.updated_at);
				if (dataset === "emails" || dataset === "bonuses") {
					void queryClient.invalidateQueries({
						queryKey: projectCatalogQueryKey(user?.id),
					});
				}
			}
		} catch (e) {
			if (run === generation.current) setError((e as Error).message);
		} finally {
			if (run === generation.current) setBusy(false);
		}
	};
	const reload = async () => {
		if (
			dirty &&
			!window.confirm(
				"Отменить локальные изменения и загрузить опубликованную версию?",
			)
		)
			return;
		const run = generation.current;
		setBusy(true);
		try {
			const result = await query.refetch({ throwOnError: true });
			if (run === generation.current) apply(result.data);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	const resetPersonal = async () => {
		if (
			!writable ||
			busy ||
			!window.confirm(
				"Удалить личные изменения этого справочника и использовать данные команды?",
			)
		)
			return;
		setBusy(true);
		const run = generation.current;
		try {
			await contentApi(dataset, [], version, "personal", "reset");
			const row = await loadDocument();
			if (run === generation.current) apply(row);
		} catch (e) {
			if (run === generation.current) setError((e as Error).message);
		} finally {
			if (run === generation.current) setBusy(false);
		}
	};
	if (!management)
		return {
			ready,
			canEdit: writable && ready && !busy,
			banner:
				!ready || error || dirty || (writable && version > 0) ? (
					<div className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
						<div>
							{!ready
								? "Подготавливаем справочник…"
								: dirty
									? "Личные изменения не сохранены"
									: writable && version > 0
										? "Вы используете свои настройки бонусов"
										: ""}
							{error && (
								<p role="alert" className="text-red-400">
									{error}
								</p>
							)}
						</div>
						<div className="flex flex-wrap gap-2">
							{dirty && (
								<>
									<button
										type="button"
										disabled={busy}
										onClick={() => void publish()}
										className="ui-button ui-button--primary bg-accent text-accent-foreground"
									>
										Сохранить для себя
									</button>
									<button
										type="button"
										disabled={busy}
										onClick={() => void reload()}
										className="ui-button ui-button--secondary border border-border"
									>
										Отменить изменения
									</button>
								</>
							)}
							{writable && version > 0 && !dirty && (
								<button
									type="button"
									disabled={busy}
									onClick={() => void resetPersonal()}
									className="text-xs text-muted underline"
								>
									Сбросить мои изменения
								</button>
							)}
							{error && !dirty && (
								<button
									type="button"
									disabled={busy}
									onClick={() => void reload()}
								>
									Повторить
								</button>
							)}
						</div>
					</div>
				) : null,
		};
	return {
		ready,
		canEdit: writable && ready && !busy,
		banner: (
			<div className="m-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
				<div>
					<strong>Общий справочник</strong>
					<p className="text-muted">
						{!ready
							? "Загрузка общей версии…"
							: dirty
								? "Есть черновик. Сохраните изменения для всей команды."
								: version
									? `Опубликовано ${new Date(stamp).toLocaleString("ru")} · версия ${version}`
									: "Общая версия пока пустая. Добавьте данные и опубликуйте."}
					</p>
					{error && (
						<p role="alert" className="text-red-400">
							{error}
						</p>
					)}
				</div>
				<div className="ui-actions items-center flex flex-wrap gap-2">
					{writable && ready && version === 0 && initial.current.length > 0 && (
						<button
							type="button"
							disabled={busy}
							onClick={() => replace(initial.current)}
							className="ui-button ui-button--secondary border border-border"
						>
							Взять сохранённые данные браузера
						</button>
					)}
					<button
						type="button"
						disabled={busy}
						onClick={() => void reload()}
						className="ui-button ui-button--secondary border border-border"
					>
						Загрузить общую версию
					</button>
					{writable && (
						<button
							type="button"
							disabled={!ready || busy || !dirty}
							onClick={() => void publish()}
							className="ui-button ui-button--primary bg-accent text-accent-foreground disabled:opacity-40"
						>
							{busy ? "Сохранение…" : "Сохранить для всех"}
						</button>
					)}
				</div>
			</div>
		),
	};
}
