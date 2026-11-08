'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Plus,
  Search,
  ChevronRight,
  Sparkles,
  Calendar,
  Trash2,
  X,
  Download,
  Upload,
  AlertTriangle,
  Package,
  ChevronDown,
  TrendingUp,
  BarChart3,
  Wallet,
  ArrowUpRight,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import {
  GrowthScenarioDef,
  INITIAL_SCENARIOS,
  INITIAL_SCENARIO_MODELS,
  MONTHS_SHORT_RU,
  ModelPriorityLevel,
  PRIORITY_WEIGHTS,
  ScenarioModelSpec,
  autoDistributeScenarioByPriority,
  computeModelScenarioMetrics,
  cycleModelPriority,
  getModelPriority,
} from '@/lib/scenarioData';
import {
  ACTING_2027_CONTROL_TOTALS,
  ACTING_2027_SCENARIO_DEF,
  ACTING_2027_SCENARIO_ID,
  ACTING_2027_SCENARIO_MODELS,
  ACTING_2027_SKUS,
  getActingSkuByWbOrVendor,
  verifyActingAssortment2027Bundle,
} from '@/lib/actingAssortment2027';
import {
  S1_100M_CONTROL_TOTALS,
  S1_100M_NEW_VARIANTS,
  S1_100M_SCENARIO_MODELS,
  applyClientSavedS1SalesPlan,
  getS1NewVariantByCodeOrId,
  isUnverifiedActingSku,
  verifyScenarioS1_100M,
} from '@/lib/scenarioS1_100M';
import { BoxerPackStackSvg } from '@/components/sections/ScenarioVisualParts';
import { ScenarioModelCardScreen } from '@/components/sections/ScenarioModelCardScreen';
import { ScenarioSalesPlanScreen } from '@/components/sections/ScenarioSalesPlanScreen';
import { PdfConstructorModal } from '@/components/sections/PdfConstructorModal';
import { safeGetStorageJson, safeSetStorageJson } from '@/lib/safeStorage';
import {
  STORAGE_KEY_ACTIVE_SCENARIO_ID,
  STORAGE_KEY_S1_GROUP_PORTFOLIO,
} from '@/lib/useLiveScenarioPortfolio';
import {
  computeFinancialPnL,
  computeGroupBrandsInvestmentReport,
  computeProcurementPlan,
  computeScenarioInvestmentSummary,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  groupRecommendedBatchesByFactory,
  importStructuredScenarioPlan,
  matchesBrandFilter,
  parseStructuredPlanCsvOrJson,
  serializeStructuredPlanToCsv,
} from '@/lib/unifiedBusinessEngine';

export const STORAGE_KEY_SCENARIOS = 'borners_tz_scenarios_v1';
export const STORAGE_KEY_MODELS = 'borners_tz_models_v1';
export const STORAGE_KEY_USER_PLANS_BACKUP = 'borners_user_saved_plans_v1';

