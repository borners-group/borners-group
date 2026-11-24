import type { GrowthScenarioDef, ScenarioModelSpec } from './scenarioData.ts';
import type {
  ActualMonthSaleRecord,
  ApprovedPurchaseOrder,
  ModelAuditEntry,
  SharedSkuSupplyAndFact,
} from './unifiedBusinessEngine.ts';
import type {
  BatchTermsManualOverride,
  CapitalInjectionRecord,
  CustomCashOperationRecord,
  InvestmentLedgerAuditEntry,
  InvestmentLedgerState,
  ManualPaymentOverride,
  ScenarioManualLedgerPlan,
} from './investmentScheduleEngine.ts';
import { mergeCloudPortfolioSnapshot } from './portfolioPersistence.ts';
import {
  LOCAL_GALLERY_IDB_REF,
  SUPABASE_GALLERY_REF,
  isGalleryPlaceholderSentinel,
} from './safeStorage.ts';
import { getActiveSupabaseClient } from './supabase.ts';

export const SUPABASE_PORTFOLIO_TABLE = 'borners_portfolio_kv';
export const SUPABASE_HISTORY_TABLE = 'borners_portfolio_history';
export const SUPABASE_CORE_KEY = 'portfolio_core_v1';
export const SUPABASE_GALLERY_KEY_PREFIX = 'photo_gallery:';
export const SUPABASE_WORKSPACE_KEY = 'platform_workspace_v1';
export const SUPABASE_CONCEPT_MEDIA_PREFIX = 'concept_media:';

export type CloudSaveStatus =
  | 'saving'
  | 'saved_cloud'
  | 'saved_local'
  | 'conflict_merged';

export interface CloudPushOptions {
  expectedRevision?: number | null;
  maxConflictRetries?: number;
}

export interface CloudPlatformWorkspacePayload {
  concepts: unknown[];
  miroItems?: unknown[];
  strategies?: unknown[];
  documents?: unknown[];
  launches?: unknown[];
  campaigns?: unknown[];
  deletedConceptIds?: string[];
  updatedAtIso: string;
  serverRevision?: number;
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
  serverRevision?: number;
}

export interface CloudConflictEventDetail {
  key: string;
  mergedAtIso: string;
  previousRevision: number | null;
  serverRevision: number;
  mergedPayload: CloudPortfolioCorePayload | CloudPlatformWorkspacePayload;
}

interface SafeUpsertRpcResponse {
  ok?: boolean;
  conflict?: boolean;
  server_revision?: number | string | null;
  server_updated_at?: string | null;
  server_payload?: unknown;
}

interface SupabaseKvRow {
  key: string;
  payload: unknown;
  updated_at?: string;
  revision?: number | string | null;
}

const ASYMMETRIC_OLDER_SENTINEL_ISO = '1970-01-01T00:00:00.000Z';

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

function parseRevisionNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function parseIsoTs(iso: unknown): number {
  if (typeof iso !== 'string' || !iso.trim()) return NaN;
  return Date.parse(iso);
}

function isMissingRpcError(
  error: { code?: string; message?: string; status?: number; details?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883' || error.status === 404) {
    return true;
  }
  const msg = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return (
    msg.includes('upsert_portfolio_kv_safe') &&
    (msg.includes('could not find the function') || msg.includes('does not exist'))
  );
}

function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
  columnName: string
): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  const msg = (error.message || '').toLowerCase();
  return msg.includes(columnName.toLowerCase()) && msg.includes('does not exist');
}

const lastSyncedGalleryFingerprintByModelId = new Map<string, string>();
const explicitlyDeletedGalleryModelIds = new Set<string>();
let lastKnownCloudUpdatedAtIso = '';
let latestCorePushSeq = 0;
let lastLocalCorePushIso = '';
let lastLocalCorePushRevision: number | null = null;
let corePushInFlight: Promise<boolean> | null = null;
let corePushExpectedNextRev: number | null = null;
let queuedCorePush: {
  input: Omit<CloudPortfolioCorePayload, 'updatedAtIso'>;
  options?: CloudPushOptions;
  resolvers: Array<(ok: boolean) => void>;
} | null = null;
let inFlightPortfolioPull: Promise<CloudPortfolioCorePayload | null> | null = null;
let lastKnownCoreRevision: number | null = null;
let lastKnownWorkspaceRevision: number | null = null;
let lastCloudConflictEvent: CloudConflictEventDetail | null = null;

export function getLastLocalCorePushIso(): string {
  return lastLocalCorePushIso;
}

export function getLastKnownCoreRevision(): number | null {
  return lastKnownCoreRevision;
}

export function setLastKnownCoreRevision(rev: number | null): void {
  lastKnownCoreRevision = rev === null ? null : parseRevisionNumber(rev);
  if (rev === null) {
    lastLocalCorePushRevision = null;
    lastLocalCorePushIso = '';
    lastKnownCloudUpdatedAtIso = '';
    explicitlyDeletedGalleryModelIds.clear();
  }
}

export function resetGallerySyncTrackingForTest(): void {
  lastSyncedGalleryFingerprintByModelId.clear();
  explicitlyDeletedGalleryModelIds.clear();
  lastKnownCloudUpdatedAtIso = '';
}

function computeMonotonicCloudPushIso(floorIso?: string): string {
  const nowMs = Date.now();
  const knownCloudMs = parseIsoTs(lastKnownCloudUpdatedAtIso);
  const floorMs = parseIsoTs(floorIso);
  const maxFloor = Math.max(
    Number.isFinite(knownCloudMs) ? knownCloudMs : 0,
    Number.isFinite(floorMs) ? floorMs : 0
  );
  const nextMs = maxFloor >= nowMs ? maxFloor + 1 : nowMs;
  return new Date(nextMs).toISOString();
}

export function getLastKnownWorkspaceRevision(): number | null {
  return lastKnownWorkspaceRevision;
}

export function setLastKnownWorkspaceRevision(rev: number | null): void {
  lastKnownWorkspaceRevision = rev === null ? null : parseRevisionNumber(rev);
  if (rev === null) {
    lastLocalWorkspacePushRevision = null;
    lastLocalWorkspacePushIso = '';
  }
}

export function getLastCloudConflictEvent(): CloudConflictEventDetail | null {
  return lastCloudConflictEvent;
}

/**
 * Надёжно распознаёт эхо собственного сохранения в Supabase Realtime,
 * даже если Postgres вернул timestamptz с микросекундами/+00:00 или событие пришло
 * до завершения HTTP-ответа RPC `upsert_portfolio_kv_safe`.
 */
export function isLocalCloudPushEcho(
  key: string,
  updatedAt?: string | null,
  revision?: number | string | null
): boolean {
  const revNum = parseRevisionNumber(revision);
  const tsMs = parseIsoTs(updatedAt);

  if (key === SUPABASE_CORE_KEY) {
    if (
      revNum !== null &&
      lastLocalCorePushRevision !== null &&
      revNum <= lastLocalCorePushRevision
    ) {
      return true;
    }
    if (
      corePushInFlight !== null &&
      revNum !== null &&
      corePushExpectedNextRev !== null &&
      revNum === corePushExpectedNextRev
    ) {
      return true;
    }
    if (updatedAt && lastLocalCorePushIso) {
      if (updatedAt === lastLocalCorePushIso) return true;
      const lastMs = parseIsoTs(lastLocalCorePushIso);
      if (Number.isFinite(tsMs) && Number.isFinite(lastMs) && tsMs === lastMs) {
        return true;
      }
    }
    return false;
  }

  if (key === SUPABASE_WORKSPACE_KEY) {
    if (
      revNum !== null &&
      lastLocalWorkspacePushRevision !== null &&
      revNum <= lastLocalWorkspacePushRevision
    ) {
      return true;
    }
    if (
      workspacePushInFlight !== null &&
      revNum !== null &&
      workspacePushExpectedNextRev !== null &&
      revNum === workspacePushExpectedNextRev
    ) {
      return true;
    }
    if (updatedAt && lastLocalWorkspacePushIso) {
      if (updatedAt === lastLocalWorkspacePushIso) return true;
      const lastMs = parseIsoTs(lastLocalWorkspacePushIso);
      if (Number.isFinite(tsMs) && Number.isFinite(lastMs) && tsMs === lastMs) {
        return true;
      }
    }
    return false;
  }

  return false;
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
  const hasPriorCloudGallery =
    lastSyncedGalleryFingerprintByModelId.has(model.id) &&
    lastSyncedGalleryFingerprintByModelId.get(model.id) !== 'EMPTY';

  if (!Array.isArray(model.gallery) || model.gallery.length === 0) {
    // Жёсткая защита: если у модели в облаке уже была фотогалерея и пользователь НЕ удалял её явно,
    // никогда не затираем ссылку `__SUPABASE_GALLERY_REF__` пустым массивом `[]` (например из-за квоты Safari).
    if (hasPriorCloudGallery && !explicitlyDeletedGalleryModelIds.has(model.id)) {
      return {
        ...model,
        gallery: [
          {
            id: `cloud-ref-${model.id}`,
            category: 'pack',
            label: 'Фото',
            url: SUPABASE_GALLERY_REF,
            isMain: true,
          },
        ],
      };
    }
    return model;
  }

  const hasLocalIdbSentinel = model.gallery.some((g) => g?.url === LOCAL_GALLERY_IDB_REF);
  if (hasLocalIdbSentinel) {
    if (hasPriorCloudGallery && !explicitlyDeletedGalleryModelIds.has(model.id)) {
      return {
        ...model,
        gallery: model.gallery.map((g) =>
          g?.url === LOCAL_GALLERY_IDB_REF ? { ...g, url: SUPABASE_GALLERY_REF, originalUrl: '' } : g
        ),
      };
    }
    return {
      ...model,
      gallery: model.gallery.filter((g) => g?.url !== LOCAL_GALLERY_IDB_REF),
    };
  }

  const hasBase64 = model.gallery.some(
    (g) =>
      (typeof g.url === 'string' && g.url.startsWith('data:image/')) ||
      (typeof g.originalUrl === 'string' && g.originalUrl.startsWith('data:image/'))
  );
  if (!hasBase64) return model;

  const uploadFailed = Boolean(failedUploadModelIds?.has(model.id));

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
          ? SUPABASE_GALLERY_REF
          : g.url,
      originalUrl:
        typeof g.originalUrl === 'string' && g.originalUrl.startsWith('data:image/')
          ? ''
          : g.originalUrl,
    })),
  };
}

