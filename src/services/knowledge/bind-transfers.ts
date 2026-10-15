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
export function subscribeBindTransfers(
	listener: (actor: string, result: BindTransferResult) => void | Promise<void>,
) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
export async function publishBindTransfer(
	actor: string,
	result: BindTransferResult,
) {
	await Promise.allSettled(
		[...listeners].map((listener) => listener(actor, result)),
	);
}
