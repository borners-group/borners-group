import type { GrowthScenarioDef, ScenarioModelSpec } from './scenarioData.ts';
import { getActiveSupabaseClient } from './supabase.ts';

export const SUPABASE_PORTFOLIO_TABLE = 'borners_portfolio_kv';
export const SUPABASE_CORE_KEY = 'portfolio_core_v1';
export const SUPABASE_GALLERY_KEY_PREFIX = 'photo_gallery:';

export interface CloudPortfolioCorePayload {
  models: ScenarioModelSpec[];
  scenarios?: GrowthScenarioDef[];
  selectedScenarioByBrand?: Record<string, number | null>;
  includeGroupPortfolioInS1?: boolean;
  deletedModelIds?: string[];
  deletedScenarioIds?: number[];
  customBrands?: string[];
  updatedAtIso: string;
}

const lastSyncedGalleryFingerprintByModelId = new Map<string, string>();
let latestCorePushSeq = 0;

function computeGalleryFingerprint(gallery: ScenarioModelSpec['gallery'] | undefined): string {
  if (!Array.isArray(gallery) || gallery.length === 0) return 'EMPTY';
  return gallery
    .map((g) => {
      const u = typeof g?.url === 'string' ? g.url : '';
      return `${g?.id || ''}:${u.length}:${u.slice(0, 28)}:${u.slice(-16)}:${g?.isMain ? 1 : 0}`;
    })
    .join('|');
}

function stripBase64FromModelForCoreRow(
  model: ScenarioModelSpec,
  failedUploadModelIds?: Set<string>
): ScenarioModelSpec {
  if (!Array.isArray(model.gallery) || model.gallery.length === 0) {
    return model;
  }
  const hasBase64 = model.gallery.some(
    (g) =>
      (typeof g.url === 'string' && g.url.startsWith('data:image/')) ||
      (typeof g.originalUrl === 'string' && g.originalUrl.startsWith('data:image/'))
  );
  if (!hasBase64) return model;

  const uploadFailed = Boolean(failedUploadModelIds?.has(model.id));
  const hasPriorCloudGallery =
    lastSyncedGalleryFingerprintByModelId.has(model.id) &&
    lastSyncedGalleryFingerprintByModelId.get(model.id) !== 'EMPTY';

  if (uploadFailed && !hasPriorCloudGallery) {
    return {
      ...model,
      gallery: model.gallery
        .map((g) => ({
          ...g,
          url:
            typeof g.url === 'string' &&
            g.url.startsWith('data:image/') &&
            g.url.length > 64_000
              ? ''
              : g.url,
          originalUrl:
            typeof g.originalUrl === 'string' && g.originalUrl.startsWith('data:image/')
              ? ''
              : g.originalUrl,
        }))
        .filter((g) => Boolean(g.url)),
    };
  }

  return {
    ...model,
    gallery: model.gallery.map((g) => ({
      ...g,
      url:
        typeof g.url === 'string' && g.url.startsWith('data:image/')
          ? '__SUPABASE_GALLERY_REF__'
          : g.url,
      originalUrl:
        typeof g.originalUrl === 'string' && g.originalUrl.startsWith('data:image/')
          ? ''
          : g.originalUrl,
    })),
  };
}

