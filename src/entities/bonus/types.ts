export interface DepositBonusTranslation {
	language: string;
	content: string;
	updatedAt: string;
}

export interface DepositBonus {
	validUntil?: string;
	reviewDue?: string;
	checkedAt?: string;
	responsible?: string;
	id: string;
	name: string;
	minDepositAmount?: number;
	minDepositCurrency?: string;
	content: string;
	translations?: DepositBonusTranslation[];
	order: number;
}

export interface BonusProject {
	id: string;
	name: string;
	slug: string;
	sheetId?: string;
	sourceUrl?: string;
	sourceHash?: string;
	bonuses: DepositBonus[];
	updatedAt: string;
}
