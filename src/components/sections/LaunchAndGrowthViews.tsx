'use client';

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  GripVertical,
  Plus,
  X,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import {
  Campaign,
  ExperimentStatus,
  GrowthExperiment,
  Launch,
  MarketingChannel,
} from '@/types/platform';
import {
  EXPERIMENT_STATUS_LABELS_RU,
  canUserEditBrand,
  canUserViewBrandConcept,
  canUserViewFinance,
  detectLaunchDateConflicts,
  formatCompactRub,
  formatCurrencyRub,
} from '@/lib/finance';
import { resolvePublicAssetUrl } from '@/lib/scenarioData';
import { formatLabBrandLabel, normalizeLabBrandCode } from '@/lib/rndCatalogSync';
import {
  type CanonicalBrandCode,
  normalizePortfolioBrandCode,
} from '@/lib/unifiedBusinessEngine';
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';

interface SelectableCatalogSku {
  id: string;
  sku: string;
  name: string;
  brandId: string;
  imageUrl: string;
  isScenarioModel: boolean;
}

const LAUNCH_STATUS_COLUMNS: Launch['status'][] = [
  'Подготовка',
  'В работе',
  'Согласование',
  'Готов к старту',
  'Запущен',
];

const EDITABLE_BRAND_OPTIONS: { code: CanonicalBrandCode; label: string }[] = [
  { code: 'BORNERS', label: 'BORNERS' },
  { code: 'NA_TELE', label: 'НА ТЕЛЕ' },
  { code: 'AKUSHA', label: 'AKUSHA' },
  { code: 'LISKANI', label: 'LISKANI' },
  { code: 'FUKAI', label: 'FUKAI' },
];

const RU_MONTH_NAMES: Record<string, string> = {
  '01': 'Январь',
  '02': 'Февраль',
  '03': 'Март',
  '04': 'Апрель',
  '05': 'Май',
  '06': 'Июнь',
  '07': 'Июль',
  '08': 'Август',
  '09': 'Сентябрь',
  '10': 'Октябрь',
  '11': 'Ноябрь',
  '12': 'Декабрь',
};

