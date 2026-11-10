'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePlatform } from '@/context/PlatformContext';
import {
  MONTHS_SHORT_RU,
  PRIORITY_WEIGHTS,
  ScenarioModelSpec,
  computeModelScenarioMetrics,
  getModelPriority,
} from '@/lib/scenarioData';
import { ACTING_2027_SCENARIO_ID, getActingSkuByWbOrVendor } from '@/lib/actingAssortment2027';
import {
  ApprovedPurchaseOrder,
  PO_STATUS_LABELS_RU,
  approveRecommendedBatch,
  computeFinancialPnL,
  computeGroupBrandsInvestmentReport,
  computeMultiBrandPortfolioSummary,
  computeProcurementPlan,
  computeScenarioInvestmentSummary,
  computeWhatIfSensitivitySimulation,
  createCustomPurchaseOrder,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  groupRecommendedBatchesByFactory,
  matchesBrandFilter,
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
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';
import { canUserViewCostPrice, canUserViewFinance } from '@/lib/finance';
import { ScenarioSalesPlanScreen } from '@/components/sections/ScenarioSalesPlanScreen';
import { SkuProcurementMvpWorkbench } from '@/components/sections/SkuProcurementMvpWorkbench';
import { RoadmapTasksView } from '@/components/sections/ManagementAndSystemViews';
import { FinanceView } from '@/components/sections/FinanceAndImportViews';

function formatMln(rub: number): string {
  return `${(rub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
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
  onSelectScenario: (id: number) => void;
  includeGroupPortfolioInS1: boolean;
  onToggleGroupPortfolio: (v: boolean) => void;
  eligibleCount: number;
  rightSlot?: React.ReactNode;
}) {
  const { brandFilter, setBrandFilter } = usePlatform();

  return (
    <section className="rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-5 md:p-6 space-y-4 shadow-[0_2px_12px_-3px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[#EEF2F6] dark:border-[#222938]">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#64748B]">
            {stepCode}
          </div>
          <h1 className="text-[21px] md:text-[24px] font-bold tracking-[-0.02em] text-[#0F172A] dark:text-[#EDF0F7] mt-0.5">
            {title}
          </h1>
          <p className="text-[12.5px] text-[#64748B] mt-0.5">{subtitle}</p>
        </div>
        {rightSlot && <div className="flex flex-wrap items-center gap-2">{rightSlot}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-semibold text-[#64748B] mr-1">
            Активный сценарий:
          </span>
          {orderedScenarios.map((sc) => {
            const isSel = sc.id === selectedScenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => onSelectScenario(sc.id)}
                className={`h-8.5 px-3 rounded-xl text-[12px] font-semibold border transition cursor-pointer ${
                  isSel
                    ? 'bg-[#E2E8F0] dark:bg-emerald-500/15 text-[#0F172A] dark:text-emerald-300 border-[#94A3B8] dark:border-emerald-500/30 shadow-2xs'
                    : 'bg-[#F8FAFC] dark:bg-[#181D2A] hover:bg-white text-[#334155] dark:text-[#CBD5E1] border-[#E2E6EE] dark:border-[#222938]'
                }`}
              >
                {sc.id === ACTING_2027_SCENARIO_ID
                  ? 'Исходный план (7 SKU)'
                  : `${sc.title} · ${sc.monthlyTargetMln} млн ₽/мес`}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {brandFilter !== 'ALL' && (
            <div className="inline-flex items-center gap-2 h-8.5 px-3 rounded-xl bg-[#F8FAFC] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] text-[11.5px] font-semibold text-[#0F172A] dark:text-[#EDF0F7]">
              <span>
                Бренд: {brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter} ({eligibleCount} SKU)
              </span>
              <button
                type="button"
                onClick={() => setBrandFilter('ALL')}
                className="underline hover:opacity-75 cursor-pointer text-emerald-700 dark:text-emerald-300"
              >
                Все бренды
              </button>
            </div>
          )}

          {selectedScenarioId === 1 &&
            (brandFilter === 'ALL' ||
              brandFilter === 'BORNERS' ||
              brandFilter === 'FUKAI') && (
              <div className="inline-flex items-center rounded-xl bg-[#F1F5F9] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] p-1 text-[11.5px]">
                <button
                  type="button"
                  onClick={() => onToggleGroupPortfolio(false)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    !includeGroupPortfolioInS1
                      ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-2xs'
                      : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7] font-medium'
                  }`}
                >
                  Цель BORNERS · 21 SKU
                </button>
                <button
                  type="button"
                  onClick={() => onToggleGroupPortfolio(true)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    includeGroupPortfolioInS1
                      ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-2xs'
                      : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7] font-medium'
                  }`}
                >
                  С FUKAI · 23 SKU
                </button>
              </div>
            )}
        </div>
      </div>

      {brandFilter === 'NA_TELE' && eligibleCount === 0 && (
        <div className="rounded-[12px] bg-[#F7F7F3] border-[1.5px] border-[#CECDC4] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-[12.5px]">
          <span className="text-[#262624] font-medium">
            В выбранном сценарии модели <strong>НА ТЕЛЕ</strong> не задействованы (моно-цель BORNERS). Линейка НА ТЕЛЕ включена в Сценарии №2 и №3.
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectScenario(2)}
              className="h-8 px-3 rounded-[8px] bg-[#EAE9E2] hover:bg-[#DFDED6] text-[#141413] border border-[#CECDC4] text-[11.5px] font-semibold cursor-pointer"
            >
              Переключить на Сценарий №2 (150 млн)
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
  const { navigateTo, notify, brandFilter, setBrandFilter } = usePlatform();
  const {
    scenarios,
    orderedScenarios,
    currentScenario,
    selectedScenarioId,
    setSelectedScenarioId,
    includeGroupPortfolioInS1,
    setIncludeGroupPortfolioInS1,
    eligibleModels,
    totals,
    updateModelSpec,
    launchStarterCabinet,
  } = useLiveScenarioPortfolio();

  const [unitMode, setUnitMode] = useState<'rub' | 'packs'>('rub');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'dec_desc' | 'year_desc' | 'priority'>('dec_desc');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  const visibleModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = !q
      ? [...eligibleModels]
      : eligibleModels.filter((m) => {
          const acting = getActingSkuByWbOrVendor(m.code, m.title);
          return (
            m.code.toLowerCase().includes(q) ||
            m.title.toLowerCase().includes(q) ||
            m.subtitle.toLowerCase().includes(q) ||
            Boolean(acting?.wbSku.includes(q))
          );
        });

    if (sortBy === 'dec_desc') {
      filtered.sort(
        (a, b) =>
          computeModelScenarioMetrics(b, currentScenario).targetMonthRevenueRub -
          computeModelScenarioMetrics(a, currentScenario).targetMonthRevenueRub
      );
    } else if (sortBy === 'year_desc') {
      filtered.sort(
        (a, b) =>
          computeModelScenarioMetrics(b, currentScenario).annualRevenueRub -
          computeModelScenarioMetrics(a, currentScenario).annualRevenueRub
      );
    } else if (sortBy === 'priority') {
      filtered.sort((a, b) => {
        const wDiff =
          PRIORITY_WEIGHTS[getModelPriority(b)] - PRIORITY_WEIGHTS[getModelPriority(a)];
        if (wDiff !== 0) return wDiff;
        return (
          computeModelScenarioMetrics(b, currentScenario).targetMonthRevenueRub -
          computeModelScenarioMetrics(a, currentScenario).targetMonthRevenueRub
        );
      });
    }

    return filtered;
  }, [eligibleModels, searchQuery, sortBy, currentScenario]);

  const switcherModels = visibleModels.length > 0 ? visibleModels : eligibleModels;

  const editingModel = useMemo(
    () => eligibleModels.find((m) => m.id === editingModelId) || null,
    [eligibleModels, editingModelId]
  );

  const editingIdx = useMemo(
    () => (editingModel ? switcherModels.findIndex((m) => m.id === editingModel.id) : -1),
    [editingModel, switcherModels]
  );

  useEffect(() => {
    if (!editingModel || switcherModels.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '[') {
        e.preventDefault();
        const prevIdx =
          (Math.max(0, editingIdx) - 1 + switcherModels.length) % switcherModels.length;
        setEditingModelId(switcherModels[prevIdx].id);
      } else if (e.key === ']') {
        e.preventDefault();
        const nextIdx = (Math.max(0, editingIdx) + 1) % switcherModels.length;
        setEditingModelId(switcherModels[nextIdx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingModel, editingIdx, switcherModels]);

  const handleExportCsv = () => {
    const rows = exportStructuredScenarioPlan(eligibleModels, currentScenario);
    const csv = serializeStructuredPlanToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `borners_sales_matrix_s${currentScenario.id}_2027.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', `Выгружена матрица продаж «${currentScenario.title}» (${rows.length} строк)`);
  };

  const openSkuPassportOnDashboard = (modelId: string) => {
    try {
      sessionStorage.setItem('borners_open_scenario_model_id', modelId);
    } catch {
      // ignore
    }
    navigateTo('dashboard');
  };

  if (editingModel) {
    const safeIdx = editingIdx >= 0 ? editingIdx : 0;
    const prevMod =
      switcherModels[(safeIdx - 1 + switcherModels.length) % switcherModels.length];
    const nextMod = switcherModels[(safeIdx + 1) % switcherModels.length];

    return (
      <div className="space-y-5 pb-16">
        <div className="rounded-[14px] bg-white border-[1.5px] border-[#C8C7BE] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setEditingModelId(null)}
            className="h-8.5 px-3.5 rounded-[8px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[12.5px] font-semibold cursor-pointer"
          >
            ← Ко всей матрице ({eligibleModels.length} SKU)
          </button>

          {/* Мгновенное переключение между SKU без возврата в таблицу */}
          {switcherModels.length > 1 && (
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
                {switcherModels.map((m, idx) => {
                  const met = computeModelScenarioMetrics(m, currentScenario);
                  return (
                    <option key={m.id} value={m.id}>
                      {idx + 1}/{switcherModels.length} · {m.code} — {m.title} (
                      {(met.targetMonthRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн/дек)
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
          model={editingModel}
          scenario={currentScenario}
          allScenarios={scenarios}
          onSelectScenario={setSelectedScenarioId}
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
        title="План продаж на 12 месяцев (все SKU сценария)"
        subtitle="Сводная таблица выкупов и выручки по каждому артикулу на 2027 год. Нажмите на строку SKU для помесячного редактирования."
        selectedScenarioId={selectedScenarioId}
        orderedScenarios={orderedScenarios}
        onSelectScenario={setSelectedScenarioId}
        includeGroupPortfolioInS1={includeGroupPortfolioInS1}
        onToggleGroupPortfolio={setIncludeGroupPortfolioInS1}
        eligibleCount={eligibleModels.length}
        rightSlot={
          <>
            <div className="inline-flex rounded-xl bg-[#F1F5F9] dark:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] p-1 text-[12px] font-medium">
              <button
                type="button"
                onClick={() => setUnitMode('rub')}
                className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                  unitMode === 'rub'
                    ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-2xs'
                    : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
                }`}
              >
                Млн ₽
              </button>
              <button
                type="button"
                onClick={() => setUnitMode('packs')}
                className={`h-7.5 px-3 rounded-lg transition cursor-pointer ${
                  unitMode === 'packs'
                    ? 'bg-white dark:bg-[#121620] text-[#0F172A] dark:text-[#EDF0F7] font-semibold shadow-2xs'
                    : 'text-[#64748B] hover:text-[#0F172A] dark:hover:text-[#EDF0F7]'
                }`}
              >
                Комплекты (шт.)
              </button>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="h-9 px-3.5 rounded-xl bg-white dark:bg-[#121620] hover:bg-[#F8FAFC] dark:hover:bg-[#181D2A] border border-[#E2E6EE] dark:border-[#222938] text-[12px] font-semibold text-[#0F172A] dark:text-[#EDF0F7] cursor-pointer"
            >
              Экспорт CSV
            </button>
          </>
        }
      />

      {eligibleModels.length === 0 && (
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
                className="h-8.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold cursor-pointer transition"
              >
                🚀 Запустить стартовую матрицу (3 SKU)
              </button>
            )}
            {brandFilter === 'NA_TELE' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedScenarioId(2);
                  setBrandFilter('ALL');
                }}
                className="h-8.5 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[12px] font-semibold cursor-pointer transition"
              >
                Переключить на Сценарий №2 · 150 млн
              </button>
            )}
            {brandFilter === 'FUKAI' && selectedScenarioId === 1 && !includeGroupPortfolioInS1 && (
              <button
                type="button"
                onClick={() => setIncludeGroupPortfolioInS1(true)}
                className="h-8.5 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[12px] font-semibold cursor-pointer transition"
              >
                Подключить портфель группы (с FUKAI)
              </button>
            )}
            <button
              type="button"
              onClick={() => setBrandFilter('ALL')}
              className="h-8.5 px-3.5 rounded-[9px] bg-[#FAF9F6] hover:bg-white border border-[#CFCEC6] hover:border-[#141413] text-[#141413] text-[12px] font-semibold cursor-pointer transition"
            >
              Показать все бренды
            </button>
          </div>
        </div>
      )}

      {/* 4 ключевых показателя продаж в воздушном дизайн-коде с 3px акцентной полоской */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-4 space-y-1 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
            Годовая выручка 2027
          </div>
          <div className="font-mono text-2xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
            {formatMln(totals.annualRevenueRub)}
          </div>
          <div className="text-[11.5px] text-[#64748B]">
            {totals.annualRevenueRub.toLocaleString('ru-RU')} ₽ за 12 мес.
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-emerald-500/85" />
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-4 space-y-1 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
            Выручка в декабре 2027
          </div>
          <div className="font-mono text-2xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
            {formatMln(totals.decRevenueRub)}
          </div>
          <div className="text-[11.5px] text-emerald-600 dark:text-emerald-400 font-medium">
            Цель сценария: {currentScenario.monthlyTargetMln} млн ₽ / мес
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-teal-500/85" />
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-4 space-y-1 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
            Выкупы и заказы за 2027 год
          </div>
          <div className="font-mono text-2xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
            {totals.annualPacks.toLocaleString('ru-RU')} вык.
          </div>
          <div className="text-[11.5px] text-[#64748B]">
            Заказы (до выкупа):{' '}
            <strong className="font-mono text-emerald-700 dark:text-emerald-400">
              {totals.annualOrdersPacks.toLocaleString('ru-RU')}
            </strong>{' '}
            · {formatMln(totals.annualOrdersRub)}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-emerald-500/75" />
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-4 space-y-1 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
            Моделей в матрице
          </div>
          <div className="font-mono text-2xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
            {eligibleModels.length} SKU
          </div>
          <div className="text-[11.5px] text-[#64748B]">
            Средний чек:{' '}
            {totals.annualPacks > 0
              ? `${Math.round(totals.annualRevenueRub / totals.annualPacks).toLocaleString('ru-RU')} ₽`
              : '—'}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-teal-500/75" />
        </div>
      </section>

      {/* Полноширинная матрица 12 месяцев по всем SKU */}
      <section className="rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-5 md:p-6 space-y-4 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[16px] font-bold text-[#0F172A] dark:text-[#EDF0F7]">
            Помесячная матрица ({unitMode === 'rub' ? 'млн ₽' : 'комплектов'} · {visibleModels.length} SKU)
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
              <option value="dec_desc">Сортировка: Выручка дек. ↓</option>
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
              {visibleModels.map((mod) => {
                const met = computeModelScenarioMetrics(mod, currentScenario);
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
                      <div className="inline-flex items-center justify-end gap-0.5 rounded-md border border-[#CBD5E1] dark:border-[#334155] bg-white dark:bg-[#1E2536] px-1.5 py-0.5">
                        <input
                          type="number"
                          min={5}
                          max={100}
                          step={1}
                          aria-label={`Процент выкупа ${mod.code}`}
                          value={met.buyoutRatePct}
                          onChange={(e) => {
                            const updated = updateModelBuyoutRatePct(
                              mod,
                              Number(e.target.value),
                              {
                                scenarioId: currentScenario.id,
                                syncProcurementToOrders: true,
                              }
                            );
                            updateModelSpec(updated);
                          }}
                          className="w-10 text-right font-mono text-[11.5px] font-bold text-[#0F172A] dark:text-[#F8FAFC] bg-transparent focus:outline-none"
                        />
                        <span className="text-[10px] font-bold text-[#64748B]">%</span>
                      </div>
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
                          {unitMode === 'rub'
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
                        {unitMode === 'rub'
                          ? (met.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')
                          : met.annualPacks.toLocaleString('ru-RU')}
                      </div>
                      <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        Зак:{' '}
                        {unitMode === 'rub'
                          ? `${(met.annualOrdersRub / 1_000_000).toFixed(2).replace('.', ',')} м`
                          : met.annualOrdersPacks.toLocaleString('ru-RU')}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#F8FAFC] dark:bg-[#181D2A] font-bold text-[#0F172A] dark:text-[#EDF0F7] border-t border-[#E2E6EE] dark:border-[#222938]">
                <td className="py-3 px-3 sticky left-0 z-10 bg-[#F8FAFC] dark:bg-[#181D2A] border-r border-[#E2E6EE] dark:border-[#222938]">
                  ИТОГО ({eligibleModels.length} SKU)
                </td>
                <td className="py-3 px-2 text-right">—</td>
                <td className="py-3 px-2 text-right font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                  {totals.annualOrdersPacks > 0
                    ? `${Math.round((totals.annualPacks / totals.annualOrdersPacks) * 100)}%`
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
                    {unitMode === 'rub'
                      ? (totals.monthlyRevRub[mIdx] / 1_000_000).toFixed(1).replace('.', ',')
                      : totals.monthlyPacks[mIdx].toLocaleString('ru-RU')}
                  </td>
                ))}
                <td className="py-3 px-3 text-right font-mono bg-[#F1F5F9] dark:bg-[#1E2536]">
                  {unitMode === 'rub'
                    ? (totals.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')
                    : totals.annualPacks.toLocaleString('ru-RU')}
                </td>
              </tr>
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
  const { tasks, navigateTo, notify, brandFilter, setBrandFilter } = usePlatform();
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
    launchStarterCabinet,
  } = useLiveScenarioPortfolio();

  const [wavesCalendarOpen, setWavesCalendarOpen] = useState(false);
  const [holdingScopeMode, setHoldingScopeMode] = useState<boolean>(true);

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
  const [initialCashMln, setInitialCashMln] = useState<number>(0);
  const [wbLagMonths, setWbLagMonths] = useState<number>(0);

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
    const seen = new Set<string>();
    const list: { model: ScenarioModelSpec; scenario: typeof currentScenario }[] = [];
    for (const bRow of multiBrandSummary.brands) {
      if (!bRow.hasScenario || !bRow.hasModels || bRow.selectedScenarioId === null) continue;
      const bScen =
        scenarios.find((s) => s.id === bRow.selectedScenarioId && !s.isArchived) ||
        currentScenario;
      for (const rm of models) {
        if (!rm || rm.launchStatus === 'В архиве') continue;
        if (!matchesBrandFilter(rm, bRow.brandCode)) continue;
        const key = rm.id || rm.code;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ model: rm, scenario: bScen });
      }
    }
    return list.length > 0
      ? list
      : eligibleModels.map((m) => ({ model: m, scenario: currentScenario }));
  }, [
    isHoldingAllBrandsActive,
    eligibleModels,
    currentScenario,
    multiBrandSummary.brands,
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

      return { model: m, plan };
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
      monthlyRows: gt.monthlyRows,
    };
  }, [
    isHoldingAllBrandsActive,
    singleScenarioInvestmentSummary,
    multiBrandSummary.groupTotal,
    procData,
  ]);

  const brandsReport = useMemo(() => {
    const baseReport = computeGroupBrandsInvestmentReport(
      scenarioAllEligibleModels,
      currentScenario,
      {
        initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
        settlementLagMonths: wbLagMonths < 0 ? 0 : wbLagMonths,
      }
    );
    if (!isHoldingAllBrandsActive) return baseReport;
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
      },
    };
  }, [
    isHoldingAllBrandsActive,
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
      };
      const sizeCount =
        m.liskaniSizeVariants && m.liskaniSizeVariants.length > 0
          ? m.liskaniSizeVariants.length
          : 5;
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

  const handleExportFactoryOrderCsv = (mode: 'all' | 'first_wave' = 'all') => {
    const modelsToExport = scopedModelEntries.map((e) => e.model);
    const csv = serializeScenarioFactoryOrdersToCsv(
      modelsToExport,
      currentScenario,
      mode
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      mode === 'first_wave'
        ? `BORNERS_Zakaz_Fabrike_Start_Q1_Scenario_${currentScenario.id}.csv`
        : `BORNERS_Zakaz_Fabrike_2027_Scenario_${currentScenario.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
              4 волны и сводка ({formatMln(investmentSummary.totalProcurementBudgetRub)})
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
                const shortTitle =
                  sc.id === 100 || sc.id === 4
                    ? 'Исходный'
                    : sc.id === 105 || sc.ownerBrandCode === 'LISKANI'
                    ? 'LISKANI · 500 млн'
                    : `№${sc.id} · ${sc.monthlyTargetMln} млн`;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => {
                      setHoldingScopeMode(false);
                      setSelectedCategoryFilter('ALL');
                      if (sc.id === 105 || sc.ownerBrandCode === 'LISKANI') {
                        setBrandFilter('LISKANI');
                      }
                      setSelectedScenarioId(sc.id);
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
        <div className="rounded-[16px] border border-[#D8D7CF] bg-white p-6 shadow-[0_1px_3px_rgba(20,20,19,0.03)]">
          <div className="max-w-2xl space-y-3">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-900">
              Фильтр бренда: {brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter}
            </span>
            <h3 className="text-[18px] font-bold text-[#141413]">
              В сценарии «{currentScenario.title}» нет моделей бренда «
              {brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter}»
            </h3>
            <p className="text-[13.5px] leading-relaxed text-[#52514C]">
              В «Исходном плане» (7 базовых артикулов WB) и базовом «Сценарии №1» рассчитывается основная линейка BORNERS. Модели женской и базовой линейки «НА ТЕЛЕ» включаются в расчёт начиная со Сценария №2 (150 млн ₽/мес) и Сценария №3 (200 млн ₽/мес).
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
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
                  className="h-9.5 rounded-xl bg-emerald-600 px-4 text-[12.5px] font-semibold text-white hover:bg-emerald-700 transition cursor-pointer"
                >
                  🚀 Запустить стартовую матрицу (3 SKU)
                </button>
              )}
              <button
                type="button"
                onClick={() => setBrandFilter('ALL')}
                className="h-9.5 rounded-[9px] bg-[#F5F5F1] hover:bg-[#EAE9E2] border border-[#CECDC4] px-4 text-[12.5px] font-semibold text-[#141413] transition cursor-pointer"
              >
                Показать все бренды ({currentScenario.title.split('·')[0].trim()})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedScenarioId(2);
                  setBrandFilter('ALL');
                }}
                className="h-9.5 rounded-[9px] border border-[#CFCEC6] bg-white px-4 text-[12.5px] font-semibold text-[#141413] hover:bg-[#F4F3EE] transition cursor-pointer"
              >
                Переключить на Сценарий №2 · 150 млн (с линейкой НА ТЕЛЕ)
              </button>
              {selectedScenarioId === 1 && !includeGroupPortfolioInS1 && (
                <button
                  type="button"
                  onClick={() => setIncludeGroupPortfolioInS1(true)}
                  className="h-9.5 rounded-[9px] border border-[#CFCEC6] bg-[#FAF9F6] px-3.5 text-[12px] font-semibold text-[#141413] hover:bg-[#EFEFE9] transition cursor-pointer"
                >
                  Подключить портфель группы в Сценарии №1
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ПЛАТЁЖНЫЙ КАЛЕНДАРЬ 4 ВОЛН ЗАКУПОК 2027 (GANTT TIMELINE & CASH-GAP RADAR) */}
          {wavesCalendarOpen &&
            (() => {
              const totalProc = Math.max(investmentSummary.totalProcurementBudgetRub, 0);
              const w1 = Math.max(investmentSummary.firstWaveStartBudgetRub, Math.round(totalProc * 0.2));
              const w1Prepay = Math.max(investmentSummary.firstWavePrepaymentRub, Math.round(w1 * 0.3));
              const rem = Math.max(0, totalProc - w1);
              const w2 = Math.round(rem * 0.27);
              const w3 = Math.round(rem * 0.34);
              const w4 = Math.max(0, rem - w2 - w3);
              const waves = [
                {
                  id: 'w1',
                  num: 'Волна №1 · Q1',
                  title: 'Стартовая партия (Янв–Мар)',
                  orderMonth: 'Ноя–Дек',
                  arrivalMonth: 'Январь',
                  budgetRub: w1,
                  prepayRub: w1Prepay,
                  balanceRub: Math.max(0, w1 - w1Prepay),
                  covered: [0, 1, 2],
                  funding: 'Аванс 30% + доплата 70% (свой капитал)',
                  selfFunded: false,
                },
                {
                  id: 'w2',
                  num: 'Волна №2 · Q2',
                  title: 'Весна–Лето (Апр–Июн)',
                  orderMonth: 'Февраль',
                  arrivalMonth: 'Апрель',
                  budgetRub: w2,
                  prepayRub: Math.round(w2 * 0.3),
                  balanceRub: Math.round(w2 * 0.7),
                  covered: [3, 4, 5],
                  funding: 'Реинвест WB + пик оборотного капитала',
                  selfFunded: false,
                },
                {
                  id: 'w3',
                  num: 'Волна №3 · Q3',
                  title: 'Высокий сезон (Июл–Сен)',
                  orderMonth: 'Май',
                  arrivalMonth: 'Июль',
                  budgetRub: w3,
                  prepayRub: Math.round(w3 * 0.3),
                  balanceRub: Math.round(w3 * 0.7),
                  covered: [6, 7, 8],
                  funding: '100% из оборотной выручки WB',
                  selfFunded: true,
                },
                {
                  id: 'w4',
                  num: 'Волна №4 · Q4',
                  title: 'Пик декабря (Окт–Дек)',
                  orderMonth: 'Август',
                  arrivalMonth: 'Октябрь',
                  budgetRub: w4,
                  prepayRub: Math.round(w4 * 0.3),
                  balanceRub: Math.round(w4 * 0.7),
                  covered: [9, 10, 11],
                  funding: '100% из оборота WB · защита от Out-of-Stock',
                  selfFunded: true,
                },
              ];

              return (
                <section className="rounded-2xl border border-[#E2E6EE] dark:border-[#222938] bg-white dark:bg-[#121620] p-4 sm:p-5 space-y-3.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                        📦 Платёжный календарь 4 волн закупок {currentScenario.year || 2027} · Авансы 30%, доплаты 70% и реинвест с WB
                      </div>
                      <p className="text-[11.5px] text-[#64748B]">
                        Годовой бюджет закупок: <strong className="font-mono text-[#0F172A] dark:text-[#EDF0F7]">{formatMln(totalProc)}</strong> · Пик собственных средств: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{investmentSummary.verifiedOwnMoneyRequiredRub != null ? formatMln(investmentSummary.verifiedOwnMoneyRequiredRub) : '—'}</strong> · Волны №3 и №4 финансируются на 100% из выручки WB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleExportFactoryOrderCsv('first_wave')}
                      className="h-8 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[11.5px] font-semibold cursor-pointer transition"
                    >
                      Скачать заказ 1-й волны Q1 (CSV)
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {waves.map((w) => (
                      <div
                        key={w.id}
                        className="relative overflow-hidden rounded-xl border border-[#E2E6EE] dark:border-[#222938] bg-[#F8FAFC]/80 dark:bg-[#181D2A] p-3.5 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            {w.num}
                          </span>
                          <span
                            className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-md ${
                              w.selfFunded
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-[#F1F5F9] dark:bg-[#1E2536] text-[#475569] dark:text-[#94A3B8]'
                            }`}
                          >
                            {w.selfFunded ? '100% с WB' : 'Старт / Оборот'}
                          </span>
                        </div>
                        <div className="text-[13px] font-semibold text-[#0F172A] dark:text-[#EDF0F7]">
                          {w.title}
                        </div>
                        <div className="font-mono text-xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                          {formatMln(w.budgetRub)}
                        </div>
                        <div className="space-y-1 text-[11px] text-[#64748B]">
                          <div className="flex justify-between">
                            <span>Аванс 30% ({w.orderMonth}):</span>
                            <strong className="font-mono text-[#0F172A] dark:text-[#EDF0F7]">
                              {formatMln(w.prepayRub)}
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Доплата 70% ({w.arrivalMonth}):</span>
                            <strong className="font-mono text-[#0F172A] dark:text-[#EDF0F7]">
                              {formatMln(w.balanceRub)}
                            </strong>
                          </div>
                        </div>
                        <div className="grid grid-cols-12 gap-0.5 h-1.5 rounded overflow-hidden bg-[#E2E8F0] dark:bg-[#222938]">
                          {MONTHS_SHORT_RU.map((m, idx) => (
                            <div
                              key={m}
                              className={
                                w.covered.includes(idx)
                                  ? w.selfFunded
                                    ? 'bg-emerald-500'
                                    : 'bg-teal-500'
                                  : 'bg-transparent'
                              }
                            />
                          ))}
                        </div>
                        <div className="text-[10.5px] font-medium text-[#475569] dark:text-[#94A3B8]">
                          {w.funding}
                        </div>
                        <div
                          className={`absolute inset-x-0 bottom-0 h-[3px] ${
                            w.selfFunded ? 'bg-emerald-500/80' : 'bg-teal-500/80'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

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
                        {formatMln(investmentSummary.annualRevenueRub)}
                      </div>
                      <div className="mt-1 text-[11.5px] text-[#686762]">
                        Дек: <strong className="text-[#141413]">{formatMln(investmentSummary.decemberRevenueRub)}</strong> · {procData.annualDemandPacks.toLocaleString('ru-RU')} компл.
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
                        {formatMln(investmentSummary.firstWaveStartBudgetRub)}
                      </div>
                      <div className="mt-1 text-[11.5px] text-[#686762]">
                        Аванс 30% сейчас: <strong className="text-[#141413]">{formatMln(investmentSummary.firstWavePrepaymentRub)}</strong> · {investmentSummary.firstWavePacks.toLocaleString('ru-RU')} компл.
                      </div>
                    </div>

                    <div className="px-5 py-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                          Пик своих денег (с WB)
                        </span>
                        <span className="rounded-md bg-[#F4F3EE] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#52514C]">
                          {investmentSummary.verifiedOwnMoneyRequiredRub !== null &&
                          investmentSummary.verifiedOwnMoneyRequiredRub !== undefined
                            ? `${investmentSummary.peakMonthLabel} ${currentScenario.year || 2027}`
                            : 'График WB не указан'}
                        </span>
                      </div>
                      {investmentSummary.verifiedOwnMoneyRequiredRub !== null &&
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
                          {procData.totalScenarioPacks.toLocaleString('ru-RU')} компл.
                        </span>
                      </div>
                      <div className="mt-1.5 font-mono text-[21px] font-extrabold text-[#141413]">
                        {formatMln(investmentSummary.totalProcurementBudgetRub)}
                      </div>
                      <div className="mt-1 text-[11.5px] text-[#686762]">
                        Себест. продаж: {formatMln(investmentSummary.annualSoldGoodsCostRub)} · Прибыль: <strong className="text-[#157347]">+{formatMln(investmentSummary.annualEstimatedOperatingProfitRub)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Таблица 12 месяцев внутри сводки */}
                  <div className="p-4 space-y-3 bg-[#FAF9F6]/50">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[12.5px] font-bold text-[#141413]">
                        Помесячный график вложений и возврата выручки с Wildberries (2027)
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5 text-[11.5px]">
                        <label className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#D8D7CE] bg-white px-2.5 py-1">
                          <span className="text-[#52514C] font-medium">Свои деньги на старте:</span>
                          <input
                            type="number"
                            min={0}
                            max={500}
                            step={1}
                            value={initialCashMln}
                            onChange={(e) =>
                              setInitialCashMln(Math.max(0, Number(e.target.value) || 0))
                            }
                            className="w-12 rounded border border-[#E2E1D9] px-1.5 py-0.5 text-right font-mono font-bold text-[#141413]"
                          />
                          <span className="text-[#686762]">млн ₽</span>
                        </label>
                        <label className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#D8D7CE] bg-white px-2.5 py-1">
                          <span className="text-[#52514C] font-medium">Выплаты WB:</span>
                          <select
                            value={wbLagMonths}
                            onChange={(e) => setWbLagMonths(Number(e.target.value))}
                            className="font-semibold text-[#141413] bg-transparent focus:outline-none"
                          >
                            <option value={0}>В месяц продаж</option>
                            <option value={1}>Лаг 1 месяц</option>
                            <option value={-1}>График WB не указан</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-[10px] border border-[#E4E3DC] bg-white">
                      <table className="w-full min-w-[820px] border-collapse text-left text-[11.5px]">
                        <thead>
                          <tr className="border-b border-[#E4E3DC] bg-[#FAF9F6] text-[10.5px] font-bold uppercase tracking-wide text-[#5E5D58]">
                            <th className="py-2 px-3 sticky left-0 bg-[#FAF9F6] border-r border-[#E4E3DC]">
                              Поток денег (млн ₽)
                            </th>
                            {investmentSummary.monthlyRows.map((r) => (
                              <th
                                key={r.monthIdx}
                                className={`py-2 px-2 text-right ${
                                  r.isPeakDeficitMonth ? 'bg-amber-50 text-amber-900' : ''
                                }`}
                              >
                                {r.monthLabel}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#ECEBE4]">
                          <tr>
                            <td className="py-2 px-3 font-medium text-[#52514C] sticky left-0 bg-white border-r border-[#ECEBE4]">
                              Выручка продаж (выкупы WB)
                            </td>
                            {investmentSummary.monthlyRows.map((r) => (
                              <td
                                key={r.monthIdx}
                                className="py-2 px-2 text-right font-mono text-[#52514C]"
                              >
                                {(r.grossSalesRub / 1_000_000).toFixed(1).replace('.', ',')}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="py-2 px-3 font-semibold text-[#157347] sticky left-0 bg-white border-r border-[#ECEBE4]">
                              + Поступления от WB (после комиссии, логистики и рекламы)
                            </td>
                            {investmentSummary.monthlyRows.map((r) => (
                              <td
                                key={r.monthIdx}
                                className="py-2 px-2 text-right font-mono font-semibold text-[#157347]"
                              >
                                +{(r.wbNetInflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                              </td>
                            ))}
                          </tr>
                          <tr>
                            <td className="py-2 px-3 font-semibold text-[#B45309] sticky left-0 bg-white border-r border-[#ECEBE4]">
                              − Оплаты фабрикам (авансы 30% + доплаты 70%)
                            </td>
                            {investmentSummary.monthlyRows.map((r) => (
                              <td
                                key={r.monthIdx}
                                className="py-2 px-2 text-right font-mono text-[#B45309]"
                              >
                                {r.factoryTotalOutflowRub > 0
                                  ? `−${(r.factoryTotalOutflowRub / 1_000_000)
                                      .toFixed(1)
                                      .replace('.', ',')}`
                                  : '0,0'}
                              </td>
                            ))}
                          </tr>
                          <tr className="bg-[#FAF9F6] font-extrabold">
                            <td className="py-2.5 px-3 text-[#141413] sticky left-0 bg-[#FAF9F6] border-r border-[#ECEBE4]">
                              Накопленный баланс денег (минус = свои вложения)
                            </td>
                            {investmentSummary.monthlyRows.map((r) => (
                              <td
                                key={r.monthIdx}
                                className={`py-2.5 px-2 text-right font-mono ${
                                  r.isPeakDeficitMonth
                                    ? 'bg-amber-100/80 text-amber-950'
                                    : r.cumulativeCashBalanceRub < 0
                                      ? 'text-rose-700'
                                      : 'text-[#157347]'
                                }`}
                              >
                                {r.cumulativeCashBalanceRub >= 0 ? '+' : ''}
                                {(r.cumulativeCashBalanceRub / 1_000_000)
                                  .toFixed(1)
                                  .replace('.', ',')}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
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
                              {b.modelsCount > 0 ? formatMln(b.annualRevenueRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#3D3C38]">
                              {b.modelsCount > 0
                                ? `${b.totalProcurementPacks.toLocaleString('ru-RU')} компл.`
                                : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#146C43]">
                              {b.modelsCount > 0 ? (
                                <div>
                                  <div className="font-bold">
                                    {formatMln(b.firstWaveStartBudgetRub)}
                                  </div>
                                  <div className="text-[10.5px] text-[#686762]">
                                    аванс: {formatMln(b.firstWavePrepaymentRub)}
                                  </div>
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#141413]">
                              {b.modelsCount > 0 ? formatMln(b.peakWorkingCapitalRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#141413]">
                              {b.modelsCount > 0 ? formatMln(b.totalProcurementBudgetRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#52514C]">
                              {b.modelsCount > 0 ? formatMln(b.annualSoldGoodsCostRub) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#157347]">
                              {b.modelsCount > 0
                                ? `+${formatMln(b.annualEstimatedOperatingProfitRub)}`
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
                          <td className="py-3 px-3">ИТОГО ПО ГРУППЕ (без дублей)</td>
                          <td className="py-3 px-2.5 text-right font-mono">
                            {brandsReport.groupTotal.modelsCount}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {formatMln(brandsReport.groupTotal.annualRevenueRub)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {brandsReport.groupTotal.totalProcurementPacks.toLocaleString('ru-RU')} компл.
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[#146C43]">
                            <div>{formatMln(brandsReport.groupTotal.firstWaveStartBudgetRub)}</div>
                            <div className="text-[10.5px] font-semibold text-[#686762]">
                              аванс: {formatMln(brandsReport.groupTotal.firstWavePrepaymentRub)}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {formatMln(brandsReport.groupTotal.netOwnMoneyRequiredRub)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {formatMln(brandsReport.groupTotal.totalProcurementBudgetRub)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {formatMln(brandsReport.groupTotal.annualSoldGoodsCostRub)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-[#157347]">
                            +{formatMln(brandsReport.groupTotal.annualEstimatedOperatingProfitRub)}
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
                        {formatMln(multiBrandSummary.groupTotal.totalProcurementBudgetRub)})
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
                                  setSelectedScenarioId(b.selectedScenarioId);
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
                              {formatMln(b.totalProcurementBudgetRub)})
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
                          {procData.annualDemandPacks.toLocaleString('ru-RU')} компл.
                        </span>
                      </div>
                      <div className="font-mono text-[22px] font-extrabold text-[#0F172A]">
                        {formatMln(investmentSummary.annualSoldGoodsCostRub)}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        Средняя себест.:{' '}
                        <strong className="font-mono text-[#0F172A]">
                          {procData.annualDemandPacks > 0
                            ? Math.round(
                                investmentSummary.annualSoldGoodsCostRub / procData.annualDemandPacks
                              ).toLocaleString('ru-RU')
                            : 0}{' '}
                          ₽/компл.
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
                          {procData.totalScenarioPacks.toLocaleString('ru-RU')} компл.
                        </span>
                      </div>
                      <div className="font-mono text-[22px] font-extrabold text-[#0F172A]">
                        {formatMln(procData.totalScenarioBudgetRub)}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        {procData.totalScenarioUnits.toLocaleString('ru-RU')} изд. · включает 4 квартальные волны и переходящий запас
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
                        {formatMln(procData.firstWaveBudgetRub)}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        Аванс сейчас:{' '}
                        <strong className="font-mono text-[#0F172A]">
                          {formatMln(procData.firstWavePrepaymentRub)}
                        </strong>{' '}
                        · {procData.firstWavePacks.toLocaleString('ru-RU')} компл.
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
                        {formatMln(
                          Math.max(0, procData.totalScenarioBudgetRub - procData.firstWaveBudgetRub)
                        )}
                      </div>
                      <div className="text-[11.5px] text-[#64748B]">
                        {Math.max(0, procData.totalScenarioPacks - procData.firstWavePacks).toLocaleString(
                          'ru-RU'
                        )}{' '}
                        компл. · оплата из поступлений с WB
                      </div>
                    </button>
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
                                    {formatMln(cg.totalBudgetRub)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10.5px] text-[#64748B]">Себест. выкупов</div>
                                  <div className="font-mono text-[13.5px] font-bold text-[#334155]">
                                    {formatMln(cg.soldCogsRub)}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-t border-[#EEF2F6] flex items-center justify-between text-[11px] text-[#475569]">
                                <span>
                                  К заказу: <strong className="font-mono text-[#0F172A]">{cg.totalOrderPacks.toLocaleString('ru-RU')}</strong> компл. (~{avgCost} ₽)
                                </span>
                                <span className="font-mono font-semibold text-emerald-700">
                                  Q1: {formatMln(cg.firstWaveBudgetRub)}
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
                          Нажмите прямо на число в колонке «Себест. 1 компл.» для мгновенной правки себестоимости, или на «Размеры ▾» для раскрытия сетки и партий Q1–Q4
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
                            <th className="px-2.5 py-2.5 text-right">Себест. 1 компл.</th>
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
                          {filteredSummarySkus.map(({ model: m, plan }) => {
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
                            const sizesCount = hasLiskaniSizes
                              ? m.liskaniSizeVariants!.length
                              : 5;
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
                            const supplyScaleRatio =
                              plan.annualDemandPacks > 0
                                ? totalModelPacks / plan.annualDemandPacks
                                : 1;

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
                                        {hasLiskaniSizes ? `${sizesCount} разм.` : 'S–XXL'}
                                      </span>
                                    </div>
                                    <div className="font-mono text-[10.5px] text-[#64748B]">
                                      {m.code} · {getNormalizedProcurementCategoryLabel(m)} ·{' '}
                                      {m.unitsInPack} изд./компл.
                                    </div>
                                  </td>

                                  <td
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-2.5 py-2.5 text-right font-mono"
                                  >
                                    <div className="inline-flex items-center justify-end gap-1 rounded-lg border border-[#CBD5E1] bg-white px-2 py-1 hover:border-emerald-500 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 transition">
                                      <input
                                        type="number"
                                        min={0}
                                        step={10}
                                        aria-label={`Себестоимость 1 компл. ${m.code}`}
                                        value={Math.round(m.unitCostRub || 0)}
                                        onChange={(e) => {
                                          const nextVal = Math.max(0, Math.round(Number(e.target.value) || 0));
                                          updateModelSpec(updateModelUnitCostWithVariants(m, nextVal));
                                        }}
                                        className="w-16 text-right font-mono text-[12px] font-bold text-[#0F172A] bg-transparent focus:outline-none"
                                      />
                                      <span className="text-[11px] font-semibold text-[#64748B]">₽</span>
                                    </div>
                                    {hasLiskaniSizes && minSizeCost !== maxSizeCost && (
                                      <div className="mt-0.5 text-[10px] text-[#64748B]">
                                        {Math.round(minSizeCost)}–{Math.round(maxSizeCost)} ₽
                                      </div>
                                    )}
                                  </td>

                                  <td
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-2.5 py-2.5 text-right font-mono text-[#334155]"
                                  >
                                    <div>{plan.annualBuyoutsPacks.toLocaleString('ru-RU')} выкуп</div>
                                    <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-indigo-700 font-semibold">
                                      <span>Зак: {plan.annualOrdersPacks.toLocaleString('ru-RU')}</span>
                                      <span className="inline-flex items-center rounded border border-indigo-200 bg-indigo-50/70 px-1 py-0.5">
                                        <input
                                          type="number"
                                          min={5}
                                          max={100}
                                          step={1}
                                          aria-label={`Процент выкупа ${m.code}`}
                                          value={plan.buyoutRatePct}
                                          onChange={(e) => {
                                            const nextPct = Math.max(5, Math.min(100, Number(e.target.value) || 33));
                                            const activeScn = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];
                                            updateModelSpec(updateModelBuyoutRatePct(m, nextPct, { scenarioId: activeScn?.id }));
                                          }}
                                          className="w-8 bg-transparent text-right font-mono text-[10px] font-bold text-indigo-900 focus:outline-none"
                                        />
                                        <span>%</span>
                                      </span>
                                    </div>
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono font-semibold text-[#334155]">
                                    <div>{formatMln(soldCogsRub)}</div>
                                    <div className="text-[10px] text-[#64748B]">
                                      {soldCogsRub.toLocaleString('ru-RU')} ₽
                                    </div>
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono font-bold text-[#0F172A]">
                                    <div>{totalModelPacks.toLocaleString('ru-RU')} компл.</div>
                                    <div className="text-[10px] font-normal text-[#64748B]">
                                      {plan.procureByOrdersVolume
                                        ? `×${plan.orderMultiplier.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} под заказы (${plan.buyoutRatePct}%)`
                                        : `${totalModelUnits.toLocaleString('ru-RU')} изд.`}
                                    </div>
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono bg-emerald-500/4">
                                    <div className="font-bold text-emerald-700">
                                      {formatMln(w1Rub)}
                                    </div>
                                    <div className="text-[10px] text-[#475569]">
                                      {w1Packs.toLocaleString('ru-RU')} компл. · ав.{' '}
                                      {formatMln(w1Prepay)}
                                    </div>
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono text-[#334155]">
                                    <div className="font-semibold">{formatMln(restRub)}</div>
                                    <div className="text-[10px] text-[#64748B]">
                                      {restPacks.toLocaleString('ru-RU')} компл. (с WB)
                                    </div>
                                  </td>

                                  <td className="px-2.5 py-2.5 text-right font-mono font-extrabold text-[#0F172A]">
                                    <div>{formatMln(totalModelBudgetRub)}</div>
                                    <div className="text-[10px] font-normal text-[#64748B]">
                                      {totalModelBudgetRub.toLocaleString('ru-RU')} ₽
                                    </div>
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
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#334155]">
                                                        {sv.annualBuyoutsUnits.toLocaleString('ru-RU')} компл.
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#334155]">
                                                        {szSoldCogsRub.toLocaleString('ru-RU')} ₽
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono font-semibold text-emerald-700 bg-emerald-500/4">
                                                        {q1Order.toLocaleString('ru-RU')} компл.
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#475569]">
                                                        {q2Order.toLocaleString('ru-RU')} компл.
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#475569]">
                                                        {q3Order.toLocaleString('ru-RU')} компл.
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono text-[#475569]">
                                                        {q4Order.toLocaleString('ru-RU')} компл.
                                                      </td>
                                                      <td className="py-2 px-2.5 text-right font-mono font-bold text-[#0F172A]">
                                                        {totalSzOrder.toLocaleString('ru-RU')} компл.
                                                      </td>
                                                      <td className="py-2 px-3 text-right font-mono font-bold text-[#0F172A]">
                                                        {szBudgetRub.toLocaleString('ru-RU')} ₽
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        ) : (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                            {plan.recommendedBatches.map((rb, bIdx) => (
                                              <div
                                                key={rb.periodId}
                                                className="rounded-lg border border-[#CBD5E1] bg-white p-3 space-y-1"
                                              >
                                                <div className="flex items-center justify-between text-[11px]">
                                                  <span className="font-bold text-[#0F172A]">
                                                    Партия №{bIdx + 1} · {rb.coverageMonthsLabel}
                                                  </span>
                                                  <span className="font-mono font-semibold text-emerald-700">
                                                    {formatMln(rb.estimatedTotalRub)}
                                                  </span>
                                                </div>
                                                <div className="font-mono text-[12px] font-bold text-[#0F172A]">
                                                  {rb.recommendedPacks.toLocaleString('ru-RU')} компл. ({rb.physicalUnitsQty.toLocaleString('ru-RU')} изд.)
                                                </div>
                                                <div className="text-[10.5px] text-[#64748B]">
                                                  Аванс: {formatMln(rb.prepaymentRub)} · S:{rb.sizeBreakdownPacks.S} M:{rb.sizeBreakdownPacks.M} L:{rb.sizeBreakdownPacks.L} XL:{rb.sizeBreakdownPacks.XL} XXL:{rb.sizeBreakdownPacks.XXL}
                                                </div>
                                              </div>
                                            ))}
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
                              ~
                              {procData.annualDemandPacks > 0
                                ? Math.round(
                                    investmentSummary.annualSoldGoodsCostRub /
                                      procData.annualDemandPacks
                                  ).toLocaleString('ru-RU')
                                : 0}{' '}
                              ₽
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono">
                              {procData.annualDemandPacks.toLocaleString('ru-RU')} компл.
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono">
                              {formatMln(investmentSummary.annualSoldGoodsCostRub)}
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono">
                              {procData.totalScenarioPacks.toLocaleString('ru-RU')} компл.
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono text-emerald-700 bg-emerald-500/8">
                              <div>{formatMln(procData.firstWaveBudgetRub)}</div>
                              <div className="text-[10px] font-semibold text-[#475569]">
                                ав. {formatMln(procData.firstWavePrepaymentRub)}
                              </div>
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono">
                              {formatMln(
                                Math.max(
                                  0,
                                  procData.totalScenarioBudgetRub - procData.firstWaveBudgetRub
                                )
                              )}
                            </td>
                            <td className="px-2.5 py-3 text-right font-mono text-[13px]">
                              {formatMln(procData.totalScenarioBudgetRub)}
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
          {activeSkuModel && !wavesCalendarOpen && scenarioDrawerTab === 'none' && (
            <SkuProcurementMvpWorkbench
              model={activeSkuModel}
              currentScenario={currentScenario}
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
                    {filteredSkus.map(({ model: m, plan }) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.code} · {m.unitsInPack} изд.) — {plan.totalRecommendedPacks.toLocaleString('ru-RU')} компл.
                      </option>
                    ))}
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
          )}
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
    orderedScenarios,
    currentScenario,
    selectedScenarioId,
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
  const [initialCashMln, setInitialCashMln] = useState<number>(0);
  const [wbLagMonths, setWbLagMonths] = useState<number>(0);
  const [whatIfOpen, setWhatIfOpen] = useState<boolean>(false);
  const [whatIfPriceDelta, setWhatIfPriceDelta] = useState<number>(0);
  const [whatIfCostDelta, setWhatIfCostDelta] = useState<number>(0);
  const [whatIfMpAdsDelta, setWhatIfMpAdsDelta] = useState<number>(0);

  const hasFinance = canUserViewFinance(currentUser);
  const hasCost = canUserViewCostPrice(currentUser);

  const investmentSummary = useMemo(
    () =>
      computeScenarioInvestmentSummary(eligibleModels, currentScenario, {
        initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
        settlementLagMonths: wbLagMonths < 0 ? null : wbLagMonths,
        wbPayoutScheduleSpecified: wbLagMonths >= 0,
      }),
    [eligibleModels, currentScenario, initialCashMln, wbLagMonths]
  );

  const brandsReport = useMemo(
    () =>
      computeGroupBrandsInvestmentReport(
        scenarioAllEligibleModels,
        currentScenario,
        {
          initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
          settlementLagMonths: wbLagMonths < 0 ? 0 : wbLagMonths,
        }
      ),
    [scenarioAllEligibleModels, currentScenario, initialCashMln, wbLagMonths]
  );

  const finSummary = useMemo(() => {
    let totalCogsRub = 0;
    let totalGrossProfitRub = 0;
    let honestOpProfitRub = 0;
    let filledOpCount = 0;
    let unfilledOpCount = 0;
    let peakCapitalRub = 0;

    const monthlyInflow = Array(12).fill(0) as number[];
    const monthlyProcOutflow = Array(12).fill(0) as number[];
    const monthlyVarOpexOutflow = Array(12).fill(0) as number[];
    const monthlyNet = Array(12).fill(0) as number[];

    const perSku = eligibleModels.map((m) => {
      const proc = computeProcurementPlan(m, currentScenario);
      const pnl = computeFinancialPnL(m, currentScenario, proc);

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

      return { model: m, pnl };
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
      monthlyInflow,
      monthlyProcOutflow,
      monthlyVarOpexOutflow,
      monthlyNet,
      cumulativeCash,
      perSku,
    };
  }, [eligibleModels, currentScenario]);

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
            eligibleCount={eligibleModels.length}
          />

          {eligibleModels.length === 0 && (
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
                    className="h-8.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold cursor-pointer transition"
                  >
                    🚀 Запустить стартовую матрицу (3 SKU)
                  </button>
                )}
                {brandFilter === 'NA_TELE' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedScenarioId(2);
                      setBrandFilter('ALL');
                    }}
                    className="h-8.5 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[12px] font-semibold cursor-pointer transition"
                  >
                    Переключить на Сценарий №2 · 150 млн
                  </button>
                )}
                {brandFilter === 'FUKAI' && selectedScenarioId === 1 && !includeGroupPortfolioInS1 && (
                  <button
                    type="button"
                    onClick={() => setIncludeGroupPortfolioInS1(true)}
                    className="h-8.5 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[12px] font-semibold cursor-pointer transition"
                  >
                    Подключить портфель группы (с FUKAI)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBrandFilter('ALL')}
                  className="h-8.5 px-3.5 rounded-[9px] bg-[#FAF9F6] hover:bg-white border border-[#CFCEC6] hover:border-[#141413] text-[#141413] text-[12px] font-semibold cursor-pointer transition"
                >
                  Показать все бренды
                </button>
              </div>
            </div>
          )}

          {/* 4 РАЗДЕЛЁННЫХ ФИНАНСОВЫХ ПОКАЗАТЕЛЯ ПО ТЗ (В ВОЗДУШНОМ ДИЗАЙН-КОДЕ С 3PX ПОЛОСКОЙ) */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-4 space-y-1 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                1. Вложить на старт (Партия №1 · Q1)
              </div>
              <div className="font-mono text-2xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                {hasCost ? formatMln(investmentSummary.firstWaveStartBudgetRub) : 'Скрыто ролью'}
              </div>
              <div className="text-[11.5px] text-[#64748B]">
                <strong className="text-[#0F172A] dark:text-[#EDF0F7]">Аванс 30% сейчас: {formatMln(investmentSummary.firstWavePrepaymentRub)}</strong> ({investmentSummary.firstWavePacks.toLocaleString('ru-RU')} компл.)
              </div>
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-teal-500/85" />
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-4 space-y-1 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                2. Максимум своих денег (с оборотом WB)
              </div>
              {investmentSummary.verifiedOwnMoneyRequiredRub !== null &&
              investmentSummary.verifiedOwnMoneyRequiredRub !== undefined ? (
                <>
                  <div className="font-mono text-2xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                    {formatMln(investmentSummary.verifiedOwnMoneyRequiredRub)}
                  </div>
                  <div className="text-[11.5px] text-[#64748B]">
                    Пик в <strong className="text-[#0F172A] dark:text-[#EDF0F7]">{investmentSummary.peakMonthLabel} {currentScenario.year || 2027}</strong>
                    {investmentSummary.selfFundingMonthLabel
                      ? ` · С ${investmentSummary.selfFundingMonthLabel} — самоокупаемость из WB`
                      : ' · Учитывает возврат выручки с WB'}
                  </div>
                </>
              ) : (
                <div className="text-[12.5px] font-semibold text-amber-900 dark:text-amber-300 pt-1 leading-snug">
                  {investmentSummary.ownMoneyStatusLabel}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-emerald-500/75" />
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-4 space-y-1 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                3. Закупки за год vs Себест. продаж
              </div>
              <div className="font-mono text-2xl font-bold text-[#0F172A] dark:text-[#EDF0F7]">
                {hasCost ? formatMln(investmentSummary.totalProcurementBudgetRub) : 'Скрыто ролью'}
              </div>
              <div className="text-[11.5px] text-[#64748B]">
                Себестоимость проданного товара:{' '}
                <strong className="text-[#0F172A] dark:text-[#EDF0F7]">{hasCost ? formatMln(investmentSummary.annualSoldGoodsCostRub) : '—'}</strong>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-amber-500/80" />
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] p-4 space-y-1 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#64748B]">
                4. Ожидаемая прибыль 2027 (после WB и рекламы)
              </div>
              <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                +{formatMln(investmentSummary.annualEstimatedOperatingProfitRub)}
              </div>
              <div className="text-[11.5px] text-[#64748B]">
                Выручка: <strong className="text-[#0F172A] dark:text-[#EDF0F7]">{formatMln(totals.annualRevenueRub)}</strong> · Рентабельность:{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">{investmentSummary.operatingMarginPct.toFixed(1).replace('.', ',')}%</strong>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-emerald-500/85" />
            </div>
          </section>

          {/* ИНТЕРАКТИВНЫЙ КАЛЬКУЛЯТОР «ЧТО ЕСЛИ?» В КОНТУРЕ 04 · ФИНАНСЫ */}
          {(() => {
            const sim = computeWhatIfSensitivitySimulation(
              {
                annualRevenueRub: totals.annualRevenueRub,
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
              <section className="rounded-2xl bg-white dark:bg-[#121620] border border-[#E2E6EE] dark:border-[#222938] px-5 py-3.5 space-y-4 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setWhatIfOpen((v) => !v)}
                      className="text-left cursor-pointer group"
                    >
                      <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#64748B]">
                        🎛️ Симулятор чувствительности · Что если?
                      </div>
                      <h2 className="text-[14.5px] font-bold text-[#0F172A] dark:text-[#EDF0F7] group-hover:text-emerald-600 transition">
                        Стресс-тест и точки роста прибыли сценария «{currentScenario.title}» {whatIfOpen ? '▴' : '▾'}
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
                      className="h-8 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-700 font-semibold cursor-pointer"
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
                      className="h-8 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 text-amber-700 font-semibold cursor-pointer"
                    >
                      ⚠️ Стресс-тест WB +4 п.п.
                    </button>
                    {isModified && (
                      <button
                        type="button"
                        onClick={() => {
                          setWhatIfPriceDelta(0);
                          setWhatIfCostDelta(0);
                          setWhatIfMpAdsDelta(0);
                        }}
                        className="h-8 px-3 rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] font-semibold cursor-pointer"
                      >
                        ↺ Сбросить
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setWhatIfOpen((v) => !v)}
                      className="h-8 px-3 rounded-lg border border-[#E2E6EE] dark:border-[#222938] bg-[#F8FAFC] dark:bg-[#181D2A] text-[#0F172A] dark:text-[#EDF0F7] font-semibold cursor-pointer"
                    >
                      {whatIfOpen ? 'Свернуть ▴' : 'Ползунки ▾'}
                    </button>
                  </div>
                </div>

                {whatIfOpen && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1 border-t border-[#E2E6EE] dark:border-[#222938]">
                  <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E6EE] p-3 space-y-1.5 text-xs">
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
                        className="w-full accent-emerald-600 cursor-pointer"
                      />
                    </div>

                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E6EE] p-3 space-y-1.5 text-xs">
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
                        className="w-full accent-teal-600 cursor-pointer"
                      />
                    </div>

                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E6EE] p-3 space-y-1.5 text-xs">
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
                        +{formatMln(sim.simulatedProfitRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400">
                        {sim.profitDeltaRub >= 0 ? 'Δ +' : 'Δ −'}
                        {formatMln(Math.abs(sim.profitDeltaRub))}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E6EE] p-3">
                      <div className="text-[11px] text-[#64748B]">Новая выручка</div>
                      <div className="font-mono text-base font-bold text-[#0F172A] mt-0.5">
                        {formatMln(sim.simulatedRevenueRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#64748B]">
                        Маржа {sim.simulatedMarginPct.toFixed(1).replace('.', ',')}%
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E6EE] p-3">
                      <div className="text-[11px] text-[#64748B]">Пик своих денег</div>
                      <div className="font-mono text-base font-bold text-[#0F172A] mt-0.5">
                        {formatMln(sim.simulatedOwnCapitalRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400">
                        {sim.simulatedRoiMult ? `ROI ×${sim.simulatedRoiMult}` : 'с WB'}
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
                      onClick={() => setBrandFilter(b.brandCode)}
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
                          ? `${b.totalProcurementPacks.toLocaleString('ru-RU')} компл.`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono bg-emerald-500/6 text-emerald-700 dark:text-emerald-300">
                        {b.modelsCount > 0 ? (
                          <div>
                            <div className="font-bold">{formatMln(b.firstWaveStartBudgetRub)}</div>
                            <div className="text-[10.5px] text-emerald-600/80 dark:text-emerald-400/80">
                              аванс 30%: {formatMln(b.firstWavePrepaymentRub)}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold bg-[#F8FAFC] dark:bg-[#161C28] text-[#0F172A] dark:text-[#EDF0F7]">
                        {b.modelsCount > 0 ? formatMln(b.peakWorkingCapitalRub) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#141413]">
                        {b.modelsCount > 0 ? formatMln(b.totalProcurementBudgetRub) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[#5E5D58]">
                        {b.modelsCount > 0 ? formatMln(b.annualSoldGoodsCostRub) : '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-[#157347]">
                        {b.modelsCount > 0
                          ? `+${formatMln(b.annualEstimatedOperatingProfitRub)}`
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
                    <td className="py-3 px-3.5">ИТОГО ПО ГРУППЕ (без дублей)</td>
                    <td className="py-3 px-2.5 text-right font-mono">
                      {brandsReport.groupTotal.modelsCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatMln(brandsReport.groupTotal.annualRevenueRub)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {brandsReport.groupTotal.totalProcurementPacks.toLocaleString('ru-RU')} компл.
                    </td>
                    <td className="py-3 px-3 text-right font-mono bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                      <div>{formatMln(brandsReport.groupTotal.firstWaveStartBudgetRub)}</div>
                      <div className="text-[10.5px] font-semibold">
                        аванс 30%: {formatMln(brandsReport.groupTotal.firstWavePrepaymentRub)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono bg-[#F1F5F9] dark:bg-[#1E2536] text-[#0F172A] dark:text-[#EDF0F7]">
                      {formatMln(brandsReport.groupTotal.netOwnMoneyRequiredRub)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatMln(brandsReport.groupTotal.totalProcurementBudgetRub)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {formatMln(brandsReport.groupTotal.annualSoldGoodsCostRub)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-[#157347]">
                      +{formatMln(brandsReport.groupTotal.annualEstimatedOperatingProfitRub)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* 02 · Помесячный график инвестиций и возврата выручки с WB (12 мес.) */}
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
                  02 · Денежный поток 2027 (помесячно)
                </div>
                <h2 className="text-[18px] font-bold text-[#141413] mt-0.5">
                  График выплат фабрикам, возврата выручки с WB и накопленного баланса денег (млн ₽)
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-[12px]">
                <label className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#D8D7CE] bg-[#FAF9F6] px-2.5 py-1">
                  <span className="text-[#52514C] font-medium">Деньги на счёте на старт:</span>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    step={1}
                    value={initialCashMln}
                    onChange={(e) => setInitialCashMln(Math.max(0, Number(e.target.value) || 0))}
                    className="w-14 rounded bg-white border border-[#CFCEC6] px-1.5 py-0.5 text-right font-mono font-bold text-[#141413]"
                  />
                  <span className="text-[#686762]">млн ₽</span>
                </label>
                <label className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#D8D7CE] bg-[#FAF9F6] px-2.5 py-1">
                  <span className="text-[#52514C] font-medium">Выплаты WB:</span>
                  <select
                    value={wbLagMonths}
                    onChange={(e) => setWbLagMonths(Number(e.target.value))}
                    className="rounded bg-white border border-[#CFCEC6] px-1.5 py-0.5 font-semibold text-[#141413]"
                  >
                    <option value={0}>В месяц продаж (без задержки)</option>
                    <option value={1}>Лаг 1 месяц</option>
                    <option value={-1}>График выплат WB не указан</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4]">
                    <th className="py-2.5 px-3 font-bold min-w-[240px] sticky left-0 z-10 bg-[#F5F5F1] border-r border-[#DFDED6]">
                      Статья движения денег
                    </th>
                    {investmentSummary.monthlyRows.map((r) => (
                      <th
                        key={r.monthIdx}
                        className={`py-2.5 px-2 font-bold text-right ${
                          r.isPeakDeficitMonth ? 'bg-amber-50 text-amber-900' : ''
                        }`}
                      >
                        {r.monthLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E3DC]">
                  <tr>
                    <td className="py-2.5 px-3 font-medium text-[#52514C] sticky left-0 z-10 bg-white border-r border-[#ECEBE4]">
                      Выручка продаж (выкупы WB)
                    </td>
                    {investmentSummary.monthlyRows.map((r) => (
                      <td key={r.monthIdx} className="py-2.5 px-2 text-right font-mono text-[#52514C]">
                        {(r.grossSalesRub / 1_000_000).toFixed(1).replace('.', ',')}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-[#157347] sticky left-0 z-10 bg-white border-r border-[#ECEBE4]">
                      + Поступления от WB на счёт (за вычетом комиссии, логистики и рекламы)
                    </td>
                    {investmentSummary.monthlyRows.map((r) => (
                      <td key={r.monthIdx} className="py-2.5 px-2 text-right font-mono text-[#157347] font-semibold">
                        +{(r.wbNetInflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-[#B45309] sticky left-0 z-10 bg-white border-r border-[#ECEBE4]">
                      − Оплаты фабрикам (авансы 30% + доплаты 70%)
                    </td>
                    {investmentSummary.monthlyRows.map((r) => (
                      <td key={r.monthIdx} className="py-2.5 px-2 text-right font-mono text-[#B45309]">
                        {r.factoryTotalOutflowRub > 0
                          ? `−${(r.factoryTotalOutflowRub / 1_000_000).toFixed(1).replace('.', ',')}`
                          : '0,0'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-[#FAFAF7] font-bold">
                    <td className="py-2.5 px-3 text-[#141413] sticky left-0 z-10 bg-[#FAFAF7] border-r border-[#ECEBE4]">
                      = Чистый поток месяца
                    </td>
                    {investmentSummary.monthlyRows.map((r) => (
                      <td
                        key={r.monthIdx}
                        className={`py-2.5 px-2 text-right font-mono ${
                          r.netMonthlyCashflowRub < 0 ? 'text-[#B45309]' : 'text-[#157347]'
                        }`}
                      >
                        {r.netMonthlyCashflowRub >= 0 ? '+' : ''}
                        {(r.netMonthlyCashflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-[#F1F5F9] dark:bg-[#1E2536] font-extrabold">
                    <td className="py-2.5 px-3 text-[#0F172A] dark:text-[#EDF0F7] sticky left-0 z-10 bg-[#F1F5F9] dark:bg-[#1E2536] border-r border-[#E2E6EE] dark:border-[#222938]">
                      Накопленный баланс денег (минус = пик своих денег)
                    </td>
                    {investmentSummary.monthlyRows.map((r) => (
                      <td
                        key={r.monthIdx}
                        className={`py-2.5 px-2 text-right font-mono ${
                          r.isPeakDeficitMonth
                            ? 'bg-amber-100/90 text-amber-950 underline decoration-amber-600'
                            : r.cumulativeCashBalanceRub < 0
                            ? 'text-rose-700'
                            : 'text-[#157347]'
                        }`}
                      >
                        {r.cumulativeCashBalanceRub >= 0 ? '+' : ''}
                        {(r.cumulativeCashBalanceRub / 1_000_000).toFixed(1).replace('.', ',')}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

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

              {finSummary.unfilledOpCount > 0 && (
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
                  className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shadow-2xs transition"
                >
                  ⚡ Заполнить нормативы WB для всех SKU ({finSummary.unfilledOpCount})
                </button>
              )}
            </div>

            <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
              <table className="w-full text-left border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4]">
                    <th className="py-2.5 px-3.5 font-bold">Модель / Артикул</th>
                    <th className="py-2.5 px-3 font-bold text-right">Цена компл.</th>
                    <th className="py-2.5 px-3 font-bold text-right">Себест. компл.</th>
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
                            {acting ? `WB ${acting.wbSku}` : model.code}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {Math.round(pnl.avgRealizedPricePerPackRub).toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#5E5D58]">
                          {hasCost && pnl.unitCostPerPackRub !== null
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
                          {pnl.annualOperatingProfitRub !== null ? (
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
