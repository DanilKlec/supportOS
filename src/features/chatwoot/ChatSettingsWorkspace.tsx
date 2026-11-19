import {
	ArrowRight,
	ExternalLink,
	Globe2,
	Network,
	Tags,
	TextCursorInput,
} from "lucide-react";

type Props = {
	onSources?: () => void;
	onDirectory?: () => void;
	onFields?: () => void;
	onWebhooks?: () => void;
};

export function ChatSettingsWorkspace({
	onSources,
	onDirectory,
	onFields,
	onWebhooks,
}: Props) {
	const items = [
		{
			title: "Источники чатов",
			detail: "Сайты, виджеты и доступ операторов к проектам",
			icon: Globe2,
			action: onSources,
		},
		{
			title: "Команды и теги",
			detail: "Группы агентов и метки диалогов",
			icon: Tags,
			action: onDirectory,
		},
		{
			title: "Поля Chatwoot",
			detail: "Дополнительные поля контактов и диалогов",
			icon: TextCursorInput,
			action: onFields,
		},
		{
			title: "Вебхуки",
			detail: "Подключение событий и проверка синхронизации",
			icon: Network,
			action: onWebhooks,
		},
	];
	return (
		<section
			aria-labelledby="chat-settings-heading"
			className="chat-workspace-settings supportos-scroll min-h-0 min-w-0 flex-1 overflow-auto p-3 sm:p-6"
		>
			<div className="mx-auto max-w-3xl">
				<h2
					id="chat-settings-heading"
					className="mb-3 text-lg font-semibold tracking-tight sm:mb-4"
				>
					Настройки чатов
				</h2>
				<div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
					{items.map(
						({ title, detail, icon: Icon, action }) =>
							action && (
								<button
									key={title}
									type="button"
									aria-label={title}
									onClick={action}
									className="chat-settings-row group"
								>
									<span className="chat-settings-icon">
										<Icon size={17} aria-hidden="true" />
									</span>
									<span className="min-w-0">
										<span className="block text-sm font-medium">{title}</span>
										<span className="mt-0.5 block text-xs leading-relaxed text-muted">
											{detail}
										</span>
									</span>
									<ArrowRight
										size={15}
										aria-hidden="true"
										className="text-muted group-hover:text-accent"
									/>
								</button>
							),
					)}
				</div>
				{onSources && (
					<a
						href="/chatwoot-demo.html"
						target="_blank"
						rel="noreferrer"
						className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-muted hover:bg-surface-elevated hover:text-foreground"
					>
						<ExternalLink size={13} /> Открыть тестовый сайт
					</a>
				)}
			</div>
		</section>
	);
}
