import { Download, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
	if (typeof window === "undefined") return false;

	return (
		window.matchMedia("(display-mode: standalone)").matches ||
		("standalone" in navigator && Boolean(navigator.standalone))
	);
}

export function PWAInstallButton() {
	const [installPrompt, setInstallPrompt] =
		useState<BeforeInstallPromptEvent>();
	const [online, setOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	const [standalone, setStandalone] = useState(isStandalone);

	useEffect(() => {
		const handleBeforeInstall = (event: Event) => {
			event.preventDefault();
			setInstallPrompt(event as BeforeInstallPromptEvent);
		};
		const updateOnline = () => setOnline(navigator.onLine);
		const updateDisplayMode = () => setStandalone(isStandalone());

		window.addEventListener("beforeinstallprompt", handleBeforeInstall);
		window.addEventListener("online", updateOnline);
		window.addEventListener("offline", updateOnline);
		window
			.matchMedia("(display-mode: standalone)")
			.addEventListener("change", updateDisplayMode);

		return () => {
			window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
			window.removeEventListener("online", updateOnline);
			window.removeEventListener("offline", updateOnline);
			window
				.matchMedia("(display-mode: standalone)")
				.removeEventListener("change", updateDisplayMode);
		};
	}, []);

	const install = async () => {
		if (!installPrompt) return;

		await installPrompt.prompt();
		await installPrompt.userChoice;
		setInstallPrompt(undefined);
		setStandalone(isStandalone());
	};

	if (standalone) {
		return (
			<div
				title={online ? "PWA installed" : "PWA installed, offline"}
				className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-muted"
			>
				{online ? <Wifi size={16} /> : <WifiOff size={16} />}
				<span>PWA</span>
			</div>
		);
	}

	return (
		<button
			type="button"
			title={installPrompt ? "Install SupportOS" : "PWA ready"}
			onClick={install}
			disabled={!installPrompt}
			className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs hover:bg-surface-elevated disabled:cursor-default disabled:opacity-60"
		>
			<Download size={16} />
			{online ? <Wifi size={16} /> : <WifiOff size={16} />}
		</button>
	);
}
