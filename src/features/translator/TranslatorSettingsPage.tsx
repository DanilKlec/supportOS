import { CheckCircle2, Loader2, PlugZap, RotateCcw } from "lucide-react";
import { useState } from "react";

import { translatorService } from "@/services/translator.service";
import {
	DEFAULT_TRANSLATOR_ENDPOINT,
	useTranslatorStore,
} from "@/store/translator.store";

export function TranslatorSettingsPage() {
	const endpoint = useTranslatorStore((state) => state.endpoint);
	const apiKey = useTranslatorStore((state) => state.apiKey);
	const setEndpoint = useTranslatorStore((state) => state.setEndpoint);
	const setApiKey = useTranslatorStore((state) => state.setApiKey);
	const useBuiltInEndpoint = useTranslatorStore(
		(state) => state.useBuiltInEndpoint,
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
			const languages = await translatorService.getLanguages();

			setStatus("ok");
			setMessage(`Connected. Languages loaded: ${languages.length}.`);
		} catch (error) {
			setStatus("error");
			setMessage(
				error instanceof Error
					? error.message
					: "Unable to connect to LibreTranslate.",
			);
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
						Configure the free LibreTranslate provider used by SupportOS.
					</p>
				</div>

				<div className="space-y-5 rounded-lg border border-border bg-surface p-5">
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
						<span className="text-sm font-medium">LibreTranslate Endpoint</span>
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

					<div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
						Settings are saved automatically. The built-in endpoint is used by
						the published PWA; a custom endpoint can point to any compatible
						LibreTranslate server.
					</div>
				</div>
			</div>
		</div>
	);
}
