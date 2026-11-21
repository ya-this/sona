const DB_NAME = 'sona_offline_audio_v1';
const STORE_NAME = 'audio_blobs';

interface StoredAudioRecord {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  savedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен в этом окружении'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть локальное хранилище'));
  });
}

export async function saveLocalAudioFile(key: string, file: File): Promise<{ sizeMb: number }> {
  const db = await openDb();
  const record: StoredAudioRecord = {
    key,
    fileName: file.name,
    mimeType: file.type || 'audio/mpeg',
    sizeBytes: file.size,
    blob: file,
    savedAt: new Date().toISOString(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Ошибка сохранения аудиофайла'));
  });
  db.close();

  return { sizeMb: Number((file.size / (1024 * 1024)).toFixed(2)) };
}

export async function loadLocalAudioUrl(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const record = await new Promise<StoredAudioRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as StoredAudioRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record?.blob) return null;
    return URL.createObjectURL(record.blob);
  } catch {
    return null;
  }
}

export async function deleteLocalAudioFile(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore storage cleanup errors in restricted modes
  }
}

export async function getOfflineStorageStats(): Promise<{ files: number; totalMb: number }> {
  try {
    const db = await openDb();
    const all = await new Promise<StoredAudioRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve((req.result as StoredAudioRecord[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const totalBytes = all.reduce((acc, item) => acc + (item.sizeBytes || 0), 0);
    return {
      files: all.length,
      totalMb: Number((totalBytes / (1024 * 1024)).toFixed(2)),
    };
  } catch {
    return { files: 0, totalMb: 0 };
  }
}
