'use client';

import React, { useState, useMemo } from 'react';
import {
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  FileText,
  GripVertical,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import {
  DocumentCategory,
  Product,
  TaskItem,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '@/types/platform';
import {
  ROLE_LABELS_RU,
  TASK_PRIORITY_LABELS_RU,
  TASK_STATUS_LABELS_RU,
  canUserEditBrand,
  canUserViewBrandConcept,
  canUserViewCostPrice,
  canUserViewFinance,
} from '@/lib/finance';
import {
  exportDocumentAsExcel,
  exportDocumentAsPdf,
} from '@/lib/document-export';
import { isSupabaseConfigured } from '@/lib/supabase';
import { DRAFT_MODULES_META, useDraftModules } from '@/lib/draftModules';
import { getBrandProductionProfile } from '@/lib/brandProductionConfig';
import { formatLabBrandLabel, normalizeLabBrandCode } from '@/lib/rndCatalogSync';
import {
  GrowthScenarioDef,
  ScenarioModelSpec,
  computeModelScenarioMetrics,
} from '@/lib/scenarioData';
import {
  detectModelBrandPortfolioLabel,
  normalizePortfolioBrandCode,
} from '@/lib/unifiedBusinessEngine';
import {
  STORAGE_KEY_S1_GROUP_PORTFOLIO,
  STORAGE_KEY_SCENARIO_BY_BRAND,
  applyPortfolioBackupSnapshotToStorage,
  buildFullPlatformBackupBundle,
  getDeletedModelsRegistry,
  parseFullPlatformBackupBundle,
  resolveEffectiveScenarioForModel,
  touchPortfolioUpdatedAt,
  unmarkModelAsDeletedInStorage,
} from '@/lib/portfolioPersistence';
import {
  deleteModelGalleryFromIdb,
  safeGetStorageJson,
  safeSetStorageJson,
  saveModelGalleryToIdb,
  savePlatformRichStateToIdb,
  savePortfolioSnapshotToIdb,
} from '@/lib/safeStorage';
import { pushPortfolioCoreToSupabase } from '@/lib/supabaseCloudSync';
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';

function buildLiveCatalogProductsForExport(
  liveModels: ScenarioModelSpec[],
  liveScenarios: GrowthScenarioDef[],
  selectedScenarioByBrand: Record<string, number | null | undefined>,
  fallbackScenario: GrowthScenarioDef,
  legacyProducts: Product[]
): Product[] {
  const seenSkus = new Set<string>();
  const seenNames = new Set<string>();
  const converted: Product[] = liveModels.map((m) => {
    const skuNorm = (m.code || '').trim().toUpperCase();
    const nameNorm = (m.title || '').trim().toLowerCase();
    if (skuNorm) seenSkus.add(skuNorm);
    if (nameNorm) seenNames.add(nameNorm);

    const brandLabel = detectModelBrandPortfolioLabel(m);
    const brandCode = normalizePortfolioBrandCode(
      m.customBrandLabel || m.brandId || 'BORNERS'
    );
    const brandProfile = getBrandProductionProfile(brandCode, m.title);
    const effSc = resolveEffectiveScenarioForModel(
      m,
      liveScenarios,
      selectedScenarioByBrand,
      fallbackScenario
    );
    const metrics = computeModelScenarioMetrics(m, effSc);

    return {
      id: m.id,
      sku: m.code,
      name: m.title,
      brandId: brandCode,
      category: m.categoryLabel || m.construction?.type || 'Базовая модель',
      productType: 'Базовая коллекция',
      collection: `${brandLabel} · ${m.subtitle || '2027'}`,
      priceSegment: brandCode === 'NA_TELE' ? 'Premium' : 'Mass-Market+',
      status: 'active',
      description: m.description || m.subtitle || '',
      ownerId: 'user-owner',
      imageUrl: m.gallery?.[0]?.url || '',
      galleryUrls: (m.gallery || [])
        .map((g) => g.url)
        .filter((u): u is string => Boolean(u)),
      colorCombinations: (m.palettes || []).map((p) => p.title),
      materials: m.fabric?.composition || '',
      fabricComposition: m.fabric?.composition || '',
      fabricDensityGsm: parseInt(m.fabric?.density || '180', 10) || 180,
      waistbandType: m.waistband?.type || '',
      fitType: m.construction?.fit || brandProfile.defaultConstructionRu,
      constructionDetails: m.construction?.seams || '',
      sizes: [...brandProfile.sizes],
      supplierName:
        m.sharedSupplyAndFact?.factoryParams?.factoryName ||
        brandProfile.defaultFactoryNameZh,
      supplierCountry: 'КНР / РФ',
      moq: 500,
      productionLeadDays: 35,
      deliveryLeadDays: 18,
      techFiles: [],
      economics: {
        currency: 'RUB',
        plannedRetailPrice: m.retailPriceRub,
        actualRetailPrice: m.retailPriceRub,
        discountPct: 0,
        vatPct: 0,
        returnRatePct: Math.max(0, 100 - (m.buyoutRatePct ?? 85)),
        unitCostPrice: m.unitCostRub,
        marketplaceCommissionRub: Math.round(
          m.retailPriceRub * ((m.marketplaceFeePct || 30) / 100)
        ),
        logisticsRub: m.logisticsRub || 0,
        advertisingRub: Math.round(m.retailPriceRub * ((m.adsPct || 10) / 100)),
        otherVariableRub: 0,
      },
      unitsSold: Math.round(metrics.annualPacks),
      revenueRub: Math.round(metrics.annualRevenueRub),
      operatingProfitRub: Math.round(metrics.annualProfitRub),
      monthlyDynamicsPct: 0,
      salesChannels: ['Wildberries', 'Ozon'],
      variants: [],
      isDemo: false,
      isArchived: m.launchStatus === 'В архиве',
      createdAt: '2026-01-01',
      updatedAt: '2027-01-01',
    };
  });

  const extraLegacy = legacyProducts.filter((p) => {
    const s = (p.sku || '').trim().toUpperCase();
    const n = (p.name || '').trim().toLowerCase();
    if (s && seenSkus.has(s)) return false;
    if (n && seenNames.has(n)) return false;
    return true;
  });

  return [...converted, ...extraLegacy];
}

// =============================================================================
// РЫНОК И КОНКУРЕНТЫ (п. 11 ТЗ)
// =============================================================================
export function MarketIntelligenceView() {
  const {
    competitors,
    research,
    opportunities,
    currentUser,
    brandFilter,
    platformMode,
    createCompetitor,
    createResearch,
  } = usePlatform();

  const isStrategyMode = platformMode === 'strategy';
  const canEditMarket =
    !isStrategyMode &&
    currentUser.role !== 'Viewer' &&
    currentUser.role !== 'Partner';

  const [tab, setTab] = useState<'competitors' | 'matrix' | 'trends'>('competitors');
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [insightModalOpen, setInsightModalOpen] = useState(false);

  const [compForm, setCompForm] = useState({
    brandName: '',
    websiteUrl: 'https://example.ru',
    priceRangeRub: '1 800 – 3 200 ₽',
    positioning: '',
    keyProducts: 'Боксеры, футболки, базовые комплекты',
    strengths: '',
    weaknesses: '',
  });

  const [insightForm, setInsightForm] = useState({
    title: '',
    category: 'Тренды рынка' as
      | 'Тренды рынка'
      | 'Потребительские инсайты'
      | 'Материалы и фабрики'
      | 'Аналитика маркетплейсов',
    brandId: 'ALL',
    conclusions: '',
  });

  const filteredResearch = useMemo(
    () =>
      research.filter(
        (i) =>
          (i.brandId === 'ALL' ||
            canUserViewBrandConcept(currentUser, normalizeLabBrandCode(i.brandId))) &&
          (brandFilter === 'ALL' ||
            i.brandId === 'ALL' ||
            normalizeLabBrandCode(i.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [research, brandFilter, currentUser]
  );

  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter(
        (o) =>
          (o.brandId === 'ALL' ||
            canUserViewBrandConcept(currentUser, normalizeLabBrandCode(o.brandId))) &&
          (brandFilter === 'ALL' ||
            o.brandId === 'ALL' ||
            normalizeLabBrandCode(o.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [opportunities, brandFilter, currentUser]
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Архитектурная шапка раздела конкурентов */}
      <div className="rounded-xl bg-white border border-[#E4E1DA] p-5 md:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#5C5953]">
            Сводка и стратегия · Конкурентный анализ и исследования
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#141413] mt-0.5">
            Рынок и конкуренты
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] p-1 text-[12px]">
            <button
              onClick={() => setTab('competitors')}
              className={`h-8 px-3.5 rounded-lg font-medium transition cursor-pointer ${
                tab === 'competitors'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Досье <span className="font-mono">({competitors.length})</span>
            </button>
            <button
              onClick={() => setTab('matrix')}
              className={`h-8 px-3.5 rounded-lg font-medium transition cursor-pointer ${
                tab === 'matrix'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Сводная таблица
            </button>
            <button
              onClick={() => setTab('trends')}
              className={`h-8 px-3.5 rounded-lg font-medium transition cursor-pointer ${
                tab === 'trends'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Исследования <span className="font-mono">({filteredResearch.length + filteredOpportunities.length})</span>
            </button>
          </div>

          {canEditMarket && (
            <button
              onClick={() => setCompModalOpen(true)}
              className="h-9 px-4 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
            >
              Добавить конкурента
            </button>
          )}
        </div>
      </div>

      {/* Вкладка 1: Досье конкурентов */}
      {tab === 'competitors' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {competitors.map((comp) => (
            <div
              key={comp.id}
              className="bg-white rounded-xl border border-[#E4E1DA] p-6 flex flex-col justify-between space-y-5"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4 border-b border-[#E4E1DA] pb-4">
                  <div>
                    <div className="text-[12px] font-medium text-[#5C5953]">
                      Каналы: {comp.marketplaces.join(', ')}
                    </div>
                    <h3 className="text-[22px] font-semibold text-[#141413] mt-0.5 tracking-[-0.02em]">
                      {comp.brandName}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[13px] font-mono font-semibold rounded-lg bg-[#FAF9F6] border border-[#E4E1DA] px-3 py-1.5 text-[#141413]">
                      {comp.priceRangeRub}
                    </div>
                  </div>
                </div>

                <p className="text-[14px] text-[#5C5953] leading-relaxed">{comp.positioning}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3 border-t border-[#E4E1DA]">
                  <div>
                    <div className="text-[12px] font-medium uppercase tracking-wider text-[#16805D] mb-1">
                      Сильные стороны
                    </div>
                    <p className="text-[13.5px] text-[#141413] leading-relaxed">
                      {comp.strengths}
                    </p>
                  </div>

                  <div>
                    <div className="text-[12px] font-medium uppercase tracking-wider text-[#C94B4B] mb-1">
                      Слабые места
                    </div>
                    <p className="text-[13.5px] text-[#141413] leading-relaxed">
                      {comp.weaknesses}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E4E1DA] flex items-center justify-between text-[12.5px]">
                <span className="text-[#5C5953]">
                  Ключевой ассортимент: <b className="text-[#141413] font-medium">{comp.keyProducts}</b>
                </span>
                <span className="font-mono text-[#5C5953]">{comp.researchedAt}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Вкладка 2: Сводная таблица */}
      {tab === 'matrix' && (
        <div className="bg-white rounded-xl border border-[#E4E1DA] overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-[#E4E1DA] text-[12px] font-medium uppercase tracking-wider text-[#5C5953] bg-[#FAF9F6]">
              <tr>
                <th className="py-3.5 px-6">Бренд конкурента</th>
                <th className="py-3.5 px-4">Ценовой диапазон</th>
                <th className="py-3.5 px-4">Позиционирование</th>
                <th className="py-3.5 px-4">Сильные стороны</th>
                <th className="py-3.5 px-6">Слабые места</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA]">
              {competitors.map((comp) => (
                <tr key={comp.id} className="hover:bg-[#FAF9F6] transition">
                  <td className="py-4 px-6 font-semibold text-[15px] text-[#141413]">
                    {comp.brandName}
                  </td>
                  <td className="py-4 px-4 font-mono font-medium text-[#141413]">
                    {comp.priceRangeRub}
                  </td>
                  <td className="py-4 px-4 text-[#5C5953]">{comp.positioning}</td>
                  <td className="py-4 px-4 text-[#16805D] font-medium">
                    {comp.strengths}
                  </td>
                  <td className="py-4 px-6 text-[#C94B4B] font-medium">
                    {comp.weaknesses}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Вкладка 3: Исследования и ниши */}
      {tab === 'trends' && (
        <div className="space-y-5">
          {canEditMarket && (
            <div className="flex justify-end">
              <button
                onClick={() => setInsightModalOpen(true)}
                className="h-10 px-5 rounded-xl border border-[#E4E1DA] bg-white text-[13px] font-medium text-[#141413] hover:bg-[#141413] hover:text-white hover:border-[#141413] transition cursor-pointer"
              >
                + Зафиксировать исследование
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredResearch.map((ins) => (
              <div
                key={ins.id}
                className="bg-white rounded-xl border border-[#E4E1DA] p-6 space-y-3"
              >
                <div className="flex items-center justify-between text-[12px] font-medium text-[#5C5953] border-b border-[#E4E1DA] pb-3">
                  <span>{ins.category}</span>
                  <span className="font-mono">{ins.researchDate}</span>
                </div>
                <h4 className="text-[18px] font-semibold text-[#141413] tracking-[-0.01em]">
                  {ins.title}
                </h4>
                <p className="text-[14px] text-[#5C5953] leading-relaxed">{ins.conclusions}</p>
              </div>
            ))}

            {filteredOpportunities.map((opp) => (
              <div
                key={opp.id}
                className="bg-white rounded-xl border border-[#E4E1DA] p-6 space-y-3"
              >
                <div className="flex items-center justify-between text-[12px] font-medium text-[#5C5953] border-b border-[#E4E1DA] pb-3">
                  <span>
                    Рыночная ниша ·{' '}
                    {opp.brandId === 'ALL' ? 'Вся группа' : formatLabBrandLabel(opp.brandId)}
                  </span>
                  <span>Конкуренция: {opp.competitionLevel}</span>
                </div>
                <h4 className="text-[18px] font-semibold text-[#141413] tracking-[-0.01em]">
                  {opp.title}
                </h4>
                <p className="text-[14px] text-[#5C5953] leading-relaxed">
                  Аудитория: {opp.audience} · Потенциал: {opp.potentialDemand}
                </p>
                <div className="text-[13px] font-medium text-[#141413] pt-2 border-t border-[#E4E1DA]">
                  Экономика: {opp.economicsNote}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Модальное окно добавления конкурента */}
      {compModalOpen && (
        <div
          onClick={() => setCompModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white rounded-xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#E4E1DA] pb-4">
              <h3 className="text-[20px] font-semibold text-[#141413] tracking-[-0.02em]">Новое досье конкурента</h3>
              <button
                onClick={() => setCompModalOpen(false)}
                className="text-[13px] font-medium text-[#5C5953] hover:text-[#141413] cursor-pointer"
              >
                Закрыть
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Название бренда</label>
                <input
                  value={compForm.brandName}
                  onChange={(e) => setCompForm({ ...compForm, brandName: e.target.value })}
                  placeholder="Например: Belle YOU"
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Ценовой коридор</label>
                <input
                  value={compForm.priceRangeRub}
                  onChange={(e) => setCompForm({ ...compForm, priceRangeRub: e.target.value })}
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] font-mono text-[#141413]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-[#5C5953] mb-1.5">Позиционирование</label>
                <input
                  value={compForm.positioning}
                  onChange={(e) => setCompForm({ ...compForm, positioning: e.target.value })}
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Сильные стороны</label>
                <input
                  value={compForm.strengths}
                  onChange={(e) => setCompForm({ ...compForm, strengths: e.target.value })}
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Слабые места</label>
                <input
                  value={compForm.weaknesses}
                  onChange={(e) => setCompForm({ ...compForm, weaknesses: e.target.value })}
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setCompModalOpen(false)}
                className="h-10 px-5 rounded-xl border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!compForm.brandName.trim()) return;
                  createCompetitor({
                    brandName: compForm.brandName.trim(),
                    websiteUrl: compForm.websiteUrl,
                    marketplaces: ['Wildberries', 'Ozon'],
                    positioning: compForm.positioning || 'Игрок категории базового белья',
                    priceRangeRub: compForm.priceRangeRub,
                    keyProducts: compForm.keyProducts,
                    strengths: compForm.strengths || 'Широкая представленность',
                    weaknesses: compForm.weaknesses || 'Стандартная посадка',
                    photoUrl: '',
                    sources: 'Аналитика BORNERS GROUP',
                    researchedAt: new Date().toISOString().slice(0, 10),
                  });
                  setCompModalOpen(false);
                }}
                className="h-10 px-6 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно добавления исследования */}
      {insightModalOpen && (
        <div
          onClick={() => setInsightModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl"
          >
            <h3 className="text-[20px] font-semibold text-[#141413] border-b border-[#E4E1DA] pb-4 tracking-[-0.02em]">
              Новое рыночное исследование
            </h3>
            <div className="space-y-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Заголовок наблюдения</label>
                <input
                  value={insightForm.title}
                  onChange={(e) => setInsightForm({ ...insightForm, title: e.target.value })}
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Выводы и рекомендации</label>
                <textarea
                  rows={3}
                  value={insightForm.conclusions}
                  onChange={(e) =>
                    setInsightForm({ ...insightForm, conclusions: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#E4E1DA] p-3.5 text-[14px] text-[#141413]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setInsightModalOpen(false)}
                className="h-10 px-5 rounded-xl border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!insightForm.title.trim()) return;
                  createResearch({
                    title: insightForm.title.trim(),
                    category: insightForm.category,
                    brandId: insightForm.brandId,
                    conclusions: insightForm.conclusions,
                    sourceLinks: [],
                    researchDate: new Date().toISOString().slice(0, 10),
                  });
                  setInsightModalOpen(false);
                }}
                className="h-10 px-6 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ЗАДАЧИ И ПРОЕКТЫ (КРУПНЫЙ КАНБАН С DRAG & DROP + ТАБЛИЦА, п. 12 ТЗ)
// =============================================================================
const TASK_COLUMNS: TaskStatus[] = ['To Do', 'In Progress', 'Review', 'Done', 'Blocked'];

export function RoadmapTasksView() {
  const {
    strategicGoals,
    projects,
    tasks,
    users,
    currentUser,
    products,
    concepts,
    launches,
    brandFilter,
    platformMode,
    updateTask,
    updateTaskStatus,
    createTask,
    archiveEntity,
    navigateTo,
    notify,
  } = usePlatform();

  const isStrategyMode = platformMode === 'strategy';
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'projects'>('kanban');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [roadmapPeriodFilter, setRoadmapPeriodFilter] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskCommentText, setTaskCommentText] = useState('');

  // Состояние Drag & Drop
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    brandId: 'BORNERS',
    projectId: projects[0]?.id || 'proj-1',
    priority: 'High' as TaskPriority,
    assigneeId: users[0]?.id || 'user-owner',
    deadline: '2027-02-20',
  });

  const todayStr = '2027-02-01';

  const editableTaskBrandOptions = useMemo(() => {
    const base = [
      { code: 'BORNERS', label: 'BORNERS' },
      { code: 'NA_TELE', label: 'НА ТЕЛЕ' },
      { code: 'AKUSHA', label: 'AKUSHA' },
      { code: 'LISKANI', label: 'LISKANI' },
      { code: 'FUKAI', label: 'FUKAI' },
    ].filter((b) => canUserEditBrand(currentUser, b.code));
    if (currentUser.role === 'Owner' || currentUser.role === 'Admin') {
      base.push({ code: 'ALL', label: 'Общая задача холдинга' });
    }
    return base;
  }, [currentUser]);

  const canCreateTask =
    !isStrategyMode &&
    currentUser.role !== 'Viewer' &&
    currentUser.role !== 'Partner' &&
    editableTaskBrandOptions.length > 0;

  const canEditTaskItem = (t: TaskItem): boolean =>
    !isStrategyMode &&
    currentUser.role !== 'Viewer' &&
    currentUser.role !== 'Partner' &&
    (t.brandId === 'ALL'
      ? currentUser.role === 'Owner' || currentUser.role === 'Admin'
      : canUserEditBrand(currentUser, normalizeLabBrandCode(t.brandId)));

  const overdueCount = useMemo(() => {
    return tasks.filter(
      (t) =>
        !t.isArchived &&
        (t.brandId === 'ALL' ||
          canUserViewBrandConcept(currentUser, normalizeLabBrandCode(t.brandId))) &&
        (brandFilter === 'ALL' ||
          t.brandId === 'ALL' ||
          normalizeLabBrandCode(t.brandId) === normalizeLabBrandCode(brandFilter)) &&
        (assigneeFilter === 'ALL' || t.assigneeId === assigneeFilter) &&
        t.deadline < todayStr &&
        t.status !== 'Done'
    ).length;
  }, [tasks, brandFilter, assigneeFilter, currentUser]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.isArchived) return false;
      if (
        t.brandId !== 'ALL' &&
        !canUserViewBrandConcept(currentUser, normalizeLabBrandCode(t.brandId))
      ) {
        return false;
      }
      if (
        brandFilter !== 'ALL' &&
        t.brandId !== 'ALL' &&
        normalizeLabBrandCode(t.brandId) !== normalizeLabBrandCode(brandFilter)
      ) {
        return false;
      }
      if (assigneeFilter !== 'ALL' && t.assigneeId !== assigneeFilter) {
        return false;
      }
      if (overdueOnly && !(t.deadline < todayStr && t.status !== 'Done')) {
        return false;
      }
      return true;
    });
  }, [tasks, brandFilter, assigneeFilter, overdueOnly, currentUser]);

  const overdueOrBlockedCount = useMemo(
    () =>
      filteredTasks.filter(
        (t) => t.status === 'Blocked' || (t.deadline < todayStr && t.status !== 'Done')
      ).length,
    [filteredTasks]
  );

  const selectedTask: TaskItem | null = useMemo(() => {
    const found = tasks.find((t) => t.id === selectedTaskId) || null;
    if (
      found &&
      found.brandId !== 'ALL' &&
      !canUserViewBrandConcept(currentUser, normalizeLabBrandCode(found.brandId))
    ) {
      return null;
    }
    return found;
  }, [tasks, selectedTaskId, currentUser]);

  const canEditSelectedTask = selectedTask ? canEditTaskItem(selectedTask) : false;

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    const t = tasks.find((item) => item.id === taskId);
    if (!t || !canEditTaskItem(t)) {
      e.preventDefault();
      return;
    }
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    if (isStrategyMode || currentUser.role === 'Viewer' || currentUser.role === 'Partner') {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    if (isStrategyMode || currentUser.role === 'Viewer' || currentUser.role === 'Partner') {
      return;
    }
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (taskId) {
      const task = tasks.find((t) => t.id === taskId);
      if (task && canEditTaskItem(task) && task.status !== targetStatus) {
        updateTaskStatus(taskId, targetStatus);
      }
    }
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
  };

  const handleAttachFileToTask = (
    e: React.ChangeEvent<HTMLInputElement>,
    task: TaskItem
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateTask(task.id, {
      attachments: [...task.attachments, file.name],
    });
    notify('success', `Файл «${file.name}» прикреплён к задаче`);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Архитектурная шапка раздела CRM */}
      <div className="rounded-xl bg-white border border-[#E4E1DA] p-5 md:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#5C5953]">
            03 · Закупки и CRM · Операционные поручения и дорожная карта
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#141413] mt-0.5">
            Задачи и проекты CRM
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOverdueOnly(!overdueOnly)}
            className={`h-9 px-3.5 rounded-xl border text-[12px] font-medium transition cursor-pointer ${
              overdueOnly
                ? 'bg-[#C94B4B] text-white border-[#C94B4B]'
                : 'bg-white text-[#141413] border-[#E4E1DA] hover:border-[#C94B4B]'
            }`}
          >
            Просроченные <span className="font-mono">({overdueCount})</span>
          </button>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-9 rounded-xl bg-white border border-[#E4E1DA] hover:border-[#141413] px-3 text-[12.5px] font-medium text-[#141413] outline-none cursor-pointer"
          >
            <option value="ALL">Все исполнители</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] p-1 text-[12px]">
            <button
              onClick={() => setViewMode('kanban')}
              className={`h-7 px-3 rounded-lg font-medium transition cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Доска CRM
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`h-7 px-3 rounded-lg font-medium transition cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Таблица <span className="font-mono">({filteredTasks.length})</span>
            </button>
            <button
              onClick={() => setViewMode('projects')}
              className={`h-7 px-3 rounded-lg font-medium transition cursor-pointer ${
                viewMode === 'projects'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Проекты <span className="font-mono">({projects.length})</span>
            </button>
          </div>

          {canCreateTask && (
            <button
              onClick={() => {
                const defaultBrand =
                  brandFilter !== 'ALL' &&
                  canUserEditBrand(currentUser, normalizeLabBrandCode(brandFilter))
                    ? normalizeLabBrandCode(brandFilter)
                    : editableTaskBrandOptions[0]?.code || 'BORNERS';
                setNewTask((prev) => ({
                  ...prev,
                  brandId: editableTaskBrandOptions.some((o) => o.code === prev.brandId)
                    ? prev.brandId
                    : defaultBrand,
                }));
                setModalOpen(true);
              }}
              className="h-9 px-4 rounded-xl bg-[#141413] text-white text-[12.5px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
            >
              Новая задача
            </button>
          )}
        </div>
      </div>

      {/* Симметричная 4-колоночная сводка CRM */}
      <div className="rounded-xl bg-white border border-[#E4E1DA] overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#E4E1DA]">
          <div className="p-5 flex flex-col justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C5953]">
              Всего поручений в CRM
            </span>
            <span className="font-mono text-[28px] font-semibold text-[#141413] mt-2 leading-none">
              {filteredTasks.length} <span className="font-sans text-[14px] font-normal text-[#5C5953]">задач</span>
            </span>
          </div>
          <div className="p-5 flex flex-col justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C5953]">
              В активной работе / На проверке
            </span>
            <span className="font-mono text-[28px] font-semibold text-[#141413] mt-2 leading-none">
              {
                filteredTasks.filter(
                  (t) => t.status === 'In Progress' || t.status === 'Review'
                ).length
              }{' '}
              <span className="font-sans text-[14px] font-normal text-[#5C5953]">задач</span>
            </span>
          </div>
          <div className="p-5 flex flex-col justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C5953]">
              Выполнено и закрыто
            </span>
            <span className="font-mono text-[28px] font-semibold text-[#16805D] mt-2 leading-none">
              {filteredTasks.filter((t) => t.status === 'Done').length}{' '}
              <span className="font-sans text-[14px] font-normal text-[#5C5953]">задач</span>
            </span>
          </div>
          <div className="p-5 flex flex-col justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-[#5C5953]">
              Требуют внимания / Просрочено
            </span>
            <span className="font-mono text-[28px] font-semibold text-[#C94B4B] mt-2 leading-none">
              {overdueOrBlockedCount}{' '}
              <span className="font-sans text-[14px] font-normal text-[#5C5953]">задач</span>
            </span>
          </div>
        </div>
      </div>

      {/* КАНБАН-ДОСКА С ПЕРЕТАСКИВАНИЕМ */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-stretch">
          {TASK_COLUMNS.map((status) => {
            const colTasks = filteredTasks.filter((t) => t.status === status);
            const isDropTarget = dragOverColumn === status;

            return (
              <div
                key={status}
                onDragOver={(e) => handleDragOver(e, status)}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => handleDrop(e, status)}
                className={`p-3.5 rounded-xl min-h-[540px] flex flex-col transition-colors border ${
                  isDropTarget
                    ? 'bg-white border-[#141413] ring-1 ring-[#141413]'
                    : 'bg-[#FAF9F6] border-[#E4E1DA]'
                }`}
              >
                {/* Шапка колонки */}
                <div className="flex items-center justify-between mb-3.5 pb-3 border-b border-[#E4E1DA]">
                  <span className="text-[13.5px] font-semibold text-[#141413]">
                    {TASK_STATUS_LABELS_RU[status]}
                  </span>
                  <span className="text-[12px] font-mono font-medium text-[#5C5953] bg-white px-2 py-0.5 rounded-md border border-[#E4E1DA]">
                    {colTasks.length}
                  </span>
                </div>

                {/* Список карточек */}
                <div className="space-y-3 flex-1">
                  {colTasks.map((task) => {
                    const assignee = users.find((u) => u.id === task.assigneeId);
                    const linkedProduct = products.find((p) => p.id === task.productId);
                    const linkedConcept = concepts.find((c) => c.id === task.conceptId);
                    const linkedLaunch = launches.find((l) => l.id === task.launchId);
                    const isBeingDragged = draggedTaskId === task.id;
                    const isOverdue = task.deadline < todayStr && task.status !== 'Done';
                    const canDragThis = canEditTaskItem(task);

                    return (
                      <div
                        key={task.id}
                        draggable={canDragThis}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`bg-white rounded-xl border border-[#E4E1DA] hover:border-[#141413] p-4 space-y-3 ${
                          canDragThis
                            ? 'cursor-grab active:cursor-grabbing'
                            : 'cursor-pointer'
                        } transition-colors select-none ${
                          isBeingDragged ? 'opacity-40 scale-[0.98]' : ''
                        }`}
                      >
                        {/* Верхняя строка: Бренд и Приоритет */}
                        <div className="flex items-center justify-between gap-2 text-[12px]">
                          <div className="flex items-center gap-1.5 font-medium text-[#5C5953]">
                            {canDragThis && (
                              <GripVertical className="h-3.5 w-3.5 stroke-[1.5] text-[#5C5953]" />
                            )}
                            <span className="uppercase tracking-wider text-[11px]">
                              {task.brandId === 'ALL'
                                ? 'Вся группа'
                                : formatLabBrandLabel(task.brandId)}
                            </span>
                          </div>
                          <span
                            className={`font-medium ${
                              task.priority === 'Critical'
                                ? 'text-[#C94B4B]'
                                : task.priority === 'High'
                                ? 'text-[#B45309]'
                                : 'text-[#5C5953]'
                            }`}
                          >
                            {TASK_PRIORITY_LABELS_RU[task.priority]}
                          </span>
                        </div>

                        {/* Крупное название задачи */}
                        <div className="text-[14.5px] font-semibold text-[#141413] leading-snug">
                          {task.title}
                        </div>

                        {/* Привязанный объект */}
                        {(linkedProduct || linkedConcept || linkedLaunch) && (
                          <div className="pt-0.5">
                            {linkedProduct && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateTo('product-catalog', { productId: linkedProduct.id });
                                }}
                                className="inline-flex items-center gap-1 text-[12px] font-mono font-medium text-[#141413] hover:underline cursor-pointer"
                              >
                                <span>SKU: {linkedProduct.sku}</span>
                                <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5]" />
                              </button>
                            )}
                            {linkedConcept && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateTo('product-lab', { conceptId: linkedConcept.id });
                                }}
                                className="inline-flex items-center gap-1 text-[12px] font-mono font-medium text-[#141413] hover:underline cursor-pointer"
                              >
                                <span>R&D: {linkedConcept.code}</span>
                                <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5]" />
                              </button>
                            )}
                            {linkedLaunch && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateTo('launch-calendar', { launchId: linkedLaunch.id });
                                }}
                                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#141413] hover:underline cursor-pointer"
                              >
                                <span>Релиз: {linkedLaunch.name}</span>
                                <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5]" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Подвал карточки: Исполнитель, Вложения/Комментарии и Дедлайн */}
                        <div className="flex items-center justify-between pt-3 border-t border-[#E4E1DA] text-[12px]">
                          <span className="font-medium text-[#5C5953] truncate">
                            {assignee?.fullName.split(' ')[0] || 'Команда'}
                            {(task.comments.length > 0 || task.attachments.length > 0) && (
                              <span className="ml-1.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-[#5C5953]">
                                <span>·</span>
                                <span className="inline-flex items-center">
                                  <MessageSquare className="inline h-3 w-3 stroke-[1.5] mr-0.5" />
                                  {task.comments.length}
                                </span>
                                <span className="inline-flex items-center">
                                  <Paperclip className="inline h-3 w-3 stroke-[1.5] mr-0.5" />
                                  {task.attachments.length}
                                </span>
                              </span>
                            )}
                          </span>
                          <span
                            className={`font-mono font-medium ${
                              isOverdue ? 'text-[#C94B4B]' : 'text-[#141413]'
                            }`}
                          >
                            {task.deadline}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {colTasks.length === 0 && (
                    <div className="h-32 rounded-xl border border-dashed border-[#D2CEC4] flex items-center justify-center text-[13px] text-[#5C5953] text-center px-4">
                      Перетащите карточку сюда
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ТАБЛИЧНЫЙ СПИСОК ЗАДАЧ */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-[#E4E1DA] overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-[#E4E1DA] text-[12px] font-medium uppercase tracking-wider text-[#5C5953] bg-[#FAF9F6]">
              <tr>
                <th className="py-3.5 px-6">Задача</th>
                <th className="py-3.5 px-4">Бренд</th>
                <th className="py-3.5 px-4">Приоритет</th>
                <th className="py-3.5 px-4">Ответственный</th>
                <th className="py-3.5 px-4">Срок</th>
                <th className="py-3.5 px-6 text-right">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA]">
              {filteredTasks.map((task) => {
                const assignee = users.find((u) => u.id === task.assigneeId);
                const isOverdue = task.deadline < todayStr && task.status !== 'Done';
                return (
                  <tr
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className="hover:bg-[#FAF9F6] transition cursor-pointer"
                  >
                    <td className="py-4 px-6">
                      <div className="font-semibold text-[15px] text-[#141413]">
                        {task.title}
                      </div>
                      <div className="text-[13px] text-[#5C5953] mt-0.5">{task.description}</div>
                    </td>
                    <td className="py-4 px-4 font-medium text-[#141413]">
                      {task.brandId === 'ALL'
                        ? 'Вся группа'
                        : formatLabBrandLabel(task.brandId)}
                    </td>
                    <td className="py-4 px-4 font-medium text-[#141413]">
                      {TASK_PRIORITY_LABELS_RU[task.priority]}
                    </td>
                    <td className="py-4 px-4 text-[#5C5953]">
                      {assignee?.fullName}
                    </td>
                    <td className="py-4 px-4 font-mono font-medium">
                      <span className={isOverdue ? 'text-[#C94B4B]' : 'text-[#141413]'}>
                        {task.deadline}
                      </span>
                    </td>
                    <td
                      className="py-4 px-6 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        disabled={!canEditTaskItem(task)}
                        value={task.status}
                        onChange={(e) => {
                          if (!canEditTaskItem(task)) return;
                          updateTaskStatus(task.id, e.target.value as TaskStatus);
                        }}
                        className="h-9 rounded-xl border border-[#E4E1DA] px-3 text-[13px] font-medium bg-white text-[#141413] disabled:opacity-60 cursor-pointer"
                      >
                        {TASK_COLUMNS.map((st) => (
                          <option key={st} value={st}>
                            {TASK_STATUS_LABELS_RU[st]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ДОРОЖНАЯ КАРТА (ИЕРАРХИЯ ПО П. 12 ТЗ: СТРАТЕГИЧЕСКАЯ ЦЕЛЬ → ПРОЕКТЫ → ЗАДАЧИ) */}
      {viewMode === 'projects' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-[13.5px] text-[#5C5953]">
              Иерархия дорожной карты:{' '}
              <b className="text-[#141413] font-semibold">Стратегическая цель → Проекты → Задачи</b>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {['ALL', 'Q1 2027', 'Q2 2027', '2026', '2027'].map((period) => (
                <button
                  key={period}
                  onClick={() => setRoadmapPeriodFilter(period)}
                  className={`px-3.5 py-1.5 rounded-xl text-[12.5px] font-medium border transition cursor-pointer ${
                    roadmapPeriodFilter === period
                      ? 'bg-[#141413] text-white border-[#141413]'
                      : 'bg-white text-[#141413] border-[#E4E1DA] hover:border-[#141413]'
                  }`}
                >
                  {period === 'ALL' ? 'Все периоды' : <span className="font-mono">{period}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {strategicGoals
              .filter(
                (g) =>
                  (g.brandId === 'ALL' ||
                    canUserViewBrandConcept(
                      currentUser,
                      normalizeLabBrandCode(g.brandId)
                    )) &&
                  (brandFilter === 'ALL' ||
                    g.brandId === 'ALL' ||
                    normalizeLabBrandCode(g.brandId) === normalizeLabBrandCode(brandFilter))
              )
              .map((goal) => {
                const goalProjects = projects.filter((p) => {
                  if (p.strategicGoalId !== goal.id) return false;
                  if (
                    p.brandId !== 'ALL' &&
                    !canUserViewBrandConcept(
                      currentUser,
                      normalizeLabBrandCode(p.brandId)
                    )
                  ) {
                    return false;
                  }
                  if (
                    roadmapPeriodFilter !== 'ALL' &&
                    !p.quarter.includes(roadmapPeriodFilter)
                  ) {
                    return false;
                  }
                  return true;
                });

                return (
                  <div
                    key={goal.id}
                    className="bg-white rounded-xl border border-[#E4E1DA] p-6 space-y-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E1DA] pb-4">
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#5C5953]">
                          Стратегическая цель · <span className="font-mono">{goal.periodQuarter} ({goal.periodYear})</span> ·{' '}
                          {goal.brandId === 'ALL'
                            ? 'Вся группа'
                            : formatLabBrandLabel(goal.brandId)}
                        </div>
                        <h3 className="text-[20px] font-semibold text-[#141413] mt-1 tracking-[-0.02em]">
                          {goal.title}
                        </h3>
                      </div>
                      <span className="px-3 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#E4E1DA] text-[12.5px] font-mono font-semibold text-[#16805D]">
                        Целевой KPI: {goal.targetMetric} ({goal.progressPct}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {goalProjects.map((proj) => {
                        const owner = users.find((u) => u.id === proj.ownerId);
                        const projTasks = tasks.filter(
                          (t) =>
                            !t.isArchived &&
                            t.projectId === proj.id &&
                            (t.brandId === 'ALL' ||
                              canUserViewBrandConcept(
                                currentUser,
                                normalizeLabBrandCode(t.brandId)
                              ))
                        );
                        const doneCount = projTasks.filter(
                          (t) => t.status === 'Done'
                        ).length;

                        return (
                          <div
                            key={proj.id}
                            className="rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] p-5 space-y-4"
                          >
                            <div className="flex items-center justify-between text-[12px] font-medium text-[#5C5953]">
                              <span>Проект · <span className="font-mono">{proj.quarter}</span></span>
                              <span className="text-[#141413]">{proj.status}</span>
                            </div>

                            <div>
                              <h4 className="text-[17px] font-semibold text-[#141413]">
                                {proj.name}
                              </h4>
                              <p className="text-[13px] text-[#5C5953] mt-1">
                                {proj.description}
                              </p>
                            </div>

                            {/* Список связанных задач проекта */}
                            {projTasks.length > 0 && (
                              <div className="space-y-2 pt-2 border-t border-[#E4E1DA]">
                                <div className="flex items-center justify-between text-[12px] font-medium text-[#5C5953]">
                                  <span>Задачи проекта (<span className="font-mono">{projTasks.length}</span>)</span>
                                  <span className="font-mono">
                                    Выполнено: {doneCount}/{projTasks.length}
                                  </span>
                                </div>
                                {projTasks.map((pt) => (
                                  <div
                                    key={pt.id}
                                    onClick={() => setSelectedTaskId(pt.id)}
                                    className="rounded-lg bg-white border border-[#E4E1DA] px-3 py-2 flex items-center justify-between text-[13px] hover:border-[#141413] transition cursor-pointer"
                                  >
                                    <span className="font-medium text-[#141413] truncate pr-2">
                                      {pt.title}
                                    </span>
                                    <span className="text-[11px] font-medium text-[#5C5953] shrink-0">
                                      {TASK_STATUS_LABELS_RU[pt.status]}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="pt-2 border-t border-[#E4E1DA] text-[12px] text-[#5C5953] flex justify-between">
                              <span>
                                Руководитель:{' '}
                                <b className="text-[#141413] font-medium">{owner?.fullName}</b>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* БОКОВАЯ ПАНЕЛЬ ДЕТАЛЕЙ ЗАДАЧИ, КОММЕНТАРИЕВ И ВЛОЖЕНИЙ (п. 12 ТЗ) */}
      {selectedTask && (
        <div
          onClick={() => setSelectedTaskId(null)}
          className="fixed inset-0 z-50 flex justify-end bg-[#141413]/40"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white h-full overflow-y-auto p-8 space-y-6 shadow-xl border-l border-[#E4E1DA]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E4E1DA] pb-5">
              <div>
                <div className="text-[11px] font-mono font-medium uppercase tracking-[0.12em] text-[#5C5953]">
                  Карточка задачи · ID {selectedTask.id}
                </div>
                <h2 className="text-[22px] font-semibold text-[#141413] mt-1 tracking-[-0.02em]">
                  {selectedTask.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTaskId(null)}
                className="rounded-xl border border-[#E4E1DA] p-2 text-[#141413] hover:bg-[#141413] hover:text-white hover:border-[#141413] transition cursor-pointer"
              >
                <X className="h-5 w-5 stroke-[1.5]" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Статус</label>
                <select
                  disabled={!canEditSelectedTask}
                  value={selectedTask.status}
                  onChange={(e) =>
                    updateTaskStatus(selectedTask.id, e.target.value as TaskStatus)
                  }
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-medium bg-white text-[#141413] disabled:opacity-60"
                >
                  {TASK_COLUMNS.map((st) => (
                    <option key={st} value={st}>
                      {TASK_STATUS_LABELS_RU[st]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Приоритет</label>
                <select
                  disabled={!canEditSelectedTask}
                  value={selectedTask.priority}
                  onChange={(e) =>
                    updateTask(selectedTask.id, {
                      priority: e.target.value as TaskPriority,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-medium bg-white text-[#141413] disabled:opacity-60"
                >
                  <option value="Critical">Критический</option>
                  <option value="High">Высокий</option>
                  <option value="Medium">Средний</option>
                  <option value="Low">Низкий</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Ответственный</label>
                <select
                  disabled={!canEditSelectedTask}
                  value={selectedTask.assigneeId}
                  onChange={(e) =>
                    updateTask(selectedTask.id, { assigneeId: e.target.value })
                  }
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-medium bg-white text-[#141413] disabled:opacity-60"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Дедлайн</label>
                <input
                  type="date"
                  disabled={!canEditSelectedTask}
                  value={selectedTask.deadline}
                  onChange={(e) =>
                    updateTask(selectedTask.id, { deadline: e.target.value })
                  }
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-mono font-medium bg-white text-[#141413] disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#5C5953] mb-1.5">
                Описание задачи
              </label>
              <textarea
                rows={3}
                disabled={!canEditSelectedTask}
                value={selectedTask.description}
                onChange={(e) =>
                  updateTask(selectedTask.id, { description: e.target.value })
                }
                className="w-full rounded-xl border border-[#E4E1DA] p-3.5 text-[14px] text-[#141413] disabled:opacity-60"
              />
            </div>

            {/* Вложения к задаче */}
            <div className="space-y-3 pt-4 border-t border-[#E4E1DA]">
              <div className="flex items-center justify-between">
                <h4 className="text-[15px] font-semibold text-[#141413]">
                  Вложения (<span className="font-mono">{selectedTask.attachments.length}</span>)
                </h4>
                {canEditSelectedTask && (
                  <label className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#141413] hover:underline cursor-pointer">
                    <Paperclip className="h-4 w-4 stroke-[1.5]" />
                    <span>Прикрепить файл</span>
                    <input
                      type="file"
                      onChange={(e) => handleAttachFileToTask(e, selectedTask)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedTask.attachments.map((att, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#E4E1DA] text-[13px] font-medium text-[#141413]"
                  >
                    <Paperclip className="h-3.5 w-3.5 stroke-[1.5] text-[#5C5953] shrink-0" />
                    <span>{att}</span>
                  </span>
                ))}
                {selectedTask.attachments.length === 0 && (
                  <span className="text-[13px] text-[#5C5953]">Вложений пока нет</span>
                )}
              </div>
            </div>

            {/* Комментарии к задаче */}
            <div className="space-y-4 pt-4 border-t border-[#E4E1DA]">
              <h4 className="text-[15px] font-semibold text-[#141413]">
                Комментарии (<span className="font-mono">{selectedTask.comments.length}</span>)
              </h4>
              <div className="space-y-2.5 max-h-56 overflow-y-auto">
                {selectedTask.comments.map((cm) => (
                  <div
                    key={cm.id}
                    className="rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] p-3.5 text-[13.5px]"
                  >
                    <div className="flex items-center justify-between text-[12px] text-[#5C5953] mb-1">
                      <span className="font-medium text-[#141413]">
                        {cm.authorName}
                      </span>
                      <span className="font-mono">{cm.createdAt}</span>
                    </div>
                    <p className="text-[#141413]">{cm.text}</p>
                  </div>
                ))}
              </div>

              {canEditSelectedTask && (
                <div className="flex gap-2">
                  <input
                    value={taskCommentText}
                    onChange={(e) => setTaskCommentText(e.target.value)}
                    placeholder="Написать комментарий по задаче..."
                    className="flex-1 h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[13.5px] text-[#141413]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!taskCommentText.trim()) return;
                      updateTask(selectedTask.id, {
                        comments: [
                          ...selectedTask.comments,
                          {
                            id: `tcm-${Date.now()}`,
                            authorName: currentUser.fullName,
                            text: taskCommentText.trim(),
                            createdAt: new Date().toISOString().slice(0, 10),
                          },
                        ],
                      });
                      setTaskCommentText('');
                    }}
                    className="h-10 px-4 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
                  >
                    Отправить
                  </button>
                </div>
              )}
            </div>

            {canEditSelectedTask && (
              <div className="pt-4 border-t border-[#E4E1DA] flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => {
                    archiveEntity('task', selectedTask.id);
                    setSelectedTaskId(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#C94B4B] hover:underline cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 stroke-[1.5]" />
                  <span>Удалить в корзину</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Модальное окно создания задачи */}
      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl"
          >
            <h3 className="text-[20px] font-semibold text-[#141413] border-b border-[#E4E1DA] pb-4 tracking-[-0.02em]">
              Постановка задачи
            </h3>
            <div className="space-y-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Формулировка задачи</label>
                <input
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Например: Проверить посадку образца после стирки"
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">Бренд</label>
                  <select
                    value={newTask.brandId}
                    onChange={(e) => setNewTask({ ...newTask, brandId: e.target.value })}
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] bg-white text-[#141413]"
                  >
                    {editableTaskBrandOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">Приоритет</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask({ ...newTask, priority: e.target.value as TaskPriority })
                    }
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] bg-white text-[#141413]"
                  >
                    <option value="Critical">Критический</option>
                    <option value="High">Высокий</option>
                    <option value="Medium">Средний</option>
                    <option value="Low">Низкий</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">Исполнитель</label>
                  <select
                    value={newTask.assigneeId}
                    onChange={(e) =>
                      setNewTask({ ...newTask, assigneeId: e.target.value })
                    }
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] bg-white text-[#141413]"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">Дедлайн</label>
                  <input
                    type="date"
                    value={newTask.deadline}
                    onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] font-mono text-[#141413]"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setModalOpen(false)}
                className="h-10 px-5 rounded-xl border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!newTask.title.trim()) return;
                  createTask({
                    title: newTask.title.trim(),
                    description: newTask.description || 'Операционная задача',
                    brandId: newTask.brandId,
                    projectId: newTask.projectId,
                    priority: newTask.priority,
                    assigneeId: newTask.assigneeId,
                    deadline: newTask.deadline,
                  });
                  setModalOpen(false);
                }}
                className="h-10 px-6 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
              >
                Создать задачу
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ДОКУМЕНТЫ И БАЗА ЗНАНИЙ (п. 13 ТЗ)
// =============================================================================
const DOC_CATEGORIES: DocumentCategory[] = [
  'стратегия',
  'производство',
  'поставщики',
  'каталоги',
  'дизайн',
  'аналитика',
  'маркетинг',
  'финансы',
  'прочее',
];

export function DocumentsView() {
  const {
    documents,
    products,
    concepts,
    financialPlans,
    currentUser,
    brandFilter,
    platformMode,
    createDocument,
    updateDocument,
    archiveEntity,
    navigateTo,
    notify,
  } = usePlatform();

  const isStrategyMode = platformMode === 'strategy';
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const hasFinanceAccess = canUserViewFinance(currentUser);
  const hasCostAccess = canUserViewCostPrice(currentUser);
  const editableDocBrandOptions = useMemo(() => {
    const out: { code: string; label: string }[] = [];
    if (currentUser.role === 'Owner' || currentUser.role === 'Admin') {
      out.push({ code: 'ALL', label: 'BORNERS GROUP (Общий)' });
    }
    for (const b of [
      { code: 'BORNERS', label: 'BORNERS' },
      { code: 'NA_TELE', label: 'НА ТЕЛЕ' },
      { code: 'AKUSHA', label: 'AKUSHA' },
      { code: 'LISKANI', label: 'LISKANI' },
      { code: 'FUKAI', label: 'FUKAI' },
    ]) {
      if (canUserEditBrand(currentUser, b.code)) {
        out.push(b);
      }
    }
    return out;
  }, [currentUser]);

  const canEditDocs =
    !isStrategyMode &&
    currentUser.role !== 'Viewer' &&
    currentUser.role !== 'Partner' &&
    editableDocBrandOptions.length > 0;

  const visibleConcepts = useMemo(
    () =>
      concepts.filter(
        (c) =>
          !c.isArchived &&
          canUserViewBrandConcept(currentUser, normalizeLabBrandCode(c.brandId))
      ),
    [concepts, currentUser]
  );

  const [form, setForm] = useState({
    title: '',
    category: 'производство' as DocumentCategory,
    brandId: 'BORNERS',
    fileName: '',
    fileType: 'PDF',
    fileSizeBytes: 2450000,
    dataUrl: '',
    conceptId: '',
    productId: '',
    isFinancialRestricted: false,
  });

  const handleMultiFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
      const reader = new FileReader();
      reader.onload = () => {
        createDocument({
          title: file.name.replace(/\.[^/.]+$/, ''),
          category: form.category || 'производство',
          brandId:
            form.brandId && form.brandId !== 'ALL'
              ? normalizeLabBrandCode(form.brandId)
              : brandFilter !== 'ALL'
              ? normalizeLabBrandCode(brandFilter)
              : 'BORNERS',
          fileName: file.name,
          fileType: ext,
          fileSizeBytes: file.size || 245000,
          dataUrl: typeof reader.result === 'string' ? reader.result : undefined,
          conceptId: form.conceptId || undefined,
          productId: form.productId || undefined,
          tags: [form.category || 'производство'],
          isFinancialRestricted: false,
          minRole: 'Viewer',
          isDemo: false,
        });
      };
      reader.readAsDataURL(file);
    });
    notify('success', `Пакетно загружено файлов в реестр: ${files.length} шт.`);
  };

  const livePortfolio = useLiveScenarioPortfolio();

  const mergedCatalogProducts = useMemo(
    () =>
      buildLiveCatalogProductsForExport(
        livePortfolio.models,
        livePortfolio.scenarios,
        livePortfolio.selectedScenarioByBrand,
        livePortfolio.currentScenario,
        products
      ),
    [
      livePortfolio.models,
      livePortfolio.scenarios,
      livePortfolio.selectedScenarioByBrand,
      livePortfolio.currentScenario,
      products,
    ]
  );

  const visibleCatalogProducts = useMemo(
    () =>
      mergedCatalogProducts.filter(
        (p) =>
          !p.isArchived &&
          canUserViewBrandConcept(currentUser, normalizeLabBrandCode(p.brandId))
      ),
    [mergedCatalogProducts, currentUser]
  );

  const filteredDocs = useMemo(() => {
    return documents.filter((d) => {
      if (d.isArchived) return false;
      if (d.isFinancialRestricted && !hasFinanceAccess) return false;
      if (
        d.brandId !== 'ALL' &&
        !canUserViewBrandConcept(currentUser, normalizeLabBrandCode(d.brandId))
      ) {
        return false;
      }
      if (
        brandFilter !== 'ALL' &&
        d.brandId !== 'ALL' &&
        normalizeLabBrandCode(d.brandId) !== normalizeLabBrandCode(brandFilter)
      ) {
        return false;
      }
      if (categoryFilter !== 'ALL' && d.category !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [documents, hasFinanceAccess, brandFilter, categoryFilter, searchQuery, currentUser]);

  const handleDownloadPdf = (doc: (typeof documents)[number]) => {
    if (doc.dataUrl && doc.fileName.toLowerCase().endsWith('.pdf')) {
      const a = document.createElement('a');
      a.href = doc.dataUrl;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('success', `PDF «${doc.fileName}» выгружен`);
      return;
    }
    exportDocumentAsPdf(doc, {
      products: visibleCatalogProducts,
      concepts: visibleConcepts,
      financialPlans,
      canViewCostPrice: hasCostAccess,
      canViewFinance: hasFinanceAccess,
    });
    notify(
      'success',
      `Сформирован брендированный PDF`,
      `${doc.fileName.replace(/\.[^/.]+$/, '')}.pdf`
    );
  };

  const handleDownloadExcel = (doc: (typeof documents)[number]) => {
    if (
      doc.dataUrl &&
      (doc.fileName.toLowerCase().endsWith('.xlsx') ||
        doc.fileName.toLowerCase().endsWith('.xls'))
    ) {
      const a = document.createElement('a');
      a.href = doc.dataUrl;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('success', `Таблица «${doc.fileName}» выгружена`);
      return;
    }
    exportDocumentAsExcel(doc, {
      products: visibleCatalogProducts,
      concepts: visibleConcepts,
      financialPlans,
      canViewCostPrice: hasCostAccess,
      canViewFinance: hasFinanceAccess,
    });
    notify(
      'success',
      `Сформирована таблица Excel (.xlsx)`,
      `${doc.fileName.replace(/\.[^/.]+$/, '')}.xlsx`
    );
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="rounded-xl bg-white border border-[#E4E1DA] p-5 md:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#5C5953]">
            04 · Финансы и документы · Реестр ТЗ, лекал, отчётов и спецификаций
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#141413] mt-0.5">
            Документы, ТЗ и PDF
          </h1>
        </div>

        {canEditDocs && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="h-9 px-3.5 rounded-xl border border-[#E4E1DA] bg-white hover:border-[#141413] text-[#141413] text-[12.5px] font-medium transition cursor-pointer inline-flex items-center">
              <span>Загрузить пакет файлов</span>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  handleMultiFileUpload(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
            <button
              onClick={() => {
                const defaultBrand =
                  brandFilter !== 'ALL' &&
                  canUserEditBrand(currentUser, normalizeLabBrandCode(brandFilter))
                    ? normalizeLabBrandCode(brandFilter)
                    : editableDocBrandOptions[0]?.code || 'BORNERS';
                setForm((prev) => ({
                  ...prev,
                  brandId: editableDocBrandOptions.some((o) => o.code === prev.brandId)
                    ? prev.brandId
                    : defaultBrand,
                }));
                setModalOpen(true);
              }}
              className="h-9 px-4 rounded-xl bg-[#141413] text-white text-[12.5px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
            >
              Добавить ТЗ / документ
            </button>
          </div>
        )}
      </div>

      {/* Фильтры и поиск */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3.5 py-2 rounded-xl text-[13px] font-medium border transition cursor-pointer ${
              categoryFilter === 'ALL'
                ? 'bg-[#141413] text-white border-[#141413]'
                : 'bg-white text-[#141413] border-[#E4E1DA] hover:border-[#141413]'
            }`}
          >
            Все <span className="font-mono">({filteredDocs.length})</span>
          </button>
          {DOC_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-medium border capitalize transition cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-[#141413] text-white border-[#141413]'
                  : 'bg-white text-[#141413] border-[#E4E1DA] hover:border-[#141413]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="h-4 w-4 stroke-[1.5] text-[#5C5953] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск документа..."
            className="w-full h-10 rounded-xl bg-white border border-[#E4E1DA] focus:border-[#141413] pl-10 pr-4 text-[14px] text-[#141413] outline-none"
          />
        </div>
      </div>

      {/* Таблица документов */}
      <div className="bg-white rounded-xl border border-[#E4E1DA] overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead className="border-b border-[#E4E1DA] text-[12px] font-medium uppercase tracking-wider text-[#5C5953] bg-[#FAF9F6]">
            <tr>
              <th className="py-3.5 px-6">Наименование и файл</th>
              <th className="py-3.5 px-4">Привязка к карточке (R&amp;D / SKU)</th>
              <th className="py-3.5 px-4">Категория / Бренд</th>
              <th className="py-3.5 px-4">Дата и автор</th>
              <th className="py-3.5 px-6 text-right">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E1DA]">
            {filteredDocs.map((doc) => {
              const isExcelNative =
                doc.fileName.toLowerCase().endsWith('.xlsx') ||
                doc.fileName.toLowerCase().endsWith('.xls') ||
                doc.category === 'финансы';
              const linkedConcept = concepts.find((c) => c.id === doc.conceptId);
              const canViewLinkedConcept = linkedConcept
                ? canUserViewBrandConcept(
                    currentUser,
                    normalizeLabBrandCode(linkedConcept.brandId)
                  )
                : false;
              const linkedProduct =
                mergedCatalogProducts.find((p) => p.id === doc.productId) ||
                products.find((p) => p.id === doc.productId);
              const canEditThisDoc =
                canEditDocs &&
                (doc.brandId === 'ALL' ||
                  canUserEditBrand(currentUser, normalizeLabBrandCode(doc.brandId)));

              return (
                <tr key={doc.id} className="hover:bg-[#FAF9F6] transition">
                  <td className="py-4 px-6">
                    <div className="font-semibold text-[15px] text-[#141413]">
                      {doc.title}
                    </div>
                    <div className="text-[12px] font-mono text-[#5C5953] mt-0.5">
                      {doc.fileName} · {Math.round(doc.fileSizeBytes / 1024)} КБ
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="space-y-1.5">
                      {linkedConcept && canViewLinkedConcept && (
                        <button
                          type="button"
                          onClick={() => navigateTo('product-lab', { conceptId: linkedConcept.id })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FAF9F6] border border-[#E4E1DA] hover:border-[#141413] text-[12px] font-medium text-[#141413] cursor-pointer"
                        >
                          <span className="text-[#5C5953] font-mono">R&amp;D:</span>
                          <span className="truncate max-w-[180px]">{linkedConcept.name}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5] shrink-0" />
                        </button>
                      )}
                      {linkedProduct && (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              typeof window !== 'undefined' &&
                              livePortfolio.models.some((m) => m.id === linkedProduct.id)
                            ) {
                              try {
                                sessionStorage.setItem(
                                  'borners_open_scenario_model_id',
                                  linkedProduct.id
                                );
                              } catch {
                                // ignore storage errors
                              }
                            }
                            navigateTo('product-catalog', { productId: linkedProduct.id });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#FAF9F6] border border-[#E4E1DA] hover:border-[#141413] text-[12px] font-medium text-[#141413] cursor-pointer"
                        >
                          <span className="text-[#16805D] font-mono">SKU:</span>
                          <span className="truncate max-w-[180px]"><span className="font-mono">{linkedProduct.sku}</span> · {linkedProduct.name}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5] shrink-0" />
                        </button>
                      )}
                      {canEditThisDoc && (
                        <div>
                          <select
                            value={
                              doc.conceptId
                                ? `concept:${doc.conceptId}`
                                : doc.productId
                                ? `product:${doc.productId}`
                                : ''
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) {
                                updateDocument(doc.id, { conceptId: undefined, productId: undefined });
                              } else if (val.startsWith('concept:')) {
                                updateDocument(doc.id, {
                                  conceptId: val.replace('concept:', ''),
                                  productId: undefined,
                                });
                              } else if (val.startsWith('product:')) {
                                updateDocument(doc.id, {
                                  productId: val.replace('product:', ''),
                                  conceptId: undefined,
                                });
                              }
                            }}
                            className="h-8 rounded-lg border border-[#E4E1DA] bg-white px-2 text-[11.5px] font-medium text-[#5C5953] max-w-[230px] cursor-pointer"
                          >
                            <option value="">Привязать к карточке R&amp;D или SKU...</option>
                            <optgroup label="Карточки разработки R&D">
                              {visibleConcepts.map((c) => (
                                <option key={c.id} value={`concept:${c.id}`}>
                                  R&amp;D: {c.code} — {c.name}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Модели каталога SKU">
                              {visibleCatalogProducts.map((p) => (
                                <option key={p.id} value={`product:${p.id}`}>
                                  SKU: {p.sku} — {p.name}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="font-medium capitalize text-[#5C5953]">{doc.category}</div>
                    <div className="text-[12px] font-medium text-[#141413]">
                      {doc.brandId === 'ALL' ? 'BORNERS GROUP' : formatLabBrandLabel(doc.brandId)}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="font-mono font-medium text-[#141413] text-[13px]">{doc.uploadedAt}</div>
                    <div className="text-[12px] text-[#5C5953]">{doc.uploadedBy}</div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {isExcelNative ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDownloadExcel(doc)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#141413] text-white px-3.5 py-2 text-[12.5px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5 stroke-[1.5]" />
                            <span>Скачать Excel (.xlsx)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(doc)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] text-[#141413] px-3 py-2 text-[12.5px] font-medium hover:border-[#141413] transition cursor-pointer"
                          >
                            <FileText className="h-3.5 w-3.5 stroke-[1.5] text-[#5C5953]" />
                            <span>PDF</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(doc)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#141413] text-white px-3.5 py-2 text-[12.5px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
                          >
                            <FileText className="h-3.5 w-3.5 stroke-[1.5]" />
                            <span>Скачать PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadExcel(doc)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] text-[#141413] px-3 py-2 text-[12.5px] font-medium hover:border-[#141413] transition cursor-pointer"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5 stroke-[1.5] text-[#5C5953]" />
                            <span>Excel (.xlsx)</span>
                          </button>
                        </>
                      )}
                      {canEditThisDoc && (
                        <button
                          type="button"
                          onClick={() => archiveEntity('document', doc.id)}
                          title="Удалить в корзину"
                          className="h-9 w-9 rounded-lg border border-[#E4E1DA] hover:border-[#C94B4B] text-[#5C5953] hover:text-[#C94B4B] inline-flex items-center justify-center cursor-pointer transition"
                        >
                          <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
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

      {modalOpen && (
        <div
          onClick={() => setModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-[20px] font-semibold text-[#141413] border-b border-[#E4E1DA] pb-4 tracking-[-0.02em]">
              Загрузка документов и привязка к карточке
            </h3>
            <div className="space-y-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Название документа</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Например: Техническое задание и табель мер лекала"
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">Категория</label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as DocumentCategory })
                    }
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] bg-white text-[#141413] capitalize"
                  >
                    {DOC_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">Бренд</label>
                  <select
                    value={form.brandId}
                    onChange={(e) => setForm({ ...form, brandId: e.target.value })}
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] bg-white text-[#141413]"
                  >
                    {editableDocBrandOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">
                    Привязать к карточке R&amp;D (опционально)
                  </label>
                  <select
                    value={form.conceptId}
                    onChange={(e) => setForm({ ...form, conceptId: e.target.value })}
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 text-[13px] bg-white text-[#141413]"
                  >
                    <option value="">Без привязки к R&amp;D</option>
                    {visibleConcepts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">
                    Привязать к артикулу SKU (опционально)
                  </label>
                  <select
                    value={form.productId}
                    onChange={(e) => setForm({ ...form, productId: e.target.value })}
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 text-[13px] bg-white text-[#141413]"
                  >
                    <option value="">Без привязки к SKU</option>
                    {visibleCatalogProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">
                  Выбрать один или сразу несколько файлов (PDF, XLSX, DOCX, PNG, SVG)
                </label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files || files.length === 0) return;
                    if (files.length > 1) {
                      handleMultiFileUpload(files);
                      setModalOpen(false);
                      return;
                    }
                    const file = files[0];
                    const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
                    const reader = new FileReader();
                    reader.onload = () => {
                      setForm((prev) => ({
                        ...prev,
                        title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
                        fileName: file.name,
                        fileType: ext,
                        fileSizeBytes: file.size || 245000,
                        dataUrl: typeof reader.result === 'string' ? reader.result : '',
                      }));
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="w-full text-[13px] text-[#5C5953] mb-3"
                />
                <label className="block font-medium text-[#5C5953] mb-1.5">Имя файла в реестре</label>
                <input
                  value={form.fileName}
                  onChange={(e) => setForm({ ...form, fileName: e.target.value })}
                  placeholder="BORNERS_Spec_2027.pdf"
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] font-mono text-[#141413]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setModalOpen(false)}
                className="h-10 px-5 rounded-xl border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!form.title.trim()) return;
                  createDocument({
                    title: form.title.trim(),
                    category: form.category,
                    brandId: form.brandId,
                    fileName: form.fileName || 'Document_2027.pdf',
                    fileType: form.fileType || 'PDF',
                    fileSizeBytes: form.fileSizeBytes || 2450000,
                    dataUrl: form.dataUrl || undefined,
                    conceptId: form.conceptId || undefined,
                    productId: form.productId || undefined,
                    tags: [form.category],
                    isFinancialRestricted: form.isFinancialRestricted,
                    minRole: 'Viewer',
                    isDemo: false,
                  });
                  setModalOpen(false);
                }}
                className="h-10 px-6 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// КОМАНДА И ДОСТУП (п. 14, 15 ТЗ: БЕЗ КОЛОНКИ «ПЕРЕКЛЮЧИТЬСЯ»)
// =============================================================================
export function TeamView() {
  const {
    brands,
    users,
    currentUser,
    updateUserRoleOrPermissions,
    auditLog,
  } = usePlatform();

  const canManageUsers = currentUser.role === 'Owner' || currentUser.role === 'Admin';

  const toggleBrandAccess = (userId: string, currentBrands: string[], targetBrand: string) => {
    if (!canManageUsers) return;
    const exists = currentBrands.includes(targetBrand);
    const nextBrands = exists
      ? currentBrands.filter((b) => b !== targetBrand)
      : [...currentBrands, targetBrand];
    if (nextBrands.length === 0) return;
    updateUserRoleOrPermissions(userId, { assignedBrandIds: nextBrands });
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Архитектурная шапка команды */}
      <div className="rounded-xl bg-white border border-[#E4E1DA] p-5 md:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#5C5953]">
            04 · Финансы и документы · Матрица прав доступа ({users.length} участников)
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#141413] mt-0.5">
            Команда и роли доступа
          </h1>
        </div>

        <div className="text-[12.5px] font-medium rounded-xl border border-[#E4E1DA] bg-[#FAF9F6] text-[#141413] px-3.5 py-2">
          Профиль: <span className="font-semibold">{currentUser.fullName}</span> ({ROLE_LABELS_RU[currentUser.role]})
        </div>
      </div>

      {/* Крупная таблица участников без колонки «Переключиться» */}
      <div className="bg-white rounded-xl border border-[#E4E1DA] overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead className="border-b border-[#E4E1DA] text-[12px] font-medium uppercase tracking-wider text-[#5C5953] bg-[#FAF9F6]">
            <tr>
              <th className="py-3.5 px-6">Сотрудник / Партнёр</th>
              <th className="py-3.5 px-4">Системная роль</th>
              <th className="py-3.5 px-4">Доступ к брендам</th>
              <th className="py-3.5 px-4">Финансы и P&L</th>
              <th className="py-3.5 px-4">Себестоимость (COGS)</th>
              <th className="py-3.5 px-6 text-right">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E1DA]">
            {users.map((u) => {
              const isCurrent = u.id === currentUser.id;
              return (
                <tr
                  key={u.id}
                  className={
                    isCurrent
                      ? 'bg-[#FAF9F6]'
                      : 'hover:bg-[#FAF9F6] transition'
                  }
                >
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3.5">
                      <span className="h-9 w-9 rounded-lg bg-[#141413] text-white flex items-center justify-center text-[13px] font-mono font-medium shrink-0">
                        {u.avatarInitials}
                      </span>
                      <div>
                        <div className="font-semibold text-[15px] text-[#141413] flex items-center gap-2">
                          <span>{u.fullName}</span>
                          {isCurrent && (
                            <span className="rounded-md bg-white border border-[#E4E1DA] px-2 py-0.5 text-[10.5px] font-mono font-medium uppercase text-[#5C5953]">
                              Вы
                            </span>
                          )}
                        </div>
                        <div className="text-[12.5px] text-[#5C5953] mt-0.5">
                          {u.jobTitle} · <span className="font-mono">{u.email}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-4 px-4">
                    <select
                      disabled={!canManageUsers}
                      value={u.role}
                      onChange={(e) =>
                        updateUserRoleOrPermissions(u.id, {
                          role: e.target.value as UserRole,
                        })
                      }
                      className="h-9 rounded-xl border border-[#E4E1DA] px-3 text-[13px] font-medium bg-white text-[#141413] disabled:opacity-60 outline-none cursor-pointer"
                    >
                      <option value="Owner">Владелец</option>
                      <option value="Admin">Администратор</option>
                      <option value="Manager">Менеджер</option>
                      <option value="Viewer">Наблюдатель</option>
                      <option value="Partner">Партнёр</option>
                    </select>
                  </td>

                  <td className="py-4 px-4">
                    <div className="inline-flex flex-wrap items-center gap-1.5">
                      {brands.map((brand) => {
                        const active =
                          u.assignedBrandIds.includes('ALL') ||
                          u.assignedBrandIds.includes(brand.code) ||
                          u.assignedBrandIds.includes(brand.id);
                        return (
                          <button
                            key={brand.id}
                            type="button"
                            disabled={!canManageUsers}
                            onClick={() =>
                              toggleBrandAccess(u.id, u.assignedBrandIds, brand.code)
                            }
                            className={`px-2.5 py-1 rounded-lg text-[12px] font-medium border transition ${
                              active
                                ? 'bg-[#141413] text-white border-[#141413]'
                                : 'bg-white text-[#5C5953] border-[#E4E1DA]'
                            } ${
                              canManageUsers ? 'cursor-pointer hover:opacity-85' : 'cursor-default'
                            }`}
                          >
                            {brand.name}
                          </button>
                        );
                      })}
                    </div>
                  </td>

                  <td className="py-4 px-4">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canManageUsers}
                        checked={u.canViewFinance}
                        onChange={(e) =>
                          updateUserRoleOrPermissions(u.id, {
                            canViewFinance: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-[#141413] cursor-pointer"
                      />
                      <span className="text-[13px] font-medium text-[#141413]">
                        {u.canViewFinance ? 'Разрешено' : 'Скрыто'}
                      </span>
                    </label>
                  </td>

                  <td className="py-4 px-4">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!canManageUsers}
                        checked={u.canViewCostPrice}
                        onChange={(e) =>
                          updateUserRoleOrPermissions(u.id, {
                            canViewCostPrice: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-[#141413] cursor-pointer"
                      />
                      <span className="text-[13px] font-medium text-[#141413]">
                        {u.canViewCostPrice ? 'Разрешено' : 'Скрыто'}
                      </span>
                    </label>
                  </td>

                  <td className="py-4 px-6 text-right">
                    <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[#16805D]">
                      <span className="h-2 w-2 rounded-full bg-[#16805D]" />
                      <span>Активен</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Справка по ролям и Журнал действий */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-xl border border-[#E4E1DA] p-6 space-y-4">
          <h3 className="text-[18px] font-semibold text-[#141413] border-b border-[#E4E1DA] pb-3 tracking-[-0.01em]">
            Матрица полномочий
          </h3>
          <div className="space-y-3 text-[13.5px] text-[#5C5953] leading-relaxed">
            <div>
              <b className="text-[#141413] font-medium">Владелец и Администратор:</b> полный доступ ко всем разделам, утверждение стратегий и управление ролями.
            </div>
            <div>
              <b className="text-[#141413] font-medium">Менеджер:</b> управление каталогом, R&D и запусками; утверждённые блоки стратегии защищены от изменений.
            </div>
            <div>
              <b className="text-[#141413] font-medium">Наблюдатель и Партнёр:</b> без доступа к разделу «Финансы», себестоимости (COGS) и маржинальности.
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E4E1DA] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#E4E1DA] pb-3">
            <h3 className="text-[18px] font-semibold text-[#141413] tracking-[-0.01em]">Журнал действий</h3>
            <span className="text-[12.5px] font-mono text-[#5C5953]">
              Записей: {auditLog.length}
            </span>
          </div>
          <div className="divide-y divide-[#E4E1DA] max-h-72 overflow-y-auto text-[13.5px]">
            {auditLog.slice(0, 12).map((entry) => (
              <div
                key={entry.id}
                className="py-3 flex items-center justify-between gap-4"
              >
                <div className="truncate">
                  <b className="text-[#141413] font-medium">{entry.actorName}</b>{' '}
                  <span className="text-[#5C5953]">({ROLE_LABELS_RU[entry.actorRole]})</span> —{' '}
                  <span className="text-[#5C5953]">{entry.summary}</span>
                </div>
                <span className="text-[12px] font-mono text-[#5C5953] shrink-0">
                  {entry.createdAt}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// НАСТРОЙКИ СИСТЕМЫ (п. 16 ТЗ — БЕЗ ТЁМНОЙ ТЕМЫ)
// =============================================================================
export function SettingsView() {
  const {
    currentUser,
    users,
    brands,
    strategies,
    documents,
    products,
    concepts,
    launches,
    campaigns,
    experiments,
    financialPlans,
    projects,
    tasks,
    competitors,
    opportunities,
    research,
    strategicGoals,
    miroItems,
    auditLog,
    deletedConceptIds,
    presentationOverrides,
    restorePlatformBackupState,
    updateBrandPalette,
    resetToDemoDefaults,
    navigateTo,
    setPlatformMode,
    notify,
  } = usePlatform();

  const isOwnerOrAdmin =
    currentUser.role === 'Owner' || currentUser.role === 'Admin';
  const canExportFullFinancialExcel =
    canUserViewFinance(currentUser) && canUserViewCostPrice(currentUser);

  const livePortfolio = useLiveScenarioPortfolio();

  const mergedCatalogProducts = useMemo(
    () =>
      buildLiveCatalogProductsForExport(
        livePortfolio.models,
        livePortfolio.scenarios,
        livePortfolio.selectedScenarioByBrand,
        livePortfolio.currentScenario,
        products
      ),
    [
      livePortfolio.models,
      livePortfolio.scenarios,
      livePortfolio.selectedScenarioByBrand,
      livePortfolio.currentScenario,
      products,
    ]
  );

  const {
    draftModules,
    toggleDraftModule,
    setAllDraftModules,
    enabledCount,
    totalCount,
  } = useDraftModules();

  return (
    <div className="space-y-6 pb-20">
      <div className="rounded-xl bg-white border border-[#E4E1DA] p-5 md:p-6">
        <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#5C5953]">
          Администрирование · Черновик разделов и резервное копирование
        </div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#141413] mt-0.5">
          Настройки системы · BORNERS GROUP
        </h1>
      </div>

      {/* АДМИНКА: ЧЕРНОВИК РАЗДЕЛОВ И ИНСТРУМЕНТОВ */}
      {isOwnerOrAdmin && (
        <div className="bg-white rounded-xl border border-[#E4E1DA] p-6 md:p-7 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E1DA] pb-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#5C5953] font-medium">
                <span>АДМИНКА · ЧЕРНОВИК ИНСТРУМЕНТОВ ({enabledCount} из {totalCount} включено)</span>
              </div>
              <h2 className="text-[20px] font-semibold text-[#141413] tracking-[-0.02em]">
                Скрытые разделы в черновике (управление видимостью меню)
              </h2>
              <p className="text-[13.5px] text-[#5C5953] max-w-3xl leading-relaxed">
                В основном рабочем меню оставлены только 7 ключевых разделов («Главная», «Сценарии роста», «Модели (SKU)», «План продаж», «Производство», «Закупки», «Документы»). Любой дополнительный инструмент из черновика можно вернуть в меню или открыть в 1 клик.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAllDraftModules(true);
                  notify('success', 'Все разделы из черновика возвращены в меню');
                }}
                className="h-9 px-3.5 rounded-xl bg-[#141413] text-white text-[12.5px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
              >
                Вернуть все (<span className="font-mono">{totalCount}</span>)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAllDraftModules(false);
                  notify('success', 'Дополнительные разделы скрыты в черновик (оставлены 7 базовых)');
                }}
                className="h-9 px-3.5 rounded-xl border border-[#E4E1DA] bg-[#FAF9F6] text-[#141413] text-[12.5px] font-medium hover:border-[#141413] transition cursor-pointer"
              >
                Оставить только 7 базовых
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {DRAFT_MODULES_META.map((item) => {
              const isEnabled = draftModules[item.key];
              return (
                <div
                  key={item.key}
                  className={`rounded-xl border p-4 flex items-start justify-between gap-4 transition ${
                    isEnabled
                      ? 'bg-white border-[#141413]'
                      : 'bg-[#FAF9F6] border-[#E4E1DA]'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-[#141413]">
                        {item.title}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10.5px] font-medium ${
                          isEnabled
                            ? 'bg-[#16805D] text-white'
                            : 'bg-[#EFEDE8] text-[#5C5953]'
                        }`}
                      >
                        {isEnabled ? 'В меню' : 'В черновике'}
                      </span>
                    </div>
                    <p className="text-[12.5px] text-[#5C5953] leading-snug">
                      {item.subtitle}
                    </p>
                    {item.sectionId && (
                      <button
                        type="button"
                        onClick={() => navigateTo(item.sectionId!)}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#141413] hover:underline pt-1 cursor-pointer"
                      >
                        <span>Открыть раздел без включения в меню →</span>
                      </button>
                    )}
                    {item.key === 'strategyPresentationCard' && (
                      <button
                        type="button"
                        onClick={() => setPlatformMode('strategy')}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#141413] hover:underline pt-1 cursor-pointer"
                      >
                        <span>Открыть презентацию 8 слайдов →</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleDraftModule(item.key)}
                    className={`shrink-0 h-8 px-3 rounded-lg text-[12px] font-medium transition cursor-pointer ${
                      isEnabled
                        ? 'bg-[#141413] text-white hover:bg-[#2A2927]'
                        : 'bg-white border border-[#E4E1DA] text-[#141413] hover:border-[#141413]'
                    }`}
                  >
                    {isEnabled ? 'Скрыть' : 'Вернуть'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Корпоративный домен BORNERS GROUP */}
      <div className="bg-white rounded-xl border border-[#E4E1DA] p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#5C5953] font-medium">
            ОФИЦИАЛЬНЫЙ ДОМЕН ПЛАТФОРМЫ
          </div>
          <div className="text-[19px] font-semibold text-[#141413] tracking-[-0.01em]">
            Borners Group · <span className="font-mono text-[#16805D]">borners-group.ru</span>
          </div>
          <div className="text-[13px] text-[#5C5953]">
            Единый защищённый контур управления портфелем 5 брендов: BORNERS, НА ТЕЛЕ, AKUSHA, LISKANI и FUKAI (2026–2027)
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#E4E1DA] text-[12px] font-mono font-medium text-[#16805D]">
            ✓ Домен borners-group.ru активен
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-[#E4E1DA] p-6 space-y-5">
          <h3 className="text-[18px] font-semibold text-[#141413] border-b border-[#E4E1DA] pb-3 tracking-[-0.01em]">
            Акцентные цвета брендов
          </h3>

          <div className="divide-y divide-[#E4E1DA]">
            {brands.map((brand) => (
              <div
                key={brand.id}
                className="py-3.5 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="text-[15px] font-semibold text-[#141413]">
                    {brand.name}
                  </div>
                  <div className="text-[12.5px] text-[#5C5953] font-mono">{brand.accentColor}</div>
                </div>
                <input
                  type="color"
                  disabled={!isOwnerOrAdmin}
                  value={brand.accentColor}
                  onChange={(e) => {
                    if (!isOwnerOrAdmin) return;
                    updateBrandPalette(brand.id, e.target.value, brand.secondaryColor);
                  }}
                  className="h-9 w-14 rounded-lg border border-[#E4E1DA] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#E4E1DA] p-6 space-y-5">
          <div className="border-b border-[#E4E1DA] pb-4">
            <h3 className="text-[18px] font-semibold text-[#141413] tracking-[-0.01em]">
              Резервное копирование и выгрузка базы
            </h3>
            <p className="text-[13px] text-[#5C5953] mt-1">
              {isSupabaseConfigured
                ? 'Синхронизация с облачной базой Supabase активна'
                : 'Автосохранение изменений в хранилище браузера активно'}
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-[13.5px] text-[#5C5953] leading-relaxed">
              Вы можете выгрузить сводную финансовую и продуктовую ведомость в формате таблицы Excel (<code className="font-mono text-[12px] text-[#141413]">.xlsx</code>), сохранить полный снимок базы в JSON или вернуть демонстрационные данные к исходному состоянию.
            </p>

            <div className="flex flex-wrap gap-2.5 pt-2">
              {canExportFullFinancialExcel && (
                <button
                  type="button"
                  onClick={() => {
                    const finDoc = documents.find((d) => d.id === 'doc-3') || {
                      id: 'doc-3',
                      title: 'Финансовая модель и каталог SKU BORNERS GROUP 2027',
                      category: 'финансы' as const,
                      fileName: `BORNERS_GROUP_Сводная_База_${new Date().toISOString().slice(0, 10)}.xlsx`,
                      fileType: 'XLSX',
                      fileSizeBytes: 1850000,
                      brandId: 'ALL',
                      tags: [],
                      isFinancialRestricted: true,
                      minRole: 'Manager' as const,
                      uploadedBy: 'Система',
                      uploadedAt: new Date().toISOString().slice(0, 10),
                      isDemo: false,
                      isArchived: false,
                    };
                    exportDocumentAsExcel(finDoc, {
                      products: mergedCatalogProducts.filter((p) =>
                        canUserViewBrandConcept(
                          currentUser,
                          normalizeLabBrandCode(p.brandId)
                        )
                      ),
                      concepts: concepts.filter((c) =>
                        canUserViewBrandConcept(
                          currentUser,
                          normalizeLabBrandCode(c.brandId)
                        )
                      ),
                      financialPlans,
                      canViewCostPrice: canUserViewCostPrice(currentUser),
                      canViewFinance: canUserViewFinance(currentUser),
                    });
                    notify(
                      'success',
                      'Сводная таблица Excel (.xlsx) выгружена',
                      `В выгрузку включено ${mergedCatalogProducts.length} позиций каталога всех 5 брендов.`
                    );
                  }}
                  className="inline-flex items-center gap-2 h-10 rounded-xl bg-[#141413] text-white px-4 text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4 stroke-[1.5]" />
                  <span>Скачать сводную базу Excel (.xlsx)</span>
                </button>
              )}

              {isOwnerOrAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const payload = buildFullPlatformBackupBundle({
                          scenarios: livePortfolio.scenarios,
                          models: livePortfolio.models,
                          selectedScenarioByBrand: livePortfolio.selectedScenarioByBrand,
                          includeGroupPortfolioInS1: livePortfolio.includeGroupPortfolioInS1,
                          productGroups: safeGetStorageJson('borners_product_groups_v1'),
                          platformState: {
                            users,
                            brands,
                            strategies,
                            concepts,
                            products,
                            launches,
                            campaigns,
                            experiments,
                            financialPlans,
                            projects,
                            tasks,
                            documents,
                            competitors,
                            opportunities,
                            research,
                            strategicGoals,
                            miroItems,
                            auditLog,
                            deletedConceptIds,
                            presentationOverrides,
                          },
                        });
                        const blob = new Blob([JSON.stringify(payload, null, 2)], {
                          type: 'application/json;charset=utf-8',
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `BORNERS_GROUP_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
                        notify(
                          'success',
                          '✓ Полная резервная копия JSON скачана',
                          `Сохранены ${livePortfolio.models.length} SKU, сценарии 2027, товарные группы и Лаборатория R&D (${concepts.length}).`
                        );
                      } catch {
                        notify('error', 'Ошибка сохранения резервной копии JSON');
                      }
                    }}
                    className="inline-flex items-center gap-2 h-10 rounded-xl border border-[#E4E1DA] bg-[#FAF9F6] px-4 text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer"
                  >
                    <Download className="h-4 w-4 stroke-[1.5]" />
                    <span>Экспорт базы JSON</span>
                  </button>

                  <label className="inline-flex items-center gap-2 h-10 rounded-xl border border-[#E4E1DA] bg-[#FAF9F6] px-4 text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer">
                    <Upload className="h-4 w-4 stroke-[1.5]" />
                    <span>Импорт базы JSON</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        try {
                          const text = await file.text();
                          const parsed = parseFullPlatformBackupBundle(text);
                          if (!parsed.valid || !parsed.bundle) {
                            notify(
                              'error',
                              'Ошибка восстановления из файла',
                              parsed.error || 'Некорректный формат резервной копии JSON'
                            );
                            return;
                          }
                          const b = parsed.bundle;
                          applyPortfolioBackupSnapshotToStorage(b.models, b.scenarios);
                          for (const m of b.models) {
                            unmarkModelAsDeletedInStorage(m);
                            if (Array.isArray(m.gallery) && m.gallery.length > 0) {
                              await saveModelGalleryToIdb(m.id, m.gallery);
                            } else {
                              await deleteModelGalleryFromIdb(m.id);
                            }
                          }
                          const restoredIso = touchPortfolioUpdatedAt();
                          await savePortfolioSnapshotToIdb(b.models, restoredIso);
                          safeSetStorageJson(
                            STORAGE_KEY_SCENARIO_BY_BRAND,
                            b.selectedScenarioByBrand
                          );
                          if (typeof b.includeGroupPortfolioInS1 === 'boolean') {
                            safeSetStorageJson(
                              STORAGE_KEY_S1_GROUP_PORTFOLIO,
                              b.includeGroupPortfolioInS1
                            );
                          }
                          if (b.productGroups !== undefined) {
                            safeSetStorageJson('borners_product_groups_v1', b.productGroups);
                            if (typeof window !== 'undefined') {
                              window.dispatchEvent(new Event('borners-product-groups-changed'));
                            }
                          }
                          livePortfolio.updateModelsBatch(() => b.models);
                          livePortfolio.updateScenariosBatch(() => b.scenarios);
                          if (b.platformState) {
                            restorePlatformBackupState(b.platformState);
                            await savePlatformRichStateToIdb(
                              (b.platformState.concepts as unknown[]) || [],
                              (b.platformState.miroItems as unknown[]) || [],
                              (b.platformState.documents as unknown[]) || []
                            );
                          }
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(new Event('borners-scenario-models-changed'));
                            window.dispatchEvent(new Event('borners-scenarios-changed'));
                            window.dispatchEvent(new Event('borners-active-scenario-changed'));
                          }
                          const byBrandRecord: Record<string, number | null> = {};
                          for (const [k, v] of Object.entries(b.selectedScenarioByBrand || {})) {
                            if (v === null || typeof v === 'number') {
                              byBrandRecord[k] = v;
                            }
                          }
                          void pushPortfolioCoreToSupabase({
                            models: b.models,
                            scenarios: b.scenarios,
                            selectedScenarioByBrand: byBrandRecord,
                            includeGroupPortfolioInS1: b.includeGroupPortfolioInS1,
                            deletedModelIds: getDeletedModelsRegistry(),
                          });
                          notify(
                            'success',
                            '✓ Резервная копия JSON восстановлена',
                            `Загружено ${b.models.length} карточек SKU, сценарии 2027 и данные Лаборатории R&D.`
                          );
                        } catch {
                          notify('error', 'Не удалось импортировать резервную копию JSON');
                        }
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Сбросить внесённые изменения к начальным демонстрационным данным?'
                        )
                      ) {
                        resetToDemoDefaults();
                      }
                    }}
                    className="inline-flex items-center gap-2 h-10 rounded-xl border border-[#C94B4B]/40 text-[#C94B4B] hover:bg-[#C94B4B] hover:text-white px-4 text-[13px] font-medium transition cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4 stroke-[1.5]" />
                    <span>Сбросить демо-данные</span>
                  </button>
                </>
              )}

              {!canExportFullFinancialExcel && !isOwnerOrAdmin && (
                <div className="rounded-xl border border-[#E4E1DA] bg-[#FAF9F6] px-4 py-3 text-[13px] text-[#5C5953]">
                  Выгрузка полных финансовых таблиц, резервное копирование JSON и сброс демо-базы доступны ролям Owner и Admin.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
