import { useCallback, useEffect, useState } from "react";
import { AuthenticatorForm } from "@/features/auth/AuthenticatorForm";
import { mfaService } from "@/services/mfa.service";
import { supabaseService } from "@/services/supabase.service";

export function AuthenticatorPanel() {
	const [factors, setFactors] = useState<
		{ id: string; friendly_name?: string }[]
	>([]);
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const load = useCallback(async () => {
		try {
			setFactors(await mfaService.factors());
			setLoaded(true);
			setError("");
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Не удалось проверить устройства",
			);
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);
	return (
		<section className="rounded-xl border border-border bg-surface p-5 space-y-4">
			<h3 className="text-lg font-semibold">Двухфакторная защита (2FA)</h3>
			<p className="text-sm text-muted">
				{!loaded
					? "Проверяем состояние 2FA…"
					: factors.length > 0
						? "2FA включена. При входе нужен код Google Authenticator. Для смены телефона сначала подключите новое устройство и проверьте его код, затем удалите старое."
						: "2FA не включена. Подключите Google Authenticator, чтобы дополнительно защищать вход шестизначным кодом."}
			</p>
			{factors.map((factor, index) => (
				<div
					key={factor.id}
					className="flex items-center justify-between gap-3"
				>
					<span>{factor.friendly_name || `Устройство ${index + 1}`}</span>
					<button
						className="ui-button"
						type="button"
						disabled={busy || factors.length < 2}
						onClick={() => {
							setBusy(true);
							setError("");
							void mfaService
								.remove(factor.id)
								.then(load)
								.catch((e: unknown) =>
									setError(
										e instanceof Error
											? e.message
											: "Не удалось удалить устройство",
									),
								)
								.finally(() => setBusy(false));
						}}
					>
						Удалить устройство
					</button>
				</div>
			))}
			{adding ? (
				<AuthenticatorForm
					enroll
					onVerified={async () => {
						setAdding(false);
						await load();
					}}
				/>
			) : (
				<button
					type="button"
					className="ui-button"
					disabled={!loaded}
					onClick={() => setAdding(true)}
				>
					{factors.length > 0 ? "Добавить устройство" : "Включить 2FA"}
				</button>
			)}
			<div className="space-y-3 border-t border-border pt-4">
				<h4 className="font-medium">Вход через Google</h4>
				<p className="text-sm text-muted">
					Привяжите Google к этому аккаунту, чтобы входить с его помощью и
					сохранить текущие роли и данные.
				</p>
				<button
					type="button"
					className="ui-button"
					disabled={busy}
					onClick={() => {
						setBusy(true);
						setError("");
						void supabaseService
							.linkGoogle()
							.catch((e: unknown) =>
								setError(
									e instanceof Error
										? e.message
										: "Не удалось привязать Google",
								),
							)
							.finally(() => setBusy(false));
					}}
				>
					Привязать Google
				</button>
			</div>
			{error && (
				<p role="alert" className="text-sm text-red-500">
					{error}
				</p>
			)}
		</section>
	);
}
