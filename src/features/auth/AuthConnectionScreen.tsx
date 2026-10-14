import { LogOut, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { SupportOSLogo } from "@/components/brand/SupportOSLogo";
import { Button } from "@/components/ui/Button";
import "./auth-connection.css";

function InternetCourier() {
	return (
		<svg
			className="connection-courier"
			viewBox="0 0 360 200"
			fill="none"
			aria-hidden="true"
		>
			<ellipse
				cx="180"
				cy="174"
				rx="133"
				ry="9"
				fill="currentColor"
				opacity=".05"
			/>
			<path
				d="M38 163h25m-12-13h29m-10-13h18"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
				opacity=".2"
			/>
			<g className="connection-snail">
				<path
					d="M86 161c18-4 42-13 79-12h58c15 0 25-10 28-25l3-15c2-9 16-9 19 0l7 27c7 26-7 34-35 34H108c-13 0-24-2-22-9Z"
					fill="#e6c8a3"
					stroke="#9c785e"
					strokeWidth="2.5"
				/>
				<path
					d="m259 108-5-24m16 24 8-27"
					stroke="#9c785e"
					strokeWidth="3"
					strokeLinecap="round"
				/>
				<circle
					cx="253"
					cy="82"
					r="6"
					fill="#e6c8a3"
					stroke="#9c785e"
					strokeWidth="2"
				/>
				<circle
					cx="279"
					cy="79"
					r="6"
					fill="#e6c8a3"
					stroke="#9c785e"
					strokeWidth="2"
				/>
				<circle cx="255" cy="82" r="2" fill="#3d302c" />
				<circle cx="281" cy="79" r="2" fill="#3d302c" />
				<path
					d="M261 125q7 7 12-1"
					stroke="#9c785e"
					strokeWidth="2.5"
					strokeLinecap="round"
				/>
				<circle
					cx="176"
					cy="117"
					r="45"
					fill="#b9a4e2"
					stroke="#7a62a2"
					strokeWidth="2.5"
				/>
				<path
					d="M187 149c-30 9-53-17-40-40 13-23 47-10 40 11-5 15-27 12-25-1 1-6 8-8 12-4"
					stroke="#7a62a2"
					strokeWidth="3"
					strokeLinecap="round"
				/>
				<rect
					x="146"
					y="54"
					width="66"
					height="29"
					rx="8"
					fill="#f1eadf"
					stroke="#9c785e"
					strokeWidth="2.5"
				/>
				<path
					d="M155 54V36m48 18V36"
					stroke="#9c785e"
					strokeWidth="3"
					strokeLinecap="round"
				/>
				<circle cx="159" cy="69" r="2.5" fill="#6c9c7b" />
				<path
					d="M178 65h21m-21 7h14"
					stroke="#c7b6a3"
					strokeWidth="2.5"
					strokeLinecap="round"
				/>
				<path
					d="M169 32q11-9 22 0m-17 7q6-5 12 0"
					stroke="#b9a4e2"
					strokeWidth="3"
					strokeLinecap="round"
				/>
				<circle cx="180" cy="45" r="2" fill="#b9a4e2" />
			</g>
			<path
				d="M303 131v36m-10-36h20"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				opacity=".25"
			/>
			<path
				d="m289 113 14-9 14 9-14 9-14-9Z"
				stroke="currentColor"
				strokeWidth="2"
				opacity=".25"
			/>
		</svg>
	);
}

export function AuthConnectionScreen({
	error,
	onRetry,
	onSignOut,
}: {
	error?: string;
	onRetry: () => Promise<void>;
	onSignOut: () => Promise<void>;
}) {
	const [pending, setPending] = useState<"retry" | "signout" | null>(null);
	const [actionError, setActionError] = useState("");
	const inFlight = useRef(false);
	const timeout = /timed?\s*out|timeout|время ожидания/i.test(error ?? "");
	async function run(action: "retry" | "signout") {
		if (inFlight.current) return;
		inFlight.current = true;
		setPending(action);
		setActionError("");
		try {
			await (action === "retry" ? onRetry() : onSignOut());
		} catch (cause) {
			setActionError(
				cause instanceof Error
					? cause.message
					: "Не получилось. Попробуйте ещё раз.",
			);
		} finally {
			inFlight.current = false;
			setPending(null);
		}
	}
	return (
		<main className="connection-scene" aria-labelledby="connection-title">
			<div className="connection-scenery" aria-hidden="true">
				<span className="connection-orbit" />
				<span className="connection-orbit connection-orbit--outer" />
				<span className="connection-packet connection-packet--one">···</span>
				<span className="connection-packet connection-packet--two">zzz</span>
			</div>
			<header className="connection-brand">
				<SupportOSLogo className="h-7 w-7" />
				<span>
					SupportOS<span className="connection-brand-dot">.</span>
				</span>
			</header>
			<section className="connection-card">
				<span className="connection-status">
					<span />
					{timeout ? "Соединение задерживается" : "Проверка соединения"}
				</span>
				<InternetCourier />
				<p className="connection-caption">Интернет едет. Но очень медленно.</p>
				<h1 id="connection-title">
					{error ? "Сервер немного задумался" : "Проверяем доступ"}
				</h1>
				<p className="connection-description">
					Кажется, пакеты доставляет улитка. Повторите проверку, чтобы вернуться
					к работе.
				</p>
				<div className="connection-actions" aria-busy={Boolean(pending)}>
					<Button
						variant="primary"
						disabled={Boolean(pending)}
						onClick={() => void run("retry")}
					>
						<RefreshCw
							aria-hidden="true"
							className={
								pending === "retry"
									? "animate-spin motion-reduce:animate-none"
									: ""
							}
						/>
						{pending === "retry" ? "Проверяем…" : "Повторить проверку"}
					</Button>
					<Button
						variant="secondary"
						disabled={Boolean(pending)}
						onClick={() => void run("signout")}
					>
						<LogOut aria-hidden="true" />
						{pending === "signout" ? "Выходим…" : "Выйти"}
					</Button>
				</div>
				{actionError && (
					<p className="connection-error" role="alert">
						{actionError}
					</p>
				)}
				{error && (
					<details className="connection-details">
						<summary>
							Технические подробности{timeout ? " · timeout" : ""}
						</summary>
						<p>{error}</p>
					</details>
				)}
			</section>
			<p className="connection-footnote">Пусть улитка торопится, а вы — нет.</p>
		</main>
	);
}
