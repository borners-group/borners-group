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
  Trash2,
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
}: BrandCabinetsMatrixTableProps) {
  const gt = multiBrandSummary.groupTotal;

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
                          COGS: {formatMln(b.annualSoldGoodsCostRub)}
                        </div>
                      </div>
                    ) : (
                      <div className="inline-flex items-center justify-end gap-1.5">
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
              onClick={() => onSelectBrandFilter('ALL')}
              className="bg-[#F4F6F9] border-t border-[#DCE2EC] font-bold text-[#111827] text-[12px] cursor-pointer hover:bg-[#E9EDF4] transition"
            >
              <td className="py-3 px-4" colSpan={2}>
                <div className="flex items-center gap-2">
                  <span className="uppercase tracking-wider text-[10.5px] text-[#475569]">
                    Итого по холдингу (5 кабинетов)
                  </span>
                  <span className="px-2 py-0.5 rounded-[5px] bg-white border border-[#CBD5E1] font-mono text-[10px] text-[#334155]">
                    {gt.modelsCount} SKU
                  </span>
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
// ПЛАВНЫЙ СЧЁТЧИК ЧИСЕЛ (COUNT-UP С CUBIC-OUT ИНТЕРПОЛЯЦИЕЙ ПРИ СМЕНЕ СЦЕНАРИЯ)
// =============================================================================
function AnimatedMlnValue({
  valueRub,
  prefix = '',
  suffix = ' млн ₽',
}: {
  valueRub: number;
  prefix?: string;
  suffix?: string;
}) {
  const [displayRub, setDisplayRub] = useState(valueRub);
  const prevRubRef = useRef(valueRub);

  useEffect(() => {
    const startVal = prevRubRef.current;
    const endVal = valueRub;
    prevRubRef.current = valueRub;

    if (Math.abs(endVal - startVal) < 1000) {
      setDisplayRub(endVal);
      return;
    }

    let rafId = 0;
    const duration = 620;
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
    <span>
      {prefix}
      {formatted}
      {suffix}
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
  onNavigateSection: (section: 'product-catalog' | 'launch-calendar' | 'roadmap-tasks' | 'finance') => void;
  embeddedInHero?: boolean;
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
  onNavigateSection,
}: PeaklyMasterCabinetsSummaryProps) {
  const [cabinetsMatrixOpen, setCabinetsMatrixOpen] = useState(false);
  const [monthlyCashflowOpen, setMonthlyCashflowOpen] = useState(false);
  const [hoveredWaterfallKey, setHoveredWaterfallKey] = useState<string | null>(null);

  const gt = multiBrandSummary.groupTotal;
  const activeBrandsCount = multiBrandSummary.brands.filter(
    (b) => b.hasScenario && b.hasModels
  ).length;
  const groupMarginPct =
    gt.annualRevenueRub > 0
      ? Math.round((gt.annualEstimatedOperatingProfitRub / gt.annualRevenueRub) * 1000) / 10
      : 0;

  // Параметры анимированного кольца маржинальности (Profitability Ring)
  const ringRadius = 34;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const clampedMargin = Math.min(Math.max(groupMarginPct, 0), 100);
  const ringStrokeOffset = ringCircumference * (1 - clampedMargin / 100);

  // Сегменты водопада «Куда уходит выручка холдинга» (Revenue Waterfall)
  const waterfallSegments = useMemo(() => {
    const rev = Math.max(gt.annualRevenueRub, 1);
    const cogsRub = Math.max(0, gt.annualSoldGoodsCostRub);
    const profitRub = Math.max(0, gt.annualEstimatedOperatingProfitRub);
    const mpAndOpsTotalRub = Math.max(0, rev - cogsRub - profitRub);
    const commissionLogisticsRub = mpAndOpsTotalRub * 0.72;
    const adsAndTaxRub = mpAndOpsTotalRub * 0.28;

    const raw = [
      {
        key: 'cogs',
        label: 'Себестоимость (COGS)',
        valueRub: cogsRub,
        pct: (cogsRub / rev) * 100,
        color: '#475569',
      },
      {
        key: 'mp',
        label: 'Комиссия и логистика WB',
        valueRub: commissionLogisticsRub,
        pct: (commissionLogisticsRub / rev) * 100,
        color: '#78869B',
      },
      {
        key: 'ads',
        label: 'Продвижение и налоги',
        valueRub: adsAndTaxRub,
        pct: (adsAndTaxRub / rev) * 100,
        color: '#A3B1C6',
      },
      {
        key: 'profit',
        label: 'Чистая операционная прибыль',
        valueRub: profitRub,
        pct: (profitRub / rev) * 100,
        color: '#0D9488',
      },
    ];
    return raw;
  }, [
    gt.annualRevenueRub,
    gt.annualSoldGoodsCostRub,
    gt.annualEstimatedOperatingProfitRub,
  ]);

  return (
    <div className="space-y-3.5">
      {/* 5 ОТДЕЛЬНЫХ КАРТОЧЕК С АНИМАЦИЕЙ ЧИСЕЛ, МИКРО-ПРОГРЕССОМ И КОЛЬЦОМ МАРЖИ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. Выручка холдинга */}
        <div
          onClick={() => onNavigateSection('launch-calendar')}
          className="card-shimmer hover-lift relative rounded-[18px] bg-white border border-[#CFD6E0] border-t-2 border-t-[#2C3444] p-4 md:p-5 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06)] cursor-pointer flex flex-col justify-between overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-[#64748B] truncate">
              Выручка холдинга ({activeBrandsCount}/5 каб.)
            </span>
            {/* Мини-спарклайн растущего тренда */}
            <svg className="h-4 w-10 text-[#2C3444] shrink-0 opacity-75" viewBox="0 0 40 16" fill="none">
              <path
                d="M1 14L8 11.5L15 9.5L22 7.5L30 4.5L39 1.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="mt-2 font-mono text-[23px] font-extrabold tracking-[-0.025em] text-[#111827] leading-none">
            <AnimatedMlnValue valueRub={gt.annualRevenueRub} />
          </div>
          <div className="mt-3 pt-2 border-t border-[#F1F5F9] text-[11.5px] text-[#64748B] flex items-center justify-between">
            <span>Пик декабря</span>
            <strong className="font-mono text-[#111827]">{formatMln(gt.decemberRevenueRub)}</strong>
          </div>
          {/* Нижний прогресс-индикатор */}
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#EEF2F6]">
            <div
              className="h-full bg-[#2C3444] transition-all duration-700 ease-out"
              style={{ width: `${Math.min(100, Math.max(15, (gt.decemberRevenueRub / Math.max(gt.annualRevenueRub / 6, 1)) * 100))}%` }}
            />
          </div>
        </div>

        {/* 2. План закупок (Год) */}
        <div
          onClick={() => onNavigateSection('roadmap-tasks')}
          className="card-shimmer hover-lift relative rounded-[18px] bg-white border border-[#CFD6E0] border-t-2 border-t-[#475569] p-4 md:p-5 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06)] cursor-pointer flex flex-col justify-between overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-[#64748B] truncate">
              План закупок на год
            </span>
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#475569]">
              4 волны
            </span>
          </div>
          <div className="mt-2 font-mono text-[23px] font-extrabold tracking-[-0.025em] text-[#111827] leading-none">
            <AnimatedMlnValue valueRub={gt.totalProcurementBudgetRub} />
          </div>
          <div
            className="mt-3 pt-2 border-t border-[#F1F5F9] text-[11.5px] text-[#64748B] flex items-center justify-between"
            title={multiBrandSummary.procurementBreakdownText}
          >
            <span>Ассортимент в плане</span>
            <strong className="font-mono text-[#111827]">{gt.modelsCount} SKU</strong>
          </div>
          {/* 4 квартальные волны внизу карточки */}
          <div className="absolute bottom-0 left-0 right-0 h-[3px] grid grid-cols-4 gap-0.5 bg-[#EEF2F6]">
            <div className="bg-[#2C3444]" />
            <div className="bg-[#475569]" />
            <div className="bg-[#64748B]" />
            <div className="bg-[#94A3B8]" />
          </div>
        </div>

        {/* 3. Старт 1-й партии (Q1) */}
        <div
          onClick={() => onNavigateSection('roadmap-tasks')}
          className="card-shimmer hover-lift relative rounded-[18px] bg-white border border-[#CFD6E0] border-t-2 border-t-[#0D9488] p-4 md:p-5 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06)] cursor-pointer flex flex-col justify-between overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-[#64748B] truncate">
              Старт 1-й партии (Q1)
            </span>
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F0FDFA] text-[#0D9488]">
              30% аванс
            </span>
          </div>
          <div className="mt-2 font-mono text-[23px] font-extrabold tracking-[-0.025em] text-[#111827] leading-none">
            <AnimatedMlnValue valueRub={gt.firstWaveStartBudgetRub} />
          </div>
          <div className="mt-3 pt-2 border-t border-[#F1F5F9] text-[11.5px] text-[#64748B] flex items-center justify-between">
            <span>Предоплата сейчас</span>
            <strong className="font-mono text-[#0D9488]">{formatMln(gt.firstWavePrepaymentRub)}</strong>
          </div>
          {/* Пропорция 30% аванс / 70% остаток */}
          <div className="absolute bottom-0 left-0 right-0 h-[3px] flex bg-[#EEF2F6]">
            <div className="h-full bg-[#0D9488] w-[30%]" />
            <div className="h-full bg-[#CBD5E1] w-[70%]" />
          </div>
        </div>

        {/* 4. Пик своих денег (с оборотом WB) */}
        <div className="card-shimmer hover-lift relative rounded-[18px] bg-white border border-[#CFD6E0] border-t-2 border-t-[#64748B] p-4 md:p-5 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.06)] flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-[#64748B] truncate">
              Пик своих денег (с WB)
            </span>
            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#334155]">
              Реинвест
            </span>
          </div>
          <div className="mt-2 font-mono text-[23px] font-extrabold tracking-[-0.025em] text-[#111827] leading-none">
            {gt.verifiedOwnMoneyRequiredRub !== null ? (
              <AnimatedMlnValue valueRub={gt.verifiedOwnMoneyRequiredRub} />
            ) : (
              '—'
            )}
          </div>
          <div className="mt-3 pt-2 border-t border-[#F1F5F9] text-[11.5px] text-[#64748B] truncate">
            Дальнейшие волны — из выручки WB
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#EEF2F6]">
            <div
              className="h-full bg-[#64748B] transition-all duration-700 ease-out"
              style={{
                width: `${
                  gt.totalProcurementBudgetRub > 0 && gt.verifiedOwnMoneyRequiredRub !== null
                    ? Math.min(100, Math.round((gt.verifiedOwnMoneyRequiredRub / gt.totalProcurementBudgetRub) * 100))
                    : 25
                }%`,
              }}
            />
          </div>
        </div>

        {/* 5. HERO-КАРТОЧКА ОЖИДАЕМОЙ ПРИБЫЛИ С АНИМИРОВАННЫМ КОЛЬЦОМ МАРЖИ И ОРБИТОЙ */}
        <div
          onClick={() => onNavigateSection('finance')}
          className="card-shimmer hover-lift relative rounded-[18px] bg-gradient-to-br from-[#F0FDFA]/90 via-white to-[#ECFDF5]/60 border border-[#99F6E4] p-4 md:p-5 shadow-[0_6px_20px_-4px_rgba(13,148,136,0.12)] cursor-pointer overflow-hidden flex items-center justify-between gap-3"
        >
          {/* Мягкое изумрудное свечение и геометрическая орбита на фоне */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#0D9488]/15 blur-2xl"
          />
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 text-[#0D9488] opacity-[0.10] animate-orbit-slow"
            viewBox="0 0 220 220"
            fill="none"
          >
            <circle cx="110" cy="110" r="76" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 8" />
            <circle cx="110" cy="110" r="96" stroke="currentColor" strokeWidth="1" />
          </svg>

          <div className="relative z-10 min-w-0 flex-1 flex flex-col justify-between h-full">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#0D9488] truncate">
              Ожидаемая прибыль
            </div>
            <div className="mt-1.5 font-mono text-[22px] xl:text-[23px] font-extrabold tracking-[-0.03em] text-[#065F46] leading-none">
              <AnimatedMlnValue valueRub={gt.annualEstimatedOperatingProfitRub} prefix="+" />
            </div>
            <div className="mt-1.5 h-0.5 w-14 rounded-full bg-gradient-to-r from-[#0D9488] to-transparent" />
            <div className="mt-2 text-[11px] text-[#475569] truncate">
              COGS: <strong className="font-mono text-[#111827]">{formatMln(gt.annualSoldGoodsCostRub)}</strong>
            </div>
          </div>

          {/* Анимированное круговое кольцо маржинальности (Profitability Ring) */}
          <div className="relative z-10 shrink-0 h-[68px] w-[68px] rounded-full bg-white/90 border border-[#A7F3D0] p-1 shadow-2xs flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r={ringRadius}
                fill="none"
                stroke="#E2E8F0"
                strokeWidth="5.5"
              />
              <circle
                cx="40"
                cy="40"
                r={ringRadius}
                fill="none"
                stroke="#0D9488"
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringStrokeOffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-[12px] font-extrabold text-[#065F46] leading-none">
                {groupMarginPct.toFixed(1).replace('.', ',')}%
              </span>
              <span className="text-[7.5px] font-bold uppercase tracking-wider text-[#64748B] mt-0.5">
                маржа
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ПАНЕЛЬ КАБИНЕТОВ + АНИМИРОВАННЫЙ ВОДОПАД СТРУКТУРЫ ВЫРУЧКИ (REVENUE WATERFALL) */}
      <div className="rounded-[18px] bg-white border border-[#CFD6E0] p-4 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.05)] space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-semibold text-[#64748B] mr-1">
              Кабинеты:
            </span>
            <button
              type="button"
              onClick={() => onSelectBrandFilter('ALL')}
              className={`h-8 px-3 rounded-[9px] text-[12px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5 border ${
                activeBrandFilter === 'ALL'
                  ? 'bg-[#2C3444] text-white border-[#2C3444] shadow-2xs'
                  : 'bg-[#F8FAFC] text-[#334155] border-[#DCE2EC] hover:bg-white hover:border-[#94A3B8]'
              }`}
            >
              <span>Все (5)</span>
              <span
                className={`font-mono text-[11px] ${
                  activeBrandFilter === 'ALL' ? 'text-slate-300' : 'text-[#64748B]'
                }`}
              >
                {(gt.annualRevenueRub / 1_000_000).toFixed(1).replace('.', ',')} млн
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
                    onSelectBrandFilter(isSelected ? 'ALL' : b.brandCode);
                    if (!isSelected && b.selectedScenarioId !== null) {
                      onSelectActiveScenarioId(b.selectedScenarioId);
                    }
                  }}
                  className={`h-8 px-3 rounded-[9px] text-[12px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-[#2C3444] text-white border-[#2C3444] shadow-2xs'
                      : 'bg-[#F8FAFC] text-[#334155] border-[#DCE2EC] hover:bg-white hover:border-[#94A3B8]'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${accent.accentBar}`} />
                  <span className="font-bold">{b.displayCode}</span>
                  <span
                    className={`font-mono text-[11px] ${
                      isSelected ? 'text-slate-300' : 'text-[#64748B]'
                    }`}
                  >
                    {hasRev
                      ? `${(b.annualRevenueRub / 1_000_000).toFixed(1).replace('.', ',')} млн`
                      : `${b.modelsCount} SKU`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCabinetsMatrixOpen((v) => !v)}
              className={`h-8 px-3 rounded-[9px] border text-[12px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5 ${
                cabinetsMatrixOpen
                  ? 'bg-[#2C3444] border-[#2C3444] text-white'
                  : 'bg-[#F8FAFC] hover:bg-white border-[#DCE2EC] text-[#334155]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>
                {cabinetsMatrixOpen ? 'Скрыть сводную кабинетов ▴' : 'Сводная по кабинетам (5) ▾'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMonthlyCashflowOpen((v) => !v)}
              className={`h-8 px-3 rounded-[9px] border text-[12px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5 ${
                monthlyCashflowOpen
                  ? 'bg-[#2C3444] border-[#2C3444] text-white'
                  : 'bg-[#F8FAFC] hover:bg-white border-[#DCE2EC] text-[#334155]'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>{monthlyCashflowOpen ? 'Скрыть Cashflow ▴' : 'График денег 12 мес. ▾'}</span>
            </button>
          </div>
        </div>

        {/* ИНТЕРАКТИВНЫЙ АНИМИРОВАННЫЙ ВОДОПАД «КУДА УХОДИТ ВЫРУЧКА» (REVENUE WATERFALL) */}
        <div className="pt-3 border-t border-[#EEF2F6] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
            <span className="font-semibold text-[#64748B] uppercase tracking-[0.04em] text-[10.5px]">
              Структура годовой выручки холдинга (наведите на сегмент для детализации)
            </span>
            <div className="font-mono text-[11.5px] text-[#334155]">
              {hoveredWaterfallKey ? (
                (() => {
                  const seg = waterfallSegments.find((s) => s.key === hoveredWaterfallKey);
                  return seg ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#111827]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span>{seg.label}:</span>
                      <strong>{formatMln(seg.valueRub)}</strong>
                      <span className="text-[#64748B]">({seg.pct.toFixed(1).replace('.', ',')}%)</span>
                    </span>
                  ) : null;
                })()
              ) : (
                <span>
                  База распределения: <strong className="text-[#111827]">{formatMln(gt.annualRevenueRub)}</strong> (100%)
                </span>
              )}
            </div>
          </div>

          {/* Мульти-сегментная анимированная полоса водопада */}
          <div className="h-7 w-full rounded-[10px] bg-[#EEF2F6] overflow-hidden flex p-0.5 gap-0.5">
            {waterfallSegments.map((seg) => {
              const isHovered = hoveredWaterfallKey === seg.key;
              return (
                <div
                  key={seg.key}
                  onMouseEnter={() => setHoveredWaterfallKey(seg.key)}
                  onMouseLeave={() => setHoveredWaterfallKey(null)}
                  style={{
                    width: `${Math.max(seg.pct, 2)}%`,
                    backgroundColor: seg.color,
                  }}
                  className={`h-full first:rounded-l-[8px] last:rounded-r-[8px] relative flex items-center justify-center transition-all duration-700 ease-out cursor-pointer ${
                    seg.key === 'profit' ? 'btn-shine-effect' : ''
                  } ${
                    hoveredWaterfallKey && !isHovered ? 'opacity-65' : 'opacity-100'
                  }`}
                >
                  {seg.pct >= 9 && (
                    <span className="font-mono text-[10.5px] font-bold text-white/95 truncate px-1.5">
                      {seg.pct.toFixed(0)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Компактная легенда водопада под полосой */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {waterfallSegments.map((seg) => (
                <button
                  key={seg.key}
                  type="button"
                  onMouseEnter={() => setHoveredWaterfallKey(seg.key)}
                  onMouseLeave={() => setHoveredWaterfallKey(null)}
                  onClick={() => onNavigateSection('finance')}
                  className="inline-flex items-center gap-1.5 text-[11.5px] text-[#64748B] hover:text-[#111827] transition cursor-pointer"
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span>{seg.label}</span>
                  <strong className="font-mono text-[#111827]">
                    {formatMln(seg.valueRub)}
                  </strong>
                  <span className="font-mono text-[10.5px] text-[#94A3B8]">
                    ({seg.pct.toFixed(1).replace('.', ',')}%)
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* РАСКРЫВАЕМАЯ ТАБЛИЦА 5 КАБИНЕТОВ И СЦЕНАРИЕВ */}
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
        />
      )}

      {/* ПОМЕСЯЧНЫЙ ГРАФИК ДЕНЕГ ХОЛДИНГА (12 МЕС.) ПО КНОПКЕ */}
      {monthlyCashflowOpen && (
        <div className="overflow-x-auto rounded-[16px] border border-[#CFD6E0] bg-white p-4 shadow-xs">
          <div className="text-[12.5px] font-bold text-[#111827] mb-2.5">
            Помесячный денежный поток всех кабинетов BORNERS GROUP (12 месяцев, млн ₽)
          </div>
          <table className="w-full min-w-[780px] text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-[#DCE2EC] text-[#64748B] bg-[#F4F6F9]">
                <th className="py-2 px-2.5 font-bold">Показатель холдинга</th>
                {gt.monthlyRows.map((m) => (
                  <th key={m.monthIdx} className="py-2 px-1.5 text-right font-bold">
                    {m.monthLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEEF4] font-mono">
              <tr>
                <td className="py-2 px-2.5 font-sans font-semibold text-[#111827]">
                  Продажи (выкупы WB, млн ₽)
                </td>
                {gt.monthlyRows.map((m) => (
                  <td key={m.monthIdx} className="py-2 px-1.5 text-right">
                    {(m.grossSalesRub / 1_000_000).toFixed(1).replace('.', ',')}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-2.5 font-sans font-semibold text-emerald-700">
                  + Поступления от WB (млн ₽)
                </td>
                {gt.monthlyRows.map((m) => (
                  <td key={m.monthIdx} className="py-2 px-1.5 text-right text-emerald-700">
                    +{(m.wbNetInflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-2.5 font-sans font-semibold text-rose-700">
                  − Оплаты фабрикам (авансы + доплаты, млн ₽)
                </td>
                {gt.monthlyRows.map((m) => (
                  <td key={m.monthIdx} className="py-2 px-1.5 text-right text-rose-700">
                    −{(m.factoryTotalOutflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                  </td>
                ))}
              </tr>
              <tr className="bg-[#F4F6F9] font-bold">
                <td className="py-2 px-2.5 font-sans text-[#1E293B]">
                  Накопленный баланс денег (минус = свои вложения)
                </td>
                {gt.monthlyRows.map((m) => (
                  <td key={m.monthIdx} className="py-2 px-1.5 text-right text-[#1E293B]">
                    {(m.cumulativeCashBalanceRub / 1_000_000).toFixed(1).replace('.', ',')}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
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
                        Добавьте первую позицию ({sec.categoryLabel}) — она автоматически получит единицу измерения «{sec.primaryUnit}» и нулевой стартовый план без выдуманных цифр.
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenCreateModel(sec.brandCode)}
                        className="mt-1 h-8.5 px-4 rounded-[9px] bg-[#2C3444] hover:bg-[#1E2430] text-white text-[12px] font-semibold cursor-pointer shadow-2xs"
                      >
                        + Создать первую карточку {sec.displayCode}
                      </button>
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
