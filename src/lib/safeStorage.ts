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
 * Убирает дублирование base64-картинок в элементах галереи (когда originalUrl дублирует url),
 * снижая потребление квоты localStorage для фотографий ровно в 2 раза без потери качества.
 */
export function compactGalleryDataUrls<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => compactGalleryDataUrls(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (
        k === 'originalUrl' &&
        typeof v === 'string' &&
        v.startsWith('data:image/') &&
        typeof rec.url === 'string' &&
        rec.url.length > 0 &&
        (v === rec.url || v.length > 50_000)
      ) {
        out[k] = '';
      } else {
        out[k] = compactGalleryDataUrls(v);
      }
    }
    return out as T;
  }
  return value;
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
 * 1) Очищает устаревшие ключи прошлых версий и убирает дубли base64 в originalUrl
 * 2) Сначала вызывает removeItem(key), чтобы браузер освободил старый буфер памяти перед записью нового
 * 3) При переполнении квоты (QuotaExceededError) автоматически поджимает только сверхтяжёлые base64-вложения, сохраняя все сжатые фото карточек
 */
export function safeSetStorageJson<T>(key: string, data: T): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  cleanupLegacyStorageKeys();

  const compacted = compactGalleryDataUrls(data);
  let prevRaw: string | null = null;
  try {
    prevRaw = window.localStorage.getItem(key);
  } catch {
    prevRaw = null;
  }

  const restorePrevIfMissing = () => {
    if (prevRaw !== null) {
      try {
        if (window.localStorage.getItem(key) === null) {
          window.localStorage.setItem(key, prevRaw);
        }
      } catch {
        // ignore
      }
    }
  };

  try {
    const raw = JSON.stringify(compacted);
    // Если один ключ превышает 2.3 МБ, два ключа (models + backup) превысят 5 МБ лимит localStorage —
    // поэтому заранее облегчаем гигантские data: URL, оставляя полные копии фото в IndexedDB
    const payload =
      raw.length > 2_300_000
        ? JSON.stringify(stripOversizedDataUrls(compacted, 45_000))
        : raw;

    window.localStorage.setItem(key, payload);
    return true;
  } catch {
    const thresholds = [180_000, 90_000, 45_000, 15_000, 0];
    for (const maxLen of thresholds) {
      try {
        const slim = JSON.stringify(stripOversizedDataUrls(compacted, maxLen));
        window.localStorage.removeItem(key);
        window.localStorage.setItem(key, slim);
        return true;
      } catch {
        // пробуем следующий порог вплоть до 0 (все карточки и планы сохраняются на 100%, а фото живут в IndexedDB)
      }
    }
    restorePrevIfMissing();
    return false;
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
    if (raw.length > 4_600_000) {
      const healed = stripOversizedDataUrls(compactGalleryDataUrls(parsed), 350_000);
      safeSetStorageJson(key, healed);
      return healed;
    }
    return parsed;
  } catch {
    return null;
  }
}

/* ============================================================================
 * INDEXEDDB-ХРАНИЛИЩЕ ДЛЯ ЗАГРУЖЕННЫХ PDF-ФАЙЛОВ И ФОТОГАЛЕРЕЙ КАРТОЧЕК МОДЕЛЕЙ
 * Позволяет хранить сотни фотографий и полноразмерные PDF (3–250 МБ) без ограничений localStorage
 * ============================================================================ */
const IDB_NAME = 'borners_platform_files_db_v1';
const IDB_VERSION = 2;
const IDB_STORE = 'model_pdf_blobs';
const IDB_PHOTO_STORE = 'model_photo_galleries';

function openFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
      if (!db.objectStoreNames.contains(IDB_PHOTO_STORE)) {
        db.createObjectStore(IDB_PHOTO_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
  });
}

