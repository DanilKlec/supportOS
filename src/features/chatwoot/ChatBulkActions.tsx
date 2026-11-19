import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListChecks, X } from "lucide-react";
import { useState } from "react";
import {
	chatwootService,
	type ChatwootAgent,
	type ChatwootPriority,
	type ChatwootStatus,
} from "@/services/chatwoot.service";

const statusOptions = {
	open: "В работе",
	pending: "Ожидает",
	resolved: "Завершён",
} as const satisfies Partial<Record<ChatwootStatus, string>>;
const priorityOptions = {
	low: "Низкий",
	medium: "Средний",
	high: "Высокий",
	urgent: "Срочный",
} as const satisfies Record<ChatwootPriority, string>;
type Command =
	| { kind: "status"; value: keyof typeof statusOptions }
	| { kind: "priority"; value: ChatwootPriority | null }
	| { kind: "assign"; value: number | null };
type Failure = { id: number; message: string };

function submit(id: number, command: Command) {
	switch (command.kind) {
		case "status":
			return chatwootService.setStatus(id, command.value);
		case "priority":
			return chatwootService.setPriority(id, command.value);
		case "assign":
			return chatwootService.assign(id, command.value);
	}
}

export function ChatBulkActions({
	available,
	selected,
	agents,
	onSelect,
	onClose,
	onChanged,
	onBusy,
}: {
	available: number[];
	selected: ReadonlySet<number>;
	agents: ChatwootAgent[];
	onSelect: (ids: number[]) => void;
	onClose: () => void;
	onChanged: () => void;
	onBusy: (busy: boolean) => void;
}) {
	const [action, setAction] = useState("");
	const [assignee, setAssignee] = useState("");
	const [confirmation, setConfirmation] = useState(false);
	const client = useQueryClient();
	const batch = useMutation({
		onMutate: () => {
			onBusy(true);
		},
		mutationFn: async ({
			ids,
			command,
		}: {
			ids: number[];
			command: Command;
		}) => {
			const failures: Failure[] = [];
			for (let index = 0; index < ids.length; index += 3) {
				await Promise.all(
					ids.slice(index, index + 3).map(async (id) => {
						try {
							await submit(id, command);
						} catch (error) {
							failures.push({
								id,
								message:
									error instanceof Error
										? error.message
										: "Не удалось обновить диалог",
							});
						}
					}),
				);
			}
			return { succeeded: ids.length - failures.length, failures };
		},
		onSuccess: (result, { ids }) => {
			setConfirmation(false);
			onSelect(result.failures.map((failure) => failure.id));
			onChanged();
			for (const id of ids)
				void client.invalidateQueries({
					queryKey: ["chatwoot", "conversation", id],
				});
		},
		onSettled: () => {
			onBusy(false);
		},
	});
	const picked = available.filter((id) => selected.has(id));
	const [kind, value] = action.split(":");
	const command: Command | null =
		kind === "status"
			? { kind, value: value as keyof typeof statusOptions }
			: kind === "priority"
				? { kind, value: value === "none" ? null : (value as ChatwootPriority) }
				: kind === "assign" && assignee
					? { kind, value: assignee === "none" ? null : Number(assignee) }
					: null;
	const scopeName =
		kind === "status"
			? statusOptions[value as keyof typeof statusOptions]
			: kind === "priority"
				? (priorityOptions[value as ChatwootPriority] ?? "Без приоритета")
				: (agents.find((agent) => String(agent.id) === assignee)?.name ??
					"Без ответственного");
	const ready = picked.length > 0 && command != null;
	return (
		<section aria-label="Массовые действия" className="chat-batch-actions">
			<div className="flex flex-wrap items-center gap-2">
				<ListChecks size={15} aria-hidden="true" />
				<span className="mr-auto font-semibold">Выбрано {picked.length}</span>
				<button
					type="button"
					className="chat-filter-icon"
					aria-label="Закрыть массовые действия"
					onClick={onClose}
					disabled={batch.isPending}
				>
					<X size={14} />
				</button>
			</div>
			{!confirmation && (
				<div className="flex flex-wrap items-center gap-x-2 text-muted">
					<button
						type="button"
						onClick={() => onSelect(available)}
						disabled={batch.isPending || picked.length === available.length}
					>
						Выбрать страницу
					</button>
					{picked.length > 0 && (
						<button
							type="button"
							onClick={() => onSelect([])}
							disabled={batch.isPending}
						>
							Снять выбор
						</button>
					)}
				</div>
			)}
			{confirmation ? (
				<div className="space-y-2">
					<p>
						Применить «{scopeName}» к выбранным диалогам ({picked.length})?
					</p>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className="chat-menu-filter"
							onClick={() => setConfirmation(false)}
							disabled={batch.isPending}
						>
							Отмена
						</button>
						<button
							type="button"
							className="chat-menu-filter"
							disabled={batch.isPending || !ready}
							onClick={() => {
								if (command) batch.mutate({ ids: picked, command });
							}}
						>
							{batch.isPending ? "Применяем…" : "Подтвердить"}
						</button>
					</div>
				</div>
			) : (
				<div className="grid gap-1.5">
					<select
						aria-label="Массовое действие"
						value={action}
						onChange={(event) => {
							setAction(event.target.value);
							batch.reset();
						}}
					>
						<option value="">Выберите действие</option>
						<optgroup label="Статус">
							{Object.entries(statusOptions).map(([key, label]) => (
								<option key={key} value={`status:${key}`}>
									{label}
								</option>
							))}
						</optgroup>
						<optgroup label="Приоритет">
							{Object.entries(priorityOptions).map(([key, label]) => (
								<option key={key} value={`priority:${key}`}>
									{label}
								</option>
							))}
							<option value="priority:none">Снять приоритет</option>
						</optgroup>
						<option value="assign">Назначить агента</option>
					</select>
					{kind === "assign" && (
						<select
							aria-label="Ответственный для выбранных диалогов"
							value={assignee}
							onChange={(event) => setAssignee(event.target.value)}
						>
							<option value="">Выберите агента</option>
							<option value="none">Снять назначение</option>
							{agents.map((agent) => (
								<option key={agent.id} value={agent.id}>
									{agent.name}
								</option>
							))}
						</select>
					)}
					<button
						type="button"
						className="chat-menu-filter justify-self-start"
						disabled={!ready}
						onClick={() => setConfirmation(true)}
					>
						Применить к выбранным
					</button>
				</div>
			)}
			{batch.data && (
				<div className="space-y-1">
					<output className="block">
						Обновлено {batch.data.succeeded} из{" "}
						{batch.data.succeeded + batch.data.failures.length}
					</output>
					{batch.data.failures.length > 0 && (
						<ul className="supportos-scroll max-h-28 space-y-1 overflow-y-auto chat-text-danger">
							{batch.data.failures.map(({ id, message }) => (
								<li key={id}>
									#{id} · {message}
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</section>
	);
}
