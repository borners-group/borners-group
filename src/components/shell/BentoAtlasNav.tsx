'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AppUser, NavSectionId } from '@/types/platform';
import { canUserAccessSection } from '@/lib/finance';
import { DraftModuleKey } from '@/lib/draftModules';

export interface BentoAtlasItem {
  id: string;
  sectionId?: NavSectionId;
  title: string;
  subtitle: string;
  metricBadge: string;
  contour: 'strategy' | 'product' | 'operations' | 'finance';
  isDraft?: boolean;
  onCustomSelect?: () => void;
}

interface BentoAtlasNavProps {
  open: boolean;
  onClose: () => void;
  activeSection: NavSectionId;
  platformMode: 'management' | 'strategy';
  onSelectSection: (section: NavSectionId) => void;
  onSetPlatformMode: (mode: 'management' | 'strategy') => void;
  currentUser: AppUser;
  recentSections: NavSectionId[];
  productsCount: number;
  activeConceptsCount: number;
  openTasksCount: number;
  documentsCount: number;
  usersCount: number;
  trashCount: number;
  draftModules: Record<DraftModuleKey, boolean>;
  enabledDraftCount: number;
  totalDraftCount: number;
  onOpenTour: () => void;
  onOpenDraftAdmin: () => void;
  onOpenTrash: () => void;
}

const SECTION_SHORT_LABELS: Record<NavSectionId, string> = {
  dashboard: 'Сводка и сценарии',
  'brand-strategy': 'ДНК и стратегия',
  'brand-portfolio': 'Портфель брендов',
  'market-intelligence': 'Рынок и конкуренты',
  'product-catalog': 'Каталог SKU',
  'product-lab': 'Лаборатория R&D',
  'launch-calendar': 'План продаж 2027',
  'roadmap-tasks': 'Закупки и задачи',
  'marketing-growth': 'Маркетинг и рост',
  finance: 'Финансы и P&L',
  documents: 'Документы и ТЗ',
  team: 'Команда и роли',
  settings: 'Настройки',
};

const CONTOUR_META: {
  key: BentoAtlasItem['contour'];
  step: string;
  title: string;
  caption: string;
}[] = [
  {
    key: 'strategy',
    step: '01',
    title: 'Сводка и Стратегия',
    caption: 'Цели 2027 и позиционирование',
  },
  {
    key: 'product',
    step: '02',
    title: 'Продукт и R&D',
    caption: 'Матрица SKU, фото и образцы',
  },
  {
    key: 'operations',
    step: '03',
    title: 'Продажи и Закупки',
    caption: 'Помесячный план, партии и CRM',
  },
  {
    key: 'finance',
    step: '04',
    title: 'Финансы и Документы',
    caption: 'P&L, спецификации и доступы',
  },
];

