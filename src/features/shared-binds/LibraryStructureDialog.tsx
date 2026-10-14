import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import type { KnowledgeTreeNode } from "@/entities/knowledge";
import type {
	LibraryStructure,
	StructureChange,
} from "@/services/shared-library.service";
import { BaseModal } from "@/shared/modals/BaseModal";
import { descendants, folderPath, nodeLocation } from "./library-tree";
export type StructureDialogState = {
	kind: "category" | "folder" | "edit" | "move" | "delete";
	node?: KnowledgeTreeNode;
	target?: KnowledgeTreeNode;
};
export function LibraryStructureDialog({
	state,
	structure,
	onClose,
	onChange,
	onMoveBind,
}: {
	state: StructureDialogState;
	structure: LibraryStructure;
	onClose: () => void;
	onChange: (change: StructureChange) => Promise<void>;
	onMoveBind: (
		node: KnowledgeTreeNode,
		categoryId: string,
		folderId?: string,
	) => Promise<void>;
}) {
	const { node, kind } = state,
		entity =
			kind === "category"
				? "category"
				: kind === "folder"
					? "folder"
					: node?.type === "category"
						? "category"
						: "folder";
	const [existing] = useState(() =>
		kind !== "category" && kind !== "folder"
			? (entity === "category" ? structure.categories : structure.folders).find(
					(n) => n.id === node?.id,
				)
			: undefined,
	);
	const initial = nodeLocation(state.target ?? node, structure);
	const movingBind = kind === "move" && node?.type === "bind";
	const [name, setName] = useState(
		kind === "category" || kind === "folder" ? "" : (node?.name ?? ""),
	);
	const [category, setCategory] = useState(initial.categoryId);
	const [parent, setParent] = useState<string>(
		state.target
			? (initial.folderId ?? "")
			: existing && "parentId" in existing
				? typeof existing.parentId === "string"
					? existing.parentId
					: ""
				: kind === "folder"
					? (initial.folderId ?? "")
					: (node?.bind?.folderId ?? ""),
	);
	const [color, setColor] = useState(existing?.color ?? "");
	const destinations = structure.categories.filter((c) => c.id !== node?.id);
	const [destination, setDestination] = useState(destinations[0]?.id ?? "");
	const [busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const excluded =
		node?.type === "folder" && existing
			? descendants(node.id, structure)
			: new Set<string>();
	const options = structure.folders.filter(
		(f) => f.categoryId === category && !excluded.has(f.id),
	);
	const title =
		kind === "delete"
			? `Удалить ${entity === "category" ? "раздел" : "папку"}?`
			: kind === "move"
				? node?.type === "folder"
					? "Переместить папку"
					: "Переместить бинд"
				: kind === "category"
					? "Новый раздел"
					: kind === "folder"
						? "Новая папка"
						: entity === "category"
							? "Настройки раздела"
							: "Настройки папки";
	const path = [
		"Общая база",
		structure.categories.find((c) => c.id === category)?.name,
		...folderPath(parent || undefined, structure),
	]
		.filter(Boolean)
		.join(" / ");
	return (
		<BaseModal title={title} onClose={onClose} closeDisabled={busy} size="sm">
			<form
				className="library-structure-form"
				onSubmit={async (e) => {
					e.preventDefault();
					if (busy) return;
					setBusy(true);
					setError("");
					try {
						if (movingBind && node) {
							await onMoveBind(node, category, parent || undefined);
						} else {
							await onChange({
								entity,
								operation: kind === "delete" ? "delete" : "save",
								payload: {
									...(existing
										? { id: existing.id, expected: existing.updatedAt }
										: {}),
									...(kind === "delete"
										? {
												strategy: "keep",
												...(entity === "category"
													? { destinationCategoryId: destination }
													: {}),
											}
										: { name, categoryId: category, parentId: parent, color }),
								},
							});
						}
						onClose();
					} catch (cause) {
						setError(
							cause instanceof Error ? cause.message : "Не удалось сохранить",
						);
					} finally {
						setBusy(false);
					}
				}}
			>
				{kind === "delete" ? (
					<>
						<p className="library-dialog-note">
							Удалить «{node?.name}» из структуры общей базы?
						</p>
						{entity === "category" ? (
							destinations.length > 0 ? (
								<Field label="Куда перенести содержимое">
									<Select
										value={destination}
										onChange={(e) => setDestination(e.target.value)}
										disabled={busy}
										required
									>
										{destinations.map((c) => (
											<option key={c.id} value={c.id}>
												{c.name}
											</option>
										))}
									</Select>
								</Field>
							) : (
								<p className="library-dialog-note">
									Последний раздел можно удалить, если он пуст. Чтобы сохранить
									его содержимое, сначала создайте новый раздел.
								</p>
							)
						) : (
							<div className="library-location-preview">
								<span>Куда переместится содержимое</span>
								<p>
									{[
										structure.categories.find((c) => c.id === category)?.name,
										...folderPath(parent || undefined, structure),
									]
										.filter(Boolean)
										.join(" / ")}
								</p>
							</div>
						)}
						<p className="library-preserve-note">
							Бинды, вложенные папки, переводы и личные версии сотрудников
							сохранятся. Из структуры исчезнет только{" "}
							{entity === "category" ? "выбранный раздел" : "выбранная папка"}.
						</p>
					</>
				) : (
					<>
						{!movingBind && (
							<Field label="Название">
								<Input
									required
									autoFocus
									maxLength={120}
									value={name}
									onChange={(e) => setName(e.target.value)}
									disabled={busy}
								/>
							</Field>
						)}
						{entity === "folder" && (
							<>
								<Field label="Раздел">
									<Select
										value={category}
										disabled={busy || Boolean(existing)}
										onChange={(e) => {
											setCategory(e.target.value);
											setParent("");
										}}
									>
										{structure.categories.map((c) => (
											<option key={c.id} value={c.id}>
												{c.name}
											</option>
										))}
									</Select>
								</Field>
								<Field
									label={movingBind ? "Папка назначения" : "Родительская папка"}
								>
									<Select
										value={parent}
										onChange={(e) => setParent(e.target.value)}
										disabled={busy}
									>
										<option value="">Корень раздела</option>
										{options.map((f) => (
											<option key={f.id} value={f.id}>
												{folderPath(f.id, structure).join(" / ")}
											</option>
										))}
									</Select>
								</Field>
							</>
						)}
						{!movingBind && (
							<fieldset className="ui-field">
								<legend className="mb-3 text-sm">Цвет</legend>
								<div className="library-color-options">
									{[
										"",
										"#a78bfa",
										"#60a5fa",
										"#34d399",
										"#fbbf24",
										"#fb7185",
									].map((c) => (
										<button
											key={c}
											type="button"
											aria-label={c || "Наследовать цвет"}
											aria-pressed={color === c}
											style={c ? { background: c } : undefined}
											onClick={() => setColor(c)}
											disabled={busy}
										>
											{!c ? "Авто" : ""}
										</button>
									))}
								</div>
							</fieldset>
						)}
						<div className="library-location-preview">
							<span>Расположение в дереве</span>
							<p>
								{entity === "category"
									? `Общая база / ${name || "Новый раздел"}`
									: path}
								{!movingBind && entity === "folder"
									? ` / ${name || "Новая папка"}`
									: ""}
							</p>
						</div>
					</>
				)}
				{error && (
					<p role="alert" className="library-error">
						{error}
					</p>
				)}
				<div className="ui-actions justify-end">
					<Button variant="secondary" disabled={busy} onClick={onClose}>
						Отмена
					</Button>
					<Button
						type="submit"
						variant={kind === "delete" ? "danger" : "primary"}
						loading={busy}
					>
						{kind === "delete"
							? "Удалить"
							: kind === "move"
								? "Переместить"
								: existing
									? "Сохранить"
									: "Создать"}
					</Button>
				</div>
			</form>
		</BaseModal>
	);
}
