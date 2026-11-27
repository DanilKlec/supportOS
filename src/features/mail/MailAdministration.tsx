import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	ChevronDown,
	ExternalLink,
	Mail,
	Plus,
	Search,
	Users,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { Panel } from "@/features/operations/OperationsWorkspace";
import { ShareRecipientPicker } from "@/features/shared-binds/ShareRecipientPicker";
import { type Mailbox, mailService } from "@/services/mail.service";
import { useAuthStore } from "@/store/auth.store";
import "./mail.css";

const oauthSessionKey = "supportos:mail:oauth";

export function MailboxSettings({ oauthReturn }: { oauthReturn: string }) {
	const client = useQueryClient();
	const navigate = useNavigate();
	const userId = useAuthStore((state) => state.session?.user.id);
	const [search, setSearch] = useState("");
	const [dialog, setDialog] = useState<{
		mode: "connect" | "access";
		box?: Mailbox;
	}>();
	const [returnError, setReturnError] = useState("");
	const handledReturn = useRef("");
	const list = useQuery({
		queryKey: ["mail", "list", userId],
		queryFn: ({ signal }) => mailService.list(signal),
		staleTime: 15_000,
	});
	const { mutate: finishOAuth, ...finish } = useMutation({
		mutationFn: ({ code, state }: { code: string; state: string }) =>
			mailService.finish(code, state),
		onSuccess: async (box) => {
			const queryKey = ["mail", "list", userId];
			await client.cancelQueries({ queryKey, exact: true });
			client.setQueryData<Awaited<ReturnType<typeof mailService.list>>>(
				queryKey,
				(current) =>
					current && {
						...current,
						mailboxes: [
							...current.mailboxes.filter(({ id }) => id !== box.id),
							box,
						].sort((a, b) => a.address.localeCompare(b.address)),
					},
			);
			void client.invalidateQueries({ queryKey: ["mail"] });
		},
	});
	useEffect(() => {
		if (!userId || !oauthReturn || handledReturn.current === oauthReturn)
			return;
		handledReturn.current = oauthReturn;
		void navigate({ to: "/admin", hash: "mailboxes", replace: true });
		const params = new URLSearchParams(oauthReturn);
		const code = params.get("mail_code");
		const state = sessionStorage.getItem(oauthSessionKey);
		sessionStorage.removeItem(oauthSessionKey);
		if (!code || !state || state !== params.get("mail_state")) {
			setReturnError(
				"Подключение не завершено. Нажмите «Подключить Gmail», чтобы повторить вход.",
			);
			return;
		}
		setReturnError("");
		finishOAuth({ code, state });
	}, [userId, oauthReturn, navigate, finishOAuth]);

	const boxes = list.data?.mailboxes ?? [];
	const query = search.trim().toLowerCase();
	const results = boxes.filter(({ address }) =>
		address.toLowerCase().includes(query),
	);
	const canConnect = list.data?.configured === true && list.data.admin;
	return (
		<div className="ops-stack min-w-0">
			{(returnError || finish.error) && (
				<p
					className="rounded-lg border border-danger/30 bg-surface p-3 text-sm text-danger"
					role="alert"
				>
					{returnError || finish.error?.message}
				</p>
			)}
			{finish.isPending && <LoadingState message="Подключаем Gmail…" />}
			{finish.data && canConnect && (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
					<p className="min-w-0 break-words text-sm" role="status">
						Подключён ящик {finish.data.address}
					</p>
					<Button
						size="small"
						onClick={() => setDialog({ mode: "access", box: finish.data })}
					>
						Настроить доступ
					</Button>
				</div>
			)}
			<Panel
				title={
					list.data?.configured
						? `Подключённые ящики · ${boxes.length}`
						: "Подключённые ящики"
				}
				aside={
					canConnect && (
						<Button
							variant="primary"
							loading={finish.isPending}
							onClick={() => {
								setReturnError("");
								finish.reset();
								setDialog({ mode: "connect" });
							}}
						>
							<Plus size={16} aria-hidden="true" /> Подключить Gmail
						</Button>
					)
				}
			>
				<div className="p-4">
					{list.isPending ? (
						<LoadingState message="Загружаем почтовые ящики…" />
					) : list.error ? (
						<ErrorState
							title="Не удалось загрузить ящики"
							description={list.error.message}
							onRetry={() => void list.refetch()}
							retrying={list.isFetching}
						/>
					) : !list.data?.configured ? (
						<EmptyState
							title="Подключение Gmail ожидает настройки"
							description="Для добавления ящиков нужны настройки Google OAuth на сервере."
						/>
					) : boxes.length === 0 ? (
						<EmptyState
							title="Нет подключённых ящиков"
							description="Подключите первый рабочий адрес, чтобы выдать сотрудникам доступ."
						/>
					) : (
						<>
							<label className="relative block max-w-sm">
								<span className="sr-only">Найти почтовый ящик</span>
								<Search
									className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
									size={16}
									aria-hidden="true"
								/>
								<input
									type="search"
									className="ui-input w-full pl-9"
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Найти по адресу"
								/>
							</label>
							{results.length === 0 ? (
								<p className="py-4 text-sm text-muted">
									Ящики с таким адресом не найдены.
								</p>
							) : (
								<ul
									aria-label="Подключённые ящики"
									className="mt-3 divide-y divide-border"
								>
									{results.map((box) => (
										<li
											key={box.id}
											className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"
										>
											<div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-64">
												<span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-elevated text-muted">
													<Mail size={16} aria-hidden="true" />
												</span>
												<span
													className="min-w-0 truncate text-sm font-medium"
													title={box.address}
												>
													{box.address}
												</span>
											</div>
											{canConnect && (
												<div className="flex flex-wrap gap-2">
													<Button
														size="small"
														aria-label={`Доступ к ${box.address}`}
														onClick={() => setDialog({ mode: "access", box })}
													>
														<Users size={14} aria-hidden="true" /> Доступ
													</Button>
													<Button
														size="small"
														variant="ghost"
														aria-label={`Переподключить ${box.address}`}
														onClick={() => setDialog({ mode: "connect", box })}
													>
														Переподключить
													</Button>
												</div>
											)}
										</li>
									))}
								</ul>
							)}
						</>
					)}
				</div>
			</Panel>
			{dialog && canConnect && (
				<MailAdministration
					key={`${dialog.mode}:${dialog.box?.id ?? ""}`}
					{...dialog}
					onClose={() => setDialog(undefined)}
				/>
			)}
		</div>
	);
}