function rehydrateLocalGalleriesAfterConflict(
  mergedModels: ScenarioModelSpec[],
  originalLocalModels: ScenarioModelSpec[]
): ScenarioModelSpec[] {
  const localGalleryById = new Map<string, ScenarioModelSpec['gallery']>();
  for (const lm of originalLocalModels) {
    if (
      lm?.id &&
      Array.isArray(lm.gallery) &&
      lm.gallery.some((g) => typeof g?.url === 'string' && g.url.startsWith('data:image/'))
    ) {
      localGalleryById.set(lm.id, lm.gallery);
    }
  }
  if (localGalleryById.size === 0) return mergedModels;

  return mergedModels.map((m) => {
    const hasRef =
      Array.isArray(m.gallery) &&
      m.gallery.some((g) => g?.url === '__SUPABASE_GALLERY_REF__');
    if (!hasRef) return m;
    const localGal = localGalleryById.get(m.id);
    return localGal ? { ...m, gallery: localGal } : m;
  });
}

function rehydrateLocalConceptMediaAfterConflict(
  mergedConcepts: unknown[],
  originalLocalConcepts: unknown[]
): unknown[] {
  const localById = new Map<string, Record<string, unknown>>();
  for (const raw of originalLocalConcepts) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const id = String(rec.id || '').trim();
    if (id) localById.set(id, rec);
  }
  if (localById.size === 0) return mergedConcepts;

  return mergedConcepts.map((raw) => {
    if (!raw || typeof raw !== 'object') return raw;
    const rec = raw as Record<string, unknown>;
    const id = String(rec.id || '').trim();
    const localRec = id ? localById.get(id) : undefined;
    if (!localRec) return rec;

    const needsImg = rec.imageUrl === '__SUPABASE_CONCEPT_MEDIA_REF__';
    const rawGallery = Array.isArray(rec.galleryPhotos)
      ? (rec.galleryPhotos as { id?: string; url?: string; caption?: string }[])
      : null;
    const needsGallery = Boolean(
      rawGallery?.some((gp) => gp?.url === '__SUPABASE_CONCEPT_MEDIA_REF__')
    );
    if (!needsImg && !needsGallery) return rec;

    return {
      ...rec,
      imageUrl:
        needsImg && typeof localRec.imageUrl === 'string' && localRec.imageUrl
          ? localRec.imageUrl
          : rec.imageUrl,
      galleryPhotos:
        needsGallery && Array.isArray(localRec.galleryPhotos)
          ? localRec.galleryPhotos
          : rec.galleryPhotos,
    };
  });
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val && typeof val === 'object' && !Array.isArray(val));
}

function mergeRecordMapByUpdatedAt<T extends { updatedAtIso?: string }>(
  localMap: Record<string, T> | undefined,
  serverMap: Record<string, T> | undefined,
  preferLocalOnTie: boolean
): Record<string, T> {
  const merged: Record<string, T> = {};
  const keys = new Set<string>([
    ...Object.keys(serverMap || {}),
    ...Object.keys(localMap || {}),
  ]);
  for (const key of keys) {
    const lItem = localMap?.[key];
    const sItem = serverMap?.[key];
    if (lItem && !sItem) {
      merged[key] = lItem;
    } else if (sItem && !lItem) {
      merged[key] = sItem;
    } else if (lItem && sItem) {
      const lTs = parseIsoTs(lItem.updatedAtIso);
      const sTs = parseIsoTs(sItem.updatedAtIso);
      if (Number.isFinite(lTs) && Number.isFinite(sTs) && lTs !== sTs) {
        merged[key] = lTs > sTs ? lItem : sItem;
      } else if (Number.isFinite(lTs) && !Number.isFinite(sTs)) {
        merged[key] = lItem;
      } else if (!Number.isFinite(lTs) && Number.isFinite(sTs)) {
        merged[key] = sItem;
      } else {
        merged[key] = preferLocalOnTie ? lItem : sItem;
      }
    }
  }
  return merged;
}

function mergeArrayByIdAndUpdatedAt<T extends { id?: string; updatedAtIso?: string }>(
  localArr: T[] | undefined,
  serverArr: T[] | undefined,
  preferLocalOnTie: boolean
): T[] {
  const byId = new Map<string, T>();
  const orderedIds: string[] = [];
  const primary = preferLocalOnTie ? localArr || [] : serverArr || [];
  const secondary = preferLocalOnTie ? serverArr || [] : localArr || [];

  for (const item of primary) {
    const id = String(item?.id || '').trim();
    if (!id) continue;
    if (!byId.has(id)) orderedIds.push(id);
    byId.set(id, item);
  }
  for (const item of secondary) {
    const id = String(item?.id || '').trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      orderedIds.push(id);
      byId.set(id, item);
      continue;
    }
    const existTs = parseIsoTs(existing.updatedAtIso);
    const candTs = parseIsoTs(item.updatedAtIso);
    if (Number.isFinite(candTs) && (!Number.isFinite(existTs) || candTs > existTs)) {
      byId.set(id, item);
    }
  }
  return orderedIds.map((id) => byId.get(id)!).filter(Boolean);
}

