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
  CanonicalBrandCode,
  applyCategoryWbUnitEconomics,
  applyCategoryWbUnitEconomicsToPortfolio,
  createBrandProductModel,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  groupRecommendedBatchesByFactory,
  launchAllEmptyCabinetsInHolding,
  launchBrandStarterMatrix,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
  resetStarterCabinetsFromHolding,
} from '@/lib/unifiedBusinessEngine';
import {
  loadAllModelGalleriesFromIdb,
  loadPortfolioSnapshotFromIdb,
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
  STORAGE_KEY_MODELS,
  STORAGE_KEY_S1_GROUP_PORTFOLIO,
  STORAGE_KEY_SCENARIO_BY_BRAND,
  STORAGE_KEY_SCENARIOS,
  STORAGE_KEY_USER_PLANS_BACKUP,
  clearDeletedModelsRegistry,
  deleteModelFromPortfolio,
  hydratePortfolioModelsFromStorage,
  isModelMarkedDeleted,
  markModelAsDeletedInStorage,
  overlayBackupOntoModels,
  syncUserPlansBackup,
  unmarkModelAsDeletedInStorage,
} from '@/lib/portfolioPersistence';

export {
  STORAGE_KEY_ACTIVE_SCENARIO_ID,
  STORAGE_KEY_DELETED_MODELS,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_S1_GROUP_PORTFOLIO,
  STORAGE_KEY_SCENARIO_BY_BRAND,
  STORAGE_KEY_SCENARIOS,
  STORAGE_KEY_USER_PLANS_BACKUP,
  clearDeletedModelsRegistry,
  deleteModelFromPortfolio,
  hydratePortfolioModelsFromStorage,
  isModelMarkedDeleted,
  markModelAsDeletedInStorage,
  overlayBackupOntoModels,
  syncUserPlansBackup,
  unmarkModelAsDeletedInStorage,
};

const DEFAULT_MODELS_LIST: ScenarioModelSpec[] = applyClientSavedS1SalesPlan([
  ...ACTING_2027_SCENARIO_MODELS,
  ...S1_100M_SCENARIO_MODELS,
  ...LISKANI_2027_MODELS,
]);

export function filterModelsForScenario(
  models: ScenarioModelSpec[],
  scenario: GrowthScenarioDef,
  includeGroupPortfolioInS1: boolean,
  brandFilter: string = 'ALL'
): ScenarioModelSpec[] {
  const isActing = scenario.id === ACTING_2027_SCENARIO_ID;
  const normFilter =
    brandFilter && brandFilter !== 'ALL'
      ? normalizePortfolioBrandCode(brandFilter)
      : 'ALL';
  const normOwner =
    scenario.ownerBrandCode && scenario.ownerBrandCode !== 'ALL'
      ? normalizePortfolioBrandCode(scenario.ownerBrandCode)
      : 'ALL';

  return models.filter((m) => {
    if (m.launchStatus === 'В архиве') return false;
    if (
      ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
        m.id
      ) ||
      ['№001', '№002', '№003', '№004'].includes(m.code)
    ) {
      return false;
    }

    if (normFilter !== 'ALL') {
      if (!matchesBrandFilter(m, normFilter)) {
        return false;
      }
      if (normFilter === 'AKUSHA' || normFilter === 'LISKANI') {
        return true;
      }
    }

    if (normOwner !== 'ALL' && normOwner !== 'BORNERS') {
      return matchesBrandFilter(m, normOwner);
    }

    const modelBrand = normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(m));

    if (isActing) {
      if (modelBrand !== 'BORNERS' && modelBrand !== 'FUKAI') {
        return false;
      }
      const okActing =
        Boolean(getActingSkuByWbOrVendor(m.code, m.title)) ||
        Boolean(m.plansByScenario[ACTING_2027_SCENARIO_ID]);
      return okActing;
    }

    if (scenario.id === 1 || normOwner === 'BORNERS') {
      if (modelBrand === 'FUKAI') {
        return includeGroupPortfolioInS1 || normFilter === 'FUKAI';
      }
      if (modelBrand !== 'BORNERS') {
        return false;
      }
      if (!includeGroupPortfolioInS1 && isUnverifiedActingSku(m.code)) {
        return false;
      }
      return true;
    }

    if (modelBrand === 'AKUSHA' || modelBrand === 'LISKANI') {
      return false;
    }

    return scenario.includedBrands.includes(m.brandId) || modelBrand === 'FUKAI';
  });
}

