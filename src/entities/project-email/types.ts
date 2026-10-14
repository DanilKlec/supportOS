export interface ProjectEmailAddress {
	id: string;
	type: string;
	email: string;
	note?: string;
	order: number;
}
export interface ProjectEmailRecord {
	id: string;
	projectName: string;
	slug: string;
	addresses: ProjectEmailAddress[];
	/** Transitional fields accepted by older readers and imports. */
	emails?: Array<Omit<ProjectEmailAddress, "order"> & { order?: number }>;
	supportEmail?: string;
	kycEmail?: string;
	vipEmail?: string;
	sourceHash?: string;
	updatedAt: string;
}
