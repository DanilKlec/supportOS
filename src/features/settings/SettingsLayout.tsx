import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
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
import { canAccessPage } from "../../../shared/access.js";
import { AccountSignOutButton } from "./AccountSignOutButton";
import {
	type AccountSection,
	accountIdentity,
	accountSections,
} from "./account-sections";
import "./account.css";

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
	section,
	children,
}: {
	section: AccountSection;
	children: ReactNode;
}) {
	// Keep the original initialization and appearance state across hash-only section changes.
	const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
		const settings = getAppearanceSettings();

		applyAppearance(settings);

		return settings;
	});

	const authSession = useAuthStore((state) => state.session);
	const current =
		accountSections.find((item) => item.id === section) ?? accountSections[0];
	const identity = accountIdentity(
		authSession?.user.email,
		authSession?.user.access?.display_name,
	);
	const visibleSections = accountSections.filter((item) =>
		canAccessPage(authSession?.user.access, "/settings", item.hash),
	);
	const personalSections = visibleSections.filter((item) => item.id !== "data");
	const workspaceSections = visibleSections.filter(
		(item) => item.id === "data",
	);
	const navigation = (items: typeof visibleSections) =>
		items.map((item) => (
			<Link
				key={item.id}
				to="/settings"
				hash={item.hash}
				activeOptions={{ exact: true, includeHash: true }}
				className="account-nav-link"
				aria-current={item.id === section ? "page" : undefined}
			>
				<item.icon size={18} aria-hidden="true" />
				<span>{item.title}</span>
				{item.id === section && (
					<ChevronRight
						size={14}
						className="account-nav-chevron"
						aria-hidden="true"
					/>
				)}
			</Link>
		));
	return (
		<SettingsAppearanceContext.Provider value={{ appearance, setAppearance }}>
			<div className="settings-page account-page">
				<div className="account-layout">
					<aside className="account-sidebar" aria-label="Личный кабинет">
						<Link to="/" className="account-back">
							<ArrowLeft size={15} aria-hidden="true" />К рабочему пространству
						</Link>
						<div className="account-sidebar-heading">Личный кабинет</div>
						<div className="account-sidebar-identity">
							<div className="account-avatar" aria-hidden="true">
								{identity.initials}
							</div>
							<div className="min-w-0">
								<strong title={identity.name}>{identity.name}</strong>
								<p title={identity.address}>
									{identity.address || "Вход не выполнен"}
								</p>
							</div>
						</div>
						<nav aria-label="Разделы личного кабинета">
							<div className="account-nav-group">Личные настройки</div>
							<div className="account-nav-items">
								{navigation(personalSections)}
							</div>
							{workspaceSections.length > 0 && (
								<>
									<div className="account-nav-group">Рабочее пространство</div>
									<div className="account-nav-items">
										{navigation(workspaceSections)}
									</div>
								</>
							)}
						</nav>
						{authSession && (
							<div className="account-sidebar-footer">
								<AccountSignOutButton />
							</div>
						)}
					</aside>
					<div className="account-content">
						<header className="account-page-header">
							<p className="account-eyebrow">Ваше пространство</p>
							<h2>{current.title}</h2>
							<p>{current.description}</p>
						</header>
						<div className="account-sections">{children}</div>
					</div>
				</div>
			</div>
		</SettingsAppearanceContext.Provider>
	);
}
