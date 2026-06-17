export interface BindTranslation {
	language: string;
	title: string;
	content: string;
	updatedAt: string;
	aiGenerated?: boolean;
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

	icon?: string;

	color?: string;

	tags: string[];

	translations: BindTranslation[];

	aiGenerated?: boolean;

	aiTranslated?: boolean;

	aiSummary?: string;

	favorite: boolean;

	archived: boolean;

	createdAt: string;

	updatedAt: string;
}
