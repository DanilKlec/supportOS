import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type ChatwootCustomAttributeDefinition,
	chatwootService,
} from "@/services/chatwoot.service";

type Model = 0 | 1;
type Draft = {
	id?: number;
	attribute_display_name: string;
	attribute_key: string;
	attribute_display_type: number;
	attribute_description: string;
	attribute_values: string[];
	attribute_model: Model;
};

const emptyDraft = (model: Model): Draft => ({
	attribute_display_name: "",
	attribute_key: "",
	attribute_display_type: 0,
	attribute_description: "",
	attribute_values: [],
	attribute_model: model,
});
const displayTypes = [
	[0, "Текст"], [1, "Число"], [2, "Валюта"], [3, "Процент"],
	[4, "Ссылка"], [5, "Дата"], [6, "Список"], [7, "Флажок"],
] as const;

function fromDefinition(definition: ChatwootCustomAttributeDefinition): Draft {
	return {
		id: definition.id,
		attribute_display_name: definition.attribute_display_name,
		attribute_key: definition.attribute_key,
		attribute_display_type: definition.attribute_display_type,
		attribute_description: definition.attribute_description ?? "",
		attribute_values: definition.attribute_values ?? [],
		attribute_model: definition.attribute_model,
	};
}

export function CustomAttributesDialog({ onClose }: { onClose: () => void }) {
	const client = useQueryClient();
	const [model, setModel] = useState<Model>(0);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [deleteId, setDeleteId] = useState<number | null>(null);
	const definitions = useQuery({
		queryKey: ["chatwoot", "custom-attributes", model],
		queryFn: () => chatwootService.customAttributes(model),
	});
	const save = useMutation({
		mutationFn: () => {
			if (!draft) throw new Error("Выберите поле для редактирования");
			return chatwootService.saveCustomAttribute(draft);
		},
		onSuccess: async () => {
			setDraft(null);
			await client.invalidateQueries({ queryKey: ["chatwoot", "custom-attributes"] });
		},
	});
	const remove = useMutation({
		mutationFn: (id: number) => chatwootService.deleteCustomAttribute(id, model),
		onSuccess: async () => {
			setDeleteId(null);
			await client.invalidateQueries({ queryKey: ["chatwoot", "custom-attributes"] });
		},
	});
	const items = definitions.data?.payload ?? [];
	useEffect(() => {
		setDraft(null);
		setDeleteId(null);
	}, [model]);
	const update = (key: keyof Draft, value: string | number | string[]) => {
		setDraft((current) => current ? { ...current, [key]: value } : current);
	};
	const setName = (name: string) => {
		setDraft((current) => {
			if (!current) return current;
			const key = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
			return { ...current, attribute_display_name: name, ...(!current.id ? { attribute_key: key } : {}) };
		});
	};
	return (
		<div className="fixed inset-0 z-[110] grid place-items-center bg-black/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
			<section role="dialog" aria-modal="true" aria-labelledby="chatwoot-fields-title" className="flex max-h-[min(760px,92vh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
				<header className="flex items-start justify-between border-b border-border px-5 py-4">
					<div><h2 id="chatwoot-fields-title" className="text-base font-semibold">Поля Chatwoot</h2><p className="mt-1 text-xs text-muted">Настройте поля игрока и диалога. Изменения сразу применяются в Chatwoot.</p></div>
					<button type="button" aria-label="Закрыть" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-elevated"><X size={16} /></button>
				</header>
				<div className="flex min-h-0 flex-1 flex-col md:flex-row">
					<div className="supportos-scroll min-h-0 w-full shrink-0 overflow-y-auto border-b border-border p-3 md:w-[44%] md:border-b-0 md:border-r">
						<div className="mb-3 flex gap-1 rounded-xl bg-background p-1">
							{([[0, "Поля диалога"], [1, "Поля игрока"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setModel(value)} className={`flex-1 rounded-lg px-2 py-2 text-xs ${model === value ? "bg-surface-elevated text-foreground" : "text-muted hover:text-foreground"}`}>{label}</button>)}
						</div>
						<button type="button" onClick={() => { setDraft(emptyDraft(model)); setDeleteId(null); }} className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-surface-elevated"><Plus size={14} /> Добавить поле</button>
						{definitions.isLoading ? <div className="flex items-center gap-2 p-4 text-xs text-muted"><LoaderCircle size={14} className="animate-spin" />Загружаем поля…</div> : definitions.isError ? <p role="alert" className="p-3 text-xs text-red-300">{definitions.error instanceof Error ? definitions.error.message : "Не удалось загрузить поля"}</p> : items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">Пока нет пользовательских полей</p> : <div className="space-y-1">{items.map((item) => <div key={item.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${draft?.id === item.id ? "border-accent/50 bg-accent/5" : "border-transparent hover:bg-surface-elevated"}`}>
							<button type="button" onClick={() => { setDraft(fromDefinition(item)); setDeleteId(null); }} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-medium">{item.attribute_display_name}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-muted">{item.attribute_key} · {displayTypes.find(([value]) => value === item.attribute_display_type)?.[1] ?? "Тип поля"}</span></button>
							<button type="button" aria-label={`Удалить поле ${item.attribute_display_name}`} onClick={() => { setDeleteId(item.id); setDraft(null); }} className="rounded-md p-1.5 text-muted hover:bg-red-500/10 hover:text-red-300"><Trash2 size={13} /></button>
						</div>)}</div>}
						{deleteId != null && <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/5 p-3"><p className="text-xs font-medium">Удалить определение поля?</p><p className="mt-1 text-[11px] text-muted">Chatwoot перестанет показывать это поле и связанные с ним значения.</p><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setDeleteId(null)} className="rounded-lg border border-border px-2.5 py-1.5 text-xs">Отмена</button><button type="button" disabled={remove.isPending} onClick={() => remove.mutate(deleteId)} className="rounded-lg bg-red-500/15 px-2.5 py-1.5 text-xs text-red-300">Удалить</button></div></div>}
					</div>
					<div className="supportos-scroll min-h-0 flex-1 overflow-y-auto p-5">
						{draft ? <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }} className="space-y-4">
							<div><label className="mb-1.5 block text-xs font-medium">Название поля</label><input autoFocus value={draft.attribute_display_name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="Например, ID игрока" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent/60" /></div>
							<div><label className="mb-1.5 block text-xs font-medium">Ключ (API)</label><input value={draft.attribute_key} onChange={(event) => update("attribute_key", event.target.value)} maxLength={40} required pattern="[A-Za-z][A-Za-z0-9_]{0,39}" placeholder="player_id" className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-accent/60" /><p className="mt-1 text-[10px] text-muted">Только латиница, цифры и подчёркивание; первый символ — буква.</p></div>
							<div><label className="mb-1.5 block text-xs font-medium">Тип поля</label><select value={draft.attribute_display_type} onChange={(event) => update("attribute_display_type", Number(event.target.value))} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent/60">{displayTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
							{draft.attribute_display_type === 6 && <div><label className="mb-1.5 block text-xs font-medium">Варианты списка</label><textarea value={draft.attribute_values.join("\n")} onChange={(event) => update("attribute_values", event.target.value.split("\n"))} rows={4} placeholder={"Одна опция на строку\nRU\nEN"} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent/60" /></div>}
							<div><label className="mb-1.5 block text-xs font-medium">Описание</label><textarea value={draft.attribute_description} onChange={(event) => update("attribute_description", event.target.value)} maxLength={500} rows={3} placeholder="Подсказка для оператора" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent/60" /></div>
							{save.isError && <p role="alert" className="text-xs text-red-300">{save.error instanceof Error ? save.error.message : "Не удалось сохранить поле"}</p>}
							<div className="flex justify-end gap-2 border-t border-border pt-3"><button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border px-3 py-2 text-xs">Отмена</button><button disabled={save.isPending} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save size={13} />{save.isPending ? "Сохраняем…" : "Сохранить"}</button></div>
						</form> : <div className="flex h-full min-h-48 flex-col items-center justify-center text-center"><div className="grid size-12 place-items-center rounded-2xl border border-border bg-background text-muted"><Save size={19} /></div><p className="mt-3 text-sm font-medium">Выберите поле или создайте новое</p><p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">Поля диалога относятся к одному обращению. Поля игрока общие для всех его обращений.</p></div>}
					</div>
				</div>
			</section>
		</div>
	);
}
