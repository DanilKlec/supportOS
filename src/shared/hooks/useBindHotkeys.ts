import { useEffect } from "react";
import { isKeyboardCode, isTypingTarget } from "@/shared/lib/keyboard";

type Action = () => unknown;

interface BindHotkeys {
	enabled: boolean;
	copy: Action;
	edit?: Action;
	duplicate?: Action;
	favorite?: Action;
	pin?: Action;
	languages: string[];
	language: string;
	setLanguage: (language: string) => void;
}

/** Shared and personal viewers use the same shortcuts without changing action targets. */
export function useBindHotkeys(options: BindHotkeys) {
	useEffect(() => {
		if (!options.enabled) return;
		const handler = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				event.repeat ||
				event.altKey ||
				event.shiftKey ||
				isTypingTarget(event.target) ||
				isTypingTarget(document.activeElement) ||
				document.querySelector(
					'[aria-modal="true"], [role="menu"], [role="listbox"]',
				)
			)
				return;

			if (isKeyboardCode(event, "KeyC")) {
				// Preserve native Ctrl/⌘+C for any selected text.
				if (window.getSelection()?.toString()) return;
				event.preventDefault();
				options.copy();
				return;
			}
			// Do not steal browser shortcuts such as Ctrl+F, Ctrl+D or Ctrl+P.
			if (event.ctrlKey || event.metaKey) return;
			const actions: Record<string, Action | undefined> = {
				KeyE: options.edit,
				KeyD: options.duplicate,
				KeyF: options.favorite,
				KeyP: options.pin,
			};
			const action = actions[event.code];
			if (action) {
				event.preventDefault();
				action();
				return;
			}
			if (
				options.languages.length &&
				(isKeyboardCode(event, "ArrowRight") ||
					isKeyboardCode(event, "ArrowLeft"))
			) {
				const index = Math.max(0, options.languages.indexOf(options.language));
				const direction = isKeyboardCode(event, "ArrowRight") ? 1 : -1;
				const next =
					options.languages[
						(index + direction + options.languages.length) %
							options.languages.length
					];
				if (next) {
					event.preventDefault();
					options.setLanguage(next);
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [options]);
}
