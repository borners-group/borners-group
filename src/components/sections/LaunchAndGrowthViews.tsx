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
    <div className="space-y-8 pb-20">
      {/* Заголовок страницы */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#E4E1DA] pb-5">
        <div>
          <div className="font-mono text-[11.5px] font-medium uppercase tracking-wider text-[#5C5953] mb-1">
            Релизы коллекций и подготовка партий · {filteredLaunches.length} запусков
          </div>
          <h1 className="text-[28px] md:text-[34px] font-semibold tracking-tight text-[#141413]">
            Календарь запусков
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex bg-[#FAF9F6] p-1 rounded-xl border border-[#E4E1DA]">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Дорожная карта
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              По месяцам
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Таблица
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
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
              className="inline-flex items-center gap-1.5 h-10 rounded-lg bg-[#141413] text-white px-4 text-[13.5px] font-medium hover:bg-[#2A2A28] transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[1.5]" />
              <span>Новый запуск</span>
            </button>
          )}
        </div>
      </div>

      {/* РЕЖИМ 1: ДОРОЖНАЯ КАРТА РЕЛИЗОВ */}
      {viewMode === 'timeline' && (
        <div className="space-y-5">
          {filteredLaunches.map((launch) => {
            const linkedProducts = resolveLinkedSkus(launch.productIds);
            const canEditThisLaunch =
              !isStrategyMode &&
              canUserEditBrand(currentUser, normalizeLabBrandCode(launch.brandId));

            return (
              <div
                key={launch.id}
                className="bg-white rounded-2xl border border-[#E4E1DA] p-6 md:p-7 space-y-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[#E4E1DA] pb-5">
                  <div className="flex items-start gap-5 max-w-2xl">
                    {/* Чистое предметное превью запуска */}
                    <div className="h-24 w-24 rounded-xl bg-[#F6F5F2] border border-[#E4E1DA] flex items-center justify-center p-2.5 shrink-0">
                      <img
                        src={resolvePublicAssetUrl(launch.imageUrl)}
                        alt={launch.name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="px-2 py-0.5 rounded bg-[#FAF9F6] border border-[#E4E1DA] font-mono text-[11px] font-medium text-[#141413]">
                          {formatLabBrandLabel(launch.brandId)}
                        </span>
                        <span className="text-[#5C5953]">
                          Старт продаж: <b className="font-mono text-[#141413]">{launch.startDate}</b> ·{' '}
                          {launch.status}
                        </span>
                      </div>
                      <h3
                        onClick={() => setSelectedLaunchId(launch.id)}
                        className="text-[21px] font-semibold tracking-tight text-[#141413] hover:underline cursor-pointer"
                      >
                        {launch.name} · {launch.collectionName}
                      </h3>
                      <p className="text-[13.5px] text-[#5C5953]">
                        Статус партии: {launch.productionStatus}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <div className="text-[11.5px] text-[#5C5953]">План выручки</div>
                      <div className="font-mono text-[20px] font-semibold text-[#141413] mt-0.5">
                        {hasFinance ? formatCompactRub(launch.salesPlanRub) : 'Скрыто'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11.5px] text-[#5C5953]">Готовность</div>
                      <div className="font-mono text-[20px] font-semibold text-emerald-700 mt-0.5">
                        {launch.readinessPct}%
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEditThisLaunch && (
                        <button
                          onClick={() => openRescheduleModal(launch)}
                          className="h-10 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-4 text-[13px] font-medium text-[#141413] hover:border-[#141413] transition-colors cursor-pointer"
                        >
                          Сдвинуть дату
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedLaunchId(launch.id)}
                        className="h-10 rounded-lg bg-[#141413] text-white px-4 text-[13px] font-medium hover:bg-[#2A2A28] transition-colors cursor-pointer"
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
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] px-4 py-2.5 text-[12px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                            ✓ Завершено: {doneCount} из {launch.stages.length}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-medium">
                            ● В работе: {inProgressCount}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white border border-[#E4E1DA] text-[#5C5953] font-medium">
                            ○ Осталось этапов: {remainingCount}
                          </span>
                        </div>
                        <span className="font-mono text-[11.5px] font-medium text-[#141413]">
                          Прогресс: {Math.round((doneCount / Math.max(1, launch.stages.length)) * 100)}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
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
                              className={`p-3 rounded-xl border text-[13px] transition-colors cursor-pointer ${
                                isDone
                                  ? 'border-emerald-200 bg-emerald-50/50 text-[#141413]'
                                  : isDelayed
                                  ? 'border-rose-300 bg-rose-50/60 text-rose-900'
                                  : isInProg
                                  ? 'border-[#141413] bg-white text-[#141413]'
                                  : 'border-dashed border-[#D2CEC4] bg-[#FAF9F6] text-[#5C5953]'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[10.5px] font-mono mb-1.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-medium uppercase ${
                                    isDone
                                      ? 'bg-emerald-700 text-white'
                                      : isDelayed
                                      ? 'bg-rose-700 text-white'
                                      : isInProg
                                      ? 'bg-[#141413] text-white'
                                      : 'bg-[#EFEDE8] text-[#5C5953]'
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
                                <span className="text-[#5C5953]">{st.deadline}</span>
                              </div>
                              <div className="font-medium text-[13px] text-[#141413] leading-snug">
                                <span className="font-mono text-[#5C5953]">{String(stIdx + 1).padStart(2, '0')}</span>{' '}
                                {st.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Модели релиза */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#E4E1DA] text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[#5C5953]">Модели в запуске:</span>
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
                        className="rounded-lg bg-[#FAF9F6] border border-[#E4E1DA] px-2.5 py-1 text-[12.5px] font-medium text-[#141413] hover:border-[#141413] transition-colors cursor-pointer"
                      >
                        <span className="font-mono">{p.sku}</span> · {p.name}
                      </button>
                    ))}
                  </div>
                  <span className="text-[12.5px] text-[#5C5953]">
                    План в штуках: <b className="font-mono text-[#141413]">{launch.salesPlanUnits.toLocaleString('ru-RU')} шт.</b>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* РЕЖИМ 2: ПО МЕСЯЦАМ */}
      {viewMode === 'calendar' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {calendarMonths.map((m) => {
            const monthLaunches = filteredLaunches.filter((l) =>
              l.startDate.startsWith(m.monthKey)
            );
            return (
              <div
                key={m.monthKey}
                className="bg-white rounded-2xl border border-[#E4E1DA] p-6 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-[#E4E1DA] pb-3">
                  <h3 className="text-[18px] font-semibold tracking-tight text-[#141413]">{m.label}</h3>
                  <span className="font-mono text-[12px] font-medium text-[#5C5953] bg-[#FAF9F6] px-2.5 py-0.5 rounded-md border border-[#E4E1DA]">
                    {monthLaunches.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {monthLaunches.map((l) => (
                    <div
                      key={l.id}
                      onClick={() => setSelectedLaunchId(l.id)}
                      className="rounded-xl border border-[#E4E1DA] hover:border-[#141413] bg-[#FAF9F6]/60 p-4 cursor-pointer transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-mono font-medium text-[#141413]">
                          {formatLabBrandLabel(l.brandId)}
                        </span>
                        <span className="font-mono text-[#5C5953]">{l.startDate}</span>
                      </div>
                      <div className="text-[16px] font-semibold text-[#141413]">{l.name}</div>
                      <div className="text-[13px] text-[#5C5953]">{l.collectionName}</div>
                    </div>
                  ))}
                  {monthLaunches.length === 0 && (
                    <div className="py-10 text-center text-[13px] text-[#5C5953] rounded-xl border border-dashed border-[#E4E1DA]">
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
        <div className="bg-white rounded-2xl border border-[#E4E1DA] overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-[#E4E1DA] text-[12px] font-medium text-[#5C5953] bg-[#FAF9F6]">
              <tr>
                <th className="py-3.5 px-6">Релиз и коллекция</th>
                <th className="py-3.5 px-4">Бренд</th>
                <th className="py-3.5 px-4">Старт продаж</th>
                <th className="py-3.5 px-4 text-right">Готовность</th>
                <th className="py-3.5 px-4 text-right">План выручки</th>
                <th className="py-3.5 px-6 text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA]">
              {filteredLaunches.map((l) => (
                <tr key={l.id} className="hover:bg-[#FAF9F6] transition-colors">
                  <td className="py-4 px-6">
                    <div className="font-semibold text-[15px] text-[#141413]">{l.name}</div>
                    <div className="text-[12.5px] text-[#5C5953]">{l.collectionName}</div>
                  </td>
                  <td className="py-4 px-4 font-mono text-[12.5px] font-medium text-[#141413]">
                    {formatLabBrandLabel(l.brandId)}
                  </td>
                  <td className="py-4 px-4 font-mono text-[13px] text-[#141413]">{l.startDate}</td>
                  <td className="py-4 px-4 text-right font-mono font-semibold text-emerald-700">
                    {l.readinessPct}%
                  </td>
                  <td className="py-4 px-4 text-right font-mono font-medium text-[#141413]">
                    {hasFinance ? formatCompactRub(l.salesPlanRub) : 'Скрыто'}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => setSelectedLaunchId(l.id)}
                      className="rounded-lg border border-[#E4E1DA] px-3.5 py-1.5 text-[13px] font-medium text-[#141413] hover:bg-[#141413] hover:text-white transition-colors cursor-pointer"
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                className={`p-4 rounded-xl min-h-[440px] border transition-colors ${
                  isDropTarget
                    ? 'bg-white border-[#141413] shadow-md'
                    : 'bg-[#FAF9F6] border-[#E4E1DA]'
                }`}
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E4E1DA]">
                  <span className="text-[13.5px] font-semibold text-[#141413]">
                    {statusCol}
                  </span>
                  <span className="font-mono text-[12px] font-medium text-[#5C5953] bg-white px-2 py-0.5 rounded border border-[#E4E1DA]">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-3">
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
                        className={`bg-white rounded-xl border border-[#E4E1DA] hover:border-[#141413] p-4 space-y-2 transition-colors ${
                          canEdit && !isStrategyMode
                            ? 'cursor-grab active:cursor-grabbing'
                            : 'cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="inline-flex items-center gap-1.5 font-mono font-medium text-[#141413]">
                            {canEdit && !isStrategyMode && (
                              <GripVertical className="h-3.5 w-3.5 stroke-[1.5] text-[#5C5953]" />
                            )}
                            {formatLabBrandLabel(l.brandId)}
                          </span>
                          <span className="font-mono text-[#5C5953]">{l.startDate}</span>
                        </div>
                        <div className="text-[14.5px] font-semibold text-[#141413]">{l.name}</div>
                        <div className="text-[12.5px] text-[#5C5953]">{l.collectionName}</div>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 backdrop-blur-[2px] p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl"
          >
            <h3 className="text-[20px] font-semibold tracking-tight text-[#141413] border-b border-[#E4E1DA] pb-4">
              Перенос даты: {rescheduleModalLaunch.name}
            </h3>

            <div className="space-y-4 text-[13.5px]">
              <div>
                <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Новая дата старта продаж</label>
                <input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="w-full h-10 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3.5 font-mono text-[14px] text-[#141413]"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={shiftDependents}
                  onChange={(e) => setShiftDependents(e.target.checked)}
                  className="h-4 w-4 accent-[#141413]"
                />
                <span className="font-medium text-[#141413]">
                  Автоматически сдвинуть дедлайны этапов и связанных задач
                </span>
              </label>
            </div>

            {previewConflicts && previewConflicts.conflicts.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-2 text-[13px]">
                <div className="font-medium text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 stroke-[1.5]" />
                  <span>
                    Обнаружены затрагиваемые сроки ({previewConflicts.conflicts.length}):
                  </span>
                </div>
                <ul className="space-y-1 text-[#141413] max-h-40 overflow-y-auto">
                  {previewConflicts.conflicts.map((c, idx) => (
                    <li key={idx}>
                      • {c.title}: <span className="font-mono">{c.currentDeadline} → {c.suggestedDeadline}</span> ({c.reason})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setRescheduleModalLaunch(null)}
                className="h-10 px-4 rounded-lg border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:bg-[#FAF9F6] cursor-pointer"
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
                className="h-10 px-5 rounded-lg bg-[#141413] hover:bg-[#2A2A28] text-white text-[13px] font-medium cursor-pointer"
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
            className="fixed inset-0 z-50 flex justify-end bg-[#141413]/40 backdrop-blur-[2px]"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl bg-white h-full overflow-y-auto p-7 md:p-9 space-y-7 shadow-2xl border-l border-[#E4E1DA]"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[#E4E1DA] pb-5">
                <div>
                  <div className="font-mono text-[11.5px] uppercase tracking-wider text-[#5C5953]">
                    {formatLabBrandLabel(activeLaunch.brandId)} · Старт:{' '}
                    {activeLaunch.startDate}
                  </div>
                  <h2 className="text-[24px] font-semibold tracking-tight text-[#141413] mt-1">
                    {activeLaunch.name}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <span className="text-[12px] font-medium text-[#5C5953]">
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
                      className="h-9 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3 text-[13px] font-medium text-[#141413] disabled:opacity-60 cursor-pointer"
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
                  className="rounded-lg border border-[#E4E1DA] p-2 text-[#141413] hover:bg-[#FAF9F6] cursor-pointer"
                >
                  <X className="h-4 w-4 stroke-[1.5]" />
                </button>
              </div>

              {/* Привязанные модели SKU */}
              <div className="rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-[#5C5953]">
                      СОСТАВ РЕЛИЗА · ПРИВЯЗАННЫЕ МОДЕЛИ
                    </div>
                    <div className="text-[15px] font-semibold text-[#141413] mt-0.5">
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
                      className="h-9 rounded-lg border border-[#E4E1DA] hover:border-[#141413] bg-white px-3 text-[12.5px] font-medium text-[#141413] cursor-pointer"
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
                        className="rounded-xl bg-white border border-[#E4E1DA] p-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {p.imageUrl ? (
                            <img
                              src={resolvePublicAssetUrl(p.imageUrl)}
                              alt={p.name}
                              loading="lazy"
                              decoding="async"
                              className="h-12 w-12 rounded-lg object-contain bg-[#F6F5F2] border border-[#E4E1DA] p-1 shrink-0"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-[#F6F5F2] border border-[#E4E1DA] flex items-center justify-center font-mono text-[10px] font-medium text-[#5C5953] shrink-0">
                              SKU
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-medium text-[#5C5953]">
                              {p.sku}
                            </div>
                            <div className="text-[13px] font-semibold text-[#141413] truncate">
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
                            className="px-2.5 py-1 rounded-md border border-[#E4E1DA] hover:border-rose-600 hover:text-rose-700 text-[11.5px] font-medium text-[#5C5953] shrink-0 cursor-pointer transition-colors"
                          >
                            Убрать
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#D2CEC4] bg-white p-4 text-center text-[13px] text-[#5C5953]">
                    К этому релизу пока не привязаны модели. Выберите артикул в списке «+ Привязать модель из каталога...» выше.
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#E4E1DA] pb-3">
                  <h3 className="text-[18px] font-semibold tracking-tight text-[#141413]">
                    10 этапов подготовки релиза (готовность: <span className="font-mono">{activeLaunch.readinessPct}%</span>)
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
                      className="rounded-lg border border-[#E4E1DA] px-3.5 py-1.5 text-[12.5px] font-medium text-[#141413] hover:bg-[#141413] hover:text-white transition-colors cursor-pointer"
                    >
                      + Создать задачу по запуску
                    </button>
                  )}
                </div>

                <div className="divide-y divide-[#E4E1DA] rounded-xl border border-[#E4E1DA] overflow-hidden">
                  {activeLaunch.stages.map((st) => (
                    <div
                      key={st.code}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-[#FAF9F6]"
                    >
                      <label className="flex items-center gap-3 text-[14px] cursor-pointer min-w-[210px]">
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
                          className="h-4 w-4 accent-[#141413]"
                        />
                        <span
                          className={
                            st.status === 'Done'
                              ? 'line-through text-[#5C5953]'
                              : 'font-medium text-[#141413]'
                          }
                        >
                          {st.label}
                        </span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
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
                          className="h-8 rounded-lg border border-[#E4E1DA] bg-white px-2.5 font-medium text-[#141413]"
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
                          className="h-8 rounded-lg border border-[#E4E1DA] bg-white px-2.5 text-[#5C5953]"
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
                          className="h-8 rounded-lg border border-[#E4E1DA] bg-white px-2.5 font-mono text-[#141413]"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 backdrop-blur-[2px] p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl"
          >
            <h3 className="text-[20px] font-semibold tracking-tight text-[#141413] border-b border-[#E4E1DA] pb-4">
              Планирование нового релиза
            </h3>
            <div className="space-y-4 text-[13.5px]">
              <div>
                <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Название запуска</label>
                <input
                  value={newLaunchForm.name}
                  onChange={(e) =>
                    setNewLaunchForm({ ...newLaunchForm, name: e.target.value })
                  }
                  placeholder="Например: DROP 04 · SUMMER SKIN"
                  className="w-full h-10 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Бренд</label>
                  <select
                    value={newLaunchForm.brandId}
                    onChange={(e) =>
                      setNewLaunchForm({
                        ...newLaunchForm,
                        brandId: normalizeLabBrandCode(e.target.value),
                      })
                    }
                    className="w-full h-10 rounded-lg border border-[#E4E1DA] px-3.5 text-[14px] bg-[#FAF9F6] font-medium text-[#141413]"
                  >
                    {editableLaunchBrands.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#5C5953] mb-1.5">Дата старта</label>
                  <input
                    type="date"
                    value={newLaunchForm.startDate}
                    onChange={(e) =>
                      setNewLaunchForm({ ...newLaunchForm, startDate: e.target.value })
                    }
                    className="w-full h-10 rounded-lg border border-[#E4E1DA] bg-[#FAF9F6] px-3.5 font-mono text-[14px] text-[#141413]"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="h-10 px-4 rounded-lg border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:bg-[#FAF9F6] cursor-pointer"
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
                className="h-10 px-5 rounded-lg bg-[#141413] hover:bg-[#2A2A28] text-white text-[13px] font-medium cursor-pointer"
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
    <div className="space-y-8 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#E4E1DA] pb-6">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#5C5953] mb-1.5">
            Продвижение, кампании и гипотезы роста
          </div>
          <h1 className="text-[32px] md:text-[36px] font-semibold tracking-[-0.03em] text-[#141413]">
            Маркетинг и рост
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[#FAF9F6] p-1 rounded-xl border border-[#E4E1DA]">
            <button
              onClick={() => setTab('campaigns')}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium transition cursor-pointer ${
                tab === 'campaigns'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Кампании <span className="font-mono text-[12px]">({filteredCampaigns.length})</span>
            </button>
            <button
              onClick={() => setTab('experiments')}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium transition cursor-pointer ${
                tab === 'experiments'
                  ? 'bg-white text-[#141413] border border-[#E4E1DA] shadow-2xs'
                  : 'text-[#5C5953] hover:text-[#141413]'
              }`}
            >
              Тесты гипотез <span className="font-mono text-[12px]">({filteredExperiments.length})</span>
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
              className="h-10 px-5 rounded-xl bg-[#141413] text-white text-[14px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
            >
              {tab === 'campaigns' ? '+ Новая кампания' : '+ Новая гипотеза'}
            </button>
          )}
        </div>
      </div>

      {/* Вкладка 1: Таблица кампаний */}
      {tab === 'campaigns' && (
        <div className="bg-white rounded-xl border border-[#E4E1DA] overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-[#E4E1DA] text-[12px] font-medium uppercase tracking-wider text-[#5C5953] bg-[#FAF9F6]">
              <tr>
                <th className="py-3.5 px-6">Кампания и цель</th>
                <th className="py-3.5 px-4">Бренд и канал</th>
                <th className="py-3.5 px-4">Период</th>
                <th className="py-3.5 px-4 text-right">План бюджета</th>
                <th className="py-3.5 px-4 text-right">План выручки</th>
                <th className="py-3.5 px-4 text-right">Факт выручки</th>
                <th className="py-3.5 px-6 text-right">ROAS / ДРР</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA]">
              {filteredCampaigns.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCampaignId(c.id)}
                  className="hover:bg-[#FAF9F6] transition cursor-pointer"
                >
                  <td className="py-4 px-6">
                    <div className="font-semibold text-[15px] text-[#141413]">{c.name}</div>
                    <div className="text-[13px] text-[#5C5953]">{c.goal}</div>
                  </td>
                  <td className="py-4 px-4 font-medium text-[#141413]">
                    {c.brandId === 'ALL' ? 'Вся группа' : formatLabBrandLabel(c.brandId)} · {c.channel}
                  </td>
                  <td className="py-4 px-4 font-mono text-[13px] text-[#5C5953]">{c.periodLabel}</td>
                  <td className="py-4 px-4 text-right font-mono font-medium text-[#141413]">
                    {hasFinance ? formatCurrencyRub(c.plannedBudgetRub) : 'Скрыто'}
                  </td>
                  <td className="py-4 px-4 text-right font-mono text-[#5C5953]">
                    {hasFinance ? formatCurrencyRub(c.plannedRevenueRub) : 'Скрыто'}
                  </td>
                  <td className="py-4 px-4 text-right font-mono font-semibold text-[#141413]">
                    {!hasFinance ? (
                      'Скрыто'
                    ) : c.actualRevenueRub !== null ? (
                      formatCurrencyRub(c.actualRevenueRub)
                    ) : (
                      <span className="font-sans text-[#5C5953] font-normal">Нет данных</span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right font-mono font-semibold">
                    {!hasFinance ? (
                      <span className="font-sans text-[#5C5953] font-medium">Скрыто</span>
                    ) : c.metrics.roas !== null && c.metrics.roas !== undefined ? (
                      <span className="text-[#16805D]">
                        {c.metrics.roas}x ({c.metrics.drrPct}% ДРР)
                      </span>
                    ) : (
                      <span className="font-sans text-[#5C5953] font-normal">Нет данных</span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredExperiments.map((exp) => (
            <div
              key={exp.id}
              onClick={() => setSelectedExperimentId(exp.id)}
              className="bg-white rounded-xl border border-[#E4E1DA] hover:border-[#141413] p-6 flex flex-col justify-between space-y-5 cursor-pointer transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#E4E1DA] pb-3 text-[12px]">
                  <span className="font-medium text-[#5C5953]">
                    {exp.brandId === 'ALL' ? 'Вся группа' : formatLabBrandLabel(exp.brandId)} ·{' '}
                    <span className="font-mono">{exp.timeframe}</span>
                  </span>
                  <span className="font-medium px-2.5 py-0.5 rounded-md bg-[#FAF9F6] border border-[#E4E1DA] text-[#141413]">
                    {EXPERIMENT_STATUS_LABELS_RU[exp.status]}
                  </span>
                </div>

                <h3 className="text-[18px] font-semibold text-[#141413] tracking-[-0.01em]">{exp.hypothesis}</h3>
                <p className="text-[14px] text-[#5C5953] leading-relaxed">{exp.rationale}</p>
              </div>

              <div className="pt-4 border-t border-[#E4E1DA] space-y-2 text-[13px]">
                <div className="flex justify-between gap-4">
                  <span className="text-[#5C5953]">Критерий успеха:</span>
                  <b className="text-[#141413] font-medium text-right">{exp.successCriteria}</b>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#5C5953]">Итог и решение:</span>
                  <b className="text-[#16805D] font-semibold text-right">{exp.resultSummary || exp.decision}</b>
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
          className="fixed inset-0 z-50 flex justify-end bg-[#141413]/40"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white h-full overflow-y-auto p-8 space-y-6 shadow-xl border-l border-[#E4E1DA]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E4E1DA] pb-5">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#5C5953]">
                  Маркетинговая кампания · {selectedCampaign.channel}
                </div>
                <h2 className="text-[22px] font-semibold text-[#141413] mt-1 tracking-[-0.02em]">
                  {selectedCampaign.name}
                </h2>
              </div>
              <button
                onClick={() => setSelectedCampaignId(null)}
                className="rounded-xl border border-[#E4E1DA] p-2 text-[#141413] hover:border-[#141413] transition cursor-pointer"
              >
                <X className="h-5 w-5 stroke-[1.5]" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">
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
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-medium bg-white text-[#141413]"
                >
                  <option value="Запланирована">Запланирована</option>
                  <option value="Активна">Активна</option>
                  <option value="Завершена">Завершена</option>
                  <option value="На паузе">На паузе</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Период</label>
                <input
                  disabled={!canEditSelectedCampaign}
                  value={selectedCampaign.periodLabel}
                  onChange={(e) =>
                    updateCampaign(selectedCampaign.id, {
                      periodLabel: e.target.value,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-mono font-medium text-[#141413]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">
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
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-mono font-medium text-[#141413]"
                  />
                ) : (
                  <div className="w-full h-10 rounded-xl border border-[#E4E1DA] bg-[#FAF9F6] px-3 flex items-center font-medium text-[#5C5953]">
                    Скрыто
                  </div>
                )}
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">
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
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-mono font-medium text-[#141413]"
                  />
                ) : (
                  <div className="w-full h-10 rounded-xl border border-[#E4E1DA] bg-[#FAF9F6] px-3 flex items-center font-medium text-[#5C5953]">
                    Скрыто
                  </div>
                )}
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">
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
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-mono font-medium text-[#141413]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">
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
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-mono font-medium text-[#141413]"
                />
              </div>
            </div>

            <div className="rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] p-5 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[12px] text-[#5C5953]">Расчётный ROAS</div>
                <div className="text-[22px] font-mono font-semibold text-[#16805D] mt-1">
                  {!hasFinance
                    ? 'Скрыто'
                    : selectedCampaign.metrics.roas !== null &&
                      selectedCampaign.metrics.roas !== undefined
                    ? `${selectedCampaign.metrics.roas}x`
                    : 'Нет данных'}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-[#5C5953]">Доля рекламных расходов (ДРР)</div>
                <div className="text-[22px] font-mono font-semibold text-[#141413] mt-1">
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
          className="fixed inset-0 z-50 flex justify-end bg-[#141413]/40"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white h-full overflow-y-auto p-8 space-y-6 shadow-xl border-l border-[#E4E1DA]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E4E1DA] pb-5">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#5C5953]">
                  Эксперимент роста · <span className="font-mono">{selectedExperiment.timeframe}</span>
                </div>
                <h2 className="text-[20px] font-semibold text-[#141413] mt-1 tracking-[-0.02em]">
                  {selectedExperiment.hypothesis}
                </h2>
              </div>
              <button
                onClick={() => setSelectedExperimentId(null)}
                className="rounded-xl border border-[#E4E1DA] p-2 text-[#141413] hover:border-[#141413] transition cursor-pointer"
              >
                <X className="h-5 w-5 stroke-[1.5]" />
              </button>
            </div>

            <div className="space-y-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">
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
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3 font-medium bg-white text-[#141413]"
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
                <label className="block font-medium text-[#5C5953] mb-1.5">
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
                  className="w-full rounded-xl border border-[#E4E1DA] p-3.5 text-[#141413]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">
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
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 font-medium text-[#141413]"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl"
          >
            <h3 className="text-[20px] font-semibold text-[#141413] border-b border-[#E4E1DA] pb-4 tracking-[-0.02em]">
              Новая маркетинговая кампания
            </h3>
            <div className="space-y-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Название кампании</label>
                <input
                  value={campForm.name}
                  onChange={(e) => setCampForm({ ...campForm, name: e.target.value })}
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">Бренд</label>
                  <select
                    value={campForm.brandId}
                    onChange={(e) =>
                      setCampForm({
                        ...campForm,
                        brandId: normalizeLabBrandCode(e.target.value),
                      })
                    }
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] bg-white font-medium text-[#141413]"
                  >
                    {editableLaunchBrands.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#5C5953] mb-1.5">План бюджета (₽)</label>
                  <input
                    type="number"
                    value={campForm.plannedBudgetRub}
                    onChange={(e) =>
                      setCampForm({ ...campForm, plannedBudgetRub: e.target.value })
                    }
                    className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] font-mono text-[#141413]"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setCampModalOpen(false)}
                className="h-10 px-5 rounded-xl border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer"
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
                className="h-10 px-6 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141413]/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-xl border border-[#E4E1DA] p-7 space-y-5 shadow-xl"
          >
            <h3 className="text-[20px] font-semibold text-[#141413] border-b border-[#E4E1DA] pb-4 tracking-[-0.02em]">
              Запуск маркетингового теста
            </h3>
            <div className="space-y-4 text-[13px]">
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Бренд</label>
                <select
                  value={expForm.brandId}
                  onChange={(e) =>
                    setExpForm({
                      ...expForm,
                      brandId: normalizeLabBrandCode(e.target.value),
                    })
                  }
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] bg-white font-medium text-[#141413]"
                >
                  {editableLaunchBrands.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Формулировка гипотезы</label>
                <input
                  value={expForm.hypothesis}
                  onChange={(e) => setExpForm({ ...expForm, hypothesis: e.target.value })}
                  className="w-full h-10 rounded-xl border border-[#E4E1DA] px-3.5 text-[14px] text-[#141413]"
                />
              </div>
              <div>
                <label className="block font-medium text-[#5C5953] mb-1.5">Обоснование и механика</label>
                <textarea
                  rows={3}
                  value={expForm.rationale}
                  onChange={(e) => setExpForm({ ...expForm, rationale: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E1DA] p-3.5 text-[14px] text-[#141413]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[#E4E1DA]">
              <button
                onClick={() => setExpModalOpen(false)}
                className="h-10 px-5 rounded-xl border border-[#E4E1DA] text-[13px] font-medium text-[#141413] hover:border-[#141413] transition cursor-pointer"
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
                className="h-10 px-6 rounded-xl bg-[#141413] text-white text-[13px] font-medium hover:bg-[#2A2927] transition cursor-pointer"
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
