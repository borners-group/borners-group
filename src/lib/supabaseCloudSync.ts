import type { GrowthScenarioDef, ScenarioModelSpec } from './scenarioData.ts';
import { getActiveSupabaseClient } from './supabase.ts';

export const SUPABASE_PORTFOLIO_TABLE = 'borners_portfolio_kv';
export const SUPABASE_HISTORY_TABLE = 'borners_portfolio_history';
export const SUPABASE_CORE_KEY = 'portfolio_core_v1';
export const SUPABASE_GALLERY_KEY_PREFIX = 'photo_gallery:';
export const SUPABASE_WORKSPACE_KEY = 'platform_workspace_v1';
export const SUPABASE_CONCEPT_MEDIA_PREFIX = 'concept_media:';

export interface CloudPlatformWorkspacePayload {
  concepts: unknown[];
  miroItems?: unknown[];
  strategies?: unknown[];
  documents?: unknown[];
  launches?: unknown[];
  campaigns?: unknown[];
  deletedConceptIds?: string[];
  updatedAtIso: string;
}

export interface CloudPortfolioCorePayload {
  models: ScenarioModelSpec[];
  scenarios?: GrowthScenarioDef[];
  selectedScenarioByBrand?: Record<string, number | null>;
  includeGroupPortfolioInS1?: boolean;
  deletedModelIds?: string[];
  deletedScenarioIds?: number[];
  customBrands?: string[];
  financeContourParams?: unknown;
  productGroups?: unknown;
  investmentLedger?: unknown;
  updatedAtIso: string;
}

function isAutomatedOrLocalhostWriteBlocked(): boolean {
  if (
    typeof globalThis !== 'undefined' &&
    (globalThis as { __BORNERS_ALLOW_CLOUD_WRITE_IN_TEST__?: boolean })
      .__BORNERS_ALLOW_CLOUD_WRITE_IN_TEST__ === true
  ) {
    return false;
  }
  if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
    return true;
  }
  if (typeof window !== 'undefined' && window.location) {
    const host = (window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return true;
    }
  }
  return false;
}

const lastSyncedGalleryFingerprintByModelId = new Map<string, string>();
let latestCorePushSeq = 0;
let lastLocalCorePushIso = '';
let inFlightPortfolioPull: Promise<CloudPortfolioCorePayload | null> | null = null;

export function getLastLocalCorePushIso(): string {
  return lastLocalCorePushIso;
}

function readWindowStorageJsonSafe(key: string): unknown {
  if (typeof window === 'undefined' || !window.localStorage) return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

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
  if (isAutomatedOrLocalhostWriteBlocked()) return false;
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

function emitCloudSaveStatus(
  status: 'saving' | 'saved_cloud' | 'saved_local',
  atIso?: string
): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent('borners-cloud-save-status', {
          detail: { status, atIso: atIso || new Date().toISOString() },
        })
      );
    } catch {
      // Игнорируем в тестовых окружениях без полноценного DOM EventTarget
    }
  }
}

export async function pushPortfolioCoreToSupabase(
  input: Omit<CloudPortfolioCorePayload, 'updatedAtIso'>
): Promise<boolean> {
  if (isAutomatedOrLocalhostWriteBlocked()) {
    emitCloudSaveStatus('saved_local');
    return false;
  }
  const client = getActiveSupabaseClient();
  if (!client) {
    emitCloudSaveStatus('saved_local');
    return false;
  }

  const mySeq = ++latestCorePushSeq;
  emitCloudSaveStatus('saving');

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
    const nowIso = new Date().toISOString();
    const payload: CloudPortfolioCorePayload = {
      ...input,
      financeContourParams:
        input.financeContourParams !== undefined
          ? input.financeContourParams
          : readWindowStorageJsonSafe('borners_finance_contour_params_v1'),
      productGroups:
        input.productGroups !== undefined
          ? input.productGroups
          : readWindowStorageJsonSafe('borners_product_groups_v1'),
      investmentLedger:
        input.investmentLedger !== undefined
          ? input.investmentLedger
          : readWindowStorageJsonSafe('borners_investment_ledger_v1'),
      models: compactModels,
      updatedAtIso: nowIso,
    };
    lastLocalCorePushIso = nowIso;

    const { error } = await client.from(SUPABASE_PORTFOLIO_TABLE).upsert(
      {
        key: SUPABASE_CORE_KEY,
        payload,
        updated_at: payload.updatedAtIso,
      },
      { onConflict: 'key' }
    );
    emitCloudSaveStatus(!error ? 'saved_cloud' : 'saved_local', nowIso);
    return !error;
  } catch {
    emitCloudSaveStatus('saved_local');
    return false;
  }
}

