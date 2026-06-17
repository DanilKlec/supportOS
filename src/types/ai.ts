export interface TranslateRequest {
	text: string;
	fromLanguage: string;
	toLanguage: string;
}

export interface TranslateResult {
	text: string;
	fromLanguage: string;
	toLanguage: string;
	model: string;
}

export interface AIAssistantRequest {
	message: string;
	context?: string;
}

export interface AIKnowledgeSearchRequest {
	query: string;
	language?: string;
	limit?: number;
}

export interface AIBindGenerationRequest {
	prompt: string;
	categoryId?: string;
	folderId?: string;
	languages?: string[];
}

export interface AIAutoTranslationRequest {
	bindId: string;
	targetLanguages: string[];
	sourceLanguage?: string;
}

export interface AISummarizationRequest {
	text: string;
	language?: string;
	maxLength?: number;
}

export interface AIServicePlaceholder {
	name: string;
	enabled: boolean;
	description: string;
}