function mergeInvestmentLedgers(
  localRaw: unknown,
  serverRaw: unknown,
  preferLocalOnTie: boolean
): unknown {
  if (!isPlainRecord(localRaw)) return serverRaw;
  if (!isPlainRecord(serverRaw)) return localRaw;

  const localLedger = localRaw as unknown as Partial<InvestmentLedgerState>;
  const serverLedger = serverRaw as unknown as Partial<InvestmentLedgerState>;

  const localLedgerTs = parseIsoTs(localLedger.updatedAtIso);
  const serverLedgerTs = parseIsoTs(serverLedger.updatedAtIso);
  const isLocalLedgerNewer =
    Number.isFinite(localLedgerTs) && Number.isFinite(serverLedgerTs)
      ? localLedgerTs >= serverLedgerTs
      : Number.isFinite(localLedgerTs)
      ? true
      : Number.isFinite(serverLedgerTs)
      ? false
      : preferLocalOnTie;

  const olderSettings = (isLocalLedgerNewer
    ? serverLedger.globalSettings
    : localLedger.globalSettings) as Record<string, unknown> | undefined;
  const newerSettings = (isLocalLedgerNewer
    ? localLedger.globalSettings
    : serverLedger.globalSettings) as Record<string, unknown> | undefined;

  const mergedSharedCommitted = {
    committedPaymentOverrides: mergeRecordMapByUpdatedAt<ManualPaymentOverride>(
      localLedger.sharedCommitted?.committedPaymentOverrides,
      serverLedger.sharedCommitted?.committedPaymentOverrides,
      isLocalLedgerNewer
    ),
    committedBatchOverrides: mergeRecordMapByUpdatedAt<BatchTermsManualOverride>(
      localLedger.sharedCommitted?.committedBatchOverrides,
      serverLedger.sharedCommitted?.committedBatchOverrides,
      isLocalLedgerNewer
    ),
    committedCapitalInjections: mergeArrayByIdAndUpdatedAt<CapitalInjectionRecord>(
      localLedger.sharedCommitted?.committedCapitalInjections,
      serverLedger.sharedCommitted?.committedCapitalInjections,
      isLocalLedgerNewer
    ),
    committedOtherOperations: mergeArrayByIdAndUpdatedAt<CustomCashOperationRecord>(
      localLedger.sharedCommitted?.committedOtherOperations,
      serverLedger.sharedCommitted?.committedOtherOperations,
      isLocalLedgerNewer
    ),
  };

  const mergedScenarioPlans: Record<string, ScenarioManualLedgerPlan> = {};
  const scopeKeys = new Set<string>([
    ...Object.keys(serverLedger.scenarioPlans || {}),
    ...Object.keys(localLedger.scenarioPlans || {}),
  ]);
  for (const scopeKey of scopeKeys) {
    const lp = localLedger.scenarioPlans?.[scopeKey];
    const sp = serverLedger.scenarioPlans?.[scopeKey];
    mergedScenarioPlans[scopeKey] = {
      paymentOverrides: mergeRecordMapByUpdatedAt<ManualPaymentOverride>(
        lp?.paymentOverrides,
        sp?.paymentOverrides,
        isLocalLedgerNewer
      ),
      batchOverrides: mergeRecordMapByUpdatedAt<BatchTermsManualOverride>(
        lp?.batchOverrides,
        sp?.batchOverrides,
        isLocalLedgerNewer
      ),
      plannedCapitalInjections: mergeArrayByIdAndUpdatedAt<CapitalInjectionRecord>(
        lp?.plannedCapitalInjections,
        sp?.plannedCapitalInjections,
        isLocalLedgerNewer
      ),
      plannedOtherOperations: mergeArrayByIdAndUpdatedAt<CustomCashOperationRecord>(
        lp?.plannedOtherOperations,
        sp?.plannedOtherOperations,
        isLocalLedgerNewer
      ),
    };
  }

  const auditMap = new Map<string, InvestmentLedgerAuditEntry>();
  for (const entry of [
    ...(Array.isArray(localLedger.auditHistory) ? localLedger.auditHistory : []),
    ...(Array.isArray(serverLedger.auditHistory) ? serverLedger.auditHistory : []),
  ]) {
    if (entry?.id && !auditMap.has(entry.id)) {
      auditMap.set(entry.id, entry);
    }
  }
  const mergedAuditHistory = Array.from(auditMap.values())
    .sort((a, b) => (parseIsoTs(b.timestampIso) || 0) - (parseIsoTs(a.timestampIso) || 0))
    .slice(0, 300);

  const mergedIso = new Date(
    Math.max(
      Date.now(),
      Number.isFinite(localLedgerTs) ? localLedgerTs : 0,
      Number.isFinite(serverLedgerTs) ? serverLedgerTs : 0
    )
  ).toISOString();

  return {
    ...(isLocalLedgerNewer ? serverRaw : localRaw),
    ...(isLocalLedgerNewer ? localRaw : serverRaw),
    version: 1,
    globalSettings: {
      ...(olderSettings || {}),
      ...(newerSettings || {}),
    },
    sharedCommitted: mergedSharedCommitted,
    scenarioPlans: mergedScenarioPlans,
    auditHistory: mergedAuditHistory,
    updatedAtIso: mergedIso,
  };
}

function mergeSharedSupplyAndFact(
  winner: SharedSkuSupplyAndFact | undefined,
  other: SharedSkuSupplyAndFact | undefined
): SharedSkuSupplyAndFact | undefined {
  if (!winner) return other;
  if (!other) return winner;

  // Объединяем утверждённые заказы фабрикам по id, чтобы заказы с разных устройств не затирали друг друга
  const poById = new Map<string, ApprovedPurchaseOrder>();
  const poOrder: string[] = [];
  for (const po of winner.approvedOrders || []) {
    if (!po?.id) continue;
    if (!poById.has(po.id)) poOrder.push(po.id);
    poById.set(po.id, po);
  }
  for (const po of other.approvedOrders || []) {
    if (!po?.id) continue;
    const existing = poById.get(po.id);
    if (!existing) {
      poOrder.push(po.id);
      poById.set(po.id, po);
      continue;
    }
    const existVer = Number(existing.version) || 0;
    const candVer = Number(po.version) || 0;
    const existTs = parseIsoTs(existing.approvedAt);
    const candTs = parseIsoTs(po.approvedAt);
    if (candVer > existVer || (candVer === existVer && Number.isFinite(candTs) && (!Number.isFinite(existTs) || candTs > existTs))) {
      poById.set(po.id, po);
    }
  }
  const mergedOrders = poOrder.map((id) => poById.get(id)!).filter(Boolean);

  // Объединяем помесячный факт (всегда сохраняем полную матрицу из 12 месяцев 0..11):
  // не теряем заполненные не-null месяцы со второй стороны
  const winnerSalesByMonth = new Map<number, ActualMonthSaleRecord>();
  for (const rec of winner.actualSalesByMonth || []) {
    if (rec && typeof rec.monthIdx === 'number' && rec.monthIdx >= 0 && rec.monthIdx < 12) {
      winnerSalesByMonth.set(rec.monthIdx, rec);
    }
  }
  const otherSalesByMonth = new Map<number, ActualMonthSaleRecord>();
  for (const rec of other.actualSalesByMonth || []) {
    if (rec && typeof rec.monthIdx === 'number' && rec.monthIdx >= 0 && rec.monthIdx < 12) {
      otherSalesByMonth.set(rec.monthIdx, rec);
    }
  }
  const mergedActualSales: ActualMonthSaleRecord[] = Array.from({ length: 12 }, (_, mIdx) => {
    const wRec = winnerSalesByMonth.get(mIdx);
    const oRec = otherSalesByMonth.get(mIdx);
    return {
      monthIdx: mIdx,
      actualBuyoutsPacks:
        wRec && wRec.actualBuyoutsPacks !== null && wRec.actualBuyoutsPacks !== undefined
          ? wRec.actualBuyoutsPacks
          : oRec && oRec.actualBuyoutsPacks !== null && oRec.actualBuyoutsPacks !== undefined
          ? oRec.actualBuyoutsPacks
          : null,
      actualPriceRub:
        wRec && wRec.actualPriceRub !== null && wRec.actualPriceRub !== undefined
          ? wRec.actualPriceRub
          : oRec && oRec.actualPriceRub !== null && oRec.actualPriceRub !== undefined
          ? oRec.actualPriceRub
          : null,
    };
  });

  // Объединяем аудит-лог модели
  const auditById = new Map<string, ModelAuditEntry>();
  for (const entry of [...(winner.auditHistory || []), ...(other.auditHistory || [])]) {
    if (entry?.id && !auditById.has(entry.id)) {
      auditById.set(entry.id, entry);
    }
  }
  const mergedAudit = Array.from(auditById.values())
    .sort((a, b) => (parseIsoTs(b.timestamp) || 0) - (parseIsoTs(a.timestamp) || 0))
    .slice(0, 100);

  return {
    ...winner,
    approvedOrders: mergedOrders,
    actualSalesByMonth: mergedActualSales,
    passportVersion: Math.max(winner.passportVersion || 1, other.passportVersion || 1),
    auditHistory: mergedAudit,
  };
}

