export interface Freshness {
	validUntil?: string;
	reviewDue?: string;
	checkedAt?: string;
	responsible?: string;
}
export function localDate(now = new Date()) {
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function bonusStatus(b: Freshness, today = localDate()) {
	if (b.validUntil && b.validUntil < today)
		return { label: "Срок истёк", warning: true };
	if (!b.checkedAt) return { label: "Требует проверки", warning: true };
	if (b.reviewDue && b.reviewDue <= today)
		return { label: "Пора проверить", warning: true };
	return { label: "Проверен", warning: false };
}
