'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import { MiroBoardView } from './MiroBoardView';
import { GrowthScenariosShowcase } from './GrowthScenariosShowcase';
import { useDraftModules } from '@/lib/draftModules';
import {
  SCENARIO_LABELS_RU,
  SEVEN_KANBAN_STAGES,
  CONCEPT_STAGE_LABELS_RU,
  TASK_PRIORITY_LABELS_RU,
  TASK_STATUS_LABELS_RU,
  calculatePlanFactVariance,
  calculateUnitEconomics,
  canUserEditBrand,
  canUserViewCostPrice,
  canUserViewFinance,
  formatCompactRub,
  normalizeConceptStageToSeven,
} from '@/lib/finance';
import { TaskStatus } from '@/types/platform';
import { formatLabBrandLabel, normalizeLabBrandCode } from '@/lib/rndCatalogSync';
import { resolvePublicAssetUrl } from '@/lib/scenarioData';
import { safeGetStorageJson } from '@/lib/safeStorage';
import { computeMultiBrandPortfolioSummary } from '@/lib/unifiedBusinessEngine';
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';

export function DashboardView() {
  const {
    brands,
    products,
    concepts,
    launches,
    tasks,
    users,
    financialPlans,
    currentUser,
    brandFilter,
    setBrandFilter,
    setPlatformMode,
    financialScenario,
    updateTaskStatus,
    navigateTo,
  } = usePlatform();

  const [chartMetric, setChartMetric] = useState<'revenue' | 'profit'>('revenue');
  const [dashboardMode, setDashboardMode] = useState<'all' | 'miro'>('all');
  const { draftModules } = useDraftModules();
  const { models: liveModels, scenarios: liveScenarios, selectedScenarioByBrand } =
    useLiveScenarioPortfolio();

  const [financeParams, setFinanceParams] = useState<{
    initialCashMln: number;
    wbLagMonths: number;
  }>(() => {
    const saved = safeGetStorageJson<{ initialCashMln?: number; wbLagMonths?: number }>(
      'borners_finance_contour_params_v1'
    );
    return {
      initialCashMln: typeof saved?.initialCashMln === 'number' ? saved.initialCashMln : 0,
      wbLagMonths: typeof saved?.wbLagMonths === 'number' ? saved.wbLagMonths : 0,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFinanceParams = () => {
      const saved = safeGetStorageJson<{ initialCashMln?: number; wbLagMonths?: number }>(
        'borners_finance_contour_params_v1'
      );
      const nextCash = typeof saved?.initialCashMln === 'number' ? saved.initialCashMln : 0;
      const nextLag = typeof saved?.wbLagMonths === 'number' ? saved.wbLagMonths : 0;
      setFinanceParams((prev) =>
        prev.initialCashMln === nextCash && prev.wbLagMonths === nextLag
          ? prev
          : { initialCashMln: nextCash, wbLagMonths: nextLag }
      );
    };
    window.addEventListener('borners-finance-params-changed', syncFinanceParams);
    window.addEventListener('storage', syncFinanceParams);
    return () => {
      window.removeEventListener('borners-finance-params-changed', syncFinanceParams);
      window.removeEventListener('storage', syncFinanceParams);
    };
  }, []);

  const livePortfolioCashflowSummary = useMemo(
    () =>
      computeMultiBrandPortfolioSummary(liveModels, liveScenarios, selectedScenarioByBrand, {
        initialCashRub: Math.round((Number(financeParams.initialCashMln) || 0) * 1_000_000),
        settlementLagMonths: financeParams.wbLagMonths < 0 ? null : financeParams.wbLagMonths,
        wbPayoutScheduleSpecified: financeParams.wbLagMonths >= 0,
      }),
    [
      liveModels,
      liveScenarios,
      selectedScenarioByBrand,
      financeParams.initialCashMln,
      financeParams.wbLagMonths,
    ]
  );

  useEffect(() => {
    const onResetHome = () => {
      setDashboardMode('all');
    };
    window.addEventListener('borners-reset-to-home-summary', onResetHome);
    return () => window.removeEventListener('borners-reset-to-home-summary', onResetHome);
  }, []);

  const hasFinanceAccess = canUserViewFinance(currentUser);
  const hasCostAccess = canUserViewCostPrice(currentUser);

  useEffect(() => {
    if (!hasCostAccess && chartMetric === 'profit') {
      setChartMetric('revenue');
    }
  }, [hasCostAccess, chartMetric]);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          !p.isArchived &&
          (brandFilter === 'ALL' ||
            normalizeLabBrandCode(p.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [products, brandFilter]
  );

  const filteredConcepts = useMemo(
    () =>
      concepts.filter(
        (c) =>
          !c.isArchived &&
          !['REJECTED', 'CANCELLED', 'POSTPONED'].includes(c.stage) &&
          (brandFilter === 'ALL' ||
            normalizeLabBrandCode(c.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [concepts, brandFilter]
  );

  const filteredLaunches = useMemo(
    () =>
      launches
        .filter(
          (l) =>
            !l.isArchived &&
            (brandFilter === 'ALL' ||
              normalizeLabBrandCode(l.brandId) === normalizeLabBrandCode(brandFilter))
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [launches, brandFilter]
  );

  const normalizedBrandFilter =
    brandFilter && brandFilter !== 'ALL' ? normalizeLabBrandCode(brandFilter) : 'ALL';

  const monthlyChartData = useMemo(() => {
    const scenarioRows = financialPlans.filter(
      (r) =>
        r.scenario === financialScenario &&
        (brandFilter === 'ALL' ||
          normalizeLabBrandCode(r.brandId) === normalizedBrandFilter ||
          r.brandId === brandFilter)
    );
    const byMonth = new Map<
      string,
      {
        periodMonth: string;
        periodLabel: string;
        planRevenueM: number;
        factRevenueM: number | null;
        planProfitM: number;
        factProfitM: number | null;
        planRevenueRaw: number;
        factRevenueRaw: number | null;
        planProfitRaw: number;
        factProfitRaw: number | null;
      }
    >();

    for (const row of scenarioRows) {
      const existing = byMonth.get(row.periodMonth);
      if (!existing) {
        byMonth.set(row.periodMonth, {
          periodMonth: row.periodMonth,
          periodLabel: row.periodLabel,
          planRevenueM: Number((row.plannedRevenueRub / 1_000_000).toFixed(2)),
          factRevenueM:
            row.actualRevenueRub !== null
              ? Number((row.actualRevenueRub / 1_000_000).toFixed(2))
              : null,
          planProfitM: Number((row.plannedOperatingProfitRub / 1_000_000).toFixed(2)),
          factProfitM:
            row.actualOperatingProfitRub !== null
              ? Number((row.actualOperatingProfitRub / 1_000_000).toFixed(2))
              : null,
          planRevenueRaw: row.plannedRevenueRub,
          factRevenueRaw: row.actualRevenueRub,
          planProfitRaw: row.plannedOperatingProfitRub,
          factProfitRaw: row.actualOperatingProfitRub,
        });
      } else {
        existing.planRevenueRaw += row.plannedRevenueRub;
        existing.planRevenueM = Number((existing.planRevenueRaw / 1_000_000).toFixed(2));
        if (row.actualRevenueRub !== null) {
          existing.factRevenueRaw = (existing.factRevenueRaw ?? 0) + row.actualRevenueRub;
          existing.factRevenueM = Number((existing.factRevenueRaw / 1_000_000).toFixed(2));
        }
        existing.planProfitRaw += row.plannedOperatingProfitRub;
        existing.planProfitM = Number((existing.planProfitRaw / 1_000_000).toFixed(2));
        if (row.actualOperatingProfitRub !== null) {
          existing.factProfitRaw =
            (existing.factProfitRaw ?? 0) + row.actualOperatingProfitRub;
          existing.factProfitM = Number((existing.factProfitRaw / 1_000_000).toFixed(2));
        }
      }
    }

    return Array.from(byMonth.values()).sort((a, b) =>
      a.periodMonth.localeCompare(b.periodMonth)
    );
  }, [financialPlans, financialScenario, brandFilter, normalizedBrandFilter]);

  const kpiTotals = useMemo(() => {
    const filledMonths = monthlyChartData.filter((m) => m.factRevenueRaw !== null);
    const totalPlanFilled = filledMonths.reduce((acc, m) => acc + m.planRevenueRaw, 0);
    const totalFactFilled = filledMonths.reduce(
      (acc, m) => acc + (m.factRevenueRaw ?? 0),
      0
    );
    const totalPlanYear = monthlyChartData.reduce((acc, m) => acc + m.planRevenueRaw, 0);
    const totalPlanProfitYear = monthlyChartData.reduce(
      (acc, m) => acc + m.planProfitRaw,
      0
    );

    const revVariance = calculatePlanFactVariance(
      totalPlanFilled,
      filledMonths.length > 0 ? totalFactFilled : null
    );

    const avgMargin =
      filteredProducts.length > 0
        ? Number(
            (
              filteredProducts.reduce(
                (s, p) => s + calculateUnitEconomics(p.economics).marginPct,
                0
              ) / filteredProducts.length
            ).toFixed(1)
          )
        : 73.5;

    return {
      totalPlanYear,
      totalPlanProfitYear,
      totalFactFilled: filledMonths.length > 0 ? totalFactFilled : null,
      revVariance,
      avgMargin,
    };
  }, [monthlyChartData, filteredProducts]);

  const activeBrands = brands.filter(
    (b) =>
      !b.isStrategyInDevelopment &&
      (brandFilter === 'ALL' ||
        normalizeLabBrandCode(b.code) === normalizedBrandFilter ||
        normalizeLabBrandCode(b.id) === normalizedBrandFilter ||
        b.code === brandFilter ||
        b.id === brandFilter)
  );
  const upcomingBrands = brands.filter((b) => b.isStrategyInDevelopment);

  const filteredTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !t.isArchived &&
          (brandFilter === 'ALL' ||
            t.brandId === 'ALL' ||
            normalizeLabBrandCode(t.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [tasks, brandFilter]
  );

  const activeTasksCount = useMemo(
    () => filteredTasks.filter((t) => t.status !== 'Done').length,
    [filteredTasks]
  );

  return (
    <div className="space-y-5 pb-16">
      {/* Если открыт режим Холста (Miro), показываем компактную полоску возврата в Сводку */}
      {dashboardMode === 'miro' && (
        <div className="rounded-[14px] bg-white border border-[#D8D7CF] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-[0_1px_2px_rgba(20,20,19,0.03)]">
          <div className="inline-flex rounded-[9px] border border-[#E2E1D9] bg-[#F4F3EE] p-0.5">
            <button
              type="button"
              onClick={() => setDashboardMode('all')}
              className="h-8 px-3.5 rounded-[7px] text-[12.5px] font-semibold text-[#5E5D58] hover:text-[#141413] transition cursor-pointer"
            >
              ← Вернуться в Сводку 2027
            </button>
            <button
              type="button"
              onClick={() => setDashboardMode('miro')}
              className="h-8 px-3.5 rounded-[7px] bg-[#141413] text-white text-[12.5px] font-semibold shadow-2xs transition cursor-pointer"
            >
              Студия идей (Холст)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <button
              type="button"
              onClick={() => navigateTo('product-lab')}
              className="h-8 px-3 rounded-[8px] bg-[#FAF9F6] hover:border-[#141413] border border-[#D8D7CF] text-[#141413] font-medium inline-flex items-center gap-1.5 cursor-pointer transition"
            >
              <span className="text-[#5E5D58]">R&amp;D Lab:</span>
              <strong className="font-bold text-[#141413]">{filteredConcepts.length} обр.</strong>
            </button>
          </div>
        </div>
      )}

      {/* 1. РЕЖИМ СВОДКИ СЦЕНАРИЕВ И МОДЕЛЕЙ ИЛИ СТУДИЯ ИДЕЙ */}
      {dashboardMode === 'all' ? (
        <GrowthScenariosShowcase onOpenStudioCanvas={() => setDashboardMode('miro')} />
      ) : (
        <MiroBoardView />
      )}

      {dashboardMode === 'all' &&
        (draftModules.brandPortfolio ||
          draftModules.finance ||
          draftModules.legacyReleaseCalendar) && (
        <>
          {/* =====================================================================
              3. ДВА ФЛАГМАНСКИХ БРЕНДА — ЗЕРКАЛЬНАЯ СИММЕТРИЯ КАРТОЧЕК И ЛИНИЙ
          ===================================================================== */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b-2 border-[#181715] pb-3 px-1">
              <h2 className="font-serif-editorial text-[28px] font-medium text-[#181715]">
                Флагманские бренды портфеля
              </h2>
              <button
                type="button"
                onClick={() => navigateTo('brand-strategy')}
                className="text-[13px] font-semibold text-[#181715] hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <span>Стратегические паспорта (14 блоков)</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {activeBrands.map((brand) => {
                const isBorners = brand.code === 'BORNERS';
                const accentColor = isBorners ? '#B85D35' : '#8C7A6B';
                const brandProducts = products.filter(
                  (p) =>
                    !p.isArchived &&
                    (p.brandId === brand.code ||
                      p.brandId === brand.id ||
                      normalizeLabBrandCode(p.brandId) === normalizeLabBrandCode(brand.code))
                );
                const brandConcepts = concepts.filter(
                  (c) =>
                    !c.isArchived &&
                    !['REJECTED', 'CANCELLED', 'POSTPONED'].includes(c.stage) &&
                    (c.brandId === brand.code ||
                      c.brandId === brand.id ||
                      normalizeLabBrandCode(c.brandId) === normalizeLabBrandCode(brand.code))
                );

                return (
                  <div
                    key={brand.id}
                    className={`rounded-[12px] bg-white border-[1.5px] border-[#CFC8BC] border-t-[3px] ${
                      isBorners ? 'border-t-[#181715]' : 'border-t-[#7D7268]'
                    } overflow-hidden flex flex-col justify-between h-full`}
                  >
                    <div>
                      {/* Студийный редакционный кадр фиксированной высоты h-60 */}
                      <div className="h-60 w-full bg-[#F3EFE8] border-b-[1.5px] border-[#CFC8BC] overflow-hidden relative">
                        <img
                          src={resolvePublicAssetUrl(brand.heroImage)}
                          alt={brand.name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover object-center"
                        />
                      </div>

                  <div className="p-6 md:p-7 space-y-5">
                    <div className="space-y-2 min-h-[136px]">
                      <div className="inline-flex items-center gap-2 text-[12px] font-medium text-[#7A756D]">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: accentColor }}
                        />
                        <span>{brand.segment}</span>
                      </div>
                      <h3 className="font-serif-editorial text-[34px] font-medium tracking-tight text-[#181715] leading-none">
                        {brand.name}
                      </h3>
                      <p className="text-[14.5px] font-semibold text-[#181715]">
                        {brand.tagline}
                      </p>
                      <p className="text-[13.5px] text-[#6E6A63] leading-relaxed">
                        {brand.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-4 divide-x-[1.5px] divide-[#DFD8CC] pt-5 border-t-[1.5px] border-[#CFC8BC]">
                      <div className="pr-3">
                        <div className="text-[11.5px] text-[#8C867E]">
                          План 2027
                        </div>
                        <div className="font-serif-editorial text-[22px] font-medium text-[#181715] mt-0.5 tabular-nums">
                          {hasFinanceAccess
                            ? formatCompactRub(brand.plannedRevenue2027Rub)
                            : '—'}
                        </div>
                      </div>
                      <div className="px-3">
                        <div className="text-[11.5px] text-[#8C867E]">
                          Целевая маржа
                        </div>
                        <div className="font-serif-editorial text-[22px] font-medium text-[#181715] mt-0.5 tabular-nums">
                          {hasFinanceAccess && hasCostAccess
                            ? `${brand.targetMarginPct}%`
                            : 'Скрыто'}
                        </div>
                        {hasFinanceAccess &&
                          hasCostAccess &&
                          livePortfolioCashflowSummary.groupTotal.modelsCount > 0 && (
                            <div className="text-[10px] text-[#8C867E] mt-0.5 truncate">
                              {financeParams.wbLagMonths < 0
                                ? 'Лаг WB не задан'
                                : (() => {
                                    const bRow = livePortfolioCashflowSummary.brands.find(
                                      (b) => b.brandCode === brand.code
                                    );
                                    return bRow && bRow.modelsCount > 0
                                      ? `Пик (с WB): ${formatCompactRub(bRow.peakWorkingCapitalRub)}`
                                      : '';
                                  })()}
                            </div>
                          )}
                      </div>
                      <div className="px-3">
                        <div className="text-[11.5px] text-[#8C867E]">
                          В каталоге
                        </div>
                        <div className="font-serif-editorial text-[22px] font-medium text-[#181715] mt-0.5 tabular-nums">
                          {brandProducts.length} SKU
                        </div>
                      </div>
                      <div className="pl-3">
                        <div className="text-[11.5px] text-[#8C867E]">
                          В R&amp;D
                        </div>
                        <div className="font-serif-editorial text-[22px] font-medium text-[#181715] mt-0.5 tabular-nums">
                          {brandConcepts.length} мод.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 divide-x-[1.5px] divide-[#CFC8BC] border-t-[1.5px] border-[#CFC8BC] bg-[#FAF8F5]">
                  <button
                    type="button"
                    onClick={() => {
                      setBrandFilter(brand.code);
                      navigateTo('brand-strategy');
                    }}
                    className="h-11 px-3 text-[12.5px] font-semibold text-[#181715] hover:bg-[#EFECE6] transition cursor-pointer"
                  >
                    Стратегия бренда
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBrandFilter(brand.code);
                      navigateTo('product-lab');
                    }}
                    className="h-11 px-3 text-[12.5px] font-semibold text-[#181715] hover:bg-[#EFECE6] transition cursor-pointer"
                  >
                    Product Lab ({brandConcepts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBrandFilter(brand.code);
                      navigateTo('product-catalog');
                    }}
                    className="h-11 px-3 text-[12.5px] font-semibold text-[#181715] hover:bg-[#EFECE6] transition cursor-pointer"
                  >
                    Каталог ({brandProducts.length})
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Компактная плашка брендов в разработке (Акуша и Liskani) */}
      {upcomingBrands.length > 0 && brandFilter === 'ALL' && (
        <div className="rounded-[12px] bg-white border-[1.5px] border-[#CFC8BC] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-0.5 rounded-[6px] bg-[#EFECE6] border border-[#D4CDC2] text-[11.5px] font-semibold text-[#5C5852]">
              В разработке
            </span>
            <span className="text-[14px] font-semibold text-[#181715]">
              Бренды портфеля на этапе проработки стратегии:{' '}
              {upcomingBrands.map((b) => b.name).join(' и ')}
            </span>
          </div>
          <span className="text-[13px] text-[#7A756D]">
            Формирование бренд-платформы, подбор фабрик и расчёт экономики
          </span>
        </div>
      )}

      {/* =====================================================================
          4. ОПЕРАЦИОННЫЙ БЛОК CRM · ЗАДАЧИ И ПОРУЧЕНИЯ КОМАНДЫ (НАГЛЯДНО И УДОБНО)
      ===================================================================== */}
      <div className="rounded-[12px] bg-white border-[1.5px] border-[#CFC8BC] border-t-[3px] border-t-[#181715] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#181715] pb-4">
          <div>
            <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#B85D35]">
              CRM · ОПЕРАЦИОННЫЙ КОНТРОЛЬ И ПОРУЧЕНИЯ
            </div>
            <h2 className="font-serif-editorial text-[26px] font-medium text-[#181715] mt-0.5">
              Задачи и проекты в работе ({activeTasksCount} активных из {filteredTasks.length})
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigateTo('roadmap-tasks')}
              className="h-10 px-5 rounded-[8px] bg-[#181715] hover:bg-[#2C2B29] text-white text-[13px] font-medium transition cursor-pointer inline-flex items-center gap-2"
            >
              <span>Открыть Канбан-доску CRM</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
          {filteredTasks.slice(0, 4).map((task) => {
            const assignee = users.find((u) => u.id === task.assigneeId);
            const isOverdue = task.deadline < '2027-02-01' && task.status !== 'Done';
            return (
              <div
                key={task.id}
                onClick={() => navigateTo('roadmap-tasks')}
                className="rounded-[10px] bg-[#FAF8F5] border-[1.5px] border-[#D4CDC2] hover:border-[#181715] p-4 flex flex-col justify-between gap-4 cursor-pointer transition"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11.5px] font-mono">
                    <span className="font-semibold uppercase text-[#5C5852]">
                      {task.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : task.brandId}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-[4px] font-semibold ${
                        task.priority === 'Critical'
                          ? 'bg-[#B83E3E]/12 text-[#B83E3E]'
                          : task.priority === 'High'
                          ? 'bg-[#B87D24]/15 text-[#B87D24]'
                          : 'bg-[#EFECE6] text-[#5C5852]'
                      }`}
                    >
                      {TASK_PRIORITY_LABELS_RU[task.priority]}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#181715] leading-snug line-clamp-2">
                    {task.title}
                  </h3>
                  <p className="text-[12.5px] text-[#6E6A63] line-clamp-2">
                    {task.description}
                  </p>
                </div>

                <div className="pt-3 border-t-[1.5px] border-[#DFD8CC] space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#5C5852] font-medium truncate">
                      {assignee?.fullName.split(' ')[0] || 'Команда'}
                    </span>
                    <span className={`font-mono font-semibold ${isOverdue ? 'text-[#B83E3E]' : 'text-[#181715]'}`}>
                      до {task.deadline}
                    </span>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <select
                      value={task.status}
                      disabled={
                        !canUserEditBrand(
                          currentUser,
                          task.brandId === 'ALL' ? 'BORNERS' : normalizeLabBrandCode(task.brandId)
                        )
                      }
                      onChange={(e) => updateTaskStatus(task.id, e.target.value as TaskStatus)}
                      className="w-full h-8 rounded-[6px] bg-white border-[1.5px] border-[#CFC8BC] px-2.5 text-[12px] font-semibold text-[#181715] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {(['To Do', 'In Progress', 'Review', 'Done', 'Blocked'] as TaskStatus[]).map(
                        (st) => (
                          <option key={st} value={st}>
                            Статус: {TASK_STATUS_LABELS_RU[st]}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          5. НИЖНИЙ РЯД (СИММЕТРИЯ 6 / 6 КОЛОНОК ОДИНАКОВОЙ ВЫСОТЫ)
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* График выручки и прибыли по месяцам */}
        <div className="lg:col-span-6 rounded-[12px] bg-white border-[1.5px] border-[#CFC8BC] p-6 space-y-5 flex flex-col justify-between h-full">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#181715] pb-4">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8C867E]">
                ФИНАНСОВАЯ ДИНАМИКА · 2027
              </div>
              <h2 className="text-[19px] font-semibold text-[#161615] mt-0.5">
                Помесячный план и факт (млн ₽)
              </h2>
            </div>

            <div className="flex items-center bg-[#F2EFE9] p-0.5 rounded-[6px] border-[1.5px] border-[#CFC8BC]">
              <button
                type="button"
                onClick={() => setChartMetric('revenue')}
                className={`px-3 py-1 rounded-[4px] text-[12px] font-medium transition cursor-pointer ${
                  chartMetric === 'revenue'
                    ? 'bg-white text-[#161615] shadow-2xs'
                    : 'text-[#6E6A63]'
                }`}
              >
                Выручка
              </button>
              {hasCostAccess && (
                <button
                  type="button"
                  onClick={() => setChartMetric('profit')}
                  className={`px-3 py-1 rounded-[4px] text-[12px] font-medium transition cursor-pointer ${
                    chartMetric === 'profit'
                      ? 'bg-white text-[#161615] shadow-2xs'
                      : 'text-[#6E6A63]'
                  }`}
                >
                  Прибыль
                </button>
              )}
            </div>
          </div>

          {hasFinanceAccess ? (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyChartData}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="2 2" stroke="#D5CEC2" vertical={false} />
                  <XAxis
                    dataKey="periodLabel"
                    tick={{ fontSize: 11, fill: '#5C5852' }}
                    axisLine={{ stroke: '#181715', strokeWidth: 1.5 }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#5C5852' }}
                    axisLine={false}
                    tickLine={false}
                    unit=" М"
                  />
                  <Tooltip
                    formatter={(value, name) => {
                      if (value === null || value === undefined) {
                        return ['Нет данных', String(name)];
                      }
                      return [`${value} млн ₽`, String(name)];
                    }}
                    contentStyle={{
                      borderRadius: '6px',
                      border: '1.5px solid #181715',
                      fontSize: '12.5px',
                    }}
                  />
                  <Bar
                    dataKey={chartMetric === 'revenue' ? 'planRevenueM' : 'planProfitM'}
                    name="План"
                    fill="#D8D2C7"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey={chartMetric === 'revenue' ? 'factRevenueM' : 'factProfitM'}
                    name="Факт"
                    fill="#161615"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center rounded-[6px] border-[1.5px] border-dashed border-[#CFC8BC] text-[13.5px] text-[#6E6A63]">
              Финансовая аналитика доступна Владельцу и Администратору
            </div>
          )}
        </div>

        {/* Ближайшие запуски коллекций — симметричная правая панель */}
        <div className="lg:col-span-6 rounded-[12px] bg-white border-[1.5px] border-[#CFC8BC] p-6 space-y-5 flex flex-col justify-between h-full">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b-2 border-[#181715] pb-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8C867E]">
                  КАЛЕНДАРЬ РЕЛИЗОВ
                </div>
                <h2 className="text-[19px] font-semibold text-[#161615] mt-0.5">
                  Ближайшие запуски коллекций
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigateTo('launch-calendar')}
                className="text-[12.5px] font-semibold text-[#161615] hover:underline cursor-pointer"
              >
                Все релизы →
              </button>
            </div>

            <div className="space-y-3">
              {filteredLaunches.slice(0, 3).map((launch) => {
                const isBorners = launch.brandId === 'BORNERS';
                return (
                  <div
                    key={launch.id}
                    onClick={() => navigateTo('launch-calendar', { launchId: launch.id })}
                    className="rounded-[8px] bg-[#FAF8F5] border-[1.5px] border-[#D4CDC2] hover:border-[#161615] p-3.5 flex items-center gap-3.5 cursor-pointer transition"
                  >
                    <div className="h-16 w-16 rounded-[6px] bg-[#EAE5DC] border-[1.5px] border-[#CFC8BC] overflow-hidden shrink-0">
                      <img
                        src={resolvePublicAssetUrl(launch.imageUrl)}
                        alt={launch.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between font-mono text-[10.5px]">
                        <span className="uppercase text-[#161615] font-semibold">
                          {formatLabBrandLabel(launch.brandId)} · Готовность {launch.readinessPct}%
                        </span>
                        <span className="text-[#5C5852] font-medium">
                          Старт: {launch.startDate}
                        </span>
                      </div>
                      <div className="font-semibold text-[14.5px] text-[#161615] truncate">
                        {launch.name}
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#DFD8CC] overflow-hidden">
                        <div
                          className="h-full bg-[#161615]"
                          style={{
                            width: `${launch.readinessPct}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
