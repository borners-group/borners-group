'use client';

import React, { useState, useMemo } from 'react';
import {
  Edit3,
  Lock,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import { ApprovalStatus, StrategyBlock } from '@/types/platform';
import {
  canUserEditApprovedStrategy,
  canUserEditBrand,
  canUserViewFinance,
  formatCompactRub,
} from '@/lib/finance';
import { GrowthScenariosShowcase } from './GrowthScenariosShowcase';
import { useDraftModules } from '@/lib/draftModules';
import { resolvePublicAssetUrl } from '@/lib/scenarioData';
import { normalizeLabBrandCode } from '@/lib/rndCatalogSync';
import { INITIAL_STRATEGIES } from '@/lib/initial-strategies';

const STATUS_LABELS: Record<ApprovalStatus, { label: string; dotColor: string }> = {
  draft: {
    label: 'Черновик',
    dotColor: 'bg-[#737373]',
  },
  in_review: {
    label: 'На согласовании',
    dotColor: 'bg-[#D99527]',
  },
  approved: {
    label: 'Утверждено',
    dotColor: 'bg-[#16805D]',
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
    accentColor: '#D97745',
  });

  const hasFinance = canUserViewFinance(currentUser);
  const canCreateBrand =
    platformMode === 'management' &&
    (currentUser.role === 'Owner' || currentUser.role === 'Admin');

  const activeBrands = brands.filter((b) => !b.isStrategyInDevelopment);
  const upcomingBrands = brands.filter((b) => b.isStrategyInDevelopment);

  return (
    <div className="space-y-6 pb-20">
      {/* Архитектурная шапка портфеля брендов */}
      <div className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 flex flex-wrap items-center justify-between gap-4 shadow-[0_2px_10px_rgba(20,20,19,0.03)]">
        <div>
          <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
            Сводка и стратегия · {activeBrands.length} активных бренда + {upcomingBrands.length} в проработке
          </div>
          <h1 className="text-[23px] font-bold tracking-[-0.02em] text-[#141413] mt-0.5">
            ДНК и стратегия брендов
          </h1>
        </div>

        {canCreateBrand && (
          <button
            onClick={() => setShowNewBrandModal(true)}
            className="h-9 rounded-[9px] bg-[#141413] text-white px-4 text-[12.5px] font-semibold hover:bg-[#2A2A28] transition cursor-pointer"
          >
            Добавить бренд
          </button>
        )}
      </div>

      {/* Крупные карточки брендов со студийной съёмкой — строгая зеркальная симметрия */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {activeBrands.map((brand) => {
          const isBorners = brand.code === 'BORNERS';
          const accentColor = isBorners ? '#141413' : '#52514C';
          const bProducts = products.filter(
            (p) => !p.isArchived && (p.brandId === brand.code || p.brandId === brand.id)
          );
          const bConcepts = concepts.filter(
            (c) => !c.isArchived && (c.brandId === brand.code || c.brandId === brand.id)
          );
          const bLaunches = launches.filter(
            (l) => !l.isArchived && (l.brandId === brand.code || l.brandId === brand.id)
          );

          return (
            <div
              key={brand.id}
              className={`bg-white rounded-[18px] border-[1.5px] border-[#C8C7BE] border-t-[3px] ${
                isBorners ? 'border-t-[#141413]' : 'border-t-[#52514C]'
              } overflow-hidden flex flex-col justify-between h-full shadow-[0_2px_10px_rgba(20,20,19,0.03)]`}
            >
              <div>
                {/* Студийный кадр коллекции фиксированной высоты h-60 */}
                <div className="relative h-60 w-full bg-[#F5F5F1] border-b-[1.5px] border-[#C8C7BE] overflow-hidden">
                  <img
                    src={resolvePublicAssetUrl(brand.heroImage)}
                    alt={brand.name}
                    className="h-full w-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                  <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between text-white">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/80">
                        {brand.segment}
                      </div>
                      <h2 className="font-serif-editorial text-[32px] font-medium tracking-tight leading-none mt-1">
                        {brand.name}
                      </h2>
                    </div>
                    <span className="px-2.5 py-1 rounded-[4px] bg-black/55 backdrop-blur-xs text-[11px] font-mono uppercase tracking-[0.14em]">
                      Маржа {brand.targetMarginPct}%
                    </span>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  <div className="min-h-[124px]">
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[#7A756D]">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: accentColor }}
                      />
                      <span>Позиционирование</span>
                    </div>
                    <p className="text-[15px] text-[#161615] mt-1.5 font-semibold">
                      {brand.tagline}
                    </p>
                    <p className="text-[13.5px] text-[#5C5852] mt-2 leading-relaxed">
                      {brand.description}
                    </p>
                  </div>

                  {/* Ключевые показатели бренда */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 divide-x-[1.5px] divide-[#DFD8CC] pt-4 border-t-[1.5px] border-[#CFC8BC]">
                    <div className="pr-3">
                      <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#7A756D]">
                        План 2027
                      </div>
                      <div className="font-serif-editorial text-[22px] font-medium text-[#161615] mt-0.5 tabular-nums">
                        {hasFinance
                          ? formatCompactRub(brand.plannedRevenue2027Rub)
                          : 'Скрыто'}
                      </div>
                    </div>
                    <div className="px-3">
                      <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#7A756D]">
                        Целевая маржа
                      </div>
                      <div className="font-serif-editorial text-[22px] font-medium text-[#161615] mt-0.5 tabular-nums">
                        {hasFinance ? `${brand.targetMarginPct}%` : 'Скрыто'}
                      </div>
                    </div>
                    <div className="px-3">
                      <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#7A756D]">
                        В каталоге
                      </div>
                      <div className="font-serif-editorial text-[22px] font-medium text-[#161615] mt-0.5 tabular-nums">
                        {bProducts.length} SKU
                      </div>
                    </div>
                    <div className="pl-3">
                      <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#7A756D]">
                        R&D / Запуски
                      </div>
                      <div className="font-serif-editorial text-[22px] font-medium text-[#161615] mt-0.5 tabular-nums">
                        {bConcepts.length} / {bLaunches.length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Действия — симметричная 3-кнопочная сетка */}
              <div className="grid grid-cols-3 divide-x-[1.5px] divide-[#CFC8BC] bg-[#FAF8F5] border-t-[1.5px] border-[#CFC8BC]">
                <button
                  onClick={() => {
                    setBrandFilter(brand.code);
                    navigateTo('brand-strategy');
                  }}
                  className="h-11 px-3 bg-[#161615] text-[#F8F6F2] text-[12px] font-medium hover:bg-[#2C2B29] transition cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <span>Паспорт (14)</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    setBrandFilter(brand.code);
                    navigateTo('product-catalog');
                  }}
                  className="h-11 px-3 text-[#161615] text-[12.5px] font-semibold hover:bg-[#EFECE6] transition cursor-pointer"
                >
                  Каталог ({bProducts.length})
                </button>
                <button
                  onClick={() => {
                    setBrandFilter(brand.code);
                    navigateTo('product-lab');
                  }}
                  className="h-11 px-3 text-[#161615] text-[12.5px] font-semibold hover:bg-[#EFECE6] transition cursor-pointer"
                >
                  R&D ({bConcepts.length})
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* БРЕНДЫ В РАЗРАБОТКЕ: АКУША И LISKANI */}
      {upcomingBrands.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#E5E0D8] pb-2">
            <h3 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[#7A756D]">
              БРЕНДЫ ПОРТФЕЛЯ В РАЗРАБОТКЕ (2026–2027)
            </h3>
            <span className="text-[12px] text-[#7A756D]">
              Формирование позиционирования и ассортиментной матрицы
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {upcomingBrands.map((brand) => (
              <div
                key={brand.id}
                className="bg-[#FDFCFA] rounded-[8px] border border-[#E5E0D8] p-6 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#7A756D]">
                      <span className="h-2 w-2 rounded-full bg-[#A3A39E]" />
                      <span>В ПРОРАБОТКЕ СТРАТЕГИИ</span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[#F8F6F2] border border-[#E5E0D8] font-mono text-[10px] uppercase text-[#6E6A63]">
                      <span>В разработке</span>
                    </span>
                  </div>

                  <div>
                    <h2 className="font-serif-editorial text-[28px] font-semibold text-[#161615] leading-none">
                      {brand.name}
                    </h2>
                    <p className="text-[14px] font-medium text-[#161615] mt-1.5">
                      {brand.tagline}
                    </p>
                    <p className="text-[13px] text-[#6E6A63] mt-2 leading-relaxed">
                      {brand.description}
                    </p>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-[#E5E0D8] flex items-center justify-between text-[12px] text-[#7A756D]">
                  <span>Каталог SKU и финплан: в разработке</span>
                  <span className="font-mono">2026–2027</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Сравнительная таблица разграничения брендов */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-[#E8E8E5] overflow-x-auto">
        <div className="p-6 border-b border-[#E8E8E5]">
          <h3 className="text-[22px] font-bold text-[#171717]">
            Разграничение брендов в портфеле группы
          </h3>
        </div>
        <table className="w-full text-left text-[15px]">
          <thead className="border-b border-[#E8E8E5] text-[13px] font-semibold uppercase tracking-wider text-[#737373] bg-[#F7F7F5]/60">
            <tr>
              <th className="py-4 px-6">Критерий</th>
              <th className="py-4 px-6">BORNERS (Мужской и унисекс базовый)</th>
              <th className="py-4 px-6">НА ТЕЛЕ (Женский вторая кожа)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8E5]">
            <tr>
              <td className="py-4 px-6 font-semibold text-[#171717]">Роль продукта</td>
              <td className="py-4 px-6 text-[#737373]">
                Инженерная посадка, плотный модал 92% и пима-хлопок, долговечность 80+ стирок
              </td>
              <td className="py-4 px-6 text-[#737373]">
                Бесшовная лазерная обработка края (Free-cut), тактильная невесомость, 6 телесных оттенков
              </td>
            </tr>
            <tr>
              <td className="py-4 px-6 font-semibold text-[#171717]">Ценовой коридор и маржа</td>
              <td className="py-4 px-6 font-semibold text-[#171717]">1 690 – 4 990 ₽ · 72%</td>
              <td className="py-4 px-6 font-semibold text-[#171717]">1 490 – 4 490 ₽ · 75%</td>
            </tr>
            <tr>
              <td className="py-4 px-6 font-semibold text-[#171717]">Визуальный код</td>
              <td className="py-4 px-6 text-[#737373]">
                Строгий графит и терракота (#D97745), матовые тубусы и плотные зип-пакеты 180 мкм
              </td>
              <td className="py-4 px-6 text-[#737373]">
                Тёплый беж (#8B8078), макро-фактура ткани и кожи, калька и пудровый софт-тач
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Модальное окно создания нового бренда */}
      {showNewBrandModal && (
        <div
          onClick={() => setShowNewBrandModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E8E8E5] p-8 space-y-5 shadow-2xl"
          >
            <h3 className="text-[22px] font-bold border-b border-[#E8E8E5] pb-4">
              Добавление нового бренда
            </h3>
            <div className="space-y-4 text-[14px]">
              <div>
                <label className="block font-semibold mb-1.5">Название бренда</label>
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
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1.5">Слоган и идея</label>
                <input
                  value={newBrandForm.tagline}
                  onChange={(e) => setNewBrandForm({ ...newBrandForm, tagline: e.target.value })}
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1.5">Ценовой сегмент</label>
                <input
                  value={newBrandForm.segment}
                  onChange={(e) => setNewBrandForm({ ...newBrandForm, segment: e.target.value })}
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E8E5]">
              <button
                onClick={() => setShowNewBrandModal(false)}
                className="h-11 px-5 rounded-xl border border-[#E8E8E5] text-[14px] font-semibold cursor-pointer"
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
                className="h-11 px-6 rounded-xl bg-[#111111] text-white text-[14px] font-semibold cursor-pointer"
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
  const activeBrands = brands.filter((b) => !b.isStrategyInDevelopment);
  const normFilter =
    brandFilter && brandFilter !== 'ALL' ? normalizeLabBrandCode(brandFilter) : null;
  const activeBrandCode =
    normFilter &&
    activeBrands.some(
      (b) => normalizeLabBrandCode(b.code) === normFilter || b.id === brandFilter
    )
      ? normFilter
      : activeBrands[0]?.code || 'BORNERS';

  const activeBrand = useMemo(
    () =>
      activeBrands.find(
        (b) =>
          normalizeLabBrandCode(b.code) === normalizeLabBrandCode(activeBrandCode) ||
          b.id === activeBrandCode
      ) || activeBrands[0],
    [activeBrands, activeBrandCode]
  );

  const brandBlocks = useMemo(() => {
    const targetCode = activeBrand ? normalizeLabBrandCode(activeBrand.code) : 'BORNERS';
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
  }, [strategies, activeBrand]);

  const [strategyTab, setStrategyTab] = useState<'scenarios' | 'dna'>('scenarios');
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

  const showDraftStrategyTools =
    draftModules.brandPortfolio || draftModules.strategyPresentationCard;

  return (
    <div className="space-y-6 pb-20">
      {/* Переключатель 14 блоков ДНК и презентации показывается, только если включён в черновике админки */}
      {showDraftStrategyTools && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E0D5] pb-4">
          <div className="inline-flex rounded-[12px] bg-[#EFECE6] p-1 border border-[#E5E0D5]">
            <button
              type="button"
              onClick={() => setStrategyTab('scenarios')}
              className={`h-9 px-4 rounded-[9px] text-[13px] font-semibold transition cursor-pointer ${
                strategyTab === 'scenarios'
                  ? 'bg-white text-[#1D1D1F] shadow-xs'
                  : 'text-[#6E6E73] hover:text-[#1D1D1F]'
              }`}
            >
              Сценарии развития (100 / 150 / 200 млн ₽)
            </button>
            {draftModules.brandPortfolio && (
              <button
                type="button"
                onClick={() => setStrategyTab('dna')}
                className={`h-9 px-4 rounded-[9px] text-[13px] font-semibold transition cursor-pointer ${
                  strategyTab === 'dna'
                    ? 'bg-white text-[#1D1D1F] shadow-xs'
                    : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                Паспорт бренда (14 блоков · Черновик)
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {draftModules.strategyPresentationCard && (
              <button
                onClick={() => setPlatformMode('strategy')}
                className="h-9 px-4 rounded-[10px] bg-[#1E3A5F] text-white text-[12.5px] font-semibold hover:bg-[#162C49] transition cursor-pointer"
              >
                Презентация стратегии (16 слайдов)
              </button>
            )}

            <button
              onClick={() => navigateTo('product-catalog')}
              className="h-9 px-3.5 rounded-[10px] border border-[#E5E0D5] bg-white text-[12.5px] font-semibold text-[#1D1D1F] hover:border-[#1D1D1F] transition cursor-pointer"
            >
              Модели (SKU) →
            </button>
          </div>
        </div>
      )}

      {strategyTab === 'scenarios' || !draftModules.brandPortfolio ? (
        <GrowthScenariosShowcase />
      ) : (
        <>
          <div>
            <h1 className="text-[24px] font-bold text-[#1D1D1F] tracking-tight">
              Стратегия бренда: {activeBrand.name} (14 блоков ДНК)
            </h1>
            <p className="text-[13.5px] text-[#6E6E73] mt-1">
              {activeBrand.tagline} · целевая валовая маржа {activeBrand.targetMarginPct}%
            </p>
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
              className="bg-[#FDFCFA] rounded-[8px] border border-[#E5E0D8] p-6 flex flex-col justify-between space-y-5"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-[#E5E0D8] pb-3.5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#8E8880]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="font-serif-editorial text-[24px] font-medium text-[#161615]">
                      {block.titleRu}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {block.deadline && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#FAF8F5] border border-[#CFC8BC] text-[11px] font-mono font-semibold text-[#B85D35]">
                        <span>Срок: {block.deadline}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[#F2EFE9] border border-[#E5E0D8] text-[11px] font-medium text-[#161615]">
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dotColor}`} />
                      <span>{st.label}</span>
                    </span>

                    <button
                      onClick={() => setHistoryBlock(block)}
                      title="История версий"
                      className="rounded-[4px] bg-[#F8F6F2] border border-[#E5E0D8] hover:border-[#161615] px-2 py-0.5 text-[11px] font-mono text-[#7A756D] hover:text-[#161615] cursor-pointer"
                    >
                      v{block.version}
                    </button>

                    {canEditBlock ? (
                      <button
                        onClick={() => openEditor(block)}
                        className="inline-flex items-center gap-1 rounded-[4px] border border-[#E5E0D8] px-2.5 py-0.5 text-[11px] font-medium text-[#161615] hover:bg-[#161615] hover:text-[#F8F6F2] transition cursor-pointer"
                      >
                        <Edit3 className="h-3 w-3" />
                        <span>Изменить</span>
                      </button>
                    ) : (
                      isLockedForManager && (
                        <span
                          title="Утверждённый блок защищён от изменений"
                          className="inline-flex items-center gap-1 text-[11px] text-[#7A756D]"
                        >
                          <Lock className="h-3 w-3" />
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Ключевой тезис */}
                <p className="text-[15px] font-medium text-[#161615] leading-snug">
                  {block.summary}
                </p>

                {/* Пункты содержания */}
                <ul className="space-y-2 text-[13px] text-[#5C5852]">
                  {bulletLines.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                      <span className="text-[11px] font-mono text-[#8E8880] shrink-0 mt-0.5">
                        —
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Опорные показатели блока — без обрезания слов и без технических рамок */}
              <div className="pt-4 border-t border-[#EAE6DF] grid grid-cols-1 sm:grid-cols-2 gap-4">
                {block.kpiHighlights.map((m, idx) => (
                  <div key={idx} className="rounded-[8px] bg-[#FAF8F5] border border-[#EAE6DF] px-3.5 py-2.5">
                    <div className="text-[11.5px] text-[#7A756D] leading-snug">
                      {m.label}
                    </div>
                    <div className="text-[14px] font-semibold text-[#181715] mt-0.5 tabular-nums">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl border border-[#E8E8E5] p-8 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#E8E8E5] pb-4">
              <div>
                <div className="text-[12px] font-semibold uppercase text-[#737373]">
                  Редактирование блока стратегии ({activeBrand.name})
                </div>
                <h3 className="text-[22px] font-bold text-[#171717] dark:text-white mt-1">
                  {editingBlock.titleRu}
                </h3>
              </div>
              <button
                onClick={() => setEditingBlock(null)}
                className="text-[13px] font-semibold text-[#737373] hover:text-[#171717] cursor-pointer"
              >
                Закрыть
              </button>
            </div>

            <div className="space-y-4 text-[14px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1.5">Статус согласования</label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState({ ...formState, status: e.target.value as ApprovalStatus })
                    }
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px] bg-white font-medium"
                  >
                    <option value="draft">Черновик</option>
                    <option value="in_review">На согласовании</option>
                    {canEditApproved && <option value="approved">Утверждено</option>}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1.5">Дедлайн контрольной точки</label>
                  <input
                    type="date"
                    value={formState.deadline}
                    onChange={(e) => setFormState({ ...formState, deadline: e.target.value })}
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px] font-mono bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1.5">Главный тезис</label>
                <input
                  value={formState.summary}
                  onChange={(e) => setFormState({ ...formState, summary: e.target.value })}
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1.5">
                  Положения стратегии (каждый пункт с новой строки)
                </label>
                <textarea
                  rows={5}
                  value={formState.content}
                  onChange={(e) => setFormState({ ...formState, content: e.target.value })}
                  className="w-full rounded-xl border border-[#E8E8E5] p-3.5 text-[15px]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1.5">
                  Показатели (формат «Показатель: Значение» с новой строки)
                </label>
                <textarea
                  rows={3}
                  value={formState.metricsText}
                  onChange={(e) =>
                    setFormState({ ...formState, metricsText: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#E8E8E5] p-3.5 text-[14px]"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1.5">Комментарий к версии</label>
                <input
                  value={formState.changeSummary}
                  onChange={(e) =>
                    setFormState({ ...formState, changeSummary: e.target.value })
                  }
                  placeholder="Например: Уточнены ориентиры маржи на 2027 год"
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E8E5]">
              <button
                onClick={() => setEditingBlock(null)}
                className="h-11 px-5 rounded-xl border border-[#E8E8E5] text-[14px] font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveBlock}
                className="h-11 px-6 rounded-xl bg-[#111111] text-white text-[14px] font-semibold cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E8E8E5] p-8 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#E8E8E5] pb-4">
              <div>
                <div className="text-[12px] font-semibold uppercase text-[#737373]">
                  История версий
                </div>
                <h3 className="text-[22px] font-bold mt-1">{historyBlock.titleRu}</h3>
              </div>
              <button
                onClick={() => setHistoryBlock(null)}
                className="text-[13px] font-semibold text-[#737373] hover:text-[#171717] cursor-pointer"
              >
                Закрыть
              </button>
            </div>

            <div className="space-y-4 max-h-80 overflow-y-auto divide-y divide-[#E8E8E5]">
              {historyBlock.history.map((v, idx) => (
                <div key={idx} className="pt-4 first:pt-0 text-[14px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[15px] text-[#171717]">
                      v{v.version} · {v.authorName}
                    </span>
                    <span className="text-[13px] text-[#737373]">{v.updatedAt}</span>
                  </div>
                  <p className="text-[#737373]">{v.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