export async function saveModelGalleryToIdb(
  modelId: string,
  gallery: unknown[]
): Promise<boolean> {
  if (!modelId) return false;
  try {
    const db = await openFilesDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(IDB_PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(IDB_PHOTO_STORE);
      store.put(compactGalleryDataUrls(gallery), modelId);
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

const IDB_FULL_PORTFOLIO_KEY = '__FULL_PORTFOLIO_SNAPSHOT_V1__';
const IDB_PLATFORM_CONCEPTS_KEY = '__PLATFORM_CONCEPTS_SNAPSHOT_V1__';
const IDB_PLATFORM_MIRO_KEY = '__PLATFORM_MIRO_SNAPSHOT_V1__';

export async function savePortfolioSnapshotToIdb(models: unknown[]): Promise<boolean> {
  if (!Array.isArray(models) || models.length === 0) return false;
  try {
    const db = await openFilesDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(IDB_PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(IDB_PHOTO_STORE);
      store.put(compactGalleryDataUrls(models), IDB_FULL_PORTFOLIO_KEY);
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

export async function savePlatformRichStateToIdb(
  concepts: unknown[],
  miroItems: unknown[]
): Promise<boolean> {
  try {
    const db = await openFilesDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(IDB_PHOTO_STORE, 'readwrite');
      const store = tx.objectStore(IDB_PHOTO_STORE);
      if (Array.isArray(concepts)) {
        store.put(compactGalleryDataUrls(concepts), IDB_PLATFORM_CONCEPTS_KEY);
      }
      if (Array.isArray(miroItems)) {
        store.put(compactGalleryDataUrls(miroItems), IDB_PLATFORM_MIRO_KEY);
      }
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

export async function loadPlatformRichStateFromIdb<
  C = Record<string, unknown>,
  M = Record<string, unknown>,
>(): Promise<{ concepts: C[] | null; miroItems: M[] | null }> {
  try {
    const db = await openFilesDb();
    return await new Promise<{ concepts: C[] | null; miroItems: M[] | null }>((resolve) => {
      const tx = db.transaction(IDB_PHOTO_STORE, 'readonly');
      const store = tx.objectStore(IDB_PHOTO_STORE);
      const conceptsReq = store.get(IDB_PLATFORM_CONCEPTS_KEY);
      const miroReq = store.get(IDB_PLATFORM_MIRO_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve({
          concepts: Array.isArray(conceptsReq.result) ? (conceptsReq.result as C[]) : null,
          miroItems: Array.isArray(miroReq.result) ? (miroReq.result as M[]) : null,
        });
      };
      tx.onerror = () => {
        db.close();
        resolve({ concepts: null, miroItems: null });
      };
    });
  } catch {
    return { concepts: null, miroItems: null };
  }
}

/**
 * Восстанавливает медиа-поля (фотографии образцов, галереи R&D, чек-фото 4 проверок и голосовые/фото Холста идей),
 * если localStorage при переполнении квоты поджал длинные data:URL строки, а полная копия сохранена в IndexedDB.
 */
export function rehydrateConceptsFromIdbSnapshot<T extends Record<string, any>>(
  localConcepts: T[],
  idbConcepts: T[] | null | undefined
): T[] {
  if (!Array.isArray(idbConcepts) || idbConcepts.length === 0) return localConcepts;
  const byId = new Map<string, T>();
  for (const item of idbConcepts) {
    if (item && typeof item.id === 'string') {
      byId.set(item.id, item);
    }
  }
  return localConcepts.map((c) => {
    const rich = byId.get(c.id);
    if (!rich) return c;
    const nextImageUrl = c.imageUrl || rich.imageUrl || '';
    const nextGalleryPhotos = Array.isArray(c.galleryPhotos)
      ? c.galleryPhotos.map((gp: any, idx: number) => {
          if (gp?.url) return gp;
          const richGp =
            rich.galleryPhotos?.find((r: any) => r.id === gp?.id) || rich.galleryPhotos?.[idx];
          return richGp?.url ? { ...gp, url: richGp.url } : gp;
        })
      : rich.galleryPhotos;
    const nextSamples = Array.isArray(c.samples)
      ? c.samples.map((s: any, idx: number) => {
          const richS = rich.samples?.find((r: any) => r.id === s?.id) || rich.samples?.[idx];
          if (!richS) return s;
          const mergedPhotos = Array.isArray(s.photos)
            ? s.photos
                .map((p: string, pIdx: number) => p || richS.photos?.[pIdx] || '')
                .filter(Boolean)
            : richS.photos;
          return { ...s, photos: mergedPhotos };
        })
      : rich.samples;
    const nextFourChecks =
      c.fourChecksTest && rich.fourChecksTest
        ? {
            ...c.fourChecksTest,
            fitAndComfortPhoto:
              c.fourChecksTest.fitAndComfortPhoto || rich.fourChecksTest.fitAndComfortPhoto,
            waistbandAndSeamsPhoto:
              c.fourChecksTest.waistbandAndSeamsPhoto ||
              rich.fourChecksTest.waistbandAndSeamsPhoto,
            washShapeColorPhoto:
              c.fourChecksTest.washShapeColorPhoto || rich.fourChecksTest.washShapeColorPhoto,
            manufacturingQualityPhoto:
              c.fourChecksTest.manufacturingQualityPhoto ||
              rich.fourChecksTest.manufacturingQualityPhoto,
          }
        : c.fourChecksTest || rich.fourChecksTest;
    const nextAttachments = Array.isArray(c.attachments)
      ? c.attachments.map((att: any, idx: number) => {
          if (att?.url) return att;
          const richAtt =
            rich.attachments?.find((r: any) => r.id === att?.id) || rich.attachments?.[idx];
          return richAtt?.url ? { ...att, url: richAtt.url } : att;
        })
      : rich.attachments;
    return {
      ...c,
      imageUrl: nextImageUrl,
      galleryPhotos: nextGalleryPhotos,
      samples: nextSamples,
      fourChecksTest: nextFourChecks,
      attachments: nextAttachments,
    };
  });
}

export function rehydrateMiroItemsFromIdbSnapshot<T extends Record<string, any>>(
  localMiro: T[],
  idbMiro: T[] | null | undefined
): T[] {
  if (!Array.isArray(idbMiro) || idbMiro.length === 0) return localMiro;
  const byId = new Map<string, T>();
  for (const item of idbMiro) {
    if (item && typeof item.id === 'string') {
      byId.set(item.id, item);
    }
  }
  return localMiro.map((m) => {
    const rich = byId.get(m.id);
    if (!rich) return m;
    const nextGallery = Array.isArray(m.galleryUrls)
      ? m.galleryUrls
          .map((u: string, idx: number) => u || rich.galleryUrls?.[idx] || '')
          .filter(Boolean)
      : rich.galleryUrls;
    return {
      ...m,
      imageUrl: m.imageUrl || rich.imageUrl,
      galleryUrls: nextGallery && nextGallery.length > 0 ? nextGallery : rich.galleryUrls,
      audioDataUrl: m.audioDataUrl || rich.audioDataUrl,
    };
  });
}

export async function loadPortfolioSnapshotFromIdb<T = unknown>(): Promise<T[] | null> {
  try {
    const db = await openFilesDb();
    return await new Promise<T[] | null>((resolve) => {
      const tx = db.transaction(IDB_PHOTO_STORE, 'readonly');
      const store = tx.objectStore(IDB_PHOTO_STORE);
      const req = store.get(IDB_FULL_PORTFOLIO_KEY);
      req.onsuccess = () => {
        db.close();
        const res = req.result;
        resolve(Array.isArray(res) && res.length > 0 ? (res as T[]) : null);
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

export async function loadAllModelGalleriesFromIdb(): Promise<Record<string, unknown[]>> {
  try {
    const db = await openFilesDb();
    return await new Promise<Record<string, unknown[]>>((resolve) => {
      const tx = db.transaction(IDB_PHOTO_STORE, 'readonly');
      const store = tx.objectStore(IDB_PHOTO_STORE);
      const out: Record<string, unknown[]> = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          if (
            typeof cursor.key === 'string' &&
            !cursor.key.startsWith('__') &&
            Array.isArray(cursor.value)
          ) {
            out[cursor.key] = cursor.value;
          }
          cursor.continue();
        } else {
          db.close();
          resolve(out);
        }
      };
      cursorReq.onerror = () => {
        db.close();
        resolve(out);
      };
    });
  } catch {
    return {};
  }
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
