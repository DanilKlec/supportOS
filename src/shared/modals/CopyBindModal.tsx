import { Search } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ProjectEmailRecord } from "@/entities/project-email";
import { knowledgeService } from "@/services/knowledge.service";
import { useToast } from "@/shared/hooks/useToast";
import { copyToClipboard } from "@/shared/lib/clipboard";
import {
	applyTemplateVariables,
	extractTemplateVariables,
} from "@/shared/lib/template-variables";
import { useKnowledgeStore, useProjectEmailStore } from "@/store";
import { emailAddresses } from "../../../shared/project-emails.js";

import { BaseModal } from "./BaseModal";
import { getBindTranslation } from "./knowledge-modal-helpers";
import { Field, inputClass, ModalActions } from "./ModalFormHelpers";
import type { ModalPayload } from "./modal.types";

export function CopyBindModal({
	payload,
	onClose,
}: {
	payload: ModalPayload;
	onClose: () => void;
}) {
	const { showToast } = useToast();
	const language = useKnowledgeStore((state) => state.language);
	const bind = useKnowledgeStore((state) =>
		payload.bindId ? state.getBind(payload.bindId) : undefined,
	);
	const targetLanguage = payload.language ?? language;
	const translation = bind
		? getBindTranslation(bind, targetLanguage)
		: undefined;
	const projectEmailRecords = useProjectEmailStore((state) => state.records);
	const variables = useMemo(
		() => extractTemplateVariables(translation?.content ?? ""),
		[translation?.content],
	);
	const projectEmailOptions = useMemo(
		() => buildProjectEmailOptions(projectEmailRecords),
		[projectEmailRecords],
	);
	const [emailQuery, setEmailQuery] = useState("");
	const filteredProjectEmailOptions = useMemo(
		() => filterProjectEmailOptions(projectEmailOptions, emailQuery),
		[emailQuery, projectEmailOptions],
	);
	const [values, setValues] = useState<Record<string, string>>(() => {
		const preset = readVariablePreset(variables);
		const defaultEmail = projectEmailOptions[0]?.value;

		if (defaultEmail) {
			for (const variable of variables) {
				if (isEmailVariable(variable) && !preset[variable]) {
					preset[variable] = defaultEmail;
				}
			}
		}

		return preset;
	});
	const hasEmailVariable = variables.some(isEmailVariable);
	const content = applyTemplateVariables(translation?.content ?? "", values);

	useEffect(
		() =>
			setValues((current) => {
				let changed = false;
				const next = { ...current };
				const defaultEmail = projectEmailOptions[0]?.value;

				for (const variable of variables) {
					if (next[variable] === undefined) {
						next[variable] = "";
						changed = true;
					}

					if (isEmailVariable(variable) && !next[variable] && defaultEmail) {
						next[variable] = defaultEmail;
						changed = true;
					}
				}

				return changed ? next : current;
			}),
		[projectEmailOptions, variables],
	);
	const [saving, setSaving] = useState(false);

	if (!bind || !translation) {
		return (
			<BaseModal title="Copy bind" onClose={onClose}>
				<p className="text-sm text-muted">Bind was not found</p>
			</BaseModal>
		);
	}

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setSaving(true);

		try {
			const ok = await copyToClipboard(content);

			if (ok) {
				writeVariablePreset(values);
				knowledgeService.recordBindCopied(bind.id);
			}
			showToast(ok ? "Copied to clipboard" : "Copy failed");
			if (ok) onClose();
		} finally {
			setSaving(false);
		}
	};

	return (
		<BaseModal title="Copy with variables" onClose={onClose} size="lg">
			<form onSubmit={submit} className="space-y-4">
				<div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-muted">
					{translation.title || bind.slug}
				</div>

				{variables.length > 0 ? (
					<div className="grid gap-3 sm:grid-cols-2">
						{variables.map((variable) => {
							const emailVariable = isEmailVariable(variable);

							return (
								<div
									key={variable}
									className={emailVariable ? "sm:col-span-2" : ""}
								>
									<Field label={emailVariable ? "Email" : `{${variable}}`}>
										{emailVariable && projectEmailOptions.length > 0 ? (
											<div className="space-y-2">
												<div className="relative">
													<Search
														size={15}
														className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
													/>
													<input
														type="search"
														value={emailQuery}
														onChange={(event) =>
															setEmailQuery(event.target.value)
														}
														className="ui-input w-full border border-border bg-background pl-9 pr-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
														placeholder="Search project, type or email..."
													/>
												</div>

												<div className="supportos-scroll max-h-56 overflow-auto rounded-lg border border-border bg-background">
													{filteredProjectEmailOptions.length > 0 ? (
														filteredProjectEmailOptions.map((option) => {
															const active = values[variable] === option.value;

															return (
																<button
																	key={option.id}
																	type="button"
																	onClick={() =>
																		setValues((current) => ({
																			...current,
																			[variable]: option.value,
																		}))
																	}
																	className={`flex min-h-12 w-full min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 ${
																		active
																			? "bg-accent/10 text-foreground"
																			: "text-muted hover:bg-surface-elevated hover:text-foreground"
																	}`}
																>
																	<span className="min-w-0">
																		<span className="block truncate font-medium">
																			{option.projectName}
																		</span>
																		<span className="block truncate text-xs text-muted">
																			{option.value}
																		</span>
																	</span>
																	<span className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-semibold uppercase text-muted">
																		{option.type}
																	</span>
																</button>
															);
														})
													) : (
														<div className="px-3 py-5 text-sm text-muted">
															No emails match this search
														</div>
													)}
												</div>
											</div>
										) : (
											<input
												value={values[variable] ?? ""}
												onChange={(event) =>
													setValues((current) => ({
														...current,
														[variable]: event.target.value,
													}))
												}
												className={`ui-input ${inputClass}`}
												placeholder={
													emailVariable
														? "Add project emails or enter email manually"
														: variable
												}
											/>
										)}
									</Field>
								</div>
							);
						})}
					</div>
				) : (
					<p className="text-sm text-muted">
						This bind has no variables. It will be copied as is.
					</p>
				)}

				{hasEmailVariable && projectEmailOptions.length === 0 && (
					<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200">
						No project emails found yet. Add them in Project Emails to choose
						from a list.
					</div>
				)}

				<div className="max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-sm leading-6 text-muted">
					<pre className="whitespace-pre-wrap font-sans">{content}</pre>
				</div>

				<ModalActions submitLabel="Copy" saving={saving} onCancel={onClose} />
			</form>
		</BaseModal>
	);
}

