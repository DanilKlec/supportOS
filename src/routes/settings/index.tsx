import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";
import { DataSettings } from "@/features/settings/DataSettings";
import { DevicesSettings } from "@/features/settings/DevicesSettings";
import { GeneralSettings } from "@/features/settings/GeneralSettings";
import { SecuritySettings } from "@/features/settings/SecuritySettings";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { resolveAccountSection } from "@/features/settings/account-sections";

export const Route = createFileRoute("/settings/")({
	component: SettingsPage,
});

const sections = {
	general: { title: "Профиль", Component: GeneralSettings },
	appearance: { title: "Оформление", Component: AppearanceSettings },
	security: { title: "Безопасность", Component: SecuritySettings },
	sessions: { title: "Устройства", Component: DevicesSettings },
	data: { title: "Данные", Component: DataSettings },
};

function SettingsPage() {
	const hash = useRouterState({ select: (s) => s.location.hash });
	const section = resolveAccountSection(hash);
	const { Component } = sections[section];

	return (
		<SettingsLayout section={section}>
			<Component />
		</SettingsLayout>
	);
}
