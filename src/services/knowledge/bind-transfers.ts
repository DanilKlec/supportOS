import type { Bind } from "@/entities/bind";

export interface BindTransferPayload {
	sources: { id: string; categoryId: string; folderId?: string }[];
	categoryId: string;
	folderId?: string;
	beforeId?: string;
}
export interface BindTransferResult {
	binds: Bind[];
	replacements: Record<string, string>;
}
const listeners = new Set<
	(actor: string, result: BindTransferResult) => void | Promise<void>
>();
export function subscribeBindChanges(
	listener: (actor: string, result: BindTransferResult) => void | Promise<void>,
) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
export async function publishBindChanges(
	actor: string,
	result: BindTransferResult,
) {
	await Promise.allSettled(
		[...listeners].map((listener) => listener(actor, result)),
	);
}
export const subscribeBindTransfers = subscribeBindChanges;
export const publishBindTransfer = publishBindChanges;
