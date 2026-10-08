import type { Dispatch, SetStateAction } from "react";
import {
	type BonusDraft,
	getDraftContent,
	getLanguageLabel,
	setDraftLanguageContent,
} from "./bonus-presentation";

export function TranslationEditor({
	bonusDraft,
	setBonusDraft,
	selectedLanguage,
}: {
	bonusDraft: BonusDraft;
	setBonusDraft: Dispatch<SetStateAction<BonusDraft>>;
	selectedLanguage: string;
}) {
	return (
		<textarea
			value={getDraftContent(bonusDraft, selectedLanguage)}
			onChange={(event) =>
				setBonusDraft((current) =>
					setDraftLanguageContent(
						current,
						selectedLanguage,
						event.target.value,
					),
				)
			}
			className="ui-input min-h-28 w-full resize-y border border-border bg-background outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
			placeholder={`Текст бонуса / готовый ответ (${getLanguageLabel(
				selectedLanguage,
			)})`}
		/>
	);
}
