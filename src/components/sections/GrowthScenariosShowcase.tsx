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
  LISKANI_2027_MODELS,
  LISKANI_2027_SCENARIO_DEF,
  LISKANI_2027_SCENARIO_ID,
} from '@/lib/liskaniAssortment2027';
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
import {
  PeaklyCatalogGroupsAndBrandsView,
  PeaklyMasterCabinetsSummary,
} from '@/components/sections/PeaklyBrandCatalogAndGroups';
import { ScenarioModelCardScreen } from '@/components/sections/ScenarioModelCardScreen';
import { ScenarioSalesPlanScreen } from '@/components/sections/ScenarioSalesPlanScreen';
import { PdfConstructorModal } from '@/components/sections/PdfConstructorModal';
import { safeGetStorageJson, safeSetStorageJson } from '@/lib/safeStorage';
import { compressImageFileToDataUrl } from '@/lib/document-export';
import {
  STORAGE_KEY_ACTIVE_SCENARIO_ID,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_S1_GROUP_PORTFOLIO,
  STORAGE_KEY_SCENARIO_BY_BRAND,
  STORAGE_KEY_SCENARIOS,
  STORAGE_KEY_USER_PLANS_BACKUP,
  clearDeletedModelsRegistry,
  filterModelsForScenario,
  hydratePortfolioModelsFromStorage,
  isModelMarkedDeleted,
  markModelAsDeletedInStorage,
  overlayBackupOntoModels as overlayUserPlansBackup,
  syncUserPlansBackup as saveUserPlansBackup,
  unmarkModelAsDeletedInStorage,
} from '@/lib/useLiveScenarioPortfolio';
import {
  CanonicalBrandCode,
  applyCategoryWbUnitEconomics,
  applyCategoryWbUnitEconomicsToPortfolio,
  computeFinancialPnL,
  computeGroupBrandsInvestmentReport,
  computeMultiBrandPortfolioSummary,
  computeProcurementPlan,
  computeScenarioInvestmentSummary,
  createBrandProductModel,
  createIndependentBrandScenario,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  getBrandUnitConfig,
  getScenariosForBrand,
  groupRecommendedBatchesByFactory,
  importStructuredScenarioPlan,
  launchAllEmptyCabinetsInHolding,
  launchBrandStarterMatrix,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
  parseStructuredPlanCsvOrJson,
  renameBrandScenario,
  resetStarterCabinetsFromHolding,
  serializeStructuredPlanToCsv,
} from '@/lib/unifiedBusinessEngine';

export {
  STORAGE_KEY_SCENARIOS,
  STORAGE_KEY_MODELS,
  STORAGE_KEY_USER_PLANS_BACKUP,
};

