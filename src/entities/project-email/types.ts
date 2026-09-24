export interface ProjectEmailAddress {
	id: string;
	type: string;
	email: string;
	note?: string;
}
export interface ProjectEmailRecord {
	id: string;
	projectName: string;
	slug: string;
	/** Optional only while reading legacy records. */
	emails?: ProjectEmailAddress[];
	supportEmail: string;
	kycEmail: string;
	vipEmail: string;
	sourceHash?: string;
	updatedAt: string;
}
