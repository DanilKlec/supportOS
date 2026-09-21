export type Capability<T> =
	| { state: "ready"; data: T }
	| { state: "not-configured"; reason: string };
export interface LearningEvidence {
	kind: "feedback" | "agent-edit" | "material";
	sourceId: string;
	summary: string;
	createdAt: string;
}
export interface LearningCandidate {
	id: string;
	projectId?: string;
	sourceMaterialIds: string[];
	reason: string;
	currentValue?: string;
	suggestedValue: string;
	confidence: number;
	risk: "low" | "medium" | "high";
	evidence: LearningEvidence[];
	status: "pending" | "approved" | "rejected" | "auto_published";
}
export interface LearningPolicy {
	candidateGenerationEnabled: boolean;
	autoPublishLowRisk: boolean;
	autoPublishSemanticChanges: boolean;
	qcRequiredCategories: string[];
	minimumEvidenceCount: number;
	minimumConfidence: number;
}
export interface ModelRouting {
	primary: string;
	fast?: string;
	reasoning?: string;
	fallback?: string;
	tasks: Record<string, string>;
}
export interface AIRequestLog {
	id: string;
	createdAt: string;
	projectId?: string;
	intent: string;
	model: string;
	latencyMs?: number;
	sourceIds: string[];
	confidence?: number;
	safetyResult: string;
	routingResult: string;
}
export interface Usage {
	requests: number;
	tokens: number;
	cost: number;
	currency: string;
	from: string;
	to: string;
}
export interface ReviewSchedule {
	id: string;
	materialId: string;
	dueAt: string;
	category: string;
}
const unavailable = <T>(reason: string): Capability<T> => ({
	state: "not-configured",
	reason,
});
// Explicit read-only boundaries. Never persist simulated production settings in the browser.
export const operationsCapabilities = {
	learningPolicy: () =>
		unavailable<LearningPolicy>(
			"Сервер политики обучения не подключён. Генерация кандидатов и автопубликация не активированы.",
		),
	candidates: () =>
		unavailable<LearningCandidate[]>(
			"Learning pipeline not configured. Автоматическое выделение кандидатов пока не подключено.",
		),
	routing: () =>
		unavailable<ModelRouting>(
			"API настройки маршрутизации не подключён. Текущая модель задаётся серверной конфигурацией.",
		),
	usage: () =>
		unavailable<Usage>(
			"No telemetry. Сервер не хранит доступную здесь статистику токенов и стоимости.",
		),
	logs: () =>
		unavailable<AIRequestLog[]>(
			"No telemetry. История запросов, задержки и решения маршрутизации не подключены.",
		),
	schedules: () =>
		unavailable<ReviewSchedule[]>("Планировщик ревью не подключён."),
	flags: () =>
		unavailable<Record<string, boolean>>(
			"Сервер управления feature flags не подключён.",
		),
	trends: () =>
		unavailable<unknown[]>(
			"Исторические агрегаты качества не подключены. Текущие 100 оценок не являются полной историей.",
		),
	conflicts: () =>
		unavailable<LearningCandidate[]>(
			"Семантическая проверка противоречий не подключена. Сравнение предложений доступно в Review Inbox.",
		),
};