const DEFAULT_RESTORED_MODELS: ScenarioModelSpec[] = applyCategoryWbUnitEconomicsToPortfolio(
  applyClientSavedS1SalesPlan([
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
    ...LISKANI_2027_MODELS,
  ])
);

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

  const [scenarios, setScenarios] = useState<GrowthScenarioDef[]>([
    ...INITIAL_SCENARIOS,
    LISKANI_2027_SCENARIO_DEF,
  ]);
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
        sessionStorage.removeItem('borners_open_scenario_model_id');
        setSelectedModelId(pendingModelId);
        setScreen('model');
        pushScenarioStep('model', pendingModelId);
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
  }, [initialModelId, pushScenarioStep]);

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

  // Поля формы создания новой модели (Тест 11 и Раздел 4.4 ТЗ: короткая форма, работает со всеми брендами холдинга)
  const [draftBrand, setDraftBrand] = useState<string>('BORNERS');
  const [draftCode, setDraftCode] = useState<string>('BRN-024');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftType, setDraftType] = useState('Боксеры 4-pack');
  const [draftUnitsInPack, setDraftUnitsInPack] = useState(4);
  const [draftRetailPrice, setDraftRetailPrice] = useState(1990);
  const [draftUnitCost, setDraftUnitCost] = useState(650);
  const [draftImageUrl, setDraftImageUrl] = useState<string>('');

  // Поля формы создания нового сценария (Раздел 3.1–3.4 ТЗ: бренд, год 2027/2028, цель, копирование)
  const [draftScenTitle, setDraftScenTitle] = useState('');
  const [draftScenTargetMln, setDraftScenTargetMln] = useState(100);
  const [draftScenYear, setDraftScenYear] = useState<number>(2027);
  const [draftScenBrand, setDraftScenBrand] = useState<string>('BORNERS');
  const [draftScenScope, setDraftScenScope] = useState<'BORNERS' | 'GROUP'>('GROUP');
  const [draftCopyFromScenarioId, setDraftCopyFromScenarioId] = useState<number>(0);

  // Глобальная сводка BORNERS GROUP (Раздел 9 ТЗ): выбор одного сценария на каждый бренд + таблица «Подробнее» по месяцам
  const [selectedScenarioByBrand, setSelectedScenarioByBrandState] = useState<
    Partial<Record<CanonicalBrandCode, number | null>>
  >({
    BORNERS: 1,
    FUKAI: ACTING_2027_SCENARIO_ID,
    AKUSHA: null,
    LISKANI: LISKANI_2027_SCENARIO_ID,
    NA_TELE: 2,
  });
  const [groupMonthlyDetailsOpen, setGroupMonthlyDetailsOpen] = useState(false);
  const [trajectoryChartMetric, setTrajectoryChartMetric] = useState<
    'revenue' | 'profit' | 'procurement'
  >('revenue');
  const [homeSubView, setHomeSubView] = useState<'home' | 'summary'>('home');

  const switchHomeSubView = useCallback((nextView: 'home' | 'summary') => {
    setHomeSubView(nextView);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('borners-set-home-subview', {
          detail: { subView: nextView },
        })
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const onSubView = (e: Event) => {
      const ce = e as CustomEvent<{ subView?: 'home' | 'summary' }>;
      if (ce.detail?.subView) {
        setHomeSubView(ce.detail.subView);
      }
    };
    window.addEventListener('borners-set-home-subview', onSubView);
    return () => window.removeEventListener('borners-set-home-subview', onSubView);
  }, []);

  const setSelectedScenarioForBrand = useCallback(
    (brandInput: string, scenId: number | null) => {
      const code = normalizePortfolioBrandCode(brandInput);
      if (code === 'ALL') return;
      setSelectedScenarioByBrandState((prev) => {
        const next = { ...prev, [code]: scenId };
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

  const SHOWCASE_BRAND_PRESETS: Record<
    CanonicalBrandCode,
    {
      prefix: string;
      categories: string[];
      placeholder: string;
      defaultPrice: number;
      defaultCost: number;
      defaultUnits: number;
    }
  > = useMemo(
    () => ({
      BORNERS: {
        prefix: 'BRN',
        categories: ['Боксеры 4-pack', 'Боксеры 3-pack', 'Семейники 2-pack', 'Плавки / Брифы'],
        placeholder: 'Например: Боксеры BORNERS Architect Modal 4-pack',
        defaultPrice: 1990,
        defaultCost: 650,
        defaultUnits: 4,
      },
      NA_TELE: {
        prefix: 'NTL',
        categories: ['Женский комплект', 'Топ-бра и бразилиана', 'Слипы 3-pack', 'Домашняя капсула'],
        placeholder: 'Например: Комплект женских слипов НА ТЕЛЕ Invisible Seam',
        defaultPrice: 1890,
        defaultCost: 520,
        defaultUnits: 3,
      },
      FUKAI: {
        prefix: 'FUK',
        categories: ['Боксеры 4-pack', 'Трикотажный сет', 'Базовый мультипак'],
        placeholder: 'Например: Боксеры FUKAI Bamboo Comfort 4-pack',
        defaultPrice: 1790,
        defaultCost: 590,
        defaultUnits: 4,
      },
      AKUSHA: {
        prefix: 'AKU',
        categories: ['Кроссовки и кеды', 'Ботинки демисезон', 'Лоферы кожаные', 'Домашняя обувь'],
        placeholder: 'Например: Кроссовки кожаные AKUSHA Urban Cloud',
        defaultPrice: 4490,
        defaultCost: 1480,
        defaultUnits: 8,
      },
      LISKANI: {
        prefix: 'LSC',
        categories: [
          'Портьеры Блэкаут',
          'Портьеры Мрамор',
          'Портьеры Рогожка',
          'Тюль Вуаль',
          'Шторы димаут',
          'Римские шторы',
        ],
        placeholder: 'Например: Портьеры Блэкаут LISKANI (комплект 2 шторы)',
        defaultPrice: 3100,
        defaultCost: 1150,
        defaultUnits: 2,
      },
    }),
    []
  );

  const computeNextDraftCodeForBrand = useCallback(
    (bInput: string) => {
      const norm = normalizePortfolioBrandCode(bInput);
      const bCode: CanonicalBrandCode = norm === 'ALL' ? 'BORNERS' : norm;
      const preset = SHOWCASE_BRAND_PRESETS[bCode] || SHOWCASE_BRAND_PRESETS.BORNERS;
      const brandModels = models.filter((m) => matchesBrandFilter(m, bCode));
      const usedNums = new Set<number>();
      brandModels.forEach((m) => {
        const match = m.code.match(/(\d+)$/);
        if (match) usedNums.add(Number(match[1]));
      });
      let candidate =
        bCode === 'BORNERS'
          ? Math.max(brandModels.length + 1, 24)
          : Math.max(brandModels.length + 1, 1);
      while (usedNums.has(candidate)) candidate += 1;
      return `${preset.prefix}-${String(candidate).padStart(3, '0')}`;
    },
    [models, SHOWCASE_BRAND_PRESETS]
  );

  // Автоматическая подстановка активного бренда при открытии форм «+ Добавить модель» и «+ Новый сценарий» (Раздел 3.1 и 4.4 ТЗ)
  useEffect(() => {
    if (brandFilter && brandFilter !== 'ALL') {
      const norm = normalizePortfolioBrandCode(brandFilter);
      if (norm !== 'ALL') {
        setDraftBrand(norm);
        setDraftScenBrand(norm);
        const preset = SHOWCASE_BRAND_PRESETS[norm] || SHOWCASE_BRAND_PRESETS.BORNERS;
        setDraftType(preset.categories[0]);
        setDraftUnitsInPack(preset.defaultUnits);
        setDraftRetailPrice(preset.defaultPrice);
        setDraftUnitCost(preset.defaultCost);
        setDraftCode(computeNextDraftCodeForBrand(norm));
      }
    }
  }, [brandFilter, SHOWCASE_BRAND_PRESETS, computeNextDraftCodeForBrand]);

  useEffect(() => {
    if (draftBrand) {
      const norm = normalizePortfolioBrandCode(draftBrand);
      const bCode: CanonicalBrandCode = norm === 'ALL' ? 'BORNERS' : norm;
      const preset = SHOWCASE_BRAND_PRESETS[bCode] || SHOWCASE_BRAND_PRESETS.BORNERS;
      setDraftType(preset.categories[0]);
      setDraftUnitsInPack(preset.defaultUnits);
      setDraftRetailPrice(preset.defaultPrice);
      setDraftUnitCost(preset.defaultCost);
      setDraftCode(computeNextDraftCodeForBrand(bCode));
    }
  }, [draftBrand, SHOWCASE_BRAND_PRESETS, computeNextDraftCodeForBrand]);

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

  // Мгновенный запуск стартовой матрицы пустого кабинета (AKUSHA / LISKANI / НА ТЕЛЕ · 3 SKU + сценарий 2027)
  const handleLaunchStarterCabinet = useCallback(
    (brandCode: 'AKUSHA' | 'LISKANI' | 'NA_TELE') => {
      const res = launchBrandStarterMatrix(models, scenarios, brandCode);
      const nextByBrand = {
        ...selectedScenarioByBrand,
        [brandCode]: res.scenarioId,
      };
      setModels(res.models);
      setScenarios(res.scenarios);
      setSelectedScenarioByBrandState(nextByBrand);
      safeSetStorageJson(STORAGE_KEY_MODELS, res.models);
      saveUserPlansBackup(res.models);
      safeSetStorageJson(STORAGE_KEY_SCENARIOS, res.scenarios);
      safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, nextByBrand);
      if (res.scenarioId) {
        setSelectedScenarioId(res.scenarioId);
      }
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
          window.dispatchEvent(new CustomEvent('borners-scenarios-changed'));
          window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
        }, 0);
      }
      const brandLabel = brandCode === 'NA_TELE' ? 'НА ТЕЛЕ' : brandCode;
      notify(
        'success',
        `Кабинет ${brandLabel} запущен`,
        `Активировано 3 флагманских SKU и сценарий развития 2027`
      );
    },
    [models, scenarios, selectedScenarioByBrand, setSelectedScenarioId, notify]
  );

  // Запуск всех 5 кабинетов холдинга в 1 клик
  const handleLaunchAllCabinets = useCallback(() => {
    const res = launchAllEmptyCabinetsInHolding(
      models,
      scenarios,
      selectedScenarioByBrand
    );
    setModels(res.models);
    setScenarios(res.scenarios);
    setSelectedScenarioByBrandState(res.selectedScenarioByBrand);
    safeSetStorageJson(STORAGE_KEY_MODELS, res.models);
    saveUserPlansBackup(res.models);
    safeSetStorageJson(STORAGE_KEY_SCENARIOS, res.scenarios);
    safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, res.selectedScenarioByBrand);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
        window.dispatchEvent(new CustomEvent('borners-scenarios-changed'));
        window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
      }, 0);
    }
    notify(
      'success',
      'Все 5 кабинетов холдинга подключены',
      'Стартовые матрицы AKUSHA, LISKANI и НА ТЕЛЕ активированы в сводке 2027'
    );
  }, [models, scenarios, selectedScenarioByBrand, notify]);

  // Возврат к 2 базовым кабинетам (BORNERS + FUKAI)
  const handleResetStarterCabinets = useCallback(() => {
    const res = resetStarterCabinetsFromHolding(
      models,
      scenarios,
      selectedScenarioByBrand
    );
    setModels(res.models);
    setScenarios(res.scenarios);
    setSelectedScenarioByBrandState(res.selectedScenarioByBrand);
    safeSetStorageJson(STORAGE_KEY_MODELS, res.models);
    saveUserPlansBackup(res.models);
    safeSetStorageJson(STORAGE_KEY_SCENARIOS, res.scenarios);
    safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, res.selectedScenarioByBrand);
    if (
      brandFilterLocal === 'AKUSHA' ||
      brandFilterLocal === 'LISKANI' ||
      brandFilterLocal === 'NA_TELE'
    ) {
      setBrandFilterLocal('ALL');
      setBrandFilter('ALL');
      setSelectedScenarioId(1);
    }
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('borners-scenario-models-changed'));
        window.dispatchEvent(new CustomEvent('borners-scenarios-changed'));
        window.dispatchEvent(new CustomEvent('borners-active-scenario-changed'));
      }, 0);
    }
    notify(
      'success',
      'Возвращены 2 базовых кабинета холдинга',
      'Активны эталонные кабинеты BORNERS и FUKAI (+312,80 млн ₽ прибыли)'
    );
  }, [
    models,
    scenarios,
    selectedScenarioByBrand,
    brandFilterLocal,
    setBrandFilter,
    setSelectedScenarioId,
    notify,
  ]);

  // Загрузка сохранённых данных из localStorage без перезаписи пользовательских правок продаж
  useEffect(() => {
    const syncFromStorage = () => {
      // 1. Сначала запускаем единую гидратацию моделей (включая миграцию LISKANI 269 SKU / 33 модели)
      const hydratedModels = hydratePortfolioModelsFromStorage();
      const existingStoredModels = safeGetStorageJson<ScenarioModelSpec[]>(STORAGE_KEY_MODELS);
      if (!Array.isArray(existingStoredModels) || existingStoredModels.length === 0) {
        safeSetStorageJson(STORAGE_KEY_MODELS, hydratedModels);
        saveUserPlansBackup(hydratedModels);
      }
      setModels(hydratedModels);

      // 2. Загружаем сценарии и гарантируем наличие ACTING 2027 и LISKANI 2027 (500 млн ₽)
      const parsedScen = safeGetStorageJson<GrowthScenarioDef[]>(STORAGE_KEY_SCENARIOS);
      if (Array.isArray(parsedScen) && parsedScen.length > 0) {
        let nextScen = [...parsedScen];
        let scenChanged = false;
        if (!nextScen.some((s) => s.id === ACTING_2027_SCENARIO_ID)) {
          nextScen = [ACTING_2027_SCENARIO_DEF, ...nextScen];
          scenChanged = true;
        }
        if (!nextScen.some((s) => s.id === LISKANI_2027_SCENARIO_ID)) {
          nextScen = [...nextScen, LISKANI_2027_SCENARIO_DEF];
          scenChanged = true;
        }
        if (scenChanged) {
          safeSetStorageJson(STORAGE_KEY_SCENARIOS, nextScen);
        }
        setScenarios(nextScen);
      }

      // 3. Загружаем привязку сценариев к брендам
      const parsedBrandScen = safeGetStorageJson<Record<string, number | null>>(
        STORAGE_KEY_SCENARIO_BY_BRAND
      );
      if (parsedBrandScen && typeof parsedBrandScen === 'object') {
        const normalizedBrandScen = { ...parsedBrandScen };
        if (normalizedBrandScen.FUKAI === 1) {
          normalizedBrandScen.FUKAI = ACTING_2027_SCENARIO_ID;
        }
        if (!normalizedBrandScen.LISKANI) {
          normalizedBrandScen.LISKANI = LISKANI_2027_SCENARIO_ID;
        }
        setSelectedScenarioByBrandState((prev) => ({ ...prev, ...normalizedBrandScen }));
      }

      const savedScenId = safeGetStorageJson<number>(STORAGE_KEY_ACTIVE_SCENARIO_ID);
      const effectiveBornersScen =
        parsedBrandScen && typeof parsedBrandScen.BORNERS === 'number'
          ? parsedBrandScen.BORNERS
          : 1;
      if (typeof savedScenId === 'number') {
        const syncedScenId =
          savedScenId === ACTING_2027_SCENARIO_ID &&
          effectiveBornersScen !== ACTING_2027_SCENARIO_ID
            ? effectiveBornersScen
            : savedScenId;
        if (syncedScenId !== savedScenId) {
          safeSetStorageJson(STORAGE_KEY_ACTIVE_SCENARIO_ID, syncedScenId);
        }
        setSelectedScenarioIdState((prev) => (prev === syncedScenId ? prev : syncedScenId));
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
      const eligibleModels = filterModelsForScenario(
        models,
        sc,
        includeGroupPortfolioInS1,
        brandFilterLocal
      );

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
          ? brandFilterLocal !== 'ALL' && targetMonthRevenueRub > 0
            ? targetMonthRevenueRub
            : ACTING_2027_CONTROL_TOTALS.decemberRevenueRub
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
  }, [scenarios, models, includeGroupPortfolioInS1, brandFilterLocal]);

  const currentAgg =
    scenarioAggregates[currentScenario.id] || scenarioAggregates[1];

  // Сводка ТЗ v1.1 по выбранному сценарию: Партии закупок, Капитал, Честный P&L и Риски
  const v11ScenarioSummary = useMemo(() => {
    const eligible = filterModelsForScenario(
      models,
      currentScenario,
      includeGroupPortfolioInS1,
      brandFilterLocal
    );

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
    const multiBrandSummary = computeMultiBrandPortfolioSummary(
      models,
      scenarios,
      selectedScenarioByBrand
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
      multiBrandSummary,
    };
  }, [models, scenarios, currentScenario, includeGroupPortfolioInS1, selectedScenarioByBrand]);

  // Отфильтрованные модели для каталога на Экране №1
  const filteredModels = useMemo(() => {
    const basePool =
      statusFilterLocal === 'В архиве'
        ? models.filter((m) => m.launchStatus === 'В архиве')
        : filterModelsForScenario(
            models,
            currentScenario,
            includeGroupPortfolioInS1,
            brandFilterLocal
          );

    const list = basePool.filter((m) => {
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
  }, [
    models,
    currentScenario,
    includeGroupPortfolioInS1,
    brandFilterLocal,
    statusFilterLocal,
    searchQuery,
    sortBy,
  ]);

  // Единая синхронизация модели сценария с основным Каталогом моделей (SKU)
  const syncScenarioModelToCatalog = useCallback(
    (spec: ScenarioModelSpec, prevSpec?: ScenarioModelSpec) => {
      const unitCfg = getBrandUnitConfig(spec.customBrandLabel || spec.brandId);
      const cleanCode = spec.code.replace(/[^0-9A-Za-zА-Яа-я-]/g, '') || '001';
      const hasBrandPrefix = /^(BRN|NT|NTL|LSC|LSK|AKU|FUK)-/i.test(cleanCode);
      const targetSku = hasBrandPrefix
        ? cleanCode
        : `${spec.brandId === 'NA_TELE' ? 'NT' : 'BRN'}-${cleanCode}`;

      const prevCleanCode = prevSpec
        ? prevSpec.code.replace(/[^0-9A-Za-zА-Яа-я-]/g, '') || '001'
        : cleanCode;
      const prevHasPrefix = /^(BRN|NT|NTL|LSC|LSK|AKU|FUK)-/i.test(prevCleanCode);
      const prevSku = prevSpec
        ? prevHasPrefix
          ? prevCleanCode
          : `${prevSpec.brandId === 'NA_TELE' ? 'NT' : 'BRN'}-${prevCleanCode}`
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
          fitType: spec.subtitle,
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
          category: (unitCfg.categoryDefault as any) || 'Боксеры',
          productType: 'Базовая коллекция',
          priceSegment: 'Middle+',
          collection: `${unitCfg.displayCode} 2027`,
          materials: spec.fabric.composition,
          fitType: spec.subtitle,
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
        includeGroupPortfolioInS1,
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
    clearDeletedModelsRegistry();
    commitModels((prev) => applyClientSavedS1SalesPlan(prev));
    notify(
      'success',
      '✓ Восстановлены сохранённые продажи (109,94 млн ₽ в дек · 686,28 млн ₽ за 2027 г.)',
      'Декабрь 2027: 109 938 111 ₽ · Годовой план 2027: 686 284 972 ₽ · 21 SKU в цели BORNERS.'
    );
  };

  // Сброс к эталону 28-страничного PDF (15,04 млн WB + 85,11 млн 16 новых = 100,15 млн ₽ в дек)
  const handleResetToPdfBaseline = () => {
    clearDeletedModelsRegistry();
    const baseline = [
      ...ACTING_2027_SCENARIO_MODELS,
      ...S1_100M_SCENARIO_MODELS,
      ...LISKANI_2027_MODELS,
    ];
    commitModels(baseline);
    commitScenarios([...INITIAL_SCENARIOS, LISKANI_2027_SCENARIO_DEF]);
    notify(
      'success',
      '↺ Восстановлен эталон PDF (100,15 млн ₽ в дек · 606,37 млн ₽ за 2027 г.)',
      '5 подтверждённых SKU WB (15,04 млн ₽) + 16 новых вариантов (85,11 млн ₽ / 41 400 компл.) + матрица LISKANI.'
    );
  };

  const generateNextUniqueModelCode = (existingModels: ScenarioModelSpec[]): string => {
    const usedNums = new Set<number>();
    existingModels.forEach((m) => {
      const match = m.code.match(/^№?0*(\d+)$/);
      if (match) usedNums.add(Number(match[1]));
    });
    let candidate = Math.max(existingModels.length + 1, 24);
    while (usedNums.has(candidate)) {
      candidate += 1;
    }
    return `№${String(candidate).padStart(3, '0')}`;
  };

  // Дублирование модели (п. 4.1)
  const handleDuplicateModel = (source: ScenarioModelSpec) => {
    const nextCode = generateNextUniqueModelCode(models);
    const copy: ScenarioModelSpec = {
      ...source,
      id: `scen-model-${Date.now()}`,
      code: nextCode,
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
    markModelAsDeletedInStorage(target);
    commitModels((prev) => {
      const remaining = prev.filter(
        (m) =>
          m.id !== target.id &&
          m.code.trim().toUpperCase() !== target.code.trim().toUpperCase()
      );
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

  // Создание новой модели через короткую форму (Раздел 4.4 и 4.5 ТЗ: привязка к выбранному бренду, без выдуманного плана продаж)
  const createAndSaveModel = (openCardAfterSave: boolean) => {
    const rawBrand =
      draftBrand ||
      (brandFilterLocal !== 'ALL' ? brandFilterLocal : 'BORNERS');
    const norm = normalizePortfolioBrandCode(rawBrand);
    const bCode: CanonicalBrandCode = norm === 'ALL' ? 'BORNERS' : norm;
    const unitCfg = getBrandUnitConfig(bCode);
    const cleanTitle =
      draftTitle.trim() || `${unitCfg.displayCode} НОВАЯ МОДЕЛЬ`;

    // Если у бренда ещё нет активного сценария (например, AKUSHA или LISKANI) — создаём / подключаем его автоматически
    let workingScenarios = [...scenarios];
    let workingModels = [...models];
    const currentBrandScenId = selectedScenarioByBrand[bCode];
    const hasValidBrandScen =
      typeof currentBrandScenId === 'number' &&
      workingScenarios.some((s) => s.id === currentBrandScenId && !s.isArchived);

    if (!hasValidBrandScen) {
      const existingOwned = workingScenarios.find(
        (s) =>
          !s.isArchived &&
          s.ownerBrandCode &&
          normalizePortfolioBrandCode(s.ownerBrandCode) === bCode
      );
      if (existingOwned) {
        setSelectedScenarioForBrand(bCode, existingOwned.id);
        setSelectedScenarioId(existingOwned.id);
      } else {
        const createdScenRes = createIndependentBrandScenario(
          workingScenarios,
          workingModels,
          {
            title: `${unitCfg.displayCode} — План развития 2027`,
            brandCode: bCode,
            year: 2027,
            monthlyTargetMln: bCode === 'AKUSHA' ? 35 : bCode === 'LISKANI' ? 28 : 30,
            copyFromScenarioId: null,
          }
        );
        workingScenarios = createdScenRes.scenarios;
        workingModels = createdScenRes.models;
        commitScenarios(workingScenarios);
        setSelectedScenarioForBrand(bCode, createdScenRes.scenario.id);
        setSelectedScenarioId(createdScenRes.scenario.id);
      }
    }

    const { model: created } = createBrandProductModel(
      workingModels,
      workingScenarios,
      {
        title: cleanTitle,
        brandCode: bCode,
        code: draftCode.trim() || undefined,
        categoryLabel: draftType || unitCfg.categoryDefault,
        unitsInPack: draftUnitsInPack || unitCfg.secondaryPerPrimaryDefault,
        retailPriceRub: draftRetailPrice || 1990,
        unitCostRub: draftUnitCost || 650,
        imageUrl: draftImageUrl || undefined,
      }
    );

    unmarkModelAsDeletedInStorage(created);
    commitModels([...workingModels, created]);
    setSelectedModelId(created.id);
    setNewModelModalOpen(false);
    setDraftTitle('');
    setDraftImageUrl('');

    // Автоматически синхронизируем созданную модель с разделом «Модели (SKU)»
    syncScenarioModelToCatalog(created);

    if (openCardAfterSave) {
      navigateScreen('model', created.id);
    }
    notify(
      'success',
      `✓ Карточка ${created.code} / ${created.title} (${unitCfg.displayCode}) сохранена`,
      'Модель добавлена в каталог бренда и общий каталог группы (план продаж: 0 до заполнения).'
    );
  };

  const handleCreateNewModel = (e: React.FormEvent) => {
    e.preventDefault();
    createAndSaveModel(true);
  };

  // Создание нового сценария (Раздел 3.1–3.4 и 5.3 ТЗ: независимый сценарий бренда на 2027 или 2028 год без дублирования товаров и заказов)
  const handleCreateNewScenario = (e: React.FormEvent) => {
    e.preventDefault();
    const targetBrand =
      draftScenBrand ||
      (brandFilterLocal !== 'ALL' ? brandFilterLocal : 'BORNERS');
    const copyId =
      draftCopyFromScenarioId > 0 ? draftCopyFromScenarioId : null;

    const { scenario: newScen, scenarios: nextScenarios, models: nextModels } =
      createIndependentBrandScenario(scenarios, models, {
        title: draftScenTitle,
        brandCode: targetBrand,
        year: draftScenYear,
        monthlyTargetMln: draftScenTargetMln,
        copyFromScenarioId: copyId,
      });

    commitModels(nextModels);
    commitScenarios(nextScenarios);
    setSelectedScenarioId(newScen.id);
    setSelectedScenarioForBrand(targetBrand, newScen.id);
    setNewScenarioModalOpen(false);
    setDraftScenTitle('');
    notify(
      'success',
      `✓ Сценарий «${newScen.title}» (${newScen.year} г. · цель ${newScen.monthlyTargetMln} млн ₽/мес) создан`,
      copyId
        ? 'Скопированы плановые цены и объёмы продаж без дублирования карточек, остатков и утверждённых заказов фабрикам.'
        : 'Создан независимый сценарий бренда. Заполните помесячный план продаж для моделей.'
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
    // Если удалённый сценарий был выбран у какого-то бренда — переключаем бренд на оставшийся сценарий этого бренда или null
    setSelectedScenarioByBrandState((prev) => {
      const next = { ...prev };
      let changed = false;
      const codes: CanonicalBrandCode[] = ['BORNERS', 'NA_TELE', 'FUKAI', 'AKUSHA', 'LISKANI'];
      for (const bCode of codes) {
        if (next[bCode] === scToDelete.id) {
          const fallback = remaining.find(
            (s) =>
              !s.isArchived &&
              s.ownerBrandCode &&
              normalizePortfolioBrandCode(s.ownerBrandCode) === bCode
          );
          next[bCode] = fallback
            ? fallback.id
            : bCode === 'BORNERS'
            ? 1
            : bCode === 'FUKAI'
            ? ACTING_2027_SCENARIO_ID
            : bCode === 'LISKANI'
            ? LISKANI_2027_SCENARIO_ID
            : bCode === 'NA_TELE'
            ? 2
            : null;
          changed = true;
        }
      }
      if (changed) {
        safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, next);
      }
      return next;
    });
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
                  ? 'bg-white text-[#141413] border border-[#CECDC4] font-semibold shadow-2xs'
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
                  ? 'bg-white text-[#141413] border border-[#CECDC4] font-semibold shadow-2xs'
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

      {/* ЭКРАН №1: ГЛАВНАЯ СТРАНИЦА ВСЕГО СЕРВИСА ИЛИ РАБОЧАЯ СВОДКА СЦЕНАРИЕВ */}
      {screen === 'scenarios' && (
        <div className="space-y-6 pb-6">
          {/* =====================================================================
              РЕЖИМ «ГЛАВНАЯ»: ФЛАГМАНСКАЯ ГЛАВНАЯ СТРАНИЦА ВСЕГО СЕРВИСА BORNERS GROUP
          ===================================================================== */}
          {homeSubView === 'home' && (
            <PeaklyMasterCabinetsSummary
              multiBrandSummary={v11ScenarioSummary.multiBrandSummary}
              scenarios={scenarios}
              activeBrandFilter={brandFilterLocal}
              isStandaloneHome={true}
              onOpenStrategySummary={() => switchHomeSubView('summary')}
              onOpenStudioCanvas={onOpenStudioCanvas}
              onSelectBrandFilter={(bCode) => {
                if (
                  bCode === 'FUKAI' &&
                  currentScenario.id === 1 &&
                  !includeGroupPortfolioInS1
                ) {
                  setIncludeGroupPortfolioInS1(true);
                }
                setBrandFilterLocal(bCode);
                setBrandFilter(bCode);
              }}
              onSelectScenarioForBrand={(bCode, scenId) => {
                setSelectedScenarioForBrand(bCode, scenId);
              }}
              onSelectActiveScenarioId={(scenId) => {
                setSelectedScenarioId(scenId);
              }}
              onOpenCreateScenarioForBrand={(bCode, defaultTitle) => {
                setDraftScenBrand(bCode);
                setDraftScenTitle(defaultTitle);
                setDraftCopyFromScenarioId(0);
                setNewScenarioModalOpen(true);
              }}
              onOpenCreateModelForBrand={(bCode) => {
                setDraftBrand(bCode);
                setNewModelModalOpen(true);
              }}
              onLaunchStarterCabinet={handleLaunchStarterCabinet}
              onLaunchAllCabinets={handleLaunchAllCabinets}
              onResetStarterCabinets={handleResetStarterCabinets}
              onNavigateSection={(sec) => navigateTo(sec)}
            />
          )}

          {/* =====================================================================
              РЕЖИМ «СВОДКА»: СТРАТЕГИЯ РОСТА, 4 СЦЕНАРИЯ, ТРАЕКТОРИЯ И ТОВАРНАЯ МАТРИЦА
          ===================================================================== */}
          {homeSubView === 'summary' && (
            <>
              {/* КОМПАКТНАЯ ВЕРХНЯЯ ПАНЕЛЬ СВОДКИ С ПЕРЕХОДОМ НА ГЛАВНУЮ И ФИЛЬТРОМ КАБИНЕТОВ */}
              <div className="rounded-[18px] bg-white border border-[#CFD6E0] px-4 py-3 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.05)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => switchHomeSubView('home')}
                    className="h-8 px-3 rounded-[9px] bg-[#F8FAFC] hover:bg-[#EEF1F6] border border-[#CBD5E1] text-[12px] font-bold text-[#1E293B] transition cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>← Главная холдинга</span>
                  </button>
                  <div className="h-4 w-[1px] bg-[#E2E8F0] hidden sm:block" />
                  <span className="text-[11.5px] font-semibold text-[#64748B]">Кабинеты:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setBrandFilterLocal('ALL');
                      setBrandFilter('ALL');
                      const bornersScenId = v11ScenarioSummary.multiBrandSummary.brands.find(
                        (x) => x.brandCode === 'BORNERS'
                      )?.selectedScenarioId;
                      if (bornersScenId) {
                        setSelectedScenarioId(bornersScenId);
                      }
                    }}
                    className={`h-7.5 px-2.5 rounded-[8px] text-[11.5px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5 border ${
                      brandFilterLocal === 'ALL'
                        ? 'bg-[#2C3444] text-white border-[#2C3444]'
                        : 'bg-[#F8FAFC] text-[#334155] border-[#DCE2EC] hover:bg-white'
                    }`}
                  >
                    <span>Все (5)</span>
                    <span className="font-mono text-[10.5px] opacity-80">
                      {(
                        v11ScenarioSummary.multiBrandSummary.groupTotal.annualRevenueRub /
                        1_000_000
                      )
                        .toFixed(1)
                        .replace('.', ',')}{' '}
                      млн
                    </span>
                  </button>

                  {v11ScenarioSummary.multiBrandSummary.brands.map((b) => {
                    const isSel =
                      brandFilterLocal !== 'ALL' &&
                      normalizePortfolioBrandCode(brandFilterLocal) === b.brandCode;
                    return (
                      <button
                        key={b.brandCode}
                        type="button"
                        onClick={() => {
                          if (isSel) {
                            setBrandFilterLocal('ALL');
                            setBrandFilter('ALL');
                            const bornersScenId =
                              v11ScenarioSummary.multiBrandSummary.brands.find(
                                (x) => x.brandCode === 'BORNERS'
                              )?.selectedScenarioId;
                            if (bornersScenId) {
                              setSelectedScenarioId(bornersScenId);
                            }
                          } else {
                            setBrandFilterLocal(b.brandCode);
                            setBrandFilter(b.brandCode);
                            if (b.selectedScenarioId !== null) {
                              setSelectedScenarioId(b.selectedScenarioId);
                            }
                          }
                        }}
                        className={`h-7.5 px-2.5 rounded-[8px] text-[11.5px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5 border ${
                          isSel
                            ? 'bg-[#2C3444] text-white border-[#2C3444]'
                            : 'bg-[#F8FAFC] text-[#334155] border-[#DCE2EC] hover:bg-white'
                        }`}
                      >
                        <span className="font-bold">{b.displayCode}</span>
                        <span className="font-mono text-[10.5px] opacity-80">
                          {b.annualRevenueRub > 0
                            ? `${(b.annualRevenueRub / 1_000_000).toFixed(1).replace('.', ',')} млн`
                            : `${b.modelsCount} SKU`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="px-2.5 py-1 rounded-[8px] bg-[#F8FAFC] border border-[#E2E8F0] font-mono text-[#334155]">
                    Холдинг:{' '}
                    <strong className="font-extrabold text-[#0F172A]">
                      {(
                        v11ScenarioSummary.multiBrandSummary.groupTotal.annualRevenueRub /
                        1_000_000
                      )
                        .toFixed(2)
                        .replace('.', ',')}{' '}
                      млн ₽
                    </strong>
                  </span>
                  <span className="px-2.5 py-1 rounded-[8px] bg-[#ECFDF5] border border-[#A7F3D0] font-mono text-[#047857]">
                    Прибыль:{' '}
                    <strong className="font-extrabold text-[#064E3B]">
                      +
                      {(
                        v11ScenarioSummary.multiBrandSummary.groupTotal
                          .annualEstimatedOperatingProfitRub / 1_000_000
                      )
                        .toFixed(2)
                        .replace('.', ',')}{' '}
                      млн ₽
                    </strong>
                  </span>
                </div>
              </div>

              {/* =====================================================================
                  РАЗДЕЛ 02 · СЦЕНАРИИ РАЗВИТИЯ И ПОМЕСЯЧНАЯ ТРАЕКТОРИЯ ВЫРУЧКИ
              ===================================================================== */}
              <section className="rounded-[20px] bg-white border border-[#CFD6E0] overflow-hidden shadow-[0_6px_24px_-6px_rgba(15,23,42,0.07)]">
            {/* ВЕРХНЯЯ ПАНЕЛЬ СЦЕНАРИЕВ */}
            <div className="px-6 py-4 border-b border-[#DCE2EC] bg-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#64748B]">
                    Сценарии и траектория · 2027–2028
                  </div>
                  <h2 className="text-[19px] md:text-[21px] font-extrabold tracking-[-0.02em] text-[#111827] mt-0.5">
                    Стратегия роста BORNERS GROUP
                  </h2>
                </div>

                {currentScenario.id === 1 && (
                  <div className="inline-flex items-center rounded-[10px] bg-[#EEF1F6] border border-[#D8DEE8] p-1 text-[11.5px]">
                    <button
                      type="button"
                      onClick={() => setIncludeGroupPortfolioInS1(false)}
                      className={`px-2.5 py-1 rounded-[7px] font-semibold transition cursor-pointer ${
                        !includeGroupPortfolioInS1
                          ? 'bg-white text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-[#CBD5E1]'
                          : 'text-[#64748B] hover:text-[#111827]'
                      }`}
                    >
                      Цель BORNERS · 21 SKU
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncludeGroupPortfolioInS1(true)}
                      className={`px-2.5 py-1 rounded-[7px] font-semibold transition cursor-pointer ${
                        includeGroupPortfolioInS1
                          ? 'bg-white text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-[#CBD5E1]'
                          : 'text-[#64748B] hover:text-[#111827]'
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
                  <div className="inline-flex items-center gap-1 rounded-[9px] bg-[#F4F6F9] border border-[#DCE2EC] p-0.5 pl-2.5">
                    <span className="text-[11.5px] font-medium text-[#64748B]">Цель дек:</span>
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      step={5}
                      value={currentScenario.monthlyTargetMln}
                      onChange={(e) =>
                        handleUpdateScenarioTargetMln(Number(e.target.value) || 100)
                      }
                      className="w-12 text-right font-mono text-[12.5px] font-extrabold text-[#111827] bg-transparent focus:outline-none"
                    />
                    <span className="text-[11px] font-medium text-[#64748B] mr-1">млн</span>
                    <button
                      type="button"
                      onClick={() => handleAutoCalculateByPriority()}
                      className="h-7 px-2.5 rounded-[7px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#111827] text-[11.5px] font-semibold transition cursor-pointer"
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
                      ? 'bg-[#2C3444] text-white border-[#2C3444]'
                      : 'bg-white text-[#334155] border-[#DCE2EC] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <span>Детальный расчёт</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      mathBreakdownOpen ? 'rotate-180 text-white' : 'text-[#64748B]'
                    }`}
                  />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen((v) => !v)}
                    aria-expanded={exportMenuOpen}
                    className="h-8 px-3 rounded-[9px] bg-white hover:bg-[#F8FAFC] border border-[#DCE2EC] text-[12px] font-semibold text-[#334155] inline-flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <span>Экспорт</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-[#64748B] transition-transform ${
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
                      <div className="absolute right-0 mt-1.5 w-76 rounded-[14px] bg-white border border-[#CFD6E0] shadow-[0_16px_40px_rgba(15,23,42,0.12)] p-2 z-50 text-[12px] space-y-1.5">
                        {currentScenario.id !== ACTING_2027_SCENARIO_ID && (
                          <div className="pb-1.5 border-b border-[#EEF2F6] space-y-0.5">
                            <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                              Эталоны продаж и веса
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setExportMenuOpen(false);
                                handleRestoreClientSavedSales();
                              }}
                              className="w-full px-2.5 py-2 rounded-[8px] hover:bg-[#F8FAFC] text-left font-semibold text-[#111827] flex items-center justify-between cursor-pointer"
                            >
                              <span>Сохранённые продажи</span>
                              <span className="font-mono text-[11px] text-[#111827] font-bold">
                                109,94 млн ₽
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExportMenuOpen(false);
                                handleResetToPdfBaseline();
                              }}
                              className="w-full px-2.5 py-2 rounded-[8px] hover:bg-[#F8FAFC] text-left font-semibold text-[#111827] flex items-center justify-between cursor-pointer"
                            >
                              <span>Сбросить к эталону PDF</span>
                              <span className="font-mono text-[11px] text-[#64748B]">
                                100,15 млн ₽
                              </span>
                            </button>
                          </div>
                        )}

                        <div className="pb-1.5 border-b border-[#EEF2F6] space-y-0.5">
                          <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                            Обмен планом сценария
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setExportMenuOpen(false);
                              handleExportScenarioPlan('csv');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F8FAFC] text-left font-medium text-[#111827] flex items-center justify-between cursor-pointer"
                          >
                            <span>Экспорт плана</span>
                            <span className="font-mono text-[10.5px] text-[#64748B]">CSV</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExportMenuOpen(false);
                              handleExportScenarioPlan('json');
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F8FAFC] text-left font-medium text-[#111827] flex items-center justify-between cursor-pointer"
                          >
                            <span>Экспорт плана</span>
                            <span className="font-mono text-[10.5px] text-[#64748B]">JSON</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExportMenuOpen(false);
                              scenarioPlanImportRef.current?.click();
                            }}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F8FAFC] text-left font-medium text-[#111827] flex items-center justify-between cursor-pointer"
                          >
                            <span>Импорт плана</span>
                            <span className="font-mono text-[10.5px] text-[#64748B]">CSV / JSON</span>
                          </button>
                        </div>

                        <div className="space-y-0.5">
                          <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                            Документы PDF
                          </div>
                          <a
                            href="docs/tz-v1.1/BORNERS_TZ_v1_1.pdf"
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setExportMenuOpen(false)}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F8FAFC] text-left font-medium text-[#111827] flex items-center justify-between"
                          >
                            <span>Техническое задание v1.1</span>
                            <span className="font-mono text-[10.5px] text-[#64748B]">PDF</span>
                          </a>
                          <a
                            href="docs/s1-100m/BORNERS_2027_S1_100M_Plan.pdf"
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setExportMenuOpen(false)}
                            className="w-full px-2.5 py-1.5 rounded-[8px] hover:bg-[#F8FAFC] text-left font-medium text-[#111827] flex items-center justify-between"
                          >
                            <span>Презентация сценария (28 стр.)</span>
                            <span className="font-mono text-[10.5px] text-[#64748B]">PDF</span>
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
                    className="h-8 px-3 rounded-[9px] border border-[#DCE2EC] bg-white hover:bg-[#F8FAFC] text-[12px] font-semibold text-[#334155] transition cursor-pointer"
                  >
                    Студия идей
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setNewScenarioModalOpen(true)}
                  className="h-8 px-3.5 rounded-[9px] bg-[#2C3444] hover:bg-[#1E2430] text-white text-[12px] font-semibold transition cursor-pointer shadow-2xs"
                >
                  + Новый сценарий
                </button>
              </div>
            </div>

            {/* РЯД 1: ПОРТФЕЛЬ СЦЕНАРИЕВ В ЛЁГКОМ ВОЗДУШНОМ СТИЛЕ */}
            <div
              data-tour="growth-scenarios"
              className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 bg-[#F8FAFC]/60 dark:bg-[#121620] border-b border-[#E2E6EE] dark:border-[#222938]"
            >
              {(() => {
                const visibleScenarios =
                  brandFilterLocal === 'ALL'
                    ? scenarios.filter((s) => !s.isArchived)
                    : getScenariosForBrand(
                        scenarios,
                        normalizePortfolioBrandCode(brandFilterLocal)
                      );
                if (visibleScenarios.length === 0) {
                  const nb = normalizePortfolioBrandCode(brandFilterLocal);
                  const canQuickLaunch =
                    nb === 'AKUSHA' || nb === 'LISKANI' || nb === 'NA_TELE';
                  return (
                    <div className="col-span-full rounded-2xl border border-dashed border-[#CBD5E1] dark:border-[#222938] bg-white dark:bg-[#121620] p-5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[13.5px] font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                          Нет сценария для выбранного бренда ({brandFilterLocal})
                        </div>
                        <div className="text-[12px] text-[#64748B] mt-0.5">
                          Запустите готовую стартовую матрицу (3 флагманских SKU + сценарий 2027) в 1 клик или создайте пустой сценарий вручную.
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {canQuickLaunch && (
                          <button
                            type="button"
                            onClick={() => handleLaunchStarterCabinet(nb)}
                            className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold cursor-pointer shadow-2xs transition"
                          >
                            🚀 Запустить матрицу {nb === 'NA_TELE' ? 'НА ТЕЛЕ' : nb} (3 SKU)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setDraftScenBrand(nb === 'ALL' ? 'BORNERS' : nb);
                            setNewScenarioModalOpen(true);
                          }}
                          className="h-9 px-4 rounded-xl bg-[#2C3444] hover:bg-[#1E2430] text-white text-[12px] font-semibold cursor-pointer shadow-2xs"
                        >
                          + Создать сценарий бренда
                        </button>
                      </div>
                    </div>
                  );
                }
                const fukaiBrandRow = v11ScenarioSummary.multiBrandSummary.brands.find(
                  (b) => b.brandCode === 'FUKAI'
                );
                const fukaiAnnualRub =
                  fukaiBrandRow && fukaiBrandRow.hasScenario && fukaiBrandRow.hasModels
                    ? fukaiBrandRow.annualRevenueRub
                    : 0;

                return [...visibleScenarios]
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
                  const holdingCombinedRub =
                    brandFilterLocal === 'ALL' && sc.id !== ACTING_2027_SCENARIO_ID && agg
                      ? agg.annualRevenueRub + fukaiAnnualRub
                      : null;
                  const holdingCombinedMln =
                    holdingCombinedRub !== null
                      ? (holdingCombinedRub / 1_000_000).toFixed(2).replace('.', ',')
                      : null;
                  const liveDecMlnNum = agg
                    ? Math.round((agg.targetMonthRevenueRub / 1_000_000) * 100) / 100
                    : sc.monthlyTargetMln;
                  const liveDecMlnStr = liveDecMlnNum.toFixed(2).replace('.', ',');
                  const targetMlnNum =
                    sc.id === ACTING_2027_SCENARIO_ID
                      ? brandFilterLocal !== 'ALL' && liveDecMlnNum > 0
                        ? liveDecMlnNum
                        : Math.round(
                            (ACTING_2027_CONTROL_TOTALS.decemberRevenueRub / 1_000_000) * 100
                          ) / 100
                      : sc.monthlyTargetMln;
                  const pctNum = agg ? agg.goalCompletionPct : 100;
                  const progressWidth = Math.min(100, Math.max(10, Math.round(pctNum)));

                  return (
                    <div
                      key={sc.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedScenarioId(sc.id);
                        if (brandFilterLocal !== 'ALL') {
                          setSelectedScenarioForBrand(brandFilterLocal, sc.id);
                        } else {
                          setSelectedScenarioForBrand('BORNERS', sc.id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedScenarioId(sc.id);
                          if (brandFilterLocal !== 'ALL') {
                            setSelectedScenarioForBrand(brandFilterLocal, sc.id);
                          } else {
                            setSelectedScenarioForBrand('BORNERS', sc.id);
                          }
                        }
                      }}
                      className={`hover-lift group rounded-xl p-4 text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                        isSelected
                          ? 'bg-white dark:bg-[#181D2A] text-[#0F172A] dark:text-[#EDF0F7] border border-emerald-500/45 shadow-[0_6px_20px_-6px_rgba(16,185,129,0.14)]'
                          : 'bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] hover:border-[#CBD5E1]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[13px] font-medium truncate ${
                              isSelected ? 'text-[#0F172A] dark:text-[#EDF0F7]' : 'text-[#64748B]'
                            }`}
                          >
                            {sc.id === ACTING_2027_SCENARIO_ID
                                ? 'Исходный план 2027'
                                : `${sc.title} · ${sc.year || 2027}`}
                          </span>

                          <div className="flex items-center gap-1 shrink-0">
                            {isSelected ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10.5px] font-medium">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Активен
                              </span>
                            ) : (
                              <span className="text-[11px] font-mono text-[#64748B]">
                                {agg?.modelsCount || 0} SKU
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDraftScenTitle(`${sc.title} (копия)`);
                                const nb = sc.ownerBrandCode
                                  ? normalizePortfolioBrandCode(sc.ownerBrandCode)
                                  : brandFilterLocal !== 'ALL'
                                  ? normalizePortfolioBrandCode(brandFilterLocal)
                                  : 'BORNERS';
                                setDraftScenBrand(nb === 'ALL' ? 'BORNERS' : nb);
                                setDraftScenYear((sc.year as 2027 | 2028) || 2027);
                                setDraftScenTargetMln(sc.monthlyTargetMln);
                                setDraftCopyFromScenarioId(sc.id);
                                setNewScenarioModalOpen(true);
                              }}
                              title={`Скопировать сценарий «${sc.title}»`}
                              className="h-5 px-1.5 rounded-[5px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 flex items-center justify-center text-[10px] leading-none font-medium transition cursor-pointer bg-white hover:bg-[#F8FAFC] text-[#475569] border border-[#E2E8F0]"
                            >
                              Копия
                            </button>
                            {sc.id !== ACTING_2027_SCENARIO_ID && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const nextName =
                                    typeof window !== 'undefined'
                                      ? window.prompt('Новое название сценария:', sc.title)
                                      : null;
                                  if (nextName && nextName.trim()) {
                                    commitScenarios((prev) =>
                                      renameBrandScenario(prev, sc.id, { title: nextName.trim() })
                                    );
                                    notify(
                                      'success',
                                      'Сценарий переименован',
                                      `Новое название: «${nextName.trim()}»`
                                    );
                                  }
                                }}
                                title={`Переименовать сценарий «${sc.title}»`}
                                className="h-5 px-1.5 rounded-[5px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 flex items-center justify-center text-[10px] leading-none font-medium transition cursor-pointer bg-white hover:bg-[#F8FAFC] text-[#475569] border border-[#E2E8F0]"
                              >
                                Имя
                              </button>
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
                                className="h-5 w-5 rounded-[5px] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 flex items-center justify-center text-[12px] leading-none font-medium transition cursor-pointer bg-white hover:bg-rose-50 text-[#64748B] hover:text-rose-700 border border-[#E2E8F0]"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-2.5 flex items-baseline justify-between gap-2">
                          <div className="inline-flex items-baseline gap-1.5 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[#0F172A] dark:text-[#EDF0F7] leading-none">
                            <span>{liveDecMlnStr}</span>
                            <span className="font-sans text-xs font-medium tracking-normal text-[#64748B]">
                              млн ₽ в дек
                            </span>
                          </div>
                          <span
                            className={`font-mono text-[10.5px] font-medium px-2 py-0.5 rounded-md ${
                              pctNum >= 100
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-[#F1F5F9] dark:bg-[#181D2A] text-[#64748B]'
                            }`}
                          >
                            {pctNum.toFixed(0)}% цели
                          </span>
                        </div>
                      </div>

                      {/* Спокойные итоги и 3px полоса прогресса по нижнему краю */}
                      <div className="mt-3 pt-2.5 border-t border-[#EEF2F6] dark:border-[#222938] space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs text-[#64748B]">
                          <span>Цель: {String(targetMlnNum).replace('.', ',')} млн</span>
                          <span className="font-mono font-medium text-[#0F172A] dark:text-[#EDF0F7]">
                            {holdingCombinedMln ? `BORNERS: ${annualMln} млн` : `Год: ${annualMln} млн ₽`}
                          </span>
                        </div>
                        {holdingCombinedMln && (
                          <div className="flex items-center justify-between gap-1 text-[11px]">
                            <span className="text-[#64748B] truncate">+ FUKAI 90,55 млн</span>
                            <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                              Холдинг: {holdingCombinedMln} млн ₽
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[#E2E8F0] dark:bg-[#222938]">
                        <div
                          style={{ width: `${progressWidth}%` }}
                          className={`h-full transition-all duration-700 ease-out ${
                            isSelected ? 'bg-emerald-500' : 'bg-[#94A3B8]/60'
                          }`}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* ЖИВАЯ ИНТЕРАКТИВНАЯ ТРАЕКТОРИЯ 12 МЕСЯЦЕВ (ПЛАВНАЯ AREA-КРИВАЯ + АНИМИРОВАННЫЕ КОЛОНКИ + 3 РЕЖИМА) */}
            {(brandFilterLocal === 'ALL' ||
              getScenariosForBrand(
                scenarios,
                normalizePortfolioBrandCode(brandFilterLocal)
              ).length > 0) &&
              (() => {
                const mbSummary = v11ScenarioSummary.multiBrandSummary;
                const activeBrandNorm = normalizePortfolioBrandCode(brandFilterLocal);
                const selectedBrandRow =
                  activeBrandNorm !== 'ALL'
                    ? mbSummary.brands.find((r) => r.brandCode === activeBrandNorm)
                    : null;

                const groupMarginRatio =
                  mbSummary.groupTotal.annualRevenueRub > 0
                    ? mbSummary.groupTotal.annualEstimatedOperatingProfitRub /
                      mbSummary.groupTotal.annualRevenueRub
                    : 0.4;

                const brandMarginRatio =
                  selectedBrandRow && selectedBrandRow.annualRevenueRub > 0
                    ? selectedBrandRow.annualEstimatedOperatingProfitRub /
                      selectedBrandRow.annualRevenueRub
                    : groupMarginRatio;

                const monthlySeries = MONTHS_SHORT_RU.map((mName, idx) => {
                  if (selectedBrandRow && selectedBrandRow.monthlyRows[idx]) {
                    const mm = selectedBrandRow.monthlyRows[idx];
                    const revMln = mm.grossSalesRub / 1_000_000;
                    const profMln = revMln * brandMarginRatio;
                    const procMln = mm.factoryTotalOutflowRub / 1_000_000;
                    return {
                      monthLabel: mName,
                      revenueRub: mm.grossSalesRub,
                      revenueMln: revMln,
                      profitMln: profMln,
                      factoryOutflowMln: procMln,
                      activeValMln:
                        trajectoryChartMetric === 'profit'
                          ? profMln
                          : trajectoryChartMetric === 'procurement'
                          ? procMln
                          : revMln,
                    };
                  }
                  const totalMm = mbSummary.groupTotal.monthlyRows[idx];
                  const bornersRow = mbSummary.brands.find((r) => r.brandCode === 'BORNERS');
                  const bornersRub = bornersRow?.monthlyRows[idx]?.grossSalesRub || 0;
                  const totalRub = totalMm ? totalMm.grossSalesRub : bornersRub;
                  const revMln = totalRub / 1_000_000;
                  const profMln = revMln * groupMarginRatio;
                  const procMln = (totalMm?.factoryTotalOutflowRub || 0) / 1_000_000;
                  return {
                    monthLabel: mName,
                    revenueRub: totalRub,
                    revenueMln: revMln,
                    profitMln: profMln,
                    factoryOutflowMln: procMln,
                    activeValMln:
                      trajectoryChartMetric === 'profit'
                        ? profMln
                        : trajectoryChartMetric === 'procurement'
                        ? procMln
                        : revMln,
                  };
                });

                const maxMonthMln = Math.max(
                  1,
                  ...monthlySeries.map((pt) => pt.activeValMln)
                );
                const totalYearActiveMln = monthlySeries.reduce(
                  (s, pt) => s + pt.activeValMln,
                  0
                );
                const selPt =
                  monthlySeries[selectedChartMonthIdx] || monthlySeries[11];

                const brandMonthBreakdown = mbSummary.brands
                  .map((r) => ({
                    code: r.displayCode,
                    revMln: (r.monthlyRows[selectedChartMonthIdx]?.grossSalesRub || 0) / 1_000_000,
                  }))
                  .filter((b) => b.revMln > 0.01);

                // Геометрия плавной кубической кривой Безье (SVG Area + Spline) по 12 точкам
                const svgW = 1200;
                const svgH = 92;
                const padTop = 14;
                const padBottom = 8;
                const usableH = svgH - padTop - padBottom;

                const coords = monthlySeries.map((pt, idx) => {
                  const x = ((idx + 0.5) / 12) * svgW;
                  const ratio = Math.min(1, Math.max(0, pt.activeValMln / maxMonthMln));
                  const y = padTop + usableH * (1 - ratio);
                  return { x, y, val: pt.activeValMln };
                });

                let smoothPath = '';
                coords.forEach((pt, idx) => {
                  if (idx === 0) {
                    smoothPath += `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
                  } else {
                    const prev = coords[idx - 1];
                    const cpx1 = prev.x + (pt.x - prev.x) * 0.45;
                    const cpx2 = prev.x + (pt.x - prev.x) * 0.55;
                    smoothPath += ` C ${cpx1.toFixed(1)} ${prev.y.toFixed(1)}, ${cpx2.toFixed(1)} ${pt.y.toFixed(1)}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
                  }
                });

                const areaPath =
                  coords.length > 0
                    ? `${smoothPath} L ${coords[coords.length - 1].x.toFixed(1)} ${svgH} L ${coords[0].x.toFixed(1)} ${svgH} Z`
                    : '';

                const strokeColor =
                  trajectoryChartMetric === 'procurement'
                    ? '#0D9488'
                    : '#10B981';

                const metricLabelTitle =
                  trajectoryChartMetric === 'profit'
                    ? 'Ожидаемая операционная прибыль'
                    : trajectoryChartMetric === 'procurement'
                    ? 'График оплаты партий фабрикам'
                    : 'Помесячная динамика выручки';

                return (
                  <div className="px-6 py-5 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[14.5px] font-extrabold text-[#111827]">
                              {metricLabelTitle} {currentScenario.year || 2027}
                            </span>
                            <span className="font-mono text-[12px] font-semibold px-2 py-0.5 rounded-[6px] bg-[#F1F5F9] text-[#334155]">
                              Итого за год: {trajectoryChartMetric === 'profit' ? '+' : ''}
                              {totalYearActiveMln.toFixed(2).replace('.', ',')} млн ₽
                            </span>
                          </div>
                        </div>

                        {/* Переключатель метрики графика (Выручка | Опер. прибыль | Закупки) */}
                        <div className="inline-flex items-center rounded-[10px] bg-[#EEF1F6] border border-[#CBD5E1] p-0.5 text-[11.5px]">
                          {[
                            { id: 'revenue' as const, label: 'Выручка' },
                            { id: 'profit' as const, label: 'Опер. прибыль' },
                            { id: 'procurement' as const, label: 'Оплаты партий' },
                          ].map((mTab) => {
                            const active = trajectoryChartMetric === mTab.id;
                            return (
                              <button
                                key={mTab.id}
                                type="button"
                                onClick={() => setTrajectoryChartMetric(mTab.id)}
                                className={`h-7 px-2.5 rounded-[7px] font-semibold transition cursor-pointer ${
                                  active
                                    ? 'bg-white text-[#111827] shadow-2xs border border-[#CBD5E1]'
                                    : 'text-[#64748B] hover:text-[#111827]'
                                }`}
                              >
                                {mTab.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <div className="inline-flex flex-wrap items-center gap-2 rounded-[9px] bg-[#F4F6F9] border border-[#DCE2EC] px-3 py-1">
                          <span className="font-semibold text-[#475569]">
                            {MONTHS_SHORT_RU[selectedChartMonthIdx]}:
                          </span>
                          <span className="font-mono font-extrabold text-[#111827]">
                            {selPt.revenueMln.toFixed(2).replace('.', ',')} млн ₽
                          </span>
                          <span className="font-mono font-bold text-[#0D9488] border-l border-[#CBD5E1] pl-2">
                            прибыль +{selPt.profitMln.toFixed(2).replace('.', ',')} млн
                          </span>
                          {brandMonthBreakdown.length > 1 && (
                            <span className="hidden xl:inline text-[11px] text-[#64748B] border-l border-[#CBD5E1] pl-2">
                              {brandMonthBreakdown
                                .map(
                                  (b) =>
                                    `${b.code}: ${b.revMln.toFixed(1).replace('.', ',')} млн`
                                )
                                .join(' · ')}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => navigateTo('launch-calendar')}
                          className="h-7.5 px-3 rounded-[8px] border border-[#DCE2EC] bg-white hover:bg-[#F8FAFC] text-[11.5px] font-semibold text-[#334155] cursor-pointer transition"
                        >
                          Таблица 12 мес. →
                        </button>
                      </div>
                    </div>

                    {/* ЕДИНЫЙ КОМБИНИРОВАННЫЙ ГРАФИК 12 МЕСЯЦЕВ (БЕЗ ДВОЙНЫХ ЭТАЖЕЙ И БАТАРЕЕК) */}
                    <div className="rounded-[14px] border border-[#E2E8F0] bg-gradient-to-b from-[#F8FAFC]/80 to-white px-3 pt-3.5 pb-2.5">
                      {/* Ряд цифр над пиками месяцев */}
                      <div className="grid grid-cols-12 gap-1.5 mb-1.5">
                        {monthlySeries.map((pt, idx) => {
                          const isSel = selectedChartMonthIdx === idx;
                          const isDec = idx === 11;
                          return (
                            <button
                              type="button"
                              key={`val-${pt.monthLabel}`}
                              onClick={() => setSelectedChartMonthIdx(idx)}
                              className="text-center cursor-pointer"
                            >
                              <span
                                className={`font-mono text-[11px] sm:text-[11.5px] transition-colors ${
                                  isSel
                                    ? 'font-extrabold text-[#111827] bg-[#EEF1F6] px-1.5 py-0.5 rounded-[5px]'
                                    : isDec
                                    ? 'font-extrabold text-[#0D9488]'
                                    : 'font-semibold text-[#475569] hover:text-[#111827]'
                                }`}
                              >
                                {trajectoryChartMetric === 'profit' && pt.activeValMln > 0 ? '+' : ''}
                                {pt.activeValMln.toFixed(1).replace('.', ',')}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Единое поле графика: вертикальные столбики + плавная кривая Безье поверх их вершин */}
                      <div className="relative h-[108px] w-full">
                        {/* Фоновая SVG-область и плавная линия тренда */}
                        <svg
                          viewBox={`0 0 ${svgW} ${svgH}`}
                          preserveAspectRatio="none"
                          className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-10"
                        >
                          <defs>
                            <linearGradient id="bornersTrajectoryGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.20" />
                              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
                            </linearGradient>
                          </defs>
                          <line
                            x1="0"
                            y1={padTop + usableH * 0.35}
                            x2={svgW}
                            y2={padTop + usableH * 0.35}
                            stroke="#E2E8F0"
                            strokeDasharray="4 6"
                            strokeWidth="1"
                          />
                          <line
                            x1="0"
                            y1={padTop + usableH * 0.7}
                            x2={svgW}
                            y2={padTop + usableH * 0.7}
                            stroke="#EEF2F6"
                            strokeDasharray="4 6"
                            strokeWidth="1"
                          />
                          {areaPath && (
                            <path
                              d={areaPath}
                              fill="url(#bornersTrajectoryGrad)"
                              className="transition-all duration-700 ease-out"
                            />
                          )}
                          {smoothPath && (
                            <path
                              d={smoothPath}
                              fill="none"
                              stroke={strokeColor}
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              className="transition-all duration-700 ease-out"
                            />
                          )}
                          {coords.map((pt, idx) => {
                            const isSel = selectedChartMonthIdx === idx;
                            const isDec = idx === 11;
                            return (
                              <g key={idx}>
                                {(isSel || isDec) && (
                                  <circle
                                    cx={pt.x}
                                    cy={pt.y}
                                    r={isSel ? 8.5 : 7}
                                    fill={isDec ? '#0D9488' : strokeColor}
                                    fillOpacity="0.20"
                                  />
                                )}
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r={isSel ? 4.8 : isDec ? 4.2 : 3}
                                  fill={isDec ? '#0D9488' : isSel ? strokeColor : '#FFFFFF'}
                                  stroke={isDec ? '#0D9488' : strokeColor}
                                  strokeWidth="2.2"
                                  className="transition-all duration-500"
                                />
                              </g>
                            );
                          })}
                        </svg>

                        {/* 12 вертикальных колонок на единой оси */}
                        <div className="relative z-0 grid grid-cols-12 gap-1.5 h-full items-end pt-[14px] pb-[6px]">
                          {monthlySeries.map((pt, idx) => {
                            const isSel = selectedChartMonthIdx === idx;
                            const isDec = idx === 11;
                            const ratio = Math.min(1, Math.max(0.05, pt.activeValMln / maxMonthMln));
                            const barHeightPct = Math.round(ratio * 100);

                            return (
                              <button
                                type="button"
                                key={`bar-${pt.monthLabel}`}
                                onClick={() => setSelectedChartMonthIdx(idx)}
                                className="h-full flex flex-col justify-end items-center group cursor-pointer px-1"
                              >
                                <div
                                  style={{ height: `${barHeightPct}%` }}
                                  className={`w-full max-w-[34px] rounded-t-[6px] transition-all duration-700 ease-out ${
                                    isSel
                                      ? 'bg-emerald-500/40'
                                      : isDec
                                      ? 'bg-emerald-500/30 group-hover:bg-emerald-500/45'
                                      : 'bg-emerald-500/10 group-hover:bg-emerald-500/22'
                                  }`}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Нижняя ось X: месяцы */}
                      <div className="grid grid-cols-12 gap-1.5 pt-2 border-t border-[#E2E8F0]">
                        {monthlySeries.map((pt, idx) => {
                          const isSel = selectedChartMonthIdx === idx;
                          const isDec = idx === 11;
                          return (
                            <button
                              type="button"
                              key={`lbl-${pt.monthLabel}`}
                              onClick={() => setSelectedChartMonthIdx(idx)}
                              className={`text-center py-0.5 rounded-[5px] text-[11px] transition cursor-pointer ${
                                isSel
                                  ? 'font-bold text-[#111827] bg-[#EEF1F6]'
                                  : isDec
                                  ? 'font-bold text-[#0D9488]'
                                  : 'font-medium text-[#64748B] hover:text-[#111827]'
                              }`}
                            >
                              {pt.monthLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* Детальный разбор по брендам, формуле декабря и партиям — открывается по кнопке «По брендам и расчёт» */}
            {(mathBreakdownOpen || v11ContourExpanded) && (
              <div className="p-5 bg-[#FAF9F6] border-t border-[#E4E3DC] space-y-4">
                {/* 4 ОБЪЁМНЫЕ БИЗНЕС-КАРТОЧКИ АКТИВНОГО СЦЕНАРИЯ */}
                {(() => {
                  const isActing = currentScenario.id === ACTING_2027_SCENARIO_ID;
                  const annualRevMln = (currentAgg.annualRevenueRub / 1_000_000)
                    .toFixed(2)
                    .replace('.', ',');
                  const avgMonthlyMln = (currentAgg.annualRevenueRub / 12 / 1_000_000)
                    .toFixed(2)
                    .replace('.', ',');
                  const procBudgetRub =
                    v11ScenarioSummary.investmentSummary.totalProcurementBudgetRub;
                  const procBudgetMln = (procBudgetRub / 1_000_000).toFixed(2).replace('.', ',');
                  const wbShareDecPct =
                    currentAgg.targetMonthRevenueRub > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (currentAgg.actingDecRevenueRub / currentAgg.targetMonthRevenueRub) *
                              100
                          )
                        )
                      : 100;

                  return (
                    <div className="rounded-[12px] border border-[#D8D7CF] overflow-hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#EAE9E2] bg-white">
                      {/* Колонка 1: Пик сезона (Декабрь 2027) */}
                      <div className="px-5 py-4 flex flex-col justify-between gap-2.5">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                              Структура декабря 2027
                            </span>
                            <span className="rounded-md bg-[#F4F3EE] px-2 py-0.5 font-mono text-[10.5px] font-bold text-[#141413]">
                              {currentAgg.targetMonthPacks.toLocaleString('ru-RU')} компл.
                            </span>
                          </div>
                          <div className="mt-2 font-mono text-[23px] font-extrabold tracking-[-0.02em] text-[#141413]">
                            {(currentAgg.targetMonthRevenueRub / 1_000_000)
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </div>
                        </div>

                        {isActing ? (
                          <div className="space-y-1.5">
                            <div className="h-1.5 w-full rounded-full bg-[#157347]" />
                            <div className="text-[11.5px] text-[#686762] flex items-center justify-between">
                              <span>100% действующая база WB</span>
                              <span className="font-mono font-bold text-[#141413]">7 SKU</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="h-1.5 w-full rounded-full bg-[#E4E3DC] overflow-hidden flex">
                              <div
                                style={{ width: `${wbShareDecPct}%` }}
                                className="h-full bg-[#157347]"
                                title="Действующая база WB"
                              />
                              <div
                                style={{ width: `${100 - wbShareDecPct}%` }}
                                className="h-full bg-[#8E8D85]"
                                title="Новые модели 2027"
                              />
                            </div>
                            <div className="text-[11.5px] text-[#686762] flex items-center justify-between gap-2">
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

                      {/* Колонка 2: Годовой оборот 2027 */}
                      <div className="px-5 py-4 flex flex-col justify-between gap-2.5">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                              Годовой оборот (12 мес.)
                            </span>
                            <span className="rounded-md bg-[#F4F3EE] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#52514C]">
                              ~{avgMonthlyMln} млн/мес
                            </span>
                          </div>
                          <div className="mt-2 font-mono text-[23px] font-extrabold tracking-[-0.02em] text-[#141413]">
                            {annualRevMln} млн ₽
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#686762]">
                          <span>
                            Выкупы:{' '}
                            <strong className="font-mono text-[#141413]">
                              {currentAgg.annualBuyoutsPacks.toLocaleString('ru-RU')} компл.
                            </strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => navigateTo('launch-calendar')}
                            className="font-bold text-[#0F5132] hover:underline cursor-pointer shrink-0"
                          >
                            02 · Продажи →
                          </button>
                        </div>
                      </div>

                      {/* Колонка 3: Вложить на старт (Q1) и пик своих денег */}
                      <div className="px-5 py-4 flex flex-col justify-between gap-2.5">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                              Вложить на старт (Q1)
                            </span>
                            <span className="rounded-md bg-[#F4F3EE] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#52514C]">
                              Аванс 30%:{' '}
                              {(
                                v11ScenarioSummary.investmentSummary.firstWavePrepaymentRub /
                                1_000_000
                              )
                                .toFixed(2)
                                .replace('.', ',')}{' '}
                              млн
                            </span>
                          </div>
                          <div className="mt-2 font-mono text-[23px] font-extrabold tracking-[-0.02em] text-[#141413]">
                            {(
                              v11ScenarioSummary.investmentSummary.firstWaveStartBudgetRub /
                              1_000_000
                            )
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#686762]">
                          <span>
                            Пик с WB:{' '}
                            <strong className="font-mono text-[#141413]">
                              {(
                                v11ScenarioSummary.investmentSummary.netOwnMoneyRequiredRub /
                                1_000_000
                              )
                                .toFixed(2)
                                .replace('.', ',')}{' '}
                              млн
                            </strong>{' '}
                            · год: {procBudgetMln} млн
                          </span>
                          <button
                            type="button"
                            onClick={() => navigateTo('roadmap-tasks')}
                            className="font-bold text-[#0F5132] hover:underline cursor-pointer shrink-0"
                          >
                            03 · Закупки →
                          </button>
                        </div>
                      </div>

                      {/* Колонка 4: Ожидаемая прибыль и P&L */}
                      <div className="px-5 py-4 flex flex-col justify-between gap-2.5">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                              Ожидаемая прибыль и P&L
                            </span>
                            <span className="rounded-md bg-[#EAF6F0] px-2 py-0.5 font-mono text-[10.5px] font-bold text-[#146C43]">
                              {v11ScenarioSummary.investmentSummary.operatingMarginPct
                                .toFixed(1)
                                .replace('.', ',')}% рентаб.
                            </span>
                          </div>
                          <div className="mt-2 font-mono text-[23px] font-extrabold tracking-[-0.02em] text-[#157347]">
                            +
                            {(
                              v11ScenarioSummary.investmentSummary
                                .annualEstimatedOperatingProfitRub / 1_000_000
                            )
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#686762]">
                          <span>
                            Себест. продаж:{' '}
                            <strong className="font-mono text-[#141413]">
                              {(
                                v11ScenarioSummary.investmentSummary.annualSoldGoodsCostRub /
                                1_000_000
                              )
                                .toFixed(2)
                                .replace('.', ',')}{' '}
                              млн ₽
                            </strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => navigateTo('finance')}
                            className="font-bold text-[#0F5132] hover:underline cursor-pointer shrink-0"
                          >
                            04 · Финансы →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {/* ГЛОБАЛЬНАЯ СВОДКА BORNERS GROUP С ВЫБОРОМ СЦЕНАРИЯ ПО КАЖДОМУ БРЕНДУ (РАЗДЕЛ 9 ТЗ) */}
                <div className="rounded-[12px] bg-white border border-[#D8D7CF] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-bold text-[#141413]">
                        Глобальная сводка BORNERS GROUP по 5 брендам (выбор сценария по каждому бренду)
                      </div>
                      <div className="text-[11.5px] text-[#5E5D58]">
                        По каждому бренду суммируется ровно один выбранный сценарий · Закупки учитывают единицы измерения категории ({v11ScenarioSummary.multiBrandSummary.procurementBreakdownText})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGroupMonthlyDetailsOpen((v) => !v)}
                      className="h-8 px-3 rounded-[9px] border border-[#CECDC4] bg-[#FAF9F6] hover:bg-[#F0EFE9] text-[11.5px] font-semibold text-[#141413] cursor-pointer"
                    >
                      {groupMonthlyDetailsOpen ? 'Скрыть 12 мес. ↑' : 'Подробнее (12 мес.) ↓'}
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-[10px] border border-[#E4E3DC]">
                    <table className="w-full min-w-[920px] text-left border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-[#FAF9F6] text-[#5E5D58] border-b border-[#E4E3DC] text-[10.5px] uppercase tracking-wide">
                          <th className="py-2 px-3 font-bold">Бренд</th>
                          <th className="py-2 px-2.5 font-bold">Выбранный сценарий</th>
                          <th className="py-2 px-2 font-bold text-right">Моделей</th>
                          <th className="py-2 px-3 font-bold text-right">План продаж</th>
                          <th className="py-2 px-3 font-bold text-right">Нужно закупить</th>
                          <th className="py-2 px-3 font-bold text-right">Стоимость закупки</th>
                          <th className="py-2 px-3 font-bold text-right bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                            Вложить на старт (Q1)
                          </th>
                          <th className="py-2 px-3 font-bold text-right bg-[#F1F5F9] dark:bg-[#1E2536] text-[#0F172A] dark:text-[#EDF0F7]">
                            Потребность в своих деньгах
                          </th>
                          <th className="py-2 px-3 font-bold text-right">Опер. прибыль</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECEBE4]">
                        {v11ScenarioSummary.multiBrandSummary.brands.map((b) => {
                          const brandScenarios = b.availableScenarios;
                          const unitCfg = getBrandUnitConfig(b.brandCode);
                          return (
                            <tr
                              key={b.brandCode}
                              onClick={() => {
                                setBrandFilterLocal(b.brandCode);
                                setBrandFilter(b.brandCode);
                                if (b.selectedScenarioId !== null) {
                                  setSelectedScenarioId(b.selectedScenarioId);
                                }
                              }}
                              title={`Открыть бренд ${b.brandTitle}`}
                              className={`hover:bg-[#FAF9F6] cursor-pointer transition ${
                                brandFilterLocal === b.brandCode ? 'bg-amber-50/70' : ''
                              }`}
                            >
                              <td className="py-2 px-3 font-bold text-[#141413]">
                                <div>{b.brandTitle}</div>
                                <div className="text-[10px] font-normal text-[#686760]">
                                  {unitCfg.categoryDefault} · {b.primaryUnit}
                                </div>
                              </td>
                              <td
                                className="py-2 px-2.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={b.selectedScenarioId ?? ''}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const nextId = raw === '' ? null : Number(raw);
                                      setSelectedScenarioForBrand(b.brandCode, nextId);
                                      if (nextId !== null && brandFilterLocal === b.brandCode) {
                                        setSelectedScenarioId(nextId);
                                      }
                                    }}
                                    className="h-7 max-w-[210px] px-2 rounded-[7px] border border-[#D8D7CF] bg-white text-[11.5px] font-semibold text-[#141413]"
                                  >
                                    <option value="">Нет сценария</option>
                                    {brandScenarios.map((sc) => (
                                      <option key={sc.id} value={sc.id}>
                                        {sc.title} ({sc.year || 2027})
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDraftScenBrand(b.brandCode);
                                      setDraftScenTitle(`${b.displayCode} — базовый план 2027`);
                                      setDraftCopyFromScenarioId(0);
                                      setNewScenarioModalOpen(true);
                                    }}
                                    title={`Создать сценарий для ${b.brandTitle}`}
                                    className="h-7 px-2 rounded-[7px] border border-[#D8D7CF] bg-[#FAF9F6] hover:bg-[#EFEFE9] text-[11px] font-bold text-[#141413] cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-[#52514C]">
                                {b.modelsCount}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-semibold text-[#141413]">
                                {b.statusMessage ? (
                                  <span className="text-[10.5px] font-sans text-[#686760]">
                                    {b.statusMessage}
                                  </span>
                                ) : (
                                  `${(b.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-[#52514C]">
                                {b.hasScenario && b.hasModels
                                  ? `${b.totalProcurementQuantity.toLocaleString('ru-RU')} ${b.primaryUnit}`
                                  : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-[#141413]">
                                {b.hasScenario && b.hasModels
                                  ? `${(b.totalProcurementBudgetRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                  : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono bg-emerald-500/6 text-emerald-700 dark:text-emerald-300 font-bold">
                                {b.hasScenario && b.hasModels
                                  ? `${(b.firstWaveStartBudgetRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                  : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono bg-[#F8FAFC] dark:bg-[#161C28] text-[#0F172A] dark:text-[#EDF0F7] font-bold">
                                {b.hasScenario && b.hasModels
                                  ? b.verifiedOwnMoneyRequiredRub !== null
                                    ? `${(b.verifiedOwnMoneyRequiredRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                    : v11ScenarioSummary.multiBrandSummary.ownMoneyStatusLabel
                                  : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-[#157347]">
                                {b.hasScenario && b.hasModels
                                  ? `+${(b.annualEstimatedOperatingProfitRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr
                          onClick={() => {
                            setBrandFilterLocal('ALL');
                            setBrandFilter('ALL');
                          }}
                          title="Показать все бренды группы"
                          className="bg-[#F5F5F1] font-extrabold text-[#141413] border-t border-[#CECDC4] cursor-pointer hover:bg-[#EFEFE9] transition"
                        >
                          <td className="py-2.5 px-3" colSpan={2}>
                            ИТОГО ПО ГРУППЕ
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono">
                            {v11ScenarioSummary.multiBrandSummary.groupTotal.modelsCount}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {(
                              v11ScenarioSummary.multiBrandSummary.groupTotal.annualRevenueRub /
                              1_000_000
                            )
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                            {v11ScenarioSummary.multiBrandSummary.procurementBreakdownText}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {(
                              v11ScenarioSummary.multiBrandSummary.groupTotal
                                .totalProcurementBudgetRub / 1_000_000
                            )
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                            {(
                              v11ScenarioSummary.multiBrandSummary.groupTotal
                                .firstWaveStartBudgetRub / 1_000_000
                            )
                              .toFixed(2)
                              .replace('.', ',')}{' '}
                            млн ₽
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono bg-[#F1F5F9] dark:bg-[#1E2536] text-[#0F172A] dark:text-[#EDF0F7]">
                            {v11ScenarioSummary.multiBrandSummary.groupTotal
                              .verifiedOwnMoneyRequiredRub !== null
                              ? `${(
                                  v11ScenarioSummary.multiBrandSummary.groupTotal
                                    .verifiedOwnMoneyRequiredRub / 1_000_000
                                )
                                  .toFixed(2)
                                  .replace('.', ',')} млн ₽`
                              : v11ScenarioSummary.multiBrandSummary.ownMoneyStatusLabel}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#157347]">
                            +
                            {(
                              v11ScenarioSummary.multiBrandSummary.groupTotal
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

                  {/* ПОМЕСЯЧНАЯ ГЛОБАЛЬНАЯ СВОДКА ГРУППЫ ПО КНОПКЕ «ПОДРОБНЕЕ (12 МЕС.)» (П. 9.5 ТЗ) */}
                  {groupMonthlyDetailsOpen && (
                    <div className="overflow-x-auto rounded-[10px] border border-[#E4E3DC] bg-[#FAF9F6] p-3">
                      <div className="text-[11.5px] font-bold text-[#141413] mb-2">
                        Помесячный график BORNERS GROUP (12 месяцев): продажи, платежи фабрикам, поступления WB и потребность в своих деньгах
                      </div>
                      <table className="w-full min-w-[780px] text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="border-b border-[#E4E3DC] text-[#5E5D58]">
                            <th className="py-1.5 px-2 font-bold">Показатель группы</th>
                            {v11ScenarioSummary.multiBrandSummary.groupTotal.monthlyRows.map((m) => (
                              <th key={m.monthIdx} className="py-1.5 px-1.5 text-right font-bold">
                                {m.monthLabel}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#ECEBE4] font-mono">
                          <tr>
                            <td className="py-1.5 px-2 font-sans font-semibold text-[#141413]">
                              Продажи (млн ₽)
                            </td>
                            {v11ScenarioSummary.multiBrandSummary.groupTotal.monthlyRows.map((m) => (
                              <td key={m.monthIdx} className="py-1.5 px-1.5 text-right">
                                {(m.grossSalesRub / 1_000_000).toFixed(1).replace('.', ',')}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="py-1.5 px-2 font-sans font-semibold text-rose-800">
                              Платежи фабрикам (млн ₽)
                            </td>
                            {v11ScenarioSummary.multiBrandSummary.groupTotal.monthlyRows.map((m) => (
                              <td key={m.monthIdx} className="py-1.5 px-1.5 text-right text-rose-800">
                                {(m.factoryTotalOutflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="py-1.5 px-2 font-sans font-semibold text-emerald-800">
                              Поступления выручки WB (млн ₽)
                            </td>
                            {v11ScenarioSummary.multiBrandSummary.groupTotal.monthlyRows.map((m) => (
                              <td key={m.monthIdx} className="py-1.5 px-1.5 text-right text-emerald-800">
                                {(m.wbNetInflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                              </td>
                            ))}
                          </tr>
                          <tr className="bg-white dark:bg-[#121620] font-bold">
                            <td className="py-1.5 px-2 font-sans text-[#0F172A] dark:text-[#EDF0F7]">
                              Накопленный баланс / свои деньги (млн ₽)
                            </td>
                            {v11ScenarioSummary.multiBrandSummary.groupTotal.monthlyRows.map((m) => (
                              <td key={m.monthIdx} className="py-1.5 px-1.5 text-right text-[#0F172A] dark:text-[#EDF0F7]">
                                {(m.cumulativeCashBalanceRub / 1_000_000).toFixed(1).replace('.', ',')}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
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
              БЛОК 02 · ТОВАРНАЯ МАТРИЦА СЦЕНАРИЯ (ГРУППЫ ТОВАРОВ · КАТАЛОГИ БРЕНДОВ · ТАБЛИЦА)
          ===================================================================== */}
          <section className="rounded-[20px] bg-white border border-[#CFD6E0] p-5 md:p-6 space-y-5 shadow-[0_6px_24px_-6px_rgba(15,23,42,0.07)]">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#64748B]">
                    Товарная матрица сценария
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <h3 className="text-[19px] font-extrabold text-[#111827]">
                      {currentScenario.id === ACTING_2027_SCENARIO_ID
                        ? 'Модели исходного плана 2027 (ИП Нерсесянц)'
                        : `Модели · ${currentScenario.title}`}
                    </h3>
                    <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-[7px] bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155]">
                      {filteredModels.length} SKU
                    </span>
                    {brandFilterLocal !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => {
                          setBrandFilterLocal('ALL');
                          setBrandFilter('ALL');
                        }}
                        className="h-6 px-2.5 rounded-[7px] bg-[#2C3444] text-white text-[11px] font-semibold cursor-pointer transition hover:bg-[#1E2430]"
                      >
                        {brandFilterLocal === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilterLocal} · Сбросить ×
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Переключатель Витрина | Таблица */}
                <div className="inline-flex items-center rounded-[10px] bg-[#EEF1F6] border border-[#CBD5E1] p-1 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setCatalogViewMode('grid')}
                    className={`h-8 px-3 rounded-[7px] transition cursor-pointer ${
                      catalogViewMode === 'grid'
                        ? 'bg-white text-[#111827] font-semibold shadow-2xs border border-[#CBD5E1]'
                        : 'text-[#64748B] hover:text-[#111827] font-semibold'
                    }`}
                  >
                    Витрина
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogViewMode('table')}
                    className={`h-8 px-3 rounded-[7px] transition cursor-pointer ${
                      catalogViewMode === 'table'
                        ? 'bg-white text-[#111827] font-semibold shadow-2xs border border-[#CBD5E1]'
                        : 'text-[#64748B] hover:text-[#111827] font-semibold'
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
                  className="h-9 px-3 rounded-[10px] bg-[#F8FAFC] focus:bg-white border border-[#CBD5E1] focus:border-[#2C3444] text-[12px] font-medium text-[#111827] placeholder:text-[#94A3B8] w-44 focus:outline-none"
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
                  className="h-9 px-2.5 rounded-[10px] bg-white border border-[#CBD5E1] hover:border-[#94A3B8] text-[12px] font-semibold text-[#334155] cursor-pointer"
                >
                  <option value="default">По порядку</option>
                  <option value="dec_desc">Выручка дек. ↓</option>
                  <option value="year_desc">Год 2027 ↓</option>
                  <option value="priority">По приоритету</option>
                </select>

                <select
                  value={statusFilterLocal}
                  onChange={(e) => setStatusFilterLocal(e.target.value)}
                  className="h-9 px-2.5 rounded-[10px] bg-white border border-[#CBD5E1] hover:border-[#94A3B8] text-[12px] font-semibold text-[#334155] cursor-pointer"
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
                  className="h-9 px-3.5 rounded-[10px] bg-[#2C3444] hover:bg-[#1E2430] text-white text-[12px] font-semibold transition cursor-pointer shadow-2xs"
                >
                  + Добавить модель
                </button>
              </div>
            </div>

            {filteredModels.length === 0 && (
              <div className="rounded-[12px] bg-[#FAF9F6] border border-[#D8D7CF] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
                <span className="text-[#262624] font-medium">
                  {brandFilterLocal === 'NA_TELE' ? (
                    <>
                      В «{currentScenario.title}» модели <strong>НА ТЕЛЕ</strong> не включены (моно-цель BORNERS). Линейка НА ТЕЛЕ запускается в Сценарии №2 и №3.
                    </>
                  ) : brandFilterLocal === 'AKUSHA' || brandFilterLocal === 'LISKANI' ? (
                    <>
                      Для бренда <strong>{brandFilterLocal === 'AKUSHA' ? 'AKUSHA' : 'LISKANI'}</strong> в «{currentScenario.title}» пока не добавлено карточек SKU. Вы можете добавить модель для этого бренда или показать все бренды.
                    </>
                  ) : (
                    <>
                      По выбранным фильтрам в «{currentScenario.title}» не найдено моделей SKU.
                    </>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {brandFilterLocal === 'NA_TELE' && currentScenario.id !== 2 && (
                    <button
                      type="button"
                      onClick={() => setSelectedScenarioId(2)}
                      className="h-8 px-3 rounded-[8px] bg-[#146C43] hover:bg-[#0F5132] text-white text-[11.5px] font-semibold cursor-pointer"
                    >
                      Переключить на Сценарий №2 (150 млн)
                    </button>
                  )}
                  {(brandFilterLocal === 'NA_TELE' ||
                    brandFilterLocal === 'AKUSHA' ||
                    brandFilterLocal === 'LISKANI') && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          handleLaunchStarterCabinet(
                            brandFilterLocal as 'AKUSHA' | 'LISKANI' | 'NA_TELE'
                          )
                        }
                        className="h-8 px-3 rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white text-[11.5px] font-semibold cursor-pointer transition"
                      >
                        🚀 Запустить стартовую матрицу (3 SKU)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftBrand(brandFilterLocal);
                          setNewModelModalOpen(true);
                        }}
                        className="h-8 px-3 rounded-[8px] bg-[#146C43] hover:bg-[#0F5132] text-white text-[11.5px] font-semibold cursor-pointer"
                      >
                        + Добавить модель (
                        {brandFilterLocal === 'NA_TELE'
                          ? 'НА ТЕЛЕ'
                          : brandFilterLocal === 'AKUSHA'
                            ? 'AKUSHA'
                            : 'LISKANI'}
                        )
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setBrandFilterLocal('ALL');
                      setBrandFilter('ALL');
                      setStatusFilterLocal('ALL');
                      setSearchQuery('');
                    }}
                    className="h-8 px-3 rounded-[8px] bg-white border border-[#CFCEC6] hover:border-[#94A3B8] text-[11.5px] font-semibold text-[#1E293B] cursor-pointer"
                  >
                    Показать все модели сценария
                  </button>
                </div>
              </div>
            )}

            {catalogViewMode === 'grid' ? (
              /* Группы товаров + Раздельные каталоги по брендам + Прямое разбиение по партиям и датам */
              <PeaklyCatalogGroupsAndBrandsView
                models={models}
                filteredModels={filteredModels}
                currentScenario={currentScenario}
                scenarios={scenarios}
                brandFilter={brandFilterLocal}
                multiBrandSummary={v11ScenarioSummary.multiBrandSummary}
                onSelectBrandFilter={(bCode) => {
                  if (
                    bCode === 'FUKAI' &&
                    currentScenario.id === 1 &&
                    !includeGroupPortfolioInS1
                  ) {
                    setIncludeGroupPortfolioInS1(true);
                  }
                  setBrandFilterLocal(bCode);
                  setBrandFilter(bCode);
                }}
                selectedScenarioByBrand={selectedScenarioByBrand}
                onSelectScenarioForBrand={(bCode, scenId) => {
                  setSelectedScenarioForBrand(bCode, scenId);
                }}
                onSelectActiveScenarioId={(scenId) => {
                  setSelectedScenarioId(scenId);
                }}
                onOpenCreateScenarioForBrand={(bCode, defaultTitle) => {
                  setDraftScenBrand(bCode);
                  setDraftScenTitle(defaultTitle);
                  setDraftCopyFromScenarioId(0);
                  setNewScenarioModalOpen(true);
                }}
                onOpenModelPassport={(modelId) => navigateScreen('model', modelId)}
                onUpdateModel={handleUpdateModel}
                onDeleteModel={handleDeleteOrArchiveModel}
                onOpenCreateModel={(defaultBrandCode) => {
                  if (defaultBrandCode) {
                    setDraftBrand(defaultBrandCode);
                  }
                  setNewModelModalOpen(true);
                }}
                onQuickAdjustDecPacks={handleQuickAdjustDecPacks}
                onCyclePriority={handleCycleCardPriority}
                onLaunchStarterCabinet={handleLaunchStarterCabinet}
                onLaunchAllCabinets={handleLaunchAllCabinets}
                onResetStarterCabinets={handleResetStarterCabinets}
                notify={notify}
              />
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
                              {detectModelBrandPortfolioLabel(mod)} · {mod.subtitle}
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
                                    ? 'bg-[#EAE9E2] text-[#141413] border-[#9E9D94]'
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
                            {met.avgRetailPriceRub.toLocaleString('ru-RU')} ₽
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
                    className="h-8 px-3.5 rounded-[8px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[11.5px] font-semibold inline-flex items-center transition"
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
            </>
          )}
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО СОЗДАНИЯ НОВОЙ МОДЕЛИ (п. 7.1 ТЗ, Тест 11) */}
      {newModelModalOpen && (() => {
        const modalNorm = normalizePortfolioBrandCode(draftBrand || 'BORNERS');
        const modalBrandCode: CanonicalBrandCode =
          modalNorm === 'ALL' ? 'BORNERS' : modalNorm;
        const modalPreset =
          SHOWCASE_BRAND_PRESETS[modalBrandCode] || SHOWCASE_BRAND_PRESETS.BORNERS;
        const modalUnitCfg = getBrandUnitConfig(modalBrandCode);
        return (
          <div
            onClick={() => setNewModelModalOpen(false)}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleCreateNewModel}
              className="w-full max-w-lg rounded-[22px] bg-white border border-[#E6E0D4] p-6 space-y-4 shadow-2xl"
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
                Поля и категории адаптируются под выбранный бренд ({modalUnitCfg.displayCode}). План продаж при создании равен 0 до вашего заполнения.
              </p>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                      Бренд (кабинет)
                    </label>
                    <select
                      value={modalBrandCode}
                      onChange={(e) => setDraftBrand(e.target.value)}
                      className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px] font-semibold"
                    >
                      <option value="BORNERS">BORNERS</option>
                      <option value="NA_TELE">НА ТЕЛЕ</option>
                      <option value="FUKAI">FUKAI</option>
                      <option value="AKUSHA">AKUSHA (обувь)</option>
                      <option value="LISKANI">LISKANI (шторы)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                      Артикул (SKU)
                    </label>
                    <input
                      type="text"
                      value={draftCode}
                      onChange={(e) => setDraftCode(e.target.value)}
                      className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px] font-mono font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Название модели
                  </label>
                  <input
                    type="text"
                    placeholder={modalPreset.placeholder}
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                      Категория ({modalUnitCfg.displayCode})
                    </label>
                    <select
                      value={
                        modalPreset.categories.includes(draftType)
                          ? draftType
                          : '__CUSTOM__'
                      }
                      onChange={(e) => {
                        if (e.target.value === '__CUSTOM__') {
                          setDraftType('');
                        } else {
                          setDraftType(e.target.value);
                        }
                      }}
                      className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px] font-medium"
                    >
                      {modalPreset.categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__CUSTOM__">+ Своя категория...</option>
                    </select>
                    {!modalPreset.categories.includes(draftType) && (
                      <input
                        type="text"
                        value={draftType}
                        onChange={(e) => setDraftType(e.target.value)}
                        placeholder="Введите название категории"
                        className="w-full h-8 px-2.5 mt-1.5 rounded-[8px] border border-[#DED8CC] text-[12px]"
                      />
                    )}
                  </div>
                  <div>
                    <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                      В 1 ед. ({modalUnitCfg.primaryUnit} → {modalUnitCfg.secondaryUnit})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
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

                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F] block mb-1">
                    Фотография модели (опционально)
                  </label>
                  <div className="flex items-center gap-3">
                    {draftImageUrl && (
                      <div className="relative h-11 w-11 rounded-[8px] border border-[#DED8CC] overflow-hidden shrink-0 bg-[#F8FAFC]">
                        <img
                          src={draftImageUrl}
                          alt="Превью"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setDraftImageUrl('')}
                          className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/75 text-white text-[9px] flex items-center justify-center cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const dataUrl = await compressImageFileToDataUrl(file, 920, 0.82);
                          setDraftImageUrl(dataUrl);
                        }
                      }}
                      className="w-full text-[12px] text-[#475569] file:mr-2.5 file:py-1.5 file:px-3 file:rounded-[8px] file:border-0 file:text-[11.5px] file:font-semibold file:bg-[#ECFDF5] file:text-[#047857] hover:file:bg-[#D1FAE5]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewModelModalOpen(false)}
                  className="h-9 px-3.5 rounded-[10px] border border-[#DED8CC] text-[12px] font-semibold text-[#5E5D58] hover:text-[#1E293B] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => createAndSaveModel(false)}
                  className="h-9 px-3.5 rounded-[10px] bg-[#146C43] hover:bg-[#0F5132] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Сохранить</span>
                </button>
                <button
                  type="submit"
                  className="h-9 px-3.5 rounded-[10px] border border-[#A7F3D0] bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#065F46] text-[12px] font-semibold cursor-pointer transition"
                >
                  Сохранить и открыть →
                </button>
              </div>
            </form>
          </div>
        );
      })()}

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
                  placeholder="Например: LISKANI — базовый план 2028"
                  value={draftScenTitle}
                  onChange={(e) => setDraftScenTitle(e.target.value)}
                  className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Бренд сценария
                  </label>
                  <select
                    value={draftScenBrand}
                    onChange={(e) => {
                      const nextBrand = normalizePortfolioBrandCode(e.target.value);
                      setDraftScenBrand(nextBrand === 'ALL' ? 'BORNERS' : nextBrand);
                      setDraftScenScope(nextBrand === 'BORNERS' ? 'BORNERS' : 'GROUP');
                    }}
                    className="w-full h-9 px-2.5 mt-1 rounded-[10px] border border-[#DED8CC] text-[12.5px] font-semibold"
                  >
                    <option value="BORNERS">BORNERS</option>
                    <option value="FUKAI">FUKAI</option>
                    <option value="AKUSHA">AKUSHA</option>
                    <option value="LISKANI">LISKANI</option>
                    <option value="NA_TELE">НА ТЕЛЕ</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Год планирования
                  </label>
                  <select
                    value={draftScenYear}
                    onChange={(e) =>
                      setDraftScenYear(Number(e.target.value) === 2028 ? 2028 : 2027)
                    }
                    className="w-full h-9 px-2.5 mt-1 rounded-[10px] border border-[#DED8CC] text-[12.5px] font-semibold"
                  >
                    <option value={2027}>2027 год</option>
                    <option value={2028}>2028 год</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                    Цель / мес (млн ₽)
                  </label>
                  <input
                    type="number"
                    value={draftScenTargetMln}
                    onChange={(e) =>
                      setDraftScenTargetMln(Math.max(1, Number(e.target.value) || 50))
                    }
                    className="w-full h-9 px-2.5 mt-1 rounded-[10px] border border-[#DED8CC] text-[13px] font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11.5px] font-semibold text-[#1D1D1F]">
                  Основа плана (копирование без дублирования карточек, склада и заказов)
                </label>
                <select
                  value={draftCopyFromScenarioId}
                  onChange={(e) =>
                    setDraftCopyFromScenarioId(Number(e.target.value))
                  }
                  className="w-full h-9 px-3 mt-1 rounded-[10px] border border-[#DED8CC] text-[12.5px]"
                >
                  <option value={0}>С нуля (пустой план без копирования)</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      Скопировать из: {s.title} ({s.year || 2027} · {s.monthlyTargetMln} млн ₽ / мес)
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
            code: activeModel.code.replace('№', ''),
            name: `${detectModelBrandPortfolioLabel(activeModel)} ${activeModel.code} · ${activeModel.title}`,
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
