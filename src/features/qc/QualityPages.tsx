import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { languages } from "@/entities/language";
import {
	useAIRuntime,
	useMaterials,
	useProposals,
	useSignals,
} from "@/features/operations/data";
import {
	Badge,
	Panel,
	QueryState,
	Row,
	Unavailable,
} from "@/features/operations/OperationsWorkspace";
import { BindDiff } from "@/features/shared-binds/BindDiff";
import { BindProposals } from "@/features/shared-binds/BindProposals";
import { sharedBindsService } from "@/services/shared-binds.service";
import { getKnowledgeHealthReport } from "@/shared/lib/knowledge-health";
import { useKnowledgeStore } from "@/store";
import { useAuthStore } from "@/store/auth.store";
import { canAccessPage, canTrain } from "../../../shared/access.js";
import { materialLifecycle, reviewItems } from "./review-model";
export function ReviewInbox({
	overview = false,
	gapsOnly = false,
}: {
	overview?: boolean;
	gapsOnly?: boolean;
}) {
	const proposals = useProposals(),
		signals = useSignals(),
		materials = useMaterials();
	const [filter, setFilter] = useState("all"),
		[search, setSearch] = useState(""),
		[selected, setSelected] = useState("");
	const items = reviewItems(
		proposals.data ?? [],
		signals.data ?? { feedback: [], gaps: [] },
		materials.data ?? [],
	);
	const visible = items.filter(
		(i) =>
			(!gapsOnly || i.kind === "gap") &&
			(filter === "all" || i.kind === filter) &&
			i.title.toLowerCase().includes(search.toLowerCase()),
	);
	const current = visible.find((i) => i.id === selected) ?? visible[0];
	return (
		<div className="ops-stack">
			<QueryState query={signals} />
			{!gapsOnly && <QueryState query={proposals} />}
			<QueryState query={materials} />
			{overview && (
				<div className="ops-metrics">
					{[
						["Предложения", proposals.data?.length],
						["Пробелы", signals.data?.gaps.length],
						[
							"Устаревшие",
							signals.data
								? items.filter((i) => i.kind === "outdated").length
								: undefined,
						],
						["AI candidates", undefined],
					].map(([label, value]) => (
						<div key={label}>
							<span>{label}</span>
							<strong>{value ?? "—"}</strong>
							<small>
								{value === undefined
									? "Не настроено / нет данных"
									: "Доступная выборка"}
							</small>
						</div>
					))}
				</div>
			)}
			<div className="ops-toolbar">
				<input
					className="ui-input"
					aria-label="Поиск очереди"
					placeholder="Поиск по теме или материалу…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				{!gapsOnly && (
					<select
						className="ui-input"
						aria-label="Тип проверки"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
					>
						<option value="all">Все источники</option>
						<option value="proposal">Предложения</option>
						<option value="outdated">Устаревшие</option>
						<option value="gap">Пробелы</option>
					</select>
				)}
			</div>
			<p className="ops-note">
				Сначала отметки об устаревании, затем предложения и пробелы. Риск и
				уверенность не вычисляются без классификатора. Отметки и пробелы
				ограничены последними 100 записями.
			</p>
			{visible.length ? (
				<div className="ops-split">
					<div className="ops-review-list">
						{visible.map((i) => (
							<button
								key={i.id}
								type="button"
								className="ops-review-item"
								aria-pressed={i.id === current?.id}
								onClick={() => setSelected(i.id)}
							>
								<strong>{i.title}</strong>
								<span>
									{i.kind} · {i.source} ·{" "}
									{new Date(i.createdAt).toLocaleDateString("ru")}
								</span>
							</button>
						))}
					</div>
					{current && (
						<Panel title={current.title} aside={<Badge>{current.kind}</Badge>}>
							<div className="ops-note">
								{current.evidence.map((e) => (
									<p key={e}>{e}</p>
								))}
								<p>
									Риск: не оценён · Уверенность: нет данных
									{current.projectId ? ` · Проект: ${current.projectId}` : ""}
								</p>
							</div>
							{current.kind === "proposal" ? (
								<BindProposals
									key={current.materialId}
									sourceId={current.materialId}
									proposalId={current.id.replace("proposal:", "")}
									expanded
								/>
							) : (
								<>
									<Unavailable
										message={
											current.kind === "gap"
												? "Тема требует подготовки проверенного материала. Статус закрытия пробела сервер пока не поддерживает."
												: "Проверьте актуальность материала. Отметка оператора сама по себе не меняет опубликованный текст."
										}
									/>
									<div className="ops-panel-actions">
										{current.materialId && (
											<Link
												to="/"
												hash={`bind=${encodeURIComponent(current.materialId)}`}
												className="ui-button"
											>
												Открыть материал
											</Link>
										)}
										<Link to="/qc" hash="materials" className="ui-button">
											Материалы
										</Link>
									</div>
								</>
							)}
						</Panel>
					)}
				</div>
			) : (
				!signals.isPending &&
				!proposals.isPending &&
				!signals.error &&
				!proposals.error && (
					<Unavailable message="Нет элементов, соответствующих фильтрам." />
				)
			)}
		</div>
	);
}
export function MaterialLifecycle() {
	const materials = useMaterials(),
		signals = useSignals();
	const outdated = new Set(
		signals.data?.feedback
			.filter((f) => f.kind === "outdated")
			.map((f) => f.bind_id),
	);
	return (
		<Panel title="Material lifecycle">
			<QueryState query={materials} />
			<QueryState query={signals} />
			<p className="ops-note">
				Published — общая база, Draft — личная версия, Needs review — есть
				отметка «Устарело», Archived — архив. Отдельные статусы Outdated и
				Deprecated пока не хранятся.
			</p>
			<div className="ops-table-wrap">
				<table>
					<thead>
						<tr>
							<th>Материал</th>
							<th>Состояние</th>
							<th>Обновлён</th>
						</tr>
					</thead>
					<tbody>
						{materials.data?.map((b) => (
							<tr key={b.id}>
								<td>
									<Link to="/" hash={`bind=${encodeURIComponent(b.id)}`}>
										{b.translations[0]?.title || b.slug}
									</Link>
								</td>
								<td>
									<Badge>
										{!signals.data && !b.archived
											? "Нет данных проверки"
											: materialLifecycle(b, outdated)}
									</Badge>
								</td>
								<td>{new Date(b.updatedAt).toLocaleDateString("ru")}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{materials.data?.length === 0 && (
				<Unavailable message="Общих материалов пока нет." />
			)}
		</Panel>
	);
}
export function DuplicateKnowledge() {
	const materials = useMaterials();
	const categories = useKnowledgeStore((s) => s.categories),
		folders = useKnowledgeStore((s) => s.folders);
	const report = getKnowledgeHealthReport({
		binds: materials.data ?? [],
		categories,
		folders,
	});
	const duplicates = report.issues.filter((i) => i.id.startsWith("duplicate-"));
	return (
		<Panel title="Exact content matches">
			<QueryState query={materials} />
			<p className="ops-note">
				Используется существующая проверка нормализованного текста.
				Семантические дубликаты не определяются.
			</p>
			{duplicates.map((i) => (
				<Row
					key={i.id}
					title={
						materials.data?.find((b) => b.id === i.bindId)?.translations[0]
							?.title ?? i.title
					}
					detail={i.description}
				>
					<Link
						className="ui-button"
						to="/"
						hash={`bind=${encodeURIComponent(i.bindId ?? "")}`}
					>
						Открыть
					</Link>
				</Row>
			))}
			{materials.data && !duplicates.length && (
				<Unavailable message="Повторяющееся содержимое не найдено." />
			)}
		</Panel>
	);
}
export function LanguageQuality() {
	const materials = useMaterials();
	const active = materials.data?.filter((b) => !b.archived) ?? [];
	return (
		<Panel title="Translation coverage">
			<QueryState query={materials} />
			<div className="ops-table-wrap">
				<table>
					<thead>
						<tr>
							<th>Язык</th>
							<th>Заполнено</th>
							<th>Не хватает</th>
							<th>Покрытие</th>
						</tr>
					</thead>
					<tbody>
						{languages.map((l) => {
							const count = active.filter((b) =>
								b.translations.some(
									(t) => t.language === l.code && t.content.trim(),
								),
							).length;
							return (
								<tr key={l.code}>
									<td>{l.name}</td>
									<td>{materials.data ? count : "—"}</td>
									<td>{materials.data ? active.length - count : "—"}</td>
									<td>
										{active.length
											? `${Math.round((count / active.length) * 100)}%`
											: "—"}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{materials.data && !active.length && (
				<Unavailable message="Нет активных материалов для расчёта покрытия." />
			)}
		</Panel>
	);
}
export function AIQuality() {
	const runtime = useAIRuntime(),
		signals = useSignals();
	const access = useAuthStore((s) => s.session?.user.access);
	return (
		<div className="ops-stack">
			<Panel title="Knowledge feedback">
				<QueryState query={signals} />
				{signals.data && (
					<>
						<Row title="Полезно">
							<Badge>
								{
									signals.data.feedback.filter((f) => f.kind === "helpful")
										.length
								}
							</Badge>
						</Row>
						<Row title="Устарело">
							<Badge>
								{
									signals.data.feedback.filter((f) => f.kind === "outdated")
										.length
								}
							</Badge>
						</Row>
						<p className="ops-note">
							Последние 100 отметок. Они не измеряют долю отправленных ответов.
						</p>
					</>
				)}
			</Panel>
			<Panel title="AI feedback">
				{canTrain(access) ? (
					<>
						<QueryState query={runtime} />
						{runtime.data && (
							<>
								<Row title="Полезные ответы">
									<Badge>
										{
											runtime.data.document.feedback.filter(
												(f) => f.rating === "positive",
											).length
										}
									</Badge>
								</Row>
								<Row title="Проблемы">
									<Badge>
										{
											runtime.data.document.feedback.filter(
												(f) => f.rating === "negative",
											).length
										}
									</Badge>
								</Row>
							</>
						)}
					</>
				) : (
					<Unavailable message="Нет прав на чтение AI-оценок." />
				)}
				<div className="ops-panel-actions">
					{[
						["playground", "Проверить ответ"],
						["tests", "Тесты"],
						["feedback", "Причины ошибок"],
					]
						.filter(([id]) => canAccessPage(access, "/qc", id))
						.map(([id, label]) => (
							<Link key={id} to="/qc" hash={id} className="ui-button">
								{label}
							</Link>
						))}
				</div>
			</Panel>
		</div>
	);
}
export function KnowledgeHistory() {
	const materials = useMaterials();
	const [id, setId] = useState("");
	const user = useAuthStore((s) => s.session?.user);
	const selected = materials.data?.find((b) => b.id === id);
	const history = useQuery({
		queryKey: ["bind-history", user?.id, id],
		queryFn: () => sharedBindsService.history(id),
		enabled: !!id,
	});
	return (
		<div className="ops-stack">
			<QueryState query={materials} />
			<label className="ui-field ops-toolbar">
				Материал
				<select
					className="ui-input"
					value={id}
					onChange={(e) => setId(e.target.value)}
				>
					<option value="">Выберите материал</option>
					{materials.data?.map((b) => (
						<option key={b.id} value={b.id}>
							{b.translations[0]?.title || b.slug}
						</option>
					))}
				</select>
			</label>
			{!id ? (
				<Unavailable message="Выберите материал для просмотра последних 50 версий." />
			) : (
				<>
					<QueryState query={history} />
					{history.data?.length === 0 && (
						<Unavailable message="История материала пуста." />
					)}
					{history.data?.map((revision) => (
						<details key={revision.id} className="ops-panel">
							<summary className="ops-note">
								Версия {revision.id} ·{" "}
								{new Date(revision.created_at).toLocaleString("ru")} ·{" "}
								{revision.owner_id ? "Личная ветка" : "Основная ветка"} ·{" "}
								{revision.operation}
							</summary>
							{selected && (
								<div className="ops-note">
									<BindDiff before={revision.snapshot} after={selected} />
								</div>
							)}
						</details>
					))}
					<Panel title="Восстановление">
						<Unavailable message="Общий откат по идентификатору версии не предоставлен текущим API. Просмотрите diff и внесите проверенное изменение через существующий редактор материалов." />
						<div className="ops-panel-actions">
							<Link to="/qc" hash="materials" className="ui-button">
								Открыть редактор
							</Link>
						</div>
					</Panel>
				</>
			)}
		</div>
	);
}
