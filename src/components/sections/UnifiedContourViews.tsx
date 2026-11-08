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
  computeProcurementPlan,
  computeScenarioInvestmentSummary,
  createCustomPurchaseOrder,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  groupRecommendedBatchesByFactory,
  removeApprovedPurchaseOrder,
  serializePurchaseOrdersToCsv,
  serializeScenarioFactoryOrdersToCsv,
  serializeStructuredPlanToCsv,
  updateApprovedPurchaseOrder,
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
    <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4 shadow-[0_2px_10px_rgba(20,20,19,0.03)]">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b-[1.5px] border-[#DFDED6]">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
            {stepCode}
          </div>
          <h1 className="text-[22px] md:text-[25px] font-bold tracking-[-0.02em] text-[#141413] mt-0.5">
            {title}
          </h1>
          <p className="text-[12.5px] text-[#5E5D58] mt-0.5">{subtitle}</p>
        </div>
        {rightSlot && <div className="flex flex-wrap items-center gap-2">{rightSlot}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-bold text-[#5E5D58] mr-1">
            Активный сценарий:
          </span>
          {orderedScenarios.map((sc) => {
            const isSel = sc.id === selectedScenarioId;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => onSelectScenario(sc.id)}
                className={`h-8.5 px-3 rounded-[9px] text-[12px] font-semibold border-[1.5px] transition cursor-pointer ${
                  isSel
                    ? 'bg-[#141413] text-white border-[#141413]'
                    : 'bg-[#F7F7F4] hover:bg-white hover:border-[#141413] text-[#262624] border-[#CECDC4]'
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
            <div className="inline-flex items-center gap-2 h-8.5 px-3 rounded-[9px] bg-[#F4F4F0] border-[1.5px] border-[#141413] text-[11.5px] font-semibold text-[#141413]">
              <span>
                Бренд: {brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter} ({eligibleCount} SKU)
              </span>
              <button
                type="button"
                onClick={() => setBrandFilter('ALL')}
                className="underline hover:opacity-75 cursor-pointer"
              >
                Все бренды
              </button>
            </div>
          )}

          {selectedScenarioId === 1 && (
            <div className="inline-flex items-center rounded-[9px] bg-[#EFEFE9] border-[1.5px] border-[#CECDC4] p-0.5 text-[11.5px]">
              <button
                type="button"
                onClick={() => onToggleGroupPortfolio(false)}
                className={`px-2.5 py-1 rounded-[7px] transition cursor-pointer ${
                  !includeGroupPortfolioInS1
                    ? 'bg-[#141413] text-white font-semibold'
                    : 'text-[#52514C] hover:text-[#141413] font-semibold'
                }`}
              >
                Цель BORNERS · 21 SKU
              </button>
              <button
                type="button"
                onClick={() => onToggleGroupPortfolio(true)}
                className={`px-2.5 py-1 rounded-[7px] transition cursor-pointer ${
                  includeGroupPortfolioInS1
                    ? 'bg-[#141413] text-white font-semibold'
                    : 'text-[#52514C] hover:text-[#141413] font-semibold'
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
              className="h-8 px-3 rounded-[8px] bg-[#141413] text-white text-[11.5px] font-semibold cursor-pointer"
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
  const { navigateTo, notify } = usePlatform();
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
            className="h-8.5 px-3.5 rounded-[8px] bg-[#141413] text-white text-[12.5px] font-semibold cursor-pointer"
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
            <div className="inline-flex rounded-[9px] bg-[#EFEFE9] border-[1.5px] border-[#CECDC4] p-0.5 text-[12px] font-semibold">
              <button
                type="button"
                onClick={() => setUnitMode('rub')}
                className={`h-8 px-3 rounded-[7px] transition cursor-pointer ${
                  unitMode === 'rub'
                    ? 'bg-[#141413] text-white'
                    : 'text-[#52514C] hover:text-[#141413]'
                }`}
              >
                Млн ₽
              </button>
              <button
                type="button"
                onClick={() => setUnitMode('packs')}
                className={`h-8 px-3 rounded-[7px] transition cursor-pointer ${
                  unitMode === 'packs'
                    ? 'bg-[#141413] text-white'
                    : 'text-[#52514C] hover:text-[#141413]'
                }`}
              >
                Комплекты (шт.)
              </button>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="h-9 px-3.5 rounded-[9px] bg-white hover:border-[#141413] border-[1.5px] border-[#CECDC4] text-[12px] font-semibold text-[#141413] cursor-pointer"
            >
              Экспорт CSV
            </button>
          </>
        }
      />

      {/* 4 ключевых показателя продаж */}
      <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] overflow-hidden grid grid-cols-2 lg:grid-cols-4 divide-x-[1.5px] divide-y-[1.5px] lg:divide-y-0 divide-[#D8D7CF]">
        <div className="p-5 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
            Годовая выручка 2027
          </div>
          <div className="text-[24px] font-bold text-[#141413]">
            {formatMln(totals.annualRevenueRub)}
          </div>
          <div className="text-[11.5px] text-[#5E5D58]">
            {totals.annualRevenueRub.toLocaleString('ru-RU')} ₽ за 12 мес.
          </div>
        </div>

        <div className="p-5 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
            Выручка в декабре 2027
          </div>
          <div className="text-[24px] font-bold text-[#141413]">
            {formatMln(totals.decRevenueRub)}
          </div>
          <div className="text-[11.5px] text-[#157347] font-semibold">
            Цель сценария: {currentScenario.monthlyTargetMln} млн ₽ / мес
          </div>
        </div>

        <div className="p-5 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
            Выкупы за 2027 год
          </div>
          <div className="text-[24px] font-bold text-[#141413]">
            {totals.annualPacks.toLocaleString('ru-RU')} компл.
          </div>
          <div className="text-[11.5px] text-[#5E5D58]">
            В декабре: {totals.decPacks.toLocaleString('ru-RU')} компл.
          </div>
        </div>

        <div className="p-5 space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
            Моделей в матрице
          </div>
          <div className="text-[24px] font-bold text-[#141413]">
            {eligibleModels.length} SKU
          </div>
          <div className="text-[11.5px] text-[#5E5D58]">
            Средний чек:{' '}
            {totals.annualPacks > 0
              ? `${Math.round(totals.annualRevenueRub / totals.annualPacks).toLocaleString('ru-RU')} ₽`
              : '—'}
          </div>
        </div>
      </section>

      {/* Полноширинная матрица 12 месяцев по всем SKU */}
      <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[16px] font-bold text-[#141413]">
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
              className="h-9 px-3 rounded-[9px] bg-white border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[12px] font-semibold text-[#141413] cursor-pointer"
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
              className="h-9 px-3.5 rounded-[9px] bg-[#F7F7F4] focus:bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] text-[12.5px] font-medium text-[#141413] w-60"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4]">
                <th className="py-2.5 px-3 font-bold min-w-[215px] sticky left-0 z-10 bg-[#F5F5F1] border-r border-[#DFDED6]">
                  Артикул / Модель
                </th>
                <th className="py-2.5 px-2 font-bold text-right">Цена</th>
                {MONTHS_SHORT_RU.map((m, idx) => (
                  <th
                    key={m}
                    className={`py-2.5 px-2 font-bold text-right ${
                      idx === 11 ? 'bg-[#EAEAE3] text-[#141413]' : ''
                    }`}
                  >
                    {m}
                  </th>
                ))}
                <th className="py-2.5 px-3 font-bold text-right bg-[#EFEFE9] text-[#141413]">
                  Год 2027
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E3DC]">
              {visibleModels.map((mod) => {
                const met = computeModelScenarioMetrics(mod, currentScenario);
                const acting = getActingSkuByWbOrVendor(mod.code, mod.title);
                return (
                  <tr
                    key={mod.id}
                    onClick={() => setEditingModelId(mod.id)}
                    title="Нажмите, чтобы редактировать помесячный план модели"
                    className="group hover:bg-[#FAFAF7] cursor-pointer transition"
                  >
                    <td className="py-2.5 px-3 sticky left-0 z-10 bg-white group-hover:bg-[#FAFAF7] border-r border-[#ECEBE4]">
                      <div className="font-bold text-[#141413] truncate max-w-[235px]">
                        {mod.title}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#5E5D58]">
                        {acting ? `WB ${acting.wbSku}` : mod.code} ·{' '}
                        {detectModelBrandPortfolioLabel(mod)}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-[#5E5D58] whitespace-nowrap">
                      {mod.retailPriceRub.toLocaleString('ru-RU')} ₽
                    </td>
                    {MONTHS_SHORT_RU.map((_, mIdx) => {
                      const valRub = met.monthlyRevenuesRub[mIdx] || 0;
                      const valPacks = met.plan.monthlyPacks[mIdx] || 0;
                      return (
                        <td
                          key={mIdx}
                          className={`py-2.5 px-2 text-right font-mono ${
                            mIdx === 11
                              ? 'bg-[#F7F7F3] font-bold text-[#141413]'
                              : valPacks === 0
                              ? 'text-[#B5B4AD]'
                              : 'text-[#262624]'
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
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-[#141413] bg-[#FAFAF7] whitespace-nowrap">
                      {unitMode === 'rub'
                        ? (met.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')
                        : met.annualPacks.toLocaleString('ru-RU')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#F5F5F1] font-bold text-[#141413] border-t-[1.5px] border-[#CECDC4]">
                <td className="py-3 px-3 sticky left-0 z-10 bg-[#F5F5F1] border-r border-[#DFDED6]">
                  ИТОГО ({eligibleModels.length} SKU)
                </td>
                <td className="py-3 px-2 text-right">—</td>
                {MONTHS_SHORT_RU.map((_, mIdx) => (
                  <td
                    key={mIdx}
                    className={`py-3 px-2 text-right font-mono ${
                      mIdx === 11 ? 'bg-[#E5E4DC] text-[#157347]' : ''
                    }`}
                  >
                    {unitMode === 'rub'
                      ? (totals.monthlyRevRub[mIdx] / 1_000_000).toFixed(1).replace('.', ',')
                      : totals.monthlyPacks[mIdx].toLocaleString('ru-RU')}
                  </td>
                ))}
                <td className="py-3 px-3 text-right font-mono bg-[#EAEAE3]">
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
    orderedScenarios,
    currentScenario,
    selectedScenarioId,
    setSelectedScenarioId,
    includeGroupPortfolioInS1,
    setIncludeGroupPortfolioInS1,
    scenarioAllEligibleModels,
    eligibleModels,
    totals,
    updateModelSpec,
  } = useLiveScenarioPortfolio();

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
  const [showAllSkusTable, setShowAllSkusTable] = useState(false);
  const [showCashflowCalendar, setShowCashflowCalendar] = useState(false);
  const [showBrandInvestmentTable, setShowBrandInvestmentTable] = useState(false);
  const [initialCashMln, setInitialCashMln] = useState<number>(0);
  const [wbLagMonths, setWbLagMonths] = useState<number>(0);

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

    const perSku = eligibleModels.map((rawM) => {
      const m = ensureModelUnifiedV11(rawM);
      const plan = computeProcurementPlan(m, currentScenario);
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
  }, [eligibleModels, currentScenario]);

  const investmentSummary = useMemo(
    () =>
      computeScenarioInvestmentSummary(eligibleModels, currentScenario, {
        initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
        settlementLagMonths: wbLagMonths,
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
          settlementLagMonths: wbLagMonths,
        }
      ),
    [scenarioAllEligibleModels, currentScenario, initialCashMln, wbLagMonths]
  );

  const activeSkuModel = useMemo(() => {
    const found =
      eligibleModels.find((m) => m.id === selectedSkuId) ||
      eligibleModels.find((m) => m.code.toUpperCase() === 'BRN-001-SC') ||
      eligibleModels[0];
    return found ? ensureModelUnifiedV11(found) : null;
  }, [eligibleModels, selectedSkuId]);

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

  const handleExportFactoryOrderCsv = (mode: 'all' | 'first_wave' = 'all') => {
    const csv = serializeScenarioFactoryOrdersToCsv(
      eligibleModels,
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
        ? 'Выгружен заказ фабрике на 1-ю волну (Q1) с размерами S–XXL'
        : `Выгружена спецификация заказа фабрике (${eligibleModels.length} мод., размеры S–XXL)`
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
      {/* ЕДИНАЯ ОДНОСТРОЧНАЯ ПАНЕЛЬ НАВИГАЦИИ РАЗДЕЛА 03 · ЗАКУПКИ */}
      <div className="rounded-[14px] bg-white border border-[#D8D7CF] px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_1px_2px_rgba(20,20,19,0.03)]">
        {/* Левая часть: Вкладки Закупки / Задачи CRM + Сценарии */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-[9px] bg-[#F2F1EC] border border-[#E2E1D9] p-0.5 text-[12px] font-bold">
            <button
              type="button"
              onClick={() => setSubTab('batches')}
              className={`h-8 px-3 rounded-[7px] transition cursor-pointer ${
                subTab === 'batches'
                  ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.08)] border border-[#D4D3C9]'
                  : 'text-[#686762] hover:text-[#141413] border border-transparent'
              }`}
            >
              03 · Закупки ({eligibleModels.length} мод. · {procData.approvedCount} утв.)
            </button>
            <button
              type="button"
              onClick={() => setSubTab('crm')}
              className={`h-8 px-3 rounded-[7px] transition cursor-pointer ${
                subTab === 'crm'
                  ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.08)] border border-[#D4D3C9]'
                  : 'text-[#686762] hover:text-[#141413] border border-transparent'
              }`}
            >
              Задачи CRM ({openTasksCount})
            </button>
          </div>

          {subTab === 'batches' && (
            <div className="inline-flex flex-wrap items-center gap-1 rounded-[9px] bg-[#F2F1EC] border border-[#E2E1D9] p-0.5">
              {orderedScenarios.map((sc) => {
                const active = sc.id === selectedScenarioId;
                const shortTitle =
                  sc.id === 100 || sc.id === 4
                    ? 'Исходный план'
                    : `Сценарий №${sc.id} · ${sc.monthlyTargetMln} млн`;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => setSelectedScenarioId(sc.id)}
                    className={`h-8 px-2.5 rounded-[7px] text-[11.5px] font-bold transition cursor-pointer ${
                      active
                        ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.08)] border border-[#D4D3C9]'
                        : 'text-[#686762] hover:text-[#141413] border border-transparent'
                    }`}
                  >
                    {shortTitle}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Правая часть: Фильтр бренда + График кэшфлоу + Сводная по брендам + Экспорт заказа фабрике */}
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#52514C]">
          {brandFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setBrandFilter('ALL')}
              className="rounded-[9px] border border-amber-300 bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer inline-flex items-center gap-1.5"
              title="Сбросить фильтр бренда и показать все модели сценария"
            >
              <span>Фильтр: {brandFilter === 'NA_TELE' ? 'НА ТЕЛЕ' : brandFilter}</span>
              <span className="font-bold">×</span>
            </button>
          )}
          {subTab === 'batches' && eligibleModels.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowCashflowCalendar((v) => !v)}
                className={`rounded-[9px] border px-3 py-1.5 text-[12px] font-semibold transition cursor-pointer ${
                  showCashflowCalendar
                    ? 'border-[#157347] bg-[#E9F7EF] text-[#0F5132]'
                    : 'border-[#D8D7CE] bg-white text-[#141413] hover:bg-[#F4F3EE]'
                }`}
              >
                {showCashflowCalendar
                  ? 'Скрыть кэшфлоу 12 мес. ▴'
                  : 'Календарь денег и WB (12 мес.) ▾'}
              </button>
              <button
                type="button"
                onClick={() => setShowBrandInvestmentTable((v) => !v)}
                className={`rounded-[9px] border px-3 py-1.5 text-[12px] font-semibold transition cursor-pointer ${
                  showBrandInvestmentTable
                    ? 'border-[#B8B7AE] bg-[#EFEFE9] text-[#141413]'
                    : 'border-[#D8D7CE] bg-white text-[#141413] hover:bg-[#F4F3EE]'
                }`}
              >
                {showBrandInvestmentTable
                  ? 'Скрыть бренды ▴'
                  : 'По брендам ▾'}
              </button>
              <button
                type="button"
                onClick={() => setShowAllSkusTable((v) => !v)}
                className={`rounded-[9px] border px-3 py-1.5 text-[12px] font-semibold transition cursor-pointer ${
                  showAllSkusTable
                    ? 'border-[#B8B7AE] bg-[#EFEFE9] text-[#141413]'
                    : 'border-[#D8D7CE] bg-white text-[#141413] hover:bg-[#F4F3EE]'
                }`}
              >
                {showAllSkusTable
                  ? 'Скрыть все SKU ▴'
                  : `Все SKU (${procData.perSku.length}) ▾`}
              </button>
              <button
                type="button"
                onClick={() => handleExportFactoryOrderCsv('all')}
                className="rounded-[9px] border border-[#CFCEC6] bg-[#FAF9F6] px-3 py-1.5 text-[11.5px] font-semibold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
                title="Скачать таблицу заказа фабрике в Excel/CSV с размерами S–XXL, суммами, авансами и датами"
              >
                Экспорт заказа фабрике (CSV)
              </button>
            </>
          )}
        </div>
      </div>

      {subTab === 'crm' ? (
        <RoadmapTasksView />
      ) : eligibleModels.length === 0 ? (
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
              <button
                type="button"
                onClick={() => setBrandFilter('ALL')}
                className="h-9.5 rounded-[9px] bg-[#141413] px-4 text-[12.5px] font-semibold text-white hover:bg-[#2B2B29] transition cursor-pointer"
              >
                Показать все бренды ({currentScenario.title.split('·')[0].trim()})
              </button>
              <button
                type="button"
                onClick={() => setSelectedScenarioId(2)}
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
          {/* ИНВЕСТИЦИОННАЯ СВОДКА СЦЕНАРИЯ (РАЗДЕЛ 07.1 ТЗ): 4 РАЗДЕЛЁННЫХ ПОКАЗАТЕЛЯ */}
          <div className="rounded-[16px] border border-[#D8D7CE] bg-white p-4 shadow-[0_1px_3px_rgba(20,20,19,0.03)]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* 1. Цель продаж сценария */}
              <div className="rounded-[12px] border border-[#E4E3DC] bg-[#F9F9F6] px-4 py-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#686762]">
                    1. План продаж сценария
                  </span>
                  <button
                    type="button"
                    onClick={() => navigateTo('launch-calendar')}
                    className="text-[11px] font-semibold text-[#141413] hover:underline cursor-pointer"
                  >
                    02 · Продажи ↗
                  </button>
                </div>
                <div className="mt-1 font-mono text-[19px] font-extrabold text-[#141413]">
                  {formatMln(totals.annualRevenueRub)}{' '}
                  <span className="text-[12px] font-semibold text-[#686762]">/ год</span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#52514C]">
                  Дек: <strong>{formatMln(totals.decRevenueRub)}</strong> · Выкупы:{' '}
                  <strong>{procData.annualDemandPacks.toLocaleString('ru-RU')} компл.</strong>
                </div>
              </div>

              {/* 2. СКОЛЬКО ДЕНЕГ НУЖНО ВЛОЖИТЬ СРАЗУ НА СТАРТ (Партия №1 / Q1 + Аванс 30%) */}
              <div className="rounded-[12px] border border-[#A7DFC0] bg-[#F2FBF6] px-4 py-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#13653F]">
                    2. Вложить на старт (Партия №1)
                  </span>
                  <span className="rounded-full bg-[#157347] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white">
                    Старт Q1
                  </span>
                </div>
                <div className="mt-1 font-mono text-[20px] font-extrabold text-[#0F5132]">
                  {formatMln(investmentSummary.firstWaveStartBudgetRub)}
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#145A38]">
                  <strong>Аванс 30% сейчас: {formatMln(investmentSummary.firstWavePrepaymentRub)}</strong> · 1-я волна: {investmentSummary.firstWavePacks.toLocaleString('ru-RU')} компл.
                </div>
              </div>

              {/* 3. МАКСИМУМ СОБСТВЕННЫХ ДЕНЕГ (Пик капитала с учётом возврата выручки с WB) */}
              <div className="rounded-[12px] border border-[#9EC5FE] bg-[#F4F8FF] px-4 py-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#1E40AF]">
                    3. Пик своих денег (с оборотом WB)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCashflowCalendar((v) => !v)}
                    className="text-[10.5px] font-bold text-[#1D4ED8] hover:underline cursor-pointer"
                  >
                    {showCashflowCalendar ? 'Скрыть ▴' : 'По месяцам ▾'}
                  </button>
                </div>
                <div className="mt-1 font-mono text-[20px] font-extrabold text-[#1E3A8A]">
                  {formatMln(investmentSummary.netOwnMoneyRequiredRub)}
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#1E40AF]">
                  Пик в <strong>{investmentSummary.peakMonthLabel} 2027</strong>
                  {investmentSummary.selfFundingMonthLabel
                    ? ` · С ${investmentSummary.selfFundingMonthLabel} — из выручки WB`
                    : ' · Дальше — из выручки WB'}
                </div>
              </div>

              {/* 4. Стоимость всех закупок за год vs Себестоимость проданного товара */}
              <div className="rounded-[12px] border border-[#D8D7CE] bg-[#F5F4EE] px-4 py-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#4A4944]">
                    4. Закупки за весь год (4 кварт.)
                  </span>
                  <span className="font-mono text-[10.5px] font-semibold text-[#52514C]">
                    {procData.totalScenarioPacks.toLocaleString('ru-RU')} компл.
                  </span>
                </div>
                <div className="mt-1 font-mono text-[19px] font-extrabold text-[#141413]">
                  {formatMln(investmentSummary.totalProcurementBudgetRub)}
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#52514C]">
                  Себест. продаж: <strong>{formatMln(investmentSummary.annualSoldGoodsCostRub)}</strong> · Прибыль: <strong className="text-[#157347]">+{formatMln(investmentSummary.annualEstimatedOperatingProfitRub)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* РАСКРЫВАЮЩИЙСЯ ПОМЕСЯЧНЫЙ КАЛЕНДАРЬ ИНВЕСТИЦИЙ И ВОЗВРАТА ДЕНЕГ С WB (12 МЕС.) */}
          {showCashflowCalendar && (
            <div className="rounded-[16px] border border-[#C5D7F2] bg-white p-4 shadow-[0_2px_8px_rgba(20,20,19,0.04)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[14px] font-extrabold text-[#141413]">
                    Помесячный график вложений и возврата выручки с Wildberries (2027)
                  </div>
                  <div className="text-[12px] text-[#52514C]">
                    Показывает, сколько собственных денег нужно в пике (<strong>{formatMln(investmentSummary.netOwnMoneyRequiredRub)}</strong> в <strong>{investmentSummary.peakMonthLabel} 2027</strong>) и как выручка WB перекрывает следующие партии Q2–Q4
                  </div>
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
                      onChange={(e) => setWbLagMonths(Number(e.target.value) || 0)}
                      className="rounded bg-white border border-[#CFCEC6] px-1.5 py-0.5 font-semibold text-[#141413]"
                    >
                      <option value={0}>В месяц продаж (без задержки)</option>
                      <option value={1}>Лаг 1 месяц</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCashflowCalendar(false)}
                    className="text-[12px] font-semibold text-[#6E6D66] hover:text-[#141413] cursor-pointer"
                  >
                    Свернуть ▴
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-[10px] border border-[#E4E3DC]">
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
                        <td key={r.monthIdx} className="py-2 px-2 text-right font-mono text-[#52514C]">
                          {(r.grossSalesRub / 1_000_000).toFixed(1).replace('.', ',')}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-[#157347] sticky left-0 bg-white border-r border-[#ECEBE4]">
                        + Поступления от WB на счёт (за вычетом комиссии, логистики и рекламы)
                      </td>
                      {investmentSummary.monthlyRows.map((r) => (
                        <td key={r.monthIdx} className="py-2 px-2 text-right font-mono font-semibold text-[#157347]">
                          +{(r.wbNetInflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-[#B45309] sticky left-0 bg-white border-r border-[#ECEBE4]">
                        − Оплаты фабрикам (авансы 30% + доплаты 70% перед отгрузкой)
                      </td>
                      {investmentSummary.monthlyRows.map((r) => (
                        <td key={r.monthIdx} className="py-2 px-2 text-right font-mono text-[#B45309]">
                          {r.factoryTotalOutflowRub > 0
                            ? `−${(r.factoryTotalOutflowRub / 1_000_000).toFixed(1).replace('.', ',')}`
                            : '0,0'}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-[#FAF9F6] font-semibold">
                      <td className="py-2 px-3 text-[#141413] sticky left-0 bg-[#FAF9F6] border-r border-[#ECEBE4]">
                        = Чистый поток месяца
                      </td>
                      {investmentSummary.monthlyRows.map((r) => (
                        <td
                          key={r.monthIdx}
                          className={`py-2 px-2 text-right font-mono ${
                            r.netMonthlyCashflowRub < 0 ? 'text-[#B45309]' : 'text-[#157347]'
                          }`}
                        >
                          {r.netMonthlyCashflowRub >= 0 ? '+' : ''}
                          {(r.netMonthlyCashflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                        </td>
                      ))}
                    </tr>
                    <tr className="bg-[#F2F6FF] font-extrabold">
                      <td className="py-2.5 px-3 text-[#1E3A8A] sticky left-0 bg-[#F2F6FF] border-r border-[#D5E2FA]">
                        Накопленный баланс денег (минус = нужны свои деньги)
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
            </div>
          )}

          {/* РАСКРЫВАЮЩАЯСЯ СВОДНАЯ ТАБЛИЦА ИНВЕСТИЦИЙ И ПРИБЫЛИ ПО БРЕНДАМ ГРУППЫ (РАЗДЕЛ 09.2 ТЗ) */}
          {showBrandInvestmentTable && (
            <div className="rounded-[16px] border border-[#D8D7CF] bg-white p-4 shadow-[0_2px_8px_rgba(20,20,19,0.04)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[14px] font-extrabold text-[#141413]">
                    Сводная таблица инвестиций, закупок и прибыли по брендам группы (2027)
                  </div>
                  <div className="text-[12px] text-[#52514C]">
                    Нажмите на строку бренда, чтобы отфильтровать модели. Строка «ИТОГО ПО ГРУППЕ» считает портфель без двойного счёта.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBrandInvestmentTable(false)}
                  className="text-[12px] font-semibold text-[#6E6D66] hover:text-[#141413] cursor-pointer"
                >
                  Свернуть ▴
                </button>
              </div>
              <div className="overflow-x-auto rounded-[10px] border border-[#E4E3DC]">
                <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[#E4E3DC] bg-[#FAF9F6] text-[10.5px] font-bold uppercase tracking-wide text-[#5E5D58]">
                      <th className="py-2.5 px-3">Бренд</th>
                      <th className="py-2.5 px-2.5 text-right">Моделей</th>
                      <th className="py-2.5 px-3 text-right">Выручка 2027</th>
                      <th className="py-2.5 px-3 text-right">К закупке</th>
                      <th className="py-2.5 px-3 text-right bg-[#F2FBF6] text-[#0F5132]">
                        Вложить на старт (Q1 / Аванс 30%)
                      </th>
                      <th className="py-2.5 px-3 text-right bg-[#F4F8FF] text-[#1E3A8A]">
                        Пик своих денег (с WB)
                      </th>
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
                        <td className="py-2.5 px-3 text-right font-mono bg-[#F2FBF6]/60 text-[#0F5132]">
                          {b.modelsCount > 0 ? (
                            <div>
                              <div className="font-bold">{formatMln(b.firstWaveStartBudgetRub)}</div>
                              <div className="text-[10.5px] text-[#145A38]">
                                аванс: {formatMln(b.firstWavePrepaymentRub)}
                              </div>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold bg-[#F4F8FF]/60 text-[#1E3A8A]">
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
                      className="border-t-2 border-[#CECDC4] bg-[#F5F5F1] font-extrabold text-[#141413] cursor-pointer"
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
                      <td className="py-3 px-3 text-right font-mono bg-[#E6F7EE] text-[#0F5132]">
                        <div>{formatMln(brandsReport.groupTotal.firstWaveStartBudgetRub)}</div>
                        <div className="text-[10.5px] font-semibold">
                          аванс: {formatMln(brandsReport.groupTotal.firstWavePrepaymentRub)}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono bg-[#E8F0FE] text-[#1E3A8A]">
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
          {/* Сводная таблица по всем SKU портфеля (открывается по кнопке сверху) */}
          {showAllSkusTable && (
            <div className="rounded-[14px] border border-[#D8D7CF] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,19,0.03)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[13px] font-bold text-[#141413]">
                  Сводная таблица закупок по всем моделям сценария ({procData.perSku.length} SKU)
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllSkusTable(false)}
                  className="text-[12px] font-semibold text-[#6E6D66] hover:text-[#141413] cursor-pointer"
                >
                  Свернуть ▴
                </button>
              </div>
              <div className="overflow-x-auto rounded-[10px] border border-[#E4E3DC]">
                <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[#E4E3DC] bg-[#FAF9F6] text-[11px] font-semibold text-[#6E6D66] uppercase tracking-wide">
                      <th className="py-2.5 pr-3 pl-3.5">Модель / SKU</th>
                      <th className="px-3 py-2.5 text-right">План продаж</th>
                      <th className="px-3 py-2.5 text-right">Остаток</th>
                      <th className="px-3 py-2.5 text-right">Подтв. PO</th>
                      <th className="px-3 py-2.5 text-right">К заказу</th>
                      <th className="px-3 py-2.5 text-right">Бюджет</th>
                      <th className="py-2.5 pr-3.5 pl-3 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECEBE4]">
                    {procData.perSku.map(({ model: m, plan }) => (
                      <tr
                        key={m.id}
                        className={`hover:bg-[#FAF9F6] ${
                          activeSkuModel?.id === m.id ? 'bg-[#F4F3EE]/80' : ''
                        }`}
                      >
                        <td className="py-2.5 pr-3 pl-3.5">
                          <div className="font-bold text-[#141413]">{m.title}</div>
                          <div className="font-mono text-[10.5px] text-[#6E6D66]">
                            {m.code} · {m.unitsInPack} изд./компл.
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[#3D3C38]">
                          {plan.annualDemandPacks.toLocaleString('ru-RU')} компл.
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[#3D3C38]">
                          {plan.netOpeningAvailablePacks.toLocaleString('ru-RU')} компл.
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-700">
                          {plan.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} компл.
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-[#141413]">
                          {plan.totalRecommendedPacks.toLocaleString('ru-RU')} компл.
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#141413]">
                          {plan.totalRecommendedBudgetRub !== null
                            ? formatMln(plan.totalRecommendedBudgetRub)
                            : '—'}
                        </td>
                        <td className="py-2.5 pr-3.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSkuId(m.id);
                              setShowAllSkusTable(false);
                            }}
                            className="rounded-[7px] border border-[#CFCEC6] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#141413] hover:bg-[#141413] hover:text-white cursor-pointer"
                          >
                            Выбрать
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ГЛАВНЫЙ ИНТЕРФЕЙС ЗАКУПОК ВЫБРАННОЙ МОДЕЛИ (переключатель модели встроен прямо в шапку!) */}
          {activeSkuModel && (
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
  const { currentUser, navigateTo, brandFilter, setBrandFilter } = usePlatform();
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
  } = useLiveScenarioPortfolio();

  const [subTab, setSubTab] = useState<'scenarios-pnl' | 'legacy-plan-fact'>(
    'scenarios-pnl'
  );
  const [initialCashMln, setInitialCashMln] = useState<number>(0);
  const [wbLagMonths, setWbLagMonths] = useState<number>(0);

  const hasFinance = canUserViewFinance(currentUser);
  const hasCost = canUserViewCostPrice(currentUser);

  const investmentSummary = useMemo(
    () =>
      computeScenarioInvestmentSummary(eligibleModels, currentScenario, {
        initialCashRub: Math.round((Number(initialCashMln) || 0) * 1_000_000),
        settlementLagMonths: wbLagMonths,
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
          settlementLagMonths: wbLagMonths,
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

          {/* 4 РАЗДЕЛЁННЫХ ФИНАНСОВЫХ ПОКАЗАТЕЛЯ ПО ТЗ (РАЗДЕЛ 07.1) */}
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] overflow-hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-x-[1.5px] divide-y-[1.5px] lg:divide-y-0 divide-[#D8D7CF]">
            <div className="p-5 space-y-1 bg-[#F2FBF6]/50">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#13653F]">
                1. Вложить на старт (Партия №1 · Q1)
              </div>
              <div className="font-mono text-[24px] font-extrabold text-[#0F5132]">
                {hasCost ? formatMln(investmentSummary.firstWaveStartBudgetRub) : 'Скрыто ролью'}
              </div>
              <div className="text-[11.5px] text-[#145A38]">
                <strong>Аванс 30% сейчас: {formatMln(investmentSummary.firstWavePrepaymentRub)}</strong> ({investmentSummary.firstWavePacks.toLocaleString('ru-RU')} компл.)
              </div>
            </div>

            <div className="p-5 space-y-1 bg-[#F4F8FF]/60">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#1E40AF]">
                2. Максимум своих денег (с оборотом WB)
              </div>
              <div className="font-mono text-[24px] font-extrabold text-[#1E3A8A]">
                {formatMln(investmentSummary.netOwnMoneyRequiredRub)}
              </div>
              <div className="text-[11.5px] text-[#1E40AF]">
                Пик в <strong>{investmentSummary.peakMonthLabel} 2027</strong>
                {investmentSummary.selfFundingMonthLabel
                  ? ` · С ${investmentSummary.selfFundingMonthLabel} — самоокупаемость из WB`
                  : ' · Учитывает возврат выручки с WB'}
              </div>
            </div>

            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                3. Закупки за год vs Себест. продаж
              </div>
              <div className="font-mono text-[24px] font-extrabold text-[#141413]">
                {hasCost ? formatMln(investmentSummary.totalProcurementBudgetRub) : 'Скрыто ролью'}
              </div>
              <div className="text-[11.5px] text-[#5E5D58]">
                Себестоимость проданного товара:{' '}
                <strong>{hasCost ? formatMln(investmentSummary.annualSoldGoodsCostRub) : '—'}</strong>
              </div>
            </div>

            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                4. Ожидаемая прибыль 2027 (после WB и рекламы)
              </div>
              <div className="font-mono text-[24px] font-extrabold text-[#157347]">
                +{formatMln(investmentSummary.annualEstimatedOperatingProfitRub)}
              </div>
              <div className="text-[11.5px] text-[#5E5D58]">
                Выручка: <strong>{formatMln(totals.annualRevenueRub)}</strong> · Рентабельность:{' '}
                <strong>{investmentSummary.operatingMarginPct.toFixed(1).replace('.', ',')}%</strong>
              </div>
            </div>
          </section>

          {/* 01 · СВОДНАЯ ТАБЛИЦА ИНВЕСТИЦИЙ И ПРИБЫЛИ ПО БРЕНДАМ ГРУППЫ (РАЗДЕЛ 09.2 ТЗ) */}
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4">
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
                    <th className="py-2.5 px-3 font-bold text-right bg-[#E9F7EF] text-[#0F5132]">
                      Вложить на старт (Q1)
                    </th>
                    <th className="py-2.5 px-3 font-bold text-right bg-[#EDF4FF] text-[#1E3A8A]">
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
                      <td className="py-2.5 px-3 text-right font-mono bg-[#F2FBF6]/70 text-[#0F5132]">
                        {b.modelsCount > 0 ? (
                          <div>
                            <div className="font-bold">{formatMln(b.firstWaveStartBudgetRub)}</div>
                            <div className="text-[10.5px] text-[#145A38]">
                              аванс 30%: {formatMln(b.firstWavePrepaymentRub)}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold bg-[#F4F8FF]/70 text-[#1E3A8A]">
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
                    <td className="py-3 px-3 text-right font-mono bg-[#E6F7EE] text-[#0F5132]">
                      <div>{formatMln(brandsReport.groupTotal.firstWaveStartBudgetRub)}</div>
                      <div className="text-[10.5px] font-semibold">
                        аванс 30%: {formatMln(brandsReport.groupTotal.firstWavePrepaymentRub)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono bg-[#E8F0FE] text-[#1E3A8A]">
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
                    onChange={(e) => setWbLagMonths(Number(e.target.value) || 0)}
                    className="rounded bg-white border border-[#CFCEC6] px-1.5 py-0.5 font-semibold text-[#141413]"
                  >
                    <option value={0}>В месяц продаж (без задержки)</option>
                    <option value={1}>Лаг 1 месяц</option>
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
                  <tr className="bg-[#F2F6FF] font-extrabold">
                    <td className="py-2.5 px-3 text-[#1E3A8A] sticky left-0 z-10 bg-[#F2F6FF] border-r border-[#D5E2FA]">
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
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
                03 · Экономика по моделям
              </div>
              <h2 className="text-[18px] font-bold text-[#141413] mt-0.5">
                Себестоимость, маржинальность и ожидаемая прибыль по каждой модели ({finSummary.perSku.length} мод.)
              </h2>
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