function MailAdministration({
	box,
	mode,
	onClose,
}: {
	box?: Mailbox;
	mode: "connect" | "access";
	onClose: () => void;
}) {
	const client = useQueryClient();
	const modal = useRef<HTMLDialogElement>(null);
	const input = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const element = modal.current;
		element?.showModal();
		input.current?.focus();
		return () => element?.close();
	}, []);
	const [address, setAddress] = useState(box?.address ?? "");
	const [recipient, setRecipient] = useState("");
	const [revoke, setRevoke] = useState<string>();
	const members = useQuery({
		queryKey: ["mail", "members", box?.id],
		queryFn: () => mailService.members(box?.id ?? ""),
		enabled: mode === "access" && !!box,
	});
	const connect = useMutation({
		mutationFn: async () => {
			const { url, state } = await mailService.start(address.trim());
			sessionStorage.setItem(oauthSessionKey, state);
			window.location.assign(url);
		},
	});
	const access = useMutation({
		mutationFn: (operation: { id: string } | { email: string }) =>
			"id" in operation
				? mailService.revoke(box?.id ?? "", operation.id)
				: mailService.grant(box?.id ?? "", operation.email),
		onSuccess: () => {
			setRecipient("");
			setRevoke(undefined);
			void client.invalidateQueries({ queryKey: ["mail", "members", box?.id] });
		},
	});
	return (
		<dialog
			ref={modal}
			className="mail-modal mail-admin-dialog"
			aria-label={mode === "connect" ? "Подключение Gmail" : "Доступ к ящику"}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
		>
			<header className="mail-modal-heading">
				<div>
					<h2>
						{mode === "access"
							? "Доступ к ящику"
							: box
								? "Переподключить Gmail"
								: "Подключить Gmail"}
					</h2>
					{mode === "access" && <p>{box?.address}</p>}
				</div>
				<button
					type="button"
					className="mail-icon"
					aria-label="Закрыть настройки почты"
					onClick={onClose}
				>
					<X size={17} />
				</button>
			</header>
			{mode === "connect" ? (
				<form
					className="mail-admin-body"
					onSubmit={(event) => {
						event.preventDefault();
						connect.mutate();
					}}
				>
					<label className="mail-field">
						Рабочий адрес
						<input
							ref={input}
							type="email"
							required
							readOnly={Boolean(box)}
							maxLength={254}
							value={address}
							onChange={(event) => setAddress(event.target.value)}
							placeholder="support@example.com"
						/>
					</label>
					<p className="mail-muted">
						Войдите в рабочий ящик на странице Google. Если Google запросит
						двухэтапную проверку (2FA), администратор вводит код или
						подтверждает вход там же.
					</p>
					{connect.error && (
						<p role="alert" className="mail-error">
							{connect.error.message}
						</p>
					)}
					<button
						type="submit"
						className="mail-button self-start"
						data-primary="true"
						disabled={connect.isPending}
					>
						<ExternalLink size={15} /> Продолжить в Google
					</button>
				</form>
			) : (
				<div className="mail-admin-body">
					<h3>Кто работает с ящиком</h3>
					{members.isPending ? <p className="mail-muted">Загрузка…</p> : null}
					{members.error && (
						<p role="alert" className="mail-error">
							{members.error.message}
						</p>
					)}
					{members.data?.members.length === 0 && (
						<p className="mail-muted">Доступ сотрудникам пока не выдан.</p>
					)}
					<ul className="mail-members">
						{members.data?.members.map((member) => (
							<li key={member.id}>
								<div>
									<b>{member.display_name || member.email}</b>
									<p>{member.email}</p>
								</div>
								{revoke === member.id ? (
									<div className="flex flex-wrap gap-1">
										<button
											type="button"
											className="mail-button"
											onClick={() => access.mutate({ id: member.id })}
											disabled={access.isPending}
										>
											Подтвердить отзыв
										</button>
										<button
											type="button"
											className="mail-button"
											onClick={() => setRevoke(undefined)}
										>
											Отмена
										</button>
									</div>
								) : (
									<button
										type="button"
										className="mail-button"
										onClick={() => setRevoke(member.id)}
									>
										Отозвать
									</button>
								)}
							</li>
						))}
					</ul>
					<label className="mail-field">
						Адрес сотрудника
						<input
							ref={input}
							type="email"
							value={recipient}
							onChange={(event) => setRecipient(event.target.value)}
							placeholder="account@example.com"
						/>
					</label>
					<details className="mail-admin-directory">
						<summary className="mail-directory-heading">
							<Search size={15} aria-hidden="true" />
							<span>Найти сотрудника</span>
							<ChevronDown size={14} aria-hidden="true" />
						</summary>
						<div className="mail-directory-body">
							<ShareRecipientPicker
								value={recipient}
								onChange={setRecipient}
								disabled={access.isPending}
								sharedEmails={
									members.data?.members.map(({ email }) => email) ?? []
								}
							/>
						</div>
					</details>
					{access.error && (
						<p role="alert" className="mail-error">
							{access.error.message}
						</p>
					)}
					<button
						type="button"
						className="mail-button self-start"
						data-primary="true"
						disabled={!recipient.trim() || access.isPending}
						onClick={() => access.mutate({ email: recipient.trim() })}
					>
						Выдать доступ
					</button>
				</div>
			)}
		</dialog>
	);
}
