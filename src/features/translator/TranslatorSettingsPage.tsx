import { CheckCircle2, Loader2, PlugZap, RotateCcw } from "lucide-react";
import { useState } from "react";

import { translatorService } from "@/services/translator.service";
import {
	DEFAULT_LINGVA_ENDPOINT,
	DEFAULT_TRANSLATOR_ENDPOINT,
	useTranslatorStore,
} from "@/store/translator.store";

export function TranslatorSettingsPage({
	embedded = false,
}: {
	embedded?: boolean;
}) {
	const provider = useTranslatorStore((state) => state.provider);
	const endpoint = useTranslatorStore((state) => state.endpoint);
	const lingvaEndpoint = useTranslatorStore((state) => state.lingvaEndpoint);
	const apiKey = useTranslatorStore((state) => state.apiKey);
	const email = useTranslatorStore((state) => state.email);
	const setProvider = useTranslatorStore((state) => state.setProvider);
	const setEndpoint = useTranslatorStore((state) => state.setEndpoint);
	const setLingvaEndpoint = useTranslatorStore(
		(state) => state.setLingvaEndpoint,
	);
	const setApiKey = useTranslatorStore((state) => state.setApiKey);
	const setEmail = useTranslatorStore((state) => state.setEmail);
	const useBuiltInEndpoint = useTranslatorStore(
		(state) => state.useBuiltInEndpoint,
	);
	const useDefaultLingvaEndpoint = useTranslatorStore(
		(state) => state.useDefaultLingvaEndpoint,
	);
	const [checking, setChecking] = useState(false);
	const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
	const [message, setMessage] = useState("");
	const isBuiltIn =
		endpoint.trim().replace(/\/+$/, "") === DEFAULT_TRANSLATOR_ENDPOINT;

	const testConnection = async () => {
		setChecking(true);
		setStatus("idle");
		setMessage("");

		try {
			await translatorService.testConnection();

			setStatus("ok");
			setMessage("Подключено. Провайдер перевода готов к работе.");
		} catch (error) {
			setStatus("error");
			setMessage(error instanceof Error ? error.message : "Не удалось подключиться.");
		} finally {
			setChecking(false);
		}
	};

	return (
		<div
			className={
				embedded ? "bg-background" : "h-full overflow-auto bg-background"
			}
		>
			<div className={embedded ? "max-w-3xl" : "mx-auto max-w-3xl p-6"}>
				<div className="mb-6">
					<h1 className="text-2xl font-bold">Настройки переводчика</h1>
					<p className="mt-1 text-sm text-muted">
						Выберите провайдера перевода для SupportOS.
					</p>
				</div>

				<div className="space-y-5 rounded-lg border border-border bg-surface p-5">
					<div className="grid gap-3 sm:grid-cols-3">
						<button
							type="button"
							onClick={() => setProvider("lingva")}
							className={`rounded-md border px-4 py-3 text-left ${
								provider === "lingva"
									? "border-accent bg-accent/10 text-foreground"
									: "border-border bg-background text-muted hover:bg-surface-elevated hover:text-foreground"
							}`}
						>
							<div className="text-sm font-semibold">Умный бесплатный</div>
							<div className="mt-1 text-xs text-muted">
								Бесплатный перевод в стиле Google через Lingva. API-ключ не нужен.
							</div>
						</button>

						<button
							type="button"
							onClick={() => setProvider("mymemory")}
							className={`rounded-md border px-4 py-3 text-left ${
								provider === "mymemory"
									? "border-accent bg-accent/10 text-foreground"
									: "border-border bg-background text-muted hover:bg-surface-elevated hover:text-foreground"
							}`}
						>
							<div className="text-sm font-semibold">MyMemory</div>
							<div className="mt-1 text-xs text-muted">
								Простой бесплатный резервный вариант. Email и API-ключ необязательны.
							</div>
						</button>

						<button
							type="button"
							onClick={() => setProvider("libretranslate")}
							className={`rounded-md border px-4 py-3 text-left ${
								provider === "libretranslate"
									? "border-accent bg-accent/10 text-foreground"
									: "border-border bg-background text-muted hover:bg-surface-elevated hover:text-foreground"
							}`}
						>
							<div className="text-sm font-semibold">LibreTranslate</div>
							<div className="mt-1 text-xs text-muted">
								Для собственного сервера или прокси Vercel.
							</div>
						</button>
					</div>

					{provider === "lingva" ? (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
								<div>
								<div className="text-sm font-medium">Бесплатная конечная точка</div>
									<div className="text-xs text-muted">
										{lingvaEndpoint.trim() || DEFAULT_LINGVA_ENDPOINT}
									</div>
								</div>

								<button
									type="button"
									onClick={useDefaultLingvaEndpoint}
									disabled={
										lingvaEndpoint.trim().replace(/\/+$/, "") ===
											DEFAULT_LINGVA_ENDPOINT || checking
									}
									className="ui-button ui-button--secondary inline-flex items-center gap-2 border border-border font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
								>
									<RotateCcw size={16} />
									Использовать стандартную
								</button>
							</div>

							<label className="ui-field ">
								<span className="text-sm font-medium">Конечная точка Lingva</span>
								<input
									value={lingvaEndpoint}
									onChange={(event) => setLingvaEndpoint(event.target.value)}
									className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder={DEFAULT_LINGVA_ENDPOINT}
								/>
							</label>

							<div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
								Этот провайдер не использует OpenAI или платные API-ключи. Если
								общедоступная конечная точка недоступна, переключитесь на другой
								экземпляр Lingva или используйте MyMemory.
							</div>
						</div>
					) : provider === "mymemory" ? (
						<div className="space-y-4">
							<label className="ui-field ">
								<span className="text-sm font-medium">Контактный email</span>
								<input
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Необязательно"
								/>
							</label>

							<label className="ui-field ">
								<span className="text-sm font-medium">API-ключ</span>
								<input
									type="password"
									value={apiKey}
									onChange={(event) => setApiKey(event.target.value)}
									className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Необязательно"
								/>
							</label>

							<div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
								Анонимное использование MyMemory ограничено. Добавление контактного
								email увеличивает бесплатный дневной лимит символов их API.
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
								<div>
								<div className="text-sm font-medium">Режим конечной точки</div>
									<div className="text-xs text-muted">
										{isBuiltIn ? "Встроенная конечная точка" : "Собственная конечная точка"}
									</div>
								</div>

								<button
									type="button"
									onClick={useBuiltInEndpoint}
									disabled={isBuiltIn || checking}
									className="ui-button ui-button--secondary inline-flex items-center gap-2 border border-border font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
								>
									<RotateCcw size={16} />
									Использовать встроенную
								</button>
							</div>

							<label className="ui-field ">
								<span className="text-sm font-medium">
									Конечная точка LibreTranslate
								</span>
								<input
									value={endpoint}
									onChange={(event) => setEndpoint(event.target.value)}
									className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="/api/translator"
								/>
							</label>

							<label className="ui-field ">
								<span className="text-sm font-medium">API-ключ</span>
								<input
									type="password"
									value={apiKey}
									onChange={(event) => setApiKey(event.target.value)}
									className="ui-input w-full border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Необязательно"
								/>
							</label>
						</div>
					)}

					<div className="ui-actions items-center flex flex-wrap  gap-3">
						<button
							type="button"
							onClick={testConnection}
							disabled={checking}
							className="ui-button ui-button--primary inline-flex items-center gap-2 bg-accent font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{checking ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<PlugZap size={16} />
							)}
							Проверить подключение
						</button>

						{status === "ok" && (
							<div className="inline-flex items-center gap-2 text-sm text-emerald-300">
								<CheckCircle2 size={16} />
								{message}
							</div>
						)}

						{status === "error" && (
							<div className="text-sm text-red-300">{message}</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
