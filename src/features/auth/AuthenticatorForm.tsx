import {
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { mfaService } from "@/services/mfa.service";

export function AuthenticatorForm({
	enroll = false,
	onVerified,
}: {
	enroll?: boolean;
	onVerified: () => void | Promise<void>;
}) {
	const [factorId, setFactorId] = useState("");
	const [factors, setFactors] = useState<
		{ id: string; friendly_name?: string }[]
	>([]);
	const [setup, setSetup] = useState<{ qr_code: string; secret: string }>();
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [checked, setChecked] = useState(false);
	const generation = useRef(0);
	// Enrollment starts only on an explicit click, so reloads and React Strict Mode
	// cannot create orphan factors or overwrite an existing authenticator.
	const load = useCallback(async () => {
		setLoading(true);
		setChecked(false);
		setError("");
		const revision = ++generation.current;
		await mfaService
			.factors()
			.then((factors) => {
				if (generation.current !== revision) return;
				setFactors(factors);
				setChecked(true);
				if (!enroll) setFactorId(factors[0]?.id ?? "");
			})
			.catch((e) => {
				if (generation.current === revision)
					setError(e instanceof Error ? e.message : "Не удалось проверить 2FA");
			})
			.finally(() => {
				if (generation.current === revision) setLoading(false);
			});
	}, [enroll]);
	useEffect(() => {
		void load();
		return () => {
			generation.current++;
		};
	}, [load]);
	async function start() {
		const revision = generation.current;
		setBusy(true);
		setError("");
		try {
			const result = await mfaService.enroll();
			if (generation.current !== revision) return;
			setFactorId(result.id);
			setSetup(result.totp);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Не удалось подключить приложение",
			);
		} finally {
			setBusy(false);
		}
	}
	async function submit(event: FormEvent) {
		event.preventDefault();
		const revision = generation.current;
		setBusy(true);
		setError("");
		try {
			await mfaService.verify(factorId, code);
			if (generation.current !== revision) return;
			setCode("");
			setSetup(undefined);
			await onVerified();
		} catch (e) {
			setCode("");
			setError(e instanceof Error ? e.message : "Не удалось подтвердить код");
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="space-y-4">
			{loading ? (
				<output>Проверяем Google Authenticator…</output>
			) : !factorId && !enroll ? (
				<p className="text-sm text-muted">
					2FA ещё не включена. Подключите Google Authenticator в{" "}
					<a className="underline" href="/settings#security">
						настройках безопасности
					</a>
					.
				</p>
			) : !factorId ? (
				<>
					<p className="text-sm text-muted">
						Подключите Google Authenticator на телефоне. Приложение будет
						выдавать коды для входа в SupportOS.
					</p>
					<button
						type="button"
						className="ui-button"
						disabled={busy || !checked}
						onClick={() => void start()}
					>
						Подключить Google Authenticator
					</button>
				</>
			) : (
				<>
					{setup && (
						<div className="space-y-3">
							<p>В Google Authenticator нажмите «+» и отсканируйте QR-код.</p>
							<img
								className="h-52 w-52 rounded-xl bg-white p-3"
								alt="QR-код подключения Google Authenticator"
								src={
									setup.qr_code.startsWith("data:")
										? setup.qr_code
										: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr_code)}`
								}
							/>
							<details>
								<summary>Ввести ключ вручную</summary>
								<code className="block break-all py-2 select-all">
									{setup.secret}
								</code>
							</details>
						</div>
					)}
					<form onSubmit={submit} className="space-y-3">
						{!setup && factors.length > 1 && (
							<label className="ui-field">
								Устройство
								<select
									className="ui-input"
									value={factorId}
									disabled={busy}
									onChange={(e) => setFactorId(e.target.value)}
								>
									{factors.map((factor, index) => (
										<option key={factor.id} value={factor.id}>
											{factor.friendly_name || `Устройство ${index + 1}`}
										</option>
									))}
								</select>
							</label>
						)}
						<label className="ui-field">
							Код Google Authenticator
							<input
								className="ui-input"
								inputMode="numeric"
								autoComplete="one-time-code"
								pattern="[0-9]{6}"
								maxLength={6}
								required
								value={code}
								disabled={busy}
								onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
							/>
						</label>
						<button
							type="submit"
							className="ui-button"
							disabled={busy || code.length !== 6}
						>
							{busy ? "Проверяем…" : "Подтвердить код"}
						</button>
					</form>
				</>
			)}
			{error && (
				<p role="alert" className="text-sm text-red-500">
					{error}
				</p>
			)}
			{!loading && !checked && (
				<button type="button" className="ui-button" onClick={() => void load()}>
					Повторить проверку
				</button>
			)}
		</div>
	);
}
