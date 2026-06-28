const BIND_DRAG_MIME = "application/x-supportos-bind";
const BIND_TEXT_PREFIX = "supportos-bind:";
const FOLDER_DRAG_MIME = "application/x-supportos-folder";
const FOLDER_TEXT_PREFIX = "supportos-folder:";

interface BindDragPayload {
	type: "bind";
	id: string;
	ids?: string[];
}

interface FolderDragPayload {
	type: "folder";
	id: string;
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

export function setFolderDragData(
	dataTransfer: DataTransfer,
	folderId: string,
) {
	const payload: FolderDragPayload = {
		type: "folder",
		id: folderId,
	};

	dataTransfer.effectAllowed = "move";
	dataTransfer.setData(FOLDER_DRAG_MIME, JSON.stringify(payload));
	dataTransfer.setData("text/plain", `${FOLDER_TEXT_PREFIX}${folderId}`);
}

export function hasFolderDragData(dataTransfer: DataTransfer) {
	return Array.from(dataTransfer.types).includes(FOLDER_DRAG_MIME);
}

export function hasTreeDragData(dataTransfer: DataTransfer) {
	return hasBindDragData(dataTransfer) || hasFolderDragData(dataTransfer);
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

export function getDraggedFolderId(dataTransfer: DataTransfer) {
	const rawPayload = dataTransfer.getData(FOLDER_DRAG_MIME);

	if (rawPayload) {
		try {
			const payload = JSON.parse(rawPayload) as Partial<FolderDragPayload>;

			if (payload.type === "folder" && typeof payload.id === "string") {
				return payload.id;
			}
		} catch {
			return undefined;
		}
	}

	const fallback = dataTransfer.getData("text/plain");

	return fallback.startsWith(FOLDER_TEXT_PREFIX)
		? fallback.slice(FOLDER_TEXT_PREFIX.length)
		: undefined;
}
