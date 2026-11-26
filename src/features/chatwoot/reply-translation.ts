import type {
	ChatwootConversation,
	ChatwootMessage,
} from "@/services/chatwoot.service";
import { translatorService } from "@/services/translator.service";

const displayNames = new Intl.DisplayNames(["ru"], { type: "language" });
export const replyLanguageName = (language: string) =>
	displayNames.of(language) ?? language;

export const replyLanguages = [
	...new Set([
		...translatorService.getFallbackLanguages().map(({ code }) => code),
		"da",
		"fi",
		"hu",
		"no",
		"ro",
		"sv",
		"sk",
		"sr",
		"bg",
		"hr",
		"et",
		"lt",
		"lv",
	]),
]
	.filter((code) => code !== "auto")
	.sort((a, b) =>
		replyLanguageName(a).localeCompare(replyLanguageName(b), "ru"),
	);

function languageCode(value: unknown) {
	if (typeof value !== "string") return undefined;
	const code = value.trim().toLowerCase().split(/[-_]/)[0];
	return /^[a-z]{2}$/.test(code) ? code : undefined;
}

function languageSample(value: string) {
	return value
		.replace(
			/```[\s\S]*?```|`[^`]*`|https?:\/\/[^\s<)]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|<[^>]+>/gi,
			" ",
		)
		.trim();
}

function playerText(messages: ChatwootMessage[]) {
	return messages
		.filter(
			(message) =>
				!message.private &&
				!message.content_attributes?.deleted &&
				(message.message_type === 0 ||
					message.message_type === "0" ||
					message.message_type === "incoming") &&
				message.content,
		)
		.slice(-6)
		.reverse();
}

export async function translateChatReply(
	text: string,
	choice: string,
	conversation: ChatwootConversation,
	messages: ChatwootMessage[],
) {
	const { detectAll } = await import("tinyld");
	const detect = (value: string) => {
		const sample = languageSample(value).slice(0, 1000);
		if ((sample.match(/\p{L}/gu)?.length ?? 0) < 6) return undefined;
		const [best, second] = detectAll(sample);
		if (
			!best ||
			best.accuracy < 0.3 ||
			best.accuracy - (second?.accuracy ?? 0) < 0.12
		)
			return undefined;
		return languageCode(best.lang);
	};
	let target = choice === "auto" ? undefined : choice;
	if (!target) {
		for (const message of playerText(messages)) {
			target =
				languageCode(message.content_attributes?.source_language) ??
				detect(message.content ?? "");
			if (target) break;
		}
		const attrs = conversation.additional_attributes;
		target ??=
			languageCode(attrs?.conversation_language) ??
			languageCode(attrs?.browser_language);
	}
	const sample = languageSample(text);
	if (!target || !/\p{L}/u.test(sample)) return text;
	const source = detect(sample);
	if (source === target) return text;
	try {
		const { text: translated } = await translatorService.translate(
			{ text, fromLanguage: source ?? "auto", toLanguage: target },
			{
				signal: AbortSignal.timeout(8000),
				detectAtProvider: true,
				requireIntact: true,
			},
		);
		if (translated.trim()) return translated.trim();
	} catch {
		// Keep the original draft available for retry or explicit untranslated delivery.
	}
	throw new Error(
		`Не удалось перевести на ${replyLanguageName(target)}. Повторите отправку или выберите «Без перевода».`,
	);
}
