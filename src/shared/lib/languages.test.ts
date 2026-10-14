import { expect, it } from "vitest";
import { languages } from "@/entities/language";
import {
	DEFAULT_LANGUAGE_CODES,
	getFlagForLanguage,
	getLabelForLanguage,
	SUPPORTED_LANGUAGES,
} from "./languages";

it("localizes language labels without changing supported codes or flags", () => {
	expect(languages.map(({ code }) => code)).toEqual([
		"ru",
		"en",
		"de",
		"pt",
		"el",
	]);
	expect(DEFAULT_LANGUAGE_CODES).toEqual(["ru", "en", "el", "de", "pt"]);
	for (const language of languages) {
		expect(language.name).toBe(getLabelForLanguage(language.code));
		expect(language.name).toMatch(/^[А-Яа-яё]+$/);
		expect(language.flag).toBe(getFlagForLanguage(language.code));
	}
	expect(SUPPORTED_LANGUAGES.map(({ flag }) => flag)).toEqual([
		"🇷🇺",
		"🇬🇧",
		"🇬🇷",
		"🇩🇪",
		"🇵🇹",
	]);
});
