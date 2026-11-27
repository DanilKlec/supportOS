import {
	ArrowLeft,
	Check,
	Eye,
	EyeOff,
	LoaderCircle,
	LockKeyhole,
	MessageSquareText,
	Send,
	UserRound,
	X,
} from "lucide-react";
import { useEffect, useId, useRef } from "react";
import "./chat-coaching.css";

export type CoachingRecipient = { id: number; name: string | null };

export function ObservationHeader({
	preview = false,
	watching,
	watchPending,
	onStop,
	onClose,
}: {
	preview?: boolean;
	watching: boolean;
	watchPending: boolean;
	onStop: () => void;
	onClose: () => void;
}) {
	const mode = useRef<HTMLDivElement>(null);
	const closeLabel = preview ? "Закрыть просмотр" : "Закрыть наблюдение";
	useEffect(() => {
		mode.current?.focus({ preventScroll: true });
	}, []);
	return (
		<header className="chat-observation-header">
			<button
				type="button"
				className="chat-observation-icon xl:hidden"
				aria-label={closeLabel}
				title="К активным чатам"
				onClick={onClose}
			>
				<ArrowLeft size={17} />
			</button>
			<div ref={mode} tabIndex={-1} className="chat-observation-mode">
				{preview ? <MessageSquareText size={17} /> : <Eye size={17} />}
				<span>{preview ? "Просмотр диалога" : "Наблюдение"}</span>
			</div>
			<div className="chat-observation-actions">
				{watching && (
					<button
						type="button"
						className="chat-observation-icon inline-grid"
						disabled={watchPending}
						aria-label="Прекратить наблюдение"
						title="Убрать из наблюдаемых"
						onClick={onStop}
					>
						<EyeOff size={16} />
					</button>
				)}
				<button
					type="button"
					className="chat-observation-icon hidden xl:inline-grid"
					aria-label={closeLabel}
					title="Закрыть панель"
					onClick={onClose}
				>
					<X size={17} />
				</button>
			</div>
		</header>
	);
}

export function CoachingComposer({
	recipient,
	previousRecipient,
	text,
	pending,
	sent,
	error,
	inactive,
	onChange,
	onRetarget,
	onSend,
}: {
	recipient: CoachingRecipient | null | undefined;
	previousRecipient: CoachingRecipient | null;
	text: string;
	pending: boolean;
	sent: boolean;
	error?: string;
	inactive: boolean;
	onChange: (value: string) => void;
	onRetarget: () => void;
	onSend: () => void;
}) {
	const editorId = useId();
	const visibilityId = useId();
	const name = recipient?.name || "Назначенный агент";
	return (
		<footer className="chat-coaching-footer">
			<form
				className="chat-coaching-box"
				onSubmit={(event) => {
					event.preventDefault();
					onSend();
				}}
			>
				<div className="chat-coaching-title">
					<span className="chat-coaching-icon" aria-hidden="true">
						<LockKeyhole size={16} />
					</span>
					<div className="min-w-0">
						{recipient ? (
							<label htmlFor={editorId} className="block text-sm font-semibold">
								Подсказка агенту
							</label>
						) : (
							<p className="text-sm font-semibold">Подсказка агенту</p>
						)}
						<p
							id={visibilityId}
							className="text-[11px] leading-snug chat-text-hint"
						>
							Лично назначенному агенту
						</p>
					</div>
					{recipient && (
						<span className="chat-coaching-recipient" title={name}>
							<UserRound size={13} />
							<span className="truncate">{name}</span>
						</span>
					)}
				</div>
				{recipient ? (
					<>
						<textarea
							id={editorId}
							aria-describedby={visibilityId}
							value={text}
							maxLength={2000}
							rows={2}
							disabled={pending}
							onChange={(event) => onChange(event.target.value)}
							onKeyDown={(event) => {
								if (
									event.key !== "Enter" ||
									event.shiftKey ||
									event.nativeEvent.isComposing ||
									event.keyCode === 229
								)
									return;
								event.preventDefault();
								onSend();
							}}
							placeholder="Напишите подсказку…"
						/>
						{previousRecipient && (
							<div className="chat-coaching-retarget">
								<output>
									Агент сменился. Черновик был для{" "}
									{previousRecipient.name || "предыдущего агента"}.
								</output>
								<button
									type="button"
									className="chat-observation-action"
									disabled={pending}
									onClick={onRetarget}
								>
									Выбрать нового агента
								</button>
							</div>
						)}
						{error && (
							<p role="alert" className="text-xs chat-text-danger">
								{error}
							</p>
						)}
						<div className="chat-coaching-controls">
							{sent ? (
								<output className="inline-flex items-center gap-1 text-[11px] chat-text-success">
									<Check size={14} /> Подсказка отправлена
								</output>
							) : (
								<span className="chat-coaching-shortcut">
									Enter — отправить
								</span>
							)}
							{!sent && (
								<button
									type="submit"
									className="chat-coaching-submit"
									disabled={
										!text.trim() || pending || Boolean(previousRecipient)
									}
								>
									{pending ? (
										<LoaderCircle size={15} className="animate-spin" />
									) : (
										<Send size={15} />
									)}
									{pending ? "Отправляем…" : "Отправить агенту"}
								</button>
							)}
						</div>
					</>
				) : (
					<p className="text-xs leading-relaxed text-muted">
						{inactive
							? "Диалог закрыт или отложен. История подсказок доступна в переписке."
							: "Подсказку можно отправить, когда у диалога появится агент."}
						{text.trim() && " Черновик сохранён."}
					</p>
				)}
			</form>
		</footer>
	);
}

export function CoachingThreadTabs({
	count,
	privateOnly,
	onChange,
}: {
	count: number;
	privateOnly: boolean;
	onChange: (privateOnly: boolean) => void;
}) {
	return (
		<fieldset className="chat-thread-tabs" aria-label="Показать сообщения">
			<button
				type="button"
				aria-pressed={!privateOnly}
				onClick={() => onChange(false)}
			>
				<MessageSquareText size={14} /> Переписка
			</button>
			<button
				type="button"
				aria-pressed={privateOnly}
				onClick={() => onChange(true)}
			>
				<LockKeyhole size={13} /> Подсказки{" "}
				<span className="chat-thread-tab-count">{count}</span>
			</button>
		</fieldset>
	);
}
