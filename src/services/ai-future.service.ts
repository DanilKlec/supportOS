import type {
	AIAssistantRequest,
	AIAutoTranslationRequest,
	AIBindGenerationRequest,
	AIKnowledgeSearchRequest,
	AIServicePlaceholder,
	AISummarizationRequest,
} from "@/types/ai";

const notImplemented = (feature: string) => {
	throw new Error(`${feature} is prepared but not implemented yet`);
};

export const aiFeatureRegistry: AIServicePlaceholder[] = [
	{
		name: "AI Assistant",
		enabled: false,
		description: "Future conversational assistant for operator workflows.",
	},
	{
		name: "AI Knowledge Search",
		enabled: false,
		description: "Future semantic search over categories, folders, and binds.",
	},
	{
		name: "AI Bind Generation",
		enabled: false,
		description: "Future bind creation from prompts and knowledge context.",
	},
	{
		name: "AI Auto Translation",
		enabled: false,
		description: "Future automatic translation of bind translations.",
	},
	{
		name: "AI Summarization",
		enabled: false,
		description: "Future summaries for binds and long knowledge content.",
	},
];

export const aiAssistantService = {
	ask(_request: AIAssistantRequest) {
		return notImplemented("AI Assistant");
	},
};

export const aiKnowledgeService = {
	search(_request: AIKnowledgeSearchRequest) {
		return notImplemented("AI Knowledge Search");
	},
};

export const aiBindGenerationService = {
	generate(_request: AIBindGenerationRequest) {
		return notImplemented("AI Bind Generation");
	},
};

export const aiAutoTranslationService = {
	translateBind(_request: AIAutoTranslationRequest) {
		return notImplemented("AI Auto Translation");
	},
};

export const aiSummarizationService = {
	summarize(_request: AISummarizationRequest) {
		return notImplemented("AI Summarization");
	},
};
