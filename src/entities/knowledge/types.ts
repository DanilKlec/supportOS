import type { Bind } from "../bind";

export interface KnowledgeFolder {
	id: string;
	name: string;

	ownerId?: string | null;

	categoryId: string;

	parentId?: string;

	icon?: string;

	color?: string;

	order: number;
}

export interface KnowledgeCategory {
	id: string;

	name: string;

	ownerId?: string | null;

	icon?: string;

	color?: string;

	order: number;
}

export interface KnowledgeTreeNode {
	id: string;

	name: string;

	type: "category" | "folder" | "bind";

	icon?: string;

	color?: string;

	children: KnowledgeTreeNode[];

	bind?: Bind;
}