function mergeAdditiveModelCollections(
  winner: ScenarioModelSpec,
  other: ScenarioModelSpec | undefined
): ScenarioModelSpec {
  if (!other) return winner;

  const mergedPlans: ScenarioModelSpec['plansByScenario'] = {
    ...(winner.plansByScenario || {}),
  };
  for (const [scenKey, otherPl] of Object.entries(other.plansByScenario || {})) {
    const numKey = Number(scenKey);
    if (!Number.isFinite(numKey) || !otherPl) continue;
    if (!mergedPlans[numKey]) {
      mergedPlans[numKey] = {
        ...otherPl,
        monthlyPacks: Array.isArray(otherPl.monthlyPacks) ? [...otherPl.monthlyPacks] : [],
        monthlyPricesRub: Array.isArray(otherPl.monthlyPricesRub)
          ? [...otherPl.monthlyPricesRub]
          : [],
        monthlyReceiptsPacks: Array.isArray(otherPl.monthlyReceiptsPacks)
          ? [...otherPl.monthlyReceiptsPacks]
          : [],
      };
    }
  }

  const pdfById = new Map<string, NonNullable<ScenarioModelSpec['attachedPdfs']>[number]>();
  for (const pdf of [...(winner.attachedPdfs || []), ...(other.attachedPdfs || [])]) {
    if (pdf?.id && !pdfById.has(pdf.id)) {
      pdfById.set(pdf.id, pdf);
    }
  }
  const mergedPdfs =
    winner.attachedPdfs !== undefined || other.attachedPdfs !== undefined
      ? Array.from(pdfById.values())
      : undefined;

  const hasRealPhoto = (gal: ScenarioModelSpec['gallery'] | undefined): boolean =>
    Array.isArray(gal) &&
    gal.some((g) => {
      const u = typeof g?.url === 'string' ? g.url.trim() : '';
      const orig = typeof g?.originalUrl === 'string' ? g.originalUrl.trim() : '';
      if (isGalleryPlaceholderSentinel(u)) return false;
      return u.length > 0 || (orig.length > 0 && !isGalleryPlaceholderSentinel(orig));
    });
  const hasCloudRef = (gal: ScenarioModelSpec['gallery'] | undefined): boolean =>
    Array.isArray(gal) && gal.some((g) => g?.url === SUPABASE_GALLERY_REF);
  const hasAnyPlaceholder = (gal: ScenarioModelSpec['gallery'] | undefined): boolean =>
    Array.isArray(gal) && gal.some((g) => isGalleryPlaceholderSentinel(g?.url));

  const wReal = hasRealPhoto(winner.gallery);
  const oReal = hasRealPhoto(other.gallery);
  const wHasRef = hasCloudRef(winner.gallery);
  const oHasRef = hasCloudRef(other.gallery);
  const wTs = parseIsoTs(winner.updatedAtIso);
  const oTs = parseIsoTs(other.updatedAtIso);
  const winnerEditedStrictlyLater =
    Number.isFinite(wTs) &&
    Number.isFinite(oTs) &&
    winner.updatedAtIso !== ASYMMETRIC_OLDER_SENTINEL_ISO &&
    other.updatedAtIso !== ASYMMETRIC_OLDER_SENTINEL_ISO &&
    wTs > oTs;

  let resolvedGallery = winner.gallery;
  if (!wReal && hasAnyPlaceholder(winner.gallery) && oReal) {
    // Заменяем маркер-заглушку на реальные фото со второй стороны
    resolvedGallery = other.gallery;
  } else if (!wReal && !wHasRef && (oReal || oHasRef) && !winnerEditedStrictlyLater) {
    // Если победитель имеет пустую галерею без более свежей правки именно этой модели — сохраняем фото второй стороны
    resolvedGallery = other.gallery;
  }

  return {
    ...winner,
    gallery: resolvedGallery,
    wbArticle: winner.wbArticle || other.wbArticle,
    description: winner.description || other.description,
    liskaniSizeVariants:
      winner.liskaniSizeVariants && winner.liskaniSizeVariants.length > 0
        ? winner.liskaniSizeVariants
        : other.liskaniSizeVariants,
    attachedPdfs: mergedPdfs,
    plansByScenario: mergedPlans,
    sharedSupplyAndFact: mergeSharedSupplyAndFact(
      winner.sharedSupplyAndFact,
      other.sharedSupplyAndFact
    ),
    updatedAtIso:
      winner.updatedAtIso && winner.updatedAtIso !== ASYMMETRIC_OLDER_SENTINEL_ISO
        ? winner.updatedAtIso
        : other.updatedAtIso && other.updatedAtIso !== ASYMMETRIC_OLDER_SENTINEL_ISO
        ? other.updatedAtIso
        : undefined,
  };
}

function normalizeModelLookupKeys(m: Pick<ScenarioModelSpec, 'id' | 'code'>): string[] {
  const keys: string[] = [];
  if (m.id) keys.push(`ID:${m.id.trim().toUpperCase()}`);
  if (m.code) keys.push(`CODE:${m.code.trim().toUpperCase()}`);
  return keys;
}

function findMatchingModel(
  list: ScenarioModelSpec[],
  target: Pick<ScenarioModelSpec, 'id' | 'code'>
): ScenarioModelSpec | undefined {
  const idU = (target.id || '').trim().toUpperCase();
  const codeU = (target.code || '').trim().toUpperCase();
  return list.find(
    (m) =>
      (idU && (m.id || '').trim().toUpperCase() === idU) ||
      (codeU && (m.code || '').trim().toUpperCase() === codeU)
  );
}

/**
 * Чистая детерминированная функция бесконфликтного слияния портфеля при конкурентном редактировании
 * с двух устройств (Optimistic Concurrency · Test 11).
 *
 * Гарантирует:
 * - правки разных SKU на разных устройствах сохраняются обе (по per-model `updatedAtIso`, включая асимметричный случай,
 *   когда только отредактированный SKU имеет `updatedAtIso`);
 * - правки разных сценариев, PO, фактических продаж и PDF внутри одного SKU объединяются без потерь;
 * - записи и переопределения `investmentLedger`, `scenarios`, `selectedScenarioByBrand`, `customBrands`,
 *   `productGroups` и `financeContourParams` с обоих устройств сохраняются без тихого затирания.
 */
