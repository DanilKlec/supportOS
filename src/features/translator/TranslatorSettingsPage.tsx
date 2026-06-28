import { CheckCircle2, Loader2, PlugZap, RotateCcw } from "lucide-react";
import { useState } from "react";

import { translatorService } from "@/services/translator.service";
import {
	DEFAULT_LINGVA_ENDPOINT,
	DEFAULT_TRANSLATOR_ENDPOINT,
	useTranslatorStore,
} from "@/store/translator.store";

export function TranslatorSettingsPage() {
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
			setMessage("Connected. Translation provider is ready.");
		} catch (error) {
			setStatus("error");
			setMessage(error instanceof Error ? error.message : "Unable to connect.");
		} finally {
			setChecking(false);
		}
	};

	return (
		<div className="h-full overflow-auto bg-background">
			<div className="mx-auto max-w-3xl p-6">
				<div className="mb-6">
					<h1 className="text-2xl font-bold">Translator Settings</h1>
					<p className="mt-1 text-sm text-muted">
						Choose the translation provider used by SupportOS.
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
							<div className="text-sm font-semibold">Free Smart</div>
							<div className="mt-1 text-xs text-muted">
								Free Google-style translation through Lingva. No API key.
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
								Simple free fallback. Optional email/API key.
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
								For a custom server or Vercel proxy.
							</div>
						</button>
					</div>

					{provider === "lingva" ? (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
								<div>
									<div className="text-sm font-medium">Free endpoint</div>
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
									className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
								>
									<RotateCcw size={16} />
									Use Default
								</button>
							</div>

							<label className="block space-y-2">
								<span className="text-sm font-medium">Lingva Endpoint</span>
								<input
									value={lingvaEndpoint}
									onChange={(event) => setLingvaEndpoint(event.target.value)}
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder={DEFAULT_LINGVA_ENDPOINT}
								/>
							</label>

							<div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
								This provider does not use OpenAI or paid API keys. If the
								public endpoint is unavailable, switch to another Lingva
								instance or use MyMemory.
							</div>
						</div>
					) : provider === "mymemory" ? (
						<div className="space-y-4">
							<label className="block space-y-2">
								<span className="text-sm font-medium">Contact Email</span>
								<input
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Optional"
								/>
							</label>

							<label className="block space-y-2">
								<span className="text-sm font-medium">API Key</span>
								<input
									type="password"
									value={apiKey}
									onChange={(event) => setApiKey(event.target.value)}
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Optional"
								/>
							</label>

							<div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
								Anonymous MyMemory usage is limited. Adding a contact email
								increases the free daily character limit on their API.
							</div>
						</div>
					) : (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
								<div>
									<div className="text-sm font-medium">Endpoint Mode</div>
									<div className="text-xs text-muted">
										{isBuiltIn ? "Built-in endpoint" : "Custom endpoint"}
									</div>
								</div>

								<button
									type="button"
									onClick={useBuiltInEndpoint}
									disabled={isBuiltIn || checking}
									className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
								>
									<RotateCcw size={16} />
									Use Built-In
								</button>
							</div>

							<label className="block space-y-2">
								<span className="text-sm font-medium">
									LibreTranslate Endpoint
								</span>
								<input
									value={endpoint}
									onChange={(event) => setEndpoint(event.target.value)}
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="/api/translator"
								/>
							</label>

							<label className="block space-y-2">
								<span className="text-sm font-medium">API Key</span>
								<input
									type="password"
									value={apiKey}
									onChange={(event) => setApiKey(event.target.value)}
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
									placeholder="Optional"
								/>
							</label>
						</div>
					)}

					<div className="flex flex-wrap items-center gap-3">
						<button
							type="button"
							onClick={testConnection}
							disabled={checking}
							className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{checking ? (
								<Loader2 size={16} className="animate-spin" />
							) : (
								<PlugZap size={16} />
							)}
							Test Connection
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
