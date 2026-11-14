'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Edit3,
  Lock,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import { ApprovalStatus, BrandFilter, StrategyBlock } from '@/types/platform';
import {
  canUserAccessSection,
  canUserEditApprovedStrategy,
  canUserEditBrand,
  canUserViewBrandConcept,
  canUserViewCostPrice,
  canUserViewFinance,
  formatCompactRub,
} from '@/lib/finance';
import { GrowthScenariosShowcase } from './GrowthScenariosShowcase';
import { useDraftModules } from '@/lib/draftModules';
import { resolvePublicAssetUrl } from '@/lib/scenarioData';
import { normalizeLabBrandCode } from '@/lib/rndCatalogSync';
import { INITIAL_STRATEGIES } from '@/lib/initial-strategies';
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';
import {
  computeMultiBrandPortfolioSummary,
  matchesBrandFilter,
} from '@/lib/unifiedBusinessEngine';

const HOLDING_BRAND_TABS = [
  {
    code: 'BORNERS' as const,
    label: 'BORNERS',
    segment: 'Масс-маркет+ · Мужское и унисекс бельё',
    tagline: 'Инженерный комфорт на каждый день в мультипаках 3–6 шт.',
    description:
      'Флагманский бренд мужского и унисекс базового белья, тканых поплиновых боксеров и подарочных наборов.',
    targetMarginPct: 72,
    heroImage: 'images/products/borners-editorial-hero.jpg',
    accentColor: '#141413',
  },
  {
    code: 'NA_TELE' as const,
    label: 'НА ТЕЛЕ',
    segment: 'Премиум · Бесшовная архитектура «второй кожи»',
    tagline: 'Тактильный минимализм, лазерный край Free-Cut и палитра Skin Tone',
    description:
      'Женская бесшовная капсула из микромодала Lenzing Air с невидимой посадкой и кашированной упаковкой.',
    targetMarginPct: 75,
    heroImage: 'images/products/natele-editorial-hero.jpg',
    accentColor: '#7D7268',
  },
  {
    code: 'AKUSHA' as const,
    label: 'AKUSHA',
    segment: 'Детская анатомическая и босоногая обувь',
    tagline: 'Широкий анатомический мыс, подошва zero-drop и натуральные материалы',
    description:
      '24 всесезонные карточки (31 цветомодель) детской обуви размеров 18–31: пинетки, сандалии, кроссовки, ботинки и дутики.',
    targetMarginPct: 65,
    heroImage: 'images/products/borners-editorial-hero.jpg',
    accentColor: '#5C5953',
  },
  {
    code: 'LISKANI' as const,
    label: 'LISKANI',
    segment: 'Домашний текстиль и интерьерные шторы',
    tagline: 'Готовые интерьерные шторы блэкаут, бархат и тюль отельного качества пошива',
    description:
      '33 базовые карточки, развёрнутые в 269 размерных SKU по ширине и высоте под стандартные и панорамные потолки.',
    targetMarginPct: 62,
    heroImage: 'images/products/natele-editorial-hero.jpg',
    accentColor: '#6E6A63',
  },
  {
    code: 'FUKAI' as const,
    label: 'FUKAI',
    segment: 'Функциональный текстиль и аксессуары для сна',
    tagline: 'Тактильные аксессуары для глубокого сна и восстановления',
    description:
      'Действующая линейка товаров для сна с высокой оборачиваемостью, высоким процентом выкупа (85%+) и компактной логистикой ФБО.',
    targetMarginPct: 68,
    heroImage: 'images/products/borners-editorial-hero.jpg',
    accentColor: '#3A3835',
  },
] as const;

type HoldingBrandCode = (typeof HOLDING_BRAND_TABS)[number]['code'];
const HOLDING_BRAND_CODES: readonly HoldingBrandCode[] = HOLDING_BRAND_TABS.map((b) => b.code);

const STATUS_LABELS: Record<ApprovalStatus, { label: string; dotColor: string }> = {
  draft: {
    label: 'Черновик',
    dotColor: 'bg-[#8A857D]',
  },
  in_review: {
    label: 'На согласовании',
    dotColor: 'bg-amber-600',
  },
  approved: {
    label: 'Утверждено',
    dotColor: 'bg-emerald-600',
  },
};

