import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { AuthenticatorForm } from "@/features/auth/AuthenticatorForm";
import {
	beginCritical,
	type CriticalProof,
	type CriticalRequest,
	criticalRequest,
} from "@/services/critical-confirmation.service";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";

export function CriticalConfirmationModal({
	request,
	onExecute,
	onClose,
}: {
	request: CriticalRequest;
	onExecute: (proof: CriticalProof) => Promise<void>;
	onClose: () => void;
}) {
	const identity = useAuthStore((s) => s.session);
	const [proof, setProof] = useState<CriticalProof | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [attempted, setAttempted] = useState(false);
	const [locallyExpired, setLocallyExpired] = useState(false);
	const alive = useRef(true);
	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
		};
	}, []);
	const state = useQuery({
		queryKey: [
			"critical-confirmation",
			identity?.user.id,
			identity?.sessionId,
			proof?.id,
		],
		queryFn: ({ signal }) =>
			criticalRequest({ operation: "status", id: proof?.id }, signal),
		enabled: Boolean(proof) && !attempted && !locallyExpired,
		refetchInterval: (query) =>
			query.state.status !== "error" &&
			["pending", "approved"].includes(query.state.data?.status ?? "pending")
				? 2000
				: false,
		gcTime: 0,
		retry: false,
	});
	useEffect(() => {
		if (!state.data?.expiresAt) return;
		const timeout = setTimeout(
			() => setLocallyExpired(true),
			Math.max(0, Date.parse(state.data.expiresAt) - Date.now()),
		);
		return () => clearTimeout(timeout);
	}, [state.data?.expiresAt]);
	async function start() {
		setBusy(true);
		setError("");
		try {
			const result = await beginCritical(request);
			if (!alive.current) {
				await criticalRequest({ operation: "cancel", id: result.id });
				return;
			}
			if (!result.token)
				throw new Error("Не удалось получить одноразовое подтверждение");
			setProof({ id: result.id, token: result.token });
		} catch (e) {
			if (alive.current)
				setError(e instanceof Error ? e.message : "Ошибка подтверждения");
		} finally {
			if (alive.current) setBusy(false);
		}
	}
	async function close() {
		if (busy) return;
		setBusy(true);
		try {
			if (proof) await criticalRequest({ operation: "cancel", id: proof.id });
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Не удалось отменить запрос");
		} finally {
			if (alive.current) setBusy(false);
		}
	}
	async function execute() {
		if (
			!proof ||
			state.data?.status !== "approved" ||
			locallyExpired ||
			attempted
		)
			return;
		setBusy(true);
		setError("");
		setAttempted(true);
		try {
			await onExecute(proof);
		} catch (e) {
			if (alive.current)
				setError(e instanceof Error ? e.message : "Ошибка выполнения");
		} finally {
			if (alive.current) setBusy(false);
		}
	}
	const status = locallyExpired ? "expired" : state.data?.status;
	return (
		<BaseModal
			title="Подтверждение действия"
			onClose={() => void close()}
			closeDisabled={busy}
		>
			{request.summary && (
				<p className="mb-3 font-semibold break-words">{request.summary}</p>
			)}
			<p className="text-sm text-muted">
				Подтвердите именно это действие кодом Google Authenticator.
				Подтверждение действует 5 минут и используется один раз в текущей
				сессии.
			</p>
			{!proof && <AuthenticatorForm onVerified={start} />}
			{proof && (
				<output className="block mt-3 text-sm">
					{attempted || status === "consumed" || status === "completed"
						? "Выполнение уже запрошено. Для повторной попытки создайте новое подтверждение."
						: status === "approved"
							? "Код подтверждён. Можно выполнить действие."
							: status === "rejected"
								? "Действие отклонено."
								: status === "expired"
									? "Срок подтверждения истёк."
									: "Проверяем подтверждение…"}
				</output>
			)}
			{(error || state.error) && (
				<p role="alert" className="mt-3 text-sm text-red-500">
					{error || state.error?.message}
				</p>
			)}
			<div className="ui-actions mt-4 gap-2 border-t border-border pt-4">
				{proof && (
					<Button
						loading={busy}
						disabled={status !== "approved" || attempted || state.isError}
						onClick={() => void execute()}
					>
						Выполнить действие
					</Button>
				)}
				<Button
					variant="secondary"
					disabled={busy}
					onClick={() => void close()}
				>
					Отмена
				</Button>
			</div>
		</BaseModal>
	);
}
