'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Moon,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import { NavSectionId, PeriodFilter } from '@/types/platform';
import {
  CONCEPT_STAGE_LABELS_RU,
  ROLE_LABELS_RU,
  TASK_STATUS_LABELS_RU,
  canUserAccessSection,
  canUserViewFinance,
} from '@/lib/finance';
import { DashboardView } from '@/components/sections/DashboardView';
import { BrandPortfolioView, BrandStrategyView } from '@/components/sections/BrandStrategyView';
import { StrategyPresentationDeck } from '@/components/sections/StrategyPresentationDeck';
import { ProductCatalogView } from '@/components/sections/ProductCatalogView';
import { ProductLabView } from '@/components/sections/ProductLabView';
import { LaunchCalendarView, MarketingGrowthView } from '@/components/sections/LaunchAndGrowthViews';
import { FinanceView } from '@/components/sections/FinanceAndImportViews';
import {
  DocumentsView,
  MarketIntelligenceView,
  RoadmapTasksView,
  SettingsView,
  TeamView,
} from '@/components/sections/ManagementAndSystemViews';
import { PeaklySpotlightTour } from '@/components/shell/PeaklySpotlightTour';
import { BentoAtlasNav } from '@/components/shell/BentoAtlasNav';
import {
  FinanceContourView,
  ProcurementContourView,
  SalesMatrixContourView,
} from '@/components/sections/UnifiedContourViews';
import { DRAFT_MODULES_META, useDraftModules } from '@/lib/draftModules';
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';
import { computeModelScenarioMetrics } from '@/lib/scenarioData';
import { getActingSkuByWbOrVendor } from '@/lib/actingAssortment2027';
import {
  computeMultiBrandPortfolioSummary,
  detectModelBrandPortfolioLabel,
} from '@/lib/unifiedBusinessEngine';

interface NavGroup {
  groupTitle: string;
  items: {
    id: NavSectionId;
    label: string;
  }[];
}

const SIMPLE_NAV_ITEMS: {
  id: NavSectionId;
  step: string;
  label: string;
  subtitle: string;
}[] = [
  {
    id: 'dashboard',
    step: '01',
    label: 'Дашборд и Сводка',
    subtitle: 'Сводка KPI и пульс холдинга',
  },
  {
    id: 'product-lab',
    step: '02',
    label: 'Лаборатория R&D',
    subtitle: '7 этапов отбора и образцы',
  },
  {
    id: 'product-catalog',
    step: '03',
    label: 'Каталог моделей',
    subtitle: 'Матрица 70/30 и юнит-маржа',
  },
  {
    id: 'roadmap-tasks',
    step: '04',
    label: 'CRM · Задачи и проекты',
    subtitle: 'Канбан-доска, дедлайны и поручения',
  },
  {
    id: 'launch-calendar',
    step: '05',
    label: 'Календарь запусков',
    subtitle: 'Релизы коллекций и чек-листы',
  },
  {
    id: 'brand-strategy',
    step: '06',
    label: 'Стратегия брендов',
    subtitle: 'Паспорта 14 блоков ДНК',
  },
  {
    id: 'finance',
    step: '07',
    label: 'Финансы 2027',
    subtitle: '3 сценария P&L и План/Факт',
  },
];

const OPERATIONAL_NAV_ITEMS: {
  id: NavSectionId;
  step: string;
  label: string;
}[] = [
  { id: 'brand-portfolio', step: '08', label: 'Портфель брендов' },
  { id: 'marketing-growth', step: '09', label: 'Маркетинг и рост' },
  { id: 'market-intelligence', step: '10', label: 'Рынок и конкуренты' },
  { id: 'documents', step: '11', label: 'Документы и ТЗ' },
  { id: 'team', step: '12', label: 'Команда и роли' },
  { id: 'settings', step: '13', label: 'Настройки системы' },
];

const NAV_GROUPS: NavGroup[] = [
  {
    groupTitle: 'R&D и Продукт (Ключевой контур)',
    items: [
      { id: 'product-lab', label: 'Лаборатория R&D (Product Lab)' },
      { id: 'product-catalog', label: 'Каталог моделей' },
    ],
  },
  {
    groupTitle: 'Запуски и операции',
    items: [
      { id: 'launch-calendar', label: 'Календарь запусков' },
      { id: 'roadmap-tasks', label: 'Задачи и проекты' },
      { id: 'documents', label: 'Документы и файлы' },
      { id: 'finance', label: 'Финансы и P&L' },
      { id: 'marketing-growth', label: 'Маркетинг и рост' },
    ],
  },
  {
    groupTitle: 'Стратегия и обзор',
    items: [
      { id: 'dashboard', label: 'Дашборд группы' },
      { id: 'brand-portfolio', label: 'Портфель брендов' },
      { id: 'brand-strategy', label: 'Стратегия бренда' },
      { id: 'market-intelligence', label: 'Рынок и конкуренты' },
    ],
  },
  {
    groupTitle: 'Система и доступ',
    items: [
      { id: 'team', label: 'Команда и роли' },
      { id: 'settings', label: 'Настройки' },
    ],
  },
];