export async function pushModelGalleryToSupabase(
  modelId: string,
  gallery: ScenarioModelSpec['gallery']
): Promise<boolean> {
  const client = getActiveSupabaseClient();
  if (!client || !modelId || !Array.isArray(gallery)) return false;

  const nextFp = computeGalleryFingerprint(gallery);

  if (gallery.length === 0) {
    try {
      const { error } = await client.from(SUPABASE_PORTFOLIO_TABLE).upsert(
        {
          key: `${SUPABASE_GALLERY_KEY_PREFIX}${modelId}`,
          payload: { modelId, gallery: [] },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
      if (!error) {
        lastSyncedGalleryFingerprintByModelId.set(modelId, nextFp);
      }
      return !error;
    } catch {
      return false;
    }
  }

  const hasDataImage = gallery.some(
    (g) =>
      (typeof g.url === 'string' && g.url.startsWith('data:image/')) ||
      (typeof g.originalUrl === 'string' && g.originalUrl.startsWith('data:image/'))
  );
  if (!hasDataImage) {
    if (
      lastSyncedGalleryFingerprintByModelId.has(modelId) &&
      lastSyncedGalleryFingerprintByModelId.get(modelId) !== 'EMPTY'
    ) {
      try {
        const { error } = await client.from(SUPABASE_PORTFOLIO_TABLE).upsert(
          {
            key: `${SUPABASE_GALLERY_KEY_PREFIX}${modelId}`,
            payload: { modelId, gallery: [], items: [] },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );
        if (!error) {
          lastSyncedGalleryFingerprintByModelId.set(modelId, 'EMPTY');
        }
        return !error;
      } catch {
        return false;
      }
    }
    return false;
  }

  if (lastSyncedGalleryFingerprintByModelId.get(modelId) === nextFp) {
    return true;
  }

  const cleanGallery = gallery.map((g) => ({
    ...g,
    originalUrl:
      typeof g.originalUrl === 'string' &&
      g.originalUrl.startsWith('data:image/') &&
      g.url
        ? ''
        : g.originalUrl,
  }));

  try {
    const { error } = await client.from(SUPABASE_PORTFOLIO_TABLE).upsert(
      {
        key: `${SUPABASE_GALLERY_KEY_PREFIX}${modelId}`,
        payload: { modelId, gallery: cleanGallery },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    if (!error) {
      lastSyncedGalleryFingerprintByModelId.set(modelId, nextFp);
    }
    return !error;
  } catch {
    return false;
  }
}

export async function pushPortfolioCoreToSupabase(
  input: Omit<CloudPortfolioCorePayload, 'updatedAtIso'>
): Promise<boolean> {
  const client = getActiveSupabaseClient();
  if (!client) return false;

  const mySeq = ++latestCorePushSeq;

  try {
    // Синхронизируем только те base64-фотогалереи, чей слепок реально изменился (O(1) для неизменённых SKU)
    const galleryTasks: { modelId: string; promise: Promise<boolean> }[] = [];
    const failedUploadModelIds = new Set<string>();
    for (const m of input.models) {
      if (
        Array.isArray(m.gallery) &&
        m.gallery.some(
          (g) => typeof g.url === 'string' && g.url.startsWith('data:image/')
        )
      ) {
        const fp = computeGalleryFingerprint(m.gallery);
        if (lastSyncedGalleryFingerprintByModelId.get(m.id) !== fp) {
          galleryTasks.push({
            modelId: m.id,
            promise: pushModelGalleryToSupabase(m.id, m.gallery),
          });
        }
      } else if (
        Array.isArray(m.gallery) &&
        lastSyncedGalleryFingerprintByModelId.has(m.id) &&
        lastSyncedGalleryFingerprintByModelId.get(m.id) !== 'EMPTY'
      ) {
        galleryTasks.push({
          modelId: m.id,
          promise: pushModelGalleryToSupabase(m.id, m.gallery),
        });
      }
    }
    if (galleryTasks.length > 0) {
      const results = await Promise.allSettled(galleryTasks.map((t) => t.promise));
      results.forEach((res, idx) => {
        const ok = res.status === 'fulfilled' && res.value === true;
        if (!ok) {
          failedUploadModelIds.add(galleryTasks[idx].modelId);
        }
      });
    }

    // Защита от гонки: если пока шли сетевые запросы пользователь ввёл более свежее значение — не затираем новым старое
    if (mySeq < latestCorePushSeq) {
      return true;
    }

    const compactModels = input.models.map((m) =>
      stripBase64FromModelForCoreRow(m, failedUploadModelIds)
    );
    const payload: CloudPortfolioCorePayload = {
      ...input,
      models: compactModels,
      updatedAtIso: new Date().toISOString(),
    };

    const { error } = await client.from(SUPABASE_PORTFOLIO_TABLE).upsert(
      {
        key: SUPABASE_CORE_KEY,
        payload,
        updated_at: payload.updatedAtIso,
      },
      { onConflict: 'key' }
    );
    return !error;
  } catch {
    return false;
  }
}

export async function pullPortfolioFromSupabase(): Promise<CloudPortfolioCorePayload | null> {
  const client = getActiveSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from(SUPABASE_PORTFOLIO_TABLE)
      .select('key, payload, updated_at');

    if (error || !Array.isArray(data) || data.length === 0) {
      return null;
    }

    const coreRow = data.find((r) => r.key === SUPABASE_CORE_KEY);
    if (!coreRow || !coreRow.payload || typeof coreRow.payload !== 'object') {
      return null;
    }

    const core = coreRow.payload as CloudPortfolioCorePayload;
    if (!Array.isArray(core.models) || core.models.length === 0) {
      return null;
    }

    const galleriesByModelId = new Map<string, ScenarioModelSpec['gallery']>();
    for (const row of data) {
      if (
        typeof row.key === 'string' &&
        row.key.startsWith(SUPABASE_GALLERY_KEY_PREFIX) &&
        row.payload &&
        typeof row.payload === 'object'
      ) {
        const modelId = row.key.slice(SUPABASE_GALLERY_KEY_PREFIX.length);
        const gal = (row.payload as { gallery?: ScenarioModelSpec['gallery'] }).gallery;
        if (modelId && Array.isArray(gal)) {
          galleriesByModelId.set(modelId, gal);
        }
      }
    }

    const hydratedModels = core.models.map((m) => {
      const hasGalleryRef =
        Array.isArray(m.gallery) &&
        m.gallery.some((g) => g?.url === '__SUPABASE_GALLERY_REF__');
      const cloudGal = galleriesByModelId.get(m.id);
      if (cloudGal && cloudGal.length > 0 && (hasGalleryRef || !Array.isArray(m.gallery))) {
        lastSyncedGalleryFingerprintByModelId.set(m.id, computeGalleryFingerprint(cloudGal));
        return {
          ...m,
          gallery: cloudGal,
        };
      }
      if (cloudGal && cloudGal.length === 0) {
        lastSyncedGalleryFingerprintByModelId.set(m.id, 'EMPTY');
        return {
          ...m,
          gallery: [],
        };
      }
      if (hasGalleryRef) {
        return {
          ...m,
          gallery: m.gallery.filter((g) => g.url !== '__SUPABASE_GALLERY_REF__'),
        };
      }
      return m;
    });

    const rowUpdatedAt =
      typeof (coreRow as { updated_at?: string }).updated_at === 'string'
        ? (coreRow as { updated_at?: string }).updated_at
        : '';

    return {
      ...core,
      updatedAtIso: core.updatedAtIso || rowUpdatedAt || '',
      models: hydratedModels,
    };
  } catch {
    return null;
  }
}
