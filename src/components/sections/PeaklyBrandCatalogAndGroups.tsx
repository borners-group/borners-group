'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
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
  computeMultiBrandPortfolioSummary,
  computePortfolioProcurementWavesSummary,
  computeProcurementPlan,
  computeWhatIfSensitivitySimulation,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  getBrandProductionProfile,
  getBrandUnitConfig,
  getScenariosForBrand,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
  removeApprovedPurchaseOrder,
} from '@/lib/unifiedBusinessEngine';
import {
  canUserAccessSection,
  canUserEditBrand,
  canUserViewCostPrice,
  canUserViewFinance,
} from '@/lib/finance';
import { safeGetStorageJson } from '@/lib/safeStorage';
import {
  isBrandScenarioExplicitlyNone,
  resolveEffectiveScenarioForModel,
} from '@/lib/portfolioPersistence';
import {
  ProductGroupDef,
  buildBrandCatalogSections,
  buildDefaultProductGroups,
  computeProductGroupMetrics,
  deleteProductGroup,
  getModelBrandAccentStyles,
  loadProductGroups,
  resetDefaultProductGroups,
  saveProductGroups,
} from '@/lib/productGroups';
import { BoxerPackStackSvg } from '@/components/sections/ScenarioVisualParts';
import { usePlatform } from '@/context/PlatformContext';
import type { BrandFilter } from '@/types/platform';

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
  onSelectActiveScenarioId: (scenarioId: number, explicitBrandCode?: string) => void;
  onOpenCreateScenarioForBrand: (brandCode: CanonicalBrandCode, defaultTitle: string) => void;
  onOpenCreateModelForBrand: (brandCode: string) => void;
  onLaunchStarterCabinet?: (brandCode: 'AKUSHA' | 'LISKANI' | 'NA_TELE') => void;
  onLaunchAllCabinets?: () => void;
  onResetStarterCabinets?: () => void;
  wbLagUnspecified?: boolean;
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
  wbLagUnspecified = false,
}: BrandCabinetsMatrixTableProps) {
  const { currentUser, concepts, navigateTo } = usePlatform();
  const hasCost = canUserViewCostPrice(currentUser);
  const hasFinance = canUserViewFinance(currentUser);
  const canEditAllStarter = (['AKUSHA', 'LISKANI', 'NA_TELE'] as const).every((c) =>
    canUserEditBrand(currentUser, c)
  );
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
              const canEditBrandRow = canUserEditBrand(currentUser, b.brandCode);
              const rndCount = concepts.filter(
                (c) =>
                  !c.isArchived &&
                  normalizePortfolioBrandCode(c.brandId) === b.brandCode
              ).length;

              return (
                <tr
                  key={b.brandCode}
                  onClick={() => {
                    onSelectBrandFilter(b.brandCode);
                    if (b.selectedScenarioId !== null) {
                      onSelectActiveScenarioId(b.selectedScenarioId, b.brandCode);
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
                        <div className="flex flex-wrap items-center gap-1.5">
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
                          {rndCount > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (b.selectedScenarioId !== null) {
                                  onSelectActiveScenarioId(b.selectedScenarioId, b.brandCode);
                                }
                                onSelectBrandFilter(b.brandCode);
                                if (canUserAccessSection(currentUser, 'product-lab')) {
                                  navigateTo('product-lab', {
                                    brandId: b.brandCode as BrandFilter,
                                  });
                                }
                              }}
                              title={`Открыть Лабораторию R&D бренда ${b.displayCode}`}
                              className="px-1.5 py-0.5 rounded font-mono text-[10px] font-medium bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] dark:bg-[#1D1C1A] dark:hover:bg-[#282724] dark:text-[#F5F4F0] dark:border-[#282724] transition-colors cursor-pointer"
                            >
                              R&D: {rndCount} в работе
                            </button>
                          )}
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
                        disabled={!canEditBrandRow}
                        value={b.selectedScenarioId ?? ''}
                        onChange={(e) => {
                          if (!canEditBrandRow) return;
                          const raw = e.target.value;
                          const nextId = raw === '' ? null : Number(raw);
                          onSelectScenarioForBrand(b.brandCode, nextId);
                          if (
                            nextId !== null &&
                            activeBrandFilter !== 'ALL' &&
                            normalizePortfolioBrandCode(activeBrandFilter) === b.brandCode
                          ) {
                            onSelectActiveScenarioId(nextId, b.brandCode);
                          }
                        }}
                        className={`h-8 flex-1 min-w-0 px-2.5 rounded-[8px] border text-[11.5px] font-semibold focus:outline-none focus:border-[#334155] truncate ${
                          canEditBrandRow ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed'
                        } ${
                          b.hasScenario
                            ? 'bg-[#F8FAFC] hover:bg-white border-[#CBD5E1] text-[#111827]'
                            : 'bg-[#F8FAFC] border-dashed border-[#CBD5E1] text-[#64748B]'
                        }`}
                      >
                        <option value="">Нет активного сценария</option>
                        {brandScenarios.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {hasFinance
                              ? `${sc.title} (${sc.year || 2027} · ${sc.monthlyTargetMln} млн/мес)`
                              : `${sc.title} (${sc.year || 2027})`}
                          </option>
                        ))}
                      </select>
                      {canEditBrandRow && (
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
                      )}
                    </div>
                  </td>

                  {/* 3. Продажи (Год / Дек) */}
                  <td className="py-3 px-3 align-middle text-right">
                    {isActive ? (
                      hasFinance ? (
                        <div>
                          <div className="font-mono text-[13px] font-extrabold text-[#111827]">
                            {formatMln(b.annualRevenueRub)}
                          </div>
                          <div className="font-mono text-[10.5px] text-[#64748B]">
                            дек: {formatMln(b.decemberRevenueRub)}
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono text-[11.5px] text-[#64748B]">Скрыто</span>
                      )
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
                          {hasCost ? formatMln(b.totalProcurementBudgetRub) : 'Скрыто'}
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[12px] text-[#CBD5E1]">—</span>
                    )}
                  </td>

                  {/* 5. Старт Q1 (Аванс) */}
                  <td className="py-3 px-3 align-middle text-right">
                    {isActive ? (
                      hasCost ? (
                        <div>
                          <div className="font-mono text-[12.5px] font-bold text-[#111827]">
                            {formatMln(b.firstWaveStartBudgetRub)}
                          </div>
                          <div className="font-mono text-[10.5px] text-[#64748B]">
                            аванс: {formatMln(b.firstWavePrepaymentRub)}
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono text-[11.5px] text-[#64748B]">Скрыто</span>
                      )
                    ) : (
                      <span className="font-mono text-[12px] text-[#CBD5E1]">—</span>
                    )}
                  </td>

                  {/* 6. Пик своих денег */}
                  <td className="py-3 px-3 align-middle text-right">
                    {isActive ? (
                      !hasCost || !hasFinance ? (
                        <span className="font-mono text-[11.5px] text-[#64748B]">Скрыто</span>
                      ) : (
                        <div>
                          <div className="font-mono text-[12.5px] font-bold text-[#334155]">
                            {b.verifiedOwnMoneyRequiredRub !== null
                              ? formatMln(b.verifiedOwnMoneyRequiredRub)
                              : wbLagUnspecified
                              ? 'Лаг WB не задан'
                              : '—'}
                          </div>
                          <div className="text-[10px] font-medium text-amber-800">
                            {b.verifiedOwnMoneyRequiredRub === null && wbLagUnspecified
                              ? 'график WB не указан'
                              : `пик: ${b.peakMonthLabel || 'Янв'}${
                                  b.selfFundingMonthLabel ? ` → с ${b.selfFundingMonthLabel} с WB` : ' · с WB'
                                }`}
                          </div>
                        </div>
                      )
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
                      !hasCost || !hasFinance ? (
                        <span className="font-mono text-[11.5px] text-[#64748B]">Скрыто</span>
                      ) : (
                        <div>
                          <div className="font-mono text-[13px] font-extrabold text-[#059669]">
                            +{formatMln(b.annualEstimatedOperatingProfitRub)}
                          </div>
                          <div className="font-mono text-[10.5px] text-[#64748B]">
                            Себест.: {formatMln(b.annualSoldGoodsCostRub)}
                          </div>
                        </div>
                      )
                    ) : canEditBrandRow ? (
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
                              className="h-7 px-2.5 rounded-[7px] bg-[#141413] hover:bg-[#2A2927] text-white text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                              <span>Запустить (3 SKU)</span>
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
                    ) : (
                      <span className="font-mono text-[11px] text-[#94A3B8]">—</span>
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
                  onSelectActiveScenarioId(bornersScenId, 'ALL');
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
                  {canEditAllStarter && activeCount < 5 && onLaunchAllCabinets && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunchAllCabinets();
                      }}
                      className="px-2.5 py-0.5 rounded-[6px] bg-[#141413] hover:bg-[#2A2927] text-white text-[10.5px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                      <span>Подключить все 5 кабинетов</span>
                    </button>
                  )}
                  {canEditAllStarter && activeCount > 2 && onResetStarterCabinets && (
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
                {hasFinance ? formatMln(gt.annualRevenueRub) : 'Скрыто'}
              </td>
              <td className="py-3 px-3 text-right font-mono text-[#111827]">
                {hasCost ? formatMln(gt.totalProcurementBudgetRub) : 'Скрыто'}
              </td>
              <td className="py-3 px-3 text-right font-mono text-[#111827]">
                {hasCost ? formatMln(gt.firstWaveStartBudgetRub) : 'Скрыто'}
              </td>
              <td className="py-3 px-3 text-right font-mono text-[#334155]">
                {!hasCost || !hasFinance ? (
                  'Скрыто'
                ) : (
                  <>
                    <div>
                      {gt.verifiedOwnMoneyRequiredRub !== null
                        ? formatMln(gt.verifiedOwnMoneyRequiredRub)
                        : wbLagUnspecified
                        ? 'Лаг WB не задан'
                        : '—'}
                    </div>
                    <div className="text-[10px] font-semibold text-amber-800">
                      {gt.verifiedOwnMoneyRequiredRub === null && wbLagUnspecified
                        ? 'график WB не указан'
                        : gt.annualRevenueRub <= 0 && gt.totalProcurementBudgetRub <= 0
                        ? 'нет активного плана'
                        : `пик: ${gt.peakMonthLabel || 'Янв'}${
                            gt.selfFundingMonthLabel ? ` → с ${gt.selfFundingMonthLabel}` : ''
                          }`}
                    </div>
                  </>
                )}
              </td>
              <td className="py-3 px-4 text-right font-mono font-extrabold text-[#059669]">
                {!hasCost || !hasFinance
                  ? 'Скрыто'
                  : `+${formatMln(gt.annualEstimatedOperatingProfitRub)}`}
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
  models?: ScenarioModelSpec[];
  selectedScenarioByBrand?: Partial<Record<string, number | null>>;
  scenarios: GrowthScenarioDef[];
  activeBrandFilter: string;
  onSelectBrandFilter: (brandCode: string) => void;
  onSelectScenarioForBrand: (brandCode: string, scenarioId: number | null) => void;
  onSelectActiveScenarioId: (scenarioId: number, explicitBrandCode?: string) => void;
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
  multiBrandSummary: rawMultiBrandSummary,
  models,
  selectedScenarioByBrand,
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
  const { currentUser, concepts, navigateTo } = usePlatform();
  const hasCost = canUserViewCostPrice(currentUser);
  const hasFinance = canUserViewFinance(currentUser);
  const safeNavigateSection = (
    target: 'product-catalog' | 'launch-calendar' | 'roadmap-tasks' | 'finance'
  ) => {
    if (!canUserAccessSection(currentUser, target)) return;
    onNavigateSection(target);
  };
  const canEditAllStarter = (['AKUSHA', 'LISKANI', 'NA_TELE'] as const).every((c) =>
    canUserEditBrand(currentUser, c)
  );
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

  const wbLagUnspecified = financeParams.wbLagMonths < 0;
  const multiBrandSummary = useMemo(() => {
    if (
      models &&
      models.length > 0 &&
      scenarios &&
      scenarios.length > 0 &&
      (financeParams.initialCashMln !== 0 || financeParams.wbLagMonths !== 0)
    ) {
      return computeMultiBrandPortfolioSummary(
        models,
        scenarios,
        selectedScenarioByBrand || {},
        {
          initialCashRub: Math.round((Number(financeParams.initialCashMln) || 0) * 1_000_000),
          settlementLagMonths: financeParams.wbLagMonths < 0 ? null : financeParams.wbLagMonths,
          wbPayoutScheduleSpecified: financeParams.wbLagMonths >= 0,
        }
      );
    }
    return rawMultiBrandSummary;
  }, [
    rawMultiBrandSummary,
    models,
    scenarios,
    selectedScenarioByBrand,
    financeParams.initialCashMln,
    financeParams.wbLagMonths,
  ]);
  const rawGradUid = React.useId();
  const gradUid = useMemo(() => rawGradUid.replace(/[^a-zA-Z0-9_-]/g, ''), [rawGradUid]);
  const [cabinetsMatrixOpen, setCabinetsMatrixOpen] = useState(isStandaloneHome);
  const [monthlyCashflowOpen, setMonthlyCashflowOpen] = useState(false);
  const [procurementWavesOpen, setProcurementWavesOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
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

  // Режим 1: 4 статьи расходов холдинга (Комиссия WB = 30%, Логистика и хранение WB = 0%, ДРР = 10%)
  const expenseCards = useMemo(() => {
    const rev = Math.max(gt.annualRevenueRub, 1);
    const cogsRub = Math.max(0, gt.annualSoldGoodsCostRub);
    const wbCommissionRub = Math.round(gt.annualRevenueRub * 0.30);
    const wbLogisticsStorageRub = 0;
    const adsAndTaxRub = Math.round(gt.annualRevenueRub * 0.10);

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
        subtitle: 'Комиссия площадки с выкупов (30%)',
        valueRub: wbCommissionRub,
        pct: gt.annualRevenueRub > 0 ? 30 : 0,
        color: '#F59E0B',
      },
      {
        key: 'wb-log',
        label: 'Логистика и хранение WB',
        subtitle: 'Доставка до клиента и склады (0%)',
        valueRub: wbLogisticsStorageRub,
        pct: 0,
        color: '#D97706',
      },
      {
        key: 'ads',
        label: 'Продвижение и налоги',
        subtitle: 'Реклама карточек (ДРР 10%)',
        valueRub: adsAndTaxRub,
        pct: gt.annualRevenueRub > 0 ? 10 : 0,
        color: '#64748B',
      },
    ];
  }, [
    gt.annualRevenueRub,
    gt.annualSoldGoodsCostRub,
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
    () => (gt.annualRevenueRub > 0 ? Math.max(0, Math.min(100, 100 - groupMarginPct)) : 0),
    [gt.annualRevenueRub, groupMarginPct]
  );

  const hasPortfolioActivity =
    gt.annualRevenueRub > 0 || gt.totalProcurementBudgetRub > 0;

  // Режим 2: Доли брендов в годовой выручке холдинга
  const brandSegments = useMemo(() => {
    const rev = Math.max(holdingTotal.annualRevenueRub, 1);
    const palette: Record<string, string> = {
      BORNERS: '#10B981',
      FUKAI: '#0D9488',
      NA_TELE: '#64748B',
      AKUSHA: '#F59E0B',
      LISKANI: '#334155',
    };
    return multiBrandSummary.brands.map((b) => ({
      key: b.brandCode,
      label: b.displayCode,
      subtitle:
        b.annualRevenueRub > 0
          ? hasFinance && hasCost
            ? `${b.modelsCount} SKU · прибыль +${formatMln(b.annualEstimatedOperatingProfitRub)}`
            : `${b.modelsCount} SKU · активный план`
          : `${b.modelsCount} SKU · план не запущен`,
      valueRub: b.annualRevenueRub,
      pct: holdingTotal.annualRevenueRub > 0 ? (b.annualRevenueRub / rev) * 100 : 0,
      color: palette[b.brandCode] || '#334155',
    }));
  }, [multiBrandSummary.brands, holdingTotal.annualRevenueRub, hasFinance, hasCost]);

  const [trendChartMode, setTrendChartMode] = useState<
    'payout' | 'monthlyProfit' | 'ownMoneyPeak'
  >('payout');
  const [selectedTrendMonthIdx, setSelectedTrendMonthIdx] = useState<number>(11);

  useEffect(() => {
    if (!hasCost && (trendChartMode === 'monthlyProfit' || trendChartMode === 'ownMoneyPeak')) {
      setTrendChartMode('payout');
    }
  }, [hasCost, trendChartMode]);

  useEffect(() => {
    if (!hasCost && waterfallViewMode === 'pnl' && hasFinance) {
      setWaterfallViewMode('brands');
    }
  }, [hasCost, hasFinance, waterfallViewMode]);

  const activeCards = waterfallViewMode === 'pnl' ? expenseCards : brandSegments;
  const activeBarSegments = waterfallViewMode === 'pnl' ? pnlWaterfallSegments : brandSegments;

  // Плавный кубический график (ProfitTrendChart 7+5) по 12 месяцам (К выплате WB / Прибыль / Пик своих денег)
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
        mRow && mRow.wbNetInflowRub > 0 ? mRow.wbNetInflowRub : revRub * 0.6;
      const profRub = revRub * marginRatio;
      const intraLowRub = mRow ? mRow.intraMonthLowBalanceRub : 0;
      const endCashRub = mRow ? mRow.cumulativeCashBalanceRub : 0;
      const valRub =
        trendChartMode === 'payout'
          ? payoutRub
          : trendChartMode === 'monthlyProfit'
          ? profRub
          : intraLowRub;
      return {
        idx,
        monthLabel: MONTHS_SHORT_RU[idx]?.toLowerCase() || String(idx + 1),
        revRub,
        payoutRub,
        profRub,
        intraLowRub,
        endCashRub,
        valRub,
        valMln: valRub / 1_000_000,
      };
    });

    const totalPayoutYearRub = series.reduce((acc, s) => acc + s.payoutRub, 0);
    const values = series.map((s) => s.valRub);
    const maxV = Math.max(...values, 1_000_000);
    const minV = Math.min(...values, 0);
    const span = Math.max(maxV - minV, 1);
    const svgW = 680;
    const svgH = 148;
    const padTop = 16;
    const padBottom = 14;
    const usableH = svgH - padTop - padBottom;
    const zeroY = padTop + usableH * (1 - (0 - minV) / span);

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

    const baseLineY = trendChartMode === 'ownMoneyPeak' ? zeroY : svgH;
    const areaPath =
      coords.length > 0
        ? `${smoothPath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseLineY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${baseLineY.toFixed(1)} Z`
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
      zeroY,
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
    if (gt.totalProcurementBudgetRub <= 0) return 0;
    if (
      gt.verifiedOwnMoneyRequiredRub !== null &&
      gt.verifiedOwnMoneyRequiredRub > 0
    ) {
      const fundedByWb = Math.max(0, gt.totalProcurementBudgetRub - gt.verifiedOwnMoneyRequiredRub);
      return Math.min(95, Math.max(0, Math.round((fundedByWb / gt.totalProcurementBudgetRub) * 100)));
    }
    if (gt.verifiedOwnMoneyRequiredRub === 0) return 100;
    return 0;
  }, [gt.totalProcurementBudgetRub, gt.verifiedOwnMoneyRequiredRub]);

  const cogsPct = useMemo(() => {
    if (gt.annualRevenueRub > 0) {
      return Math.round((gt.annualSoldGoodsCostRub / gt.annualRevenueRub) * 1000) / 10;
    }
    return 0;
  }, [gt.annualRevenueRub, gt.annualSoldGoodsCostRub]);

  // 4 круговых индикатора KPIRing (2×2 сетка справа от графика)
  const kpiRings = useMemo(() => {
    const r = 37;
    const circ = 2 * Math.PI * r;
    const canSeeProfit = hasFinance && hasCost;
    return [
      {
        id: 'margin',
        label: 'МАРЖА ВЫРУЧКИ',
        valueText: canSeeProfit ? `${Math.round(groupMarginPct)}%` : 'Скрыто',
        subText: !canSeeProfit
          ? 'Доступ по роли'
          : gt.annualRevenueRub <= 0
          ? 'План не запущен'
          : `↑ +${groupMarginPct.toFixed(1).replace('.', ',')} ₽ со 100 ₽`,
        pctFill:
          canSeeProfit && gt.annualRevenueRub > 0
            ? Math.min(100, Math.max(8, groupMarginPct * 1.6))
            : 0,
        color: '#10B981',
        circ,
        r,
        onClick: () => {
          if (hasFinance) safeNavigateSection('finance');
        },
      },
      {
        id: 'roi',
        label: 'ОТДАЧА КАПИТАЛА',
        valueText: !canSeeProfit
          ? 'Скрыто'
          : wbLagUnspecified || !ownCapitalRoiMult || ownCapitalRoiMult <= 0
          ? '—'
          : `×${ownCapitalRoiMult.toFixed(1).replace('.', ',')}`,
        subText: !canSeeProfit
          ? 'Доступ по роли'
          : wbLagUnspecified
          ? 'Лаг WB не задан'
          : ownCapitalRoiMult && ownCapitalRoiMult > 0
          ? `↑ ${Math.round(ownCapitalRoiMult * 100)}% годовых`
          : gt.annualRevenueRub <= 0
          ? 'План не запущен'
          : '↑ с оборота WB',
        pctFill:
          !canSeeProfit || wbLagUnspecified || !ownCapitalRoiMult || ownCapitalRoiMult <= 0
            ? 0
            : Math.min(100, Math.max(15, Math.round(ownCapitalRoiMult * 25))),
        color: '#10B981',
        circ,
        r,
        onClick: () => {
          if (hasFinance) safeNavigateSection('finance');
        },
      },
      {
        id: 'reinvest',
        label: 'ПАРТИЙ С ОБОРОТА WB',
        valueText: !hasCost ? 'Скрыто' : wbLagUnspecified ? '—' : `${selfFundedProcurementPct}%`,
        subText: !hasCost
          ? 'Доступ по роли'
          : wbLagUnspecified
          ? 'Лаг WB не задан'
          : gt.totalProcurementBudgetRub <= 0
          ? 'План не запущен'
          : '↑ без своих денег',
        pctFill: !hasCost || wbLagUnspecified ? 0 : selfFundedProcurementPct,
        color: '#10B981',
        circ,
        r,
        onClick: () => {
          if (typeof window !== 'undefined') {
            try {
              window.sessionStorage.setItem('borners_open_procurement_view_mode', 'summary');
              window.dispatchEvent(new CustomEvent('borners-open-procurement-summary'));
            } catch {
              // ignore
            }
          }
          safeNavigateSection('roadmap-tasks');
        },
      },
      {
        id: 'cogs',
        label: 'СЕБЕСТОИМОСТЬ',
        valueText: hasCost ? `${Math.round(cogsPct)}%` : 'Скрыто',
        subText: !hasCost
          ? 'Доступ по роли'
          : gt.annualRevenueRub <= 0
          ? 'План не запущен'
          : '↓ норма ≤ 25% цены',
        pctFill:
          hasCost && gt.annualRevenueRub > 0
            ? Math.min(100, Math.max(12, cogsPct * 2.2))
            : 0,
        color: '#0D9488',
        circ,
        r,
        onClick: () => {
          if (typeof window !== 'undefined') {
            try {
              window.sessionStorage.setItem('borners_open_procurement_view_mode', 'summary');
              window.dispatchEvent(new CustomEvent('borners-open-procurement-summary'));
            } catch {
              // ignore
            }
          }
          safeNavigateSection('roadmap-tasks');
        },
      },
    ];
  }, [
    groupMarginPct,
    ownCapitalRoiMult,
    selfFundedProcurementPct,
    cogsPct,
    gt.annualRevenueRub,
    gt.totalProcurementBudgetRub,
    currentUser,
    onNavigateSection,
    hasFinance,
    hasCost,
    wbLagUnspecified,
  ]);

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

  // Данные 4 реальных волн закупок 2027 года (строго 1-в-1 с активными кабинетами multiBrandSummary.brands)
  const procurementWavesTimeline = useMemo(() => {
    if (models && models.length > 0 && scenarios.length > 0) {
      const seenKeys = new Set<string>();
      const catalogModels: ScenarioModelSpec[] = [];
      for (const rm of models) {
        if (!rm || rm.launchStatus === 'В архиве') continue;
        const key = rm.id || rm.code;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        catalogModels.push(rm);
      }

      const entries: { model: ScenarioModelSpec; scenario: GrowthScenarioDef }[] = [];
      for (const bRow of multiBrandSummary.brands) {
        if (normalizedSelectedBrand !== 'ALL' && bRow.brandCode !== normalizedSelectedBrand) {
          continue;
        }
        if (!bRow.hasScenario || !bRow.hasModels || bRow.selectedScenarioId === null) {
          continue;
        }
        const bScen = scenarios.find((s) => s.id === bRow.selectedScenarioId && !s.isArchived);
        if (!bScen) continue;

        const brandModels = catalogModels.filter((m) => matchesBrandFilter(m, bRow.brandCode));
        const scopedBrandModels =
          bScen.id === ACTING_2027_SCENARIO_ID
            ? brandModels.filter(
                (m) =>
                  Boolean(getActingSkuByWbOrVendor(m.code, m.title)) ||
                  Boolean(m.plansByScenario?.[ACTING_2027_SCENARIO_ID])
              )
            : brandModels;

        for (const m of scopedBrandModels) {
          entries.push({ model: m, scenario: bScen });
        }
      }
      if (entries.length > 0) {
        return computePortfolioProcurementWavesSummary(entries, gt.monthlyRows, 2027).waves;
      }
    }

    // Резервный расчёт строго по реальным помесячным оттокам gt.monthlyRows (без условных долей)
    const rows = gt.monthlyRows || [];
    const totalProc = Math.max(gt.totalProcurementBudgetRub, 0);
    const qOutflows = [0, 1, 2, 3].map((q) => {
      const m0 = rows[q * 3];
      const m1 = rows[q * 3 + 1];
      const m2 = rows[q * 3 + 2];
      return {
        prepay:
          (m0?.factoryPrepaymentOutflowRub || 0) +
          (m1?.factoryPrepaymentOutflowRub || 0) +
          (m2?.factoryPrepaymentOutflowRub || 0),
        balance:
          (m0?.factoryBalanceOutflowRub || 0) +
          (m1?.factoryBalanceOutflowRub || 0) +
          (m2?.factoryBalanceOutflowRub || 0),
      };
    });
    const titles = [
      'Стартовая партия (Янв – Мар)',
      'Весна – Лето (Апр – Июн)',
      'Высокий сезон и Осень (Июл – Сен)',
      'Пик декабря и Новый год (Окт – Дек)',
    ];
    const orderWindows = ['Ноя – Дек', 'Февраль', 'Май', 'Август'];
    const arrivals = ['Январь', 'Апрель', 'Июль', 'Октябрь'];
    return qOutflows.map((qo, idx) => {
      const budgetRub = qo.prepay + qo.balance;
      const selfFunded = idx >= 2;
      return {
        id: `q${idx + 1}` as 'q1' | 'q2' | 'q3' | 'q4',
        waveNum: `Волна №${idx + 1} · Q${idx + 1}`,
        title: titles[idx],
        orderWindow: orderWindows[idx],
        arrivalMonth: arrivals[idx],
        coverageMonths: [idx * 3, idx * 3 + 1, idx * 3 + 2],
        orderMonthIdx: Math.max(0, idx * 3 - 1),
        budgetRub,
        prepayRub: qo.prepay,
        balanceRub: qo.balance,
        fundingLabel: selfFunded
          ? '100% из оборотной выручки WB'
          : idx === 0
          ? 'Стартовый капитал + аванс фабрикам'
          : 'Реинвест с выручки WB',
        fundingTone: (selfFunded ? 'emerald' : idx === 0 ? 'cyan' : 'indigo') as
          | 'cyan'
          | 'indigo'
          | 'emerald',
        sharePct: totalProc > 0 ? Math.round((budgetRub / totalProc) * 100) : 0,
      };
    });
  }, [
    models,
    scenarios,
    multiBrandSummary.brands,
    normalizedSelectedBrand,
    gt.monthlyRows,
    gt.totalProcurementBudgetRub,
  ]);

  return (
    <div className="space-y-6">
      {/* 0. СТРОКА ЗАГОЛОВКА И ФИЛЬТРА КАБИНЕТОВ */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
        <div>
          <h1 className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.02em] text-[#141413] dark:text-[#F5F4F0] leading-tight">
            {selectedBrandRow
              ? `Кабинет ${selectedBrandRow.displayCode} · Финансовый обзор`
              : 'Финансовый центр BORNERS GROUP'}
          </h1>
          <p className="text-[12px] text-[#5C5953] dark:text-[#9A968E] mt-0.5">
            {selectedBrandRow
              ? `${selectedBrandRow.modelsCount} SKU · план 2027 года`
              : `Консолидация ${activeBrandsCount} активных из 5 кабинетов холдинга · 2027`}
          </p>
        </div>

        {/* Единый сегментированный пульт кабинетов + действия */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] p-1 border border-[#E4E1DA] dark:border-[#282724]">
            <button
              type="button"
              onClick={() => {
                onSelectBrandFilter('ALL');
                const bornersScenId = multiBrandSummary.brands.find(
                  (x) => x.brandCode === 'BORNERS'
                )?.selectedScenarioId;
                if (bornersScenId) {
                  onSelectActiveScenarioId(bornersScenId, 'ALL');
                }
              }}
              className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                activeBrandFilter === 'ALL'
                  ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413]'
                  : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0] hover:bg-white dark:hover:bg-[#151514]'
              }`}
            >
              <span>Все (5)</span>
              {hasFinance && (
                <span className="font-mono text-[11px] opacity-80">
                  {(holdingTotal.annualRevenueRub / 1_000_000).toFixed(1).replace('.', ',')} млн
                </span>
              )}
            </button>

            {multiBrandSummary.brands.map((b) => {
              const isSelected =
                activeBrandFilter !== 'ALL' &&
                normalizePortfolioBrandCode(activeBrandFilter) === b.brandCode;
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
                        onSelectActiveScenarioId(bornersScenId, 'ALL');
                      }
                    } else {
                      onSelectBrandFilter(b.brandCode);
                      if (b.selectedScenarioId !== null) {
                        onSelectActiveScenarioId(b.selectedScenarioId, b.brandCode);
                      }
                    }
                  }}
                  className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413]'
                      : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0] hover:bg-white dark:hover:bg-[#151514]'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      hasRev ? 'bg-[#15803D]' : 'bg-[#78746C]'
                    }`}
                  />
                  <span>{b.displayCode}</span>
                  {hasRev && hasFinance && (
                    <span className="font-mono text-[11px] opacity-75">
                      {(b.annualRevenueRub / 1_000_000).toFixed(0)} млн
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {canEditAllStarter && activeBrandsCount < 5 && onLaunchAllCabinets && (
            <button
              type="button"
              onClick={onLaunchAllCabinets}
              title="В 1 клик запустить стартовые матрицы AKUSHA, LISKANI и НА ТЕЛЕ в сводке холдинга"
              className="h-9 px-3 rounded-lg bg-white dark:bg-[#151514] hover:border-[#141413] dark:hover:border-[#5C5953] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] text-[12px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>Все 5 кабинетов</span>
            </button>
          )}

          {canEditAllStarter && activeBrandsCount > 3 && onResetStarterCabinets && (
            <button
              type="button"
              onClick={onResetStarterCabinets}
              title="Вернуть эталонную сводку из 3 действующих кабинетов (BORNERS + FUKAI + LISKANI)"
              className="h-9 px-2.5 rounded-lg bg-white dark:bg-[#151514] hover:bg-[#FAF9F6] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] text-[11.5px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
            >
              <span>↺ 3 базовых</span>
            </button>
          )}

          {onOpenStrategySummary && (
            <button
              type="button"
              onClick={onOpenStrategySummary}
              className="h-9 px-3.5 rounded-lg bg-[#141413] hover:bg-[#2A2927] dark:bg-[#F5F4F0] dark:hover:bg-[#E4E1DA] text-white dark:text-[#141413] text-[12px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span>Сводка и 4 сценария</span>
              <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* БАННЕР БЫСТРОГО ЗАПУСКА ПУСТОГО КАБИНЕТА (если выбран AKUSHA, LISKANI или НА ТЕЛЕ с 0 выручки) */}
      {selectedBrandRow &&
        (!selectedBrandRow.hasScenario ||
          !selectedBrandRow.hasModels ||
          selectedBrandRow.annualRevenueRub === 0) && (
          <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] font-mono text-[11px] font-medium">
                  Кабинет {selectedBrandRow.displayCode} · Готов к запуску
                </span>
                <span className="text-xs text-[#5C5953] dark:text-[#9A968E]">
                  {getBrandUnitConfig(selectedBrandRow.brandCode).categoryDefault}
                </span>
              </div>
              <div className="text-[15px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                В кабинете {selectedBrandRow.displayCode} пока нет активного плана продаж на 2027 год
              </div>
              <p className="text-xs text-[#5C5953] dark:text-[#9A968E]">
                Запустите подготовленную стартовую матрицу из 3 флагманских SKU с заполненной юнит-экономикой WB и помесячным планом на 2027 год в один клик — или добавьте свои товары вручную.
              </p>
            </div>
            {canUserEditBrand(currentUser, selectedBrandRow.brandCode) && (
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
                      className="h-9 px-4 rounded-lg bg-[#141413] hover:bg-[#2A2927] text-white text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                      <span>Запустить стартовую матрицу {selectedBrandRow.displayCode} (3 SKU)</span>
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => onOpenCreateModelForBrand(selectedBrandRow.brandCode)}
                  className="h-9 px-3.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] text-xs font-medium cursor-pointer"
                >
                  + Свой товар
                </button>
              </div>
            )}
          </div>
        )}

      {/* 1. ГЛАВНЫЙ ИТОГ 2027: ЧИСТЫЙ АРХИТЕКТУРНЫЙ ЛИСТ (COS / RAMP SHEET) */}
      <div
        onClick={() => safeNavigateSection('finance')}
        className={`relative rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] shadow-[0_1px_2px_rgba(20,20,19,0.04)] p-6 sm:p-7 overflow-hidden transition-colors hover:border-[#CBC7BE] dark:hover:border-[#3A3834] ${
          canUserAccessSection(currentUser, 'finance') ? 'cursor-pointer' : ''
        }`}
      >
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Левая и центральная часть (8 колонок из 12): Главная цифра прибыли + 3 колонки-опоры с тонкими разделителями */}
          <div className="xl:col-span-8 space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] font-mono text-[11px] font-semibold uppercase tracking-[0.06em]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#15803D]" />
                  <span>Главный итог 2027</span>
                </span>
                <span className="text-xs sm:text-[13px] font-medium text-[#5C5953] dark:text-[#9A968E]">
                  {selectedBrandRow
                    ? `Чистая операционная прибыль кабинета ${selectedBrandRow.displayCode}`
                    : 'Чистая операционная прибыль холдинга на руках'}
                </span>
              </div>

              <div className="mt-3.5 flex flex-wrap items-baseline gap-3">
                <div className="font-mono text-4xl sm:text-[46px] font-semibold tracking-[-0.025em] tabular-nums leading-none text-[#15803D] dark:text-emerald-400">
                  {hasFinance && hasCost ? (
                    <AnimatedMlnValue
                      valueRub={gt.annualEstimatedOperatingProfitRub}
                      prefix="+"
                      unitClassName="text-lg sm:text-xl font-medium tracking-normal text-[#15803D] dark:text-emerald-400/90 font-sans ml-1.5"
                    />
                  ) : (
                    <span>Скрыто</span>
                  )}
                </div>
                {hasFinance && hasCost && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono text-xs font-medium bg-[#FAF9F6] dark:bg-[#1D1C1A] text-[#15803D] dark:text-emerald-400 border border-[#E4E1DA] dark:border-[#282724]">
                    ↑ рентабельность {groupMarginPct.toFixed(1).replace('.', ',')}%
                  </span>
                )}
              </div>

              <p className="mt-2 text-xs sm:text-[13px] text-[#5C5953] dark:text-[#9A968E]">
                Свободный денежный поток после оплаты производства фабрикам, комиссий WB, логистики, продвижения (ДРР) и налогов.
              </p>
            </div>

            {/* 3 архитектурные колонки-опоры с 1px hairline-разделителями */}
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#E4E1DA] dark:divide-[#282724] border-t border-[#E4E1DA] dark:border-[#282724] pt-5">
              <div className="pb-4 sm:pb-0 sm:pr-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[#5C5953] dark:text-[#9A968E]">
                    1. Выручка за 2027 год
                  </span>
                  <span className="font-mono text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] dark:text-[#9A968E]">
                    {gt.modelsCount} SKU
                  </span>
                </div>
                <div className="mt-1.5 font-mono text-xl sm:text-[22px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                  {hasFinance ? formatMln(gt.annualRevenueRub) : 'Скрыто'}
                </div>
                <div className="mt-1 text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
                  Пик декабря:{' '}
                  <strong className="font-mono font-medium text-[#141413] dark:text-[#F5F4F0]">
                    {hasFinance ? formatMln(gt.decemberRevenueRub) : 'Скрыто'}
                  </strong>
                </div>
              </div>

              <div className="py-4 sm:py-0 sm:px-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[#5C5953] dark:text-[#9A968E]">
                    2. Приходит со счёта WB
                  </span>
                  <span className="font-mono text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] dark:text-[#9A968E]">
                    за вычетом WB
                  </span>
                </div>
                <div className="mt-1.5 font-mono text-xl sm:text-[22px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                  {hasFinance ? formatMln(trendChartData.totalPayoutYearRub) : 'Скрыто'}
                </div>
                <div className="mt-1 text-[11.5px] text-[#5C5953] dark:text-[#9A968E]">
                  После комиссии и логистики WB
                </div>
              </div>

              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (!hasFinance || !hasCost) return;
                  setTrendChartMode('ownMoneyPeak');
                  setSelectedTrendMonthIdx(gt.peakMonthIdx ?? 0);
                }}
                title="Нажмите, чтобы показать кривую «Пик своих денег» на графике 12 мес."
                className="pt-4 sm:pt-0 sm:pl-5 rounded-r-lg cursor-pointer transition-colors hover:bg-[#FAF9F6]/70 dark:hover:bg-[#1D1C1A]/70"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[#5C5953] dark:text-[#9A968E]">
                    3. Пик своих денег
                  </span>
                  <span className="font-mono text-[10.5px] font-medium px-1.5 py-0.5 rounded bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0]">
                    {!hasFinance || !hasCost
                      ? 'Скрыто'
                      : !hasPortfolioActivity
                      ? '0 SKU'
                      : wbLagUnspecified
                      ? 'Лаг WB?'
                      : ownCapitalRoiMult
                      ? `ROI ×${ownCapitalRoiMult.toFixed(1).replace('.', ',')}`
                      : 'Реинвест'}
                  </span>
                </div>
                <div className="mt-1.5 font-mono text-xl sm:text-[22px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                  {!hasFinance || !hasCost
                    ? 'Скрыто'
                    : !hasPortfolioActivity
                    ? '0,00 млн ₽'
                    : gt.verifiedOwnMoneyRequiredRub !== null
                    ? gt.verifiedOwnMoneyRequiredRub > 0
                      ? formatMln(gt.verifiedOwnMoneyRequiredRub)
                      : 'Из оборота'
                    : wbLagUnspecified
                    ? 'Лаг WB не задан'
                    : 'Из оборота'}
                </div>
                <div className="mt-1 text-[11.5px] text-[#5C5953] dark:text-[#9A968E] leading-snug">
                  {!hasFinance || !hasCost ? (
                    <span>Доступ к себестоимости и финансам ограничен</span>
                  ) : !hasPortfolioActivity ? (
                    <span>План продаж и закупок не запущен</span>
                  ) : wbLagUnspecified ? (
                    <span className="text-rose-700 dark:text-rose-400">Укажите лаг выплат WB в 04 · Финансы</span>
                  ) : (
                    <>
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#141413] dark:bg-[#F5F4F0] mr-1.5 align-middle" />
                      Пик в {gt.peakMonthLabel || 'Янв'} 2027{' '}
                      <span className="text-[#15803D] dark:text-emerald-400 font-medium">
                        ·{' '}
                        {gt.selfFundingMonthLabel && (gt.verifiedOwnMoneyRequiredRub ?? 0) > 0
                          ? `с ${gt.selfFundingMonthLabel} — в плюс с WB`
                          : `${selfFundedProcurementPct}% партий с WB`}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Правая архитектурная карточка (4 колонки из 12): «Коротко о периоде · На 100 ₽» */}
          <div className="xl:col-span-4 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5C5953] dark:text-[#9A968E]">
                Коротко о периоде · На 100 ₽
              </span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] dark:text-[#9A968E]">
                2027 год
              </span>
            </div>

            {hasFinance && hasCost ? (
              <>
                <div className="text-[15.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] leading-snug">
                  Из каждых 100 ₽ выручки{' '}
                  <span className="text-[#15803D] dark:text-emerald-400">
                    +{groupMarginPct.toFixed(1).replace('.', ',')} ₽ остаются чистой прибылью
                  </span>
                </div>

                {/* Наглядная двухцветная полоса 100 ₽ */}
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded-full bg-[#E4E1DA] dark:bg-[#282724] overflow-hidden flex gap-0.5">
                    {gt.annualRevenueRub > 0 && (
                      <>
                        <div
                          style={{ width: `${Math.max(15, Math.min(85, totalExpensesPct))}%` }}
                          className="h-full bg-[#8A867E]"
                        />
                        <div
                          style={{ width: `${Math.max(15, Math.min(85, groupMarginPct))}%` }}
                          className="h-full bg-[#15803D]"
                        />
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11.5px] font-mono tabular-nums">
                    <span className="text-[#5C5953] dark:text-[#9A968E]">
                      Затраты и WB: <strong className="text-[#141413] dark:text-[#F5F4F0]">{totalExpensesPct.toFixed(1).replace('.', ',')} ₽</strong>
                    </span>
                    <span className="text-[#15803D] dark:text-emerald-400 font-semibold">
                      Чистыми: +{groupMarginPct.toFixed(1).replace('.', ',')} ₽
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#5C5953] dark:text-[#9A968E] leading-relaxed pt-2 border-t border-[#E4E1DA] dark:border-[#282724]">
                  {gt.totalProcurementBudgetRub > 0 ? (
                    <>
                      Собственный капитал запускает только 1-ю волну — дальше{' '}
                      <strong className="text-[#141413] dark:text-[#F5F4F0] font-semibold">
                        {selfFundedProcurementPct}% годовых партий
                      </strong>{' '}
                      финансируются из поступлений WB.
                    </>
                  ) : (
                    <span>Активный план продаж и закупок в выбранном кабинете пока не запущен.</span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-xs text-[#5C5953] dark:text-[#9A968E] leading-relaxed">
                Детализация рентабельности и себестоимости скрыта в соответствии с правами вашей роли.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 2. СРЕДНИЙ РЯД 7 + 5: ГРАФИК ПОСТУПЛЕНИЙ WB (7 КОЛ.) + 2×2 KPIRING (5 КОЛ.) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Левая колонка (7/12) */}
        <div className="lg:col-span-7 rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] shadow-[0_1px_2px_rgba(20,20,19,0.04)] p-5 flex flex-col justify-between">
          {!hasFinance ||
          (!hasCost && (trendChartMode === 'monthlyProfit' || trendChartMode === 'ownMoneyPeak')) ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-4 py-8 space-y-2">
              <span className="px-2.5 py-0.5 rounded-md bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] dark:text-[#9A968E] font-mono text-[11px] font-semibold">
                ДИНАМИКА 12 МЕС. · СКРЫТО ПО РОЛИ
              </span>
              <div className="text-[15px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                График денежных потоков и прибыли ограничен правами доступа
              </div>
              <p className="text-xs text-[#5C5953] dark:text-[#9A968E] max-w-md">
                Для просмотра помесячных выплат WB, операционной прибыли и графика собственных денег требуются права на финансовый контур и себестоимость.
              </p>
            </div>
          ) : (
            <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] font-mono text-[10.5px] font-semibold">
                  ДИНАМИКА 12 МЕС.
                </span>
                <span className="text-xs font-medium text-[#5C5953] dark:text-[#9A968E]">
                  {trendChartMode === 'payout'
                    ? 'Поступления от WB на расчётный счёт · 2027'
                    : trendChartMode === 'monthlyProfit'
                    ? `Помесячная чистая прибыль (${selectedMonthPoint?.monthLabel || 'дек'}) · 2027`
                    : 'Баланс своих денег внутри месяца (пик и выход в плюс) · 2027'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5">
                <span className="font-mono text-2xl sm:text-[28px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                  {trendChartMode === 'payout'
                    ? formatMln(trendChartData.totalPayoutYearRub)
                    : trendChartMode === 'monthlyProfit'
                    ? `+${formatMln(selectedMonthPoint?.profRub || 0)} в ${selectedMonthPoint?.monthLabel || 'дек'}`
                    : !hasPortfolioActivity
                    ? '0,00 млн ₽'
                    : gt.verifiedOwnMoneyRequiredRub
                    ? `Пик: ${formatMln(gt.verifiedOwnMoneyRequiredRub)}`
                    : 'Из оборота WB'}
                </span>
                {trendChartMode === 'ownMoneyPeak' ? (
                  hasPortfolioActivity ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0]">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-600" />
                        <span>Пик в {gt.peakMonthLabel || 'Янв'} 2027</span>
                      </span>
                      {gt.selfFundingMonthLabel && (gt.verifiedOwnMoneyRequiredRub ?? 0) > 0 && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#15803D] dark:text-emerald-400">
                          ✓ В плюс с {gt.selfFundingMonthLabel}
                        </span>
                      )}
                    </>
                  ) : null
                ) : (
                  trendChartData.growthMult &&
                  trendChartData.growthMult > 1 && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#15803D] dark:text-emerald-400">
                      ↑ ×{trendChartData.growthMult.toFixed(1).replace('.', ',')} к январю
                    </span>
                  )
                )}
                {selectedMonthPoint && (
                  <span className="text-xs text-[#5C5953] dark:text-[#9A968E]">
                    · {selectedMonthPoint.monthLabel}:{' '}
                    <strong className="font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                      {trendChartMode === 'payout'
                        ? `${(selectedMonthPoint.payoutRub / 1_000_000).toFixed(1).replace('.', ',')} млн ₽ на счёт`
                        : trendChartMode === 'monthlyProfit'
                        ? `выручка ${(selectedMonthPoint.revRub / 1_000_000).toFixed(1).replace('.', ',')} млн ₽`
                        : `до прихода WB ${(selectedMonthPoint.intraLowRub / 1_000_000).toFixed(1).replace('.', ',')} млн ₽ · конец мес. ${(selectedMonthPoint.endCashRub / 1_000_000).toFixed(1).replace('.', ',')} млн ₽`}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            {/* Переключатель К выплате WB / Прибыль мес. / Пик своих денег */}
            <div className="inline-flex flex-wrap items-center rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] p-1 text-xs gap-0.5">
              <button
                type="button"
                onClick={() => setTrendChartMode('payout')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  trendChartMode === 'payout'
                    ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413]'
                    : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                }`}
              >
                К выплате WB
              </button>
              {hasCost && (
                <>
                  <button
                    type="button"
                    onClick={() => setTrendChartMode('monthlyProfit')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      trendChartMode === 'monthlyProfit'
                        ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413]'
                        : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                    }`}
                  >
                    Прибыль по мес.
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTrendChartMode('ownMoneyPeak');
                      setSelectedTrendMonthIdx(gt.peakMonthIdx ?? 0);
                    }}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      trendChartMode === 'ownMoneyPeak'
                        ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413]'
                        : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                    }`}
                  >
                    Пик своих денег
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Кривая с подписями опорных точек */}
          <div className="mt-4">
            <div className="relative h-[156px] w-full">
              <svg
                viewBox={`0 0 ${trendChartData.svgW} ${trendChartData.svgH}`}
                preserveAspectRatio="none"
                className="w-full h-full overflow-visible"
              >
                <defs>
                  <linearGradient id={`peaklyEmeraldAreaGrad-${gradUid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#15803D" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#15803D" stopOpacity="0.01" />
                  </linearGradient>
                  <linearGradient id={`peaklyOwnMoneyAreaGrad-${gradUid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#15803D" stopOpacity="0.16" />
                    <stop offset="65%" stopColor="#78746C" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#E11D48" stopOpacity="0.16" />
                  </linearGradient>
                </defs>
                <line
                  x1="0"
                  y1={trendChartData.padTop + trendChartData.usableH * 0.25}
                  x2={trendChartData.svgW}
                  y2={trendChartData.padTop + trendChartData.usableH * 0.25}
                  stroke="currentColor"
                  className="text-[#E4E1DA] dark:text-[#282724]"
                  strokeDasharray="3 5"
                  strokeWidth="1"
                />
                <line
                  x1="0"
                  y1={trendChartData.padTop + trendChartData.usableH * 0.65}
                  x2={trendChartData.svgW}
                  y2={trendChartData.padTop + trendChartData.usableH * 0.65}
                  stroke="currentColor"
                  className="text-[#E4E1DA] dark:text-[#282724]"
                  strokeDasharray="3 5"
                  strokeWidth="1"
                />
                {trendChartMode === 'ownMoneyPeak' && (
                  <g>
                    <line
                      x1="0"
                      y1={trendChartData.zeroY}
                      x2={trendChartData.svgW}
                      y2={trendChartData.zeroY}
                      stroke="#78746C"
                      strokeDasharray="4 4"
                      strokeWidth="1.2"
                    />
                    <text
                      x={trendChartData.svgW - 6}
                      y={Math.max(11, trendChartData.zeroY - 4)}
                      textAnchor="end"
                      className="font-mono text-[9.5px] font-semibold fill-[#5C5953] dark:fill-[#9A968E] select-none"
                    >
                      0 ₽ (самоокупаемость)
                    </text>
                  </g>
                )}
                {trendChartData.areaPath && (
                  <path
                    d={trendChartData.areaPath}
                    fill={
                      trendChartMode === 'ownMoneyPeak'
                        ? `url(#peaklyOwnMoneyAreaGrad-${gradUid})`
                        : `url(#peaklyEmeraldAreaGrad-${gradUid})`
                    }
                    className="transition-all duration-700 ease-out"
                  />
                )}
                {trendChartData.smoothPath && (
                  <path
                    d={trendChartData.smoothPath}
                    fill="none"
                    stroke={trendChartMode === 'ownMoneyPeak' ? '#141413' : '#15803D'}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out dark:stroke-emerald-400"
                  />
                )}
                {trendChartData.coords.map((pt) => {
                  const isSel = pt.idx === selectedTrendMonthIdx;
                  const isPeakMonthPt =
                    trendChartMode === 'ownMoneyPeak' && pt.idx === (gt.peakMonthIdx ?? 0);
                  const isCrossoverPt =
                    trendChartMode === 'ownMoneyPeak' &&
                    gt.selfFundingMonthIdx !== null &&
                    gt.selfFundingMonthIdx !== undefined &&
                    pt.idx === gt.selfFundingMonthIdx;
                  const showMilestoneLabel =
                    isSel ||
                    isPeakMonthPt ||
                    isCrossoverPt ||
                    pt.idx === 0 ||
                    pt.idx === 4 ||
                    pt.idx === 8 ||
                    pt.idx === 11;
                  const labelMln = (pt.valRub / 1_000_000).toFixed(1).replace('.', ',');
                  const isNeg = trendChartMode === 'ownMoneyPeak' && pt.valRub < 0;
                  const dotColor = isPeakMonthPt
                    ? '#E11D48'
                    : isNeg
                    ? '#78746C'
                    : '#15803D';
                  return (
                    <g
                      key={pt.idx}
                      onClick={() => setSelectedTrendMonthIdx(pt.idx)}
                      className="cursor-pointer"
                    >
                      <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />
                      {(isSel || isPeakMonthPt) && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="8"
                          fill={dotColor}
                          fillOpacity="0.18"
                        />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isSel || isPeakMonthPt ? 4.5 : 3}
                        fill={isSel || isPeakMonthPt ? dotColor : '#FFFFFF'}
                        stroke={dotColor}
                        strokeWidth="2"
                      />
                      {showMilestoneLabel && (
                        <text
                          x={pt.x}
                          y={
                            isNeg && pt.y > trendChartData.svgH - 22
                              ? Math.max(11, pt.y - 10)
                              : Math.max(11, pt.y - 10)
                          }
                          textAnchor="middle"
                          className={`font-mono text-[10.5px] select-none ${
                            isPeakMonthPt
                              ? 'fill-rose-700 dark:fill-rose-400 font-bold'
                              : isSel
                              ? isNeg
                                ? 'fill-[#141413] dark:fill-[#F5F4F0] font-bold'
                                : 'fill-[#15803D] dark:fill-emerald-400 font-bold'
                              : 'fill-[#5C5953] dark:fill-[#9A968E] font-medium'
                          }`}
                        >
                          {isPeakMonthPt ? `ПИК ${labelMln}` : labelMln}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Шкала месяцев снизу */}
            <div className="grid grid-cols-12 gap-1 pt-2 border-t border-[#E4E1DA] dark:border-[#282724]">
              {trendChartData.coords.map((pt) => {
                const isSel = pt.idx === selectedTrendMonthIdx;
                const isPeakMonthBtn =
                  trendChartMode === 'ownMoneyPeak' && pt.idx === (gt.peakMonthIdx ?? 0);
                return (
                  <button
                    key={pt.idx}
                    type="button"
                    onClick={() => setSelectedTrendMonthIdx(pt.idx)}
                    className={`text-center py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                      isSel
                        ? isPeakMonthBtn
                          ? 'font-semibold text-rose-700 dark:text-rose-300 bg-rose-500/10'
                          : 'font-semibold text-white dark:text-[#141413] bg-[#141413] dark:bg-[#F5F4F0]'
                        : isPeakMonthBtn
                        ? 'font-semibold text-rose-700 dark:text-rose-400 bg-[#FAF9F6] dark:bg-[#1D1C1A]'
                        : 'font-medium text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                    }`}
                  >
                    {pt.monthLabel}
                  </button>
                );
              })}
            </div>
            {trendChartMode === 'ownMoneyPeak' && hasPortfolioActivity && (
              <div className="mt-2.5 pt-2 border-t border-[#E4E1DA] dark:border-[#282724] flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                <span className="text-[#5C5953] dark:text-[#9A968E]">
                  Окно пика: <strong className="text-[#141413] dark:text-[#F5F4F0] font-semibold">{gt.peakWindowHumanRu || `${gt.peakMonthLabel || 'Янв'} 2027 · до прихода выплат WB`}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => safeNavigateSection('finance')}
                  className="font-medium text-[#141413] dark:text-[#F5F4F0] hover:underline cursor-pointer"
                >
                  Подробная анатомия и 2-слойный график в 04 · Финансы →
                </button>
              </div>
            )}
          </div>
            </>
          )}
        </div>

        {/* Правая колонка (5/12): Сетка 2×2 KPIRing */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-3.5">
          {kpiRings.map((ring) => {
            const dashOffset = ring.circ * (1 - ring.pctFill / 100);
            return (
              <div
                key={ring.id}
                onClick={ring.onClick}
                className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953] bg-white dark:bg-[#151514] shadow-[0_1px_2px_rgba(20,20,19,0.04)] p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
              >
                <div className="relative h-[86px] w-[86px] flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 90 90">
                    <circle
                      cx="45"
                      cy="45"
                      r={ring.r}
                      fill="none"
                      stroke="currentColor"
                      className="text-[#E4E1DA] dark:text-[#282724]"
                      strokeWidth="5"
                    />
                    <circle
                      cx="45"
                      cy="45"
                      r={ring.r}
                      fill="none"
                      stroke="#141413"
                      className="dark:stroke-[#F5F4F0] transition-all duration-1000 ease-out"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={ring.circ}
                      strokeDashoffset={dashOffset}
                    />
                  </svg>
                  <span className="relative z-10 font-mono text-[17px] font-semibold tracking-[-0.025em] tabular-nums leading-none text-[#141413] dark:text-[#F5F4F0]">
                    {ring.valueText}
                  </span>
                </div>
                <div className="mt-2.5 text-[11.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                  {ring.label}
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-[#5C5953] dark:text-[#9A968E]">
                  {ring.subText}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. СЕКЦИЯ «01 · ВЫРУЧКА И КАПИТАЛ ДЛЯ ЗАПУСКА»: 4 АРХИТЕКТУРНЫЕ КАРТОЧКИ */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-0.5 rounded-md bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] font-mono text-[11px] font-semibold">
              01
            </span>
            <h3 className="text-[14px] sm:text-[15px] font-semibold tracking-tight text-[#141413] dark:text-[#F5F4F0]">
              Выручка и капитал для запуска
            </h3>
            <span className="hidden sm:inline text-xs text-[#5C5953] dark:text-[#9A968E]">
              · Сколько продаём за год и сколько денег нужно на старт
            </span>
          </div>
          <span className="text-xs font-medium text-[#5C5953] dark:text-[#9A968E]">
            Нажмите на карточку для перехода в раздел →
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Карточка 1: Выручка холдинга */}
          <div
            onClick={() => safeNavigateSection('launch-calendar')}
            className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953] bg-white dark:bg-[#151514] shadow-[0_1px_2px_rgba(20,20,19,0.04)] p-4 sm:p-5 cursor-pointer transition-colors flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] inline-flex items-center justify-center shrink-0">
                    <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </span>
                  <span className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] truncate">
                    {selectedBrandRow ? `Выручка · ${selectedBrandRow.displayCode}` : 'Выручка холдинга'}
                  </span>
                </div>
                <span className="font-mono text-[10.5px] font-medium px-2 py-0.5 rounded bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] dark:text-[#9A968E] shrink-0">
                  {hasFinance && selectedBrandRow && brandShareOfHoldingPct !== null
                    ? `${brandShareOfHoldingPct.toFixed(0)}% группы`
                    : `${gt.modelsCount} SKU`}
                </span>
              </div>
              <div className="mt-3 font-mono text-[25px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                {hasFinance ? (
                  <AnimatedMlnValue
                    valueRub={gt.annualRevenueRub}
                    unitClassName="text-xs font-medium text-[#5C5953] dark:text-[#9A968E] font-sans ml-1"
                  />
                ) : (
                  <span className="text-lg text-[#5C5953]">Скрыто по роли</span>
                )}
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#E4E1DA] dark:border-[#282724] text-xs text-[#5C5953] dark:text-[#9A968E] flex items-center justify-between">
              <span>Пик декабря</span>
              <span className="font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                {hasFinance ? formatMln(gt.decemberRevenueRub) : 'Скрыто'}
              </span>
            </div>
          </div>

          {/* Карточка 2: План закупок на год */}
          <div
            onClick={() => {
              if (typeof window !== 'undefined') {
                try {
                  window.sessionStorage.setItem('borners_open_procurement_view_mode', 'summary');
                  window.dispatchEvent(new CustomEvent('borners-open-procurement-summary'));
                } catch {
                  // ignore
                }
              }
              safeNavigateSection('roadmap-tasks');
            }}
            className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953] bg-white dark:bg-[#151514] shadow-[0_1px_2px_rgba(20,20,19,0.04)] p-4 sm:p-5 cursor-pointer transition-colors flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] inline-flex items-center justify-center shrink-0">
                    <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </span>
                  <span className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] truncate">
                    Закупки на год
                  </span>
                </div>
                <span className="font-mono text-[10.5px] font-medium px-2 py-0.5 rounded bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] dark:text-[#9A968E] shrink-0">
                  4 волны
                </span>
              </div>
              <div className="mt-3 font-mono text-[25px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                {hasCost ? (
                  <AnimatedMlnValue
                    valueRub={gt.totalProcurementBudgetRub}
                    unitClassName="text-xs font-medium text-[#5C5953] dark:text-[#9A968E] font-sans ml-1"
                  />
                ) : (
                  <span className="text-lg text-[#5C5953]">Скрыто по роли</span>
                )}
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#E4E1DA] dark:border-[#282724] text-xs text-[#5C5953] dark:text-[#9A968E] flex items-center justify-between">
              <span>Оплата с выручки WB</span>
              <span className="font-mono font-semibold text-[#15803D] dark:text-emerald-400">
                {hasCost ? `${selfFundedProcurementPct}% партий` : 'Скрыто'}
              </span>
            </div>
          </div>

          {/* Карточка 3: Старт 1-й партии (Q1) */}
          <div
            onClick={() => {
              if (typeof window !== 'undefined') {
                try {
                  window.sessionStorage.setItem('borners_open_procurement_view_mode', 'summary');
                  window.dispatchEvent(new CustomEvent('borners-open-procurement-summary'));
                } catch {
                  // ignore
                }
              }
              safeNavigateSection('roadmap-tasks');
            }}
            className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953] bg-white dark:bg-[#151514] shadow-[0_1px_2px_rgba(20,20,19,0.04)] p-4 sm:p-5 cursor-pointer transition-colors flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] inline-flex items-center justify-center shrink-0">
                    <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </span>
                  <span className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] truncate">
                    Старт 1-й партии (Q1)
                  </span>
                </div>
                <span className="font-mono text-[10.5px] font-medium px-2 py-0.5 rounded bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] dark:text-[#9A968E] shrink-0">
                  {hasCost
                    ? `аванс ${
                        gt.firstWaveStartBudgetRub > 0
                          ? Math.round(
                              (gt.firstWavePrepaymentRub / gt.firstWaveStartBudgetRub) * 100
                            )
                          : 30
                      }%`
                    : 'Скрыто'}
                </span>
              </div>
              <div className="mt-3 font-mono text-[25px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                {hasCost ? (
                  <AnimatedMlnValue
                    valueRub={gt.firstWaveStartBudgetRub}
                    unitClassName="text-xs font-medium text-[#5C5953] dark:text-[#9A968E] font-sans ml-1"
                  />
                ) : (
                  <span className="text-lg text-[#5C5953]">Скрыто по роли</span>
                )}
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#E4E1DA] dark:border-[#282724] text-xs text-[#5C5953] dark:text-[#9A968E] flex items-center justify-between">
              <span>Предоплата фабрикам</span>
              <span className="font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                {hasCost ? formatMln(gt.firstWavePrepaymentRub) : 'Скрыто'}
              </span>
            </div>
          </div>

          {/* Карточка 4: Пик своих денег */}
          <div
            onClick={() => safeNavigateSection('finance')}
            className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953] bg-white dark:bg-[#151514] shadow-[0_1px_2px_rgba(20,20,19,0.04)] p-4 sm:p-5 cursor-pointer transition-colors flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] inline-flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </span>
                  <span className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] truncate">
                    Пик своих денег
                  </span>
                </div>
                <span className="font-mono text-[10.5px] font-medium px-2 py-0.5 rounded bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#15803D] dark:text-emerald-400 shrink-0">
                  {!hasFinance || !hasCost
                    ? 'Скрыто'
                    : !hasPortfolioActivity
                    ? '0 SKU'
                    : ownCapitalRoiMult
                    ? `ROI ×${ownCapitalRoiMult.toFixed(1).replace('.', ',')}`
                    : 'с WB'}
                </span>
              </div>
              <div className="mt-3 font-mono text-[25px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                {!hasFinance || !hasCost ? (
                  <span className="text-lg text-[#5C5953]">Скрыто по роли</span>
                ) : gt.verifiedOwnMoneyRequiredRub !== null ? (
                  <AnimatedMlnValue
                    valueRub={gt.verifiedOwnMoneyRequiredRub}
                    unitClassName="text-xs font-medium text-[#5C5953] dark:text-[#9A968E] font-sans ml-1"
                  />
                ) : (
                  '—'
                )}
              </div>
              <div className="mt-1 text-[11px] font-medium text-[#5C5953] dark:text-[#9A968E] truncate">
                {!hasFinance || !hasCost
                  ? 'Доступ к себестоимости и финансам ограничен'
                  : !hasPortfolioActivity
                  ? 'План продаж и закупок не запущен'
                  : `Пик в ${gt.peakMonthLabel || 'Янв'} 2027 · ${gt.peakPhaseLabelRu || 'до выплат WB'}`}
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-[#E4E1DA] dark:border-[#282724] text-xs text-[#5C5953] dark:text-[#9A968E] flex items-center justify-between gap-2">
              <span className="truncate">
                {!hasFinance || !hasCost
                  ? 'Статус'
                  : !hasPortfolioActivity
                  ? 'Потребность'
                  : gt.selfFundingMonthLabel && (gt.verifiedOwnMoneyRequiredRub ?? 0) > 0
                  ? `В плюс с ${gt.selfFundingMonthLabel}`
                  : 'Доля от закупок'}
              </span>
              <span className="font-mono font-semibold text-[#141413] dark:text-[#F5F4F0] shrink-0">
                {!hasFinance || !hasCost
                  ? 'Скрыто'
                  : !hasPortfolioActivity
                  ? '—'
                  : gt.totalProcurementBudgetRub > 0 && gt.verifiedOwnMoneyRequiredRub !== null
                  ? `доля ${Math.round((gt.verifiedOwnMoneyRequiredRub / gt.totalProcurementBudgetRub) * 100)}%`
                  : 'реинвест'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. СЕКЦИЯ «02 · РАСХОДЫ, УДЕРЖАНИЯ WB И РЕНТАБЕЛЬНОСТЬ» (8 КОЛ. КАРТОЧКИ + ВОДОПАД / 4 КОЛ. КОЛЬЦО ЭФФЕКТИВНОСТИ) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="px-2 py-0.5 rounded-md bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] font-mono text-[11px] font-semibold">
              02
            </span>
            <h3 className="text-[14px] sm:text-[15px] font-semibold tracking-tight text-[#141413] dark:text-[#F5F4F0]">
              Расходы, удержания WB и рентабельность
            </h3>
            <span className="hidden sm:inline text-xs text-[#5C5953] dark:text-[#9A968E]">
              · Из чего складываются затраты и сколько остаётся чистыми
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasFinance && (
              <div className="inline-flex items-center rounded-xl bg-[#EEF2F6] dark:bg-[#181D2A] border border-[#CBD5E1] dark:border-[#222938] p-1 text-xs">
                {hasCost && (
                  <button
                    type="button"
                    onClick={() => setWaterfallViewMode('pnl')}
                    className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      waterfallViewMode === 'pnl'
                        ? 'bg-white dark:bg-emerald-500/20 text-[#0F172A] dark:text-emerald-300 border border-[#CBD5E1] dark:border-emerald-500/30 shadow-2xs'
                        : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A]'
                    }`}
                  >
                    Структура P&L
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setWaterfallViewMode('brands')}
                  className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    waterfallViewMode === 'brands'
                      ? 'bg-white dark:bg-emerald-500/20 text-[#0F172A] dark:text-emerald-300 border border-[#CBD5E1] dark:border-emerald-500/30 shadow-2xs'
                      : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A]'
                  }`}
                >
                  Доли кабинетов
                </button>
              </div>
            )}
          </div>
        </div>

        {!hasFinance || (!hasCost && waterfallViewMode === 'pnl') ? (
          <div className="rounded-2xl border border-[#CBD5E1] dark:border-[#222938] bg-white dark:bg-[#121620] p-6 text-center space-y-1.5">
            <div className="text-[14.5px] font-bold text-[#0F172A] dark:text-[#EDF0F7]">
              Структура расходов, себестоимости и рентабельности скрыта по правам роли
            </div>
            <p className="text-xs text-[#64748B]">
              Для просмотра P&amp;L-водопада и удельной маржи необходим доступ к финансовому контуру и себестоимости.
            </p>
          </div>
        ) : (
        /* Сетка 8 + 4: слева 4 статьи расходов с внутренней шкалой доли и бар «Куда уходит выручка», справа сводное кольцо расходов и маржи */
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
                const barWidthPct = seg.pct <= 0 ? 0 : Math.min(100, Math.max(8, seg.pct * 2.4));
                return (
                  <div
                    key={seg.key}
                    onMouseEnter={() => setHoveredWaterfallKey(seg.key)}
                    onMouseLeave={() => setHoveredWaterfallKey(null)}
                    onClick={() => {
                      if (waterfallViewMode === 'pnl') {
                        if (seg.key === 'cogs') {
                          if (typeof window !== 'undefined') {
                            try {
                              window.sessionStorage.setItem(
                                'borners_open_procurement_view_mode',
                                'summary'
                              );
                              window.dispatchEvent(
                                new CustomEvent('borners-open-procurement-summary')
                              );
                            } catch {
                              // ignore
                            }
                          }
                              safeNavigateSection('roadmap-tasks');
                        } else {
                          safeNavigateSection('finance');
                        }
                      } else {
                        const clickedBrand = multiBrandSummary.brands.find(
                          (b) => b.brandCode === seg.key
                        );
                        if (clickedBrand && clickedBrand.selectedScenarioId !== null) {
                          onSelectActiveScenarioId(
                            clickedBrand.selectedScenarioId,
                            clickedBrand.brandCode
                          );
                        }
                        onSelectBrandFilter(seg.key);
                      }
                    }}
                    className="relative overflow-hidden rounded-2xl border border-[#CBD5E1] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 sm:p-5 cursor-pointer hover-lift flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: seg.color }}
                          />
                          <span className="text-[14px] font-bold text-[#0F172A] dark:text-[#EDF0F7] truncate">
                            {seg.label}
                          </span>
                          {waterfallViewMode === 'brands' &&
                            (() => {
                              const rndCount = concepts.filter(
                                (c) =>
                                  !c.isArchived &&
                                  normalizePortfolioBrandCode(c.brandId) === seg.key
                              ).length;
                              if (rndCount <= 0) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const clickedBrand = multiBrandSummary.brands.find(
                                      (b) => b.brandCode === seg.key
                                    );
                                    if (
                                      clickedBrand &&
                                      clickedBrand.selectedScenarioId !== null
                                    ) {
                                      onSelectActiveScenarioId(
                                        clickedBrand.selectedScenarioId,
                                        clickedBrand.brandCode
                                      );
                                    }
                                    onSelectBrandFilter(seg.key);
                                    if (canUserAccessSection(currentUser, 'product-lab')) {
                                      navigateTo('product-lab', {
                                        brandId: seg.key as BrandFilter,
                                      });
                                    }
                                  }}
                                  className="px-1.5 py-0.5 rounded font-mono text-[10px] font-medium bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] dark:bg-[#1D1C1A] dark:hover:bg-[#282724] dark:text-[#F5F4F0] dark:border-[#282724] transition-colors cursor-pointer shrink-0"
                                >
                                  R&D: {rndCount} в работе
                                </button>
                              );
                            })()}
                        </div>
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md shrink-0 bg-[#EEF2F6] dark:bg-[#181D2A] text-[#0F172A] dark:text-[#EDF0F7]">
                          {seg.pct.toFixed(1).replace('.', ',')}%
                        </span>
                      </div>

                      <div className="mt-2.5 font-mono text-[25px] font-extrabold tracking-tight tabular-nums text-[#0F172A] dark:text-[#EDF0F7]">
                        <AnimatedMlnValue
                          valueRub={seg.valueRub}
                          unitClassName="text-xs font-semibold text-[#475569] dark:text-[#94A3B8] font-sans ml-1"
                        />
                      </div>
                    </div>

                    {/* Пропорциональная шкала доли внутри карточки */}
                    <div className="mt-3 space-y-1.5">
                      <div className="h-2 w-full rounded-full bg-[#EEF2F6] dark:bg-[#181D2A] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${barWidthPct}%`,
                            backgroundColor: seg.color,
                          }}
                        />
                      </div>
                      <div className="text-xs text-[#475569] dark:text-[#94A3B8] flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{seg.subtitle}</span>
                        {waterfallViewMode === 'pnl' && (
                          <span className="font-mono font-bold text-[#0F172A] dark:text-[#EDF0F7] shrink-0">
                            {kopeksPerRuble} ₽ из 100 ₽
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Контрастная полоса «Куда уходит выручка (100%)» с подписями прямо внутри сегментов */}
            <div className="rounded-2xl border border-[#CBD5E1] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 sm:p-5 space-y-3 hover-lift">
              <div className="flex items-center justify-between text-xs sm:text-[13px]">
                <span className="font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                  {waterfallViewMode === 'pnl'
                    ? 'Анатомия 100% годовой выручки (расходы + чистая прибыль)'
                    : 'Доли кабинетов в выручке холдинга'}
                </span>
                <span className="font-mono font-extrabold text-[#0F172A] dark:text-[#EDF0F7]">
                  100% ={' '}
                  {formatMln(
                    waterfallViewMode === 'pnl'
                      ? gt.annualRevenueRub
                      : holdingTotal.annualRevenueRub
                  )}
                </span>
              </div>

              <div className="h-7 w-full rounded-xl bg-[#EEF2F6] dark:bg-[#181D2A] overflow-hidden flex gap-0.5 p-0.5">
                {activeBarSegments
                  .filter((s) => s.pct > 0.2)
                  .map((seg) => {
                    const isHovered = hoveredWaterfallKey === seg.key;
                    const showInnerText = seg.pct >= 7.5;
                    return (
                      <div
                        key={seg.key}
                        onMouseEnter={() => setHoveredWaterfallKey(seg.key)}
                        onMouseLeave={() => setHoveredWaterfallKey(null)}
                        style={{
                          width: `${Math.max(seg.pct, 3)}%`,
                          backgroundColor: seg.color,
                        }}
                        className={`h-full first:rounded-l-lg last:rounded-r-lg flex items-center justify-center px-1.5 transition-opacity duration-200 ${
                          hoveredWaterfallKey && !isHovered ? 'opacity-40' : 'opacity-95'
                        }`}
                      >
                        {showInnerText && (
                          <span className="font-mono text-[11px] font-bold text-white truncate drop-shadow-2xs">
                            {seg.pct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#334155] dark:text-[#94A3B8]">
                {activeBarSegments.map((seg) => (
                  <div key={seg.key} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="font-medium">{seg.label}:</span>
                    <span className="font-mono font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                      {seg.pct.toFixed(1).replace('.', ',')}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Правая часть (4 колонки): Карточка «БАЛАНС ЗАТРАТ И ПРИБЫЛИ» с просторным кольцом 148×148px */}
          <div
            onClick={() => safeNavigateSection('finance')}
            className="lg:col-span-4 rounded-2xl border border-[#CBD5E1] dark:border-[#222938] bg-white dark:bg-[#121620] p-5 flex flex-col justify-between cursor-pointer hover-lift"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0F172A] dark:text-[#EDF0F7]">
                Баланс затрат и прибыли
              </span>
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#EEF2F6] dark:bg-[#181D2A] text-[#334155] dark:text-[#CBD5E1]">
                4 статьи
              </span>
            </div>

            {!hasCost || !hasFinance ? (
              <div className="my-6 text-center space-y-1.5">
                <div className="text-sm font-bold text-[#64748B]">Скрыто по роли</div>
                <p className="text-xs text-[#64748B]">
                  Рентабельность и себестоимость доступны ролям с полным финансовым доступом.
                </p>
              </div>
            ) : (
              <>
                <div className="my-3 flex flex-col items-center justify-center">
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 144 144">
                      <circle
                        cx="72"
                        cy="72"
                        r="56"
                        fill="none"
                        stroke="currentColor"
                        className="text-[#CBD5E1] dark:text-[#222938]"
                        strokeWidth="10"
                      />
                      <circle
                        cx="72"
                        cy="72"
                        r="56"
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 56}
                        strokeDashoffset={
                          gt.annualRevenueRub > 0
                            ? 2 * Math.PI * 56 * (1 - Math.min(100, Math.max(5, groupMarginPct)) / 100)
                            : 2 * Math.PI * 56
                        }
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="relative z-10 flex flex-col items-center justify-center text-center px-2">
                      <span className="font-mono text-[23px] font-extrabold tabular-nums leading-none text-emerald-600 dark:text-emerald-400">
                        +{groupMarginPct.toFixed(1).replace('.', ',')} ₽
                      </span>
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#475569] dark:text-[#94A3B8] mt-1">
                        из 100 ₽ выр.
                      </span>
                    </div>
                  </div>
                  <div className="mt-2.5 font-mono text-sm font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                    Все затраты: {formatMln(totalExpensesRub)} ({totalExpensesPct.toFixed(1).replace('.', ',')}%)
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#222938] grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl bg-[#F8FAFC] dark:bg-[#181D2A] p-2.5">
                    <div className="font-mono text-base font-extrabold text-[#0F172A] dark:text-[#EDF0F7]">
                      {totalExpensesPct.toFixed(1).replace('.', ',')} ₽
                    </div>
                    <div className="text-[11px] font-medium text-[#475569] dark:text-[#94A3B8] mt-0.5">
                      расходы со 100 ₽
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 p-2.5">
                    <div className="font-mono text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                      +{groupMarginPct.toFixed(1).replace('.', ',')} ₽
                    </div>
                    <div className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300/80 mt-0.5">
                      чистыми со 100 ₽
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        )}
      </div>

      {/* 4-B. ИНТЕРАКТИВНЫЙ СИМУЛЯТОР ЧУВСТВИТЕЛЬНОСТИ «ЧТО ЕСЛИ?» (ЦЕНА WB · СЕБЕСТОИМОСТЬ · КОМИССИЯ И ДРР) */}
      {hasFinance && hasCost && (
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
              className="h-7.5 px-2.5 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#141413] dark:hover:border-[#5C5953] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-[#15803D]" strokeWidth={1.5} />
              <span>Цена +7% · Себест. −5%</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setWhatIfOpen(true);
                setWhatIfPriceDelta(0);
                setWhatIfCostDelta(10);
                setWhatIfMpAdsDelta(4);
              }}
              className="h-7.5 px-2.5 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#141413] dark:hover:border-[#5C5953] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#5C5953]" strokeWidth={1.5} />
              <span>Стресс-тест WB +4 п.п.</span>
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
                  className="w-full accent-teal-600 cursor-pointer"
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
                <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                  {whatIfSim.simulatedRoiMult
                    ? `Отдача ROI ×${whatIfSim.simulatedRoiMult.toFixed(1).replace('.', ',')}`
                    : 'Реинвест из WB'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

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
              className={`h-7.5 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                procurementWavesOpen
                  ? 'border-[#141413] bg-[#141413] text-white dark:bg-[#F5F4F0] dark:text-[#141413] dark:border-[#F5F4F0]'
                  : 'border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] text-[#5C5953] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>4 волны закупок {procurementWavesOpen ? '▴' : '▾'}</span>
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
          !hasCost ? (
            <div className="rounded-2xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-5 text-center space-y-1">
              <div className="text-sm font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                Платёжный календарь и суммы закупок у фабрик скрыты по правам роли
              </div>
              <p className="text-xs text-[#64748B]">
                Для просмотра бюджетов волн, авансов 30% и доплат 70% требуется доступ к себестоимости.
              </p>
            </div>
          ) : (
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
                onClick={() => {
                  try {
                    window.sessionStorage.setItem('borners_open_procurement_view_mode', 'summary');
                    window.dispatchEvent(new CustomEvent('borners-open-procurement-summary'));
                  } catch {
                    // ignore
                  }
                  safeNavigateSection('roadmap-tasks');
                }}
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
                    onClick={() => {
                      try {
                        window.sessionStorage.setItem('borners_open_procurement_view_mode', 'summary');
                        window.dispatchEvent(new CustomEvent('borners-open-procurement-summary'));
                      } catch {
                        // ignore
                      }
                      safeNavigateSection('roadmap-tasks');
                    }}
                    className="relative overflow-hidden rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-[#F8FAFC]/70 dark:bg-[#181D2A] p-4 flex flex-col justify-between gap-3 cursor-pointer hover-lift"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          {wave.waveNum}
                        </span>
                        <span
                          className={`font-mono text-[10.5px] font-medium px-2 py-0.5 rounded-md ${
                            isSelfFunded
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-[#F1F5F9] dark:bg-[#1E2536] text-[#475569] dark:text-[#94A3B8]'
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
                        <span>
                          Аванс {wave.budgetRub > 0 ? Math.round((wave.prepayRub / wave.budgetRub) * 100) : 30}% ({wave.orderWindow}):
                        </span>
                        <strong className="font-mono text-[#0F172A] dark:text-[#EDF0F7]">
                          {formatMln(wave.prepayRub)}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>
                          Доплата {wave.budgetRub > 0 ? Math.round((wave.balanceRub / wave.budgetRub) * 100) : 70}% ({wave.arrivalMonth}):
                        </span>
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
                                      : 'bg-teal-500'
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
                        isSelfFunded ? 'bg-emerald-500/80' : 'bg-teal-500/80'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          )
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
            wbLagUnspecified={wbLagUnspecified}
          />
        )}

        {monthlyCashflowOpen && (
          !hasFinance || !hasCost ? (
            <div className="rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-5 text-center space-y-1">
              <div className="text-sm font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                График денег 12 мес. (Cashflow) скрыт по правам роли
              </div>
              <p className="text-xs text-[#64748B]">
                Для просмотра помесячных выплат WB, авансов/доплат фабрикам и накопленного баланса требуются права на финансы и себестоимость.
              </p>
            </div>
          ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="text-xs font-medium text-[#64748B]">
                {selectedBrandRow
                  ? `Помесячный денежный поток и пик своих денег · ${selectedBrandRow.displayCode} (12 мес., млн ₽)`
                  : 'Помесячный денежный поток и пик своих денег холдинга BORNERS GROUP (12 мес., млн ₽)'}
              </div>
              <button
                type="button"
                onClick={() => safeNavigateSection('finance')}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Интерактивный 2-слойный график в 04 · Финансы →
              </button>
            </div>
            <table className="w-full min-w-[780px] text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-[#E2E6EE] dark:border-[#222938] text-[#64748B]">
                  <th className="py-2 px-2.5 font-medium">Показатель</th>
                  {gt.monthlyRows.map((m) => (
                    <th
                      key={m.monthIdx}
                      className={`py-2 px-1.5 text-right font-medium ${
                        m.isPeakDeficitMonth ? 'text-rose-600 dark:text-rose-400 font-bold' : ''
                      }`}
                    >
                      {m.monthLabel}
                      {m.isPeakDeficitMonth ? ' · пик' : ''}
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
                  <td className="py-2 px-2.5 font-sans font-medium text-amber-700 dark:text-amber-300">
                    − Авансы фабрикам (млн ₽)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-2 px-1.5 text-right text-amber-700 dark:text-amber-300">
                      −{(m.factoryPrepaymentOutflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2 px-2.5 font-sans font-medium text-rose-600 dark:text-rose-400">
                    − Доплаты фабрикам (млн ₽)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-2 px-1.5 text-right text-rose-600 dark:text-rose-400">
                      −{(m.factoryBalanceOutflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
                <tr className="bg-[#FAF9F6] dark:bg-[#1D1C1A] font-semibold">
                  <td className="py-2 px-2.5 font-sans text-[#141413] dark:text-[#F5F4F0]">
                    Минимум внутри мес. до WB (минус = пик своих ₽)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td
                      key={m.monthIdx}
                      className={`py-2 px-1.5 text-right ${
                        m.isPeakDeficitMonth
                          ? 'text-rose-600 dark:text-rose-400 font-extrabold underline decoration-rose-500/50'
                          : m.intraMonthLowBalanceRub < 0
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {(m.intraMonthLowBalanceRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
                <tr className="font-semibold">
                  <td className="py-2 px-2.5 font-sans text-[#0F172A] dark:text-[#EDF0F7]">
                    = Накопленный баланс на конец месяца
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td
                      key={m.monthIdx}
                      className={`py-2 px-1.5 text-right ${
                        m.cumulativeCashBalanceRub < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {(m.cumulativeCashBalanceRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          )
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
              onClick={() => safeNavigateSection('product-catalog')}
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
                <span className="text-emerald-600 dark:text-emerald-400">
                  {canUserAccessSection(currentUser, 'product-catalog') ? 'Перейти →' : 'Закрыто'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => safeNavigateSection('launch-calendar')}
              className="rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 text-left cursor-pointer hover-lift flex flex-col justify-between gap-2 transition"
            >
              <div>
                <div className="text-xs font-medium text-[#64748B]">02 · Продажи</div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-[#EDF0F7] mt-1">
                  План продаж 12 мес.
                </div>
              </div>
              <div className="text-xs text-[#64748B] flex items-center justify-between">
                <span className="font-mono">
                  {hasFinance ? formatMln(gt.annualRevenueRub) : 'Скрыто по роли'}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {canUserAccessSection(currentUser, 'launch-calendar') ? 'Перейти →' : 'Закрыто'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!canUserAccessSection(currentUser, 'roadmap-tasks')) return;
                try {
                  window.sessionStorage.setItem('borners_open_procurement_view_mode', 'summary');
                  window.dispatchEvent(new CustomEvent('borners-open-procurement-summary'));
                } catch {
                  // ignore
                }
                safeNavigateSection('roadmap-tasks');
              }}
              className="rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 text-left cursor-pointer hover-lift flex flex-col justify-between gap-2 transition"
            >
              <div>
                <div className="text-xs font-medium text-[#64748B]">03 · Закупки</div>
                <div className="text-sm font-semibold text-[#0F172A] dark:text-[#EDF0F7] mt-1">
                  Партии и фабрики PO
                </div>
              </div>
              <div className="text-xs text-[#64748B] flex items-center justify-between">
                <span className="font-mono">
                  {hasCost ? formatMln(gt.totalProcurementBudgetRub) : 'Скрыто по роли'}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {canUserAccessSection(currentUser, 'roadmap-tasks') ? 'Перейти →' : 'Закрыто'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => safeNavigateSection('finance')}
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
                  {hasFinance && hasCost
                    ? `+${formatMln(gt.annualEstimatedOperatingProfitRub)}`
                    : 'Скрыто по роли'}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {canUserAccessSection(currentUser, 'finance') ? 'Перейти →' : 'Закрыто'}
                </span>
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
  onSelectActiveScenarioId?: (scenarioId: number, explicitBrandCode?: string) => void;
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
  const { currentUser } = usePlatform();
  const hasFinance = canUserViewFinance(currentUser);
  const hasCost = canUserViewCostPrice(currentUser);
  const allCanonicalCodes: CanonicalBrandCode[] = [
    'BORNERS',
    'NA_TELE',
    'FUKAI',
    'AKUSHA',
    'LISKANI',
  ];
  const canEditBrand = (bCode: string) =>
    bCode === 'ALL'
      ? allCanonicalCodes.some((c) => canUserEditBrand(currentUser, c))
      : canUserEditBrand(currentUser, normalizePortfolioBrandCode(bCode));
  const canEditAllBrands = allCanonicalCodes.every((c) =>
    canUserEditBrand(currentUser, c)
  );
  const canEditAnyBrand = allCanonicalCodes.some((c) =>
    canUserEditBrand(currentUser, c)
  );
  const canEditGroup = (grp: ProductGroupDef) =>
    grp.brandCode === 'ALL'
      ? canEditAllBrands
      : canUserEditBrand(currentUser, grp.brandCode);

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
    'grp-natele-womens-base': true,
    'grp-fukai-wb': true,
    'grp-akusha-shoes': true,
    'grp-akusha-loafers': true,
    'grp-liscani-curtains': false,
    'grp-liskani-blackout': true,
    'grp-liskani-mramor': false,
    'grp-liskani-rogozhka': false,
    'grp-liskani-tyul': false,
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
    syncGroups();
    window.addEventListener('borners-product-groups-changed', syncGroups);
    return () => window.removeEventListener('borners-product-groups-changed', syncGroups);
  }, [models]);

  const commitGroups = (nextGroups: ProductGroupDef[]) => {
    setGroups(nextGroups);
    saveProductGroups(nextGroups);
  };

  // Карта активных сценариев по каждому бренду (у каждого бренда — свой сценарий развития)
  const zeroScenario = useMemo<GrowthScenarioDef>(
    () => ({
      ...currentScenario,
      id: -1,
      title: 'Нет сценария',
      monthlyTargetMln: 0,
    }),
    [currentScenario]
  );

  const scenarioByBrandMap = useMemo(() => {
    const map: Partial<Record<CanonicalBrandCode, GrowthScenarioDef>> = {};
    const codes: CanonicalBrandCode[] = ['BORNERS', 'NA_TELE', 'FUKAI', 'AKUSHA', 'LISKANI'];
    for (const bCode of codes) {
      if (isBrandScenarioExplicitlyNone(bCode, selectedScenarioByBrand)) {
        map[bCode] = zeroScenario;
        continue;
      }
      const selId = selectedScenarioByBrand?.[bCode];
      if (typeof selId === 'number') {
        const found = scenarios.find((s) => s.id === selId);
        if (found) {
          map[bCode] = found;
          continue;
        }
      }
      map[bCode] = resolveEffectiveScenarioForModel(
        { id: bCode, code: bCode, title: bCode, customBrandLabel: bCode } as ScenarioModelSpec,
        scenarios,
        selectedScenarioByBrand,
        currentScenario
      );
    }
    return map;
  }, [selectedScenarioByBrand, scenarios, currentScenario, zeroScenario]);

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
        const computed = computeProductGroupMetrics(g, models, grpScen);
        if (grpScen.id < 0) {
          return {
            ...computed,
            decRevenueRub: 0,
            annualRevenueRub: 0,
            decPacks: 0,
            annualPacks: 0,
            procurementPacks: 0,
            procurementUnits: 0,
            procurementBudgetRub: 0,
            firstWaveStartRub: 0,
            firstWavePrepayRub: 0,
            totalBatchesCount: 0,
            activeScenario: grpScen,
          };
        }
        return {
          ...computed,
          activeScenario: grpScen,
        };
      });
  }, [groups, brandFilter, models, scenarioByBrandMap, currentScenario]);

  // Раздельные каталоги по каждому бренду (каждый бренд считает показатели по своему сценарию)
  const brandSections = useMemo(() => {
    const sectionsScenarioMap: Partial<Record<CanonicalBrandCode, GrowthScenarioDef>> = {};
    const codes: CanonicalBrandCode[] = ['BORNERS', 'NA_TELE', 'FUKAI', 'AKUSHA', 'LISKANI'];
    for (const bCode of codes) {
      const sc = scenarioByBrandMap[bCode];
      sectionsScenarioMap[bCode] = sc && sc.id < 0 ? undefined : sc;
    }
    const allSections = buildBrandCatalogSections(
      models,
      sectionsScenarioMap,
      currentScenario
    ).map((sec) => {
      const mapped = scenarioByBrandMap[sec.brandCode];
      return mapped && mapped.id < 0 ? { ...sec, activeScenario: mapped } : sec;
    });
    if (brandFilter === 'ALL') return allSections;
    const norm = normalizePortfolioBrandCode(brandFilter);
    return allSections.filter((s) => s.brandCode === norm);
  }, [models, scenarioByBrandMap, currentScenario, brandFilter]);

  const openCreateGroupModal = () => {
    if (!canEditAnyBrand) return;
    const candidateBrand =
      brandFilter === 'ALL' ? 'BORNERS' : normalizePortfolioBrandCode(brandFilter);
    const defaultBrand = canUserEditBrand(currentUser, candidateBrand)
      ? candidateBrand
      : allCanonicalCodes.find((c) => canUserEditBrand(currentUser, c)) || 'BORNERS';
    setEditingGroup(null);
    setDraftGroupTitle('');
    setDraftGroupSubtitle('');
    setDraftGroupBrand(defaultBrand);
    setDraftGroupModelIds([]);
    setGroupSkuSearch('');
    setGroupModalOpen(true);
  };

  const openEditGroupModal = (grp: ProductGroupDef) => {
    if (!canEditGroup(grp)) return;
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
    if (draftGroupBrand === 'ALL' ? !canEditAllBrands : !canEditBrand(draftGroupBrand)) {
      return;
    }
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
              isSystemDefault: false,
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
    if (!canEditGroup(grp)) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Удалить группу «${grp.title}»? Сами карточки артикулов останутся в каталоге.`
      )
    ) {
      return;
    }
    const next = deleteProductGroup(groups, grp.id);
    setGroups(next);
    notify?.('warning', `Группа «${grp.title}» удалена`);
  };

  const handleResetDefaultGroups = () => {
    if (!canEditAllBrands) return;
    const defaults = resetDefaultProductGroups(models);
    setGroups(defaults);
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
    const canEditMod = canEditBrand(modBrandCode);
    const activeScen =
      scenarioOverride ||
      (modBrandCode !== 'ALL' ? scenarioByBrandMap[modBrandCode] : undefined) ||
      currentScenario;
    const met = computeModelScenarioMetrics(mod, activeScen);
    const procSourceModel =
      activeScen.id < 0
        ? {
            ...mod,
            plansByScenario: {
              ...mod.plansByScenario,
              [activeScen.id]: {
                scenarioId: activeScen.id,
                monthlyPacks: Array(12).fill(0),
                monthlyPricesRub: Array(12).fill(mod.retailPriceRub),
                monthlyReceiptsPacks: Array(12).fill(0),
                initialStockPacks: 0,
                firstOrderPacks: 0,
                nextOrderDateLabel: '',
                salesStartMonthIdx: 0,
                warehouseArrivalMonthIdx: 0,
                warehouseArrivalDateLabel: '',
              },
            },
          }
        : mod;
    const proc = computeProcurementPlan(procSourceModel, activeScen);
    const mainGallery = mod.gallery.find((g) => g.isMain) || mod.gallery[0];
    const colors = mod.palettes[0]?.colors || [];
    const actingMeta = getActingSkuByWbOrVendor(mod.code, mod.title);
    const priorityLabel = getModelPriority(mod);
    const displayBrand = detectModelBrandPortfolioLabel(mod);
    const unitCfg = getBrandUnitConfig(mod);
    const stageLabel = mod.modelStageStatus || mod.launchStatus;
    const isActiveSale =
      Boolean(actingMeta) ||
      /в продаже|актив|действ/i.test(stageLabel || '');
    const monthlySparkPacks =
      activeScen.id < 0
        ? Array(12).fill(0)
        : mod.plansByScenario[activeScen.id]?.monthlyPacks ||
          mod.plansByScenario[1]?.monthlyPacks ||
          Array(12).fill(0);
    const maxModMonthRev = Math.max(1, ...met.monthlyRevenuesRub);
    const maxModMonthPacks = Math.max(1, ...monthlySparkPacks);

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
        className="group relative rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953] text-left transition-colors cursor-pointer flex flex-col justify-between overflow-hidden"
      >
        {/* Studio Gallery Mat */}
        <div className="relative bg-[#F6F5F2] dark:bg-[#1D1C1A] border-b border-[#E4E1DA] dark:border-[#282724] px-3.5 pt-8 pb-3">
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-md bg-white/92 dark:bg-[#151514]/92 backdrop-blur-xs border border-[#E4E1DA] dark:border-[#282724] px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#141413] dark:text-[#F5F4F0]">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                isActiveSale ? 'bg-[#15803D]' : 'bg-[#78746C]'
              }`}
            />
            <span>{stageLabel}</span>
          </span>

          {onDeleteModel && canEditMod && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteModel(mod);
              }}
              title={`Удалить карточку ${mod.code}`}
              className="absolute top-2.5 right-2.5 h-6 w-6 rounded-md bg-white/90 dark:bg-[#151514]/90 border border-[#E4E1DA] dark:border-[#282724] flex items-center justify-center text-[#8A867E] hover:text-[#B91C1C] hover:border-[#B91C1C]/40 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}

          <BoxerPackStackSvg
            colors={colors}
            brandLabel={displayBrand}
            customPhotoUrl={mainGallery?.url}
          />
        </div>

        {/* Editorial Body */}
        <div className="p-3.5 flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-[11px] font-medium text-[#5C5953] dark:text-[#9A968E] truncate">
                {displayBrand} · {actingMeta ? `WB ${actingMeta.wbSku}` : mod.code}
              </div>
              {onCyclePriority && !actingMeta && canEditMod && (
                <button
                  type="button"
                  onClick={(e) => onCyclePriority(mod, e)}
                  className="shrink-0 px-1.5 py-0.5 rounded font-mono text-[10px] font-medium bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#141413] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] cursor-pointer"
                >
                  {priorityLabel}
                </button>
              )}
            </div>

            <div className="mt-1 text-[14.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] group-hover:underline leading-snug">
              {mod.title}
            </div>
            {mod.subtitle && (
              <div className="mt-0.5 text-[11.5px] text-[#5C5953] dark:text-[#9A968E] truncate">
                {mod.subtitle}
              </div>
            )}

            {/* 1px Hairline-separated Metric Strip */}
            <div className="mt-3 grid grid-cols-3 divide-x divide-[#E4E1DA] dark:divide-[#282724] border-y border-[#E4E1DA] dark:border-[#282724] py-2 font-mono tabular-nums">
              <div className="pr-2">
                <div className="font-sans text-[10px] text-[#5C5953] dark:text-[#9A968E]">Цена WB</div>
                <div className="text-[12px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                  {met.avgRetailPriceRub.toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div className="px-2">
                <div className="font-sans text-[10px] text-[#5C5953] dark:text-[#9A968E]">Маржа</div>
                <div className="text-[12px] font-semibold text-[#15803D] dark:text-emerald-400">
                  {hasFinance && hasCost ? `${met.unitMarginPct.toFixed(0)}%` : 'Скрыто'}
                </div>
              </div>
              <div className="pl-2">
                <div className="font-sans text-[10px] text-[#5C5953] dark:text-[#9A968E]">Объём/год</div>
                <div className="text-[12px] font-semibold text-[#141413] dark:text-[#F5F4F0] truncate">
                  {met.annualPacks.toLocaleString('ru-RU')}
                </div>
              </div>
            </div>

            {/* Мини-спарклайн 12 мес. */}
            <div className="mt-2.5 rounded-md bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] px-2.5 py-1.5 flex items-end justify-between gap-1 h-7">
              {met.monthlyRevenuesRub.map((mRev, mIdx) => {
                const mPacks = monthlySparkPacks[mIdx] || 0;
                const hPx = Math.max(
                  3,
                  Math.round(
                    ((hasFinance ? mRev : mPacks) /
                      (hasFinance ? maxModMonthRev : maxModMonthPacks)) *
                      16
                  )
                );
                return (
                  <div
                    key={mIdx}
                    style={{ height: `${hPx}px` }}
                    title={
                      hasFinance
                        ? `${MONTHS_SHORT_RU[mIdx]}: ${(mRev / 1_000_000).toFixed(2)} млн ₽`
                        : `${MONTHS_SHORT_RU[mIdx]}: ${mPacks.toLocaleString('ru-RU')} ${unitCfg.primaryUnit}`
                    }
                    className={`flex-1 rounded-[1.5px] ${
                      mIdx === 11 ? 'bg-[#141413] dark:bg-[#F5F4F0]' : 'bg-[#CBC7BE] dark:bg-[#3A3834]'
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
              className="mt-2 rounded-md border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:border-[#141413] dark:hover:border-[#5C5953] px-2.5 py-1.5 flex items-center justify-between gap-2 transition-colors cursor-pointer"
              title="Нажмите, чтобы разбить по партиям и указать даты заказа"
            >
              <div className="text-[10.5px] text-[#5C5953] dark:text-[#9A968E] truncate">
                <strong className="text-[#141413] dark:text-[#F5F4F0] font-semibold">{totalBatches} парт.</strong> · до{' '}
                <span className="font-mono font-medium text-[#141413] dark:text-[#F5F4F0]">
                  {formatShortDateRu(nextOrderDate)}
                </span>
              </div>
              <span className="text-[10.5px] font-medium text-[#141413] dark:text-[#F5F4F0] shrink-0">
                Партии ▸
              </span>
            </div>
          </div>

          {/* Нижняя плашка: Выручка и быстрый степпер декабря */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-3 pt-2.5 border-t border-[#E4E1DA] dark:border-[#282724] flex items-center justify-between gap-2"
          >
            <div>
              {hasFinance ? (
                <>
                  <div className="font-mono text-[14px] font-semibold tracking-[-0.025em] tabular-nums text-[#141413] dark:text-[#F5F4F0] leading-tight">
                    {(met.targetMonthRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽{' '}
                    <span className="font-sans text-[10px] font-normal text-[#5C5953]">/ дек</span>
                  </div>
                  <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E] mt-0.5">
                    Год:{' '}
                    <strong className="font-mono font-medium text-[#141413] dark:text-[#F5F4F0]">
                      {(met.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="font-mono text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] leading-tight">
                    {met.targetMonthPacks.toLocaleString('ru-RU')} {unitCfg.primaryUnit}{' '}
                    <span className="font-sans text-[10px] font-normal text-[#5C5953]">/ дек</span>
                  </div>
                  <div className="text-[11px] text-[#5C5953] mt-0.5">
                    Выручка: <strong className="font-mono text-[#5C5953]">Скрыто</strong>
                  </div>
                </>
              )}
            </div>

            {onQuickAdjustDecPacks && canEditMod && (
              <div className="inline-flex items-center gap-0.5 bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] rounded-md px-1 py-0.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) =>
                    onQuickAdjustDecPacks(mod, Math.max(0, met.targetMonthPacks - 200), e)
                  }
                  className="h-6 w-5 rounded text-[13px] font-medium text-[#5C5953] hover:text-[#141413] hover:bg-white cursor-pointer"
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
                  className="w-13 text-center font-mono text-[11px] font-semibold text-[#141413] dark:text-[#F5F4F0] bg-transparent"
                />
                <button
                  type="button"
                  onClick={(e) =>
                    onQuickAdjustDecPacks(mod, met.targetMonthPacks + 200, e)
                  }
                  className="h-6 w-5 rounded text-[13px] font-medium text-[#5C5953] hover:text-[#141413] hover:bg-white cursor-pointer"
                >
                  +
                </button>
              </div>
            )}
          </div>
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
              {canEditAllBrands && (
                <button
                  type="button"
                  onClick={handleResetDefaultGroups}
                  className="h-8 px-3 rounded-[9px] border border-[#DCE2EC] bg-[#F8FAFC] hover:bg-white text-[11.5px] font-semibold text-[#475569] cursor-pointer"
                  title="Сбросить к авто-группировке по брендам и линейкам"
                >
                  ↺ Авто-группы
                </button>
              )}
              {canEditAnyBrand && (
                <button
                  type="button"
                  onClick={openCreateGroupModal}
                  className="h-8 px-3.5 rounded-[9px] bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#1E293B] border border-[#CBD5E1] text-[12px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Добавить группу</span>
                </button>
              )}
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
                      {group.subtitle &&
                        (hasCost || !/себестоим/i.test(group.subtitle)) &&
                        (hasFinance || !/млн\s*₽|выкуп.*₽|заказ.*₽/i.test(group.subtitle)) && (
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
                        {hasFinance ? formatMln(gm.annualRevenueRub) : 'Скрыто'}
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
                        {hasFinance && hasCost
                          ? `Старт Q1 (маржа ${gm.avgMarginPct}%)`
                          : 'Старт Q1'}
                      </div>
                      <div className="font-mono text-[14px] font-bold text-[#059669]">
                        {hasCost ? formatMln(gm.firstWaveStartRub) : 'Скрыто'}
                      </div>
                    </div>

                    {/* Кнопки управления группой («Настройки» + Корзина + Стрелка раскрытия) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 pl-3 border-l border-[#EAEEF4]"
                    >
                      {canEditGroup(group) && (
                        <>
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
                        </>
                      )}

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
                        {canEditGroup(group) && (
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
                        )}
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
            const canEditSec = canEditBrand(sec.brandCode);
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
                          Продажи год:{' '}
                          {hasFinance ? (
                            <>
                              <strong className="font-mono text-[#111827]">
                                {formatMln(sec.annualRevenueRub)}
                              </strong>{' '}
                              (дек: {formatMln(sec.decRevenueRub)})
                            </>
                          ) : (
                            <strong className="font-mono text-[#64748B]">Скрыто</strong>
                          )}
                        </span>
                        <span>·</span>
                        <span>
                          Закупки:{' '}
                          <strong className="font-mono text-[#111827]">
                            {sec.procurementPacks.toLocaleString('ru-RU')} {sec.primaryUnit}
                          </strong>
                          {hasCost ? ` (${formatMln(sec.procurementBudgetRub)})` : ' (бюджет скрыт)'}
                        </span>
                        <span>·</span>
                        <span>
                          Старт Q1:{' '}
                          <strong className="font-mono text-[#111827]">
                            {hasCost ? formatMln(sec.firstWaveStartRub) : 'Скрыто'}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {onSelectScenarioForBrand && (
                      <div className="inline-flex items-center gap-1.5 rounded-[9px] bg-white border border-[#CBD5E1] px-2.5 py-1 text-[11.5px]">
                        <span className="text-[#64748B] font-medium">Сценарий:</span>
                        <select
                          disabled={!canEditSec}
                          value={
                            isBrandScenarioExplicitlyNone(
                              sec.brandCode,
                              selectedScenarioByBrand
                            ) || sec.activeScenario.id < 0
                              ? ''
                              : selectedScenarioByBrand?.[sec.brandCode] ??
                                sec.activeScenario.id
                          }
                          onChange={(e) => {
                            if (!canEditSec) return;
                            const raw = e.target.value;
                            const nextId = raw === '' ? null : Number(raw);
                            onSelectScenarioForBrand(sec.brandCode, nextId);
                            if (
                              nextId !== null &&
                              onSelectActiveScenarioId &&
                              brandFilter === sec.brandCode
                            ) {
                              onSelectActiveScenarioId(nextId, sec.brandCode);
                            }
                          }}
                          className="font-bold text-[#111827] bg-transparent focus:outline-none cursor-pointer max-w-[190px] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <option value="">Нет сценария</option>
                          {getScenariosForBrand(scenarios, sec.brandCode).map((sc) => (
                            <option key={sc.id} value={sc.id}>
                              {sc.id === ACTING_2027_SCENARIO_ID
                                ? 'Исходный план 2027'
                                : `${sc.title} (${sc.year || 2027})`}
                            </option>
                          ))}
                        </select>
                        {onOpenCreateScenarioForBrand && canEditSec && (
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

                    {canEditSec && (
                      <button
                        type="button"
                        onClick={() => onOpenCreateModel(sec.brandCode)}
                        className="h-8.5 px-3.5 rounded-[9px] bg-[#2C3444] hover:bg-[#1E2430] text-white text-[12px] font-semibold transition cursor-pointer shrink-0 shadow-2xs"
                      >
                        + Добавить товар в {sec.displayCode}
                      </button>
                    )}
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
                      {canEditSec && (
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
                                className="h-8.5 px-4 rounded-lg bg-[#141413] hover:bg-[#2A2927] text-white text-[12px] font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                                <span>Запустить матрицу {sec.displayCode} (3 SKU)</span>
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
                      )}
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
          {(brandFilter === 'ALL' ? canEditAnyBrand : canEditBrand(brandFilter)) && (
            <button
              type="button"
              onClick={() =>
                onOpenCreateModel(
                  brandFilter === 'ALL'
                    ? allCanonicalCodes.find((c) => canUserEditBrand(currentUser, c)) ||
                        'BORNERS'
                    : brandFilter
                )
              }
              className="rounded-[14px] border border-dashed border-[#C8C7BE] hover:border-[#141413] bg-[#FAF9F6] hover:bg-white p-6 flex flex-col items-center justify-center text-center gap-2 transition cursor-pointer min-h-[280px]"
            >
              <div className="text-[26px] font-light leading-none text-[#141413]">+</div>
              <div className="text-[14.5px] font-bold text-[#141413]">Добавить модель</div>
              <p className="text-[12px] text-[#686760] max-w-[200px]">
                Новая товарная позиция в каталог выбранного бренда
              </p>
            </button>
          )}
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
                  {canUserEditBrand(currentUser, 'BORNERS') && (
                    <option value="BORNERS">BORNERS · WB</option>
                  )}
                  {canUserEditBrand(currentUser, 'NA_TELE') && (
                    <option value="NA_TELE">НА ТЕЛЕ · WB</option>
                  )}
                  {canUserEditBrand(currentUser, 'FUKAI') && (
                    <option value="FUKAI">FUKAI · WB</option>
                  )}
                  {canUserEditBrand(currentUser, 'AKUSHA') && (
                    <option value="AKUSHA">AKUSHA · WB</option>
                  )}
                  {canUserEditBrand(currentUser, 'LISKANI') && (
                    <option value="LISKANI">LISKANI · WB</option>
                  )}
                  {canEditAllBrands && <option value="ALL">Все бренды</option>}
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
                    if (
                      !canEditAllBrands &&
                      !canEditBrand(detectModelBrandPortfolioLabel(m))
                    ) {
                      return false;
                    }
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
  const { currentUser } = usePlatform();
  const hasCost = canUserViewCostPrice(currentUser);
  const model = useMemo(() => ensureModelUnifiedV11(rawModel), [rawModel]);
  const modBrandCode = normalizePortfolioBrandCode(
    detectModelBrandPortfolioLabel(model)
  );
  const canEditModal = canUserEditBrand(currentUser, modBrandCode);
  const authorLabel =
    currentUser.fullName ||
    (currentUser as { name?: string }).name ||
    'Пользователь';
  const shared = model.sharedSupplyAndFact!;
  const fp = shared.factoryParams;
  const proc = useMemo(() => {
    const src =
      scenario.id < 0
        ? {
            ...model,
            plansByScenario: {
              ...model.plansByScenario,
              [scenario.id]: {
                scenarioId: scenario.id,
                monthlyPacks: Array(12).fill(0),
                monthlyPricesRub: Array(12).fill(model.retailPriceRub),
                monthlyReceiptsPacks: Array(12).fill(0),
                initialStockPacks: 0,
                firstOrderPacks: 0,
                nextOrderDateLabel: '',
                salesStartMonthIdx: 0,
                warehouseArrivalMonthIdx: 0,
                warehouseArrivalDateLabel: '',
              },
            },
          }
        : model;
    return computeProcurementPlan(src, scenario);
  }, [model, scenario]);
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
    if (!canEditModal) return;
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
    if (!canEditModal) return;
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
    if (!canEditModal) return;
    const updated = approveRecommendedBatch(model, batch, authorLabel);
    onUpdateModel(updated);
    notify?.(
      'success',
      'Партия утверждена в заказ фабрике',
      `${batch.recommendedPacks.toLocaleString('ru-RU')} ${unitCfg.primaryUnit} · заказ до ${formatShortDateRu(batch.recommendedOrderDateIso)}`
    );
  };

  const handleRevokeApprovedPo = (poId: string) => {
    if (!canEditModal) return;
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
            {canEditModal && (
              <>
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
              </>
            )}
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
                    {hasCost ? (
                      <>
                        <div className="text-[13.5px] font-extrabold text-[#0F5132]">
                          {formatMln(po.totalOrderRub)}
                        </div>
                        <div className="text-[10.5px] text-[#146C43] font-semibold">
                          Аванс: {formatMln(po.prepaymentRub)}
                        </div>
                      </>
                    ) : (
                      <span className="text-[12px] text-[#64748B]">Скрыто</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {canEditModal ? (
                      <button
                        type="button"
                        onClick={() => handleRevokeApprovedPo(po.id)}
                        className="h-8 px-2.5 rounded-[8px] border border-[#D8D7CE] bg-white hover:bg-rose-50 hover:text-rose-700 text-[11px] font-semibold text-[#52514C] cursor-pointer"
                      >
                        Вернуть в черновик
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#94A3B8]">Только чтение</span>
                    )}
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
                          disabled={!canEditModal}
                          value={batch.firstCoveredMonthIdx}
                          onChange={(e) => {
                            if (!canEditModal) return;
                            const nextStart = Number(e.target.value);
                            handleUpdateBatchField(batch.periodId, (prev) => ({
                              ...prev,
                              startMonthIdx: nextStart,
                              endMonthIdx: Math.max(nextStart, prev.endMonthIdx),
                            }));
                          }}
                          className="rounded border border-[#D8D7CE] bg-white px-1.5 py-0.5 font-semibold disabled:opacity-60"
                        >
                          {MONTHS_SHORT_RU.map((m, mIdx) => (
                            <option key={m} value={mIdx}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <span>—</span>
                        <select
                          disabled={!canEditModal}
                          value={batch.endCoveredMonthIdx}
                          onChange={(e) => {
                            if (!canEditModal) return;
                            const nextEnd = Number(e.target.value);
                            handleUpdateBatchField(batch.periodId, (prev) => ({
                              ...prev,
                              endMonthIdx: Math.max(prev.startMonthIdx, nextEnd),
                            }));
                          }}
                          className="rounded border border-[#D8D7CE] bg-white px-1.5 py-0.5 font-semibold disabled:opacity-60"
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
                        disabled={!canEditModal}
                        value={batch.recommendedOrderDateIso}
                        onChange={(e) => {
                          if (!canEditModal || !e.target.value) return;
                          handleUpdateBatchField(batch.periodId, (prev) => ({
                            ...prev,
                            customOrderDateIso: e.target.value,
                          }));
                        }}
                        className="h-8 rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 font-mono text-[12px] font-bold text-[#141413] disabled:opacity-60"
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
                        disabled={!canEditModal}
                        value={batch.recommendedPacks}
                        onChange={(e) => {
                          if (!canEditModal) return;
                          const val = Math.max(0, Number(e.target.value) || 0);
                          handleUpdateBatchQtyAndRebalance(batch.periodId, val);
                        }}
                        className="h-8 w-24 rounded-[8px] border border-[#CFCEC6] bg-white px-2 text-right font-mono text-[13px] font-bold text-[#141413] disabled:opacity-60"
                      />
                      <div className="font-mono text-[10.5px] text-[#686760] mt-0.5">
                        {batch.physicalUnitsQty.toLocaleString('ru-RU')} {unitCfg.secondaryUnit}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono">
                      {hasCost ? (
                        <>
                          <div className="text-[13.5px] font-extrabold text-[#141413]">
                            {formatMln(batch.estimatedTotalRub)}
                          </div>
                          <div className="text-[10.5px] text-[#146C43] font-semibold">
                            Аванс 30%: {formatMln(batch.prepaymentRub)}
                          </div>
                        </>
                      ) : (
                        <span className="text-[12px] text-[#64748B]">Скрыто</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {canEditModal ? (
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
                      ) : (
                        <span className="text-[11px] text-[#94A3B8]">Только чтение</span>
                      )}
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
