export interface DepositBonus {
	id: string;
	name: string;
	minDepositAmount?: number;
	minDepositCurrency?: string;
	content: string;
	order: number;
}

export interface BonusProject {
	id: string;
	name: string;
	slug: string;
	sourceHash?: string;
	bonuses: DepositBonus[];
	updatedAt: string;
}
