import {
	type ClipboardEvent,
	type FormEvent,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { mfaService } from "@/services/mfa.service";

export function AuthenticatorForm({
	enroll = false,
	submitLabel = "Подтвердить код",
	onVerified,
}: {
	enroll?: boolean;
	submitLabel?: string;
	onVerified: () => void | Promise<void>;
}) {
	const [factorId, setFactorId] = useState("");
	const [factors, setFactors] = useState<
		{ id: string; friendly_name?: string }[]
	>([]);
	const [setup, setSetup] = useState<{ qr_code: string; secret: string }>();
	const [digits, setDigits] = useState<string[]>(() => Array(6).fill(""));
	const inputs = useRef<(HTMLInputElement | null)[]>([]);
	const code = digits.join("");
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
	useEffect(() => {
		if (factorId && !enroll) inputs.current[0]?.focus();
	}, [factorId, enroll]);
	useEffect(() => {
		if (error && !busy && factorId) inputs.current[0]?.focus();
	}, [error, busy, factorId]);

	function applyDigits(index: number, value: string) {
		const entered = value.replace(/\D/g, "").slice(0, 6);
		const start = entered.length === 6 ? 0 : index;
		setDigits((current) =>
			current.map((digit, position) =>
				position >= start && position < start + Math.max(1, entered.length)
					? (entered[position - start] ?? "")
					: digit,
			),
		);
		if (entered.length)
			inputs.current[Math.min(start + entered.length, 5)]?.focus();
	}

	function pasteCode(event: ClipboardEvent<HTMLInputElement>, index: number) {
		event.preventDefault();
		const text = event.clipboardData.getData("text");
		if (/\d/.test(text)) applyDigits(index, text);
	}

	function navigateDigits(
		event: KeyboardEvent<HTMLInputElement>,
		index: number,
	) {
		if (event.key === "Backspace" && !digits[index] && index > 0) {
			event.preventDefault();
			applyDigits(index - 1, "");
			inputs.current[index - 1]?.focus();
		}
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			inputs.current[index + (event.key === "ArrowLeft" ? -1 : 1)]?.focus();
		}
	}
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
		if (busy || !factorId || code.length !== 6) return;
		const revision = generation.current;
		setBusy(true);
		setError("");
		try {
			await mfaService.verify(factorId, code);
			if (generation.current !== revision) return;
			setDigits(Array(6).fill(""));
			setSetup(undefined);
			await onVerified();
		} catch (e) {
			setDigits(Array(6).fill(""));
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
						<fieldset className="min-w-0" disabled={busy}>
							<legend className="mb-3 text-sm font-medium">
								Код Google Authenticator
							</legend>
							<div className="grid w-full max-w-md grid-cols-6 gap-2 sm:gap-3">
								{digits.map((digit, index) => (
									<input
										key={`digit-${index + 1}`}
										ref={(input) => {
											inputs.current[index] = input;
										}}
										type="text"
										aria-label={`Цифра ${index + 1} из 6`}
										aria-invalid={Boolean(error)}
										className="h-12 w-full min-w-0 rounded-xl border border-border bg-background text-center text-xl font-semibold tabular-nums shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 sm:h-14"
										inputMode="numeric"
										autoComplete={index === 0 ? "one-time-code" : "off"}
										maxLength={6}
										value={digit}
										onFocus={(event) => event.currentTarget.select()}
										onChange={(event) => applyDigits(index, event.target.value)}
										onPaste={(event) => pasteCode(event, index)}
										onKeyDown={(event) => navigateDigits(event, index)}
									/>
								))}
							</div>
						</fieldset>
						<Button
							type="submit"
							variant="primary"
							className="min-h-11 w-full justify-center"
							loading={busy}
							disabled={code.length !== 6}
						>
							{busy ? "Проверяем…" : submitLabel}
							{!busy && <ArrowRight size={16} aria-hidden="true" />}
						</Button>
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
