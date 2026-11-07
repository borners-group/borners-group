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
// 03 · ЗАКУПКИ: ПОЛНОЦЕННЫЙ РАБОЧИЙ КОНТУР ПАРТИЙ ФАБРИК, СКЛАДА, СЕБЕСТОИМОСТИ И PO
// =============================================================================
export function ProcurementContourView() {
  const { tasks, currentUser, navigateTo, notify } = usePlatform();
  const {
    orderedScenarios,
    currentScenario,
    selectedScenarioId,
    setSelectedScenarioId,
    includeGroupPortfolioInS1,
    setIncludeGroupPortfolioInS1,
    eligibleModels,
    updateModelSpec,
    updateModelsBatch,
  } = useLiveScenarioPortfolio();

  const [subTab, setSubTab] = useState<'batches' | 'crm'>('batches');
  const [newPoOpen, setNewPoOpen] = useState(false);
  const [newPoModelId, setNewPoModelId] = useState<string>('');
  const [newPoFactory, setNewPoFactory] = useState<string>('');
  const [newPoMonthIdx, setNewPoMonthIdx] = useState<number>(0);
  const [newPoPacks, setNewPoPacks] = useState<number>(1000);
  const [newPoCost, setNewPoCost] = useState<number>(600);
  const [newPoStatus, setNewPoStatus] =
    useState<ApprovedPurchaseOrder['status']>('approved');
  const [newPoNote, setNewPoNote] = useState<string>('');

  const [expandedFactoryKey, setExpandedFactoryKey] = useState<string | null>(null);
  const [skuSearch, setSkuSearch] = useState('');
  const [skuFilter, setSkuFilter] = useState<
    'all' | 'deficit' | 'missing_cost' | 'covered'
  >('all');
  const [customOrderDrafts, setCustomOrderDrafts] = useState<
    Record<string, { packs?: number; monthIdx?: number }>
  >({});

  // Инициализация выбранной модели в конструкторе нового PO
  useEffect(() => {
    if (eligibleModels.length === 0) return;
    const found =
      eligibleModels.find((m) => m.id === newPoModelId) || eligibleModels[0];
    if (found && found.id !== newPoModelId) {
      const ens = ensureModelUnifiedV11(found);
      setNewPoModelId(ens.id);
      setNewPoFactory(
        ens.sharedSupplyAndFact?.factoryParams.factoryName ||
          'Фабрика-партнёр BORNERS (КНР)'
      );
      setNewPoCost(ens.unitCostRub || 0);
      setNewPoPacks(
        Math.max(ens.sharedSupplyAndFact?.factoryParams.moqPacks || 1000, 500)
      );
    }
  }, [eligibleModels, newPoModelId]);

  const openTasksCount = useMemo(
    () => tasks.filter((t) => !t.isArchived && t.status !== 'Done').length,
    [tasks]
  );

  const procData = useMemo(() => {
    let approvedCount = 0;
    let approvedRub = 0;
    let recPacks = 0;
    let recUnits = 0;
    let recBudgetRub = 0;
    let urgentCount = 0;
    let deficitSkuCount = 0;
    let missingCostSkuCount = 0;

    const approvedOrdersFlat: {
      model: ScenarioModelSpec;
      po: ApprovedPurchaseOrder;
    }[] = [];

    const perSku = eligibleModels.map((rawM) => {
      const m = ensureModelUnifiedV11(rawM);
      const plan = computeProcurementPlan(m, currentScenario);
      approvedCount += plan.approvedOrders.length;
      approvedRub += plan.approvedOrders.reduce((s, o) => s + o.totalOrderRub, 0);
      for (const po of plan.approvedOrders) {
        approvedOrdersFlat.push({ model: m, po });
      }
      recPacks += plan.totalRecommendedPacks;
      recUnits += plan.totalRecommendedUnits;
      recBudgetRub += plan.totalRecommendedBudgetRub || 0;
      const skuUrgent = plan.recommendedBatches.filter(
        (b) => b.isUrgentPastOrderDate
      ).length;
      urgentCount += skuUrgent;
      if (plan.hasDeficit) deficitSkuCount += 1;
      if (!m.unitCostRub || m.unitCostRub <= 0) missingCostSkuCount += 1;
      return { model: m, plan, skuUrgent };
    });

    const factoryGroups = groupRecommendedBatchesByFactory(
      eligibleModels,
      currentScenario
    );

    return {
      approvedCount,
      approvedRub,
      approvedOrdersFlat,
      recPacks,
      recUnits,
      recBudgetRub,
      urgentCount,
      deficitSkuCount,
      missingCostSkuCount,
      perSku,
      factoryGroups,
    };
  }, [eligibleModels, currentScenario]);

  const filteredPerSku = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return procData.perSku.filter(({ model, plan }) => {
      if (skuFilter === 'deficit' && !plan.hasDeficit) return false;
      if (skuFilter === 'missing_cost' && model.unitCostRub > 0) return false;
      if (skuFilter === 'covered' && plan.hasDeficit) return false;
      if (!q) return true;
      const acting = getActingSkuByWbOrVendor(model.code, model.title);
      return (
        model.code.toLowerCase().includes(q) ||
        model.title.toLowerCase().includes(q) ||
        (acting?.wbSku || '').toLowerCase().includes(q) ||
        (
          model.sharedSupplyAndFact?.factoryParams.factoryName || ''
        )
          .toLowerCase()
          .includes(q)
      );
    });
  }, [procData.perSku, skuSearch, skuFilter]);

  const approverName = currentUser?.fullName || 'Владелец';

  const handleSelectNewPoModel = (id: string) => {
    setNewPoModelId(id);
    const target = eligibleModels.find((m) => m.id === id);
    if (!target) return;
    const ens = ensureModelUnifiedV11(target);
    const plan = computeProcurementPlan(ens, currentScenario);
    setNewPoFactory(
      ens.sharedSupplyAndFact?.factoryParams.factoryName ||
        'Фабрика-партнёр BORNERS (КНР)'
    );
    setNewPoCost(ens.unitCostRub || 0);
    setNewPoPacks(
      plan.recommendedBatches[0]?.recommendedPacks ||
        ens.sharedSupplyAndFact?.factoryParams.moqPacks ||
        1000
    );
    setNewPoMonthIdx(plan.recommendedBatches[0]?.firstCoveredMonthIdx ?? 0);
  };

  const handleCreateManualPo = () => {
    const target = eligibleModels.find((m) => m.id === newPoModelId);
    if (!target) return;
    const updated = createCustomPurchaseOrder(target, {
      packsQty: newPoPacks,
      unitCostRub: newPoCost,
      factoryName: newPoFactory,
      arrivalMonthIdx: newPoMonthIdx,
      status: newPoStatus,
      note: newPoNote,
      author: approverName,
      year: currentScenario.year || 2027,
    });
    updateModelSpec(updated);
    setNewPoNote('');
    setNewPoOpen(false);
    notify(
      'success',
      `Создан заказ PO для ${target.code} (${newPoPacks.toLocaleString('ru-RU')} компл.)`,
      `Приход: ${MONTHS_SHORT_RU[newPoMonthIdx]} ${currentScenario.year || 2027}`
    );
  };

  const handleApproveFactoryGroup = (factoryName: string, orderMonthLabel: string) => {
    const eligibleIds = new Set(eligibleModels.map((m) => m.id));
    let createdCount = 0;

    updateModelsBatch((prev) =>
      prev.map((m) => {
        if (!eligibleIds.has(m.id)) return m;
        const plan = computeProcurementPlan(m, currentScenario);
        const matching = plan.recommendedBatches.filter(
          (b) =>
            b.factoryName === factoryName &&
            b.recommendedOrderDateIso.slice(0, 7) === orderMonthLabel
        );
        if (matching.length === 0) return m;
        let nextM = m;
        for (const b of matching) {
          nextM = approveRecommendedBatch(nextM, b, approverName);
          createdCount += 1;
        }
        return nextM;
      })
    );

    if (createdCount > 0) {
      notify(
        'success',
        `Утверждена сводная поставка ${factoryName} (${orderMonthLabel})`,
        `Оформлено заказов PO: ${createdCount} шт.`
      );
    }
  };

  const handleApproveSkuBatches = (model: ScenarioModelSpec) => {
    const plan = computeProcurementPlan(model, currentScenario);
    if (plan.recommendedBatches.length === 0) return;

    let nextModel = model;
    for (const batch of plan.recommendedBatches) {
      nextModel = approveRecommendedBatch(nextModel, batch, approverName);
    }
    updateModelSpec(nextModel);
    notify(
      'success',
      `Утверждено ${plan.recommendedBatches.length} PO для ${model.code}`,
      `Объём: ${plan.totalRecommendedPacks.toLocaleString('ru-RU')} компл.`
    );
  };

  const handleCreateQuickSkuPo = (
    model: ScenarioModelSpec,
    packsQty: number,
    arrivalMonthIdx: number
  ) => {
    const ens = ensureModelUnifiedV11(model);
    const updated = createCustomPurchaseOrder(ens, {
      packsQty: Math.max(1, Math.round(packsQty)),
      unitCostRub: ens.unitCostRub || 0,
      factoryName: ens.sharedSupplyAndFact?.factoryParams.factoryName,
      arrivalMonthIdx,
      author: approverName,
      year: currentScenario.year || 2027,
    });
    updateModelSpec(updated);
    notify(
      'success',
      `Создан заказ PO по ${model.code}: ${Math.max(1, Math.round(packsQty)).toLocaleString('ru-RU')} компл.`,
      `Приход: ${MONTHS_SHORT_RU[arrivalMonthIdx]} ${currentScenario.year || 2027}`
    );
  };

  const handleBulkApproveBatches = (onlyUrgent: boolean) => {
    const eligibleIds = new Set(eligibleModels.map((m) => m.id));
    let createdPoCount = 0;
    let affectedSkus = 0;

    updateModelsBatch((prev) =>
      prev.map((m) => {
        if (!eligibleIds.has(m.id)) return m;
        const plan = computeProcurementPlan(m, currentScenario);
        const toApprove = onlyUrgent
          ? plan.recommendedBatches.filter((b) => b.isUrgentPastOrderDate)
          : plan.recommendedBatches;
        if (toApprove.length === 0) return m;

        let nextM = m;
        for (const b of toApprove) {
          nextM = approveRecommendedBatch(nextM, b, approverName);
          createdPoCount += 1;
        }
        affectedSkus += 1;
        return nextM;
      })
    );

    if (createdPoCount > 0) {
      notify(
        'success',
        onlyUrgent
          ? `Утверждены срочные партии: ${createdPoCount} PO (${affectedSkus} SKU)`
          : `Утверждены все партии: ${createdPoCount} PO (${affectedSkus} SKU)`,
        'Номера заказов PO, авансы и график прихода синхронизированы с P&L и Сводкой.'
      );
    }
  };

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

  const openSkuProcurementCard = (modelId: string) => {
    try {
      sessionStorage.setItem('borners_open_scenario_model_id', modelId);
      sessionStorage.setItem('borners_open_scenario_model_tab', 'procurement');
    } catch {
      // ignore
    }
    navigateTo('dashboard');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Переключатель: Партии фабрик и PO | Операционные задачи CRM */}
      <div className="rounded-[14px] bg-white border-[1.5px] border-[#C8C7BE] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[9px] bg-[#EFEFE9] border-[1.5px] border-[#CECDC4] p-0.5 text-[12.5px] font-semibold">
          <button
            type="button"
            onClick={() => setSubTab('batches')}
            className={`h-8 px-3.5 rounded-[7px] transition cursor-pointer ${
              subTab === 'batches'
                ? 'bg-[#141413] text-white'
                : 'text-[#52514C] hover:text-[#141413]'
            }`}
          >
            Закупки, склад и заказы PO ({procData.approvedCount} PO /{' '}
            {procData.factoryGroups.length} парт.)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('crm')}
            className={`h-8 px-3.5 rounded-[7px] transition cursor-pointer ${
              subTab === 'crm'
                ? 'bg-[#141413] text-white'
                : 'text-[#52514C] hover:text-[#141413]'
            }`}
          >
            Задачи и поручения CRM ({openTasksCount})
          </button>
        </div>

        <span className="text-[12px] text-[#5E5D58]">
          Прямое управление остатками, себестоимостью, фабриками и заказами PO из одной таблицы
        </span>
      </div>

      {subTab === 'crm' ? (
        <RoadmapTasksView />
      ) : (
        <>
          <ScenarioContourHeader
            stepCode="03 · Закупки · Управление поставками, складом и PO"
            title="Заказы фабрикам (PO), остатки и себестоимость партий"
            subtitle="Меняйте остатки, фабрику и себестоимость прямо в таблице, создавайте собственные заказы PO или утверждайте сводные поставки."
            selectedScenarioId={selectedScenarioId}
            orderedScenarios={orderedScenarios}
            onSelectScenario={setSelectedScenarioId}
            includeGroupPortfolioInS1={includeGroupPortfolioInS1}
            onToggleGroupPortfolio={setIncludeGroupPortfolioInS1}
            eligibleCount={eligibleModels.length}
            rightSlot={
              <>
                <button
                  type="button"
                  onClick={() => setNewPoOpen((v) => !v)}
                  className={`h-9 px-3.5 rounded-[9px] text-[12px] font-semibold border-[1.5px] transition cursor-pointer ${
                    newPoOpen
                      ? 'bg-white text-[#141413] border-[#141413]'
                      : 'bg-[#141413] hover:bg-[#2A2A28] text-white border-[#141413]'
                  }`}
                >
                  {newPoOpen ? 'Скрыть форму PO' : '+ Новый заказ фабрике (PO)'}
                </button>

                {procData.urgentCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleBulkApproveBatches(true)}
                    className="h-9 px-3.5 rounded-[9px] bg-[#FFF7ED] hover:bg-[#FFEDD5] border-[1.5px] border-[#F59E0B] text-[12px] font-bold text-[#9A3412] transition cursor-pointer"
                  >
                    Утвердить срочные ({procData.urgentCount})
                  </button>
                )}

                {procData.recPacks > 0 && (
                  <button
                    type="button"
                    onClick={() => handleBulkApproveBatches(false)}
                    className="h-9 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:bg-white border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[#141413] text-[12px] font-semibold transition cursor-pointer"
                  >
                    Утвердить все расчётные партии
                  </button>
                )}

                {procData.approvedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleExportAllPoCsv}
                    className="h-9 px-3.5 rounded-[9px] bg-white hover:bg-[#F5F5F1] border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[#141413] text-[12px] font-semibold transition cursor-pointer"
                  >
                    Экспорт PO (CSV · {procData.approvedCount})
                  </button>
                )}
              </>
            }
          />

          {/* КОНСТРУКТОР НОВОГО ЗАКАЗА ФАБРИКЕ PO НА УРОВНЕ РАЗДЕЛА 03 · ЗАКУПКИ */}
          {newPoOpen && (
            <section className="rounded-[18px] bg-[#F7F7F4] border-[1.5px] border-[#141413] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-[#5E5D58]">
                    Ручное размещение заказа фабрике
                  </div>
                  <h2 className="text-[17px] font-bold text-[#141413]">
                    Создать заказ PO на любой артикул и месяц поставки
                  </h2>
                </div>
                <div className="text-[13px] font-bold text-[#141413]">
                  Сумма заказа:{' '}
                  <span className="font-mono">
                    {(Math.max(1, newPoPacks) * Math.max(0, newPoCost)).toLocaleString(
                      'ru-RU'
                    )}{' '}
                    ₽
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-[12px]">
                <label className="space-y-1 lg:col-span-2">
                  <span className="text-[#5E5D58] font-medium block">
                    Артикул SKU / Модель
                  </span>
                  <select
                    value={newPoModelId}
                    onChange={(e) => handleSelectNewPoModel(e.target.value)}
                    className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  >
                    {eligibleModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} — {m.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] font-medium block">Фабрика</span>
                  <input
                    type="text"
                    value={newPoFactory}
                    onChange={(e) => setNewPoFactory(e.target.value)}
                    placeholder="Название фабрики"
                    className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] font-medium block">Месяц прихода</span>
                  <select
                    value={newPoMonthIdx}
                    onChange={(e) => setNewPoMonthIdx(Number(e.target.value))}
                    className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                  >
                    {MONTHS_SHORT_RU.map((mName, idx) => (
                      <option key={mName} value={idx}>
                        {mName} {currentScenario.year || 2027}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] font-medium block">
                    Партия (компл.)
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={50}
                    value={newPoPacks}
                    onChange={(e) =>
                      setNewPoPacks(Math.max(1, Math.round(Number(e.target.value) || 1)))
                    }
                    className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] font-medium block">
                    Себест. (₽/компл.)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={newPoCost}
                    onChange={(e) =>
                      setNewPoCost(Math.max(0, Math.round(Number(e.target.value) || 0)))
                    }
                    className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
                  <select
                    value={newPoStatus}
                    onChange={(e) =>
                      setNewPoStatus(
                        e.target.value as ApprovedPurchaseOrder['status']
                      )
                    }
                    className="h-9 rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 text-[12px] font-semibold text-[#141413] outline-none"
                  >
                    {(
                      Object.keys(
                        PO_STATUS_LABELS_RU
                      ) as ApprovedPurchaseOrder['status'][]
                    ).map((st) => (
                      <option key={st} value={st}>
                        {PO_STATUS_LABELS_RU[st]}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={newPoNote}
                    onChange={(e) => setNewPoNote(e.target.value)}
                    placeholder="Комментарий к поставке (упаковка, транш, условия оплаты)..."
                    className="h-9 flex-1 rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-3 text-[12px] text-[#141413] outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPoOpen(false)}
                    className="h-9 px-3 rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] text-[12px] font-semibold text-[#5E5D58] hover:text-[#141413] cursor-pointer"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateManualPo}
                    className="h-9 px-4 rounded-[8px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[12px] font-semibold transition cursor-pointer"
                  >
                    Оформить заказ PO
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* 4 СВОДНЫХ KPI КОНТУРА ЗАКУПОК */}
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] overflow-hidden grid grid-cols-2 lg:grid-cols-4 divide-x-[1.5px] divide-y-[1.5px] lg:divide-y-0 divide-[#D8D7CF]">
            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                Рекомендовано к заказу
              </div>
              <div className="text-[23px] font-bold text-[#141413]">
                {procData.recPacks.toLocaleString('ru-RU')} компл.
              </div>
              <div className="text-[11.5px] text-[#5E5D58]">
                {procData.recUnits.toLocaleString('ru-RU')} физ. изделий
              </div>
            </div>

            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                Бюджет к размещению
              </div>
              <div className="text-[23px] font-bold text-[#141413]">
                {formatMln(procData.recBudgetRub)}
              </div>
              <div className="text-[11.5px] text-[#5E5D58]">
                Авансы: {formatMln(procData.recBudgetRub * 0.3)}
                {procData.missingCostSkuCount > 0
                  ? ` · без себест.: ${procData.missingCostSkuCount} SKU`
                  : ''}
              </div>
            </div>

            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                Оформленные заказы PO
              </div>
              <div className="text-[23px] font-bold text-[#157347]">
                {procData.approvedCount} шт.
              </div>
              <div className="text-[11.5px] text-[#5E5D58]">
                На сумму: {formatMln(procData.approvedRub)}
              </div>
            </div>

            <div className="p-5 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#5E5D58]">
                Контроль дефицита и сроков
              </div>
              <div className="text-[23px] font-bold text-[#141413]">
                {procData.deficitSkuCount} SKU без PO
              </div>
              <div
                className={`text-[11.5px] font-semibold ${
                  procData.urgentCount > 0 ? 'text-[#B45309]' : 'text-[#157347]'
                }`}
              >
                {procData.urgentCount > 0
                  ? `Срочные партии: ${procData.urgentCount}`
                  : 'Просроченных размещений нет'}
              </div>
            </div>
          </section>

          {/* РЕЕСТР ЗАКАЗОВ PO (ВСЕГДА ВИДЕН И ПОЛНОСТЬЮ РЕДАКТИРУЕМ ИНЛАЙН) */}
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
                  Реестр заказов фабрикам · Инлайн-управление PO
                </div>
                <h2 className="text-[18px] font-bold text-[#141413] mt-0.5">
                  Действующие заказы PO ({procData.approvedOrdersFlat.length} шт. ·{' '}
                  {formatMln(procData.approvedRub)})
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNewPoOpen(true)}
                  className="h-8.5 px-3 rounded-[8px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[12px] font-semibold cursor-pointer"
                >
                  + Добавить заказ PO
                </button>
                {procData.approvedOrdersFlat.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportAllPoCsv}
                    className="h-8.5 px-3 rounded-[8px] bg-[#F5F5F1] hover:bg-white border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[12px] font-semibold text-[#141413] cursor-pointer"
                  >
                    Скачать CSV
                  </button>
                )}
              </div>
            </div>

            {procData.approvedOrdersFlat.length === 0 ? (
              <div className="rounded-[12px] bg-[#F7F7F4] border border-dashed border-[#CECDC4] px-4 py-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-[#5E5D58]">
                <span>
                  Пока нет оформленных заказов PO. Нажмите «+ Добавить заказ PO», утвердите сводную поставку фабрики ниже или создайте заказ прямо в строке нужного SKU.
                </span>
                <button
                  type="button"
                  onClick={() => setNewPoOpen(true)}
                  className="h-8 px-3 rounded-[8px] bg-white border-[1.5px] border-[#141413] text-[12px] font-bold text-[#141413] cursor-pointer"
                >
                  Оформить первый PO →
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4]">
                      <th className="py-2.5 px-3 font-bold">Номер PO</th>
                      <th className="py-2.5 px-3 font-bold">Статус</th>
                      <th className="py-2.5 px-3 font-bold">SKU / Модель</th>
                      <th className="py-2.5 px-3 font-bold">Фабрика</th>
                      <th className="py-2.5 px-3 font-bold">Приход</th>
                      <th className="py-2.5 px-3 font-bold text-right">Комплектов</th>
                      <th className="py-2.5 px-3 font-bold text-right">Цена ₽/к.</th>
                      <th className="py-2.5 px-3 font-bold text-right">Сумма PO</th>
                      <th className="py-2.5 px-3 font-bold text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E3DC]">
                    {procData.approvedOrdersFlat.map(({ model, po }) => (
                      <tr key={po.id} className="hover:bg-[#FAFAF7]">
                        <td className="py-2 px-3 font-mono font-bold text-[#141413] whitespace-nowrap">
                          <div>{po.orderNumber}</div>
                          <div className="text-[10px] text-[#686762] font-normal">
                            заказ {po.orderPlacementDateIso}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={po.status}
                            onChange={(e) => {
                              const st = e.target
                                .value as ApprovedPurchaseOrder['status'];
                              updateModelSpec(
                                updateApprovedPurchaseOrder(
                                  model,
                                  po.id,
                                  { status: st },
                                  approverName,
                                  currentScenario.year || 2027
                                )
                              );
                            }}
                            className="h-7.5 px-2 rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] text-[11.5px] font-semibold text-[#141413] outline-none cursor-pointer"
                          >
                            {(
                              Object.keys(
                                PO_STATUS_LABELS_RU
                              ) as ApprovedPurchaseOrder['status'][]
                            ).map((st) => (
                              <option key={st} value={st}>
                                {PO_STATUS_LABELS_RU[st]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={() => openSkuProcurementCard(model.id)}
                            className="font-bold text-[#141413] hover:underline text-left cursor-pointer"
                          >
                            {model.title}
                          </button>
                          <div className="font-mono text-[10.5px] text-[#5E5D58]">
                            {model.code} · {po.physicalUnitsQty.toLocaleString('ru-RU')} изд.
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={po.factoryName}
                            onChange={(e) =>
                              updateModelSpec(
                                updateApprovedPurchaseOrder(
                                  model,
                                  po.id,
                                  { factoryName: e.target.value },
                                  approverName,
                                  currentScenario.year || 2027
                                )
                              )
                            }
                            className="h-7.5 w-[170px] rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 font-medium text-[#141413] outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={po.arrivalMonthIdx}
                            onChange={(e) =>
                              updateModelSpec(
                                updateApprovedPurchaseOrder(
                                  model,
                                  po.id,
                                  { arrivalMonthIdx: Number(e.target.value) },
                                  approverName,
                                  currentScenario.year || 2027
                                )
                              )
                            }
                            className="h-7.5 rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                          >
                            {MONTHS_SHORT_RU.map((mName, idx) => (
                              <option key={mName} value={idx}>
                                {mName} {currentScenario.year || 2027}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min={1}
                            step={50}
                            value={po.packsQty}
                            onChange={(e) =>
                              updateModelSpec(
                                updateApprovedPurchaseOrder(
                                  model,
                                  po.id,
                                  {
                                    packsQty: Math.max(
                                      1,
                                      Math.round(Number(e.target.value) || 1)
                                    ),
                                  },
                                  approverName,
                                  currentScenario.year || 2027
                                )
                              )
                            }
                            className="h-7.5 w-[88px] rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 text-right font-mono font-semibold text-[#141413] outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step={10}
                            value={po.lockedUnitCostRub}
                            onChange={(e) =>
                              updateModelSpec(
                                updateApprovedPurchaseOrder(
                                  model,
                                  po.id,
                                  {
                                    lockedUnitCostRub: Math.max(
                                      0,
                                      Math.round(Number(e.target.value) || 0)
                                    ),
                                  },
                                  approverName,
                                  currentScenario.year || 2027
                                )
                              )
                            }
                            className="h-7.5 w-[82px] rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 text-right font-mono font-semibold text-[#141413] outline-none"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-[#141413] whitespace-nowrap">
                          <div>{po.totalOrderRub.toLocaleString('ru-RU')} ₽</div>
                          <div className="text-[10px] font-normal text-[#5E5D58]">
                            аванс {po.prepaymentRub.toLocaleString('ru-RU')} ₽
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              updateModelSpec(
                                removeApprovedPurchaseOrder(
                                  model,
                                  po.id,
                                  approverName
                                )
                              );
                              notify('warning', `Заказ ${po.orderNumber} удалён`);
                            }}
                            className="h-7.5 px-2.5 rounded-[6px] bg-white hover:bg-[#FEF2F2] border border-[#CECDC4] hover:border-[#FCA5A5] text-[11px] font-semibold text-[#B91C1C] cursor-pointer"
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 01 · СВОДНЫЕ ПАРТИИ ПО ФАБРИКАМ С РАСКРЫТИЕМ СОСТАВА И УТВЕРЖДЕНИЕМ В 1 КЛИК */}
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4">
            <div>
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
                01 · Календарь размещения на фабриках
              </div>
              <h2 className="text-[18px] font-bold text-[#141413] mt-0.5">
                Сводные рекомендованные поставки по фабрикам ({procData.factoryGroups.length})
              </h2>
            </div>

            {procData.factoryGroups.length === 0 ? (
              <div className="rounded-[12px] bg-[#EAF6F0] border border-[#BBE5CE] px-4 py-4 text-[13px] font-semibold text-[#157347]">
                Все товарные потребности выбранного сценария полностью покрыты начальным остатком и утверждёнными заказами PO.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4]">
                      <th className="py-2.5 px-3.5 font-bold">Месяц заказа</th>
                      <th className="py-2.5 px-3.5 font-bold">Фабрика</th>
                      <th className="py-2.5 px-3 font-bold text-right">Позиций</th>
                      <th className="py-2.5 px-3 font-bold text-right">Комплектов</th>
                      <th className="py-2.5 px-3 font-bold text-right">Физ. изделий</th>
                      <th className="py-2.5 px-3 font-bold text-right">Бюджет партии</th>
                      <th className="py-2.5 px-3.5 font-bold text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E3DC]">
                    {procData.factoryGroups.map((grp) => {
                      const fKey = `${grp.factoryName}__${grp.orderMonthLabel}`;
                      const isExp = expandedFactoryKey === fKey;
                      return (
                        <React.Fragment key={fKey}>
                          <tr className="hover:bg-[#FAFAF7]">
                            <td className="py-2.5 px-3.5 font-mono font-bold text-[#141413]">
                              {grp.orderMonthLabel}
                            </td>
                            <td className="py-2.5 px-3.5 font-semibold text-[#141413]">
                              {grp.factoryName}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedFactoryKey(isExp ? null : fKey)
                                }
                                className="px-2 py-0.5 rounded bg-[#F5F5F1] border border-[#CECDC4] hover:border-[#141413] text-[11px] font-semibold text-[#141413] cursor-pointer"
                              >
                                {grp.itemsCount} SKU {isExp ? '▲' : '▼'}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold">
                              {grp.totalPacks.toLocaleString('ru-RU')} компл.
                            </td>
                            <td className="py-2.5 px-3 text-right text-[#5E5D58]">
                              {grp.totalPhysicalUnits.toLocaleString('ru-RU')} изд.
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-[#141413]">
                              <div>{grp.totalBudgetRub.toLocaleString('ru-RU')} ₽</div>
                              <div className="text-[10.5px] font-normal text-[#5E5D58]">
                                аванс {Math.round(grp.totalBudgetRub * 0.3).toLocaleString('ru-RU')} ₽
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  handleApproveFactoryGroup(
                                    grp.factoryName,
                                    grp.orderMonthLabel
                                  )
                                }
                                className="h-8 px-3 rounded-[7px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[11.5px] font-semibold transition cursor-pointer"
                              >
                                Утвердить поставку в PO
                              </button>
                            </td>
                          </tr>
                          {isExp && (
                            <tr className="bg-[#F7F7F4]">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11.5px]">
                                  {grp.lines.map((ln, idx) => (
                                    <div
                                      key={`${ln.modelId}-${idx}`}
                                      className="rounded-[9px] bg-white border border-[#CECDC4] px-3 py-2 flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openSkuProcurementCard(ln.modelId)
                                          }
                                          className="font-bold text-[#141413] hover:underline truncate block text-left cursor-pointer"
                                        >
                                          {ln.title}
                                        </button>
                                        <div className="font-mono text-[10.5px] text-[#5E5D58]">
                                          {ln.skuCode} · склад к {ln.requiredArrivalDateIso}
                                        </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <div className="font-bold text-[#141413]">
                                          {ln.recommendedPacks.toLocaleString('ru-RU')} к.
                                        </div>
                                        <div className="text-[10.5px] text-[#5E5D58]">
                                          {ln.estimatedTotalRub > 0
                                            ? `${ln.estimatedTotalRub.toLocaleString('ru-RU')} ₽`
                                            : 'цена 0 ₽'}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 02 · ИНТЕРАКТИВНАЯ МАТРИЦА ПО КАЖДОМУ SKU: ПРЯМОЕ РЕДАКТИРОВАНИЕ ФАБРИКИ, СКЛАДА, СЕБЕСТОИМОСТИ И БЫСТРЫЙ ЗАКАЗ PO */}
          <section className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
                  02 · Рабочая таблица снабжения по артикулам
                </div>
                <h2 className="text-[18px] font-bold text-[#141413] mt-0.5">
                  Остатки, себестоимость, фабрики и быстрый выпуск PO ({filteredPerSku.length} из{' '}
                  {procData.perSku.length} мод.)
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={skuSearch}
                  onChange={(e) => setSkuSearch(e.target.value)}
                  placeholder="Поиск SKU, WB, фабрики..."
                  className="h-8.5 w-[210px] rounded-[8px] bg-[#F5F5F1] focus:bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-3 text-[12px] text-[#141413] outline-none"
                />

                <div className="inline-flex rounded-[8px] bg-[#EFEFE9] border border-[#CECDC4] p-0.5 text-[11.5px] font-semibold">
                  {(
                    [
                      ['all', `Все (${procData.perSku.length})`],
                      ['deficit', `Дефицит (${procData.deficitSkuCount})`],
                      [
                        'missing_cost',
                        `Без себест. (${procData.missingCostSkuCount})`,
                      ],
                      [
                        'covered',
                        `Обеспечены (${
                          procData.perSku.length - procData.deficitSkuCount
                        })`,
                      ],
                    ] as const
                  ).map(([fKey, label]) => (
                    <button
                      key={fKey}
                      type="button"
                      onClick={() => setSkuFilter(fKey)}
                      className={`h-7 px-2.5 rounded-[6px] transition cursor-pointer ${
                        skuFilter === fKey
                          ? 'bg-[#141413] text-white'
                          : 'text-[#52514C] hover:text-[#141413]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[12px] border-[1.5px] border-[#CECDC4]">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#F5F5F1] text-[#5E5D58] border-b-[1.5px] border-[#CECDC4]">
                    <th className="py-2.5 px-3 font-bold">SKU / Модель</th>
                    <th className="py-2.5 px-2.5 font-bold">Фабрика</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">На складе</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Себест. ₽/к.</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">План 2027</th>
                    <th className="py-2.5 px-2.5 font-bold">Статус</th>
                    <th className="py-2.5 px-3 font-bold text-right">
                      Партия к заказу и выпуск PO
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E3DC]">
                  {filteredPerSku.map(({ model, plan, skuUrgent }) => {
                    const acting = getActingSkuByWbOrVendor(model.code, model.title);
                    const shared = model.sharedSupplyAndFact!;
                    const draft = customOrderDrafts[model.id] || {};
                    const defaultPacks =
                      plan.recommendedBatches[0]?.recommendedPacks ||
                      shared.factoryParams.moqPacks ||
                      1000;
                    const defaultMonthIdx =
                      plan.recommendedBatches[0]?.firstCoveredMonthIdx ?? 0;
                    const orderPacks = draft.packs ?? defaultPacks;
                    const orderMonthIdx = draft.monthIdx ?? defaultMonthIdx;

                    return (
                      <tr key={model.id} className="hover:bg-[#FAFAF7] transition">
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => openSkuProcurementCard(model.id)}
                            title="Открыть вкладку «03 · Закупки» внутри паспорта этого SKU"
                            className="font-bold text-[#141413] hover:underline text-left cursor-pointer"
                          >
                            {model.title}
                          </button>
                          <div className="font-mono text-[10.5px] text-[#5E5D58] flex items-center gap-1.5">
                            <span>
                              {acting ? `WB ${acting.wbSku}` : model.code} ·{' '}
                              {model.unitsInPack} изд./компл.
                            </span>
                            <button
                              type="button"
                              onClick={() => openSkuProcurementCard(model.id)}
                              className="text-[#141413] font-sans font-semibold underline cursor-pointer"
                            >
                              Карточка →
                            </button>
                          </div>
                        </td>

                        <td className="py-2.5 px-2.5">
                          <input
                            type="text"
                            value={shared.factoryParams.factoryName}
                            onChange={(e) =>
                              updateModelSpec({
                                ...model,
                                sharedSupplyAndFact: {
                                  ...shared,
                                  factoryParams: {
                                    ...shared.factoryParams,
                                    factoryName: e.target.value,
                                  },
                                },
                              })
                            }
                            className="h-8 w-[165px] rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 text-[11.5px] font-medium text-[#141413] outline-none"
                          />
                        </td>

                        <td className="py-2.5 px-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={shared.actualOpeningStockPacks}
                            onChange={(e) =>
                              updateModelSpec({
                                ...model,
                                sharedSupplyAndFact: {
                                  ...shared,
                                  actualOpeningStockPacks: Math.max(
                                    0,
                                    Math.round(Number(e.target.value) || 0)
                                  ),
                                },
                              })
                            }
                            className="h-8 w-[82px] rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 text-right font-mono font-semibold text-[#141413] outline-none"
                          />
                        </td>

                        <td className="py-2.5 px-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            step={10}
                            value={model.unitCostRub || 0}
                            onChange={(e) => {
                              const nextCost = Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0)
                              );
                              updateModelSpec({
                                ...model,
                                unitCostRub: nextCost,
                                sharedSupplyAndFact: {
                                  ...shared,
                                  costStatus: nextCost > 0 ? 'plan' : 'not_filled',
                                },
                              });
                            }}
                            className={`h-8 w-[82px] rounded-[7px] border px-2 text-right font-mono font-semibold outline-none ${
                              model.unitCostRub > 0
                                ? 'bg-white border-[#CECDC4] focus:border-[#141413] text-[#141413]'
                                : 'bg-[#FFFBEB] border-[#F59E0B] text-[#92400E]'
                            }`}
                          />
                        </td>

                        <td className="py-2.5 px-2.5 text-right font-mono">
                          <div className="font-semibold text-[#141413]">
                            {plan.annualDemandPacks.toLocaleString('ru-RU')} к.
                          </div>
                          {plan.totalApprovedReceiptsPacks > 0 && (
                            <div className="text-[10px] text-[#157347] font-bold">
                              PO: +{plan.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} к.
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-2.5">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-[6px] text-[10.5px] font-bold border ${
                              !plan.hasDeficit
                                ? 'bg-[#EAF6F0] text-[#157347] border-[#BBE5CE]'
                                : skuUrgent > 0
                                ? 'bg-[#FFF7ED] text-[#B45309] border-[#FCD34D]'
                                : 'bg-[#F3F3EE] text-[#3F3E3A] border-[#D8D7CF]'
                            }`}
                          >
                            {!plan.hasDeficit
                              ? `Обеспечено (${plan.approvedOrders.length} PO)`
                              : `Дефицит ${plan.totalDeficitPacks.toLocaleString('ru-RU')} к.`}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              min={1}
                              step={50}
                              value={orderPacks}
                              onChange={(e) =>
                                setCustomOrderDrafts((prev) => ({
                                  ...prev,
                                  [model.id]: {
                                    ...prev[model.id],
                                    packs: Math.max(
                                      1,
                                      Math.round(Number(e.target.value) || 1)
                                    ),
                                  },
                                }))
                              }
                              title="Количество комплектов для заказа PO"
                              className="h-8 w-[80px] rounded-[7px] bg-[#F7F7F4] border border-[#CECDC4] focus:border-[#141413] px-2 text-right font-mono text-[11.5px] font-semibold text-[#141413] outline-none"
                            />
                            <select
                              value={orderMonthIdx}
                              onChange={(e) =>
                                setCustomOrderDrafts((prev) => ({
                                  ...prev,
                                  [model.id]: {
                                    ...prev[model.id],
                                    monthIdx: Number(e.target.value),
                                  },
                                }))
                              }
                              title="Месяц прихода партии на склад"
                              className="h-8 rounded-[7px] bg-[#F7F7F4] border border-[#CECDC4] focus:border-[#141413] px-1.5 text-[11.5px] font-semibold text-[#141413] outline-none"
                            >
                              {MONTHS_SHORT_RU.map((mName, idx) => (
                                <option key={mName} value={idx}>
                                  {mName}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() =>
                                handleCreateQuickSkuPo(
                                  model,
                                  orderPacks,
                                  orderMonthIdx
                                )
                              }
                              className="h-8 px-2.5 rounded-[7px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[11px] font-semibold transition cursor-pointer"
                            >
                              + В PO
                            </button>

                            {plan.recommendedBatches.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleApproveSkuBatches(model)}
                                title="Утвердить сразу все расчётные партии года по этому SKU"
                                className="h-8 px-2.5 rounded-[7px] bg-[#F5F5F1] hover:bg-white border border-[#CECDC4] hover:border-[#141413] text-[#141413] text-[11px] font-semibold transition cursor-pointer"
                              >
                                Все ({plan.recommendedBatches.length})
                              </button>
                            )}
                          </div>
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
