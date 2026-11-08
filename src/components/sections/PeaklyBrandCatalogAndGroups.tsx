'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
// 1. СВОДНАЯ ВСЕХ КАБИНЕТОВ И БРЕНДОВ В СТИЛЕ PEAKLY (ДЛЯ ГЛАВНОЙ СТРАНИЦЫ)
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
  const [monthlyCashflowOpen, setMonthlyCashflowOpen] = useState(false);

  const gt = multiBrandSummary.groupTotal;
  const activeBrandsCount = multiBrandSummary.brands.filter(
    (b) => b.hasScenario && b.hasModels
  ).length;
  const groupMarginPct =
    gt.annualRevenueRub > 0
      ? Math.round((gt.annualEstimatedOperatingProfitRub / gt.annualRevenueRub) * 1000) / 10
      : 0;

  return (
    <section className="rounded-[18px] bg-white border border-[#D4D3CA] overflow-hidden shadow-[0_6px_24px_-8px_rgba(20,20,19,0.06)]">
      {/* ШАПКА БЛОКА В СТИЛЕ PEAKLY */}
      <div className="px-5 py-4 bg-[#FAF9F6] border-b border-[#EAE9E2] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[#141413] text-white font-mono text-[10.5px] font-bold uppercase tracking-wider">
            <Layers className="h-3.5 w-3.5" />
            <span>Сводная всех кабинетов · Peakly Pulse</span>
          </span>
          <div>
            <h2 className="text-[16px] md:text-[17.5px] font-extrabold tracking-[-0.02em] text-[#141413]">
              Все важные показатели по кабинетам и брендам BORNERS GROUP (2027–2028)
            </h2>
            <p className="text-[11.5px] text-[#686760]">
              У каждого бренда свой независимый сценарий развития · Продажи, закупки, авансы фабрикам, пик своих денег и прибыль без двойного счёта
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthlyCashflowOpen((v) => !v)}
            className="h-8 px-3 rounded-[9px] border border-[#CFCEC6] bg-white hover:bg-[#F4F3EE] text-[11.5px] font-semibold text-[#141413] transition cursor-pointer inline-flex items-center gap-1.5"
          >
            <Calendar className="h-3.5 w-3.5 text-[#52514C]" />
            <span>{monthlyCashflowOpen ? 'Скрыть помесячный график ▴' : 'График денег 12 мес. ▾'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('roadmap-tasks')}
            className="h-8 px-3 rounded-[9px] bg-[#157347] hover:bg-[#115E3A] text-white text-[11.5px] font-semibold transition cursor-pointer"
          >
            Партии и закупки →
          </button>
        </div>
      </div>

      {/* 5 ГЛАВНЫХ ПОКАЗАТЕЛЕЙ ВСЕХ КАБИНЕТОВ НА ГЛАВНОЙ (КРАСИВАЯ ЕДИНАЯ ПОЛОСА PEAKLY) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#EAE9E2] bg-white border-b border-[#EAE9E2]">
        {/* 1. План продаж (Все кабинеты) */}
        <div className="p-4 md:p-5 flex flex-col justify-between gap-2">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#686762]">
                1. Продажи всех кабинетов
              </span>
              <span className="rounded-md bg-[#F4F3EE] px-2 py-0.5 font-mono text-[10px] font-bold text-[#141413]">
                {gt.modelsCount} SKU · {activeBrandsCount}/5 каб.
              </span>
            </div>
            <div className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] text-[#141413]">
              {formatMln(gt.annualRevenueRub)}
            </div>
          </div>
          <div className="flex items-center justify-between text-[11.5px] text-[#686762]">
            <span>
              Пик дек:{' '}
              <strong className="font-mono text-[#141413]">
                {formatMln(gt.decemberRevenueRub)}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigateSection('launch-calendar')}
              className="font-bold text-[#141413] hover:underline cursor-pointer"
            >
              02 · Продажи →
            </button>
          </div>
        </div>

        {/* 2. Объём и бюджет закупок */}
        <div className="p-4 md:p-5 flex flex-col justify-between gap-2">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#686762]">
                2. План закупок (Год)
              </span>
              <span className="rounded-md bg-[#F4F3EE] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#52514C]">
                4 кварт. волны
              </span>
            </div>
            <div className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] text-[#141413]">
              {formatMln(gt.totalProcurementBudgetRub)}
            </div>
          </div>
          <div className="text-[11px] text-[#52514C] font-medium truncate" title={multiBrandSummary.procurementBreakdownText}>
            К заказу: <strong className="font-mono text-[#141413]">{multiBrandSummary.procurementBreakdownText}</strong>
          </div>
        </div>

        {/* 3. Вложить на старт (1-я волна Q1 + Аванс 30%) */}
        <div className="p-4 md:p-5 flex flex-col justify-between gap-2 bg-[#F4FBF7]/70">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#146C43]">
                3. Старт 1-й партии (Q1)
              </span>
              <span className="rounded-md bg-[#EAF6F0] border border-[#BCE3CF] px-2 py-0.5 font-mono text-[10px] font-bold text-[#146C43]">
                Аванс 30%
              </span>
            </div>
            <div className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] text-[#0F5132]">
              {formatMln(gt.firstWaveStartBudgetRub)}
            </div>
          </div>
          <div className="text-[11.5px] text-[#145A38]">
            Предоплата сейчас:{' '}
            <strong className="font-mono">{formatMln(gt.firstWavePrepaymentRub)}</strong>
          </div>
        </div>

        {/* 4. Пик собственных денег (с учётом оборота WB) */}
        <div className="p-4 md:p-5 flex flex-col justify-between gap-2 bg-[#F5F9FF]/70">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#1E40AF]">
                4. Пик своих денег (с WB)
              </span>
              <span className="rounded-md bg-[#E8F0FE] px-2 py-0.5 font-mono text-[10px] font-bold text-[#1E3A8A]">
                Оборотный пик
              </span>
            </div>
            <div className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] text-[#1E3A8A]">
              {gt.verifiedOwnMoneyRequiredRub !== null
                ? formatMln(gt.verifiedOwnMoneyRequiredRub)
                : '—'}
            </div>
          </div>
          <div className="text-[11px] text-[#1E40AF]">
            {gt.verifiedOwnMoneyRequiredRub !== null
              ? 'Дальнейшие партии — из выручки WB'
              : multiBrandSummary.ownMoneyStatusLabel}
          </div>
        </div>

        {/* 5. Ожидаемая операционная прибыль */}
        <div className="p-4 md:p-5 flex flex-col justify-between gap-2">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#686762]">
                5. Ожидаемая прибыль
              </span>
              <span className="rounded-md bg-[#EAF6F0] px-2 py-0.5 font-mono text-[10px] font-bold text-[#146C43]">
                {groupMarginPct.toFixed(1).replace('.', ',')}% маржа
              </span>
            </div>
            <div className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] text-[#157347]">
              +{formatMln(gt.annualEstimatedOperatingProfitRub)}
            </div>
          </div>
          <div className="flex items-center justify-between text-[11.5px] text-[#686762]">
            <span>
              Себест. продаж:{' '}
              <strong className="font-mono text-[#141413]">
                {formatMln(gt.annualSoldGoodsCostRub)}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigateSection('finance')}
              className="font-bold text-[#141413] hover:underline cursor-pointer"
            >
              P&L →
            </button>
          </div>
        </div>
      </div>

      {/* КАРТОЧКИ-СТРОКИ 5 КАБИНЕТОВ / БРЕНДОВ С ИНДИВИДУАЛЬНЫМ СЦЕНАРИЕМ РАЗВИТИЯ КАЖДОГО БРЕНДА */}
      <div className="p-4 md:p-5 bg-[#FAF9F6]/60 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="text-[12.5px] font-bold text-[#141413]">
            Кабинеты и бренды группы (нажмите на кабинет для фильтрации или выберите сценарий развития бренда)
          </div>
          {activeBrandFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => onSelectBrandFilter('ALL')}
              className="text-[11.5px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-[7px] cursor-pointer transition"
            >
              Показать все кабинеты (сейчас: {activeBrandFilter}) ×
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2">
          {multiBrandSummary.brands.map((b) => {
            const unitCfg = getBrandUnitConfig(b.brandCode);
            const brandScenarios = getScenariosForBrand(scenarios, b.brandCode);
            const accent = getModelBrandAccentStyles(b.brandCode);
            const isSelectedBrand =
              activeBrandFilter !== 'ALL' &&
              normalizePortfolioBrandCode(activeBrandFilter) === b.brandCode;

            return (
              <div
                key={b.brandCode}
                onClick={() => {
                  onSelectBrandFilter(b.brandCode);
                  if (b.selectedScenarioId !== null) {
                    onSelectActiveScenarioId(b.selectedScenarioId);
                  }
                }}
                className={`rounded-[13px] bg-white border transition-all px-4 py-3 cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                  isSelectedBrand
                    ? 'border-2 border-[#141413] shadow-[0_4px_16px_-4px_rgba(20,20,19,0.1)]'
                    : 'border-[#DEDDD5] hover:border-[#141413]'
                }`}
              >
                {/* Левая часть: Бренд + Категория + Селектор сценария развития бренда */}
                <div className="flex flex-wrap items-center gap-3 min-w-[300px]">
                  <div className={`h-9 w-1.5 rounded-full ${accent.accentBar}`} />
                  <div className="min-w-[135px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-extrabold text-[#141413]">
                        {b.displayCode}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-[5px] font-mono text-[10px] font-bold border ${accent.badgeBg} ${accent.badgeText} ${accent.badgeBorder}`}
                      >
                        {b.modelsCount} SKU
                      </span>
                    </div>
                    <div className="text-[11px] text-[#686760]">
                      {unitCfg.categoryDefault} · ед.: <strong>{b.primaryUnit}</strong>
                    </div>
                  </div>

                  {/* Индивидуальный сценарий развития бренда */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 bg-[#FAF9F6] border border-[#E2E1D9] rounded-[9px] p-1"
                  >
                    <span className="text-[10.5px] font-semibold text-[#686760] pl-1.5">
                      Сценарий:
                    </span>
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
                      className="h-7 px-2 rounded-[6px] bg-white border border-[#D8D7CE] text-[11.5px] font-bold text-[#141413] focus:outline-none cursor-pointer"
                    >
                      <option value="">Нет сценария</option>
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
                      className="h-7 px-2 rounded-[6px] bg-[#141413] hover:bg-[#2B2B29] text-white text-[11px] font-semibold cursor-pointer"
                    >
                      + Свой сценарий
                    </button>
                  </div>
                </div>

                {/* Правая часть: Ключевые метрики кабинета (Продажи, Закупки, Старт Q1, Пик своих денег, Прибыль) */}
                {b.hasScenario && b.hasModels ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1 lg:max-w-[660px] text-right">
                    <div>
                      <div className="text-[10px] font-bold uppercase text-[#686762]">
                        Продажи (Год / Дек)
                      </div>
                      <div className="font-mono text-[13px] font-extrabold text-[#141413]">
                        {formatMln(b.annualRevenueRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#686760]">
                        дек: {formatMln(b.decemberRevenueRub)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold uppercase text-[#686762]">
                        Закупки (Объём)
                      </div>
                      <div className="font-mono text-[13px] font-bold text-[#141413]">
                        {b.totalProcurementQuantity.toLocaleString('ru-RU')} {b.primaryUnit}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#686760]">
                        {formatMln(b.totalProcurementBudgetRub)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold uppercase text-[#146C43]">
                        Старт Q1 (Аванс)
                      </div>
                      <div className="font-mono text-[13px] font-bold text-[#0F5132]">
                        {formatMln(b.firstWaveStartBudgetRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#146C43]">
                        аванс: {formatMln(b.firstWavePrepaymentRub)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold uppercase text-[#1E40AF]">
                        Пик своих денег
                      </div>
                      <div className="font-mono text-[13px] font-bold text-[#1E3A8A]">
                        {b.verifiedOwnMoneyRequiredRub !== null
                          ? formatMln(b.verifiedOwnMoneyRequiredRub)
                          : '—'}
                      </div>
                      <div className="text-[10px] text-[#686760]">с оборотом WB</div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold uppercase text-[#157347]">
                        Опер. прибыль
                      </div>
                      <div className="font-mono text-[13px] font-extrabold text-[#157347]">
                        +{formatMln(b.annualEstimatedOperatingProfitRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#686760]">
                        COGS: {formatMln(b.annualSoldGoodsCostRub)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-wrap items-center justify-between gap-3 flex-1 lg:max-w-[660px] rounded-[9px] bg-[#FAF9F6] border border-dashed border-[#CECDC4] px-3.5 py-2"
                  >
                    <span className="text-[11.5px] font-medium text-[#52514C]">
                      {b.statusMessage || 'Нет данных по сценарию'}
                    </span>
                    <div className="flex items-center gap-2">
                      {!b.hasScenario && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenCreateScenarioForBrand(
                              b.brandCode,
                              `${b.displayCode} — Базовый план 2027`
                            )
                          }
                          className="h-7 px-2.5 rounded-[7px] bg-[#141413] text-white text-[11px] font-semibold cursor-pointer"
                        >
                          + Создать сценарий
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenCreateModelForBrand(b.brandCode)}
                        className="h-7 px-2.5 rounded-[7px] border border-[#141413] bg-white text-[#141413] hover:bg-[#141413] hover:text-white text-[11px] font-semibold transition cursor-pointer"
                      >
                        + Добавить товар в {b.displayCode}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ПОМЕСЯЧНЫЙ ГРАФИК ГРУППЫ (12 МЕС.) ПО КНОПКЕ */}
        {monthlyCashflowOpen && (
          <div className="mt-3 overflow-x-auto rounded-[12px] border border-[#E4E3DC] bg-white p-3.5">
            <div className="text-[12px] font-bold text-[#141413] mb-2">
              Помесячный денежный поток всех кабинетов BORNERS GROUP (12 месяцев, млн ₽)
            </div>
            <table className="w-full min-w-[780px] text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-[#E4E3DC] text-[#5E5D58] bg-[#FAF9F6]">
                  <th className="py-1.5 px-2.5 font-bold">Показатель холдинга</th>
                  {gt.monthlyRows.map((m) => (
                    <th key={m.monthIdx} className="py-1.5 px-1.5 text-right font-bold">
                      {m.monthLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEBE4] font-mono">
                <tr>
                  <td className="py-1.5 px-2.5 font-sans font-semibold text-[#141413]">
                    Продажи (выкупы WB, млн ₽)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-1.5 px-1.5 text-right">
                      {(m.grossSalesRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1.5 px-2.5 font-sans font-semibold text-emerald-800">
                    + Поступления от WB (млн ₽)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-1.5 px-1.5 text-right text-emerald-800">
                      +{(m.wbNetInflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-1.5 px-2.5 font-sans font-semibold text-rose-800">
                    − Оплаты фабрикам (авансы + доплаты, млн ₽)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-1.5 px-1.5 text-right text-rose-800">
                      −{(m.factoryTotalOutflowRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
                <tr className="bg-[#FAF9F6] font-bold">
                  <td className="py-1.5 px-2.5 font-sans text-[#1E3A8A]">
                    Накопленный баланс денег (минус = свои вложения)
                  </td>
                  {gt.monthlyRows.map((m) => (
                    <td key={m.monthIdx} className="py-1.5 px-1.5 text-right text-[#1E3A8A]">
                      {(m.cumulativeCashBalanceRub / 1_000_000).toFixed(1).replace('.', ',')}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
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
        className="group relative rounded-[15px] bg-white border border-[#D8D7CF] hover:border-[#141413] p-4 text-left transition-all cursor-pointer flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-6px_rgba(20,20,19,0.09)]"
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
            <span className="absolute bottom-2 left-2 rounded-md bg-white/95 backdrop-blur-xs border border-[#DFDED7] px-2 py-0.5 font-mono text-[10px] font-bold text-[#141413]">
              {mod.unitsInPack} {unitCfg.secondaryUnit} · {met.avgRetailPriceRub.toLocaleString('ru-RU')} ₽
            </span>
            <span className="absolute bottom-2 right-2 rounded-md bg-[#141413]/85 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
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
      {/* ПАНЕЛЬ ПЕРЕКЛЮЧЕНИЯ РЕЖИМОВ КАТАЛОГА И ГРУППИРОВКИ */}
      <div className="rounded-[14px] bg-[#FAF9F6] border border-[#E2E1D9] p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center rounded-[10px] bg-white border border-[#D8D7CE] p-0.5 text-[12px] font-semibold shadow-2xs">
            <button
              type="button"
              onClick={() => setDisplayMode('groups')}
              className={`h-8 px-3 rounded-[8px] transition cursor-pointer inline-flex items-center gap-1.5 ${
                displayMode === 'groups'
                  ? 'bg-[#141413] text-white'
                  : 'text-[#52514C] hover:text-[#141413]'
              }`}
            >
              <Folder className="h-3.5 w-3.5" />
              <span>Группы товаров ({visibleGroupsWithMetrics.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('brands')}
              className={`h-8 px-3 rounded-[8px] transition cursor-pointer inline-flex items-center gap-1.5 ${
                displayMode === 'brands'
                  ? 'bg-[#141413] text-white'
                  : 'text-[#52514C] hover:text-[#141413]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Раздельные каталоги брендов ({brandSections.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('grid')}
              className={`h-8 px-3 rounded-[8px] transition cursor-pointer ${
                displayMode === 'grid'
                  ? 'bg-[#141413] text-white'
                  : 'text-[#52514C] hover:text-[#141413]'
              }`}
            >
              Все карточки ({filteredModels.length})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Выбор магазина / кабинета WB (как на скрине 2) */}
          <div className="inline-flex items-center gap-1.5 rounded-[9px] bg-white border border-[#D8D7CE] px-2.5 py-1 text-[12px]">
            <span className="text-[#686760] font-medium">Кабинет:</span>
            <select
              value={brandFilter}
              onChange={(e) => onSelectBrandFilter(e.target.value)}
              className="font-bold text-[#141413] bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="ALL">Все кабинеты · WB ({models.filter((m) => m.launchStatus !== 'В архиве').length} SKU)</option>
              <option value="BORNERS">BORNERS · WB</option>
              <option value="NA_TELE">НА ТЕЛЕ · WB</option>
              <option value="FUKAI">FUKAI · WB</option>
              <option value="AKUSHA">AKUSHA · WB</option>
              <option value="LISKANI">LISCANI · WB</option>
            </select>
          </div>

          {displayMode === 'groups' && (
            <>
              <button
                type="button"
                onClick={handleResetDefaultGroups}
                className="h-8 px-2.5 rounded-[9px] border border-[#D8D7CE] bg-white hover:bg-[#F4F3EE] text-[11.5px] font-semibold text-[#52514C] cursor-pointer"
                title="Сбросить к авто-группировке по брендам и линейкам"
              >
                ↺ Авто-группы
              </button>
              <button
                type="button"
                onClick={openCreateGroupModal}
                className="h-8 px-3.5 rounded-[9px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[12px] font-semibold transition cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Добавить группу</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* =====================================================================
          РЕЖИМ 1: ГРУППЫ ТОВАРОВ (КАК НА СКРИНЕ 2, НО В ПРЕМИАЛЬНОМ СТИЛЕ PEAKLY)
         ===================================================================== */}
      {displayMode === 'groups' && (
        <div className="space-y-2.5">
          {visibleGroupsWithMetrics.map((gm) => {
            const { group } = gm;
            const isExpanded = Boolean(expandedGroupIds[group.id]);
            const accent = getModelBrandAccentStyles(
              group.brandCode === 'ALL' ? 'BORNERS' : group.brandCode
            );

            return (
              <div
                key={group.id}
                className="rounded-[15px] bg-white border border-[#D8D7CE] hover:border-[#B8B7AE] transition-all overflow-hidden shadow-[0_2px_10px_-4px_rgba(20,20,19,0.05)]"
              >
                {/* Строка-папка группы товаров */}
                <div
                  onClick={() =>
                    setExpandedGroupIds((prev) => ({
                      ...prev,
                      [group.id]: !prev[group.id],
                    }))
                  }
                  className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-[#FAF9F6]/80 transition"
                >
                  {/* Иконка папки + Название группы + Бейдж количества артикулов + Бренд */}
                  <div className="flex items-center gap-3 min-w-[260px] flex-1">
                    <div
                      className={`h-10 w-10 rounded-[11px] border flex items-center justify-center shrink-0 ${accent.folderBg} ${accent.folderIconText}`}
                    >
                      {isExpanded ? (
                        <FolderOpen className="h-5 w-5" />
                      ) : (
                        <Folder className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-extrabold text-[#141413]">
                          {group.title}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-[7px] bg-[#F2F1EC] border border-[#E2E1D9] font-mono text-[11px] font-bold text-[#52514C]">
                          {gm.modelsCount} артикулов
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-[6px] font-mono text-[10px] font-bold border ${accent.badgeBg} ${accent.badgeText} ${accent.badgeBorder}`}
                        >
                          {group.cabinetLabel}
                        </span>
                      </div>
                      {group.subtitle && (
                        <p className="text-[11.5px] text-[#686760] mt-0.5 truncate">
                          {group.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Сводные показатели группы (Продажи, Закупки, Партии и даты, Маржа) */}
                  <div className="flex flex-wrap items-center gap-5 text-right">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#686762]">
                        Продажи (Год / Дек)
                      </div>
                      <div className="font-mono text-[13.5px] font-extrabold text-[#141413]">
                        {formatMln(gm.annualRevenueRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#686760]">
                        дек: {formatMln(gm.decRevenueRub)} · {gm.annualPacks.toLocaleString('ru-RU')} {gm.primaryUnit}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#686762]">
                        Закупки и партии
                      </div>
                      <div className="font-mono text-[13.5px] font-bold text-[#141413]">
                        {gm.procurementPacks.toLocaleString('ru-RU')} {gm.primaryUnit} · {formatMln(gm.procurementBudgetRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#157347] font-semibold">
                        {gm.totalBatchesCount} парт. · заказ до {formatShortDateRu(gm.earliestOrderDateIso)}
                      </div>
                    </div>

                    <div className="hidden sm:block">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#146C43]">
                        Старт Q1 (Аванс)
                      </div>
                      <div className="font-mono text-[13.5px] font-bold text-[#0F5132]">
                        {formatMln(gm.firstWaveStartRub)}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#146C43]">
                        аванс: {formatMln(gm.firstWavePrepayRub)} · маржа {gm.avgMarginPct}%
                      </div>
                    </div>

                    {/* Кнопки управления группой («Настройки группы» + Корзина + Стрелка раскрытия) */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 pl-2 border-l border-[#EAE9E2]"
                    >
                      <button
                        type="button"
                        onClick={() => openEditGroupModal(group)}
                        className="h-8.5 px-3 rounded-[9px] border border-[#D8D7CE] bg-white hover:bg-[#FAF9F6] hover:border-[#141413] text-[12px] font-semibold text-[#141413] transition cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5 text-[#52514C]" />
                        <span>Настройки группы</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(group)}
                        title="Удалить группу"
                        className="h-8.5 w-8.5 rounded-[9px] border border-transparent hover:border-rose-200 hover:bg-rose-50 text-[#8A8983] hover:text-rose-700 flex items-center justify-center transition cursor-pointer"
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
                        className="h-8.5 w-8.5 rounded-[9px] bg-[#FAF9F6] hover:bg-[#EFEFE9] flex items-center justify-center text-[#141413] cursor-pointer"
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
                  <div className="p-4 bg-[#FAF9F6] border-t border-[#EAE9E2]">
                    {gm.models.length === 0 ? (
                      <div className="rounded-[12px] border border-dashed border-[#CECDC4] bg-white p-5 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[12.5px] text-[#52514C]">
                          В группе «{group.title}» пока не выбрано артикулов.
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditGroupModal(group)}
                            className="h-8 px-3 rounded-[8px] bg-[#141413] text-white text-[11.5px] font-semibold cursor-pointer"
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
                            className="h-8 px-3 rounded-[8px] border border-[#D8D7CE] bg-white text-[11.5px] font-semibold text-[#141413] cursor-pointer"
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
          {brandSections.map((sec) => {
            const accent = getModelBrandAccentStyles(sec.brandCode);
            return (
              <div
                key={sec.brandCode}
                className="rounded-[18px] bg-white border border-[#D4D3CA] overflow-hidden shadow-[0_4px_18px_-6px_rgba(20,20,19,0.05)]"
              >
                {/* Шапка каталога конкретного бренда */}
                <div className="px-5 py-4 bg-[#FAF9F6] border-b border-[#EAE9E2] flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-2 rounded-full ${accent.accentBar}`} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[18px] font-extrabold text-[#141413]">
                          Каталог бренда {sec.displayCode}
                        </h3>
                        <span
                          className={`px-2.5 py-0.5 rounded-[6px] font-mono text-[11px] font-bold border ${accent.badgeBg} ${accent.badgeText} ${accent.badgeBorder}`}
                        >
                          {sec.models.length} SKU · {sec.cabinetLabel}
                        </span>
                        <span className="text-[11.5px] font-medium text-[#686760]">
                          {sec.categoryLabel} ({sec.primaryUnit} / {sec.secondaryUnit})
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#52514C] mt-0.5 flex flex-wrap items-center gap-3">
                        <span>
                          Продажи год: <strong className="font-mono text-[#141413]">{formatMln(sec.annualRevenueRub)}</strong> (дек: {formatMln(sec.decRevenueRub)})
                        </span>
                        <span>·</span>
                        <span>
                          Закупки: <strong className="font-mono text-[#141413]">{sec.procurementPacks.toLocaleString('ru-RU')} {sec.primaryUnit}</strong> ({formatMln(sec.procurementBudgetRub)})
                        </span>
                        <span>·</span>
                        <span>
                          Старт Q1: <strong className="font-mono text-[#146C43]">{formatMln(sec.firstWaveStartRub)}</strong> (аванс {formatMln(sec.firstWavePrepayRub)})
                        </span>
                        <span>·</span>
                        <span>
                          Партий: <strong className="font-mono text-[#141413]">{sec.totalBatchesCount}</strong> (ближ. заказ до {formatShortDateRu(sec.earliestOrderDateIso)})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {onSelectScenarioForBrand && (
                      <div className="inline-flex items-center gap-1.5 rounded-[9px] bg-white border border-[#D8D7CE] px-2.5 py-1 text-[11.5px]">
                        <span className="text-[#686760] font-medium">Сценарий:</span>
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
                          className="font-bold text-[#141413] bg-transparent focus:outline-none cursor-pointer max-w-[190px]"
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
                            className="h-6 px-1.5 rounded bg-[#FAF9F6] hover:bg-[#EFEFE9] border border-[#D8D7CE] text-[10.5px] font-bold text-[#141413] cursor-pointer"
                          >
                            + Свой
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenCreateModel(sec.brandCode)}
                      className="h-8.5 px-3.5 rounded-[9px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[12px] font-semibold transition cursor-pointer shrink-0"
                    >
                      + Добавить товар в {sec.displayCode}
                    </button>
                  </div>
                </div>

                {/* Сетка карточек этого бренда */}
                <div className="p-4 md:p-5">
                  {sec.models.length === 0 ? (
                    <div className="rounded-[12px] border border-dashed border-[#CECDC4] bg-[#FAF9F6] p-6 text-center space-y-2">
                      <div className="text-[14px] font-bold text-[#141413]">
                        Каталог бренда {sec.displayCode} пока пуст
                      </div>
                      <p className="text-[12px] text-[#686760] max-w-md mx-auto">
                        Добавьте первую позицию ({sec.categoryLabel}) — она автоматически получит единицу измерения «{sec.primaryUnit}» и нулевой стартовый план без выдуманных цифр.
                      </p>
                      <button
                        type="button"
                        onClick={() => onOpenCreateModel(sec.brandCode)}
                        className="mt-1 h-8.5 px-4 rounded-[9px] bg-[#141413] text-white text-[12px] font-semibold cursor-pointer"
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
                  <option value="LISKANI">LISCANI · WB</option>
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
                className="h-9 px-4 rounded-[9px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
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
              className="h-8.5 px-3 rounded-[9px] bg-[#141413] text-white text-[12px] font-semibold cursor-pointer inline-flex items-center gap-1.5"
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
