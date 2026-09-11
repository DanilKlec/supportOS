import { useEffect, useRef, useState } from "react";
import { contentApi } from "@/services/shared-content.service";
import { useAuthStore } from "@/store/auth.store";
import { can } from "../../shared/access.js";

const serialize = (value: unknown): string =>
	JSON.stringify(value, (_key, item) =>
		item && typeof item === "object" && !Array.isArray(item)
			? Object.fromEntries(
					Object.keys(item)
						.sort()
						.map((key) => [key, item[key]]),
				)
			: item,
	);
const drafts = new Map<
	string,
	{ data: any[]; base: string; version: number; stamp: string }
>();

export function useSharedPublication(
	dataset: "emails" | "bonuses" | "bonus-tools",
	data: any[],
	replace: (rows: any[]) => void,
	management = true,
) {
	const user = useAuthStore((s) => s.session?.user);
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
	const writes = useRef(0);
	const loadDocument = async () => {
		if (management || dataset === "emails") return contentApi(dataset);
		const [shared, personal] = await Promise.all([
			contentApi(dataset),
			contentApi(dataset, undefined, undefined, "personal"),
		]);
		return personal ?? (shared ? { ...shared, version: 0 } : null);
	};
	const apply = (row: Awaited<ReturnType<typeof contentApi>>) => {
		const values = row?.data ?? [];
		latest.current.replace(values);
		setBase(serialize(values));
		setVersion(row?.version ?? 0);
		setStamp(row?.updated_at ?? "");
		setReady(true);
		setError("");
	};
	useEffect(() => {
		const run = ++generation.current;
		setReady(false);
		setError("");
		let fetching = false;
		const load = async () => {
			if (fetching) return;
			fetching = true;
			const write = writes.current;
			try {
				const row = await loadDocument();
				if (run !== generation.current || write !== writes.current) return;
				const state = latest.current;
				const draft =
					!state.ready && writable ? drafts.get(draftKey) : undefined;
				if (draft) {
					state.replace(draft.data);
					setBase(draft.base);
					setVersion(draft.version);
					setStamp(draft.stamp);
					setReady(true);
					setError("");
				} else if (!state.ready || state.current === state.base) apply(row);
			} catch (e) {
				if (run === generation.current) setError((e as Error).message);
			} finally {
				fetching = false;
			}
		};
		void load();
		const timer = setInterval(load, 30000);
		window.addEventListener("focus", load);
		return () => {
			generation.current++;
			clearInterval(timer);
			window.removeEventListener("focus", load);
		};
	}, [dataset, user?.id, writable, management]);
	const dirty = ready && current !== base;
	useEffect(() => {
		if (!ready) return;
		if (dirty && writable)
			drafts.set(draftKey, { data: JSON.parse(current), base, version, stamp });
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
		writes.current++;
		const run = generation.current;
		const snapshot = JSON.parse(current);
		setBusy(true);
		setError("");
		try {
			const row = management
				? await contentApi(dataset, snapshot, version)
				: await contentApi(dataset, snapshot, version, "personal");
			if (run === generation.current && row) {
				setBase(serialize(row.data));
				setVersion(row.version);
				setStamp(row.updated_at);
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
			const row = await loadDocument();
			if (run === generation.current) apply(row);
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
										className="rounded-lg bg-accent px-3 py-2 text-accent-foreground"
									>
										Сохранить для себя
									</button>
									<button
										type="button"
										disabled={busy}
										onClick={() => void reload()}
										className="rounded-lg border border-border px-3 py-2"
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
				<div className="flex flex-wrap gap-2">
					{writable && ready && version === 0 && initial.current.length > 0 && (
						<button
							type="button"
							disabled={busy}
							onClick={() => replace(initial.current)}
							className="rounded-lg border border-border px-3 py-2"
						>
							Взять сохранённые данные браузера
						</button>
					)}
					<button
						type="button"
						disabled={busy}
						onClick={() => void reload()}
						className="rounded-lg border border-border px-3 py-2"
					>
						Загрузить общую версию
					</button>
					{writable && (
						<button
							type="button"
							disabled={!ready || busy || !dirty}
							onClick={() => void publish()}
							className="rounded-lg bg-accent px-3 py-2 text-accent-foreground disabled:opacity-40"
						>
							{busy ? "Сохранение…" : "Сохранить для всех"}
						</button>
					)}
				</div>
			</div>
		),
	};
}