export async function pullPortfolioFromSupabase(): Promise<CloudPortfolioCorePayload | null> {
  const client = getActiveSupabaseClient();
  if (!client) return null;
  if (inFlightPortfolioPull) return inFlightPortfolioPull;

  const task = (async (): Promise<CloudPortfolioCorePayload | null> => {
    try {
      const { data, error } = await client
        .from(SUPABASE_PORTFOLIO_TABLE)
        .select('key, payload, updated_at')
        .or(`key.eq.${SUPABASE_CORE_KEY},key.like.${SUPABASE_GALLERY_KEY_PREFIX}%`);

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
  })();

  inFlightPortfolioPull = task;
  try {
    return await task;
  } finally {
    if (inFlightPortfolioPull === task) {
      inFlightPortfolioPull = null;
    }
  }
}

const lastSyncedConceptMediaFingerprintById = new Map<string, string>();
let latestWorkspacePushSeq = 0;
let lastLocalWorkspacePushIso = '';
let inFlightWorkspacePull: Promise<CloudPlatformWorkspacePayload | null> | null = null;

export function getLastLocalWorkspacePushIso(): string {
  return lastLocalWorkspacePushIso;
}

export async function pushPlatformWorkspaceToSupabase(
  input: Omit<CloudPlatformWorkspacePayload, 'updatedAtIso'>
): Promise<boolean> {
  if (isAutomatedOrLocalhostWriteBlocked()) return false;
  const client = getActiveSupabaseClient();
  if (!client || !Array.isArray(input.concepts)) return false;

  const mySeq = ++latestWorkspacePushSeq;

  try {
    const compactConcepts: Record<string, unknown>[] = [];
    const mediaTasks: Promise<unknown>[] = [];

    for (const rawC of input.concepts) {
      if (!rawC || typeof rawC !== 'object') continue;
      const c = rawC as Record<string, unknown>;
      const cId = String(c.id || '').trim();
      const imageUrl = typeof c.imageUrl === 'string' ? c.imageUrl : '';
      const galleryPhotos = Array.isArray(c.galleryPhotos)
        ? (c.galleryPhotos as { id?: string; url?: string; caption?: string }[])
        : [];

      const hasBase64 =
        imageUrl.startsWith('data:image/') ||
        galleryPhotos.some((gp) => typeof gp?.url === 'string' && gp.url.startsWith('data:image/'));

      if (cId && hasBase64) {
        const fp = `${imageUrl.length}:${imageUrl.slice(0, 24)}|${galleryPhotos
          .map((g) => `${g?.id || ''}:${(g?.url || '').length}`)
          .join(',')}`;

        if (lastSyncedConceptMediaFingerprintById.get(cId) !== fp) {
          mediaTasks.push(
            Promise.resolve(
              client
                .from(SUPABASE_PORTFOLIO_TABLE)
                .upsert(
                  {
                    key: `${SUPABASE_CONCEPT_MEDIA_PREFIX}${cId}`,
                    payload: { id: cId, imageUrl, galleryPhotos },
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'key' }
                )
            ).then((res) => {
              if (!res.error) {
                lastSyncedConceptMediaFingerprintById.set(cId, fp);
              }
            })
          );
        }

        compactConcepts.push({
          ...c,
          imageUrl: imageUrl.startsWith('data:image/') ? '__SUPABASE_CONCEPT_MEDIA_REF__' : imageUrl,
          galleryPhotos: galleryPhotos.map((gp) => ({
            ...gp,
            url:
              typeof gp?.url === 'string' && gp.url.startsWith('data:image/')
                ? '__SUPABASE_CONCEPT_MEDIA_REF__'
                : gp?.url || '',
          })),
        });
      } else {
        compactConcepts.push(c);
      }
    }

    if (mediaTasks.length > 0) {
      await Promise.allSettled(mediaTasks);
    }

    if (mySeq < latestWorkspacePushSeq) return true;

    const compactMiro = Array.isArray(input.miroItems)
      ? input.miroItems.map((rawM) => {
          if (!rawM || typeof rawM !== 'object') return rawM;
          const m = rawM as Record<string, unknown>;
          const img = typeof m.imageUrl === 'string' ? m.imageUrl : '';
          if (img.startsWith('data:image/') && img.length > 90_000) {
            return { ...m, imageUrl: '' };
          }
          return m;
        })
      : undefined;

    const nowIso = new Date().toISOString();
    const payload: CloudPlatformWorkspacePayload = {
      ...input,
      concepts: compactConcepts,
      miroItems: compactMiro,
      updatedAtIso: nowIso,
    };
    lastLocalWorkspacePushIso = nowIso;

    const { error } = await client.from(SUPABASE_PORTFOLIO_TABLE).upsert(
      {
        key: SUPABASE_WORKSPACE_KEY,
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

export async function pullPlatformWorkspaceFromSupabase(): Promise<CloudPlatformWorkspacePayload | null> {
  const client = getActiveSupabaseClient();
  if (!client) return null;
  if (inFlightWorkspacePull) return inFlightWorkspacePull;

  const task = (async (): Promise<CloudPlatformWorkspacePayload | null> => {
    try {
      const { data, error } = await client
        .from(SUPABASE_PORTFOLIO_TABLE)
        .select('key, payload, updated_at')
        .or(`key.eq.${SUPABASE_WORKSPACE_KEY},key.like.${SUPABASE_CONCEPT_MEDIA_PREFIX}%`);

    if (error || !Array.isArray(data) || data.length === 0) return null;

    const wsRow = data.find((r) => r.key === SUPABASE_WORKSPACE_KEY);
    if (!wsRow || !wsRow.payload || typeof wsRow.payload !== 'object') return null;

    const ws = wsRow.payload as CloudPlatformWorkspacePayload;
    if (!Array.isArray(ws.concepts)) return null;

    const mediaMap = new Map<
      string,
      { imageUrl?: string; galleryPhotos?: { id?: string; url?: string; caption?: string }[] }
    >();
    for (const row of data) {
      if (
        typeof row.key === 'string' &&
        row.key.startsWith(SUPABASE_CONCEPT_MEDIA_PREFIX) &&
        row.payload &&
        typeof row.payload === 'object'
      ) {
        const cId = row.key.slice(SUPABASE_CONCEPT_MEDIA_PREFIX.length);
        mediaMap.set(cId, row.payload as { imageUrl?: string; galleryPhotos?: { id?: string; url?: string; caption?: string }[] });
      }
    }

    const hydratedConcepts = ws.concepts.map((rawC) => {
      if (!rawC || typeof rawC !== 'object') return rawC;
      const c = rawC as Record<string, unknown>;
      const cId = String(c.id || '').trim();
      const media = cId ? mediaMap.get(cId) : undefined;
      if (!media) return c;
      const nextImg =
        c.imageUrl === '__SUPABASE_CONCEPT_MEDIA_REF__' && media.imageUrl
          ? media.imageUrl
          : c.imageUrl;
      const nextGallery = Array.isArray(media.galleryPhotos) && media.galleryPhotos.length > 0
        ? media.galleryPhotos
        : c.galleryPhotos;
      return {
        ...c,
        imageUrl: nextImg,
        galleryPhotos: nextGallery,
      };
    });

    const rowUpdatedAt =
      typeof (wsRow as { updated_at?: string }).updated_at === 'string'
        ? (wsRow as { updated_at?: string }).updated_at
        : '';

      return {
        ...ws,
        concepts: hydratedConcepts,
        updatedAtIso: ws.updatedAtIso || rowUpdatedAt || '',
      };
    } catch {
      return null;
    }
  })();

  inFlightWorkspacePull = task;
  try {
    return await task;
  } finally {
    if (inFlightWorkspacePull === task) {
      inFlightWorkspacePull = null;
    }
  }
}

let realtimeSubSeq = 0;
const sharedKvListeners = new Set<(key: string, updatedAt: string) => void>();
let sharedRealtimeChannel: ReturnType<NonNullable<ReturnType<typeof getActiveSupabaseClient>>['channel']> | null = null;
let sharedRealtimeClient: ReturnType<typeof getActiveSupabaseClient> = null;

export function subscribeToSupabaseKvChanges(
  onKeyChanged: (key: string, updatedAt: string) => void
): () => void {
  const client = getActiveSupabaseClient();
  if (!client || typeof window === 'undefined') return () => {};

  sharedKvListeners.add(onKeyChanged);

  if (!sharedRealtimeChannel || sharedRealtimeClient !== client) {
    if (sharedRealtimeChannel && sharedRealtimeClient) {
      try {
        void sharedRealtimeClient.removeChannel(sharedRealtimeChannel);
      } catch {
        // ignore
      }
    }
    sharedRealtimeClient = client;
    const channelName = `borners-kv-sync-${++realtimeSubSeq}`;
    sharedRealtimeChannel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: SUPABASE_PORTFOLIO_TABLE,
        },
        (payload) => {
          const nextRow = (payload.new || {}) as { key?: string; updated_at?: string };
          if (typeof nextRow.key === 'string') {
            const keyStr = nextRow.key;
            const tsStr = typeof nextRow.updated_at === 'string' ? nextRow.updated_at : '';
            for (const listener of Array.from(sharedKvListeners)) {
              try {
                listener(keyStr, tsStr);
              } catch {
                // ignore listener error
              }
            }
          }
        }
      )
      .subscribe();
  }

  return () => {
    sharedKvListeners.delete(onKeyChanged);
    if (sharedKvListeners.size === 0 && sharedRealtimeChannel && sharedRealtimeClient) {
      const ch = sharedRealtimeChannel;
      const cl = sharedRealtimeClient;
      sharedRealtimeChannel = null;
      sharedRealtimeClient = null;
      try {
        void cl.removeChannel(ch);
      } catch {
        // ignore
      }
    }
  };
}

export async function pullPreviousCloudHistorySnapshot(): Promise<{
  id: number;
  recordedAt: string;
  models: ScenarioModelSpec[];
} | null> {
  const client = getActiveSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from(SUPABASE_HISTORY_TABLE)
      .select('id, recorded_at, payload')
      .eq('kv_key', SUPABASE_CORE_KEY)
      .order('recorded_at', { ascending: false })
      .limit(2);
    if (error || !Array.isArray(data) || data.length === 0) return null;
    // Если есть больше 1 записи — берём предыдущую (data[1]), иначе единственную (data[0])
    const target = data.length > 1 ? data[1] : data[0];
    const p = target?.payload as Partial<CloudPortfolioCorePayload> | undefined;
    if (!p || !Array.isArray(p.models) || p.models.length === 0) return null;
    return {
      id: Number(target.id) || 0,
      recordedAt: String(target.recorded_at || ''),
      models: p.models,
    };
  } catch {
    return null;
  }
}
