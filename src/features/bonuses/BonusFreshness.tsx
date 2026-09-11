import { useEffect, useState } from "react";
import { bonusStatus, localDate, type Freshness } from "./bonus-freshness";
export function BonusFreshness({
	bonus,
	canEdit = false,
	onChange,
}: {
	bonus: Freshness;
	canEdit?: boolean;
	onChange?: (patch: Freshness) => void;
}) {
	const [today, setToday] = useState(localDate());
	const [open, setOpen] = useState(false);
	const [until, setUntil] = useState(""),
		[due, setDue] = useState(""),
		[responsible, setResponsible] = useState("");
	useEffect(() => {
		const timer = setInterval(() => setToday(localDate()), 60000);
		return () => clearInterval(timer);
	}, []);
	const status = bonusStatus(bonus, today);
	return (
		<div className="my-3 text-xs">
			<span
				className={`inline-block rounded-lg border px-2 py-1 ${status.warning ? "border-amber-400/25 bg-amber-400/5 text-amber-400" : "border-border bg-surface-elevated text-muted"}`}
			>
				{status.label}
			</span>
			<div className="mt-2 space-y-1 text-muted">
				{bonus.validUntil && (
					<p>Действует по {bonus.validUntil} включительно</p>
				)}
				{bonus.reviewDue && <p>Проверить: {bonus.reviewDue}</p>}
				{bonus.checkedAt && <p>Проверено: {bonus.checkedAt.slice(0, 10)}</p>}
				{bonus.responsible && <p>Ответственный: {bonus.responsible}</p>}
			</div>
			{canEdit && (
				<button
					type="button"
					onClick={() => {
						setUntil(bonus.validUntil ?? "");
						setDue(bonus.reviewDue ?? "");
						setResponsible(bonus.responsible ?? "");
						setOpen(!open);
					}}
					className="mt-2 underline underline-offset-4"
				>
					Настроить актуальность
				</button>
			)}
			{open && canEdit && (
				<form
					className="mt-3 space-y-3 rounded-xl border border-border p-3"
					onSubmit={(e) => {
						e.preventDefault();
						onChange?.({ validUntil: until, reviewDue: due, responsible });
						setOpen(false);
					}}
				>
					<label className="block">
						Действует по
						<input
							aria-label="Действует по"
							type="date"
							value={until}
							onChange={(e) => setUntil(e.target.value)}
							className="mt-1 block w-full rounded-lg border border-border bg-background p-2"
						/>
					</label>
					<label className="block">
						Следующая проверка
						<input
							aria-label="Следующая проверка"
							type="date"
							value={due}
							onChange={(e) => setDue(e.target.value)}
							className="mt-1 block w-full rounded-lg border border-border bg-background p-2"
						/>
					</label>
					<label className="block">
						Ответственный
						<input
							aria-label="Ответственный"
							maxLength={120}
							value={responsible}
							onChange={(e) => setResponsible(e.target.value)}
							className="mt-1 block w-full rounded-lg border border-border bg-background p-2"
						/>
					</label>
					<div className="flex flex-wrap gap-2">
						<button
							type="submit"
							className="rounded-lg border border-border p-2"
						>
							Применить
						</button>
						<button
							type="button"
							onClick={() => {
								onChange?.({
									validUntil: until,
									reviewDue: due,
									responsible,
									checkedAt: new Date().toISOString(),
								});
								setOpen(false);
							}}
							className="rounded-lg bg-accent p-2 text-accent-foreground"
						>
							Условия проверены
						</button>
					</div>
					<p className="text-muted">
						После применения сохраните изменения справочника.
					</p>
				</form>
			)}
		</div>
	);
}
