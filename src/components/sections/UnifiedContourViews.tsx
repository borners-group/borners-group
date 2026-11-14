'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Calendar,
  FlaskConical,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import {
  GrowthScenarioDef,
  MONTHS_SHORT_RU,
  PRIORITY_WEIGHTS,
  ScenarioModelSpec,
  computeModelScenarioMetrics,
  getModelPriority,
} from '@/lib/scenarioData';
import { ACTING_2027_SCENARIO_ID, getActingSkuByWbOrVendor } from '@/lib/actingAssortment2027';
import {
  isBrandScenarioExplicitlyNone,
  resolveEffectiveScenarioForModel,
} from '@/lib/portfolioPersistence';
import {
  ApprovedPurchaseOrder,
  PO_STATUS_LABELS_RU,
  approveRecommendedBatch,
  computeFinancialPnL,
  computeGroupBrandsInvestmentReport,
  computeMultiBrandPortfolioSummary,
  computePortfolioProcurementWavesSummary,
  computeProcurementPlan,
  computeScenarioInvestmentSummary,
  computeWhatIfSensitivitySimulation,
  createCustomPurchaseOrder,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  getBrandUnitConfig,
  groupRecommendedBatchesByFactory,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
  removeApprovedPurchaseOrder,
  serializePurchaseOrdersToCsv,
  serializeScenarioFactoryOrdersToCsv,
  serializeStructuredPlanToCsv,
  toggleModelProcurementByOrders,
  updateApprovedPurchaseOrder,
  updateModelBuyoutRatePct,
  updateModelSizeVariantUnitCost,
  updateModelUnitCostWithVariants,
} from '@/lib/unifiedBusinessEngine';
import { getBrandProductionProfile } from '@/lib/brandProductionConfig';
import { safeGetStorageJson, safeSetStorageJson } from '@/lib/safeStorage';
import { formatLabBrandLabel } from '@/lib/rndCatalogSync';
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';
import {
  canUserEditBrand,
  canUserViewCostPrice,
  canUserViewFinance,
} from '@/lib/finance';
import { ScenarioSalesPlanScreen } from '@/components/sections/ScenarioSalesPlanScreen';
import { SkuProcurementMvpWorkbench } from '@/components/sections/SkuProcurementMvpWorkbench';
import { PeakOwnMoneyChartPanel } from '@/components/sections/PeakOwnMoneyChartPanel';
import { RoadmapTasksView } from '@/components/sections/ManagementAndSystemViews';
import { FinanceView } from '@/components/sections/FinanceAndImportViews';

interface StoredFinanceContourParams {
  initialCashMln?: number;
  wbLagMonths?: number;
  whatIfPriceDelta?: number;
  whatIfCostDelta?: number;
  whatIfMpAdsDelta?: number;
}

function readStoredFinanceContourParams(): StoredFinanceContourParams {
  return (
    safeGetStorageJson<StoredFinanceContourParams>('borners_finance_contour_params_v1') || {}
  );
}

function writeStoredFinanceContourParams(patch: Partial<StoredFinanceContourParams>): void {
  const prev = readStoredFinanceContourParams();
  const next: StoredFinanceContourParams = {
    initialCashMln:
      typeof patch.initialCashMln === 'number'
        ? patch.initialCashMln
        : typeof prev.initialCashMln === 'number'
        ? prev.initialCashMln
        : 0,
    wbLagMonths:
      typeof patch.wbLagMonths === 'number'
        ? patch.wbLagMonths
        : typeof prev.wbLagMonths === 'number'
        ? prev.wbLagMonths
        : 0,
    whatIfPriceDelta:
      typeof patch.whatIfPriceDelta === 'number'
        ? patch.whatIfPriceDelta
        : typeof prev.whatIfPriceDelta === 'number'
        ? prev.whatIfPriceDelta
        : 0,
    whatIfCostDelta:
      typeof patch.whatIfCostDelta === 'number'
        ? patch.whatIfCostDelta
        : typeof prev.whatIfCostDelta === 'number'
        ? prev.whatIfCostDelta
        : 0,
    whatIfMpAdsDelta:
      typeof patch.whatIfMpAdsDelta === 'number'
        ? patch.whatIfMpAdsDelta
        : typeof prev.whatIfMpAdsDelta === 'number'
        ? prev.whatIfMpAdsDelta
        : 0,
  };
  const unchanged =
    prev.initialCashMln === next.initialCashMln &&
    prev.wbLagMonths === next.wbLagMonths &&
    prev.whatIfPriceDelta === next.whatIfPriceDelta &&
    prev.whatIfCostDelta === next.whatIfCostDelta &&
    prev.whatIfMpAdsDelta === next.whatIfMpAdsDelta;
  if (unchanged) return;
  safeSetStorageJson('borners_finance_contour_params_v1', next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('borners-finance-params-changed', { detail: next }));
  }
}

function resolveModelBrandForRbac(model: ScenarioModelSpec): string {
  const norm = normalizePortfolioBrandCode(
    detectModelBrandPortfolioLabel(model) || model.brandId
  );
  return norm === 'ALL' ? 'BORNERS' : norm;
}

function getModelProductionProfileFull(model: ScenarioModelSpec) {
  return getBrandProductionProfile(
    detectModelBrandPortfolioLabel(model) || model.brandId,
    `${model.title || ''} ${model.categoryLabel || ''} ${model.construction?.fit || ''} ${model.waistband?.width || ''}`
  );
}

function groupQuantitiesByPrimaryUnit(
  items: { unit: string; qty: number }[]
): { unit: string; qty: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!Number.isFinite(item.qty)) continue;
    const u = item.unit || 'ед.';
    map.set(u, (map.get(u) || 0) + Math.round(item.qty));
  }
  return Array.from(map.entries())
    .filter(([, q]) => q > 0)
    .map(([unit, qty]) => ({ unit, qty }));
}

function formatGroupedUnitInline(
  items: { unit: string; qty: number }[],
  fallbackUnit = 'ед.'
): string {
  const groups = groupQuantitiesByPrimaryUnit(items);
  if (groups.length === 0) return `0 ${fallbackUnit}`;
  return groups.map((g) => `${g.qty.toLocaleString('ru-RU')} ${g.unit}`).join(' · ');
}

