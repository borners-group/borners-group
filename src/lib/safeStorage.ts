'use client';

const LEGACY_KEYS_TO_REMOVE = [
  'borners_group_platform_state_ru_v1',
  'borners_group_platform_state_ru_v2',
  'borners_group_platform_state_ru_v3',
  'borners_group_platform_state_ru_v4',
  'borners_group_platform_state_ru_v5',
  'borners_group_platform_state_ru_v6',
  'borners_group_platform_state_ru_v7',
  'borners_group_platform_state_ru_v8',
  'borners_strategy_platform_v1',
  'borners_strategy_platform_v2',
  'borners_strategy_platform_v3',
  'borners_strategy_platform_v4',
  'borners_strategy_platform_v5',
];

let legacyCleaned = false;

export function cleanupLegacyStorageKeys(): void {
  if (typeof window === 'undefined' || legacyCleaned) return;
  legacyCleaned = true;
  try {
    for (const k of LEGACY_KEYS_TO_REMOVE) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

/**
 * Рекурсивно уменьшает только экстремально тяжёлые base64-строки (неcжатые фото/аудио > 650 КБ),
 * чтобы JSON гарантированно помещался в квоту localStorage (5 МБ) и никогда не подменял фото чужой заглушкой.
 */
export function stripOversizedDataUrls<T>(value: T, maxDataUrlLen = 650_000): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:image/') && value.length > maxDataUrlLen) {
      return '' as unknown as T;
    }
    if (value.startsWith('data:audio/') && value.length > maxDataUrlLen) {
      return '' as unknown as T;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripOversizedDataUrls(item, maxDataUrlLen)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripOversizedDataUrls(v, maxDataUrlLen);
    }
    return out as T;
  }
  return value;
}

/**
 * Надёжное сохранение в localStorage:
 * 1) Очищает устаревшие ключи прошлых версий
 * 2) Сначала вызывает removeItem(key), чтобы браузер освободил старый буфер памяти перед записью нового
 * 3) При переполнении квоты (QuotaExceededError) автоматически поджимает тяжёлые base64-вложения и повторяет запись
 */
export function safeSetStorageJson<T>(key: string, data: T): boolean {
  if (typeof window === 'undefined') return false;
  cleanupLegacyStorageKeys();

  try {
    const raw = JSON.stringify(data);
    // Облегчаем только если общий размер ключа превышает 4.2 МБ
    const payload =
      raw.length > 4_200_000
        ? JSON.stringify(stripOversizedDataUrls(data, 350_000))
        : raw;

    window.localStorage.removeItem(key);
    window.localStorage.setItem(key, payload);
    return true;
  } catch {
    try {
      // Экстренный фоллбэк: убираем только сверхтяжёлые data: URL (> 180 КБ), сохраняя сжатые превью
      const slim = stripOversizedDataUrls(data, 180_000);
      window.localStorage.removeItem(key);
      window.localStorage.setItem(key, JSON.stringify(slim));
      return true;
    } catch {
      try {
        const ultraSlim = stripOversizedDataUrls(data, 45_000);
        window.localStorage.removeItem(key);
        window.localStorage.setItem(key, JSON.stringify(ultraSlim));
        return true;
      } catch (err3) {
        console.error(`safeSetStorageJson failed for key "${key}":`, err3);
        return false;
      }
    }
  }
}

/**
 * Надёжное чтение из localStorage с автоматическим лечением переполненных записей.
 */
export function safeGetStorageJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  cleanupLegacyStorageKeys();

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    if (raw.length > 4_500_000) {
      const healed = stripOversizedDataUrls(parsed, 350_000);
      safeSetStorageJson(key, healed);
      return healed;
    }
    return parsed;
  } catch {
    return null;
  }
}

/* ============================================================================
 * INDEXEDDB-ХРАНИЛИЩЕ ДЛЯ ЗАГРУЖЕННЫХ PDF-ФАЙЛОВ КАРТОЧЕК МОДЕЛЕЙ
 * Позволяет прикреплять к карточкам полноразмерные PDF (3–25 МБ) без переполнения localStorage
 * ============================================================================ */
const IDB_NAME = 'borners_platform_files_db_v1';
const IDB_STORE = 'model_pdf_blobs';

function openFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
  });
}

export async function savePdfBlobToIdb(pdfId: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openFilesDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(blob, pdfId);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

export async function loadPdfBlobUrlFromIdb(pdfId: string): Promise<string | null> {
  try {
    const db = await openFilesDb();
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(pdfId);
      req.onsuccess = () => {
        db.close();
        const result = req.result;
        if (result instanceof Blob) {
          resolve(URL.createObjectURL(result));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function deletePdfBlobFromIdb(pdfId: string): Promise<void> {
  try {
    const db = await openFilesDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(pdfId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // ignore
  }
}
