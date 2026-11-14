'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Download,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import { FinancialPlanRow, FinancialScenario, Product } from '@/types/platform';
import {
  ROLE_LABELS_RU,
  SCENARIO_LABELS_RU,
  calculatePlanFactVariance,
  calculateRevenueFromBuyouts,
  calculateUnitEconomics,
  canUserEditBrand,
  canUserViewBrandConcept,
  canUserViewCostPrice,
  canUserViewFinance,
  formatCompactRub,
  formatCurrencyRub,
  parseCsvContent,
  validateAndCheckDuplicates,
  ParsedImportRow,
} from '@/lib/finance';
import { getBrandProductionProfile } from '@/lib/brandProductionConfig';
import { formatLabBrandLabel, normalizeLabBrandCode } from '@/lib/rndCatalogSync';
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';
import {
  createBrandProductModel,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
} from '@/lib/unifiedBusinessEngine';

const RU_MONTH_LABELS_2027 = [
  { month: '2027-01', label: 'Январь 2027' },
  { month: '2027-02', label: 'Февраль 2027' },
  { month: '2027-03', label: 'Март 2027' },
  { month: '2027-04', label: 'Апрель 2027' },
  { month: '2027-05', label: 'Май 2027' },
  { month: '2027-06', label: 'Июнь 2027' },
  { month: '2027-07', label: 'Июль 2027' },
  { month: '2027-08', label: 'Август 2027' },
  { month: '2027-09', label: 'Сентябрь 2027' },
  { month: '2027-10', label: 'Октябрь 2027' },
  { month: '2027-11', label: 'Ноябрь 2027' },
  { month: '2027-12', label: 'Декабрь 2027' },
];

function getBrandUnitSuffix(brandId: string): string {
  const norm = brandId === 'ALL' ? 'ALL' : normalizeLabBrandCode(brandId);
  if (norm === 'AKUSHA') return 'пар';
  if (norm === 'LISKANI') return 'компл. штор';
  if (norm === 'BORNERS') return 'компл.';
  return 'шт.';
}

