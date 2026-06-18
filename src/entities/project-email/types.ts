export interface ProjectEmailRecord {
	id: string;
	projectName: string;
	slug: string;
	supportEmail: string;
	kycEmail: string;
	vipEmail: string;
	sourceHash?: string;
	updatedAt: string;
}
