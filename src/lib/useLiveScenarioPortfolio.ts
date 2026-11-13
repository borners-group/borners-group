'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform } from '@/context/PlatformContext';
import {
  GalleryMediaItem,
  GrowthScenarioDef,
  INITIAL_SCENARIOS,
  ModelPriorityLevel,
  ScenarioModelSpec,
  computeModelScenarioMetrics,
} from '@/lib/scenarioData';
import {
  ACTING_2027_SCENARIO_DEF,
  ACTING_2027_SCENARIO_ID,
  ACTING_2027_SCENARIO_MODELS,
  getActingSkuByWbOrVendor,
} from '@/lib/actingAssortment2027';
import {
  AKUSHA_2027_MODELS,
  AKUSHA_2027_SCENARIO_DEF,
  AKUSHA_2027_SCENARIO_ID,
} from '@/lib/akushaAssortment2027';
import {
  LISKANI_2027_MODELS,
  LISKANI_2027_SCENARIO_DEF,
  LISKANI_2027_SCENARIO_ID,
} from '@/lib/liskaniAssortment2027';
import {
  S1_100M_SCENARIO_MODELS,
  applyClientSavedS1SalesPlan,
  isUnverifiedActingSku,
} from '@/lib/scenarioS1_100M';
import {
  BatchFactoryTermsPatch,
  CanonicalBrandCode,
  applyBatchFactoryPaymentTermsToModels,
  applyCategoryWbUnitEconomics,
  applyCategoryWbUnitEconomicsToPortfolio,
  createBrandProductModel,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  groupRecommendedBatchesByFactory,
  isScenarioCompatibleWithBrand,
  launchAllEmptyCabinetsInHolding,
  launchBrandStarterMatrix,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
  resetStarterCabinetsFromHolding,
} from '@/lib/unifiedBusinessEngine';
import {
  loadAllModelGalleriesFromIdb,
  loadPortfolioSnapshotWithMetaFromIdb,
  safeGetStorageJson,
  safeSetStorageJson,
  saveModelGalleryToIdb,
  savePortfolioSnapshotToIdb,
} from '@/lib/safeStorage';
import {
  pullPortfolioFromSupabase,
  pushModelGalleryToSupabase,
  pushPortfolioCoreToSupabase,
} from '@/lib/supabaseCloudSync';
import {
  STORAGE_KEY_ACTIVE_SCENARIO_ID,
  STORAGE_KEY_DELETED_MODELS,
  STORAGE_KEY_DELETED_SCENARIOS,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_PORTFOLIO_UPDATED_AT,
  STORAGE_KEY_S1_GROUP_PORTFOLIO,
  STORAGE_KEY_SCENARIO_BY_BRAND,
  STORAGE_KEY_SCENARIOS,
  STORAGE_KEY_USER_PLANS_BACKUP,
  clearDeletedModelsRegistry,
  deleteModelFromPortfolio,
  filterModelsForScenario,
  getDeletedModelsRegistry,
  getDeletedScenariosRegistry,
  getPortfolioUpdatedAt,
  hydratePortfolioModelsFromStorage,
  isBrandScenarioExplicitlyNone,
  isModelMarkedDeleted,
  markModelAsDeletedInStorage,
  markScenarioAsDeletedInStorage,
  mergeCloudPortfolioSnapshot,
  overlayBackupOntoModels,
  resolveEffectiveScenarioForModel,
  runBornersSalesScenarioRepairMigrationV1,
  sanitizeSelectedScenarioByBrand,
  syncUserPlansBackup,
  touchPortfolioUpdatedAt,
  unmarkModelAsDeletedInStorage,
} from '@/lib/portfolioPersistence';

export {
  STORAGE_KEY_ACTIVE_SCENARIO_ID,
  STORAGE_KEY_DELETED_MODELS,
  STORAGE_KEY_DELETED_SCENARIOS,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_PORTFOLIO_UPDATED_AT,
  STORAGE_KEY_S1_GROUP_PORTFOLIO,
  STORAGE_KEY_SCENARIO_BY_BRAND,
  STORAGE_KEY_SCENARIOS,
  STORAGE_KEY_USER_PLANS_BACKUP,
  clearDeletedModelsRegistry,
  deleteModelFromPortfolio,
  filterModelsForScenario,
  getDeletedModelsRegistry,
  getDeletedScenariosRegistry,
  getPortfolioUpdatedAt,
  hydratePortfolioModelsFromStorage,
  isBrandScenarioExplicitlyNone,
  isModelMarkedDeleted,
  markModelAsDeletedInStorage,
  markScenarioAsDeletedInStorage,
  mergeCloudPortfolioSnapshot,
  overlayBackupOntoModels,
  resolveEffectiveScenarioForModel,
  runBornersSalesScenarioRepairMigrationV1,
  sanitizeSelectedScenarioByBrand,
  syncUserPlansBackup,
  touchPortfolioUpdatedAt,
  unmarkModelAsDeletedInStorage,
};

const DEFAULT_MODELS_LIST: ScenarioModelSpec[] = applyClientSavedS1SalesPlan([
  ...ACTING_2027_SCENARIO_MODELS,
  ...S1_100M_SCENARIO_MODELS,
  ...LISKANI_2027_MODELS,
  ...AKUSHA_2027_MODELS,
]);

const DEFAULT_SCENARIOS_LIST: GrowthScenarioDef[] = [
  ...INITIAL_SCENARIOS,
  LISKANI_2027_SCENARIO_DEF,
  AKUSHA_2027_SCENARIO_DEF,
];

