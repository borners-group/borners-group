'use client';

import React, { useState, useMemo } from 'react';
import {
  Download,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import { FinancialScenario } from '@/types/platform';
import {
  ROLE_LABELS_RU,
  SCENARIO_LABELS_RU,
  calculatePlanFactVariance,
  calculateRevenueFromBuyouts,
  calculateUnitEconomics,
  canUserViewCostPrice,
  canUserViewFinance,
  formatCompactRub,
  formatCurrencyRub,
  parseCsvContent,
  validateAndCheckDuplicates,
  ParsedImportRow,
} from '@/lib/finance';
import { formatLabBrandLabel, normalizeLabBrandCode } from '@/lib/rndCatalogSync';

export function FinanceView() {
  const {
    products,
    launches,
    campaigns,
    financialPlans,
    currentUser,
    brandFilter,
    platformMode,
    financialScenario,
    setFinancialScenario,
    updateFinancialPlanRow,
    addFinancialPlanRow,
    createProduct,
    createCompetitor,
    notify,
  } = usePlatform();

  const isStrategyMode = platformMode === 'strategy';

  const [subTab, setSubTab] = useState<
    | 'overview'
    | 'sales_plan'
    | 'unit_economics'
    | 'campaigns'
    | 'launches'
    | 'scenarios'
    | 'import'
  >('overview');

  const [importModalOpen, setImportModalOpen] = useState(false);

  const hasFinance = canUserViewFinance(currentUser);
  const hasCostAccess = canUserViewCostPrice(currentUser);

  const filteredPlans = useMemo(
    () =>
      financialPlans.filter(
        (r) =>
          r.scenario === financialScenario &&
          (brandFilter === 'ALL' ||
            normalizeLabBrandCode(r.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [financialPlans, financialScenario, brandFilter]
  );

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

  const filteredCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          brandFilter === 'ALL' ||
          c.brandId === 'ALL' ||
          normalizeLabBrandCode(c.brandId) === normalizeLabBrandCode(brandFilter)
      ),
    [campaigns, brandFilter]
  );

  const filteredLaunches = useMemo(
    () =>
      launches.filter(
        (l) =>
          !l.isArchived &&
          (brandFilter === 'ALL' ||
            normalizeLabBrandCode(l.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [launches, brandFilter]
  );

  const summary = useMemo(() => {
    const planYearRev = filteredPlans.reduce((s, r) => s + r.plannedRevenueRub, 0);
    const planYearProfit = filteredPlans.reduce(
      (s, r) => s + r.plannedOperatingProfitRub,
      0
    );

    const closedRows = filteredPlans.filter((r) => r.actualRevenueRub !== null);
    const planClosedRev = closedRows.reduce((s, r) => s + r.plannedRevenueRub, 0);
    const factClosedRev = closedRows.reduce((s, r) => s + (r.actualRevenueRub ?? 0), 0);
    const factClosedProfit = closedRows.reduce(
      (s, r) => s + (r.actualOperatingProfitRub ?? 0),
      0
    );

    const revVariance = calculatePlanFactVariance(
      planClosedRev,
      closedRows.length > 0 ? factClosedRev : null
    );

    return {
      planYearRev,
      planYearProfit,
      planClosedRev,
      factClosedRev: closedRows.length > 0 ? factClosedRev : null,
      factClosedProfit: closedRows.length > 0 ? factClosedProfit : null,
      revVariance,
    };
  }, [filteredPlans]);

  if (!hasFinance) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8E8E5] p-12 text-center space-y-4">
        <Lock className="h-8 w-8 text-[#171717] mx-auto" />
        <h2 className="text-[28px] font-bold text-[#171717]">
          Финансовый контур закрыт для роли «{ROLE_LABELS_RU[currentUser.role]}»
        </h2>
        <p className="text-[15px] text-[#737373] max-w-lg mx-auto">
          В соответствии с регламентом безопасности BORNERS GROUP (п. 5, 15 ТЗ), доступ к P&L, себестоимости (COGS) и маржинальности открыт только Владельцу и Администратору.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20">
      {/* Заголовок страницы (32–40px по ТЗ) */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#E8E8E5] pb-6">
        <div>
          <div className="text-[13px] font-medium uppercase tracking-widest text-[#737373] mb-1.5">
            Управленческий учёт, юнит-экономика и сценарии
          </div>
          <h1 className="text-[34px] md:text-[40px] font-bold tracking-[-0.03em] text-[#171717] dark:text-white">
            Финансы и P&L
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[#F7F7F5] p-1 rounded-xl border border-[#E8E8E5]">
            {(['Conservative', 'Base', 'Optimistic'] as FinancialScenario[]).map((sc) => (
              <button
                key={sc}
                onClick={() => setFinancialScenario(sc)}
                className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition cursor-pointer ${
                  financialScenario === sc
                    ? 'bg-white text-[#171717] shadow-2xs'
                    : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                {SCENARIO_LABELS_RU[sc]}
              </button>
            ))}
          </div>

          {!isStrategyMode && (
            <button
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-2 h-11 rounded-xl bg-[#111111] text-white px-5 text-[15px] font-semibold hover:bg-neutral-800 transition cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              <span>Импорт таблиц CSV/XLSX</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 крупные финансовые карточки */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-2xl border border-[#E8E8E5] p-6">
          <div className="text-[14px] font-medium text-[#737373]">Годовой план выручки</div>
          <div className="text-[34px] font-bold text-[#171717] mt-3">
            {formatCompactRub(summary.planYearRev)}
          </div>
          <div className="text-[13px] text-[#737373] mt-2">
            Сценарий: {SCENARIO_LABELS_RU[financialScenario]}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E8E8E5] p-6">
          <div className="text-[14px] font-medium text-[#737373]">Факт выручки (закрытые мес.)</div>
          <div className="text-[34px] font-bold text-[#171717] mt-3">
            {summary.factClosedRev !== null
              ? formatCompactRub(summary.factClosedRev)
              : 'Нет данных'}
          </div>
          <div className="text-[13px] text-[#737373] mt-2">
            План закрытых мес.: {formatCompactRub(summary.planClosedRev)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E8E8E5] p-6">
          <div className="text-[14px] font-medium text-[#737373]">Отклонение Факт / План</div>
          <div
            className={`text-[34px] font-bold mt-3 ${
              (summary.revVariance.diffPct ?? 0) >= 0
                ? 'text-[#16805D]'
                : 'text-[#C94B4B]'
            }`}
          >
            {summary.revVariance.diffPct !== null
              ? `${summary.revVariance.diffPct >= 0 ? '+' : ''}${summary.revVariance.diffPct}%`
              : 'Нет данных'}
          </div>
          <div className="text-[13px] text-[#737373] mt-2">
            {summary.revVariance.diffAbs !== null
              ? formatCurrencyRub(summary.revVariance.diffAbs)
              : '—'}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E8E8E5] p-6">
          <div className="text-[14px] font-medium text-[#737373]">План операционной прибыли</div>
          <div className="text-[34px] font-bold text-[#171717] mt-3">
            {formatCompactRub(summary.planYearProfit)}
          </div>
          <div className="text-[13px] text-[#737373] mt-2">
            Факт:{' '}
            {summary.factClosedProfit !== null
              ? formatCompactRub(summary.factClosedProfit)
              : 'Нет данных'}
          </div>
        </div>
      </div>

      {/* Навигация по 7 финансовым подразделам (п. 10 ТЗ) */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'overview', label: 'Помесячный План / Факт' },
          { id: 'unit_economics', label: 'Юнит-экономика SKU' },
          { id: 'sales_plan', label: 'Формула выкупов' },
          { id: 'campaigns', label: 'Окупаемость кампаний' },
          { id: 'launches', label: 'Экономика релизов' },
          { id: 'scenarios', label: 'Сравнение 3 сценариев' },
          { id: 'import', label: 'Импорт CSV / Excel' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id as typeof subTab)}
            className={`px-4 py-2 rounded-xl text-[14px] font-semibold border transition cursor-pointer ${
              subTab === t.id
                ? 'bg-[#111111] text-white border-[#111111]'
                : 'bg-white text-[#171717] border-[#E8E8E5] hover:border-[#171717]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. Помесячный План / Факт */}
      {subTab === 'overview' && (
        <div className="bg-white rounded-2xl border border-[#E8E8E5] overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-[#E8E8E5] text-[13px] font-semibold uppercase tracking-wider text-[#737373] bg-[#F7F7F5]/60">
              <tr>
                <th className="py-4 px-6">Период</th>
                <th className="py-4 px-4">Бренд</th>
                <th className="py-4 px-4 text-right">План выручки</th>
                <th className="py-4 px-4 text-right">Факт выручки</th>
                <th className="py-4 px-4 text-right">Отклонение</th>
                <th className="py-4 px-4 text-right">План выкупов</th>
                <th className="py-4 px-6 text-right">План прибыли</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {filteredPlans.map((row) => {
                const v = calculatePlanFactVariance(
                  row.plannedRevenueRub,
                  row.actualRevenueRub
                );
                return (
                  <tr key={row.id} className="hover:bg-[#F7F7F5]/60 transition">
                    <td className="py-4 px-6 font-semibold text-[#171717]">
                      {row.periodLabel}
                    </td>
                    <td className="py-4 px-4 font-semibold">
                      {formatLabBrandLabel(row.brandId)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {formatCurrencyRub(row.plannedRevenueRub)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {isStrategyMode ? (
                        <span className="font-semibold text-[#171717]">
                          {row.actualRevenueRub !== null
                            ? formatCurrencyRub(row.actualRevenueRub)
                            : 'Нет данных'}
                        </span>
                      ) : (
                        <input
                          type="number"
                          placeholder="Нет данных"
                          value={row.actualRevenueRub ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            updateFinancialPlanRow(row.id, {
                              actualRevenueRub: raw === '' ? null : Number(raw),
                            });
                          }}
                          className="w-40 text-right h-10 rounded-xl border border-[#E8E8E5] px-3 font-semibold bg-[#F7F7F5]"
                        />
                      )}
                    </td>
                    <td className="py-4 px-4 text-right font-semibold">
                      {v.hasFact ? (
                        <span
                          className={
                            (v.diffPct ?? 0) >= 0 ? 'text-[#16805D]' : 'text-[#C94B4B]'
                          }
                        >
                          {(v.diffPct ?? 0) >= 0 ? '+' : ''}
                          {v.diffPct}%
                        </span>
                      ) : (
                        <span className="text-[#737373]">Нет данных</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right text-[#737373]">
                      {row.plannedBuyoutUnits.toLocaleString('ru-RU')} шт.
                    </td>
                    <td className="py-4 px-6 text-right font-semibold">
                      {formatCurrencyRub(row.plannedOperatingProfitRub)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 2. Юнит-экономика по моделям */}
      {subTab === 'unit_economics' && (
        <div className="bg-white rounded-2xl border border-[#E8E8E5] overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-[#E8E8E5] text-[13px] font-semibold uppercase tracking-wider text-[#737373] bg-[#F7F7F5]/60">
              <tr>
                <th className="py-4 px-6">Артикул и модель</th>
                <th className="py-4 px-4 text-right">РРЦ</th>
                <th className="py-4 px-4 text-right">Себестоимость</th>
                <th className="py-4 px-4 text-right">Чистая выручка</th>
                <th className="py-4 px-4 text-right">Переменные расх.</th>
                <th className="py-4 px-4 text-right">Прибыль на 1 шт.</th>
                <th className="py-4 px-6 text-right">Чистая маржа</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {filteredProducts.map((p) => {
                const u = p.economics;
                const calc = calculateUnitEconomics(u);
                return (
                  <tr key={p.id} className="hover:bg-[#F7F7F5]/60 transition">
                    <td className="py-4 px-6">
                      <div className="text-[13px] font-semibold text-[#737373]">
                        {p.sku} · {formatLabBrandLabel(p.brandId)}
                      </div>
                      <div className="font-semibold text-[16px] text-[#171717]">{p.name}</div>
                    </td>
                    <td className="py-4 px-4 text-right font-semibold">
                      {formatCurrencyRub(u.actualRetailPrice)}
                    </td>
                    <td className="py-4 px-4 text-right font-semibold">
                      {hasCostAccess ? formatCurrencyRub(u.unitCostPrice) : 'Скрыто'}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {formatCurrencyRub(calc.netRevenuePerUnit)}
                    </td>
                    <td className="py-4 px-4 text-right text-[#737373]">
                      {hasCostAccess
                        ? formatCurrencyRub(calc.totalVariableCostsPerUnit)
                        : 'Скрыто'}
                    </td>
                    <td className="py-4 px-4 text-right font-bold text-[#16805D]">
                      {formatCurrencyRub(calc.unitProfitRub)}
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-[16px]">
                      {calc.marginPct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Формула выкупов */}
      {subTab === 'sales_plan' && (
        <div className="bg-white rounded-2xl border border-[#E8E8E5] p-7 space-y-5">
          <div className="border-b border-[#E8E8E5] pb-4">
            <h3 className="text-[22px] font-bold">
              Формула выручки: Выкупы (шт.) × Средняя цена реализации (₽)
            </h3>
          </div>
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-[#E8E8E5] text-[13px] font-semibold uppercase tracking-wider text-[#737373]">
              <tr>
                <th className="py-3 px-4">Период</th>
                <th className="py-3 px-4">Бренд</th>
                <th className="py-3 px-4 text-right">План выкупов</th>
                <th className="py-3 px-4 text-right">Средний чек</th>
                <th className="py-3 px-4 text-right">Расчётная выручка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {filteredPlans.map((r) => {
                const calcRev = calculateRevenueFromBuyouts(
                  r.plannedBuyoutUnits,
                  r.avgSellingPriceRub
                );
                return (
                  <tr key={r.id}>
                    <td className="py-4 px-4 font-semibold">{r.periodLabel}</td>
                    <td className="py-4 px-4 font-semibold">
                      {formatLabBrandLabel(r.brandId)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {r.plannedBuyoutUnits.toLocaleString('ru-RU')} шт.
                    </td>
                    <td className="py-4 px-4 text-right">
                      {formatCurrencyRub(r.avgSellingPriceRub)}
                    </td>
                    <td className="py-4 px-4 text-right font-bold">
                      {formatCurrencyRub(calcRev)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Кампании */}
      {subTab === 'campaigns' && (
        <div className="bg-white rounded-2xl border border-[#E8E8E5] overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-[#E8E8E5] text-[13px] font-semibold uppercase tracking-wider text-[#737373] bg-[#F7F7F5]/60">
              <tr>
                <th className="py-4 px-6">Кампания</th>
                <th className="py-4 px-4">Бренд и канал</th>
                <th className="py-4 px-4 text-right">План бюджета</th>
                <th className="py-4 px-4 text-right">Факт расхода</th>
                <th className="py-4 px-4 text-right">План выручки</th>
                <th className="py-4 px-6 text-right">Факт выручки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {filteredCampaigns.map((c) => (
                <tr key={c.id}>
                  <td className="py-4 px-6 font-semibold text-[16px]">{c.name}</td>
                  <td className="py-4 px-4 text-[#737373]">
                    {c.brandId === 'ALL' ? 'Вся группа' : formatLabBrandLabel(c.brandId)} · {c.channel}
                  </td>
                  <td className="py-4 px-4 text-right">
                    {formatCurrencyRub(c.plannedBudgetRub)}
                  </td>
                  <td className="py-4 px-4 text-right">
                    {c.actualBudgetRub !== null
                      ? formatCurrencyRub(c.actualBudgetRub)
                      : 'Нет данных'}
                  </td>
                  <td className="py-4 px-4 text-right font-semibold">
                    {formatCurrencyRub(c.plannedRevenueRub)}
                  </td>
                  <td className="py-4 px-6 text-right font-bold text-[#16805D]">
                    {c.actualRevenueRub !== null
                      ? formatCurrencyRub(c.actualRevenueRub)
                      : 'Нет данных'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Экономика запусков */}
      {subTab === 'launches' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredLaunches.map((l) => (
            <div
              key={l.id}
              className="bg-white rounded-2xl border border-[#E8E8E5] p-7 space-y-4"
            >
              <div className="text-[13px] font-semibold uppercase text-[#737373]">
                {formatLabBrandLabel(l.brandId)} · {l.startDate}
              </div>
              <h3 className="text-[22px] font-bold">{l.name}</h3>
              <div className="space-y-2 pt-3 border-t border-[#E8E8E5] text-[14px]">
                <div className="flex justify-between">
                  <span className="text-[#737373]">Целевая выручка:</span>
                  <b>{formatCurrencyRub(l.salesPlanRub)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373]">Маркетинговый бюджет:</span>
                  <b>{formatCurrencyRub(l.marketingBudgetRub)}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6. Сравнение 3 сценариев */}
      {subTab === 'scenarios' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(['Conservative', 'Base', 'Optimistic'] as FinancialScenario[]).map((sc) => {
            const rows = financialPlans.filter(
              (r) =>
                r.scenario === sc &&
                (brandFilter === 'ALL' ||
                  normalizeLabBrandCode(r.brandId) === normalizeLabBrandCode(brandFilter))
            );
            const rev = rows.reduce((s, r) => s + r.plannedRevenueRub, 0);
            const prof = rows.reduce((s, r) => s + r.plannedOperatingProfitRub, 0);
            const units = rows.reduce((s, r) => s + r.plannedBuyoutUnits, 0);
            const active = financialScenario === sc;

            return (
              <div
                key={sc}
                onClick={() => setFinancialScenario(sc)}
                className={`p-7 rounded-2xl border cursor-pointer transition space-y-5 ${
                  active
                    ? 'bg-white border-2 border-[#111111] shadow-md'
                    : 'bg-white border-[#E8E8E5] hover:border-[#171717]'
                }`}
              >
                <div className="flex items-center justify-between border-b border-[#E8E8E5] pb-3">
                  <h3 className="text-[22px] font-bold">{SCENARIO_LABELS_RU[sc]}</h3>
                  {active && (
                    <span className="bg-[#111111] text-white px-3 py-1 rounded-lg text-[12px] font-semibold">
                      Активен
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-[13px] text-[#737373]">Годовая выручка</div>
                  <div className="text-[30px] font-bold mt-1">
                    {formatCompactRub(rev)}
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-[#E8E8E5] text-[14px]">
                  <div className="flex justify-between">
                    <span className="text-[#737373]">Операционная прибыль:</span>
                    <b className="text-[#16805D]">{formatCompactRub(prof)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#737373]">Объём реализации:</span>
                    <b>{units.toLocaleString('ru-RU')} шт.</b>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 7. Шаблоны CSV */}
      {subTab === 'import' && (
        <div className="bg-white rounded-2xl border border-[#E8E8E5] p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E8E8E5] pb-5">
            <div>
              <h3 className="text-[22px] font-bold">
                Пакетная загрузка данных из CSV / Excel (3 контура ТЗ)
              </h3>
              <p className="text-[15px] text-[#737373] mt-1">
                Проверка обязательных полей, маппинг колонок и защита от дубликатов артикулов перед записью в базу.
              </p>
            </div>
            {!isStrategyMode && (
              <button
                onClick={() => setImportModalOpen(true)}
                className="h-11 px-6 rounded-xl bg-[#111111] text-white text-[14px] font-semibold cursor-pointer"
              >
                Открыть мастер импорта →
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[14px]">
            {[
              {
                title: '1. Шаблон каталога SKU',
                file: 'BORNERS_Template_SKU.csv',
                csv: 'sku;name;brandId;retailPriceRub;costPriceRub;materials\nBRN-IMP-01;Футболка BORNERS Heavy Pima 240;BORNERS;3490;680;100% Пима-хлопок\nNTL-IMP-02;Боди НА ТЕЛЕ Invisible Skin;NA_TELE;3890;720;Микрофибра Free-cut',
              },
              {
                title: '2. Шаблон таблицы конкурентов',
                file: 'BORNERS_Template_Competitors.csv',
                csv: 'brandName;priceRangeRub;positioning\nSHU Underwear;1 990 – 2 990 ₽;Базовый городской трикотаж\nBelle YOU;2 500 – 4 900 ₽;Бесшовное женское бельё',
              },
              {
                title: '3. Шаблон Финплана (План/Факт)',
                file: 'BORNERS_Template_FinancePlan.csv',
                csv: 'periodMonth;periodLabel;brandId;plannedBuyoutUnits;avgSellingPriceRub;plannedRevenueRub;plannedOperatingProfitRub\n2027-04;Апрель 2027;BORNERS;5200;2190;11388000;3650000',
              },
            ].map((tpl) => (
              <div
                key={tpl.file}
                className="rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="font-bold text-[#171717] text-[16px]">
                    {tpl.title}
                  </div>
                  <div className="text-[12px] text-[#737373] mt-1 font-mono">
                    {tpl.file}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([tpl.csv], {
                      type: 'text/csv;charset=utf-8',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = tpl.file;
                    a.click();
                    URL.revokeObjectURL(url);
                    notify('success', `Шаблон ${tpl.file} выгружен`);
                  }}
                  className="inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-white border border-[#E8E8E5] text-[13px] font-semibold text-[#171717] hover:bg-[#111111] hover:text-white transition cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  <span>Скачать шаблон .CSV</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {importModalOpen && (
        <CsvImportWizardModal
          onClose={() => setImportModalOpen(false)}
          existingProducts={products}
          existingFinanceKeys={financialPlans
            .filter((f) => f.scenario === financialScenario)
            .map((f) => `${normalizeLabBrandCode(f.brandId)}:${f.periodMonth}`)}
          onImportProducts={(rows) => {
            const parseCsvNum = (v?: string) =>
              Number((v || '').replace(/\s+/g, '').replace(',', '.')) || 0;
            rows.forEach((r) => {
              const retail = parseCsvNum(r.retailPriceRub) || 2290;
              const cost = parseCsvNum(r.costPriceRub) || 450;
              createProduct({
                sku: r.sku || `SKU-${Date.now().toString().slice(-4)}`,
                name: r.name || 'Импортированная модель',
                brandId: normalizeLabBrandCode(r.brandId || 'BORNERS'),
                collection: r.collection || 'CORE 2027',
                materials: r.materials || 'Модал / Хлопок',
                status: 'in_development',
                economics: {
                  currency: 'RUB',
                  plannedRetailPrice: retail,
                  actualRetailPrice: retail,
                  discountPct: 10,
                  vatPct: 20,
                  returnRatePct: 8,
                  unitCostPrice: cost,
                  marketplaceCommissionRub: Math.round(retail * 0.18),
                  logisticsRub: 95,
                  advertisingRub: Math.round(retail * 0.1),
                  otherVariableRub: 40,
                },
              });
            });
            notify('success', `Импортировано позиций SKU: ${rows.length}`);
            setImportModalOpen(false);
          }}
          onImportCompetitors={(rows) => {
            rows.forEach((r) => {
              createCompetitor({
                brandName: r.brandName || 'Конкурент',
                websiteUrl: 'https://example.ru',
                marketplaces: ['Wildberries', 'Ozon'],
                positioning: r.positioning || 'Игрок рынка',
                priceRangeRub: r.priceRangeRub || '1 800 – 3 200 ₽',
                keyProducts: 'Базовое бельё',
                strengths: 'Широкая дистрибуция',
                weaknesses: 'Базовые ткани',
                photoUrl: '',
                sources: 'Импорт CSV',
                researchedAt: new Date().toISOString().slice(0, 10),
              });
            });
            notify('success', `Импортировано конкурентов: ${rows.length}`);
            setImportModalOpen(false);
          }}
          onImportFinance={(rows) => {
            const parseCsvNum = (v?: string) =>
              Number((v || '').replace(/\s+/g, '').replace(',', '.')) || 0;
            rows.forEach((r) => {
              const units = parseCsvNum(r.plannedBuyoutUnits) || 4500;
              const avgPrice = parseCsvNum(r.avgSellingPriceRub) || 2190;
              const rev = parseCsvNum(r.plannedRevenueRub) || units * avgPrice;
              const prof = parseCsvNum(r.plannedOperatingProfitRub) || Math.round(rev * 0.32);
              addFinancialPlanRow({
                brandId: normalizeLabBrandCode(r.brandId || 'BORNERS'),
                scenario: financialScenario,
                periodMonth: r.periodMonth || '2027-04',
                periodLabel: r.periodLabel || 'Апрель 2027',
                currency: 'RUB',
                plannedBuyoutUnits: units,
                actualBuyoutUnits: r.actualBuyoutUnits ? parseCsvNum(r.actualBuyoutUnits) : null,
                avgSellingPriceRub: avgPrice,
                plannedRevenueRub: rev,
                actualRevenueRub: r.actualRevenueRub ? parseCsvNum(r.actualRevenueRub) : null,
                plannedOperatingProfitRub: prof,
                actualOperatingProfitRub: null,
                fixedCostsRub: 850000,
                marketingBudgetRub: 750000,
                launchInvestmentRub: 400000,
                sourceLabel: 'Импорт CSV',
                isDemo: false,
              });
            });
            notify('success', `Импортировано строк финансового плана: ${rows.length}`);
            setImportModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// МАСТЕР ИМПОРТА CSV / XLSX (3 ТИПА ПО П. 19 ТЗ + ЗАГРУЗКА ФАЙЛА С ДИСКА)
// =============================================================================
function CsvImportWizardModal({
  onClose,
  existingProducts,
  existingFinanceKeys = [],
  onImportProducts,
  onImportCompetitors,
  onImportFinance,
}: {
  onClose: () => void;
  existingProducts: { sku: string }[];
  existingFinanceKeys?: string[];
  onImportProducts: (rows: Record<string, string>[]) => void;
  onImportCompetitors: (rows: Record<string, string>[]) => void;
  onImportFinance: (rows: Record<string, string>[]) => void;
}) {
  const [step, setStep] = useState<number>(1);
  const [targetType, setTargetType] = useState<'products' | 'competitors' | 'finance'>(
    'products'
  );
  const [rawCsv, setRawCsv] = useState<string>(
    `sku;name;brandId;retailPriceRub;costPriceRub;materials\nBRN-IMP-01;Футболка BORNERS Heavy Pima 240;BORNERS;3490;680;100% Пима-хлопок\nNTL-IMP-02;Боди НА ТЕЛЕ Invisible Skin;NA_TELE;3890;720;Микрофибра Free-cut`
  );
  const [duplicateResolution, setDuplicateResolution] = useState<'skip' | 'import_all'>(
    'skip'
  );

  const parsed = useMemo(() => parseCsvContent(rawCsv), [rawCsv]);

  const validatedRows: ParsedImportRow[] = useMemo(() => {
    const columnMapping: Record<string, string> = {};
    parsed.headers.forEach((h) => {
      columnMapping[h] = h;
    });
    const rowsToValidate =
      targetType === 'finance'
        ? parsed.rows.map((r) => ({
            ...r,
            _brandPeriodKey: `${normalizeLabBrandCode(r.brandId || 'BORNERS')}:${(r.periodMonth || '').trim()}`,
          }))
        : parsed.rows;
    if (targetType === 'finance') {
      columnMapping._brandPeriodKey = '_brandPeriodKey';
    }
    const requiredFields =
      targetType === 'products'
        ? ['sku', 'name', 'brandId', 'retailPriceRub']
        : targetType === 'competitors'
        ? ['brandName']
        : ['periodMonth', 'periodLabel', 'brandId', 'plannedBuyoutUnits'];
    const numericFields =
      targetType === 'products'
        ? ['retailPriceRub', 'costPriceRub']
        : targetType === 'finance'
        ? ['plannedBuyoutUnits', 'avgSellingPriceRub']
        : [];
    const existingKeys = new Set(
      targetType === 'products'
        ? existingProducts.map((p) => p.sku.toUpperCase())
        : targetType === 'finance'
        ? existingFinanceKeys.map((k) => k.toUpperCase())
        : []
    );
    const uniqueTargetField =
      targetType === 'products'
        ? 'sku'
        : targetType === 'competitors'
        ? 'brandName'
        : '_brandPeriodKey';

    return validateAndCheckDuplicates({
      rows: rowsToValidate,
      columnMapping,
      requiredFields,
      numericFields,
      existingKeys,
      uniqueTargetField,
    });
  }, [parsed, targetType, existingProducts, existingFinanceKeys]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-[#E8E8E5] p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#E8E8E5] pb-4">
          <div>
            <div className="text-[12px] font-semibold uppercase text-[#737373]">
              Мастер импорта · Шаг {step} из 3
            </div>
            <h3 className="text-[22px] font-bold mt-1">
              Импорт табличных данных (CSV / Excel)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-[#E8E8E5] p-2 text-[#171717] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-5 text-[14px]">
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => {
                  setTargetType('products');
                  setRawCsv(
                    `sku;name;brandId;retailPriceRub;costPriceRub;materials\nBRN-IMP-01;Футболка BORNERS Heavy Pima 240;BORNERS;3490;680;100% Пима-хлопок\nNTL-IMP-02;Боди НА ТЕЛЕ Invisible Skin;NA_TELE;3890;720;Микрофибра Free-cut`
                  );
                }}
                className={`px-4 py-2.5 rounded-xl font-semibold border cursor-pointer ${
                  targetType === 'products'
                    ? 'bg-[#111111] text-white border-[#111111]'
                    : 'bg-white text-[#171717] border-[#E8E8E5]'
                }`}
              >
                1. Модели каталога (SKU)
              </button>
              <button
                onClick={() => {
                  setTargetType('competitors');
                  setRawCsv(
                    `brandName;priceRangeRub;positioning\nSHU Underwear;1 990 – 2 990 ₽;Базовый городской трикотаж`
                  );
                }}
                className={`px-4 py-2.5 rounded-xl font-semibold border cursor-pointer ${
                  targetType === 'competitors'
                    ? 'bg-[#111111] text-white border-[#111111]'
                    : 'bg-white text-[#171717] border-[#E8E8E5]'
                }`}
              >
                2. Таблица конкурентов
              </button>
              <button
                onClick={() => {
                  setTargetType('finance');
                  setRawCsv(
                    `periodMonth;periodLabel;brandId;plannedBuyoutUnits;avgSellingPriceRub;plannedRevenueRub;plannedOperatingProfitRub\n2027-04;Апрель 2027;BORNERS;5200;2190;11388000;3650000`
                  );
                }}
                className={`px-4 py-2.5 rounded-xl font-semibold border cursor-pointer ${
                  targetType === 'finance'
                    ? 'bg-[#111111] text-white border-[#111111]'
                    : 'bg-white text-[#171717] border-[#E8E8E5]'
                }`}
              >
                3. Финансовый план продаж
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] p-4">
              <div className="text-[13px] text-[#737373]">
                Вы можете загрузить готовый файл <b className="text-[#171717]">.CSV / .TXT</b> с компьютера или вставить строки из Excel ниже:
              </div>
              <label className="inline-flex items-center gap-2 h-10 rounded-lg bg-white border border-[#E8E8E5] px-4 text-[13px] font-semibold text-[#171717] hover:bg-[#111111] hover:text-white transition cursor-pointer">
                <Upload className="h-4 w-4" />
                <span>Загрузить файл .CSV с диска</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setRawCsv(reader.result);
                      }
                    };
                    reader.readAsText(file, 'utf-8');
                  }}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block font-semibold mb-2">
                Содержимое CSV (разделитель «;» или «,»)
              </label>
              <textarea
                rows={6}
                value={rawCsv}
                onChange={(e) => setRawCsv(e.target.value)}
                className="w-full rounded-xl border border-[#E8E8E5] p-4 font-mono text-[14px]"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="h-11 px-6 rounded-xl bg-[#111111] text-white font-semibold cursor-pointer"
              >
                Проверить данные →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 text-[14px]">
            <div className="rounded-xl border border-[#E8E8E5] overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead className="border-b border-[#E8E8E5] font-semibold bg-[#F7F7F5]">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Ключ / Название</th>
                    <th className="py-3 px-4">Статус проверки</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E8E5]">
                  {validatedRows.map((r) => (
                    <tr key={r.rowIndex}>
                      <td className="py-3 px-4">{r.rowIndex}</td>
                      <td className="py-3 px-4 font-semibold">
                        {r.raw.sku || r.raw.brandName || r.raw.periodMonth} —{' '}
                        {r.raw.name || r.raw.positioning || r.raw.periodLabel}
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {r.errors.length > 0 ? (
                          <span className="text-[#C94B4B]">
                            Ошибка: {r.errors.join(', ')}
                          </span>
                        ) : r.isDuplicate ? (
                          <span className="text-[#D99527]">Дубликат в базе</span>
                        ) : (
                          <span className="text-[#16805D]">Готово к записи</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-4 border-t border-[#E8E8E5]">
              <button
                onClick={() => setStep(1)}
                className="h-11 px-5 rounded-xl border border-[#E8E8E5] font-semibold cursor-pointer"
              >
                ← Назад
              </button>
              <button
                onClick={() => setStep(3)}
                className="h-11 px-6 rounded-xl bg-[#111111] text-white font-semibold cursor-pointer"
              >
                К подтверждению →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 text-[14px]">
            <div className="p-5 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] space-y-2">
              <div className="font-semibold text-[16px]">Правило обработки дубликатов:</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={duplicateResolution === 'skip'}
                  onChange={() => setDuplicateResolution('skip')}
                />
                <span>Пропускать существующие записи (без перезаписи)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={duplicateResolution === 'import_all'}
                  onChange={() => setDuplicateResolution('import_all')}
                />
                <span>Импортировать все валидные строки</span>
              </label>
            </div>

            <div className="flex justify-between pt-4 border-t border-[#E8E8E5]">
              <button
                onClick={() => setStep(2)}
                className="h-11 px-5 rounded-xl border border-[#E8E8E5] font-semibold cursor-pointer"
              >
                ← Назад
              </button>
              <button
                onClick={() => {
                  const rowsToCommit = validatedRows
                    .filter(
                      (r) =>
                        r.errors.length === 0 &&
                        (duplicateResolution === 'import_all' || !r.isDuplicate)
                    )
                    .map((r) => r.raw);

                  if (targetType === 'products') {
                    onImportProducts(rowsToCommit);
                  } else if (targetType === 'competitors') {
                    onImportCompetitors(rowsToCommit);
                  } else {
                    onImportFinance(rowsToCommit);
                  }
                }}
                className="h-11 px-6 rounded-xl bg-[#111111] text-white font-semibold cursor-pointer"
              >
                Завершить импорт
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
