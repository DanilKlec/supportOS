import type { Bind, BindInput, Category, Preferences } from '#/types/bind'

const DB_NAME = 'supportos'
const DB_VERSION = 1
const MAX_RECENT = 20

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('binds')) {
        const store = db.createObjectStore('binds', { keyPath: 'id' })
        store.createIndex('categoryId', 'categoryId')
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains('preferences')) {
        db.createObjectStore('preferences', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const store = transaction.objectStore(storeName)
        const request = fn(store)
        transaction.oncomplete = () => {
          if (request) {
            resolve(request.result)
          } else {
            resolve()
          }
        }
        transaction.onerror = () => reject(transaction.error)
      }),
  )
}

function getAll<T>(storeName: string): Promise<T[]> {
  return tx<T[]>(storeName, 'readonly', (store) => store.getAll()) as Promise<T[]>
}

function put<T>(storeName: string, item: T): Promise<void> {
  return tx(storeName, 'readwrite', (store) => store.put(item)) as Promise<void>
}

function remove(storeName: string, id: string): Promise<void> {
  return tx(storeName, 'readwrite', (store) => store.delete(id)) as Promise<void>
}

export function isClient(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

export async function getCategories(): Promise<Category[]> {
  const items = await getAll<Category>('categories')
  return items.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function getBinds(): Promise<Bind[]> {
  const items = await getAll<Bind>('binds')
  return items.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getBind(id: string): Promise<Bind | undefined> {
  return tx<Bind | undefined>('binds', 'readonly', (store) => store.get(id)) as Promise<
    Bind | undefined
  >
}

export async function createBind(input: BindInput): Promise<Bind> {
  const now = Date.now()
  const bind: Bind = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  }
  await put('binds', bind)
  return bind
}

export async function updateBind(id: string, patch: Partial<BindInput>): Promise<Bind> {
  const existing = await getBind(id)
  if (!existing) throw new Error('Bind not found')
  const updated: Bind = { ...existing, ...patch, updatedAt: Date.now() }
  await put('binds', updated)
  return updated
}

export async function deleteBind(id: string): Promise<void> {
  await remove('binds', id)
  const prefs = await getPreferences()
  prefs.favoriteIds = prefs.favoriteIds.filter((fid) => fid !== id)
  prefs.recentIds = prefs.recentIds.filter((rid) => rid !== id)
  await put('preferences', prefs)
}

export async function createCategory(name: string): Promise<Category> {
  const categories = await getCategories()
  const category: Category = {
    id: crypto.randomUUID(),
    name,
    sortOrder: categories.length,
  }
  await put('categories', category)
  return category
}

const defaultPreferences = (): Preferences => ({
  id: 'prefs',
  favoriteIds: [],
  recentIds: [],
  theme: 'dark',
  selectedLanguage: 'ru',
  enabledLanguages: ['ru', 'en', 'de', 'pt', 'el'],
})

export async function getPreferences(): Promise<Preferences> {
  const result = await tx<Preferences | undefined>('preferences', 'readonly', (store) =>
    store.get('prefs'),
  )
  return result ?? defaultPreferences()
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await put('preferences', prefs)
}

export async function setSelectedLanguage(language: Preferences['selectedLanguage']): Promise<void> {
  const prefs = await getPreferences()
  prefs.selectedLanguage = language
  await put('preferences', prefs)
}

export async function toggleFavorite(bindId: string): Promise<boolean> {
  const prefs = await getPreferences()
  const isFavorite = prefs.favoriteIds.includes(bindId)
  prefs.favoriteIds = isFavorite
    ? prefs.favoriteIds.filter((id) => id !== bindId)
    : [...prefs.favoriteIds, bindId]
  await put('preferences', prefs)
  return !isFavorite
}

export async function trackRecent(bindId: string): Promise<void> {
  const prefs = await getPreferences()
  prefs.recentIds = [bindId, ...prefs.recentIds.filter((id) => id !== bindId)].slice(
    0,
    MAX_RECENT,
  )
  await put('preferences', prefs)
}

export async function setTheme(theme: Preferences['theme']): Promise<void> {
  const prefs = await getPreferences()
  prefs.theme = theme
  await put('preferences', prefs)
  localStorage.setItem('supportos-theme', theme)
}

export async function isDatabaseEmpty(): Promise<boolean> {
  const binds = await getAll<Bind>('binds')
  return binds.length === 0
}

export async function seedDatabase(
  categories: Category[],
  binds: Bind[],
  prefs?: Partial<Preferences>,
): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      ['categories', 'binds', 'preferences'],
      'readwrite',
    )
    const catStore = transaction.objectStore('categories')
    const bindStore = transaction.objectStore('binds')
    const prefStore = transaction.objectStore('preferences')

    for (const cat of categories) catStore.put(cat)
    for (const bind of binds) bindStore.put(bind)
    prefStore.put({ ...defaultPreferences(), ...prefs, id: 'prefs' })

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
