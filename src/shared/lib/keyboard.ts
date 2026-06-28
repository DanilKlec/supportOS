export function isTypingTarget(target: EventTarget | null) {
	return (
		target instanceof HTMLElement &&
		Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
	);
}

export function isKeyboardCode(event: KeyboardEvent, code: string) {
	return event.code === code;
}