export function BentoAtlasNav({
  open,
  onClose,
  activeSection,
  platformMode,
  onSelectSection,
  onSetPlatformMode,
  currentUser,
  recentSections,
  productsCount,
  activeConceptsCount,
  openTasksCount,
  documentsCount,
  usersCount,
  trashCount,
  draftModules,
  enabledDraftCount,
  totalDraftCount,
  onOpenTour,
  onOpenDraftAdmin,
  onOpenTrash,
}: BentoAtlasNavProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setFilterQuery('');
      return;
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 40);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const allItems = useMemo<BentoAtlasItem[]>(() => {
    const raw: BentoAtlasItem[] = [
      // 01. Сводка и Стратегия
      {
        id: 'dashboard',
        sectionId: 'dashboard',
        title: 'Сводка и Сценарии роста',
        subtitle: 'Планы 100 / 150 / 200 млн ₽, модели и контроль партий',
        metricBadge: '4 сценария',
        contour: 'strategy',
      },
      {
        id: 'brand-strategy',
        sectionId: 'brand-strategy',
        title: 'ДНК и стратегия брендов',
        subtitle: 'Паспорта позиционирования BORNERS и НА ТЕЛЕ (14 блоков)',
        metricBadge: '2 бренда',
        contour: 'strategy',
      },
      ...(canUserAccessSection(currentUser, 'brand-strategy')
        ? [
            {
              id: 'presentation-mode',
              title: 'Презентация стратегии 2027',
              subtitle: 'Полноэкранный режим слайдов для защиты стратегии',
              metricBadge: '8 слайдов',
              contour: 'strategy' as const,
              onCustomSelect: () => {
                onSetPlatformMode('strategy');
                onClose();
              },
            },
          ]
        : []),
      ...(draftModules.brandPortfolio
        ? [
            {
              id: 'brand-portfolio',
              sectionId: 'brand-portfolio' as NavSectionId,
              title: 'Портфель брендов',
              subtitle: 'Архитектура марок и долей ассортимента',
              metricBadge: 'Портфель',
              contour: 'strategy' as const,
              isDraft: true,
            },
          ]
        : []),
      ...(draftModules.marketIntelligence
        ? [
            {
              id: 'market-intelligence',
              sectionId: 'market-intelligence' as NavSectionId,
              title: 'Рынок и конкуренты',
              subtitle: 'Ценовые сегменты, бенчмарки и доли на WB / Ozon',
              metricBadge: 'Аналитика',
              contour: 'strategy' as const,
              isDraft: true,
            },
          ]
        : []),

      // 02. Продукт и R&D
      {
        id: 'product-catalog',
        sectionId: 'product-catalog',
        title: 'Каталог моделей (SKU)',
        subtitle: 'Единые паспорта изделий, фото без обрезки и себестоимость',
        metricBadge: `${productsCount} SKU`,
        contour: 'product',
      },
      {
        id: 'product-lab',
        sectionId: 'product-lab',
        title: 'Лаборатория R&D (01–07)',
        subtitle: 'Отбор образцов, тесты стирки и утверждение лекал',
        metricBadge: `${activeConceptsCount} в работе`,
        contour: 'product',
      },

      // 03. Продажи и Закупки
      {
        id: 'launch-calendar',
        sectionId: 'launch-calendar',
        title: 'План продаж и производства',
        subtitle: 'Помесячная матрица 12 мес. по комплектам, ценам и выручке',
        metricBadge: '12 мес. · 2027',
        contour: 'operations',
      },
      {
        id: 'roadmap-tasks',
        sectionId: 'roadmap-tasks',
        title: 'Закупки, партии и задачи CRM',
        subtitle: 'Контроль дедлайнов фабрик, поручений и поставок',
        metricBadge: `${openTasksCount} задач`,
        contour: 'operations',
      },
      ...(draftModules.marketing
        ? [
            {
              id: 'marketing-growth',
              sectionId: 'marketing-growth' as NavSectionId,
              title: 'Маркетинг и продвижение',
              subtitle: 'Воронка трафика, ДРР и медиаплан запусков',
              metricBadge: 'Рост',
              contour: 'operations' as const,
              isDraft: true,
            },
          ]
        : []),

      // 04. Финансы и Документы
      {
        id: 'finance',
        sectionId: 'finance',
        title: 'Финансы и P&L 2027',
        subtitle: 'Сводный отчёт о прибылях, маржинальности и план/факт',
        metricBadge: 'P&L · Капитал',
        contour: 'finance',
      },
      {
        id: 'documents',
        sectionId: 'documents',
        title: 'Документы, ТЗ и PDF',
        subtitle: 'ТЗ v1.1, спецификации фабрик, отчёты и таблицы',
        metricBadge: `${documentsCount} файл.`,
        contour: 'finance',
      },
      {
        id: 'team',
        sectionId: 'team',
        title: 'Команда и роли доступа',
        subtitle: 'Разграничение прав владельца, продакт-менеджера и финансов',
        metricBadge: `${usersCount} ролей`,
        contour: 'finance',
      },
      ...(draftModules.settingsSection
        ? [
            {
              id: 'settings',
              sectionId: 'settings' as NavSectionId,
              title: 'Настройки системы',
              subtitle: 'Параметры домена, резервных копий и справочников',
              metricBadge: 'Система',
              contour: 'finance' as const,
              isDraft: true,
            },
          ]
        : []),
    ];

    return raw.filter((item) =>
      item.sectionId ? canUserAccessSection(currentUser, item.sectionId) : true
    );
  }, [
    activeConceptsCount,
    currentUser,
    documentsCount,
    draftModules,
    onClose,
    onSetPlatformMode,
    openTasksCount,
    productsCount,
    usersCount,
  ]);

  const filteredItems = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.metricBadge.toLowerCase().includes(q)
    );
  }, [allItems, filterQuery]);

  if (!open) return null;

  return (
    <>
      {/* Плотная подложка для чёткого отделения меню от страницы */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity"
      />

      {/* Выпадающий 4-колоночный Бенто-Атлас с тонкой архитектурной линией */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Бенто-атлас всех разделов BORNERS"
        className="fixed inset-x-3 sm:inset-x-6 lg:inset-x-10 top-[64px] z-50 max-w-[1440px] mx-auto rounded-[12px] bg-white border border-[#D2CEC4] shadow-[0_24px_64px_rgba(20,20,19,0.16)] overflow-hidden flex flex-col max-h-[calc(100vh-84px)]"
      >
        {/* Верхняя панель Бенто-Атласа: быстрый фильтр + недавние переходы */}
        <div className="px-5 py-3.5 border-b border-[#E4E1DA] bg-[#FAF9F6] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
            <div className="flex-1 max-w-sm">
              <input
                ref={inputRef}
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredItems.length > 0) {
                    const first = filteredItems[0];
                    if (first.onCustomSelect) {
                      first.onCustomSelect();
                    } else if (first.sectionId) {
                      onSetPlatformMode('management');
                      onSelectSection(first.sectionId);
                      onClose();
                    }
                  }
                }}
                placeholder="Найти раздел (закупки, P&L, R&D)..."
                className="w-full h-9 px-3.5 rounded-[9px] bg-white border-[1.5px] border-[#C8C7BE] focus:border-[#141413] text-[12.5px] font-medium text-[#141413] placeholder:text-[#7E7D77]"
              />
            </div>

            {recentSections.length > 0 && !filterQuery && (
              <div className="hidden xl:flex items-center gap-1.5 text-[11.5px]">
                <span className="text-[#6E6D68] font-semibold mr-1">
                  Недавние:
                </span>
                {recentSections.slice(0, 4).map((secId) => (
                  <button
                    key={secId}
                    type="button"
                    onClick={() => {
                      onSetPlatformMode('management');
                      onSelectSection(secId);
                      onClose();
                    }}
                    className={`h-7.5 px-2.5 rounded-[7px] border-[1.5px] text-[11.5px] font-semibold transition cursor-pointer ${
                      platformMode === 'management' && activeSection === secId
                        ? 'bg-[#EAE9E2] text-[#141413] border-[#9E9D94]'
                        : 'bg-white hover:border-[#141413] text-[#262624] border-[#CECDC4]'
                    }`}
                  >
                    {SECTION_SHORT_LABELS[secId] || secId}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-[9px] bg-[#E8E7E1] border-[1.5px] border-[#CECDC4] p-0.5 text-[11.5px] font-semibold">
              <button
                type="button"
                onClick={() => onSetPlatformMode('management')}
                className={`px-3 py-1 rounded-[7px] transition cursor-pointer ${
                  platformMode === 'management'
                    ? 'bg-white text-[#141413] shadow-2xs'
                    : 'text-[#5E5D58] hover:text-[#141413]'
                }`}
              >
                Рабочая система
              </button>
              {canUserAccessSection(currentUser, 'brand-strategy') && (
                <button
                  type="button"
                  onClick={() => {
                    onSetPlatformMode('strategy');
                    onClose();
                  }}
                  className={`px-3 py-1 rounded-[7px] transition cursor-pointer ${
                    platformMode === 'strategy'
                      ? 'bg-white text-[#141413] shadow-2xs'
                      : 'text-[#5E5D58] hover:text-[#141413]'
                  }`}
                >
                  Презентация
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть атлас разделов"
              className="h-8.5 w-8.5 rounded-[9px] bg-white hover:bg-[#EAEAE4] border-[1.5px] border-[#CECDC4] hover:border-[#141413] flex items-center justify-center text-[#141413] cursor-pointer transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Основная 4-колоночная Бенто-сетка: каждый контур выделен своей рамкой и линией */}
        <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-white">
          {CONTOUR_META.map((contour) => {
            const items = filteredItems.filter((i) => i.contour === contour.key);
            if (items.length === 0) return null;

            return (
              <div
                key={contour.key}
                className="rounded-[12px] bg-[#FAF9F6] border border-[#E4E1DA] p-3.5 flex flex-col gap-3"
              >
                <div className="pb-2.5 border-b border-[#D2CEC4] flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-[12px] font-semibold tracking-[-0.01em] text-[#141413]">
                      {contour.title}
                    </div>
                    <div className="text-[11px] text-[#5C5953] mt-0.5">
                      {contour.caption}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-medium text-[#141413] px-1.5 py-0.5 rounded-[5px] bg-white border border-[#E4E1DA]">
                    {contour.step}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {items.map((item) => {
                    const isActive =
                      item.id === 'presentation-mode'
                        ? platformMode === 'strategy'
                        : platformMode === 'management' &&
                          item.sectionId === activeSection;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.onCustomSelect) {
                            item.onCustomSelect();
                          } else if (item.sectionId) {
                            onSetPlatformMode('management');
                            onSelectSection(item.sectionId);
                            onClose();
                          }
                        }}
                        className={`group w-full text-left rounded-[12px] p-3.5 transition-all cursor-pointer flex flex-col justify-between gap-1.5 bg-white ${
                          isActive
                            ? 'border-[2px] border-[#141413] shadow-[0_4px_14px_rgba(20,20,19,0.08)]'
                            : 'border-[1.5px] border-[#CECDC4] hover:border-[#141413]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 w-full">
                          <span className="text-[13.5px] font-bold text-[#141413] leading-snug">
                            {item.title}
                          </span>
                          <span
                            className={`shrink-0 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-[6px] border ${
                              isActive
                                ? 'bg-[#EAE9E2] text-[#141413] border-[#9E9D94]'
                                : 'bg-[#F4F4F0] text-[#3F3E3A] border-[#D8D7CF]'
                            }`}
                          >
                            {isActive ? 'Активен' : item.metricBadge}
                          </span>
                        </div>

                        <p className="text-[11.5px] text-[#5E5D58] leading-relaxed">
                          {item.subtitle}
                          {item.isDraft ? ' · черновик' : ''}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="col-span-full py-10 text-center text-[13.5px] text-[#5E5D58]">
              По запросу «{filterQuery}» разделов не найдено
            </div>
          )}
        </div>

        {/* Сервисная полоса снизу без декоративных иконок */}
        <div className="px-5 py-3 border-t-[1.5px] border-[#D5D4CC] bg-[#F5F5F1] flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTour();
              }}
              className="h-8 px-3 rounded-[8px] bg-white hover:border-[#141413] border-[1.5px] border-[#CECDC4] text-[#141413] font-semibold cursor-pointer transition"
            >
              Гид по системе (5 шагов)
            </button>

            {(currentUser.role === 'Owner' || currentUser.role === 'Admin') && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDraftAdmin();
                }}
                className="h-8 px-3 rounded-[8px] bg-white hover:border-[#141413] border-[1.5px] border-[#CECDC4] text-[#141413] font-semibold cursor-pointer transition"
              >
                Черновик разделов ({enabledDraftCount}/{totalDraftCount})
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTrash();
              }}
              className="h-8 px-3 rounded-[8px] bg-white hover:border-[#141413] border-[1.5px] border-[#CECDC4] text-[#141413] font-semibold cursor-pointer transition"
            >
              Корзина ({trashCount})
            </button>
          </div>

          <div className="text-[11px] text-[#6E6D68] font-medium">
            Разделы:{' '}
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-white border border-[#CECDC4] text-[#141413] font-semibold">
              ⌘J
            </kbd>{' '}
            · Поиск SKU:{' '}
            <kbd className="font-mono px-1.5 py-0.5 rounded bg-white border border-[#CECDC4] text-[#141413] font-semibold">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>
    </>
  );
}
