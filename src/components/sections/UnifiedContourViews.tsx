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
  computeProcurementPlan,
  createCustomPurchaseOrder,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  groupRecommendedBatchesByFactory,
  removeApprovedPurchaseOrder,
  serializePurchaseOrdersToCsv,
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
  const { tasks, navigateTo, notify } = usePlatform();
  const {
    orderedScenarios,
    currentScenario,
    selectedScenarioId,
    setSelectedScenarioId,
    includeGroupPortfolioInS1,
    setIncludeGroupPortfolioInS1,
    eligibleModels,
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
    let approvedRub = 0;
    let totalOpeningPacks = 0;
    let recPacks = 0;
    let recUnits = 0;
    let recBudgetRub = 0;

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
      approvedRub += confirmedPos.reduce((s, o) => s + o.totalOrderRub, 0);
      totalOpeningPacks += plan.netOpeningAvailablePacks;
      for (const po of plan.approvedOrders) {
        approvedOrdersFlat.push({ model: m, po });
      }
      recPacks += plan.totalRecommendedPacks;
      recUnits += plan.totalRecommendedUnits;
      recBudgetRub += plan.totalRecommendedBudgetRub || 0;
      return { model: m, plan };
    });

    return {
      approvedCount,
      approvedPacks,
      approvedRub,
      totalOpeningPacks,
      approvedOrdersFlat,
      recPacks,
      recUnits,
      recBudgetRub,
      perSku,
    };
  }, [eligibleModels, currentScenario]);

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

  const handleExportAllPoCsv = () => {
    if (procData.approvedOrdersFlat.length === 0) {
      notify('warning', 'Пока нет утверждённых заказов PO для экспорта');
      return;
    }
    const csv = serializePurchaseOrdersToCsv(procData.approvedOrdersFlat);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BORNERS_PO_2027_Scenario_${currentScenario.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      'success',
      `Экспортировано заказов PO: ${procData.approvedOrdersFlat.length}`
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
              03 · Закупки ({eligibleModels.length} мод. · {procData.approvedCount} PO)
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

        {/* Правая часть: Итог по сценарию + Сводная по всем SKU */}
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#52514C]">
          <span className="rounded-[9px] border border-[#E2E1D9] bg-[#FAF9F6] px-3 py-1.5">
            Итого по сценарию:{' '}
            <strong className="font-mono font-bold text-[#141413]">
              {procData.recPacks.toLocaleString('ru-RU')} компл.
            </strong>{' '}
            ·{' '}
            <strong className="font-mono font-bold text-[#141413]">
              {formatMln(procData.recBudgetRub)}
            </strong>
          </span>
          {subTab === 'batches' && (
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
                ? 'Скрыть сводную ▴'
                : `Сводная всех SKU (${procData.perSku.length}) ▾`}
            </button>
          )}
          {procData.approvedOrdersFlat.length > 0 && (
            <button
              type="button"
              onClick={handleExportAllPoCsv}
              className="rounded-[9px] border border-[#CFCEC6] bg-[#FAF9F6] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
            >
              Экспорт PO ({procData.approvedOrdersFlat.length})
            </button>
          )}
        </div>
      </div>

      {subTab === 'crm' ? (
        <RoadmapTasksView />
      ) : (
        <>
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
  const { currentUser, navigateTo } = usePlatform();
  const {
    orderedScenarios,
    currentScenario,
    selectedScenarioId,
    setSelectedScenarioId,
    includeGroupPortfolioInS1,
    setIncludeGroupPortfolioInS1,
    eligibleModels,
    totals,
  } = useLiveScenarioPortfolio();

  const [subTab, setSubTab] = useState<'scenarios-pnl' | 'legacy-plan-fact'>(
    'scenarios-pnl'
  );

  const hasFinance = canUserViewFinance(currentUser);
  const hasCost = canUserViewCostPrice(currentUser);

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
          Доступ к разделу «Финансы и P&amp;L» ограничен
        </div>
        <p className="text-[13px] text-[#5E5D58]">
          Текущая роль профиля не включает просмотр сводного P&amp;L и себестоимости партий.
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
        <div className="inline-flex rounded-[9px] bg-[#EFEFE9] border-[1.5px] border-[#CECDC4] p-0.5 text-[12.5px] font-semibold">
          <button
            type="button"
            onClick={() => setSubTab('scenarios-pnl')}
            className={`h-8 px-3.5 rounded-[7px] transition cursor-pointer ${
              subTab === 'scenarios-pnl'
                ? 'bg-[#141413] text-white'
                : 'text-[#52514C] hover:text-[#141413]'
            }`}
          >
            P&amp;L и оборотный капитал сценариев 2027
          </button>
          <button
            type="button"
            onClick={() => setSubTab('legacy-plan-fact')}
            className={`h-8 px-3.5 rounded-[7px] transition cursor-pointer ${
              subTab === 'legacy-plan-fact'
                ? 'bg-[#141413] text-white'
                : 'text-[#52514C] hover:text-[#141413]'
            }`}
          >
            План / Факт и импорт таблиц CSV
          </button>
        </div>

        <span className="text-[12px] text-[#5E5D58]">
          Синхронизировано со сценариями 2027 (без фиктивной маржи при незаполненных комиссиях MP)
        </span>
      </div>

      {subTab === 'legacy-plan-fact' ? (
        <FinanceView />
      ) : (
        <>
          <ScenarioContourHeader
            stepCode="04 · Финансы · Сводный P&L и потребность в капитале"
            title="Финансовая модель, денежный поток и юнит-экономика 2027"
            subtitle="Единый расчёт выручки, себестоимости выкупленного товара (COGS), операционной прибыли и графика авансов фабрикам."
            selectedScenarioId={selectedScenarioId}
            orderedScenarios={orderedScenarios}
            onSelectScenario={setSelectedScenarioId}
            includeGroupPortfolioInS1={includeGroupPortfolioInS1}
            onToggleGroupPortfolio={setIncludeGroupPortfolioInS1}
            eligibleCount={eligibleModels.length}
          />

          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] overflow-hidden grid grid-cols-2 lg:grid-cols-4 divide-x-[1.5px] divide-y-[1.5px] lg:divide-y-0 divide-[#D8D7CF]">
            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                Плановая выручка 2027
              </div>
              <div className="text-[24px] font-bold text-[#141413]">
                {formatMln(totals.annualRevenueRub)}
              </div>
              <div className="text-[11.5px] text-[#5E5D58]">
                Декабрь 2027: {formatMln(totals.decRevenueRub)}
              </div>
            </div>

            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                Товарная себестоимость (COGS)
              </div>
              <div className="text-[24px] font-bold text-[#141413]">
                {hasCost ? formatMln(finSummary.totalCogsRub) : 'Скрыто ролью'}
              </div>
              <div className="text-[11.5px] text-[#5E5D58]">
                Валовая прибыль до MP:{' '}
                {hasCost ? formatMln(finSummary.totalGrossProfitRub) : '—'}
              </div>
            </div>

            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                Операционная прибыль (честная)
              </div>
              <div className="text-[24px] font-bold text-[#141413]">
                {finSummary.filledOpCount > 0
                  ? formatMln(finSummary.honestOpProfitRub)
                  : 'Не рассчитана'}
              </div>
              <div className="text-[11.5px] text-[#5E5D58]">
                Заполнены MP/OPEX: {finSummary.filledOpCount} из {eligibleModels.length} SKU
              </div>
            </div>

            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                Пиковая потребность в капитале
              </div>
              <div className="text-[24px] font-bold text-[#141413]">
                {formatMln(finSummary.peakCapitalRub)}
              </div>
              <div className="text-[11.5px] text-[#5E5D58]">
                С учётом авансов фабрикам (30% / 70%)
              </div>
            </div>
          </section>

          {/* 1. Помесячный Cash Flow 2027 */}
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
                01 · Денежный поток 2027
              </div>
              <h2 className="text-[18px] font-bold text-[#141413] mt-0.5">
                Помесячный Cash Flow: поступления от продаж и выплаты фабрикам (млн ₽)
              </h2>
            </div>

            <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4]">
                    <th className="py-2.5 px-3 font-bold min-w-[205px] sticky left-0 z-10 bg-[#F5F5F1] border-r border-[#DFDED6]">
                      Статья потока
                    </th>
                    {MONTHS_SHORT_RU.map((m) => (
                      <th key={m} className="py-2.5 px-2 font-bold text-right">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E3DC]">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-[#141413] sticky left-0 z-10 bg-white border-r border-[#ECEBE4]">
                      Поступления от продаж
                    </td>
                    {finSummary.monthlyInflow.map((v, i) => (
                      <td key={i} className="py-2.5 px-2 text-right font-mono text-[#157347] font-semibold">
                        {(v / 1_000_000).toFixed(1).replace('.', ',')}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-[#141413] sticky left-0 z-10 bg-white border-r border-[#ECEBE4]">
                      Оплаты фабрикам (30% / 70%)
                    </td>
                    {finSummary.monthlyProcOutflow.map((v, i) => (
                      <td key={i} className="py-2.5 px-2 text-right font-mono text-[#5E5D58]">
                        {v > 0 ? `−${(v / 1_000_000).toFixed(1).replace('.', ',')}` : '0,0'}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-[#FAFAF7] font-bold">
                    <td className="py-2.5 px-3 text-[#141413] sticky left-0 z-10 bg-[#FAFAF7] border-r border-[#ECEBE4]">
                      Чистый поток месяца
                    </td>
                    {finSummary.monthlyNet.map((v, i) => (
                      <td
                        key={i}
                        className={`py-2.5 px-2 text-right font-mono ${
                          v < 0 ? 'text-[#B45309]' : 'text-[#141413]'
                        }`}
                      >
                        {v >= 0 ? '+' : ''}
                        {(v / 1_000_000).toFixed(1).replace('.', ',')}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 2. Юнит-экономика по моделям */}
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
                02 · Юнит-экономика по SKU
              </div>
              <h2 className="text-[18px] font-bold text-[#141413] mt-0.5">
                Маржинальность и статус расходов по каждой модели ({finSummary.perSku.length} SKU)
              </h2>
            </div>

            <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
              <table className="w-full text-left border-collapse text-[12.5px]">
                <thead>
                  <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4]">
                    <th className="py-2.5 px-3.5 font-bold">SKU / Модель</th>
                    <th className="py-2.5 px-3 font-bold text-right">Цена компл.</th>
                    <th className="py-2.5 px-3 font-bold text-right">Себест. компл.</th>
                    <th className="py-2.5 px-3 font-bold text-right">Валовая маржа</th>
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
                        title="Нажмите, чтобы заполнить комиссии MP и OPEX в карточке SKU"
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
                              Не заполнены MP/OPEX
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