export function resolveConcurrentPortfolioConflict(
  localPayload: CloudPortfolioCorePayload,
  serverPayload: CloudPortfolioCorePayload
): CloudPortfolioCorePayload {
  const localTs = parseIsoTs(localPayload.updatedAtIso);
  const serverTs = parseIsoTs(serverPayload.updatedAtIso);
  const isLocalPayloadNewer =
    Number.isFinite(localTs) && (!Number.isFinite(serverTs) || localTs >= serverTs);

  const localModelsRaw = Array.isArray(localPayload.models) ? localPayload.models : [];
  const serverModelsRaw = Array.isArray(serverPayload.models) ? serverPayload.models : [];

  // Собираем реестр удалений с защитой от удаления SKU, который был обновлён/восстановлен позже
  const deletedSet = new Set<string>();
  for (const d of localPayload.deletedModelIds || []) {
    if (d) deletedSet.add(String(d).trim().toUpperCase());
  }
  for (const d of serverPayload.deletedModelIds || []) {
    if (d) deletedSet.add(String(d).trim().toUpperCase());
  }
  for (const lm of localModelsRaw) {
    const lModTs = parseIsoTs(lm.updatedAtIso);
    if (Number.isFinite(lModTs) && (!Number.isFinite(serverTs) || lModTs > serverTs)) {
      if (lm.id) deletedSet.delete(lm.id.trim().toUpperCase());
      if (lm.code) deletedSet.delete(lm.code.trim().toUpperCase());
    }
  }
  for (const sm of serverModelsRaw) {
    const sModTs = parseIsoTs(sm.updatedAtIso);
    if (Number.isFinite(sModTs) && (!Number.isFinite(localTs) || sModTs > localTs)) {
      if (sm.id) deletedSet.delete(sm.id.trim().toUpperCase());
      if (sm.code) deletedSet.delete(sm.code.trim().toUpperCase());
    }
  }
  const mergedDeletedModelIds = Array.from(deletedSet);

  // Гармонизируем асимметричный per-model updatedAtIso перед вызовом mergeCloudPortfolioSnapshot:
  // если устройство A редактировало SKU-1 (updatedAtIso=T1), а устройство B — SKU-2 (updatedAtIso=T2),
  // нетронутый SKU на противоположном устройстве не должен перебить отредактированный SKU из-за payload-таймстампа!
  const harmonizedLocalModels: ScenarioModelSpec[] = localModelsRaw.map((lm) => {
    const sm = findMatchingModel(serverModelsRaw, lm);
    const lModTs = parseIsoTs(lm.updatedAtIso);
    const sModTs = parseIsoTs(sm?.updatedAtIso);
    if (!Number.isFinite(lModTs) && Number.isFinite(sModTs)) {
      return { ...lm, updatedAtIso: ASYMMETRIC_OLDER_SENTINEL_ISO };
    }
    return lm;
  });

  const harmonizedServerModels: ScenarioModelSpec[] = serverModelsRaw.map((sm) => {
    const lm = findMatchingModel(localModelsRaw, sm);
    const lModTs = parseIsoTs(lm?.updatedAtIso);
    const sModTs = parseIsoTs(sm.updatedAtIso);
    if (!Number.isFinite(sModTs) && Number.isFinite(lModTs)) {
      return { ...sm, updatedAtIso: ASYMMETRIC_OLDER_SENTINEL_ISO };
    }
    return sm;
  });

  const inputModelKeys = new Set<string>();
  for (const m of [...localModelsRaw, ...serverModelsRaw]) {
    if (!m) continue;
    for (const k of normalizeModelLookupKeys(m)) {
      inputModelKeys.add(k);
    }
  }

  const baseMerge = mergeCloudPortfolioSnapshot({
    localModels: harmonizedLocalModels,
    cloudModels: harmonizedServerModels,
    localUpdatedAtIso: localPayload.updatedAtIso,
    cloudUpdatedAtIso: serverPayload.updatedAtIso,
    deletedRegistry: mergedDeletedModelIds,
  });

  // Оставляем только модели, присутствовавшие хотя бы на одном из двух устройств,
  // и дополняем каждую модель аддитивными коллекциями (plansByScenario, approvedOrders, actualSalesByMonth, PDF)
  const mergedModels: ScenarioModelSpec[] = baseMerge.models
    .filter((m) => normalizeModelLookupKeys(m).some((k) => inputModelKeys.has(k)))
    .map((m) => {
      const lm = findMatchingModel(localModelsRaw, m);
      const sm = findMatchingModel(serverModelsRaw, m);
      if (!lm && !sm) return m;
      if (lm && !sm) return mergeAdditiveModelCollections(m, undefined);
      if (sm && !lm) return mergeAdditiveModelCollections(m, undefined);

      const lModTs = parseIsoTs(lm!.updatedAtIso);
      const sModTs = parseIsoTs(sm!.updatedAtIso);
      let localWon = isLocalPayloadNewer;
      if (Number.isFinite(lModTs) && Number.isFinite(sModTs) && lModTs !== sModTs) {
        localWon = lModTs > sModTs;
      } else if (Number.isFinite(lModTs) && !Number.isFinite(sModTs)) {
        localWon = true;
      } else if (!Number.isFinite(lModTs) && Number.isFinite(sModTs)) {
        localWon = false;
      }
      const loser = localWon ? sm : lm;
      return mergeAdditiveModelCollections(m, loser);
    });

  // Сценарии и реестр удалённых сценариев
  const mergedDeletedScenarioIds = Array.from(
    new Set<number>(
      [
        ...(localPayload.deletedScenarioIds || []),
        ...(serverPayload.deletedScenarioIds || []),
      ]
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n))
    )
  );
  const deletedScenSet = new Set<number>(mergedDeletedScenarioIds);

  const primaryScenarios = (
    isLocalPayloadNewer ? localPayload.scenarios : serverPayload.scenarios
  ) || [];
  const secondaryScenarios = (
    isLocalPayloadNewer ? serverPayload.scenarios : localPayload.scenarios
  ) || [];
  const mergedScenariosMap = new Map<number, GrowthScenarioDef>();
  const mergedScenariosOrder: number[] = [];
  for (const s of [...primaryScenarios, ...secondaryScenarios]) {
    if (!s || typeof s.id !== 'number' || deletedScenSet.has(s.id)) continue;
    if (!mergedScenariosMap.has(s.id)) {
      mergedScenariosOrder.push(s.id);
      mergedScenariosMap.set(s.id, s);
    }
  }
  const mergedScenarios =
    mergedScenariosOrder.length > 0
      ? mergedScenariosOrder.map((id) => mergedScenariosMap.get(id)!)
      : localPayload.scenarios ?? serverPayload.scenarios;

  // selectedScenarioByBrand: объединяем ключи обоих устройств, при конфликте ключа побеждает более свежий payload
  const mergedSelectedByBrand: Record<string, number | null> | undefined =
    localPayload.selectedScenarioByBrand || serverPayload.selectedScenarioByBrand
      ? {
          ...(isLocalPayloadNewer
            ? serverPayload.selectedScenarioByBrand
            : localPayload.selectedScenarioByBrand),
          ...(isLocalPayloadNewer
            ? localPayload.selectedScenarioByBrand
            : serverPayload.selectedScenarioByBrand),
        }
      : undefined;

  // customBrands: объединяем уникальные пользовательские бренды с обоих устройств
  const customBrandMap = new Map<string, string>();
  for (const brand of [
    ...(serverPayload.customBrands || []),
    ...(localPayload.customBrands || []),
  ]) {
    const clean = String(brand || '').trim();
    if (!clean) continue;
    const key = clean.toUpperCase();
    if (!customBrandMap.has(key)) customBrandMap.set(key, clean);
  }
  const mergedCustomBrands =
    localPayload.customBrands !== undefined || serverPayload.customBrands !== undefined
      ? Array.from(customBrandMap.values())
      : undefined;

  // financeContourParams: объединяем поля обоих устройств, при конфликте побеждает более свежий payload
  let mergedFinanceContourParams: unknown = isLocalPayloadNewer
    ? localPayload.financeContourParams ?? serverPayload.financeContourParams
    : serverPayload.financeContourParams ?? localPayload.financeContourParams;
  if (
    isPlainRecord(localPayload.financeContourParams) &&
    isPlainRecord(serverPayload.financeContourParams)
  ) {
    mergedFinanceContourParams = {
      ...(isLocalPayloadNewer
        ? serverPayload.financeContourParams
        : localPayload.financeContourParams),
      ...(isLocalPayloadNewer
        ? localPayload.financeContourParams
        : serverPayload.financeContourParams),
    };
  }

  // productGroups: если это массивы объектов с id, объединяем по id
  let mergedProductGroups: unknown = isLocalPayloadNewer
    ? localPayload.productGroups ?? serverPayload.productGroups
    : serverPayload.productGroups ?? localPayload.productGroups;
  if (Array.isArray(localPayload.productGroups) && Array.isArray(serverPayload.productGroups)) {
    const pgById = new Map<string, unknown>();
    const pgOrder: string[] = [];
    const primaryGroups = isLocalPayloadNewer
      ? localPayload.productGroups
      : serverPayload.productGroups;
    const secondaryGroups = isLocalPayloadNewer
      ? serverPayload.productGroups
      : localPayload.productGroups;
    for (const item of [...primaryGroups, ...secondaryGroups]) {
      const id = isPlainRecord(item) ? String(item.id || '').trim() : '';
      const key = id || `idx:${pgOrder.length}`;
      if (!pgById.has(key)) {
        pgOrder.push(key);
        pgById.set(key, item);
      }
    }
    mergedProductGroups = pgOrder.map((k) => pgById.get(k));
  }

  // investmentLedger: детальное по-записное слияние (override-ы, транши, вложения, операции, аудит)
  const mergedInvestmentLedger = mergeInvestmentLedgers(
    localPayload.investmentLedger,
    serverPayload.investmentLedger,
    isLocalPayloadNewer
  );

  const mergedUpdatedAtIso = new Date(
    Math.max(
      Date.now(),
      Number.isFinite(localTs) ? localTs : 0,
      Number.isFinite(serverTs) ? serverTs : 0
    )
  ).toISOString();

  return {
    ...serverPayload,
    ...localPayload,
    models: mergedModels,
    scenarios: mergedScenarios,
    selectedScenarioByBrand: mergedSelectedByBrand,
    includeGroupPortfolioInS1: isLocalPayloadNewer
      ? localPayload.includeGroupPortfolioInS1 ?? serverPayload.includeGroupPortfolioInS1
      : serverPayload.includeGroupPortfolioInS1 ?? localPayload.includeGroupPortfolioInS1,
    deletedModelIds: mergedDeletedModelIds,
    deletedScenarioIds: mergedDeletedScenarioIds,
    customBrands: mergedCustomBrands,
    financeContourParams: mergedFinanceContourParams,
    productGroups: mergedProductGroups,
    investmentLedger: mergedInvestmentLedger,
    updatedAtIso: mergedUpdatedAtIso,
    serverRevision: serverPayload.serverRevision,
  };
}

function getWorkspaceItemKey(item: unknown): string {
  if (!isPlainRecord(item)) return '';
  const id = String(item.id || '').trim();
  if (id) return `id:${id}`;
  const sectionKey = String(item.sectionKey || item.key || '').trim();
  const brandId = String(item.brandId || '').trim();
  if (sectionKey) return `sec:${brandId}:${sectionKey}`;
  return '';
}

function getWorkspaceItemTimestamp(item: unknown): number {
  if (!isPlainRecord(item)) return NaN;
  return parseIsoTs(
    item.updatedAtIso ?? item.updatedAt ?? item.modifiedAt ?? item.lastEditedAt
  );
}

function mergeWorkspaceEntityArray(
  localArr: unknown[] | undefined,
  serverArr: unknown[] | undefined,
  preferLocalOnTie: boolean,
  excludedIds?: Set<string>
): unknown[] | undefined {
  if (localArr === undefined && serverArr === undefined) return undefined;
  const localList = Array.isArray(localArr) ? localArr : [];
  const serverList = Array.isArray(serverArr) ? serverArr : [];

  const byKey = new Map<string, unknown>();
  const orderedKeys: string[] = [];
  const unkeyed: unknown[] = [];

  const primary = preferLocalOnTie ? localList : serverList;
  const secondary = preferLocalOnTie ? serverList : localList;

  const isExcluded = (item: unknown): boolean => {
    if (!excludedIds || excludedIds.size === 0 || !isPlainRecord(item)) return false;
    const rawId = String(item.id || '').trim();
    return Boolean(rawId && excludedIds.has(rawId));
  };

  for (const item of primary) {
    if (isExcluded(item)) continue;
    const key = getWorkspaceItemKey(item);
    if (!key) {
      unkeyed.push(item);
      continue;
    }
    if (!byKey.has(key)) orderedKeys.push(key);
    byKey.set(key, item);
  }

  for (const item of secondary) {
    if (isExcluded(item)) continue;
    const key = getWorkspaceItemKey(item);
    if (!key) {
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      orderedKeys.push(key);
      byKey.set(key, item);
      continue;
    }
    const existTs = getWorkspaceItemTimestamp(existing);
    const candTs = getWorkspaceItemTimestamp(item);
    if (Number.isFinite(candTs) && (!Number.isFinite(existTs) || candTs > existTs)) {
      byKey.set(key, item);
    }
  }

  return [...orderedKeys.map((k) => byKey.get(k)!), ...unkeyed];
}

