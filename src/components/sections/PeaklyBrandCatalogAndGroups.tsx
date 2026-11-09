'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Layers,
  Plus,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  GrowthScenarioDef,
  MONTHS_SHORT_RU,
  ModelPriorityLevel,
  ScenarioModelSpec,
  computeModelScenarioMetrics,
  getModelPriority,
} from '@/lib/scenarioData';
import {
  ACTING_2027_SCENARIO_ID,
  getActingSkuByWbOrVendor,
} from '@/lib/actingAssortment2027';
import {
  CanonicalBrandCode,
  CustomBatchPeriodDef,
  DEFAULT_QUARTERLY_BATCH_PERIODS,
  MultiBrandPortfolioSummaryResult,
  RecommendedProcurementBatch,
  approveRecommendedBatch,
  computeProcurementPlan,
  computeWhatIfSensitivitySimulation,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  getBrandUnitConfig,
  getScenariosForBrand,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
  removeApprovedPurchaseOrder,
} from '@/lib/unifiedBusinessEngine';
import {
  ProductGroupDef,
  buildBrandCatalogSections,
  buildDefaultProductGroups,
  computeProductGroupMetrics,
  getModelBrandAccentStyles,
  loadProductGroups,
  saveProductGroups,
} from '@/lib/productGroups';
import { BoxerPackStackSvg } from '@/components/sections/ScenarioVisualParts';