export function LaunchCalendarView() {
  const {
    launches,
    products,
    tasks,
    users,
    currentUser,
    brandFilter,
    platformMode,
    selectedLaunchId,
    setSelectedLaunchId,
    createLaunch,
    updateLaunch,
    rescheduleLaunch,
    createTask,
    navigateTo,
  } = usePlatform();

  const isStrategyMode = platformMode === 'strategy';

  const [viewMode, setViewMode] = useState<'timeline' | 'calendar' | 'list' | 'kanban'>(
    'timeline'
  );
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [draggedLaunchId, setDraggedLaunchId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Launch['status'] | null>(null);

  const [rescheduleModalLaunch, setRescheduleModalLaunch] = useState<Launch | null>(null);
  const [newStartDate, setNewStartDate] = useState('');
  const [shiftDependents, setShiftDependents] = useState(false);

  const [newLaunchForm, setNewLaunchForm] = useState({
    name: '',
    brandId: brandFilter !== 'ALL' ? normalizeLabBrandCode(brandFilter) : 'BORNERS',
    collectionName: 'Капсула Весна 2027',
    startDate: '2027-03-20',
    salesPlanRub: '9500000',
    salesPlanUnits: '4000',
    marketingBudgetRub: '950000',
  });

  const hasFinance = canUserViewFinance(currentUser);
  const livePortfolio = useLiveScenarioPortfolio();

  const editableLaunchBrands = useMemo(
    () => EDITABLE_BRAND_OPTIONS.filter((b) => canUserEditBrand(currentUser, b.code)),
    [currentUser]
  );

  const canCreateLaunch =
    !isStrategyMode &&
    editableLaunchBrands.length > 0 &&
    (brandFilter === 'ALL'
      ? currentUser.role !== 'Viewer' && currentUser.role !== 'Partner'
      : canUserEditBrand(currentUser, normalizeLabBrandCode(brandFilter)));

  const selectableCatalogSkus = useMemo<SelectableCatalogSku[]>(() => {
    const seenIds = new Set<string>();
    const seenSkus = new Set<string>();
    const merged: SelectableCatalogSku[] = [];

    for (const m of livePortfolio.models) {
      if (m.launchStatus === 'В архиве') continue;
      const mBrand = normalizePortfolioBrandCode(
        m.customBrandLabel || m.brandId || 'BORNERS'
      );
      if (!canUserViewBrandConcept(currentUser, mBrand)) continue;
      const skuNorm = (m.code || '').trim().toUpperCase();
      seenIds.add(m.id);
      if (skuNorm) seenSkus.add(skuNorm);
      merged.push({
        id: m.id,
        sku: m.code,
        name: m.title,
        brandId: mBrand,
        imageUrl: m.gallery?.[0]?.url || '',
        isScenarioModel: true,
      });
    }

    for (const p of products) {
      if (p.isArchived) continue;
      const pBrand = normalizeLabBrandCode(p.brandId);
      if (!canUserViewBrandConcept(currentUser, pBrand)) continue;
      const skuNorm = (p.sku || '').trim().toUpperCase();
      if (seenIds.has(p.id) || (skuNorm && seenSkus.has(skuNorm))) continue;
      seenIds.add(p.id);
      if (skuNorm) seenSkus.add(skuNorm);
      merged.push({
        id: p.id,
        sku: p.sku,
        name: p.name,
        brandId: pBrand,
        imageUrl: p.imageUrl,
        isScenarioModel: false,
      });
    }

    return merged;
  }, [livePortfolio.models, products, currentUser]);

  const resolveLinkedSkus = useMemo(() => {
    return (productIds: string[]): SelectableCatalogSku[] => {
      const resolved: SelectableCatalogSku[] = [];
      for (const pid of productIds) {
        const fromMerged = selectableCatalogSkus.find((s) => s.id === pid);
        if (fromMerged) {
          resolved.push(fromMerged);
          continue;
        }
        const fromLegacy = products.find((p) => p.id === pid);
        if (fromLegacy) {
          const pBrand = normalizeLabBrandCode(fromLegacy.brandId);
          if (canUserViewBrandConcept(currentUser, pBrand)) {
            resolved.push({
              id: fromLegacy.id,
              sku: fromLegacy.sku,
              name: fromLegacy.name,
              brandId: pBrand,
              imageUrl: fromLegacy.imageUrl,
              isScenarioModel: false,
            });
          }
          continue;
        }
        const fromScenario = livePortfolio.models.find((m) => m.id === pid);
        if (fromScenario) {
          const mBrand = normalizePortfolioBrandCode(
            fromScenario.customBrandLabel || fromScenario.brandId || 'BORNERS'
          );
          if (canUserViewBrandConcept(currentUser, mBrand)) {
            resolved.push({
              id: fromScenario.id,
              sku: fromScenario.code,
              name: fromScenario.title,
              brandId: mBrand,
              imageUrl: fromScenario.gallery?.[0]?.url || '',
              isScenarioModel: true,
            });
          }
        }
      }
      return resolved;
    };
  }, [selectableCatalogSkus, products, livePortfolio.models, currentUser]);

  const filteredLaunches = useMemo(
    () =>
      launches
        .filter(
          (l) =>
            !l.isArchived &&
            canUserViewBrandConcept(currentUser, normalizeLabBrandCode(l.brandId)) &&
            (brandFilter === 'ALL' ||
              normalizeLabBrandCode(l.brandId) === normalizeLabBrandCode(brandFilter))
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [launches, brandFilter, currentUser]
  );

  const calendarMonths = useMemo(() => {
    const keys = new Set<string>(['2027-02', '2027-03', '2027-04']);
    for (const l of filteredLaunches) {
      const mk = (l.startDate || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(mk)) {
        keys.add(mk);
      }
    }
    return Array.from(keys)
      .sort()
      .map((monthKey) => {
        const [yyyy, mm] = monthKey.split('-');
        return {
          monthKey,
          label: `${RU_MONTH_NAMES[mm] || mm} ${yyyy}`,
        };
      });
  }, [filteredLaunches]);

  const activeLaunch: Launch | null = useMemo(() => {
    const found = launches.find((l) => l.id === selectedLaunchId) || null;
    if (
      found &&
      !canUserViewBrandConcept(currentUser, normalizeLabBrandCode(found.brandId))
    ) {
      return null;
    }
    return found;
  }, [launches, selectedLaunchId, currentUser]);

  const openRescheduleModal = (launch: Launch) => {
    setRescheduleModalLaunch(launch);
    setNewStartDate(launch.startDate);
    setShiftDependents(false);
  };

  const previewConflicts = useMemo(() => {
    if (!rescheduleModalLaunch || !newStartDate) return null;
    const linkedTasks = tasks.filter((t) => t.launchId === rescheduleModalLaunch.id);
    return detectLaunchDateConflicts(rescheduleModalLaunch, newStartDate, linkedTasks);
  }, [rescheduleModalLaunch, newStartDate, tasks]);

  const handleLaunchDragStart = (e: React.DragEvent, launchId: string) => {
    const l = launches.find((item) => item.id === launchId);
    if (
      !l ||
      isStrategyMode ||
      !canUserEditBrand(currentUser, normalizeLabBrandCode(l.brandId))
    ) {
      e.preventDefault();
      return;
    }
    setDraggedLaunchId(launchId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', launchId);
  };

  const handleLaunchDrop = (e: React.DragEvent, targetStatus: Launch['status']) => {
    e.preventDefault();
    if (isStrategyMode) {
      setDraggedLaunchId(null);
      setDragOverStatus(null);
      return;
    }
    const lId = e.dataTransfer.getData('text/plain') || draggedLaunchId;
    if (lId) {
      const l = launches.find((item) => item.id === lId);
      if (
        l &&
        canUserEditBrand(currentUser, normalizeLabBrandCode(l.brandId)) &&
        l.status !== targetStatus
      ) {
        updateLaunch(lId, { status: targetStatus });
      }
    }
    setDraggedLaunchId(null);
    setDragOverStatus(null);
  };

  return (
    <div className="space-y-10 pb-20">
      {/* Заголовок страницы (32–40px по ТЗ) */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#E8E8E5] pb-6">
        <div>
          <div className="text-[13px] font-medium uppercase tracking-widest text-[#737373] mb-1.5">
            Релизы коллекций и подготовка партий · {filteredLaunches.length} запусков
          </div>
          <h1 className="text-[34px] md:text-[40px] font-bold tracking-[-0.03em] text-[#171717] dark:text-white">
            Календарь запусков
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[#F7F7F5] p-1 rounded-xl border border-[#E8E8E5]">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-[#171717] shadow-2xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Дорожная карта
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-white text-[#171717] shadow-2xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              По месяцам
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-[#171717] shadow-2xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Таблица
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-[#171717] shadow-2xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Доска
            </button>
          </div>

          {canCreateLaunch && (
            <button
              onClick={() => {
                const defaultBrand =
                  brandFilter !== 'ALL' &&
                  canUserEditBrand(currentUser, normalizeLabBrandCode(brandFilter))
                    ? normalizeLabBrandCode(brandFilter)
                    : editableLaunchBrands[0]?.code || 'BORNERS';
                setNewLaunchForm((prev) => ({
                  ...prev,
                  brandId: canUserEditBrand(currentUser, prev.brandId)
                    ? prev.brandId
                    : defaultBrand,
                }));
                setCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 h-11 rounded-xl bg-[#111111] text-white px-5 text-[15px] font-semibold hover:bg-neutral-800 transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Новый запуск</span>
            </button>
          )}
        </div>
      </div>

      {/* РЕЖИМ 1: ДОРОЖНАЯ КАРТА РЕЛИЗОВ */}
      {viewMode === 'timeline' && (
        <div className="space-y-6">
          {filteredLaunches.map((launch) => {
            const isBorners = launch.brandId === 'BORNERS';
            const linkedProducts = resolveLinkedSkus(launch.productIds);
            const canEditThisLaunch =
              !isStrategyMode &&
              canUserEditBrand(currentUser, normalizeLabBrandCode(launch.brandId));

            return (
              <div
                key={launch.id}
                className="bg-white dark:bg-zinc-900 rounded-2xl border border-[#E8E8E5] p-7 md:p-8 space-y-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[#E8E8E5] pb-6">
                  <div className="flex items-start gap-5 max-w-2xl">
                    {/* Чистое предметное превью запуска */}
                    <div className="h-24 w-24 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] flex items-center justify-center p-2.5 shrink-0">
                      <img
                        src={resolvePublicAssetUrl(launch.imageUrl)}
                        alt={launch.name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5 text-[13px] font-semibold">
                        <span style={{ color: isBorners ? '#D97745' : '#8B8078' }}>
                          {formatLabBrandLabel(launch.brandId)}
                        </span>
                        <span className="text-[#737373]">
                          · Старт продаж: <b className="text-[#171717]">{launch.startDate}</b> ·{' '}
                          {launch.status}
                        </span>
                      </div>
                      <h3
                        onClick={() => setSelectedLaunchId(launch.id)}
                        className="text-[24px] font-bold text-[#171717] dark:text-white hover:underline cursor-pointer"
                      >
                        {launch.name} · {launch.collectionName}
                      </h3>
                      <p className="text-[15px] text-[#737373]">
                        Статус партии: {launch.productionStatus}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <div className="text-[12px] text-[#737373]">План выручки</div>
                      <div className="text-[22px] font-bold text-[#171717] mt-0.5">
                        {hasFinance ? formatCompactRub(launch.salesPlanRub) : 'Скрыто'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[12px] text-[#737373]">Готовность</div>
                      <div className="text-[22px] font-bold text-[#16805D] mt-0.5">
                        {launch.readinessPct}%
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {canEditThisLaunch && (
                        <button
                          onClick={() => openRescheduleModal(launch)}
                          className="h-11 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-4 text-[14px] font-semibold hover:border-[#171717] cursor-pointer"
                        >
                          Сдвинуть дату
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedLaunchId(launch.id)}
                        className="h-11 rounded-xl bg-[#111111] text-white px-4 text-[14px] font-semibold hover:bg-neutral-800 cursor-pointer"
                      >
                        Этапы запуска →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Этапы подготовки (10 стадий запуска — чёткое разделение: Завершено / В работе / Осталось) */}
                {(() => {
                  const doneCount = launch.stages.filter((s) => s.status === 'Done').length;
                  const inProgressCount = launch.stages.filter(
                    (s) => s.status === 'In Progress'
                  ).length;
                  const remainingCount = launch.stages.filter(
                    (s) => s.status === 'Pending' || s.status === 'Delayed'
                  ).length;

                  return (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FAF8F5] border border-[#D4CDC2] px-4 py-2.5 text-[12.5px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[#E6F4EE] border border-[#1F6E50]/40 text-[#1F6E50] font-semibold">
                            ✓ Завершено: {doneCount} из {launch.stages.length}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-[#FCE8DF] border border-[#B85D35]/40 text-[#9E4622] font-semibold">
                            ● В работе: {inProgressCount}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] bg-white border border-[#D4CDC2] text-[#5C5852] font-medium">
                            ○ Осталось этапов: {remainingCount}
                          </span>
                        </div>
                        <span className="font-mono text-[11.5px] font-semibold text-[#181715]">
                          Прогресс: {Math.round((doneCount / Math.max(1, launch.stages.length)) * 100)}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {launch.stages.map((st, stIdx) => {
                          const isLateAfterStart =
                            !['sales', 'analysis'].includes(st.code) &&
                            st.deadline > launch.startDate;
                          const isDone = st.status === 'Done';
                          const isInProg = st.status === 'In Progress';
                          const isDelayed = st.status === 'Delayed' || isLateAfterStart;

                          return (
                            <div
                              key={st.code}
                              onClick={() => setSelectedLaunchId(launch.id)}
                              className={`p-3.5 rounded-xl border-[1.5px] text-[14px] transition cursor-pointer ${
                                isDone
                                  ? 'border-[#1F6E50]/60 bg-[#EBF5F0] text-[#14533C]'
                                  : isDelayed
                                  ? 'border-[#C94B4B] bg-[#FBEAEA] text-[#8E2820]'
                                  : isInProg
                                  ? 'border-[#B85D35] bg-[#FBF3EE] text-[#181715] shadow-2xs'
                                  : 'border-dashed border-[#CFC8BC] bg-[#FAF8F5] text-[#6E6A63]'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                                    isDone
                                      ? 'bg-[#1F6E50] text-white'
                                      : isDelayed
                                      ? 'bg-[#C94B4B] text-white'
                                      : isInProg
                                      ? 'bg-[#B85D35] text-white'
                                      : 'bg-[#EAE6DF] text-[#6E6A63]'
                                  }`}
                                >
                                  {isDone
                                    ? '✓ Готово'
                                    : isDelayed
                                    ? '! Срок'
                                    : isInProg
                                    ? '● В работе'
                                    : '○ Осталось'}
                                </span>
                                <span className="text-[#6E6A63]">{st.deadline}</span>
                              </div>
                              <div className="font-semibold text-[13.5px] text-[#181715] leading-snug">
                                {stIdx + 1}. {st.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Модели релиза */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#E8E8E5] text-[14px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#737373]">Модели в запуске:</span>
                    {linkedProducts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (p.isScenarioModel && typeof window !== 'undefined') {
                            try {
                              sessionStorage.setItem('borners_open_scenario_model_id', p.id);
                            } catch {
                              // ignore storage errors
                            }
                          }
                          navigateTo('product-catalog', { productId: p.id });
                        }}
                        className="rounded-lg bg-[#F7F7F5] border border-[#E8E8E5] px-3 py-1 text-[13px] font-semibold hover:border-[#171717] transition cursor-pointer"
                      >
                        {p.sku} · {p.name}
                      </button>
                    ))}
                  </div>
                  <span className="text-[13px] text-[#737373]">
                    План в штуках: <b className="text-[#171717]">{launch.salesPlanUnits.toLocaleString('ru-RU')} шт.</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* РЕЖИМ 2: ПО МЕСЯЦАМ */}
      {viewMode === 'calendar' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {calendarMonths.map((m) => {
            const monthLaunches = filteredLaunches.filter((l) =>
              l.startDate.startsWith(m.monthKey)
            );
            return (
              <div
                key={m.monthKey}
                className="bg-white rounded-2xl border border-[#E8E8E5] p-6 space-y-5"
              >
                <div className="flex items-center justify-between border-b border-[#E8E8E5] pb-3">
                  <h3 className="text-[20px] font-bold">{m.label}</h3>
                  <span className="text-[13px] font-semibold text-[#737373] bg-[#F7F7F5] px-2.5 py-0.5 rounded-lg border border-[#E8E8E5]">
                    {monthLaunches.length}
                  </span>
                </div>

                <div className="space-y-4">
                  {monthLaunches.map((l) => (
                    <div
                      key={l.id}
                      onClick={() => setSelectedLaunchId(l.id)}
                      className="rounded-xl border border-[#E8E8E5] hover:border-[#171717] p-5 cursor-pointer transition space-y-2"
                    >
                      <div className="flex items-center justify-between text-[13px] font-semibold">
                        <span
                          style={{
                            color: l.brandId === 'BORNERS' ? '#D97745' : '#8B8078',
                          }}
                        >
                          {formatLabBrandLabel(l.brandId)}
                        </span>
                        <span className="text-[#737373]">{l.startDate}</span>
                      </div>
                      <div className="text-[18px] font-bold text-[#171717]">{l.name}</div>
                      <div className="text-[14px] text-[#737373]">{l.collectionName}</div>
                    </div>
                  ))}
                  {monthLaunches.length === 0 && (
                    <div className="py-10 text-center text-[14px] text-[#737373] rounded-xl border border-dashed border-[#E8E8E5]">
                      Запусков не запланировано
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* РЕЖИМ 3: ТАБЛИЦА ЗАПУСКОВ */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-[#E8E8E5] overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-[#E8E8E5] text-[13px] font-semibold uppercase tracking-wider text-[#737373] bg-[#F7F7F5]/60">
              <tr>
                <th className="py-4 px-6">Релиз и коллекция</th>
                <th className="py-4 px-4">Бренд</th>
                <th className="py-4 px-4">Старт продаж</th>
                <th className="py-4 px-4 text-right">Готовность</th>
                <th className="py-4 px-4 text-right">План выручки</th>
                <th className="py-4 px-6 text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {filteredLaunches.map((l) => (
                <tr key={l.id} className="hover:bg-[#F7F7F5]/60 transition">
                  <td className="py-4 px-6">
                    <div className="font-semibold text-[16px] text-[#171717]">{l.name}</div>
                    <div className="text-[13px] text-[#737373]">{l.collectionName}</div>
                  </td>
                  <td className="py-4 px-4 font-semibold">
                    {formatLabBrandLabel(l.brandId)}
                  </td>
                  <td className="py-4 px-4 font-semibold">{l.startDate}</td>
                  <td className="py-4 px-4 text-right font-bold text-[#16805D]">
                    {l.readinessPct}%
                  </td>
                  <td className="py-4 px-4 text-right font-semibold">
                    {hasFinance ? formatCompactRub(l.salesPlanRub) : 'Скрыто'}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => setSelectedLaunchId(l.id)}
                      className="rounded-xl border border-[#E8E8E5] px-4 py-2 text-[14px] font-semibold hover:bg-[#111111] hover:text-white cursor-pointer"
                    >
                      Открыть →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* РЕЖИМ 4: ДОСКА СТАТУСОВ С DRAG & DROP */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
          {LAUNCH_STATUS_COLUMNS.map((statusCol) => {
            const items = filteredLaunches.filter((l) => l.status === statusCol);
            const isDropTarget = dragOverStatus === statusCol;

            return (
              <div
                key={statusCol}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStatus !== statusCol) setDragOverStatus(statusCol);
                }}
                onDragLeave={() => setDragOverStatus(null)}
                onDrop={(e) => handleLaunchDrop(e, statusCol)}
                className={`p-4 rounded-2xl min-h-[440px] border transition-all ${
                  isDropTarget
                    ? 'bg-white border-2 border-[#D97745] shadow-lg'
                    : 'bg-white/70 border-[#E8E8E5]'
                }`}
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E8E8E5]">
                  <span className="text-[14px] font-bold text-[#171717]">
                    {statusCol}
                  </span>
                  <span className="text-[13px] font-semibold text-[#737373] bg-[#F7F7F5] px-2.5 py-0.5 rounded-lg border border-[#E8E8E5]">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-3.5">
                  {items.map((l) => {
                    const canEdit = canUserEditBrand(
                      currentUser,
                      normalizeLabBrandCode(l.brandId)
                    );
                    return (
                      <div
                        key={l.id}
                        draggable={canEdit && !isStrategyMode}
                        onDragStart={(e) => handleLaunchDragStart(e, l.id)}
                        onDragEnd={() => {
                          setDraggedLaunchId(null);
                          setDragOverStatus(null);
                        }}
                        onClick={() => setSelectedLaunchId(l.id)}
                        className={`bg-white rounded-xl border border-[#E8E8E5] hover:border-[#171717] p-4 space-y-2.5 transition ${
                          canEdit && !isStrategyMode
                            ? 'cursor-grab active:cursor-grabbing'
                            : 'cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[13px] font-semibold">
                          <span className="inline-flex items-center gap-1.5">
                            {canEdit && !isStrategyMode && (
                              <GripVertical className="h-4 w-4 text-[#737373]" />
                            )}
                            {formatLabBrandLabel(l.brandId)}
                          </span>
                          <span className="text-[#737373]">{l.startDate}</span>
                        </div>
                        <div className="text-[16px] font-bold text-[#171717]">{l.name}</div>
                        <div className="text-[14px] text-[#737373]">{l.collectionName}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модальное окно переноса даты с проверкой конфликтов */}
      {rescheduleModalLaunch && (
        <div
          onClick={() => setRescheduleModalLaunch(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E8E8E5] p-8 space-y-6 shadow-2xl"
          >
            <h3 className="text-[22px] font-bold border-b border-[#E8E8E5] pb-4">
              Перенос даты: {rescheduleModalLaunch.name}
            </h3>

            <div className="space-y-4 text-[14px]">
              <div>
                <label className="block font-semibold mb-1.5">Новая дата старта продаж</label>
                <input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={shiftDependents}
                  onChange={(e) => setShiftDependents(e.target.checked)}
                  className="h-4 w-4 accent-[#111111]"
                />
                <span className="font-medium text-[#171717]">
                  Автоматически сдвинуть дедлайны этапов и связанных задач
                </span>
              </label>
            </div>

            {previewConflicts && previewConflicts.conflicts.length > 0 && (
              <div className="rounded-xl border border-[#C94B4B] bg-[#C94B4B]/5 p-4 space-y-2 text-[14px]">
                <div className="font-semibold text-[#C94B4B] flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>
                    Обнаружены затрагиваемые сроки ({previewConflicts.conflicts.length}):
                  </span>
                </div>
                <ul className="space-y-1 text-[#171717] max-h-40 overflow-y-auto">
                  {previewConflicts.conflicts.map((c, idx) => (
                    <li key={idx}>
                      • {c.title}: {c.currentDeadline} → {c.suggestedDeadline} ({c.reason})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E8E5]">
              <button
                onClick={() => setRescheduleModalLaunch(null)}
                className="h-11 px-5 rounded-xl border border-[#E8E8E5] text-[14px] font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  rescheduleLaunch(
                    rescheduleModalLaunch.id,
                    newStartDate,
                    shiftDependents
                  );
                  setRescheduleModalLaunch(null);
                }}
                className="h-11 px-6 rounded-xl bg-[#111111] text-white text-[14px] font-semibold cursor-pointer"
              >
                Применить дату
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Боковая панель этапов релиза (расширенное управление 10 этапами и привязкой SKU) */}
      {activeLaunch && (() => {
        const canEditActiveLaunch =
          !isStrategyMode &&
          canUserEditBrand(currentUser, normalizeLabBrandCode(activeLaunch.brandId));
        const activeLinkedSkus = resolveLinkedSkus(activeLaunch.productIds);
        const activeLinkedSkuCodes = new Set(
          activeLinkedSkus.map((s) => (s.sku || '').trim().toUpperCase()).filter(Boolean)
        );

        return (
          <div
            onClick={() => setSelectedLaunchId(null)}
            className="fixed inset-0 z-50 flex justify-end bg-black/40"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl bg-white h-full overflow-y-auto p-8 md:p-10 space-y-8 shadow-2xl border-l border-[#E8E8E5]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#E8E8E5] pb-6">
                <div>
                  <div className="text-[13px] font-semibold uppercase text-[#737373]">
                    {formatLabBrandLabel(activeLaunch.brandId)} · Старт:{' '}
                    {activeLaunch.startDate}
                  </div>
                  <h2 className="text-[28px] font-bold text-[#171717] mt-1">
                    {activeLaunch.name}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-[#737373]">
                      Статус запуска:
                    </span>
                    <select
                      aria-label="Статус запуска"
                      disabled={!canEditActiveLaunch}
                      value={activeLaunch.status}
                      onChange={(e) => {
                        if (!canEditActiveLaunch) return;
                        const nextStatus = e.target.value as Launch['status'];
                        updateLaunch(activeLaunch.id, {
                          status: nextStatus,
                          ...(nextStatus === 'Запущен' ? { readinessPct: 100 } : {}),
                        });
                      }}
                      className="h-9 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 text-[13.5px] font-semibold text-[#171717] disabled:opacity-60 cursor-pointer"
                    >
                      {Array.from(
                        new Set<Launch['status']>([
                          ...LAUNCH_STATUS_COLUMNS,
                          activeLaunch.status,
                        ])
                      ).map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLaunchId(null)}
                  className="rounded-xl border border-[#E8E8E5] p-2 text-[#171717] cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Привязанные модели SKU — аккуратные карточки моделей + выпадающий список добавления */}
              <div className="rounded-2xl bg-[#FAF8F5] border-[1.5px] border-[#CFC8BC] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-[#7A756D]">
                      СОСТАВ РЕЛИЗА · ПРИВЯЗАННЫЕ МОДЕЛИ
                    </div>
                    <div className="text-[16px] font-bold text-[#181715]">
                      Модели, входящие в этот запуск ({activeLinkedSkus.length})
                    </div>
                  </div>

                  {canEditActiveLaunch && (
                    <select
                      value=""
                      onChange={(e) => {
                        const pid = e.target.value;
                        if (!pid) return;
                        if (!activeLaunch.productIds.includes(pid)) {
                          updateLaunch(activeLaunch.id, {
                            productIds: [...activeLaunch.productIds, pid],
                          });
                        }
                      }}
                      className="h-9 rounded-[8px] border-[1.5px] border-[#181715] bg-white px-3 text-[12.5px] font-semibold text-[#181715] cursor-pointer"
                    >
                      <option value="">+ Привязать модель из каталога...</option>
                      {selectableCatalogSkus
                        .filter(
                          (p) =>
                            !activeLaunch.productIds.includes(p.id) &&
                            !activeLinkedSkuCodes.has((p.sku || '').trim().toUpperCase())
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.name} ({formatLabBrandLabel(p.brandId)})
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                {activeLinkedSkus.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeLinkedSkus.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl bg-white border-[1.5px] border-[#D4CDC2] p-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {p.imageUrl ? (
                            <img
                              src={resolvePublicAssetUrl(p.imageUrl)}
                              alt={p.name}
                              loading="lazy"
                              decoding="async"
                              className="h-12 w-12 rounded-lg object-contain bg-[#F3EFE8] border border-[#E5E0D8] p-1 shrink-0"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-[#F3EFE8] border border-[#E5E0D8] flex items-center justify-center font-mono text-[10px] font-bold text-[#7A756D] shrink-0">
                              SKU
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-semibold text-[#B85D35]">
                              {p.sku}
                            </div>
                            <div className="text-[13.5px] font-semibold text-[#181715] truncate">
                              {p.name}
                            </div>
                          </div>
                        </div>

                        {canEditActiveLaunch && (
                          <button
                            type="button"
                            onClick={() =>
                              updateLaunch(activeLaunch.id, {
                                productIds: activeLaunch.productIds.filter((id) => id !== p.id),
                              })
                            }
                            className="px-2.5 py-1 rounded-[6px] border border-[#D4CDC2] hover:border-[#B93829] hover:text-[#B93829] text-[11.5px] font-medium text-[#6E6A63] shrink-0 cursor-pointer transition"
                          >
                            Убрать
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#D4CDC2] bg-white p-4 text-center text-[13px] text-[#7A756D]">
                    К этому релизу пока не привязаны модели. Выберите артикул в списке «+ Привязать модель из каталога...» выше.
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#E8E8E5] pb-3">
                  <h3 className="text-[20px] font-bold">
                    10 этапов подготовки релиза (готовность: {activeLaunch.readinessPct}%)
                  </h3>
                  {canEditActiveLaunch && (
                    <button
                      onClick={() => {
                        createTask({
                          title: `Подготовка к запуску ${activeLaunch.name}`,
                          description: `Операционная задача по релизу ${activeLaunch.collectionName}`,
                          brandId: activeLaunch.brandId,
                          projectId: 'proj-1',
                          priority: 'High',
                          assigneeId: users[0]?.id || 'user-owner',
                          deadline: activeLaunch.startDate,
                          launchId: activeLaunch.id,
                        });
                      }}
                      className="rounded-xl border border-[#E8E8E5] px-3.5 py-1.5 text-[13px] font-semibold hover:bg-[#111111] hover:text-white cursor-pointer"
                    >
                      + Создать задачу по запуску
                    </button>
                  )}
                </div>

                <div className="divide-y divide-[#E8E8E5] rounded-2xl border border-[#E8E8E5] overflow-hidden">
                  {activeLaunch.stages.map((st) => (
                    <div
                      key={st.code}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-[#F7F7F5]/60"
                    >
                      <label className="flex items-center gap-3 text-[15px] cursor-pointer min-w-[210px]">
                        <input
                          type="checkbox"
                          disabled={!canEditActiveLaunch}
                          checked={st.status === 'Done'}
                          onChange={(e) => {
                            const updatedStages = activeLaunch.stages.map((s) =>
                              s.code === st.code
                                ? {
                                    ...s,
                                    status: (e.target.checked ? 'Done' : 'Pending') as
                                      | 'Done'
                                      | 'In Progress'
                                      | 'Pending'
                                      | 'Delayed',
                                  }
                                : s
                            );
                            const doneCount = updatedStages.filter(
                              (s) => s.status === 'Done'
                            ).length;
                            const pct = Math.round(
                              (doneCount / updatedStages.length) * 100
                            );
                            updateLaunch(activeLaunch.id, {
                              stages: updatedStages,
                              readinessPct: pct,
                            });
                          }}
                          className="h-5 w-5 accent-[#16805D]"
                        />
                        <span
                          className={
                            st.status === 'Done'
                              ? 'line-through text-[#737373]'
                              : 'font-semibold text-[#171717]'
                          }
                        >
                          {st.label}
                        </span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2 text-[13px]">
                        <select
                          disabled={!canEditActiveLaunch}
                          value={st.status}
                          onChange={(e) => {
                            const nextStatus = e.target.value as typeof st.status;
                            const updatedStages = activeLaunch.stages.map((s) =>
                              s.code === st.code ? { ...s, status: nextStatus } : s
                            );
                            const doneCount = updatedStages.filter(
                              (s) => s.status === 'Done'
                            ).length;
                            const pct = Math.round(
                              (doneCount / updatedStages.length) * 100
                            );
                            updateLaunch(activeLaunch.id, {
                              stages: updatedStages,
                              readinessPct: pct,
                            });
                          }}
                          className="h-9 rounded-lg border border-[#E8E8E5] bg-white px-2.5 font-semibold"
                        >
                          <option value="Done">Готово</option>
                          <option value="In Progress">В работе</option>
                          <option value="Pending">Ожидает</option>
                          <option value="Delayed">Задержка</option>
                        </select>

                        <select
                          disabled={!canEditActiveLaunch}
                          value={st.ownerId}
                          onChange={(e) => {
                            const updatedStages = activeLaunch.stages.map((s) =>
                              s.code === st.code ? { ...s, ownerId: e.target.value } : s
                            );
                            updateLaunch(activeLaunch.id, { stages: updatedStages });
                          }}
                          className="h-9 rounded-lg border border-[#E8E8E5] bg-white px-2.5 text-[#737373]"
                        >
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName.split(' ')[0]}
                            </option>
                          ))}
                        </select>

                        <input
                          type="date"
                          disabled={!canEditActiveLaunch}
                          value={st.deadline}
                          onChange={(e) => {
                            const updatedStages = activeLaunch.stages.map((s) =>
                              s.code === st.code ? { ...s, deadline: e.target.value } : s
                            );
                            updateLaunch(activeLaunch.id, { stages: updatedStages });
                          }}
                          className="h-9 rounded-lg border border-[#E8E8E5] bg-white px-2.5 font-medium"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Модальное окно создания запуска */}
      {createModalOpen && (
        <div
          onClick={() => setCreateModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E8E8E5] p-8 space-y-5 shadow-2xl"
          >
            <h3 className="text-[22px] font-bold border-b border-[#E8E8E5] pb-4">
              Планирование нового релиза
            </h3>
            <div className="space-y-4 text-[14px]">
              <div>
                <label className="block font-semibold mb-1.5">Название запуска</label>
                <input
                  value={newLaunchForm.name}
                  onChange={(e) =>
                    setNewLaunchForm({ ...newLaunchForm, name: e.target.value })
                  }
                  placeholder="Например: DROP 04 · SUMMER SKIN"
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1.5">Бренд</label>
                  <select
                    value={newLaunchForm.brandId}
                    onChange={(e) =>
                      setNewLaunchForm({
                        ...newLaunchForm,
                        brandId: normalizeLabBrandCode(e.target.value),
                      })
                    }
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px] bg-white font-medium"
                  >
                    {editableLaunchBrands.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1.5">Дата старта</label>
                  <input
                    type="date"
                    value={newLaunchForm.startDate}
                    onChange={(e) =>
                      setNewLaunchForm({ ...newLaunchForm, startDate: e.target.value })
                    }
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E8E5]">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="h-11 px-5 rounded-xl border border-[#E8E8E5] text-[14px] font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!newLaunchForm.name.trim()) return;
                  createLaunch({
                    name: newLaunchForm.name.trim(),
                    brandId: newLaunchForm.brandId,
                    collectionName: newLaunchForm.collectionName,
                    startDate: newLaunchForm.startDate,
                    marketingBudgetRub: Number(newLaunchForm.marketingBudgetRub) || 800000,
                    salesPlanUnits: Number(newLaunchForm.salesPlanUnits) || 4000,
                    salesPlanRub: Number(newLaunchForm.salesPlanRub) || 8500000,
                    ownerId: currentUser.id,
                  });
                  setCreateModalOpen(false);
                }}
                className="h-11 px-6 rounded-xl bg-[#111111] text-white text-[14px] font-semibold cursor-pointer"
              >
                Запланировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// МАРКЕТИНГ, КАМПАНИИ И ЭКСПЕРИМЕНТЫ РОСТА (п. 9 ТЗ)
// =============================================================================
export function MarketingGrowthView() {
  const {
    campaigns,
    experiments,
    brandFilter,
    platformMode,
    currentUser,
    createCampaign,
    updateCampaign,
    createExperiment,
    updateExperiment,
  } = usePlatform();

  const isStrategyMode = platformMode === 'strategy';
  const [tab, setTab] = useState<'campaigns' | 'experiments'>('campaigns');
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [campModalOpen, setCampModalOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);

  const selectedCampaign: Campaign | null = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );

  const selectedExperiment: GrowthExperiment | null = useMemo(
    () => experiments.find((e) => e.id === selectedExperimentId) || null,
    [experiments, selectedExperimentId]
  );

  const [expForm, setExpForm] = useState({
    hypothesis: '',
    brandId: brandFilter !== 'ALL' ? normalizeLabBrandCode(brandFilter) : 'BORNERS',
    rationale: '',
    method: 'A/B тест карточек и видеообложек',
    successCriteria: 'Рост CTR на +1.2 п.п.',
    budgetRub: '120000',
  });

  const [campForm, setCampForm] = useState({
    name: '',
    brandId: brandFilter !== 'ALL' ? normalizeLabBrandCode(brandFilter) : 'BORNERS',
    channel: 'Wildberries' as MarketingChannel,
    goal: 'Масштабирование выкупов базовой капсулы',
    periodLabel: 'Февраль — Март 2027',
    plannedBudgetRub: '450000',
    plannedRevenueRub: '3200000',
  });

  const hasFinance = canUserViewFinance(currentUser);
  const editableLaunchBrands = useMemo(
    () => EDITABLE_BRAND_OPTIONS.filter((b) => canUserEditBrand(currentUser, b.code)),
    [currentUser]
  );
  const canCreateMarketing =
    !isStrategyMode &&
    editableLaunchBrands.length > 0 &&
    (brandFilter === 'ALL'
      ? currentUser.role !== 'Viewer' && currentUser.role !== 'Partner'
      : canUserEditBrand(currentUser, normalizeLabBrandCode(brandFilter)));
  const canEditSelectedCampaign = selectedCampaign
    ? !isStrategyMode &&
      (selectedCampaign.brandId === 'ALL'
        ? currentUser.role === 'Owner' || currentUser.role === 'Admin'
        : canUserEditBrand(currentUser, normalizeLabBrandCode(selectedCampaign.brandId)))
    : false;
  const canEditSelectedExperiment = selectedExperiment
    ? !isStrategyMode &&
      (selectedExperiment.brandId === 'ALL'
        ? currentUser.role === 'Owner' || currentUser.role === 'Admin'
        : canUserEditBrand(currentUser, normalizeLabBrandCode(selectedExperiment.brandId)))
    : false;

  const filteredCampaigns = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          !c.isArchived &&
          (c.brandId === 'ALL' ||
            canUserViewBrandConcept(currentUser, normalizeLabBrandCode(c.brandId))) &&
          (brandFilter === 'ALL' ||
            c.brandId === 'ALL' ||
            normalizeLabBrandCode(c.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [campaigns, brandFilter, currentUser]
  );

  const filteredExperiments = useMemo(
    () =>
      experiments.filter(
        (e) =>
          (e.brandId === 'ALL' ||
            canUserViewBrandConcept(currentUser, normalizeLabBrandCode(e.brandId))) &&
          (brandFilter === 'ALL' ||
            e.brandId === 'ALL' ||
            normalizeLabBrandCode(e.brandId) === normalizeLabBrandCode(brandFilter))
      ),
    [experiments, brandFilter, currentUser]
  );

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#E8E8E5] pb-6">
        <div>
          <div className="text-[13px] font-medium uppercase tracking-widest text-[#737373] mb-1.5">
            Продвижение, кампании и гипотезы роста
          </div>
          <h1 className="text-[34px] md:text-[40px] font-bold tracking-[-0.03em] text-[#171717] dark:text-white">
            Маркетинг и рост
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[#F7F7F5] p-1 rounded-xl border border-[#E8E8E5]">
            <button
              onClick={() => setTab('campaigns')}
              className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition cursor-pointer ${
                tab === 'campaigns'
                  ? 'bg-white text-[#171717] shadow-2xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Кампании ({filteredCampaigns.length})
            </button>
            <button
              onClick={() => setTab('experiments')}
              className={`px-4 py-2 rounded-lg text-[14px] font-semibold transition cursor-pointer ${
                tab === 'experiments'
                  ? 'bg-white text-[#171717] shadow-2xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Тесты гипотез ({filteredExperiments.length})
            </button>
          </div>

          {canCreateMarketing && (
            <button
              onClick={() => {
                const defaultBrand =
                  brandFilter !== 'ALL' &&
                  canUserEditBrand(currentUser, normalizeLabBrandCode(brandFilter))
                    ? normalizeLabBrandCode(brandFilter)
                    : editableLaunchBrands[0]?.code || 'BORNERS';
                if (tab === 'campaigns') {
                  setCampForm((prev) => ({
                    ...prev,
                    brandId: canUserEditBrand(currentUser, prev.brandId)
                      ? prev.brandId
                      : defaultBrand,
                  }));
                  setCampModalOpen(true);
                } else {
                  setExpForm((prev) => ({
                    ...prev,
                    brandId: canUserEditBrand(currentUser, prev.brandId)
                      ? prev.brandId
                      : defaultBrand,
                  }));
                  setExpModalOpen(true);
                }
              }}
              className="h-11 px-5 rounded-xl bg-[#111111] text-white text-[15px] font-semibold cursor-pointer"
            >
              {tab === 'campaigns' ? '+ Новая кампания' : '+ Новая гипотеза'}
            </button>
          )}
        </div>
      </div>

      {/* Вкладка 1: Таблица кампаний */}
      {tab === 'campaigns' && (
        <div className="bg-white rounded-2xl border border-[#E8E8E5] overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-[#E8E8E5] text-[13px] font-semibold uppercase tracking-wider text-[#737373] bg-[#F7F7F5]/60">
              <tr>
                <th className="py-4 px-6">Кампания и цель</th>
                <th className="py-4 px-4">Бренд и канал</th>
                <th className="py-4 px-4">Период</th>
                <th className="py-4 px-4 text-right">План бюджета</th>
                <th className="py-4 px-4 text-right">План выручки</th>
                <th className="py-4 px-4 text-right">Факт выручки</th>
                <th className="py-4 px-6 text-right">ROAS / ДРР</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E8E5]">
              {filteredCampaigns.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCampaignId(c.id)}
                  className="hover:bg-[#F7F7F5]/60 transition cursor-pointer"
                >
                  <td className="py-4 px-6">
                    <div className="font-semibold text-[16px] text-[#171717]">{c.name}</div>
                    <div className="text-[13px] text-[#737373]">{c.goal}</div>
                  </td>
                  <td className="py-4 px-4 font-semibold">
                    {c.brandId === 'ALL' ? 'Вся группа' : formatLabBrandLabel(c.brandId)} · {c.channel}
                  </td>
                  <td className="py-4 px-4 text-[#737373]">{c.periodLabel}</td>
                  <td className="py-4 px-4 text-right font-semibold">
                    {hasFinance ? formatCurrencyRub(c.plannedBudgetRub) : 'Скрыто'}
                  </td>
                  <td className="py-4 px-4 text-right">
                    {hasFinance ? formatCurrencyRub(c.plannedRevenueRub) : 'Скрыто'}
                  </td>
                  <td className="py-4 px-4 text-right font-semibold">
                    {!hasFinance ? (
                      'Скрыто'
                    ) : c.actualRevenueRub !== null ? (
                      formatCurrencyRub(c.actualRevenueRub)
                    ) : (
                      <span className="text-[#737373]">Нет данных</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right font-bold">
                    {!hasFinance ? (
                      <span className="text-[#737373] font-semibold">Скрыто</span>
                    ) : c.metrics.roas !== null && c.metrics.roas !== undefined ? (
                      <span className="text-[#16805D]">
                        {c.metrics.roas}x ({c.metrics.drrPct}% ДРР)
                      </span>
                    ) : (
                      <span className="text-[#737373]">Нет данных</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Вкладка 2: Тесты гипотез */}
      {tab === 'experiments' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredExperiments.map((exp) => (
            <div
              key={exp.id}
              onClick={() => setSelectedExperimentId(exp.id)}
              className="bg-white rounded-2xl border border-[#E8E8E5] hover:border-[#171717] p-7 flex flex-col justify-between space-y-5 cursor-pointer transition"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#E8E8E5] pb-3 text-[13px]">
                  <span className="font-semibold text-[#737373]">
                    {exp.brandId === 'ALL' ? 'Вся группа' : formatLabBrandLabel(exp.brandId)} · {exp.timeframe}
                  </span>
                  <span className="font-semibold px-2.5 py-0.5 rounded-lg bg-[#F7F7F5] border border-[#E8E8E5]">
                    {EXPERIMENT_STATUS_LABELS_RU[exp.status]}
                  </span>
                </div>

                <h3 className="text-[20px] font-bold text-[#171717]">{exp.hypothesis}</h3>
                <p className="text-[15px] text-[#737373] leading-relaxed">{exp.rationale}</p>
              </div>

              <div className="pt-4 border-t border-[#E8E8E5] space-y-2 text-[14px]">
                <div className="flex justify-between">
                  <span className="text-[#737373]">Критерий успеха:</span>
                  <b className="text-[#171717]">{exp.successCriteria}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373]">Итог и решение:</span>
                  <b className="text-[#16805D]">{exp.resultSummary || exp.decision}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* БОКОВАЯ ПАНЕЛЬ КАМПАНИИ И ФАКТИЧЕСКИХ МЕТРИК (ДРР, ROAS, ВЫКУПЫ) */}
      {selectedCampaign && (
        <div
          onClick={() => setSelectedCampaignId(null)}
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white h-full overflow-y-auto p-8 space-y-6 shadow-2xl border-l border-[#E8E8E5]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E8E8E5] pb-5">
              <div>
                <div className="text-[12px] font-semibold uppercase text-[#737373]">
                  Маркетинговая кампания · {selectedCampaign.channel}
                </div>
                <h2 className="text-[24px] font-bold text-[#171717] mt-1">
                  {selectedCampaign.name}
                </h2>
              </div>
              <button
                onClick={() => setSelectedCampaignId(null)}
                className="rounded-xl border border-[#E8E8E5] p-2 text-[#171717] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-[14px]">
              <div>
                <label className="block font-semibold text-[#737373] mb-1">
                  Статус кампании
                </label>
                <select
                  disabled={!canEditSelectedCampaign}
                  value={selectedCampaign.status}
                  onChange={(e) =>
                    updateCampaign(selectedCampaign.id, {
                      status: e.target.value as Campaign['status'],
                    })
                  }
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3 font-semibold bg-white"
                >
                  <option value="Запланирована">Запланирована</option>
                  <option value="Активна">Активна</option>
                  <option value="Завершена">Завершена</option>
                  <option value="На паузе">На паузе</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#737373] mb-1">Период</label>
                <input
                  disabled={!canEditSelectedCampaign}
                  value={selectedCampaign.periodLabel}
                  onChange={(e) =>
                    updateCampaign(selectedCampaign.id, {
                      periodLabel: e.target.value,
                    })
                  }
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3 font-semibold"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#737373] mb-1">
                  Фактический расход (₽)
                </label>
                {hasFinance ? (
                  <input
                    type="number"
                    disabled={!canEditSelectedCampaign}
                    placeholder="Нет данных"
                    value={selectedCampaign.actualBudgetRub ?? ''}
                    onChange={(e) => {
                      const spend = e.target.value === '' ? null : Number(e.target.value);
                      const rev = selectedCampaign.actualRevenueRub;
                      const roas =
                        spend !== null && rev !== null && spend > 0 && rev > 0
                          ? Number((rev / spend).toFixed(1))
                          : null;
                      const drrPct =
                        spend !== null && rev !== null && spend > 0 && rev > 0
                          ? Number(((spend / rev) * 100).toFixed(1))
                          : null;
                      updateCampaign(selectedCampaign.id, {
                        actualBudgetRub: spend,
                        metrics: {
                          ...selectedCampaign.metrics,
                          spendRub: spend,
                          roas,
                          drrPct,
                        },
                      });
                    }}
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3 font-semibold"
                  />
                ) : (
                  <div className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 flex items-center font-semibold text-[#737373]">
                    Скрыто
                  </div>
                )}
              </div>
              <div>
                <label className="block font-semibold text-[#737373] mb-1">
                  Фактическая выручка (₽)
                </label>
                {hasFinance ? (
                  <input
                    type="number"
                    disabled={!canEditSelectedCampaign}
                    placeholder="Нет данных"
                    value={selectedCampaign.actualRevenueRub ?? ''}
                    onChange={(e) => {
                      const rev = e.target.value === '' ? null : Number(e.target.value);
                      const spend = selectedCampaign.actualBudgetRub;
                      const roas =
                        spend !== null && rev !== null && spend > 0 && rev > 0
                          ? Number((rev / spend).toFixed(1))
                          : null;
                      const drrPct =
                        spend !== null && rev !== null && spend > 0 && rev > 0
                          ? Number(((spend / rev) * 100).toFixed(1))
                          : null;
                      updateCampaign(selectedCampaign.id, {
                        actualRevenueRub: rev,
                        metrics: {
                          ...selectedCampaign.metrics,
                          revenueRub: rev,
                          roas,
                          drrPct,
                        },
                      });
                    }}
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3 font-semibold"
                  />
                ) : (
                  <div className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 flex items-center font-semibold text-[#737373]">
                    Скрыто
                  </div>
                )}
              </div>
              <div>
                <label className="block font-semibold text-[#737373] mb-1">
                  Клики (шт.)
                </label>
                <input
                  type="number"
                  disabled={!canEditSelectedCampaign}
                  value={selectedCampaign.metrics.clicks ?? ''}
                  onChange={(e) =>
                    updateCampaign(selectedCampaign.id, {
                      metrics: {
                        ...selectedCampaign.metrics,
                        clicks: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3 font-semibold"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#737373] mb-1">
                  Выкупы (шт.)
                </label>
                <input
                  type="number"
                  disabled={!canEditSelectedCampaign}
                  value={selectedCampaign.metrics.buyouts ?? ''}
                  onChange={(e) =>
                    updateCampaign(selectedCampaign.id, {
                      metrics: {
                        ...selectedCampaign.metrics,
                        buyouts: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3 font-semibold"
                />
              </div>
            </div>

            <div className="rounded-2xl bg-[#F7F7F5] border border-[#E8E8E5] p-5 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[12px] text-[#737373]">Расчётный ROAS</div>
                <div className="text-[22px] font-bold text-[#16805D] mt-1">
                  {!hasFinance
                    ? 'Скрыто'
                    : selectedCampaign.metrics.roas !== null &&
                      selectedCampaign.metrics.roas !== undefined
                    ? `${selectedCampaign.metrics.roas}x`
                    : 'Нет данных'}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-[#737373]">Доля рекламных расходов (ДРР)</div>
                <div className="text-[22px] font-bold text-[#171717] mt-1">
                  {!hasFinance
                    ? 'Скрыто'
                    : selectedCampaign.metrics.drrPct !== null &&
                      selectedCampaign.metrics.drrPct !== undefined
                    ? `${selectedCampaign.metrics.drrPct}%`
                    : 'Нет данных'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* БОКОВАЯ ПАНЕЛЬ ТЕСТА ГИПОТЕЗЫ РОСТА */}
      {selectedExperiment && (
        <div
          onClick={() => setSelectedExperimentId(null)}
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white h-full overflow-y-auto p-8 space-y-6 shadow-2xl border-l border-[#E8E8E5]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E8E8E5] pb-5">
              <div>
                <div className="text-[12px] font-semibold uppercase text-[#737373]">
                  Эксперимент роста · {selectedExperiment.timeframe}
                </div>
                <h2 className="text-[22px] font-bold text-[#171717] mt-1">
                  {selectedExperiment.hypothesis}
                </h2>
              </div>
              <button
                onClick={() => setSelectedExperimentId(null)}
                className="rounded-xl border border-[#E8E8E5] p-2 text-[#171717] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-[14px]">
              <div>
                <label className="block font-semibold text-[#737373] mb-1">
                  Статус эксперимента
                </label>
                <select
                  disabled={!canEditSelectedExperiment}
                  value={selectedExperiment.status}
                  onChange={(e) =>
                    updateExperiment(selectedExperiment.id, {
                      status: e.target.value as ExperimentStatus,
                    })
                  }
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3 font-semibold bg-white"
                >
                  {(
                    [
                      'Planned',
                      'Running',
                      'Completed',
                      'Successful',
                      'Unsuccessful',
                    ] as ExperimentStatus[]
                  ).map((st) => (
                    <option key={st} value={st}>
                      {EXPERIMENT_STATUS_LABELS_RU[st]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#737373] mb-1">
                  Фактический результат замеров
                </label>
                <textarea
                  rows={3}
                  disabled={!canEditSelectedExperiment}
                  value={selectedExperiment.resultSummary}
                  onChange={(e) =>
                    updateExperiment(selectedExperiment.id, {
                      resultSummary: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-[#E8E8E5] p-3.5"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#737373] mb-1">
                  Управленческое решение
                </label>
                <input
                  disabled={!canEditSelectedExperiment}
                  value={selectedExperiment.decision}
                  onChange={(e) =>
                    updateExperiment(selectedExperiment.id, {
                      decision: e.target.value,
                    })
                  }
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 font-semibold"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно новой кампании */}
      {campModalOpen && (
        <div
          onClick={() => setCampModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E8E8E5] p-8 space-y-5 shadow-2xl"
          >
            <h3 className="text-[22px] font-bold border-b border-[#E8E8E5] pb-4">
              Новая маркетинговая кампания
            </h3>
            <div className="space-y-4 text-[14px]">
              <div>
                <label className="block font-semibold mb-1.5">Название кампании</label>
                <input
                  value={campForm.name}
                  onChange={(e) => setCampForm({ ...campForm, name: e.target.value })}
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1.5">Бренд</label>
                  <select
                    value={campForm.brandId}
                    onChange={(e) =>
                      setCampForm({
                        ...campForm,
                        brandId: normalizeLabBrandCode(e.target.value),
                      })
                    }
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px] bg-white font-medium"
                  >
                    {editableLaunchBrands.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1.5">План бюджета (₽)</label>
                  <input
                    type="number"
                    value={campForm.plannedBudgetRub}
                    onChange={(e) =>
                      setCampForm({ ...campForm, plannedBudgetRub: e.target.value })
                    }
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E8E5]">
              <button
                onClick={() => setCampModalOpen(false)}
                className="h-11 px-5 rounded-xl border border-[#E8E8E5] text-[14px] font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!campForm.name.trim()) return;
                  createCampaign({
                    name: campForm.name.trim(),
                    brandId: campForm.brandId,
                    channel: campForm.channel,
                    goal: campForm.goal,
                    productIds: [],
                    periodLabel: campForm.periodLabel,
                    plannedBudgetRub: Number(campForm.plannedBudgetRub) || 400000,
                    actualBudgetRub: null,
                    plannedRevenueRub: Number(campForm.plannedRevenueRub) || 2800000,
                    actualRevenueRub: null,
                    ownerId: currentUser.id,
                    status: 'Запланирована',
                    metrics: {},
                  });
                  setCampModalOpen(false);
                }}
                className="h-11 px-6 rounded-xl bg-[#111111] text-white text-[14px] font-semibold cursor-pointer"
              >
                Создать кампанию
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно новой гипотезы */}
      {expModalOpen && (
        <div
          onClick={() => setExpModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E8E8E5] p-8 space-y-5 shadow-2xl"
          >
            <h3 className="text-[22px] font-bold border-b border-[#E8E8E5] pb-4">
              Запуск маркетингового теста
            </h3>
            <div className="space-y-4 text-[14px]">
              <div>
                <label className="block font-semibold mb-1.5">Бренд</label>
                <select
                  value={expForm.brandId}
                  onChange={(e) =>
                    setExpForm({
                      ...expForm,
                      brandId: normalizeLabBrandCode(e.target.value),
                    })
                  }
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px] bg-white font-medium"
                >
                  {editableLaunchBrands.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1.5">Формулировка гипотезы</label>
                <input
                  value={expForm.hypothesis}
                  onChange={(e) => setExpForm({ ...expForm, hypothesis: e.target.value })}
                  className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[15px]"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1.5">Обоснование и механика</label>
                <textarea
                  rows={3}
                  value={expForm.rationale}
                  onChange={(e) => setExpForm({ ...expForm, rationale: e.target.value })}
                  className="w-full rounded-xl border border-[#E8E8E5] p-3.5 text-[15px]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E8E5]">
              <button
                onClick={() => setExpModalOpen(false)}
                className="h-11 px-5 rounded-xl border border-[#E8E8E5] text-[14px] font-semibold cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (!expForm.hypothesis.trim()) return;
                  createExperiment({
                    brandId: expForm.brandId,
                    hypothesis: expForm.hypothesis.trim(),
                    rationale: expForm.rationale || 'Проверка влияния визуала на CTR',
                    budgetRub: Number(expForm.budgetRub) || 100000,
                    method: expForm.method,
                    successCriteria: expForm.successCriteria,
                    timeframe: 'Март 2027',
                    resultSummary: 'В очереди на запуск',
                    decision: 'Ожидает замеров',
                    status: 'Planned',
                    ownerId: currentUser.id,
                  });
                  setExpModalOpen(false);
                }}
                className="h-11 px-6 rounded-xl bg-[#111111] text-white text-[14px] font-semibold cursor-pointer"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