function isEmailVariable(variable: string) {
	return variable.trim().toLowerCase() === "email";
}

function normalizeProjectEmailSearch(value: string) {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\u0451/g, "е")
		.replace(/[^a-z0-9а-я@._-]+/g, " ")
		.trim();
}

function buildProjectEmailOptions(records: ProjectEmailRecord[]) {
	return records.flatMap((record) =>
		emailAddresses(record)
			.map((row) => ({ ...row, value: row.email }))
			.filter((item) => item.value.trim())
			.map((item) => ({
				id: `${record.id}:${item.id}`,
				label: `${record.projectName} - ${item.type}`,
				projectName: record.projectName,
				type: item.type,
				value: item.value,
				searchText: normalizeProjectEmailSearch(
					`${record.projectName} ${item.type} ${item.value}`,
				),
			})),
	);
}

function filterProjectEmailOptions(
	options: ReturnType<typeof buildProjectEmailOptions>,
	query: string,
) {
	const tokens = normalizeProjectEmailSearch(query)
		.split(/\s+/)
		.filter(Boolean);

	if (tokens.length === 0) return options;

	return options.filter((option) =>
		tokens.every((token) => option.searchText.includes(token)),
	);
}

const VARIABLE_PRESET_KEY = "supportos:variable-presets:v1";

function readVariablePreset(variables: string[]) {
	if (typeof localStorage === "undefined") return {};

	try {
		const stored = JSON.parse(
			localStorage.getItem(VARIABLE_PRESET_KEY) ?? "{}",
		) as Record<string, string>;

		return Object.fromEntries(
			variables.map((variable) => [variable, stored[variable] ?? ""]),
		);
	} catch {
		return {};
	}
}

function writeVariablePreset(values: Record<string, string>) {
	if (typeof localStorage === "undefined") return;

	try {
		const stored = JSON.parse(
			localStorage.getItem(VARIABLE_PRESET_KEY) ?? "{}",
		) as Record<string, string>;

		localStorage.setItem(
			VARIABLE_PRESET_KEY,
			JSON.stringify({
				...stored,
				...values,
			}),
		);
	} catch {
		localStorage.setItem(VARIABLE_PRESET_KEY, JSON.stringify(values));
	}
}
