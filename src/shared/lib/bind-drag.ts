const BIND_DRAG_MIME = "application/x-supportos-bind";
const BIND_TEXT_PREFIX = "supportos-bind:";

interface BindDragPayload {
	type: "bind";
	id: string;
	ids?: string[];
}

export function setBindDragData(
	dataTransfer: DataTransfer,
	bindId: string,
	bindIds = [bindId],
) {
	const payload: BindDragPayload = {
		type: "bind",
		id: bindId,
		ids: Array.from(new Set(bindIds.filter(Boolean))),
	};

	dataTransfer.effectAllowed = "move";
	dataTransfer.setData(BIND_DRAG_MIME, JSON.stringify(payload));
	dataTransfer.setData("text/plain", `${BIND_TEXT_PREFIX}${bindId}`);
}

export function hasBindDragData(dataTransfer: DataTransfer) {
	return Array.from(dataTransfer.types).includes(BIND_DRAG_MIME);
}

export function getDraggedBindId(dataTransfer: DataTransfer) {
	return getDraggedBindIds(dataTransfer)[0];
}

export function getDraggedBindIds(dataTransfer: DataTransfer) {
	const rawPayload = dataTransfer.getData(BIND_DRAG_MIME);

	if (rawPayload) {
		try {
			const payload = JSON.parse(rawPayload) as Partial<BindDragPayload>;

			if (payload.type === "bind" && typeof payload.id === "string") {
				return Array.isArray(payload.ids) && payload.ids.length > 0
					? payload.ids.filter((id): id is string => typeof id === "string")
					: [payload.id];
			}
		} catch {
			return [];
		}
	}

	const fallback = dataTransfer.getData("text/plain");

	return fallback.startsWith(BIND_TEXT_PREFIX)
		? [fallback.slice(BIND_TEXT_PREFIX.length)]
		: [];
}
