import { createStore, del, get, keys, set } from 'idb-keyval';

/** Files the layers are made from (GeoJSON, rendered GeoPDF pages), kept in IndexedDB. */
const db = createStore('webmap', 'files');

/** Stores a file under a new key, which it returns. */
export async function storeFile(blob: Blob): Promise<string> {
  const key = crypto.randomUUID();
  await putFile(key, blob);
  return key;
}

/** Stores a file under a key it already has, as in a project being opened. */
export async function putFile(key: string, blob: Blob): Promise<void> {
  await set(key, blob, db);
  requestPersistentStorage();
}

export async function loadFile(key: string): Promise<Blob> {
  const blob = await get<Blob>(key, db);
  if (!(blob instanceof Blob)) throw new Error('The file is no longer stored in this browser.');
  return blob;
}

export function deleteFile(key: string): Promise<void> {
  return del(key, db);
}

/** Deletes stored files that no layer refers to, left behind by an interrupted session. */
export async function collectFiles(referenced: ReadonlySet<string>): Promise<void> {
  for (const key of await keys(db)) {
    if (typeof key === 'string' && !referenced.has(key)) await del(key, db);
  }
}

/** Asks the browser not to evict stored files under storage pressure. */
function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => {});
}