function formatMln(rub: number): string {
  return `${(rub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
}

function formatShortDateRu(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// =============================================================================
// 1. ТАБЛИЦА-МАТРИЦА 5 КАБИНЕТОВ И СЦЕНАРИЕВ БРЕНДОВ (ИДЕАЛЬНОЕ ВЫРАВНИВАНИЕ КОЛОНОК)
// =============================================================================
export interface BrandCabinetsMatrixTableProps {
  multiBrandSummary: MultiBrandPortfolioSummaryResult;
  scenarios: GrowthScenarioDef[];
  activeBrandFilter: string;
  onSelectBrandFilter: (brandCode: string) => void;
  onSelectScenarioForBrand: (brandCode: string, scenarioId: number | null) => void;
  onSelectActiveScenarioId: (scenarioId: number) => void;
  onOpenCreateScenarioForBrand: (brandCode: CanonicalBrandCode, defaultTitle: string) => void;
  onOpenCreateModelForBrand: (brandCode: string) => void;
  onLaunchStarterCabinet?: (brandCode: 'AKUSHA' | 'LISKANI' | 'NA_TELE') => void;
  onLaunchAllCabinets?: () => void;
  onResetStarterCabinets?: () => void;
}

export function BrandCabinetsMatrixTable({
  multiBrandSummary,
  scenarios,
  activeBrandFilter,
  onSelectBrandFilter,
  onSelectScenarioForBrand,
  onSelectActiveScenarioId,
  onOpenCreateScenarioForBrand,
  onOpenCreateModelForBrand,
  onLaunchStarterCabinet,
  onLaunchAllCabinets,
  onResetStarterCabinets,
}: BrandCabinetsMatrixTableProps) {
  const gt = multiBrandSummary.groupTotal;
  const activeCount = multiBrandSummary.brands.filter(
    (b) => b.hasScenario && b.hasModels && b.annualRevenueRub > 0
  ).length;

  return (
    <div className="rounded-[16px] border border-[#CFD6E0] bg-white overflow-hidden shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-left border-collapse">
          <thead>
            <tr className="bg-[#F4F6F9] border-b border-[#DCE2EC] text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
              <th className="py-3 px-4 w-[215px]">Кабинет / Бренд</th>
              <th className="py-3 px-3 w-[315px]">Сценарий развития бренда</th>
              <th className="py-3 px-3 text-right">Продажи (Год / Дек)</th>
              <th className="py-3 px-3 text-right">Закупки (Объём)</th>
              <th className="py-3 px-3 text-right">Старт Q1 (Аванс)</th>
              <th className="py-3 px-3 text-right">Пик своих денег</th>
              <th className="py-3 px-4 text-right w-[195px]">Опер. прибыль / Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EAEEF4] text-[12px]">
            {multiBrandSummary.brands.map((b) => {
              const unitCfg = getBrandUnitConfig(b.brandCode);
              const brandScenarios = getScenariosForBrand(scenarios, b.brandCode);
              const accent = getModelBrandAccentStyles(b.brandCode);
              const isSelectedBrand =
                activeBrandFilter !== 'ALL' &&
                normalizePortfolioBrandCode(activeBrandFilter) === b.brandCode;
              const isActive = b.hasScenario && b.hasModels;

              return (
                <tr
                  key={b.brandCode}
                  onClick={() => {
                    onSelectBrandFilter(b.brandCode);
                    if (b.selectedScenarioId !== null) {
                      onSelectActiveScenarioId(b.selectedScenarioId);
                    }
                  }}
                  className={`transition-colors cursor-pointer ${
                    isSelectedBrand
                      ? 'bg-[#F1F5F9] hover:bg-[#E2E8F0]/70'
                      : 'bg-white hover:bg-[#F8FAFC]'
                  }`}
                >
                  {/* 1. Кабинет / Бренд (строго фиксированная колонка) */}
                  <td className="py-3 px-4 align-middle">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-8 w-1.5 rounded-full shrink-0 ${accent.accentBar}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13.5px] font-extrabold text-[#111827] tracking-tight">
                            {b.displayCode}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-[5px] font-mono text-[10px] font-bold border ${
                              b.modelsCount > 0
                                ? 'bg-[#F1F5F9] text-[#1E293B] border-[#CBD5E1]'
                                : 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]'
                            }`}
                          >
                            {b.modelsCount} SKU
                          </span>
                        </div>
                        <div className="text-[10.5px] text-[#64748B] truncate max-w-[165px]">
                          {unitCfg.categoryDefault} · {b.primaryUnit}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 2. Сценарий развития бренда (единая вертикальная ось для всех 5 строк) */}
                  <td
                    className="py-3 px-3 align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5 w-full max-w-[295px]">
                      <select
                        aria-label={`Сценарий развития бренда ${b.displayCode}`}
                        value={b.selectedScenarioId ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const nextId = raw === '' ? null : Number(raw);
                          onSelectScenarioForBrand(b.brandCode, nextId);
                          if (nextId !== null) {
                            onSelectActiveScenarioId(nextId);
                          }
                        }}
                        className={`h-8 flex-1 min-w-0 px-2.5 rounded-[8px] border text-[11.5px] font-semibold focus:outline-none focus:border-[#334155] cursor-pointer truncate ${
                          b.hasScenario
                            ? 'bg-[#F8FAFC] hover:bg-white border-[#CBD5E1] text-[#111827]'
                            : 'bg-[#F8FAFC] border-dashed border-[#CBD5E1] text-[#64748B]'
                        }`}
                      >
                        <option value="">Нет активного сценария</option>
                        {brandScenarios.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.title} ({sc.year || 2027} · {sc.monthlyTargetMln} млн/мес)
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenCreateScenarioForBrand(
                            b.brandCode,
                            `${b.displayCode} — План развития 2027`
                          )
                        }
                        title={`Создать новый сценарий развития для бренда ${b.displayCode}`}
                        className="h-8 w-8 shrink-0 rounded-[8px] bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#475569] hover:text-[#111827] flex items-center justify-center transition cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>

                  {/* 3. Продажи (Год / Дек) */}
                  <td className="py-3 px-3 align-middle text-right">
                    {isActive ? (
                      <div>
                        <div className="font-mono text-[13px] font-extrabold text-[#111827]">
                          {formatMln(b.annualRevenueRub)}
                        </div>
                        <div className="font-mono text-[10.5px] text-[#64748B]">
                          дек: {formatMln(b.decemberRevenueRub)}
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[12px] text-[#CBD5E1]">—</span>
                    )}
                  </td>

                  {/* 4. Закупки (Объём и бюджет) */}
                  <td className="py-3 px-3 align-middle text-right">
                    {isActive ? (
                      <div>
                        <div className="font-mono text-[12.5px] font-bold text-[#111827]">
                          {b.totalProcurementQuantity.toLocaleString('ru-RU')} {b.primaryUnit}
                        </div>
                        <div className="font-mono text-[10.5px] text-[#64748B]">
                          {formatMln(b.totalProcurementBudgetRub)}
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[12px] text-[#CBD5E1]">—</span>
                    )}
                  </td>

                  {/* 5. Старт Q1 (Аванс) */}
                  <td className="py-3 px-3 align-middle text-right">
                    {isActive ? (
                      <div>
                        <div className="font-mono text-[12.5px] font-bold text-[#111827]">
                          {formatMln(b.firstWaveStartBudgetRub)}
                        </div>
                        <div className="font-mono text-[10.5px] text-[#64748B]">
                          аванс: {formatMln(b.firstWavePrepaymentRub)}
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[12px] text-[#CBD5E1]">—</span>
                    )}
                  </td>

                  {/* 6. Пик своих денег */}
                  <td className="py-3 px-3 align-middle text-right">
                    {isActive ? (
                      <div>
                        <div className="font-mono text-[12.5px] font-bold text-[#334155]">
                          {b.verifiedOwnMoneyRequiredRub !== null
                            ? formatMln(b.verifiedOwnMoneyRequiredRub)
                            : '—'}
                        </div>
                        <div className="text-[10px] text-[#64748B]">с оборотом WB</div>
                      </div>
                    ) : (
                      <span className="font-mono text-[12px] text-[#CBD5E1]">—</span>
                    )}
                  </td>

                  {/* 7. Опер. прибыль или Компактные кнопки быстрого старта */}
                  <td
                    className="py-3 px-4 align-middle text-right"
                    onClick={(e) => {
                      if (!isActive) e.stopPropagation();
                    }}
                  >
                    {isActive ? (
                      <div>
                        <div className="font-mono text-[13px] font-extrabold text-[#059669]">
                          +{formatMln(b.annualEstimatedOperatingProfitRub)}
                        </div>
                        <div className="font-mono text-[10.5px] text-[#64748B]">
                          Себест.: {formatMln(b.annualSoldGoodsCostRub)}
                        </div>
                      </div>
                    ) : (
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {onLaunchStarterCabinet &&
                          (b.brandCode === 'AKUSHA' ||
                            b.brandCode === 'LISKANI' ||
                            b.brandCode === 'NA_TELE') && (
                            <button
                              type="button"
                              onClick={() =>
                                onLaunchStarterCabinet(
                                  b.brandCode as 'AKUSHA' | 'LISKANI' | 'NA_TELE'
                                )
                              }
                              title={`Запустить готовую стартовую матрицу ${b.displayCode} (3 флагманских SKU + сценарий 2027)`}
                              className="h-7 px-2.5 rounded-[7px] bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition cursor-pointer whitespace-nowrap shadow-2xs"
                            >
                              🚀 Запустить (3 SKU)
                            </button>
                          )}
                        {!b.hasScenario && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenCreateScenarioForBrand(
                                b.brandCode,
                                `${b.displayCode} — Базовый план 2027`
                              )
                            }
                            className="h-7 px-2.5 rounded-[7px] bg-[#2C3444] hover:bg-[#1E2430] text-white text-[11px] font-semibold transition cursor-pointer whitespace-nowrap"
                          >
                            + Сценарий
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenCreateModelForBrand(b.brandCode)}
                          className="h-7 px-2.5 rounded-[7px] border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] hover:border-[#94A3B8] text-[#334155] text-[11px] font-semibold transition cursor-pointer whitespace-nowrap"
                        >
                          + Товар
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr
              onClick={() => {
                onSelectBrandFilter('ALL');
                const bornersScenId = multiBrandSummary.brands.find(
                  (x) => x.brandCode === 'BORNERS'
                )?.selectedScenarioId;
                if (bornersScenId) {
                  onSelectActiveScenarioId(bornersScenId);
                }
              }}
              className="bg-[#F4F6F9] border-t border-[#DCE2EC] font-bold text-[#111827] text-[12px] cursor-pointer hover:bg-[#E9EDF4] transition"
            >
              <td className="py-3 px-4" colSpan={2}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="uppercase tracking-wider text-[10.5px] text-[#475569]">
                    Итого по холдингу (5 кабинетов)
                  </span>
                  <span className="px-2 py-0.5 rounded-[5px] bg-white border border-[#CBD5E1] font-mono text-[10px] text-[#334155]">
                    {gt.modelsCount} SKU
                  </span>
                  {activeCount < 5 && onLaunchAllCabinets && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunchAllCabinets();
                      }}
                      className="px-2.5 py-0.5 rounded-[6px] bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-semibold transition cursor-pointer"
                    >
                      ⚡ Подключить все 5 кабинетов
                    </button>
                  )}
                  {activeCount > 2 && onResetStarterCabinets && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onResetStarterCabinets();
                      }}
                      className="px-2 py-0.5 rounded-[6px] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] text-[#475569] text-[10.5px] font-semibold transition cursor-pointer"
                    >
                      ↺ Вернуть 2 базовых кабинета
                    </button>
                  )}
                </div>
              </td>
              <td className="py-3 px-3 text-right font-mono font-extrabold text-[#111827]">
                {formatMln(gt.annualRevenueRub)}
              </td>
              <td className="py-3 px-3 text-right font-mono text-[#111827]">
                {formatMln(gt.totalProcurementBudgetRub)}
              </td>
              <td className="py-3 px-3 text-right font-mono text-[#111827]">
                {formatMln(gt.firstWaveStartBudgetRub)}
              </td>
              <td className="py-3 px-3 text-right font-mono text-[#334155]">
                {gt.verifiedOwnMoneyRequiredRub !== null
                  ? formatMln(gt.verifiedOwnMoneyRequiredRub)
                  : '—'}
              </td>
              <td className="py-3 px-4 text-right font-mono font-extrabold text-[#059669]">
                +{formatMln(gt.annualEstimatedOperatingProfitRub)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// ПЛАВНЫЙ СЧЁТЧИК ЧИСЕЛ (COUNT-UP С CUBIC-OUT ИНТЕРПОЛЯЦИЕЙ НА СТАРТЕ И ПРИ СМЕНЕ)
// =============================================================================
function AnimatedMlnValue({
  valueRub,
  prefix = '',
  suffix = 'млн ₽',
  unitClassName = 'text-[12.5px] font-bold tracking-normal text-[#64748B] font-sans',
}: {
  valueRub: number;
  prefix?: string;
  suffix?: string;
  unitClassName?: string;
}) {
  const [displayRub, setDisplayRub] = useState(0);
  const prevRubRef = useRef(0);

  useEffect(() => {
    const startVal = prevRubRef.current;
    const endVal = valueRub;
    prevRubRef.current = valueRub;

    if (Math.abs(endVal - startVal) < 500) {
      setDisplayRub(endVal);
      return;
    }

    let rafId = 0;
    const duration = 720;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayRub(startVal + (endVal - startVal) * eased);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [valueRub]);

  const formatted = (displayRub / 1_000_000).toFixed(2).replace('.', ',');
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>
        {prefix}
        {formatted}
      </span>
      {suffix && <span className={unitClassName}>{suffix.trim()}</span>}
    </span>
  );
}

// =============================================================================
// 1-B. 5 РАЗДЕЛЬНЫХ ВЫСОКОКОНТРАСТНЫХ KPI-КАРТОЧЕК ХОЛДИНГА + ВОДОПАД ВЫРУЧКИ
// =============================================================================
export interface PeaklyMasterCabinetsSummaryProps {
  multiBrandSummary: MultiBrandPortfolioSummaryResult;
  scenarios: GrowthScenarioDef[];
  activeBrandFilter: string;
  onSelectBrandFilter: (brandCode: string) => void;
  onSelectScenarioForBrand: (brandCode: string, scenarioId: number | null) => void;
  onSelectActiveScenarioId: (scenarioId: number) => void;
  onOpenCreateScenarioForBrand: (brandCode: CanonicalBrandCode, defaultTitle: string) => void;
  onOpenCreateModelForBrand: (brandCode: string) => void;
  onLaunchStarterCabinet?: (brandCode: 'AKUSHA' | 'LISKANI' | 'NA_TELE') => void;
  onLaunchAllCabinets?: () => void;
  onResetStarterCabinets?: () => void;
  onNavigateSection: (section: 'product-catalog' | 'launch-calendar' | 'roadmap-tasks' | 'finance') => void;
  embeddedInHero?: boolean;
  isStandaloneHome?: boolean;
  onOpenStrategySummary?: () => void;
  onOpenStudioCanvas?: () => void;
}

export function PeaklyMasterCabinetsSummary({
  multiBrandSummary,
  scenarios,
  activeBrandFilter,
  onSelectBrandFilter,
  onSelectScenarioForBrand,
  onSelectActiveScenarioId,
  onOpenCreateScenarioForBrand,
  onOpenCreateModelForBrand,
  onLaunchStarterCabinet,
  onLaunchAllCabinets,
  onResetStarterCabinets,
  onNavigateSection,
  isStandaloneHome = false,
  onOpenStrategySummary,
  onOpenStudioCanvas,
}: PeaklyMasterCabinetsSummaryProps) {
  const [cabinetsMatrixOpen, setCabinetsMatrixOpen] = useState(isStandaloneHome);
  const [monthlyCashflowOpen, setMonthlyCashflowOpen] = useState(false);
  const [procurementWavesOpen, setProcurementWavesOpen] = useState(true);
  const [whatIfOpen, setWhatIfOpen] = useState(true);
  const [whatIfPriceDelta, setWhatIfPriceDelta] = useState(0);
  const [whatIfCostDelta, setWhatIfCostDelta] = useState(0);
  const [whatIfMpAdsDelta, setWhatIfMpAdsDelta] = useState(0);
  const [hoveredWaterfallKey, setHoveredWaterfallKey] = useState<string | null>(null);
  const [waterfallViewMode, setWaterfallViewMode] = useState<'pnl' | 'brands'>('pnl');

  const holdingTotal = multiBrandSummary.groupTotal;
  const normalizedSelectedBrand =
    activeBrandFilter === 'ALL' ? 'ALL' : normalizePortfolioBrandCode(activeBrandFilter);
  const selectedBrandRow =
    normalizedSelectedBrand !== 'ALL'
      ? multiBrandSummary.brands.find((b) => b.brandCode === normalizedSelectedBrand) || null
      : null;
  const gt = selectedBrandRow || holdingTotal;

  const activeBrandsCount = multiBrandSummary.brands.filter(
    (b) => b.hasScenario && b.hasModels
  ).length;
  const groupMarginPct =
    gt.annualRevenueRub > 0
      ? Math.round((gt.annualEstimatedOperatingProfitRub / gt.annualRevenueRub) * 1000) / 10
      : 0;
  const brandShareOfHoldingPct =
    selectedBrandRow && holdingTotal.annualRevenueRub > 0
      ? Math.round((selectedBrandRow.annualRevenueRub / holdingTotal.annualRevenueRub) * 1000) / 10
      : null;

  // Параметры анимированного кольца маржинальности (Profitability Ring)
  const ringRadius = 34;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const clampedMargin = Math.min(Math.max(groupMarginPct, 0), 100);
  const ringStrokeOffset = ringCircumference * (1 - clampedMargin / 100);

  // Режим 1: 4 статьи расходов холдинга (без дублирования чистой прибыли, которая вынесена в главный Hero)
  const expenseCards = useMemo(() => {
    const rev = Math.max(gt.annualRevenueRub, 1);
    const cogsRub = Math.max(0, gt.annualSoldGoodsCostRub);
    const profitRub = Math.max(0, gt.annualEstimatedOperatingProfitRub);
    const mpAndOpsTotalRub = Math.max(0, rev - cogsRub - profitRub);
    const wbCommissionRub = mpAndOpsTotalRub * 0.504;
    const wbLogisticsStorageRub = mpAndOpsTotalRub * 0.216;
    const adsAndTaxRub = mpAndOpsTotalRub * 0.28;

    return [
      {
        key: 'cogs',
        label: 'Закупочная себестоимость',
        subtitle: 'Производство проданных партий',
        valueRub: cogsRub,
        pct: gt.annualRevenueRub > 0 ? (cogsRub / rev) * 100 : 0,
        color: '#475569',
      },
      {
        key: 'wb-comm',
        label: 'Комиссия маркетплейса WB',
        subtitle: 'Комиссия площадки с выкупов',
        valueRub: wbCommissionRub,
        pct: gt.annualRevenueRub > 0 ? (wbCommissionRub / rev) * 100 : 0,
        color: '#F59E0B',
      },
      {
        key: 'wb-log',
        label: 'Логистика и хранение WB',
        subtitle: 'Доставка до клиента и склады',
        valueRub: wbLogisticsStorageRub,
        pct: gt.annualRevenueRub > 0 ? (wbLogisticsStorageRub / rev) * 100 : 0,
        color: '#06B6D4',
      },
      {
        key: 'ads',
        label: 'Продвижение и налоги',
        subtitle: 'Реклама карточек (ДРР) и налог УСН',
        valueRub: adsAndTaxRub,
        pct: gt.annualRevenueRub > 0 ? (adsAndTaxRub / rev) * 100 : 0,
        color: '#6366F1',
      },
    ];
  }, [
    gt.annualRevenueRub,
    gt.annualSoldGoodsCostRub,
    gt.annualEstimatedOperatingProfitRub,
  ]);

  // Полная шкала «Куда уходит выручка (100%)» = 4 статьи расходов + чистая прибыль
  const pnlWaterfallSegments = useMemo(() => {
    const rev = Math.max(gt.annualRevenueRub, 1);
    const profitRub = Math.max(0, gt.annualEstimatedOperatingProfitRub);
    return [
      ...expenseCards,
      {
        key: 'profit',
        label: 'Чистая прибыль',
        subtitle: 'Остаётся чистыми',
        valueRub: profitRub,
        pct: gt.annualRevenueRub > 0 ? (profitRub / rev) * 100 : 0,
        color: '#10B981',
      },
    ];
  }, [expenseCards, gt.annualRevenueRub, gt.annualEstimatedOperatingProfitRub]);

  const totalExpensesRub = useMemo(
    () => expenseCards.reduce((acc, item) => acc + item.valueRub, 0),
    [expenseCards]
  );
  const totalExpensesPct = useMemo(
    () => Math.max(0, Math.min(100, 100 - groupMarginPct)),
    [groupMarginPct]
  );

  // Режим 2: Доли брендов в годовой выручке холдинга
  const brandSegments = useMemo(() => {
    const rev = Math.max(holdingTotal.annualRevenueRub, 1);
    const palette: Record<string, string> = {
      BORNERS: '#334155',
      FUKAI: '#0D9488',
      NA_TELE: '#6366F1',
      AKUSHA: '#F59E0B',
      LISKANI: '#10B981',
    };
    return multiBrandSummary.brands.map((b) => ({
      key: b.brandCode,
      label: b.displayCode,
      subtitle:
        b.annualRevenueRub > 0
          ? `${b.modelsCount} SKU · прибыль +${formatMln(b.annualEstimatedOperatingProfitRub)}`
          : `${b.modelsCount} SKU · план не запущен`,
      valueRub: b.annualRevenueRub,
      pct: holdingTotal.annualRevenueRub > 0 ? (b.annualRevenueRub / rev) * 100 : 0,
      color: palette[b.brandCode] || '#334155',
    }));
  }, [multiBrandSummary.brands, holdingTotal.annualRevenueRub]);

  const [trendChartMode, setTrendChartMode] = useState<'payout' | 'monthlyProfit'>('payout');
  const [selectedTrendMonthIdx, setSelectedTrendMonthIdx] = useState<number>(11);

  const activeCards = waterfallViewMode === 'pnl' ? expenseCards : brandSegments;
  const activeBarSegments = waterfallViewMode === 'pnl' ? pnlWaterfallSegments : brandSegments;

  // Плавный кубический график (ProfitTrendChart 7+5) по 12 месяцам — без дублирования 312,80 млн ₽
  const trendChartData = useMemo(() => {
    const rows = gt.monthlyRows || [];
    const marginRatio =
      gt.annualRevenueRub > 0
        ? gt.annualEstimatedOperatingProfitRub / gt.annualRevenueRub
        : 0.4;
    const series = Array.from({ length: 12 }, (_, idx) => {
      const mRow = rows[idx];
      const revRub = mRow ? mRow.grossSalesRub : 0;
      const payoutRub =
        mRow && mRow.wbNetInflowRub > 0 ? mRow.wbNetInflowRub : revRub * 0.724;
      const profRub = revRub * marginRatio;
      const valRub = trendChartMode === 'payout' ? payoutRub : profRub;
      return {
        idx,
        monthLabel: MONTHS_SHORT_RU[idx]?.toLowerCase() || String(idx + 1),
        revRub,
        payoutRub,
        profRub,
        valRub,
        valMln: valRub / 1_000_000,
      };
    });

    const totalPayoutYearRub = series.reduce((acc, s) => acc + s.payoutRub, 0);
    const values = series.map((s) => s.valRub);
    const maxV = Math.max(...values, 1);
    const minV = Math.min(...values, 0);
    const span = Math.max(maxV - minV, 1);
    const svgW = 680;
    const svgH = 148;
    const padTop = 16;
    const padBottom = 14;
    const usableH = svgH - padTop - padBottom;

    const coords = series.map((s, i) => {
      const x = 22 + (i / 11) * (svgW - 44);
      const y = padTop + usableH * (1 - (s.valRub - minV) / span);
      return { ...s, x, y };
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

    const janRevRub = series[0]?.revRub || 0;
    const decRevRub = series[11]?.revRub || gt.decemberRevenueRub || 0;
    const growthMult = janRevRub > 0 ? Math.round((decRevRub / janRevRub) * 10) / 10 : null;

    return {
      coords,
      smoothPath,
      areaPath,
      svgW,
      svgH,
      padTop,
      usableH,
      janRevRub,
      decRevRub,
      totalPayoutYearRub,
      growthMult,
    };
  }, [gt.monthlyRows, gt.annualRevenueRub, gt.annualEstimatedOperatingProfitRub, gt.decemberRevenueRub, trendChartMode]);

  // Мультипликатор отдачи на собственный капитал
  const ownCapitalRoiMult = useMemo(() => {
    if (
      gt.verifiedOwnMoneyRequiredRub !== null &&
      gt.verifiedOwnMoneyRequiredRub > 0 &&
      gt.annualEstimatedOperatingProfitRub > 0
    ) {
      return Math.round((gt.annualEstimatedOperatingProfitRub / gt.verifiedOwnMoneyRequiredRub) * 10) / 10;
    }
    return null;
  }, [gt.verifiedOwnMoneyRequiredRub, gt.annualEstimatedOperatingProfitRub]);

  // Доля закупок из оборотной выручки WB
  const selfFundedProcurementPct = useMemo(() => {
    if (
      gt.totalProcurementBudgetRub > 0 &&
      gt.verifiedOwnMoneyRequiredRub !== null &&
      gt.verifiedOwnMoneyRequiredRub > 0
    ) {
      const fundedByWb = Math.max(0, gt.totalProcurementBudgetRub - gt.verifiedOwnMoneyRequiredRub);
      return Math.min(95, Math.max(0, Math.round((fundedByWb / gt.totalProcurementBudgetRub) * 100)));
    }
    return 82;
  }, [gt.totalProcurementBudgetRub, gt.verifiedOwnMoneyRequiredRub]);

  const cogsPct = useMemo(() => {
    if (gt.annualRevenueRub > 0) {
      return Math.round((gt.annualSoldGoodsCostRub / gt.annualRevenueRub) * 1000) / 10;
    }
    return 21.4;
  }, [gt.annualRevenueRub, gt.annualSoldGoodsCostRub]);

  // 4 круговых индикатора KPIRing (2×2 сетка справа от графика)
  const kpiRings = useMemo(() => {
    const r = 30;
    const circ = 2 * Math.PI * r;
    return [
      {
        id: 'margin',
        label: 'МАРЖА',
        valueText: `${Math.round(groupMarginPct)}%`,
        subText: `↑ +${groupMarginPct.toFixed(1).replace('.', ',')}%`,
        pctFill: Math.min(100, Math.max(8, groupMarginPct * 1.6)),
        color: '#10B981',
        circ,
        r,
        onClick: () => onNavigateSection('finance'),
      },
      {
        id: 'roi',
        label: 'ROI',
        valueText: ownCapitalRoiMult ? `${Math.round(ownCapitalRoiMult * 100)}%` : '320%',
        subText: ownCapitalRoiMult ? `↑ ×${ownCapitalRoiMult.toFixed(1).replace('.', ',')} к капит.` : '↑ с оборота',
        pctFill: 86,
        color: '#10B981',
        circ,
        r,
        onClick: () => onNavigateSection('finance'),
      },
      {
        id: 'reinvest',
        label: 'ОБОРОТ WB',
        valueText: `${selfFundedProcurementPct}%`,
        subText: '↑ оплата партий',
        pctFill: selfFundedProcurementPct,
        color: '#10B981',
        circ,
        r,
        onClick: () => onNavigateSection('roadmap-tasks'),
      },
      {
        id: 'cogs',
        label: 'СЕБЕСТ.',
        valueText: `${Math.round(cogsPct)}%`,
        subText: '↓ норма ≤ 25%',
        pctFill: Math.min(100, Math.max(12, cogsPct * 2.2)),
        color: '#10B981',
        circ,
        r,
        onClick: () => onNavigateSection('product-catalog'),
      },
    ];
  }, [groupMarginPct, ownCapitalRoiMult, selfFundedProcurementPct, cogsPct, onNavigateSection]);

  const selectedMonthPoint =
    trendChartData.coords[selectedTrendMonthIdx] ||
    trendChartData.coords[11];

  // Интерактивный симулятор чувствительности «Что если?» (Цена / Себестоимость / Комиссия WB и ДРР)
  const whatIfSim = useMemo(
    () =>
      computeWhatIfSensitivitySimulation(
        {
          annualRevenueRub: gt.annualRevenueRub,
          annualSoldGoodsCostRub: gt.annualSoldGoodsCostRub,
          annualEstimatedOperatingProfitRub: gt.annualEstimatedOperatingProfitRub,
          totalProcurementBudgetRub: gt.totalProcurementBudgetRub,
          verifiedOwnMoneyRequiredRub: gt.verifiedOwnMoneyRequiredRub,
        },
        {
          priceDeltaPct: whatIfPriceDelta,
          costDeltaPct: whatIfCostDelta,
          mpAndAdsDeltaPt: whatIfMpAdsDelta,
        }
      ),
    [
      gt.annualRevenueRub,
      gt.annualSoldGoodsCostRub,
      gt.annualEstimatedOperatingProfitRub,
      gt.totalProcurementBudgetRub,
      gt.verifiedOwnMoneyRequiredRub,
      whatIfPriceDelta,
      whatIfCostDelta,
      whatIfMpAdsDelta,
    ]
  );
  const hasActiveWhatIf =
    whatIfPriceDelta !== 0 || whatIfCostDelta !== 0 || whatIfMpAdsDelta !== 0;

  // Данные 4 волн закупок 2027 года (Gantt-таймлайн и защита от кассового разрыва)
  const procurementWavesTimeline = useMemo(() => {
    const totalProc = Math.max(gt.totalProcurementBudgetRub, 0);
    const w1Budget = Math.max(gt.firstWaveStartBudgetRub, Math.round(totalProc * 0.197));
    const w1Prepay = Math.max(gt.firstWavePrepaymentRub, Math.round(w1Budget * 0.3));
    const remainingBudget = Math.max(0, totalProc - w1Budget);
    const w2Budget = Math.round(remainingBudget * 0.27);
    const w3Budget = Math.round(remainingBudget * 0.34);
    const w4Budget = Math.max(0, remainingBudget - w2Budget - w3Budget);

    return [
      {
        id: 'wave-1',
        waveNum: 'Волна №1 · Q1',
        title: 'Стартовая партия (Янв – Мар)',
        orderWindow: 'Ноя – Дек',
        arrivalMonth: 'Январь',
        coverageMonths: [0, 1, 2],
        orderMonthIdx: 0,
        budgetRub: w1Budget,
        prepayRub: w1Prepay,
        balanceRub: Math.max(0, w1Budget - w1Prepay),
        fundingLabel: 'Аванс 30% + доплата 70% (свой капитал)',
        fundingTone: 'cyan',
        sharePct: totalProc > 0 ? Math.round((w1Budget / totalProc) * 100) : 20,
      },
      {
        id: 'wave-2',
        waveNum: 'Волна №2 · Q2',
        title: 'Весна – Лето (Апр – Июн)',
        orderWindow: 'Февраль',
        arrivalMonth: 'Апрель',
        coverageMonths: [3, 4, 5],
        orderMonthIdx: 1,
        budgetRub: w2Budget,
        prepayRub: Math.round(w2Budget * 0.3),
        balanceRub: Math.round(w2Budget * 0.7),
        fundingLabel: 'Частично с выручки WB (пик капитала)',
        fundingTone: 'indigo',
        sharePct: totalProc > 0 ? Math.round((w2Budget / totalProc) * 100) : 22,
      },
      {
        id: 'wave-3',
        waveNum: 'Волна №3 · Q3',
        title: 'Осень и Back-to-Office (Июл – Сен)',
        orderWindow: 'Май',
        arrivalMonth: 'Июль',
        coverageMonths: [6, 7, 8],
        orderMonthIdx: 4,
        budgetRub: w3Budget,
        prepayRub: Math.round(w3Budget * 0.3),
        balanceRub: Math.round(w3Budget * 0.7),
        fundingLabel: '100% из оборотной выручки WB',
        fundingTone: 'emerald',
        sharePct: totalProc > 0 ? Math.round((w3Budget / totalProc) * 100) : 27,
      },
      {
        id: 'wave-4',
        waveNum: 'Волна №4 · Q4',
        title: 'Высокий сезон и пик декабря (Окт – Дек)',
        orderWindow: 'Август',
        arrivalMonth: 'Октябрь',
        coverageMonths: [9, 10, 11],
        orderMonthIdx: 7,
        budgetRub: w4Budget,
        prepayRub: Math.round(w4Budget * 0.3),
        balanceRub: Math.round(w4Budget * 0.7),
        fundingLabel: '100% из оборотной выручки WB · защита от Out-of-Stock',
        fundingTone: 'emerald',
        sharePct: totalProc > 0 ? Math.max(1, 100 - Math.round(((w1Budget + w2Budget + w3Budget) / totalProc) * 100)) : 31,
      },
    ];
  }, [gt.totalProcurementBudgetRub, gt.firstWaveStartBudgetRub, gt.firstWavePrepaymentRub]);

  return (
    <div className="space-y-6">
      {/* 0. СТРОКА ПРИВЕТСТВИЯ И ФИЛЬТРА КАБИНЕТОВ ПРЯМО НА ХОЛСТЕ (БЕЗ ЛИШНЕЙ РАМКИ) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Sun className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-[17px] sm:text-[19px] font-semibold tracking-[-0.018em] text-[#0F172A] dark:text-[#EDF0F7] leading-tight">
              {selectedBrandRow
                ? `Кабинет ${selectedBrandRow.displayCode} · Финансовый обзор`
                : 'Финансовый центр BORNERS GROUP'}
            </h1>
            <p className="text-[12px] text-[#64748B]">
              {selectedBrandRow
                ? `${selectedBrandRow.modelsCount} SKU · план 2027 года`
                : `Консолидация ${activeBrandsCount} активных из 5 кабинетов холдинга · 2027`}
            </p>
          </div>
        </div>

        {/* Спокойные пилюли кабинетов + переход в Сводку сценариев */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              onSelectBrandFilter('ALL');
              const bornersScenId = multiBrandSummary.brands.find(
                (x) => x.brandCode === 'BORNERS'
              )?.selectedScenarioId;
              if (bornersScenId) {
                onSelectActiveScenarioId(bornersScenId);
              }
            }}
            className={`h-8 px-3 rounded-lg text-[12px] font-medium transition cursor-pointer inline-flex items-center gap-1.5 border ${
              activeBrandFilter === 'ALL'
                ? 'bg-[#0F172A] dark:bg-emerald-500/15 text-white dark:text-emerald-300 border-[#0F172A] dark:border-emerald-500/30'
                : 'bg-white dark:bg-[#121620] text-[#475569] border-[#E2E6EE] dark:border-[#222938] hover:border-[#CBD5E1]'
            }`}
          >
            <span>Все (5)</span>
            <span className="font-mono text-[11px] opacity-75">
              {(holdingTotal.annualRevenueRub / 1_000_000).toFixed(1).replace('.', ',')} млн
            </span>
          </button>

          {multiBrandSummary.brands.map((b) => {
            const isSelected =
              activeBrandFilter !== 'ALL' &&
              normalizePortfolioBrandCode(activeBrandFilter) === b.brandCode;
            const accent = getModelBrandAccentStyles(b.brandCode);
            const hasRev = b.hasScenario && b.hasModels && b.annualRevenueRub > 0;
            return (
              <button
                key={b.brandCode}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    onSelectBrandFilter('ALL');
                    const bornersScenId = multiBrandSummary.brands.find(
                      (x) => x.brandCode === 'BORNERS'
                    )?.selectedScenarioId;
                    if (bornersScenId) {
                      onSelectActiveScenarioId(bornersScenId);
                    }
                  } else {
                    onSelectBrandFilter(b.brandCode);
                    if (b.selectedScenarioId !== null) {
                      onSelectActiveScenarioId(b.selectedScenarioId);
                    }
                  }
                }}
                className={`h-8 px-3 rounded-lg text-[12px] font-medium transition cursor-pointer inline-flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-[#0F172A] dark:bg-emerald-500/15 text-white dark:text-emerald-300 border-[#0F172A] dark:border-emerald-500/30'
                    : 'bg-white dark:bg-[#121620] text-[#475569] border-[#E2E6EE] dark:border-[#222938] hover:border-[#CBD5E1]'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${accent.accentBar}`} />
                <span>{b.displayCode}</span>
                {hasRev && (
                  <span className="font-mono text-[11px] opacity-75">
                    {(b.annualRevenueRub / 1_000_000).toFixed(0)} млн
                  </span>
                )}
              </button>
            );
          })}

          {activeBrandsCount < 5 && onLaunchAllCabinets && (
            <button
              type="button"
              onClick={onLaunchAllCabinets}
              title="В 1 клик запустить стартовые матрицы AKUSHA, LISKANI и НА ТЕЛЕ в сводке холдинга"
              className="h-8 px-3 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/25 text-indigo-700 dark:text-indigo-300 text-[12px] font-medium transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>⚡ Все 5 кабинетов</span>
            </button>
          )}

          {activeBrandsCount > 2 && onResetStarterCabinets && (
            <button
              type="button"
              onClick={onResetStarterCabinets}
              title="Вернуть эталонную сводку из 2 действующих кабинетов (BORNERS + FUKAI)"
              className="h-8 px-2.5 rounded-lg bg-white dark:bg-[#121620] hover:bg-[#F8FAFC] border border-[#E2E6EE] dark:border-[#222938] text-[#64748B] text-[11.5px] font-medium transition cursor-pointer inline-flex items-center gap-1"
            >
              <span>↺ 2 базовых</span>
            </button>
          )}

          {onOpenStrategySummary && (
            <button
              type="button"
              onClick={onOpenStrategySummary}
              className="h-8 px-3.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[12px] font-medium transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Сводка и 4 сценария</span>
              <span>→</span>
            </button>
          )}
        </div>
      </div>

      {/* БАННЕР БЫСТРОГО ЗАПУСКА ПУСТОГО КАБИНЕТА (если выбран AKUSHA, LISKANI или НА ТЕЛЕ с 0 выручки) */}
      {selectedBrandRow &&
        (!selectedBrandRow.hasScenario ||
          !selectedBrandRow.hasModels ||
          selectedBrandRow.annualRevenueRub === 0) && (
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/8 dark:bg-emerald-500/10 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-semibold">
                  Кабинет {selectedBrandRow.displayCode} · Готов к запуску
                </span>
                <span className="text-xs text-[#64748B]">
                  {getBrandUnitConfig(selectedBrandRow.brandCode).categoryDefault}
                </span>
              </div>
              <div className="text-[15px] font-semibold text-[#0F172A] dark:text-[#EDF0F7]">
                В кабинете {selectedBrandRow.displayCode} пока нет активного плана продаж на 2027 год
              </div>
              <p className="text-xs text-[#64748B]">
                Запустите подготовленную стартовую матрицу из 3 флагманских SKU с заполненной юнит-экономикой WB и помесячным планом на 2027 год в один клик — или добавьте свои товары вручную.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onLaunchStarterCabinet &&
                (selectedBrandRow.brandCode === 'AKUSHA' ||
                  selectedBrandRow.brandCode === 'LISKANI' ||
                  selectedBrandRow.brandCode === 'NA_TELE') && (
                  <button
                    type="button"
                    onClick={() =>
                      onLaunchStarterCabinet(
                        selectedBrandRow.brandCode as 'AKUSHA' | 'LISKANI' | 'NA_TELE'
                      )
                    }
                    className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition cursor-pointer shadow-2xs"
                  >
                    🚀 Запустить стартовую матрицу {selectedBrandRow.displayCode} (3 SKU)
                  </button>
                )}
              <button
                type="button"
                onClick={() => onOpenCreateModelForBrand(selectedBrandRow.brandCode)}
                className="h-9 px-3.5 rounded-xl border border-[#CBD5E1] dark:border-[#222938] bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] text-xs font-medium cursor-pointer"
              >
                + Свой товар
              </button>
            </div>
          </div>
        )}

      {/* 1. ГЛАВНЫЙ HERO-БАННЕР: ЧИСТАЯ ПРИБЫЛЬ + «✨ КОРОТКО О ПЕРИОДЕ» */}
      <div
        onClick={() => onNavigateSection('finance')}
        className="relative rounded-2xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-5 sm:p-6 overflow-hidden cursor-pointer hover-lift"
      >
        {/* Деликатное радиальное изумрудное свечение и орбиты */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-emerald-500/8 blur-3xl"
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-56 w-56 text-emerald-500 opacity-[0.08] animate-orbit-slow"
          viewBox="0 0 220 220"
          fill="none"
        >
          <circle cx="110" cy="110" r="76" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 8" />
          <circle cx="110" cy="110" r="102" stroke="currentColor" strokeWidth="1" />
        </svg>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Левая часть: Чистая прибыль */}
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-medium uppercase tracking-wider text-[#64748B]">
                {selectedBrandRow
                  ? `ЧИСТАЯ ПРИБЫЛЬ КАБИНЕТА ${selectedBrandRow.displayCode} · 2027`
                  : 'ЧИСТАЯ ПРИБЫЛЬ ХОЛДИНГА ЗА 2027 ГОД'}
              </span>
            </div>

            <div className="mt-3 font-mono text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight tabular-nums leading-none text-emerald-600 dark:text-emerald-400">
              <AnimatedMlnValue
                valueRub={gt.annualEstimatedOperatingProfitRub}
                prefix="+"
                unitClassName="text-lg sm:text-xl font-semibold tracking-normal text-emerald-600/80 dark:text-emerald-400/80 font-sans ml-1"
              />
            </div>

            {/* Изумрудная линия-акцент 88px */}
            <div className="mt-2.5 h-0.5 w-22 rounded-full bg-gradient-to-r from-emerald-500 to-transparent" />

            {/* Спокойные бейджи-контекст */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                ↑ маржа {groupMarginPct.toFixed(1).replace('.', ',')}%
              </span>
              <span>·</span>
              <span>
                выручка <strong className="font-mono font-semibold text-[#0F172A] dark:text-[#EDF0F7]">{formatMln(gt.annualRevenueRub)}</strong>
              </span>
              <span>·</span>
              <span>{gt.modelsCount} SKU в плане</span>
            </div>
          </div>

          {/* Правая карточка: «✨ КОРОТКО О ПЕРИОДЕ» */}
          <div className="lg:w-[410px] xl:w-[440px] rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-[#F8FAFC]/80 dark:bg-[#181D2A]/75 backdrop-blur-sm p-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              <span>Коротко о периоде</span>
            </div>
            <p className="text-[14px] font-semibold text-[#0F172A] dark:text-[#EDF0F7] leading-snug">
              {groupMarginPct.toFixed(1).replace('.', ',')} ₽ чистой прибыли на каждые 100 ₽ выручки.
            </p>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Стабильность начинается с решений, которые хочется повторять.{' '}
              {selfFundedProcurementPct}% годовых партий оплачиваются напрямую из оборотной выручки WB.
            </p>
          </div>
        </div>
      </div>

      {/* 2. СРЕДНИЙ РЯД 7 + 5: ПЛАВНЫЙ ГРАФИК ПОСТУПЛЕНИЙ WB (7 КОЛ.) + 2×2 KPIRING (5 КОЛ.) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Левая колонка (7/12): Плавная изумрудная кривая Безье без дублирования 312,80 млн ₽ */}
        <div className="lg:col-span-7 rounded-2xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-5 flex flex-col justify-between">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-[#64748B]">
                {trendChartMode === 'payout'
                  ? 'Поступления от WB на счёт (после комиссии и логистики) · 2027'
                  : `Помесячная чистая прибыль (${selectedMonthPoint?.monthLabel || 'дек'}) · 2027`}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                <span className="font-mono text-2xl font-bold tracking-tight tabular-nums text-[#0F172A] dark:text-[#EDF0F7]">
                  {trendChartMode === 'payout'
                    ? formatMln(trendChartData.totalPayoutYearRub)
                    : `+${formatMln(selectedMonthPoint?.profRub || 0)} в ${selectedMonthPoint?.monthLabel || 'дек'}`}
                </span>
                {trendChartData.growthMult && trendChartData.growthMult > 1 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    ↑ ×{trendChartData.growthMult.toFixed(1).replace('.', ',')} к янв
                  </span>
                )}
                {selectedMonthPoint && (
                  <span className="text-xs text-[#64748B]">
                    · {selectedMonthPoint.monthLabel}:{' '}
                    <strong className="font-mono font-semibold text-[#0F172A] dark:text-[#EDF0F7]">
                      {trendChartMode === 'payout'
                        ? `${(selectedMonthPoint.payoutRub / 1_000_000).toFixed(1).replace('.', ',')} млн ₽ на счёт`
                        : `выручка ${(selectedMonthPoint.revRub / 1_000_000).toFixed(1).replace('.', ',')} млн ₽`}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            {/* Спокойный переключатель К выплате WB / Прибыль мес. */}
            <div className="inline-flex items-center rounded-lg bg-[#F1F5F9] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTrendChartMode('payout')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  trendChartMode === 'payout'
                    ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                К выплате WB
              </button>
              <button
                type="button"
                onClick={() => setTrendChartMode('monthlyProfit')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  trendChartMode === 'monthlyProfit'
                    ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Прибыль по мес.
              </button>
            </div>
          </div>

          {/* Изумрудная Area-кривая в стиле Peakly ProfitTrendChart */}
          <div className="mt-4">
            <div className="relative h-[148px] w-full">
              <svg
                viewBox={`0 0 ${trendChartData.svgW} ${trendChartData.svgH}`}
                preserveAspectRatio="none"
                className="w-full h-full overflow-visible"
              >
                <defs>
                  <linearGradient id="peaklyEmeraldAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <line
                  x1="0"
                  y1={trendChartData.padTop + trendChartData.usableH * 0.25}
                  x2={trendChartData.svgW}
                  y2={trendChartData.padTop + trendChartData.usableH * 0.25}
                  stroke="currentColor"
                  className="text-[#E2E8F0] dark:text-[#222938]"
                  strokeDasharray="3 5"
                  strokeWidth="1"
                />
                <line
                  x1="0"
                  y1={trendChartData.padTop + trendChartData.usableH * 0.65}
                  x2={trendChartData.svgW}
                  y2={trendChartData.padTop + trendChartData.usableH * 0.65}
                  stroke="currentColor"
                  className="text-[#E2E8F0] dark:text-[#222938]"
                  strokeDasharray="3 5"
                  strokeWidth="1"
                />
                {trendChartData.areaPath && (
                  <path
                    d={trendChartData.areaPath}
                    fill="url(#peaklyEmeraldAreaGrad)"
                    className="transition-all duration-700 ease-out"
                  />
                )}
                {trendChartData.smoothPath && (
                  <path
                    d={trendChartData.smoothPath}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                )}
                {trendChartData.coords.map((pt) => {
                  const isSel = pt.idx === selectedTrendMonthIdx;
                  return (
                    <g
                      key={pt.idx}
                      onClick={() => setSelectedTrendMonthIdx(pt.idx)}
                      className="cursor-pointer"
                    >
                      <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />
                      {isSel && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="7"
                          fill="#10B981"
                          fillOpacity="0.22"
                        />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSel ? 4.2 : 2.8}
                        fill={isSel ? '#10B981' : '#FFFFFF'}
                        stroke="#10B981"
                        strokeWidth="2"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Спокойная шкала месяцев снизу */}
            <div className="grid grid-cols-12 gap-1 pt-1.5 border-t border-[#EEF2F6] dark:border-[#222938]">
              {trendChartData.coords.map((pt) => {
                const isSel = pt.idx === selectedTrendMonthIdx;
                return (
                  <button
                    key={pt.idx}
                    type="button"
                    onClick={() => setSelectedTrendMonthIdx(pt.idx)}
                    className={`text-center py-0.5 rounded text-[11px] transition cursor-pointer ${
                      isSel
                        ? 'font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    {pt.monthLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Правая колонка (5/12): Сетка 2×2 круговых датчиков KPIRing (76×76px) */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-3.5">
          {kpiRings.map((ring) => {
            const dashOffset = ring.circ * (1 - ring.pctFill / 100);
            return (
              <div
                key={ring.id}
                onClick={ring.onClick}
                className="rounded-2xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 flex flex-col items-center justify-center text-center cursor-pointer hover-lift"
              >
                <div className="relative h-[76px] w-[76px] flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 76 76">
                    <circle
                      cx="38"
                      cy="38"
                      r={ring.r}
                      fill="none"
                      stroke="currentColor"
                      className="text-[#E2E8F0] dark:text-[#222938]"
                      strokeWidth="5.5"
                    />
                    <circle
                      cx="38"
                      cy="38"
                      r={ring.r}
                      fill="none"
                      stroke={ring.color}
                      strokeWidth="5.5"
                      strokeLinecap="round"
                      strokeDasharray={ring.circ}
                      strokeDashoffset={dashOffset}
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  {/* Засечка 12 часов */}
                  <span className="pointer-events-none absolute top-0.5 left-1/2 -translate-x-1/2 h-2 w-0.5 rounded-full bg-[#94A3B8]/60" />
                  <span className="font-mono text-[15px] font-bold tabular-nums text-[#0F172A] dark:text-[#EDF0F7]">
                    {ring.valueText}
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                  {ring.label}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {ring.subText}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. СЕКЦИЯ «| ВЫРУЧКА И КАПИТАЛ»: 4 ЧИСТЫЕ КАРТОЧКИ METRICCARD С 3PX ПОЛОСКОЙ СНИЗУ */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-emerald-500" />
            <h3 className="text-xs font-medium uppercase tracking-wider text-[#64748B]">
              Выручка и капитал
            </h3>
          </div>
          <span className="text-xs text-[#64748B]">
            Нажмите на карточку для перехода в профильный раздел
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Карточка 1: Выручка холдинга */}
          <div
            onClick={() => onNavigateSection('launch-calendar')}
            className="relative overflow-hidden rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 cursor-pointer hover-lift flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#64748B]">
                  {selectedBrandRow ? `Выручка · ${selectedBrandRow.displayCode}` : 'Выручка холдинга'}
                </span>
                <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  {selectedBrandRow && brandShareOfHoldingPct !== null
                    ? `${brandShareOfHoldingPct.toFixed(0)}% группы`
                    : `${gt.modelsCount} SKU`}
                </span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[#0F172A] dark:text-[#EDF0F7]">
                <AnimatedMlnValue
                  valueRub={gt.annualRevenueRub}
                  unitClassName="text-xs font-medium text-[#64748B] font-sans ml-1"
                />
              </div>
            </div>
            <div className="mt-2.5 text-xs text-[#64748B] flex items-center justify-between">
              <span>Пик декабря</span>
              <span className="font-mono font-medium text-[#0F172A] dark:text-[#EDF0F7]">
                {formatMln(gt.decemberRevenueRub)}
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-emerald-500/80" />
          </div>

          {/* Карточка 2: План закупок на год */}
          <div
            onClick={() => onNavigateSection('roadmap-tasks')}
            className="relative overflow-hidden rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 cursor-pointer hover-lift flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#64748B]">
                  План закупок на год
                </span>
                <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  4 волны
                </span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[#0F172A] dark:text-[#EDF0F7]">
                <AnimatedMlnValue
                  valueRub={gt.totalProcurementBudgetRub}
                  unitClassName="text-xs font-medium text-[#64748B] font-sans ml-1"
                />
              </div>
            </div>
            <div className="mt-2.5 text-xs text-[#64748B] flex items-center justify-between">
              <span>Оплата из оборота WB</span>
              <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                {selfFundedProcurementPct}% партий
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-indigo-500/80" />
          </div>

          {/* Карточка 3: Старт 1-й партии (Q1) */}
          <div
            onClick={() => onNavigateSection('roadmap-tasks')}
            className="relative overflow-hidden rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 cursor-pointer hover-lift flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#64748B]">
                  Старт 1-й партии (Q1)
                </span>
                <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  аванс 30%
                </span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[#0F172A] dark:text-[#EDF0F7]">
                <AnimatedMlnValue
                  valueRub={gt.firstWaveStartBudgetRub}
                  unitClassName="text-xs font-medium text-[#64748B] font-sans ml-1"
                />
              </div>
            </div>
            <div className="mt-2.5 text-xs text-[#64748B] flex items-center justify-between">
              <span>Предоплата фабрикам</span>
              <span className="font-mono font-medium text-[#0F172A] dark:text-[#EDF0F7]">
                {formatMln(gt.firstWavePrepaymentRub)}
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-cyan-500/80" />
          </div>

          {/* Карточка 4: Пик своих денег */}
          <div
            onClick={() => onNavigateSection('finance')}
            className="relative overflow-hidden rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 cursor-pointer hover-lift flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#64748B]">
                  Пик своих денег
                </span>
                <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  {ownCapitalRoiMult ? `ROI ×${ownCapitalRoiMult.toFixed(1).replace('.', ',')}` : 'с WB'}
                </span>
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[#0F172A] dark:text-[#EDF0F7]">
                {gt.verifiedOwnMoneyRequiredRub !== null ? (
                  <AnimatedMlnValue
                    valueRub={gt.verifiedOwnMoneyRequiredRub}
                    unitClassName="text-xs font-medium text-[#64748B] font-sans ml-1"
                  />
                ) : (
                  '—'
                )}
              </div>
            </div>
            <div className="mt-2.5 text-xs text-[#64748B] flex items-center justify-between">
              <span>Доля от закупок года</span>
              <span className="font-mono font-medium text-[#0F172A] dark:text-[#EDF0F7]">
                {gt.totalProcurementBudgetRub > 0 && gt.verifiedOwnMoneyRequiredRub !== null
                  ? `всего ${Math.round((gt.verifiedOwnMoneyRequiredRub / gt.totalProcurementBudgetRub) * 100)}%`
                  : 'реинвест'}
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-[3px] bg-violet-500/80" />
          </div>
        </div>
      </div>

      {/* 4. СЕКЦИЯ «| РАСХОДЫ И РЕНТАБЕЛЬНОСТЬ» (В СТИЛЕ WB-OVERVIEW: 8 КОЛ. METRICCARD + ВОДОПАД / 4 КОЛ. КОЛЬЦО ЭФФЕКТИВНОСТИ) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-indigo-500" />
            <h3 className="text-xs font-medium uppercase tracking-wider text-[#64748B]">
              Расходы и рентабельность
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg bg-[#F1F5F9] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setWaterfallViewMode('pnl')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  waterfallViewMode === 'pnl'
                    ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Структура P&L
              </button>
              <button
                type="button"
                onClick={() => setWaterfallViewMode('brands')}
                className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                  waterfallViewMode === 'brands'
                    ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] shadow-2xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Доли кабинетов
              </button>
            </div>
          </div>
        </div>

        {/* Сетка 8 + 4: слева 4 статьи расходов (без повтора 312,80 млн ₽) и бар «Куда уходит выручка», справа сводное кольцо расходов и маржи */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Левая часть (8 колонок) */}
          <div className="lg:col-span-8 flex flex-col justify-between gap-3.5">
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 ${
                waterfallViewMode === 'pnl' ? 'xl:grid-cols-2' : 'xl:grid-cols-3'
              } gap-3.5`}
            >
              {activeCards.map((seg) => {
                const kopeksPerRuble = Math.round(seg.pct);
                return (
                  <div
                    key={seg.key}
                    onMouseEnter={() => setHoveredWaterfallKey(seg.key)}
                    onMouseLeave={() => setHoveredWaterfallKey(null)}
                    onClick={() =>
                      waterfallViewMode === 'pnl'
                        ? onNavigateSection('finance')
                        : onSelectBrandFilter(seg.key)
                    }
                    className="relative overflow-hidden rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 cursor-pointer hover-lift flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[#64748B] truncate">
                          {seg.label}
                        </span>
                        <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 bg-[#F1F5F9] dark:bg-[#181D2A] text-[#64748B]">
                          {seg.pct.toFixed(1).replace('.', ',')}%
                        </span>
                      </div>

                      <div className="mt-2 font-mono text-2xl font-semibold tracking-tight tabular-nums text-[#0F172A] dark:text-[#EDF0F7]">
                        <AnimatedMlnValue
                          valueRub={seg.valueRub}
                          unitClassName="text-xs font-medium text-[#64748B] font-sans ml-1"
                        />
                      </div>
                    </div>

                    <div className="mt-2.5 text-xs text-[#64748B] flex items-center justify-between gap-2">
                      <span className="truncate">{seg.subtitle}</span>
                      {waterfallViewMode === 'pnl' && (
                        <span className="font-mono shrink-0">
                          {kopeksPerRuble} ₽ из 100 ₽
                        </span>
                      )}
                    </div>

                    <div
                      className="absolute inset-x-0 bottom-0 h-[3px]"
                      style={{ backgroundColor: seg.color, opacity: 0.85 }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Спокойная полоса «Куда уходит выручка» (RevenueWaterfall: 4 статьи расходов + Чистая прибыль) */}
            <div className="rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#64748B]">
                  {waterfallViewMode === 'pnl'
                    ? 'Куда уходит выручка (100%)'
                    : 'Доли кабинетов в выручке холдинга'}
                </span>
                <span className="font-mono font-medium text-[#0F172A] dark:text-[#EDF0F7]">
                  {formatMln(
                    waterfallViewMode === 'pnl'
                      ? gt.annualRevenueRub
                      : holdingTotal.annualRevenueRub
                  )}
                </span>
              </div>

              <div className="h-3 w-full rounded-lg bg-[#F1F5F9] dark:bg-[#181D2A] overflow-hidden flex gap-0.5">
                {activeBarSegments
                  .filter((s) => s.pct > 0.2)
                  .map((seg) => {
                    const isHovered = hoveredWaterfallKey === seg.key;
                    return (
                      <div
                        key={seg.key}
                        onMouseEnter={() => setHoveredWaterfallKey(seg.key)}
                        onMouseLeave={() => setHoveredWaterfallKey(null)}
                        style={{
                          width: `${Math.max(seg.pct, 2.5)}%`,
                          backgroundColor: seg.color,
                        }}
                        className={`h-full first:rounded-l-lg last:rounded-r-lg transition-opacity duration-200 ${
                          hoveredWaterfallKey && !isHovered ? 'opacity-40' : 'opacity-90'
                        }`}
                      />
                    );
                  })}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#64748B]">
                {activeBarSegments.map((seg) => (
                  <div key={seg.key} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span>{seg.label}:</span>
                    <span className="font-mono font-medium text-[#0F172A] dark:text-[#EDF0F7]">
                      {seg.pct.toFixed(1).replace('.', ',')}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Правая часть (4 колонки): Карточка «БАЛАНС ЗАТРАТ И ПРИБЫЛИ» (без повтора 40% МАРЖА сверху) */}
          <div
            onClick={() => onNavigateSection('finance')}
            className="lg:col-span-4 rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-5 flex flex-col justify-between cursor-pointer hover-lift"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-[#64748B]">
                Всего расходов и удержаний
              </span>
              <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#F1F5F9] dark:bg-[#181D2A] text-[#64748B]">
                4 статьи
              </span>
            </div>

            <div className="my-3 flex flex-col items-center justify-center">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 112 112">
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    fill="none"
                    stroke="#10B981"
                    strokeOpacity="0.28"
                    strokeWidth="8"
                  />
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    fill="none"
                    stroke="#6366F1"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 46}
                    strokeDashoffset={
                      2 * Math.PI * 46 * (1 - Math.min(100, Math.max(5, totalExpensesPct)) / 100)
                    }
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-2xl font-bold tabular-nums text-[#0F172A] dark:text-[#EDF0F7]">
                    {totalExpensesPct.toFixed(1).replace('.', ',')}%
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#64748B] mt-0.5">
                    все затраты
                  </span>
                </div>
              </div>
              <div className="mt-2 font-mono text-base font-semibold text-[#0F172A] dark:text-[#EDF0F7]">
                {formatMln(totalExpensesRub)} за год
              </div>
            </div>

            <div className="pt-3 border-t border-[#E2E6EE] dark:border-[#222938] grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="font-mono text-sm font-semibold text-[#0F172A] dark:text-[#EDF0F7]">
                  {totalExpensesPct.toFixed(1).replace('.', ',')} ₽
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  расходы со 100 ₽
                </div>
              </div>
              <div className="border-l border-[#E2E6EE] dark:border-[#222938] pl-3">
                <div className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  +{groupMarginPct.toFixed(1).replace('.', ',')} ₽
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  чистыми со 100 ₽
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4-B. ИНТЕРАКТИВНЫЙ СИМУЛЯТОР ЧУВСТВИТЕЛЬНОСТИ «ЧТО ЕСЛИ?» (ЦЕНА WB · СЕБЕСТОИМОСТЬ · КОМИССИЯ И ДРР) */}
      <div className="rounded-2xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-1 h-4 rounded-full bg-emerald-500" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-[#64748B]">
                  Симулятор «Что если?» · Чувствительность прибыли 2027
                </h3>
                {hasActiveWhatIf && (
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold ${
                      whatIfSim.profitDeltaRub >= 0
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {whatIfSim.profitDeltaRub >= 0 ? 'Δ +' : 'Δ −'}
                    {formatMln(Math.abs(whatIfSim.profitDeltaRub))}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                Проверьте в реальном времени, как изменение розничной цены WB, закупочной себестоимости или комиссии повлияет на годовую прибыль
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setWhatIfOpen(true);
                setWhatIfPriceDelta(7);
                setWhatIfCostDelta(-5);
                setWhatIfMpAdsDelta(0);
              }}
              className="h-7.5 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 font-medium transition cursor-pointer"
            >
              🔥 Цена +7% · Себест. −5%
            </button>
            <button
              type="button"
              onClick={() => {
                setWhatIfOpen(true);
                setWhatIfPriceDelta(0);
                setWhatIfCostDelta(10);
                setWhatIfMpAdsDelta(4);
              }}
              className="h-7.5 px-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 text-amber-700 dark:text-amber-300 font-medium transition cursor-pointer"
            >
              ⚠️ Стресс-тест WB +4 п.п.
            </button>
            {hasActiveWhatIf && (
              <button
                type="button"
                onClick={() => {
                  setWhatIfPriceDelta(0);
                  setWhatIfCostDelta(0);
                  setWhatIfMpAdsDelta(0);
                }}
                className="h-7.5 px-2.5 rounded-lg bg-[#F1F5F9] dark:bg-[#181D2A] hover:bg-[#E2E8F0] text-[#0F172A] dark:text-[#EDF0F7] font-medium transition cursor-pointer"
              >
                ↺ Сбросить
              </button>
            )}
            <button
              type="button"
              onClick={() => setWhatIfOpen((v) => !v)}
              className="h-7.5 px-2.5 rounded-lg border border-[#E2E6EE] dark:border-[#222938] text-[#64748B] hover:text-[#0F172A] transition cursor-pointer"
            >
              {whatIfOpen ? 'Свернуть ▴' : 'Открыть ▾'}
            </button>
          </div>
        </div>

        {whatIfOpen && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-[#EEF2F6] dark:border-[#222938]">
            {/* 3 ползунка чувствительности (7 колонок) */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Ползунок 1: Розничная цена WB */}
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#475569] dark:text-[#94A3B8]">
                    Розничная цена WB
                  </span>
                  <span
                    className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                      whatIfPriceDelta > 0
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : whatIfPriceDelta < 0
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7]'
                    }`}
                  >
                    {whatIfPriceDelta > 0 ? `+${whatIfPriceDelta}%` : `${whatIfPriceDelta}%`}
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Изменение розничной цены WB"
                  min={-15}
                  max={20}
                  step={1}
                  value={whatIfPriceDelta}
                  onChange={(e) => setWhatIfPriceDelta(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10.5px] font-mono text-[#64748B]">
                  <span>−15%</span>
                  <span>0%</span>
                  <span>+20%</span>
                </div>
              </div>

              {/* Ползунок 2: Закупочная себестоимость */}
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#475569] dark:text-[#94A3B8]">
                    Себестоимость фабрик
                  </span>
                  <span
                    className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                      whatIfCostDelta < 0
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : whatIfCostDelta > 0
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7]'
                    }`}
                  >
                    {whatIfCostDelta > 0 ? `+${whatIfCostDelta}%` : `${whatIfCostDelta}%`}
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Изменение закупочной себестоимости"
                  min={-15}
                  max={25}
                  step={1}
                  value={whatIfCostDelta}
                  onChange={(e) => setWhatIfCostDelta(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10.5px] font-mono text-[#64748B]">
                  <span>−15%</span>
                  <span>0%</span>
                  <span>+25%</span>
                </div>
              </div>

              {/* Ползунок 3: Комиссия WB и ДРР */}
              <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#475569] dark:text-[#94A3B8]">
                    Комиссия WB и ДРР
                  </span>
                  <span
                    className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                      whatIfMpAdsDelta < 0
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : whatIfMpAdsDelta > 0
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7]'
                    }`}
                  >
                    {whatIfMpAdsDelta > 0
                      ? `+${whatIfMpAdsDelta} п.п.`
                      : `${whatIfMpAdsDelta} п.п.`}
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Изменение комиссии WB и ДРР"
                  min={-5}
                  max={10}
                  step={0.5}
                  value={whatIfMpAdsDelta}
                  onChange={(e) => setWhatIfMpAdsDelta(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10.5px] font-mono text-[#64748B]">
                  <span>−5 п.п.</span>
                  <span>0</span>
                  <span>+10 п.п.</span>
                </div>
              </div>
            </div>

            {/* Итог симуляции (5 колонок) */}
            <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 flex flex-col justify-between">
                <span className="text-[11px] font-medium text-[#64748B]">
                  Прибыль «Что если?»
                </span>
                <div className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  +{formatMln(whatIfSim.simulatedProfitRub)}
                </div>
                <span
                  className={`font-mono text-[11px] font-medium mt-1 ${
                    whatIfSim.profitDeltaRub >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {whatIfSim.profitDeltaRub >= 0 ? '↑ +' : '↓ −'}
                  {formatMln(Math.abs(whatIfSim.profitDeltaRub))} к базе
                </span>
              </div>

              <div className="rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-[#F8FAFC] dark:bg-[#181D2A] p-3.5 flex flex-col justify-between">
                <span className="text-[11px] font-medium text-[#64748B]">
                  Новая выручка
                </span>
                <div className="font-mono text-lg font-bold text-[#0F172A] dark:text-[#EDF0F7] mt-1">
                  {formatMln(whatIfSim.simulatedRevenueRub)}
                </div>
                <span className="font-mono text-[11px] text-[#64748B] mt-1">
                  Маржа: {whatIfSim.simulatedMarginPct.toFixed(1).replace('.', ',')}%
                </span>
              </div>

              <div className="col-span-2 sm:col-span-1 rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-[#F8FAFC] dark:bg-[#181D2A] p-3.5 flex flex-col justify-between">
                <span className="text-[11px] font-medium text-[#64748B]">
                  Пик своих денег и ROI
                </span>
                <div className="font-mono text-lg font-bold text-[#0F172A] dark:text-[#EDF0F7] mt-1">
                  {formatMln(whatIfSim.simulatedOwnCapitalRub)}
                </div>
                <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 mt-1">
                  {whatIfSim.simulatedRoiMult
                    ? `Отдача ROI ×${whatIfSim.simulatedRoiMult.toFixed(1).replace('.', ',')}`
                    : 'Реинвест из WB'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. СЕКЦИЯ «| КАБИНЕТЫ, 4 ВОЛНЫ ЗАКУПОК И КЭШФЛОУ ХОЛДИНГА» ПРЯМО НА ХОЛСТЕ */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-teal-500" />
            <h3 className="text-xs font-medium uppercase tracking-wider text-[#64748B]">
              Кабинеты холдинга (5) и Платёжный календарь 4 волн закупок
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setProcurementWavesOpen((v) => !v)}
              className={`h-7.5 px-3 rounded-lg border text-xs font-medium transition cursor-pointer inline-flex items-center gap-1.5 ${
                procurementWavesOpen
                  ? 'border-indigo-500/35 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                  : 'border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              <span>📦 4 волны закупок {procurementWavesOpen ? '▴' : '▾'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMonthlyCashflowOpen((v) => !v)}
              className="h-7.5 px-3 rounded-lg border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] text-xs font-medium text-[#64748B] hover:text-[#0F172A] transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>{monthlyCashflowOpen ? 'Скрыть Cashflow ▴' : 'График денег 12 мес. ▾'}</span>
            </button>

            <button
              type="button"
              onClick={() => setCabinetsMatrixOpen((v) => !v)}
              className="h-7.5 px-3 rounded-lg border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] text-xs font-medium text-[#64748B] hover:text-[#0F172A] transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{cabinetsMatrixOpen ? 'Свернуть таблицу ▴' : 'Показать таблицу ▾'}</span>
            </button>
          </div>
        </div>

        {/* ВИЗУАЛЬНЫЙ ПЛАТЁЖНЫЙ КАЛЕНДАРЬ 4 ВОЛН ЗАКУПОК (GANTT TIMELINE & CASH-GAP RADAR) */}
        {procurementWavesOpen && (
          <div className="rounded-2xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-[#0F172A] dark:text-[#EDF0F7]">
                  Платёжный календарь 4 волн закупок 2027 · Авансы 30%, доплаты 70% и реинвест из выручки WB
                </div>
                <div className="text-[11.5px] text-[#64748B] mt-0.5">
                  С Волны №3 закупки полностью финансируются из оборотных поступлений Wildberries без привлечения новых собственных средств
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('roadmap-tasks')}
                className="h-7.5 px-3 rounded-lg bg-[#F1F5F9] dark:bg-[#181D2A] hover:bg-[#E2E8F0] text-xs font-medium text-[#0F172A] dark:text-[#EDF0F7] transition cursor-pointer"
              >
                Открыть 03 · Закупки →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
              {procurementWavesTimeline.map((wave) => {
                const isSelfFunded = wave.fundingTone === 'emerald';
                return (
                  <div
                    key={wave.id}
                    onClick={() => onNavigateSection('roadmap-tasks')}
                    className="relative overflow-hidden rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-[#F8FAFC]/70 dark:bg-[#181D2A] p-4 flex flex-col justify-between gap-3 cursor-pointer hover-lift"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          {wave.waveNum}
                        </span>
                        <span
                          className={`font-mono text-[10.5px] font-medium px-2 py-0.5 rounded-md ${
                            isSelfFunded
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                          }`}
                        >
                          {wave.sharePct}% бюджета
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-[#0F172A] dark:text-[#EDF0F7]">
                        {wave.title}
                      </div>
                      <div className="font-mono text-xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                        {formatMln(wave.budgetRub)}
                      </div>
                    </div>

                    <div className="space-y-2 text-[11.5px] text-[#64748B]">
                      <div className="flex items-center justify-between">
                        <span>Аванс 30% ({wave.orderWindow}):</span>
                        <strong className="font-mono text-[#0F172A] dark:text-[#EDF0F7]">
                          {formatMln(wave.prepayRub)}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Доплата 70% ({wave.arrivalMonth}):</span>
                        <strong className="font-mono text-[#0F172A] dark:text-[#EDF0F7]">
                          {formatMln(wave.balanceRub)}
                        </strong>
                      </div>

                      {/* 12-месячный мини-Gantt покрытия волны */}
                      <div className="pt-1">
                        <div className="grid grid-cols-12 gap-0.5 h-2 rounded overflow-hidden bg-[#E2E8F0] dark:bg-[#222938]">
                          {MONTHS_SHORT_RU.map((mName, mIdx) => {
                            const isCovered = wave.coverageMonths.includes(mIdx);
                            const isOrder = wave.orderMonthIdx === mIdx;
                            return (
                              <div
                                key={mName}
                                title={`${mName}: ${
                                  isCovered
                                    ? 'Продажи партии на WB'
                                    : isOrder
                                    ? 'Размещение заказа и аванс 30%'
                                    : ''
                                }`}
                                className={`h-full ${
                                  isCovered
                                    ? isSelfFunded
                                      ? 'bg-emerald-500'
                                      : 'bg-indigo-500'
                                    : isOrder
                                    ? 'bg-amber-400'
                                    : 'bg-transparent'
                                }`}
                              />
                            );
                          })}
                        </div>
                      </div>

                      <div
                        className={`text-[11px] font-medium pt-0.5 ${
                          isSelfFunded
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-[#475569] dark:text-[#94A3B8]'
                        }`}
                      >
                        {wave.fundingLabel}
                      </div>
                    </div>

                    <div
                      className={`absolute inset-x-0 bottom-0 h-[3px] ${
                        isSelfFunded ? 'bg-emerald-500/80' : 'bg-indigo-500/80'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {cabinetsMatrixOpen && (
          <BrandCabinetsMatrixTable
            multiBrandSummary={multiBrandSummary}
            scenarios={scenarios}
            activeBrandFilter={activeBrandFilter}
            onSelectBrandFilter={onSelectBrandFilter}
            onSelectScenarioForBrand={onSelectScenarioForBrand}
            onSelectActiveScenarioId={onSelectActiveScenarioId}
            onOpenCreateScenarioForBrand={onOpenCreateScenarioForBrand}
            onOpenCreateModelForBrand={onOpenCreateModelForBrand}
            onLaunchStarterCabinet={onLaunchStarterCabinet}
            onLaunchAllCabinets={onLaunchAllCabinets}
            onResetStarterCabinets={onResetStarterCabinets}
          />
        )}

        {monthlyCashflowOpen && (
          <div className="overflow-x-auto rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4">
            <div className="text-xs font-medium text-[#64748B] mb-2.5">
              {selectedBrandRow
                ? `Помесячный денежный поток · ${selectedBrandRow.displayCode} (12 мес., млн ₽)`
                : 'Помесячный денежный поток холдинга BORNERS GROUP (12 мес., млн ₽)'}
            </div>
            <table className="w-full min-w-[780px] text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-[#E2E6EE] dark:border-[#222938] text-[#64748B]">
                  <th className="py-2 px-2.5 font-medium">Показатель</th>
                  {gt.monthlyRows.map((m) => (
                    <th key={m.monthIdx} className="py-2 px-1.5 text-right font-medium">
                      {m.monthLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF2F6] dark:divide-[#222938] font-mono">
                <tr>
                  <td className="py-2 px-2.5 font-sans font-medium text-[#0F172A] dark:text-[#EDF0F7]">
                    Продажи (выкупы WB, млн ₽)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-2 px-1.5 text-right">
                      {(m.grossSalesRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-2.5 font-sans font-medium text-emerald-600 dark:text-emerald-400">
                    + Поступления от WB (млн ₽)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-2 px-1.5 text-right text-emerald-600 dark:text-emerald-400">
                      +{(m.wbNetInflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-2.5 font-sans font-medium text-rose-600 dark:text-rose-400">
                    − Оплаты фабрикам (млн ₽)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-2 px-1.5 text-right text-rose-600 dark:text-rose-400">
                      −{(m.factoryTotalOutflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
                <tr className="font-semibold">
                  <td className="py-2 px-2.5 font-sans text-[#0F172A] dark:text-[#EDF0F7]">
                    Накопленный баланс денег
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-2 px-1.5 text-right text-[#0F172A] dark:text-[#EDF0F7]">
                      {(m.cumulativeCashBalanceRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. СПОКОЙНЫЙ БЫСТРЫЙ ПЕРЕХОД ПО РАЗДЕЛАМ (ТОЛЬКО НА ГЛАВНОЙ) */}
      {isStandaloneHome && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-slate-400" />
            <h3 className="text-xs font-medium uppercase tracking-wider text-[#64748B]">
              Операционные контуры
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <button
              type="button"
              onClick={() => onOpenStrategySummary?.()}
              className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 p-4 text-left cursor-pointer hover-lift flex flex-col justify-between gap-2 transition"
            >
              <div>
                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Сводка · Сценарии
                </div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-[#EDF0F7] mt-1">
                  Стратегия и 4 сценария
                </div>
              </div>
              <div className="text-xs text-[#64748B] flex items-center justify-between">
                <span>Матрица 2027</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">Открыть →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSection('product-catalog')}
              className="rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 text-left cursor-pointer hover-lift flex flex-col justify-between gap-2 transition"
            >
              <div>
                <div className="text-xs font-medium text-[#64748B]">01 · Продукт</div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-[#EDF0F7] mt-1">
                  Каталог и группы SKU
                </div>
              </div>
              <div className="text-xs text-[#64748B] flex items-center justify-between">
                <span className="font-mono">{gt.modelsCount} SKU</span>
                <span className="text-emerald-600 dark:text-emerald-400">Перейти →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSection('launch-calendar')}
              className="rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 text-left cursor-pointer hover-lift flex flex-col justify-between gap-2 transition"
            >
              <div>
                <div className="text-xs font-medium text-[#64748B]">02 · Продажи</div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-[#EDF0F7] mt-1">
                  План продаж 12 мес.
                </div>
              </div>
              <div className="text-xs text-[#64748B] flex items-center justify-between">
                <span className="font-mono">{formatMln(gt.annualRevenueRub)}</span>
                <span className="text-emerald-600 dark:text-emerald-400">Перейти →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSection('roadmap-tasks')}
              className="rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 text-left cursor-pointer hover-lift flex flex-col justify-between gap-2 transition"
            >
              <div>
                <div className="text-xs font-medium text-[#64748B]">03 · Закупки</div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-[#EDF0F7] mt-1">
                  Партии и фабрики PO
                </div>
              </div>
              <div className="text-xs text-[#64748B] flex items-center justify-between">
                <span className="font-mono">{formatMln(gt.totalProcurementBudgetRub)}</span>
                <span className="text-emerald-600 dark:text-emerald-400">Перейти →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSection('finance')}
              className="rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 text-left cursor-pointer hover-lift flex flex-col justify-between gap-2 transition"
            >
              <div>
                <div className="text-xs font-medium text-[#64748B]">04 · Финансы</div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-[#EDF0F7] mt-1">
                  P&L и рентабельность
                </div>
              </div>
              <div className="text-xs text-[#64748B] flex items-center justify-between">
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  +{formatMln(gt.annualEstimatedOperatingProfitRub)}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">Перейти →</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// 2. РАЗДЕЛЬНЫЕ КАТАЛОГИ ПО БРЕНДАМ И ГРУППИРОВКА ТОВАРОВ (КАК НА СКРИНЕ 2, НО КРАСИВЕЕ)
//    + ПРЯМОЕ РАЗБИЕНИЕ ПО ПАРТИЯМ И ДАТАМ ЗАКАЗА
// =============================================================================
export interface PeaklyCatalogGroupsAndBrandsProps {
  models: ScenarioModelSpec[];
  filteredModels: ScenarioModelSpec[];
  currentScenario: GrowthScenarioDef;
  scenarios: GrowthScenarioDef[];
  brandFilter: string;
  onSelectBrandFilter: (brandCode: string) => void;
  multiBrandSummary?: MultiBrandPortfolioSummaryResult;
  selectedScenarioByBrand?: Partial<Record<CanonicalBrandCode, number | null>>;
  onSelectScenarioForBrand?: (brandCode: string, scenarioId: number | null) => void;
  onSelectActiveScenarioId?: (scenarioId: number) => void;
  onOpenCreateScenarioForBrand?: (brandCode: CanonicalBrandCode, defaultTitle: string) => void;
  onOpenModelPassport: (modelId: string) => void;
  onUpdateModel: (updated: ScenarioModelSpec) => void;
  onDeleteModel?: (model: ScenarioModelSpec) => void;
  onOpenCreateModel: (defaultBrandCode?: string) => void;
  onQuickAdjustDecPacks?: (
    model: ScenarioModelSpec,
    nextDecPacks: number,
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>
  ) => void;
  onCyclePriority?: (model: ScenarioModelSpec, e: React.MouseEvent) => void;
  onLaunchStarterCabinet?: (brandCode: 'AKUSHA' | 'LISKANI' | 'NA_TELE') => void;
  onLaunchAllCabinets?: () => void;
  onResetStarterCabinets?: () => void;
  notify?: (type: 'success' | 'warning' | 'error', title: string, desc?: string) => void;
}

export function PeaklyCatalogGroupsAndBrandsView({
  models,
  filteredModels,
  currentScenario,
  scenarios,
  brandFilter,
  onSelectBrandFilter,
  multiBrandSummary,
  selectedScenarioByBrand,
  onSelectScenarioForBrand,
  onSelectActiveScenarioId,
  onOpenCreateScenarioForBrand,
  onOpenModelPassport,
  onUpdateModel,
  onDeleteModel,
  onOpenCreateModel,
  onQuickAdjustDecPacks,
  onCyclePriority,
  onLaunchStarterCabinet,
  onLaunchAllCabinets,
  onResetStarterCabinets,
  notify,
}: PeaklyCatalogGroupsAndBrandsProps) {
  // Режим отображения:
  // 'groups' = Группы товаров (папки с раскрытием и настройками, как на 2-м скрине)
  // 'brands' = Раздельные каталоги по брендам (BORNERS / НА ТЕЛЕ / FUKAI / AKUSHA / LISCANI)
  // 'grid'   = Плитка карточек
  const [displayMode, setDisplayMode] = useState<'groups' | 'brands' | 'grid'>('groups');

  const [groups, setGroups] = useState<ProductGroupDef[]>(() =>
    loadProductGroups(models)
  );
  const [expandedGroupIds, setExpandedGroupIds] = useState<Record<string, boolean>>({
    'grp-borners-wb-base': true,
    'grp-borners-boxers-4pack': false,
  });

  // Модальное окно создания / настройки группы товаров
  const [editingGroup, setEditingGroup] = useState<ProductGroupDef | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [draftGroupTitle, setDraftGroupTitle] = useState('');
  const [draftGroupSubtitle, setDraftGroupSubtitle] = useState('');
  const [draftGroupBrand, setDraftGroupBrand] = useState<CanonicalBrandCode | 'ALL'>('BORNERS');
  const [draftGroupModelIds, setDraftGroupModelIds] = useState<string[]>([]);
  const [groupSkuSearch, setGroupSkuSearch] = useState('');

  // Модальное окно быстрого разбиения по партиям и выбора дат заказа для любой модели
  const [batchEditorModelId, setBatchEditorModelId] = useState<string | null>(null);

  useEffect(() => {
    const syncGroups = () => {
      setGroups(loadProductGroups(models));
    };
    window.addEventListener('borners-product-groups-changed', syncGroups);
    return () => window.removeEventListener('borners-product-groups-changed', syncGroups);
  }, [models]);

  const commitGroups = (nextGroups: ProductGroupDef[]) => {
    setGroups(nextGroups);
    saveProductGroups(nextGroups);
  };

  // Карта активных сценариев по каждому бренду (у каждого бренда — свой сценарий развития)
  const scenarioByBrandMap = useMemo(() => {
    const map: Partial<Record<CanonicalBrandCode, GrowthScenarioDef>> = {};
    const codes: CanonicalBrandCode[] = ['BORNERS', 'NA_TELE', 'FUKAI', 'AKUSHA', 'LISKANI'];
    for (const bCode of codes) {
      const selId = selectedScenarioByBrand?.[bCode];
      if (typeof selId === 'number') {
        const found = scenarios.find((s) => s.id === selId);
        if (found) {
          map[bCode] = found;
          continue;
        }
      }
      map[bCode] = currentScenario;
    }
    return map;
  }, [selectedScenarioByBrand, scenarios, currentScenario]);

  // Группы с фильтрацией по выбранному кабинету / бренду (с учётом сценария каждого бренда)
  const visibleGroupsWithMetrics = useMemo(() => {
    const normFilter =
      brandFilter === 'ALL' ? 'ALL' : normalizePortfolioBrandCode(brandFilter);

    return groups
      .filter((g) => {
        if (normFilter === 'ALL') return true;
        if (g.brandCode === normFilter) return true;
        const grpScen =
          g.brandCode !== 'ALL'
            ? scenarioByBrandMap[g.brandCode] || currentScenario
            : currentScenario;
        const mList = computeProductGroupMetrics(g, models, grpScen).models;
        return mList.some((m) => matchesBrandFilter(m, normFilter));
      })
      .map((g) => {
        const grpScen =
          g.brandCode !== 'ALL'
            ? scenarioByBrandMap[g.brandCode] || currentScenario
            : currentScenario;
        return {
          ...computeProductGroupMetrics(g, models, grpScen),
          activeScenario: grpScen,
        };
      });
  }, [groups, brandFilter, models, scenarioByBrandMap, currentScenario]);

  // Раздельные каталоги по каждому бренду (каждый бренд считает показатели по своему сценарию)
  const brandSections = useMemo(() => {
    const allSections = buildBrandCatalogSections(
      models,
      scenarioByBrandMap,
      currentScenario
    );
    if (brandFilter === 'ALL') return allSections;
    const norm = normalizePortfolioBrandCode(brandFilter);
    return allSections.filter((s) => s.brandCode === norm);
  }, [models, scenarioByBrandMap, currentScenario, brandFilter]);

  const openCreateGroupModal = () => {
    const defaultBrand =
      brandFilter === 'ALL' ? 'BORNERS' : normalizePortfolioBrandCode(brandFilter);
    setEditingGroup(null);
    setDraftGroupTitle('');
    setDraftGroupSubtitle('');
    setDraftGroupBrand(defaultBrand);
    setDraftGroupModelIds([]);
    setGroupSkuSearch('');
    setGroupModalOpen(true);
  };

  const openEditGroupModal = (grp: ProductGroupDef) => {
    setEditingGroup(grp);
    setDraftGroupTitle(grp.title);
    setDraftGroupSubtitle(grp.subtitle || '');
    setDraftGroupBrand(grp.brandCode);
    const resolvedIds = models
      .filter(
        (m) =>
          grp.modelIds.includes(m.id) ||
          grp.modelCodes.some((c) => c.toUpperCase() === m.code.toUpperCase())
      )
      .map((m) => m.id);
    setDraftGroupModelIds(resolvedIds);
    setGroupSkuSearch('');
    setGroupModalOpen(true);
  };

  const handleSaveGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = draftGroupTitle.trim() || 'Новая группа товаров';
    const selectedModels = models.filter((m) => draftGroupModelIds.includes(m.id));
    const unitCfg =
      draftGroupBrand === 'ALL'
        ? null
        : getBrandUnitConfig(draftGroupBrand);
    const cabinetLabel = unitCfg ? `${unitCfg.displayCode} · WB` : 'Все кабинеты · WB';

    if (editingGroup) {
      const updated = groups.map((g) =>
        g.id === editingGroup.id
          ? {
              ...g,
              title: cleanTitle,
              subtitle: draftGroupSubtitle.trim(),
              brandCode: draftGroupBrand,
              cabinetLabel,
              modelIds: selectedModels.map((m) => m.id),
              modelCodes: selectedModels.map((m) => m.code),
            }
          : g
      );
      commitGroups(updated);
      notify?.('success', 'Группа обновлена', `«${cleanTitle}» (${selectedModels.length} артикулов)`);
    } else {
      const newGroup: ProductGroupDef = {
        id: `grp-${Date.now().toString(36)}`,
        title: cleanTitle,
        subtitle:
          draftGroupSubtitle.trim() ||
          'Пользовательская группа артикулов для совместной аналитики',
        brandCode: draftGroupBrand,
        cabinetLabel,
        modelIds: selectedModels.map((m) => m.id),
        modelCodes: selectedModels.map((m) => m.code),
        createdAt: new Date().toISOString().slice(0, 10),
      };
      commitGroups([newGroup, ...groups]);
      setExpandedGroupIds((prev) => ({ ...prev, [newGroup.id]: true }));
      notify?.('success', 'Группа создана', `«${cleanTitle}» (${selectedModels.length} артикулов)`);
    }
    setGroupModalOpen(false);
  };

  const handleDeleteGroup = (grp: ProductGroupDef) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Удалить группу «${grp.title}»? Сами карточки артикулов останутся в каталоге.`
      )
    ) {
      return;
    }
    commitGroups(groups.filter((g) => g.id !== grp.id));
    notify?.('warning', `Группа «${grp.title}» удалена`);
  };

  const handleResetDefaultGroups = () => {
    const defaults = buildDefaultProductGroups(models);
    commitGroups(defaults);
    notify?.('success', 'Восстановлены стандартные группы по брендам и линейкам');
  };

  const batchEditorModel = useMemo(
    () =>
      batchEditorModelId
        ? models.find((m) => m.id === batchEditorModelId) || null
        : null,
    [models, batchEditorModelId]
  );

  // Рендер одной карточки SKU с кнопкой «Партии и даты»
  const renderModelCard = (
    mod: ScenarioModelSpec,
    modIdx: number,
    scenarioOverride?: GrowthScenarioDef
  ) => {
    const modBrandCode = normalizePortfolioBrandCode(
      detectModelBrandPortfolioLabel(mod)
    );
    const activeScen =
      scenarioOverride ||
      (modBrandCode !== 'ALL' ? scenarioByBrandMap[modBrandCode] : undefined) ||
      currentScenario;
    const met = computeModelScenarioMetrics(mod, activeScen);
    const proc = computeProcurementPlan(mod, activeScen);
    const mainGallery = mod.gallery.find((g) => g.isMain) || mod.gallery[0];
    const colors = mod.palettes[0]?.colors || [];
    const actingMeta = getActingSkuByWbOrVendor(mod.code, mod.title);
    const priorityLabel = getModelPriority(mod);
    const displayBrand = detectModelBrandPortfolioLabel(mod);
    const accent = getModelBrandAccentStyles(displayBrand);
    const unitCfg = getBrandUnitConfig(mod);
    const maxModMonthRev = Math.max(1, ...met.monthlyRevenuesRub);

    const confirmedPos = proc.approvedOrders.filter((o) => o.confirmedByFactory !== false);
    const totalBatches = confirmedPos.length + proc.recommendedBatches.length;
    const firstDraft = proc.recommendedBatches[0];
    const nextOrderDate =
      confirmedPos[0]?.orderPlacementDateIso || firstDraft?.recommendedOrderDateIso || null;

    return (
      <div
        key={mod.id}
        role="button"
        tabIndex={0}
        onClick={() => onOpenModelPassport(mod.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenModelPassport(mod.id);
          }
        }}
        className="group relative rounded-[15px] bg-white border border-[#DCDAD0] hover:border-[#94A3B8] p-4 text-left transition-all cursor-pointer flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-6px_rgba(15,23,42,0.08)]"
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`px-2 py-0.5 rounded-[5px] font-mono text-[10px] font-bold border ${accent.badgeBg} ${accent.badgeText} ${accent.badgeBorder}`}
              >
                {displayBrand}
              </span>
              <span className="font-mono text-[11px] font-bold text-[#52514C] truncate">
                {actingMeta ? `WB ${actingMeta.wbSku}` : mod.code}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="px-2 py-0.5 rounded-[5px] text-[10px] font-bold bg-[#F4F3EE] text-[#52514C] border border-[#DFDED7]">
                {mod.modelStageStatus || mod.launchStatus}
              </span>
              {onDeleteModel && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteModel(mod);
                  }}
                  title={`Удалить карточку ${mod.code}`}
                  className="h-5 w-5 rounded-[5px] opacity-0 group-hover:opacity-100 bg-white hover:bg-rose-50 border border-[#CECDC4] flex items-center justify-center text-[#686762] hover:text-rose-700 text-[12px] font-bold cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="relative rounded-[12px] bg-[radial-gradient(circle_at_50%_40%,#FFFFFF_0%,#F3F2EC_100%)] border border-[#E6E5DD] p-2.5 mb-3 overflow-hidden">
            <div className="transition-transform duration-200 group-hover:scale-[1.03]">
              <BoxerPackStackSvg
                colors={colors}
                brandLabel={displayBrand === 'НА ТЕЛЕ' ? 'НА ТЕЛЕ' : 'BORNERS'}
                customPhotoUrl={mainGallery?.url}
              />
            </div>
            <span className="absolute bottom-2 left-2 rounded-md bg-white/95 backdrop-blur-xs border border-[#DFDED7] px-2 py-0.5 font-mono text-[10px] font-bold text-[#1E293B]">
              {mod.unitsInPack} {unitCfg.secondaryUnit} · {met.avgRetailPriceRub.toLocaleString('ru-RU')} ₽
            </span>
            <span className="absolute bottom-2 right-2 rounded-md bg-[#ECFDF5]/95 border border-[#A7F3D0] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#065F46]">
              маржа {met.unitMarginPct.toFixed(0)}%
            </span>
          </div>

          <div className="text-[15px] font-extrabold text-[#141413] group-hover:underline leading-snug">
            {mod.title}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-[#686760] truncate">{mod.subtitle}</span>
            {onCyclePriority && !actingMeta ? (
              <button
                type="button"
                onClick={(e) => onCyclePriority(mod, e)}
                className="shrink-0 px-2 py-0.5 rounded-[5px] text-[10px] font-bold bg-[#FAF9F6] hover:border-[#141413] text-[#262624] border border-[#CFCEC6] cursor-pointer"
              >
                {priorityLabel}
              </button>
            ) : (
              <span className="shrink-0 font-mono text-[10.5px] font-semibold text-[#52514C]">
                {met.annualPacks.toLocaleString('ru-RU')} {unitCfg.primaryUnit}/год
              </span>
            )}
          </div>

          {/* Мини-спарклайн 12 мес. */}
          <div className="mt-2.5 rounded-[8px] bg-[#FAF9F6] border border-[#ECEBE4] px-2.5 py-1.5 flex items-end justify-between gap-1 h-7">
            {met.monthlyRevenuesRub.map((mRev, mIdx) => {
              const hPx = Math.max(3, Math.round((mRev / maxModMonthRev) * 16));
              return (
                <div
                  key={mIdx}
                  style={{ height: `${hPx}px` }}
                  title={`${MONTHS_SHORT_RU[mIdx]}: ${(mRev / 1_000_000).toFixed(2)} млн ₽`}
                  className={`flex-1 rounded-[2px] ${
                    mIdx === 11 ? 'bg-emerald-600' : 'bg-[#C8C7BE]'
                  }`}
                />
              );
            })}
          </div>

          {/* Полоса партий и дат заказа прямо на карточке */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              setBatchEditorModelId(mod.id);
            }}
            className="mt-2 rounded-[8px] border border-[#E2E1D9] bg-[#FAF9F6] hover:bg-[#EFEFE9] hover:border-[#141413] px-2.5 py-1.5 flex items-center justify-between gap-2 transition cursor-pointer"
            title="Нажмите, чтобы разбить по партиям и указать даты заказа"
          >
            <div className="text-[10.5px] text-[#52514C] truncate">
              <strong className="text-[#141413]">{totalBatches} парт.</strong> · Заказ до:{' '}
              <span className="font-mono font-semibold text-[#141413]">
                {formatShortDateRu(nextOrderDate)}
              </span>
            </div>
            <span className="text-[10.5px] font-bold text-[#157347] shrink-0">
              Партии и даты ▸
            </span>
          </div>
        </div>

        {/* Нижняя плашка: Выручка и быстрый степпер декабря */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-3 pt-2.5 border-t border-[#EAE9E2] flex items-center justify-between gap-2"
        >
          <div>
            <div className="font-mono text-[14.5px] font-extrabold text-[#141413] leading-tight">
              {(met.targetMonthRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽{' '}
              <span className="font-sans text-[10px] font-medium text-[#686760]">/ дек</span>
            </div>
            <div className="text-[11px] text-[#686760] mt-0.5">
              Год:{' '}
              <strong className="font-mono text-[#141413]">
                {(met.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽
              </strong>
            </div>
          </div>

          {onQuickAdjustDecPacks && (
            <div className="inline-flex items-center gap-0.5 bg-[#FAF9F6] border border-[#CFCEC6] rounded-[8px] px-1 py-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) =>
                  onQuickAdjustDecPacks(mod, Math.max(0, met.targetMonthPacks - 200), e)
                }
                className="h-6 w-5 rounded text-[13px] font-bold text-[#3F3E3A] hover:bg-white cursor-pointer"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                step={100}
                value={met.targetMonthPacks}
                onChange={(e) =>
                  onQuickAdjustDecPacks(mod, Number(e.target.value) || 0, e)
                }
                className="w-13 text-center font-mono text-[11px] font-bold text-[#141413] bg-transparent"
              />
              <button
                type="button"
                onClick={(e) =>
                  onQuickAdjustDecPacks(mod, met.targetMonthPacks + 200, e)
                }
                className="h-6 w-5 rounded text-[13px] font-bold text-[#3F3E3A] hover:bg-white cursor-pointer"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* КОМПАКТНАЯ ПАНЕЛЬ РЕЖИМОВ ОТОБРАЖЕНИЯ КАТАЛОГА (БЕЗ ДУБЛИРУЮЩИХ СЕЛЕКТОРОВ) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="inline-flex flex-wrap items-center rounded-[11px] bg-[#EEF1F6] border border-[#D8DEE8] p-1 text-[12px] font-semibold">
          <button
            type="button"
            onClick={() => setDisplayMode('groups')}
            className={`h-8 px-3.5 rounded-[8px] transition cursor-pointer inline-flex items-center gap-1.5 ${
              displayMode === 'groups'
                ? 'bg-white text-[#111827] shadow-[0_1px_3px_rgba(15,23,42,0.08)] border border-[#CBD5E1]'
                : 'text-[#64748B] hover:text-[#111827]'
            }`}
          >
            <Folder className="h-3.5 w-3.5 text-[#334155]" />
            <span>Группы товаров ({visibleGroupsWithMetrics.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('brands')}
            className={`h-8 px-3.5 rounded-[8px] transition cursor-pointer inline-flex items-center gap-1.5 ${
              displayMode === 'brands'
                ? 'bg-white text-[#111827] shadow-[0_1px_3px_rgba(15,23,42,0.08)] border border-[#CBD5E1]'
                : 'text-[#64748B] hover:text-[#111827]'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-[#334155]" />
            <span>Раздельные каталоги брендов ({brandSections.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('grid')}
            className={`h-8 px-3.5 rounded-[8px] transition cursor-pointer ${
              displayMode === 'grid'
                ? 'bg-white text-[#111827] shadow-[0_1px_3px_rgba(15,23,42,0.08)] border border-[#CBD5E1]'
                : 'text-[#64748B] hover:text-[#111827]'
            }`}
          >
            Все карточки ({filteredModels.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {displayMode === 'groups' && (
            <>
              <button
                type="button"
                onClick={handleResetDefaultGroups}
                className="h-8 px-3 rounded-[9px] border border-[#DCE2EC] bg-[#F8FAFC] hover:bg-white text-[11.5px] font-semibold text-[#475569] cursor-pointer"
                title="Сбросить к авто-группировке по брендам и линейкам"
              >
                ↺ Авто-группы
              </button>
              <button
                type="button"
                onClick={openCreateGroupModal}
                className="h-8 px-3.5 rounded-[9px] bg-[#2C3444] hover:bg-[#1E2430] text-white text-[12px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Добавить группу</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* =====================================================================
          РЕЖИМ 1: ГРУППЫ ТОВАРОВ
         ===================================================================== */}
      {displayMode === 'groups' && (
        <div className="space-y-3">
          {visibleGroupsWithMetrics.map((gm) => {
            const { group } = gm;
            const isExpanded = Boolean(expandedGroupIds[group.id]);

            return (
              <div
                key={group.id}
                className="rounded-[16px] bg-white border border-[#CFD6E0] hover:border-[#94A3B8] transition-all overflow-hidden shadow-[0_2px_8px_-2px_rgba(15,23,42,0.04)]"
              >
                {/* Строка-папка группы товаров */}
                <div
                  onClick={() =>
                    setExpandedGroupIds((prev) => ({
                      ...prev,
                      [group.id]: !prev[group.id],
                    }))
                  }
                  className="px-5 py-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-[#F8FAFC] transition"
                >
                  {/* Иконка папки + Название группы + Бейдж количества артикулов + Бренд */}
                  <div className="flex items-center gap-3.5 min-w-[260px] flex-1">
                    <div className="h-10 w-10 rounded-[11px] border border-[#DCE2EC] bg-[#F4F6F9] text-[#334155] flex items-center justify-center shrink-0">
                      {isExpanded ? (
                        <FolderOpen className="h-4.5 w-4.5 text-[#111827]" />
                      ) : (
                        <Folder className="h-4.5 w-4.5 text-[#64748B]" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-extrabold text-[#111827]">
                          {group.title}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-[6px] bg-[#EEF1F6] font-mono text-[11px] font-bold text-[#334155]">
                          {gm.modelsCount} SKU
                        </span>
                        <span className="px-2 py-0.5 rounded-[6px] font-mono text-[10px] font-semibold bg-white border border-[#DCE2EC] text-[#64748B]">
                          {group.cabinetLabel}
                        </span>
                      </div>
                      {group.subtitle && (
                        <p className="text-[12px] text-[#64748B] mt-0.5 truncate">
                          {group.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Сводные показатели группы — чистые 2-строчные колонки без визуального перегруза */}
                  <div className="flex flex-wrap items-center gap-6 text-right">
                    <div>
                      <div className="text-[10.5px] font-medium text-[#64748B]">
                        Выручка за год
                      </div>
                      <div className="font-mono text-[14px] font-extrabold text-[#111827]">
                        {formatMln(gm.annualRevenueRub)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10.5px] font-medium text-[#64748B]">
                        Закупка ({gm.totalBatchesCount} парт.)
                      </div>
                      <div className="font-mono text-[14px] font-bold text-[#111827]">
                        {gm.procurementPacks.toLocaleString('ru-RU')} {gm.primaryUnit}
                      </div>
                    </div>

                    <div className="hidden sm:block">
                      <div className="text-[10.5px] font-medium text-[#64748B]">
                        Старт Q1 (маржа {gm.avgMarginPct}%)
                      </div>
                      <div className="font-mono text-[14px] font-bold text-[#059669]">
                        {formatMln(gm.firstWaveStartRub)}
                      </div>
                    </div>

                    {/* Кнопки управления группой («Настройки» + Корзина + Стрелка раскрытия) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 pl-3 border-l border-[#EAEEF4]"
                    >
                      <button
                        type="button"
                        onClick={() => openEditGroupModal(group)}
                        className="h-8.5 px-3 rounded-[9px] border border-[#DCE2EC] bg-white hover:bg-[#F4F6F9] hover:border-[#94A3B8] text-[12px] font-semibold text-[#334155] transition cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5 text-[#64748B]" />
                        <span>Настроить</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(group)}
                        title="Удалить группу"
                        className="h-8.5 w-8.5 rounded-[9px] border border-transparent hover:border-rose-200 hover:bg-rose-50 text-[#94A3B8] hover:text-rose-700 flex items-center justify-center transition cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroupIds((prev) => ({
                            ...prev,
                            [group.id]: !prev[group.id],
                          }))
                        }
                        className="h-8.5 w-8.5 rounded-[9px] bg-[#F4F6F9] hover:bg-[#E2E8F0] flex items-center justify-center text-[#334155] cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Раскрытое содержимое группы: карточки артикулов */}
                {isExpanded && (
                  <div className="p-4 md:p-5 bg-[#F4F6F9] border-t border-[#DCE2EC]">
                    {gm.models.length === 0 ? (
                      <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-white p-5 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[12.5px] text-[#64748B]">
                          В группе «{group.title}» пока не выбрано артикулов.
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditGroupModal(group)}
                            className="h-8 px-3 rounded-[8px] bg-[#2C3444] hover:bg-[#1E2430] text-white text-[11.5px] font-semibold cursor-pointer"
                          >
                            Выбрать артикулы для группы
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenCreateModel(
                                group.brandCode === 'ALL' ? 'BORNERS' : group.brandCode
                              )
                            }
                            className="h-8 px-3 rounded-[8px] border border-[#DCE2EC] bg-white text-[11.5px] font-semibold text-[#334155] cursor-pointer"
                          >
                            + Новый артикул
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        {gm.models.map((m, idx) =>
                          renderModelCard(m, idx, gm.activeScenario)
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          РЕЖИМ 2: РАЗДЕЛЬНЫЕ КАТАЛОГИ ПО БРЕНДАМ (КАЖДЫЙ БРЕНД В СВОЁМ КОНТЕЙНЕРЕ)
         ===================================================================== */}
      {displayMode === 'brands' && (
        <div className="space-y-6">
          {multiBrandSummary &&
            onSelectScenarioForBrand &&
            onSelectActiveScenarioId &&
            onOpenCreateScenarioForBrand && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div>
                    <div className="text-[13px] font-extrabold text-[#111827]">
                      Сводная матрица кабинетов и сценариев по 5 брендам BORNERS GROUP
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      Выберите индивидуальный сценарий для каждого бренда или нажмите на строку для фильтрации каталога
                    </div>
                  </div>
                  {brandFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => onSelectBrandFilter('ALL')}
                      className="h-7 px-2.5 rounded-[7px] bg-[#2C3444] text-white text-[11px] font-bold cursor-pointer transition"
                    >
                      Показать все 5 брендов ×
                    </button>
                  )}
                </div>
                <BrandCabinetsMatrixTable
                  multiBrandSummary={multiBrandSummary}
                  scenarios={scenarios}
                  activeBrandFilter={brandFilter}
                  onSelectBrandFilter={onSelectBrandFilter}
                  onSelectScenarioForBrand={onSelectScenarioForBrand}
                  onSelectActiveScenarioId={onSelectActiveScenarioId}
                  onOpenCreateScenarioForBrand={onOpenCreateScenarioForBrand}
                  onOpenCreateModelForBrand={(bCode) => onOpenCreateModel(bCode)}
                  onLaunchStarterCabinet={onLaunchStarterCabinet}
                  onLaunchAllCabinets={onLaunchAllCabinets}
                  onResetStarterCabinets={onResetStarterCabinets}
                />
              </div>
            )}

          {brandSections.map((sec) => {
            const accent = getModelBrandAccentStyles(sec.brandCode);
            return (
              <div
                key={sec.brandCode}
                className="rounded-[18px] bg-white border border-[#CFD6E0] overflow-hidden shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06)]"
              >
                {/* Шапка каталога конкретного бренда */}
                <div className="px-5 py-4 bg-[#F4F6F9] border-b border-[#DCE2EC] flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-1.5 rounded-full ${accent.accentBar}`} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[17px] font-extrabold text-[#111827]">
                          Каталог бренда {sec.displayCode}
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-[6px] font-mono text-[11px] font-bold border bg-white text-[#334155] border-[#CBD5E1]">
                          {sec.models.length} SKU · {sec.cabinetLabel}
                        </span>
                        <span className="text-[11.5px] font-medium text-[#64748B]">
                          {sec.categoryLabel} ({sec.primaryUnit} / {sec.secondaryUnit})
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#64748B] mt-0.5 flex flex-wrap items-center gap-3">
                        <span>
                          Продажи год: <strong className="font-mono text-[#111827]">{formatMln(sec.annualRevenueRub)}</strong> (дек: {formatMln(sec.decRevenueRub)})
                        </span>
                        <span>·</span>
                        <span>
                          Закупки: <strong className="font-mono text-[#111827]">{sec.procurementPacks.toLocaleString('ru-RU')} {sec.primaryUnit}</strong> ({formatMln(sec.procurementBudgetRub)})
                        </span>
                        <span>·</span>
                        <span>
                          Старт Q1: <strong className="font-mono text-[#111827]">{formatMln(sec.firstWaveStartRub)}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {onSelectScenarioForBrand && (
                      <div className="inline-flex items-center gap-1.5 rounded-[9px] bg-white border border-[#CBD5E1] px-2.5 py-1 text-[11.5px]">
                        <span className="text-[#64748B] font-medium">Сценарий:</span>
                        <select
                          value={
                            selectedScenarioByBrand?.[sec.brandCode] ??
                            sec.activeScenario.id
                          }
                          onChange={(e) => {
                            const raw = e.target.value;
                            const nextId = raw === '' ? null : Number(raw);
                            onSelectScenarioForBrand(sec.brandCode, nextId);
                            if (nextId !== null && onSelectActiveScenarioId) {
                              onSelectActiveScenarioId(nextId);
                            }
                          }}
                          className="font-bold text-[#111827] bg-transparent focus:outline-none cursor-pointer max-w-[190px]"
                        >
                          {getScenariosForBrand(scenarios, sec.brandCode).map((sc) => (
                            <option key={sc.id} value={sc.id}>
                              {sc.id === ACTING_2027_SCENARIO_ID
                                ? 'Исходный план 2027'
                                : `${sc.title} (${sc.year || 2027})`}
                            </option>
                          ))}
                        </select>
                        {onOpenCreateScenarioForBrand && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenCreateScenarioForBrand(
                                sec.brandCode,
                                `${sec.displayCode} — план развития 2027`
                              )
                            }
                            title={`Создать свой сценарий для ${sec.displayCode}`}
                            className="h-6 px-1.5 rounded bg-[#F4F6F9] hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[10.5px] font-bold text-[#334155] cursor-pointer"
                          >
                            + Свой
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenCreateModel(sec.brandCode)}
                      className="h-8.5 px-3.5 rounded-[9px] bg-[#2C3444] hover:bg-[#1E2430] text-white text-[12px] font-semibold transition cursor-pointer shrink-0 shadow-2xs"
                    >
                      + Добавить товар в {sec.displayCode}
                    </button>
                  </div>
                </div>

                {/* Сетка карточек этого бренда */}
                <div className="p-4 md:p-5">
                  {sec.models.length === 0 ? (
                    <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-center space-y-2">
                      <div className="text-[14px] font-bold text-[#111827]">
                        Каталог бренда {sec.displayCode} пока пуст
                      </div>
                      <p className="text-[12px] text-[#64748B] max-w-md mx-auto">
                        Запустите готовую стартовую матрицу ({sec.categoryLabel}, 3 SKU) в 1 клик или создайте первую позицию вручную («{sec.primaryUnit}»).
                      </p>
                      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                        {onLaunchStarterCabinet &&
                          (sec.brandCode === 'AKUSHA' ||
                            sec.brandCode === 'LISKANI' ||
                            sec.brandCode === 'NA_TELE') && (
                            <button
                              type="button"
                              onClick={() =>
                                onLaunchStarterCabinet(
                                  sec.brandCode as 'AKUSHA' | 'LISKANI' | 'NA_TELE'
                                )
                              }
                              className="h-8.5 px-4 rounded-[9px] bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold cursor-pointer shadow-2xs transition"
                            >
                              🚀 Запустить матрицу {sec.displayCode} (3 SKU)
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => onOpenCreateModel(sec.brandCode)}
                          className="h-8.5 px-4 rounded-[9px] bg-[#2C3444] hover:bg-[#1E2430] text-white text-[12px] font-semibold cursor-pointer shadow-2xs"
                        >
                          + Создать первую карточку {sec.displayCode}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {sec.models.map((m, idx) =>
                        renderModelCard(m, idx, sec.activeScenario)
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          РЕЖИМ 3: ПЛИТКА ВСЕХ КАРТОЧЕК
         ===================================================================== */}
      {displayMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredModels.map((mod, idx) => renderModelCard(mod, idx))}
          <button
            type="button"
            onClick={() =>
              onOpenCreateModel(brandFilter === 'ALL' ? 'BORNERS' : brandFilter)
            }
            className="rounded-[14px] border border-dashed border-[#C8C7BE] hover:border-[#141413] bg-[#FAF9F6] hover:bg-white p-6 flex flex-col items-center justify-center text-center gap-2 transition cursor-pointer min-h-[280px]"
          >
            <div className="text-[26px] font-light leading-none text-[#141413]">+</div>
            <div className="text-[14.5px] font-bold text-[#141413]">Добавить модель</div>
            <p className="text-[12px] text-[#686760] max-w-[200px]">
              Новая товарная позиция в каталог выбранного бренда
            </p>
          </button>
        </div>
      )}

      {/* =====================================================================
          МОДАЛЬНОЕ ОКНО: НАСТРОЙКИ ГРУППЫ ТОВАРОВ (СОЗДАНИЕ / ВЫБОР АРТИКУЛОВ)
         ===================================================================== */}
      {groupModalOpen && (
        <div
          onClick={() => setGroupModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveGroup}
            className="w-full max-w-xl rounded-[20px] bg-white border border-[#D8D7CE] p-6 space-y-4 shadow-2xl max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[18px] font-extrabold text-[#141413]">
                  {editingGroup ? 'Настройки группы товаров' : 'Создание группы товаров'}
                </h3>
                <p className="text-[12px] text-[#686760]">
                  Объединяйте артикулы по брендам и позициям для совместной аналитики продаж и закупок
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGroupModalOpen(false)}
                className="h-8 w-8 rounded-full hover:bg-[#FAF9F6] flex items-center justify-center cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11.5px] font-semibold text-[#141413]">
                  Название группы
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Боксеры 4-pack · База WB"
                  value={draftGroupTitle}
                  onChange={(e) => setDraftGroupTitle(e.target.value)}
                  className="w-full h-9 px-3 mt-1 rounded-[9px] border border-[#D8D7CE] text-[13px] font-semibold"
                />
              </div>
              <div>
                <label className="text-[11.5px] font-semibold text-[#141413]">
                  Кабинет / Бренд
                </label>
                <select
                  value={draftGroupBrand}
                  onChange={(e) =>
                    setDraftGroupBrand(
                      e.target.value === 'ALL'
                        ? 'ALL'
                        : normalizePortfolioBrandCode(e.target.value)
                    )
                  }
                  className="w-full h-9 px-2.5 mt-1 rounded-[9px] border border-[#D8D7CE] text-[12.5px] font-bold"
                >
                  <option value="BORNERS">BORNERS · WB</option>
                  <option value="NA_TELE">НА ТЕЛЕ · WB</option>
                  <option value="FUKAI">FUKAI · WB</option>
                  <option value="AKUSHA">AKUSHA · WB</option>
                  <option value="LISKANI">LISKANI · WB</option>
                  <option value="ALL">Все бренды</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11.5px] font-semibold text-[#141413]">
                Описание / комментарий к группе
              </label>
              <input
                type="text"
                placeholder="Например: Главные позиции мужской линейки"
                value={draftGroupSubtitle}
                onChange={(e) => setDraftGroupSubtitle(e.target.value)}
                className="w-full h-8.5 px-3 mt-1 rounded-[9px] border border-[#D8D7CE] text-[12.5px]"
              />
            </div>

            {/* Выбор артикулов в группу */}
            <div className="flex-1 min-h-0 flex flex-col space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-[#141413]">
                  Артикулы в группе ({draftGroupModelIds.length} выбрано)
                </span>
                <input
                  type="text"
                  value={groupSkuSearch}
                  onChange={(e) => setGroupSkuSearch(e.target.value)}
                  placeholder="Поиск артикула..."
                  className="h-7.5 px-2.5 rounded-[7px] border border-[#D8D7CE] text-[11.5px] w-48"
                />
              </div>

              <div className="overflow-y-auto max-h-[260px] rounded-[10px] border border-[#E4E3DC] divide-y divide-[#ECEBE4] bg-[#FAF9F6]">
                {models
                  .filter((m) => {
                    if (m.launchStatus === 'В архиве') return false;
                    const q = groupSkuSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      m.code.toLowerCase().includes(q) ||
                      m.title.toLowerCase().includes(q) ||
                      detectModelBrandPortfolioLabel(m).toLowerCase().includes(q)
                    );
                  })
                  .map((m) => {
                    const checked = draftGroupModelIds.includes(m.id);
                    const bLabel = detectModelBrandPortfolioLabel(m);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-white cursor-pointer text-[12px]"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setDraftGroupModelIds((prev) => [...prev, m.id]);
                              } else {
                                setDraftGroupModelIds((prev) =>
                                  prev.filter((id) => id !== m.id)
                                );
                              }
                            }}
                            className="rounded border-[#C8C7BE]"
                          />
                          <span className="font-mono text-[11px] font-bold text-[#52514C]">
                            {m.code}
                          </span>
                          <span className="font-bold text-[#141413] truncate">
                            {m.title}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-white border border-[#E2E1D9] font-mono text-[10px] font-semibold text-[#52514C] shrink-0">
                          {bLabel}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#EAE9E2]">
              <button
                type="button"
                onClick={() => setGroupModalOpen(false)}
                className="h-9 px-4 rounded-[9px] border border-[#D8D7CE] text-[12.5px] font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="h-9 px-4 rounded-[9px] bg-[#146C43] hover:bg-[#0F5132] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Сохранить группу</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          МОДАЛЬНОЕ ОКНО: РАЗБИТЬ ПО ПАРТИЯМ И УКАЗАТЬ ДАТЫ ЗАКАЗА (ИЗ ЛЮБОЙ КАРТОЧКИ)
         ===================================================================== */}
      {batchEditorModel && (
        <QuickModelBatchesAndDatesModal
          model={batchEditorModel}
          scenario={
            (() => {
              const bCode = normalizePortfolioBrandCode(
                detectModelBrandPortfolioLabel(batchEditorModel)
              );
              return (
                (bCode !== 'ALL' ? scenarioByBrandMap[bCode] : undefined) ||
                currentScenario
              );
            })()
          }
          onClose={() => setBatchEditorModelId(null)}
          onUpdateModel={onUpdateModel}
          notify={notify}
        />
      )}
    </div>
  );
}

// =============================================================================
// 3. МОДАЛЬНОЕ ОКНО ПРЯМОГО РАЗБИЕНИЯ ПО ПАРТИЯМ И ВЫБОРА ДАТ ЗАКАЗА
// =============================================================================
function QuickModelBatchesAndDatesModal({
  model: rawModel,
  scenario,
  onClose,
  onUpdateModel,
  notify,
}: {
  model: ScenarioModelSpec;
  scenario: GrowthScenarioDef;
  onClose: () => void;
  onUpdateModel: (updated: ScenarioModelSpec) => void;
  notify?: (type: 'success' | 'warning' | 'error', title: string, desc?: string) => void;
}) {
  const model = useMemo(() => ensureModelUnifiedV11(rawModel), [rawModel]);
  const shared = model.sharedSupplyAndFact!;
  const fp = shared.factoryParams;
  const proc = useMemo(
    () => computeProcurementPlan(model, scenario),
    [model, scenario]
  );
  const unitCfg = getBrandUnitConfig(model);

  const activePeriods: CustomBatchPeriodDef[] = useMemo(() => {
    if (fp.customBatchPeriods && fp.customBatchPeriods.length > 0) {
      return [...fp.customBatchPeriods].sort(
        (a, b) => a.startMonthIdx - b.startMonthIdx
      );
    }
    return DEFAULT_QUARTERLY_BATCH_PERIODS.map((p) => ({ ...p }));
  }, [fp.customBatchPeriods]);

  const updatePeriods = (nextList: CustomBatchPeriodDef[]) => {
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          customBatchPeriods: nextList,
        },
      },
    });
  };

  const handleSplitBatch = (periodId: string) => {
    const idx = activePeriods.findIndex((p) => p.id === periodId);
    if (idx < 0) return;
    const cur = activePeriods[idx];
    if (cur.endMonthIdx <= cur.startMonthIdx) return;
    const mid = Math.floor((cur.startMonthIdx + cur.endMonthIdx) / 2);
    const firstHalf: CustomBatchPeriodDef = {
      id: `${cur.id}-a`,
      startMonthIdx: cur.startMonthIdx,
      endMonthIdx: mid,
      scenarioId: scenario.id,
    };
    const secondHalf: CustomBatchPeriodDef = {
      id: `${cur.id}-b`,
      startMonthIdx: mid + 1,
      endMonthIdx: cur.endMonthIdx,
      scenarioId: scenario.id,
    };
    const nextList = [
      ...activePeriods.slice(0, idx),
      firstHalf,
      secondHalf,
      ...activePeriods.slice(idx + 1),
    ];
    updatePeriods(nextList);
    notify?.('success', 'Партия разбита на 2 части с отдельными датами заказа');
  };

  const handleAddCustomBatch = () => {
    const newId = `batch-${Date.now().toString(36)}`;
    const nextList: CustomBatchPeriodDef[] = [
      ...activePeriods,
      {
        id: newId,
        startMonthIdx: 0,
        endMonthIdx: 1,
        customPacksQty: 1000,
        customOrderDateIso: `${(scenario.year || 2027) - 1}-11-15`,
        scenarioId: scenario.id,
      },
    ];
    updatePeriods(nextList);
    notify?.('success', 'Добавлена новая партия');
  };

  const handleResetToQuarters = () => {
    updatePeriods(DEFAULT_QUARTERLY_BATCH_PERIODS.map((p) => ({ ...p })));
    notify?.('success', 'Возвращена стандартная разбивка на 4 квартала (Q1–Q4)');
  };

  const handleUpdateBatchField = (
    periodId: string,
    updater: (prev: CustomBatchPeriodDef) => CustomBatchPeriodDef
  ) => {
    const nextList = activePeriods.map((p) =>
      p.id === periodId ? { ...updater(p), scenarioId: scenario.id } : p
    );
    updatePeriods(nextList);
  };

  const handleUpdateBatchQtyAndRebalance = (periodId: string, nextQty: number) => {
    const targetIdx = activePeriods.findIndex((p) => p.id === periodId);
    const nextList = activePeriods.map((p, idx) => {
      if (p.id === periodId) {
        return {
          ...p,
          customPacksQty: Math.max(0, Math.round(nextQty)),
          scenarioId: scenario.id,
        };
      }
      if (targetIdx >= 0 && idx > targetIdx) {
        return {
          ...p,
          customPacksQty: null,
        };
      }
      return p;
    });
    updatePeriods(nextList);
  };

  const handleApproveBatch = (batch: RecommendedProcurementBatch) => {
    const updated = approveRecommendedBatch(model, batch, 'Владелец');
    onUpdateModel(updated);
    notify?.(
      'success',
      'Партия утверждена в заказ фабрике',
      `${batch.recommendedPacks.toLocaleString('ru-RU')} ${unitCfg.primaryUnit} · заказ до ${formatShortDateRu(batch.recommendedOrderDateIso)}`
    );
  };

  const handleRevokeApprovedPo = (poId: string) => {
    const updated = removeApprovedPurchaseOrder(model, poId);
    onUpdateModel(updated);
    notify?.('warning', 'Заказ фабрике возвращён в черновик');
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl rounded-[20px] bg-white border border-[#D8D7CE] p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#EAE9E2]">
          <div>
            <div className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#686762]">
              Разбиение по партиям и график дат заказа · {model.code} · {scenario.title}
            </div>
            <h3 className="text-[18px] font-extrabold text-[#141413]">
              {model.title} ({detectModelBrandPortfolioLabel(model)})
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleResetToQuarters}
              className="h-8.5 px-3 rounded-[9px] border border-[#D8D7CE] bg-white hover:bg-[#FAF9F6] text-[11.5px] font-semibold text-[#52514C] cursor-pointer"
            >
              ↺ Сбросить к 4 кварталам
            </button>
            <button
              type="button"
              onClick={handleAddCustomBatch}
              className="h-8.5 px-3 rounded-[9px] bg-[#146C43] hover:bg-[#0F5132] text-white text-[12px] font-semibold cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Добавить партию</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8.5 w-8.5 rounded-full hover:bg-[#FAF9F6] flex items-center justify-center cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Таблица партий с прямым выбором дат и кнопкой «Разбить партию» */}
        <div className="overflow-x-auto rounded-[12px] border border-[#E2E1D8]">
          <table className="w-full min-w-[740px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#E2E1D8] bg-[#FAF9F6] text-[10.5px] font-bold uppercase tracking-wider text-[#686762]">
                <th className="py-2.5 px-3">Партия и покрытие</th>
                <th className="py-2.5 px-3">Дата заказа фабрике</th>
                <th className="py-2.5 px-3 text-right">Объём ({unitCfg.primaryUnit})</th>
                <th className="py-2.5 px-3 text-right">Сумма и аванс 30%</th>
                <th className="py-2.5 px-3 text-right">Действия с партией</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE9E2]">
              {proc.approvedOrders.map((po, poIdx) => (
                <tr key={po.id} className="bg-[#F2FBF6]/60 hover:bg-[#EAF8F0]">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-[#EAF6F0] border border-[#BCE3CF] text-[10px] font-bold text-[#146C43]">
                        ✓ Утверждён PO #{poIdx + 1}
                      </span>
                      <span className="font-bold text-[#141413]">
                        {po.coverageMonthsLabel || 'В работе у фабрики'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-[#141413]">
                    {formatShortDateRu(po.orderPlacementDateIso)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-[#141413]">
                    {po.packsQty.toLocaleString('ru-RU')} {unitCfg.primaryUnit}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    <div className="text-[13.5px] font-extrabold text-[#0F5132]">
                      {formatMln(po.totalOrderRub)}
                    </div>
                    <div className="text-[10.5px] text-[#146C43] font-semibold">
                      Аванс: {formatMln(po.prepaymentRub)}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRevokeApprovedPo(po.id)}
                      className="h-8 px-2.5 rounded-[8px] border border-[#D8D7CE] bg-white hover:bg-rose-50 hover:text-rose-700 text-[11px] font-semibold text-[#52514C] cursor-pointer"
                    >
                      Вернуть в черновик
                    </button>
                  </td>
                </tr>
              ))}
              {proc.recommendedBatches.map((batch, idx) => {
                const canSplit = batch.endCoveredMonthIdx > batch.firstCoveredMonthIdx;
                return (
                  <tr key={batch.periodId} className="hover:bg-[#FAF9F6]">
                    <td className="py-3 px-3">
                      <div className="font-bold text-[#141413]">
                        Партия №{idx + 1} ({batch.coverageMonthsLabel})
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[11px]">
                        <select
                          value={batch.firstCoveredMonthIdx}
                          onChange={(e) => {
                            const nextStart = Number(e.target.value);
                            handleUpdateBatchField(batch.periodId, (prev) => ({
                              ...prev,
                              startMonthIdx: nextStart,
                              endMonthIdx: Math.max(nextStart, prev.endMonthIdx),
                            }));
                          }}
                          className="rounded border border-[#D8D7CE] bg-white px-1.5 py-0.5 font-semibold"
                        >
                          {MONTHS_SHORT_RU.map((m, mIdx) => (
                            <option key={m} value={mIdx}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <span>—</span>
                        <select
                          value={batch.endCoveredMonthIdx}
                          onChange={(e) => {
                            const nextEnd = Number(e.target.value);
                            handleUpdateBatchField(batch.periodId, (prev) => ({
                              ...prev,
                              endMonthIdx: Math.max(prev.startMonthIdx, nextEnd),
                            }));
                          }}
                          className="rounded border border-[#D8D7CE] bg-white px-1.5 py-0.5 font-semibold"
                        >
                          {MONTHS_SHORT_RU.map((m, mIdx) => (
                            <option
                              key={m}
                              value={mIdx}
                              disabled={mIdx < batch.firstCoveredMonthIdx}
                            >
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <input
                        type="date"
                        value={batch.recommendedOrderDateIso}
                        onChange={(e) => {
                          if (!e.target.value) return;
                          handleUpdateBatchField(batch.periodId, (prev) => ({
                            ...prev,
                            customOrderDateIso: e.target.value,
                          }));
                        }}
                        className="h-8 rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 font-mono text-[12px] font-bold text-[#141413]"
                      />
                      <div className="text-[10.5px] text-[#686760] mt-0.5">
                        Приход к 1 {MONTHS_SHORT_RU[batch.firstCoveredMonthIdx].toLowerCase()}{' '}
                        {scenario.year || 2027}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <input
                        type="number"
                        min={0}
                        step={50}
                        value={batch.recommendedPacks}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          handleUpdateBatchQtyAndRebalance(batch.periodId, val);
                        }}
                        className="h-8 w-24 rounded-[8px] border border-[#CFCEC6] bg-white px-2 text-right font-mono text-[13px] font-bold text-[#141413]"
                      />
                      <div className="font-mono text-[10.5px] text-[#686760] mt-0.5">
                        {batch.physicalUnitsQty.toLocaleString('ru-RU')} {unitCfg.secondaryUnit}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono">
                      <div className="text-[13.5px] font-extrabold text-[#141413]">
                        {formatMln(batch.estimatedTotalRub)}
                      </div>
                      <div className="text-[10.5px] text-[#146C43] font-semibold">
                        Аванс 30%: {formatMln(batch.prepaymentRub)}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {canSplit && (
                          <button
                            type="button"
                            onClick={() => handleSplitBatch(batch.periodId)}
                            title="Разбить эту партию на 2 отдельные партии с разными датами"
                            className="h-8 px-2.5 rounded-[8px] border border-[#D8D7CE] bg-[#FAF9F6] hover:bg-[#EFEFE9] text-[11px] font-semibold text-[#141413] cursor-pointer inline-flex items-center gap-1"
                          >
                            <Scissors className="h-3 w-3" />
                            <span>Разбить</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleApproveBatch(batch)}
                          className="h-8 px-2.5 rounded-[8px] bg-[#EAF6F0] border border-[#BCE3CF] hover:bg-[#157347] hover:text-white text-[11px] font-bold text-[#146C43] transition cursor-pointer"
                        >
                          ✓ Утвердить
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