interface UserSavedModelPlanBackup {
  id: string;
  code: string;
  title?: string;
  subtitle?: string;
  brandId?: ScenarioModelSpec['brandId'];
  customBrandLabel?: string;
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

function saveUserPlansBackup(modelsList: ScenarioModelSpec[]) {
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

function overlayUserPlansBackup(
  modelsList: ScenarioModelSpec[]
): ScenarioModelSpec[] {
  const backup = safeGetStorageJson<Record<string, UserSavedModelPlanBackup>>(
    STORAGE_KEY_USER_PLANS_BACKUP
  );
  if (!backup || typeof backup !== 'object') return modelsList;
  return modelsList.map((m) => {
    const saved =
      backup[m.id] ||
      Object.values(backup).find(
        (b) => b.code && b.code.toUpperCase() === m.code.toUpperCase()
      );
    if (!saved) return m;
    return {
      ...m,
      code: saved.code ?? m.code,
      title: saved.title ?? m.title,
      subtitle: saved.subtitle ?? m.subtitle,
      brandId: saved.brandId ?? m.brandId,
      customBrandLabel: saved.customBrandLabel ?? m.customBrandLabel,
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
  });
}

const DEFAULT_RESTORED_MODELS: ScenarioModelSpec[] = applyClientSavedS1SalesPlan([
  ...ACTING_2027_SCENARIO_MODELS,
  ...S1_100M_SCENARIO_MODELS,
]);

interface GrowthScenariosShowcaseProps {
  initialScreen?: 'scenarios' | 'model' | 'sales-plan';
  initialModelId?: string;
  onOpenStudioCanvas?: () => void;
}

export function GrowthScenariosShowcase({
  initialScreen = 'scenarios',
  initialModelId,
  onOpenStudioCanvas,
}: GrowthScenariosShowcaseProps = {}) {
  const {
    concepts,
    products,
    createProduct,
    updateProduct,
    archiveEntity,
    pushScenarioStep,
    navigateTo,
    brandFilter,
    setBrandFilter,
    notify,
  } = usePlatform();

  // Архитектура из 3 экранов (п. 02 ТЗ):
  // 'scenarios' (Экран №1) -> 'model' (Экран №2) -> 'sales-plan' (Экран №3)
  const [screen, setScreen] = useState<'scenarios' | 'model' | 'sales-plan'>(
    initialScreen
  );

  const [scenarios, setScenarios] = useState<GrowthScenarioDef[]>(INITIAL_SCENARIOS);
  const [models, setModels] = useState<ScenarioModelSpec[]>(DEFAULT_RESTORED_MODELS);
  const [selectedScenarioId, setSelectedScenarioIdState] = useState<number>(1);
  const [selectedModelId, setSelectedModelId] = useState<string>(
    initialModelId || 'scen-brn-001-sc'
  );
  const screenHydratedRef = useRef(false);

  // Восстановление открытого экрана (Сценарии / Карточка модели / Матрица 12 мес.) и выбранной модели при перезагрузке (F5)
  useEffect(() => {
    try {
      const pendingModelId = sessionStorage.getItem('borners_open_scenario_model_id');
      if (pendingModelId) {
        screenHydratedRef.current = true;
        return;
      }
      const savedScreenRaw = window.localStorage.getItem(
        'borners_scenario_screen_state_v1'
      );
      if (savedScreenRaw) {
        const parsed = JSON.parse(savedScreenRaw) as {
          screen?: 'scenarios' | 'model' | 'sales-plan';
          selectedModelId?: string;
        };
        if (
          !initialModelId &&
          (parsed.screen === 'scenarios' ||
            parsed.screen === 'model' ||
            parsed.screen === 'sales-plan')
        ) {
          setScreen(parsed.screen);
        }
        if (!initialModelId && parsed.selectedModelId) {
          setSelectedModelId(parsed.selectedModelId);
        }
      }
    } catch {
      // ignore
    } finally {
      screenHydratedRef.current = true;
    }
  }, [initialModelId]);

  useEffect(() => {
    if (!screenHydratedRef.current) return;
    try {
      window.localStorage.setItem(
        'borners_scenario_screen_state_v1',
        JSON.stringify({ screen, selectedModelId })
      );
    } catch {
      // ignore
    }
  }, [screen, selectedModelId]);

  const setSelectedScenarioId = useCallback((nextId: number) => {
    setSelectedScenarioIdState(nextId);
    safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, nextId);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
      }, 0);
    }
  }, []);

  const navigateScreen = (
    nextScreen: 'scenarios' | 'model' | 'sales-plan',
    nextModelId?: string
  ) => {
    const targetModelId = nextModelId || selectedModelId;
    if (nextModelId) {
      setSelectedModelId(nextModelId);
    }
    setScreen(nextScreen);
    pushScenarioStep(nextScreen, targetModelId);
  };

  useEffect(() => {
    const onHistoryRestore = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.scenarioScreen) {
        setScreen(detail.scenarioScreen);
      }
      if (detail?.scenarioModelId) {
        setSelectedModelId(detail.scenarioModelId);
      }
    };
    window.addEventListener('borners-history-restore', onHistoryRestore);
    return () =>
      window.removeEventListener('borners-history-restore', onHistoryRestore);
  }, []);

  useEffect(() => {
    if (initialScreen && initialScreen !== 'scenarios') {
      setScreen(initialScreen);
    }
  }, [initialScreen]);

  useEffect(() => {
    if (initialModelId) {
      setSelectedModelId(initialModelId);
    }
    try {
      const pendingModelId = sessionStorage.getItem('borners_open_scenario_model_id');
      if (pendingModelId) {
        sessionStorage.removeItem('borners_open_scenario_model_id');
        setSelectedModelId(pendingModelId);
        setScreen('model');
        pushScenarioStep('model', pendingModelId);
      }
    } catch {
      // ignore
    }

    const onOpenScenarioModel = (e: Event) => {
      const targetId = (e as CustomEvent)?.detail?.modelId;
      if (targetId) {
        try {
          sessionStorage.removeItem('borners_open_scenario_model_id');
        } catch {
          // ignore
        }
        setSelectedModelId(targetId);
        setScreen('model');
        pushScenarioStep('model', targetId);
      }
    };
    window.addEventListener('borners-open-scenario-model', onOpenScenarioModel);
    return () =>
      window.removeEventListener('borners-open-scenario-model', onOpenScenarioModel);
  }, [initialModelId, pushScenarioStep]);

  // Фильтры каталога на Экране №1 (синхронизированы с верхним переключателем бренда)
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilterLocal, setBrandFilterLocal] = useState<string>('ALL');
  const [statusFilterLocal, setStatusFilterLocal] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'default' | 'dec_desc' | 'year_desc' | 'priority'>(
    'default'
  );
  const [selectedChartMonthIdx, setSelectedChartMonthIdx] = useState<number>(11);

  useEffect(() => {
    if (brandFilter) {
      setBrandFilterLocal((prev) => (prev === brandFilter ? prev : brandFilter));
    }
  }, [brandFilter]);
  const [includeGroupPortfolioInS1, setIncludeGroupState] =
    useState<boolean>(false);
  const setIncludeGroupPortfolioInS1 = useCallback((nextVal: boolean) => {
    setIncludeGroupState(nextVal);
    safeSetStorageJson(STORAGE_KEY_S1_GROUP_PORTFOLIO, nextVal);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
      }, 0);
    }
  }, []);
  const [v11ContourExpanded, setV11ContourExpanded] = useState<boolean>(false);
  const [mathBreakdownOpen, setMathBreakdownOpen] = useState<boolean>(false);
  const [catalogViewMode, setCatalogViewMode] = useState<'grid' | 'table'>('grid');
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const scenarioPlanImportRef = useRef<HTMLInputElement | null>(null);

  // Модальные окна создания модели (п. 7.1), создания сценария (п. 7.3) и PDF (Тест 10)
  const [newModelModalOpen, setNewModelModalOpen] = useState(false);
  const [newScenarioModalOpen, setNewScenarioModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  useEffect(() => {
    const onResetHome = () => {
      try {
        sessionStorage.removeItem('borners_open_scenario_model_id');
        window.localStorage.setItem(
          'borners_scenario_screen_state_v1',
          JSON.stringify({ screen: 'scenarios', selectedModelId })
        );
      } catch {
        // ignore
      }
      setScreen('scenarios');
      setMathBreakdownOpen(false);
      setExportMenuOpen(false);
      setNewModelModalOpen(false);
      setNewScenarioModalOpen(false);
      setPdfModalOpen(false);
      setBrandFilterLocal('ALL');
      setStatusFilterLocal('ALL');
      setSearchQuery('');
      pushScenarioStep('scenarios', selectedModelId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('borners-reset-to-home-summary', onResetHome);
    return () => window.removeEventListener('borners-reset-to-home-summary', onResetHome);
  }, [pushScenarioStep, selectedModelId]);

  // Поля формы создания новой модели (Тест 11: короткая форма, работает со всеми брендами холдинга)
  const [draftBrand, setDraftBrand] = useState<string>('BORNERS');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState('Боксеры (trunks)');
  const [draftUnitsInPack, setDraftUnitsInPack] = useState(4);
  const [draftRetailPrice, setDraftRetailPrice] = useState(1290);
  const [draftUnitCost, setDraftUnitCost] = useState(410);

  // Поля формы создания нового сценария (п. 7.3)
  const [draftScenTitle, setDraftScenTitle] = useState('');
  const [draftScenTargetMln, setDraftScenTargetMln] = useState(250);
  const [draftScenScope, setDraftScenScope] = useState<'BORNERS' | 'GROUP'>('GROUP');
  const [draftCopyFromScenarioId, setDraftCopyFromScenarioId] = useState<number>(2);

  const hydratedRef = useRef(false);

  const commitModels = useCallback(
    (updater: ScenarioModelSpec[] | ((prev: ScenarioModelSpec[]) => ScenarioModelSpec[])) => {
      setModels((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        safeSetStorageJson(STORAGE_KEY_MODELS, next);
        saveUserPlansBackup(next);
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

  const commitScenarios = useCallback(
    (updater: GrowthScenarioDef[] | ((prev: GrowthScenarioDef[]) => GrowthScenarioDef[])) => {
      setScenarios((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
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

  // Загрузка сохранённых данных из localStorage без перезаписи пользовательских правок продаж
  useEffect(() => {
    const syncFromStorage = () => {
      const bundleCheck = verifyActingAssortment2027Bundle();
      const s1Check = verifyScenarioS1_100M();
      const parsedScen = safeGetStorageJson<GrowthScenarioDef[]>(STORAGE_KEY_SCENARIOS);
      if (Array.isArray(parsedScen) && parsedScen.length > 0) {
        const hasActingScen = parsedScen.some((s) => s.id === ACTING_2027_SCENARIO_ID);
        const nextScen = hasActingScen
          ? parsedScen
          : [ACTING_2027_SCENARIO_DEF, ...parsedScen];
        if (!hasActingScen) {
          safeSetStorageJson(STORAGE_KEY_SCENARIOS, nextScen);
        }
        setScenarios(nextScen);
      }

      const parsedModels = safeGetStorageJson<ScenarioModelSpec[]>(STORAGE_KEY_MODELS);
      const restoredClientV4Flag =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('borners_restored_client_s1_109_94m_v4')
          : '1';

      if (Array.isArray(parsedModels) && parsedModels.length > 0) {
        // Убираем только 4 старые демо-карточки (scen-model-001..004)
        const filteredLegacy = parsedModels.filter(
          (m) =>
            !['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
              m.id
            ) && !['№001', '№002', '№003', '№004'].includes(m.code)
        );

        // Бережно добавляем недостающие эталонные карточки, НИКОГДА не перезаписывая существующие!
        const merged = [...filteredLegacy];
        for (const itemMod of [
          ...ACTING_2027_SCENARIO_MODELS,
          ...S1_100M_SCENARIO_MODELS,
        ]) {
          const idx = merged.findIndex(
            (m) =>
              m.id === itemMod.id ||
              m.code.toUpperCase() === itemMod.code.toUpperCase() ||
              m.title.toUpperCase() === itemMod.title.toUpperCase()
          );
          if (idx >= 0) {
            // Сохраняем все пользовательские планы и цены, дополняя только пустые PDF
            if (
              (!merged[idx].attachedPdfs || merged[idx].attachedPdfs.length === 0) &&
              itemMod.attachedPdfs &&
              itemMod.attachedPdfs.length > 0
            ) {
              merged[idx] = {
                ...merged[idx],
                attachedPdfs: itemMod.attachedPdfs,
              };
            }
          } else {
            merged.push(itemMod);
          }
        }

        // Однократное авто-восстановление сохранённых клиентом продаж (109,94 млн ₽ в дек / 686,28 млн ₽ за год),
        // если предыдущая миграция clean_v3 сбросила план к базовым 100 154 901 ₽
        if (!restoredClientV4Flag && bundleCheck.valid && s1Check.valid) {
          const scen1Def = INITIAL_SCENARIOS[0];
          const currentS1DecRub = merged
            .filter((m) => m.launchStatus !== 'В архиве' && !isUnverifiedActingSku(m.code))
            .reduce(
              (acc, m) => acc + computeModelScenarioMetrics(m, scen1Def).targetMonthRevenueRub,
              0
            );
          const wasResetToPdfDefault = Math.abs(currentS1DecRub - 100_154_901) < 100;
          const nextRestored = wasResetToPdfDefault
            ? applyClientSavedS1SalesPlan(merged)
            : overlayUserPlansBackup(merged);

          // Упорядочиваем 7 WB SKU первыми + 16 новых вариантов (как на скриншоте клиента), сохраняя любые добавленные пользователем модели
          const wbOrderIds = new Set(ACTING_2027_SCENARIO_MODELS.map((m) => m.id));
          const s1OrderIds = new Set(S1_100M_SCENARIO_MODELS.map((m) => m.id));
          const ordered = [
            ...nextRestored.filter((m) => wbOrderIds.has(m.id)),
            ...nextRestored.filter((m) => s1OrderIds.has(m.id)),
            ...nextRestored.filter((m) => !wbOrderIds.has(m.id) && !s1OrderIds.has(m.id)),
          ];

          safeSetStorageJson(STORAGE_KEY_MODELS, ordered);
          saveUserPlansBackup(ordered);
          try {
            window.localStorage.setItem('borners_acting_2027_seeded_v2', '1');
            window.localStorage.setItem('borners_s1_100m_seeded_v1', '1');
            window.localStorage.setItem('borners_s1_100m_clean_v3', '1');
            window.localStorage.setItem('borners_restored_client_s1_109_94m_v4', '1');
          } catch {
            // ignore
          }
          setModels(ordered);
        } else {
          const withBackup = overlayUserPlansBackup(merged);
          setModels(withBackup);
        }
      } else if (bundleCheck.valid && s1Check.valid) {
        const seeded = overlayUserPlansBackup(DEFAULT_RESTORED_MODELS);
        safeSetStorageJson(STORAGE_KEY_MODELS, seeded);
        saveUserPlansBackup(seeded);
        try {
          window.localStorage.setItem('borners_acting_2027_seeded_v2', '1');
          window.localStorage.setItem('borners_s1_100m_seeded_v1', '1');
          window.localStorage.setItem('borners_s1_100m_clean_v3', '1');
          window.localStorage.setItem('borners_restored_client_s1_109_94m_v4', '1');
        } catch {
          // ignore
        }
        setModels(seeded);
      }

      const savedScenId = safeGetStorageJson<number>(STORAGE_KEY_ACTIVE_SCENARIO_ID);
      if (typeof savedScenId === 'number') {
        setSelectedScenarioIdState((prev) => (prev === savedScenId ? prev : savedScenId));
      }

      const savedGroupFlag = safeGetStorageJson<boolean>(STORAGE_KEY_S1_GROUP_PORTFOLIO);
      if (typeof savedGroupFlag === 'boolean') {
        setIncludeGroupState((prev) => (prev === savedGroupFlag ? prev : savedGroupFlag));
      }

      hydratedRef.current = true;
    };

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
  }, []);

  const currentScenario =
    scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0] || INITIAL_SCENARIOS[0];

  const activeModel =
    models.find((m) => m.id === selectedModelId) || models[0] || INITIAL_SCENARIO_MODELS[0];

  // Расчёт показателей каждого сценария снизу вверх из планов моделей (п. 8 ТЗ)
  const scenarioAggregates = useMemo(() => {
    const map: Record<
      number,
      {
        annualRevenueRub: number;
        annualProfitRub: number;
        totalPurchaseNeedRub: number;
        targetMonthRevenueRub: number;
        goalCompletionPct: number;
        monthlyBornersMln: number[];
        monthlyNaTeleMln: number[];
        monthlyTotalMln: number[];
        modelsCount: number;
        annualBuyoutsPacks: number;
        targetMonthPacks: number;
        actingConfirmedCount: number;
        actingDecRevenueRub: number;
        actingAnnualRevenueRub: number;
        actingAnnualSets: number;
        newVariantsCount: number;
        newDecRevenueRub: number;
        newDecSets: number;
        newAnnualRevenueRub: number;
        newAnnualSets: number;
        priorityCounts: Record<ModelPriorityLevel, number>;
      }
    > = {};

    for (const sc of scenarios) {
      const isActingScenario = sc.id === ACTING_2027_SCENARIO_ID;
      const eligibleModels = models.filter((m) => {
        if (m.launchStatus === 'В архиве') return false;
        if (isActingScenario) {
          return (
            Boolean(getActingSkuByWbOrVendor(m.code, m.title)) ||
            (!['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
              m.id
            ) &&
              Boolean(m.plansByScenario[ACTING_2027_SCENARIO_ID]))
          );
        }
        if (sc.id === 1) {
          if (
            ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
              m.id
            )
          ) {
            return false;
          }
          if (!includeGroupPortfolioInS1 && isUnverifiedActingSku(m.code)) {
            return false;
          }
        }
        return Boolean(m.customBrandLabel) || sc.includedBrands.includes(m.brandId);
      });

      let annualRevenueRub = 0;
      let annualProfitRub = 0;
      let totalPurchaseNeedRub = 0;
      let targetMonthRevenueRub = 0;
      let annualBuyoutsPacks = 0;
      let targetMonthPacks = 0;
      let actingConfirmedCount = 0;
      let actingDecRevenueRub = 0;
      let actingAnnualRevenueRub = 0;
      let actingAnnualSets = 0;
      let newVariantsCount = 0;
      let newDecRevenueRub = 0;
      let newDecSets = 0;
      let newAnnualRevenueRub = 0;
      let newAnnualSets = 0;
      const priorityCounts: Record<ModelPriorityLevel, number> = {
        Высший: 0,
        Высокий: 0,
        Средний: 0,
        'Не указан': 0,
      };
      const monthlyBornersMln = Array(12).fill(0);
      const monthlyNaTeleMln = Array(12).fill(0);

      for (const m of eligibleModels) {
        const met = computeModelScenarioMetrics(m, sc);
        const actingMeta = getActingSkuByWbOrVendor(m.code, m.title);
        annualRevenueRub += met.annualRevenueRub;
        annualProfitRub += met.annualProfitRub;
        totalPurchaseNeedRub += met.totalPurchaseNeedRub;
        targetMonthRevenueRub += met.targetMonthRevenueRub;
        annualBuyoutsPacks += met.annualPacks;
        targetMonthPacks += met.targetMonthPacks;

        if (actingMeta) {
          if (met.annualRevenueRub > 0 || met.targetMonthRevenueRub > 0) {
            actingConfirmedCount += 1;
          }
          actingDecRevenueRub += met.targetMonthRevenueRub;
          actingAnnualRevenueRub += met.annualRevenueRub;
          actingAnnualSets += met.annualPacks;
        } else {
          newVariantsCount += 1;
          newDecRevenueRub += met.targetMonthRevenueRub;
          newDecSets += met.targetMonthPacks;
          newAnnualRevenueRub += met.annualRevenueRub;
          newAnnualSets += met.annualPacks;
          const prio = getModelPriority(m);
          priorityCounts[prio] = (priorityCounts[prio] || 0) + 1;
        }

        for (let i = 0; i < 12; i++) {
          const revMln = met.monthlyRevenuesRub[i] / 1_000_000;
          if (m.brandId === 'BORNERS') {
            monthlyBornersMln[i] += revMln;
          } else {
            monthlyNaTeleMln[i] += revMln;
          }
        }
      }

      const monthlyTotalMln = monthlyBornersMln.map(
        (b, idx) => Math.round((b + monthlyNaTeleMln[idx]) * 100) / 100
      );

      const targetRub =
        sc.id === ACTING_2027_SCENARIO_ID
          ? ACTING_2027_CONTROL_TOTALS.decemberRevenueRub
          : sc.monthlyTargetMln * 1_000_000;
      const goalCompletionPct =
        targetRub > 0
          ? Math.round((targetMonthRevenueRub / targetRub) * 1000) / 10
          : 0;

      map[sc.id] = {
        annualRevenueRub,
        annualProfitRub,
        totalPurchaseNeedRub,
        targetMonthRevenueRub,
        goalCompletionPct,
        monthlyBornersMln,
        monthlyNaTeleMln,
        monthlyTotalMln,
        modelsCount: eligibleModels.length,
        annualBuyoutsPacks,
        targetMonthPacks,
        actingConfirmedCount,
        actingDecRevenueRub,
        actingAnnualRevenueRub,
        actingAnnualSets,
        newVariantsCount,
        newDecRevenueRub,
        newDecSets,
        newAnnualRevenueRub,
        newAnnualSets,
        priorityCounts,
      };
    }
    return map;
  }, [scenarios, models, includeGroupPortfolioInS1]);

  const currentAgg =
    scenarioAggregates[currentScenario.id] || scenarioAggregates[1];

  // Сводка ТЗ v1.1 по выбранному сценарию: Партии закупок, Капитал, Честный P&L и Риски
  const v11ScenarioSummary = useMemo(() => {
    const isActingScenario = currentScenario.id === ACTING_2027_SCENARIO_ID;
    const eligible = models.filter((m) => {
      if (m.launchStatus === 'В архиве') return false;
      if (isActingScenario) {
        return (
          Boolean(getActingSkuByWbOrVendor(m.code, m.title)) ||
          (!['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
            m.id
          ) &&
            Boolean(m.plansByScenario[ACTING_2027_SCENARIO_ID]))
        );
      }
      if (currentScenario.id === 1) {
        if (
          ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
            m.id
          )
        ) {
          return false;
        }
        if (!includeGroupPortfolioInS1 && isUnverifiedActingSku(m.code)) {
          return false;
        }
      }
      return Boolean(m.customBrandLabel) || currentScenario.includedBrands.includes(m.brandId);
    });

    let approvedOrdersCount = 0;
    let approvedOrdersRub = 0;
    let recommendedBatchesCount = 0;
    let recommendedPacks = 0;
    let recommendedPhysicalUnits = 0;
    let recommendedBudgetRub = 0;
    let honestOperatingProfitRub = 0;
    let filledOperatingProfitModelsCount = 0;
    let unfilledExpensesModelsCount = 0;
    let peakCapitalNeedRub = 0;
    let deficitModelsCount = 0;
    let urgentPastOrderBatchesCount = 0;
    let hypothesisModelsCount = 0;
    let orderDiscrepanciesCount = 0;

    for (const m of eligible) {
      const proc = computeProcurementPlan(m, currentScenario);
      const pnl = computeFinancialPnL(m, currentScenario, proc);
      const s1Var =
        getS1NewVariantByCodeOrId(m.code) || getS1NewVariantByCodeOrId(m.id);

      approvedOrdersCount += proc.approvedOrders.length;
      approvedOrdersRub += proc.approvedOrders.reduce(
        (s, po) => s + po.totalOrderRub,
        0
      );
      recommendedBatchesCount += proc.recommendedBatches.length;
      recommendedPacks += proc.totalRecommendedPacks;
      recommendedPhysicalUnits += proc.totalRecommendedUnits;
      recommendedBudgetRub += proc.totalRecommendedBudgetRub || 0;
      urgentPastOrderBatchesCount += proc.recommendedBatches.filter(
        (b) => b.isUrgentPastOrderDate
      ).length;
      orderDiscrepanciesCount += proc.orderDiscrepancies.length;

      if (proc.hasDeficit) {
        deficitModelsCount += 1;
      }
      if (s1Var?.isPriceHypothesis) {
        hypothesisModelsCount += 1;
      }

      if (pnl.annualOperatingProfitRub !== null) {
        honestOperatingProfitRub += pnl.annualOperatingProfitRub;
        filledOperatingProfitModelsCount += 1;
      } else {
        unfilledExpensesModelsCount += 1;
      }

      peakCapitalNeedRub += pnl.peakCapitalDeficitRub;
    }

    const factoryGroups = groupRecommendedBatchesByFactory(
      eligible,
      currentScenario
    );
    const investmentSummary = computeScenarioInvestmentSummary(
      eligible,
      currentScenario
    );
    const brandsReport = computeGroupBrandsInvestmentReport(
      eligible,
      currentScenario
    );

    return {
      eligibleModels: eligible,
      approvedOrdersCount,
      approvedOrdersRub,
      recommendedBatchesCount,
      recommendedPacks,
      recommendedPhysicalUnits,
      recommendedBudgetRub,
      honestOperatingProfitRub,
      filledOperatingProfitModelsCount,
      unfilledExpensesModelsCount,
      peakCapitalNeedRub,
      deficitModelsCount,
      urgentPastOrderBatchesCount,
      hypothesisModelsCount,
      orderDiscrepanciesCount,
      factoryGroups,
      investmentSummary,
      brandsReport,
    };
  }, [models, currentScenario, includeGroupPortfolioInS1]);

  // Отфильтрованные модели для каталога на Экране №1
  const filteredModels = useMemo(() => {
    const isActingScenario = currentScenario.id === ACTING_2027_SCENARIO_ID;
    const list = models.filter((m) => {
      if (m.launchStatus === 'В архиве' && statusFilterLocal !== 'В архиве') {
        return false;
      }
      if (isActingScenario) {
        const isActingMod =
          Boolean(getActingSkuByWbOrVendor(m.code, m.title)) ||
          (!['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
            m.id
          ) &&
            Boolean(m.plansByScenario[ACTING_2027_SCENARIO_ID]));
        if (!isActingMod) return false;
      } else if (currentScenario.id === 1) {
        if (
          ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(
            m.id
          )
        ) {
          return false;
        }
        if (!m.customBrandLabel && !currentScenario.includedBrands.includes(m.brandId)) {
          return false;
        }
      } else if (!m.customBrandLabel && !currentScenario.includedBrands.includes(m.brandId)) {
        return false;
      }
      if (brandFilterLocal !== 'ALL') {
        if (!matchesBrandFilter(m, brandFilterLocal)) {
          return false;
        }
      }
      if (statusFilterLocal !== 'ALL' && m.launchStatus !== statusFilterLocal) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const acting = getActingSkuByWbOrVendor(m.code, m.title);
        const match =
          m.code.toLowerCase().includes(q) ||
          m.title.toLowerCase().includes(q) ||
          m.subtitle.toLowerCase().includes(q) ||
          Boolean(acting?.wbSku.includes(q));
        if (!match) return false;
      }
      return true;
    });

    if (sortBy === 'dec_desc') {
      return [...list].sort(
        (a, b) =>
          computeModelScenarioMetrics(b, currentScenario).targetMonthRevenueRub -
          computeModelScenarioMetrics(a, currentScenario).targetMonthRevenueRub
      );
    }
    if (sortBy === 'year_desc') {
      return [...list].sort(
        (a, b) =>
          computeModelScenarioMetrics(b, currentScenario).annualRevenueRub -
          computeModelScenarioMetrics(a, currentScenario).annualRevenueRub
      );
    }
    if (sortBy === 'priority') {
      return [...list].sort((a, b) => {
        const wDiff =
          PRIORITY_WEIGHTS[getModelPriority(b)] - PRIORITY_WEIGHTS[getModelPriority(a)];
        if (wDiff !== 0) return wDiff;
        return (
          computeModelScenarioMetrics(b, currentScenario).targetMonthRevenueRub -
          computeModelScenarioMetrics(a, currentScenario).targetMonthRevenueRub
        );
      });
    }
    return list;
  }, [models, currentScenario, brandFilterLocal, statusFilterLocal, searchQuery, sortBy]);

  // Единая синхронизация модели сценария с основным Каталогом моделей (SKU)
  const syncScenarioModelToCatalog = useCallback(
    (spec: ScenarioModelSpec, prevSpec?: ScenarioModelSpec) => {
      const cleanCode = spec.code.replace(/[^0-9A-Za-zА-Яа-я-]/g, '') || '001';
      const targetSku = `${spec.brandId === 'NA_TELE' ? 'NT' : 'BRN'}-${cleanCode}`;

      const prevCleanCode = prevSpec
        ? prevSpec.code.replace(/[^0-9A-Za-zА-Яа-я-]/g, '') || '001'
        : cleanCode;
      const prevSku = prevSpec
        ? `${prevSpec.brandId === 'NA_TELE' ? 'NT' : 'BRN'}-${prevCleanCode}`
        : targetSku;

      const mainPhotoUrl =
        (spec.gallery.find((g) => g.isMain && g.url) ||
          spec.gallery.find((g) => Boolean(g.url)))?.url ||
        spec.palettes.find((p) => Boolean(p.imageUrl))?.imageUrl;

      const existing = products.find((p) => {
        const pSku = (p.sku || '').toUpperCase();
        const pName = (p.name || '').toUpperCase();
        return (
          pSku === targetSku.toUpperCase() ||
          pName === spec.title.toUpperCase() ||
          (prevSpec &&
            (pSku === prevSku.toUpperCase() ||
              pName === prevSpec.title.toUpperCase()))
        );
      });

      if (existing) {
        updateProduct(existing.id, {
          sku: targetSku,
          name: spec.title,
          brandId: spec.brandId,
          isArchived: false,
          materials: spec.fabric.composition,
          fitType: `${spec.subtitle} · резинка ${spec.waistband.width}`,
          ...(mainPhotoUrl
            ? {
                imageUrl: mainPhotoUrl,
                galleryUrls: [mainPhotoUrl],
              }
            : {}),
          economics: {
            ...existing.economics,
            plannedRetailPrice: spec.retailPriceRub,
            actualRetailPrice: spec.retailPriceRub,
            unitCostPrice: spec.unitCostRub,
            marketplaceCommissionRub: Math.round(
              (spec.retailPriceRub * spec.marketplaceFeePct) / 100
            ),
            logisticsRub: spec.logisticsRub,
            advertisingRub: Math.round((spec.retailPriceRub * spec.adsPct) / 100),
          },
        });
      } else {
        createProduct({
          sku: targetSku,
          name: spec.title,
          brandId: spec.brandId,
          category: 'Боксеры',
          productType: 'Базовая коллекция',
          priceSegment: 'Middle+',
          collection: `${spec.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS'} 2027`,
          materials: spec.fabric.composition,
          fitType: `${spec.subtitle} · резинка ${spec.waistband.width}`,
          imageUrl: mainPhotoUrl || undefined,
          economics: {
            currency: 'RUB',
            plannedRetailPrice: spec.retailPriceRub,
            actualRetailPrice: spec.retailPriceRub,
            discountPct: 0,
            vatPct: 20,
            returnRatePct: 3.5,
            unitCostPrice: spec.unitCostRub,
            marketplaceCommissionRub: Math.round(
              (spec.retailPriceRub * spec.marketplaceFeePct) / 100
            ),
            logisticsRub: spec.logisticsRub,
            advertisingRub: Math.round((spec.retailPriceRub * spec.adsPct) / 100),
            otherVariableRub: 0,
          },
        });
      }
    },
    [products, updateProduct, createProduct]
  );

  const handleUpdateModel = (updated: ScenarioModelSpec) => {
    const prevSpec = models.find((m) => m.id === updated.id);
    commitModels((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    syncScenarioModelToCatalog(updated, prevSpec);
  };

  // Смена приоритета прямо на карточке модели (Высший -> Высокий -> Средний -> Не указан)
  const handleCycleCardPriority = (mod: ScenarioModelSpec, e: React.MouseEvent) => {
    e.stopPropagation();
    const cur = getModelPriority(mod);
    const nextPrio = cycleModelPriority(cur);
    const updated: ScenarioModelSpec = {
      ...mod,
      priority: nextPrio,
      responsiblePerson: mod.responsiblePerson.includes('Приоритет:')
        ? mod.responsiblePerson.replace(/Приоритет:\s*[^·]+/, `Приоритет: ${nextPrio} `)
        : `Приоритет: ${nextPrio} · ${mod.responsiblePerson}`,
    };
    handleUpdateModel(updated);
    notify(
      'success',
      `Приоритет ${mod.code}: «${nextPrio}» (вес ×${PRIORITY_WEIGHTS[nextPrio]})`,
      'Нажмите «Авто-расчёт по приоритету», чтобы перераспределить план под цель.'
    );
  };

  // Быстрое изменение объёма декабря прямо на карточке на Экране №1 (с пропорциональным пересчётом месяцев)
  const handleQuickAdjustDecPacks = (
    mod: ScenarioModelSpec,
    nextDecPacksRaw: number,
    e?: React.SyntheticEvent
  ) => {
    if (e) e.stopPropagation();
    const nextDecPacks = Math.max(0, Math.round(nextDecPacksRaw));
    const curPlan =
      mod.plansByScenario[currentScenario.id] ||
      mod.plansByScenario[1] || {
        scenarioId: currentScenario.id,
        monthlyPacks: Array(12).fill(0),
        monthlyPricesRub: Array(12).fill(mod.retailPriceRub),
        monthlyReceiptsPacks: Array(12).fill(0),
        initialStockPacks: 0,
        firstOrderPacks: 0,
        nextOrderDateLabel: 'По графику сценария',
        salesStartMonthIdx: 0,
        warehouseArrivalMonthIdx: 0,
        warehouseArrivalDateLabel: 'По графику',
      };
    const oldDec = curPlan.monthlyPacks[11] || 0;
    const startIdx = curPlan.salesStartMonthIdx ?? 0;
    const nextMonthlyPacks = curPlan.monthlyPacks.map((val, mIdx) => {
      if (mIdx < startIdx) return 0;
      if (mIdx === 11) return nextDecPacks;
      if (oldDec > 0) {
        return Math.max(0, Math.round(val * (nextDecPacks / oldDec)));
      }
      const activeMonths = Math.max(1, 11 - startIdx);
      return Math.max(0, Math.round((nextDecPacks * (mIdx - startIdx + 1)) / (activeMonths + 1)));
    });
    const updated: ScenarioModelSpec = {
      ...mod,
      plansByScenario: {
        ...mod.plansByScenario,
        [currentScenario.id]: {
          ...curPlan,
          scenarioId: currentScenario.id,
          monthlyPacks: nextMonthlyPacks,
          monthlyReceiptsPacks: [...nextMonthlyPacks],
        },
      },
    };
    commitModels((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  // Авто-расчёт всех карточек сценария под целевую сумму (млн ₽ в декабре) по приоритетности
  const handleAutoCalculateByPriority = (targetOverrideMln?: number) => {
    const targetMln = targetOverrideMln ?? currentScenario.monthlyTargetMln;
    commitModels((prev) =>
      autoDistributeScenarioByPriority(prev, currentScenario, {
        keepActingWbFixed: true,
        targetMonthlyMlnOverride: targetMln,
      })
    );
    notify(
      'success',
      `⚡ Авто-расчёт по приоритету выполнен (цель: ${targetMln} млн ₽ / дек)`,
      'Объёмы карточек распределены пропорционально приоритетам (Высший ×1.40, Высокий ×1.15, Средний ×0.90, Не указан ×0.75).'
    );
  };

  // Изменение целевой суммы сценария (млн ₽ / дек) прямо из панели управления
  const handleUpdateScenarioTargetMln = (nextTargetMln: number) => {
    const cleanVal = Math.max(5, Math.round(nextTargetMln * 100) / 100);
    commitScenarios((prev) =>
      prev.map((s) =>
        s.id === currentScenario.id ? { ...s, monthlyTargetMln: cleanVal } : s
      )
    );
  };

  // Восстановление сохранённых клиентом продаж (109,94 млн ₽ в дек · 686,28 млн ₽ за 2027 г.)
  const handleRestoreClientSavedSales = () => {
    commitModels((prev) => applyClientSavedS1SalesPlan(prev));
    notify(
      'success',
      '✓ Восстановлены сохранённые продажи (109,94 млн ₽ в дек · 686,28 млн ₽ за 2027 г.)',
      'Декабрь 2027: 109 938 111 ₽ · Годовой план 2027: 686 284 972 ₽ · 21 SKU в цели BORNERS.'
    );
  };

  // Сброс к эталону 28-страничного PDF (15,04 млн WB + 85,11 млн 16 новых = 100,15 млн ₽ в дек)
  const handleResetToPdfBaseline = () => {
    const baseline = [...ACTING_2027_SCENARIO_MODELS, ...S1_100M_SCENARIO_MODELS];
    commitModels(baseline);
    commitScenarios(INITIAL_SCENARIOS);
    notify(
      'success',
      '↺ Восстановлен эталон PDF (100,15 млн ₽ в дек · 606,37 млн ₽ за 2027 г.)',
      '5 подтверждённых SKU WB (15,04 млн ₽) + 16 новых вариантов (85,11 млн ₽ / 41 400 компл.).'
    );
  };

  // Дублирование модели (п. 4.1)
  const handleDuplicateModel = (source: ScenarioModelSpec) => {
    const nextNum = String(models.length + 1).padStart(3, '0');
    const copy: ScenarioModelSpec = {
      ...source,
      id: `scen-model-${Date.now()}`,
      code: `№${nextNum}`,
      title: `${source.title} (КОПИЯ)`,
      launchStatus: 'В плане',
      hasActualSalesOrPurchases: false,
    };
    commitModels((prev) => [...prev, copy]);
    syncScenarioModelToCatalog(copy);
    setSelectedModelId(copy.id);
    notify('success', `Создана и сохранена копия модели ${copy.code} · ${copy.title}`);
  };

  // Полное удаление модели с немедленным сохранением в localStorage
  const handleDeleteOrArchiveModel = (target: ScenarioModelSpec) => {
    commitModels((prev) => {
      const remaining = prev.filter((m) => m.id !== target.id);
      if (selectedModelId === target.id && remaining[0]) {
        setSelectedModelId(remaining[0].id);
      }
      return remaining;
    });
    // Также архивируем одноимённый SKU в каталоге, если он был создан автоматически
    const matchingProduct = products.find(
      (p) =>
        !p.isArchived &&
        (p.name.toUpperCase() === target.title.toUpperCase() ||
          p.sku.endsWith(target.code.replace('№', '')))
    );
    if (matchingProduct) {
      archiveEntity('product', matchingProduct.id);
    }
    setScreen('scenarios');
    notify(
      'success',
      `Карточка модели ${target.code} · ${target.title} удалена`,
      'Изменения надёжно сохранены.'
    );
  };

  // Создание новой модели через короткую форму (п. 7.1, Тест 11)
  const createAndSaveModel = (openCardAfterSave: boolean) => {
    const nextNum = String(models.length + 1).padStart(3, '0');
    const cleanTitle = draftTitle.trim() || `НОВАЯ МОДЕЛЬ ${draftUnitsInPack} PACK`;
    const newId = `scen-model-${Date.now()}`;

    const basePlanPacks = [
      1800, 2200, 2700, 3200, 3800, 4200, 4600, 5100, 5600, 6200, 7100, 7500,
    ];
    const plansByScenario: ScenarioModelSpec['plansByScenario'] = {};
    scenarios.forEach((sc) => {
      plansByScenario[sc.id] = {
        scenarioId: sc.id,
        monthlyPacks: [...basePlanPacks],
        monthlyPricesRub: Array(12).fill(draftRetailPrice || 1290),
        monthlyReceiptsPacks: [6000, 0, 10000, 0, 12000, 0, 15000, 0, 16000, 0, 0, 0],
        initialStockPacks: 0,
        firstOrderPacks: 6000,
        nextOrderDateLabel: '20 мая 2027',
        salesStartMonthIdx: 2,
        warehouseArrivalMonthIdx: 2,
        warehouseArrivalDateLabel: '18 марта',
      };
    });

    const resolvedCustomBrand =
      draftBrand === 'AKUSHA'
        ? 'Акуша'
        : draftBrand === 'LISKANI'
        ? 'Liskani'
        : draftBrand === 'FUKAI'
        ? 'FUKAI'
        : draftBrand === 'NA_TELE'
        ? 'НА ТЕЛЕ'
        : 'BORNERS';

    const created: ScenarioModelSpec = {
      ...INITIAL_SCENARIO_MODELS[0],
      id: newId,
      code: `№${nextNum}`,
      title: cleanTitle.toUpperCase(),
      subtitle: `${draftType} · ${draftUnitsInPack} шт. в комплекте`,
      brandId: draftBrand === 'NA_TELE' ? 'NA_TELE' : 'BORNERS',
      customBrandLabel: resolvedCustomBrand,
      launchStatus: 'В плане',
      unitsInPack: draftUnitsInPack,
      retailPriceRub: draftRetailPrice || 1290,
      unitCostRub: draftUnitCost || 410,
      hasActualSalesOrPurchases: false,
      gallery: [
        {
          id: `g-main-${Date.now()}`,
          category: 'pack',
          label: 'Главное фото',
          isMain: true,
        },
      ],
      plansByScenario,
    };

    commitModels((prev) => [...prev, created]);
    setSelectedModelId(created.id);
    setNewModelModalOpen(false);
    setDraftTitle('');

    // Автоматически синхронизируем созданную модель с разделом «Модели (SKU)»
    syncScenarioModelToCatalog(created);

    if (openCardAfterSave) {
      navigateScreen('model', created.id);
    }
    notify(
      'success',
      `✓ Карточка ${created.code} / ${created.title} сохранена`,
      'Модель сохранена в Сценариях роста и автоматически добавлена в «Модели (SKU)».'
    );
  };

  const handleCreateNewModel = (e: React.FormEvent) => {
    e.preventDefault();
    createAndSaveModel(true);
  };

  // Создание нового сценария (п. 7.3 ТЗ: без дублирования товаров, копируются только коммерческие планы)
  const handleCreateNewScenario = (e: React.FormEvent) => {
    e.preventDefault();
    const newScenId = Math.max(...scenarios.map((s) => s.id)) + 1;
    const sourceScen =
      scenarios.find((s) => s.id === draftCopyFromScenarioId) || scenarios[0];
    const ratio =
      sourceScen.monthlyTargetMln > 0
        ? draftScenTargetMln / sourceScen.monthlyTargetMln
        : 1;

    const newScen: GrowthScenarioDef = {
      id: newScenId,
      title: draftScenTitle.trim() || `Сценарий №${newScenId}`,
      monthlyTargetMln: Math.max(10, draftScenTargetMln),
      targetMonthLabel: 'Декабрь 2027',
      targetMonthIdx: 11,
      scopeLabel: draftScenScope === 'BORNERS' ? 'BORNERS' : 'группа',
      includedBrands:
        draftScenScope === 'BORNERS' ? ['BORNERS'] : ['BORNERS', 'NA_TELE'],
      year: 2027,
    };

    // Копируем коммерческие планы моделей под новый сценарий без дублирования самих моделей
    commitModels((prev) =>
      prev.map((m) => {
        const srcPlan =
          m.plansByScenario[sourceScen.id] || m.plansByScenario[1];
        return {
          ...m,
          plansByScenario: {
            ...m.plansByScenario,
            [newScenId]: {
              ...srcPlan,
              scenarioId: newScenId,
              monthlyPacks: srcPlan.monthlyPacks.map((p) =>
                Math.round(p * ratio)
              ),
              firstOrderPacks: Math.round(srcPlan.firstOrderPacks * ratio),
            },
          },
        };
      })
    );

    commitScenarios((prev) => [...prev, newScen]);
    setSelectedScenarioId(newScenId);
    setNewScenarioModalOpen(false);
    setDraftScenTitle('');
    notify(
      'success',
      `${newScen.title} (${newScen.monthlyTargetMln} млн ₽/мес) создан и сохранён`,
      'Товары остались едиными, скопированы и масштабированы только планы продаж.'
    );
  };

  // Удаление сценария роста с немедленным сохранением в localStorage
  const handleDeleteScenario = (scToDelete: GrowthScenarioDef) => {
    if (scenarios.length <= 1) {
      notify(
        'warning',
        'Нельзя удалить последний оставшийся сценарий',
        'В системе должен оставаться хотя бы один базовый сценарий роста.'
      );
      return;
    }
    const remaining = scenarios.filter((s) => s.id !== scToDelete.id);
    commitScenarios(remaining);
    if (selectedScenarioId === scToDelete.id && remaining[0]) {
      setSelectedScenarioId(remaining[0].id);
    }
    notify(
      'warning',
      `Сценарий «${scToDelete.title} (${scToDelete.monthlyTargetMln} млн ₽/мес)» удалён`
    );
  };

  // Экспорт структурированного плана всего сценария (CSV / JSON, Тест-кейс №9 ТЗ v1.1)
  const handleExportScenarioPlan = (format: 'csv' | 'json') => {
    const rows = exportStructuredScenarioPlan(
      v11ScenarioSummary.eligibleModels,
      currentScenario
    );
    const content =
      format === 'csv'
        ? serializeStructuredPlanToCsv(rows)
        : JSON.stringify(rows, null, 2);
    const blob = new Blob([content], {
      type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `borners_plan_scenario_${currentScenario.id}_2027.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      'success',
      `План «${currentScenario.title}» выгружен (${rows.length} записей · ${format.toUpperCase()})`,
      'Сохранены идентификаторы SKU, периоды, цены, выкупы и статусы значений.'
    );
  };

  // Импорт структурированного плана сценария (CSV / JSON) с защитой от двойного счёта
  const handleImportScenarioPlanFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsedRows = parseStructuredPlanCsvOrJson(text, currentScenario.id);
      const res = importStructuredScenarioPlan(
        models,
        parsedRows,
        currentScenario.id
      );
      if (res.importedRowsCount > 0) {
        commitModels(res.updatedModels);
        notify(
          'success',
          `Импортирован план для ${res.importedSkusCount} SKU (${res.importedRowsCount} записей)`,
          res.duplicatesSkipped > 0
            ? `Защита от двойного счёта: отсеяно ${res.duplicatesSkipped} дублирующихся строк.`
            : 'Все цены, выкупы и статусы применены к сценарию без потерь.'
        );
      } else {
        notify('warning', 'В файле не найдено подходящих строк SKU для импорта');
      }
    } catch {
      notify('error', 'Не удалось прочитать файл плана (поддерживаются CSV и JSON)');
    }
    e.target.value = '';
  };

  const switcherModels = useMemo(
    () =>
      filteredModels.length > 0
        ? filteredModels
        : v11ScenarioSummary.eligibleModels.length > 0
        ? v11ScenarioSummary.eligibleModels
        : models,
    [filteredModels, v11ScenarioSummary.eligibleModels, models]
  );

  const activeSwitcherIdx = useMemo(
    () => switcherModels.findIndex((m) => m.id === activeModel.id),
    [switcherModels, activeModel.id]
  );

  useEffect(() => {
    if (screen === 'scenarios' || switcherModels.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '[') {
        e.preventDefault();
        const prevIdx =
          (Math.max(0, activeSwitcherIdx) - 1 + switcherModels.length) %
          switcherModels.length;
        const target = switcherModels[prevIdx];
        if (target) {
          setSelectedModelId(target.id);
          pushScenarioStep(screen, target.id);
        }
      } else if (e.key === ']') {
        e.preventDefault();
        const nextIdx =
          (Math.max(0, activeSwitcherIdx) + 1) % switcherModels.length;
        const target = switcherModels[nextIdx];
        if (target) {
          setSelectedModelId(target.id);
          pushScenarioStep(screen, target.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, switcherModels, activeSwitcherIdx, pushScenarioStep]);

  const conceptForPdf = concepts[0];
  const maxChartVal = Math.max(
    currentScenario.monthlyTargetMln * 1.05,
    ...(currentAgg?.monthlyTotalMln || [20])
  );

  return (
    <div className="space-y-6">
      {/* НАВИГАЦИОННАЯ СТРОКА ВЛОЖЕННОГО УРОВНЯ — ПОКАЗЫВАЕТСЯ ТОЛЬКО В ПАСПОРТЕ МОДЕЛИ И МАТРИЦЕ 12 МЕС. */}
      {screen !== 'scenarios' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-white border-[1.5px] border-[#C8C7BE] px-4 py-2.5">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-[9px] bg-[#EFEFE9] border-[1.5px] border-[#CECDC4] p-0.5 text-[12px]">
            <button
              type="button"
              onClick={() => navigateScreen('scenarios')}
              className="h-7.5 px-3 rounded-[7px] text-[#3F3E3A] hover:text-[#141413] hover:bg-white font-semibold transition cursor-pointer"
            >
              ← 1. Сценарии ({currentScenario.title})
            </button>
            <div className="h-3.5 w-[1px] bg-[#CECDC4]" />
            <button
              type="button"
              onClick={() => navigateScreen('model')}
              className={`h-7.5 px-3 rounded-[7px] transition cursor-pointer ${
                screen === 'model'
                  ? 'bg-[#141413] text-white font-semibold shadow-2xs'
                  : 'text-[#3F3E3A] hover:text-[#141413] hover:bg-white font-semibold'
              }`}
            >
              2. Паспорт SKU ({activeModel.code})
            </button>
            <div className="h-3.5 w-[1px] bg-[#CECDC4]" />
            <button
              type="button"
              onClick={() => navigateScreen('sales-plan')}
              className={`h-7.5 px-3 rounded-[7px] transition cursor-pointer ${
                screen === 'sales-plan'
                  ? 'bg-[#141413] text-white font-semibold shadow-2xs'
                  : 'text-[#3F3E3A] hover:text-[#141413] hover:bg-white font-semibold'
              }`}
            >
              3. Матрица 12 мес.
            </button>
          </div>

          {/* Быстрый переключатель SKU (‹ Пред. · Селектор · След. ›) без возврата в сетку */}
          {switcherModels.length > 1 && (
            <div className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#F5F5F1] border-[1.5px] border-[#CECDC4] p-1">
              <button
                type="button"
                onClick={() => {
                  const safeIdx = activeSwitcherIdx >= 0 ? activeSwitcherIdx : 0;
                  const prevMod =
                    switcherModels[
                      (safeIdx - 1 + switcherModels.length) % switcherModels.length
                    ];
                  if (prevMod) navigateScreen(screen, prevMod.id);
                }}
                title="Предыдущая модель сценария (клавиша [)"
                className="h-7 px-2.5 rounded-[6px] bg-white hover:border-[#141413] border border-[#CECDC4] text-[11.5px] font-semibold text-[#141413] cursor-pointer"
              >
                ‹ Пред.
              </button>
              <select
                value={activeModel.id}
                onChange={(e) => navigateScreen(screen, e.target.value)}
                aria-label="Быстрый выбор модели SKU"
                className="h-7 px-2 rounded-[6px] bg-white border border-[#CECDC4] text-[12px] font-bold text-[#141413] max-w-[230px] sm:max-w-[320px] cursor-pointer"
              >
                {switcherModels.map((m, idx) => {
                  const met = computeModelScenarioMetrics(m, currentScenario);
                  const acting = getActingSkuByWbOrVendor(m.code, m.title);
                  const codeLbl = acting ? `WB ${acting.wbSku}` : m.code;
                  return (
                    <option key={m.id} value={m.id}>
                      {idx + 1}/{switcherModels.length} · {codeLbl} — {m.title} (
                      {(met.targetMonthRevenueRub / 1_000_000)
                        .toFixed(2)
                        .replace('.', ',')}{' '}
                      млн/дек)
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                onClick={() => {
                  const safeIdx = activeSwitcherIdx >= 0 ? activeSwitcherIdx : 0;
                  const nextMod = switcherModels[(safeIdx + 1) % switcherModels.length];
                  if (nextMod) navigateScreen(screen, nextMod.id);
                }}
                title="Следующая модель сценария (клавиша ])"
                className="h-7 px-2.5 rounded-[6px] bg-white hover:border-[#141413] border border-[#CECDC4] text-[11.5px] font-semibold text-[#141413] cursor-pointer"
              >
                След. ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* ЭКРАН №2: КАРТОЧКА МОДЕЛИ */}
      {screen === 'model' && (
        <ScenarioModelCardScreen
          model={activeModel}
          scenario={currentScenario}
          allScenarios={scenarios}
          onSelectScenario={(id) => setSelectedScenarioId(id)}
          onBackToScenarios={() => navigateScreen('scenarios')}
          onOpenSalesPlan={() => navigateScreen('sales-plan')}
          onUpdateModel={handleUpdateModel}
          onDuplicateModel={handleDuplicateModel}
          onDeleteOrArchiveModel={handleDeleteOrArchiveModel}
          onOpenPdfModal={() => setPdfModalOpen(true)}
          notify={notify}
        />
      )}

      {/* ЭКРАН №3: ПЛАН ПРОДАЖ И ПРОИЗВОДСТВА */}
      {screen === 'sales-plan' && (
        <ScenarioSalesPlanScreen
          model={activeModel}
          scenario={currentScenario}
          allScenarios={scenarios}
          onSelectScenario={(id) => setSelectedScenarioId(id)}
          onBackToModel={() => navigateScreen('model')}
          onUpdateModel={handleUpdateModel}
          notify={notify}
        />
      )}

      {/* ЭКРАН №1: ИСПОЛНИТЕЛЬНАЯ СВОДКА В СТИЛЕ PEAKLY (ЕДИНЫЙ КОМАНДНЫЙ ЦЕНТР + ВИТРИНА МОДЕЛЕЙ) */}
      {screen === 'scenarios' && (
        <div className="space-y-5">
          {/* =====================================================================
              БЛОК 01 · ИСПОЛНИТЕЛЬНАЯ СВОДКА БИЗНЕСА (PEAKLY EXECUTIVE COMMAND CENTER)
              Объединяет выбор сценария, 4 ключевых бизнес-линзы и траекторию 12 мес. без дублей
          ===================================================================== */}
          <section className="rounded-[16px] bg-white border border-[#D8D7CF] overflow-hidden shadow-[0_2px_12px_-2px_rgba(20,20,19,0.04)]">
            {/* ВЕРХНЯЯ ПАНЕЛЬ КОМАНДНОГО ЦЕНТРА */}
            <div className="px-5 py-4 border-b border-[#E8E7DF] bg-[#FAF9F6] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-600" />
                    <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#686760]">
                      Сводка холдинга · План 2027
                    </span>
                  </div>
                  <h2 className="text-[20px] md:text-[22px] font-extrabold tracking-[-0.02em] text-[#141413] mt-0.5">
                    Стратегия роста BORNERS GROUP
                  </h2>
                </div>

                {currentScenario.id === 1 && (
                  <div className="inline-flex items-center rounded-[9px] bg-[#EFEFE9] border border-[#D8D7CF] p-0.5 text-[11.5px]">
                    <button
                      type="button"
                      onClick={() => setIncludeGroupPortfolioInS1(false)}
                      className={`px-2.5 py-1 rounded-[7px] font-semibold transition cursor-pointer ${
                        !includeGroupPortfolioInS1
                          ? 'bg-[#141413] text-white'
                          : 'text-[#5C5B55] hover:text-[#141413]'
                      }`}
                    >
                      Цель BORNERS · 21 SKU
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncludeGroupPortfolioInS1(true)}
                      className={`px-2.5 py-1 rounded-[7px] font-semibold transition cursor-pointer ${
                        includeGroupPortfolioInS1
                          ? 'bg-[#141413] text-white'
                          : 'text-[#5C5B55] hover:text-[#141413]'
                      }`}
                    >
                      С FUKAI · 23 SKU
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={scenarioPlanImportRef}
                  type="file"
                  accept=".csv,.json"
                  onChange={handleImportScenarioPlanFile}
                  className="hidden"
                />

                {currentScenario.id !== ACTING_2027_SCENARIO_ID && (
                  <div className="inline-flex items-center gap-1 rounded-[9px] bg-white border border-[#CFCEC6] p-0.5 pl-2.5">
                    <span className="text-[11.5px] font-medium text-[#686760]">Цель дек:</span>
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      step={5}
                      value={currentScenario.monthlyTargetMln}
                      onChange={(e) =>
                        handleUpdateScenarioTargetMln(Number(e.target.value) || 100)
                      }
                      className="w-12 text-right font-mono text-[12.5px] font-extrabold text-[#141413] bg-transparent focus:outline-none"
                    />
                    <span className="text-[11px] font-medium text-[#686760] mr-1">млн</span>
                    <button
                      type="button"
                      onClick={() => handleAutoCalculateByPriority()}
                      className="h-7 px-2.5 rounded-[7px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[11.5px] font-semibold transition cursor-pointer"
                    >
                      Под цель
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setMathBreakdownOpen((v) => !v)}
                  aria-expanded={mathBreakdownOpen}
                  className={`h-8 px-3 rounded-[9px] border text-[12px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                    mathBreakdownOpen
                      ? 'bg-[#141413] text-white border-[#141413]'
                      : 'bg-white text-[#141413] border-[#CFCEC6] hover:bg-[#F4F3EE]'
                  }`}
                >
                  <span>По брендам и расчёт</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      mathBreakdownOpen ? 'rotate-180 text-white' : 'text-[#686760]'
                    }`}
                  />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((v) => !v)}
                    aria-expanded={exportMenuOpen}
                    className="h-8 px-3 rounded-[9px] bg-white hover:bg-[#F4F3EE] border border-[#CFCEC6] text-[12px] font-semibold text-[#141413] inline-flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <span>Экспорт и эталоны</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-[#686760] transition-transform ${
                        exportMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {exportMenuOpen && (
                    <>
                      <div
                        onClick={() => setExportMenuOpen(false)}
                        className="fixed inset-0 z-40"
                      />
                      <div className="absolute right-0 mt-1.5 w-76 rounded-[14px] bg-white border border-[#CFCEC6] shadow-[0_16px_40px_rgba(20,20,19,0.14)] p-2 z-50 text-[12px] space-y-1.5">
                        {currentScenario.id !== ACTING_2027_SCENARIO_ID && (
                          <div className="pb-1.5 border-b border-[#EAE9E2] space-y-0.5">
                            <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#686762]">
                              Эталоны продаж и веса
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setExportMenuOpen(false);
                                handleRestoreClientSavedSales();
                              }}
                              className="w-full px-2.5 py-2 rounded-[8px] hover:bg-[#F5F5F1] text-left font-semibold text-[#141413] flex items-center justify-between cursor-pointer"
                            >
                              <span>Сохранённые продажи</span>
                              <span className="font-mono text-[11px] text-[#157347] font-bold">
                                109,94 млн ₽
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExportMenuOpen(false);
                                handleResetToPdfBaseline();
                              }}
                              className="w-full px-2.5 py-2 rounded-[8px] hover:bg-[#F5F5F1] text-left font-semibold text-[#141413] flex items-center justify-between cursor-pointer"
                            >
                              <span>Сбросить к эталону PDF</span>
                              <span className="font-mono text-[11px] text-[#5E5D58]">
                                100,15 млн ₽
                              </span>
                            </button>
                          </div>
                        )}

                        <div className="pb-1.5 border-b border-[#EAE9E2] space-y-0.5">
                          <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#686762]">
                            Обмен планом сценария
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setExportMenuOpen(false);
                              handleExportScenarioPlan('csv');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F5F5F1] text-left font-medium text-[#141413] flex items-center justify-between cursor-pointer"
                          >
                            <span>Экспорт плана</span>
                            <span className="font-mono text-[10.5px] text-[#686762]">CSV</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExportMenuOpen(false);
                              handleExportScenarioPlan('json');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F5F5F1] text-left font-medium text-[#141413] flex items-center justify-between cursor-pointer"
                          >
                            <span>Экспорт плана</span>
                            <span className="font-mono text-[10.5px] text-[#686762]">JSON</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExportMenuOpen(false);
                              scenarioPlanImportRef.current?.click();
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F5F5F1] text-left font-medium text-[#141413] flex items-center justify-between cursor-pointer"
                          >
                            <span>Импорт плана</span>
                            <span className="font-mono text-[10.5px] text-[#686762]">CSV / JSON</span>
                          </button>
                        </div>

                        <div className="space-y-0.5">
                          <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#686762]">
                            Документы PDF
                          </div>
                          <a
                            href="docs/tz-v1.1/BORNERS_TZ_v1_1.pdf"
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setExportMenuOpen(false)}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F5F5F1] text-left font-medium text-[#141413] flex items-center justify-between"
                          >
                            <span>Техническое задание v1.1</span>
                            <span className="font-mono text-[10.5px] text-[#686762]">PDF</span>
                          </a>
                          <a
                            href="docs/s1-100m/BORNERS_2027_S1_100M_Plan.pdf"
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setExportMenuOpen(false)}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F5F5F1] text-left font-medium text-[#141413] flex items-center justify-between"
                          >
                            <span>Презентация сценария (28 стр.)</span>
                            <span className="font-mono text-[10.5px] text-[#686762]">PDF</span>
                          </a>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {onOpenStudioCanvas && (
                  <button
                    type="button"
                    data-tour="studio-canvas"
                    onClick={onOpenStudioCanvas}
                    className="h-8 px-3 rounded-[9px] border border-[#CFCEC6] bg-white hover:bg-[#F4F3EE] text-[12px] font-semibold text-[#141413] transition cursor-pointer"
                  >
                    Студия идей
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setNewScenarioModalOpen(true)}
                  className="h-8 px-3.5 rounded-[9px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[12px] font-semibold transition cursor-pointer"
                >
                  + Новый сценарий
                </button>
              </div>
            </div>

            {/* РЯД 1: ПОРТФЕЛЬ СЦЕНАРИЕВ С АКЦЕНТНОЙ HERO-КАРТОЧКОЙ АКТИВНОГО СЦЕНАРИЯ */}
            <div
              data-tour="growth-scenarios"
              className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 bg-white border-b border-[#EAE9E2]"
            >
              {[...scenarios]
                .sort((a, b) =>
                  a.id === ACTING_2027_SCENARIO_ID
                    ? -1
                    : b.id === ACTING_2027_SCENARIO_ID
                    ? 1
                    : a.id - b.id
                )
                .map((sc) => {
                  const isSelected = sc.id === currentScenario.id;
                  const agg = scenarioAggregates[sc.id];
                  const annualMln = agg
                    ? (agg.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')
                    : '0';
                  const liveDecMlnNum = agg
                    ? Math.round((agg.targetMonthRevenueRub / 1_000_000) * 100) / 100
                    : sc.monthlyTargetMln;
                  const liveDecMlnStr = liveDecMlnNum.toFixed(2).replace('.', ',');
                  const targetMlnNum =
                    sc.id === ACTING_2027_SCENARIO_ID
                      ? Math.round(
                          (ACTING_2027_CONTROL_TOTALS.decemberRevenueRub / 1_000_000) * 100
                        ) / 100
                      : sc.monthlyTargetMln;
                  const diffMlnNum = Math.round((liveDecMlnNum - targetMlnNum) * 100) / 100;
                  const diffSign = diffMlnNum > 0 ? '+' : '';
                  const pctNum = agg ? agg.goalCompletionPct : 100;
                  const pctStr = pctNum.toFixed(1).replace('.', ',');
                  const progressWidth = Math.min(100, Math.max(10, Math.round(pctNum)));

                  return (
                    <div
                      key={sc.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedScenarioId(sc.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedScenarioId(sc.id);
                        }
                      }}
                      className={`group rounded-[14px] p-4 text-left transition-all cursor-pointer relative flex flex-col justify-between ${
                        isSelected
                          ? 'bg-gradient-to-br from-[#161615] via-[#1F1F1C] to-[#121210] text-white border border-[#141413] shadow-[0_14px_30px_-8px_rgba(20,20,19,0.28)]'
                          : 'bg-[#FAF9F6]/70 border border-[#DEDDD5] hover:border-[#141413] hover:bg-white hover:shadow-[0_6px_18px_-4px_rgba(20,20,19,0.06)]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[12px] font-bold truncate ${
                              isSelected ? 'text-white/90' : 'text-[#3D3C37]'
                            }`}
                          >
                            {sc.id === ACTING_2027_SCENARIO_ID
                              ? 'Исходный план 2027 · ИП Нерсесянц'
                              : `${sc.title} · ${sc.scopeLabel}`}
                          </span>

                          <div className="flex items-center gap-1 shrink-0">
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                Активен
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-[5px] bg-white border border-[#E2E1D9] text-[#686760] text-[10px] font-mono font-semibold">
                                {agg?.modelsCount || 0} SKU
                              </span>
                            )}
                            {scenarios.length > 1 && sc.id !== ACTING_2027_SCENARIO_ID && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteScenario(sc);
                                }}
                                title={`Удалить сценарий «${sc.title}»`}
                                aria-label={`Удалить сценарий ${sc.title}`}
                                className={`h-5 w-5 rounded-[5px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 flex items-center justify-center text-[12px] leading-none font-bold transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-white/10 text-white/70 hover:bg-rose-500/30 hover:text-rose-200'
                                    : 'bg-white hover:bg-rose-50 text-[#686762] hover:text-rose-700 border border-[#CECDC4]'
                                }`}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-baseline justify-between gap-2 mt-2.5">
                          <div
                            className={`font-mono text-[23px] font-extrabold tracking-[-0.02em] ${
                              isSelected ? 'text-white' : 'text-[#141413]'
                            }`}
                          >
                            {liveDecMlnStr} млн ₽{' '}
                            <span
                              className={`font-sans text-[11.5px] font-medium ${
                                isSelected ? 'text-white/60' : 'text-[#686760]'
                              }`}
                            >
                              / дек
                            </span>
                          </div>
                          {sc.id !== ACTING_2027_SCENARIO_ID ? (
                            <span
                              className={`px-2 py-0.5 rounded-[6px] font-mono text-[10.5px] font-bold border ${
                                isSelected
                                  ? diffMlnNum >= -0.05
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                                    : 'bg-white/10 text-white/85 border-white/15'
                                  : diffMlnNum >= -0.05
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-[#F4F3EE] text-[#52514C] border-[#DFDED7]'
                              }`}
                            >
                              {diffSign}
                              {diffMlnNum.toFixed(1).replace('.', ',')} млн ({pctStr}%)
                            </span>
                          ) : (
                            <span
                              className={`px-2 py-0.5 rounded-[6px] text-[10px] font-bold border ${
                                isSelected
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              База WB
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Визуальный прогресс-бар выполнения цели декабря в стиле Peakly */}
                      <div className="mt-3 space-y-1.5">
                        <div
                          className={`h-1.5 w-full rounded-full overflow-hidden ${
                            isSelected ? 'bg-white/15' : 'bg-[#E6E5DD]'
                          }`}
                        >
                          <div
                            style={{ width: `${progressWidth}%` }}
                            className={`h-full rounded-full transition-all ${
                              isSelected
                                ? 'bg-gradient-to-r from-emerald-400 to-teal-300'
                                : pctNum >= 99.5
                                  ? 'bg-emerald-600'
                                  : 'bg-[#686760]'
                            }`}
                          />
                        </div>
                        <div
                          className={`flex items-center justify-between gap-2 text-[11px] ${
                            isSelected ? 'text-white/70' : 'text-[#686760]'
                          }`}
                        >
                          <span>
                            Цель:{' '}
                            <strong
                              className={`font-mono ${
                                isSelected ? 'text-white' : 'text-[#141413]'
                              }`}
                            >
                              {String(targetMlnNum).replace('.', ',')} млн
                            </strong>
                          </span>
                          <span>
                            За год:{' '}
                            <strong
                              className={`font-mono ${
                                isSelected ? 'text-white' : 'text-[#141413]'
                              }`}
                            >
                              {annualMln} млн ₽
                            </strong>{' '}
                            · {agg?.modelsCount || 0} мод.
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* РЯД 2: 4 ОБЪЁМНЫЕ БИЗНЕС-КАРТОЧКИ PEAKLY С ИКОНКАМИ, МИКРО-ШКАЛАМИ И АКЦЕНТАМИ */}
            {(() => {
              const isActing = currentScenario.id === ACTING_2027_SCENARIO_ID;
              const annualRevMln = (currentAgg.annualRevenueRub / 1_000_000)
                .toFixed(2)
                .replace('.', ',');
              const avgMonthlyMln = (currentAgg.annualRevenueRub / 12 / 1_000_000)
                .toFixed(2)
                .replace('.', ',');
              const avgCheckRub =
                currentAgg.annualBuyoutsPacks > 0
                  ? Math.round(currentAgg.annualRevenueRub / currentAgg.annualBuyoutsPacks)
                  : 0;
              const procBudgetRub = isActing
                ? currentAgg.totalPurchaseNeedRub
                : v11ScenarioSummary.recommendedBudgetRub;
              const procBudgetMln = (procBudgetRub / 1_000_000).toFixed(2).replace('.', ',');
              const cogsShareNum =
                currentAgg.annualRevenueRub > 0
                  ? Math.round((procBudgetRub / currentAgg.annualRevenueRub) * 1000) / 10
                  : 0;
              const cogsSharePct = cogsShareNum.toFixed(1).replace('.', ',');
              const grossMarginRub = currentAgg.annualRevenueRub - procBudgetRub;
              const grossMarginMln = (grossMarginRub / 1_000_000).toFixed(2).replace('.', ',');
              const grossMarginNum =
                currentAgg.annualRevenueRub > 0
                  ? Math.round((grossMarginRub / currentAgg.annualRevenueRub) * 1000) / 10
                  : 0;
              const grossMarginPct = grossMarginNum.toFixed(1).replace('.', ',');
              const wbShareDecPct =
                currentAgg.targetMonthRevenueRub > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (currentAgg.actingDecRevenueRub / currentAgg.targetMonthRevenueRub) * 100
                      )
                    )
                  : 100;

              return (
                <div className="p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 bg-[#FAF9F6]">
                  {/* Карточка 1: Пик сезона (Декабрь 2027) */}
                  <div className="rounded-[14px] bg-white border border-[#DEDDD5] p-4 flex flex-col justify-between gap-3 shadow-[0_2px_8px_rgba(20,20,19,0.025)]">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2">
                          <span className="h-7 w-7 rounded-[8px] bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center">
                            <TrendingUp className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-[11px] font-bold uppercase tracking-wide text-[#52514C]">
                            Пик сезона · Дек 2027
                          </span>
                        </div>
                        <span className="rounded-md bg-[#F4F3EE] border border-[#E2E1D9] px-2 py-0.5 font-mono text-[10.5px] font-bold text-[#141413]">
                          {currentAgg.targetMonthPacks.toLocaleString('ru-RU')} компл.
                        </span>
                      </div>
                      <div className="mt-2.5 font-mono text-[24px] font-extrabold tracking-[-0.02em] text-[#141413]">
                        {(currentAgg.targetMonthRevenueRub / 1_000_000)
                          .toFixed(2)
                          .replace('.', ',')}{' '}
                        млн ₽
                      </div>
                    </div>

                    {isActing ? (
                      <div className="space-y-1.5 pt-2 border-t border-[#EFEFE9]">
                        <div className="h-1.5 w-full rounded-full bg-emerald-600" />
                        <div className="text-[11.5px] text-[#5C5B55] flex items-center justify-between">
                          <span>100% база Wildberries</span>
                          <span className="font-mono font-bold text-emerald-800">7 SKU сверены</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 pt-2 border-t border-[#EFEFE9]">
                        <div className="h-1.5 w-full rounded-full bg-[#E4E3DC] overflow-hidden flex">
                          <div
                            style={{ width: `${wbShareDecPct}%` }}
                            className="h-full bg-emerald-600"
                            title="Действующая база WB"
                          />
                          <div
                            style={{ width: `${100 - wbShareDecPct}%` }}
                            className="h-full bg-[#141413]"
                            title="Новые модели 2027"
                          />
                        </div>
                        <div className="text-[11px] text-[#5C5B55] flex items-center justify-between gap-2">
                          <span>
                            База WB:{' '}
                            <strong className="font-mono text-[#141413]">
                              {(currentAgg.actingDecRevenueRub / 1_000_000)
                                .toFixed(1)
                                .replace('.', ',')}{' '}
                              млн
                            </strong>
                          </span>
                          <span>
                            Новинки:{' '}
                            <strong className="font-mono text-[#141413]">
                              {(currentAgg.newDecRevenueRub / 1_000_000)
                                .toFixed(1)
                                .replace('.', ',')}{' '}
                              млн
                            </strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Карточка 2: Годовой оборот 2027 */}
                  <div className="rounded-[14px] bg-white border border-[#DEDDD5] p-4 flex flex-col justify-between gap-3 shadow-[0_2px_8px_rgba(20,20,19,0.025)]">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2">
                          <span className="h-7 w-7 rounded-[8px] bg-sky-50 border border-sky-200/80 text-sky-700 flex items-center justify-center">
                            <BarChart3 className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-[11px] font-bold uppercase tracking-wide text-[#52514C]">
                            Годовой оборот
                          </span>
                        </div>
                        <span className="rounded-md bg-[#F4F3EE] border border-[#E2E1D9] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#52514C]">
                          ~{avgMonthlyMln} млн/мес
                        </span>
                      </div>
                      <div className="mt-2.5 font-mono text-[24px] font-extrabold tracking-[-0.02em] text-[#141413]">
                        {annualRevMln} млн ₽
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#EFEFE9]">
                      <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#5C5B55]">
                        <span>
                          Выкупы:{' '}
                          <strong className="font-mono text-[#141413]">
                            {currentAgg.annualBuyoutsPacks.toLocaleString('ru-RU')} компл.
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => navigateTo('launch-calendar')}
                          className="inline-flex items-center gap-0.5 font-bold text-[#141413] hover:underline cursor-pointer shrink-0"
                        >
                          <span>02 · Продажи</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Карточка 3: Вложить на старт и пик своих денег (с учётом оборота WB) */}
                  <div className="rounded-[14px] bg-white border border-[#DEDDD5] p-4 flex flex-col justify-between gap-3 shadow-[0_2px_8px_rgba(20,20,19,0.025)]">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2">
                          <span className="h-7 w-7 rounded-[8px] bg-amber-50 border border-amber-200/80 text-amber-800 flex items-center justify-center">
                            <Package className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-[11px] font-bold uppercase tracking-wide text-[#52514C]">
                            Вложить на старт (Q1)
                          </span>
                        </div>
                        <span className="rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 font-mono text-[10.5px] font-bold text-amber-900">
                          Аванс 30%: {(v11ScenarioSummary.investmentSummary.firstWavePrepaymentRub / 1_000_000).toFixed(2).replace('.', ',')} млн
                        </span>
                      </div>
                      <div className="mt-2.5 font-mono text-[24px] font-extrabold tracking-[-0.02em] text-[#141413]">
                        {(v11ScenarioSummary.investmentSummary.firstWaveStartBudgetRub / 1_000_000)
                          .toFixed(2)
                          .replace('.', ',')}{' '}
                        млн ₽
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-[#EFEFE9]">
                      <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#5C5B55]">
                        <span>
                          Пик своих денег (с WB):{' '}
                          <strong className="font-mono text-[#1E3A8A]">
                            {(v11ScenarioSummary.investmentSummary.netOwnMoneyRequiredRub / 1_000_000)
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн
                          </strong>{' '}
                          <span className="text-[10.5px] text-[#686760]">
                            (год: {procBudgetMln} млн)
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => navigateTo('roadmap-tasks')}
                          className="inline-flex items-center gap-0.5 font-bold text-[#141413] hover:underline cursor-pointer shrink-0"
                        >
                          <span>03 · Закупки</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Карточка 4: Ожидаемая прибыль (после себестоимости, комиссий WB, логистики и рекламы) */}
                  <div className="rounded-[14px] bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 border border-emerald-200/90 p-4 flex flex-col justify-between gap-3 shadow-[0_2px_10px_rgba(16,185,129,0.06)]">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2">
                          <span className="h-7 w-7 rounded-[8px] bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                            <Wallet className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-950">
                            Ожидаемая прибыль
                          </span>
                        </div>
                        <span className="rounded-md bg-emerald-100/90 border border-emerald-300/80 px-2 py-0.5 font-mono text-[10.5px] font-extrabold text-emerald-900">
                          {v11ScenarioSummary.investmentSummary.operatingMarginPct
                            .toFixed(1)
                            .replace('.', ',')}% рентаб.
                        </span>
                      </div>
                      <div className="mt-2.5 font-mono text-[24px] font-extrabold tracking-[-0.02em] text-emerald-900">
                        +
                        {(
                          v11ScenarioSummary.investmentSummary.annualEstimatedOperatingProfitRub /
                          1_000_000
                        )
                          .toFixed(2)
                          .replace('.', ',')}{' '}
                        млн ₽
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-emerald-200/60">
                      <div className="flex items-center justify-between gap-2 text-[11.5px] text-emerald-950/80">
                        <span>
                          Себест. продаж:{' '}
                          <strong className="font-mono text-[#141413]">
                            {(v11ScenarioSummary.investmentSummary.annualSoldGoodsCostRub / 1_000_000)
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => navigateTo('finance')}
                          className="inline-flex items-center gap-0.5 font-bold text-emerald-950 hover:underline cursor-pointer shrink-0"
                        >
                          <span>04 · Финансы</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* РЯД 3: PEAKLY ANALYTICS BENTO — ГРАФИК ДИНАМИКИ 12 МЕС. (8 КОЛ.) + ТОП-4 ЛИДЕРА ВЫРУЧКИ (4 КОЛ.) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#EAE9E2] bg-white border-t border-[#EAE9E2]">
              {/* ЛЕВАЯ ЧАСТЬ (8 колонок): Высокий интерактивный график выручки по месяцам */}
              <div className="lg:col-span-8 p-4 md:p-5 flex flex-col justify-between">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <div className="text-[13px] font-extrabold text-[#141413]">
                      Помесячная динамика выручки 2027 (Янв — Дек)
                    </div>
                    <div className="text-[11px] text-[#686760]">
                      Нажмите на столбец любого месяца для просмотра детального объёма
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-[11.5px]">
                    {(() => {
                      const bSel = currentAgg?.monthlyBornersMln[selectedChartMonthIdx] || 0;
                      const nSel = currentAgg?.monthlyNaTeleMln[selectedChartMonthIdx] || 0;
                      const totSel = Math.round((bSel + nSel) * 100) / 100;
                      return (
                        <span className="rounded-[8px] bg-[#141413] text-white px-3 py-1 font-mono text-[11.5px] font-bold shadow-2xs">
                          {MONTHS_SHORT_RU[selectedChartMonthIdx]} 2027: {totSel.toFixed(2).replace('.', ',')} млн ₽
                        </span>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => navigateTo('launch-calendar')}
                      className="h-7.5 px-2.5 rounded-[8px] border border-[#CFCEC6] bg-[#FAF9F6] hover:bg-[#EFEFE9] font-semibold text-[#141413] cursor-pointer transition"
                    >
                      Матрица 12 мес. →
                    </button>
                  </div>
                </div>

                {/* Полотно графика с сеткой и объёмными столбцами */}
                <div className="relative rounded-[12px] bg-[#FAF9F6] border border-[#E8E7DF] px-3 pt-5 pb-2.5">
                  <div className="grid grid-cols-12 gap-2 items-end h-[116px]">
                    {MONTHS_SHORT_RU.map((mName, idx) => {
                      const bVal = currentAgg?.monthlyBornersMln[idx] || 0;
                      const nVal = currentAgg?.monthlyNaTeleMln[idx] || 0;
                      const totVal = Math.round((bVal + nVal) * 10) / 10;
                      const barHeight = Math.max(14, Math.round((totVal / maxChartVal) * 84));
                      const isSel = selectedChartMonthIdx === idx;
                      const isDec = idx === 11;

                      return (
                        <button
                          type="button"
                          key={mName}
                          onClick={() => setSelectedChartMonthIdx(idx)}
                          className={`h-full flex flex-col items-center justify-end gap-1.5 rounded-[8px] px-1 py-1 transition cursor-pointer group ${
                            isSel ? 'bg-white shadow-2xs ring-1 ring-[#D5D4CC]' : 'hover:bg-white/70'
                          }`}
                        >
                          <span
                            className={`font-mono text-[10px] leading-none ${
                              isSel || isDec
                                ? 'font-extrabold text-[#141413]'
                                : 'font-semibold text-[#686760] group-hover:text-[#141413]'
                            }`}
                          >
                            {totVal.toFixed(1).replace('.', ',')}
                          </span>
                          <div className="w-full flex justify-center items-end">
                            <div
                              style={{ height: `${barHeight}px` }}
                              className={`w-full max-w-[34px] rounded-t-[6px] rounded-b-[3px] transition-all ${
                                isDec
                                  ? 'bg-gradient-to-t from-emerald-700 to-emerald-500 shadow-[0_4px_12px_rgba(16,185,129,0.25)]'
                                  : isSel
                                    ? 'bg-gradient-to-t from-[#141413] to-[#3A3935]'
                                    : 'bg-gradient-to-t from-[#B8B7AE] to-[#CFCEC6] group-hover:from-[#52514C] group-hover:to-[#787770]'
                              }`}
                            />
                          </div>
                          <span
                            className={`text-[10.5px] leading-none ${
                              isSel
                                ? 'font-extrabold text-[#141413]'
                                : isDec
                                  ? 'font-bold text-emerald-800'
                                  : 'font-semibold text-[#686760]'
                            }`}
                          >
                            {mName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ПРАВАЯ ЧАСТЬ (4 колонки): Топ-4 драйвера выручки сценария с долями */}
              <div className="lg:col-span-4 p-4 md:p-5 flex flex-col justify-between bg-[#FAF9F6]/40">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="text-[13px] font-extrabold text-[#141413]">
                        Лидеры выручки сценария
                      </div>
                      <div className="text-[11px] text-[#686760]">
                        Топ-4 SKU по вкладу в годовой оборот
                      </div>
                    </div>
                    <span className="rounded-md bg-[#F4F3EE] border border-[#E2E1D9] px-2 py-0.5 font-mono text-[10.5px] font-bold text-[#52514C]">
                      Топ-4 из {filteredModels.length}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {[...filteredModels]
                      .map((m) => ({
                        model: m,
                        met: computeModelScenarioMetrics(m, currentScenario),
                      }))
                      .sort((a, b) => b.met.annualRevenueRub - a.met.annualRevenueRub)
                      .slice(0, 4)
                      .map(({ model: topMod, met: topMet }, idx) => {
                        const sharePct =
                          currentAgg.annualRevenueRub > 0
                            ? Math.round(
                                (topMet.annualRevenueRub / currentAgg.annualRevenueRub) * 1000
                              ) / 10
                            : 0;
                        const barW = Math.min(100, Math.max(8, Math.round(sharePct * 2.2)));
                        return (
                          <button
                            key={topMod.id}
                            type="button"
                            onClick={() => navigateScreen('model', topMod.id)}
                            className="w-full rounded-[10px] bg-white border border-[#E2E1D9] hover:border-[#141413] p-2.5 text-left transition cursor-pointer group"
                          >
                            <div className="flex items-center justify-between gap-2 text-[12px]">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`h-5 w-5 rounded-md font-mono text-[10.5px] font-bold flex items-center justify-center shrink-0 ${
                                    idx === 0
                                      ? 'bg-[#141413] text-white'
                                      : 'bg-[#F4F3EE] text-[#52514C]'
                                  }`}
                                >
                                  #{idx + 1}
                                </span>
                                <span className="font-bold text-[#141413] group-hover:underline truncate">
                                  {topMod.title}
                                </span>
                              </div>
                              <div className="font-mono text-[12px] font-extrabold text-[#141413] shrink-0">
                                {(topMet.annualRevenueRub / 1_000_000)
                                  .toFixed(2)
                                  .replace('.', ',')}{' '}
                                млн ₽
                              </div>
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-[#ECEBE4] overflow-hidden">
                                <div
                                  style={{ width: `${barW}%` }}
                                  className={`h-full rounded-full ${
                                    idx === 0 ? 'bg-emerald-600' : 'bg-[#141413]'
                                  }`}
                                />
                              </div>
                              <span className="font-mono text-[10.5px] font-semibold text-[#686760] w-11 text-right">
                                {sharePct.toFixed(1).replace('.', ',')}%
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>

            {/* Детальный разбор по брендам, формуле декабря и партиям — открывается по кнопке «По брендам и расчёт» */}
            {(mathBreakdownOpen || v11ContourExpanded) && (
              <div className="p-5 bg-[#FAF9F6] border-t border-[#E4E3DC] space-y-4">
                {/* СВОДНАЯ ТАБЛИЦА ПО БРЕНДАМ И ГРУППЕ (РАЗДЕЛ 09.2 ТЗ) */}
                <div className="rounded-[12px] bg-white border border-[#D8D7CF] p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[13px] font-bold text-[#141413]">
                      Сводная таблица инвестиций, закупок и прибыли по брендам группы (2027)
                    </div>
                    <span className="text-[11.5px] text-[#5E5D58]">
                      Итого по группе рассчитано без двойного счёта · Пик своих денег учитывает возврат выручки с WB
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded-[10px] border border-[#E4E3DC]">
                    <table className="w-full min-w-[780px] text-left border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-[#FAF9F6] text-[#5E5D58] border-b border-[#E4E3DC] text-[10.5px] uppercase tracking-wide">
                          <th className="py-2 px-3 font-bold">Бренд</th>
                          <th className="py-2 px-2.5 font-bold text-right">Моделей</th>
                          <th className="py-2 px-3 font-bold text-right">Выручка 2027</th>
                          <th className="py-2 px-3 font-bold text-right">К заказу</th>
                          <th className="py-2 px-3 font-bold text-right bg-[#F2FBF6] text-[#0F5132]">
                            Вложить на старт (Q1)
                          </th>
                          <th className="py-2 px-3 font-bold text-right bg-[#F4F8FF] text-[#1E3A8A]">
                            Пик своих денег (с WB)
                          </th>
                          <th className="py-2 px-3 font-bold text-right">Закупки за год</th>
                          <th className="py-2 px-3 font-bold text-right">Себест. продаж</th>
                          <th className="py-2 px-3 font-bold text-right">Ожид. прибыль</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECEBE4]">
                        {v11ScenarioSummary.brandsReport.brands.map((b) => (
                          <tr key={b.brandCode} className="hover:bg-[#FAF9F6]">
                            <td className="py-2 px-3 font-bold text-[#141413]">{b.brandTitle}</td>
                            <td className="py-2 px-2.5 text-right font-mono text-[#52514C]">
                              {b.modelsCount}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-[#141413]">
                              {b.modelsCount > 0
                                ? `${(b.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[#52514C]">
                              {b.modelsCount > 0
                                ? `${b.totalProcurementPacks.toLocaleString('ru-RU')} компл.`
                                : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono bg-[#F2FBF6]/60 text-[#0F5132] font-bold">
                              {b.modelsCount > 0
                                ? `${(b.firstWaveStartBudgetRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono bg-[#F4F8FF]/60 text-[#1E3A8A] font-bold">
                              {b.modelsCount > 0
                                ? `${(b.peakWorkingCapitalRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[#141413]">
                              {b.modelsCount > 0
                                ? `${(b.totalProcurementBudgetRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[#52514C]">
                              {b.modelsCount > 0
                                ? `${(b.annualSoldGoodsCostRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-[#157347]">
                              {b.modelsCount > 0
                                ? `+${(b.annualEstimatedOperatingProfitRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[#F5F5F1] font-extrabold text-[#141413] border-t border-[#CECDC4]">
                          <td className="py-2.5 px-3">ИТОГО ПО ГРУППЕ</td>
                          <td className="py-2.5 px-2.5 text-right font-mono">
                            {v11ScenarioSummary.brandsReport.groupTotal.modelsCount}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {(v11ScenarioSummary.brandsReport.groupTotal.annualRevenueRub / 1_000_000)
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {v11ScenarioSummary.brandsReport.groupTotal.totalProcurementPacks.toLocaleString(
                              'ru-RU'
                            )}{' '}
                            компл.
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono bg-[#E6F7EE] text-[#0F5132]">
                            {(v11ScenarioSummary.brandsReport.groupTotal.firstWaveStartBudgetRub / 1_000_000)
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono bg-[#E8F0FE] text-[#1E3A8A]">
                            {(v11ScenarioSummary.brandsReport.groupTotal.netOwnMoneyRequiredRub / 1_000_000)
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {(
                              v11ScenarioSummary.brandsReport.groupTotal.totalProcurementBudgetRub /
                              1_000_000
                            )
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {(
                              v11ScenarioSummary.brandsReport.groupTotal.annualSoldGoodsCostRub /
                              1_000_000
                            )
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#157347]">
                            +
                            {(
                              v11ScenarioSummary.brandsReport.groupTotal
                                .annualEstimatedOperatingProfitRub / 1_000_000
                            )
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                {currentScenario.id !== ACTING_2027_SCENARIO_ID && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="rounded-[12px] bg-white border border-[#D8D7CF] p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                        Действующая база WB ({currentAgg.actingConfirmedCount} SKU)
                      </div>
                      <div className="font-mono text-[20px] font-bold text-[#141413] mt-1">
                        {(currentAgg.actingDecRevenueRub / 1_000_000)
                          .toFixed(2)
                          .replace('.', ',')}{' '}
                        млн ₽{' '}
                        <span className="font-sans text-[11.5px] font-medium text-[#5E5D58]">
                          в дек
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#5E5D58] mt-1">
                        Годовая база:{' '}
                        {(currentAgg.actingAnnualRevenueRub / 1_000_000)
                          .toFixed(2)
                          .replace('.', ',')}{' '}
                        млн ₽ ({currentAgg.actingAnnualSets.toLocaleString('ru-RU')} компл.)
                      </div>
                    </div>

                    <div className="rounded-[12px] bg-white border border-[#D8D7CF] p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                        Новые варианты 2027 ({currentAgg.newVariantsCount} SKU)
                      </div>
                      <div className="font-mono text-[20px] font-bold text-[#141413] mt-1">
                        {(currentAgg.newDecRevenueRub / 1_000_000)
                          .toFixed(2)
                          .replace('.', ',')}{' '}
                        млн ₽{' '}
                        <span className="font-sans text-[11.5px] font-medium text-[#5E5D58]">
                          в дек
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#5E5D58] mt-1">
                        {currentAgg.newDecSets.toLocaleString('ru-RU')} компл. в дек ·{' '}
                        {(currentAgg.newAnnualRevenueRub / 1_000_000)
                          .toFixed(2)
                          .replace('.', ',')}{' '}
                        млн ₽ за 2027 г.
                      </div>
                    </div>

                    <div className="rounded-[12px] bg-white border border-[#D8D7CF] p-4 flex flex-col justify-between">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                          Веса авто-расчёта и честность маржи
                        </div>
                        <div className="text-[12px] text-[#141413] font-semibold mt-1.5 leading-relaxed">
                          Высший ×1.40 ({currentAgg.priorityCounts['Высший']}) · Высокий ×1.15 (
                          {currentAgg.priorityCounts['Высокий']}) · Средний ×0.90 (
                          {currentAgg.priorityCounts['Средний']}) · База ×0.75 (
                          {currentAgg.priorityCounts['Не указан']})
                        </div>
                      </div>
                      <div className="text-[11px] text-[#5E5D58] mt-1.5">
                        {v11ScenarioSummary.unfilledExpensesModelsCount > 0
                          ? `По ${v11ScenarioSummary.unfilledExpensesModelsCount} SKU комиссии MP и OPEX не заполнены — прибыль не завышается`
                          : 'Все расходы MP и OPEX заполнены'}
                      </div>
                    </div>
                  </div>
                )}

                {v11ScenarioSummary.factoryGroups.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[13px] font-bold text-[#141413]">
                        Ближайшие партии фабрик по месяцу размещения заказа
                      </div>
                      <button
                        type="button"
                        onClick={() => navigateTo('roadmap-tasks')}
                        className="text-[12px] font-bold text-[#141413] hover:underline cursor-pointer"
                      >
                        Открыть все партии ({v11ScenarioSummary.factoryGroups.length}) в разделе 03 · Закупки →
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-[12px] bg-white border border-[#D8D7CF]">
                      <table className="w-full text-left border-collapse text-[12px]">
                        <thead>
                          <tr className="bg-[#FAF9F6] text-[#5E5D58] border-b border-[#E4E3DC]">
                            <th className="py-2 px-3.5 font-bold">Месяц размещения</th>
                            <th className="py-2 px-3.5 font-bold">Фабрика</th>
                            <th className="py-2 px-3.5 font-bold text-right">Позиций SKU</th>
                            <th className="py-2 px-3.5 font-bold text-right">Комплектов</th>
                            <th className="py-2 px-3.5 font-bold text-right">Бюджет партии</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EAE9E2]">
                          {v11ScenarioSummary.factoryGroups.slice(0, 6).map((grp) => (
                            <tr
                              key={`${grp.factoryName}-${grp.orderMonthLabel}`}
                              className="hover:bg-[#FAF9F6]"
                            >
                              <td className="py-2 px-3.5 font-mono font-bold text-[#141413]">
                                {grp.orderMonthLabel}
                              </td>
                              <td className="py-2 px-3.5 font-medium text-[#141413]">
                                {grp.factoryName}
                              </td>
                              <td className="py-2 px-3.5 text-right">{grp.itemsCount}</td>
                              <td className="py-2 px-3.5 text-right font-semibold">
                                {grp.totalPacks.toLocaleString('ru-RU')} компл.
                              </td>
                              <td className="py-2 px-3.5 text-right font-bold text-[#141413]">
                                {grp.totalBudgetRub.toLocaleString('ru-RU')} ₽
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* =====================================================================
              БЛОК 02 · ТОВАРНАЯ МАТРИЦА СЦЕНАРИЯ (ВИТРИНА | ТАБЛИЦА + ПИЛЛЫ БРЕНДОВ)
          ===================================================================== */}
          <section className="rounded-[16px] bg-white border border-[#D8D7CF] p-5 md:p-6 space-y-4 shadow-[0_2px_12px_-2px_rgba(20,20,19,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#EAE9E2]">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#686760]">
                    Товарная матрица сценария
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <h3 className="text-[19px] font-extrabold text-[#141413]">
                      {currentScenario.id === ACTING_2027_SCENARIO_ID
                        ? 'Модели исходного плана 2027 (ИП Нерсесянц)'
                        : `Модели · ${currentScenario.title}`}
                    </h3>
                    <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-[6px] bg-[#F4F3EE] border border-[#DFDED7] text-[#141413]">
                      {filteredModels.length} SKU
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Переключатель Витрина | Таблица */}
                <div className="inline-flex items-center rounded-[9px] bg-[#F4F3EE] border border-[#E2E1D9] p-0.5 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setCatalogViewMode('grid')}
                    className={`h-8 px-3 rounded-[7px] transition cursor-pointer ${
                      catalogViewMode === 'grid'
                        ? 'bg-[#141413] text-white font-semibold'
                        : 'text-[#5C5B55] hover:text-[#141413] font-semibold'
                    }`}
                  >
                    Витрина
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogViewMode('table')}
                    className={`h-8 px-3 rounded-[7px] transition cursor-pointer ${
                      catalogViewMode === 'table'
                        ? 'bg-[#141413] text-white font-semibold'
                        : 'text-[#5C5B55] hover:text-[#141413] font-semibold'
                    }`}
                  >
                    Таблица ({filteredModels.length})
                  </button>
                </div>

                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск модели или WB..."
                  className="h-8.5 px-3 rounded-[9px] bg-[#FAF9F6] focus:bg-white border border-[#CFCEC6] focus:border-[#141413] text-[12px] font-medium text-[#141413] placeholder:text-[#8E8D85] w-44 focus:outline-none"
                />

                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as
                        | 'default'
                        | 'dec_desc'
                        | 'year_desc'
                        | 'priority'
                    )
                  }
                  className="h-8.5 px-2.5 rounded-[9px] bg-white border border-[#CFCEC6] hover:border-[#141413] text-[12px] font-semibold text-[#141413] cursor-pointer"
                >
                  <option value="default">По порядку</option>
                  <option value="dec_desc">Выручка дек. ↓</option>
                  <option value="year_desc">Год 2027 ↓</option>
                  <option value="priority">По приоритету</option>
                </select>

                <select
                  value={statusFilterLocal}
                  onChange={(e) => setStatusFilterLocal(e.target.value)}
                  className="h-8.5 px-2.5 rounded-[9px] bg-white border border-[#CFCEC6] hover:border-[#141413] text-[12px] font-semibold text-[#141413] cursor-pointer"
                >
                  <option value="ALL">Все статусы</option>
                  <option value="В плане">В плане</option>
                  <option value="В разработке">В разработке</option>
                  <option value="Утверждено">Утверждено</option>
                  <option value="В архиве">В архиве</option>
                </select>

                <button
                  type="button"
                  onClick={() => setNewModelModalOpen(true)}
                  className="h-8.5 px-3.5 rounded-[9px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[12px] font-semibold transition cursor-pointer"
                >
                  + Добавить модель
                </button>
              </div>
            </div>

            {/* Быстрый переключатель брендов в 1 клик (все 5 брендов холдинга) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'ALL', label: 'Все бренды' },
                  { id: 'BORNERS', label: 'BORNERS' },
                  { id: 'NA_TELE', label: 'НА ТЕЛЕ' },
                  { id: 'FUKAI', label: 'FUKAI' },
                  { id: 'AKUSHA', label: 'Акуша' },
                  { id: 'LISKANI', label: 'Liskani' },
                ].map((bItem) => {
                  const active = brandFilterLocal === bItem.id;
                  return (
                    <button
                      key={bItem.id}
                      type="button"
                      onClick={() => {
                        setBrandFilterLocal(bItem.id);
                        setBrandFilter(bItem.id);
                      }}
                      className={`h-7.5 px-3 rounded-[8px] text-[11.5px] font-semibold transition cursor-pointer border ${
                        active
                          ? 'bg-[#141413] text-white border-[#141413]'
                          : 'bg-[#FAF9F6] text-[#52514C] border-[#E2E1D9] hover:border-[#141413] hover:text-[#141413]'
                      }`}
                    >
                      {bItem.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11.5px] text-[#686760]">
                Нажмите на карточку модели, чтобы открыть паспорт, финансы и план закупок
              </span>
            </div>

            {brandFilterLocal === 'NA_TELE' && filteredModels.length === 0 && (
              <div className="rounded-[12px] bg-[#FAF9F6] border border-[#D8D7CF] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
                <span className="text-[#262624] font-medium">
                  В «{currentScenario.title}» модели <strong>НА ТЕЛЕ</strong> не включены (моно-цель BORNERS). Линейка НА ТЕЛЕ запускается в Сценарии №2 и №3.
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedScenarioId(2)}
                    className="h-8 px-3 rounded-[8px] bg-[#141413] text-white text-[11.5px] font-semibold cursor-pointer"
                  >
                    Переключить на Сценарий №2 (150 млн)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBrandFilterLocal('ALL');
                      setBrandFilter('ALL');
                    }}
                    className="h-8 px-3 rounded-[8px] bg-white border border-[#CFCEC6] hover:border-[#141413] text-[11.5px] font-semibold text-[#141413] cursor-pointer"
                  >
                    Показать все бренды
                  </button>
                </div>
              </div>
            )}

            {catalogViewMode === 'grid' ? (
              /* Витрина с карточками SKU в стиле Peakly (с мини-спарклайном 12 мес. и юнит-экономикой) */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredModels.map((mod, modIdx) => {
                  const met = computeModelScenarioMetrics(mod, currentScenario);
                  const mainGallery =
                    mod.gallery.find((g) => g.isMain) || mod.gallery[0];
                  const colors = mod.palettes[0]?.colors || [];
                  const actingMeta = getActingSkuByWbOrVendor(mod.code, mod.title);
                  const priorityLabel = getModelPriority(mod);
                  const displayBrand =
                    mod.customBrandLabel ||
                    (actingMeta?.wbSku === '72302360'
                      ? 'FUKAI'
                      : mod.brandId === 'NA_TELE'
                        ? 'НА ТЕЛЕ'
                        : 'BORNERS');
                  const maxModMonthRev = Math.max(1, ...met.monthlyRevenuesRub);

                  return (
                    <div
                      key={mod.id}
                      role="button"
                      tabIndex={0}
                      data-tour={modIdx === 0 ? 'model-passport' : undefined}
                      onClick={() => {
                        navigateScreen('model', mod.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigateScreen('model', mod.id);
                        }
                      }}
                      className="group relative rounded-[15px] bg-white border border-[#D8D7CF] hover:border-[#141413] p-4 text-left transition-all cursor-pointer flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-6px_rgba(20,20,19,0.09)]"
                    >
                      {/* Уровень 1 и 2: Код + Фото + Название + Мини-спарклайн 12 мес. */}
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {modIdx < 3 && (
                              <span
                                className={`px-1.5 py-0.5 rounded-[5px] font-mono text-[9.5px] font-bold shrink-0 ${
                                  modIdx === 0
                                    ? 'bg-[#141413] text-white'
                                    : 'bg-[#F4F3EE] text-[#52514C] border border-[#E2E1D9]'
                                }`}
                              >
                                #{modIdx + 1}
                              </span>
                            )}
                            <span className="font-mono text-[11px] font-bold text-[#52514C] truncate">
                              {actingMeta
                                ? `WB ${actingMeta.wbSku}`
                                : `${displayBrand} · ${mod.code}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded-[5px] text-[10px] font-bold border ${
                                mod.launchStatus === 'Утверждено' ||
                                (actingMeta &&
                                  actingMeta.wbSku !== '72302360' &&
                                  actingMeta.wbSku !== '86205435')
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-[#F4F3EE] text-[#52514C] border-[#DFDED7]'
                              }`}
                            >
                              {actingMeta
                                ? actingMeta.wbSku === '72302360'
                                  ? 'FUKAI · WB'
                                  : actingMeta.wbSku === '86205435'
                                    ? 'WB · проверить'
                                    : 'BORNERS · WB'
                                : mod.launchStatus}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOrArchiveModel(mod);
                              }}
                              title={`Удалить карточку ${mod.code} ${mod.title}`}
                              aria-label={`Удалить ${mod.title}`}
                              className="h-5 w-5 rounded-[5px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 bg-white hover:bg-rose-50 border border-[#CECDC4] hover:border-rose-200 flex items-center justify-center text-[#686762] hover:text-rose-700 text-[12px] leading-none font-bold transition cursor-pointer"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        <div className="relative rounded-[12px] bg-[radial-gradient(circle_at_50%_40%,#FFFFFF_0%,#F3F2EC_100%)] border border-[#E6E5DD] p-2.5 mb-3 overflow-hidden">
                          <div className="transition-transform duration-200 group-hover:scale-[1.03]">
                            <BoxerPackStackSvg
                              colors={colors}
                              brandLabel={
                                mod.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS'
                              }
                              customPhotoUrl={mainGallery?.url}
                            />
                          </div>
                          <span className="absolute bottom-2 left-2 rounded-md bg-white/95 backdrop-blur-xs border border-[#DFDED7] px-2 py-0.5 font-mono text-[10px] font-bold text-[#141413] shadow-2xs">
                            {mod.unitsInPack} шт. · {mod.retailPriceRub.toLocaleString('ru-RU')} ₽
                          </span>
                          <span className="absolute bottom-2 right-2 rounded-md bg-[#141413]/85 backdrop-blur-xs px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                            {met.goalSharePct.toFixed(1).replace('.', ',')}%
                          </span>
                        </div>

                        <div className="text-[15.5px] font-extrabold text-[#141413] group-hover:underline leading-snug">
                          {mod.title}
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-[11.5px] text-[#686760] truncate">
                            {mod.subtitle}
                          </span>
                          {!actingMeta ? (
                            <button
                              type="button"
                              onClick={(e) => handleCycleCardPriority(mod, e)}
                              title="Нажмите, чтобы изменить приоритет модели для авто-расчёта"
                              className={`shrink-0 px-2 py-0.5 rounded-[5px] text-[10px] font-bold transition cursor-pointer border ${
                                priorityLabel === 'Высший'
                                  ? 'bg-[#141413] text-white border-[#141413]'
                                  : 'bg-[#FAF9F6] hover:border-[#141413] text-[#262624] border-[#CFCEC6]'
                              }`}
                            >
                              {priorityLabel}
                            </button>
                          ) : (
                            <span className="shrink-0 font-mono text-[10.5px] font-semibold text-[#52514C]">
                              {met.annualPacks.toLocaleString('ru-RU')} вык./год
                            </span>
                          )}
                        </div>

                        {/* Мини-спарклайн 12 месяцев прямо внутри карточки товара */}
                        <div className="mt-2.5 rounded-[8px] bg-[#FAF9F6] border border-[#ECEBE4] px-2.5 py-1.5 flex items-end justify-between gap-1 h-8">
                          {met.monthlyRevenuesRub.map((mRev, mIdx) => {
                            const hPx = Math.max(3, Math.round((mRev / maxModMonthRev) * 18));
                            return (
                              <div
                                key={mIdx}
                                style={{ height: `${hPx}px` }}
                                title={`${MONTHS_SHORT_RU[mIdx]}: ${(mRev / 1_000_000).toFixed(2)} млн ₽`}
                                className={`flex-1 rounded-[2px] ${
                                  mIdx === 11
                                    ? 'bg-emerald-600'
                                    : 'bg-[#C8C7BE] group-hover:bg-[#787770]'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>

                      {/* Уровень 3: Единая нижняя плашка (Выручка декабря и года слева · Степпер комплектов справа) */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3 pt-2.5 border-t border-[#EAE9E2] flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-mono text-[15px] font-extrabold text-[#141413] leading-tight">
                            {(met.targetMonthRevenueRub / 1_000_000)
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽{' '}
                            <span className="font-sans text-[10.5px] font-medium text-[#686760]">
                              / дек
                            </span>
                          </div>
                          <div className="text-[11px] text-[#686760] mt-0.5">
                            Год:{' '}
                            <strong className="font-mono text-[#141413]">
                              {(met.annualRevenueRub / 1_000_000)
                                .toFixed(2)
                                .replace('.', ',')}{' '}
                              млн ₽
                            </strong>
                          </div>
                        </div>

                        <div className="inline-flex items-center gap-0.5 bg-[#FAF9F6] border border-[#CFCEC6] rounded-[8px] px-1 py-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) =>
                              handleQuickAdjustDecPacks(
                                mod,
                                Math.max(0, met.targetMonthPacks - 200),
                                e
                              )
                            }
                            title="Уменьшить выкупы декабря на 200 компл."
                            className="h-6 w-5 rounded text-[13px] font-bold text-[#3F3E3A] hover:bg-white hover:text-[#141413] transition cursor-pointer"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={met.targetMonthPacks}
                            onChange={(e) =>
                              handleQuickAdjustDecPacks(
                                mod,
                                Number(e.target.value) || 0,
                                e
                              )
                            }
                            title="Выкупы в декабре 2027 (комплектов)"
                            className="w-13 text-center font-mono text-[11px] font-bold text-[#141413] bg-transparent"
                          />
                          <button
                            type="button"
                            onClick={(e) =>
                              handleQuickAdjustDecPacks(
                                mod,
                                met.targetMonthPacks + 200,
                                e
                              )
                            }
                            title="Увеличить выкупы декабря на 200 компл."
                            className="h-6 w-5 rounded text-[13px] font-bold text-[#3F3E3A] hover:bg-white hover:text-[#141413] transition cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Карточка «Добавить модель» */}
                <button
                  type="button"
                  onClick={() => setNewModelModalOpen(true)}
                  className="rounded-[14px] border border-dashed border-[#C8C7BE] hover:border-[#141413] bg-[#FAF9F6] hover:bg-white p-6 flex flex-col items-center justify-center text-center gap-2 transition cursor-pointer min-h-[280px]"
                >
                  <div className="text-[26px] font-light leading-none text-[#141413]">+</div>
                  <div className="text-[14.5px] font-bold text-[#141413]">
                    Добавить модель
                  </div>
                  <p className="text-[12px] text-[#686760] max-w-[200px]">
                    Новая товарная позиция в сценарий ({currentScenario.scopeLabel})
                  </p>
                </button>
              </div>
            ) : (
              /* Компактная табличная матрица всех SKU на одном экране */
              <div className="overflow-x-auto rounded-[14px] border-[1.5px] border-[#CECDC4]">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#F5F5F1] text-[#3F3E3A] text-[11px] uppercase tracking-[0.04em] border-b-[1.5px] border-[#141413]">
                      <th className="py-3 px-4 font-bold">Код / WB</th>
                      <th className="py-3 px-4 font-bold">Модель и линейка</th>
                      <th className="py-3 px-3 font-bold">Статус</th>
                      <th className="py-3 px-3 font-bold">Приоритет</th>
                      <th className="py-3 px-3 font-bold text-right">Цена компл.</th>
                      <th className="py-3 px-3 font-bold text-center">Выкупы дек. (компл.)</th>
                      <th className="py-3 px-4 font-bold text-right">Выручка дек.</th>
                      <th className="py-3 px-4 font-bold text-right">Выручка 2027</th>
                      <th className="py-3 px-4 font-bold text-right">Доля цели</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E3DC] bg-white">
                    {filteredModels.map((mod, modIdx) => {
                      const met = computeModelScenarioMetrics(mod, currentScenario);
                      const actingMeta = getActingSkuByWbOrVendor(mod.code, mod.title);
                      const priorityLabel = getModelPriority(mod);
                      return (
                        <tr
                          key={mod.id}
                          data-tour={modIdx === 0 ? 'model-passport' : undefined}
                          onClick={() => navigateScreen('model', mod.id)}
                          className="hover:bg-[#F7F7F3] transition cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-mono text-[11.5px] font-bold text-[#141413] whitespace-nowrap">
                            {actingMeta ? `WB ${actingMeta.wbSku}` : mod.code}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-bold text-[#141413] hover:underline">
                              {mod.title}
                            </div>
                            <div className="text-[11px] text-[#5E5D58]">
                              {mod.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS'} · {mod.subtitle}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-[6px] text-[10.5px] font-bold border whitespace-nowrap ${
                                mod.launchStatus === 'Утверждено' ||
                                (actingMeta &&
                                  actingMeta.wbSku !== '72302360' &&
                                  actingMeta.wbSku !== '86205435')
                                  ? 'bg-[#EAF6F0] text-[#157347] border-[#BBE5CE]'
                                  : 'bg-[#F3F3EE] text-[#3F3E3A] border-[#D8D7CF]'
                              }`}
                            >
                              {actingMeta ? actingMeta.brandStatus : mod.launchStatus}
                            </span>
                          </td>
                          <td
                            className="py-2.5 px-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!actingMeta ? (
                              <button
                                type="button"
                                onClick={(e) => handleCycleCardPriority(mod, e)}
                                className={`px-2.5 py-0.5 rounded-[6px] text-[10.5px] font-bold border transition cursor-pointer whitespace-nowrap ${
                                  priorityLabel === 'Высший'
                                    ? 'bg-[#141413] text-white border-[#141413]'
                                    : 'bg-[#F5F5F1] hover:border-[#141413] text-[#262624] border-[#CECDC4]'
                                }`}
                              >
                                {priorityLabel}
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#5E5D58]">WB база</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#262624] whitespace-nowrap">
                            {mod.retailPriceRub.toLocaleString('ru-RU')} ₽
                          </td>
                          <td
                            className="py-2.5 px-3 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-0.5 bg-[#F5F5F1] border border-[#CECDC4] rounded-[7px] px-1 py-0.5">
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleQuickAdjustDecPacks(
                                    mod,
                                    Math.max(0, met.targetMonthPacks - 200),
                                    e
                                  )
                                }
                                className="h-5 w-5 rounded text-[12px] font-bold text-[#3F3E3A] hover:bg-white hover:text-[#141413] cursor-pointer"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min={0}
                                step={100}
                                value={met.targetMonthPacks}
                                onChange={(e) =>
                                  handleQuickAdjustDecPacks(
                                    mod,
                                    Number(e.target.value) || 0,
                                    e
                                  )
                                }
                                className="w-14 text-center font-mono text-[11px] font-bold text-[#141413] bg-transparent"
                              />
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleQuickAdjustDecPacks(
                                    mod,
                                    met.targetMonthPacks + 200,
                                    e
                                  )
                                }
                                className="h-5 w-5 rounded text-[12px] font-bold text-[#3F3E3A] hover:bg-white hover:text-[#141413] cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-[#141413] whitespace-nowrap">
                            {(met.targetMonthRevenueRub / 1_000_000)
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#262624] whitespace-nowrap">
                            {(met.annualRevenueRub / 1_000_000)
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-[11.5px] text-[#5E5D58] whitespace-nowrap">
                            {met.goalSharePct.toFixed(1).replace('.', ',')}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      let sumDecPacks = 0;
                      let sumDecRub = 0;
                      let sumYearRub = 0;
                      for (const m of filteredModels) {
                        const met = computeModelScenarioMetrics(m, currentScenario);
                        sumDecPacks += met.targetMonthPacks;
                        sumDecRub += met.targetMonthRevenueRub;
                        sumYearRub += met.annualRevenueRub;
                      }
                      return (
                        <tr className="bg-[#F5F5F1] border-t-[2px] border-[#141413] font-bold text-[#141413]">
                          <td className="py-3 px-4" colSpan={5}>
                            ИТОГО ПО ВЫБОРКЕ ({filteredModels.length} SKU)
                          </td>
                          <td className="py-3 px-3 text-center font-mono">
                            {sumDecPacks.toLocaleString('ru-RU')} компл.
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-[#157347]">
                            {(sumDecRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {(sumYearRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽
                          </td>
                          <td className="py-3 px-4 text-right font-mono">100%</td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            )}

            {/* Сводка плана по 7 SKU · без подушек и носков */}
            {currentScenario.id === ACTING_2027_SCENARIO_ID && (
              <div className="rounded-[14px] bg-[#FAFAF7] border-[1.5px] border-[#CECDC4] p-5 space-y-3 mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-[16px] font-bold text-[#141413]">
                      Сводка плана · без подушек и носков (ИП Нерсесянц · 7 SKU)
                    </h4>
                    <p className="text-[11.5px] text-[#5E5D58]">
                      Отдельный артикул fukai4-2 не включён. Нажмите на строку, чтобы открыть карточку и помесячный план.
                    </p>
                  </div>
                  <a
                    href="docs/acting-2027/BORNERS_2027_acting_assortment.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="h-8 px-3.5 rounded-[8px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[11.5px] font-semibold inline-flex items-center transition"
                  >
                    Исходный PDF (10 стр.)
                  </a>
                </div>

                <div className="overflow-x-auto rounded-[12px] bg-white border-[1.5px] border-[#CECDC4]">
                  <table className="w-full text-left border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-[#F5F5F1] text-[#5E5D58] text-[11.5px] border-b-[1.5px] border-[#CECDC4]">
                        <th className="py-2.5 px-4 font-bold">Артикул продавца</th>
                        <th className="py-2.5 px-4 font-bold">Артикул WB</th>
                        <th className="py-2.5 px-4 font-bold">Статус бренда</th>
                        <th className="py-2.5 px-4 font-bold text-right">Выкупы / год</th>
                        <th className="py-2.5 px-4 font-bold text-right">Выручка / год</th>
                        <th className="py-2.5 px-4 font-bold text-right">Декабрь</th>
                        <th className="py-2.5 px-4 font-bold text-right">Затраты / год</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4E3DC]">
                      {ACTING_2027_SKUS.map((sku) => (
                        <tr
                          key={sku.wbSku}
                          onClick={() => navigateScreen('model', `scen-wb-${sku.wbSku}`)}
                          className="hover:bg-[#FAFAF7] transition cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-bold text-[#141413]">
                            {sku.vendorSku}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[#5E5D58]">
                            {sku.wbSku}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-[6px] text-[10.5px] font-bold border ${
                                sku.wbSku === '72302360' || sku.wbSku === '86205435'
                                  ? 'bg-[#F3F3EE] text-[#3F3E3A] border-[#D8D7CF]'
                                  : 'bg-[#EAF6F0] text-[#157347] border-[#BBE5CE]'
                              }`}
                            >
                              {sku.brandStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-[#141413]">
                            {sku.totalBuyoutsSets.toLocaleString('ru-RU')}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-[#141413]">
                            {(sku.totalRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн ({sku.totalRevenueRub.toLocaleString('ru-RU')} ₽)
                          </td>
                          <td className="py-2.5 px-4 text-right text-[#5E5D58]">
                            {(sku.decemberRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн
                          </td>
                          <td className="py-2.5 px-4 text-right text-[#5E5D58]">
                            {(sku.totalCostOfGoodsRub / 1_000_000).toFixed(2).replace('.', ',')} млн
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#F5F5F1] font-bold text-[#141413] border-t-[1.5px] border-[#CECDC4]">
                        <td className="py-3 px-4">ИТОГО</td>
                        <td className="py-3 px-4">7 SKU</td>
                        <td className="py-3 px-4 text-[11px] font-medium text-[#5E5D58]">
                          84 записи (12 мес.)
                        </td>
                        <td className="py-3 px-4 text-right">
                          {ACTING_2027_CONTROL_TOTALS.annualBuyoutsSets.toLocaleString('ru-RU')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          267,73 млн ({ACTING_2027_CONTROL_TOTALS.annualRevenueRub.toLocaleString('ru-RU')} ₽)
                        </td>
                        <td className="py-3 px-4 text-right">
                          22,73 млн ({ACTING_2027_CONTROL_TOTALS.decemberRevenueRub.toLocaleString('ru-RU')} ₽)
                        </td>
                        <td className="py-3 px-4 text-right">
                          91,46 млн ({ACTING_2027_CONTROL_TOTALS.annualCostOfGoodsRub.toLocaleString('ru-RU')} ₽)
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО СОЗДАНИЯ НОВОЙ МОДЕЛИ (п. 7.1 ТЗ, Тест 11) */}
      {newModelModalOpen && (
        <div
          onClick={() => setNewModelModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateNewModel}
            className="w-full max-w-md rounded-[22px] bg-white border border-[#E6E0D4] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-[#1D1D1F]">
                Новая модель в портфель
              </h3>
              <button
                type="button"
                onClick={() => setNewModelModalOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-[#FAF8F4] flex items-center justify-center cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[12px] text-[#6E6E73]">
              Достаточно указать базовые поля — остальные характеристики можно заполнить позже в карточке модели.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                  Бренд
                </label>
                <select
                  value={draftBrand}
                  onChange={(e) => setDraftBrand(e.target.value)}
                  className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px] font-semibold"
                >
                  <option value="BORNERS">BORNERS</option>
                  <option value="NA_TELE">НА ТЕЛЕ</option>
                  <option value="FUKAI">FUKAI</option>
                  <option value="AKUSHA">Акуша</option>
                  <option value="LISKANI">Liskani (Лезкани)</option>
                </select>
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                  Название модели
                </label>
                <input
                  type="text"
                  placeholder="Например: SPORT MODAL 3 PACK"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Тип изделия
                  </label>
                  <input
                    type="text"
                    value={draftType}
                    onChange={(e) => setDraftType(e.target.value)}
                    className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Штук в комплекте
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={draftUnitsInPack}
                    onChange={(e) =>
                      setDraftUnitsInPack(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px] font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Розничная цена (₽)
                  </label>
                  <input
                    type="number"
                    value={draftRetailPrice}
                    onChange={(e) => setDraftRetailPrice(Number(e.target.value))}
                    className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Себестоимость (₽)
                  </label>
                  <input
                    type="number"
                    value={draftUnitCost}
                    onChange={(e) => setDraftUnitCost(Number(e.target.value))}
                    className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px]"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewModelModalOpen(false)}
                className="h-9 px-3.5 rounded-[10px] border border-[#DED8CC] text-[12.5px] font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => createAndSaveModel(false)}
                className="h-9 px-4 rounded-[10px] bg-[#2E6B4E] hover:bg-[#24563E] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Сохранить карточку</span>
              </button>
              <button
                type="submit"
                className="h-9 px-4 rounded-[10px] bg-[#1D1D1F] hover:bg-[#323236] text-white text-[12.5px] font-semibold cursor-pointer transition"
              >
                Сохранить и открыть →
              </button>
            </div>
          </form>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО СОЗДАНИЯ НОВОГО СЦЕНАРИЯ (п. 7.3 ТЗ) */}
      {newScenarioModalOpen && (
        <div
          onClick={() => setNewScenarioModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateNewScenario}
            className="w-full max-w-md rounded-[22px] bg-white border border-[#E6E0D4] p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-[#1D1D1F]">
                Новый сценарий роста
              </h3>
              <button
                type="button"
                onClick={() => setNewScenarioModalOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-[#FAF8F4] flex items-center justify-center cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[12px] text-[#6E6E73]">
              Карточки моделей не дублируются — в новый сценарий копируются только плановые объёмы продаж и допущения.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                  Название сценария
                </label>
                <input
                  type="text"
                  placeholder="Например: Сценарий №4 · Экспансия СНГ"
                  value={draftScenTitle}
                  onChange={(e) => setDraftScenTitle(e.target.value)}
                  className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Цель в месяц (млн ₽)
                  </label>
                  <input
                    type="number"
                    value={draftScenTargetMln}
                    onChange={(e) =>
                      setDraftScenTargetMln(Math.max(10, Number(e.target.value) || 100))
                    }
                    className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px] font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Включённые бренды
                  </label>
                  <select
                    value={draftScenScope}
                    onChange={(e) =>
                      setDraftScenScope(e.target.value as 'BORNERS' | 'GROUP')
                    }
                    className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[12.5px] font-semibold"
                  >
                    <option value="GROUP">Группа (BORNERS + НА ТЕЛЕ)</option>
                    <option value="BORNERS">Только BORNERS</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                  Скопировать базовые допущения из сценария
                </label>
                <select
                  value={draftCopyFromScenarioId}
                  onChange={(e) =>
                    setDraftCopyFromScenarioId(Number(e.target.value))
                  }
                  className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[12.5px]"
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.monthlyTargetMln} млн ₽ / мес)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewScenarioModalOpen(false)}
                className="h-9 px-4 rounded-[10px] border border-[#DED8CC] text-[12.5px] font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="h-9 px-4 rounded-[10px] bg-[#2E6B4E] hover:bg-[#24563E] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Сохранить сценарий</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* КОНСТРУКТОР PDF ТЕХНИЧЕСКОГО ЗАДАНИЯ (Тест 10) */}
      {pdfModalOpen && conceptForPdf && (
        <PdfConstructorModal
          concept={{
            ...conceptForPdf,
            code: `BRN-${activeModel.code.replace('№', '')}`,
            name: `${
              activeModel.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS'
            } ${activeModel.code} · ${activeModel.title}`,
            plannedUnitCost: activeModel.unitCostRub,
            plannedRetailPrice: activeModel.retailPriceRub,
            packUnitsCount: activeModel.unitsInPack,
          }}
          onClose={() => setPdfModalOpen(false)}
          onSaveToConcept={() => {
            notify(
              'success',
              `PDF ТЗ для ${activeModel.code} ${activeModel.title} сформирован`
            );
          }}
        />
      )}
    </div>
  );
}
