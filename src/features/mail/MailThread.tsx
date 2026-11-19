import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Download, Forward, Reply, ReplyAll } from "lucide-react";
import { useMemo } from "react";
import {
	type MailAttachment,
	type MailDraft,
	type MailMessage,
	type MailRow,
	mailService,
} from "@/services/mail.service";
import { emptyMailDraft } from "./MailComposer";

const formatter = new Intl.DateTimeFormat("ru", {
	dateStyle: "medium",
	timeStyle: "short",
});
export const mailDate = (timestamp: number) =>
	Number.isFinite(timestamp) && timestamp > 0
		? formatter.format(timestamp)
		: "";

function htmlTemplate(value: string) {
	const template = document.createElement("template");
	template.innerHTML = value;
	for (const element of template.content.querySelectorAll(
		"script,iframe,frame,frameset,link,meta,object,embed,base,form,input,button,svg,video,audio,source",
	))
		element.remove();
	for (const image of template.content.querySelectorAll("img")) image.remove();
	for (const link of template.content.querySelectorAll("a")) {
		const target = link.getAttribute("href")?.trim() ?? "";
		link.removeAttribute("href");
		if (!/^https?:\/\//i.test(target)) continue;
		link.append(document.createTextNode(` (${target})`));
	}
	return template;
}

export function plainMailBody(message: MailMessage) {
	return message.text || htmlTemplate(message.html).content.textContent || "";
}

function MailBody({ message }: { message: MailMessage }) {
	const safeHtml = useMemo(
		() =>
			message.html && !message.text ? htmlTemplate(message.html).innerHTML : "",
		[message.html, message.text],
	);
	if (message.text)
		return <div className="mail-message-body">{message.text}</div>;
	if (!safeHtml) return <p className="mail-muted">Письмо без текста</p>;
	return (
		<iframe
			className="mail-html"
			title="Содержимое письма"
			sandbox=""
			referrerPolicy="no-referrer"
			srcDoc={`<!doctype html><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body { font: 14px/1.55 system-ui; margin:12px; overflow-wrap:anywhere; color:#172231; background:#fff; } pre { white-space:pre-wrap; }</style>${safeHtml}`}
		/>
	);
}

function MessageCard({
	message,
	box,
	address,
	onCompose,
}: {
	message: MailMessage;
	box: string;
	address: string;
	onCompose: (draft: MailDraft) => void;
}) {
	const download = useMutation({
		mutationFn: async (file: MailAttachment) => {
			const result = await mailService.attachment(box, message.id, file.id);
			const binary = atob(
				result.data.replaceAll("-", "+").replaceAll("_", "/"),
			);
			const bytes = Uint8Array.from(binary, (letter) => letter.charCodeAt(0));
			const url = URL.createObjectURL(
				new Blob([bytes], { type: "application/octet-stream" }),
			);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = file.name;
			anchor.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
		},
	});
	const specificAddress = (value: string) =>
		(/<([^<>]+)>$/.exec(value)?.[1] ?? value).trim().toLowerCase();
	const reply = (all = false) => {
		const sender = message.replyTo || message.from;
		const to = specificAddress(sender) === address ? message.to : sender;
		const copy = [message.to, message.cc]
			.filter(Boolean)
			.flatMap((list) => list.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
		const cc = all
			? [
					...new Set(
						copy
							.map(specificAddress)
							.filter(
								(email) =>
									email && ![address, specificAddress(to)].includes(email),
							),
					),
				].join(", ")
			: "";
		onCompose({
			...emptyMailDraft,
			to,
			cc,
			subject: /^re:/i.test(message.subject)
				? message.subject
				: `Re: ${message.subject}`,
			threadId: message.threadId,
			replyId: message.messageId ?? undefined,
		});
	};
	return (
		<article className="mail-message">
			<header className="mail-message-meta">
				<div>
					<h3>{message.from || "Отправитель не указан"}</h3>
					<p>
						Кому {message.to || "—"}
						{message.cc ? ` · Копия ${message.cc}` : ""}
						{message.bcc ? ` · Скрытая копия ${message.bcc}` : ""}
					</p>
				</div>
				<time>{mailDate(message.date)}</time>
			</header>
			<MailBody message={message} />
			{message.clipped && (
				<p className="mail-muted">
					Для просмотра полного текста длинного письма откройте его в Gmail.
				</p>
			)}
			{message.attachments.length > 0 && (
				<div className="mail-attachments">
					{message.attachments.map((file) => (
						<button
							type="button"
							key={file.id}
							className="mail-button"
							disabled={download.isPending}
							onClick={() => download.mutate(file)}
						>
							<Download size={13} /> <span>{file.name}</span>
							<small>{Math.ceil(file.size / 1024)} КБ</small>
						</button>
					))}
				</div>
			)}
			{download.error && (
				<p role="alert" className="mail-error">
					{download.error.message}
				</p>
			)}
			<footer className="mail-message-actions">
				<button type="button" className="mail-button" onClick={() => reply()}>
					<Reply size={14} /> Ответить
				</button>
				{message.cc && (
					<button
						type="button"
						className="mail-button"
						onClick={() => reply(true)}
					>
						<ReplyAll size={14} /> Ответить всем
					</button>
				)}
				<button
					type="button"
					className="mail-button"
					onClick={() =>
						onCompose({
							...emptyMailDraft,
							subject: `Fwd: ${message.subject}`,
							text: `\n\nОтправитель: ${message.from}\nДата: ${mailDate(message.date)}\nТема: ${message.subject}\n\n${plainMailBody(message)}`,
						})
					}
				>
					<Forward size={14} /> Переслать
				</button>
			</footer>
		</article>
	);
}

export function MailThread({
	box,
	address,
	row,
	onCompose,
	onBack,
	toolbar,
}: {
	box: string;
	address: string;
	row: MailRow;
	onCompose: (draft: MailDraft) => void;
	onBack: () => void;
	toolbar: React.ReactNode;
}) {
	const thread = useInfiniteQuery({
		queryKey: ["mail", "thread", box, row.threadId],
		queryFn: ({ pageParam, signal }) =>
			mailService.thread(box, row.threadId, pageParam, signal),
		initialPageParam: "",
		getNextPageParam: (value) => value.before ?? undefined,
		gcTime: 0,
	});
	const messages = [
		...new Map(
			(thread.data?.pages ?? [])
				.slice()
				.reverse()
				.flatMap(({ messages }) =>
					messages.map((message) => [message.id, message] as const),
				),
		).values(),
	];
	return (
		<section className="mail-thread" aria-label="Переписка">
			<header className="mail-thread-header">
				<button
					type="button"
					className="mail-icon mail-back"
					onClick={onBack}
					aria-label="К списку писем"
				>
					<ArrowLeft size={18} />
				</button>
				<h2>{row.subject || "Без темы"}</h2>
				{toolbar}
			</header>
			<div className="mail-messages supportos-scroll">
				{thread.isPending ? (
					<p className="mail-empty">Загружаем переписку…</p>
				) : thread.error && !messages.length ? (
					<p role="alert" className="mail-empty mail-error">
						{thread.error.message}
					</p>
				) : (
					<>
						{thread.hasNextPage && (
							<button
								type="button"
								className="mail-button self-center"
								disabled={thread.isFetchingNextPage}
								onClick={() => void thread.fetchNextPage()}
							>
								Более ранние письма
							</button>
						)}
						{thread.error && (
							<p role="alert" className="mail-error">
								{thread.error.message}
							</p>
						)}
						{messages.map((message) => (
							<MessageCard
								key={message.id}
								message={message}
								box={box}
								address={address}
								onCompose={onCompose}
							/>
						))}
					</>
				)}
			</div>
		</section>
	);
}
