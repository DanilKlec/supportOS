import type { ShiftId } from "./model";
export type SheetRows = unknown[][];
export type ScheduleImport = {
	month: string;
	people: string[];
	records: { day: string; email: string; shift: ShiftId }[];
};
const months =
	"January February March April May June July August September October November December".split(
		" ",
	);
export function sheetMonth(name: string) {
	const match = /^(\w+)\s+(\d{2}|\d{4})$/.exec(name.trim());
	if (!match) return null;
	const month =
		months.findIndex((m) => m.toLowerCase() === match[1].toLowerCase()) + 1;
	const year =
		match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
	return month && year >= 2000 && year <= 2100
		? `${year}-${String(month).padStart(2, "0")}`
		: null;
}
const str = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) =>
	str(v)
		.replace(/\([^)]*\)/g, "")
		.toLowerCase()
		.replaceAll("ё", "е")
		.split(/\s+/)
		.slice(0, 2)
		.join(" ");
export function parseSchedule(
	rows: SheetRows,
	directory: SheetRows,
	sheet: string,
	agents: { id: string }[],
) {
	const month = sheetMonth(sheet);
	if (!month)
		throw new Error(
			"Название листа должно содержать месяц и год, например September 26.",
		);
	const emails = new Map<string, Set<string>>();
	for (const row of directory) {
		const email = str(row[4]).toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !str(row[1])) continue;
		const k = key(row[1]);
		const values = emails.get(k) ?? new Set<string>();
		values.add(email);
		emails.set(k, values);
	}
	const days = new Date(
		Number(month.slice(0, 4)),
		Number(month.slice(5)),
		0,
	).getDate();
	const columns = (rows[0] ?? [])
		.map((value, index) => ({ day: Number(value), index }))
		.filter(
			(x) =>
				x.index >= 3 && Number.isInteger(x.day) && x.day >= 1 && x.day <= days,
		);
	if (
		columns.length !== days ||
		new Set(columns.map((x) => x.day)).size !== days
	)
		throw new Error(
			"В первой строке должны быть все дни выбранного месяца без повторов.",
		);
	const codes: Record<string, ShiftId[]> = {
		"7": ["day"],
		"6.5": ["evening"],
		"9": ["night"],
		"13": ["day", "evening"],
	};
	const known = new Map(agents.map((a) => [a.id.toLowerCase(), a.id]));
	const issues: string[] = [];
	const people: string[] = [];
	const records: ScheduleImport["records"] = [];
	const preview: { name: string; email: string; shifts: number }[] = [];
	for (const [index, row] of rows.entries()) {
		const name = str(row[2]);
		if (!/\(sup\)/i.test(name)) continue;
		const matches = [...(emails.get(key(name)) ?? [])];
		if (matches.length !== 1) {
			issues.push(
				`Строка ${index + 1}: ${name} — нет однозначной корпоративной почты.`,
			);
			continue;
		}
		const email = matches[0];
		if (!known.has(email))
			issues.push(
				`${name}: ${email} — агент не найден в LiveChat. Обновите список агентов или исправьте почту.`,
			);
		if (people.includes(email)) {
			issues.push(`${email} — повторная строка сотрудника.`);
			continue;
		}
		people.push(email);
		let count = 0;
		for (const { day, index: col } of columns) {
			const raw = str(row[col]).replace(",", ".");
			if (!raw || Number(raw) === 0) continue;
			const shifts = codes[String(Number(raw))];
			if (!shifts) {
				issues.push(`${name}, ${day}: неизвестный код «${raw}».`);
				continue;
			}
			for (const shift of shifts) {
				records.push({
					day: `${month}-${String(day).padStart(2, "0")}`,
					email,
					shift,
				});
				count++;
			}
		}
		preview.push({ name, email, shifts: count });
	}
	if (!people.length)
		issues.push("Не найдены сотрудники с пометкой (sup).");
	return { payload: { month, people, records }, issues, preview };
}
