export type LanguageCode = string;
export type Language = LanguageCode;

export interface TranslationHistoryEntry {
	updatedAt: number;
	author: string;
	note: string;
}

export type TranslationAIStatus =
	| "verified"
	| "draft"
	| "generated"
	| "outdated"
	| "missing";

export interface BindTranslation {
	title: string;
	command: string;
	description?: string;
	content: string;
	lastModified: number;
	translator?: string;
	aiStatus?: TranslationAIStatus;
	history?: TranslationHistoryEntry[];
}

export interface Category {
	id: string;
	name: string;
	sortOrder: number;
}

export interface Bind {
	id: string;
	categoryId: string;
	tags: string[];
	translations: Record<LanguageCode, BindTranslation>;
	aiGenerated?: boolean;
	aiTranslated?: boolean;
	aiSummary?: string;
	createdAt: number;
	updatedAt: number;
	metadata?: {
		createdBy?: string;
		updatedBy?: string;
		source?: string;
	};
}

export interface Preferences {
	id: "prefs";
	favoriteIds: string[];
	recentIds: string[];
	theme: "dark" | "light";
	selectedLanguage: LanguageCode;
	enabledLanguages: LanguageCode[];
}

export type BindInput = Pick<Bind, "categoryId" | "tags" | "translations">;
