import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export const MAX_CHAT_WINDOWS = 4;

type ChatWindow = { id: number; title?: string };
type ChatWindowsState = {
	panes: ChatWindow[];
	activeId: number | null;
	expandedId: number | null;
};

type WindowAction =
	| {
			type: "open";
			id: number;
			title?: string;
			add?: boolean;
			replaceId?: number;
	  }
	| { type: "title"; id: number; title: string }
	| { type: "focus" | "close" | "expand"; id: number };

export const initialChatWindows: ChatWindowsState = {
	panes: [],
	activeId: null,
	expandedId: null,
};

export function chatWindowsReducer(
	state: ChatWindowsState,
	action: WindowAction,
): ChatWindowsState {
	const exists = state.panes.some((pane) => pane.id === action.id);
	switch (action.type) {
		case "open": {
			if (exists)
				return chatWindowsReducer(state, { type: "focus", id: action.id });
			const pane = { id: action.id, title: action.title };
			if (action.add || state.activeId === null) {
				if (state.panes.length >= MAX_CHAT_WINDOWS) return state;
				return {
					panes: [...state.panes, pane],
					activeId: action.id,
					expandedId: null,
				};
			}
			const replaceId = action.replaceId ?? state.activeId;
			if (!state.panes.some((item) => item.id === replaceId)) return state;
			return {
				panes: state.panes.map((item) => (item.id === replaceId ? pane : item)),
				activeId: action.id,
				expandedId: state.expandedId === null ? null : action.id,
			};
		}
		case "title":
			if (
				!exists ||
				state.panes.find((pane) => pane.id === action.id)?.title ===
					action.title
			)
				return state;
			return {
				...state,
				panes: state.panes.map((pane) =>
					pane.id === action.id ? { ...pane, title: action.title } : pane,
				),
			};
		case "focus":
			if (!exists || state.activeId === action.id) return state;
			return {
				...state,
				activeId: action.id,
				expandedId: state.expandedId === null ? null : action.id,
			};
		case "expand":
			if (!exists || state.panes.length < 2) return state;
			return {
				...state,
				activeId: action.id,
				expandedId: state.expandedId === action.id ? null : action.id,
			};
		case "close": {
			if (!exists) return state;
			const index = state.panes.findIndex((pane) => pane.id === action.id);
			const panes = state.panes.filter((pane) => pane.id !== action.id);
			const activeId =
				state.activeId === action.id
					? (panes[Math.min(index, panes.length - 1)]?.id ?? null)
					: state.activeId;
			return {
				panes,
				activeId,
				expandedId:
					panes.length > 1 && state.expandedId !== null ? activeId : null,
			};
		}
	}
}

export function ConversationWindows({
	state,
	listOpen,
	choosing,
	onToggleList,
	onAdd,
	onFocus,
	renderPane,
}: {
	state: ChatWindowsState;
	listOpen: boolean;
	choosing: boolean;
	onToggleList: () => void;
	onAdd: () => void;
	onFocus: (id: number) => void;
	renderPane: (
		id: number | null,
		options: {
			visible: boolean;
			tiled: boolean;
			canExpand: boolean;
			expanded: boolean;
			listControl?: ReactNode;
			addControl?: ReactNode;
		},
	) => ReactNode;
}) {
	const grid = useRef<HTMLDivElement>(null);
	const tabs = useRef<HTMLElement>(null);
	const [bounds, setBounds] = useState({ width: 0, height: 0 });
	useEffect(() => {
		if (!grid.current) return;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const { width, height } = entry.contentRect;
			setBounds((old) =>
				old.width === width && old.height === height ? old : { width, height },
			);
		});
		observer.observe(grid.current);
		return () => observer.disconnect();
	}, []);
	const count = state.panes.length;
	useEffect(() => {
		if (state.activeId === null || count < 2) return;
		const selected = tabs.current?.querySelector<HTMLButtonElement>(
			'[aria-pressed="true"]',
		);
		selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, [state.activeId, count]);
	const canTile =
		count > 1 &&
		bounds.width >= 720 &&
		bounds.height >= (count <= 2 ? 300 : 470);
	const tiled = canTile && state.expandedId === null;
	const atLimit = count >= MAX_CHAT_WINDOWS;
	const listControl = (
		<button
			type="button"
			className="chat-window-control"
			onClick={onToggleList}
			aria-label={listOpen ? "Скрыть список" : "Показать список"}
			title={listOpen ? "Скрыть список" : "Показать список"}
		>
			{listOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
		</button>
	);
	const addControl = (
		<button
			type="button"
			className="chat-window-control chat-window-add"
			aria-label="Добавить чат"
			aria-pressed={choosing}
			disabled={atLimit}
			onClick={onAdd}
			title={atLimit ? "Открыто 4 из 4 чатов" : "Открыть ещё один чат"}
		>
			<Plus size={16} aria-hidden="true" />
			<span>{atLimit ? "4 из 4" : "Добавить чат"}</span>
		</button>
	);
	return (
		<div className="chat-windows flex min-h-0 min-w-0 flex-1 flex-col">
			{count > 1 && (
				<div className="chat-windows-toolbar">
					{listControl}
					<nav
						ref={tabs}
						aria-label="Открытые чаты"
						className="chat-window-tabs supportos-scroll"
					>
						{state.panes.map((pane) => (
							<button
								key={pane.id}
								type="button"
								className="chat-window-tab"
								aria-pressed={state.activeId === pane.id}
								title={pane.title}
								onClick={() => onFocus(pane.id)}
							>
								<span className="truncate">
									{pane.title || `Диалог #${pane.id}`}
								</span>
								{pane.title && (
									<span className="shrink-0 text-[10px] opacity-80">
										#{pane.id}
									</span>
								)}
							</button>
						))}
					</nav>
					{addControl}
				</div>
			)}
			<div
				ref={grid}
				className="chat-window-grid"
				data-grid-size={tiled ? count : 1}
			>
				{count === 0
					? renderPane(null, {
							visible: bounds.width > 0,
							tiled: false,
							canExpand: false,
							expanded: false,
							listControl,
						})
					: state.panes.map(({ id }) => {
							const shown = tiled || state.activeId === id;
							return (
								<section
									key={id}
									aria-label={`Чат #${id}`}
									hidden={!shown}
									className="chat-window-cell"
									data-active={state.activeId === id}
									onFocusCapture={() => {
										if (tiled) onFocus(id);
									}}
									onPointerDownCapture={() => {
										if (tiled) onFocus(id);
									}}
								>
									{renderPane(id, {
										visible: shown && bounds.width > 0,
										tiled,
										canExpand: canTile,
										expanded: state.expandedId === id,
										listControl: count === 1 ? listControl : undefined,
										addControl: count === 1 ? addControl : undefined,
									})}
								</section>
							);
						})}
			</div>
		</div>
	);
}
