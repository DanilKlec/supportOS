export interface BindTranslation {
	language: string;
	title: string;
	content: string;
	updatedAt: string;
	aiGenerated?: boolean;
}

export interface BindHistoryEntry {
	id: string;
	createdAt: string;
	slug: string;
	tags: string[];
	translations: BindTranslation[];
}

export interface Bind {
	id: string;

	slug: string;

	ownerId?: string | null;

	sourceBindId?: string;

	sourceHash?: string;

	importBatchId?: string;

	imported?: boolean;

	categoryId: string;

	folderId?: string;

	order?: number;

	icon?: string;

	color?: string;

	tags: string[];

	translations: BindTranslation[];

	history?: BindHistoryEntry[];

	pinned?: boolean;

	copyCount?: number;

	lastCopiedAt?: string;

	aiGenerated?: boolean;

	aiTranslated?: boolean;

	aiSummary?: string;

	favorite: boolean;

	archived: boolean;

	createdAt: string;

	updatedAt: string;
}