export function useLiveScenarioPortfolio() {
  const { brandFilter } = usePlatform();
  const [scenarios, setScenarios] =
    useState<GrowthScenarioDef[]>(DEFAULT_SCENARIOS_LIST);
  const [models, setModels] = useState<ScenarioModelSpec[]>(DEFAULT_MODELS_LIST);
  const [selectedScenarioId, setSelectedScenarioIdState] = useState<number>(1);
  const [includeGroupPortfolioInS1, setIncludeGroupState] = useState<boolean>(false);
  const [selectedScenarioByBrand, setSelectedScenarioByBrandState] = useState<
    Partial<Record<CanonicalBrandCode, number | null>>
  >({
    BORNERS: 1,
    FUKAI: ACTING_2027_SCENARIO_ID,
    AKUSHA: AKUSHA_2027_SCENARIO_ID,
    LISKANI: LISKANI_2027_SCENARIO_ID,
    NA_TELE: 2,
  });

  const brandFilterRef = useRef(brandFilter);
  brandFilterRef.current = brandFilter;
  const modelsRef = useRef(models);
  modelsRef.current = models;
  const scenariosRef = useRef(scenarios);
  scenariosRef.current = scenarios;
  const selectedScenarioByBrandRef = useRef(selectedScenarioByBrand);
  selectedScenarioByBrandRef.current = selectedScenarioByBrand;
  const includeGroupRef = useRef(includeGroupPortfolioInS1);
  includeGroupRef.current = includeGroupPortfolioInS1;
  const localMutationSeqRef = useRef(0);

  const cloudDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleCompleteCloudPush = useCallback(
    (
      overrides?: {
        models?: ScenarioModelSpec[];
        scenarios?: GrowthScenarioDef[];
        selectedScenarioByBrand?: Partial<Record<CanonicalBrandCode, number | null>>;
        includeGroupPortfolioInS1?: boolean;
      },
      immediate = false
    ) => {
      if (overrides?.models) modelsRef.current = overrides.models;
      if (overrides?.scenarios) scenariosRef.current = overrides.scenarios;
      if (overrides?.selectedScenarioByBrand) {
        selectedScenarioByBrandRef.current = overrides.selectedScenarioByBrand;
      }
      if (typeof overrides?.includeGroupPortfolioInS1 === 'boolean') {
        includeGroupRef.current = overrides.includeGroupPortfolioInS1;
      }

      const runPush = () => {
        const byBrandRecord: Record<string, number | null> = {};
        for (const [k, v] of Object.entries(selectedScenarioByBrandRef.current || {})) {
          if (v === null || typeof v === 'number') {
            byBrandRecord[k] = v;
          }
        }
        void pushPortfolioCoreToSupabase({
          models: modelsRef.current,
          scenarios: scenariosRef.current,
          selectedScenarioByBrand: byBrandRecord,
          includeGroupPortfolioInS1: includeGroupRef.current,
          deletedModelIds: getDeletedModelsRegistry(),
          deletedScenarioIds: getDeletedScenariosRegistry(),
        });
      };

      if (cloudDebounceTimerRef.current) {
        clearTimeout(cloudDebounceTimerRef.current);
        cloudDebounceTimerRef.current = null;
      }
      if (immediate || typeof window === 'undefined') {
        runPush();
      } else {
        cloudDebounceTimerRef.current = setTimeout(runPush, 350);
      }
    },
    []
  );

  const ignoreSelfEventsRef = useRef(0);
  const dispatchCrossHookEvent = useCallback((eventName: string) => {
    if (typeof window === 'undefined') return;
    ignoreSelfEventsRef.current += 1;
    try {
      window.dispatchEvent(new CustomEvent(eventName));
    } finally {
      ignoreSelfEventsRef.current = Math.max(0, ignoreSelfEventsRef.current - 1);
    }
  }, []);
  const emitWindowSync = dispatchCrossHookEvent;

  const syncFromStorage = useCallback(() => {
    if (ignoreSelfEventsRef.current > 0) return;
    const hydratedModels = hydratePortfolioModelsFromStorage();
    setModels((prev) => {
      // Сохраняем уже загруженные в память base64-фотографии из IndexedDB, если в localStorage они были облегчены
      const prevById = new Map<string, ScenarioModelSpec>();
      for (const pm of prev) {
        prevById.set(pm.id, pm);
      }
      return hydratedModels.map((hm) => {
        const pm = prevById.get(hm.id);
        if (!pm || !Array.isArray(pm.gallery) || pm.gallery.length === 0) return hm;
        const hmValidCount = Array.isArray(hm.gallery)
          ? hm.gallery.filter((g) => Boolean(g?.url && g.url.length > 0)).length
          : 0;
        const pmValidCount = pm.gallery.filter((g) => Boolean(g?.url && g.url.length > 0)).length;
        const isExplicitEmptyInStorage = Array.isArray(hm.gallery) && hm.gallery.length === 0;
        if (!isExplicitEmptyInStorage && pmValidCount > hmValidCount) {
          return { ...hm, gallery: pm.gallery };
        }
        return hm;
      });
    });

    const parsedScen = safeGetStorageJson<GrowthScenarioDef[]>(STORAGE_KEY_SCENARIOS);
    const deletedScenSet = new Set(getDeletedScenariosRegistry());
    let effectiveScenList = DEFAULT_SCENARIOS_LIST;
    if (Array.isArray(parsedScen) && parsedScen.length > 0) {
      let nextScen = parsedScen.filter((s) => s && !deletedScenSet.has(s.id));
      if (!nextScen.some((s) => s.id === ACTING_2027_SCENARIO_ID)) {
        nextScen = [ACTING_2027_SCENARIO_DEF, ...nextScen];
      }
      if (!nextScen.some((s) => s.id === LISKANI_2027_SCENARIO_ID)) {
        nextScen = [...nextScen, LISKANI_2027_SCENARIO_DEF];
      }
      if (!nextScen.some((s) => s.id === AKUSHA_2027_SCENARIO_ID)) {
        nextScen = [...nextScen, AKUSHA_2027_SCENARIO_DEF];
      }
      effectiveScenList = nextScen;
      scenariosRef.current = nextScen;
      setScenarios(nextScen);
    }

    const savedByBrand = safeGetStorageJson<
      Partial<Record<CanonicalBrandCode, number | null>>
    >(STORAGE_KEY_SCENARIO_BY_BRAND);
    const sanitizedByBrand = sanitizeSelectedScenarioByBrand(
      savedByBrand,
      effectiveScenList
    );
    const effectiveBornersScen =
      typeof sanitizedByBrand.BORNERS === 'number' ? sanitizedByBrand.BORNERS : 1;
    if (savedByBrand && typeof savedByBrand === 'object') {
      if (
        sanitizedByBrand.BORNERS !== savedByBrand.BORNERS ||
        sanitizedByBrand.FUKAI !== savedByBrand.FUKAI ||
        sanitizedByBrand.LISKANI !== savedByBrand.LISKANI ||
        sanitizedByBrand.AKUSHA !== savedByBrand.AKUSHA ||
        sanitizedByBrand.NA_TELE !== savedByBrand.NA_TELE
      ) {
        safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, sanitizedByBrand);
      }
      setSelectedScenarioByBrandState((prev) => ({ ...prev, ...sanitizedByBrand }));
    }

    const savedScenId = safeGetStorageJson<number>(STORAGE_KEY_ACTIVE_SCENARIO_ID);
    if (typeof savedScenId === 'number') {
      const liveFilter = brandFilterRef.current;
      const normActiveBrand =
        liveFilter && liveFilter !== 'ALL'
          ? normalizePortfolioBrandCode(liveFilter)
          : 'ALL';
      const foundSavedScen = effectiveScenList.find((s) => s.id === savedScenId && !s.isArchived);
      const isForeignForBornersOrAll =
        (normActiveBrand === 'ALL' || normActiveBrand === 'BORNERS') &&
        (!foundSavedScen ||
          !isScenarioCompatibleWithBrand(foundSavedScen, 'BORNERS') ||
          savedScenId === AKUSHA_2027_SCENARIO_ID ||
          savedScenId === LISKANI_2027_SCENARIO_ID ||
          (savedScenId === ACTING_2027_SCENARIO_ID &&
            effectiveBornersScen !== ACTING_2027_SCENARIO_ID));
      const isIncompatibleForBrand =
        normActiveBrand !== 'ALL' &&
        normActiveBrand !== 'BORNERS' &&
        (!foundSavedScen || !isScenarioCompatibleWithBrand(foundSavedScen, normActiveBrand));
      const fallbackBrandScen =
        normActiveBrand !== 'ALL' && typeof sanitizedByBrand[normActiveBrand] === 'number'
          ? (sanitizedByBrand[normActiveBrand] as number)
          : normActiveBrand === 'NA_TELE'
          ? 2
          : normActiveBrand === 'AKUSHA'
          ? AKUSHA_2027_SCENARIO_ID
          : normActiveBrand === 'LISKANI'
          ? LISKANI_2027_SCENARIO_ID
          : normActiveBrand === 'FUKAI'
          ? ACTING_2027_SCENARIO_ID
          : effectiveBornersScen;
      const syncedScenId = isForeignForBornersOrAll
        ? effectiveBornersScen
        : isIncompatibleForBrand
        ? fallbackBrandScen
        : savedScenId;
      if (isForeignForBornersOrAll && syncedScenId !== savedScenId) {
        safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, syncedScenId);
      }
      setSelectedScenarioIdState(syncedScenId);
    }

    const savedGroupFlag = safeGetStorageJson<boolean>(STORAGE_KEY_S1_GROUP_PORTFOLIO);
    if (typeof savedGroupFlag === 'boolean') {
      setIncludeGroupState(savedGroupFlag);
    }
  }, []);

  useEffect(() => {
    syncFromStorage();

    let cancelled = false;
    // 1. Сначала дожидаемся восстановления слепка моделей и фотогалерей из IndexedDB,
    // и только затем сверяемся с облаком Supabase (исключает затирание облака облегчённым localStorage)
    void (async () => {
      const seqBeforeIdb = localMutationSeqRef.current;
      const [idbSnapMeta, idbGalleries] = await Promise.all([
        loadPortfolioSnapshotWithMetaFromIdb<ScenarioModelSpec>(),
        loadAllModelGalleriesFromIdb(),
      ]);
      if (cancelled) return;

      const mutatedDuringIdb = localMutationSeqRef.current !== seqBeforeIdb;
      let workingModels =
        localMutationSeqRef.current > 0
          ? [...modelsRef.current]
          : hydratePortfolioModelsFromStorage();
      let localChangedFromIdb = false;

      const localIsoBeforeIdb = getPortfolioUpdatedAt();
      const localTsBeforeIdb = localIsoBeforeIdb ? Date.parse(localIsoBeforeIdb) : NaN;
      const idbTs = idbSnapMeta?.updatedAtIso ? Date.parse(idbSnapMeta.updatedAtIso) : NaN;
      const isIdbNewerThanLocalStorage =
        !mutatedDuringIdb &&
        Number.isFinite(idbTs) &&
        (!Number.isFinite(localTsBeforeIdb) || idbTs > localTsBeforeIdb);

      if (
        !mutatedDuringIdb &&
        idbSnapMeta &&
        Array.isArray(idbSnapMeta.models) &&
        idbSnapMeta.models.length > 0
      ) {
        for (const snapMod of idbSnapMeta.models) {
          if (!snapMod || !snapMod.id || !snapMod.code) continue;
          if (isModelMarkedDeleted(snapMod)) continue;
          const isOldAkushaDraft =
            ((snapMod.customBrandLabel || '').toUpperCase() === 'AKUSHA' ||
              snapMod.code.toUpperCase().startsWith('AKU-') ||
              snapMod.id.toLowerCase().startsWith('scen-akusha-')) &&
            !snapMod.plansByScenario?.[AKUSHA_2027_SCENARIO_ID];
          if (isOldAkushaDraft) continue;

          const existingIdx = workingModels.findIndex(
            (m) =>
              m.id === snapMod.id ||
              m.code.trim().toUpperCase() === snapMod.code.trim().toUpperCase()
          );
          if (existingIdx < 0) {
            workingModels.push(ensureModelUnifiedV11(applyCategoryWbUnitEconomics(snapMod)));
            localChangedFromIdb = true;
          } else if (isIdbNewerThanLocalStorage) {
            workingModels[existingIdx] = ensureModelUnifiedV11(
              applyCategoryWbUnitEconomics(snapMod)
            );
            localChangedFromIdb = true;
          }
        }
      }

      const galleryKeys = Object.keys(idbGalleries || {});
      if (!mutatedDuringIdb && galleryKeys.length > 0) {
        workingModels = workingModels.map((m) => {
          const idbGal = (idbGalleries[m.id] || idbGalleries[m.code]) as
            | GalleryMediaItem[]
            | undefined;
          if (!Array.isArray(idbGal) || idbGal.length === 0) return m;
          const idbValidCount = idbGal.filter(
            (g) => typeof g?.url === 'string' && g.url.length > 0
          ).length;
          const localValidCount = Array.isArray(m.gallery)
            ? m.gallery.filter((g) => typeof g?.url === 'string' && g.url.length > 0).length
            : 0;
          const isExplicitEmpty = Array.isArray(m.gallery) && m.gallery.length === 0;
          if (!isExplicitEmpty && idbValidCount > localValidCount) {
            localChangedFromIdb = true;
            return { ...m, gallery: idbGal };
          }
          return m;
        });
      }

      if (localChangedFromIdb) {
        const effectiveIso =
          isIdbNewerThanLocalStorage && idbSnapMeta?.updatedAtIso
            ? idbSnapMeta.updatedAtIso
            : localIsoBeforeIdb || undefined;
        safeSetStorageJson(STORAGE_KEY_MODELS, workingModels);
        syncUserPlansBackup(workingModels);
        void savePortfolioSnapshotToIdb(workingModels, effectiveIso);
        modelsRef.current = workingModels;
        setModels(workingModels);
        emitWindowSync('borners-scenario-models-changed');
        emitWindowSync('borners-scenarios-changed');
        emitWindowSync('borners-active-scenario-changed');
      }

      const seqBeforeCloud = localMutationSeqRef.current;
      const cloud = await pullPortfolioFromSupabase();
      if (cancelled || !cloud || !Array.isArray(cloud.models) || cloud.models.length === 0) {
        return;
      }

      if (Array.isArray(cloud.deletedModelIds) && cloud.deletedModelIds.length > 0) {
        const unionDeleted = Array.from(
          new Set([...getDeletedModelsRegistry(), ...cloud.deletedModelIds])
        );
        safeSetStorageJson(STORAGE_KEY_DELETED_MODELS, unionDeleted);
      }

      if (Array.isArray(cloud.deletedScenarioIds) && cloud.deletedScenarioIds.length > 0) {
        for (const delScenId of cloud.deletedScenarioIds) {
          markScenarioAsDeletedInStorage(delScenId);
        }
      }

      const mutatedDuringCloud = localMutationSeqRef.current !== seqBeforeCloud;
      const latestLocalModels =
        localMutationSeqRef.current > 0
          ? [...modelsRef.current]
          : hydratePortfolioModelsFromStorage();
      const rawLocalUpdatedAtIso = getPortfolioUpdatedAt();
      const localUpdatedAtIso =
        mutatedDuringCloud && !rawLocalUpdatedAtIso
          ? new Date().toISOString()
          : rawLocalUpdatedAtIso;
      const localTs = localUpdatedAtIso ? Date.parse(localUpdatedAtIso) : NaN;
      const cloudTs = cloud.updatedAtIso ? Date.parse(cloud.updatedAtIso) : NaN;
      const isCloudNewer =
        !mutatedDuringCloud &&
        Number.isFinite(cloudTs) &&
        (!Number.isFinite(localTs) || cloudTs > localTs);

      const mergeRes = mergeCloudPortfolioSnapshot({
        localModels: latestLocalModels,
        cloudModels: cloud.models,
        localUpdatedAtIso: mutatedDuringCloud
          ? new Date(Math.max(Date.now(), Number.isFinite(cloudTs) ? cloudTs + 1 : 0)).toISOString()
          : localUpdatedAtIso,
        cloudUpdatedAtIso: cloud.updatedAtIso,
      });

      for (const m of mergeRes.models) {
        if (
          Array.isArray(m.gallery) &&
          m.gallery.some((g) => typeof g?.url === 'string' && g.url.startsWith('data:image/'))
        ) {
          void saveModelGalleryToIdb(m.id, m.gallery);
        }
      }

      safeSetStorageJson(STORAGE_KEY_MODELS, mergeRes.models);
      syncUserPlansBackup(mergeRes.models);
      void savePortfolioSnapshotToIdb(
        mergeRes.models,
        isCloudNewer && cloud.updatedAtIso ? cloud.updatedAtIso : localUpdatedAtIso || undefined
      );
      modelsRef.current = mergeRes.models;
      setModels(mergeRes.models);

      const deletedScenSet = new Set(getDeletedScenariosRegistry());
      let nextScen = (
        safeGetStorageJson<GrowthScenarioDef[]>(STORAGE_KEY_SCENARIOS) || DEFAULT_SCENARIOS_LIST
      ).filter((s) => s && !deletedScenSet.has(s.id));
      if (Array.isArray(cloud.scenarios) && cloud.scenarios.length > 0) {
        const localScenarios = safeGetStorageJson<GrowthScenarioDef[]>(STORAGE_KEY_SCENARIOS) || [];
        const filteredLocalScenarios = localScenarios.filter((s) => s && !deletedScenSet.has(s.id));
        const cleanCloudScenarios = cloud.scenarios.filter(
          (s) => s && !deletedScenSet.has(s.id)
        );
        const preferLocalScenarios =
          mutatedDuringCloud ||
          (Number.isFinite(localTs) && (!Number.isFinite(cloudTs) || localTs >= cloudTs));

        nextScen =
          preferLocalScenarios && filteredLocalScenarios.length > 0
            ? [...filteredLocalScenarios]
            : [...cleanCloudScenarios];

        const secondaryScenarios = preferLocalScenarios
          ? cleanCloudScenarios
          : filteredLocalScenarios;
        for (const extra of secondaryScenarios) {
          if (
            extra &&
            typeof extra.id === 'number' &&
            !deletedScenSet.has(extra.id) &&
            !nextScen.some((s) => s.id === extra.id)
          ) {
            nextScen.push(extra);
          }
        }
        if (!nextScen.some((s) => s.id === ACTING_2027_SCENARIO_ID)) {
          nextScen = [ACTING_2027_SCENARIO_DEF, ...nextScen];
        }
        if (!nextScen.some((s) => s.id === LISKANI_2027_SCENARIO_ID)) {
          nextScen = [...nextScen, LISKANI_2027_SCENARIO_DEF];
        }
        if (!nextScen.some((s) => s.id === AKUSHA_2027_SCENARIO_ID)) {
          nextScen = [...nextScen, AKUSHA_2027_SCENARIO_DEF];
        }
        safeSetStorageJson(STORAGE_KEY_SCENARIOS, nextScen);
        scenariosRef.current = nextScen;
        setScenarios(nextScen);
      }

      if (isCloudNewer && cloud.selectedScenarioByBrand && typeof cloud.selectedScenarioByBrand === 'object') {
        const sanitizedCloudMap = sanitizeSelectedScenarioByBrand(
          cloud.selectedScenarioByBrand as Partial<Record<CanonicalBrandCode, number | null>>,
          nextScen
        );
        safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, sanitizedCloudMap);
        selectedScenarioByBrandRef.current = sanitizedCloudMap;
        setSelectedScenarioByBrandState(sanitizedCloudMap);
      }

      if (isCloudNewer && typeof cloud.includeGroupPortfolioInS1 === 'boolean') {
        safeSetStorageJson(STORAGE_KEY_S1_GROUP_PORTFOLIO, cloud.includeGroupPortfolioInS1);
        includeGroupRef.current = cloud.includeGroupPortfolioInS1;
        setIncludeGroupState(cloud.includeGroupPortfolioInS1);
      }

      if (mergeRes.shouldPushLocalToCloud) {
        scheduleCompleteCloudPush({ models: mergeRes.models, scenarios: nextScen }, true);
      } else if (cloud.updatedAtIso) {
        touchPortfolioUpdatedAt(cloud.updatedAtIso);
      }

      emitWindowSync('borners-scenario-models-changed');
      emitWindowSync('borners-scenarios-changed');
      emitWindowSync('borners-active-scenario-changed');
    })();

    window.addEventListener('borners-scenario-models-changed', syncFromStorage);
    window.addEventListener('borners-scenarios-changed', syncFromStorage);
    window.addEventListener('borners-active-scenario-changed', syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('borners-scenario-models-changed', syncFromStorage);
      window.removeEventListener('borners-scenarios-changed', syncFromStorage);
      window.removeEventListener('borners-active-scenario-changed', syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, [syncFromStorage, scheduleCompleteCloudPush, emitWindowSync]);

  const setSelectedScenarioId = useCallback(
    (nextId: number, explicitBrandOverride?: string) => {
      localMutationSeqRef.current += 1;
      setSelectedScenarioIdState(nextId);
      safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, nextId);
      const targetScenario = scenarios.find((s) => s.id === nextId);
      const effectiveBrand =
        explicitBrandOverride !== undefined ? explicitBrandOverride : brandFilter;

      if (effectiveBrand && effectiveBrand !== 'ALL') {
        const normCode = normalizePortfolioBrandCode(effectiveBrand);
        if (normCode !== 'ALL') {
          const targetOwner =
            targetScenario?.ownerBrandCode && targetScenario.ownerBrandCode !== 'ALL'
              ? normalizePortfolioBrandCode(targetScenario.ownerBrandCode)
              : null;
          const safeBrandSlot =
            targetOwner && targetOwner !== normCode ? targetOwner : normCode;

          if (
            !targetScenario ||
            isScenarioCompatibleWithBrand(targetScenario, safeBrandSlot)
          ) {
            setSelectedScenarioByBrandState((prev) => {
              const next = sanitizeSelectedScenarioByBrand(
                { ...prev, [safeBrandSlot]: nextId },
                scenarios
              );
              safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, next);
              touchPortfolioUpdatedAt();
              scheduleCompleteCloudPush({ selectedScenarioByBrand: next });
              return next;
            });
          }
        }
      } else {
        const targetOwner =
          targetScenario?.ownerBrandCode && targetScenario.ownerBrandCode !== 'ALL'
            ? normalizePortfolioBrandCode(targetScenario.ownerBrandCode)
            : null;
        setSelectedScenarioByBrandState((prev) => {
          const patch: Partial<Record<CanonicalBrandCode, number | null>> = { ...prev };
          if (targetOwner && targetOwner !== 'ALL') {
            patch[targetOwner] = nextId;
          } else {
            patch.BORNERS = nextId;
            if (
              nextId !== ACTING_2027_SCENARIO_ID &&
              nextId !== 1 &&
              (!targetScenario || isScenarioCompatibleWithBrand(targetScenario, 'NA_TELE'))
            ) {
              patch.NA_TELE = nextId;
            }
            if (nextId === ACTING_2027_SCENARIO_ID) {
              patch.FUKAI = ACTING_2027_SCENARIO_ID;
            }
          }
          const next = sanitizeSelectedScenarioByBrand(patch, scenarios);
          safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, next);
          touchPortfolioUpdatedAt();
          scheduleCompleteCloudPush({ selectedScenarioByBrand: next });
          return next;
        });
      }
      dispatchCrossHookEvent('borners-active-scenario-changed');
    },
    [brandFilter, scenarios, dispatchCrossHookEvent, scheduleCompleteCloudPush]
  );

  const setIncludeGroupPortfolioInS1 = useCallback(
    (nextVal: boolean) => {
      localMutationSeqRef.current += 1;
      setIncludeGroupState(nextVal);
      safeSetStorageJson(STORAGE_KEY_S1_GROUP_PORTFOLIO, nextVal);
      touchPortfolioUpdatedAt();
      scheduleCompleteCloudPush({ includeGroupPortfolioInS1: nextVal });
      dispatchCrossHookEvent('borners-active-scenario-changed');
    },
    [dispatchCrossHookEvent, scheduleCompleteCloudPush]
  );

  const setSelectedScenarioForBrand = useCallback(
    (brandInput: string, scenarioId: number | null) => {
      localMutationSeqRef.current += 1;
      const code = normalizePortfolioBrandCode(brandInput);
      if (code === 'ALL') return;
      if (scenarioId !== null) {
        const targetScen = scenarios.find((s) => s.id === scenarioId);
        if (targetScen && !isScenarioCompatibleWithBrand(targetScen, code)) {
          return;
        }
      }
      if (
        scenarioId !== null &&
        brandFilterRef.current &&
        brandFilterRef.current !== 'ALL' &&
        normalizePortfolioBrandCode(brandFilterRef.current) === code
      ) {
        setSelectedScenarioIdState(scenarioId);
        safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, scenarioId);
      }
      setSelectedScenarioByBrandState((prev) => {
        const next = sanitizeSelectedScenarioByBrand(
          { ...prev, [code]: scenarioId },
          scenarios
        );
        safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, next);
        touchPortfolioUpdatedAt();
        scheduleCompleteCloudPush({ selectedScenarioByBrand: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-active-scenario-changed');
          }, 0);
        }
        return next;
      });
    },
    [scenarios, dispatchCrossHookEvent, scheduleCompleteCloudPush]
  );

  const updateScenariosBatch = useCallback(
    (updater: (prev: GrowthScenarioDef[]) => GrowthScenarioDef[]) => {
      localMutationSeqRef.current += 1;
      setScenarios((prev) => {
        const next = updater(prev);
        const nextIds = new Set(next.map((s) => s.id));
        for (const s of prev) {
          if (!nextIds.has(s.id)) {
            markScenarioAsDeletedInStorage(s.id);
          }
        }
        safeSetStorageJson(STORAGE_KEY_SCENARIOS, next);
        touchPortfolioUpdatedAt();
        scenariosRef.current = next;
        scheduleCompleteCloudPush({ scenarios: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-scenarios-changed');
          }, 0);
        }
        return next;
      });
    },
    [dispatchCrossHookEvent, scheduleCompleteCloudPush]
  );

  const deleteScenarioById = useCallback(
    (scenarioId: number) => {
      if ([1, ACTING_2027_SCENARIO_ID, LISKANI_2027_SCENARIO_ID, AKUSHA_2027_SCENARIO_ID].includes(scenarioId)) {
        return;
      }
      localMutationSeqRef.current += 1;
      markScenarioAsDeletedInStorage(scenarioId);
      setScenarios((prev) => {
        const next = prev.filter((s) => s.id !== scenarioId);
        safeSetStorageJson(STORAGE_KEY_SCENARIOS, next);
        touchPortfolioUpdatedAt();
        scenariosRef.current = next;
        scheduleCompleteCloudPush({ scenarios: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-scenarios-changed');
          }, 0);
        }
        return next;
      });
    },
    [dispatchCrossHookEvent, scheduleCompleteCloudPush]
  );

  const deleteModelSpec = useCallback(
    (modelToDelete: Pick<ScenarioModelSpec, 'id' | 'code'>) => {
      localMutationSeqRef.current += 1;
      setModels((prev) => {
        const next = deleteModelFromPortfolio(prev, modelToDelete);
        const iso = getPortfolioUpdatedAt() || touchPortfolioUpdatedAt();
        void savePortfolioSnapshotToIdb(next, iso);
        modelsRef.current = next;
        scheduleCompleteCloudPush({ models: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-scenario-models-changed');
          }, 0);
        }
        return next;
      });
    },
    [dispatchCrossHookEvent, scheduleCompleteCloudPush]
  );

  const updateModelSpec = useCallback(
    (updated: ScenarioModelSpec) => {
      localMutationSeqRef.current += 1;
      if (Array.isArray(updated.gallery)) {
        void saveModelGalleryToIdb(updated.id, updated.gallery);
        void pushModelGalleryToSupabase(updated.id, updated.gallery);
      }
      setModels((prev) => {
        const next = prev.map((m) => (m.id === updated.id ? updated : m));
        const iso = touchPortfolioUpdatedAt();
        safeSetStorageJson(STORAGE_KEY_MODELS, next);
        syncUserPlansBackup(next);
        void savePortfolioSnapshotToIdb(next, iso);
        modelsRef.current = next;
        scheduleCompleteCloudPush({ models: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-scenario-models-changed');
          }, 0);
        }
        return next;
      });
    },
    [dispatchCrossHookEvent, scheduleCompleteCloudPush]
  );

  const updateModelsBatch = useCallback(
    (updater: (prev: ScenarioModelSpec[]) => ScenarioModelSpec[]) => {
      localMutationSeqRef.current += 1;
      setModels((prev) => {
        const next = updater(prev);
        for (const m of next) {
          if (Array.isArray(m.gallery)) {
            if (m.gallery.length === 0) {
              void saveModelGalleryToIdb(m.id, []);
              void pushModelGalleryToSupabase(m.id, []);
            } else if (
              m.gallery.some((g) => typeof g?.url === 'string' && g.url.startsWith('data:image/'))
            ) {
              void saveModelGalleryToIdb(m.id, m.gallery);
              void pushModelGalleryToSupabase(m.id, m.gallery);
            }
          }
        }
        const iso = touchPortfolioUpdatedAt();
        safeSetStorageJson(STORAGE_KEY_MODELS, next);
        syncUserPlansBackup(next);
        void savePortfolioSnapshotToIdb(next, iso);
        modelsRef.current = next;
        scheduleCompleteCloudPush({ models: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-scenario-models-changed');
          }, 0);
        }
        return next;
      });
    },
    [dispatchCrossHookEvent, scheduleCompleteCloudPush]
  );

  const currentScenario = useMemo(() => {
    const direct = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];
    if (brandFilter && brandFilter !== 'ALL') {
      const normBrand = normalizePortfolioBrandCode(brandFilter);
      if (normBrand !== 'ALL') {
        const mappedId = selectedScenarioByBrand[normBrand];
        if (typeof mappedId === 'number') {
          const mappedScen = scenarios.find((s) => s.id === mappedId && !s.isArchived);
          if (mappedScen && isScenarioCompatibleWithBrand(mappedScen, normBrand)) {
            return mappedScen;
          }
        }
        if (
          direct &&
          !direct.isArchived &&
          direct.ownerBrandCode &&
          normalizePortfolioBrandCode(direct.ownerBrandCode) === normBrand
        ) {
          return direct;
        }
        const brandOwned = scenarios.find(
          (s) =>
            !s.isArchived &&
            s.ownerBrandCode &&
            normalizePortfolioBrandCode(s.ownerBrandCode) === normBrand
        );
        if (brandOwned) return brandOwned;
        if (direct && !direct.isArchived && isScenarioCompatibleWithBrand(direct, normBrand)) {
          return direct;
        }
        const fallbackBorners = scenarios.find(
          (s) => !s.isArchived && isScenarioCompatibleWithBrand(s, normBrand)
        );
        if (fallbackBorners) return fallbackBorners;
      }
    } else if (direct && !isScenarioCompatibleWithBrand(direct, 'ALL')) {
      const bornersId = selectedScenarioByBrand.BORNERS || 1;
      const bornersScen = scenarios.find(
        (s) => s.id === bornersId && !s.isArchived && isScenarioCompatibleWithBrand(s, 'ALL')
      );
      if (bornersScen) return bornersScen;
      const defaultS1 = scenarios.find((s) => s.id === 1 && !s.isArchived);
      if (defaultS1) return defaultS1;
    }
    return direct;
  }, [scenarios, selectedScenarioId, brandFilter, selectedScenarioByBrand]);

  const orderedScenarios = useMemo(() => {
    const allSorted = [...scenarios]
      .filter((s) => !s.isArchived)
      .sort((a, b) =>
        a.id === ACTING_2027_SCENARIO_ID
          ? -1
          : b.id === ACTING_2027_SCENARIO_ID
          ? 1
          : a.id - b.id
      );

    if (brandFilter && brandFilter !== 'ALL') {
      const normBrand = normalizePortfolioBrandCode(brandFilter);
      if (normBrand === 'AKUSHA' || normBrand === 'LISKANI') {
        const owned = allSorted.filter(
          (s) =>
            s.ownerBrandCode &&
            normalizePortfolioBrandCode(s.ownerBrandCode) === normBrand
        );
        return owned.length > 0
          ? owned
          : currentScenario
          ? [currentScenario]
          : allSorted;
      }
      if (normBrand === 'BORNERS' || normBrand === 'FUKAI') {
        const compatible = allSorted.filter((s) =>
          isScenarioCompatibleWithBrand(s, normBrand)
        );
        return compatible.length > 0 ? compatible : allSorted;
      }
      if (normBrand === 'NA_TELE') {
        const naTeleList = allSorted.filter(
          (s) =>
            (s.ownerBrandCode &&
              normalizePortfolioBrandCode(s.ownerBrandCode) === 'NA_TELE') ||
            (!s.ownerBrandCode && s.includedBrands.includes('NA_TELE'))
        );
        return naTeleList.length > 0 ? naTeleList : allSorted;
      }
    }

    return allSorted;
  }, [scenarios, brandFilter, currentScenario]);

  const scenarioAllEligibleModels = useMemo(
    () =>
      filterModelsForScenario(
        models,
        currentScenario,
        includeGroupPortfolioInS1,
        'ALL'
      ),
    [models, currentScenario, includeGroupPortfolioInS1]
  );

  const eligibleModels = useMemo(
    () =>
      filterModelsForScenario(
        models,
        currentScenario,
        includeGroupPortfolioInS1,
        brandFilter
      ),
    [models, currentScenario, includeGroupPortfolioInS1, brandFilter]
  );

  const factoryGroupsCount = useMemo(
    () => groupRecommendedBatchesByFactory(eligibleModels, currentScenario).length,
    [eligibleModels, currentScenario]
  );

  const totals = useMemo(() => {
    let annualRevenueRub = 0;
    let decRevenueRub = 0;
    let annualPacks = 0;
    let decPacks = 0;
    let annualOrdersRub = 0;
    let annualOrdersPacks = 0;
    let decOrdersRub = 0;
    let decOrdersPacks = 0;
    const monthlyRevRub = Array(12).fill(0) as number[];
    const monthlyPacks = Array(12).fill(0) as number[];
    const monthlyOrdersRub = Array(12).fill(0) as number[];
    const monthlyOrdersPacks = Array(12).fill(0) as number[];

    for (const m of eligibleModels) {
      const met = computeModelScenarioMetrics(m, currentScenario);
      annualRevenueRub += met.annualRevenueRub;
      decRevenueRub += met.targetMonthRevenueRub;
      annualPacks += met.annualPacks;
      decPacks += met.targetMonthPacks;
      annualOrdersRub += met.annualOrdersRub;
      annualOrdersPacks += met.annualOrdersPacks;
      decOrdersRub += met.targetMonthOrdersRub;
      decOrdersPacks += met.targetMonthOrdersPacks;
      for (let i = 0; i < 12; i++) {
        monthlyRevRub[i] += met.monthlyRevenuesRub[i] || 0;
        monthlyPacks[i] += met.plan.monthlyPacks[i] || 0;
        monthlyOrdersRub[i] += met.monthlyOrdersRub[i] || 0;
        monthlyOrdersPacks[i] += met.monthlyOrdersPacks[i] || 0;
      }
    }

    return {
      annualRevenueRub,
      decRevenueRub,
      annualPacks,
      decPacks,
      annualOrdersRub,
      annualOrdersPacks,
      decOrdersRub,
      decOrdersPacks,
      monthlyRevRub,
      monthlyPacks,
      monthlyOrdersRub,
      monthlyOrdersPacks,
    };
  }, [eligibleModels, currentScenario]);

  const applyIndustryNormsToAllModels = useCallback(
    (fillMissingCost: boolean = true) => {
      localMutationSeqRef.current += 1;
      setModels((prev) => {
        const next = applyCategoryWbUnitEconomicsToPortfolio(prev, {
          fillMissingCost,
          forceOverwriteRates: false,
        });
        const iso = touchPortfolioUpdatedAt();
        safeSetStorageJson(STORAGE_KEY_MODELS, next);
        syncUserPlansBackup(next);
        void savePortfolioSnapshotToIdb(next, iso);
        modelsRef.current = next;
        scheduleCompleteCloudPush({ models: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
          }, 0);
        }
        return next;
      });
    },
    [scheduleCompleteCloudPush]
  );

  const updateBatchFactoryTerms = useCallback(
    (targetModelIds: string[], patch: BatchFactoryTermsPatch, author = 'Владелец') => {
      const idSet = new Set(targetModelIds);
      if (idSet.size === 0) return;
      localMutationSeqRef.current += 1;
      setModels((prev) => {
        const next = applyBatchFactoryPaymentTermsToModels(prev, idSet, patch, author);
        const iso = touchPortfolioUpdatedAt();
        safeSetStorageJson(STORAGE_KEY_MODELS, next);
        syncUserPlansBackup(next);
        void savePortfolioSnapshotToIdb(next, iso);
        modelsRef.current = next;
        scheduleCompleteCloudPush({ models: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
          }, 0);
        }
        return next;
      });
    },
    [scheduleCompleteCloudPush]
  );

  const launchStarterCabinet = useCallback(
    (bCode: 'AKUSHA' | 'LISKANI' | 'NA_TELE') => {
      localMutationSeqRef.current += 1;
      const res = launchBrandStarterMatrix(models, scenarios, bCode);
      const nextByBrand = { ...selectedScenarioByBrandRef.current, [bCode]: res.scenarioId };
      modelsRef.current = res.models;
      scenariosRef.current = res.scenarios;
      setModels(res.models);
      setScenarios(res.scenarios);
      setSelectedScenarioByBrandState(nextByBrand);
      const iso = touchPortfolioUpdatedAt();
      safeSetStorageJson(STORAGE_KEY_MODELS, res.models);
      syncUserPlansBackup(res.models);
      void savePortfolioSnapshotToIdb(res.models, iso);
      safeSetStorageJson(STORAGE_KEY_SCENARIOS, res.scenarios);
      safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, nextByBrand);
      scheduleCompleteCloudPush(
        {
          models: res.models,
          scenarios: res.scenarios,
          selectedScenarioByBrand: nextByBrand,
        },
        true
      );
      setSelectedScenarioIdState(res.scenarioId);
      safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, res.scenarioId);
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
          window.dispatchEvent(new CustomEvent('borners-scenarios-changed'));
          window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
        }, 0);
      }
      return res;
    },
    [models, scenarios, scheduleCompleteCloudPush]
  );

  const launchAllCabinets = useCallback(() => {
    localMutationSeqRef.current += 1;
    const res = launchAllEmptyCabinetsInHolding(
      models,
      scenarios,
      selectedScenarioByBrand
    );
    modelsRef.current = res.models;
    scenariosRef.current = res.scenarios;
    setModels(res.models);
    setScenarios(res.scenarios);
    setSelectedScenarioByBrandState(res.selectedScenarioByBrand);
    const iso = touchPortfolioUpdatedAt();
    safeSetStorageJson(STORAGE_KEY_MODELS, res.models);
    syncUserPlansBackup(res.models);
    void savePortfolioSnapshotToIdb(res.models, iso);
    safeSetStorageJson(STORAGE_KEY_SCENARIOS, res.scenarios);
    safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, res.selectedScenarioByBrand);
    scheduleCompleteCloudPush(
      {
        models: res.models,
        scenarios: res.scenarios,
        selectedScenarioByBrand: res.selectedScenarioByBrand,
      },
      true
    );
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
        window.dispatchEvent(new CustomEvent('borners-scenarios-changed'));
        window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
      }, 0);
    }
    return res;
  }, [models, scenarios, selectedScenarioByBrand, scheduleCompleteCloudPush]);

  const resetStarterCabinets = useCallback(() => {
    localMutationSeqRef.current += 1;
    const res = resetStarterCabinetsFromHolding(
      models,
      scenarios,
      selectedScenarioByBrand
    );
    const hasOfficialLiskani = res.models.some(
      (m) => Array.isArray(m.liskaniSizeVariants) && m.liskaniSizeVariants.length > 0
    );
    const hasOfficialAkusha = res.models.some((m) =>
      Boolean(m.plansByScenario?.[AKUSHA_2027_SCENARIO_ID])
    );
    const nextByBrand = {
      ...res.selectedScenarioByBrand,
      ...(hasOfficialLiskani ? { LISKANI: LISKANI_2027_SCENARIO_ID } : {}),
      ...(hasOfficialAkusha ? { AKUSHA: AKUSHA_2027_SCENARIO_ID } : {}),
    };
    modelsRef.current = res.models;
    scenariosRef.current = res.scenarios;
    setModels(res.models);
    setScenarios(res.scenarios);
    setSelectedScenarioByBrandState(nextByBrand);
    const iso = touchPortfolioUpdatedAt();
    safeSetStorageJson(STORAGE_KEY_MODELS, res.models);
    syncUserPlansBackup(res.models);
    void savePortfolioSnapshotToIdb(res.models, iso);
    safeSetStorageJson(STORAGE_KEY_SCENARIOS, res.scenarios);
    safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, nextByBrand);
    scheduleCompleteCloudPush(
      {
        models: res.models,
        scenarios: res.scenarios,
        selectedScenarioByBrand: nextByBrand,
      },
      true
    );
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
        window.dispatchEvent(new CustomEvent('borners-scenarios-changed'));
        window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
      }, 0);
    }
    return res;
  }, [models, scenarios, selectedScenarioByBrand, scheduleCompleteCloudPush]);

  return {
    scenarios,
    orderedScenarios,
    models,
    currentScenario,
    selectedScenarioId: currentScenario?.id ?? selectedScenarioId,
    setSelectedScenarioId,
    selectedScenarioByBrand,
    setSelectedScenarioForBrand,
    includeGroupPortfolioInS1,
    setIncludeGroupPortfolioInS1,
    scenarioAllEligibleModels,
    eligibleModels,
    factoryGroupsCount,
    totals,
    updateModelSpec,
    updateModelsBatch,
    deleteModelSpec,
    updateScenariosBatch,
    deleteScenarioById,
    applyIndustryNormsToAllModels,
    updateBatchFactoryTerms,
    launchStarterCabinet,
    launchAllCabinets,
    resetStarterCabinets,
  };
}
