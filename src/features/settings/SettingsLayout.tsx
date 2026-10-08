import { Shield } from "lucide-react";
import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useContext,
	useState,
} from "react";
import {
	type AppearanceSettings,
	applyAppearance,
	getAppearanceSettings,
} from "@/shared/lib/appearance";
import { useAuthStore } from "@/store/auth.store";

type SettingsAppearance = {
	appearance: AppearanceSettings;
	setAppearance: Dispatch<SetStateAction<AppearanceSettings>>;
};
const SettingsAppearanceContext = createContext<SettingsAppearance | null>(
	null,
);

export function useSettingsAppearance() {
	const context = useContext(SettingsAppearanceContext);
	if (!context) throw new Error("Settings appearance requires SettingsLayout");
	return context;
}

export function SettingsLayout({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	// Keep the original initialization and appearance state across hash-only section changes.
	const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
		const settings = getAppearanceSettings();

		applyAppearance(settings);

		return settings;
	});

	const authSession = useAuthStore((state) => state.session);
	return (
		<SettingsAppearanceContext.Provider value={{ appearance, setAppearance }}>
			<div className="settings-page h-full min-w-0 overflow-auto bg-background">
				<div className="mx-auto flex min-w-0 w-full flex-col gap-5 p-4 sm:p-6">
					<header className="flex flex-wrap items-start justify-between gap-4">
						<div>
							<h2 className="text-xl font-semibold text-foreground">{title}</h2>
						</div>

						<div className="flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
							<Shield size={16} className="shrink-0" />
							<div className="min-w-0 break-all">
								{authSession?.user.email ?? "Локальное рабочее пространство"}
							</div>
						</div>
					</header>

					{children}
				</div>
			</div>
		</SettingsAppearanceContext.Provider>
	);
}
