export type KnowledgeObjectType = "bind" | "folder" | "category";

export type ModalType =
	| "createBind"
	| "editBind"
	| "copyBind"
	| "bindHistory"
	| "findDuplicates"
	| "moveBind"
	| "createFolder"
	| "createCategory"
	| "renameNode"
	| "deleteNode";

export interface ModalPayload {
	categoryId?: string;
	folderId?: string;
	parentId?: string;
	bindId?: string;
	language?: string;
	id?: string;
	type?: KnowledgeObjectType;
	name?: string;
}

export interface ActiveModal {
	type: ModalType;
	payload?: ModalPayload;
}
