import type { KnowledgeDatabase } from "@/services/knowledge.service";
import { useAuthStore } from "@/store/auth.store";

const DB_NAME = "supportos-local";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_ID = "knowledge";
const LEGACY_STORAGE_KEY = "supportos:knowledge:v1";
const STORAGE_VERSION = 1;
const accountId = () =>
	useAuthStore.getState().session?.user.id ?? "signed-out";
function visibleSnapshot(database: Partial<StoredKnowledge>) {
	const id = accountId();
	const visible = (item: { ownerId?: string | null }) =>
		!item.ownerId || item.ownerId === id;
	return {
		...database,
		categories: database.categories?.filter(visible),
		folders: database.folders?.filter(visible),
		binds: database.binds?.filter(visible),
	};
}

interface StoredKnowledge extends KnowledgeDatabase {
	version?: number;
}

interface KnowledgeSnapshotRecord {
	id: string;
	version: number;
	updatedAt: string;
	database: StoredKnowledge;
}

function canUseIndexedDb() {
	return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function canUseLocalStorage() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const database = request.result;

			if (!database.objectStoreNames.contains(STORE_NAME)) {
				database.createObjectStore(STORE_NAME, { keyPath: "id" });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function readIndexedDbSnapshot() {
	const key = `${SNAPSHOT_ID}:${accountId()}`;
	if (!canUseIndexedDb()) return undefined;

	const database = await openDatabase();

	try {
		const transaction = database.transaction(STORE_NAME, "readonly");
		const store = transaction.objectStore(STORE_NAME);

		const own = await requestToPromise<KnowledgeSnapshotRecord | undefined>(
			store.get(key),
		);
		if (own) return own;
		return await requestToPromise<KnowledgeSnapshotRecord | undefined>(
			database
				.transaction(STORE_NAME, "readonly")
				.objectStore(STORE_NAME)
				.get(SNAPSHOT_ID),
		);
	} finally {
		database.close();
	}
}

async function writeIndexedDbSnapshot(databaseSnapshot: KnowledgeDatabase) {
	const key = `${SNAPSHOT_ID}:${accountId()}`;
	if (!canUseIndexedDb()) return false;

	const database = await openDatabase();

	try {
		const transaction = database.transaction(STORE_NAME, "readwrite");
		const store = transaction.objectStore(STORE_NAME);
		const record: KnowledgeSnapshotRecord = {
			id: key,
			version: STORAGE_VERSION,
			updatedAt: new Date().toISOString(),
			database: {
				version: STORAGE_VERSION,
				...databaseSnapshot,
			},
		};

		await requestToPromise(store.put(record));

		return true;
	} finally {
		database.close();
	}
}

function readLegacySnapshot() {
	if (!canUseLocalStorage()) return undefined;

	try {
		const raw =
			localStorage.getItem(`${LEGACY_STORAGE_KEY}:${accountId()}`) ??
			localStorage.getItem(LEGACY_STORAGE_KEY);

		return raw ? (JSON.parse(raw) as Partial<StoredKnowledge>) : undefined;
	} catch {
		return undefined;
	}
}

function writeLegacySnapshot(database: KnowledgeDatabase, id = accountId()) {
	if (!canUseLocalStorage()) return;

	localStorage.setItem(
		`${LEGACY_STORAGE_KEY}:${id}`,
		JSON.stringify({
			version: STORAGE_VERSION,
			...database,
		}),
	);
}

function clearLegacySnapshot() {
	if (!canUseLocalStorage()) return;

	localStorage.removeItem(`${LEGACY_STORAGE_KEY}:${accountId()}`);
}

class LocalKnowledgeStorageService {
	async read() {
		try {
			const indexedDbSnapshot = await readIndexedDbSnapshot();

			if (indexedDbSnapshot?.database) {
				return visibleSnapshot(indexedDbSnapshot.database);
			}
		} catch {
			// Fall back to the legacy storage path below.
		}

		const source = readLegacySnapshot();
		const legacySnapshot = source ? visibleSnapshot(source) : undefined;

		if (legacySnapshot) {
			try {
				await writeIndexedDbSnapshot(legacySnapshot as KnowledgeDatabase);
				clearLegacySnapshot();
			} catch {
				// Keeping the legacy snapshot is safer if migration fails.
			}
		}

		return legacySnapshot;
	}

	write(database: KnowledgeDatabase) {
		const id = accountId();
		void writeIndexedDbSnapshot(database)
			.then((written) => {
				if (!written) {
					writeLegacySnapshot(database, id);
				}
			})
			.catch(() => {
				writeLegacySnapshot(database, id);
			});
	}
}

export const localKnowledgeStorageService = new LocalKnowledgeStorageService();
