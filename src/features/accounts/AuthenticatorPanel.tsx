import { ShieldCheck, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { GoogleIcon } from "@/components/brand/GoogleIcon";
import { AuthenticatorForm } from "@/features/auth/AuthenticatorForm";
import { mfaService } from "@/services/mfa.service";
import { supabaseService } from "@/services/supabase.service";
import "@/features/settings/account.css";

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
		<section className="account-card account-authenticator-card space-y-4">
			<div className="account-setting-row">
				<span className="account-row-icon">
					<ShieldCheck size={20} />
				</span>
				<div className="account-row-copy">
					<h3>Двухфакторная защита (2FA)</h3>
					<p>
						{!loaded
							? "Проверяем состояние 2FA…"
							: factors.length > 0
								? "2FA включена. При входе нужен код Google Authenticator."
								: "2FA не включена. Защитите вход кодом Google Authenticator."}
					</p>
				</div>
				{loaded && (
					<span
						className={`account-status ${factors.length > 0 ? "account-status--success" : ""}`}
					>
						<span />
						{factors.length > 0 ? "Включена" : "Не включена"}
					</span>
				)}
			</div>
			{factors.map((factor, index) => (
				<div key={factor.id} className="account-factor-row">
					<span>
						<Smartphone size={16} aria-hidden="true" />
						{factor.friendly_name || `Устройство ${index + 1}`}
					</span>
					<button
						className="ui-button ui-button--secondary account-small-button"
						title={
							factors.length < 2
								? "Сначала подключите новое устройство"
								: undefined
						}
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
					className="ui-button ui-button--secondary account-small-button"
					disabled={!loaded}
					onClick={() => setAdding(true)}
				>
					{factors.length > 0 ? "Добавить устройство" : "Включить 2FA"}
				</button>
			)}
			<div className="account-setting-row account-google-row">
				<span className="account-row-icon">
					<GoogleIcon />
				</span>
				<div className="account-row-copy">
					<h4>Вход через Google</h4>
					<p>Привяжите Google, сохранив текущие роли и данные.</p>
				</div>
				<button
					type="button"
					className="ui-button ui-button--secondary account-small-button"
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
