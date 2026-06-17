import type { KnowledgeDatabase } from "@/services/knowledge.service";

const DB_NAME = "supportos-local";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_ID = "knowledge";
const LEGACY_STORAGE_KEY = "supportos:knowledge:v1";
const STORAGE_VERSION = 1;

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
	if (!canUseIndexedDb()) return undefined;

	const database = await openDatabase();

	try {
		const transaction = database.transaction(STORE_NAME, "readonly");
		const store = transaction.objectStore(STORE_NAME);

		return await requestToPromise<KnowledgeSnapshotRecord | undefined>(
			store.get(SNAPSHOT_ID),
		);
	} finally {
		database.close();
	}
}

async function writeIndexedDbSnapshot(databaseSnapshot: KnowledgeDatabase) {
	if (!canUseIndexedDb()) return false;

	const database = await openDatabase();

	try {
		const transaction = database.transaction(STORE_NAME, "readwrite");
		const store = transaction.objectStore(STORE_NAME);
		const record: KnowledgeSnapshotRecord = {
			id: SNAPSHOT_ID,
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
		const raw = localStorage.getItem(LEGACY_STORAGE_KEY);

		return raw ? (JSON.parse(raw) as Partial<StoredKnowledge>) : undefined;
	} catch {
		return undefined;
	}
}

function writeLegacySnapshot(database: KnowledgeDatabase) {
	if (!canUseLocalStorage()) return;

	localStorage.setItem(
		LEGACY_STORAGE_KEY,
		JSON.stringify({
			version: STORAGE_VERSION,
			...database,
		}),
	);
}

function clearLegacySnapshot() {
	if (!canUseLocalStorage()) return;

	localStorage.removeItem(LEGACY_STORAGE_KEY);
}

class LocalKnowledgeStorageService {
	async read() {
		try {
			const indexedDbSnapshot = await readIndexedDbSnapshot();

			if (indexedDbSnapshot?.database) {
				return indexedDbSnapshot.database;
			}
		} catch {
			// Fall back to the legacy storage path below.
		}

		const legacySnapshot = readLegacySnapshot();

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
		void writeIndexedDbSnapshot(database)
			.then((written) => {
				if (!written) {
					writeLegacySnapshot(database);
				}
			})
			.catch(() => {
				writeLegacySnapshot(database);
			});
	}
}

export const localKnowledgeStorageService = new LocalKnowledgeStorageService();
