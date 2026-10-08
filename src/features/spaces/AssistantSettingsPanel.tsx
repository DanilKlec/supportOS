import { Link } from "@tanstack/react-router";
import { Button, Field, Input, Select } from "@/components/ui";
import type {
	AnswerIntent,
	AnswerTone,
} from "@/services/answer-assistant.service";

const languages = [
	"ru",
	"en",
	"uk",
	"de",
	"el",
	"es",
	"pt",
	"fr",
	"it",
	"tr",
	"pl",
	"ar",
];

const intents: Array<[AnswerIntent, string]> = [
	["general", "Общая"],
	["deposit", "Депозит"],
	["withdrawal", "Вывод"],
	["bonus", "Бонус"],
	["verification", "Верификация"],
	["technical", "Техническая проблема"],
	["sports-betting", "Спортивные ставки"],
];

const tones: Array<[AnswerTone, string]> = [
	["neutral", "Нейтральный"],
	["friendly", "Дружелюбный"],
	["formal", "Формальный"],
	["concise", "Краткий"],
];

export function AssistantSettingsPanel({
	language,
	onLanguageChange,
	tone,
	onToneChange,
	intent,
	onIntentChange,
	aiEnabled,
	onAIEnabledChange,
	aiStatus,
	showIntegrationSettings,
}: {
	language: string;
	onLanguageChange: (language: string) => void;
	tone: AnswerTone;
	onToneChange: (tone: AnswerTone) => void;
	intent: AnswerIntent;
	onIntentChange: (intent: AnswerIntent) => void;
	aiEnabled: boolean;
	onAIEnabledChange: (enabled: boolean) => void;
	aiStatus?: string;
	showIntegrationSettings: boolean;
}) {
	return (
		<section
			className="rounded-lg border border-border bg-background p-3"
			aria-label="Настройки помощника"
		>
			<div className="mb-3 flex items-center justify-between gap-2">
				<strong className="text-sm">Настройки ответа</strong>
				<Button
					type="button"
					size="small"
					variant={aiEnabled ? "secondary" : "ghost"}
					aria-pressed={aiEnabled}
					onClick={() => onAIEnabledChange(!aiEnabled)}
				>
					AI {aiEnabled ? "включён" : "выключен"}
				</Button>
			</div>
			<div className="grid gap-2 sm:grid-cols-3">
				<Field label="Язык ответа">
					<Input
						list="composer-languages"
						value={language}
						onChange={(event) => onLanguageChange(event.target.value)}
					/>
					<datalist id="composer-languages">
						{languages.map((value) => (
							<option key={value} value={value} />
						))}
					</datalist>
				</Field>
				<Field label="Тон">
					<Select
						value={tone}
						onChange={(event) => onToneChange(event.target.value as AnswerTone)}
					>
						{tones.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Тема обращения">
					<Select
						value={intent}
						onChange={(event) =>
							onIntentChange(event.target.value as AnswerIntent)
						}
					>
						{intents.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</Select>
				</Field>
			</div>
			<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
				<span>{aiStatus ?? "Проверяем AI…"}</span>
				{showIntegrationSettings && (
					<Link
						className="underline hover:text-foreground"
						to="/settings"
						hash="integrations-ai"
					>
						Расширенные настройки
					</Link>
				)}
			</div>
		</section>
	);
}