const DEFAULT_SCENARIOS_LIST: GrowthScenarioDef[] = [
  ...INITIAL_SCENARIOS,
  LISKANI_2027_SCENARIO_DEF,
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
    AKUSHA: null,
    LISKANI: LISKANI_2027_SCENARIO_ID,
    NA_TELE: 2,
  });

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

  const syncFromStorage = useCallback(() => {
    if (ignoreSelfEventsRef.current > 0) return;
    const hydratedModels = hydratePortfolioModelsFromStorage();
    setModels(hydratedModels);

    const parsedScen = safeGetStorageJson<GrowthScenarioDef[]>(STORAGE_KEY_SCENARIOS);
    if (Array.isArray(parsedScen) && parsedScen.length > 0) {
      let nextScen = [...parsedScen];
      if (!nextScen.some((s) => s.id === ACTING_2027_SCENARIO_ID)) {
        nextScen = [ACTING_2027_SCENARIO_DEF, ...nextScen];
      }
      if (!nextScen.some((s) => s.id === LISKANI_2027_SCENARIO_ID)) {
        nextScen = [...nextScen, LISKANI_2027_SCENARIO_DEF];
      }
      setScenarios(nextScen);
    }

    const savedByBrand = safeGetStorageJson<
      Partial<Record<CanonicalBrandCode, number | null>>
    >(STORAGE_KEY_SCENARIO_BY_BRAND);
    const effectiveBornersScen =
      savedByBrand && typeof savedByBrand.BORNERS === 'number'
        ? savedByBrand.BORNERS
        : 1;
    if (savedByBrand && typeof savedByBrand === 'object') {
      const normalizedByBrand = { ...savedByBrand };
      if (normalizedByBrand.FUKAI === 1) {
        normalizedByBrand.FUKAI = ACTING_2027_SCENARIO_ID;
      }
      if (!normalizedByBrand.LISKANI) {
        normalizedByBrand.LISKANI = LISKANI_2027_SCENARIO_ID;
      }
      setSelectedScenarioByBrandState((prev) => ({ ...prev, ...normalizedByBrand }));
    }

    const savedScenId = safeGetStorageJson<number>(STORAGE_KEY_ACTIVE_SCENARIO_ID);
    if (typeof savedScenId === 'number') {
      const syncedScenId =
        savedScenId === ACTING_2027_SCENARIO_ID &&
        effectiveBornersScen !== ACTING_2027_SCENARIO_ID
          ? effectiveBornersScen
          : savedScenId;
      setSelectedScenarioIdState(syncedScenId);
    }

    const savedGroupFlag = safeGetStorageJson<boolean>(STORAGE_KEY_S1_GROUP_PORTFOLIO);
    if (typeof savedGroupFlag === 'boolean') {
      setIncludeGroupState(savedGroupFlag);
    }
  }, []);

  useEffect(() => {
    syncFromStorage();
    // 1. Восстанавливаем полный слепок моделей и фотогалерей из IndexedDB, если localStorage был переполнен
    void Promise.all([
      loadPortfolioSnapshotFromIdb<ScenarioModelSpec>(),
      loadAllModelGalleriesFromIdb(),
    ]).then(([idbSnapshot, idbGalleries]) => {
      setModels((prev) => {
        let changed = false;
        let next = [...prev];

        // А) Если в IndexedDB-слепке есть модели, которых нет в localStorage — восстанавливаем их
        if (Array.isArray(idbSnapshot) && idbSnapshot.length > 0) {
          for (const snapMod of idbSnapshot) {
            if (!snapMod || !snapMod.id || !snapMod.code) continue;
            if (isModelMarkedDeleted(snapMod)) continue;
            const exists = next.some(
              (m) =>
                m.id === snapMod.id ||
                m.code.trim().toUpperCase() === snapMod.code.trim().toUpperCase()
            );
            if (!exists) {
              next.push(ensureModelUnifiedV11(applyCategoryWbUnitEconomics(snapMod)));
              changed = true;
            }
          }
        }

        // Б) Подтягиваем фотогалереи из IndexedDB для всех моделей
        const galleryKeys = Object.keys(idbGalleries || {});
        if (galleryKeys.length > 0) {
          next = next.map((m) => {
            const idbGal = (idbGalleries[m.id] || idbGalleries[m.code]) as
              | GalleryMediaItem[]
              | undefined;
            if (!Array.isArray(idbGal) || idbGal.length === 0) return m;
            const hasValidLocalPhoto =
              Array.isArray(m.gallery) &&
              m.gallery.some((g) => typeof g?.url === 'string' && g.url.length > 0);
            if (!hasValidLocalPhoto) {
              changed = true;
              return { ...m, gallery: idbGal };
            }
            return m;
          });

          // В) Если в IndexedDB (model_photo_galleries) остались фото карточек (например scen-akusha-...),
          // которых нет ни в localStorage, ни в слепке — автоматически реконструируем карточки с их фото и названием!
          for (const modelKey of galleryKeys) {
            const idbGal = idbGalleries[modelKey] as GalleryMediaItem[] | undefined;
            if (!Array.isArray(idbGal) || idbGal.length === 0) continue;
            const alreadyPresent = next.some(
              (m) => m.id === modelKey || m.code === modelKey
            );
            if (alreadyPresent) continue;
            if (isModelMarkedDeleted({ id: modelKey, code: modelKey })) continue;

            const keyLower = modelKey.toLowerCase();
            const inferredBrand: CanonicalBrandCode = keyLower.includes('akusha')
              ? 'AKUSHA'
              : keyLower.includes('liskani')
                ? 'LISKANI'
                : keyLower.includes('na_tele')
                  ? 'NA_TELE'
                  : keyLower.includes('fukai')
                    ? 'FUKAI'
                    : 'AKUSHA';
            const primaryItem = idbGal.find((g) => g.isMain) || idbGal[0];
            const recoveredTitle =
              (primaryItem?.label || '').trim() || `Модель ${inferredBrand}`;
            const defaultPrice = inferredBrand === 'AKUSHA' ? 7500 : 2390;
            const defaultCost = inferredBrand === 'AKUSHA' ? 2700 : 620;

            const created = createBrandProductModel(next, INITIAL_SCENARIOS, {
              title: recoveredTitle,
              brandCode: inferredBrand,
              retailPriceRub: defaultPrice,
              unitCostRub: defaultCost,
              unitsInPack: inferredBrand === 'AKUSHA' ? 1 : 4,
              imageUrl: primaryItem?.url || primaryItem?.originalUrl || '',
            });
            const restoredCard: ScenarioModelSpec = {
              ...created.model,
              id: modelKey,
              gallery: idbGal,
            };
            next.push(restoredCard);
            changed = true;
          }
        }

        if (changed) {
          safeSetStorageJson(STORAGE_KEY_MODELS, next);
          syncUserPlansBackup(next);
          void savePortfolioSnapshotToIdb(next);
        }
        return changed ? next : prev;
      });
    });

    void pullPortfolioFromSupabase().then((cloud) => {
      if (!cloud || !Array.isArray(cloud.models) || cloud.models.length === 0) return;
      for (const m of cloud.models) {
        if (
          Array.isArray(m.gallery) &&
          m.gallery.some((g) => typeof g?.url === 'string' && g.url.startsWith('data:image/'))
        ) {
          void saveModelGalleryToIdb(m.id, m.gallery);
        }
      }
      safeSetStorageJson(STORAGE_KEY_MODELS, cloud.models);
      syncUserPlansBackup(cloud.models);
      setModels(cloud.models);
      if (Array.isArray(cloud.scenarios) && cloud.scenarios.length > 0) {
        safeSetStorageJson(STORAGE_KEY_SCENARIOS, cloud.scenarios);
        setScenarios(cloud.scenarios);
      }
    });

    window.addEventListener('borners-scenario-models-changed', syncFromStorage);
    window.addEventListener('borners-scenarios-changed', syncFromStorage);
    window.addEventListener('borners-active-scenario-changed', syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener('borners-scenario-models-changed', syncFromStorage);
      window.removeEventListener('borners-scenarios-changed', syncFromStorage);
      window.removeEventListener('borners-active-scenario-changed', syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, [syncFromStorage]);

  const setSelectedScenarioId = useCallback(
    (nextId: number) => {
      setSelectedScenarioIdState(nextId);
      safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, nextId);
      if (brandFilter && brandFilter !== 'ALL') {
        const normCode = normalizePortfolioBrandCode(brandFilter);
        if (normCode !== 'ALL') {
          setSelectedScenarioByBrandState((prev) => {
            const next = { ...prev, [normCode]: nextId };
            safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, next);
            return next;
          });
        }
      }
      dispatchCrossHookEvent('borners-active-scenario-changed');
    },
    [brandFilter, dispatchCrossHookEvent]
  );

  const setIncludeGroupPortfolioInS1 = useCallback(
    (nextVal: boolean) => {
      setIncludeGroupState(nextVal);
      safeSetStorageJson(STORAGE_KEY_S1_GROUP_PORTFOLIO, nextVal);
      dispatchCrossHookEvent('borners-active-scenario-changed');
    },
    [dispatchCrossHookEvent]
  );

  const setSelectedScenarioForBrand = useCallback(
    (brandInput: string, scenarioId: number | null) => {
      const code = normalizePortfolioBrandCode(brandInput);
      if (code === 'ALL') return;
      setSelectedScenarioByBrandState((prev) => {
        const next = { ...prev, [code]: scenarioId };
        safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, next);
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-active-scenario-changed');
          }, 0);
        }
        return next;
      });
    },
    [dispatchCrossHookEvent]
  );

  const updateScenariosBatch = useCallback(
    (updater: (prev: GrowthScenarioDef[]) => GrowthScenarioDef[]) => {
      setScenarios((prev) => {
        const next = updater(prev);
        safeSetStorageJson(STORAGE_KEY_SCENARIOS, next);
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-scenarios-changed');
          }, 0);
        }
        return next;
      });
    },
    [dispatchCrossHookEvent]
  );

  const updateModelSpec = useCallback(
    (updated: ScenarioModelSpec) => {
      if (Array.isArray(updated.gallery) && updated.gallery.length > 0) {
        void saveModelGalleryToIdb(updated.id, updated.gallery);
        void pushModelGalleryToSupabase(updated.id, updated.gallery);
      }
      setModels((prev) => {
        const next = prev.map((m) => (m.id === updated.id ? updated : m));
        safeSetStorageJson(STORAGE_KEY_MODELS, next);
        syncUserPlansBackup(next);
        void savePortfolioSnapshotToIdb(next);
        void pushPortfolioCoreToSupabase({ models: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-scenario-models-changed');
          }, 0);
        }
        return next;
      });
    },
    [dispatchCrossHookEvent]
  );

  const updateModelsBatch = useCallback(
    (updater: (prev: ScenarioModelSpec[]) => ScenarioModelSpec[]) => {
      setModels((prev) => {
        const next = updater(prev);
        for (const m of next) {
          if (
            Array.isArray(m.gallery) &&
            m.gallery.some((g) => typeof g?.url === 'string' && g.url.startsWith('data:image/'))
          ) {
            void saveModelGalleryToIdb(m.id, m.gallery);
            void pushModelGalleryToSupabase(m.id, m.gallery);
          }
        }
        safeSetStorageJson(STORAGE_KEY_MODELS, next);
        syncUserPlansBackup(next);
        void savePortfolioSnapshotToIdb(next);
        void pushPortfolioCoreToSupabase({ models: next });
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            dispatchCrossHookEvent('borners-scenario-models-changed');
          }, 0);
        }
        return next;
      });
    },
    [dispatchCrossHookEvent]
  );

  const currentScenario = useMemo(() => {
    const direct = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];
    if (brandFilter && brandFilter !== 'ALL') {
      const normBrand = normalizePortfolioBrandCode(brandFilter);
      if (normBrand !== 'ALL') {
        if (
          direct &&
          direct.ownerBrandCode &&
          normalizePortfolioBrandCode(direct.ownerBrandCode) === normBrand
        ) {
          return direct;
        }
        const mappedId = selectedScenarioByBrand[normBrand];
        if (typeof mappedId === 'number') {
          const mappedScen = scenarios.find((s) => s.id === mappedId && !s.isArchived);
          if (mappedScen) return mappedScen;
        }
        const brandOwned = scenarios.find(
          (s) =>
            !s.isArchived &&
            s.ownerBrandCode &&
            normalizePortfolioBrandCode(s.ownerBrandCode) === normBrand
        );
        if (brandOwned) return brandOwned;
      }
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

  const applyIndustryNormsToAllModels = useCallback((fillMissingCost: boolean = true) => {
    setModels((prev) => {
      const next = applyCategoryWbUnitEconomicsToPortfolio(prev, {
        fillMissingCost,
        forceOverwriteRates: false,
      });
      safeSetStorageJson(STORAGE_KEY_MODELS, next);
      syncUserPlansBackup(next);
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
        }, 0);
      }
      return next;
    });
  }, []);

  const launchStarterCabinet = useCallback(
    (bCode: 'AKUSHA' | 'LISKANI' | 'NA_TELE') => {
      const res = launchBrandStarterMatrix(models, scenarios, bCode);
      setModels(res.models);
      setScenarios(res.scenarios);
      safeSetStorageJson(STORAGE_KEY_MODELS, res.models);
      syncUserPlansBackup(res.models);
      safeSetStorageJson(STORAGE_KEY_SCENARIOS, res.scenarios);
      setSelectedScenarioByBrandState((prev) => {
        const next = { ...prev, [bCode]: res.scenarioId };
        safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, next);
        return next;
      });
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
    [models, scenarios]
  );

  const launchAllCabinets = useCallback(() => {
    const res = launchAllEmptyCabinetsInHolding(
      models,
      scenarios,
      selectedScenarioByBrand
    );
    setModels(res.models);
    setScenarios(res.scenarios);
    setSelectedScenarioByBrandState(res.selectedScenarioByBrand);
    safeSetStorageJson(STORAGE_KEY_MODELS, res.models);
    syncUserPlansBackup(res.models);
    safeSetStorageJson(STORAGE_KEY_SCENARIOS, res.scenarios);
    safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, res.selectedScenarioByBrand);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
        window.dispatchEvent(new CustomEvent('borners-scenarios-changed'));
        window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
      }, 0);
    }
    return res;
  }, [models, scenarios, selectedScenarioByBrand]);

  const resetStarterCabinets = useCallback(() => {
    const res = resetStarterCabinetsFromHolding(
      models,
      scenarios,
      selectedScenarioByBrand
    );
    const hasOfficialLiskani = res.models.some(
      (m) => Array.isArray(m.liskaniSizeVariants) && m.liskaniSizeVariants.length > 0
    );
    const nextByBrand = {
      ...res.selectedScenarioByBrand,
      ...(hasOfficialLiskani ? { LISKANI: LISKANI_2027_SCENARIO_ID } : {}),
    };
    setModels(res.models);
    setScenarios(res.scenarios);
    setSelectedScenarioByBrandState(nextByBrand);
    safeSetStorageJson(STORAGE_KEY_MODELS, res.models);
    syncUserPlansBackup(res.models);
    safeSetStorageJson(STORAGE_KEY_SCENARIOS, res.scenarios);
    safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, nextByBrand);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
        window.dispatchEvent(new CustomEvent('borners-scenarios-changed'));
        window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
      }, 0);
    }
    return res;
  }, [models, scenarios, selectedScenarioByBrand]);

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
    updateScenariosBatch,
    applyIndustryNormsToAllModels,
    launchStarterCabinet,
    launchAllCabinets,
    resetStarterCabinets,
  };
}
