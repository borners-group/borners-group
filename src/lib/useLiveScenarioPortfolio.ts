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

export const STORAGE_KEY_SCENARIOS = 'borners_tz_scenarios_v1';
export const STORAGE_KEY_MODELS = 'borners_tz_models_v1';
export const STORAGE_KEY_USER_PLANS_BACKUP = 'borners_user_saved_plans_v1';
export const STORAGE_KEY_ACTIVE_SCENARIO_ID = 'borners_active_scenario_id_v1';
export const STORAGE_KEY_S1_GROUP_PORTFOLIO = 'borners_s1_include_fukai_v1';
export const STORAGE_KEY_SCENARIO_BY_BRAND = 'borners_selected_scenario_by_brand_v1';

interface UserSavedModelPlanBackup {
  id: string;
  code: string;
  title?: string;
  subtitle?: string;
  brandId?: ScenarioModelSpec['brandId'];
  customBrandLabel?: string;
  categoryLabel?: string;
  primaryUnitLabel?: string;
  secondaryUnitLabel?: string;
  wbArticle?: string;
  modelStageStatus?: ScenarioModelSpec['modelStageStatus'];
  description?: string;
  unitsInPack?: number;
  retailPriceRub: number;
  unitCostRub: number;
  marketplaceFeePct?: number;
  logisticsRub?: number;
  adsPct?: number;
  priority?: ModelPriorityLevel;
  launchStatus: ScenarioModelSpec['launchStatus'];
  gallery?: ScenarioModelSpec['gallery'];
  palettes?: ScenarioModelSpec['palettes'];
  fabric?: ScenarioModelSpec['fabric'];
  construction?: ScenarioModelSpec['construction'];
  waistband?: ScenarioModelSpec['waistband'];
  attachedPdfs?: ScenarioModelSpec['attachedPdfs'];
  plansByScenario: ScenarioModelSpec['plansByScenario'];
  sharedSupplyAndFact?: ScenarioModelSpec['sharedSupplyAndFact'];
}

function syncUserPlansBackup(modelsList: ScenarioModelSpec[]) {
  const backup: Record<string, UserSavedModelPlanBackup> = {};
  for (const raw of modelsList) {
    const m = ensureModelUnifiedV11(raw);
    backup[m.id] = {
      id: m.id,
      code: m.code,
      title: m.title,
      subtitle: m.subtitle,
      brandId: m.brandId,
      customBrandLabel: m.customBrandLabel,
      categoryLabel: m.categoryLabel,
      primaryUnitLabel: m.primaryUnitLabel,
      secondaryUnitLabel: m.secondaryUnitLabel,
      wbArticle: m.wbArticle,
      modelStageStatus: m.modelStageStatus,
      description: m.description,
      unitsInPack: m.unitsInPack,
      retailPriceRub: m.retailPriceRub,
      unitCostRub: m.unitCostRub,
      marketplaceFeePct: m.marketplaceFeePct,
      logisticsRub: m.logisticsRub,
      adsPct: m.adsPct,
      priority: m.priority,
      launchStatus: m.launchStatus,
      gallery: m.gallery,
      palettes: m.palettes,
      fabric: m.fabric,
      construction: m.construction,
      waistband: m.waistband,
      attachedPdfs: m.attachedPdfs,
      plansByScenario: m.plansByScenario,
      sharedSupplyAndFact: m.sharedSupplyAndFact,
    };
  }
  safeSetStorageJson(STORAGE_KEY_USER_PLANS_BACKUP, backup);
}