export function resolveConcurrentWorkspaceConflict(
  localPayload: CloudPlatformWorkspacePayload,
  serverPayload: CloudPlatformWorkspacePayload
): CloudPlatformWorkspacePayload {
  const localTs = parseIsoTs(localPayload.updatedAtIso);
  const serverTs = parseIsoTs(serverPayload.updatedAtIso);
  const isLocalNewer =
    Number.isFinite(localTs) && (!Number.isFinite(serverTs) || localTs >= serverTs);

  const deletedConceptSet = new Set<string>([
    ...(localPayload.deletedConceptIds || []).map((id) => String(id || '').trim()).filter(Boolean),
    ...(serverPayload.deletedConceptIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  ]);

  // Защита от удаления концепции, которую явно обновили позже удаления на другом устройстве
  for (const raw of localPayload.concepts || []) {
    if (!isPlainRecord(raw)) continue;
    const id = String(raw.id || '').trim();
    const ts = getWorkspaceItemTimestamp(raw);
    if (id && Number.isFinite(ts) && (!Number.isFinite(serverTs) || ts > serverTs)) {
      deletedConceptSet.delete(id);
    }
  }
  for (const raw of serverPayload.concepts || []) {
    if (!isPlainRecord(raw)) continue;
    const id = String(raw.id || '').trim();
    const ts = getWorkspaceItemTimestamp(raw);
    if (id && Number.isFinite(ts) && (!Number.isFinite(localTs) || ts > localTs)) {
      deletedConceptSet.delete(id);
    }
  }

  const mergedUpdatedAtIso = new Date(
    Math.max(
      Date.now(),
      Number.isFinite(localTs) ? localTs : 0,
      Number.isFinite(serverTs) ? serverTs : 0
    )
  ).toISOString();

  return {
    concepts:
      mergeWorkspaceEntityArray(
        localPayload.concepts,
        serverPayload.concepts,
        isLocalNewer,
        deletedConceptSet
      ) || [],
    miroItems: mergeWorkspaceEntityArray(
      localPayload.miroItems,
      serverPayload.miroItems,
      isLocalNewer
    ),
    strategies: mergeWorkspaceEntityArray(
      localPayload.strategies,
      serverPayload.strategies,
      isLocalNewer
    ),
    documents: mergeWorkspaceEntityArray(
      localPayload.documents,
      serverPayload.documents,
      isLocalNewer
    ),
    launches: mergeWorkspaceEntityArray(
      localPayload.launches,
      serverPayload.launches,
      isLocalNewer
    ),
    campaigns: mergeWorkspaceEntityArray(
      localPayload.campaigns,
      serverPayload.campaigns,
      isLocalNewer
    ),
    deletedConceptIds: Array.from(deletedConceptSet),
    updatedAtIso: mergedUpdatedAtIso,
    serverRevision: serverPayload.serverRevision,
  };
}

export async function pushModelGalleryToSupabase(
  modelId: string,
  gallery: ScenarioModelSpec['gallery'],
  options?: { explicitDelete?: boolean }
): Promise<boolean> {
  if (isAutomatedOrLocalhostWriteBlocked()) return false;
  const client = getActiveSupabaseClient();
  if (!client || !modelId || !Array.isArray(gallery)) return false;

  const nextFp = computeGalleryFingerprint(gallery);

  if (gallery.length === 0) {
    // ЖЁСТКИЙ ИНВАРИАНТ БЕЗОПАСНОСТИ: облачную фотогалерею `photo_gallery:<id>`
    // можно очистить ТОЛЬКО при явном действии пользователя (`explicitDelete: true`).
    // Никакой фоновый синк, переполнение квоты Safari или слияние кэшей не могут обнулить фото в БД!
    if (options?.explicitDelete !== true) {
      return false;
    }
    explicitlyDeletedGalleryModelIds.add(modelId);
    const prevFp = lastSyncedGalleryFingerprintByModelId.get(modelId);
    if (!prevFp || prevFp === 'EMPTY') {
      lastSyncedGalleryFingerprintByModelId.set(modelId, 'EMPTY');
      return true;
    }
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
    // Никогда не затираем облачную галерею при получении ссылок `__SUPABASE_GALLERY_REF__`,
    // `__LOCAL_GALLERY_IDB_REF__` или статических путей без base64.
    return false;
  }

  explicitlyDeletedGalleryModelIds.delete(modelId);

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

function emitCloudSaveStatus(status: CloudSaveStatus, atIso?: string): void {
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

function emitCloudConflictMerged(detail: CloudConflictEventDetail): void {
  lastCloudConflictEvent = detail;
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent('borners-cloud-conflict-merged', {
          detail,
        })
      );
    } catch {
      // Игнорируем в тестовых окружениях без полноценного DOM EventTarget
    }
  }
}

async function executePortfolioCorePushOnce(
  input: Omit<CloudPortfolioCorePayload, 'updatedAtIso'>,
  options?: CloudPushOptions
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
    // Синхронизируем ТОЛЬКО непустые base64-фотогалереи, чей слепок реально изменился (O(1) для неизменённых SKU).
    // Фоновый push ядра НИКОГДА не удаляет строки `photo_gallery:<id>` в Supabase!
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

    // Если пока грузились фото в очередь уже пришло более свежее сохранение — отдаём приоритет ему
    if (mySeq < latestCorePushSeq || queuedCorePush !== null) {
      return true;
    }

    const compactModels = input.models.map((m) =>
      stripBase64FromModelForCoreRow(m, failedUploadModelIds)
    );
    const nowIso = computeMonotonicCloudPushIso();
    let currentPayload: CloudPortfolioCorePayload = {
      ...input,
      deletedScenarioIds:
        input.deletedScenarioIds !== undefined
          ? input.deletedScenarioIds
          : (readWindowStorageJsonSafe('borners_deleted_scenario_ids_v1') as number[] | undefined),
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

    const initialExpectedRev =
      options?.expectedRevision !== undefined
        ? options.expectedRevision
        : lastKnownCoreRevision;
    let expectedRev: number | null = initialExpectedRev;
    const maxRetries = Math.max(0, options?.maxConflictRetries ?? 2);
    let hadConflictMerge = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (mySeq < latestCorePushSeq) {
        return true;
      }

      const payloadForRpc: CloudPortfolioCorePayload = {
        ...currentPayload,
        serverRevision: undefined,
      };
      delete payloadForRpc.serverRevision;

      corePushExpectedNextRev = expectedRev !== null ? expectedRev + 1 : null;

      const { data: rpcRaw, error: rpcError } = await client.rpc('upsert_portfolio_kv_safe', {
        p_key: SUPABASE_CORE_KEY,
        p_payload: payloadForRpc,
        p_expected_revision: expectedRev,
      });

      if (rpcError) {
        // Fallback на обычный upsert ТОЛЬКО если RPC ещё не развёрнут (404 / PGRST202 / 42883)
        if (isMissingRpcError(rpcError)) {
          const { error: upsertErr } = await client.from(SUPABASE_PORTFOLIO_TABLE).upsert(
            {
              key: SUPABASE_CORE_KEY,
              payload: payloadForRpc,
              updated_at: payloadForRpc.updatedAtIso,
            },
            { onConflict: 'key' }
          );
          emitCloudSaveStatus(!upsertErr ? 'saved_cloud' : 'saved_local', payloadForRpc.updatedAtIso);
          return !upsertErr;
        }
        emitCloudSaveStatus('saved_local');
        return false;
      }

      const rpcRes = (Array.isArray(rpcRaw) ? rpcRaw[0] : rpcRaw) as SafeUpsertRpcResponse | null;
      if (rpcRes?.ok === true && !rpcRes?.conflict) {
        const nextRev = parseRevisionNumber(rpcRes.server_revision);
        if (nextRev !== null) {
          lastKnownCoreRevision = nextRev;
          lastLocalCorePushRevision = nextRev;
        }
        const serverUpdatedAt =
          typeof rpcRes.server_updated_at === 'string' && rpcRes.server_updated_at
            ? rpcRes.server_updated_at
            : currentPayload.updatedAtIso;
        lastLocalCorePushIso = serverUpdatedAt;
        lastKnownCloudUpdatedAtIso = serverUpdatedAt;

        if (hadConflictMerge) {
          const hydratedForClient: CloudPortfolioCorePayload = {
            ...currentPayload,
            models: rehydrateLocalGalleriesAfterConflict(currentPayload.models, input.models),
            serverRevision: nextRev ?? undefined,
          };
          emitCloudConflictMerged({
            key: SUPABASE_CORE_KEY,
            mergedAtIso: currentPayload.updatedAtIso,
            previousRevision: initialExpectedRev,
            serverRevision: nextRev ?? (expectedRev ?? 0),
            mergedPayload: hydratedForClient,
          });
          emitCloudSaveStatus('conflict_merged', currentPayload.updatedAtIso);
        } else {
          emitCloudSaveStatus('saved_cloud', currentPayload.updatedAtIso);
        }
        return true;
      }

      if (rpcRes?.ok === false && rpcRes?.conflict === true) {
        const serverRev = parseRevisionNumber(rpcRes.server_revision);
        if (serverRev !== null) {
          lastKnownCoreRevision = serverRev;
        }
        const rawServerPayload = rpcRes.server_payload as Partial<CloudPortfolioCorePayload> | null;
        if (
          !rawServerPayload ||
          typeof rawServerPayload !== 'object' ||
          !Array.isArray(rawServerPayload.models)
        ) {
          emitCloudSaveStatus('saved_local');
          return false;
        }

        const serverPayload: CloudPortfolioCorePayload = {
          ...(rawServerPayload as CloudPortfolioCorePayload),
          updatedAtIso:
            rawServerPayload.updatedAtIso ||
            (typeof rpcRes.server_updated_at === 'string' ? rpcRes.server_updated_at : ''),
          serverRevision: serverRev ?? undefined,
        };

        const merged = resolveConcurrentPortfolioConflict(currentPayload, serverPayload);
        currentPayload = {
          ...merged,
          models: merged.models.map((m) =>
            stripBase64FromModelForCoreRow(m, failedUploadModelIds)
          ),
        };
        expectedRev = serverRev;
        hadConflictMerge = true;
        lastLocalCorePushIso = currentPayload.updatedAtIso;
        continue;
      }

      emitCloudSaveStatus('saved_local');
      return false;
    }

    emitCloudSaveStatus('saved_local');
    return false;
  } catch {
    emitCloudSaveStatus('saved_local');
    return false;
  } finally {
    corePushExpectedNextRev = null;
  }
}