export function AppShell() {
  const {
    isAuthenticated,
    currentUser,
    users,
    loginAs,
    logout,
    brands,
    products,
    concepts,
    launches,
    projects,
    tasks,
    documents,
    competitors,
    activeSection,
    navHistory,
    canGoBack,
    canGoForward,
    navigateTo,
    goBack,
    goForward,
    brandFilter,
    setBrandFilter,
    periodFilter,
    setPeriodFilter,
    platformMode,
    setPlatformMode,
    simpleMode,
    setSimpleMode,
    darkMode,
    setDarkMode,
    selectedProductId,
    selectedConceptId,
    selectedLaunchId,
    restoreEntity,
    permanentlyDeleteEntity,
    emptyTrash,
    notify,
    toasts,
    dismissToast,
  } = usePlatform();

  const [atlasOpen, setAtlasOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [trashModalOpen, setTrashModalOpen] = useState(false);
  const [tourModalOpen, setTourModalOpen] = useState(false);
  const [tourStepIdx, setTourStepIdx] = useState(0);
  const [draftAdminModalOpen, setDraftAdminModalOpen] = useState(false);
  const [salesPlanSubTab, setSalesPlanSubTab] = useState<
    'sales-plan' | 'legacy-calendar'
  >('sales-plan');
  const [homeSubView, setHomeSubView] = useState<'home' | 'summary'>('home');

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

  const {
    draftModules,
    toggleDraftModule,
    setAllDraftModules,
    enabledCount: enabledDraftCount,
    totalCount: totalDraftCount,
  } = useDraftModules();

  const livePortfolio = useLiveScenarioPortfolio();

  const openScenarioSkuPassport = React.useCallback(
    (modelId: string, modelLabel?: string) => {
      try {
        sessionStorage.setItem('borners_open_scenario_model_id', modelId);
      } catch {
        // ignore
      }
      setPlatformMode('management');
      navigateTo('dashboard');
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('borners-open-scenario-model', {
              detail: { modelId },
            })
          );
        }, 0);
      }
      setGlobalSearchQuery('');
      setSearchModalOpen(false);
      if (modelLabel) {
        notify('success', `Открыт паспорт SKU 2027`, modelLabel);
      }
    },
    [navigateTo, notify, setPlatformMode]
  );

  const topScenarioDrivers = useMemo(() => {
    return [...livePortfolio.eligibleModels]
      .sort(
        (a, b) =>
          computeModelScenarioMetrics(b, livePortfolio.currentScenario)
            .targetMonthRevenueRub -
          computeModelScenarioMetrics(a, livePortfolio.currentScenario)
            .targetMonthRevenueRub
      )
      .slice(0, 5);
  }, [livePortfolio.eligibleModels, livePortfolio.currentScenario]);

  const trashItems = useMemo(() => {
    const items: {
      id: string;
      entityType: 'product' | 'concept' | 'launch' | 'task' | 'document';
      typeLabel: string;
      title: string;
      subtitle: string;
    }[] = [];

    concepts
      .filter((c) => c.isArchived)
      .forEach((c) => {
        items.push({
          id: c.id,
          entityType: 'concept',
          typeLabel: 'Карточка R&D',
          title: `${c.code} — ${c.name}`,
          subtitle: `Бренд: ${c.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS'} · Этап: ${CONCEPT_STAGE_LABELS_RU[c.stage]}`,
        });
      });

    products
      .filter((p) => p.isArchived)
      .forEach((p) => {
        items.push({
          id: p.id,
          entityType: 'product',
          typeLabel: 'Модель SKU',
          title: `${p.sku} — ${p.name}`,
          subtitle: `Бренд: ${p.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS'} · ${p.collection}`,
        });
      });

    launches
      .filter((l) => l.isArchived)
      .forEach((l) => {
        items.push({
          id: l.id,
          entityType: 'launch',
          typeLabel: 'Релиз в календаре',
          title: l.name,
          subtitle: `Старт: ${l.startDate} · Готовность ${l.readinessPct}%`,
        });
      });

    tasks
      .filter((t) => t.isArchived)
      .forEach((t) => {
        items.push({
          id: t.id,
          entityType: 'task',
          typeLabel: 'Задача CRM',
          title: t.title,
          subtitle: `Срок: ${t.deadline} · ${TASK_STATUS_LABELS_RU[t.status]}`,
        });
      });

    documents
      .filter((d) => d.isArchived)
      .forEach((d) => {
        items.push({
          id: d.id,
          entityType: 'document',
          typeLabel: 'Документ / ТЗ',
          title: d.title,
          subtitle: `${d.fileName} · ${d.category}`,
        });
      });

    return items;
  }, [concepts, products, launches, tasks, documents]);

  const [swipeFeedback, setSwipeFeedback] = useState<'back' | 'forward' | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAtlasOpen(false);
        setSearchModalOpen((prev) => !prev);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setSearchModalOpen(false);
        setAtlasOpen((prev) => !prev);
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (
        (e.altKey && e.key === 'ArrowLeft') ||
        (e.metaKey && e.key === '[')
      ) {
        if (canGoBack) {
          e.preventDefault();
          goBack();
          setSwipeFeedback('back');
          setTimeout(() => setSwipeFeedback(null), 700);
        }
      } else if (
        (e.altKey && e.key === 'ArrowRight') ||
        (e.metaKey && e.key === ']')
      ) {
        if (canGoForward) {
          e.preventDefault();
          goForward();
          setSwipeFeedback('forward');
          setTimeout(() => setSwipeFeedback(null), 700);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canGoBack, canGoForward, goBack, goForward]);

  // Двухпальцевый свайп влево/вправо на тачпаде ноутбука (Назад / Вперёд)
  useEffect(() => {
    let accX = 0;
    let lastWheelAt = 0;
    let lastNavAt = 0;

    const canElementScrollHorizontally = (
      el: HTMLElement | null,
      deltaX: number
    ): boolean => {
      let cur = el;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        const style = window.getComputedStyle(cur);
        const overflowX = style.overflowX;
        if (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          cur.scrollWidth > cur.clientWidth + 4
        ) {
          if (deltaX < 0 && cur.scrollLeft > 2) return true;
          if (
            deltaX > 0 &&
            cur.scrollLeft + cur.clientWidth < cur.scrollWidth - 2
          ) {
            return true;
          }
        }
        cur = cur.parentElement;
      }
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl?.closest('[data-no-swipe-nav="true"], [data-canvas-bg="true"]')
      ) {
        accX = 0;
        return;
      }

      const now = Date.now();
      if (now - lastNavAt < 580) return;

      // Интересуют только выраженные горизонтальные свайпы двумя пальцами
      if (Math.abs(e.deltaX) < 6 || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.55) {
        accX = 0;
        return;
      }

      if (canElementScrollHorizontally(e.target as HTMLElement | null, e.deltaX)) {
        accX = 0;
        return;
      }

      if (now - lastWheelAt > 220) {
        accX = 0;
      }
      lastWheelAt = now;
      accX += e.deltaX;

      if (accX <= -85 && canGoBack) {
        lastNavAt = now;
        accX = 0;
        goBack();
        setSwipeFeedback('back');
        setTimeout(() => setSwipeFeedback(null), 700);
      } else if (accX >= 85 && canGoForward) {
        lastNavAt = now;
        accX = 0;
        goForward();
        setSwipeFeedback('forward');
        setTimeout(() => setSwipeFeedback(null), 700);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [canGoBack, canGoForward, goBack, goForward]);

  // Переход на Главную страницу всего сервиса или в Сводку сценариев
  const handleGoHomeSummary = useCallback(
    (targetSubView: 'home' | 'summary' = 'home') => {
      setPlatformMode('management');
      setHomeSubView(targetSubView);
      if (targetSubView === 'home') {
        setBrandFilter('ALL');
      }
      setAtlasOpen(false);
      try {
        sessionStorage.removeItem('borners_open_scenario_model_id');
        window.localStorage.setItem(
          'borners_scenario_screen_state_v1',
          JSON.stringify({ screen: 'scenarios', selectedModelId: 'scen-brn-001-sc' })
        );
      } catch {
        // ignore
      }
      navigateTo('dashboard', { scenarioScreen: 'scenarios' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('borners-set-home-subview', {
            detail: { subView: targetSubView },
          })
        );
        if (targetSubView === 'home') {
          window.dispatchEvent(new CustomEvent('borners-reset-to-home-summary'));
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [navigateTo, setBrandFilter, setPlatformMode]
  );

  // Контроль выхода новой версии сайта в стиле Peakly («BORNERS обновился · НОВОЕ»)
  const currentBuildId = process.env.NEXT_PUBLIC_BUILD_ID || 'borners-2027-release';
  const [updateBannerOpen, setUpdateBannerOpen] = useState(false);
  const [updateDetailsOpen, setUpdateDetailsOpen] = useState(false);
  const [detectedBuildId, setDetectedBuildId] = useState<string>(currentBuildId);
  const [updateChanges, setUpdateChanges] = useState<string[]>([
    'Закупки напрямую связаны с планом продаж: меняйте сценарий или годовой план выкупов — партии и бюджет пересчитываются мгновенно',
    'Наглядно выделена сумма инвестиций сразу на старт (Партия №1 · Q1 и аванс 30% фабрике) отдельно от оборотного бюджета на год',
    'Очищен интерфейс партий от визуального перегруза, исправлен пустой экран при фильтре бренда и настроен возврат на главную сводку по клику на логотип',
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SEEN_BUILD_KEY = 'borners_seen_build_id_v1';

    const checkRemoteVersion = async () => {
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          buildId?: string;
          changes?: string[];
        };
        if (Array.isArray(data.changes) && data.changes.length > 0) {
          setUpdateChanges(data.changes);
        }
        const remoteId = data.buildId || currentBuildId;
        setDetectedBuildId(remoteId);
        const seenId = window.localStorage.getItem(SEEN_BUILD_KEY);
        if (remoteId !== currentBuildId || seenId !== remoteId) {
          setUpdateBannerOpen(true);
        }
      } catch {
        // Fallback: проверим локальный seenId
        try {
          const seenId = window.localStorage.getItem(SEEN_BUILD_KEY);
          if (seenId !== currentBuildId) {
            setUpdateBannerOpen(true);
          }
        } catch {
          // ignore
        }
      }
    };

    checkRemoteVersion();
    const intervalId = window.setInterval(checkRemoteVersion, 20000);
    const onFocus = () => checkRemoteVersion();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkRemoteVersion();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentBuildId]);

  const handleDismissUpdateBanner = useCallback(() => {
    try {
      window.localStorage.setItem('borners_seen_build_id_v1', detectedBuildId);
    } catch {
      // ignore
    }
    setUpdateBannerOpen(false);
    setUpdateDetailsOpen(false);
  }, [detectedBuildId]);

  const handleApplySiteUpdate = useCallback(() => {
    try {
      window.localStorage.setItem('borners_seen_build_id_v1', detectedBuildId);
    } catch {
      // ignore
    }
    setUpdateBannerOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(Date.now()).slice(-6));
    window.location.replace(url.toString());
  }, [detectedBuildId]);

  const searchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const hasFin = canUserViewFinance(currentUser);

    const results: {
      id: string;
      category: string;
      title: string;
      subtitle: string;
      onSelect: () => void;
    }[] = [];

    // 0. Навигация по разделам платформы (CRM, Задачи, R&D, Каталог, Финансы, Документы и т.д.)
    const allSections: { id: NavSectionId; title: string; subtitle: string; keywords: string }[] = [
      {
        id: 'roadmap-tasks',
        title: 'CRM · Задачи и проекты',
        subtitle: 'Канбан-доска поручений, дедлайны и дорожная карта',
        keywords: 'crm задачи проекты канбан поручения дедлайн',
      },
      {
        id: 'product-lab',
        title: 'Лаборатория R&D (Product Lab)',
        subtitle: '7 этапов отбора от идеи до заказа фабрике',
        keywords: 'лаборатория r&d разработка концепты образцы',
      },
      {
        id: 'product-catalog',
        title: 'Каталог моделей и SKU',
        subtitle: 'Ассортиментная матрица 70/30 и юнит-экономика',
        keywords: 'каталог модели sku матрица ассортимент',
      },
      {
        id: 'launch-calendar',
        title: 'Календарь запусков',
        subtitle: 'График релизов коллекций и чек-листы готовности',
        keywords: 'календарь запуски релизы дропы',
      },
      {
        id: 'finance',
        title: 'Финансовая модель 2027 (P&L)',
        subtitle: '3 сценария, выручка, маржа и План / Факт',
        keywords: 'финансы финмодель p&l бюджет выручка прибыль',
      },
      {
        id: 'documents',
        title: 'Документы и ТЗ (PDF / Excel)',
        subtitle: 'Производственные спецификации, лекала и отчёты',
        keywords: 'документы тз спецификации лекала файлы pdf excel',
      },
      {
        id: 'brand-strategy',
        title: 'Стратегия брендов (14 блоков)',
        subtitle: 'ДНК брендов BORNERS и НА ТЕЛЕ',
        keywords: 'стратегия днк бренд позиционирование',
      },
      {
        id: 'market-intelligence',
        title: 'Рынок и конкуренты',
        subtitle: 'Досье конкурентов, цены и рыночные ниши',
        keywords: 'рынок конкуренты аналитика исследования',
      },
    ];

    for (const sec of allSections) {
      if (
        sec.title.toLowerCase().includes(q) ||
        sec.keywords.includes(q)
      ) {
        results.push({
          id: `sec-${sec.id}`,
          category: 'Раздел',
          title: sec.title,
          subtitle: sec.subtitle,
          onSelect: () => {
            setPlatformMode('management');
            navigateTo(sec.id);
            setGlobalSearchQuery('');
            setSearchModalOpen(false);
          },
        });
      }
    }

    // 1. Живые SKU портфеля 2027 (23 модели сценариев + WB артикулы)
    for (const m of livePortfolio.models) {
      if (m.launchStatus === 'В архиве') continue;
      const acting = getActingSkuByWbOrVendor(m.code, m.title);
      const portfolioBrand = detectModelBrandPortfolioLabel(m);
      const wbStr = acting ? `wb ${acting.wbSku}` : '';
      const brandRu = m.brandId === 'NA_TELE' ? 'на теле' : portfolioBrand.toLowerCase();
      if (
        m.code.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        m.subtitle.toLowerCase().includes(q) ||
        wbStr.includes(q) ||
        brandRu.includes(q)
      ) {
        const met = computeModelScenarioMetrics(m, livePortfolio.currentScenario);
        const displayCode = acting ? `WB ${acting.wbSku}` : m.code;
        results.push({
          id: `scen-sku-${m.id}`,
          category: 'SKU 2027',
          title: `${displayCode} — ${m.title}`,
          subtitle: `${portfolioBrand} · Дек: ${(met.targetMonthRevenueRub / 1_000_000)
            .toFixed(2)
            .replace('.', ',')} млн ₽ · 2027: ${(met.annualRevenueRub / 1_000_000)
            .toFixed(2)
            .replace('.', ',')} млн ₽`,
          onSelect: () => openScenarioSkuPassport(m.id, `${displayCode} — ${m.title}`),
        });
      }
    }

    for (const p of products) {
      if (p.isArchived) continue;
      const brandRu = p.brandId === 'NA_TELE' ? 'на теле' : 'borners';
      if (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        brandRu.includes(q)
      ) {
        results.push({
          id: `p-${p.id}`,
          category: 'Модель',
          title: `${p.sku} — ${p.name}`,
          subtitle: `${p.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : p.brandId} · ${p.collection}`,
          onSelect: () => {
            setPlatformMode('management');
            navigateTo('product-catalog', { productId: p.id, brandId: 'ALL' });
            setGlobalSearchQuery('');
            setSearchModalOpen(false);
            notify('success', `Открыта модель ${p.sku}`, p.name);
          },
        });
      }
    }

    for (const c of concepts) {
      if (c.isArchived) continue;
      const brandRu = c.brandId === 'NA_TELE' ? 'на теле' : 'borners';
      if (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        brandRu.includes(q)
      ) {
        results.push({
          id: `c-${c.id}`,
          category: 'R&D',
          title: `${c.code} — ${c.name}`,
          subtitle: `${CONCEPT_STAGE_LABELS_RU[c.stage]} · Запуск: ${c.targetLaunchDate}`,
          onSelect: () => {
            setPlatformMode('management');
            navigateTo('product-lab', { conceptId: c.id, brandId: 'ALL' });
            setGlobalSearchQuery('');
            setSearchModalOpen(false);
            notify('success', `Открыта разработка ${c.code}`, c.name);
          },
        });
      }
    }

    for (const l of launches) {
      if (l.isArchived) continue;
      if (l.name.toLowerCase().includes(q) || l.collectionName.toLowerCase().includes(q)) {
        results.push({
          id: `l-${l.id}`,
          category: 'Запуск',
          title: l.name,
          subtitle: `Старт: ${l.startDate} · Готовность ${l.readinessPct}%`,
          onSelect: () => {
            setPlatformMode('management');
            navigateTo('launch-calendar', { launchId: l.id, brandId: 'ALL' });
            setGlobalSearchQuery('');
            setSearchModalOpen(false);
            notify('success', 'Открыт релиз в календаре', l.name);
          },
        });
      }
    }

    for (const pr of projects) {
      if (pr.name.toLowerCase().includes(q)) {
        results.push({
          id: `pr-${pr.id}`,
          category: 'Проект CRM',
          title: pr.name,
          subtitle: `${pr.brandId} · ${pr.quarter}`,
          onSelect: () => {
            setPlatformMode('management');
            navigateTo('roadmap-tasks', { brandId: 'ALL' });
            setGlobalSearchQuery('');
            setSearchModalOpen(false);
          },
        });
      }
    }

    for (const t of tasks) {
      if (t.isArchived) continue;
      if (t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) {
        results.push({
          id: `t-${t.id}`,
          category: 'Задача CRM',
          title: t.title,
          subtitle: `${TASK_STATUS_LABELS_RU[t.status]} · до ${t.deadline}`,
          onSelect: () => {
            setPlatformMode('management');
            navigateTo('roadmap-tasks', { brandId: 'ALL' });
            setGlobalSearchQuery('');
            setSearchModalOpen(false);
            notify('success', 'Открыта доска CRM · Задачи', t.title);
          },
        });
      }
    }

    for (const d of documents) {
      if (d.isArchived) continue;
      if (d.isFinancialRestricted && !hasFin) continue;
      if (d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q)) {
        results.push({
          id: `d-${d.id}`,
          category: 'Документ',
          title: d.title,
          subtitle: `${d.fileName} (${d.category})`,
          onSelect: () => {
            setPlatformMode('management');
            navigateTo('documents', { brandId: 'ALL' });
            setGlobalSearchQuery('');
            setSearchModalOpen(false);
          },
        });
      }
    }

    for (const comp of competitors) {
      if (comp.brandName.toLowerCase().includes(q)) {
        results.push({
          id: `comp-${comp.id}`,
          category: 'Конкурент',
          title: comp.brandName,
          subtitle: comp.positioning,
          onSelect: () => {
            setPlatformMode('management');
            navigateTo('market-intelligence', { brandId: 'ALL' });
            setGlobalSearchQuery('');
            setSearchModalOpen(false);
          },
        });
      }
    }

    return results.slice(0, 14);
  }, [
    globalSearchQuery,
    currentUser,
    livePortfolio.models,
    livePortfolio.currentScenario,
    openScenarioSkuPassport,
    products,
    concepts,
    launches,
    projects,
    tasks,
    documents,
    competitors,
    navigateTo,
    setPlatformMode,
    notify,
  ]);

  if (!isAuthenticated) {
    return (
      <div>
        <div className="min-h-screen bg-[#F7F7F5] text-[#171717] flex items-center justify-center p-8">
          <div className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-2xl border border-[#E8E8E5] dark:border-zinc-800 p-10 space-y-8 shadow-xs">
            <div className="space-y-2 border-b border-[#E8E8E5] pb-6">
              <div className="text-[13px] font-medium uppercase tracking-widest text-[#737373]">
                BORNERS GROUP · 2026 / 2027
              </div>
              <h1 className="text-[32px] font-bold tracking-tight text-[#171717] dark:text-white">
                Вход в рабочую систему
              </h1>
            </div>

            <div className="divide-y divide-[#E8E8E5] dark:divide-zinc-800">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => loginAs(u.id)}
                  className="w-full py-5 px-4 text-left hover:bg-[#F7F7F5] dark:hover:bg-zinc-800 rounded-xl transition flex items-center justify-between cursor-pointer group"
                >
                  <div>
                    <div className="text-[18px] font-semibold text-[#171717] dark:text-zinc-100">
                      {u.fullName}
                    </div>
                    <div className="text-[14px] text-[#737373] mt-0.5">{u.jobTitle}</div>
                  </div>
                  <span className="text-[13px] font-medium text-[#171717] dark:text-zinc-300 bg-[#F7F7F5] border border-[#E8E8E5] rounded-lg px-3.5 py-1.5">
                    {ROLE_LABELS_RU[u.role]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const recentSections = useMemo(() => {
    const seen = new Set<NavSectionId>();
    const list: NavSectionId[] = [];
    for (let i = navHistory.length - 1; i >= 0; i--) {
      const sec = navHistory[i];
      if (!seen.has(sec) && canUserAccessSection(currentUser, sec)) {
        seen.add(sec);
        list.push(sec);
      }
      if (list.length >= 4) break;
    }
    return list;
  }, [navHistory, currentUser]);

  const activeProductsCount = useMemo(
    () => products.filter((p) => !p.isArchived).length,
    [products]
  );
  const activeConceptsCount = useMemo(
    () =>
      concepts.filter(
        (c) =>
          !c.isArchived &&
          !['REJECTED', 'CANCELLED', 'POSTPONED'].includes(c.stage)
      ).length,
    [concepts]
  );
  const openTasksCount = useMemo(
    () => tasks.filter((t) => !t.isArchived && t.status !== 'Done').length,
    [tasks]
  );
  const activeDocumentsCount = useMemo(
    () => documents.filter((d) => !d.isArchived).length,
    [documents]
  );

  const holdingSummary = useMemo(
    () =>
      computeMultiBrandPortfolioSummary(
        livePortfolio.models,
        livePortfolio.scenarios,
        livePortfolio.selectedScenarioByBrand
      ),
    [
      livePortfolio.models,
      livePortfolio.scenarios,
      livePortfolio.selectedScenarioByBrand,
    ]
  );

  const pipelineSteps = useMemo(() => {
    const finSection: NavSectionId = canUserAccessSection(currentUser, 'finance')
      ? 'finance'
      : 'documents';
    const isAllBrands = !brandFilter || brandFilter === 'ALL';
    const effectiveAnnualRub = isAllBrands
      ? holdingSummary.groupTotal.annualRevenueRub
      : livePortfolio.totals.annualRevenueRub;
    const effectiveModelsCount = isAllBrands
      ? holdingSummary.groupTotal.modelsCount
      : livePortfolio.eligibleModels.length;
    const annualMlnRounded = Math.round(effectiveAnnualRub / 1_000_000);

    return [
      {
        key: 'home',
        step: null as string | null,
        label: 'Главная',
        target: 'dashboard' as NavSectionId,
        isActive:
          platformMode === 'management' &&
          activeSection === 'dashboard' &&
          homeSubView === 'home',
        badge: null as string | null,
      },
      {
        key: 'summary',
        step: null as string | null,
        label: 'Сводка',
        target: 'dashboard' as NavSectionId,
        isActive:
          platformMode === 'management' &&
          ((activeSection === 'dashboard' && homeSubView === 'summary') ||
            activeSection === 'brand-strategy' ||
            activeSection === 'brand-portfolio'),
        badge: null as string | null,
      },
      {
        key: 'product',
        step: '01',
        label: 'Продукт',
        target: 'product-catalog' as NavSectionId,
        isActive:
          platformMode === 'management' &&
          (activeSection === 'product-catalog' || activeSection === 'product-lab'),
        badge: String(effectiveModelsCount),
      },
      {
        key: 'sales',
        step: '02',
        label: 'Продажи',
        target: 'launch-calendar' as NavSectionId,
        isActive:
          platformMode === 'management' &&
          (activeSection === 'launch-calendar' ||
            activeSection === 'marketing-growth'),
        badge: annualMlnRounded > 0 ? `${annualMlnRounded} млн` : null,
      },
      {
        key: 'procurement',
        step: '03',
        label: 'Закупки',
        target: 'roadmap-tasks' as NavSectionId,
        isActive:
          platformMode === 'management' && activeSection === 'roadmap-tasks',
        badge:
          livePortfolio.factoryGroupsCount > 0
            ? String(livePortfolio.factoryGroupsCount)
            : openTasksCount > 0
            ? String(openTasksCount)
            : null,
      },
      {
        key: 'finance',
        step: '04',
        label: canUserAccessSection(currentUser, 'finance')
          ? 'Финансы'
          : 'Документы',
        target: finSection,
        isActive:
          platformMode === 'management' &&
          (activeSection === 'finance' || activeSection === 'documents'),
        badge: null as string | null,
      },
    ].filter((s) => canUserAccessSection(currentUser, s.target));
  }, [
    activeSection,
    brandFilter,
    currentUser,
    holdingSummary.groupTotal.annualRevenueRub,
    holdingSummary.groupTotal.modelsCount,
    homeSubView,
    livePortfolio.eligibleModels.length,
    livePortfolio.factoryGroupsCount,
    livePortfolio.totals.annualRevenueRub,
    openTasksCount,
    platformMode,
  ]);

  return (
    <div>
      <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#0B0E14] text-[#0F172A] dark:text-[#EDF0F7] flex flex-col overflow-x-hidden transition-colors duration-200">
        {/* ОСНОВНАЯ ПОЛНОШИРИННАЯ ОБОЛОЧКА БЕЗ ЛЕВОЙ КОЛОНКИ (КОНЦЕПТ А: ЦЕПОЧКА ПОТОКА + БЕНТО-АТЛАС) */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-50 h-[56px] bg-white/95 dark:bg-[#121620]/95 backdrop-blur-md border-b border-[#E2E6EE] dark:border-[#222938] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
            {/* Левая группа: Медальон BORNERS + Назад/Вперёд + Переключатель бренда */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => handleGoHomeSummary('home')}
                title="Перейти на Главную страницу BORNERS GROUP"
                className="inline-flex items-center gap-2.5 pr-1 rounded-[10px] text-left cursor-pointer group shrink-0"
              >
                <span className="h-8.5 w-8.5 rounded-[9px] bg-[#F8FAFC] border border-[#E2E8F0] group-hover:border-[#94A3B8] flex items-center justify-center p-1 transition shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="./images/products/borners-lion-emblem.png"
                    alt="BORNERS"
                    className="h-full w-full object-contain"
                  />
                </span>
                <span className="hidden sm:flex flex-col">
                  <span className="text-[14.5px] font-bold tracking-[-0.02em] text-[#0F172A] leading-none">
                    BORNERS<sup className="text-[9px] font-semibold ml-0.5 text-[#64748B]">®</sup>
                  </span>
                  <span className="text-[9.5px] font-medium text-[#64748B] mt-0.5">
                    Strategy · 2027
                  </span>
                </span>
              </button>

              <div className="h-4 w-[1px] bg-[#E2E8F0] hidden sm:block" />

              {/* Кнопки Назад (←) и Вперёд (→) */}
              <div className="inline-flex items-center rounded-[8px] bg-[#F1F5F9] border border-[#E2E8F0] p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={!canGoBack}
                  title="Назад (свайп двумя пальцами влево или ⌘[)"
                  aria-label="Назад"
                  className={`inline-flex items-center justify-center h-7 w-7 rounded-[6px] transition ${
                    canGoBack
                      ? 'text-[#0F172A] hover:bg-white cursor-pointer'
                      : 'text-[#94A3B8] opacity-55 cursor-not-allowed'
                  }`}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={goForward}
                  disabled={!canGoForward}
                  title="Вперёд (свайп двумя пальцами вправо или ⌘])"
                  aria-label="Вперёд"
                  className={`inline-flex items-center justify-center h-7 w-7 rounded-[6px] transition ${
                    canGoForward
                      ? 'text-[#0F172A] hover:bg-white cursor-pointer'
                      : 'text-[#94A3B8] opacity-55 cursor-not-allowed'
                  }`}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {swipeFeedback && (
                <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-3.5 py-1.5 rounded-full bg-[#0F172A]/92 text-white text-[12px] font-semibold shadow-lg flex items-center gap-1.5">
                  {swipeFeedback === 'back' ? (
                    <>
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Назад</span>
                    </>
                  ) : (
                    <>
                      <span>Вперёд</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </div>
              )}

              {/* Переключатель бренда (чистая типографика без цветных точек) */}
              <div className="relative" data-tour="brand-switcher">
                <button
                  type="button"
                  onClick={() => setBrandDropdownOpen(!brandDropdownOpen)}
                  className="h-8.5 px-3 rounded-[9px] bg-white hover:border-[#94A3B8] border border-[#E2E8F0] text-[12.5px] text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer transition"
                >
                  <span className="font-semibold truncate max-w-[120px] sm:max-w-none">
                    {brandFilter === 'ALL'
                      ? 'Все бренды'
                      : brandFilter === 'NA_TELE'
                      ? 'НА ТЕЛЕ'
                      : brandFilter === 'FUKAI'
                      ? 'FUKAI'
                      : brandFilter === 'AKUSHA'
                      ? 'AKUSHA'
                      : brandFilter === 'LISKANI'
                      ? 'LISKANI'
                      : brands.find((b) => b.code === brandFilter || b.id === brandFilter)?.name ||
                        brandFilter}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-[#64748B]" />
                </button>

                {brandDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setBrandDropdownOpen(false)}
                    />
                    <div className="absolute left-0 mt-1.5 w-64 rounded-[14px] bg-white border border-[#E2E8F0] shadow-[0_16px_36px_rgba(15,23,42,0.1)] p-1.5 z-50 text-[12.5px] space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setBrandFilter('ALL');
                          setBrandDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-[8px] text-left flex items-center justify-between cursor-pointer ${
                          brandFilter === 'ALL'
                            ? 'bg-[#F1F5F9] text-[#111827] font-bold border border-[#CBD5E1]'
                            : 'text-[#1E293B] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <span>Все бренды</span>
                        <span
                          className={`font-mono text-[10px] ${
                            brandFilter === 'ALL' ? 'text-[#334155]' : 'text-[#64748B]'
                          }`}
                        >
                          Сводка группы
                        </span>
                      </button>

                      {[
                        { code: 'BORNERS', label: 'BORNERS', sub: 'Бельё · компл.' },
                        { code: 'FUKAI', label: 'FUKAI', sub: 'База WB · компл.' },
                        { code: 'AKUSHA', label: 'AKUSHA', sub: 'Обувь · пары' },
                        { code: 'LISKANI', label: 'LISKANI', sub: 'Шторы · компл.' },
                        { code: 'NA_TELE', label: 'НА ТЕЛЕ', sub: 'База и женское' },
                      ].map((bItem) => {
                        const isSelected = brandFilter === bItem.code;
                        return (
                          <button
                            key={bItem.code}
                            type="button"
                            onClick={() => {
                              if (
                                bItem.code === 'FUKAI' &&
                                livePortfolio.selectedScenarioId === 1 &&
                                !livePortfolio.includeGroupPortfolioInS1
                              ) {
                                livePortfolio.setIncludeGroupPortfolioInS1(true);
                              }
                              const brandScenId =
                                livePortfolio.selectedScenarioByBrand?.[
                                  bItem.code as 'BORNERS' | 'FUKAI' | 'AKUSHA' | 'LISKANI' | 'NA_TELE'
                                ];
                              if (typeof brandScenId === 'number') {
                                livePortfolio.setSelectedScenarioId(brandScenId);
                              }
                              setBrandFilter(bItem.code);
                              setBrandDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 rounded-[8px] text-left flex items-center justify-between cursor-pointer ${
                              isSelected
                                ? 'bg-[#F1F5F9] text-[#111827] font-bold border border-[#CBD5E1]'
                                : 'text-[#1E293B] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            <span>{bItem.label}</span>
                            <span
                              className={`font-mono text-[10px] ${
                                isSelected ? 'text-[#334155]' : 'text-[#64748B]'
                              }`}
                            >
                              {bItem.sub}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ЦЕНТР: ЦЕПОЧКА БИЗНЕС-ПОТОКА С ЧИСТОЙ БЕЛОЙ АКТИВНОЙ ВКЛАДКОЙ */}
            <nav
              aria-label="Цепочка контуров BORNERS"
              data-tour="sidebar-nav"
              className="hidden xl:flex items-center rounded-[11px] bg-[#EEF1F6] border border-[#D8DEE8] p-0.5 gap-0.5"
            >
              {pipelineSteps.map((item, idx) => (
                <React.Fragment key={item.key}>
                  {idx > 0 && (
                    <div className="h-3.5 w-[1px] bg-[#D8DEE8] mx-0.5 shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (item.key === 'home') {
                        handleGoHomeSummary('home');
                        return;
                      }
                      if (item.key === 'summary') {
                        handleGoHomeSummary('summary');
                        return;
                      }
                      setPlatformMode('management');
                      navigateTo(item.target);
                      setAtlasOpen(false);
                    }}
                    className={`h-7.5 px-3 rounded-[8px] text-[12px] inline-flex items-center gap-1.5 transition cursor-pointer ${
                      item.isActive
                        ? 'bg-white text-[#111827] font-bold shadow-[0_1px_3px_rgba(15,23,42,0.1)] border border-[#CBD5E1]'
                        : 'text-[#475569] hover:text-[#111827] hover:bg-white/60 font-semibold'
                    }`}
                  >
                    {item.step && (
                      <span
                        className={`font-mono text-[10.5px] ${
                          item.isActive ? 'text-[#111827]' : 'text-[#64748B]'
                        }`}
                      >
                        {item.step}
                      </span>
                    )}
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.2 rounded-[5px] ${
                          item.isActive
                            ? 'bg-[#F1F5F9] text-[#111827] border border-[#CBD5E1]'
                            : 'bg-white text-[#475569] border border-[#E2E8F0]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              ))}
            </nav>

            {/* Правая группа: Кнопка вызова Бенто-Атласа («Все разделы») + Поиск + Профиль без лишних иконок */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAtlasOpen((v) => !v)}
                aria-expanded={atlasOpen}
                className={`inline-flex items-center gap-1.5 h-8.5 px-3.5 rounded-[9px] border text-[12.5px] font-bold transition cursor-pointer ${
                  atlasOpen
                    ? 'bg-[#F1F5F9] text-[#111827] border-[#94A3B8]'
                    : 'bg-white hover:border-[#94A3B8] text-[#1E293B] border-[#E2E8F0]'
                }`}
              >
                <span>Все разделы</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    atlasOpen ? 'rotate-180 text-[#111827]' : 'text-[#64748B]'
                  }`}
                />
              </button>

              {/* Поиск SKU и задач — чистый текст + хоткей без лишнего значка лупы */}
              <button
                type="button"
                onClick={() => {
                  setAtlasOpen(false);
                  setSearchModalOpen(true);
                }}
                aria-label="Глобальный поиск"
                className="inline-flex items-center gap-1.5 h-8.5 rounded-[9px] bg-white dark:bg-[#181D2A] hover:border-[#94A3B8] border border-[#E2E8F0] dark:border-[#222938] px-3 text-[12px] font-semibold text-[#1E293B] dark:text-[#EDF0F7] transition cursor-pointer"
              >
                <span>Поиск</span>
                <span className="hidden md:inline font-mono text-[10px] text-[#64748B] px-1 py-0.2 rounded bg-[#F1F5F9] dark:bg-[#121620] border border-[#E2E8F0] dark:border-[#222938]">
                  ⌘K
                </span>
              </button>

              {/* Переключатель темы (Светлая / Тёмный обсидиан) */}
              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                title={darkMode ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
                aria-label={darkMode ? 'Светлая тема' : 'Тёмная тема'}
                className="inline-flex items-center justify-center h-8.5 w-8.5 rounded-[9px] bg-white dark:bg-[#181D2A] hover:border-[#94A3B8] border border-[#E2E8F0] dark:border-[#222938] text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white transition cursor-pointer"
              >
                {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
              </button>

              {/* Профиль и системное меню */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="inline-flex items-center gap-2 h-8.5 rounded-[9px] bg-white hover:border-[#94A3B8] border border-[#E2E8F0] pl-2 pr-2.5 text-[12.5px] font-semibold cursor-pointer transition"
                >
                  <span className="h-5 w-5 rounded-[5px] bg-[#F1F5F9] text-[#334155] border border-[#CBD5E1] flex items-center justify-center font-mono text-[10px] font-bold">
                    {currentUser.avatarInitials}
                  </span>
                  <span className="hidden sm:inline text-[#1E293B]">
                    {ROLE_LABELS_RU[currentUser.role]}
                  </span>
                </button>

                {profileMenuOpen && (
                  <>
                    <div
                      onClick={() => setProfileMenuOpen(false)}
                      className="fixed inset-0 z-40"
                    />
                    <div className="absolute right-0 mt-1.5 w-76 bg-white rounded-[16px] border-[1.5px] border-[#141413] shadow-[0_18px_48px_rgba(20,20,19,0.16)] p-4 z-50 text-[13px] space-y-3">
                      <div className="border-b border-[#ECEBE6] pb-3">
                        <div className="font-semibold text-[15px] text-[#141413]">
                          {currentUser.fullName}
                        </div>
                        <div className="text-[12px] text-[#686762] mt-0.5">
                          {currentUser.jobTitle} · {ROLE_LABELS_RU[currentUser.role]}
                        </div>
                      </div>

                      {/* Быстрые сервисные действия */}
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setPlatformMode(
                              platformMode === 'strategy' ? 'management' : 'strategy'
                            );
                          }}
                          className="w-full px-3 py-2 rounded-[9px] hover:bg-[#F6F6F4] flex items-center justify-between text-left text-[#141413] cursor-pointer"
                        >
                          <span>Режим презентации слайдов</span>
                          <span className="text-[11px] font-semibold text-[#686762]">
                            {platformMode === 'strategy' ? 'Включён' : 'Выкл'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setTourStepIdx(0);
                            setTourModalOpen(true);
                          }}
                          className="w-full px-3 py-2 rounded-[9px] hover:bg-[#F6F6F4] flex items-center justify-between text-left text-[#141413] cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5 text-[#686762]" />
                            <span>Гид по платформе</span>
                          </span>
                          <span className="text-[11px] text-[#8A8983]">5 шагов</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setDraftAdminModalOpen(true);
                          }}
                          className="w-full px-3 py-2 rounded-[9px] hover:bg-[#F6F6F4] flex items-center justify-between text-left text-[#141413] cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Settings className="h-3.5 w-3.5 text-[#686762]" />
                            <span>Черновик разделов</span>
                          </span>
                          <span className="font-mono text-[11px] text-[#686762]">
                            {enabledDraftCount}/{totalDraftCount}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            setTrashModalOpen(true);
                          }}
                          className="w-full px-3 py-2 rounded-[9px] hover:bg-[#F6F6F4] flex items-center justify-between text-left text-[#141413] cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Trash2 className="h-3.5 w-3.5 text-[#686762]" />
                            <span>Корзина удалений</span>
                          </span>
                          <span className="font-mono text-[11px] text-[#686762]">
                            {trashItems.length}
                          </span>
                        </button>

                        {/* Раздел 10.5 ТЗ: Резервная копия всех данных BORNERS GROUP */}
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const payload = {
                                backupVersion: '2026-11-08-v1',
                                exportedAt: new Date().toISOString(),
                                scenarios: livePortfolio.scenarios,
                                models: livePortfolio.models,
                                selectedScenarioByBrand: livePortfolio.selectedScenarioByBrand,
                              };
                              const blob = new Blob([JSON.stringify(payload, null, 2)], {
                                type: 'application/json;charset=utf-8',
                              });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `BORNERS_GROUP_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                              setProfileMenuOpen(false);
                              notify(
                                'success',
                                '✓ Резервная копия сохранена',
                                'Выгружены все бренды, карточки, фотографии, сценарии 2027–2028 и утверждённые заказы фабрикам.'
                              );
                            } catch {
                              notify('error', 'Ошибка сохранения резервной копии');
                            }
                          }}
                          className="w-full px-3 py-2 rounded-[9px] hover:bg-[#F6F6F4] flex items-center justify-between text-left text-[#141413] cursor-pointer"
                        >
                          <span>Скачать резервную копию (JSON)</span>
                          <span className="font-mono text-[10.5px] text-emerald-700 font-semibold">
                            Сохранено
                          </span>
                        </button>
                      </div>

                      {/* Проверка роли доступа */}
                      <div className="pt-2.5 border-t border-[#ECEBE6] space-y-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8A8983] px-1 mb-1">
                          Роль доступа
                        </div>
                        {users.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              loginAs(u.id);
                              setProfileMenuOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 rounded-[8px] flex items-center justify-between cursor-pointer text-[12.5px] ${
                              u.id === currentUser.id
                                ? 'bg-[#141413] text-white font-semibold'
                                : 'text-[#141413] hover:bg-[#F6F6F4]'
                            }`}
                          >
                            <span className="truncate pr-2">{u.fullName}</span>
                            <span
                              className={`text-[11.5px] shrink-0 ${
                                u.id === currentUser.id
                                  ? 'text-white/75'
                                  : 'text-[#8A8983]'
                              }`}
                            >
                              {ROLE_LABELS_RU[u.role]}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="pt-2.5 border-t border-[#ECEBE6]">
                        <button
                          type="button"
                          onClick={() => {
                            setProfileMenuOpen(false);
                            logout();
                          }}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-[9px] border border-[#E5E4DF] hover:bg-[#FEF2F2] hover:border-[#FCA5A5] hover:text-[#B91C1C] text-[#141413] py-2 font-semibold transition cursor-pointer text-[12.5px]"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          <span>Выйти из профиля</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* ВЫПАДАЮЩИЙ 4-КОЛОНОЧНЫЙ БЕНТО-АТЛАС РАЗДЕЛОВ */}
          <BentoAtlasNav
            open={atlasOpen}
            onClose={() => setAtlasOpen(false)}
            activeSection={activeSection}
            platformMode={platformMode}
            onSelectSection={(sec) => {
              if (sec === 'dashboard') {
                handleGoHomeSummary();
                return;
              }
              navigateTo(sec);
            }}
            onSetPlatformMode={setPlatformMode}
            currentUser={currentUser}
            recentSections={recentSections}
            productsCount={activeProductsCount}
            activeConceptsCount={activeConceptsCount}
            openTasksCount={openTasksCount}
            documentsCount={activeDocumentsCount}
            usersCount={users.length}
            trashCount={trashItems.length}
            draftModules={draftModules}
            enabledDraftCount={enabledDraftCount}
            totalDraftCount={totalDraftCount}
            onOpenTour={() => {
              setTourStepIdx(0);
              setTourModalOpen(true);
            }}
            onOpenDraftAdmin={() => setDraftAdminModalOpen(true)}
            onOpenTrash={() => setTrashModalOpen(true)}
          />

          {/* РАБОЧАЯ ОБЛАСТЬ КОНТЕНТА (полная ширина + спокойный воздух) */}
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 md:py-7 max-w-[1600px] w-full mx-auto space-y-6">
            {/* Режим интерактивной презентации стратегии (8 слайдов + лонгрид + весь экран) */}
            {platformMode === 'strategy' ? (
              <StrategyPresentationDeck
                onExitPresentation={() => setPlatformMode('management')}
              />
            ) : (
              <>
                {activeSection === 'dashboard' && <DashboardView />}
                {activeSection === 'brand-portfolio' && <BrandPortfolioView />}
                {activeSection === 'brand-strategy' && <BrandStrategyView />}
                {activeSection === 'market-intelligence' && <MarketIntelligenceView />}
                {activeSection === 'product-catalog' && <ProductCatalogView />}
                {activeSection === 'product-lab' && <ProductLabView />}
                {activeSection === 'marketing-growth' && <MarketingGrowthView />}
                {activeSection === 'launch-calendar' && (
                  <div className="space-y-5">
                    {draftModules.legacyReleaseCalendar && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-white border border-[#E6E0D4] px-4 py-2.5">
                        <div className="inline-flex rounded-[10px] bg-[#FAF8F4] p-1 border border-[#E6E0D4]">
                          <button
                            type="button"
                            onClick={() => setSalesPlanSubTab('sales-plan')}
                            className={`h-8 px-3.5 rounded-[8px] text-[12.5px] font-semibold transition cursor-pointer ${
                              salesPlanSubTab === 'sales-plan'
                                ? 'bg-[#1D1D1F] text-white'
                                : 'text-[#5A564F] hover:text-[#1D1D1F]'
                            }`}
                          >
                            План продаж и производства (по моделям 2027)
                          </button>
                          <button
                            type="button"
                            onClick={() => setSalesPlanSubTab('legacy-calendar')}
                            className={`h-8 px-3.5 rounded-[8px] text-[12.5px] font-semibold transition cursor-pointer ${
                              salesPlanSubTab === 'legacy-calendar'
                                ? 'bg-[#1D1D1F] text-white'
                                : 'text-[#5A564F] hover:text-[#1D1D1F]'
                            }`}
                          >
                            Календарь релизов и чек-листов (Черновик)
                          </button>
                        </div>
                      </div>
                    )}

                    {salesPlanSubTab === 'legacy-calendar' &&
                    draftModules.legacyReleaseCalendar ? (
                      <LaunchCalendarView />
                    ) : (
                      <SalesMatrixContourView />
                    )}
                  </div>
                )}
                {activeSection === 'finance' && <FinanceContourView />}
                {activeSection === 'roadmap-tasks' && <ProcurementContourView />}
                {activeSection === 'documents' && <DocumentsView />}
                {activeSection === 'team' && <TeamView />}
                {activeSection === 'settings' && <SettingsView />}
              </>
            )}
          </main>
        </div>

        {/* МОДАЛЬНОЕ ОКНО ПОИСКА И БЫСТРЫХ ДЕЙСТВИЙ (⌘K) */}
        {searchModalOpen && (
          <div
            onClick={() => setSearchModalOpen(false)}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-20 p-4 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-white rounded-[18px] border-[1.5px] border-[#141413] shadow-[0_24px_60px_rgba(20,20,19,0.22)] overflow-hidden"
            >
              <div className="flex items-center gap-3 border-b-[1.5px] border-[#141413] px-5 py-3.5 bg-[#F5F5F1]">
                <Search className="h-4.5 w-4.5 text-[#141413] shrink-0" />
                <input
                  autoFocus
                  value={globalSearchQuery}
                  onChange={(e) => setGlobalSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchResults.length > 0) {
                      e.preventDefault();
                      searchResults[0].onSelect();
                    } else if (e.key === 'Escape') {
                      setSearchModalOpen(false);
                    }
                  }}
                  placeholder="Артикул WB (244995893), SORBET CLUB, FUKAI, НА ТЕЛЕ или раздел..."
                  className="flex-1 bg-transparent text-[15px] font-medium outline-none text-[#141413] placeholder:text-[#7E7D77]"
                />
                <button
                  type="button"
                  onClick={() => setSearchModalOpen(false)}
                  className="rounded-[7px] border-[1.5px] border-[#CECDC4] bg-white px-2.5 py-1 text-[11px] font-bold text-[#3F3E3A] hover:border-[#141413] hover:text-[#141413] cursor-pointer"
                >
                  ESC
                </button>
              </div>

              <div className="max-h-[440px] overflow-y-auto divide-y divide-[#E4E3DC] p-2">
                {searchResults.map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      res.onSelect();
                    }}
                    onClick={res.onSelect}
                    className="w-full text-left px-4 py-3 rounded-[11px] hover:bg-[#F5F5F1] cursor-pointer flex items-center justify-between gap-4 transition group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10.5px] font-mono font-bold uppercase px-2 py-0.5 rounded-[5px] border shrink-0 ${
                            res.category === 'SKU 2027'
                              ? 'bg-[#141413] text-white border-[#141413]'
                              : 'bg-[#F4F4F0] text-[#141413] border-[#CECDC4]'
                          }`}
                        >
                          {res.category}
                        </span>
                        <span className="text-[14px] font-bold text-[#141413] group-hover:underline truncate">
                          {res.title}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#5E5D58] mt-0.5 truncate">
                        {res.subtitle}
                      </div>
                    </div>
                    <span className="text-[12px] font-semibold text-[#141413] shrink-0 px-3 py-1 rounded-[7px] bg-white group-hover:bg-[#141413] group-hover:text-white border-[1.5px] border-[#CECDC4] group-hover:border-[#141413] transition">
                      Открыть →
                    </span>
                  </button>
                ))}

                {globalSearchQuery && searchResults.length === 0 && (
                  <div className="py-12 text-center text-[14px] text-[#5E5D58]">
                    Ничего не найдено по запросу «{globalSearchQuery}»
                  </div>
                )}

                {!globalSearchQuery && (
                  <div className="p-3.5 space-y-4">
                    <div className="space-y-2">
                      <div className="text-[11px] font-mono font-bold uppercase tracking-[0.06em] text-[#5E5D58]">
                        Контуры 2027 · Быстрый переход
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { id: 'dashboard' as const, label: 'Сводка сценариев' },
                          { id: 'launch-calendar' as const, label: '02 · Матрица 12 мес.' },
                          { id: 'roadmap-tasks' as const, label: '03 · Партии и PO' },
                          { id: 'finance' as const, label: '04 · P&L и капитал' },
                          { id: 'product-lab' as const, label: 'Лаборатория R&D' },
                          { id: 'documents' as const, label: 'Документы и ТЗ PDF' },
                        ].map((sec) => (
                          <button
                            key={sec.id}
                            type="button"
                            onClick={() => {
                              setPlatformMode('management');
                              navigateTo(sec.id);
                              setSearchModalOpen(false);
                            }}
                            className="px-3 py-2 rounded-[9px] border-[1.5px] border-[#CECDC4] hover:border-[#141413] bg-[#F7F7F4] hover:bg-white text-left text-[12.5px] font-semibold text-[#141413] transition cursor-pointer"
                          >
                            {sec.label} →
                          </button>
                        ))}
                      </div>
                    </div>

                    {topScenarioDrivers.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-[#E4E3DC]">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono font-bold uppercase tracking-[0.06em] text-[#5E5D58]">
                            Топ-5 драйверов выручки · {livePortfolio.currentScenario.title}
                          </span>
                          <span className="text-[11px] text-[#5E5D58]">
                            Паспорт SKU в 1 клик
                          </span>
                        </div>
                        <div className="divide-y divide-[#ECEBE4] rounded-[11px] border-[1.5px] border-[#CECDC4] overflow-hidden bg-white">
                          {topScenarioDrivers.map((m) => {
                            const acting = getActingSkuByWbOrVendor(m.code, m.title);
                            const met = computeModelScenarioMetrics(
                              m,
                              livePortfolio.currentScenario
                            );
                            const displayCode = acting ? `WB ${acting.wbSku}` : m.code;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() =>
                                  openScenarioSkuPassport(
                                    m.id,
                                    `${displayCode} — ${m.title}`
                                  )
                                }
                                className="w-full px-3.5 py-2.5 hover:bg-[#F5F5F1] flex items-center justify-between gap-3 text-left transition cursor-pointer"
                              >
                                <div className="min-w-0 flex items-center gap-2">
                                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-[5px] bg-[#F4F4F0] border border-[#CECDC4] text-[#141413] shrink-0">
                                    {displayCode}
                                  </span>
                                  <span className="text-[13px] font-bold text-[#141413] truncate">
                                    {m.title}
                                  </span>
                                </div>
                                <span className="font-mono text-[12px] font-bold text-[#157347] shrink-0">
                                  {(met.targetMonthRevenueRub / 1_000_000)
                                    .toFixed(2)
                                    .replace('.', ',')}{' '}
                                  млн ₽/дек
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* КОРЗИНА УДАЛЕНИЙ (ВОССТАНОВЛЕНИЕ ИЛИ ОКОНЧАТЕЛЬНОЕ УДАЛЕНИЕ) */}
        {trashModalOpen && (
          <div
            onClick={() => setTrashModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-white rounded-2xl border-[1.5px] border-[#181715] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-4 border-b-2 border-[#181715] bg-[#FAF8F5] flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Trash2 className="h-5 w-5 text-[#B85D35]" />
                  <div>
                    <h3 className="text-[19px] font-bold text-[#181715]">
                      Корзина удалений ({trashItems.length})
                    </h3>
                    <p className="text-[12.5px] text-[#5C5852]">
                      Случайно удалённые разработки R&amp;D, модели SKU, релизы, задачи и документы можно вернуть в 1 клик
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTrashModalOpen(false)}
                  className="h-9 px-3.5 rounded-[8px] border-[1.5px] border-[#CFC8BC] bg-white hover:border-[#181715] text-[12.5px] font-semibold text-[#181715] cursor-pointer"
                >
                  Закрыть
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {trashItems.length === 0 ? (
                  <div className="py-12 text-center space-y-2 rounded-xl border-[1.5px] border-dashed border-[#D4CDC2] bg-[#FAF8F5]">
                    <div className="text-[16px] font-semibold text-[#181715]">
                      Корзина удалений пуста
                    </div>
                    <div className="text-[13px] text-[#6E6A63]">
                      Все карточки разработок R&amp;D, модели каталога, запуски и задачи находятся в рабочем контуре
                    </div>
                  </div>
                ) : (
                  trashItems.map((item) => (
                    <div
                      key={`${item.entityType}-${item.id}`}
                      className="rounded-xl border-[1.5px] border-[#D4CDC2] bg-[#FAF8F5] p-4 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="inline-flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-[4px] bg-white border border-[#CFC8BC] font-mono text-[10.5px] font-semibold uppercase text-[#B85D35]">
                            {item.typeLabel}
                          </span>
                        </div>
                        <div className="text-[15px] font-bold text-[#181715] truncate">
                          {item.title}
                        </div>
                        <div className="text-[12.5px] text-[#6E6A63] truncate">
                          {item.subtitle}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => restoreEntity(item.entityType, item.id)}
                          className="h-9 px-3.5 rounded-[8px] bg-[#1F6E50] hover:bg-[#17563E] text-white text-[12.5px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Восстановить</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => permanentlyDeleteEntity(item.entityType, item.id)}
                          className="h-9 px-3 rounded-[8px] border border-[#C94B4B]/40 hover:bg-[#C94B4B] text-[#C94B4B] hover:text-white text-[12px] font-semibold transition cursor-pointer"
                        >
                          Удалить навсегда
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {trashItems.length > 0 && (
                <div className="px-6 py-3.5 border-t-[1.5px] border-[#D4CDC2] bg-[#FAF8F5] flex items-center justify-between">
                  <span className="text-[12.5px] text-[#5C5852]">
                    Нажмите на пустое место вокруг окна, чтобы закрыть корзину
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Очистить корзину удалений безвозвратно?')) {
                        emptyTrash();
                      }
                    }}
                    className="h-9 px-4 rounded-[8px] border border-[#C94B4B] text-[#C94B4B] hover:bg-[#C94B4B] hover:text-white text-[12.5px] font-semibold transition cursor-pointer"
                  >
                    Очистить всю корзину
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* МОДАЛЬНОЕ ОКНО АДМИНКИ: ЧЕРНОВИК РАЗДЕЛОВ И ИНСТРУМЕНТОВ */}
        {draftAdminModalOpen && (
          <div
            onClick={() => setDraftAdminModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl bg-white rounded-2xl border-[1.5px] border-[#181715] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
            >
              <div className="px-6 py-4 border-b-2 border-[#181715] bg-[#FAF8F5] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#3D546C] text-[#F3DAB6] flex items-center justify-center shrink-0">
                    <Settings className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#B85D35]">
                      АДМИНКА · УПРАВЛЕНИЕ ВИДИМОСТЬЮ ({enabledDraftCount} ИЗ {totalDraftCount} ВКЛЮЧЕНО)
                    </div>
                    <h3 className="text-[19px] font-bold text-[#181715]">
                      Черновик разделов и дополнительных инструментов
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDraftAdminModalOpen(false)}
                  className="h-9 px-3.5 rounded-[8px] border-[1.5px] border-[#CFC8BC] bg-white hover:border-[#181715] text-[12.5px] font-semibold text-[#181715] cursor-pointer"
                >
                  Готово
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="rounded-xl bg-[#F6F3EC] border border-[#E5DEC9] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5 max-w-xl">
                    <div className="text-[13.5px] font-bold text-[#181715]">
                      Чистый рабочий режим: 7 ключевых разделов по умолчанию
                    </div>
                    <div className="text-[12.5px] text-[#5C5852]">
                      Оставлены: Главная, Сценарии роста, Модели (SKU), План продаж, Производство, Закупки и Документы. Скрытые разделы ниже находятся в черновике — их можно вернуть в боковое меню или открыть в 1 клик.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setAllDraftModules(true);
                        notify('success', 'Все инструменты из черновика возвращены в меню');
                      }}
                      className="h-8 px-3 rounded-[8px] bg-[#181715] text-white text-[12px] font-semibold hover:bg-[#2C2B29] transition cursor-pointer"
                    >
                      Вернуть все ({totalDraftCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAllDraftModules(false);
                        notify('success', 'Дополнительные инструменты скрыты обратно в черновик');
                      }}
                      className="h-8 px-3 rounded-[8px] bg-white border border-[#CFC8BC] text-[#181715] text-[12px] font-semibold hover:border-[#181715] transition cursor-pointer"
                    >
                      Скрыть всё в черновик
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {DRAFT_MODULES_META.map((item) => {
                    const isEnabled = draftModules[item.key];
                    return (
                      <div
                        key={item.key}
                        className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition ${
                          isEnabled
                            ? 'bg-[#F4F9F6] border-[#1F6E50]/45'
                            : 'bg-[#FAF8F5] border-[#E2DBD0]'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-white border border-[#DED8CD] text-[#6E6A63] font-semibold">
                              {item.badge}
                            </span>
                            <span
                              className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                                isEnabled
                                  ? 'bg-[#1F6E50] text-white'
                                  : 'bg-[#EAE4D8] text-[#6E6A63]'
                              }`}
                            >
                              {isEnabled ? 'Включено в меню' : 'Скрыто в черновике'}
                            </span>
                          </div>
                          <div className="text-[14.5px] font-bold text-[#181715]">
                            {item.title}
                          </div>
                          <div className="text-[12px] text-[#5C5852] leading-snug">
                            {item.subtitle}
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-[#E6E0D4] flex items-center justify-between gap-2">
                          {item.sectionId ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPlatformMode('management');
                                if (item.key === 'legacyReleaseCalendar') {
                                  toggleDraftModule('legacyReleaseCalendar');
                                  setSalesPlanSubTab('legacy-calendar');
                                }
                                navigateTo(item.sectionId!);
                                setDraftAdminModalOpen(false);
                              }}
                              className="text-[12px] font-semibold text-[#B85D35] hover:underline cursor-pointer"
                            >
                              Открыть сейчас →
                            </button>
                          ) : item.key === 'strategyPresentationCard' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPlatformMode('strategy');
                                setDraftAdminModalOpen(false);
                              }}
                              className="text-[12px] font-semibold text-[#B85D35] hover:underline cursor-pointer"
                            >
                              Запустить слайды →
                            </button>
                          ) : (
                            <span />
                          )}

                          <button
                            type="button"
                            onClick={() => toggleDraftModule(item.key)}
                            className={`h-8 px-3.5 rounded-[8px] text-[12px] font-semibold transition cursor-pointer ${
                              isEnabled
                                ? 'bg-[#1F6E50] text-white hover:bg-[#17563E]'
                                : 'bg-white border border-[#CFC8BC] text-[#181715] hover:border-[#181715]'
                            }`}
                          >
                            {isEnabled ? 'Убрать в черновик' : 'Вернуть в меню'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ИНТЕРАКТИВНЫЙ ОНБОРДИНГ-ГИД С ВЫРЕЗКОЙ ЭЛЕМЕНТОВ В СТИЛЕ PEAKLY */}
        <PeaklySpotlightTour
          open={tourModalOpen}
          stepIdx={tourStepIdx}
          setStepIdx={setTourStepIdx}
          onClose={() => setTourModalOpen(false)}
          activeSection={activeSection}
          onNavigateSection={(sec) => {
            setPlatformMode('management');
            navigateTo(sec);
          }}
        />

        {/* УВЕДОМЛЕНИЕ О НОВОЙ ВЕРСИИ САЙТА В СТИЛЕ PEAKLY («BORNERS обновился · НОВОЕ») */}
        {updateBannerOpen && (
          <div className="fixed bottom-5 left-5 z-50 w-[392px] max-w-[calc(100vw-2rem)]">
            <div className="relative overflow-hidden rounded-[22px] border border-[#DCE0E8] bg-white pl-5 pr-4 pt-4 pb-4 shadow-[0_14px_38px_rgba(15,23,42,0.12)]">
              {/* Тёмно-синяя акцентная полоска слева как в Peakly */}
              <div className="absolute left-0 top-3.5 bottom-3.5 w-[5px] rounded-r-full bg-[#141A29]" />

              <div className="flex items-start gap-3.5">
                <div className="h-12 w-12 shrink-0 rounded-[15px] bg-[#EEF0F5] flex items-center justify-center text-[#1E2638]">
                  <Sparkles className="h-5 w-5 stroke-[1.8]" />
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[16.5px] font-bold tracking-[-0.015em] text-[#0F141C]">
                        BORNERS обновился
                      </span>
                      <span className="rounded-full bg-[#EEF0F5] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#263042]">
                        НОВОЕ
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleDismissUpdateBanner}
                      aria-label="Закрыть уведомление об обновлении"
                      className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-[#4A5568] hover:bg-[#F1F5F9] hover:text-[#0F141C] transition cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="mt-1 text-[13.5px] leading-[1.35] text-[#4A5568]">
                    Выпустили техническое обновление. Обновите страницу, чтобы применить свежую версию.
                  </p>
                </div>
              </div>

              {updateDetailsOpen && (
                <div className="mt-3.5 rounded-[14px] border border-[#E2E6EE] bg-[#F8FAFC] p-3 text-[12px] text-[#334155] space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#0F141C]">
                    Что вошло в обновление:
                  </div>
                  <ul className="space-y-1 list-disc pl-4">
                    {updateChanges.map((item, idx) => (
                      <li key={idx} className="leading-snug">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setUpdateDetailsOpen((v) => !v)}
                  className="h-11 rounded-full bg-[#0F141C] hover:bg-[#1E2638] text-white text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <span>{updateDetailsOpen ? 'Скрыть детали' : 'Что нового'}</span>
                  <ArrowRight
                    className={`h-4 w-4 transition-transform ${
                      updateDetailsOpen ? '-rotate-90' : ''
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={handleApplySiteUpdate}
                  className="h-11 rounded-full bg-white hover:bg-[#F8FAFC] border border-[#CFD6E0] text-[#0F141C] text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Обновить</span>
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 max-w-[340px] w-auto pointer-events-none">
          {toasts.map((t) => {
            const isWarn = t.type === 'warning';
            const isErr = t.type === 'error';
            return (
              <div
                key={t.id}
                className="pointer-events-auto bg-white/95 backdrop-blur-md text-[#141413] rounded-[12px] border border-[#D5D4CC] shadow-[0_8px_24px_-4px_rgba(20,20,19,0.09),0_2px_6px_-1px_rgba(20,20,19,0.04)] px-3.5 py-2.5 flex items-start gap-2.5 transition-all"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    isErr
                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                      : isWarn
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {isErr ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : isWarn ? (
                    <AlertTriangle className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3 stroke-[2.5]" />
                  )}
                </span>
                <div className="min-w-0 flex-1 pr-1">
                  <div className="font-bold text-[12.5px] text-[#141413] leading-snug">
                    {t.title}
                  </div>
                  {t.description && (
                    <div className="text-[#686760] text-[11.5px] leading-snug mt-0.5 line-clamp-2">
                      {t.description}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Закрыть уведомление"
                  onClick={() => dismissToast(t.id)}
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[#8E8D85] hover:bg-[#F4F3EE] hover:text-[#141413] transition cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