export function BrandPortfolioView() {
  const {
    brands,
    products,
    concepts,
    launches,
    currentUser,
    platformMode,
    navigateTo,
    setBrandFilter,
    createBrand,
  } = usePlatform();

  const [showNewBrandModal, setShowNewBrandModal] = useState(false);
  const [newBrandForm, setNewBrandForm] = useState({
    code: '',
    name: '',
    tagline: '',
    segment: 'Премиум-капсула',
    accentColor: '#141413',
  });

  const hasFinance = canUserViewFinance(currentUser);
  const hasCost = canUserViewCostPrice(currentUser);
  const canCreateBrand =
    platformMode === 'management' &&
    (currentUser.role === 'Owner' || currentUser.role === 'Admin');

  const livePortfolio = useLiveScenarioPortfolio();
  const multiBrandSummary = useMemo(
    () =>
      computeMultiBrandPortfolioSummary(
        livePortfolio.models,
        livePortfolio.scenarios,
        livePortfolio.selectedScenarioByBrand
      ),
    [
      livePortfolio.models,
      livePortfolio.scenarios,
      livePortfolio.selectedScenarioByBrand,
    ]
  );

  const portfolioBrandCards = useMemo(() => {
    const coreCards = HOLDING_BRAND_TABS.map((meta) => {
      const ctxBrand = brands.find(
        (b) => normalizeLabBrandCode(b.code) === meta.code || b.id === meta.code
      );
      const liveRow = multiBrandSummary.brands.find((r) => r.brandCode === meta.code);
      const firstLiveModel = livePortfolio.models.find(
        (m) =>
          m.launchStatus !== 'В архиве' &&
          matchesBrandFilter(m, meta.code) &&
          Boolean(m.gallery?.[0]?.url)
      );
      const heroImage =
        (ctxBrand?.heroImage && !ctxBrand.isStrategyInDevelopment
          ? ctxBrand.heroImage
          : firstLiveModel?.gallery?.[0]?.url) ||
        meta.heroImage;
      const legacyProducts = products.filter(
        (p) => !p.isArchived && normalizeLabBrandCode(p.brandId) === meta.code
      );
      const skuCount =
        liveRow && liveRow.modelsCount > 0 ? liveRow.modelsCount : legacyProducts.length;
      const plannedRevenue2027Rub =
        liveRow && liveRow.annualRevenueRub > 0
          ? liveRow.annualRevenueRub
          : ctxBrand?.plannedRevenue2027Rub || 0;
      const bConcepts = concepts.filter(
        (c) => !c.isArchived && normalizeLabBrandCode(c.brandId) === meta.code
      );
      const bLaunches = launches.filter(
        (l) => !l.isArchived && normalizeLabBrandCode(l.brandId) === meta.code
      );

      return {
        id: ctxBrand?.id || `brand-${meta.code.toLowerCase()}`,
        code: meta.code as BrandFilter,
        name: meta.label,
        segment: ctxBrand?.segment || meta.segment,
        tagline: ctxBrand?.tagline || meta.tagline,
        description: ctxBrand?.description || meta.description,
        targetMarginPct: ctxBrand?.targetMarginPct || meta.targetMarginPct,
        heroImage,
        accentColor: meta.accentColor,
        plannedRevenue2027Rub,
        skuCount,
        rndCount: bConcepts.length,
        launchesCount: bLaunches.length,
      };
    });

    const extraCustomBrands = brands
      .filter(
        (b) =>
          !b.isStrategyInDevelopment &&
          !(HOLDING_BRAND_CODES as readonly string[]).includes(
            normalizeLabBrandCode(b.code)
          )
      )
      .map((b) => {
        const bProducts = products.filter(
          (p) => !p.isArchived && (p.brandId === b.code || p.brandId === b.id)
        );
        const bConcepts = concepts.filter(
          (c) => !c.isArchived && (c.brandId === b.code || c.brandId === b.id)
        );
        const bLaunches = launches.filter(
          (l) => !l.isArchived && (l.brandId === b.code || l.brandId === b.id)
        );
        return {
          id: b.id,
          code: b.code as BrandFilter,
          name: b.name,
          segment: b.segment,
          tagline: b.tagline,
          description: b.description,
          targetMarginPct: b.targetMarginPct,
          heroImage: b.heroImage,
          accentColor: '#141413',
          plannedRevenue2027Rub: b.plannedRevenue2027Rub,
          skuCount: bProducts.length,
          rndCount: bConcepts.length,
          launchesCount: bLaunches.length,
        };
      });

    return [...coreCards, ...extraCustomBrands].filter((card) =>
      canUserViewBrandConcept(currentUser, normalizeLabBrandCode(String(card.code)))
    );
  }, [
    brands,
    concepts,
    currentUser,
    launches,
    livePortfolio.models,
    multiBrandSummary.brands,
    products,
  ]);

  return (
    <div className="space-y-6 pb-20">
      {/* Архитектурная шапка портфеля брендов */}
      <div className="rounded-2xl bg-white border border-[#E4E1DA] p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-[#5C5953]">
            Сводка и стратегия · {portfolioBrandCards.length} активных брендов холдинга · План 2027:{' '}
            {hasFinance ? formatCompactRub(multiBrandSummary.groupTotal.annualRevenueRub) : 'Скрыто'}
          </div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[#141413] mt-1">
            ДНК и стратегия брендов
          </h1>
        </div>

        {canCreateBrand && (
          <button
            onClick={() => setShowNewBrandModal(true)}
            className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-[#141413] text-white px-4 text-[13px] font-medium hover:bg-[#2A2A28] transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 stroke-[1.5]" />
            <span>Добавить бренд</span>
          </button>
        )}
      </div>

      {/* Крупные лукбук-карточки всех 5 активных брендов холдинга */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {portfolioBrandCards.map((brand, bIdx) => {
          return (
            <div
              key={brand.id}
              className="bg-white rounded-2xl border border-[#E4E1DA] hover:border-[#141413] transition-colors overflow-hidden flex flex-col justify-between h-full"
            >
              <div>
                {/* Студийный кадр коллекции фиксированной высоты h-60 */}
                <div className="relative h-60 w-full bg-[#F6F5F2] border-b border-[#E4E1DA] overflow-hidden">
                  <img
                    src={resolvePublicAssetUrl(brand.heroImage)}
                    alt={brand.name}
                    className="h-full w-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#141413]/70 via-[#141413]/15 to-transparent" />
                  <div className="absolute top-4 left-5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-white/95 text-[#141413] font-mono text-[10.5px] font-medium">
                      {String(bIdx + 1).padStart(2, '0')} · {brand.code}
                    </span>
                  </div>
                  <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between text-white">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-wider text-white/80">
                        {brand.segment}
                      </div>
                      <h2 className="text-[28px] font-semibold tracking-tight leading-none mt-1">
                        {brand.name}
                      </h2>
                    </div>
                    <span className="px-2.5 py-1 rounded-md bg-[#141413]/75 backdrop-blur-xs text-[11px] font-mono">
                      Маржа {hasFinance && hasCost ? `${brand.targetMarginPct}%` : 'Скрыто'}
                    </span>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  <div className="min-h-[116px]">
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#5C5953]">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: brand.accentColor }}
                      />
                      <span>Позиционирование</span>
                    </div>
                    <p className="text-[15px] text-[#141413] mt-1.5 font-medium leading-snug">
                      {brand.tagline}
                    </p>
                    <p className="text-[13.5px] text-[#5C5953] mt-2 leading-relaxed">
                      {brand.description}
                    </p>
                  </div>

                  {/* Ключевые показатели бренда */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#E4E1DA] pt-4 border-t border-[#E4E1DA]">
                    <div className="pr-3">
                      <div className="text-[11px] text-[#5C5953]">
                        План 2027
                      </div>
                      <div className="font-mono text-[18px] font-semibold text-[#141413] mt-0.5 tabular-nums">
                        {hasFinance
                          ? formatCompactRub(brand.plannedRevenue2027Rub)
                          : 'Скрыто'}
                      </div>
                    </div>
                    <div className="px-3">
                      <div className="text-[11px] text-[#5C5953]">
                        Целевая маржа
                      </div>
                      <div className="font-mono text-[18px] font-semibold text-[#141413] mt-0.5 tabular-nums">
                        {hasFinance && hasCost ? `${brand.targetMarginPct}%` : 'Скрыто'}
                      </div>
                    </div>
                    <div className="px-3">
                      <div className="text-[11px] text-[#5C5953]">
                        В каталоге
                      </div>
                      <div className="font-mono text-[18px] font-semibold text-[#141413] mt-0.5 tabular-nums">
                        {brand.skuCount} SKU
                      </div>
                    </div>
                    <div className="pl-3">
                      <div className="text-[11px] text-[#5C5953]">
                        R&D / Запуски
                      </div>
                      <div className="font-mono text-[18px] font-semibold text-[#141413] mt-0.5 tabular-nums">
                        {brand.rndCount} / {brand.launchesCount}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Действия — симметричная 3-кнопочная сетка */}
              <div className="grid grid-cols-3 divide-x divide-[#E4E1DA] bg-[#FAF9F6] border-t border-[#E4E1DA]">
                <button
                  onClick={() => {
                    try {
                      window.sessionStorage.setItem(
                        'borners_open_brand_passport',
                        String(brand.code)
                      );
                    } catch {
                      // ignore storage restriction
                    }
                    setBrandFilter(brand.code);
                    navigateTo('brand-strategy');
                  }}
                  className="h-11 px-3 bg-[#141413] text-white text-[12.5px] font-medium hover:bg-[#2A2A28] transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <span>Паспорт (14)</span>
                  <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.5]" />
                </button>
                <button
                  onClick={() => {
                    setBrandFilter(brand.code);
                    navigateTo('product-catalog');
                  }}
                  className="h-11 px-3 text-[#141413] text-[12.5px] font-medium hover:bg-[#EFEDE8] transition-colors cursor-pointer"
                >
                  Каталог ({brand.skuCount})
                </button>
                <button
                  onClick={() => {
                    setBrandFilter(brand.code);
                    navigateTo('product-lab');
                  }}
                  className="h-11 px-3 text-[#141413] text-[12.5px] font-medium hover:bg-[#EFEDE8] transition-colors cursor-pointer"
                >
                  R&D ({brand.rndCount})
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Сравнительная таблица разграничения брендов */}
      <div className="bg-white rounded-2xl border border-[#E4E1DA] overflow-x-auto">
        <div className="p-6 border-b border-[#E4E1DA]">
          <h3 className="text-[18px] font-semibold tracking-tight text-[#141413]">
            Разграничение ключевых капсул в портфеле группы
          </h3>
        </div>
        <table className="w-full text-left text-[14px]">
          <thead className="border-b border-[#E4E1DA] text-[12px] font-medium text-[#5C5953] bg-[#FAF9F6]">
            <tr>
              <th className="py-3.5 px-6">Критерий</th>
              <th className="py-3.5 px-6">BORNERS (Мужской и унисекс базовый)</th>
              <th className="py-3.5 px-6">НА ТЕЛЕ (Женский вторая кожа)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E4E1DA]">
            <tr>
              <td className="py-4 px-6 font-medium text-[#141413]">Роль продукта</td>
              <td className="py-4 px-6 text-[#5C5953]">
                Инженерная посадка, плотный модал 92% и пима-хлопок, долговечность 80+ стирок
              </td>
              <td className="py-4 px-6 text-[#5C5953]">
                Бесшовная лазерная обработка края (Free-cut), тактильная невесомость, 6 телесных оттенков
              </td>
            </tr>
            <tr>
              <td className="py-4 px-6 font-medium text-[#141413]">Ценовой коридор и маржа</td>
              <td className="py-4 px-6 font-mono font-medium text-[#141413]">
                1 690 – 4 990 ₽{hasCost ? ' · 72%' : ''}
              </td>
              <td className="py-4 px-6 font-mono font-medium text-[#141413]">
                1 490 – 4 490 ₽{hasCost ? ' · 75%' : ''}
              </td>
            </tr>
            <tr>
              <td className="py-4 px-6 font-medium text-[#141413]">Визуальный код</td>
              <td className="py-4 px-6 text-[#5C5953]">
                Строгий антрацит и тёплый камень, матовые тубусы и плотные зип-пакеты 180 мкм
              </td>
              <td className="py-4 px-6 text-[#5C5953]">
                Тёплый беж, макро-фактура ткани и кожи, калька и пудровый софт-тач
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Модальное окно создания нового бренда */}
      {showNewBrandModal && (
        <div
          onClick={() => setShowNewBrandModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 backdrop-blur-[2px] p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl"
          >
            <h3 className="text-[20px] font-semibold tracking-tight text-[#141413] border-b border-[#E4E1DA] pb-4">
              Добавление нового бренда
            </h3>
            <div className="space-y-4 text-[13.5px]">
              <div>
                <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Название бренда</label>
                <input
                  value={newBrandForm.name}
                  onChange={(e) =>
                    setNewBrandForm({
                      ...newBrandForm,
                      name: e.target.value,
                      code: e.target.value.toUpperCase().replace(/\s+/g, '_'),
                    })
                  }
                  placeholder="Например: BORNERS SPORT"
                  className="w-full h-10 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3.5 text-[14px] text-[#141413] focus:outline-none focus:border-[#141413]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Слоган и идея</label>
                <input
                  value={newBrandForm.tagline}
                  onChange={(e) => setNewBrandForm({ ...newBrandForm, tagline: e.target.value })}
                  className="w-full h-10 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3.5 text-[14px] text-[#141413] focus:outline-none focus:border-[#141413]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Ценовой сегмент</label>
                <input
                  value={newBrandForm.segment}
                  onChange={(e) => setNewBrandForm({ ...newBrandForm, segment: e.target.value })}
                  className="w-full h-10 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3.5 text-[14px] text-[#141413] focus:outline-none focus:border-[#141413]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setShowNewBrandModal(false)}
                className="h-10 px-4 rounded-lg border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:bg-[#FAF9F6] cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!newBrandForm.name.trim()) return;
                  createBrand({
                    code: newBrandForm.code || 'NEW_BRAND',
                    name: newBrandForm.name.trim(),
                    tagline: newBrandForm.tagline || 'Новое направление BORNERS GROUP',
                    segment: newBrandForm.segment,
                    accentColor: newBrandForm.accentColor,
                  });
                  setShowNewBrandModal(false);
                }}
                className="h-10 px-5 rounded-lg bg-[#141413] hover:bg-[#2A2A28] text-white text-[13px] font-medium cursor-pointer"
              >
                Создать бренд
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// СТРАТЕГИЯ БРЕНДА (14 СТРАТЕГИЧЕСКИХ БЛОКОВ, п. 5 ТЗ)
// =============================================================================
export function BrandStrategyView() {
  const {
    brands,
    strategies,
    currentUser,
    platformMode,
    setPlatformMode,
    brandFilter,
    setBrandFilter,
    updateStrategyBlock,
    navigateTo,
  } = usePlatform();

  const { draftModules } = useDraftModules();
  const visibleHoldingTabs = useMemo(
    () =>
      HOLDING_BRAND_TABS.filter((t) => canUserViewBrandConcept(currentUser, t.code)),
    [currentUser]
  );

  const [selectedBrand, setSelectedBrand] = useState<HoldingBrandCode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const pendingPassport = window.sessionStorage.getItem('borners_open_brand_passport');
        if (pendingPassport) {
          const normPending = normalizeLabBrandCode(pendingPassport);
          if (
            (HOLDING_BRAND_CODES as readonly string[]).includes(normPending) &&
            canUserViewBrandConcept(currentUser, normPending)
          ) {
            return normPending as HoldingBrandCode;
          }
        }
      } catch {
        // ignore
      }
    }
    if (brandFilter && brandFilter !== 'ALL') {
      const norm = normalizeLabBrandCode(brandFilter);
      if (
        (HOLDING_BRAND_CODES as readonly string[]).includes(norm) &&
        canUserViewBrandConcept(currentUser, norm)
      ) {
        return norm as HoldingBrandCode;
      }
    }
    return visibleHoldingTabs[0]?.code || 'BORNERS';
  });

  const [strategyTab, setStrategyTab] = useState<'scenarios' | 'dna'>(() => {
    if (typeof window !== 'undefined') {
      try {
        if (window.sessionStorage.getItem('borners_open_brand_passport')) {
          return 'dna';
        }
      } catch {
        // ignore
      }
    }
    return 'scenarios';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const pendingPassport = window.sessionStorage.getItem('borners_open_brand_passport');
        if (pendingPassport) {
          window.sessionStorage.removeItem('borners_open_brand_passport');
          const normPending = normalizeLabBrandCode(pendingPassport);
          if (
            (HOLDING_BRAND_CODES as readonly string[]).includes(normPending) &&
            canUserViewBrandConcept(currentUser, normPending)
          ) {
            setSelectedBrand(normPending as HoldingBrandCode);
          }
          setStrategyTab('dna');
          return;
        }
      } catch {
        // ignore
      }
    }
    if (brandFilter && brandFilter !== 'ALL') {
      const norm = normalizeLabBrandCode(brandFilter);
      if (
        (HOLDING_BRAND_CODES as readonly string[]).includes(norm) &&
        canUserViewBrandConcept(currentUser, norm)
      ) {
        setSelectedBrand(norm as HoldingBrandCode);
      }
    }
  }, [brandFilter, currentUser]);

  const activeBrand = useMemo(() => {
    const meta =
      HOLDING_BRAND_TABS.find((t) => t.code === selectedBrand) || HOLDING_BRAND_TABS[0];
    const ctxBrand = brands.find(
      (b) => normalizeLabBrandCode(b.code) === meta.code || b.id === meta.code
    );
    return {
      id: ctxBrand?.id || `brand-${meta.code.toLowerCase()}`,
      code: meta.code,
      name: meta.label,
      tagline: ctxBrand?.tagline || meta.tagline,
      targetMarginPct: ctxBrand?.targetMarginPct || meta.targetMarginPct,
    };
  }, [brands, selectedBrand]);

  const brandBlocks = useMemo(() => {
    const targetCode = selectedBrand;
    const matched = strategies
      .filter(
        (s) =>
          normalizeLabBrandCode(s.brandId) === targetCode ||
          s.brandId === activeBrand?.id
      )
      .sort((a, b) => a.sectionOrder - b.sectionOrder);
    if (matched.length > 0) return matched;
    return INITIAL_STRATEGIES.filter(
      (s) => normalizeLabBrandCode(s.brandId) === targetCode
    ).sort((a, b) => a.sectionOrder - b.sectionOrder);
  }, [strategies, selectedBrand, activeBrand]);

  const [editingBlock, setEditingBlock] = useState<StrategyBlock | null>(null);
  const [historyBlock, setHistoryBlock] = useState<StrategyBlock | null>(null);

  const [formState, setFormState] = useState<{
    summary: string;
    content: string;
    metricsText: string;
    status: ApprovalStatus;
    deadline: string;
    changeSummary: string;
  }>({
    summary: '',
    content: '',
    metricsText: '',
    status: 'draft',
    deadline: '2027-03-15',
    changeSummary: '',
  });

  if (!activeBrand) {
    return null;
  }

  const canEditThisBrand =
    platformMode === 'management' && canUserEditBrand(currentUser, activeBrand.code);
  const canEditApproved = canUserEditApprovedStrategy(currentUser);
  const hasCost = canUserViewCostPrice(currentUser);
  const canAccessStrategyDeck = canUserAccessSection(currentUser, 'brand-strategy');

  const openEditor = (block: StrategyBlock) => {
    setEditingBlock(block);
    setFormState({
      summary: block.summary,
      content: block.content,
      metricsText: block.kpiHighlights.map((m) => `${m.label}: ${m.value}`).join('\n'),
      status: block.status,
      deadline: block.deadline || '2027-03-15',
      changeSummary: '',
    });
  };

  const handleSaveBlock = () => {
    if (!editingBlock) return;
    const parsedMetrics = formState.metricsText
      .split('\n')
      .map((line) => {
        const idx = line.indexOf(':');
        if (idx === -1) return null;
        return {
          label: line.slice(0, idx).trim(),
          value: line.slice(idx + 1).trim(),
        };
      })
      .filter((x): x is { label: string; value: string } => x !== null && Boolean(x.label));

    updateStrategyBlock(
      editingBlock.id,
      {
        summary: formState.summary.trim() || editingBlock.summary,
        content: formState.content.trim() || editingBlock.content,
        kpiHighlights:
          parsedMetrics.length > 0 ? parsedMetrics : editingBlock.kpiHighlights,
        status: formState.status,
        deadline: formState.deadline || editingBlock.deadline,
      },
      formState.changeSummary.trim() || `Обновлён блок «${editingBlock.titleRu}»`
    );
    setEditingBlock(null);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Переключатель Сценариев роста и 14 блоков Паспорта бренда */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E4E1DA] pb-4">
        <div className="inline-flex rounded-xl bg-[#FAF9F6] p-1 border border-[#E4E1DA]">
          <button
            type="button"
            onClick={() => setStrategyTab('scenarios')}
            className={`h-9 px-4 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
              strategyTab === 'scenarios'
                ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                : 'text-[#5C5953] hover:text-[#141413]'
            }`}
          >
            Сценарии развития (100 / 150 / 200 млн ₽)
          </button>
          <button
            type="button"
            onClick={() => setStrategyTab('dna')}
            className={`h-9 px-4 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
              strategyTab === 'dna'
                ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                : 'text-[#5C5953] hover:text-[#141413]'
            }`}
          >
            Паспорт бренда (14 блоков)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {draftModules.strategyPresentationCard && canAccessStrategyDeck && (
            <button
              onClick={() => setPlatformMode('strategy')}
              className="h-9 px-4 rounded-lg bg-[#141413] text-white text-[12.5px] font-medium hover:bg-[#2A2A28] transition-colors cursor-pointer"
            >
              Презентация стратегии (8 слайдов)
            </button>
          )}

          <button
            onClick={() => navigateTo('product-catalog')}
            className="h-9 px-3.5 rounded-lg border border-[#E4E1DA] bg-white text-[12.5px] font-medium text-[#141413] hover:border-[#141413] transition-colors cursor-pointer"
          >
            Модели (SKU) →
          </button>
        </div>
      </div>

      {strategyTab === 'scenarios' ? (
        <GrowthScenariosShowcase />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white border border-[#E4E1DA] p-5">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#5C5953]">
                BRAND DNA ARCHITECTURE · 14 STRATEGIC BLOCKS
              </div>
              <h1 className="text-[22px] font-semibold text-[#141413] tracking-tight mt-0.5">
                Стратегия бренда: {activeBrand.name} (14 блоков ДНК)
              </h1>
              <p className="text-[13px] text-[#5C5953] mt-1">
                {activeBrand.tagline}
                {hasCost ? ` · целевая валовая маржа ${activeBrand.targetMarginPct}%` : ''}
              </p>
            </div>

            <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-[#FAF9F6] p-1 border border-[#E4E1DA]">
              {visibleHoldingTabs.map((tab) => {
                const isSelected = selectedBrand === tab.code;
                return (
                  <button
                    key={tab.code}
                    type="button"
                    onClick={() => {
                      setSelectedBrand(tab.code);
                      setBrandFilter(tab.code as BrandFilter);
                    }}
                    className={`h-8 px-3.5 rounded-md text-[12.5px] font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#141413] text-white'
                        : 'text-[#5C5953] hover:text-[#141413]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Сетка 14 блоков стратегии */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {brandBlocks.map((block, index) => {
              const st = STATUS_LABELS[block.status];
              const isLockedForManager = block.status === 'approved' && !canEditApproved;
              const canEditBlock = canEditThisBrand && !isLockedForManager;
              const bulletLines = block.content
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);

              return (
                <div
                  key={block.id}
                  className="bg-white rounded-xl border border-[#E4E1DA] hover:border-[#D2CEC4] transition-colors p-6 flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E1DA] pb-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex items-center justify-center h-6 px-2 rounded bg-[#FAF9F6] border border-[#E4E1DA] text-[11px] font-mono font-medium text-[#141413]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <h3 className="text-[18px] font-semibold tracking-tight text-[#141413]">
                          {block.titleRu}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {block.deadline && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAF9F6] border border-[#E4E1DA] text-[11px] font-mono text-[#5C5953]">
                            <span>Срок: {block.deadline}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#FAF9F6] border border-[#E4E1DA] text-[11px] font-medium text-[#141413]">
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
                          <span>{st.label}</span>
                        </span>

                        <button
                          onClick={() => setHistoryBlock(block)}
                          title="История версий"
                          className="rounded bg-[#FAF9F6] border border-[#E4E1DA] hover:border-[#141413] px-2 py-0.5 text-[11px] font-mono text-[#5C5953] hover:text-[#141413] cursor-pointer"
                        >
                          v{block.version}
                        </button>

                        {canEditBlock ? (
                          <button
                            onClick={() => openEditor(block)}
                            className="inline-flex items-center gap-1 rounded border border-[#E4E1DA] px-2.5 py-0.5 text-[11px] font-medium text-[#141413] hover:bg-[#141413] hover:text-white transition-colors cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3 stroke-[1.5]" />
                            <span>Изменить</span>
                          </button>
                        ) : (
                          isLockedForManager && (
                            <span
                              title="Утверждённый блок защищён от изменений"
                              className="inline-flex items-center gap-1 text-[11px] text-[#5C5953]"
                            >
                              <Lock className="h-3 w-3 stroke-[1.5]" />
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Ключевой тезис */}
                    <p className="text-[14.5px] font-medium text-[#141413] leading-snug">
                      {block.summary}
                    </p>

                    {/* Пункты содержания */}
                    <ul className="space-y-2 text-[13px] text-[#5C5953]">
                      {bulletLines.map((point, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                          <span className="text-[11px] font-mono text-[#8A857D] shrink-0 mt-0.5">
                            —
                          </span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Опорные показатели блока */}
                  <div className="pt-4 border-t border-[#E4E1DA] grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {block.kpiHighlights.map((m, idx) => (
                      <div key={idx} className="rounded-lg bg-[#FAF9F6] border border-[#E4E1DA] px-3.5 py-2.5">
                        <div className="text-[11.5px] text-[#5C5953] leading-snug">
                          {m.label}
                        </div>
                        <div className="font-mono text-[13.5px] font-semibold text-[#141413] mt-0.5 tabular-nums">
                          {m.value.replace(/\s*\(ДЕМО\)/gi, '')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ БЛОКА */}
      {editingBlock && (
        <div
          onClick={() => setEditingBlock(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 backdrop-blur-[2px] p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-2xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#E4E1DA] pb-4">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-[#5C5953]">
                  Редактирование блока стратегии ({activeBrand.name})
                </div>
                <h3 className="text-[20px] font-semibold tracking-tight text-[#141413] mt-1">
                  {editingBlock.titleRu}
                </h3>
              </div>
              <button
                onClick={() => setEditingBlock(null)}
                className="text-[13px] font-medium text-[#5C5953] hover:text-[#141413] cursor-pointer"
              >
                Закрыть
              </button>
            </div>

            <div className="space-y-4 text-[13.5px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Статус согласования</label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({ ...formState, status: e.target.value as ApprovalStatus })
                    }
                    className="w-full h-10 rounded-lg border border-[#E4E1DA] px-3.5 text-[14px] bg-[#FAF9F6] font-medium text-[#141413]"
                  >
                    <option value="draft">Черновик</option>
                    <option value="in_review">На согласовании</option>
                    {canEditApproved && <option value="approved">Утверждено</option>}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Дедлайн контрольной точки</label>
                  <input
                    type="date"
                    value={formState.deadline}
                    onChange={(e) => setFormState({ ...formState, deadline: e.target.value })}
                    className="w-full h-10 rounded-lg border border-[#E4E1DA] px-3.5 text-[14px] font-mono bg-[#FAF9F6] text-[#141413]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Главный тезис</label>
                <input
                  value={formState.summary}
                  onChange={(e) => setFormState({ ...formState, summary: e.target.value })}
                  className="w-full h-10 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3.5 text-[14px] text-[#141413] focus:outline-none focus:border-[#141413]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">
                  Положения стратегии (каждый пункт с новой строки)
                </label>
                <textarea
                  rows={5}
                  value={formState.content}
                  onChange={(e) => setFormState({ ...formState, content: e.target.value })}
                  className="w-full rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] p-3.5 text-[14px] text-[#141413] focus:outline-none focus:border-[#141413]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">
                  Показатели (формат «Показатель: Значение» с новой строки)
                </label>
                <textarea
                  rows={3}
                  value={formState.metricsText}
                  onChange={(e) =>
                    setFormState({ ...formState, metricsText: e.target.value })
                  }
                  className="w-full rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] p-3.5 text-[13.5px] font-mono text-[#141413] focus:outline-none focus:border-[#141413]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Комментарий к версии</label>
                <input
                  value={formState.changeSummary}
                  onChange={(e) =>
                    setFormState({ ...formState, changeSummary: e.target.value })
                  }
                  placeholder="Например: Уточнены ориентиры маржи на 2027 год"
                  className="w-full h-10 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3.5 text-[14px] text-[#141413] focus:outline-none focus:border-[#141413]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setEditingBlock(null)}
                className="h-10 px-4 rounded-lg border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:bg-[#FAF9F6] cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveBlock}
                className="h-10 px-5 rounded-lg bg-[#141413] hover:bg-[#2A2A28] text-white text-[13px] font-medium cursor-pointer"
              >
                Сохранить изменения
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ИСТОРИИ ВЕРСИЙ */}
      {historyBlock && (
        <div
          onClick={() => setHistoryBlock(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 backdrop-blur-[2px] p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#E4E1DA] pb-4">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-[#5C5953]">
                  История версий
                </div>
                <h3 className="text-[20px] font-semibold tracking-tight text-[#141413] mt-1">{historyBlock.titleRu}</h3>
              </div>
              <button
                onClick={() => setHistoryBlock(null)}
                className="text-[13px] font-medium text-[#5C5953] hover:text-[#141413] cursor-pointer"
              >
                Закрыть
              </button>
            </div>

            <div className="space-y-4 max-h-80 overflow-y-auto divide-y divide-[#E4E1DA]">
              {historyBlock.history.map((v, idx) => (
                <div key={idx} className="pt-4 first:pt-0 text-[13.5px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[14px] text-[#141413]">
                      <span className="font-mono">v{v.version}</span> · {v.authorName}
                    </span>
                    <span className="font-mono text-[12px] text-[#5C5953]">{v.updatedAt}</span>
                  </div>
                  <p className="text-[#5C5953]">{v.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