function flushNextQueuedCorePush(): void {
  const nextItem = queuedCorePush;
  if (!nextItem) {
    corePushInFlight = null;
    return;
  }
  queuedCorePush = null;
  const nextTask = executePortfolioCorePushOnce(nextItem.input, nextItem.options);
  corePushInFlight = nextTask;
  nextTask.then(
    (ok) => {
      for (const resolve of nextItem.resolvers) resolve(ok);
      flushNextQueuedCorePush();
    },
    () => {
      for (const resolve of nextItem.resolvers) resolve(false);
      flushNextQueuedCorePush();
    }
  );
}

/**
 * Сериализованная отправка `portfolio_core_v1` в Supabase (single-flight + схлопывание очереди):
 * в любой момент активен максимум один RPC `upsert_portfolio_kv_safe`, что исключает конкуренцию
 * на `SELECT ... FOR UPDATE` и ошибки Postgres `statement timeout (500)` при быстрых правках.
 */
export function pushPortfolioCoreToSupabase(
  input: Omit<CloudPortfolioCorePayload, 'updatedAtIso'>,
  options?: CloudPushOptions
): Promise<boolean> {
  if (corePushInFlight) {
    return new Promise<boolean>((resolve) => {
      if (queuedCorePush) {
        queuedCorePush.input = input;
        queuedCorePush.options = options;
        queuedCorePush.resolvers.push(resolve);
      } else {
        queuedCorePush = { input, options, resolvers: [resolve] };
      }
    });
  }

  const task = executePortfolioCorePushOnce(input, options);
  corePushInFlight = task;
  return task.finally(() => {
    if (corePushInFlight === task) {
      flushNextQueuedCorePush();
    }
  });
}

