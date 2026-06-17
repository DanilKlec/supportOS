import type { LanguageCode } from '#/types/bind'

export const SUPPORTED_LANGUAGES: Array<{ code: LanguageCode; label: string; flag: string }> = [
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'el', label: 'Ελληνικά', flag: '🇬🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
]

export const DEFAULT_LANGUAGE_CODES: LanguageCode[] = SUPPORTED_LANGUAGES.map((language) => language.code)
export const DEFAULT_ENABLED_LANGUAGES: LanguageCode[] = [...DEFAULT_LANGUAGE_CODES]

export function getLabelForLanguage(code: LanguageCode) {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.label ?? code.toUpperCase()
}

export function getFlagForLanguage(code: LanguageCode) {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code)?.flag ?? '🏳️'
}
