'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlatform } from '@/context/PlatformContext';
import {
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
  S1_100M_SCENARIO_MODELS,
  applyClientSavedS1SalesPlan,
  isUnverifiedActingSku,
} from '@/lib/scenarioS1_100M';
import {
  CanonicalBrandCode,
  applyCategoryWbUnitEconomics,
  applyCategoryWbUnitEconomicsToPortfolio,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  groupRecommendedBatchesByFactory,
  launchAllEmptyCabinetsInHolding,
  launchBrandStarterMatrix,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
  resetStarterCabinetsFromHolding,
} from '@/lib/unifiedBusinessEngine';
import { safeGetStorageJson, safeSetStorageJson } from '@/lib/safeStorage';
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

export function useLiveScenarioPortfolio() {
  const { brandFilter } = usePlatform();
  const [scenarios, setScenarios] = useState<GrowthScenarioDef[]>(INITIAL_SCENARIOS);
  const [models, setModels] = useState<ScenarioModelSpec[]>(DEFAULT_MODELS_LIST);
  const [selectedScenarioId, setSelectedScenarioIdState] = useState<number>(1);
  const [includeGroupPortfolioInS1, setIncludeGroupState] = useState<boolean>(false);
  const [selectedScenarioByBrand, setSelectedScenarioByBrandState] = useState<
    Partial<Record<CanonicalBrandCode, number | null>>
  >({
    BORNERS: 1,
    FUKAI: ACTING_2027_SCENARIO_ID,
    AKUSHA: null,
    LISKANI: null,
    NA_TELE: 2,
  });

  const syncFromStorage = useCallback(() => {
    const parsedScen = safeGetStorageJson<GrowthScenarioDef[]>(STORAGE_KEY_SCENARIOS);
    if (Array.isArray(parsedScen) && parsedScen.length > 0) {
      const hasActing = parsedScen.some((s) => s.id === ACTING_2027_SCENARIO_ID);
      setScenarios(hasActing ? parsedScen : [ACTING_2027_SCENARIO_DEF, ...parsedScen]);
    }

    const hydratedModels = hydratePortfolioModelsFromStorage();
    setModels(hydratedModels);

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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
      }
    },
    [brandFilter]
  );

  const setIncludeGroupPortfolioInS1 = useCallback((nextVal: boolean) => {
    setIncludeGroupState(nextVal);
    safeSetStorageJson(STORAGE_KEY_S1_GROUP_PORTFOLIO, nextVal);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
    }
  }, []);

  const setSelectedScenarioForBrand = useCallback(
    (brandInput: string, scenarioId: number | null) => {
      const code = normalizePortfolioBrandCode(brandInput);
      if (code === 'ALL') return;
      setSelectedScenarioByBrandState((prev) => {
        const next = { ...prev, [code]: scenarioId };
        safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, next);
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
          }, 0);
        }
        return next;
      });
    },
    []
  );

  const updateScenariosBatch = useCallback(
    (updater: (prev: GrowthScenarioDef[]) => GrowthScenarioDef[]) => {
      setScenarios((prev) => {
        const next = updater(prev);
        safeSetStorageJson(STORAGE_KEY_SCENARIOS, next);
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('borners-scenarios-changed'));
          }, 0);
        }
        return next;
      });
    },
    []
  );

  const updateModelSpec = useCallback((updated: ScenarioModelSpec) => {
    setModels((prev) => {
      const next = prev.map((m) => (m.id === updated.id ? updated : m));
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

  const updateModelsBatch = useCallback(
    (updater: (prev: ScenarioModelSpec[]) => ScenarioModelSpec[]) => {
      setModels((prev) => {
        const next = updater(prev);
        safeSetStorageJson(STORAGE_KEY_MODELS, next);
        syncUserPlansBackup(next);
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
          }, 0);
        }
        return next;
      });
    },
    []
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
    const monthlyRevRub = Array(12).fill(0) as number[];
    const monthlyPacks = Array(12).fill(0) as number[];

    for (const m of eligibleModels) {
      const met = computeModelScenarioMetrics(m, currentScenario);
      annualRevenueRub += met.annualRevenueRub;
      decRevenueRub += met.targetMonthRevenueRub;
      annualPacks += met.annualPacks;
      decPacks += met.targetMonthPacks;
      for (let i = 0; i < 12; i++) {
        monthlyRevRub[i] += met.monthlyRevenuesRub[i] || 0;
        monthlyPacks[i] += met.plan.monthlyPacks[i] || 0;
      }
    }

    return {
      annualRevenueRub,
      decRevenueRub,
      annualPacks,
      decPacks,
      monthlyRevRub,
      monthlyPacks,
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
