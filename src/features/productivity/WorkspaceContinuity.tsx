import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BaseModal } from "@/shared/modals/BaseModal";
import { useAuthStore } from "@/store/auth.store";
import { useBonusStore } from "@/store/bonus.store";
import { useKnowledgeStore } from "@/store/knowledge.store";
import {
	DEFAULT_WORKSPACE_LAYOUT,
	useWorkspaceStore,
} from "@/store/workspace.store";
import { can, routePermission } from "../../../shared/access.js";
import { readPreference, usePreference, writePreference } from "./preferences";

export function isEditable(target: EventTarget | null) {
	return (
		target instanceof Element &&
		Boolean(
			target.closest(
				'input,textarea,select,[contenteditable="true"],[role="textbox"]',
			),
		)
	);
}
export function WorkspaceContinuity() {
	const actor = useAuthStore((s) => s.session?.user.id);
	const access = useAuthStore((s) => s.session?.user.access);
	const navigate = useNavigate();
	const [help, setHelp] = useState(false);
	const [view, setView] = useState(false);
	const [sidebarPixels, setSidebarPixels] = usePreference(
		"sidebar-pixels",
		290,
	);
	const [composerPixels, setComposerPixels] = usePreference(
		"composer-pixels",
		336,
	);
	const [density, setDensity] = usePreference("density", "comfortable");
	const [focus, setFocus] = useState(false);
	useEffect(() => {
		document.documentElement.dataset.density = density;
		document.documentElement.style.setProperty(
			"--composer-width",
			`${Math.min(720, Math.max(320, composerPixels))}px`,
		);
		return () => {
			delete document.documentElement.dataset.density;
			document.documentElement.style.removeProperty("--composer-width");
		};
	}, [density, composerPixels]);
	const [online, setOnline] = useState(navigator.onLine);
	useEffect(() => {
		if (!actor) return;
		const layout = readPreference(actor, "layout", DEFAULT_WORKSPACE_LAYOUT);
		useWorkspaceStore.getState().setLayout(layout);
		const project = readPreference<string | undefined>(
			actor,
			"project",
			undefined,
		);
		useBonusStore.getState().setActiveProject(project);
		const saved = readPreference(actor, "knowledge-position", {
			activeTab: undefined as string | undefined,
			expandedFolders: [] as string[],
			openedTabs: [] as string[],
		});
		useKnowledgeStore.setState({
			activeTab: undefined,
			selectedBind: undefined,
			openedTabs: [],
			selectedFolder: undefined,
			selectedCategory: undefined,
			expandedFolders: saved.expandedFolders,
		});
		let restored = false;
		const restore = () => {
			const state = useKnowledgeStore.getState();
			if (
				restored ||
				window.location.hash.startsWith("#bind=") ||
				!saved.activeTab ||
				![...state.binds, ...state.remoteBinds].some(
					(b) => b.id === saved.activeTab,
				)
			)
				return;
			restored = true;
			useKnowledgeStore.setState({ ...saved, selectedBind: saved.activeTab });
		};
		restore();
		const stopKnowledge = useKnowledgeStore.subscribe((state, previous) => {
			restore();
			if (
				state.activeTab !== previous.activeTab ||
				state.expandedFolders !== previous.expandedFolders
			) {
				writePreference(actor, "knowledge-position", {
					activeTab: state.activeTab,
					expandedFolders: state.expandedFolders,
					openedTabs: state.openedTabs,
				});
			}
		});
		const stopLayout = useWorkspaceStore.subscribe((state, previous) => {
			if (state.layout !== previous.layout)
				writePreference(actor, "layout", state.layout);
		});
		const stopProject = useBonusStore.subscribe((state, previous) => {
			if (state.activeProjectId !== previous.activeProjectId)
				writePreference(actor, "project", state.activeProjectId);
		});
		return () => {
			stopKnowledge();
			stopLayout();
			stopProject();
		};
	}, [actor]);
	useEffect(() => {
		const connection = () => setOnline(navigator.onLine);
		const showHelp = () => setHelp(true);
		const showView = () => setView(true);
		window.addEventListener("supportos:workspace-view", showView);
		const keydown = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				event.repeat ||
				isEditable(event.target) ||
				document.querySelector('[aria-modal="true"]')
			)
				return;
			if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
				return;
			const route = (
				{
					Digit1: "/",
					Digit2: "/project-emails",
					Digit3: "/bonuses",
					Digit4: "/bonus-tools",
				} as const
			)[event.code as "Digit1"];
			const mode = (
				{ KeyA: "answer", KeyT: "translate", KeyR: "answer" } as const
			)[event.code as "KeyA"];
			if (route && can(access, routePermission(route))) {
				event.preventDefault();
				void navigate({ to: route });
			} else if (mode && can(access, "tools")) {
				event.preventDefault();
				void navigate({ to: "/", hash: `composer-${mode}` });
			}
		};
		window.addEventListener("online", connection);
		window.addEventListener("offline", connection);
		window.addEventListener("supportos:shortcuts", showHelp);
		window.addEventListener("keydown", keydown);
		return () => {
			window.removeEventListener("supportos:workspace-view", showView);
			window.removeEventListener("online", connection);
			window.removeEventListener("offline", connection);
			window.removeEventListener("supportos:shortcuts", showHelp);
			window.removeEventListener("keydown", keydown);
		};
	}, [access, navigate]);
	return (
		<>
			{focus && (
				<button
					type="button"
					className="fixed bottom-16 right-4 z-30 min-h-10 rounded-lg border border-border bg-surface px-3"
					onClick={() => {
						useWorkspaceStore.getState().setLayout({ showSidebar: true });
						setFocus(false);
					}}
				>
					Выйти из фокуса
				</button>
			)}
			{view && (
				<BaseModal title="Рабочий вид" onClose={() => setView(false)}>
					<div className="space-y-5">
						<label className="block">
							Ширина дерева: {sidebarPixels}px
							<input
								className="block w-full"
								type="range"
								min={240}
								max={480}
								step={10}
								value={sidebarPixels}
								onChange={(e) => setSidebarPixels(Number(e.target.value))}
							/>
						</label>
						<label className="block">
							Ширина помощника: {composerPixels}px
							<input
								className="block w-full"
								type="range"
								min={320}
								max={720}
								step={10}
								value={composerPixels}
								onChange={(e) => setComposerPixels(Number(e.target.value))}
							/>
						</label>
						<label className="ui-field ">
							Плотность
							<select
								className="ui-input ml-3 border border-border bg-background"
								value={density}
								onChange={(e) => setDensity(e.target.value)}
							>
								<option value="comfortable">Комфортная</option>
								<option value="compact">Компактная</option>
							</select>
						</label>
						<button
							type="button"
							className="min-h-10 rounded border border-border px-3"
							onClick={() => {
								useWorkspaceStore.getState().setLayout({ showSidebar: false });
								setFocus(true);
								setView(false);
							}}
						>
							Сфокусироваться на материале
						</button>
					</div>
				</BaseModal>
			)}
			{!online && (
				<output className="bg-amber-100 px-4 py-2 text-sm text-amber-950">
					Нет сети. Локальный черновик сохранён; общие данные могут быть
					неактуальны.
				</output>
			)}
			{help && (
				<BaseModal title="Горячие клавиши" onClose={() => setHelp(false)}>
					<dl className="space-y-3">
						{[
							["Ctrl / ⌘ K", "Поиск"],
							["Alt 1 / 2 / 3 / 4", "Бинды / Email / Бонусы / Калькулятор"],
							["Alt A / R", "Помощник: ответ"],
							["Alt T", "Помощник: перевод"],
							["Ctrl / ⌘ Enter", "Выполнить в помощнике"],
							["Esc", "Закрыть верхний диалог"],
						].map(([key, label]) => (
							<div key={key} className="flex justify-between gap-4">
								<dt>
									<kbd>{key}</kbd>
								</dt>
								<dd>{label}</dd>
							</div>
						))}
					</dl>
					<p className="mt-4 text-sm text-muted">
						Переходы Alt не срабатывают при вводе текста. Доступные действия
						зависят от ваших прав.
					</p>
				</BaseModal>
			)}
		</>
	);
}
