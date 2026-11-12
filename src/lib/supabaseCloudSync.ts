import type { GrowthScenarioDef, ScenarioModelSpec } from './scenarioData.ts';
import { getActiveSupabaseClient } from './supabase.ts';

export const SUPABASE_PORTFOLIO_TABLE = 'borners_portfolio_kv';
export const SUPABASE_CORE_KEY = 'portfolio_core_v1';
export const SUPABASE_GALLERY_KEY_PREFIX = 'photo_gallery:';

export interface CloudPortfolioCorePayload {
  models: ScenarioModelSpec[];
  scenarios?: GrowthScenarioDef[];
  selectedScenarioByBrand?: Record<string, number>;
  customBrands?: string[];
  updatedAtIso: string;
}

function stripBase64FromModelForCoreRow(model: ScenarioModelSpec): ScenarioModelSpec {
  if (!Array.isArray(model.gallery) || model.gallery.length === 0) {
    return model;
  }
  const hasBase64 = model.gallery.some(
    (g) =>
      (typeof g.url === 'string' && g.url.startsWith('data:image/')) ||
      (typeof g.originalUrl === 'string' && g.originalUrl.startsWith('data:image/'))
  );
  if (!hasBase64) return model;

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
  if (!hasDataImage) return false;

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

  try {
    // Сначала сохраняем base64-фотогалереи в отдельные ключи photo_gallery:<modelId>
    const galleryPromises: Promise<boolean>[] = [];
    for (const m of input.models) {
      if (
        Array.isArray(m.gallery) &&
        m.gallery.some(
          (g) => typeof g.url === 'string' && g.url.startsWith('data:image/')
        )
      ) {
        galleryPromises.push(pushModelGalleryToSupabase(m.id, m.gallery));
      }
    }
    if (galleryPromises.length > 0) {
      await Promise.allSettled(galleryPromises);
    }

    const compactModels = input.models.map(stripBase64FromModelForCoreRow);
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
        if (modelId && Array.isArray(gal) && gal.length > 0) {
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
        return {
          ...m,
          gallery: cloudGal,
        };
      }
      // Очищаем маркер __SUPABASE_GALLERY_REF__, если отдельной строки не нашлось
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