export function FinanceView() {
  const {
    products,
    launches,
    campaigns,
    competitors,
    financialPlans,
    currentUser,
    brandFilter,
    platformMode,
    financialScenario,
    setFinancialScenario,
    updateFinancialPlanRow,
    addFinancialPlanRow,
    createProduct,
    updateProduct,
    createCompetitor,
    notify,
  } = usePlatform();

  const {
    models: liveScenarioModels,
    scenarios: liveScenarios,
    updateModelsBatch,
  } = useLiveScenarioPortfolio();

  const isStrategyMode = platformMode === 'strategy';
  const isReadOnlyRole =
    currentUser.role === 'Viewer' || currentUser.role === 'Partner';

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
  const [factDrafts, setFactDrafts] = useState<Record<string, string>>({});

  const hasFinance = canUserViewFinance(currentUser);
  const hasCostAccess = canUserViewCostPrice(currentUser);

  const buildPlansForScenario = useCallback(
    (sc: FinancialScenario): FinancialPlanRow[] => {
      const scenarioFactor =
        sc === 'Conservative' ? 0.82 : sc === 'Optimistic' ? 1.22 : 1;

      const matchesBrand = (rawBrandId: string) => {
        const norm = normalizeLabBrandCode(rawBrandId);
        if (!canUserViewBrandConcept(currentUser, norm)) return false;
        if (brandFilter === 'ALL') return true;
        return norm === normalizeLabBrandCode(brandFilter);
      };

      const directRows = financialPlans.filter(
        (r) => r.scenario === sc && matchesBrand(r.brandId)
      );
      const baseRows = financialPlans.filter(
        (r) => r.scenario === 'Base' && matchesBrand(r.brandId)
      );

      if (sc === 'Base' && directRows.length > 0) {
        return directRows;
      }

      let fallbackRows: FinancialPlanRow[] = [];

      if (baseRows.length > 0) {
        fallbackRows = baseRows.map((r) => {
          const scaledUnits = Math.max(0, Math.round(r.plannedBuyoutUnits * scenarioFactor));
          const scaledRev = Math.round(r.plannedRevenueRub * scenarioFactor);
          const scaledProfit = Math.round(r.plannedOperatingProfitRub * scenarioFactor);
          return {
            ...r,
            id: `synth-${normalizeLabBrandCode(r.brandId)}-${sc}-${r.periodMonth}`,
            scenario: sc,
            plannedBuyoutUnits: scaledUnits,
            plannedRevenueRub: scaledRev,
            plannedOperatingProfitRub: scaledProfit,
          };
        });
      } else {
        const targetBrands =
          brandFilter === 'ALL'
            ? (['BORNERS', 'NA_TELE', 'AKUSHA', 'LISKANI', 'FUKAI'] as const).filter(
                (b) => canUserViewBrandConcept(currentUser, b)
              )
            : [normalizeLabBrandCode(brandFilter)].filter((b) =>
                canUserViewBrandConcept(currentUser, b)
              );

        for (const b of targetBrands) {
          const brandModels = liveScenarioModels.filter(
            (sm) =>
              sm.launchStatus !== 'В архиве' &&
              normalizeLabBrandCode(detectModelBrandPortfolioLabel(sm)) === b
          );

          if (brandModels.length > 0) {
            const monthRows: FinancialPlanRow[] = RU_MONTH_LABELS_2027.map(
              ({ month, label }, mIdx) => {
                let monthUnits = 0;
                let monthRev = 0;
                let monthProfit = 0;
                for (const sm of brandModels) {
                  const plan =
                    sm.plansByScenario[1] ||
                    sm.plansByScenario[100] ||
                    sm.plansByScenario[200] ||
                    Object.values(sm.plansByScenario)[0];
                  const packs = plan?.monthlyPacks?.[mIdx] ?? 0;
                  const price =
                    plan?.monthlyPricesRub?.[mIdx] || sm.retailPriceRub || 0;
                  const rev =
                    plan?.monthlyRevenuesRubOverride?.[mIdx] ?? packs * price;
                  const netUnitMarginRatio =
                    sm.retailPriceRub > 0
                      ? Math.max(
                          0.16,
                          Math.min(
                            0.45,
                            (sm.retailPriceRub *
                              (1 - (sm.marketplaceFeePct + sm.adsPct) / 100) -
                              sm.unitCostRub -
                              sm.logisticsRub) /
                              sm.retailPriceRub
                          )
                        )
                      : 0.26;
                  monthUnits += packs;
                  monthRev += rev;
                  monthProfit += rev * netUnitMarginRatio;
                }
                const finalUnits = Math.max(0, Math.round(monthUnits * scenarioFactor));
                const finalRev = Math.max(0, Math.round(monthRev * scenarioFactor));
                const finalAvgPrice =
                  finalUnits > 0
                    ? Math.round(finalRev / finalUnits)
                    : brandModels[0]?.retailPriceRub || 2490;
                const finalProfit = Math.round(monthProfit * scenarioFactor);

                return {
                  id: `synth-${b}-${sc}-${month}`,
                  brandId: b,
                  scenario: sc,
                  periodMonth: month,
                  periodLabel: label,
                  currency: 'RUB' as const,
                  plannedBuyoutUnits: finalUnits,
                  actualBuyoutUnits: null,
                  avgSellingPriceRub: finalAvgPrice,
                  plannedRevenueRub: finalRev,
                  actualRevenueRub: null,
                  plannedOperatingProfitRub: finalProfit,
                  actualOperatingProfitRub: null,
                  fixedCostsRub: 650000,
                  marketingBudgetRub: Math.round(finalRev * 0.1),
                  launchInvestmentRub: mIdx === 0 ? 450000 : 0,
                  sourceLabel: 'План портфеля 2027',
                  isDemo: false,
                  updatedAt: '2027-01-15',
                  updatedBy: 'Система',
                };
              }
            ).filter((r) => r.plannedRevenueRub > 0 || r.plannedBuyoutUnits > 0);

            if (monthRows.length > 0) {
              fallbackRows.push(...monthRows);
              continue;
            }
          }

          // Резервный план для бренда без активных сценарных SKU (например FUKAI)
          const brandProds = products.filter(
            (p) => !p.isArchived && normalizeLabBrandCode(p.brandId) === b
          );
          const avgPriceFallback =
            brandProds.length > 0
              ? Math.round(
                  brandProds.reduce(
                    (s, p) => s + (p.economics.actualRetailPrice || p.economics.plannedRetailPrice || 2490),
                    0
                  ) / brandProds.length
                )
              : 2490;
          const baselineUnits6M = [680, 760, 890, 980, 1080, 1200];
          RU_MONTH_LABELS_2027.slice(0, 6).forEach(({ month, label }, idx) => {
            const units = Math.round(baselineUnits6M[idx] * scenarioFactor);
            const rev = units * avgPriceFallback;
            fallbackRows.push({
              id: `synth-${b}-${sc}-${month}`,
              brandId: b,
              scenario: sc,
              periodMonth: month,
              periodLabel: label,
              currency: 'RUB',
              plannedBuyoutUnits: units,
              actualBuyoutUnits: null,
              avgSellingPriceRub: avgPriceFallback,
              plannedRevenueRub: rev,
              actualRevenueRub: null,
              plannedOperatingProfitRub: Math.round(rev * 0.28),
              actualOperatingProfitRub: null,
              fixedCostsRub: 450000,
              marketingBudgetRub: Math.round(rev * 0.1),
              launchInvestmentRub: idx === 0 ? 350000 : 0,
              sourceLabel: 'Базовый план бренда',
              isDemo: false,
              updatedAt: '2027-01-15',
              updatedBy: 'Система',
            });
          });
        }
      }

      if (directRows.length === 0) return fallbackRows;
      const directMap = new Map(
        directRows.map((r) => [
          `${normalizeLabBrandCode(r.brandId)}:${r.periodMonth}`,
          r,
        ])
      );
      const merged = fallbackRows.map((fb) => {
        const key = `${normalizeLabBrandCode(fb.brandId)}:${fb.periodMonth}`;
        return directMap.get(key) || fb;
      });
      const fallbackKeys = new Set(
        fallbackRows.map(
          (fb) => `${normalizeLabBrandCode(fb.brandId)}:${fb.periodMonth}`
        )
      );
      for (const dr of directRows) {
        const key = `${normalizeLabBrandCode(dr.brandId)}:${dr.periodMonth}`;
        if (!fallbackKeys.has(key)) {
          merged.push(dr);
        }
      }
      return merged;
    },
    [financialPlans, brandFilter, currentUser, liveScenarioModels, products]
  );

  const filteredPlans = useMemo(
    () => buildPlansForScenario(financialScenario),
    [buildPlansForScenario, financialScenario]
  );

  const uniqueMonthsCount = useMemo(
    () => new Set(filteredPlans.map((r) => r.periodMonth)).size,
    [filteredPlans]
  );

  const commitFactRevenueDraft = (row: FinancialPlanRow, rawInput: string) => {
    setFactDrafts((prev) => {
      if (!(row.id in prev)) return prev;
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
    const trimmed = rawInput.trim().replace(/\s+/g, '').replace(',', '.');
    const nextVal = trimmed === '' ? null : Number(trimmed);
    if (nextVal !== null && !Number.isFinite(nextVal)) return;
    if (nextVal === row.actualRevenueRub) return;

    const existsInState = financialPlans.some((fp) => fp.id === row.id);
    if (existsInState) {
      updateFinancialPlanRow(row.id, {
        actualRevenueRub: nextVal,
      });
    } else {
      const estProfit =
        nextVal === null
          ? null
          : row.plannedRevenueRub > 0
          ? Math.round(nextVal * (row.plannedOperatingProfitRub / row.plannedRevenueRub))
          : 0;
      addFinancialPlanRow({
        brandId: normalizeLabBrandCode(row.brandId),
        scenario: row.scenario,
        periodMonth: row.periodMonth,
        periodLabel: row.periodLabel,
        currency: row.currency,
        plannedBuyoutUnits: row.plannedBuyoutUnits,
        actualBuyoutUnits: row.actualBuyoutUnits,
        avgSellingPriceRub: row.avgSellingPriceRub,
        plannedRevenueRub: row.plannedRevenueRub,
        actualRevenueRub: nextVal,
        plannedOperatingProfitRub: row.plannedOperatingProfitRub,
        actualOperatingProfitRub: estProfit,
        fixedCostsRub: row.fixedCostsRub,
        marketingBudgetRub: row.marketingBudgetRub,
        launchInvestmentRub: row.launchInvestmentRub,
        sourceLabel: row.sourceLabel,
        isDemo: false,
      });
    }
  };

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          !p.isArchived &&
          canUserViewBrandConcept(currentUser, normalizeLabBrandCode(p.brandId)) &&
          (brandFilter === 'ALL' ||
            normalizeLabBrandCode(p.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [products, brandFilter, currentUser]
  );

  const unitEconomicsProducts = useMemo<Product[]>(() => {
    const seenSkus = new Set<string>();
    const merged: Product[] = [];

    for (const p of filteredProducts) {
      const skuNorm = (p.sku || '').trim().toUpperCase();
      if (skuNorm) seenSkus.add(skuNorm);
      merged.push(p);
    }

    for (const sm of liveScenarioModels) {
      if (sm.launchStatus === 'В архиве') continue;
      const brandLabel = detectModelBrandPortfolioLabel(sm);
      const brandCode = normalizeLabBrandCode(brandLabel);
      if (!canUserViewBrandConcept(currentUser, brandCode)) continue;
      if (
        brandFilter !== 'ALL' &&
        brandCode !== normalizeLabBrandCode(brandFilter)
      ) {
        continue;
      }
      const skuNorm = (sm.code || '').trim().toUpperCase();
      if (skuNorm && seenSkus.has(skuNorm)) continue;
      if (skuNorm) seenSkus.add(skuNorm);

      const profile = getBrandProductionProfile(brandCode, sm.title);
      const retail = Math.max(100, Math.round(sm.retailPriceRub || 2490));
      const cost = Math.max(0, Math.round(sm.unitCostRub || 0));

      merged.push({
        id: sm.id,
        sku: sm.code,
        name: sm.title,
        brandId: brandCode,
        category: sm.categoryLabel || profile.defaultConstructionRu,
        productType: 'Базовая коллекция',
        collection: `${brandLabel} · ${sm.subtitle || '2027'}`,
        priceSegment: brandCode === 'NA_TELE' ? 'Premium' : 'Mass-Market+',
        status: 'active',
        description: sm.description || sm.subtitle || '',
        ownerId: 'user-owner',
        imageUrl: sm.gallery?.[0]?.url || '',
        galleryUrls: (sm.gallery || [])
          .map((g) => g.url)
          .filter((u): u is string => Boolean(u)),
        colorCombinations: (sm.palettes || []).map((pal) => pal.title),
        materials: sm.fabric?.composition || profile.defaultMaterialRu,
        fabricComposition: sm.fabric?.composition || profile.defaultMaterialRu,
        fabricDensityGsm: parseInt(sm.fabric?.density || '180', 10) || 180,
        waistbandType: sm.waistband?.type || profile.defaultWaistbandOrTrimRu,
        fitType: sm.construction?.fit || profile.defaultConstructionRu,
        constructionDetails: sm.construction?.seams || '',
        sizes: [...profile.sizes],
        supplierName:
          sm.sharedSupplyAndFact?.factoryParams?.factoryName ||
          profile.defaultFactoryNameZh,
        supplierCountry: 'КНР / РФ',
        moq: 500,
        productionLeadDays: 35,
        deliveryLeadDays: 18,
        techFiles: [],
        economics: {
          currency: 'RUB',
          plannedRetailPrice: retail,
          actualRetailPrice: retail,
          discountPct: 0,
          vatPct: 0,
          returnRatePct: Math.max(0, 100 - (sm.buyoutRatePct ?? 85)),
          unitCostPrice: cost,
          marketplaceCommissionRub: Math.round(
            retail * ((sm.marketplaceFeePct || 24) / 100)
          ),
          logisticsRub: sm.logisticsRub || 95,
          advertisingRub: Math.round(retail * ((sm.adsPct || 10) / 100)),
          otherVariableRub:
            sm.sharedSupplyAndFact?.otherVariableRubPerPack || 35,
        },
        unitsSold: 0,
        revenueRub: 0,
        operatingProfitRub: 0,
        monthlyDynamicsPct: 0,
        salesChannels: ['Wildberries', 'Ozon'],
        variants: [],
        isDemo: false,
        isArchived: false,
        createdAt: '2026-01-01',
        updatedAt: '2027-01-01',
      });
    }

    return merged;
  }, [filteredProducts, liveScenarioModels, brandFilter, currentUser]);

  const existingSkusForImport = useMemo(() => {
    const out: { sku: string }[] = [];
    const seen = new Set<string>();
    for (const p of products) {
      if (p.isArchived) continue;
      const k = (p.sku || '').trim().toUpperCase();
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push({ sku: p.sku });
      }
    }
    for (const m of liveScenarioModels) {
      if (m.launchStatus === 'В архиве') continue;
      const k = (m.code || '').trim().toUpperCase();
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push({ sku: m.code });
      }
    }
    return out;
  }, [products, liveScenarioModels]);

  const filteredCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          (c.brandId === 'ALL' ||
            canUserViewBrandConcept(currentUser, normalizeLabBrandCode(c.brandId))) &&
          (brandFilter === 'ALL' ||
            c.brandId === 'ALL' ||
            normalizeLabBrandCode(c.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [campaigns, brandFilter, currentUser]
  );

  const filteredLaunches = useMemo(
    () =>
      launches.filter(
        (l) =>
          !l.isArchived &&
          canUserViewBrandConcept(currentUser, normalizeLabBrandCode(l.brandId)) &&
          (brandFilter === 'ALL' ||
            normalizeLabBrandCode(l.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [launches, brandFilter, currentUser]
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
      <div className="bg-white rounded-xl border border-[#E4E1DA] p-12 text-center space-y-4">
        <Lock className="h-7 w-7 stroke-[1.5] text-[#141413] mx-auto" />
        <h2 className="text-[24px] font-semibold text-[#141413] tracking-[-0.02em]">
          Финансовый контур закрыт для роли «{ROLE_LABELS_RU[currentUser.role]}»
        </h2>
        <p className="text-[14px] text-[#5C5953] max-w-lg mx-auto leading-relaxed">
          В соответствии с регламентом безопасности BORNERS GROUP (п. 5, 15 ТЗ), доступ к P&L, себестоимости (COGS) и маржинальности открыт только Владельцу и Администратору.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Заголовок страницы */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#E4E1DA] pb-6">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#5C5953] mb-1.5">
            Управленческий учёт, юнит-экономика и сценарии
          </div>
          <h1 className="text-[32px] md:text-[36px] font-semibold tracking-[-0.03em] text-[#141413]">
            Финансы и P&L
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[#FAF9F6] p-1 rounded-xl border border-[#E4E1DA]">
            {(['Conservative', 'Base', 'Optimistic'] as FinancialScenario[]).map((sc) => (
              <button
                key={sc}
                onClick={() => setFinancialScenario(sc)}
                className={`px-4 py-2 rounded-lg text-[13px] font-medium transition cursor-pointer ${
                  financialScenario === sc
                    ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                    : 'text-[#5C5953] hover:text-[#141413]'
                }`}
              >
                {SCENARIO_LABELS_RU[sc]}
              </button>
            ))}
          </div>

          {!isStrategyMode && !isReadOnlyRole && (
            <button
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-2 h-10 rounded-xl bg-[#141413] text-white px-5 text-[14px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
            >
              <Upload className="h-4 w-4 stroke-[1.5]" />
              <span>Импорт CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 крупные финансовые карточки */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#E4E1DA] p-6">
          <div className="text-[13px] font-medium text-[#5C5953]">
            {uniqueMonthsCount >= 12 ? 'Годовой план выручки' : 'План выручки периода'}
          </div>
          <div className="text-[30px] font-mono font-semibold text-[#141413] mt-3 tracking-[-0.02em]">
            {formatCompactRub(summary.planYearRev)}
          </div>
          <div className="text-[12px] text-[#5C5953] mt-2">
            Сценарий: {SCENARIO_LABELS_RU[financialScenario]}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E4E1DA] p-6">
          <div className="text-[13px] font-medium text-[#5C5953]">Факт выручки (закрытые мес.)</div>
          <div className="text-[30px] font-mono font-semibold text-[#141413] mt-3 tracking-[-0.02em]">
            {summary.factClosedRev !== null
              ? formatCompactRub(summary.factClosedRev)
              : 'Нет данных'}
          </div>
          <div className="text-[12px] text-[#5C5953] mt-2">
            План закрытых мес.: <span className="font-mono">{formatCompactRub(summary.planClosedRev)}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E4E1DA] p-6">
          <div className="text-[13px] font-medium text-[#5C5953]">Отклонение Факт / План</div>
          <div
            className={`text-[30px] font-mono font-semibold mt-3 tracking-[-0.02em] ${
              (summary.revVariance.diffPct ?? 0) >= 0
                ? 'text-[#16805D]'
                : 'text-[#C94B4B]'
            }`}
          >
            {summary.revVariance.diffPct !== null
              ? `${summary.revVariance.diffPct >= 0 ? '+' : ''}${summary.revVariance.diffPct}%`
              : 'Нет данных'}
          </div>
          <div className="text-[12px] font-mono text-[#5C5953] mt-2">
            {summary.revVariance.diffAbs !== null
              ? formatCurrencyRub(summary.revVariance.diffAbs)
              : '—'}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E4E1DA] p-6">
          <div className="text-[13px] font-medium text-[#5C5953]">План операционной прибыли</div>
          <div className="text-[30px] font-mono font-semibold text-[#141413] mt-3 tracking-[-0.02em]">
            {formatCompactRub(summary.planYearProfit)}
          </div>
          <div className="text-[12px] text-[#5C5953] mt-2">
            Факт:{' '}
            <span className="font-mono">
              {summary.factClosedProfit !== null
                ? formatCompactRub(summary.factClosedProfit)
                : 'Нет данных'}
            </span>
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
          { id: 'import', label: 'Импорт CSV' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id as typeof subTab)}
            className={`px-4 py-2 rounded-xl text-[13px] font-medium border transition cursor-pointer ${
              subTab === t.id
                ? 'bg-[#141413] text-white border-[#141413]'
                : 'bg-white text-[#141413] border-[#E4E1DA] hover:border-[#141413]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. Помесячный План / Факт */}
      {subTab === 'overview' && (
        <div className="bg-white rounded-xl border border-[#E4E1DA] overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-[#E4E1DA] text-[12px] font-medium uppercase tracking-wider text-[#5C5953] bg-[#FAF9F6]">
              <tr>
                <th className="py-3.5 px-6">Период</th>
                <th className="py-3.5 px-4">Бренд</th>
                <th className="py-3.5 px-4 text-right">План выручки</th>
                <th className="py-3.5 px-4 text-right">Факт выручки</th>
                <th className="py-3.5 px-4 text-right">Отклонение</th>
                <th className="py-3.5 px-4 text-right">План выкупов</th>
                <th className="py-3.5 px-6 text-right">План прибыли</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA]">
              {filteredPlans.map((row) => {
                const v = calculatePlanFactVariance(
                  row.plannedRevenueRub,
                  row.actualRevenueRub
                );
                const canEditRow =
                  !isStrategyMode &&
                  canUserEditBrand(currentUser, normalizeLabBrandCode(row.brandId));
                const draftVal =
                  factDrafts[row.id] !== undefined
                    ? factDrafts[row.id]
                    : row.actualRevenueRub !== null
                    ? String(row.actualRevenueRub)
                    : '';
                return (
                  <tr key={row.id} className="hover:bg-[#FAF9F6] transition">
                    <td className="py-3.5 px-6 font-medium text-[#141413]">
                      {row.periodLabel}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#141413]">
                      {formatLabBrandLabel(row.brandId)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[#141413]">
                      {formatCurrencyRub(row.plannedRevenueRub)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {!canEditRow ? (
                        <span className="font-mono font-medium text-[#141413]">
                          {row.actualRevenueRub !== null
                            ? formatCurrencyRub(row.actualRevenueRub)
                            : 'Нет данных'}
                        </span>
                      ) : (
                        <input
                          type="number"
                          placeholder="Нет данных"
                          value={draftVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFactDrafts((prev) => ({
                              ...prev,
                              [row.id]: val,
                            }));
                          }}
                          onBlur={(e) => commitFactRevenueDraft(row, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                              setFactDrafts((prev) => {
                                const next = { ...prev };
                                delete next[row.id];
                                return next;
                              });
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-40 text-right h-9 rounded-lg border border-[#E4E1DA] px-3 font-mono font-medium bg-[#FAF9F6] text-[#141413] focus:border-[#141413] focus:bg-white outline-none"
                        />
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold">
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
                        <span className="font-sans font-normal text-[#5C5953]">Нет данных</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[#5C5953]">
                      {row.plannedBuyoutUnits.toLocaleString('ru-RU')}{' '}
                      <span className="font-sans">{getBrandUnitSuffix(row.brandId)}</span>
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-medium text-[#141413]">
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
        <div className="bg-white rounded-xl border border-[#E4E1DA] overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-[#E4E1DA] text-[12px] font-medium uppercase tracking-wider text-[#5C5953] bg-[#FAF9F6]">
              <tr>
                <th className="py-3.5 px-6">Артикул и модель</th>
                <th className="py-3.5 px-4 text-right">РРЦ</th>
                <th className="py-3.5 px-4 text-right">Себестоимость</th>
                <th className="py-3.5 px-4 text-right">Чистая выручка</th>
                <th className="py-3.5 px-4 text-right">Переменные расх.</th>
                <th className="py-3.5 px-4 text-right">Прибыль на 1 шт.</th>
                <th className="py-3.5 px-6 text-right">Чистая маржа</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA]">
              {unitEconomicsProducts.map((p) => {
                const u = p.economics;
                const calc = calculateUnitEconomics(u);
                return (
                  <tr key={p.id} className="hover:bg-[#FAF9F6] transition">
                    <td className="py-3.5 px-6">
                      <div className="text-[12px] font-mono text-[#5C5953]">
                        {p.sku} · <span className="font-sans font-medium">{formatLabBrandLabel(p.brandId)}</span>
                      </div>
                      <div className="font-semibold text-[15px] text-[#141413]">{p.name}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-[#141413]">
                      {formatCurrencyRub(u.actualRetailPrice)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-[#141413]">
                      {hasCostAccess ? formatCurrencyRub(u.unitCostPrice) : 'Скрыто'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[#141413]">
                      {formatCurrencyRub(calc.netRevenuePerUnit)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[#5C5953]">
                      {hasCostAccess
                        ? formatCurrencyRub(calc.totalVariableCostsPerUnit)
                        : 'Скрыто'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#16805D]">
                      {hasCostAccess ? formatCurrencyRub(calc.unitProfitRub) : 'Скрыто'}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-semibold text-[15px] text-[#141413]">
                      {hasCostAccess ? `${calc.marginPct}%` : 'Скрыто'}
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
        <div className="bg-white rounded-xl border border-[#E4E1DA] p-6 space-y-5">
          <div className="border-b border-[#E4E1DA] pb-4">
            <h3 className="text-[20px] font-semibold text-[#141413] tracking-[-0.02em]">
              Формула выручки: Выкупы × Средняя цена реализации (₽)
            </h3>
          </div>
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-[#E4E1DA] text-[12px] font-medium uppercase tracking-wider text-[#5C5953]">
              <tr>
                <th className="py-3 px-4">Период</th>
                <th className="py-3 px-4">Бренд</th>
                <th className="py-3 px-4 text-right">План выкупов</th>
                <th className="py-3 px-4 text-right">Средний чек</th>
                <th className="py-3 px-4 text-right">Расчётная выручка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA]">
              {filteredPlans.map((r) => {
                const calcRev = calculateRevenueFromBuyouts(
                  r.plannedBuyoutUnits,
                  r.avgSellingPriceRub
                );
                return (
                  <tr key={r.id} className="hover:bg-[#FAF9F6] transition">
                    <td className="py-3.5 px-4 font-medium text-[#141413]">{r.periodLabel}</td>
                    <td className="py-3.5 px-4 font-medium text-[#141413]">
                      {formatLabBrandLabel(r.brandId)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[#141413]">
                      {r.plannedBuyoutUnits.toLocaleString('ru-RU')}{' '}
                      <span className="font-sans text-[#5C5953]">{getBrandUnitSuffix(r.brandId)}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-[#141413]">
                      {formatCurrencyRub(r.avgSellingPriceRub)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#141413]">
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
        <div className="bg-white rounded-xl border border-[#E4E1DA] overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-[#E4E1DA] text-[12px] font-medium uppercase tracking-wider text-[#5C5953] bg-[#FAF9F6]">
              <tr>
                <th className="py-3.5 px-6">Кампания</th>
                <th className="py-3.5 px-4">Бренд и канал</th>
                <th className="py-3.5 px-4 text-right">План бюджета</th>
                <th className="py-3.5 px-4 text-right">Факт расхода</th>
                <th className="py-3.5 px-4 text-right">План выручки</th>
                <th className="py-3.5 px-6 text-right">Факт выручки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA]">
              {filteredCampaigns.map((c) => (
                <tr key={c.id} className="hover:bg-[#FAF9F6] transition">
                  <td className="py-3.5 px-6 font-semibold text-[15px] text-[#141413]">{c.name}</td>
                  <td className="py-3.5 px-4 text-[#5C5953]">
                    {c.brandId === 'ALL' ? 'Вся группа' : formatLabBrandLabel(c.brandId)} · {c.channel}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-[#141413]">
                    {formatCurrencyRub(c.plannedBudgetRub)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-[#141413]">
                    {c.actualBudgetRub !== null
                      ? formatCurrencyRub(c.actualBudgetRub)
                      : 'Нет данных'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-medium text-[#141413]">
                    {formatCurrencyRub(c.plannedRevenueRub)}
                  </td>
                  <td className="py-3.5 px-6 text-right font-mono font-semibold text-[#16805D]">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {filteredLaunches.map((l) => (
            <div
              key={l.id}
              className="bg-white rounded-xl border border-[#E4E1DA] p-6 space-y-4"
            >
              <div className="text-[12px] font-medium uppercase tracking-wider text-[#5C5953]">
                {formatLabBrandLabel(l.brandId)} · <span className="font-mono">{l.startDate}</span>
              </div>
              <h3 className="text-[19px] font-semibold text-[#141413] tracking-[-0.01em]">{l.name}</h3>
              <div className="space-y-2 pt-3 border-t border-[#E4E1DA] text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[#5C5953]">Целевая выручка:</span>
                  <b className="font-mono font-semibold text-[#141413]">{formatCurrencyRub(l.salesPlanRub)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5C5953]">Маркетинговый бюджет:</span>
                  <b className="font-mono font-semibold text-[#141413]">{formatCurrencyRub(l.marketingBudgetRub)}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6. Сравнение 3 сценариев */}
      {subTab === 'scenarios' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {(['Conservative', 'Base', 'Optimistic'] as FinancialScenario[]).map((sc) => {
            const rows = buildPlansForScenario(sc);
            const scMonths = new Set(rows.map((r) => r.periodMonth)).size;
            const rev = rows.reduce((s, r) => s + r.plannedRevenueRub, 0);
            const prof = rows.reduce((s, r) => s + r.plannedOperatingProfitRub, 0);
            const units = rows.reduce((s, r) => s + r.plannedBuyoutUnits, 0);
            const active = financialScenario === sc;

            return (
              <div
                key={sc}
                onClick={() => setFinancialScenario(sc)}
                className={`p-6 rounded-xl border cursor-pointer transition space-y-5 ${
                  active
                    ? 'bg-white border-[#141413] ring-1 ring-[#141413]'
                    : 'bg-white border-[#E4E1DA] hover:border-[#141413]'
                }`}
              >
                <div className="flex items-center justify-between border-b border-[#E4E1DA] pb-3">
                  <h3 className="text-[20px] font-semibold text-[#141413] tracking-[-0.02em]">{SCENARIO_LABELS_RU[sc]}</h3>
                  {active && (
                    <span className="bg-[#141413] text-white px-2.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wider">
                      Активен
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-[12px] text-[#5C5953]">
                    {scMonths >= 12 ? 'Годовая выручка' : 'Выручка периода'}
                  </div>
                  <div className="text-[28px] font-mono font-semibold text-[#141413] mt-1 tracking-[-0.02em]">
                    {formatCompactRub(rev)}
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-[#E4E1DA] text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-[#5C5953]">Операционная прибыль:</span>
                    <b className="font-mono font-semibold text-[#16805D]">{formatCompactRub(prof)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5C5953]">Объём реализации:</span>
                    <b className="font-mono font-semibold text-[#141413]">
                      {units.toLocaleString('ru-RU')} <span className="font-sans font-medium">{getBrandUnitSuffix(brandFilter)}</span>
                    </b>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 7. Шаблоны CSV */}
      {subTab === 'import' && (
        <div className="bg-white rounded-xl border border-[#E4E1DA] p-7 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E4E1DA] pb-5">
            <div>
              <h3 className="text-[20px] font-semibold text-[#141413] tracking-[-0.02em]">
                Пакетная загрузка данных из CSV (3 контура ТЗ)
              </h3>
              <p className="text-[14px] text-[#5C5953] mt-1">
                Проверка обязательных полей, маппинг колонок и защита от дубликатов артикулов перед записью в базу.
              </p>
            </div>
            {!isStrategyMode && !isReadOnlyRole && (
              <button
                onClick={() => setImportModalOpen(true)}
                className="h-10 px-6 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
              >
                Импорт CSV →
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
                className="rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="font-semibold text-[#141413] text-[15px]">
                    {tpl.title}
                  </div>
                  <div className="text-[12px] text-[#5C5953] mt-1 font-mono">
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
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
                    notify('success', `Шаблон ${tpl.file} выгружен`);
                  }}
                  className="inline-flex items-center justify-center gap-2 h-9 rounded-lg bg-white border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:bg-[#141413] hover:text-white hover:border-[#141413] transition cursor-pointer"
                >
                  <Download className="h-4 w-4 stroke-[1.5]" />
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
          existingProducts={existingSkusForImport}
          existingCompetitorNames={competitors.map((c) => c.brandName.trim().toUpperCase())}
          existingFinanceKeys={financialPlans
            .filter((f) => f.scenario === financialScenario)
            .map((f) => `${normalizeLabBrandCode(f.brandId)}:${f.periodMonth}`)}
          onImportProducts={(rows) => {
            const parseCsvNum = (v?: string): number => {
              const raw = (v ?? '').trim().replace(/\s+/g, '').replace(',', '.');
              return raw === '' ? Number.NaN : Number(raw);
            };
            const preparedRows = rows
              .map((r, idx) => {
                const normBrand = normalizeLabBrandCode(r.brandId || 'BORNERS');
                if (!canUserEditBrand(currentUser, normBrand)) return null;
                const sku = (
                  r.sku || `SKU-${Date.now().toString().slice(-4)}-${idx + 1}`
                ).trim();
                const name = (r.name || 'Импортированная модель').trim();
                const collection = (r.collection || 'CORE 2027').trim();
                const profile = getBrandProductionProfile(normBrand, name);
                const materials = (r.materials || profile.defaultMaterialRu).trim();
                const parsedRetail = parseCsvNum(r.retailPriceRub);
                const retail = Number.isFinite(parsedRetail) ? parsedRetail : 2290;
                const parsedCost = parseCsvNum(r.costPriceRub);
                const cost = Number.isFinite(parsedCost) ? parsedCost : 450;
                return {
                  sku,
                  name,
                  normBrand,
                  collection,
                  materials,
                  retail,
                  cost,
                  profile,
                };
              })
              .filter((item): item is NonNullable<typeof item> => item !== null);

            if (preparedRows.length === 0) {
              notify('warning', 'Нет доступных для редактирования строк импорта');
              return;
            }

            const seenBatchLegacy = new Map<string, string>();
            for (const p of products) {
              if (!p.isArchived) {
                seenBatchLegacy.set(p.sku.trim().toUpperCase(), p.id);
              }
            }

            preparedRows.forEach((item) => {
              const skuUpper = item.sku.toUpperCase();
              const existingLegacyId = seenBatchLegacy.get(skuUpper);
              const economics = {
                currency: 'RUB' as const,
                plannedRetailPrice: item.retail,
                actualRetailPrice: item.retail,
                discountPct: 10,
                vatPct: 20,
                returnRatePct: 8,
                unitCostPrice: item.cost,
                marketplaceCommissionRub: Math.round(item.retail * 0.18),
                logisticsRub: 95,
                advertisingRub: Math.round(item.retail * 0.1),
                otherVariableRub: 40,
              };

              if (existingLegacyId) {
                updateProduct(existingLegacyId, {
                  sku: item.sku,
                  name: item.name,
                  brandId: item.normBrand,
                  collection: item.collection,
                  materials: item.materials,
                  fabricComposition: item.materials,
                  sizes: [...item.profile.sizes],
                  economics,
                });
              } else {
                const created = createProduct({
                  sku: item.sku,
                  name: item.name,
                  brandId: item.normBrand,
                  category: item.profile.defaultConstructionRu,
                  fitType: item.profile.defaultConstructionRu,
                  sizes: [...item.profile.sizes],
                  supplierName: item.profile.defaultFactoryNameZh,
                  moq: 500,
                  collection: item.collection,
                  materials: item.materials,
                  status: 'in_development',
                  economics,
                });
                seenBatchLegacy.set(skuUpper, created.id);
              }
            });

            updateModelsBatch((prevModels) => {
              let nextModels = [...prevModels];
              for (const item of preparedRows) {
                const skuUpper = item.sku.toUpperCase();
                const existingIdx = nextModels.findIndex(
                  (m) => (m.code || '').trim().toUpperCase() === skuUpper
                );
                if (existingIdx >= 0) {
                  const prev = nextModels[existingIdx];
                  const prevRetail = prev.retailPriceRub;
                  const updatedPlans = { ...prev.plansByScenario };
                  for (const scKey of Object.keys(updatedPlans)) {
                    const scId = Number(scKey);
                    const pl = updatedPlans[scId];
                    if (pl) {
                      updatedPlans[scId] = {
                        ...pl,
                        monthlyPricesRub: (
                          pl.monthlyPricesRub || Array<number>(12).fill(item.retail)
                        ).map((pr) => (!pr || pr === prevRetail ? item.retail : pr)),
                      };
                    }
                  }
                  nextModels[existingIdx] = ensureModelUnifiedV11({
                    ...prev,
                    title: item.name,
                    subtitle: item.collection || prev.subtitle,
                    retailPriceRub: item.retail,
                    unitCostRub: item.cost,
                    launchStatus:
                      prev.launchStatus === 'В архиве'
                        ? 'В разработке'
                        : prev.launchStatus,
                    fabric: {
                      ...prev.fabric,
                      composition: item.materials || prev.fabric.composition,
                    },
                    plansByScenario: updatedPlans,
                  });
                } else {
                  const created = createBrandProductModel(nextModels, liveScenarios, {
                    brandCode: item.normBrand,
                    title: item.name,
                    code: item.sku,
                    categoryLabel: item.collection,
                    retailPriceRub: item.retail,
                    unitCostRub: item.cost,
                    unitsInPack: item.profile.defaultPackUnits,
                    composition: item.materials,
                    factoryName: item.profile.defaultFactoryNameZh,
                  });
                  nextModels = created.models;
                }
              }
              return nextModels;
            });

            notify('success', `Импортировано позиций SKU: ${preparedRows.length}`);
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
            const parseCsvNum = (v?: string): number => {
              const raw = (v ?? '').trim().replace(/\s+/g, '').replace(',', '.');
              return raw === '' ? Number.NaN : Number(raw);
            };
            rows.forEach((r) => {
              const parsedUnits = parseCsvNum(r.plannedBuyoutUnits);
              const units = Number.isFinite(parsedUnits) ? parsedUnits : 4500;
              const parsedAvgPrice = parseCsvNum(r.avgSellingPriceRub);
              const avgPrice = Number.isFinite(parsedAvgPrice) ? parsedAvgPrice : 2190;
              const parsedRev = parseCsvNum(r.plannedRevenueRub);
              const rev = Number.isFinite(parsedRev) ? parsedRev : units * avgPrice;
              const parsedProf = parseCsvNum(r.plannedOperatingProfitRub);
              const prof = Number.isFinite(parsedProf) ? parsedProf : Math.round(rev * 0.32);
              const parsedActUnits = parseCsvNum(r.actualBuyoutUnits);
              const actUnits = Number.isFinite(parsedActUnits) ? parsedActUnits : null;
              const parsedActRev = parseCsvNum(r.actualRevenueRub);
              const actRev = Number.isFinite(parsedActRev) ? parsedActRev : null;

              const normBrand = normalizeLabBrandCode(r.brandId || 'BORNERS');
              const normPeriod = (r.periodMonth || '2027-04').trim();
              const existingRow = financialPlans.find(
                (fp) =>
                  fp.scenario === financialScenario &&
                  normalizeLabBrandCode(fp.brandId) === normBrand &&
                  fp.periodMonth === normPeriod
              );

              if (existingRow) {
                updateFinancialPlanRow(existingRow.id, {
                  periodLabel: r.periodLabel || existingRow.periodLabel,
                  plannedBuyoutUnits: units,
                  avgSellingPriceRub: avgPrice,
                  plannedRevenueRub: rev,
                  plannedOperatingProfitRub: prof,
                  ...(actUnits !== null ? { actualBuyoutUnits: actUnits } : {}),
                  ...(actRev !== null ? { actualRevenueRub: actRev } : {}),
                  sourceLabel: 'Импорт CSV',
                  isDemo: false,
                });
              } else {
                addFinancialPlanRow({
                  brandId: normBrand,
                  scenario: financialScenario,
                  periodMonth: normPeriod,
                  periodLabel: r.periodLabel || 'Апрель 2027',
                  currency: 'RUB',
                  plannedBuyoutUnits: units,
                  actualBuyoutUnits: actUnits,
                  avgSellingPriceRub: avgPrice,
                  plannedRevenueRub: rev,
                  actualRevenueRub: actRev,
                  plannedOperatingProfitRub: prof,
                  actualOperatingProfitRub:
                    actRev !== null
                      ? rev > 0
                        ? Math.round(actRev * (prof / rev))
                        : 0
                      : null,
                  fixedCostsRub: 850000,
                  marketingBudgetRub: 750000,
                  launchInvestmentRub: 400000,
                  sourceLabel: 'Импорт CSV',
                  isDemo: false,
                });
              }
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
// МАСТЕР ИМПОРТА CSV (3 ТИПА ПО П. 19 ТЗ + ЗАГРУЗКА ФАЙЛА С ДИСКА)
// =============================================================================
function CsvImportWizardModal({
  onClose,
  existingProducts,
  existingCompetitorNames = [],
  existingFinanceKeys = [],
  onImportProducts,
  onImportCompetitors,
  onImportFinance,
}: {
  onClose: () => void;
  existingProducts: { sku: string }[];
  existingCompetitorNames?: string[];
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
        ? [
            'plannedBuyoutUnits',
            'avgSellingPriceRub',
            'plannedRevenueRub',
            'plannedOperatingProfitRub',
            'actualBuyoutUnits',
            'actualRevenueRub',
          ]
        : [];
    const existingKeys = new Set(
      targetType === 'products'
        ? existingProducts.map((p) => p.sku.trim().toUpperCase())
        : targetType === 'competitors'
        ? existingCompetitorNames.map((n) => n.trim().toUpperCase())
        : existingFinanceKeys.map((k) => k.trim().toUpperCase())
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
  }, [parsed, targetType, existingProducts, existingCompetitorNames, existingFinanceKeys]);

  const committableRows = useMemo(
    () =>
      validatedRows
        .filter(
          (r) =>
            r.errors.length === 0 &&
            (duplicateResolution === 'import_all' || !r.isDuplicate)
        )
        .map((r) => r.raw),
    [validatedRows, duplicateResolution]
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-white rounded-xl border border-[#E4E1DA] p-8 space-y-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-[#E4E1DA] pb-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#5C5953]">
              Мастер импорта · Шаг <span className="font-mono">{step}</span> из <span className="font-mono">3</span>
            </div>
            <h3 className="text-[20px] font-semibold text-[#141413] mt-1 tracking-[-0.02em]">
              Импорт CSV
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-[#E4E1DA] p-2 text-[#141413] hover:border-[#141413] transition cursor-pointer"
          >
            <X className="h-5 w-5 stroke-[1.5]" />
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-5 text-[14px]">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setTargetType('products');
                  setRawCsv(
                    `sku;name;brandId;retailPriceRub;costPriceRub;materials\nBRN-IMP-01;Футболка BORNERS Heavy Pima 240;BORNERS;3490;680;100% Пима-хлопок\nNTL-IMP-02;Боди НА ТЕЛЕ Invisible Skin;NA_TELE;3890;720;Микрофибра Free-cut`
                  );
                }}
                className={`px-4 py-2 rounded-xl text-[13px] font-medium border transition cursor-pointer ${
                  targetType === 'products'
                    ? 'bg-[#141413] text-white border-[#141413]'
                    : 'bg-white text-[#141413] border-[#E4E1DA] hover:border-[#141413]'
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
                className={`px-4 py-2 rounded-xl text-[13px] font-medium border transition cursor-pointer ${
                  targetType === 'competitors'
                    ? 'bg-[#141413] text-white border-[#141413]'
                    : 'bg-white text-[#141413] border-[#E4E1DA] hover:border-[#141413]'
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
                className={`px-4 py-2 rounded-xl text-[13px] font-medium border transition cursor-pointer ${
                  targetType === 'finance'
                    ? 'bg-[#141413] text-white border-[#141413]'
                    : 'bg-white text-[#141413] border-[#E4E1DA] hover:border-[#141413]'
                }`}
              >
                3. Финансовый план продаж
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] p-4">
              <div className="text-[13px] text-[#5C5953]">
                Вы можете загрузить готовый файл <b className="text-[#141413] font-mono">.CSV / .TXT</b> с компьютера или вставить строки из Excel ниже:
              </div>
              <label className="inline-flex items-center gap-2 h-9 rounded-lg bg-white border border-[#E4E1DA] px-4 text-[13px] font-medium text-[#141413] hover:bg-[#141413] hover:text-white hover:border-[#141413] transition cursor-pointer">
                <Upload className="h-4 w-4 stroke-[1.5]" />
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
              <label className="block text-[13px] font-medium text-[#5C5953] mb-2">
                Содержимое CSV (разделитель «;» или «,»)
              </label>
              <textarea
                rows={6}
                value={rawCsv}
                onChange={(e) => setRawCsv(e.target.value)}
                className="w-full rounded-xl border border-[#E4E1DA] p-4 font-mono text-[13px] text-[#141413] bg-[#FAF9F6] focus:bg-white focus:border-[#141413] outline-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="h-10 px-6 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
              >
                Проверить данные →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 text-[14px]">
            <div className="rounded-xl border border-[#E4E1DA] overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-[#E4E1DA] font-medium text-[#5C5953] bg-[#FAF9F6]">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Ключ / Название</th>
                    <th className="py-3 px-4">Статус проверки</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E1DA]">
                  {validatedRows.map((r) => (
                    <tr key={r.rowIndex}>
                      <td className="py-3 px-4 font-mono text-[#5C5953]">{r.rowIndex}</td>
                      <td className="py-3 px-4 font-medium text-[#141413]">
                        <span className="font-mono">{r.raw.sku || r.raw.brandName || r.raw.periodMonth}</span> —{' '}
                        {r.raw.name || r.raw.positioning || r.raw.periodLabel}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {r.errors.length > 0 ? (
                          <span className="text-[#C94B4B]">
                            Ошибка: {r.errors.join(', ')}
                          </span>
                        ) : r.isDuplicate ? (
                          <span className="text-[#B45309]">Дубликат в базе</span>
                        ) : (
                          <span className="text-[#16805D]">Готово к записи</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setStep(1)}
                className="h-10 px-5 rounded-xl border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer"
              >
                ← Назад
              </button>
              <button
                onClick={() => setStep(3)}
                className="h-10 px-6 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
              >
                К подтверждению →
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 text-[14px]">
            <div className="p-5 rounded-xl border border-[#E4E1DA] bg-[#FAF9F6] space-y-2.5">
              <div className="font-semibold text-[15px] text-[#141413]">Правило обработки дубликатов:</div>
              <label className="flex items-center gap-2.5 text-[13px] text-[#141413] cursor-pointer">
                <input
                  type="radio"
                  checked={duplicateResolution === 'skip'}
                  onChange={() => setDuplicateResolution('skip')}
                  className="accent-[#141413]"
                />
                <span>Пропускать существующие записи (без перезаписи)</span>
              </label>
              <label className="flex items-center gap-2.5 text-[13px] text-[#141413] cursor-pointer">
                <input
                  type="radio"
                  checked={duplicateResolution === 'import_all'}
                  onChange={() => setDuplicateResolution('import_all')}
                  className="accent-[#141413]"
                />
                <span>Импортировать все валидные строки</span>
              </label>
            </div>

            <div className="flex justify-between pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setStep(2)}
                className="h-10 px-5 rounded-xl border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer"
              >
                ← Назад
              </button>
              <button
                disabled={committableRows.length === 0}
                onClick={() => {
                  if (committableRows.length === 0) return;
                  if (targetType === 'products') {
                    onImportProducts(committableRows);
                  } else if (targetType === 'competitors') {
                    onImportCompetitors(committableRows);
                  } else {
                    onImportFinance(committableRows);
                  }
                }}
                className="h-10 px-6 rounded-xl bg-[#141413] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
              >
                Завершить импорт (<span className="font-mono">{committableRows.length}</span>)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
