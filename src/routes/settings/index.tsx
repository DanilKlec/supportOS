import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";
import { DataSettings } from "@/features/settings/DataSettings";
import { GeneralSettings } from "@/features/settings/GeneralSettings";
import { IntegrationsSettings } from "@/features/settings/IntegrationsSettings";
import { SecuritySettings } from "@/features/settings/SecuritySettings";
import { SettingsLayout } from "@/features/settings/SettingsLayout";

export const Route = createFileRoute("/settings/")({
	component: SettingsPage,
});

const sections = {
	general: { title: "Общие", Component: GeneralSettings },
	appearance: { title: "Оформление", Component: AppearanceSettings },
	security: { title: "Безопасность", Component: SecuritySettings },
	data: { title: "Данные", Component: DataSettings },
	integrations: { title: "Интеграции", Component: IntegrationsSettings },
};

function SettingsPage() {
	const hash = useRouterState({ select: (s) => s.location.hash });
	const section = hash.startsWith("integrations")
		? "integrations"
		: ["appearance", "data", "security"].includes(hash)
			? (hash as keyof typeof sections)
			: "general";
	const { title, Component } = sections[section];

	return (
		<SettingsLayout title={title}>
			<Component />
		</SettingsLayout>
	);
}