export async function pullPortfolioFromSupabase(): Promise<CloudPortfolioCorePayload | null> {
  const client = getActiveSupabaseClient();
  if (!client) return null;
  if (inFlightPortfolioPull) return inFlightPortfolioPull;

  const task = (async (): Promise<CloudPortfolioCorePayload | null> => {
    try {
      const orFilter = `key.eq.${SUPABASE_CORE_KEY},key.like.${SUPABASE_GALLERY_KEY_PREFIX}%`;
      let data: SupabaseKvRow[] | null = null;
      let error: { code?: string; message?: string } | null = null;

      const firstAttempt = await client
        .from(SUPABASE_PORTFOLIO_TABLE)
        .select('key, payload, updated_at, revision')
        .or(orFilter);
      data = firstAttempt.data as SupabaseKvRow[] | null;
      error = firstAttempt.error;

      if (error && isMissingColumnError(error, 'revision')) {
        const fallbackAttempt = await client
          .from(SUPABASE_PORTFOLIO_TABLE)
          .select('key, payload, updated_at')
          .or(orFilter);
        data = fallbackAttempt.data as SupabaseKvRow[] | null;
        error = fallbackAttempt.error;
      }

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

      const serverRevision = parseRevisionNumber(coreRow.revision);
      if (serverRevision !== null) {
        lastKnownCoreRevision = serverRevision;
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
          m.gallery.some((g) => isGalleryPlaceholderSentinel(g?.url));
        const hasRealUrl =
          Array.isArray(m.gallery) &&
          m.gallery.some(
            (g) =>
              typeof g?.url === 'string' &&
              g.url.trim().length > 0 &&
              !isGalleryPlaceholderSentinel(g.url)
          );
        const cloudGal = galleriesByModelId.get(m.id);
        if (cloudGal && cloudGal.length > 0 && (hasGalleryRef || !hasRealUrl)) {
          lastSyncedGalleryFingerprintByModelId.set(m.id, computeGalleryFingerprint(cloudGal));
          explicitlyDeletedGalleryModelIds.delete(m.id);
          return {
            ...m,
            gallery: cloudGal,
          };
        }
        if (cloudGal && cloudGal.length === 0) {
          lastSyncedGalleryFingerprintByModelId.set(m.id, 'EMPTY');
          if (hasGalleryRef || !hasRealUrl) {
            return {
              ...m,
              gallery: [],
            };
          }
          return m;
        }
        if (hasGalleryRef) {
          return {
            ...m,
            gallery: m.gallery.filter((g) => !isGalleryPlaceholderSentinel(g?.url)),
          };
        }
        return m;
      });

      const rowUpdatedAt =
        typeof coreRow.updated_at === 'string' ? coreRow.updated_at : '';
      const resolvedCloudUpdatedAt = core.updatedAtIso || rowUpdatedAt || '';
      if (resolvedCloudUpdatedAt) {
        const prevKnownMs = parseIsoTs(lastKnownCloudUpdatedAtIso);
        const nextKnownMs = parseIsoTs(resolvedCloudUpdatedAt);
        if (!Number.isFinite(prevKnownMs) || (Number.isFinite(nextKnownMs) && nextKnownMs > prevKnownMs)) {
          lastKnownCloudUpdatedAtIso = resolvedCloudUpdatedAt;
        }
      }

      return {
        ...core,
        updatedAtIso: resolvedCloudUpdatedAt,
        serverRevision: serverRevision ?? undefined,
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
let lastLocalWorkspacePushRevision: number | null = null;
let workspacePushInFlight: Promise<boolean> | null = null;
let workspacePushExpectedNextRev: number | null = null;
let queuedWorkspacePush: {
  input: Omit<CloudPlatformWorkspacePayload, 'updatedAtIso'>;
  options?: CloudPushOptions;
  resolvers: Array<(ok: boolean) => void>;
} | null = null;
let inFlightWorkspacePull: Promise<CloudPlatformWorkspacePayload | null> | null = null;

export function getLastLocalWorkspacePushIso(): string {
  return lastLocalWorkspacePushIso;
}

async function executePlatformWorkspacePushOnce(
  input: Omit<CloudPlatformWorkspacePayload, 'updatedAtIso'>,
  options?: CloudPushOptions
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

    if (mySeq < latestWorkspacePushSeq || queuedWorkspacePush !== null) return true;

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
    let currentPayload: CloudPlatformWorkspacePayload = {
      ...input,
      concepts: compactConcepts,
      miroItems: compactMiro,
      updatedAtIso: nowIso,
    };
    lastLocalWorkspacePushIso = nowIso;

    const initialExpectedRev =
      options?.expectedRevision !== undefined
        ? options.expectedRevision
        : lastKnownWorkspaceRevision;
    let expectedRev: number | null = initialExpectedRev;
    const maxRetries = Math.max(0, options?.maxConflictRetries ?? 2);
    let hadConflictMerge = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (mySeq < latestWorkspacePushSeq) return true;

      const payloadForRpc: CloudPlatformWorkspacePayload = {
        ...currentPayload,
        serverRevision: undefined,
      };
      delete payloadForRpc.serverRevision;

      workspacePushExpectedNextRev = expectedRev !== null ? expectedRev + 1 : null;

      const { data: rpcRaw, error: rpcError } = await client.rpc('upsert_portfolio_kv_safe', {
        p_key: SUPABASE_WORKSPACE_KEY,
        p_payload: payloadForRpc,
        p_expected_revision: expectedRev,
      });

      if (rpcError) {
        if (isMissingRpcError(rpcError)) {
          const { error: upsertErr } = await client.from(SUPABASE_PORTFOLIO_TABLE).upsert(
            {
              key: SUPABASE_WORKSPACE_KEY,
              payload: payloadForRpc,
              updated_at: payloadForRpc.updatedAtIso,
            },
            { onConflict: 'key' }
          );
          return !upsertErr;
        }
        return false;
      }

      const rpcRes = (Array.isArray(rpcRaw) ? rpcRaw[0] : rpcRaw) as SafeUpsertRpcResponse | null;
      if (rpcRes?.ok === true && !rpcRes?.conflict) {
        const nextRev = parseRevisionNumber(rpcRes.server_revision);
        if (nextRev !== null) {
          lastKnownWorkspaceRevision = nextRev;
          lastLocalWorkspacePushRevision = nextRev;
        }
        const serverUpdatedAt =
          typeof rpcRes.server_updated_at === 'string' && rpcRes.server_updated_at
            ? rpcRes.server_updated_at
            : currentPayload.updatedAtIso;
        lastLocalWorkspacePushIso = serverUpdatedAt;

        if (hadConflictMerge) {
          const hydratedForClient: CloudPlatformWorkspacePayload = {
            ...currentPayload,
            concepts: rehydrateLocalConceptMediaAfterConflict(
              currentPayload.concepts,
              input.concepts
            ),
            serverRevision: nextRev ?? undefined,
          };
          emitCloudConflictMerged({
            key: SUPABASE_WORKSPACE_KEY,
            mergedAtIso: currentPayload.updatedAtIso,
            previousRevision: initialExpectedRev,
            serverRevision: nextRev ?? (expectedRev ?? 0),
            mergedPayload: hydratedForClient,
          });
        }
        return true;
      }

      if (rpcRes?.ok === false && rpcRes?.conflict === true) {
        const serverRev = parseRevisionNumber(rpcRes.server_revision);
        if (serverRev !== null) {
          lastKnownWorkspaceRevision = serverRev;
        }
        const rawServerPayload = rpcRes.server_payload as Partial<CloudPlatformWorkspacePayload> | null;
        if (
          !rawServerPayload ||
          typeof rawServerPayload !== 'object' ||
          !Array.isArray(rawServerPayload.concepts)
        ) {
          return false;
        }

        const serverPayload: CloudPlatformWorkspacePayload = {
          ...(rawServerPayload as CloudPlatformWorkspacePayload),
          updatedAtIso:
            rawServerPayload.updatedAtIso ||
            (typeof rpcRes.server_updated_at === 'string' ? rpcRes.server_updated_at : ''),
          serverRevision: serverRev ?? undefined,
        };

        currentPayload = resolveConcurrentWorkspaceConflict(currentPayload, serverPayload);
        expectedRev = serverRev;
        hadConflictMerge = true;
        lastLocalWorkspacePushIso = currentPayload.updatedAtIso;
        continue;
      }

      return false;
    }

    return false;
  } catch {
    return false;
  } finally {
    workspacePushExpectedNextRev = null;
  }
}

function flushNextQueuedWorkspacePush(): void {
  const nextItem = queuedWorkspacePush;
  if (!nextItem) {
    workspacePushInFlight = null;
    return;
  }
  queuedWorkspacePush = null;
  const nextTask = executePlatformWorkspacePushOnce(nextItem.input, nextItem.options);
  workspacePushInFlight = nextTask;
  nextTask.then(
    (ok) => {
      for (const resolve of nextItem.resolvers) resolve(ok);
      flushNextQueuedWorkspacePush();
    },
    () => {
      for (const resolve of nextItem.resolvers) resolve(false);
      flushNextQueuedWorkspacePush();
    }
  );
}

export function pushPlatformWorkspaceToSupabase(
  input: Omit<CloudPlatformWorkspacePayload, 'updatedAtIso'>,
  options?: CloudPushOptions
): Promise<boolean> {
  if (workspacePushInFlight) {
    return new Promise<boolean>((resolve) => {
      if (queuedWorkspacePush) {
        queuedWorkspacePush.input = input;
        queuedWorkspacePush.options = options;
        queuedWorkspacePush.resolvers.push(resolve);
      } else {
        queuedWorkspacePush = { input, options, resolvers: [resolve] };
      }
    });
  }

  const task = executePlatformWorkspacePushOnce(input, options);
  workspacePushInFlight = task;
  return task.finally(() => {
    if (workspacePushInFlight === task) {
      flushNextQueuedWorkspacePush();
    }
  });
}

export async function pullPlatformWorkspaceFromSupabase(): Promise<CloudPlatformWorkspacePayload | null> {
  const client = getActiveSupabaseClient();
  if (!client) return null;
  if (inFlightWorkspacePull) return inFlightWorkspacePull;

  const task = (async (): Promise<CloudPlatformWorkspacePayload | null> => {
    try {
      const orFilter = `key.eq.${SUPABASE_WORKSPACE_KEY},key.like.${SUPABASE_CONCEPT_MEDIA_PREFIX}%`;
      let data: SupabaseKvRow[] | null = null;
      let error: { code?: string; message?: string } | null = null;

      const firstAttempt = await client
        .from(SUPABASE_PORTFOLIO_TABLE)
        .select('key, payload, updated_at, revision')
        .or(orFilter);
      data = firstAttempt.data as SupabaseKvRow[] | null;
      error = firstAttempt.error;

      if (error && isMissingColumnError(error, 'revision')) {
        const fallbackAttempt = await client
          .from(SUPABASE_PORTFOLIO_TABLE)
          .select('key, payload, updated_at')
          .or(orFilter);
        data = fallbackAttempt.data as SupabaseKvRow[] | null;
        error = fallbackAttempt.error;
      }

      if (error || !Array.isArray(data) || data.length === 0) return null;

      const wsRow = data.find((r) => r.key === SUPABASE_WORKSPACE_KEY);
      if (!wsRow || !wsRow.payload || typeof wsRow.payload !== 'object') return null;

      const ws = wsRow.payload as CloudPlatformWorkspacePayload;
      if (!Array.isArray(ws.concepts)) return null;

      const serverRevision = parseRevisionNumber(wsRow.revision);
      if (serverRevision !== null) {
        lastKnownWorkspaceRevision = serverRevision;
      }

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
          mediaMap.set(
            cId,
            row.payload as {
              imageUrl?: string;
              galleryPhotos?: { id?: string; url?: string; caption?: string }[];
            }
          );
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
        const nextGallery =
          Array.isArray(media.galleryPhotos) && media.galleryPhotos.length > 0
            ? media.galleryPhotos
            : c.galleryPhotos;
        return {
          ...c,
          imageUrl: nextImg,
          galleryPhotos: nextGallery,
        };
      });

      const rowUpdatedAt =
        typeof wsRow.updated_at === 'string' ? wsRow.updated_at : '';

      return {
        ...ws,
        concepts: hydratedConcepts,
        updatedAtIso: ws.updatedAtIso || rowUpdatedAt || '',
        serverRevision: serverRevision ?? undefined,
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
const sharedKvListeners = new Set<
  (key: string, updatedAt: string, revision: number | null) => void
>();
let sharedRealtimeChannel: ReturnType<NonNullable<ReturnType<typeof getActiveSupabaseClient>>['channel']> | null = null;
let sharedRealtimeClient: ReturnType<typeof getActiveSupabaseClient> = null;

export function subscribeToSupabaseKvChanges(
  onKeyChanged: (key: string, updatedAt: string, revision: number | null) => void
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
          const nextRow = (payload.new || {}) as {
            key?: string;
            updated_at?: string;
            revision?: number | string | null;
          };
          if (typeof nextRow.key === 'string') {
            const keyStr = nextRow.key;
            const tsStr = typeof nextRow.updated_at === 'string' ? nextRow.updated_at : '';
            const revNum = parseRevisionNumber(nextRow.revision);
            for (const listener of Array.from(sharedKvListeners)) {
              try {
                listener(keyStr, tsStr, revNum);
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