function overlayBackupOntoModels(modelsList: ScenarioModelSpec[]): ScenarioModelSpec[] {
  const backup = safeGetStorageJson<Record<string, UserSavedModelPlanBackup>>(
    STORAGE_KEY_USER_PLANS_BACKUP
  );
  return modelsList.map((rawM) => {
    const m = applyCategoryWbUnitEconomics(rawM);

    if (!backup || typeof backup !== 'object') return m;
    const saved =
      backup[m.id] ||
      Object.values(backup).find(
        (b) => b.code && b.code.toUpperCase() === m.code.toUpperCase()
      );
    if (!saved) return m;
    const mergedRaw: ScenarioModelSpec = {
      ...m,
      code: saved.code ?? m.code,
      title: saved.title ?? m.title,
      subtitle: saved.subtitle ?? m.subtitle,
      brandId: saved.brandId ?? m.brandId,
      customBrandLabel: saved.customBrandLabel ?? m.customBrandLabel,
      categoryLabel: saved.categoryLabel ?? m.categoryLabel,
      primaryUnitLabel: saved.primaryUnitLabel ?? m.primaryUnitLabel,
      secondaryUnitLabel: saved.secondaryUnitLabel ?? m.secondaryUnitLabel,
      wbArticle: saved.wbArticle ?? m.wbArticle,
      modelStageStatus: saved.modelStageStatus ?? m.modelStageStatus,
      description: saved.description ?? m.description,
      unitsInPack: saved.unitsInPack ?? m.unitsInPack,
      retailPriceRub: saved.retailPriceRub ?? m.retailPriceRub,
      unitCostRub: saved.unitCostRub ?? m.unitCostRub,
      marketplaceFeePct: saved.marketplaceFeePct ?? m.marketplaceFeePct,
      logisticsRub: saved.logisticsRub ?? m.logisticsRub,
      adsPct: saved.adsPct ?? m.adsPct,
      priority: saved.priority ?? m.priority,
      launchStatus: saved.launchStatus ?? m.launchStatus,
      gallery: saved.gallery || m.gallery,
      palettes: saved.palettes || m.palettes,
      fabric: saved.fabric || m.fabric,
      construction: saved.construction || m.construction,
      waistband: saved.waistband || m.waistband,
      attachedPdfs: saved.attachedPdfs || m.attachedPdfs,
      plansByScenario: saved.plansByScenario || m.plansByScenario,
      sharedSupplyAndFact: saved.sharedSupplyAndFact || m.sharedSupplyAndFact,
    };
    return applyCategoryWbUnitEconomics(mergedRaw);
  });
}

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
  return models.filter((m) => {
    if (m.launchStatus === 'В архиве') return false;
    if (isActing) {
      const okActing =
        Boolean(getActingSkuByWbOrVendor(m.code, m.title)) ||
        (!['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
          m.id
        ) &&
          Boolean(m.plansByScenario[ACTING_2027_SCENARIO_ID]));
      if (!okActing) return false;
    } else {
      if (
        ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
          m.id
        )
      ) {
        return false;
      }
      if (
        scenario.ownerBrandCode &&
        scenario.ownerBrandCode !== 'ALL' &&
        scenario.ownerBrandCode !== 'BORNERS'
      ) {
        if (!matchesBrandFilter(m, scenario.ownerBrandCode)) {
          return false;
        }
      } else if (!m.customBrandLabel && !scenario.includedBrands.includes(m.brandId)) {
        return false;
      }
      if (
        scenario.id === 1 &&
        !includeGroupPortfolioInS1 &&
        isUnverifiedActingSku(m.code)
      ) {
        return false;
      }
    }

    if (brandFilter && brandFilter !== 'ALL') {
      if (!matchesBrandFilter(m, brandFilter)) {
        return false;
      }
    }

    return true;
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

    const parsedModels = safeGetStorageJson<ScenarioModelSpec[]>(STORAGE_KEY_MODELS);
    if (Array.isArray(parsedModels) && parsedModels.length > 0) {
      const clean = parsedModels.filter(
        (m) =>
          !['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
            m.id
          )
      );
      if (clean.length > 0) {
        setModels(overlayBackupOntoModels(clean));
      }
    } else {
      setModels(overlayBackupOntoModels(DEFAULT_MODELS_LIST));
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

  const setSelectedScenarioId = useCallback((nextId: number) => {
    setSelectedScenarioIdState(nextId);
    safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, nextId);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
    }
  }, []);

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

  const orderedScenarios = useMemo(
    () =>
      [...scenarios]
        .filter((s) => !s.isArchived)
        .sort((a, b) =>
          a.id === ACTING_2027_SCENARIO_ID
            ? -1
            : b.id === ACTING_2027_SCENARIO_ID
            ? 1
            : a.id - b.id
        ),
    [scenarios]
  );

  const currentScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0],
    [scenarios, selectedScenarioId]
  );

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
    selectedScenarioId,
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
