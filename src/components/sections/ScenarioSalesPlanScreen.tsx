'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit3,
  BarChart3,
  Table,
  PackageCheck,
  Sparkles,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  GrowthScenarioDef,
  MONTHS_SHORT_RU,
  ScenarioModelSpec,
  computeModelScenarioMetrics,
} from '@/lib/scenarioData';

interface ScenarioSalesPlanScreenProps {
  model: ScenarioModelSpec;
  scenario: GrowthScenarioDef;
  allScenarios: GrowthScenarioDef[];
  onSelectScenario: (id: number) => void;
  onBackToModel: () => void;
  onUpdateModel: (updated: ScenarioModelSpec) => void;
  notify: (type: 'success' | 'warning' | 'error', title: string, desc?: string) => void;
}

export function ScenarioSalesPlanScreen({
  model,
  scenario,
  allScenarios,
  onSelectScenario,
  onBackToModel,
  onUpdateModel,
  notify,
}: ScenarioSalesPlanScreenProps) {
  const [periodMode, setPeriodMode] = useState<'year' | 'monthly' | 'quarterly'>(
    'monthly'
  );
  const [displayMode, setDisplayMode] = useState<'chart' | 'table'>('chart');
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [showSizeMatrix, setShowSizeMatrix] = useState(false);

  const metrics = computeModelScenarioMetrics(model, scenario);
  const { plan } = metrics;

  const isPlanEmpty = metrics.annualPacks === 0;

  const updateMonthPackOrPrice = (
    monthIdx: number,
    field: 'packs' | 'price' | 'receipts',
    value: number
  ) => {
    const cleanVal = Math.max(0, Math.round(value || 0));
    const nextPlan = {
      ...plan,
      monthlyPacks: [...plan.monthlyPacks],
      monthlyPricesRub: [...plan.monthlyPricesRub],
      monthlyReceiptsPacks: [...plan.monthlyReceiptsPacks],
    };
    if (field === 'packs') nextPlan.monthlyPacks[monthIdx] = cleanVal;
    if (field === 'price') nextPlan.monthlyPricesRub[monthIdx] = cleanVal;
    if (field === 'receipts') nextPlan.monthlyReceiptsPacks[monthIdx] = cleanVal;

    onUpdateModel({
      ...model,
      plansByScenario: {
        ...model.plansByScenario,
        [scenario.id]: nextPlan,
      },
    });
  };

  const toggleScheduleConflictDemo = () => {
    const isCurrentlyConflict =
      plan.salesStartMonthIdx < plan.warehouseArrivalMonthIdx;
    const nextPlan = {
      ...plan,
      salesStartMonthIdx: 2, // Март
      warehouseArrivalMonthIdx: isCurrentlyConflict ? 2 : 3, // Апрель (конфликт) или Март (ок)
      warehouseArrivalDateLabel: isCurrentlyConflict ? '18 марта' : '12 апреля',
    };
    const nextSteps = model.productionSteps.map((s) =>
      s.stepNum === 6
        ? {
            ...s,
            datesLabel: isCurrentlyConflict ? '18 марта' : '12 апреля',
            monthIndex: isCurrentlyConflict ? 2 : 3,
          }
        : s
    );
    onUpdateModel({
      ...model,
      productionSteps: nextSteps,
      plansByScenario: {
        ...model.plansByScenario,
        [scenario.id]: nextPlan,
      },
    });
    notify(
      isCurrentlyConflict ? 'success' : 'warning',
      isCurrentlyConflict
        ? 'Конфликт сроков устранён: поступление на склад 18 марта'
        : 'Обнаружен конфликт сроков поставки и старта продаж'
    );
  };

  const autoReplenishDeficit = () => {
    const nextReceipts = [...plan.monthlyReceiptsPacks];
    let running = plan.initialStockPacks;
    for (let m = 0; m < 12; m++) {
      running += nextReceipts[m] - plan.monthlyPacks[m];
      if (running < 1500) {
        const add = Math.ceil((1500 - running) / 500) * 500;
        nextReceipts[m] += add;
        running += add;
      }
    }
    onUpdateModel({
      ...model,
      plansByScenario: {
        ...model.plansByScenario,
        [scenario.id]: {
          ...plan,
          monthlyReceiptsPacks: nextReceipts,
        },
      },
    });
    notify('success', 'План поступлений сбалансирован без дефицита на складе');
  };

  const maxMonthlyRevMln = Math.max(
    12,
    ...metrics.monthlyRevenuesRub.map((r) => r / 1_000_000)
  );

  // Квартальная агрегация для переключателя «Поквартально»
  const quarters = [0, 1, 2, 3].map((q) => {
    const mIndices = [q * 3, q * 3 + 1, q * 3 + 2];
    const packs = mIndices.reduce((acc, idx) => acc + (plan.monthlyPacks[idx] || 0), 0);
    const revRub = mIndices.reduce(
      (acc, idx) => acc + (metrics.monthlyRevenuesRub[idx] || 0),
      0
    );
    return {
      label: `Q${q + 1} (${MONTHS_SHORT_RU[mIndices[0]]}–${MONTHS_SHORT_RU[mIndices[2]]})`,
      packs,
      revRub,
    };
  });

  const firstOrderSumMln =
    Math.round(((plan.firstOrderPacks * model.unitCostRub) / 1_000_000) * 100) / 100;

  return (
    <div className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-7 space-y-6 shadow-[0_2px_10px_rgba(20,20,19,0.03)]">
      {/* ВЕРХНЯЯ ПАНЕЛЬ ЭКРАНА №3 */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-[1.5px] border-[#DFDED6]">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToModel}
              className="h-9 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:border-[#141413] border-[1.5px] border-[#CECDC4] text-[13px] font-semibold text-[#141413] transition cursor-pointer"
            >
              ← Карточка модели
            </button>
            <h2 className="text-[20px] md:text-[23px] font-bold tracking-[-0.02em] text-[#141413]">
              {model.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS'} {model.code} — План продаж
            </h2>
          </div>
          <p className="text-[12.5px] text-[#5E5D58]">
            {model.title} · Комплект {model.unitsInPack} шт. · Старт продаж:{' '}
            {MONTHS_SHORT_RU[plan.salesStartMonthIdx].toLowerCase()} {scenario.year} ·{' '}
            <span className="text-[#157347] font-semibold">Автосохранение активно</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Переключатель Годовой план | Помесячно | Поквартально */}
          <div className="inline-flex rounded-[9px] bg-[#EFEFE9] p-0.5 border-[1.5px] border-[#CECDC4]">
            {(
              [
                { id: 'year', label: 'Годовой план' },
                { id: 'monthly', label: 'Помесячно' },
                { id: 'quarterly', label: 'Поквартально' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriodMode(tab.id)}
                className={`h-8 px-3 rounded-[8px] text-[12px] font-semibold transition cursor-pointer ${
                  periodMode === tab.id
                    ? 'bg-white text-[#1D1D1F] border border-[#DED8CC] shadow-2xs'
                    : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Выбор сценария */}
          <select
            value={scenario.id}
            onChange={(e) => onSelectScenario(Number(e.target.value))}
            className="h-9 px-3.5 rounded-[10px] bg-white border border-[#DED8CC] text-[12.5px] font-semibold text-[#1D1D1F] cursor-pointer"
          >
            {allScenarios.map((sc) => (
              <option key={sc.id} value={sc.id}>
                Сценарий: №{sc.id} — {sc.monthlyTargetMln} млн ₽ / мес
              </option>
            ))}
          </select>

          {/* Кнопка Редактировать план */}
          <button
            type="button"
            onClick={() =>
              setDisplayMode((prev) => (prev === 'table' ? 'chart' : 'table'))
            }
            className={`h-9 px-4 rounded-[10px] text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
              displayMode === 'table'
                ? 'bg-[#FAF4EC] text-[#8B6F47] border border-[#C8A97E]'
                : 'bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#1D1D1F] border border-[#CECDC4] shadow-2xs'
            }`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>
              {displayMode === 'table' ? 'К графику' : 'Редактировать план'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onUpdateModel({ ...model });
              notify(
                'success',
                '✓ План продаж и карточка сохранены',
                `${model.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS'} ${model.code} · Сценарий №${scenario.id}`
              );
            }}
            className="h-9 px-4 rounded-[10px] bg-[#2E6B4E] hover:bg-[#24563E] text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Сохранить</span>
          </button>
        </div>
      </div>

      {/* ПРОВЕРКА КОНФЛИКТА СРОКОВ (ТЕСТ 07) */}
      {metrics.hasScheduleConflict && metrics.scheduleConflictMessage && (
        <div className="rounded-[16px] bg-[#FFF4F2] border-[1.5px] border-[#E05246] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[10px] bg-[#E05246]/15 text-[#C93B2B] flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[13.5px] font-bold text-[#9E2418]">
                Конфликт сроков поставки и начала продаж
              </div>
              <div className="text-[12.5px] font-medium text-[#B83224]">
                {metrics.scheduleConflictMessage}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleScheduleConflictDemo}
            className="h-8 px-3.5 rounded-[8px] bg-white hover:bg-[#FCE8E5] border border-[#E05246] text-[12px] font-semibold text-[#9E2418] cursor-pointer"
          >
            Синхронизировать со складом (18 марта)
          </button>
        </div>
      )}

      {/* ОСНОВНАЯ СЕТКА ЭКРАНА №3 (КАК НА МАКЕТЕ СТР. 15) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* 5.1. ЛЕВАЯ КОЛОНКА: 5 КЛЮЧЕВЫХ ПОКАЗАТЕЛЕЙ ПЛАНА */}
        <div className="xl:col-span-2 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-1 gap-3">
          <div className="rounded-[18px] bg-white border border-[#E6E0D4] p-4 space-y-1 shadow-2xs">
            <div className="text-[11.5px] text-[#6E6E73]">Годовая выручка</div>
            <div className="text-[22px] font-bold tracking-[-0.02em] text-[#1D1D1F]">
              {(metrics.annualRevenueRub / 1_000_000).toFixed(1).replace('.', ',')} млн ₽
            </div>
            <div className="text-[11px] font-semibold text-[#8B6F47]">
              {metrics.goalSharePct.toFixed(1).replace('.', ',')}% цели сценария
            </div>
          </div>

          <div className="rounded-[18px] bg-white border border-[#E6E0D4] p-4 space-y-1 shadow-2xs">
            <div className="text-[11.5px] text-[#6E6E73]">Объём продаж</div>
            <div className="text-[22px] font-bold tracking-[-0.02em] text-[#1D1D1F]">
              {metrics.annualPacks.toLocaleString('ru-RU')}
            </div>
            <div className="text-[11px] text-[#6E6E73]">
              комплектов ({metrics.annualUnits.toLocaleString('ru-RU')} шт.)
            </div>
          </div>

          <div className="rounded-[18px] bg-white border border-[#E6E0D4] p-4 space-y-1 shadow-2xs">
            <div className="text-[11.5px] text-[#6E6E73]">Средняя цена</div>
            <div className="text-[22px] font-bold tracking-[-0.02em] text-[#1D1D1F]">
              {metrics.avgRetailPriceRub.toLocaleString('ru-RU')} ₽
            </div>
            <div className="text-[11px] text-[#6E6E73]">
              за 1 комплект из {model.unitsInPack} шт.
            </div>
          </div>

          <div className="rounded-[18px] bg-white border border-[#E6E0D4] p-4 space-y-1 shadow-2xs">
            <div className="text-[11.5px] text-[#6E6E73]">Закупка (всего)</div>
            <div className="text-[22px] font-bold tracking-[-0.02em] text-[#1D1D1F]">
              {(metrics.totalPurchaseNeedRub / 1_000_000).toFixed(1).replace('.', ',')} млн ₽
            </div>
            <div className="text-[11px] text-[#6E6E73]">себестоимость с доставкой</div>
          </div>

          <div className="rounded-[18px] bg-white border border-[#E6E0D4] p-4 space-y-1 shadow-2xs">
            <div className="text-[11.5px] text-[#6E6E73]">Ожидаемая прибыль</div>
            <div className="text-[22px] font-bold tracking-[-0.02em] text-[#2E6B4E]">
              {(metrics.annualProfitRub / 1_000_000).toFixed(1).replace('.', ',')} млн ₽
            </div>
            <div className="text-[11px] font-semibold text-[#2E6B4E]">
              маржинальность {metrics.unitMarginPct}%
            </div>
          </div>
        </div>

        {/* 5.2. ЦЕНТРАЛЬНАЯ КОЛОНКА: ПРОГНОЗ ПРОДАЖ И ВЫРУЧКИ (ГРАФИК ИЛИ ТАБЛИЦА) */}
        <div className="xl:col-span-5 rounded-[20px] bg-white border border-[#E6E0D4] p-5 space-y-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[15.5px] font-bold text-[#1D1D1F]">
                Прогноз продаж и выручки
              </h3>
              <p className="text-[11.5px] text-[#6E6E73]">
                Помесячная динамика · выход на пик к декабрю {scenario.year}
              </p>
            </div>

            {/* Переключатель График / Таблица (не показывать оба одновременно!) */}
            <div className="inline-flex rounded-[10px] bg-[#F3F0E8] p-0.5 border border-[#E2DDD2]">
              <button
                type="button"
                onClick={() => setDisplayMode('chart')}
                className={`h-7 px-2.5 rounded-[8px] text-[11.5px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                  displayMode === 'chart'
                    ? 'bg-white text-[#1D1D1F] shadow-2xs'
                    : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>График</span>
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('table')}
                className={`h-7 px-2.5 rounded-[8px] text-[11.5px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                  displayMode === 'table'
                    ? 'bg-white text-[#1D1D1F] shadow-2xs'
                    : 'text-[#6E6E73] hover:text-[#1D1D1F]'
                }`}
              >
                <Table className="h-3.5 w-3.5" />
                <span>Таблица</span>
              </button>
            </div>
          </div>

          {isPlanEmpty ? (
            <div className="rounded-[16px] border border-dashed border-[#D6CFC2] bg-[#FAF8F4] p-8 text-center space-y-3">
              <div className="text-[15px] font-bold text-[#1D1D1F]">
                План ещё не создан
              </div>
              <p className="text-[12.5px] text-[#6E6E73] max-w-sm mx-auto">
                Для этой модели в выбранном сценарии ещё не заполнены помесячные продажи.
              </p>
              <button
                type="button"
                onClick={() => {
                  onUpdateModel({
                    ...model,
                    plansByScenario: {
                      ...model.plansByScenario,
                      [scenario.id]: {
                        ...plan,
                        monthlyPacks: [
                          2480, 2945, 3565, 4265, 4885, 5350, 5815, 6355, 6900, 7675,
                          8835, 8372,
                        ],
                      },
                    },
                  });
                  notify('success', 'Базовый помесячный план продаж создан');
                }}
                className="h-9 px-4 rounded-[10px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#1D1D1F] border border-[#CECDC4] text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Добавить план</span>
              </button>
            </div>
          ) : displayMode === 'chart' ? (
            <>
              <div className="flex items-center gap-4 text-[11px] text-[#6E6E73]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-[#D9B89C]" />
                  Выручка, млн ₽
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#1D1D1F]" />
                  Продажи, тыс. комплектов
                </span>
              </div>

              {periodMode === 'quarterly' ? (
                <div className="grid grid-cols-4 gap-3 pt-4 pb-2">
                  {quarters.map((q) => {
                    const revMln = q.revRub / 1_000_000;
                    return (
                      <div
                        key={q.label}
                        className="rounded-[14px] bg-[#FAF8F4] border border-[#E8E2D5] p-3.5 flex flex-col justify-between space-y-3"
                      >
                        <div className="text-[11px] font-semibold text-[#6E6E73]">
                          {q.label}
                        </div>
                        <div>
                          <div className="text-[18px] font-bold text-[#1D1D1F]">
                            {revMln.toFixed(1).replace('.', ',')} млн ₽
                          </div>
                          <div className="text-[11.5px] text-[#8B6F47] font-medium">
                            {q.packs.toLocaleString('ru-RU')} компл.
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="relative pt-8 pb-2">
                  {/* Плашка пикового месяца (Декабрь) как на макете Стр. 15 */}
                  <div className="absolute right-0 top-0 rounded-[10px] bg-[#F5F5F1] text-[#1D1D1F] border border-[#CECDC4] px-3 py-1.5 text-[11px] shadow-2xs">
                    <div className="font-bold">
                      {(metrics.targetMonthRevenueRub / 1_000_000)
                        .toFixed(1)
                        .replace('.', ',')}{' '}
                      млн ₽
                    </div>
                    <div className="text-[#5A564F] text-[10px]">
                      {(metrics.targetMonthPacks / 1000).toFixed(1).replace('.', ',')}{' '}
                      тыс. компл.
                    </div>
                  </div>

                  <div className="h-[220px] grid grid-cols-12 gap-2 items-end pt-6 border-b border-[#E6E0D4] px-1">
                    {MONTHS_SHORT_RU.map((mName, idx) => {
                      const revMln = metrics.monthlyRevenuesRub[idx] / 1_000_000;
                      const heightPct = Math.max(
                        8,
                        Math.min(100, Math.round((revMln / maxMonthlyRevMln) * 100))
                      );
                      const isTarget = idx === scenario.targetMonthIdx;
                      const isStart = idx === plan.salesStartMonthIdx;
                      return (
                        <div
                          key={mName}
                          onClick={() => setDisplayMode('table')}
                          title={`${mName}: ${revMln.toFixed(2)} млн ₽ (${plan.monthlyPacks[
                            idx
                          ].toLocaleString('ru-RU')} компл.) — нажмите для редактирования`}
                          className="h-full flex flex-col justify-end items-center gap-1.5 group cursor-pointer"
                        >
                          <div className="text-[10px] font-semibold text-[#6E6E73] group-hover:text-[#1D1D1F]">
                            {revMln.toFixed(1).replace('.', ',')}
                          </div>
                          <div className="w-full h-[160px] flex items-end justify-center">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full rounded-t-[6px] transition-all relative ${
                                isTarget
                                  ? 'bg-[#C67A82]'
                                  : isStart
                                  ? 'bg-[#D68F7A]'
                                  : 'bg-[#E2C2B9] group-hover:bg-[#D49A8D]'
                              }`}
                            >
                              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-[#1D1D1F] border-2 border-white shadow-2xs" />
                            </div>
                          </div>
                          <div
                            className={`text-[10.5px] ${
                              isTarget
                                ? 'font-bold text-[#1D1D1F]'
                                : 'font-medium text-[#6E6E73]'
                            }`}
                          >
                            {mName}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Нижние плашки Стартовый месяц / Декабрь 2027 (как на макете Стр. 15) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="rounded-[12px] bg-[#FAF8F4] border border-[#EAE3D5] p-3">
                  <div className="text-[11px] text-[#6E6E73]">Стартовый месяц</div>
                  <div className="text-[13px] font-bold text-[#1D1D1F] mt-0.5">
                    {MONTHS_SHORT_RU[plan.salesStartMonthIdx]} —{' '}
                    {(
                      (metrics.monthlyRevenuesRub[plan.salesStartMonthIdx] || 0) /
                      1_000_000
                    )
                      .toFixed(1)
                      .replace('.', ',')}{' '}
                    млн ₽ ({(plan.monthlyPacks[plan.salesStartMonthIdx] || 0).toLocaleString('ru-RU')}{' '}
                    компл.)
                  </div>
                </div>
                <div className="rounded-[12px] bg-[#FAF4F0] border border-[#E8D5C8] p-3">
                  <div className="text-[11px] text-[#8B6F47]">
                    Декабрь {scenario.year} (целевой месяц)
                  </div>
                  <div className="text-[13px] font-bold text-[#1D1D1F] mt-0.5">
                    {(metrics.targetMonthRevenueRub / 1_000_000)
                      .toFixed(1)
                      .replace('.', ',')}{' '}
                    млн ₽ ({metrics.targetMonthPacks.toLocaleString('ru-RU')} комплектов)
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* РЕЖИМ ТАБЛИЦЫ (РЕДАКТИРОВАНИЕ ПОМЕСЯЧНОГО ПЛАНА — ТЕСТ 04) */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11.5px] text-[#5A564F] bg-[#FAF8F4] px-3 py-2 rounded-[10px] border border-[#E6E0D4]">
                <span>
                  Измените комплекты или цену за любой месяц — годовая выручка модели и
                  сценария пересчитается мгновенно.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateModel({
                      ...model,
                      plansByScenario: {
                        ...model.plansByScenario,
                        [scenario.id]: {
                          ...plan,
                          monthlyPacks: Array(12).fill(0),
                        },
                      },
                    });
                    notify('warning', 'План очищен (показано пустое состояние)');
                  }}
                  className="text-[11px] font-semibold text-[#B85D35] hover:underline shrink-0 ml-2 cursor-pointer"
                >
                  Очистить план
                </button>
              </div>

              <div className="max-h-[310px] overflow-y-auto rounded-[12px] border border-[#E6E0D4]">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead className="bg-[#F5F2EB] text-[#6E6E73] sticky top-0">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Месяц</th>
                      <th className="py-2 px-2 font-semibold">Продажи, компл.</th>
                      <th className="py-2 px-2 font-semibold">Цена, ₽</th>
                      <th className="py-2 px-2 font-semibold">Поступление, компл.</th>
                      <th className="py-2 px-3 font-semibold text-right">Выручка</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE4]">
                    {MONTHS_SHORT_RU.map((mName, idx) => {
                      const revMln = metrics.monthlyRevenuesRub[idx] / 1_000_000;
                      return (
                        <tr key={mName} className="hover:bg-[#FAF8F4]">
                          <td className="py-1.5 px-3 font-semibold text-[#1D1D1F]">
                            {mName}
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="number"
                              value={plan.monthlyPacks[idx]}
                              onChange={(e) =>
                                updateMonthPackOrPrice(
                                  idx,
                                  'packs',
                                  Number(e.target.value)
                                )
                              }
                              className="w-24 h-7 px-2 rounded-[6px] border border-[#D6CFC2] bg-white font-semibold text-[#1D1D1F]"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="number"
                              value={plan.monthlyPricesRub[idx]}
                              onChange={(e) =>
                                updateMonthPackOrPrice(
                                  idx,
                                  'price',
                                  Number(e.target.value)
                                )
                              }
                              className="w-20 h-7 px-2 rounded-[6px] border border-[#D6CFC2] bg-white text-[#1D1D1F]"
                            />
                          </td>
                          <td className="py-1.5 px-2">
                            <input
                              type="number"
                              value={plan.monthlyReceiptsPacks[idx]}
                              onChange={(e) =>
                                updateMonthPackOrPrice(
                                  idx,
                                  'receipts',
                                  Number(e.target.value)
                                )
                              }
                              className="w-20 h-7 px-2 rounded-[6px] border border-[#D6CFC2] bg-[#FAF8F4] text-[#1D1D1F]"
                            />
                          </td>
                          <td className="py-1.5 px-3 text-right font-bold text-[#1D1D1F]">
                            {revMln.toFixed(2).replace('.', ',')} млн ₽
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 5.3. ПЛАН ПРОИЗВОДСТВА И ПОСТАВОК (7 ЭТАПОВ + КОНТРОЛЬ СРОКОВ) */}
        <div className="xl:col-span-2 rounded-[20px] bg-white border border-[#E6E0D4] p-4 space-y-3.5 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[14.5px] font-bold text-[#1D1D1F]">
                План производства и поставок
              </h3>
              <p className="text-[11px] text-[#6E6E73]">
                Кликните на этап для изменения дат
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {model.productionSteps.map((step) => {
              const isEditing = editingStepId === step.id;
              return (
                <div
                  key={step.id}
                  onClick={() =>
                    setEditingStepId(isEditing ? null : step.id)
                  }
                  className={`rounded-[12px] border p-2.5 transition cursor-pointer ${
                    step.status === 'done'
                      ? 'bg-[#F4FAF6] border-[#CBE5D6]'
                      : step.status === 'in_progress'
                      ? 'bg-[#FDF8EE] border-[#EAD4B0]'
                      : 'bg-[#FAF8F4] border-[#EAE4D8] hover:border-[#C8A97E]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-5 w-5 rounded-full text-[10.5px] font-bold flex items-center justify-center shrink-0 ${
                          step.status === 'done'
                            ? 'bg-[#2E6B4E] text-white'
                            : step.status === 'in_progress'
                            ? 'bg-[#D97706] text-white'
                            : 'bg-[#E2DDD2] text-[#5A564F]'
                        }`}
                      >
                        {step.status === 'done' ? '✓' : step.stepNum}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[12px] font-bold text-[#1D1D1F] leading-snug">
                          {step.title}
                        </div>
                        <div className="text-[11px] text-[#6E6E73]">
                          {step.datesLabel}
                        </div>
                      </div>
                    </div>
                  </div>

                  {isEditing && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 pt-2 border-t border-[#E5DEC9] space-y-2"
                    >
                      <input
                        type="text"
                        value={step.datesLabel}
                        onChange={(e) => {
                          const val = e.target.value;
                          const nextSteps = model.productionSteps.map((s) =>
                            s.id === step.id ? { ...s, datesLabel: val } : s
                          );
                          onUpdateModel({ ...model, productionSteps: nextSteps });
                        }}
                        className="w-full h-7 px-2 rounded-[6px] border border-[#D4CDC2] bg-white text-[11.5px]"
                      />
                      <div className="flex items-center gap-1">
                        {(
                          [
                            { id: 'done', label: 'Готово' },
                            { id: 'in_progress', label: 'В работе' },
                            { id: 'planned', label: 'План' },
                          ] as const
                        ).map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              const nextSteps = model.productionSteps.map((s) =>
                                s.id === step.id ? { ...s, status: st.id } : s
                              );
                              onUpdateModel({ ...model, productionSteps: nextSteps });
                            }}
                            className={`flex-1 h-6 rounded-[6px] text-[10px] font-semibold cursor-pointer ${
                              step.status === st.id
                                ? 'bg-[#EAE9E2] text-[#1D1D1F] border border-[#9E9D94]'
                                : 'bg-white border border-[#DED8CC] text-[#6E6E73]'
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={toggleScheduleConflictDemo}
            className="w-full h-8 rounded-[9px] border border-[#E2D5C1] bg-[#FAF6EE] hover:bg-[#F3ECE0] text-[11px] font-semibold text-[#7A5C38] transition cursor-pointer"
          >
            {metrics.hasScheduleConflict
              ? 'Вернуть склад на 18 марта'
              : 'Тест конфликта: склад 12 апреля'}
          </button>
        </div>

        {/* 5.4. ПРАВАЯ КОЛОНКА: ЗАКУПКИ И ОСТАТКИ (Стр. 15 макета + ТЕСТ 06) */}
        <div className="xl:col-span-3 rounded-[20px] bg-white border border-[#E6E0D4] p-5 space-y-4 shadow-2xs">
          <div>
            <h3 className="text-[15px] font-bold text-[#1D1D1F]">Закупки и остатки</h3>
            <p className="text-[11.5px] text-[#6E6E73]">
              Конечный остаток = начальный + поступления − продажи
            </p>
          </div>

          {/* Первая партия (как на макете Стр. 15) */}
          <div className="rounded-[14px] bg-[#FAF6EE] border border-[#E8DEC8] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#6E6E73]">
                1-й заказ (стартовая партия)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#2E6B4E]/12 text-[#2E6B4E] text-[10px] font-bold">
                Обеспечено
              </span>
            </div>
            <div className="text-[22px] font-bold text-[#1D1D1F] leading-tight">
              {(plan.firstOrderPacks * model.unitsInPack).toLocaleString('ru-RU')} шт.
            </div>
            <div className="text-[12px] text-[#5A564F]">
              ({plan.firstOrderPacks.toLocaleString('ru-RU')} комплектов по{' '}
              {model.unitsInPack} шт.)
            </div>

            <div className="pt-2 border-t border-[#E5DEC9] space-y-1 text-[11.5px]">
              <div className="flex justify-between">
                <span className="text-[#6E6E73]">Себестоимость с доставкой в РФ:</span>
                <span className="font-bold text-[#1D1D1F]">
                  {model.unitCostRub} ₽ / компл. (
                  {Math.round(model.unitCostRub / model.unitsInPack)} ₽ / шт.)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E6E73]">Сумма 1-го заказа:</span>
                <span className="font-bold text-[#1D1D1F]">
                  {firstOrderSumMln.toFixed(2).replace('.', ',')} млн ₽
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6E6E73]">Следующий дозаказ:</span>
                <span className="font-semibold text-[#8B6F47]">
                  {plan.nextOrderDateLabel}
                </span>
              </div>
            </div>
          </div>

          {/* ПРОВЕРКА ДЕФИЦИТА (ТЕСТ 06) */}
          {metrics.deficitMonths.length > 0 ? (
            <div className="rounded-[14px] bg-[#FFF4F2] border border-[#E05246] p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#9E2418]">
                  ⚠ Дефицит товара на складе
                </span>
                <span className="text-[11px] font-bold text-[#C93B2B]">
                  {metrics.deficitMonths.length} мес.
                </span>
              </div>
              <p className="text-[11.5px] text-[#B83224]">
                Продажи не обеспечены остатком в месяцах:{' '}
                {metrics.deficitMonths
                  .slice(0, 3)
                  .map(
                    (d) =>
                      `${d.monthLabel} (−${d.missingPacks.toLocaleString('ru-RU')} компл.)`
                  )
                  .join(', ')}
              </p>
              <button
                type="button"
                onClick={autoReplenishDeficit}
                className="w-full h-8 rounded-[8px] bg-[#C93B2B] hover:bg-[#A82E20] text-white text-[11.5px] font-semibold cursor-pointer"
              >
                Добавить поставки под план продаж
              </button>
            </div>
          ) : (
            <div className="rounded-[12px] bg-[#F3FAF6] border border-[#C6E4D2] px-3 py-2 text-[11.5px] text-[#256044] font-medium flex items-center justify-between">
              <span>✓ Остатки покрывают все 12 мес. продаж</span>
              <button
                type="button"
                onClick={() =>
                  updateMonthPackOrPrice(5, 'packs', plan.monthlyPacks[5] + 18000)
                }
                className="text-[10.5px] underline cursor-pointer"
              >
                Тест дефицита
              </button>
            </div>
          )}

          {/* График остатков на складе (комплекты) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="font-bold text-[#1D1D1F]">
                График остатков на складе (комплекты)
              </span>
              <span className="text-[10.5px] text-[#8B6F47]">--- Страховой запас</span>
            </div>
            <div className="h-[110px] rounded-[12px] bg-[#FAF8F4] border border-[#EAE4D8] p-2.5 flex items-end gap-1.5 relative">
              <div className="absolute left-2 right-2 bottom-7 border-t border-dashed border-[#D49A8D] pointer-events-none" />
              {metrics.monthlyEndingStockPacks.map((stock, idx) => {
                const isDeficit = stock < 0;
                const absMax = Math.max(
                  10000,
                  ...metrics.monthlyEndingStockPacks.map((s) => Math.abs(s))
                );
                const hPct = Math.max(
                  12,
                  Math.min(100, Math.round((Math.abs(stock) / absMax) * 100))
                );
                return (
                  <div
                    key={MONTHS_SHORT_RU[idx]}
                    title={`${MONTHS_SHORT_RU[idx]}: ${stock.toLocaleString('ru-RU')} компл.`}
                    className="flex-1 h-full flex flex-col justify-end items-center gap-1"
                  >
                    <div
                      style={{ height: `${hPct}%` }}
                      className={`w-full rounded-t-[4px] ${
                        isDeficit ? 'bg-[#E05246]' : 'bg-[#769E89]'
                      }`}
                    />
                    <span className="text-[9px] text-[#6E6E73]">
                      {MONTHS_SHORT_RU[idx].slice(0, 1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowSizeMatrix((v) => !v)}
            className="w-full h-9 rounded-[10px] bg-[#FAF6EE] hover:bg-[#F2EBDC] border border-[#E2D8C5] text-[12px] font-semibold text-[#1D1D1F] cursor-pointer transition"
          >
            {showSizeMatrix
              ? 'Скрыть детализацию по цветам и размерам'
              : 'Детализация по цветам и размерам →'}
          </button>

          {showSizeMatrix && (
            <div className="rounded-[12px] border border-[#E6E0D4] bg-[#FAF8F4] p-3 space-y-2 text-[11px]">
              <div className="font-bold text-[#1D1D1F]">
                Распределение партии ({plan.firstOrderPacks.toLocaleString('ru-RU')} компл.)
                по размерной горке S–2XL:
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-center">
                {[
                  { size: 'S', share: '12%' },
                  { size: 'M', share: '26%' },
                  { size: 'L', share: '32%' },
                  { size: 'XL', share: '20%' },
                  { size: '2XL', share: '10%' },
                ].map((s) => (
                  <div
                    key={s.size}
                    className="rounded-[8px] bg-white border border-[#E5DEC9] p-1.5"
                  >
                    <div className="font-bold text-[#1D1D1F]">{s.size}</div>
                    <div className="text-[#8B6F47] font-semibold">{s.share}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
