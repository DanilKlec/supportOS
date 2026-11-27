import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Mail, RotateCcw, Save } from "lucide-react";
import { useState } from "react";
import { Button, ErrorState, LoadingState } from "@/components/ui";
import { accessApi } from "@/features/accounts/access-api";
import type {
	InvitationDraft,
	InvitationSettings as SavedSettings,
} from "@/features/accounts/account-types";
import { MailHtmlPreview } from "@/features/mail/MailHtmlPreview";
import { useAuthStore } from "@/store/auth.store";
import {
	defaultInvitation,
	invitationFields,
	renderInvitation,
} from "../../../shared/staff-invitation.js";
import "@/features/mail/mail.css";

export function InvitationSettings() {
	const client = useQueryClient();
	const userId = useAuthStore((state) => state.session?.user.id);
	const queryKey = ["accounts", "invitation-template", userId];
	const settings = useQuery({
		queryKey,
		queryFn: ({ signal }) =>
			accessApi("invitation-template", undefined, {}, signal),
		staleTime: 30_000,
	});
	const [draft, setDraft] = useState<InvitationDraft>();
	const save = useMutation({
		mutationFn: (next: InvitationDraft) =>
			accessApi("invitation-template", next),
		onSuccess: (saved) => {
			client.setQueryData<SavedSettings>(
				queryKey,
				(current) => current && { ...current, ...saved },
			);
			setDraft(undefined);
		},
	});
	if (settings.isPending) return <LoadingState message="Загружаем шаблон…" />;
	if (!settings.data)
		return (
			<ErrorState
				title="Не удалось загрузить шаблон"
				description={settings.error?.message}
				onRetry={() => void settings.refetch()}
			/>
		);

	const saved = settings.data;
	const current = draft ?? saved;
	const preview = renderInvitation(current.template, {
		name: "Анна",
		email: "anna@example.com",
		url: "https://support.example.com/login",
	});
	const updateTemplate = (
		key: keyof InvitationDraft["template"],
		value: string,
	) => {
		save.reset();
		setDraft({ ...current, template: { ...current.template, [key]: value } });
	};
	const changed =
		draft &&
		(draft.senderId !== saved.senderId ||
			JSON.stringify(draft.template) !== JSON.stringify(saved.template));
	const disabled = save.isPending || saved.revision === 0;
	return (
		<div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<form
				className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface"
				onSubmit={(event) => {
					event.preventDefault();
					if (changed && !disabled)
						save.mutate({
							senderId: current.senderId,
							template: current.template,
							revision: current.revision,
						});
				}}
			>
				<div className="flex items-center gap-2 border-b border-border px-4 py-3.5 text-sm font-semibold sm:px-5">
					<Mail size={17} className="text-muted" aria-hidden="true" /> Настройки
					письма
				</div>
				<fieldset disabled={disabled} className="grid min-w-0 gap-4 p-4 sm:p-5">
					<label className="ui-field">
						Отправитель
						<select
							className="ui-input w-full"
							value={current.senderId ?? ""}
							onChange={(event) => {
								save.reset();
								setDraft({ ...current, senderId: event.target.value || null });
							}}
						>
							<option value="">Supabase · стандартное письмо</option>
							{saved.senders.map((sender) => (
								<option
									key={sender.id}
									value={sender.id}
									disabled={!saved.gmailConfigured}
								>
									{sender.address}
								</option>
							))}
						</select>
					</label>
					{!current.senderId && (
						<p className="-mt-2 text-xs leading-relaxed text-muted">
							Выберите подключённый ящик Gmail, чтобы отправлять письма с этим
							оформлением.{" "}
							<Link to="/admin" hash="mailboxes" className="underline">
								Управление ящиками
							</Link>
						</p>
					)}
					{invitationFields.map(
						({ key, label, limit, multiline, optional }) => (
							<label className="ui-field" key={key}>
								{label}
								{multiline ? (
									<textarea
										className="ui-input min-h-20 w-full resize-y"
										rows={key === "body" ? 5 : 2}
										value={current.template[key]}
										maxLength={limit}
										required={!optional}
										onChange={(event) =>
											updateTemplate(key, event.target.value)
										}
									/>
								) : (
									<input
										className="ui-input w-full"
										value={current.template[key]}
										maxLength={limit}
										required={!optional}
										onChange={(event) =>
											updateTemplate(key, event.target.value)
										}
									/>
								)}
							</label>
						),
					)}
					<p className="-mt-2 text-xs leading-relaxed text-muted">
						В тексте можно использовать <code>{"{{name}}"}</code> для имени и{" "}
						<code>{"{{email}}"}</code> для адреса сотрудника. Ссылка активации
						подставляется в кнопку автоматически.
					</p>
					<label className="flex w-fit items-center gap-3 text-sm">
						<input
							type="color"
							aria-label="Цвет кнопки"
							className="h-9 w-11 cursor-pointer rounded-lg border border-border bg-background p-1"
							value={current.template.accent}
							onChange={(event) => updateTemplate("accent", event.target.value)}
						/>
						Цвет кнопки{" "}
						<span className="font-mono text-xs text-muted">
							{current.template.accent}
						</span>
					</label>
				</fieldset>
				<div className="grid gap-3 border-t border-border p-4 sm:p-5">
					{saved.revision === 0 && (
						<p role="alert" className="text-sm text-danger">
							Хранилище шаблона ещё не настроено.
						</p>
					)}
					{save.error && (
						<p role="alert" className="text-sm text-danger">
							{save.error.message}
						</p>
					)}
					{save.isSuccess && (
						<p role="status" className="text-sm text-muted">
							Шаблон сохранён
						</p>
					)}
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="submit"
							variant="primary"
							loading={save.isPending}
							disabled={!changed || disabled}
						>
							<Save size={15} aria-hidden="true" /> Сохранить шаблон
						</Button>
						<Button
							variant="ghost"
							disabled={disabled}
							onClick={() => {
								save.reset();
								setDraft({ ...current, template: { ...defaultInvitation } });
							}}
						>
							<RotateCcw size={14} aria-hidden="true" /> Исходный дизайн
						</Button>
					</div>
				</div>
			</form>
			<section
				className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface xl:sticky xl:top-0"
				aria-labelledby="invitation-preview-heading"
			>
				<div className="border-b border-border px-4 py-3.5 sm:px-5">
					<h3 id="invitation-preview-heading" className="text-sm font-semibold">
						Предпросмотр
					</h3>
					<p className="mt-2 break-words text-sm text-muted">
						{preview.subject}
					</p>
				</div>
				<MailHtmlPreview
					html={preview.html}
					fit="desktop"
					flush
					title="Предпросмотр письма-приглашения"
				/>
			</section>
		</div>
	);
}