function formatMln(rub: number): string {
  return `${(rub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
}

function allocatePacksAcrossProfileSizes(
  totalPacks: number,
  sizes: string[],
  sizeSharesPct: Record<string, number>
): { label: string; qty: number }[] {
  const safeTotal = Math.max(0, Math.round(totalPacks));
  if (sizes.length === 0) return [];
  const weights = sizes.map((sz) =>
    Math.max(0, Number(sizeSharesPct[sz]) || 100 / sizes.length)
  );
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
  const exacts = weights.map((w) => (safeTotal * w) / weightSum);
  const floors = exacts.map((v) => Math.floor(v));
  let remainder = Math.max(0, safeTotal - floors.reduce((s, v) => s + v, 0));

  const order = sizes
    .map((_, idx) => idx)
    .sort((a, b) => {
      const diff = exacts[b] - floors[b] - (exacts[a] - floors[a]);
      if (Math.abs(diff) > 1e-9) return diff;
      return weights[b] - weights[a];
    });

  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    floors[order[i]] += 1;
    remainder -= 1;
  }

  return sizes.map((label, idx) => ({ label, qty: floors[idx] }));
}

function buildHoldingScopedModelEntries(
  models: ScenarioModelSpec[],
  scenarios: GrowthScenarioDef[],
  selectedScenarioByBrand: Partial<Record<string, number | null>>,
  fallbackScenario: GrowthScenarioDef,
  multiBrandSummary: ReturnType<typeof computeMultiBrandPortfolioSummary>
): { model: ScenarioModelSpec; scenario: GrowthScenarioDef }[] {
  const seen = new Set<string>();
  const list: { model: ScenarioModelSpec; scenario: GrowthScenarioDef }[] = [];
  for (const bRow of multiBrandSummary.brands) {
    if (isBrandScenarioExplicitlyNone(bRow.brandCode, selectedScenarioByBrand)) continue;
    if (!bRow.hasScenario || !bRow.hasModels || bRow.selectedScenarioId === null) continue;
    const bScen =
      scenarios.find((s) => s.id === bRow.selectedScenarioId && !s.isArchived) ||
      fallbackScenario;
    for (const rm of models) {
      if (!rm || rm.launchStatus === 'В архиве') continue;
      if (
        ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(rm.id) ||
        ['№001', '№002', '№003', '№004'].includes(rm.code)
      ) {
        continue;
      }
      if (!matchesBrandFilter(rm, bRow.brandCode)) continue;
      if (
        bScen.id === ACTING_2027_SCENARIO_ID &&
        !getActingSkuByWbOrVendor(rm.code, rm.title) &&
        !rm.plansByScenario?.[ACTING_2027_SCENARIO_ID]
      ) {
        continue;
      }
      const key = rm.id || rm.code;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ model: rm, scenario: bScen });
    }
  }
  return list;
}

function BufferedInlineNumberInput({
  value,
  min = 0,
  max,
  ariaLabel,
  className,
  onCommit,
}: {
  value: number;
  min?: number;
  max?: number;
  ariaLabel: string;
  className?: string;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string>(() => String(value));
  const [focused, setFocused] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(value));
      setDirty(false);
    }
  }, [value, focused]);

  const flush = (raw: string) => {
    if (!dirty) {
      setDraft(String(value));
      return;
    }
    const cleaned = raw.replace(/\s+/g, '').replace(',', '.');
    if (cleaned === '' || cleaned === '-') {
      setDraft(String(value));
      setDirty(false);
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      setDirty(false);
      return;
    }
    let clamped = Math.max(min, Math.round(parsed));
    if (typeof max === 'number') clamped = Math.min(max, clamped);
    setDraft(String(clamped));
    setDirty(false);
    if (clamped !== value) {
      onCommit(clamped);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const nextRaw = e.target.value;
        if (!/^[0-9\s.,]*$/.test(nextRaw)) return;
        setDraft(nextRaw);
        setDirty(true);
      }}
      onBlur={() => {
        setFocused(false);
        flush(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(String(value));
          setDirty(false);
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

function ScenarioContourHeader({
  stepCode,
  title,
  subtitle,
  selectedScenarioId,
  orderedScenarios,
  onSelectScenario,
  includeGroupPortfolioInS1,
  onToggleGroupPortfolio,
  eligibleCount,
  rightSlot,
}: {
  stepCode: string;
  title: string;
  subtitle: string;
  selectedScenarioId: number;
  orderedScenarios: ReturnType<typeof useLiveScenarioPortfolio>['orderedScenarios'];
  onSelectScenario: (id: number, explicitBrandOverride?: string) => void;
  includeGroupPortfolioInS1: boolean;
  onToggleGroupPortfolio: (v: boolean) => void;
  eligibleCount: number;
  rightSlot?: React.ReactNode;
}) {
  const { brandFilter, setBrandFilter, currentUser } = usePlatform();
  const hasFinance = canUserViewFinance(currentUser);

  return (
    <section className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-5 md:p-6 space-y-4 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[#E4E1DA] dark:border-[#282724]">
        <div>
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[#78746C] dark:text-[#9E9A92]">
            {stepCode}
          </div>
          <h1 className="text-[21px] md:text-[24px] font-semibold tracking-[-0.02em] text-[#141413] dark:text-[#F5F4F0] mt-0.5">
            {title}
          </h1>
          <p className="text-[12.5px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">{subtitle}</p>
        </div>
        {rightSlot && <div className="flex flex-wrap items-center gap-2">{rightSlot}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-medium text-[#78746C] dark:text-[#9E9A92] mr-1">
            Активный сценарий:
          </span>
          {orderedScenarios.map((sc) => {
            const isSel = sc.id === selectedScenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => {
                  const ownerNorm = sc.ownerBrandCode
                    ? normalizePortfolioBrandCode(sc.ownerBrandCode)
                    : null;
                  if (sc.id === 105 || sc.id === 202705 || ownerNorm === 'LISKANI') {
                    setBrandFilter('LISKANI');
                    onSelectScenario(sc.id, 'LISKANI');
                  } else if (sc.id === 202706 || ownerNorm === 'AKUSHA') {
                    setBrandFilter('AKUSHA');
                    onSelectScenario(sc.id, 'AKUSHA');
                  } else if (ownerNorm && ownerNorm !== 'ALL') {
                    setBrandFilter(ownerNorm);
                    onSelectScenario(sc.id, ownerNorm);
                  } else if (brandFilter === 'LISKANI' || brandFilter === 'AKUSHA') {
                    setBrandFilter('BORNERS');
                    onSelectScenario(sc.id, 'BORNERS');
                  } else if (brandFilter !== 'ALL') {
                    onSelectScenario(sc.id, brandFilter);
                  } else {
                    onSelectScenario(sc.id);
                  }
                }}
                className={`h-8.5 px-3 rounded-lg text-[12px] font-medium border transition-colors cursor-pointer ${
                  isSel
                    ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] border-[#141413] dark:border-[#F5F4F0]'
                    : 'bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:bg-white dark:hover:bg-[#282724] text-[#141413] dark:text-[#F5F4F0] border-[#E4E1DA] dark:border-[#282724]'
                }`}
              >
                {sc.id === ACTING_2027_SCENARIO_ID
                  ? 'Исходный план (7 SKU)'
                  : hasFinance
                  ? `${sc.title} · ${sc.monthlyTargetMln} млн ₽/мес`
                  : sc.title}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {brandFilter !== 'ALL' && (
            <div className="inline-flex items-center gap-2 h-8.5 px-3 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[11.5px] font-medium text-[#141413] dark:text-[#F5F4F0]">
              <span>
                Бренд: {formatLabBrandLabel(brandFilter)} ({eligibleCount} SKU)
              </span>
              <button
                type="button"
                onClick={() => {
                  const activeOwner = orderedScenarios.find(
                    (s) => s.id === selectedScenarioId
                  )?.ownerBrandCode;
                  setBrandFilter('ALL');
                  if (
                    selectedScenarioId === 202705 ||
                    selectedScenarioId === 202706 ||
                    (activeOwner && activeOwner !== 'BORNERS')
                  ) {
                    onSelectScenario(1, 'ALL');
                  }
                }}
                className="underline hover:opacity-75 cursor-pointer text-[#5C5953] dark:text-[#9E9A92]"
              >
                Все бренды
              </button>
            </div>
          )}

          {selectedScenarioId === 1 &&
            (brandFilter === 'BORNERS' || brandFilter === 'FUKAI') && (
              <div className="inline-flex items-center rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] p-1 text-[11.5px]">
                <button
                  type="button"
                  onClick={() => onToggleGroupPortfolio(false)}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    !includeGroupPortfolioInS1
                      ? 'bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] font-medium border border-[#E4E1DA] dark:border-[#282724] shadow-2xs'
                      : 'text-[#5C5953] dark:text-[#9E9A92] hover:text-[#141413] dark:hover:text-[#F5F4F0] font-medium'
                  }`}
                >
                  Цель BORNERS · 21 SKU
                </button>
                <button
                  type="button"
                  onClick={() => onToggleGroupPortfolio(true)}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                    includeGroupPortfolioInS1
                      ? 'bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] font-medium border border-[#E4E1DA] dark:border-[#282724] shadow-2xs'
                      : 'text-[#5C5953] dark:text-[#9E9A92] hover:text-[#141413] dark:hover:text-[#F5F4F0] font-medium'
                  }`}
                >
                  С FUKAI · 23 SKU
                </button>
              </div>
            )}
        </div>
      </div>

      {brandFilter === 'NA_TELE' &&
        eligibleCount === 0 &&
        (selectedScenarioId === 1 || selectedScenarioId === ACTING_2027_SCENARIO_ID) && (
        <div className="rounded-[12px] bg-[#F7F7F3] border-[1.5px] border-[#CECDC4] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
          <span className="text-[#262624] font-medium">
            В выбранном сценарии модели <strong>НА ТЕЛЕ</strong> не задействованы (моно-цель BORNERS). Линейка НА ТЕЛЕ включена в Сценарии №2 и №3.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectScenario(2, 'NA_TELE')}
              className="h-8 px-3 rounded-[8px] bg-[#EAE9E2] hover:bg-[#DFDED6] text-[#141413] border border-[#CECDC4] text-[11.5px] font-semibold cursor-pointer"
            >
              {hasFinance ? 'Переключить на Сценарий №2 (150 млн)' : 'Переключить на Сценарий №2'}
            </button>
            <button
              type="button"
              onClick={() => setBrandFilter('ALL')}
              className="h-8 px-3 rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[11.5px] font-semibold text-[#141413] cursor-pointer"
            >
              Показать все бренды
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// =============================================================================
// 02 · ПРОДАЖИ: СВОДНАЯ МАТРИЦА ПРОДАЖ ВСЕХ SKU НА 12 МЕСЯЦЕВ (2027)
// =============================================================================
export function SalesMatrixContourView() {
  const { currentUser, navigateTo, notify, brandFilter, setBrandFilter } = usePlatform();
  const {
    models,
    scenarios,
    orderedScenarios,
    currentScenario,
    selectedScenarioId,
    selectedScenarioByBrand,
    setSelectedScenarioId,
    includeGroupPortfolioInS1,
    setIncludeGroupPortfolioInS1,
    eligibleModels,
    totals,
    updateModelSpec,
    launchStarterCabinet,
  } = useLiveScenarioPortfolio();

  const hasFinance = canUserViewFinance(currentUser);
  const [holdingScopeMode, setHoldingScopeMode] = useState<boolean>(true);
  const [unitMode, setUnitMode] = useState<'rub' | 'packs'>(() =>
    canUserViewFinance(currentUser) ? 'rub' : 'packs'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'dec_desc' | 'year_desc' | 'priority'>('dec_desc');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasFinance && unitMode === 'rub') {
      setUnitMode('packs');
    }
  }, [hasFinance, unitMode]);

  const effectiveUnitMode: 'rub' | 'packs' = hasFinance ? unitMode : 'packs';

  useEffect(() => {
    if (brandFilter === 'ALL') {
      setHoldingScopeMode(true);
    }
  }, [brandFilter]);

  const isHoldingAllBrandsActive = brandFilter === 'ALL' && holdingScopeMode;

  const multiBrandSummary = useMemo(
    () => computeMultiBrandPortfolioSummary(models, scenarios, selectedScenarioByBrand),
    [models, scenarios, selectedScenarioByBrand]
  );

  const scopedEntries = useMemo(() => {
    if (!isHoldingAllBrandsActive) {
      return eligibleModels.map((m) => ({ model: m, scenario: currentScenario }));
    }
    const holdingList = buildHoldingScopedModelEntries(
      models,
      scenarios,
      selectedScenarioByBrand,
      currentScenario,
      multiBrandSummary
    );
    return holdingList.length > 0
      ? holdingList
      : eligibleModels.map((m) => ({ model: m, scenario: currentScenario }));
  }, [
    isHoldingAllBrandsActive,
    eligibleModels,
    currentScenario,
    models,
    scenarios,
    selectedScenarioByBrand,
    multiBrandSummary,
  ]);

  const effectiveTotals = useMemo(() => {
    if (!isHoldingAllBrandsActive) return totals;
    const monthlyRevRub = Array(12).fill(0) as number[];
    const monthlyPacks = Array(12).fill(0) as number[];
    let annualRevenueRub = 0;
    let decRevenueRub = 0;
    let annualPacks = 0;
    let annualOrdersPacks = 0;
    let annualOrdersRub = 0;

    for (const { model, scenario } of scopedEntries) {
      const met = computeModelScenarioMetrics(model, scenario);
      annualRevenueRub += met.annualRevenueRub;
      decRevenueRub += met.targetMonthRevenueRub;
      annualPacks += met.annualPacks;
      annualOrdersPacks += met.annualOrdersPacks;
      annualOrdersRub += met.annualOrdersRub;
      for (let idx = 0; idx < 12; idx++) {
        monthlyRevRub[idx] += met.monthlyRevenuesRub[idx] || 0;
        monthlyPacks[idx] += met.plan.monthlyPacks[idx] || 0;
      }
    }

    return {
      ...totals,
      monthlyRevRub,
      monthlyPacks,
      annualRevenueRub,
      decRevenueRub,
      annualPacks,
      annualOrdersPacks,
      annualOrdersRub,
    };
  }, [isHoldingAllBrandsActive, totals, scopedEntries]);

  const visibleEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = !q
      ? [...scopedEntries]
      : scopedEntries.filter(({ model: m }) => {
          const acting = getActingSkuByWbOrVendor(m.code, m.title);
          return (
            m.code.toLowerCase().includes(q) ||
            m.title.toLowerCase().includes(q) ||
            m.subtitle.toLowerCase().includes(q) ||
            (m.wbArticle || '').toLowerCase().includes(q) ||
            detectModelBrandPortfolioLabel(m).toLowerCase().includes(q) ||
            Boolean(acting?.wbSku.includes(q))
          );
        });

    if (sortBy === 'dec_desc') {
      filtered.sort((a, b) => {
        const metB = computeModelScenarioMetrics(b.model, b.scenario);
        const metA = computeModelScenarioMetrics(a.model, a.scenario);
        return hasFinance
          ? metB.targetMonthRevenueRub - metA.targetMonthRevenueRub
          : metB.targetMonthPacks - metA.targetMonthPacks;
      });
    } else if (sortBy === 'year_desc') {
      filtered.sort((a, b) => {
        const metB = computeModelScenarioMetrics(b.model, b.scenario);
        const metA = computeModelScenarioMetrics(a.model, a.scenario);
        return hasFinance
          ? metB.annualRevenueRub - metA.annualRevenueRub
          : metB.annualPacks - metA.annualPacks;
      });
    } else if (sortBy === 'priority') {
      filtered.sort((a, b) => {
        const wDiff =
          PRIORITY_WEIGHTS[getModelPriority(b.model)] - PRIORITY_WEIGHTS[getModelPriority(a.model)];
        if (wDiff !== 0) return wDiff;
        const metB = computeModelScenarioMetrics(b.model, b.scenario);
        const metA = computeModelScenarioMetrics(a.model, a.scenario);
        return hasFinance
          ? metB.targetMonthRevenueRub - metA.targetMonthRevenueRub
          : metB.targetMonthPacks - metA.targetMonthPacks;
      });
    }

    return filtered;
  }, [scopedEntries, searchQuery, sortBy, hasFinance]);

  const switcherEntries = visibleEntries.length > 0 ? visibleEntries : scopedEntries;

  const editingEntry = useMemo(() => {
    if (!editingModelId) return null;
    const fromScoped = scopedEntries.find((e) => e.model.id === editingModelId);
    if (fromScoped) return fromScoped;
    const fromAll = models.find((m) => m.id === editingModelId);
    if (!fromAll) return null;
    return {
      model: fromAll,
      scenario: resolveEffectiveScenarioForModel(
        fromAll,
        scenarios,
        selectedScenarioByBrand,
        currentScenario,
        includeGroupPortfolioInS1
      ),
    };
  }, [
    editingModelId,
    scopedEntries,
    models,
    scenarios,
    selectedScenarioByBrand,
    currentScenario,
    includeGroupPortfolioInS1,
  ]);

  const editingModel = editingEntry?.model || null;

  const editingIdx = useMemo(
    () => (editingModel ? switcherEntries.findIndex((e) => e.model.id === editingModel.id) : -1),
    [editingModel, switcherEntries]
  );

  useEffect(() => {
    if (!editingModel || switcherEntries.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '[') {
        e.preventDefault();
        const prevIdx =
          (Math.max(0, editingIdx) - 1 + switcherEntries.length) % switcherEntries.length;
        setEditingModelId(switcherEntries[prevIdx].model.id);
      } else if (e.key === ']') {
        e.preventDefault();
        const nextIdx = (Math.max(0, editingIdx) + 1) % switcherEntries.length;
        setEditingModelId(switcherEntries[nextIdx].model.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingModel, editingIdx, switcherEntries]);

  const handleExportCsv = () => {
    if (!hasFinance) return;
    const rows = isHoldingAllBrandsActive
      ? scopedEntries.flatMap(({ model, scenario }) =>
          exportStructuredScenarioPlan([model], scenario)
        )
      : exportStructuredScenarioPlan(eligibleModels, currentScenario);
    const csv = serializeStructuredPlanToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isHoldingAllBrandsActive
      ? 'borners_sales_matrix_holding_5brands_2027.csv'
      : `borners_sales_matrix_s${currentScenario.id}_2027.csv`;
    if (document.body) {
      document.body.appendChild(a);
    }
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    notify(
      'success',
      isHoldingAllBrandsActive
        ? `Выгружена матрица продаж холдинга (${rows.length} строк)`
        : `Выгружена матрица продаж «${currentScenario.title}» (${rows.length} строк)`
    );
  };

  const openSkuPassportOnDashboard = (modelId: string) => {
    try {
      sessionStorage.setItem('borners_open_scenario_model_id', modelId);
    } catch {
      // ignore
    }
    navigateTo('dashboard');
  };

  if (editingModel && editingEntry) {
    const safeIdx = editingIdx >= 0 ? editingIdx : 0;
    const prevMod =
      switcherEntries[(safeIdx - 1 + switcherEntries.length) % switcherEntries.length]?.model;
    const nextMod = switcherEntries[(safeIdx + 1) % switcherEntries.length]?.model;

    return (
      <div className="space-y-5 pb-16">
        <div className="rounded-[14px] bg-white border-[1.5px] border-[#C8C7BE] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setEditingModelId(null)}
            className="h-8.5 px-3.5 rounded-[8px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[12.5px] font-semibold cursor-pointer"
          >
            ← Ко всей матрице ({scopedEntries.length} SKU)
          </button>

          {/* Мгновенное переключение между SKU без возврата в таблицу */}
          {switcherEntries.length > 1 && (
            <div className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#F5F5F1] border-[1.5px] border-[#CECDC4] p-1">
              <button
                type="button"
                onClick={() => prevMod && setEditingModelId(prevMod.id)}
                title="Предыдущая модель (клавиша [)"
                className="h-7 px-2.5 rounded-[6px] bg-white hover:border-[#141413] border border-[#CECDC4] text-[12px] font-semibold text-[#141413] cursor-pointer"
              >
                ‹ Пред.
              </button>
              <select
                value={editingModel.id}
                onChange={(e) => setEditingModelId(e.target.value)}
                className="h-7 px-2 rounded-[6px] bg-white border border-[#CECDC4] text-[12px] font-bold text-[#141413] max-w-[260px] sm:max-w-[340px] cursor-pointer"
              >
                {switcherEntries.map(({ model: m, scenario: mScen }, idx) => {
                  const met = computeModelScenarioMetrics(m, mScen);
                  const unitCfg = getBrandUnitConfig(m);
                  return (
                    <option key={m.id} value={m.id}>
                      {idx + 1}/{switcherEntries.length} · {m.code} — {m.title} (
                      {hasFinance
                        ? `${(met.targetMonthRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн/дек`
                        : `${met.targetMonthPacks.toLocaleString('ru-RU')} ${unitCfg.primaryUnit}/дек`}
                      )
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                onClick={() => nextMod && setEditingModelId(nextMod.id)}
                title="Следующая модель (клавиша ])"
                className="h-7 px-2.5 rounded-[6px] bg-white hover:border-[#141413] border border-[#CECDC4] text-[12px] font-semibold text-[#141413] cursor-pointer"
              >
                След. ›
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => openSkuPassportOnDashboard(editingModel.id)}
            className="h-8.5 px-3.5 rounded-[8px] bg-[#F5F5F1] border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[12.5px] font-semibold text-[#141413] cursor-pointer"
          >
            Открыть паспорт SKU
          </button>
        </div>

        <ScenarioSalesPlanScreen
          key={editingModel.id}
          model={editingModel}
          scenario={editingEntry.scenario}
          allScenarios={orderedScenarios}
          onSelectScenario={(id) => {
            if (isHoldingAllBrandsActive) {
              setSelectedScenarioId(id, detectModelBrandPortfolioLabel(editingModel));
            } else {
              setSelectedScenarioId(id, detectModelBrandPortfolioLabel(editingModel));
            }
          }}
          onBackToModel={() => setEditingModelId(null)}
          onUpdateModel={updateModelSpec}
          notify={notify}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <ScenarioContourHeader
        stepCode="02 · Продажи · Помесячная матрица портфеля"
        title={
          isHoldingAllBrandsActive
            ? 'План продаж холдинга на 12 месяцев (все 5 брендов)'
            : 'План продаж на 12 месяцев (все SKU сценария)'
        }
        subtitle="Сводная таблица выкупов и выручки по каждому артикулу на 2027 год. Нажмите на строку SKU для помесячного редактирования."
        selectedScenarioId={selectedScenarioId}
        orderedScenarios={orderedScenarios}
        onSelectScenario={(id, explicitBrand) => {
          if (brandFilter === 'ALL' && !explicitBrand) {
            setHoldingScopeMode(false);
          }
          setSelectedScenarioId(id, explicitBrand);
        }}
        includeGroupPortfolioInS1={includeGroupPortfolioInS1}
        onToggleGroupPortfolio={setIncludeGroupPortfolioInS1}
        eligibleCount={scopedEntries.length}
        rightSlot={
          <>
            {brandFilter === 'ALL' && (
              <div className="inline-flex rounded-xl bg-[#F1F5F9] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] p-1 text-[12px] font-medium">
                <button
                  type="button"
                  onClick={() => setHoldingScopeMode(true)}
                  className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                    holdingScopeMode
                      ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-2xs'
                      : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
                  }`}
                >
                  Все 5 брендов холдинга
                </button>
                <button
                  type="button"
                  onClick={() => setHoldingScopeMode(false)}
                  className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                    !holdingScopeMode
                      ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-2xs'
                      : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
                  }`}
                >
                  Только выбранный сценарий
                </button>
              </div>
            )}
            <div className="inline-flex rounded-xl bg-[#F1F5F9] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] p-1 text-[12px] font-medium">
              {hasFinance && (
                <button
                  type="button"
                  onClick={() => setUnitMode('rub')}
                  className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                    effectiveUnitMode === 'rub'
                      ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-2xs'
                      : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
                  }`}
                >
                  Млн ₽
                </button>
              )}
              <button
                type="button"
                onClick={() => setUnitMode('packs')}
                className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                  effectiveUnitMode === 'packs'
                    ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-2xs'
                    : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
                }`}
              >
                {(() => {
                  const units = Array.from(
                    new Set(scopedEntries.map((e) => getBrandUnitConfig(e.model).primaryUnit))
                  );
                  if (units.length > 1) return 'Натуральные ед.';
                  const singleUnit =
                    units[0] ||
                    (brandFilter !== 'ALL' ? getBrandUnitConfig(brandFilter).primaryUnit : 'компл.');
                  if (singleUnit === 'пар') return 'Пары (шт.)';
                  if (singleUnit === 'компл. штор') return 'Шторы (компл.)';
                  return 'Комплекты (шт.)';
                })()}
              </button>
            </div>
            {hasFinance && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="h-9 px-3.5 rounded-xl bg-white dark:bg-[#121620] hover:bg-[#F8FAFC] dark:hover:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] text-[12px] font-semibold text-[#0F172A] dark:text-[#EDF0F7] cursor-pointer"
              >
                Экспорт CSV
              </button>
            )}
          </>
        }
      />

      {scopedEntries.length === 0 && (
        <div className="rounded-[14px] bg-white dark:bg-[#121620] border border-[#D8D7CF] dark:border-[#222938] p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="text-[14.5px] font-bold text-[#141413] dark:text-[#EDF0F7]">
              В сценарии «{currentScenario.title}» пока нет моделей бренда {formatLabBrandLabel(brandFilter)}
            </div>
            <p className="text-[12.5px] text-[#5E5D58] dark:text-[#94A3B8]">
              {brandFilter === 'NA_TELE'
                ? 'Добавьте артикулы НА ТЕЛЕ в «01 · Продукт», перенесите разработки из «Лаборатории R&D» в 1 клик или разверните стартовую матрицу (3 SKU).'
                : 'Для выбранного фильтра бренда в текущем сценарии пока нет активных SKU. Добавьте модель в каталоге или разверните стартовую матрицу.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigateTo('product-catalog', { brandId: brandFilter })}
              className="h-8.5 px-3.5 rounded-lg bg-[#141413] dark:bg-[#F5F4F0] hover:opacity-90 text-white dark:text-[#141413] text-[12px] font-medium cursor-pointer transition-colors"
            >
              + Добавить в Каталоге
            </button>
            <button
              type="button"
              onClick={() => navigateTo('product-lab', { brandId: brandFilter })}
              className="h-8.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] dark:bg-[#1D1C1A] dark:text-[#F5F4F0] dark:border-[#282724] text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <FlaskConical className="h-3.5 w-3.5 text-[#5C5953]" strokeWidth={1.5} />
              <span>Из Лаборатории R&D</span>
            </button>
            {(brandFilter === 'AKUSHA' ||
              brandFilter === 'LISKANI' ||
              brandFilter === 'NA_TELE') &&
              canUserEditBrand(currentUser, brandFilter) && (
              <button
                type="button"
                onClick={() => {
                  const res = launchStarterCabinet(
                    brandFilter as 'AKUSHA' | 'LISKANI' | 'NA_TELE'
                  );
                  notify(
                    'success',
                    `Кабинет ${formatLabBrandLabel(brandFilter)} запущен (${res.addedCount} SKU)`
                  );
                }}
                className="h-8.5 px-3.5 rounded-lg bg-[#141413] hover:bg-[#282724] text-white text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Запустить стартовую матрицу (3 SKU)</span>
              </button>
            )}
            {brandFilter === 'NA_TELE' && selectedScenarioId !== 2 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedScenarioId(2, 'NA_TELE');
                }}
                className="h-8.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] text-[12px] font-medium cursor-pointer transition-colors"
              >
                {hasFinance ? 'Переключить на Сценарий №2 · 150 млн' : 'Переключить на Сценарий №2'}
              </button>
            )}
            {brandFilter === 'FUKAI' && selectedScenarioId === 1 && !includeGroupPortfolioInS1 && (
              <button
                type="button"
                onClick={() => setIncludeGroupPortfolioInS1(true)}
                className="h-8.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] text-[12px] font-medium cursor-pointer transition-colors"
              >
                Подключить портфель группы (с FUKAI)
              </button>
            )}
            <button
              type="button"
              onClick={() => setBrandFilter('ALL')}
              className="h-8.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-white border border-[#E4E1DA] hover:border-[#141413] text-[#141413] text-[12px] font-medium cursor-pointer transition-colors"
            >
              Показать все бренды
            </button>
          </div>
        </div>
      )}

      {/* 4 ключевых показателя продаж в спокойной архитектурной подаче */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-1 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92]">
            Годовая выручка 2027
          </div>
          <div className="font-mono tabular-nums tracking-[-0.025em] text-2xl font-semibold text-[#141413] dark:text-[#F5F4F0]">
            {hasFinance ? formatMln(effectiveTotals.annualRevenueRub) : 'Скрыто'}
          </div>
          <div className="text-[11.5px] text-[#5C5953] dark:text-[#9E9A92]">
            {hasFinance
              ? `${effectiveTotals.annualRevenueRub.toLocaleString('ru-RU')} ₽ за 12 мес.`
              : 'Скрыто по роли'}
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-1 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92]">
            Выручка в декабре 2027
          </div>
          <div className="font-mono tabular-nums tracking-[-0.025em] text-2xl font-semibold text-[#141413] dark:text-[#F5F4F0]">
            {hasFinance ? formatMln(effectiveTotals.decRevenueRub) : 'Скрыто'}
          </div>
          <div className="text-[11.5px] text-[#15803D] dark:text-emerald-400 font-medium">
            {!hasFinance
              ? 'Скрыто по роли'
              : isHoldingAllBrandsActive
              ? 'Сводный план всех активных брендов группы'
              : `Цель сценария: ${currentScenario.monthlyTargetMln} млн ₽ / мес`}
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-1 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92]">
            Выкупы и заказы за 2027 год
          </div>
          {(() => {
            const distinctUnits = Array.from(
              new Set(scopedEntries.map((e) => getBrandUnitConfig(e.model).primaryUnit))
            );
            const singleUnit =
              distinctUnits.length === 1
                ? distinctUnits[0]
                : brandFilter !== 'ALL' && distinctUnits.length === 0
                ? getBrandUnitConfig(brandFilter).primaryUnit
                : null;
            const buyoutsLabel = singleUnit
              ? `${effectiveTotals.annualPacks.toLocaleString('ru-RU')} ${singleUnit}`
              : formatGroupedUnitInline(
                  scopedEntries.map((e) => ({
                    unit: getBrandUnitConfig(e.model).primaryUnit,
                    qty: computeModelScenarioMetrics(e.model, e.scenario).annualPacks,
                  }))
                );
            return (
              <>
                <div className="font-mono tabular-nums tracking-[-0.025em] text-xl font-semibold text-[#141413] dark:text-[#F5F4F0] leading-tight">
                  {buyoutsLabel}
                </div>
                <div className="text-[11.5px] text-[#5C5953] dark:text-[#9E9A92]">
                  Заказы (до выкупа):{' '}
                  <strong className="font-mono text-[#15803D] dark:text-emerald-400">
                    {singleUnit
                      ? `${effectiveTotals.annualOrdersPacks.toLocaleString('ru-RU')} ${singleUnit}`
                      : hasFinance
                      ? formatMln(effectiveTotals.annualOrdersRub)
                      : formatGroupedUnitInline(
                          scopedEntries.map((e) => ({
                            unit: getBrandUnitConfig(e.model).primaryUnit,
                            qty: computeModelScenarioMetrics(e.model, e.scenario).annualOrdersPacks,
                          }))
                        )}
                  </strong>
                  {singleUnit && hasFinance ? ` · ${formatMln(effectiveTotals.annualOrdersRub)}` : ''}
                </div>
              </>
            );
          })()}
        </div>

        <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-1 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92]">
            Моделей в матрице
          </div>
          <div className="font-mono tabular-nums tracking-[-0.025em] text-2xl font-semibold text-[#141413] dark:text-[#F5F4F0]">
            {scopedEntries.length} SKU
          </div>
          <div className="text-[11.5px] text-[#5C5953] dark:text-[#9E9A92]">
            {(() => {
              if (!hasFinance) {
                return 'Средний чек: скрыто по роли';
              }
              const distinctUnits = new Set(
                scopedEntries.map((e) => getBrandUnitConfig(e.model).primaryUnit)
              );
              if (distinctUnits.size > 1) {
                return 'Средний чек: по ед. каждого бренда';
              }
              return `Средний чек: ${
                effectiveTotals.annualPacks > 0
                  ? `${Math.round(effectiveTotals.annualRevenueRub / effectiveTotals.annualPacks).toLocaleString('ru-RU')} ₽`
                  : '—'
              }`;
            })()}
          </div>
        </div>
      </section>

      {/* Полноширинная матрица 12 месяцев по всем SKU */}
      <section className="rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-5 md:p-6 space-y-4 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[16px] font-bold text-[#0F172A] dark:text-[#EDF0F7]">
            Помесячная матрица (
            {effectiveUnitMode === 'rub'
              ? 'млн ₽'
              : (() => {
                  const units = Array.from(
                    new Set(scopedEntries.map((e) => getBrandUnitConfig(e.model).primaryUnit))
                  );
                  if (units.length > 1) return 'натуральные ед.';
                  return units[0] || (brandFilter !== 'ALL' ? getBrandUnitConfig(brandFilter).primaryUnit : 'компл.');
                })()}{' '}
            · {visibleEntries.length} SKU)
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as 'default' | 'dec_desc' | 'year_desc' | 'priority'
                )
              }
              className="h-9 px-3 rounded-xl bg-[#F8FAFC] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] hover:border-emerald-500/40 text-[12px] font-semibold text-[#0F172A] dark:text-[#EDF0F7] cursor-pointer"
            >
              <option value="dec_desc">
                {hasFinance ? 'Сортировка: Выручка дек. ↓' : 'Сортировка: Декабрь ↓'}
              </option>
              <option value="year_desc">Сортировка: Год 2027 ↓</option>
              <option value="priority">Сортировка: По приоритету</option>
              <option value="default">Сортировка: По порядку портфеля</option>
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Фильтр по WB, коду или названию..."
              className="h-9 px-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#181D2A] focus:bg-white dark:focus:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] focus:border-emerald-500/50 text-[12.5px] font-medium text-[#0F172A] dark:text-[#EDF0F7] placeholder:text-[#64748B] w-60"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E2E6EE] dark:border-[#222938]">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#F8FAFC] dark:bg-[#181D2A] text-[#64748B] dark:text-[#94A3B8] border-b border-[#E2E6EE] dark:border-[#222938]">
                <th className="py-2.5 px-3 font-bold min-w-[215px] sticky left-0 z-10 bg-[#F8FAFC] dark:bg-[#181D2A] border-r border-[#E2E6EE] dark:border-[#222938]">
                  Артикул / Модель
                </th>
                <th className="py-2.5 px-2 font-bold text-right">Цена</th>
                <th className="py-2.5 px-2 font-bold text-right">% выкупа</th>
                {MONTHS_SHORT_RU.map((m, idx) => (
                  <th
                    key={m}
                    className={`py-2.5 px-2 font-bold text-right ${
                      idx === 11
                        ? 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : ''
                    }`}
                  >
                    {m}
                  </th>
                ))}
                <th className="py-2.5 px-3 font-bold text-right bg-[#F1F5F9] dark:bg-[#1E2536] text-[#0F172A] dark:text-[#EDF0F7]">
                  Год 2027
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F6] dark:divide-[#222938]">
              {visibleEntries.map(({ model: mod, scenario: rowScenario }) => {
                const met = computeModelScenarioMetrics(mod, rowScenario);
                const acting = getActingSkuByWbOrVendor(mod.code, mod.title);
                return (
                  <tr
                    key={mod.id}
                    onClick={() => setEditingModelId(mod.id)}
                    title="Нажмите, чтобы редактировать помесячный план модели"
                    className="group hover:bg-[#F8FAFC] dark:hover:bg-[#181D2A]/80 cursor-pointer transition"
                  >
                    <td className="py-2.5 px-3 sticky left-0 z-10 bg-white dark:bg-[#121620] group-hover:bg-[#F8FAFC] dark:group-hover:bg-[#181D2A] border-r border-[#EEF2F6] dark:border-[#222938]">
                      <div className="font-bold text-[#0F172A] dark:text-[#EDF0F7] truncate max-w-[235px]">
                        {mod.title}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#64748B] dark:text-[#8E9AB0]">
                        {acting ? `WB ${acting.wbSku}` : mod.code} ·{' '}
                        {detectModelBrandPortfolioLabel(mod)}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-[#475569] dark:text-[#94A3B8] whitespace-nowrap">
                      {met.avgRetailPriceRub.toLocaleString('ru-RU')} ₽
                    </td>
                    <td
                      onClick={(e) => e.stopPropagation()}
                      className="py-2 px-2 text-right font-mono whitespace-nowrap"
                    >
                      {canUserEditBrand(currentUser, resolveModelBrandForRbac(mod)) ? (
                        <div className="inline-flex items-center justify-end gap-0.5 rounded-md border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E2536] px-1.5 py-0.5">
                          <BufferedInlineNumberInput
                            min={5}
                            max={100}
                            ariaLabel={`Процент выкупа ${mod.code}`}
                            value={met.buyoutRatePct}
                            onCommit={(nextVal) => {
                              const updated = updateModelBuyoutRatePct(mod, nextVal, {
                                scenarioId: rowScenario.id,
                              });
                              updateModelSpec(updated);
                            }}
                            className="w-10 text-right font-mono text-[11.5px] font-bold text-[#0F172A] dark:text-[#F8FAFC] bg-transparent focus:outline-none"
                          />
                          <span className="text-[10px] font-bold text-[#64748B]">%</span>
                        </div>
                      ) : (
                        <div className="font-mono text-[11.5px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">
                          {met.buyoutRatePct}%
                        </div>
                      )}
                      <div className="text-[9.5px] text-emerald-700 dark:text-emerald-400">
                        ×{met.orderMultiplier.toFixed(2).replace('.', ',')}
                      </div>
                    </td>
                    {MONTHS_SHORT_RU.map((_, mIdx) => {
                      const valRub = met.monthlyRevenuesRub[mIdx] || 0;
                      const valPacks = met.plan.monthlyPacks[mIdx] || 0;
                      return (
                        <td
                          key={mIdx}
                          className={`py-2.5 px-2 text-right font-mono ${
                            mIdx === 11
                              ? 'bg-emerald-500/6 dark:bg-emerald-500/12 font-bold text-emerald-700 dark:text-emerald-300'
                              : valPacks === 0
                              ? 'text-[#CBD5E1] dark:text-[#475569]'
                              : 'text-[#0F172A] dark:text-[#E2E8F0]'
                          }`}
                        >
                          {effectiveUnitMode === 'rub'
                            ? valRub > 0
                              ? (valRub / 1_000_000).toFixed(2).replace('.', ',')
                              : '—'
                            : valPacks > 0
                            ? valPacks.toLocaleString('ru-RU')
                            : '—'}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0F172A] dark:text-[#EDF0F7] bg-[#F8FAFC] dark:bg-[#161C28] whitespace-nowrap">
                      <div>
                        {effectiveUnitMode === 'rub'
                          ? (met.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')
                          : met.annualPacks.toLocaleString('ru-RU')}
                      </div>
                      <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        Зак:{' '}
                        {effectiveUnitMode === 'rub'
                          ? `${(met.annualOrdersRub / 1_000_000).toFixed(2).replace('.', ',')} м`
                          : met.annualOrdersPacks.toLocaleString('ru-RU')}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const distinctUnits = Array.from(
                  new Set(scopedEntries.map((e) => getBrandUnitConfig(e.model).primaryUnit))
                );
                const isMixedPackUnits = distinctUnits.length > 1;
                const singleUnit =
                  distinctUnits[0] ||
                  (brandFilter !== 'ALL' ? getBrandUnitConfig(brandFilter).primaryUnit : 'компл.');
                return (
                  <tr className="bg-[#F8FAFC] dark:bg-[#181D2A] font-bold text-[#0F172A] dark:text-[#EDF0F7] border-t border-[#E2E6EE] dark:border-[#222938]">
                    <td className="py-3 px-3 sticky left-0 z-10 bg-[#F8FAFC] dark:bg-[#181D2A] border-r border-[#E2E6EE] dark:border-[#222938]">
                      ИТОГО ({scopedEntries.length} SKU)
                    </td>
                    <td className="py-3 px-2 text-right">—</td>
                    <td className="py-3 px-2 text-right font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                      {!isMixedPackUnits && effectiveTotals.annualOrdersPacks > 0
                        ? `${Math.round((effectiveTotals.annualPacks / effectiveTotals.annualOrdersPacks) * 100)}%`
                        : hasFinance && effectiveTotals.annualOrdersRub > 0
                        ? `${Math.round((effectiveTotals.annualRevenueRub / effectiveTotals.annualOrdersRub) * 100)}%`
                        : '—'}
                    </td>
                    {MONTHS_SHORT_RU.map((_, mIdx) => (
                      <td
                        key={mIdx}
                        className={`py-3 px-2 text-right font-mono ${
                          mIdx === 11
                            ? 'bg-emerald-500/12 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : ''
                        }`}
                      >
                        {effectiveUnitMode === 'rub'
                          ? (effectiveTotals.monthlyRevRub[mIdx] / 1_000_000)
                              .toFixed(1)
                              .replace('.', ',')
                          : isMixedPackUnits
                          ? '—'
                          : effectiveTotals.monthlyPacks[mIdx].toLocaleString('ru-RU')}
                      </td>
                    ))}
                    <td className="py-3 px-3 text-right font-mono bg-[#F1F5F9] dark:bg-[#1E2536]">
                      {effectiveUnitMode === 'rub' ? (
                        (effectiveTotals.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')
                      ) : isMixedPackUnits ? (
                        <div className="space-y-0.5 text-[10.5px] leading-tight">
                          {groupQuantitiesByPrimaryUnit(
                            scopedEntries.map((e) => ({
                              unit: getBrandUnitConfig(e.model).primaryUnit,
                              qty: computeModelScenarioMetrics(e.model, e.scenario).annualPacks,
                            }))
                          ).map((g) => (
                            <div key={g.unit}>
                              {g.qty.toLocaleString('ru-RU')} {g.unit}
                            </div>
                          ))}
                        </div>
                      ) : (
                        `${effectiveTotals.annualPacks.toLocaleString('ru-RU')} ${singleUnit}`
                      )}
                    </td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// 03 · ЗАКУПКИ: УПРОЩЁННЫЙ 3-ЗОННЫЙ КОНТУР ПО ТЗ MVP (ЗОНА А / ЗОНА Б / ЗОНА В)
// =============================================================================
export function ProcurementContourView() {
  const { currentUser, tasks, navigateTo, notify, brandFilter, setBrandFilter } = usePlatform();
  const {
    models,
    scenarios,
    orderedScenarios,
    currentScenario,
    selectedScenarioId,
    setSelectedScenarioId,
    selectedScenarioByBrand,
    includeGroupPortfolioInS1,
    setIncludeGroupPortfolioInS1,
    scenarioAllEligibleModels,
    eligibleModels,
    totals,
    updateModelSpec,
    updateBatchFactoryTerms,
    launchStarterCabinet,
  } = useLiveScenarioPortfolio();

  const [wavesCalendarOpen, setWavesCalendarOpen] = useState(false);
  const [factoryTermsPanelOpen, setFactoryTermsPanelOpen] = useState(false);
  const [holdingScopeMode, setHoldingScopeMode] = useState<boolean>(true);

  useEffect(() => {
    if (brandFilter === 'ALL') {
      setHoldingScopeMode(true);
    }
  }, [brandFilter]);

  const [subTab, setSubTab] = useState<'batches' | 'crm'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('borners_procurement_subtab_v1');
        if (saved === 'batches' || saved === 'crm') return saved;
      } catch {
        // ignore
      }
    }
    return 'batches';
  });
  const [selectedSkuId, setSelectedSkuId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('borners_procurement_selected_sku_v1');
        if (saved) return saved;
      } catch {
        // ignore
      }
    }
    return 'scen-brn-001-sc';
  });
  const [skuSearch, setSkuSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [expandedSummaryModelIds, setExpandedSummaryModelIds] = useState<string[]>([]);
  const [scenarioDrawerTab, setScenarioDrawerTab] = useState<
    'none' | 'investment' | 'brands' | 'skus'
  >('skus');
  const [initialCashMln, setInitialCashMln] = useState<number>(() => {
    const saved = readStoredFinanceContourParams();
    return typeof saved.initialCashMln === 'number' ? saved.initialCashMln : 0;
  });
  const [wbLagMonths, setWbLagMonths] = useState<number>(() => {
    const saved = readStoredFinanceContourParams();
    return typeof saved.wbLagMonths === 'number' ? saved.wbLagMonths : 0;
  });

  useEffect(() => {
    writeStoredFinanceContourParams({ initialCashMln, wbLagMonths });
  }, [initialCashMln, wbLagMonths]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncParams = () => {
      const saved = readStoredFinanceContourParams();
      if (typeof saved.initialCashMln === 'number') {
        setInitialCashMln((prev) => (prev === saved.initialCashMln ? prev : saved.initialCashMln!));
      }
      if (typeof saved.wbLagMonths === 'number') {
        setWbLagMonths((prev) => (prev === saved.wbLagMonths ? prev : saved.wbLagMonths!));
      }
    };
    window.addEventListener('borners-finance-params-changed', syncParams);
    window.addEventListener('storage', syncParams);
    return () => {
      window.removeEventListener('borners-finance-params-changed', syncParams);
      window.removeEventListener('storage', syncParams);
    };
  }, []);

  const hasCost = canUserViewCostPrice(currentUser);
  const hasFinance = canUserViewFinance(currentUser);
  const auditAuthor = currentUser?.fullName || 'Владелец';
  const formatCostMln = (rub: number) => (hasCost ? formatMln(rub) : 'Скрыто');
  const formatProfitMln = (rub: number) =>
    hasCost && hasFinance ? `+${formatMln(rub)}` : 'Скрыто';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const requested = window.sessionStorage.getItem('borners_open_procurement_view_mode');
      if (requested === 'summary') {
        setSubTab('batches');
        setWavesCalendarOpen(false);
        setScenarioDrawerTab('skus');
        setHoldingScopeMode(true);
        window.sessionStorage.removeItem('borners_open_procurement_view_mode');
      }
    } catch {
      // ignore
    }
    const onOpenSummary = () => {
      setSubTab('batches');
      setWavesCalendarOpen(false);
      setScenarioDrawerTab('skus');
      setHoldingScopeMode(true);
    };
    window.addEventListener('borners-open-procurement-summary', onOpenSummary);
    return () => window.removeEventListener('borners-open-procurement-summary', onOpenSummary);
  }, []);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('borners_procurement_subtab_v1', subTab);
        window.localStorage.setItem('borners_procurement_selected_sku_v1', selectedSkuId);
      } catch {
        // ignore
      }
    }
  }, [subTab, selectedSkuId]);

  const openTasksCount = useMemo(
    () => tasks.filter((t) => !t.isArchived && t.status !== 'Done').length,
    [tasks]
  );

  const isHoldingAllBrandsActive = brandFilter === 'ALL' && holdingScopeMode;

  const multiBrandSummary = useMemo(
    () =>
      computeMultiBrandPortfolioSummary(models, scenarios, selectedScenarioByBrand, {
        initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
        settlementLagMonths: wbLagMonths < 0 ? null : wbLagMonths,
        wbPayoutScheduleSpecified: wbLagMonths >= 0,
      }),
    [models, scenarios, selectedScenarioByBrand, initialCashMln, wbLagMonths]
  );

  const scopedModelEntries = useMemo(() => {
    if (!isHoldingAllBrandsActive) {
      return eligibleModels.map((m) => ({ model: m, scenario: currentScenario }));
    }
    const list = buildHoldingScopedModelEntries(
      models,
      scenarios,
      selectedScenarioByBrand,
      currentScenario,
      multiBrandSummary
    );
    return list.length > 0
      ? list
      : eligibleModels.map((m) => ({ model: m, scenario: currentScenario }));
  }, [
    isHoldingAllBrandsActive,
    eligibleModels,
    currentScenario,
    multiBrandSummary,
    selectedScenarioByBrand,
    scenarios,
    models,
  ]);

  const procData = useMemo(() => {
    let approvedCount = 0;
    let approvedPacks = 0;
    let approvedUnits = 0;
    let approvedRub = 0;
    let totalOpeningPacks = 0;
    let recPacks = 0;
    let recUnits = 0;
    let recBudgetRub = 0;
    let annualDemandPacks = 0;
    let annualDemandUnits = 0;
    let firstWavePacks = 0;
    let firstWaveUnits = 0;
    let firstWaveBudgetRub = 0;
    let firstWavePrepaymentRub = 0;

    const approvedOrdersFlat: {
      model: ScenarioModelSpec;
      po: ApprovedPurchaseOrder;
    }[] = [];

    const perSku = scopedModelEntries.map(({ model: rawM, scenario: modelScen }) => {
      const m = ensureModelUnifiedV11(rawM);
      const plan = computeProcurementPlan(m, modelScen);
      const confirmedPos = plan.approvedOrders.filter(
        (o) => o.confirmedByFactory !== false
      );
      approvedCount += confirmedPos.length;
      approvedPacks += plan.totalApprovedReceiptsPacks;
      approvedUnits += plan.totalApprovedReceiptsUnits;
      approvedRub += confirmedPos.reduce((s, o) => s + o.totalOrderRub, 0);
      totalOpeningPacks += plan.netOpeningAvailablePacks;
      for (const po of plan.approvedOrders) {
        approvedOrdersFlat.push({ model: m, po });
      }
      recPacks += plan.totalRecommendedPacks;
      recUnits += plan.totalRecommendedUnits;
      recBudgetRub += plan.totalRecommendedBudgetRub || 0;
      annualDemandPacks += plan.annualDemandPacks;
      annualDemandUnits += plan.annualDemandUnits;

      // Расчёт 1-й стартовой волны инвестиций (Партия №1 / Q1) по каждой модели
      const firstDraft = plan.recommendedBatches[0];
      const earliestPo = [...confirmedPos].sort(
        (a, b) => a.arrivalMonthIdx - b.arrivalMonthIdx
      )[0];
      if (earliestPo && (!firstDraft || earliestPo.arrivalMonthIdx <= firstDraft.firstCoveredMonthIdx)) {
        const prepayPct = m.sharedSupplyAndFact?.factoryParams.prepaymentPct ?? 30;
        firstWavePacks += earliestPo.packsQty;
        firstWaveUnits += earliestPo.packsQty * earliestPo.unitsInPack;
        firstWaveBudgetRub += earliestPo.totalOrderRub;
        firstWavePrepaymentRub += Math.round((earliestPo.totalOrderRub * prepayPct) / 100);
      } else if (firstDraft) {
        firstWavePacks += firstDraft.recommendedPacks;
        firstWaveUnits += firstDraft.physicalUnitsQty;
        firstWaveBudgetRub += firstDraft.estimatedTotalRub;
        firstWavePrepaymentRub += firstDraft.prepaymentRub;
      }

      return { model: m, plan, scenario: modelScen };
    });

    const totalScenarioPacks = approvedPacks + recPacks;
    const totalScenarioUnits = approvedUnits + recUnits;
    const totalScenarioBudgetRub = approvedRub + recBudgetRub;

    return {
      approvedCount,
      approvedPacks,
      approvedUnits,
      approvedRub,
      totalOpeningPacks,
      approvedOrdersFlat,
      recPacks,
      recUnits,
      recBudgetRub,
      annualDemandPacks,
      annualDemandUnits,
      firstWavePacks,
      firstWaveUnits,
      firstWaveBudgetRub,
      firstWavePrepaymentRub,
      totalScenarioPacks,
      totalScenarioUnits,
      totalScenarioBudgetRub,
      perSku,
    };
  }, [scopedModelEntries]);

  const singleScenarioInvestmentSummary = useMemo(
    () =>
      computeScenarioInvestmentSummary(eligibleModels, currentScenario, {
        initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
        settlementLagMonths: wbLagMonths < 0 ? null : wbLagMonths,
        wbPayoutScheduleSpecified: wbLagMonths >= 0,
      }),
    [eligibleModels, currentScenario, initialCashMln, wbLagMonths]
  );

  const investmentSummary = useMemo(() => {
    if (!isHoldingAllBrandsActive) return singleScenarioInvestmentSummary;
    const gt = multiBrandSummary.groupTotal;
    return {
      ...singleScenarioInvestmentSummary,
      modelsCount: gt.modelsCount,
      annualRevenueRub: gt.annualRevenueRub,
      decemberRevenueRub: gt.decemberRevenueRub,
      annualDemandPacks: procData.annualDemandPacks,
      annualDemandUnits: procData.annualDemandUnits,
      totalProcurementPacks: procData.totalScenarioPacks,
      totalProcurementUnits: procData.totalScenarioUnits,
      totalProcurementBudgetRub: gt.totalProcurementBudgetRub,
      annualSoldGoodsCostRub: gt.annualSoldGoodsCostRub,
      annualEstimatedOperatingProfitRub: gt.annualEstimatedOperatingProfitRub,
      firstWavePacks: procData.firstWavePacks,
      firstWaveUnits: procData.firstWaveUnits,
      firstWaveStartBudgetRub: gt.firstWaveStartBudgetRub,
      firstWavePrepaymentRub: gt.firstWavePrepaymentRub,
      firstWaveBalanceRub: Math.max(0, gt.firstWaveStartBudgetRub - gt.firstWavePrepaymentRub),
      peakWorkingCapitalRub: gt.peakWorkingCapitalRub,
      netOwnMoneyRequiredRub: gt.netOwnMoneyRequiredRub,
      verifiedOwnMoneyRequiredRub: gt.verifiedOwnMoneyRequiredRub,
      peakMonthIdx: gt.peakMonthIdx,
      peakMonthLabel: gt.peakMonthLabel,
      peakPhase: gt.peakPhase,
      peakPhaseLabelRu: gt.peakPhaseLabelRu,
      peakWindowHumanRu: gt.peakWindowHumanRu,
      monthsInDeficitCount: gt.monthsInDeficitCount,
      openingBalanceAtPeakMonthRub: gt.openingBalanceAtPeakMonthRub,
      prepayInPeakMonthRub: gt.prepayInPeakMonthRub,
      balancePayInPeakMonthRub: gt.balancePayInPeakMonthRub,
      wbInflowInPeakMonthRub: gt.wbInflowInPeakMonthRub,
      endOfPeakMonthBalanceRub: gt.endOfPeakMonthBalanceRub,
      selfFundingMonthIdx: gt.selfFundingMonthIdx,
      selfFundingMonthLabel: gt.selfFundingMonthLabel,
      yearEndCashBalanceRub: gt.yearEndCashBalanceRub,
      monthlyRows: gt.monthlyRows,
    };
  }, [
    isHoldingAllBrandsActive,
    singleScenarioInvestmentSummary,
    multiBrandSummary.groupTotal,
    procData,
  ]);

  const wavesSummary = useMemo(
    () =>
      computePortfolioProcurementWavesSummary(
        scopedModelEntries,
        investmentSummary.monthlyRows,
        currentScenario.year || 2027
      ),
    [scopedModelEntries, investmentSummary.monthlyRows, currentScenario.year]
  );

  const brandsReport = useMemo(() => {
    const sourceModels = models.length > 0 ? models : scenarioAllEligibleModels;
    const effectiveSelectedByBrand = isHoldingAllBrandsActive
      ? selectedScenarioByBrand
      : { ...selectedScenarioByBrand, [brandFilter]: currentScenario.id };
    const baseReport = computeGroupBrandsInvestmentReport(sourceModels, currentScenario, {
      initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
      settlementLagMonths: wbLagMonths < 0 ? null : wbLagMonths,
      wbPayoutScheduleSpecified: wbLagMonths >= 0,
      allScenarios: scenarios,
      selectedScenarioByBrand: effectiveSelectedByBrand,
    });
    if (!isHoldingAllBrandsActive) {
      if (brandFilter !== 'ALL') {
        const scopedRows = baseReport.brands.filter((b) => b.brandCode === brandFilter);
        const row = scopedRows[0];
        return {
          brands: scopedRows,
          groupTotal: row
            ? {
                ...baseReport.groupTotal,
                modelsCount: row.modelsCount,
                annualRevenueRub: row.annualRevenueRub,
                decemberRevenueRub: row.decemberRevenueRub,
                annualDemandPacks: row.annualDemandPacks,
                totalProcurementPacks: row.totalProcurementPacks,
                totalProcurementUnits: row.totalProcurementUnits,
                totalProcurementBudgetRub: row.totalProcurementBudgetRub,
                annualSoldGoodsCostRub: row.annualSoldGoodsCostRub,
                annualEstimatedOperatingProfitRub: row.annualEstimatedOperatingProfitRub,
                firstWaveStartBudgetRub: row.firstWaveStartBudgetRub,
                firstWavePrepaymentRub: row.firstWavePrepaymentRub,
                peakWorkingCapitalRub: row.peakWorkingCapitalRub,
                netOwnMoneyRequiredRub: row.peakWorkingCapitalRub,
                peakMonthIdx: row.peakMonthIdx,
                peakMonthLabel: row.peakMonthLabel,
                selfFundingMonthLabel: row.selfFundingMonthLabel,
              }
            : baseReport.groupTotal,
        };
      }
      return baseReport;
    }
    return {
      brands: multiBrandSummary.brands.map((mb) => ({
        brandCode: mb.brandCode,
        brandTitle: mb.displayCode,
        modelsCount: mb.modelsCount,
        decemberRevenueRub: mb.decemberRevenueRub,
        annualRevenueRub: mb.annualRevenueRub,
        annualDemandPacks: mb.totalProcurementQuantity,
        totalProcurementPacks: mb.totalProcurementQuantity,
        totalProcurementUnits: mb.totalProcurementSecondaryQuantity,
        firstWaveStartBudgetRub: mb.firstWaveStartBudgetRub,
        firstWavePrepaymentRub: mb.firstWavePrepaymentRub,
        peakWorkingCapitalRub: mb.peakWorkingCapitalRub,
        peakMonthIdx: mb.peakMonthIdx,
        peakMonthLabel: mb.peakMonthLabel,
        peakPhaseLabelRu: mb.peakPhaseLabelRu,
        selfFundingMonthLabel: mb.selfFundingMonthLabel,
        totalProcurementBudgetRub: mb.totalProcurementBudgetRub,
        annualSoldGoodsCostRub: mb.annualSoldGoodsCostRub,
        annualEstimatedOperatingProfitRub: mb.annualEstimatedOperatingProfitRub,
        operatingMarginPct:
          mb.annualRevenueRub > 0
            ? Math.round((mb.annualEstimatedOperatingProfitRub / mb.annualRevenueRub) * 1000) / 10
            : 0,
      })),
      groupTotal: {
        ...baseReport.groupTotal,
        modelsCount: multiBrandSummary.groupTotal.modelsCount,
        annualRevenueRub: multiBrandSummary.groupTotal.annualRevenueRub,
        decemberRevenueRub: multiBrandSummary.groupTotal.decemberRevenueRub,
        annualDemandPacks: procData.annualDemandPacks,
        annualDemandUnits: procData.annualDemandUnits,
        totalProcurementPacks: procData.totalScenarioPacks,
        totalProcurementUnits: procData.totalScenarioUnits,
        totalProcurementBudgetRub: multiBrandSummary.groupTotal.totalProcurementBudgetRub,
        annualSoldGoodsCostRub: multiBrandSummary.groupTotal.annualSoldGoodsCostRub,
        annualEstimatedOperatingProfitRub:
          multiBrandSummary.groupTotal.annualEstimatedOperatingProfitRub,
        firstWavePacks: procData.firstWavePacks,
        firstWaveUnits: procData.firstWaveUnits,
        firstWaveStartBudgetRub: multiBrandSummary.groupTotal.firstWaveStartBudgetRub,
        firstWavePrepaymentRub: multiBrandSummary.groupTotal.firstWavePrepaymentRub,
        peakWorkingCapitalRub: multiBrandSummary.groupTotal.peakWorkingCapitalRub,
        netOwnMoneyRequiredRub: multiBrandSummary.groupTotal.netOwnMoneyRequiredRub,
        peakMonthIdx: multiBrandSummary.groupTotal.peakMonthIdx,
        peakMonthLabel: multiBrandSummary.groupTotal.peakMonthLabel,
        selfFundingMonthLabel: multiBrandSummary.groupTotal.selfFundingMonthLabel,
      },
    };
  }, [
    isHoldingAllBrandsActive,
    brandFilter,
    models,
    scenarios,
    selectedScenarioByBrand,
    multiBrandSummary,
    procData,
    scenarioAllEligibleModels,
    currentScenario,
    initialCashMln,
    wbLagMonths,
  ]);

  const activeSkuModel = useMemo(() => {
    const pool = scopedModelEntries.map((e) => e.model);
    const found =
      pool.find((m) => m.id === selectedSkuId) ||
      pool.find((m) => m.code.toUpperCase() === 'BRN-001-SC') ||
      pool[0];
    return found ? ensureModelUnifiedV11(found) : null;
  }, [scopedModelEntries, selectedSkuId]);

  const filteredSkus = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    if (!q) return procData.perSku;
    return procData.perSku.filter(({ model }) => {
      const acting = getActingSkuByWbOrVendor(model.code, model.title);
      return (
        model.code.toLowerCase().includes(q) ||
        model.title.toLowerCase().includes(q) ||
        (acting?.wbSku || '').toLowerCase().includes(q)
      );
    });
  }, [procData.perSku, skuSearch]);

  const getNormalizedProcurementCategoryLabel = (m: ScenarioModelSpec): string => {
    if (m.categoryLabel && m.categoryLabel.trim().length > 0) {
      return m.categoryLabel.trim();
    }
    const brand = detectModelBrandPortfolioLabel(m);
    if (brand === 'Подтвердить бренд') return 'FUKAI';
    return brand || 'Основная линейка';
  };

  const categoryGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        categoryLabel: string;
        modelsCount: number;
        sizesCount: number;
        annualDemandPacks: number;
        soldCogsRub: number;
        totalOrderPacks: number;
        totalOrderUnits: number;
        totalBudgetRub: number;
        firstWavePacks: number;
        firstWaveBudgetRub: number;
        firstWavePrepayRub: number;
        unitSet: Set<string>;
      }
    >();

    for (const { model: m, plan } of procData.perSku) {
      const cat = getNormalizedProcurementCategoryLabel(m);
      const cur = map.get(cat) || {
        categoryLabel: cat,
        modelsCount: 0,
        sizesCount: 0,
        annualDemandPacks: 0,
        soldCogsRub: 0,
        totalOrderPacks: 0,
        totalOrderUnits: 0,
        totalBudgetRub: 0,
        firstWavePacks: 0,
        firstWaveBudgetRub: 0,
        firstWavePrepayRub: 0,
        unitSet: new Set<string>(),
      };
      const prodProf = getModelProductionProfileFull(m);
      const sizeCount =
        m.liskaniSizeVariants && m.liskaniSizeVariants.length > 0
          ? m.liskaniSizeVariants.length
          : prodProf.sizes.length || 5;
      cur.unitSet.add(getBrandUnitConfig(m).primaryUnit);
      const confirmedPos = plan.approvedOrders.filter((o) => o.confirmedByFactory !== false);
      const poPacks = plan.totalApprovedReceiptsPacks;
      const poUnits = plan.totalApprovedReceiptsUnits;
      const poRub = confirmedPos.reduce((s, o) => s + o.totalOrderRub, 0);
      const modelOrderPacks = poPacks + plan.totalRecommendedPacks;
      const modelOrderUnits = poUnits + plan.totalRecommendedUnits;
      const modelBudgetRub = poRub + (plan.totalRecommendedBudgetRub || 0);
      const modelSoldCogsRub =
        m.liskaniSizeVariants && m.liskaniSizeVariants.length > 0
          ? m.liskaniSizeVariants.reduce(
              (acc, sv) => acc + sv.annualBuyoutsUnits * sv.unitCostRub,
              0
            )
          : plan.annualBuyoutsPacks * (m.unitCostRub || 0);

      const firstDraft = plan.recommendedBatches[0];
      const earliestPo = [...confirmedPos].sort(
        (a, b) => a.arrivalMonthIdx - b.arrivalMonthIdx
      )[0];
      let w1Packs = 0;
      let w1Rub = 0;
      let w1Prepay = 0;
      if (earliestPo && (!firstDraft || earliestPo.arrivalMonthIdx <= firstDraft.firstCoveredMonthIdx)) {
        const prepayPct = m.sharedSupplyAndFact?.factoryParams.prepaymentPct ?? 30;
        w1Packs = earliestPo.packsQty;
        w1Rub = earliestPo.totalOrderRub;
        w1Prepay = Math.round((earliestPo.totalOrderRub * prepayPct) / 100);
      } else if (firstDraft) {
        w1Packs = firstDraft.recommendedPacks;
        w1Rub = firstDraft.estimatedTotalRub;
        w1Prepay = firstDraft.prepaymentRub;
      }

      cur.modelsCount += 1;
      cur.sizesCount += sizeCount;
      cur.annualDemandPacks += plan.annualDemandPacks;
      cur.soldCogsRub += modelSoldCogsRub;
      cur.totalOrderPacks += modelOrderPacks;
      cur.totalOrderUnits += modelOrderUnits;
      cur.totalBudgetRub += modelBudgetRub;
      cur.firstWavePacks += w1Packs;
      cur.firstWaveBudgetRub += w1Rub;
      cur.firstWavePrepayRub += w1Prepay;
      map.set(cat, cur);
    }

    return Array.from(map.values()).sort((a, b) => b.totalBudgetRub - a.totalBudgetRub);
  }, [procData.perSku]);

  const filteredSummarySkus = useMemo(() => {
    if (selectedCategoryFilter === 'ALL') return filteredSkus;
    return filteredSkus.filter(({ model: m }) => {
      const cat = getNormalizedProcurementCategoryLabel(m);
      return cat === selectedCategoryFilter;
    });
  }, [filteredSkus, selectedCategoryFilter]);

  const scopeUnitInfo = useMemo(() => {
    const distinct = Array.from(
      new Set(procData.perSku.map((item) => getBrandUnitConfig(item.model).primaryUnit))
    );
    const isMixed = distinct.length > 1;
    const primaryUnit =
      !isMixed && distinct.length === 1
        ? distinct[0]
        : brandFilter !== 'ALL'
        ? getBrandUnitConfig(brandFilter).primaryUnit
        : 'ед.';
    const secondaryUnit =
      !isMixed && procData.perSku.length > 0
        ? getBrandUnitConfig(procData.perSku[0].model).secondaryUnit
        : brandFilter !== 'ALL'
        ? getBrandUnitConfig(brandFilter).secondaryUnit
        : 'ед.';
    return { isMixed, primaryUnit, secondaryUnit };
  }, [procData.perSku, brandFilter]);

  const editableScopedModelIds = useMemo(
    () =>
      scopedModelEntries
        .filter((e) => canUserEditBrand(currentUser, resolveModelBrandForRbac(e.model)))
        .map((e) => e.model.id),
    [scopedModelEntries, currentUser]
  );
  const canEditAnyScopedModel = editableScopedModelIds.length > 0;

  const handleExportFactoryOrderCsv = (mode: 'all' | 'first_wave' = 'all') => {
    const modelsToExport = scopedModelEntries.map((e) => e.model);
    const csv = serializeScenarioFactoryOrdersToCsv(
      modelsToExport,
      currentScenario,
      mode,
      { canViewCostPrice: hasCost }
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      mode === 'first_wave'
        ? `BORNERS_Zakaz_Fabrike_Start_Q1_Scenario_${currentScenario.id}.csv`
        : `BORNERS_Zakaz_Fabrike_2027_Scenario_${currentScenario.id}.csv`;
    if (document.body) {
      document.body.appendChild(a);
    }
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    notify(
      'success',
      mode === 'first_wave'
        ? `Выгружен заказ фабрике на 1-ю волну (Q1) (${modelsToExport.length} мод.)`
        : `Выгружена спецификация заказа фабрике (${modelsToExport.length} мод.)`
    );
  };

  const activeSkuIndex = useMemo(() => {
    if (!activeSkuModel) return 0;
    const idx = filteredSkus.findIndex((item) => item.model.id === activeSkuModel.id);
    return idx >= 0 ? idx : 0;
  }, [filteredSkus, activeSkuModel]);

  const handleStepSku = (delta: number) => {
    if (filteredSkus.length === 0) return;
    const nextIdx = (activeSkuIndex + delta + filteredSkus.length) % filteredSkus.length;
    setSelectedSkuId(filteredSkus[nextIdx].model.id);
  };

  return (
    <div className="space-y-4 pb-16">
      {/* ЕДИНАЯ ОДНОСТРОЧНАЯ ПАНЕЛЬ НАВИГАЦИИ РАЗДЕЛА 03 · ЗАКУПКИ (В стиле Peakly — строго один фокус внимания на экране) */}
      <div className="rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
        {/* Левая часть: 4 взаимоисключающих режима (Сводная детализация всех SKU / 4 волны и кэшфлоу / По товару / Задачи CRM) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap rounded-xl bg-[#F1F5F9] dark:bg-[#181D2A] p-1 text-xs font-medium gap-0.5">
            <button
              type="button"
              onClick={() => {
                setSubTab('batches');
                setWavesCalendarOpen(false);
                setScenarioDrawerTab('skus');
              }}
              className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                subTab === 'batches' && scenarioDrawerTab === 'skus'
                  ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
              }`}
            >
              Все SKU · Детализация закупок ({procData.perSku.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setSubTab('batches');
                setWavesCalendarOpen(true);
                setScenarioDrawerTab('investment');
              }}
              className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                subTab === 'batches' && (wavesCalendarOpen || scenarioDrawerTab === 'investment' || scenarioDrawerTab === 'brands')
                  ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
              }`}
            >
              4 волны и сводка ({formatCostMln(investmentSummary.totalProcurementBudgetRub)})
            </button>

            <button
              type="button"
              onClick={() => {
                setSubTab('batches');
                setWavesCalendarOpen(false);
                setScenarioDrawerTab('none');
              }}
              className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                subTab === 'batches' && !wavesCalendarOpen && scenarioDrawerTab === 'none'
                  ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
              }`}
            >
              По товару ({filteredSkus.length > 0 ? `${activeSkuIndex + 1}/${filteredSkus.length}` : eligibleModels.length})
            </button>

            <button
              type="button"
              onClick={() => {
                setSubTab('crm');
                setWavesCalendarOpen(false);
                setScenarioDrawerTab('none');
              }}
              className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                subTab === 'crm'
                  ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
              }`}
            >
              Задачи CRM ({openTasksCount})
            </button>
          </div>
        </div>

        {/* Правая часть: Сценарии + Фильтр бренда + Экспорт */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {brandFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setBrandFilter('ALL')}
              className="h-7.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-[11.5px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer inline-flex items-center gap-1.5"
              title="Сбросить фильтр бренда и показать все модели сценария"
            >
              <span>{brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter}</span>
              <span className="font-bold">×</span>
            </button>
          )}

          {subTab === 'batches' && (
            <div className="inline-flex flex-wrap items-center gap-0.5 rounded-xl bg-[#F1F5F9] dark:bg-[#181D2A] p-1">
              <button
                type="button"
                onClick={() => {
                  setBrandFilter('ALL');
                  setHoldingScopeMode(true);
                  setSelectedCategoryFilter('ALL');
                }}
                className={`h-7 px-2.5 rounded-lg text-[11.5px] font-medium transition cursor-pointer ${
                  isHoldingAllBrandsActive
                    ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
                }`}
              >
                Все бренды ({multiBrandSummary.groupTotal.modelsCount})
              </button>
              {orderedScenarios.map((sc) => {
                const active = !isHoldingAllBrandsActive && sc.id === selectedScenarioId;
                const ownerNorm = sc.ownerBrandCode
                  ? normalizePortfolioBrandCode(sc.ownerBrandCode)
                  : null;
                const shortTitle =
                  sc.id === 100
                    ? 'Исходный'
                    : sc.id === 105 || sc.id === 202705
                    ? hasFinance
                      ? 'LISKANI · 500 млн'
                      : 'LISKANI'
                    : sc.id === 202706
                    ? hasFinance
                      ? 'AKUSHA · 105,8 млн'
                      : 'AKUSHA'
                    : ownerNorm && ownerNorm !== 'ALL' && ownerNorm !== 'BORNERS'
                    ? hasFinance
                      ? `${sc.title} · ${sc.monthlyTargetMln} млн`
                      : sc.title
                    : hasFinance
                    ? `№${sc.id} · ${sc.monthlyTargetMln} млн`
                    : `Сценарий №${sc.id}`;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      setHoldingScopeMode(false);
                      setSelectedCategoryFilter('ALL');
                      if (sc.id === 105 || sc.id === 202705 || ownerNorm === 'LISKANI') {
                        setBrandFilter('LISKANI');
                        setSelectedScenarioId(sc.id, 'LISKANI');
                      } else if (sc.id === 202706 || ownerNorm === 'AKUSHA') {
                        setBrandFilter('AKUSHA');
                        setSelectedScenarioId(sc.id, 'AKUSHA');
                      } else if (ownerNorm && ownerNorm !== 'ALL') {
                        setBrandFilter(ownerNorm);
                        setSelectedScenarioId(sc.id, ownerNorm);
                      } else if (brandFilter === 'LISKANI' || brandFilter === 'AKUSHA') {
                        setBrandFilter('BORNERS');
                        setSelectedScenarioId(sc.id, 'BORNERS');
                      } else if (brandFilter !== 'ALL') {
                        setSelectedScenarioId(sc.id, brandFilter);
                      } else {
                        setSelectedScenarioId(sc.id);
                      }
                    }}
                    className={`h-7 px-2.5 rounded-lg text-[11.5px] font-medium transition cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-xs'
                        : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
                    }`}
                  >
                    {shortTitle}
                  </button>
                );
              })}
            </div>
          )}

          {subTab === 'batches' && scopedModelEntries.length > 0 && (
            <button
              type="button"
              onClick={() => handleExportFactoryOrderCsv('all')}
              className="h-8 rounded-lg border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] px-3 text-[11.5px] font-semibold text-[#0F172A] dark:text-[#EDF0F7] hover:bg-[#F8FAFC] cursor-pointer"
              title="Скачать таблицу заказа фабрике в Excel/CSV с размерами, суммами, авансами и датами"
            >
              Экспорт CSV
            </button>
          )}
        </div>
      </div>

      {subTab === 'crm' ? (
        <RoadmapTasksView />
      ) : scopedModelEntries.length === 0 ? (
        /* ПУСТОЕ СОСТОЯНИЕ, ЕСЛИ В ВЫБРАННОМ СЦЕНАРИИ НЕТ МОДЕЛЕЙ ТЕКУЩЕГО БРЕНДА (например, выбран НА ТЕЛЕ в Исходном плане) */
        <div className="rounded-xl border border-[#E4E1DA] bg-white p-6 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
          <div className="max-w-2xl space-y-3">
            <span className="inline-flex items-center rounded-md bg-[#FAF9F6] border border-[#E4E1DA] px-2.5 py-1 font-mono text-[10.5px] font-medium uppercase tracking-wider text-[#5C5953]">
              Фильтр бренда: {brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter}
            </span>
            <h3 className="text-[18px] font-semibold text-[#141413]">
              В сценарии «{currentScenario.title}» нет моделей бренда «
              {brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter}»
            </h3>
            <p className="text-[13.5px] leading-relaxed text-[#5C5953]">
              {hasFinance
                ? 'В «Исходном плане» (7 базовых артикулов WB) и базовом «Сценарии №1» рассчитывается основная линейка BORNERS. Модели женской и базовой линейки «НА ТЕЛЕ» включаются в расчёт начиная со Сценария №2 (150 млн ₽/мес) и Сценария №3 (200 млн ₽/мес).'
                : 'В «Исходном плане» (7 базовых артикулов WB) и базовом «Сценарии №1» рассчитывается основная линейка BORNERS. Модели женской и базовой линейки «НА ТЕЛЕ» включаются в расчёт начиная со Сценария №2 и Сценария №3.'}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => navigateTo('product-catalog', { brandId: brandFilter })}
                className="h-9.5 rounded-lg bg-[#141413] dark:bg-[#F5F4F0] px-4 text-[12.5px] font-medium text-white dark:text-[#141413] hover:opacity-90 transition-colors cursor-pointer"
              >
                + Добавить в Каталоге
              </button>
              <button
                type="button"
                onClick={() => navigateTo('product-lab', { brandId: brandFilter })}
                className="h-9.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] border border-[#E4E1DA] px-4 text-[12.5px] font-medium text-[#141413] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FlaskConical className="h-3.5 w-3.5 text-[#5C5953]" strokeWidth={1.5} />
                <span>Из Лаборатории R&D</span>
              </button>
              {(brandFilter === 'AKUSHA' ||
                brandFilter === 'LISKANI' ||
                brandFilter === 'NA_TELE') &&
                canUserEditBrand(currentUser, brandFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    const res = launchStarterCabinet(
                      brandFilter as 'AKUSHA' | 'LISKANI' | 'NA_TELE'
                    );
                    notify(
                      'success',
                      `Кабинет ${brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter} запущен (${res.addedCount} SKU)`
                    );
                  }}
                  className="h-9.5 rounded-lg bg-[#141413] hover:bg-[#282724] px-4 text-[12.5px] font-medium text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>Запустить стартовую матрицу (3 SKU)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setBrandFilter('ALL')}
                className="h-9.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] border border-[#E4E1DA] px-4 text-[12.5px] font-medium text-[#141413] transition-colors cursor-pointer"
              >
                Показать все бренды ({currentScenario.title.split('·')[0].trim()})
              </button>
              {selectedScenarioId !== 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedScenarioId(2, brandFilter !== 'ALL' ? brandFilter : undefined);
                  }}
                  className="h-9.5 rounded-lg border border-[#E4E1DA] bg-white px-4 text-[12.5px] font-medium text-[#141413] hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                >
                  {hasFinance
                    ? 'Переключить на Сценарий №2 · 150 млн (с линейкой НА ТЕЛЕ)'
                    : 'Переключить на Сценарий №2 (с линейкой НА ТЕЛЕ)'}
                </button>
              )}
              {selectedScenarioId === 1 && !includeGroupPortfolioInS1 && (
                <button
                  type="button"
                  onClick={() => setIncludeGroupPortfolioInS1(true)}
                  className="h-9.5 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3.5 text-[12px] font-medium text-[#141413] hover:bg-[#EFECE6] transition-colors cursor-pointer"
                >
                  Подключить портфель группы в Сценарии №1
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ПЛАТЁЖНЫЙ КАЛЕНДАРЬ 4 ВОЛН ЗАКУПОК 2027 (РЕАЛЬНЫЕ КВАРТАЛЬНЫЕ ПАРТИИ И PO БЕЗ УСЛОВНЫХ ПРОПОРЦИЙ) */}
          {wavesCalendarOpen && (
            <section className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 sm:p-5 space-y-4 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-semibold text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-[#5C5953] dark:text-[#9E9A92] shrink-0" strokeWidth={1.5} />
                    <span>
                      Платёжный календарь 4 реальных волн закупок {currentScenario.year || 2027} · Авансы {wavesSummary.avgPrepaymentPct}%, доплаты {100 - wavesSummary.avgPrepaymentPct}% и реинвест с WB
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[#5C5953] dark:text-[#9E9A92]">
                    Годовой бюджет закупок:{' '}
                    <strong className="font-mono text-[#141413] dark:text-[#F5F4F0]">
                      {formatCostMln(wavesSummary.totalBudgetRub)}
                    </strong>{' '}
                    ({wavesSummary.totalPacks.toLocaleString('ru-RU')} {scopeUnitInfo.primaryUnit} · утв. PO: {wavesSummary.totalApprovedPosCount}, план: {wavesSummary.totalDraftBatchesCount}) · Пик своих денег:{' '}
                    <strong className="font-mono text-[#B91C1C] dark:text-rose-400">
                      {!hasCost || !hasFinance
                        ? 'Скрыто'
                        : wbLagMonths < 0
                        ? 'Лаг WB не задан'
                        : investmentSummary.verifiedOwnMoneyRequiredRub != null
                        ? `${formatMln(investmentSummary.verifiedOwnMoneyRequiredRub)} (${investmentSummary.peakMonthLabel})`
                        : '—'}
                    </strong>
                    {hasCost && hasFinance && wbLagMonths >= 0 && investmentSummary.selfFundingMonthLabel
                      ? ` · С ${investmentSummary.selfFundingMonthLabel} — выход в плюс из выручки WB`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScenarioDrawerTab('investment')}
                    className="h-8 px-3 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] dark:bg-[#1D1C1A] dark:hover:bg-[#282724] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] text-[11.5px] font-medium cursor-pointer transition-colors"
                  >
                    Подробный график «Пик своих денег» →
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportFactoryOrderCsv('first_wave')}
                    className="h-8 px-3 rounded-lg bg-white hover:bg-[#FAF9F6] dark:bg-[#151514] dark:hover:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] text-[11.5px] font-medium cursor-pointer transition-colors"
                  >
                    Скачать заказ 1-й волны Q1 (CSV)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {wavesSummary.waves.map((w) => (
                  <div
                    key={w.id}
                    className="relative overflow-hidden rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-[#5C5953] dark:text-[#9E9A92]">
                        {w.waveNum}
                      </span>
                      <span
                        className={`text-[10.5px] font-medium px-2 py-0.5 rounded-md border ${
                          w.selfFunded
                            ? 'bg-emerald-500/10 text-[#15803D] dark:text-emerald-400 border-emerald-500/25'
                            : 'bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] border-[#E4E1DA] dark:border-[#282724]'
                        }`}
                      >
                        {w.selfFunded
                          ? '100% с WB'
                          : w.fundedFromWbPct > 0
                          ? `${w.fundedFromWbPct}% с WB`
                          : 'Старт · свои ₽'}
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold text-[#0F172A] dark:text-[#EDF0F7]">
                      {w.title}
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-mono text-xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                        {formatCostMln(w.budgetRub)}
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-[#64748B]">
                        {w.packsQty.toLocaleString('ru-RU')} {scopeUnitInfo.primaryUnit} ({w.sharePct}%)
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px] text-[#64748B]">
                      <div className="flex justify-between">
                        <span>Аванс {wavesSummary.avgPrepaymentPct}% ({w.orderWindow}):</span>
                        <strong className="font-mono text-[#0F172A] dark:text-[#EDF0F7]">
                          {formatCostMln(w.prepayRub)}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Доплата {100 - wavesSummary.avgPrepaymentPct}% ({w.arrivalMonth}):</span>
                        <strong className="font-mono text-[#0F172A] dark:text-[#EDF0F7]">
                          {formatCostMln(w.balanceRub)}
                        </strong>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 gap-0.5 h-1.5 rounded overflow-hidden bg-[#E2E8F0] dark:bg-[#222938]">
                      {MONTHS_SHORT_RU.map((m, idx) => (
                        <div
                          key={m}
                          className={
                            w.coverageMonths.includes(idx)
                              ? w.selfFunded
                                ? 'bg-emerald-500'
                                : 'bg-amber-500'
                              : 'bg-transparent'
                          }
                        />
                      ))}
                    </div>
                    <div className="text-[10.5px] font-medium text-[#475569] dark:text-[#94A3B8]">
                      {w.fundingLabel}
                    </div>
                    <div
                      className={`absolute inset-x-0 bottom-0 h-[3px] ${
                        w.selfFunded ? 'bg-emerald-500/80' : 'bg-amber-500/80'
                      }`}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ЕДИНАЯ РАСКРЫВАЮЩАЯСЯ ПАНЕЛЬ СЦЕНАРИЯ (Скрыта по умолчанию, чтобы не дублировать карточки на экране!) */}
          {scenarioDrawerTab !== 'none' && (
            <div className="rounded-[16px] border border-[#D8D7CE] bg-white overflow-hidden shadow-[0_2px_10px_rgba(20,20,19,0.04)]">
              {/* Шапка панели с переключением 3 режимов: Инвестиции и оборот WB / По брендам / Все SKU */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#EAE9E2] bg-[#FAF9F6] px-5 py-3">
                <div className="inline-flex flex-wrap items-center gap-1 rounded-[9px] border border-[#E2E1D9] bg-[#F2F1EC] p-0.5 text-[12px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setScenarioDrawerTab('investment')}
                    className={`h-7.5 rounded-[7px] px-3 transition cursor-pointer ${
                      scenarioDrawerTab === 'investment'
                        ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.08)] border border-[#D4D3C9]'
                        : 'text-[#686762] hover:text-[#141413] border border-transparent'
                    }`}
                  >
                    Инвестиции и кэшфлоу WB (12 мес.)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScenarioDrawerTab('brands')}
                    className={`h-7.5 rounded-[7px] px-3 transition cursor-pointer ${
                      scenarioDrawerTab === 'brands'
                        ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.08)] border border-[#D4D3C9]'
                        : 'text-[#686762] hover:text-[#141413] border border-transparent'
                    }`}
                  >
                    По брендам группы (5)
                  </button>
                  <button
                    type="button"
                    onClick={() => setScenarioDrawerTab('skus')}
                    className={`h-7.5 rounded-[7px] px-3 transition cursor-pointer ${
                      scenarioDrawerTab === 'skus'
                        ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.08)] border border-[#D4D3C9]'
                        : 'text-[#686762] hover:text-[#141413] border border-transparent'
                    }`}
                  >
                    Все модели сценария ({procData.perSku.length} SKU)
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => handleExportFactoryOrderCsv('first_wave')}
                    className="h-7.5 rounded-[7px] border border-[#D8D7CE] bg-white px-2.5 text-[11.5px] font-semibold text-[#141413] hover:bg-[#F4F3EE] cursor-pointer"
                  >
                    Экспорт 1-й волны Q1 (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWavesCalendarOpen(false);
                      setScenarioDrawerTab('none');
                    }}
                    className="h-7.5 rounded-[7px] px-2.5 text-[12px] font-semibold text-[#686762] hover:text-[#141413] cursor-pointer"
                  >
                    ← К выбранному товару
                  </button>
                </div>
              </div>

              {/* ВКЛАДКА 1: ИНВЕСТИЦИОННАЯ СВОДКА СЦЕНАРИЯ + КАЛЕНДАРЬ 12 МЕС. */}
              {scenarioDrawerTab === 'investment' && (
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#EAE9E2] border-b border-[#EAE9E2] bg-white">
                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                          План продаж сценария
                        </span>
                        <button
                          type="button"
                          onClick={() => navigateTo('launch-calendar')}
                          className="text-[11px] font-semibold text-[#141413] hover:underline cursor-pointer"
                        >
                          02 · Продажи →
                        </button>
                      </div>
                      <div className="mt-1.5 font-mono text-[21px] font-extrabold text-[#141413]">
                        {hasFinance ? formatMln(investmentSummary.annualRevenueRub) : 'Скрыто'}
                      </div>
                      <div className="mt-1 text-[11.5px] text-[#686762]">
                        Дек:{' '}
                        <strong className="text-[#141413]">
                          {hasFinance ? formatMln(investmentSummary.decemberRevenueRub) : 'Скрыто'}
                        </strong>{' '}
                        ·{' '}
                        {scopeUnitInfo.isMixed
                          ? formatGroupedUnitInline(
                              procData.perSku.map((x) => ({
                                unit: getBrandUnitConfig(x.model).primaryUnit,
                                qty: x.plan.annualDemandPacks,
                              }))
                            )
                          : `${procData.annualDemandPacks.toLocaleString('ru-RU')} ${scopeUnitInfo.primaryUnit}`}
                      </div>
                    </div>

                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                          Вложить на старт (Партия №1)
                        </span>
                        <span className="rounded-md bg-[#EAF6F0] px-2 py-0.5 text-[10px] font-bold text-[#146C43]">
                          Старт Q1
                        </span>
                      </div>
                      <div className="mt-1.5 font-mono text-[21px] font-extrabold text-[#157347]">
                        {formatCostMln(investmentSummary.firstWaveStartBudgetRub)}
                      </div>
                      <div className="mt-1 text-[11.5px] text-[#686762]">
                        Аванс 30% сейчас: <strong className="text-[#141413]">{formatCostMln(investmentSummary.firstWavePrepaymentRub)}</strong> · {investmentSummary.firstWavePacks.toLocaleString('ru-RU')} {scopeUnitInfo.primaryUnit}
                      </div>
                    </div>

                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                          Пик своих денег (с WB)
                        </span>
                        <span className="rounded-md bg-[#F4F3EE] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#52514C]">
                          {!hasCost || !hasFinance
                            ? 'Скрыто'
                            : wbLagMonths < 0
                            ? 'Лаг WB не задан'
                            : investmentSummary.verifiedOwnMoneyRequiredRub !== null &&
                              investmentSummary.verifiedOwnMoneyRequiredRub !== undefined
                            ? `${investmentSummary.peakMonthLabel} ${currentScenario.year || 2027}`
                            : 'График WB не указан'}
                        </span>
                      </div>
                      {!hasCost || !hasFinance ? (
                        <div className="mt-1.5 font-mono text-[21px] font-extrabold text-[#141413]">
                          Скрыто
                        </div>
                      ) : wbLagMonths < 0 ? (
                        <div className="mt-1.5 text-[13px] font-bold text-amber-800 leading-snug">
                          Лаг WB не задан
                        </div>
                      ) : investmentSummary.verifiedOwnMoneyRequiredRub !== null &&
                        investmentSummary.verifiedOwnMoneyRequiredRub !== undefined ? (
                        <>
                          <div className="mt-1.5 font-mono text-[21px] font-extrabold text-[#141413]">
                            {formatMln(investmentSummary.verifiedOwnMoneyRequiredRub)}
                          </div>
                          <div className="mt-1 text-[11.5px] text-[#686762]">
                            {investmentSummary.selfFundingMonthLabel
                              ? `С ${investmentSummary.selfFundingMonthLabel} — окупается из выручки WB`
                              : 'Следующие партии — из выручки WB'}
                          </div>
                        </>
                      ) : (
                        <div className="mt-1.5 text-[12px] font-semibold text-amber-800 leading-snug">
                          {investmentSummary.ownMoneyStatusLabel}
                        </div>
                      )}
                    </div>

                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                          Закупки за весь год
                        </span>
                        <span className="font-mono text-[10.5px] font-semibold text-[#686762]">
                          {scopeUnitInfo.isMixed
                            ? `${procData.perSku.length} SKU`
                            : `${procData.totalScenarioPacks.toLocaleString('ru-RU')} ${scopeUnitInfo.primaryUnit}`}
                        </span>
                      </div>
                      <div className="mt-1.5 font-mono text-[21px] font-extrabold text-[#141413]">
                        {formatCostMln(investmentSummary.totalProcurementBudgetRub)}
                      </div>
                      <div className="mt-1 text-[11.5px] text-[#686762]">
                        Себест. продаж: {formatCostMln(investmentSummary.annualSoldGoodsCostRub)} · Прибыль: <strong className="text-[#157347]">{formatProfitMln(investmentSummary.annualEstimatedOperatingProfitRub)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Подробный интерактивный график «Пик своих денег» и помесячная сверка */}
                  <div className="p-4 bg-[#FAF9F6]/50">
                    <PeakOwnMoneyChartPanel
                      investmentSummary={investmentSummary}
                      wavesSummary={wavesSummary}
                      scenarioTitle={
                        isHoldingAllBrandsActive
                          ? 'Все 5 брендов холдинга'
                          : currentScenario.title
                      }
                      year={currentScenario.year || 2027}
                      initialCashMln={initialCashMln}
                      onChangeInitialCashMln={setInitialCashMln}
                      wbLagMonths={wbLagMonths < 0 ? 0 : wbLagMonths}
                      onChangeWbLagMonths={setWbLagMonths}
                      wbScheduleSpecified={wbLagMonths >= 0}
                      onToggleWbScheduleSpecified={() =>
                        setWbLagMonths((prev) => (prev < 0 ? 0 : -1))
                      }
                      compact
                    />
                  </div>
                </div>
              )}

              {/* ВКЛАДКА 2: СВОДНАЯ ПО БРЕНДАМ ГРУППЫ */}
              {scenarioDrawerTab === 'brands' && (
                <div className="p-4">
                  <div className="overflow-x-auto rounded-[10px] border border-[#E4E3DC]">
                    <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-[#E4E3DC] bg-[#FAF9F6] text-[10.5px] font-bold uppercase tracking-wide text-[#5E5D58]">
                          <th className="py-2.5 px-3">Бренд</th>
                          <th className="py-2.5 px-2.5 text-right">Моделей</th>
                          <th className="py-2.5 px-3 text-right">Выручка 2027</th>
                          <th className="py-2.5 px-3 text-right">К закупке</th>
                          <th className="py-2.5 px-3 text-right">Вложить на старт (Q1)</th>
                          <th className="py-2.5 px-3 text-right">Пик своих денег</th>
                          <th className="py-2.5 px-3 text-right">Закупки за год</th>
                          <th className="py-2.5 px-3 text-right">Себест. продаж</th>
                          <th className="py-2.5 px-3 text-right">Ожид. прибыль</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ECEBE4]">
                        {brandsReport.brands.map((b) => (
                          <tr
                            key={b.brandCode}
                            onClick={() => setBrandFilter(b.brandCode)}
                            className={`hover:bg-[#FAF9F6] cursor-pointer transition ${
                              brandFilter === b.brandCode ? 'bg-amber-50/60 font-semibold' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 font-bold text-[#141413]">{b.brandTitle}</td>
                            <td className="py-2.5 px-2.5 text-right font-mono text-[#52514C]">
                              {b.modelsCount}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#141413]">
                              {b.modelsCount > 0
                                ? hasFinance
                                  ? formatMln(b.annualRevenueRub)
                                  : 'Скрыто'
                                : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#3D3C38]">
                              {b.modelsCount > 0
                                ? `${b.totalProcurementPacks.toLocaleString('ru-RU')} ${getBrandUnitConfig(b.brandCode).primaryUnit}`
                                : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#146C43]">
                              {b.modelsCount > 0 ? (
                                <div>
                                  <div className="font-bold">
                                    {formatCostMln(b.firstWaveStartBudgetRub)}
                                  </div>
                                  <div className="text-[10.5px] text-[#686762]">
                                    аванс: {formatCostMln(b.firstWavePrepaymentRub)}
                                  </div>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#141413]">
                              {b.modelsCount > 0 ? (
                                !hasCost || !hasFinance ? (
                                  'Скрыто'
                                ) : wbLagMonths < 0 ? (
                                  <span className="text-[11px] font-semibold text-amber-800">
                                    Лаг WB не задан
                                  </span>
                                ) : (
                                  <div>
                                    <div>{formatMln(b.peakWorkingCapitalRub)}</div>
                                    <div className="text-[10px] font-normal text-amber-800">
                                      пик: {b.peakMonthLabel || 'Янв'}
                                      {b.selfFundingMonthLabel ? ` → с ${b.selfFundingMonthLabel} с WB` : ''}
                                    </div>
                                  </div>
                                )
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#141413]">
                              {b.modelsCount > 0 ? formatCostMln(b.totalProcurementBudgetRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#52514C]">
                              {b.modelsCount > 0 ? formatCostMln(b.annualSoldGoodsCostRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#157347]">
                              {b.modelsCount > 0
                                ? formatProfitMln(b.annualEstimatedOperatingProfitRub)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr
                          onClick={() => setBrandFilter('ALL')}
                          className="border-t border-[#CECDC4] bg-[#F8F8F5] font-extrabold text-[#141413] cursor-pointer"
                        >
                          <td className="py-3 px-3">
                            {!isHoldingAllBrandsActive && brandFilter !== 'ALL'
                              ? `ИТОГО (${formatLabBrandLabel(brandFilter)})`
                              : 'ИТОГО ПО ГРУППЕ (без дублей)'}
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono">
                            {brandsReport.groupTotal.modelsCount}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {hasFinance
                              ? formatMln(brandsReport.groupTotal.annualRevenueRub)
                              : 'Скрыто'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {formatGroupedUnitInline(
                              brandsReport.brands.map((b) => ({
                                unit: getBrandUnitConfig(b.brandCode).primaryUnit,
                                qty: b.totalProcurementPacks,
                              })),
                              scopeUnitInfo.primaryUnit
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[#146C43]">
                            <div>{formatCostMln(brandsReport.groupTotal.firstWaveStartBudgetRub)}</div>
                            <div className="text-[10.5px] font-semibold text-[#686762]">
                              аванс: {formatCostMln(brandsReport.groupTotal.firstWavePrepaymentRub)}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {!hasCost || !hasFinance
                              ? 'Скрыто'
                              : wbLagMonths < 0
                              ? 'Лаг WB не задан'
                              : formatMln(brandsReport.groupTotal.netOwnMoneyRequiredRub)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {formatCostMln(brandsReport.groupTotal.totalProcurementBudgetRub)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {formatCostMln(brandsReport.groupTotal.annualSoldGoodsCostRub)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[#157347]">
                            {formatProfitMln(brandsReport.groupTotal.annualEstimatedOperatingProfitRub)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ВКЛАДКА 3: СВОДНАЯ ВЕДОМОСТЬ И ДЕТАЛИЗАЦИЯ ЗАКУПОК (ПО КАТЕГОРИЯМ, КАРТОЧКАМ, 4 ВОЛНАМ Q1–Q4 И РАЗМЕРАМ) */}
              {scenarioDrawerTab === 'skus' && (
                <div className="p-4 sm:p-5 space-y-5 bg-[#FAF9F6]/50">
                  {/* ПЕРЕКЛЮЧАТЕЛЬ ОБЛАСТИ ЗАКУПОК: ВСЕ БРЕНДЫ ХОЛДИНГА ИЛИ ОТДЕЛЬНЫЙ КАБИНЕТ (LISKANI / BORNERS / FUKAI) */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#E2E6EE] bg-white px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                        Кабинет / бренд закупки:
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setBrandFilter('ALL');
                          setHoldingScopeMode(true);
                          setSelectedCategoryFilter('ALL');
                        }}
                        className={`h-7.5 px-3 rounded-lg text-[11.5px] font-semibold transition cursor-pointer ${
                          isHoldingAllBrandsActive
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-[#F1F5F9] text-[#334155] hover:bg-[#E2E8F0]'
                        }`}
                      >
                        Все бренды холдинга ({multiBrandSummary.groupTotal.modelsCount} мод. ·{' '}
                        {formatCostMln(multiBrandSummary.groupTotal.totalProcurementBudgetRub)})
                      </button>
                      {multiBrandSummary.brands
                        .filter((b) => b.hasScenario && b.hasModels && b.modelsCount > 0)
                        .map((b) => {
                          const isBrActive = !isHoldingAllBrandsActive && brandFilter === b.brandCode;
                          return (
                            <button
                              key={b.brandCode}
                              type="button"
                              onClick={() => {
                                setHoldingScopeMode(false);
                                setSelectedCategoryFilter('ALL');
                                setBrandFilter(b.brandCode);
                                if (b.selectedScenarioId !== null) {
                                  setSelectedScenarioId(b.selectedScenarioId, b.brandCode);
                                }
                              }}
                              className={`h-7.5 px-3 rounded-lg text-[11.5px] font-semibold transition cursor-pointer ${
                                isBrActive
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-[#F1F5F9] text-[#334155] hover:bg-[#E2E8F0]'
                              }`}
                            >
                              {b.displayCode} ({b.modelsCount} мод.
                              {b.brandCode === 'LISKANI' ? ' · 269 разм.' : ''} ·{' '}
                              {formatCostMln(b.totalProcurementBudgetRub)})
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* 1. ФОРМУЛА СВОДНОЙ ЗАКУПКИ: ОТКУДА БЕРЁТСЯ ОБЩАЯ СУММА В СВОДКЕ */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById('procurement-summary-table-anchor');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="text-left rounded-xl border border-[#E2E6EE] bg-white hover:border-emerald-500/50 p-4 space-y-1 shadow-2xs transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                          1. Себестоимость выкупов (Сводка)
                        </span>
                        <span className="rounded-md bg-[#EEF2F6] px-2 py-0.5 font-mono text-[10.5px] font-bold text-[#334155]">
                          {scopeUnitInfo.isMixed
                            ? `${procData.perSku.length} SKU`
                            : `${procData.annualDemandPacks.toLocaleString('ru-RU')} ${scopeUnitInfo.primaryUnit}`}
                        </span>
                      </div>
                      <div className="font-mono text-[22px] font-extrabold text-[#0F172A]">
                        {formatCostMln(investmentSummary.annualSoldGoodsCostRub)}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        Средняя себест.:{' '}
                        <strong className="font-mono text-[#0F172A]">
                          {!hasCost
                            ? 'Скрыто'
                            : scopeUnitInfo.isMixed
                            ? 'по брендам'
                            : `${
                                procData.annualDemandPacks > 0
                                  ? Math.round(
                                      investmentSummary.annualSoldGoodsCostRub /
                                        procData.annualDemandPacks
                                    ).toLocaleString('ru-RU')
                                  : 0
                              } ₽/${scopeUnitInfo.primaryUnit}`}
                        </strong>{' '}
                        · нажмите для правки в таблице ↓
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById('procurement-summary-table-anchor');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="text-left rounded-xl border border-[#E2E6EE] bg-white hover:border-emerald-500/50 p-4 space-y-1 shadow-2xs transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                          2. Бюджет закупок у фабрик (Год)
                        </span>
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[10.5px] font-bold text-emerald-700">
                          {scopeUnitInfo.isMixed
                            ? `${procData.perSku.length} SKU`
                            : `${procData.totalScenarioPacks.toLocaleString('ru-RU')} ${scopeUnitInfo.primaryUnit}`}
                        </span>
                      </div>
                      <div className="font-mono text-[22px] font-extrabold text-[#0F172A]">
                        {formatCostMln(procData.totalScenarioBudgetRub)}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        {scopeUnitInfo.isMixed
                          ? formatGroupedUnitInline(
                              procData.perSku.map((x) => ({
                                unit: getBrandUnitConfig(x.model).primaryUnit,
                                qty:
                                  x.plan.totalApprovedReceiptsPacks + x.plan.totalRecommendedPacks,
                              }))
                            )
                          : scopeUnitInfo.primaryUnit === scopeUnitInfo.secondaryUnit
                          ? `${procData.totalScenarioPacks.toLocaleString('ru-RU')} ${scopeUnitInfo.primaryUnit} · 4 квартальные волны`
                          : `${procData.totalScenarioUnits.toLocaleString('ru-RU')} ${scopeUnitInfo.secondaryUnit} · включает 4 квартальные волны и переходящий запас`}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWavesCalendarOpen((v) => !v)}
                      className="text-left rounded-xl border border-[#E2E6EE] bg-white hover:border-emerald-500/50 p-4 space-y-1 shadow-2xs transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                          3. Старт · Волна №1 (Q1 · Янв–Мар)
                        </span>
                        <span className="rounded-md bg-[#EAF6F0] px-2 py-0.5 text-[10.5px] font-bold text-[#146C43]">
                          аванс 30%
                        </span>
                      </div>
                      <div className="font-mono text-[22px] font-extrabold text-[#157347]">
                        {formatCostMln(procData.firstWaveBudgetRub)}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        Аванс сейчас:{' '}
                        <strong className="font-mono text-[#0F172A]">
                          {formatCostMln(procData.firstWavePrepaymentRub)}
                        </strong>{' '}
                        · {procData.firstWavePacks.toLocaleString('ru-RU')} {scopeUnitInfo.primaryUnit}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWavesCalendarOpen((v) => !v)}
                      className="text-left rounded-xl border border-[#E2E6EE] bg-white hover:border-emerald-500/50 p-4 space-y-1 shadow-2xs transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                          4. Волны №2–№4 (Q2–Q4 с оборота WB)
                        </span>
                        <span className="rounded-md bg-[#F1F5F9] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#475569]">
                          реинвест WB
                        </span>
                      </div>
                      <div className="font-mono text-[22px] font-extrabold text-[#0F172A]">
                        {formatCostMln(
                          Math.max(0, procData.totalScenarioBudgetRub - procData.firstWaveBudgetRub)
                        )}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        {Math.max(0, procData.totalScenarioPacks - procData.firstWavePacks).toLocaleString(
                          'ru-RU'
                        )}{' '}
                        {scopeUnitInfo.primaryUnit} · оплата из поступлений с WB
                      </div>
                    </button>
                  </div>

                  {/* 1Б. ПОМЕСЯЧНАЯ ЛЕНТА ПЛАТЕЖЕЙ ФАБРИКАМ (12 МЕС.) + УПРАВЛЕНИЕ УСЛОВИЯМИ ОПЛАТЫ И ПИКОМ СВОИХ ДЕНЕГ */}
                  <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-4 space-y-3.5 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-[#5C5953] dark:text-[#9E9A92]" strokeWidth={1.5} />
                            <span>
                              Платёжный график фабрикам по 12 месяцам (Авансы {wavesSummary.avgPrepaymentPct}% + Доплаты {100 - wavesSummary.avgPrepaymentPct}%)
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] px-2.5 py-0.5 text-[11px] font-medium text-[#141413] dark:text-[#F5F4F0]">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#B91C1C]" />
                            <span>
                              Пик своих денег:{' '}
                              {!hasCost || !hasFinance
                                ? 'Скрыто'
                                : wbLagMonths < 0
                                ? 'Лаг WB не задан'
                                : investmentSummary.verifiedOwnMoneyRequiredRub != null
                                ? `${formatMln(investmentSummary.verifiedOwnMoneyRequiredRub)} в ${investmentSummary.peakMonthLabel}`
                                : '—'}
                              {hasCost && hasFinance && wbLagMonths >= 0 && investmentSummary.selfFundingMonthLabel
                                ? ` · с ${investmentSummary.selfFundingMonthLabel} — в плюс с WB`
                                : ''}
                            </span>
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                          Реальные квартальные партии: Q1 {formatCostMln(wavesSummary.waves[0]?.budgetRub || 0)} · Q2 {formatCostMln(wavesSummary.waves[1]?.budgetRub || 0)} · Q3 {formatCostMln(wavesSummary.waves[2]?.budgetRub || 0)} · Q4 {formatCostMln(wavesSummary.waves[3]?.budgetRub || 0)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFactoryTermsPanelOpen((v) => !v)}
                          className={`h-8 px-3 rounded-lg border text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                            factoryTermsPanelOpen
                              ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] border-[#141413] dark:border-[#F5F4F0]'
                              : 'bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:bg-[#EFECE6] dark:hover:bg-[#282724] text-[#141413] dark:text-[#F5F4F0] border-[#E4E1DA] dark:border-[#282724]'
                          }`}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                          <span>
                            Условия оплаты фабрикам ({wavesSummary.avgPrepaymentPct}/{100 - wavesSummary.avgPrepaymentPct}%) {factoryTermsPanelOpen ? '▴' : '▾'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setScenarioDrawerTab('investment')}
                          className="h-8 px-3 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:bg-[#EFECE6] dark:hover:bg-[#282724] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] text-[11.5px] font-medium cursor-pointer transition-colors"
                        >
                          Подробный график «Пик своих денег» →
                        </button>
                      </div>
                    </div>

                    {/* Компактная 12-месячная шкала выплат фабрикам */}
                    {(() => {
                      const maxOut = Math.max(
                        1,
                        ...wavesSummary.monthlySchedule.map((r) => r.totalOutflowRub)
                      );
                      return (
                        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 pt-1">
                          {wavesSummary.monthlySchedule.map((ms) => {
                            const isPeakM =
                              hasCost &&
                              hasFinance &&
                              ms.monthIdx === investmentSummary.peakMonthIdx;
                            const prepayH = hasCost
                              ? Math.round((ms.prepayRub / maxOut) * 34)
                              : 0;
                            const balH = hasCost
                              ? Math.round((ms.balanceRub / maxOut) * 34)
                              : 0;
                            return (
                              <button
                                key={ms.monthIdx}
                                type="button"
                                onClick={() => setScenarioDrawerTab('investment')}
                                title={
                                  hasCost
                                    ? `${ms.monthLabel}: всего фабрикам ${formatMln(ms.totalOutflowRub)} (аванс ${formatMln(ms.prepayRub)} + доплата ${formatMln(ms.balanceRub)})${ms.waveTags.length ? ' · ' + ms.waveTags.join(', ') : ''}`
                                    : `${ms.monthLabel}: суммы выплат фабрикам скрыты по роли${ms.waveTags.length ? ' · ' + ms.waveTags.join(', ') : ''}`
                                }
                                className={`rounded-lg border p-1.5 text-center transition-colors cursor-pointer ${
                                  isPeakM
                                    ? 'border-[#141413] dark:border-[#F5F4F0] bg-[#FAF9F6] dark:bg-[#1D1C1A]'
                                    : hasCost && ms.totalOutflowRub > 0
                                    ? 'border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6]/70 dark:bg-[#1D1C1A]/60 hover:border-[#78746C]'
                                    : 'border-[#EFECE6] dark:border-[#282724] bg-white dark:bg-[#151514] opacity-75'
                                }`}
                              >
                                <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-[#5C5953] dark:text-[#9E9A92]">
                                  <span>{ms.monthLabel}</span>
                                  {isPeakM && (
                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#B91C1C]" />
                                  )}
                                </div>
                                <div className="h-9 flex flex-col justify-end items-center my-1">
                                  {balH > 0 && (
                                    <div
                                      style={{ height: `${Math.max(3, balH)}px` }}
                                      className="w-4 rounded-t-xs bg-rose-400"
                                    />
                                  )}
                                  {prepayH > 0 && (
                                    <div
                                      style={{ height: `${Math.max(3, prepayH)}px` }}
                                      className="w-4 rounded-b-xs bg-amber-400"
                                    />
                                  )}
                                </div>
                                <div className="font-mono text-[10px] font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                                  {!hasCost
                                    ? '—'
                                    : ms.totalOutflowRub > 0
                                    ? `−${(ms.totalOutflowRub / 1_000_000).toFixed(1)}`
                                    : '0'}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Групповая настройка условий закупки (мгновенно пересчитывает волны и Пик своих денег) */}
                    {factoryTermsPanelOpen && canEditAnyScopedModel && (
                      <div className="rounded-xl border border-slate-200 dark:border-[#283246] bg-slate-50/80 dark:bg-[#181D2A] p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11.5px]">
                        <div className="space-y-1.5">
                          <div className="font-bold text-slate-800 dark:text-[#EDF0F7]">
                            1. Аванс / Доплата фабрикам ({editableScopedModelIds.length} SKU)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[20, 30, 50, 100].map((pct) => {
                              const active = wavesSummary.avgPrepaymentPct === pct;
                              return (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() => {
                                    updateBatchFactoryTerms(
                                      editableScopedModelIds,
                                      { prepaymentPct: pct }
                                    );
                                    notify(
                                      'success',
                                      `Установлена схема оплаты ${pct}% / ${100 - pct}% для ${editableScopedModelIds.length} SKU`
                                    );
                                  }}
                                  className={`px-2.5 py-1 rounded-lg font-mono font-bold border cursor-pointer transition ${
                                    active
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-white dark:bg-[#121620] text-slate-700 dark:text-slate-200 border-slate-300 dark:border-[#2D384D] hover:bg-slate-100 dark:hover:bg-[#1E2536]'
                                  }`}
                                >
                                  {pct}/{100 - pct}%
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="font-bold text-slate-800 dark:text-[#EDF0F7]">
                            2. Срок производства на фабрике
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[20, 30, 45, 60].map((days) => (
                              <button
                                key={days}
                                type="button"
                                onClick={() => {
                                  updateBatchFactoryTerms(
                                    editableScopedModelIds,
                                    { productionLeadDays: days }
                                  );
                                  notify(
                                    'success',
                                    `Срок пошива/производства установлен: ${days} дн. (${editableScopedModelIds.length} SKU)`
                                  );
                                }}
                                className="px-2.5 py-1 rounded-lg font-mono font-bold border bg-white dark:bg-[#121620] text-slate-700 dark:text-slate-200 border-slate-300 dark:border-[#2D384D] hover:bg-slate-100 dark:hover:bg-[#1E2536] cursor-pointer transition"
                              >
                                {days} дн.
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="font-bold text-slate-800 dark:text-[#EDF0F7]">
                            3. Объём закупа с учётом возвратов ПВЗ
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                updateBatchFactoryTerms(
                                  editableScopedModelIds,
                                  { procureByOrdersVolume: false }
                                );
                                notify(
                                  'success',
                                  `Режим закупки: под чистые выкупы ×1,00 (${editableScopedModelIds.length} SKU)`
                                );
                              }}
                              className="px-2.5 py-1 rounded-lg font-semibold border bg-white dark:bg-[#121620] text-slate-700 dark:text-slate-200 border-slate-300 dark:border-[#2D384D] hover:bg-slate-100 dark:hover:bg-[#1E2536] cursor-pointer transition"
                            >
                              Под выкупы (×1,00)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                updateBatchFactoryTerms(
                                  editableScopedModelIds,
                                  { procureByOrdersVolume: true }
                                );
                                notify(
                                  'success',
                                  `Режим закупки: под полный объём заказов ПВЗ (${editableScopedModelIds.length} SKU)`
                                );
                              }}
                              className="px-2.5 py-1 rounded-lg font-medium border bg-[#FAF9F6] dark:bg-[#1D1C1A] text-[#141413] dark:text-[#F5F4F0] border-[#E4E1DA] dark:border-[#282724] hover:bg-[#EFECE6] dark:hover:bg-[#282724] cursor-pointer transition-colors"
                            >
                              Под заказы ПВЗ
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. ГРУППИРОВКА ЗАКУПОК ПО КАТЕГОРИЯМ / ЛИНЕЙКАМ (БЛЭКАУТ, МРАМОР, РОГОЖКА, ТЮЛЬ И ДР.) */}
                  {categoryGroups.length > 1 && (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[12.5px] font-bold text-[#0F172A]">
                          Детализация бюджета закупок по категориям ({categoryGroups.length} кат. · нажмите для фильтрации)
                        </span>
                        {selectedCategoryFilter !== 'ALL' && (
                          <button
                            type="button"
                            onClick={() => setSelectedCategoryFilter('ALL')}
                            className="text-[11.5px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            Показать все категории ({procData.perSku.length} SKU)
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {categoryGroups.map((cg) => {
                          const isSel = selectedCategoryFilter === cg.categoryLabel;
                          const avgCost =
                            cg.annualDemandPacks > 0
                              ? Math.round(cg.soldCogsRub / cg.annualDemandPacks)
                              : 0;
                          return (
                            <button
                              key={cg.categoryLabel}
                              type="button"
                              onClick={() =>
                                setSelectedCategoryFilter(isSel ? 'ALL' : cg.categoryLabel)
                              }
                              className={`text-left rounded-xl border p-3.5 transition cursor-pointer ${
                                isSel
                                  ? 'border-emerald-500 bg-emerald-500/8 shadow-xs'
                                  : 'border-[#E2E6EE] bg-white hover:border-[#CBD5E1]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[13px] font-bold text-[#0F172A] truncate">
                                  {cg.categoryLabel}
                                </span>
                                <span className="rounded-md bg-[#F1F5F9] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[#334155] shrink-0">
                                  {cg.modelsCount} мод. · {cg.sizesCount} разм.
                                </span>
                              </div>
                              <div className="mt-2 flex items-baseline justify-between gap-2">
                                <div>
                                  <div className="text-[10.5px] text-[#64748B]">Бюджет закупок (год)</div>
                                  <div className="font-mono text-[17px] font-extrabold text-[#0F172A]">
                                    {formatCostMln(cg.totalBudgetRub)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10.5px] text-[#64748B]">Себест. выкупов</div>
                                  <div className="font-mono text-[13.5px] font-bold text-[#334155]">
                                    {formatCostMln(cg.soldCogsRub)}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-t border-[#EEF2F6] flex items-center justify-between text-[11px] text-[#475569]">
                                <span>
                                  К заказу:{' '}
                                  <strong className="font-mono text-[#0F172A]">
                                    {cg.totalOrderPacks.toLocaleString('ru-RU')}
                                  </strong>{' '}
                                  {cg.unitSet.size === 1 ? Array.from(cg.unitSet)[0] : 'ед.'}
                                  {hasCost && cg.unitSet.size === 1 ? ` (~${avgCost} ₽)` : ''}
                                </span>
                                <span className="font-mono font-semibold text-emerald-700">
                                  Q1: {formatCostMln(cg.firstWaveBudgetRub)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. ПОАРТИКУЛЬНАЯ И ПОРАЗМЕРНАЯ ВЕДОМОСТЬ ЗАКУПОК (С РАСКРЫТИЕМ РАЗМЕРОВ И 4 КВАРТАЛЬНЫХ ВОЛН Q1–Q4) */}
                  <div id="procurement-summary-table-anchor" className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[14.5px] font-bold text-[#0F172A]">
                          Поартикульная и поразмерная детализация закупок ({filteredSummarySkus.length} карточек)
                        </div>
                        <p className="text-[11.5px] text-[#64748B]">
                          Нажмите прямо на число в колонке «Себест. ед.» для мгновенной правки себестоимости, или на «Размеры ▾» для раскрытия сетки и партий Q1–Q4
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={skuSearch}
                          onChange={(e) => setSkuSearch(e.target.value)}
                          placeholder="Поиск по коду, цвету или WB..."
                          className="h-8.5 w-52 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12px] text-[#0F172A] placeholder:text-[#64748B] focus:border-[#0F172A] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (expandedSummaryModelIds.length >= filteredSummarySkus.length) {
                              setExpandedSummaryModelIds([]);
                            } else {
                              setExpandedSummaryModelIds(
                                filteredSummarySkus.map(({ model: m }) => m.id)
                              );
                            }
                          }}
                          className="h-8.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12px] font-semibold text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
                        >
                          {expandedSummaryModelIds.length >= filteredSummarySkus.length &&
                          filteredSummarySkus.length > 0
                            ? 'Свернуть все размеры ▴'
                            : 'Развернуть все размеры ▾'}
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-[#CBD5E1] bg-white">
                      <table className="w-full min-w-[980px] border-collapse text-left text-[12px]">
                        <thead>
                          <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[10.5px] font-bold text-[#475569] uppercase tracking-wide">
                            <th className="py-2.5 pr-3 pl-3.5">Модель / SKU и категория</th>
                            <th className="px-2.5 py-2.5 text-right">
                              {scopeUnitInfo.isMixed
                                ? 'Себест. ед.'
                                : `Себест. 1 ${scopeUnitInfo.primaryUnit}`}
                            </th>
                            <th className="px-2.5 py-2.5 text-right">План продаж</th>
                            <th className="px-2.5 py-2.5 text-right">Себест. выкупов</th>
                            <th className="px-2.5 py-2.5 text-right">К заказу (год)</th>
                            <th className="px-2.5 py-2.5 text-right bg-emerald-500/6 text-emerald-800">
                              Старт Q1 (Аванс 30%)
                            </th>
                            <th className="px-2.5 py-2.5 text-right">Волны Q2–Q4</th>
                            <th className="px-2.5 py-2.5 text-right">Бюджет закупок</th>
                            <th className="py-2.5 pr-3.5 pl-2.5 text-right">Детализация</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EEF2F6]">
                          {filteredSummarySkus.map(({ model: m, plan, scenario: rowScenario }) => {
                            const isExp = expandedSummaryModelIds.includes(m.id);
                            const toggleExpand = () => {
                              setExpandedSummaryModelIds((prev) =>
                                prev.includes(m.id)
                                  ? prev.filter((id) => id !== m.id)
                                  : [...prev, m.id]
                              );
                            };
                            const hasLiskaniSizes =
                              Array.isArray(m.liskaniSizeVariants) &&
                              m.liskaniSizeVariants.length > 0;
                            const prodProfile = getModelProductionProfileFull(m);
                            const canEditRow = canUserEditBrand(
                              currentUser,
                              resolveModelBrandForRbac(m)
                            );
                            const sizesCount = hasLiskaniSizes
                              ? m.liskaniSizeVariants!.length
                              : prodProfile.sizes.length || 5;
                            const minSizeCost = hasLiskaniSizes
                              ? Math.min(...m.liskaniSizeVariants!.map((v) => v.unitCostRub))
                              : m.unitCostRub;
                            const maxSizeCost = hasLiskaniSizes
                              ? Math.max(...m.liskaniSizeVariants!.map((v) => v.unitCostRub))
                              : m.unitCostRub;

                            const confirmedPos = plan.approvedOrders.filter(
                              (o) => o.confirmedByFactory !== false
                            );
                            const poRub = confirmedPos.reduce((s, o) => s + o.totalOrderRub, 0);
                            const totalModelPacks =
                              plan.totalApprovedReceiptsPacks + plan.totalRecommendedPacks;
                            const totalModelUnits =
                              plan.totalApprovedReceiptsUnits + plan.totalRecommendedUnits;
                            const totalModelBudgetRub =
                              poRub + (plan.totalRecommendedBudgetRub || 0);

                            const soldCogsRub = hasLiskaniSizes
                              ? m.liskaniSizeVariants!.reduce(
                                  (acc, sv) => acc + sv.annualBuyoutsUnits * sv.unitCostRub,
                                  0
                                )
                              : plan.annualBuyoutsPacks * (m.unitCostRub || 0);

                            const firstDraft = plan.recommendedBatches[0];
                            const earliestPo = [...confirmedPos].sort(
                              (a, b) => a.arrivalMonthIdx - b.arrivalMonthIdx
                            )[0];
                            let w1Packs = 0;
                            let w1Rub = 0;
                            let w1Prepay = 0;
                            if (
                              earliestPo &&
                              (!firstDraft ||
                                earliestPo.arrivalMonthIdx <= firstDraft.firstCoveredMonthIdx)
                            ) {
                              const prepayPct =
                                m.sharedSupplyAndFact?.factoryParams.prepaymentPct ?? 30;
                              w1Packs = earliestPo.packsQty;
                              w1Rub = earliestPo.totalOrderRub;
                              w1Prepay = Math.round((earliestPo.totalOrderRub * prepayPct) / 100);
                            } else if (firstDraft) {
                              w1Packs = firstDraft.recommendedPacks;
                              w1Rub = firstDraft.estimatedTotalRub;
                              w1Prepay = firstDraft.prepaymentRub;
                            }

                            const restPacks = Math.max(0, totalModelPacks - w1Packs);
                            const restRub = Math.max(0, totalModelBudgetRub - w1Rub);
                            const baselineVariantBuyoutsSum = hasLiskaniSizes
                              ? m.liskaniSizeVariants!.reduce(
                                  (s, v) => s + (v.annualBuyoutsUnits || 0),
                                  0
                                )
                              : plan.annualDemandPacks;
                            const supplyScaleRatio =
                              baselineVariantBuyoutsSum > 0
                                ? totalModelPacks / baselineVariantBuyoutsSum
                                : 1;

                            const rowUnitCfg = getBrandUnitConfig(m);
                            const sizeRangeShortLabel = hasLiskaniSizes
                              ? `${sizesCount} разм.`
                              : prodProfile.sizes.length >= 2
                              ? `${prodProfile.sizes[0]}–${prodProfile.sizes[prodProfile.sizes.length - 1]}`
                              : 'S–XXL';

                            return (
                              <React.Fragment key={m.id}>
                                <tr
                                  onClick={toggleExpand}
                                  className={`cursor-pointer transition ${
                                    isExp
                                      ? 'bg-[#F8FAFC]'
                                      : 'hover:bg-[#F8FAFC]/80'
                                  }`}
                                >
                                  <td className="py-2.5 pr-3 pl-3.5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-[#0F172A]">{m.title}</span>
                                      <span className="rounded bg-[#EEF2F6] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#334155]">
                                        {sizeRangeShortLabel}
                                      </span>
                                    </div>
                                    <div className="font-mono text-[10.5px] text-[#64748B]">
                                      {m.code} · {getNormalizedProcurementCategoryLabel(m)} ·{' '}
                                      {rowUnitCfg.primaryUnit === 'пар'
                                        ? '1 пара'
                                        : hasLiskaniSizes
                                        ? `${sizesCount} разм. штор`
                                        : `${m.unitsInPack} ${rowUnitCfg.secondaryUnit}/${rowUnitCfg.primaryUnit}`}
                                    </div>
                                  </td>

                                  <td
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-2.5 py-2.5 text-right font-mono"
                                  >
                                    {!hasCost ? (
                                      <span className="text-[11px] font-semibold text-[#64748B]">
                                        Скрыто
                                      </span>
                                    ) : canEditRow ? (
                                      <div className="inline-flex items-center justify-end gap-1 rounded-lg border border-[#CBD5E1] bg-white px-2 py-1 hover:border-emerald-500 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 transition">
                                        <BufferedInlineNumberInput
                                          min={0}
                                          ariaLabel={`Себестоимость 1 ${rowUnitCfg.primaryUnit} ${m.code}`}
                                          value={Math.round(m.unitCostRub || 0)}
                                          onCommit={(nextVal) => {
                                            updateModelSpec(updateModelUnitCostWithVariants(m, nextVal));
                                          }}
                                          className="w-16 text-right font-mono text-[12px] font-bold text-[#0F172A] bg-transparent focus:outline-none"
                                        />
                                        <span className="text-[11px] font-semibold text-[#64748B]">₽</span>
                                      </div>
                                    ) : (
                                      <span className="font-mono text-[12px] font-bold text-[#0F172A]">
                                        {Math.round(m.unitCostRub || 0).toLocaleString('ru-RU')} ₽
                                      </span>
                                    )}
                                    {hasCost && hasLiskaniSizes && minSizeCost !== maxSizeCost && (
                                      <div className="mt-0.5 text-[10px] text-[#64748B]">
                                        {Math.round(minSizeCost)}–{Math.round(maxSizeCost)} ₽
                                      </div>
                                    )}
                                  </td>

                                  <td
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-2.5 py-2.5 text-right font-mono text-[#334155]"
                                  >
                                    <div>
                                      {plan.annualBuyoutsPacks.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit}
                                    </div>
                                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#5C5953] dark:text-[#9E9A92] font-medium">
                                      <span>Зак: {plan.annualOrdersPacks.toLocaleString('ru-RU')}</span>
                                      {canEditRow ? (
                                        <span className="inline-flex items-center rounded border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] px-1 py-0.5">
                                          <BufferedInlineNumberInput
                                            min={5}
                                            max={100}
                                            ariaLabel={`Процент выкупа ${m.code}`}
                                            value={plan.buyoutRatePct}
                                            onCommit={(nextPct) => {
                                              updateModelSpec(
                                                updateModelBuyoutRatePct(m, nextPct, {
                                                  scenarioId: rowScenario.id,
                                                })
                                              );
                                            }}
                                            className="w-8 bg-transparent text-right font-mono text-[10px] font-semibold text-[#141413] dark:text-[#F5F4F0] focus:outline-none"
                                          />
                                          <span>%</span>
                                        </span>
                                      ) : (
                                        <span className="font-mono text-[10px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                                          ({plan.buyoutRatePct}%)
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono font-semibold text-[#334155]">
                                    <div>{formatCostMln(soldCogsRub)}</div>
                                    {hasCost && (
                                      <div className="text-[10px] text-[#64748B]">
                                        {soldCogsRub.toLocaleString('ru-RU')} ₽
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono font-bold text-[#0F172A]">
                                    <div>
                                      {totalModelPacks.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit}
                                    </div>
                                    <div className="text-[10px] font-normal text-[#64748B]">
                                      {plan.procureByOrdersVolume
                                        ? `×${plan.orderMultiplier.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} под заказы (${plan.buyoutRatePct}%)`
                                        : rowUnitCfg.primaryUnit === 'пар' ||
                                          ((m.unitsInPack || 1) === 1 &&
                                            rowUnitCfg.primaryUnit === rowUnitCfg.secondaryUnit)
                                        ? 'под чистые выкупы'
                                        : `${totalModelUnits.toLocaleString('ru-RU')} ${rowUnitCfg.secondaryUnit}`}
                                    </div>
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono bg-emerald-500/4">
                                    <div className="font-bold text-emerald-700">
                                      {formatCostMln(w1Rub)}
                                    </div>
                                    <div className="text-[10px] text-[#475569]">
                                      {w1Packs.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit} · ав.{' '}
                                      {formatCostMln(w1Prepay)}
                                    </div>
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono text-[#334155]">
                                    <div className="font-semibold">{formatCostMln(restRub)}</div>
                                    <div className="text-[10px] text-[#64748B]">
                                      {restPacks.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit} (с WB)
                                    </div>
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono font-extrabold text-[#0F172A]">
                                    <div>{formatCostMln(totalModelBudgetRub)}</div>
                                    {hasCost && (
                                      <div className="text-[10px] font-normal text-[#64748B]">
                                        {totalModelBudgetRub.toLocaleString('ru-RU')} ₽
                                      </div>
                                    )}
                                  </td>

                                  <td
                                    onClick={(e) => e.stopPropagation()}
                                    className="py-2.5 pr-3.5 pl-2.5 text-right"
                                  >
                                    <div className="inline-flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={toggleExpand}
                                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                                          isExp
                                            ? 'border-[#94A3B8] bg-[#E2E8F0] text-[#0F172A]'
                                            : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#1E293B] hover:bg-[#E2E8F0]'
                                        }`}
                                      >
                                        {isExp
                                          ? 'Скрыть ▴'
                                          : `Размеры (${sizesCount}) ▾`}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedSkuId(m.id);
                                          setWavesCalendarOpen(false);
                                          setScenarioDrawerTab('none');
                                        }}
                                        className="rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer"
                                      >
                                        Открыть партии →
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {/* РАСКРЫТАЯ ДЕТАЛИЗАЦИЯ ПО РАЗМЕРАМ И КВАРТАЛЬНЫМ ПАРТИЯМ ПРЯМО В СВОДНОЙ ТАБЛИЦЕ */}
                                {isExp && (
                                  <tr>
                                    <td colSpan={9} className="bg-[#F8FAFC] px-4 py-3.5 border-b border-[#CBD5E1]">
                                      <div className="space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <div className="text-[12.5px] font-bold text-[#0F172A]">
                                            Детализация закупки карточки «{m.title}» ({m.code}) по размерам и 4 квартальным волнам
                                          </div>
                                          <div className="flex items-center gap-2 text-[11.5px]">
                                            <span className="text-[#475569]">
                                              Партий в плане: <strong>{plan.recommendedBatches.length}</strong> · Утв. PO: <strong>{plan.approvedOrders.length}</strong>
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSelectedSkuId(m.id);
                                                setWavesCalendarOpen(false);
                                                setScenarioDrawerTab('none');
                                              }}
                                              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-[11px] font-semibold cursor-pointer"
                                            >
                                              Редактировать партии и даты ({m.code}) →
                                            </button>
                                          </div>
                                        </div>

                                        {hasLiskaniSizes ? (
                                          <div className="overflow-x-auto rounded-lg border border-[#CBD5E1] bg-white">
                                            <table className="w-full min-w-[820px] border-collapse text-left text-[11.5px]">
                                              <thead>
                                                <tr className="border-b border-[#E2E8F0] bg-[#F1F5F9] text-[10px] font-bold uppercase tracking-wider text-[#475569]">
                                                  <th className="py-2 px-3">Размер полотна / SKU</th>
                                                  <th className="py-2 px-2.5 text-right">Себестоимость</th>
                                                  <th className="py-2 px-2.5 text-right">Выкупы (год)</th>
                                                  <th className="py-2 px-2.5 text-right">Себест. выкупов</th>
                                                  <th className="py-2 px-2.5 text-right bg-emerald-500/8 text-emerald-800">
                                                    Q1 (Янв–Мар)
                                                  </th>
                                                  <th className="py-2 px-2.5 text-right">Q2 (Апр–Июн)</th>
                                                  <th className="py-2 px-2.5 text-right">Q3 (Июл–Сен)</th>
                                                  <th className="py-2 px-2.5 text-right">Q4 (Окт–Дек)</th>
                                                  <th className="py-2 px-2.5 text-right">К заказу (год)</th>
                                                  <th className="py-2 px-3 text-right">Бюджет закупки</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-[#EEF2F6]">
                                                {m.liskaniSizeVariants!.map((sv) => {
                                                  const q1Demand =
                                                    (sv.monthlyBuyoutsUnits[0] || 0) +
                                                    (sv.monthlyBuyoutsUnits[1] || 0) +
                                                    (sv.monthlyBuyoutsUnits[2] || 0);
                                                  const q2Demand =
                                                    (sv.monthlyBuyoutsUnits[3] || 0) +
                                                    (sv.monthlyBuyoutsUnits[4] || 0) +
                                                    (sv.monthlyBuyoutsUnits[5] || 0);
                                                  const q3Demand =
                                                    (sv.monthlyBuyoutsUnits[6] || 0) +
                                                    (sv.monthlyBuyoutsUnits[7] || 0) +
                                                    (sv.monthlyBuyoutsUnits[8] || 0);
                                                  const q4Demand =
                                                    (sv.monthlyBuyoutsUnits[9] || 0) +
                                                    (sv.monthlyBuyoutsUnits[10] || 0) +
                                                    (sv.monthlyBuyoutsUnits[11] || 0);

                                                  const q1Order = Math.round(q1Demand * supplyScaleRatio);
                                                  const q2Order = Math.round(q2Demand * supplyScaleRatio);
                                                  const q3Order = Math.round(q3Demand * supplyScaleRatio);
                                                  const totalSzOrder = Math.round(
                                                    sv.annualBuyoutsUnits * supplyScaleRatio
                                                  );
                                                  const q4Order = Math.max(
                                                    0,
                                                    totalSzOrder - q1Order - q2Order - q3Order
                                                  );
                                                  const szSoldCogsRub =
                                                    sv.annualBuyoutsUnits * sv.unitCostRub;
                                                  const szBudgetRub = totalSzOrder * sv.unitCostRub;

                                                  return (
                                                    <tr key={sv.sellerSku} className="hover:bg-[#F8FAFC]">
                                                      <td className="py-2 px-3">
                                                        <span className="font-bold text-[#0F172A]">
                                                          {sv.sizeCm}
                                                        </span>{' '}
                                                        <span className="font-mono text-[10px] text-[#64748B]">
                                                          ({sv.sellerSku})
                                                        </span>
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono font-bold text-[#0F172A]">
                                                        {!hasCost ? (
                                                          <span className="text-[11px] font-semibold text-[#64748B]">
                                                            Скрыто
                                                          </span>
                                                        ) : canEditRow ? (
                                                          <div className="inline-flex items-center justify-end gap-1 rounded-md border border-[#CBD5E1] bg-white px-2 py-0.5 hover:border-emerald-500 focus-within:border-emerald-600">
                                                            <input
                                                              type="number"
                                                              min={0}
                                                              step={10}
                                                              aria-label={`Себестоимость размера ${sv.sizeCm} (${sv.sellerSku})`}
                                                              value={Math.round(sv.unitCostRub || 0)}
                                                              onChange={(e) => {
                                                                const nextVal = Math.max(
                                                                  0,
                                                                  Math.round(Number(e.target.value) || 0)
                                                                );
                                                                updateModelSpec(
                                                                  updateModelSizeVariantUnitCost(
                                                                    m,
                                                                    sv.skuIndex,
                                                                    nextVal
                                                                  )
                                                                );
                                                              }}
                                                              className="w-15 text-right font-mono text-[11.5px] font-bold text-[#0F172A] bg-transparent focus:outline-none"
                                                            />
                                                            <span className="text-[10px] font-semibold text-[#64748B]">
                                                              ₽
                                                            </span>
                                                          </div>
                                                        ) : (
                                                          <span>
                                                            {Math.round(sv.unitCostRub || 0).toLocaleString('ru-RU')} ₽
                                                          </span>
                                                        )}
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#334155]">
                                                        {sv.annualBuyoutsUnits.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit}
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#334155]">
                                                        {hasCost ? `${szSoldCogsRub.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono font-semibold text-emerald-700 bg-emerald-500/4">
                                                        {q1Order.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit}
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#475569]">
                                                        {q2Order.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit}
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#475569]">
                                                        {q3Order.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit}
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#475569]">
                                                        {q4Order.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit}
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono font-bold text-[#0F172A]">
                                                        {totalSzOrder.toLocaleString('ru-RU')} {rowUnitCfg.primaryUnit}
                                                      </td>
                                                      <td className="py-2 px-3 text-right font-mono font-bold text-[#0F172A]">
                                                        {hasCost ? `${szBudgetRub.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                            {(() => {
                                              const unitCfg = getBrandUnitConfig(m);
                                              const formatModelQty = (packsQty: number, physUnitsQty: number) => {
                                                if (unitCfg.primaryUnit === 'пар') {
                                                  return `${packsQty.toLocaleString('ru-RU')} пар`;
                                                }
                                                if ((m.unitsInPack || 1) > 1) {
                                                  return `${packsQty.toLocaleString('ru-RU')} ${unitCfg.primaryUnit} (${physUnitsQty.toLocaleString('ru-RU')} ${unitCfg.secondaryUnit})`;
                                                }
                                                return `${packsQty.toLocaleString('ru-RU')} ${unitCfg.primaryUnit}`;
                                              };

                                              return (
                                                <>
                                                  {confirmedPos.map((po) => (
                                                    <div
                                                      key={po.id}
                                                      className="rounded-lg border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-500/10 p-3 space-y-1.5 flex flex-col justify-between"
                                                    >
                                                      <div className="space-y-1">
                                                        <div className="flex items-center justify-between text-[11px]">
                                                          <span className="font-bold text-emerald-950 dark:text-emerald-200">
                                                            ✓ {po.orderNumber} · {po.coverageMonthsLabel || MONTHS_SHORT_RU[po.arrivalMonthIdx]}
                                                          </span>
                                                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                                                            {formatCostMln(po.totalOrderRub)}
                                                          </span>
                                                        </div>
                                                        <div className="font-mono text-[12px] font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                                                          {formatModelQty(po.packsQty, po.physicalUnitsQty)}
                                                        </div>
                                                        <div className="text-[10.5px] text-emerald-900/80 dark:text-emerald-200/80 flex items-center justify-between">
                                                          <span>Аванс: {formatCostMln(po.prepaymentRub)}</span>
                                                          <span>Приход: {po.requiredArrivalDateIso}</span>
                                                        </div>
                                                      </div>
                                                      <div className="pt-1 flex items-center justify-between gap-2 border-t border-emerald-200/70 dark:border-emerald-500/25">
                                                        <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-medium">
                                                          Подтверждён PO
                                                        </span>
                                                        {canEditRow && (
                                                          <button
                                                            type="button"
                                                            onClick={() => {
                                                              const nextM = removeApprovedPurchaseOrder(
                                                                m,
                                                                po.id,
                                                                auditAuthor
                                                              );
                                                              updateModelSpec(nextM);
                                                              notify(
                                                                'success',
                                                                `Заказ ${po.orderNumber} (${m.code}) возвращён в плановые партии`
                                                              );
                                                            }}
                                                            className="rounded-md bg-white dark:bg-[#121620] hover:bg-rose-50 dark:hover:bg-rose-500/20 text-slate-700 dark:text-slate-200 hover:text-rose-700 dark:hover:text-rose-300 border border-emerald-300/80 dark:border-emerald-500/35 px-2 py-0.5 text-[10px] font-semibold transition cursor-pointer"
                                                          >
                                                            ↺ В черновик
                                                          </button>
                                                        )}
                                                      </div>
                                                    </div>
                                                  ))}

                                                  {plan.recommendedBatches.map((rb, bIdx) => {
                                                    const canonicalKeys = ['S', 'M', 'L', 'XL', 'XXL'] as const;
                                                    const mappedSizesText =
                                                      prodProfile.sizes.length === 5 &&
                                                      prodProfile.sizes[0] !== 'S'
                                                        ? prodProfile.sizes
                                                            .map(
                                                              (szLabel, sIdx) =>
                                                                `${szLabel}:${rb.sizeBreakdownPacks[canonicalKeys[sIdx]] || 0}`
                                                            )
                                                            .join(' ')
                                                        : prodProfile.sizes.length > 0 &&
                                                          prodProfile.sizes[0] !== 'S'
                                                        ? allocatePacksAcrossProfileSizes(
                                                            rb.recommendedPacks,
                                                            prodProfile.sizes,
                                                            prodProfile.sizeSharesPct
                                                          )
                                                            .map((item) => `${item.label}:${item.qty}`)
                                                            .join(' ')
                                                        : `S:${rb.sizeBreakdownPacks.S} M:${rb.sizeBreakdownPacks.M} L:${rb.sizeBreakdownPacks.L} XL:${rb.sizeBreakdownPacks.XL} XXL:${rb.sizeBreakdownPacks.XXL}`;

                                                    return (
                                                      <div
                                                        key={rb.periodId}
                                                        className="rounded-lg border border-[#CBD5E1] dark:border-[#283246] bg-white dark:bg-[#121620] p-3 space-y-1.5 flex flex-col justify-between"
                                                      >
                                                        <div className="space-y-1">
                                                          <div className="flex items-center justify-between text-[11px]">
                                                            <span className="font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                                                              Партия №{bIdx + 1} · {rb.coverageMonthsLabel}
                                                            </span>
                                                            <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                                                              {formatCostMln(rb.estimatedTotalRub)}
                                                            </span>
                                                          </div>
                                                          <div className="font-mono text-[12px] font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                                                            {formatModelQty(rb.recommendedPacks, rb.physicalUnitsQty)}
                                                          </div>
                                                          <div className="text-[10.5px] text-[#64748B] dark:text-slate-400">
                                                            Аванс: {formatCostMln(rb.prepaymentRub)} · Доплата: {formatCostMln(rb.balancePaymentRub)}
                                                          </div>
                                                          <div className="font-mono text-[10px] text-[#475569] dark:text-slate-300 bg-slate-50 dark:bg-[#181D2A] rounded px-1.5 py-0.5">
                                                            {mappedSizesText}
                                                          </div>
                                                        </div>
                                                        <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-[#222938]">
                                                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                                            Заказ до {rb.recommendedOrderDateIso}
                                                          </span>
                                                          {canEditRow && (
                                                            <button
                                                              type="button"
                                                              onClick={() => {
                                                                const nextM = approveRecommendedBatch(
                                                                  m,
                                                                  rb,
                                                                  auditAuthor
                                                                );
                                                                updateModelSpec(nextM);
                                                                notify(
                                                                  'success',
                                                                  `Партия ${rb.coverageMonthsLabel} (${m.code}) утверждена в PO`
                                                                );
                                                              }}
                                                              className="rounded-md bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-600 dark:hover:bg-emerald-500 text-emerald-800 dark:text-emerald-300 hover:text-white dark:hover:text-slate-950 border border-emerald-300 dark:border-emerald-500/35 px-2 py-0.5 text-[10.5px] font-bold transition cursor-pointer"
                                                            >
                                                              ✓ Утвердить в PO
                                                            </button>
                                                          )}
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </>
                                              );
                                            })()}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-[#CBD5E1] bg-[#F1F5F9] font-extrabold text-[#0F172A]">
                            <td className="py-3 pr-3 pl-3.5">
                              ИТОГО ПО СЦЕНАРИЮ ({procData.perSku.length} мод.)
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono">
                              {!hasCost
                                ? 'Скрыто'
                                : scopeUnitInfo.isMixed
                                ? 'по брендам'
                                : `~${
                                    procData.annualDemandPacks > 0
                                      ? Math.round(
                                          investmentSummary.annualSoldGoodsCostRub /
                                            procData.annualDemandPacks
                                        ).toLocaleString('ru-RU')
                                      : 0
                                  } ₽`}
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono">
                              {scopeUnitInfo.isMixed ? (
                                <div className="space-y-0.5 text-[10.5px] leading-tight">
                                  {groupQuantitiesByPrimaryUnit(
                                    procData.perSku.map((x) => ({
                                      unit: getBrandUnitConfig(x.model).primaryUnit,
                                      qty: x.plan.annualDemandPacks,
                                    }))
                                  ).map((g) => (
                                    <div key={g.unit}>
                                      {g.qty.toLocaleString('ru-RU')} {g.unit}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                `${procData.annualDemandPacks.toLocaleString('ru-RU')} ${scopeUnitInfo.primaryUnit}`
                              )}
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono">
                              {formatCostMln(investmentSummary.annualSoldGoodsCostRub)}
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono">
                              {scopeUnitInfo.isMixed ? (
                                <div className="space-y-0.5 text-[10.5px] leading-tight">
                                  {groupQuantitiesByPrimaryUnit(
                                    procData.perSku.map((x) => ({
                                      unit: getBrandUnitConfig(x.model).primaryUnit,
                                      qty:
                                        x.plan.totalApprovedReceiptsPacks +
                                        x.plan.totalRecommendedPacks,
                                    }))
                                  ).map((g) => (
                                    <div key={g.unit}>
                                      {g.qty.toLocaleString('ru-RU')} {g.unit}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                `${procData.totalScenarioPacks.toLocaleString('ru-RU')} ${scopeUnitInfo.primaryUnit}`
                              )}
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono text-emerald-700 bg-emerald-500/8">
                              <div>{formatCostMln(procData.firstWaveBudgetRub)}</div>
                              <div className="text-[10px] font-semibold text-[#475569]">
                                ав. {formatCostMln(procData.firstWavePrepaymentRub)}
                              </div>
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono">
                              {formatCostMln(
                                Math.max(
                                  0,
                                  procData.totalScenarioBudgetRub - procData.firstWaveBudgetRub
                                )
                              )}
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono text-[13px]">
                              {formatCostMln(procData.totalScenarioBudgetRub)}
                            </td>
                            <td className="py-3 pr-3.5 pl-2.5 text-right font-mono text-[11px] text-[#475569]">
                              100% сводки
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ГЛАВНЫЙ ИНТЕРФЕЙС ЗАКУПОК ВЫБРАННОЙ МОДЕЛИ (отображается только в режиме «По товару», без наложения сводных блоков сверху) */}
          {activeSkuModel && !wavesCalendarOpen && scenarioDrawerTab === 'none' && (() => {
            const activeSkuEntry = scopedModelEntries.find(
              (entry) => entry.model.id === activeSkuModel.id
            );
            const effectiveWorkbenchScenario = activeSkuEntry?.scenario || currentScenario;
            return (
            <SkuProcurementMvpWorkbench
              key={activeSkuModel.id}
              model={activeSkuModel}
              scenario={effectiveWorkbenchScenario}
              currentScenario={effectiveWorkbenchScenario}
              onUpdateModel={updateModelSpec}
              onNotify={(title, message, type = 'success') => notify(type, title, message)}
              onOpenSalesMatrix={() => navigateTo('launch-calendar')}
              headerLeftSlot={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWavesCalendarOpen(false);
                      setScenarioDrawerTab('skus');
                    }}
                    className="h-9 px-3 rounded-[8px] border border-[#CBD5E1] bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[12px] font-semibold text-[#1E293B] cursor-pointer flex items-center gap-1.5"
                    title="Вернуться к сводной ведомости и детализации закупок всех SKU"
                  >
                    <span>← Сводка всех закупок ({procData.perSku.length} SKU)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStepSku(-1)}
                    title="Предыдущая модель"
                    className="h-9 w-8 rounded-[8px] border border-[#CFCEC6] bg-[#FAF9F6] text-[14px] font-bold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer flex items-center justify-center"
                  >
                    ‹
                  </button>
                  <select
                    aria-label="Выбор модели для закупок"
                    value={activeSkuModel.id}
                    onChange={(e) => setSelectedSkuId(e.target.value)}
                    className="h-9 min-w-[260px] max-w-[460px] rounded-[8px] border border-[#CFCEC6] bg-[#FAF9F6] px-3 text-[13.5px] font-extrabold text-[#141413] hover:border-[#141413] focus:border-[#141413] focus:bg-white focus:outline-none cursor-pointer"
                  >
                    {filteredSkus.map(({ model: m, plan }) => {
                      const optUnit = getBrandUnitConfig(m);
                      const packSuffix =
                        (m.unitsInPack || 1) === 1 && optUnit.primaryUnit === optUnit.secondaryUnit
                          ? ''
                          : ` · ${m.unitsInPack} ${optUnit.secondaryUnit}`;
                      return (
                        <option key={m.id} value={m.id}>
                          {m.title} ({m.code}
                          {packSuffix}) — {plan.totalRecommendedPacks.toLocaleString('ru-RU')}{' '}
                          {optUnit.primaryUnit}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleStepSku(1)}
                    title="Следующая модель"
                    className="h-9 w-8 rounded-[8px] border border-[#CFCEC6] bg-[#FAF9F6] text-[14px] font-bold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer flex items-center justify-center"
                  >
                    ›
                  </button>
                  <span className="rounded-md bg-[#F4F3EE] border border-[#E2E1D9] px-2 py-1 font-mono text-[11px] font-semibold text-[#5C5B55]">
                    {filteredSkus.length > 0 ? `${activeSkuIndex + 1} / ${filteredSkus.length}` : '0'}
                  </span>
                  <input
                    type="text"
                    value={skuSearch}
                    onChange={(e) => setSkuSearch(e.target.value)}
                    placeholder="Поиск модели..."
                    className="h-9 w-40 rounded-[8px] border border-[#DFDED7] bg-[#FAF9F6] px-2.5 text-[12px] text-[#141413] placeholder:text-[#8E8D85] focus:w-52 focus:border-[#141413] focus:bg-white focus:outline-none transition-all"
                  />
                </div>
              }
            />
            );
          })()}
        </>
      )}
    </div>
  );
}

// =============================================================================
// 04 · ФИНАНСЫ: РЕАЛЬНЫЙ P&L, КЭШФЛОУ И ОБОРОТНЫЙ КАПИТАЛ СЦЕНАРИЕВ 2027
// =============================================================================
export function FinanceContourView() {
  const { currentUser, navigateTo, notify, brandFilter, setBrandFilter } = usePlatform();
  const {
    models,
    scenarios,
    orderedScenarios,
    currentScenario,
    selectedScenarioId,
    selectedScenarioByBrand,
    setSelectedScenarioId,
    includeGroupPortfolioInS1,
    setIncludeGroupPortfolioInS1,
    scenarioAllEligibleModels,
    eligibleModels,
    totals,
    applyIndustryNormsToAllModels,
    launchStarterCabinet,
  } = useLiveScenarioPortfolio();

  const [subTab, setSubTab] = useState<'scenarios-pnl' | 'legacy-plan-fact'>(
    'scenarios-pnl'
  );
  const [initialCashMln, setInitialCashMln] = useState<number>(() => {
    const saved = safeGetStorageJson<{ initialCashMln?: number }>(
      'borners_finance_contour_params_v1'
    );
    return typeof saved?.initialCashMln === 'number' ? saved.initialCashMln : 0;
  });
  const [wbLagMonths, setWbLagMonths] = useState<number>(() => {
    const saved = safeGetStorageJson<{ wbLagMonths?: number }>(
      'borners_finance_contour_params_v1'
    );
    return typeof saved?.wbLagMonths === 'number' ? saved.wbLagMonths : 0;
  });
  const [whatIfOpen, setWhatIfOpen] = useState<boolean>(false);
  const [whatIfPriceDelta, setWhatIfPriceDelta] = useState<number>(() => {
    const saved = safeGetStorageJson<{ whatIfPriceDelta?: number }>(
      'borners_finance_contour_params_v1'
    );
    return typeof saved?.whatIfPriceDelta === 'number' ? saved.whatIfPriceDelta : 0;
  });
  const [whatIfCostDelta, setWhatIfCostDelta] = useState<number>(() => {
    const saved = safeGetStorageJson<{ whatIfCostDelta?: number }>(
      'borners_finance_contour_params_v1'
    );
    return typeof saved?.whatIfCostDelta === 'number' ? saved.whatIfCostDelta : 0;
  });
  const [whatIfMpAdsDelta, setWhatIfMpAdsDelta] = useState<number>(() => {
    const saved = safeGetStorageJson<{ whatIfMpAdsDelta?: number }>(
      'borners_finance_contour_params_v1'
    );
    return typeof saved?.whatIfMpAdsDelta === 'number' ? saved.whatIfMpAdsDelta : 0;
  });

  useEffect(() => {
    writeStoredFinanceContourParams({
      initialCashMln,
      wbLagMonths,
      whatIfPriceDelta,
      whatIfCostDelta,
      whatIfMpAdsDelta,
    });
  }, [initialCashMln, wbLagMonths, whatIfPriceDelta, whatIfCostDelta, whatIfMpAdsDelta]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncParams = () => {
      const saved = readStoredFinanceContourParams();
      if (typeof saved.initialCashMln === 'number') {
        setInitialCashMln((prev) => (prev === saved.initialCashMln ? prev : saved.initialCashMln!));
      }
      if (typeof saved.wbLagMonths === 'number') {
        setWbLagMonths((prev) => (prev === saved.wbLagMonths ? prev : saved.wbLagMonths!));
      }
      if (typeof saved.whatIfPriceDelta === 'number') {
        setWhatIfPriceDelta((prev) =>
          prev === saved.whatIfPriceDelta ? prev : saved.whatIfPriceDelta!
        );
      }
      if (typeof saved.whatIfCostDelta === 'number') {
        setWhatIfCostDelta((prev) =>
          prev === saved.whatIfCostDelta ? prev : saved.whatIfCostDelta!
        );
      }
      if (typeof saved.whatIfMpAdsDelta === 'number') {
        setWhatIfMpAdsDelta((prev) =>
          prev === saved.whatIfMpAdsDelta ? prev : saved.whatIfMpAdsDelta!
        );
      }
    };
    window.addEventListener('borners-finance-params-changed', syncParams);
    window.addEventListener('storage', syncParams);
    return () => {
      window.removeEventListener('borners-finance-params-changed', syncParams);
      window.removeEventListener('storage', syncParams);
    };
  }, []);

  const hasFinance = canUserViewFinance(currentUser);
  const hasCost = canUserViewCostPrice(currentUser);
  const canEditActiveFinanceScope =
    brandFilter === 'ALL'
      ? ['BORNERS', 'FUKAI', 'NA_TELE', 'AKUSHA', 'LISKANI'].some((code) =>
          canUserEditBrand(currentUser, code)
        )
      : canUserEditBrand(currentUser, brandFilter);

  const isHoldingAllBrands = brandFilter === 'ALL';
  const holdingSourceModels = models.length > 0 ? models : scenarioAllEligibleModels;

  const singleScenarioInvestmentSummary = useMemo(
    () =>
      computeScenarioInvestmentSummary(eligibleModels, currentScenario, {
        initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
        settlementLagMonths: wbLagMonths < 0 ? null : wbLagMonths,
        wbPayoutScheduleSpecified: wbLagMonths >= 0,
      }),
    [eligibleModels, currentScenario, initialCashMln, wbLagMonths]
  );

  const holdingSummary = useMemo(
    () =>
      computeMultiBrandPortfolioSummary(
        holdingSourceModels,
        scenarios,
        selectedScenarioByBrand,
        {
          initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
          settlementLagMonths: wbLagMonths < 0 ? null : wbLagMonths,
          wbPayoutScheduleSpecified: wbLagMonths >= 0,
        }
      ),
    [
      holdingSourceModels,
      scenarios,
      selectedScenarioByBrand,
      initialCashMln,
      wbLagMonths,
    ]
  );

  const brandsReport = useMemo(() => {
    const effectiveSelectedByBrand = isHoldingAllBrands
      ? selectedScenarioByBrand
      : { ...selectedScenarioByBrand, [brandFilter]: currentScenario.id };
    const fullReport = computeGroupBrandsInvestmentReport(
      holdingSourceModels,
      currentScenario,
      {
        initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
        settlementLagMonths: wbLagMonths < 0 ? null : wbLagMonths,
        wbPayoutScheduleSpecified: wbLagMonths >= 0,
        allScenarios: scenarios,
        selectedScenarioByBrand: effectiveSelectedByBrand,
      }
    );
    if (isHoldingAllBrands) return fullReport;
    const scopedBrands = fullReport.brands.filter((b) => b.brandCode === brandFilter);
    const activeBrandRow = scopedBrands[0];
    return {
      brands: scopedBrands,
      groupTotal: activeBrandRow
        ? {
            ...fullReport.groupTotal,
            modelsCount: activeBrandRow.modelsCount,
            annualRevenueRub: activeBrandRow.annualRevenueRub,
            decemberRevenueRub: activeBrandRow.decemberRevenueRub,
            annualDemandPacks: activeBrandRow.annualDemandPacks,
            totalProcurementPacks: activeBrandRow.totalProcurementPacks,
            totalProcurementUnits: activeBrandRow.totalProcurementUnits,
            totalProcurementBudgetRub: activeBrandRow.totalProcurementBudgetRub,
            annualSoldGoodsCostRub: activeBrandRow.annualSoldGoodsCostRub,
            annualEstimatedOperatingProfitRub: activeBrandRow.annualEstimatedOperatingProfitRub,
            firstWaveStartBudgetRub: activeBrandRow.firstWaveStartBudgetRub,
            firstWavePrepaymentRub: activeBrandRow.firstWavePrepaymentRub,
            peakWorkingCapitalRub: activeBrandRow.peakWorkingCapitalRub,
            netOwnMoneyRequiredRub: activeBrandRow.peakWorkingCapitalRub,
            peakMonthIdx: activeBrandRow.peakMonthIdx,
            peakMonthLabel: activeBrandRow.peakMonthLabel,
            selfFundingMonthLabel: activeBrandRow.selfFundingMonthLabel,
          }
        : fullReport.groupTotal,
    };
  }, [
    isHoldingAllBrands,
    brandFilter,
    holdingSourceModels,
    currentScenario,
    initialCashMln,
    wbLagMonths,
    scenarios,
    selectedScenarioByBrand,
  ]);

  const scopedFinanceEntries = useMemo(() => {
    if (isHoldingAllBrands) {
      return buildHoldingScopedModelEntries(
        holdingSourceModels,
        scenarios,
        selectedScenarioByBrand,
        currentScenario,
        holdingSummary
      );
    }
    return eligibleModels.map((m) => ({ model: m, scenario: currentScenario }));
  }, [
    isHoldingAllBrands,
    holdingSourceModels,
    scenarios,
    selectedScenarioByBrand,
    currentScenario,
    holdingSummary,
    eligibleModels,
  ]);

  const finSummary = useMemo(() => {
    let totalCogsRub = 0;
    let totalGrossProfitRub = 0;
    let honestOpProfitRub = 0;
    let filledOpCount = 0;
    let unfilledOpCount = 0;
    let peakCapitalRub = 0;
    let totalFirstWavePacks = 0;

    const monthlyInflow = Array(12).fill(0) as number[];
    const monthlyProcOutflow = Array(12).fill(0) as number[];
    const monthlyVarOpexOutflow = Array(12).fill(0) as number[];
    const monthlyNet = Array(12).fill(0) as number[];

    const perSku = scopedFinanceEntries.map(({ model: m, scenario: modelScen }) => {
      const proc = computeProcurementPlan(m, modelScen);
      const pnl = computeFinancialPnL(m, modelScen, proc);

      const confirmedPos = proc.approvedOrders.filter(
        (o) => o.confirmedByFactory !== false
      );
      const earliestPo = [...confirmedPos].sort(
        (a, b) => a.arrivalMonthIdx - b.arrivalMonthIdx
      )[0];
      const firstDraft = proc.recommendedBatches[0];
      if (
        earliestPo &&
        (!firstDraft || earliestPo.arrivalMonthIdx <= firstDraft.firstCoveredMonthIdx)
      ) {
        totalFirstWavePacks += earliestPo.packsQty;
      } else if (firstDraft) {
        totalFirstWavePacks += firstDraft.recommendedPacks;
      }

      totalCogsRub += pnl.annualCogsRub || 0;
      totalGrossProfitRub += pnl.annualGrossProfitRub || 0;
      if (pnl.annualOperatingProfitRub !== null) {
        honestOpProfitRub += pnl.annualOperatingProfitRub;
        filledOpCount += 1;
      } else {
        unfilledOpCount += 1;
      }
      peakCapitalRub += pnl.peakCapitalDeficitRub;

      pnl.monthlyCashFlow.forEach((row, idx) => {
        monthlyInflow[idx] += row.inflowSalesRub;
        monthlyProcOutflow[idx] += row.outflowProcurementRub;
        monthlyVarOpexOutflow[idx] += row.outflowVariableAndOpexRub;
        monthlyNet[idx] += row.netCashFlowRub;
      });

      return { model: m, scenario: modelScen, pnl };
    });

    const cumulativeCash: number[] = [];
    let running = 0;
    for (let i = 0; i < 12; i++) {
      running += monthlyNet[i];
      cumulativeCash.push(running);
    }

    return {
      totalCogsRub,
      totalGrossProfitRub,
      honestOpProfitRub,
      filledOpCount,
      unfilledOpCount,
      peakCapitalRub,
      totalFirstWavePacks,
      monthlyInflow,
      monthlyProcOutflow,
      monthlyVarOpexOutflow,
      monthlyNet,
      cumulativeCash,
      perSku,
    };
  }, [scopedFinanceEntries]);

  const investmentSummary = useMemo(
    () =>
      isHoldingAllBrands
        ? {
            ...brandsReport.groupTotal,
            peakMonthIdx: holdingSummary.groupTotal.peakMonthIdx,
            peakMonthLabel: holdingSummary.groupTotal.peakMonthLabel,
            peakPhase: holdingSummary.groupTotal.peakPhase,
            peakPhaseLabelRu: holdingSummary.groupTotal.peakPhaseLabelRu,
            peakWindowHumanRu: holdingSummary.groupTotal.peakWindowHumanRu,
            monthsInDeficitCount: holdingSummary.groupTotal.monthsInDeficitCount,
            openingBalanceAtPeakMonthRub:
              holdingSummary.groupTotal.openingBalanceAtPeakMonthRub,
            prepayInPeakMonthRub: holdingSummary.groupTotal.prepayInPeakMonthRub,
            balancePayInPeakMonthRub: holdingSummary.groupTotal.balancePayInPeakMonthRub,
            wbInflowInPeakMonthRub: holdingSummary.groupTotal.wbInflowInPeakMonthRub,
            endOfPeakMonthBalanceRub: holdingSummary.groupTotal.endOfPeakMonthBalanceRub,
            selfFundingMonthIdx: holdingSummary.groupTotal.selfFundingMonthIdx,
            selfFundingMonthLabel: holdingSummary.groupTotal.selfFundingMonthLabel,
            yearEndCashBalanceRub: holdingSummary.groupTotal.yearEndCashBalanceRub,
            monthlyRows: holdingSummary.groupTotal.monthlyRows,
            firstWavePacks:
              brandsReport.groupTotal.firstWavePacks > 0
                ? brandsReport.groupTotal.firstWavePacks
                : finSummary.totalFirstWavePacks,
          }
        : singleScenarioInvestmentSummary,
    [
      isHoldingAllBrands,
      brandsReport.groupTotal,
      holdingSummary.groupTotal,
      finSummary.totalFirstWavePacks,
      singleScenarioInvestmentSummary,
    ]
  );

  const financeWavesSummary = useMemo(
    () =>
      computePortfolioProcurementWavesSummary(
        scopedFinanceEntries,
        investmentSummary.monthlyRows,
        currentScenario.year || 2027
      ),
    [scopedFinanceEntries, investmentSummary.monthlyRows, currentScenario.year]
  );

  const effectiveAnnualRevenueRub = isHoldingAllBrands
    ? holdingSummary.groupTotal.annualRevenueRub
    : totals.annualRevenueRub;

  if (!hasFinance) {
    return (
      <div className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-10 text-center space-y-2">
        <div className="text-[19px] font-bold text-[#141413]">
          Доступ к разделу «Финансы и прибыль» ограничен
        </div>
        <p className="text-[13px] text-[#5E5D58]">
          Текущая роль профиля не включает просмотр сводной прибыли и себестоимости партий.
        </p>
      </div>
    );
  }

  const openSkuPassport = (modelId: string) => {
    try {
      sessionStorage.setItem('borners_open_scenario_model_id', modelId);
      sessionStorage.setItem('borners_open_scenario_model_tab', 'finance');
    } catch {
      // ignore
    }
    navigateTo('dashboard');
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="rounded-[14px] bg-white border-[1.5px] border-[#C8C7BE] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[9px] bg-[#F2F1EC] border border-[#E2E1D9] p-0.5 text-[12.5px] font-semibold">
          <button
            type="button"
            onClick={() => setSubTab('scenarios-pnl')}
            className={`h-8 px-3.5 rounded-[7px] transition cursor-pointer ${
              subTab === 'scenarios-pnl'
                ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.08)] border border-[#D4D3C9]'
                : 'text-[#52514C] hover:text-[#141413] border border-transparent'
            }`}
          >
            Инвестиции, денежный поток и прибыль сценариев 2027
          </button>
          <button
            type="button"
            onClick={() => setSubTab('legacy-plan-fact')}
            className={`h-8 px-3.5 rounded-[7px] transition cursor-pointer ${
              subTab === 'legacy-plan-fact'
                ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.08)] border border-[#D4D3C9]'
                : 'text-[#52514C] hover:text-[#141413] border border-transparent'
            }`}
          >
            План / Факт и импорт таблиц CSV
          </button>
        </div>

        <span className="text-[12px] text-[#5E5D58]">
          Единый расчёт от плана продаж к закупкам, пику собственных денег и прибыли по брендам
        </span>
      </div>

      {subTab === 'legacy-plan-fact' ? (
        <FinanceView />
      ) : (
        <>
          <ScenarioContourHeader
            stepCode="04 · Финансы · Инвестиции, возврат с WB и прибыль"
            title="Инвестиционная потребность, возврат выручки с WB и прибыль 2027"
            subtitle="Раздельный расчёт: 1) Вложить на старт (Партия №1), 2) Пик своих денег с учётом возврата выручки WB, 3) Закупки за весь год и 4) Себестоимость продаж и прибыль."
            selectedScenarioId={selectedScenarioId}
            orderedScenarios={orderedScenarios}
            onSelectScenario={setSelectedScenarioId}
            includeGroupPortfolioInS1={includeGroupPortfolioInS1}
            onToggleGroupPortfolio={setIncludeGroupPortfolioInS1}
            eligibleCount={scopedFinanceEntries.length}
          />

          {scopedFinanceEntries.length === 0 && (
            <div className="rounded-[14px] bg-white border border-[#D8D7CF] p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="text-[14.5px] font-bold text-[#141413]">
                  В сценарии «{currentScenario.title}» нет моделей выбранного бренда ({brandFilter})
                </div>
                <p className="text-[12.5px] text-[#5E5D58]">
                  {brandFilter === 'NA_TELE'
                    ? 'Линейка «НА ТЕЛЕ» запускается со Сценария №2 · 150 млн ₽/мес и Сценария №3 · 200 млн ₽/мес. В исходном плане и Сценарии №1 участвуют модели BORNERS и WB.'
                    : 'Для выбранного фильтра бренда в текущем сценарии нет активных SKU. Переключите сценарий или сбросьте фильтр бренда.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => navigateTo('product-catalog', { brandId: brandFilter })}
                  className="h-8.5 px-3.5 rounded-lg bg-[#141413] dark:bg-[#F5F4F0] hover:opacity-90 text-white dark:text-[#141413] text-[12px] font-medium cursor-pointer transition-colors"
                >
                  + Добавить в Каталоге
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('product-lab', { brandId: brandFilter })}
                  className="h-8.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] border border-[#E4E1DA] text-[#141413] text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <FlaskConical className="h-3.5 w-3.5 text-[#5C5953]" strokeWidth={1.5} />
                  <span>Из Лаборатории R&D</span>
                </button>
                {(brandFilter === 'AKUSHA' ||
                  brandFilter === 'LISKANI' ||
                  brandFilter === 'NA_TELE') && (
                  <button
                    type="button"
                    onClick={() => {
                      const res = launchStarterCabinet(
                        brandFilter as 'AKUSHA' | 'LISKANI' | 'NA_TELE'
                      );
                      notify(
                        'success',
                        `Кабинет ${brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter} запущен (${res.addedCount} SKU)`
                      );
                    }}
                    className="h-8.5 px-3.5 rounded-lg bg-[#141413] hover:bg-[#282724] text-white text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Запустить стартовую матрицу (3 SKU)</span>
                  </button>
                )}
                {brandFilter === 'NA_TELE' && selectedScenarioId !== 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedScenarioId(2, 'NA_TELE');
                    }}
                    className="h-8.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] text-[12px] font-medium cursor-pointer transition-colors"
                  >
                    Переключить на Сценарий №2 · 150 млн
                  </button>
                )}
                {brandFilter === 'FUKAI' && selectedScenarioId === 1 && !includeGroupPortfolioInS1 && (
                  <button
                    type="button"
                    onClick={() => setIncludeGroupPortfolioInS1(true)}
                    className="h-8.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] text-[12px] font-medium cursor-pointer transition-colors"
                  >
                    Подключить портфель группы (с FUKAI)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBrandFilter('ALL')}
                  className="h-8.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-white border border-[#E4E1DA] hover:border-[#141413] text-[#141413] text-[12px] font-medium cursor-pointer transition-colors"
                >
                  Показать все бренды
                </button>
              </div>
            </div>
          )}

          {/* 4 РАЗДЕЛЁННЫХ ФИНАНСОВЫХ ПОКАЗАТЕЛЯ ПО ТЗ */}
          {(() => {
            const distinctFinUnits = Array.from(
              new Set(scopedFinanceEntries.map((e) => getBrandUnitConfig(e.model).primaryUnit))
            );
            const isMixedFinUnits = distinctFinUnits.length > 1;
            const finPrimaryUnit =
              !isMixedFinUnits && distinctFinUnits.length === 1
                ? distinctFinUnits[0]
                : !isHoldingAllBrands
                ? getBrandUnitConfig(brandFilter).primaryUnit
                : 'ед.';
            return (
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-1 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92]">
                    1. Вложить на старт (Партия №1 · Q1)
                  </div>
                  <div className="font-mono tabular-nums tracking-[-0.025em] text-2xl font-semibold text-[#141413] dark:text-[#F5F4F0]">
                    {hasCost ? formatMln(investmentSummary.firstWaveStartBudgetRub) : 'Скрыто'}
                  </div>
                  <div className="text-[11.5px] text-[#5C5953] dark:text-[#9E9A92]">
                    <strong className="text-[#141413] dark:text-[#F5F4F0]">
                      Аванс 30% сейчас:{' '}
                      {hasCost ? formatMln(investmentSummary.firstWavePrepaymentRub) : 'Скрыто'}
                    </strong>{' '}
                    ({investmentSummary.firstWavePacks.toLocaleString('ru-RU')} {finPrimaryUnit})
                  </div>
                </div>

                <div
                  onClick={() => {
                    const el = document.getElementById('peak-own-money-chart-anchor');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953] p-4 space-y-1 shadow-[0_1px_2px_rgba(20,20,19,0.04)] cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92]">
                      2. Пик своих денег (с оборотом WB)
                    </div>
                    <span className="rounded-md bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#141413] dark:text-[#F5F4F0]">
                      {wbLagMonths < 0
                        ? 'Лаг WB не задан'
                        : `Пик: ${investmentSummary.peakMonthLabel} ${currentScenario.year || 2027}`}
                    </span>
                  </div>
                  {!hasCost ? (
                    <div className="font-mono tabular-nums tracking-[-0.025em] text-2xl font-semibold text-[#141413] dark:text-[#F5F4F0]">
                      Скрыто
                    </div>
                  ) : wbLagMonths < 0 ? (
                    <div className="text-[13px] font-semibold text-[#5C5953] dark:text-[#9E9A92] pt-1 leading-snug">
                      Лаг WB не задан
                    </div>
                  ) : investmentSummary.verifiedOwnMoneyRequiredRub !== null &&
                    investmentSummary.verifiedOwnMoneyRequiredRub !== undefined ? (
                    <>
                      <div className="font-mono tabular-nums tracking-[-0.025em] text-2xl font-semibold text-[#B91C1C] dark:text-rose-400">
                        {formatMln(investmentSummary.verifiedOwnMoneyRequiredRub)}
                      </div>
                      <div className="text-[11px] text-[#5C5953] dark:text-[#9E9A92] leading-snug">
                        <strong className="text-[#141413] dark:text-[#F5F4F0]">
                          {investmentSummary.peakPhase === 'before_wb_inflow'
                            ? `1–15 ${investmentSummary.peakMonthLabel.toLowerCase()}. (до прихода WB)`
                            : `Конец ${investmentSummary.peakMonthLabel.toLowerCase()}.`}
                        </strong>
                        {investmentSummary.selfFundingMonthLabel
                          ? ` · с ${investmentSummary.selfFundingMonthLabel} — самоокупаемость из WB ↓`
                          : ' · нажмите для подробного графика ↓'}
                      </div>
                    </>
                  ) : (
                    <div className="text-[12.5px] font-medium text-[#5C5953] dark:text-[#9E9A92] pt-1 leading-snug">
                      {investmentSummary.ownMoneyStatusLabel}
                    </div>
                  )}
                </div>

                <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-1 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92]">
                    3. Закупки за год vs Себест. продаж
                  </div>
                  <div className="font-mono tabular-nums tracking-[-0.025em] text-2xl font-semibold text-[#141413] dark:text-[#F5F4F0]">
                    {hasCost ? formatMln(investmentSummary.totalProcurementBudgetRub) : 'Скрыто'}
                  </div>
                  <div className="text-[11.5px] text-[#5C5953] dark:text-[#9E9A92]">
                    Себестоимость проданного товара:{' '}
                    <strong className="text-[#141413] dark:text-[#F5F4F0]">
                      {hasCost ? formatMln(investmentSummary.annualSoldGoodsCostRub) : 'Скрыто'}
                    </strong>
                  </div>
                </div>

                <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-1 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92]">
                    4. Ожидаемая прибыль 2027 (после WB и рекламы)
                  </div>
                  <div className="font-mono tabular-nums tracking-[-0.025em] text-2xl font-semibold text-[#15803D] dark:text-emerald-400">
                    {hasCost
                      ? `+${formatMln(investmentSummary.annualEstimatedOperatingProfitRub)}`
                      : 'Скрыто'}
                  </div>
                  <div className="text-[11.5px] text-[#5C5953] dark:text-[#9E9A92]">
                    Выручка:{' '}
                    <strong className="text-[#141413] dark:text-[#F5F4F0]">
                      {formatMln(effectiveAnnualRevenueRub)}
                    </strong>{' '}
                    · Рентабельность:{' '}
                    <strong className="text-[#15803D] dark:text-emerald-400">
                      {hasCost
                        ? `${investmentSummary.operatingMarginPct.toFixed(1).replace('.', ',')}%`
                        : '—'}
                    </strong>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ИНТЕРАКТИВНЫЙ КАЛЬКУЛЯТОР «ЧТО ЕСЛИ?» В КОНТУРЕ 04 · ФИНАНСЫ */}
          {(() => {
            const sim = computeWhatIfSensitivitySimulation(
              {
                annualRevenueRub: effectiveAnnualRevenueRub,
                annualSoldGoodsCostRub: investmentSummary.annualSoldGoodsCostRub,
                annualEstimatedOperatingProfitRub:
                  investmentSummary.annualEstimatedOperatingProfitRub,
                totalProcurementBudgetRub: investmentSummary.totalProcurementBudgetRub,
                verifiedOwnMoneyRequiredRub:
                  investmentSummary.verifiedOwnMoneyRequiredRub ?? null,
              },
              {
                priceDeltaPct: whatIfPriceDelta,
                costDeltaPct: whatIfCostDelta,
                mpAndAdsDeltaPt: whatIfMpAdsDelta,
              }
            );
            const isModified =
              whatIfPriceDelta !== 0 || whatIfCostDelta !== 0 || whatIfMpAdsDelta !== 0;

            return (
              <section className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] px-5 py-3.5 space-y-4 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setWhatIfOpen((v) => !v)}
                      className="text-left cursor-pointer group"
                    >
                      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[#78746C] dark:text-[#9E9A92] inline-flex items-center gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                        <span>Симулятор чувствительности · Что если?</span>
                      </div>
                      <h2 className="text-[14.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] group-hover:opacity-80 transition-opacity">
                        Стресс-тест и точки роста прибыли{' '}
                        {isHoldingAllBrands
                          ? 'всех 5 брендов холдинга'
                          : `сценария «${currentScenario.title}»`}{' '}
                        {whatIfOpen ? '▴' : '▾'}
                      </h2>
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setWhatIfOpen(true);
                        setWhatIfPriceDelta(7);
                        setWhatIfCostDelta(-5);
                        setWhatIfMpAdsDelta(0);
                      }}
                      className="h-8 px-3 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] dark:bg-[#1D1C1A] dark:hover:bg-[#282724] border border-[#E4E1DA] dark:border-[#282724] text-[#15803D] dark:text-emerald-400 font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
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
                      className="h-8 px-3 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] dark:bg-[#1D1C1A] dark:hover:bg-[#282724] border border-[#E4E1DA] dark:border-[#282724] text-[#B91C1C] dark:text-rose-400 font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                      <span>Стресс-тест WB +4 п.п.</span>
                    </button>
                    {isModified && (
                      <button
                        type="button"
                        onClick={() => {
                          setWhatIfPriceDelta(0);
                          setWhatIfCostDelta(0);
                          setWhatIfMpAdsDelta(0);
                        }}
                        className="h-8 px-3 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] border border-[#E4E1DA] text-[#141413] font-medium cursor-pointer"
                      >
                        ↺ Сбросить
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setWhatIfOpen((v) => !v)}
                      className="h-8 px-3 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] text-[#141413] dark:text-[#F5F4F0] font-medium cursor-pointer"
                    >
                      {whatIfOpen ? 'Свернуть ▴' : 'Ползунки ▾'}
                    </button>
                  </div>
                </div>

                {whatIfOpen && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1 border-t border-[#E4E1DA] dark:border-[#282724]">
                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between font-medium">
                        <span>Розничная цена WB</span>
                        <span className="font-mono font-bold">
                          {whatIfPriceDelta > 0 ? `+${whatIfPriceDelta}%` : `${whatIfPriceDelta}%`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-15}
                        max={20}
                        step={1}
                        value={whatIfPriceDelta}
                        onChange={(e) => setWhatIfPriceDelta(Number(e.target.value))}
                        className="w-full accent-[#141413] cursor-pointer"
                      />
                    </div>

                    <div className="rounded-xl bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between font-medium">
                        <span>Себестоимость партий</span>
                        <span className="font-mono font-bold">
                          {whatIfCostDelta > 0 ? `+${whatIfCostDelta}%` : `${whatIfCostDelta}%`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-15}
                        max={25}
                        step={1}
                        value={whatIfCostDelta}
                        onChange={(e) => setWhatIfCostDelta(Number(e.target.value))}
                        className="w-full accent-[#141413] cursor-pointer"
                      />
                    </div>

                    <div className="rounded-xl bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between font-medium">
                        <span>Комиссия WB и ДРР</span>
                        <span className="font-mono font-bold">
                          {whatIfMpAdsDelta > 0
                            ? `+${whatIfMpAdsDelta} п.п.`
                            : `${whatIfMpAdsDelta} п.п.`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-5}
                        max={10}
                        step={0.5}
                        value={whatIfMpAdsDelta}
                        onChange={(e) => setWhatIfMpAdsDelta(Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="lg:col-span-5 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/25 p-3">
                      <div className="text-[11px] text-[#64748B]">Новая прибыль</div>
                      <div className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                        {hasCost ? `+${formatMln(sim.simulatedProfitRub)}` : 'Скрыто'}
                      </div>
                      <div className="font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400">
                        {hasCost
                          ? `${sim.profitDeltaRub >= 0 ? 'Δ +' : 'Δ −'}${formatMln(Math.abs(sim.profitDeltaRub))}`
                          : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E6EE] p-3">
                      <div className="text-[11px] text-[#64748B]">Новая выручка</div>
                      <div className="font-mono text-base font-bold text-[#0F172A] mt-0.5">
                        {formatMln(sim.simulatedRevenueRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#64748B]">
                        {hasCost
                          ? `Маржа ${sim.simulatedMarginPct.toFixed(1).replace('.', ',')}%`
                          : 'Скрыто'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E6EE] p-3">
                      <div className="text-[11px] text-[#64748B]">Пик своих денег</div>
                      <div className="font-mono text-base font-bold text-[#0F172A] mt-0.5">
                        {!hasCost
                          ? 'Скрыто'
                          : wbLagMonths < 0
                          ? 'Лаг WB не задан'
                          : formatMln(sim.simulatedOwnCapitalRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400">
                        {hasCost && wbLagMonths >= 0 && sim.simulatedRoiMult
                          ? `ROI ×${sim.simulatedRoiMult}`
                          : 'с WB'}
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </section>
            );
          })()}

          {/* 01 · СВОДНАЯ ТАБЛИЦА ИНВЕСТИЦИЙ И ПРИБЫЛИ ПО БРЕНДАМ ГРУППЫ (РАЗДЕЛ 09.2 ТЗ) */}
          <section className="rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-5 md:p-6 space-y-4 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
                  01 · Сводная таблица по брендам и группе (2027)
                </div>
                <h2 className="text-[18px] font-bold text-[#141413] mt-0.5">
                  Сколько нужно инвестировать и какая прибыль по каждому бренду и всей группе
                </h2>
              </div>
              {brandFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setBrandFilter('ALL')}
                  className="rounded-[8px] border border-amber-300 bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
                >
                  Сбросить фильтр бренда ({brandFilter}) ×
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
              <table className="w-full min-w-[820px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4] text-[11px] uppercase tracking-wide">
                    <th className="py-2.5 px-3.5 font-bold">Бренд</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Моделей</th>
                    <th className="py-2.5 px-3 font-bold text-right">План выручки 2027</th>
                    <th className="py-2.5 px-3 font-bold text-right">К заказу</th>
                    <th className="py-2.5 px-3 font-bold text-right bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      Вложить на старт (Q1)
                    </th>
                    <th className="py-2.5 px-3 font-bold text-right bg-[#F1F5F9] dark:bg-[#1E2536] text-[#0F172A] dark:text-[#EDF0F7]">
                      Пик своих денег (с WB)
                    </th>
                    <th className="py-2.5 px-3 font-bold text-right">Закупки за год</th>
                    <th className="py-2.5 px-3 font-bold text-right">Себест. продаж</th>
                    <th className="py-2.5 px-3.5 font-bold text-right">Ожидаемая прибыль</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E3DC]">
                  {brandsReport.brands.map((b) => (
                    <tr
                      key={b.brandCode}
                      onClick={() => {
                        const mb = holdingSummary.brands.find(
                          (hb) => hb.brandCode === b.brandCode
                        );
                        if (mb && typeof mb.selectedScenarioId === 'number') {
                          setSelectedScenarioId(mb.selectedScenarioId, b.brandCode);
                        }
                        setBrandFilter(b.brandCode);
                      }}
                      className={`hover:bg-[#FAFAF7] cursor-pointer transition ${
                        brandFilter === b.brandCode ? 'bg-amber-50/60 font-semibold' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-bold text-[#141413]">{b.brandTitle}</td>
                      <td className="py-2.5 px-2.5 text-right font-mono text-[#52514C]">
                        {b.modelsCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#141413]">
                        {b.modelsCount > 0 ? formatMln(b.annualRevenueRub) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#3D3C38]">
                        {b.modelsCount > 0
                          ? `${b.totalProcurementPacks.toLocaleString('ru-RU')} ${getBrandUnitConfig(b.brandCode).primaryUnit}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono bg-emerald-500/6 text-emerald-700 dark:text-emerald-300">
                        {b.modelsCount > 0 ? (
                          hasCost ? (
                            <div>
                              <div className="font-bold">{formatMln(b.firstWaveStartBudgetRub)}</div>
                              <div className="text-[10.5px] text-emerald-600/80 dark:text-emerald-400/80">
                                аванс 30%: {formatMln(b.firstWavePrepaymentRub)}
                              </div>
                            </div>
                          ) : (
                            'Скрыто'
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold bg-[#F8FAFC] dark:bg-[#161C28] text-[#0F172A] dark:text-[#EDF0F7]">
                        {b.modelsCount > 0 ? (
                          !hasCost ? (
                            'Скрыто'
                          ) : wbLagMonths < 0 ? (
                            <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                              Лаг WB не задан
                            </span>
                          ) : (
                            <div>
                              <div>{formatMln(b.peakWorkingCapitalRub)}</div>
                              <div className="text-[10px] font-normal text-amber-800 dark:text-amber-300">
                                пик: {b.peakMonthLabel || 'Янв'}
                                {b.selfFundingMonthLabel
                                  ? ` · с ${b.selfFundingMonthLabel} с WB`
                                  : ''}
                              </div>
                            </div>
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#141413]">
                        {b.modelsCount > 0
                          ? hasCost
                            ? formatMln(b.totalProcurementBudgetRub)
                            : 'Скрыто'
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#5E5D58]">
                        {b.modelsCount > 0
                          ? hasCost
                            ? formatMln(b.annualSoldGoodsCostRub)
                            : 'Скрыто'
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#157347]">
                        {b.modelsCount > 0
                          ? hasCost
                            ? `+${formatMln(b.annualEstimatedOperatingProfitRub)}`
                            : 'Скрыто'
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    onClick={() => setBrandFilter('ALL')}
                    className="bg-[#F5F5F1] font-extrabold text-[#141413] border-t-[1.5px] border-[#CECDC4] cursor-pointer"
                  >
                    <td className="py-3 px-3.5">
                      {isHoldingAllBrands
                        ? 'ИТОГО ПО ГРУППЕ (без дублей)'
                        : `ИТОГО (${formatLabBrandLabel(brandFilter)})`}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono">
                      {brandsReport.groupTotal.modelsCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatMln(brandsReport.groupTotal.annualRevenueRub)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatGroupedUnitInline(
                        brandsReport.brands.map((b) => ({
                          unit: getBrandUnitConfig(b.brandCode).primaryUnit,
                          qty: b.totalProcurementPacks,
                        })),
                        isHoldingAllBrands ? 'ед.' : getBrandUnitConfig(brandFilter).primaryUnit
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                      {hasCost ? (
                        <>
                          <div>{formatMln(brandsReport.groupTotal.firstWaveStartBudgetRub)}</div>
                          <div className="text-[10.5px] font-semibold">
                            аванс 30%: {formatMln(brandsReport.groupTotal.firstWavePrepaymentRub)}
                          </div>
                        </>
                      ) : (
                        'Скрыто'
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono bg-[#F1F5F9] dark:bg-[#1E2536] text-[#0F172A] dark:text-[#EDF0F7]">
                      {!hasCost ? (
                        'Скрыто'
                      ) : wbLagMonths < 0 ? (
                        <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                          Лаг WB не задан
                        </div>
                      ) : (
                        <>
                          <div>{formatMln(brandsReport.groupTotal.netOwnMoneyRequiredRub)}</div>
                          <div className="text-[10.5px] font-semibold text-amber-800 dark:text-amber-300">
                            пик:{' '}
                            {isHoldingAllBrands
                              ? holdingSummary.groupTotal.peakMonthLabel
                              : brandsReport.groupTotal.peakMonthLabel}
                            {(
                              isHoldingAllBrands
                                ? holdingSummary.groupTotal.selfFundingMonthLabel
                                : brandsReport.groupTotal.selfFundingMonthLabel
                            )
                              ? ` · в плюс с ${
                                  isHoldingAllBrands
                                    ? holdingSummary.groupTotal.selfFundingMonthLabel
                                    : brandsReport.groupTotal.selfFundingMonthLabel
                                }`
                              : ''}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {hasCost ? formatMln(brandsReport.groupTotal.totalProcurementBudgetRub) : 'Скрыто'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {hasCost ? formatMln(brandsReport.groupTotal.annualSoldGoodsCostRub) : 'Скрыто'}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-[#157347]">
                      {hasCost
                        ? `+${formatMln(brandsReport.groupTotal.annualEstimatedOperatingProfitRub)}`
                        : 'Скрыто'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* 02 · Подробный двухслойный интерактивный график «Пик своих денег» и помесячный денежный поток 2027 */}
          <PeakOwnMoneyChartPanel
            id="peak-own-money-chart-anchor"
            investmentSummary={investmentSummary}
            wavesSummary={financeWavesSummary}
            scenarioTitle={
              isHoldingAllBrands ? 'Все 5 брендов холдинга' : currentScenario.title
            }
            year={currentScenario.year || 2027}
            initialCashMln={initialCashMln}
            onChangeInitialCashMln={setInitialCashMln}
            wbLagMonths={wbLagMonths < 0 ? 0 : wbLagMonths}
            onChangeWbLagMonths={setWbLagMonths}
            wbScheduleSpecified={wbLagMonths >= 0}
            onToggleWbScheduleSpecified={() =>
              setWbLagMonths((prev) => (prev < 0 ? 0 : -1))
            }
          />

          {/* 03 · Юнит-экономика по моделям */}
          <section className="rounded-2xl bg-white border border-[#E2E6EE] p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#64748B]">
                  03 · Экономика по моделям
                </div>
                <h2 className="text-[18px] font-bold text-[#0F172A] mt-0.5">
                  Себестоимость, маржинальность и ожидаемая прибыль по каждой модели ({finSummary.perSku.length} мод.)
                </h2>
              </div>

              {finSummary.unfilledOpCount > 0 && canEditActiveFinanceScope && (
                <button
                  type="button"
                  onClick={() => {
                    applyIndustryNormsToAllModels(true);
                    notify(
                      'success',
                      'Отраслевые нормативы WB применены ко всем моделям',
                      'Комиссия, логистика, ДРР и себестоимость заполнены для 100% SKU'
                    );
                  }}
                  className="h-9 px-4 rounded-lg bg-[#141413] hover:bg-[#282724] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>Заполнить нормативы WB для всех SKU ({finSummary.unfilledOpCount})</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
              <table className="w-full text-left border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4]">
                    <th className="py-2.5 px-3.5 font-bold">Модель / Артикул</th>
                    <th className="py-2.5 px-3 font-bold text-right">
                      {isHoldingAllBrands ? 'Цена ед.' : `Цена (${getBrandUnitConfig(brandFilter).primaryUnit})`}
                    </th>
                    <th className="py-2.5 px-3 font-bold text-right">
                      {isHoldingAllBrands ? 'Себест. ед.' : `Себест. (${getBrandUnitConfig(brandFilter).primaryUnit})`}
                    </th>
                    <th className="py-2.5 px-3 font-bold text-right">Валовая наценка</th>
                    <th className="py-2.5 px-3 font-bold text-right">Выручка 2027</th>
                    <th className="py-2.5 px-3.5 font-bold text-right">Опер. прибыль 2027</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E3DC]">
                  {finSummary.perSku.map(({ model, pnl }) => {
                    const acting = getActingSkuByWbOrVendor(model.code, model.title);
                    return (
                      <tr
                        key={model.id}
                        onClick={() => openSkuPassport(model.id)}
                        title="Нажмите, чтобы открыть карточку модели и детальные расходы"
                        className="hover:bg-[#FAFAF7] cursor-pointer transition"
                      >
                        <td className="py-2.5 px-3.5">
                          <div className="font-bold text-[#141413]">{model.title}</div>
                          <div className="font-mono text-[10.5px] text-[#5E5D58]">
                            {acting ? `WB ${acting.wbSku}` : model.code} · {getBrandUnitConfig(model).primaryUnit}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {Math.round(pnl.avgRealizedPricePerPackRub).toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#5E5D58]">
                          {!hasCost
                            ? 'Скрыто'
                            : pnl.unitCostPerPackRub !== null
                            ? `${pnl.unitCostPerPackRub.toLocaleString('ru-RU')} ₽`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold">
                          {hasCost && pnl.grossMarginPct !== null
                            ? `${pnl.grossMarginPct.toFixed(1).replace('.', ',')}%`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#141413]">
                          {formatMln(pnl.annualRevenueRub)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          {!hasCost ? (
                            <span className="font-mono text-[#5E5D58]">Скрыто</span>
                          ) : pnl.annualOperatingProfitRub !== null ? (
                            <span className="font-mono font-bold text-[#157347]">
                              {formatMln(pnl.annualOperatingProfitRub)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-[6px] bg-[#F3F3EE] border border-[#D8D7CF] text-[10.5px] font-semibold text-[#5E5D58]">
                              Уточнить логистику / расходы
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
