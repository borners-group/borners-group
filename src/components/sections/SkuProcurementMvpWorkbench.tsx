'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  GrowthScenarioDef,
  MONTHS_SHORT_RU,
  ScenarioModelSpec,
} from '@/lib/scenarioData';

const MONTHS_SHORT = MONTHS_SHORT_RU;

function formatRubMillions(rub: number): string {
  return `${(rub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
}
import {
  ApprovedPurchaseOrder,
  CustomBatchPeriodDef,
  DEFAULT_QUARTERLY_BATCH_PERIODS,
  MODEL_SCALING_STAGE_LABELS_RU,
  ModelScalingStage,
  PO_STATUS_LABELS_RU,
  RecommendedProcurementBatch,
  allocatePacksBySizeLargestRemainder,
  approveRecommendedBatch,
  computeProcurementPlan,
  createCustomPurchaseOrder,
  ensureModelUnifiedV11,
  recalculateDraftProcurementPlan,
  removeApprovedPurchaseOrder,
  updateApprovedPurchaseOrder,
} from '@/lib/unifiedBusinessEngine';

const SIZES_LIST: ('S' | 'M' | 'L' | 'XL' | 'XXL')[] = ['S', 'M', 'L', 'XL', 'XXL'];

interface NumericInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChangeValue: (next: number) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Поле ввода числа без блокирующего нуля при стирании (позволяет свободно стереть значение клавишей Backspace и ввести новое).
 */
function NumericInput({
  value,
  min = 0,
  max,
  step = 1,
  onChangeValue,
  className = '',
  placeholder = '0',
  ariaLabel,
}: NumericInputProps) {
  const [draft, setDraft] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(value));
    }
  }, [value, focused]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(/\s+/g, '').replace(',', '.');
    if (cleaned === '' || cleaned === '-') {
      const fallback = Math.max(min, 0);
      setDraft(String(fallback));
      if (fallback !== value) onChangeValue(fallback);
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    let clamped = Math.max(min, Math.round(parsed));
    if (typeof max === 'number') {
      clamped = Math.min(max, clamped);
    }
    setDraft(String(clamped));
    if (clamped !== value) {
      onChangeValue(clamped);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      step={step}
      value={draft}
      placeholder={placeholder}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const nextRaw = e.target.value;
        if (!/^[0-9\s.,]*$/.test(nextRaw)) return;
        setDraft(nextRaw);
        const trimmed = nextRaw.trim();
        if (trimmed !== '') {
          const parsed = Number(trimmed.replace(/\s+/g, '').replace(',', '.'));
          if (Number.isFinite(parsed)) {
            let clamped = Math.max(min, Math.round(parsed));
            if (typeof max === 'number') clamped = Math.min(max, clamped);
            if (clamped !== value) {
              onChangeValue(clamped);
            }
          }
        }
      }}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

export interface SkuProcurementMvpWorkbenchProps {
  model: ScenarioModelSpec;
  currentScenario: GrowthScenarioDef;
  onUpdateModel: (updated: ScenarioModelSpec) => void;
  onNotify?: (title: string, message: string, type?: 'success' | 'warning' | 'error') => void;
  onOpenSalesMatrix?: () => void;
}

export function SkuProcurementMvpWorkbench({
  model: rawModel,
  currentScenario,
  onUpdateModel,
  onNotify,
  onOpenSalesMatrix,
}: SkuProcurementMvpWorkbenchProps) {
  const model = useMemo(() => ensureModelUnifiedV11(rawModel), [rawModel]);
  const shared = model.sharedSupplyAndFact!;
  const fp = shared.factoryParams;
  const proc = useMemo(
    () => computeProcurementPlan(model, currentScenario),
    [model, currentScenario]
  );

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showMonthlyTable, setShowMonthlyTable] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingBatchKey, setEditingBatchKey] = useState<string | null>(null);
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [savedStamp, setSavedStamp] = useState<string>('Сохранено');

  // Локальная форма добавления произвольной партии
  const [newBatchStartMonth, setNewBatchStartMonth] = useState<number>(0);
  const [newBatchEndMonth, setNewBatchEndMonth] = useState<number>(2);
  const [newBatchPacks, setNewBatchPacks] = useState<number>(Math.max(1000, fp.moqPacks || 1000));
  const [newBatchOrderDate, setNewBatchOrderDate] = useState<string>('2026-11-12');
  const [newBatchApproveImmediately, setNewBatchApproveImmediately] = useState<boolean>(false);

  const triggerSavedIndicator = (label = 'Сохранено') => {
    const timeStr = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setSavedStamp(`${label} · ${timeStr}`);
  };

  // Авто-выбор первой партии для Зоны В, если ещё ничего не выбрано
  const activeExpandedKey = useMemo(() => {
    if (expandedKey) return expandedKey;
    if (proc.recommendedBatches.length > 0) {
      return `draft-${proc.recommendedBatches[0].periodId}`;
    }
    if (proc.approvedOrders.length > 0) {
      return `po-${proc.approvedOrders[0].id}`;
    }
    if (proc.futureScalingBatches.length > 0) {
      return `future-${proc.futureScalingBatches[0].periodId}`;
    }
    return null;
  }, [expandedKey, proc.recommendedBatches, proc.approvedOrders, proc.futureScalingBatches]);

  const sizeShareSum = useMemo(
    () => SIZES_LIST.reduce((sum, sz) => sum + (Number(fp.sizeSharesPct[sz]) || 0), 0),
    [fp.sizeSharesPct]
  );

  const activePeriods: CustomBatchPeriodDef[] = useMemo(
    () =>
      Array.isArray(fp.customBatchPeriods) && fp.customBatchPeriods.length > 0
        ? [...fp.customBatchPeriods].sort((a, b) => a.startMonthIdx - b.startMonthIdx)
        : DEFAULT_QUARTERLY_BATCH_PERIODS,
    [fp.customBatchPeriods]
  );

  const handleUpdateOpeningStock = (nextPacks: number) => {
    const clean = Math.max(0, Math.round(nextPacks));
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        actualOpeningStockPacks: clean,
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleUpdateUnitCost = (nextCostRub: number) => {
    const clean = Math.max(0, Math.round(nextCostRub));
    onUpdateModel({
      ...model,
      unitCostRub: clean,
      sharedSupplyAndFact: {
        ...shared,
        costStatus: clean > 0 && shared.costStatus === 'not_filled' ? 'plan' : shared.costStatus,
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleUpdateTotalLeadDays = (nextTotalDays: number) => {
    const cleanTotal = Math.max(1, Math.round(nextTotalDays));
    const fixedOtherDays =
      Math.max(0, fp.qcDays) +
      Math.max(0, fp.logisticsLeadDays) +
      Math.max(0, fp.acceptanceDays);
    const nextProdDays = Math.max(1, cleanTotal - fixedOtherDays);
    const adjustedQc = cleanTotal < fixedOtherDays + 1 ? 0 : fp.qcDays;
    const adjustedLog = cleanTotal < fixedOtherDays + 1 ? 0 : fp.logisticsLeadDays;
    const adjustedAcc = cleanTotal < fixedOtherDays + 1 ? 0 : fp.acceptanceDays;

    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          productionLeadDays:
            cleanTotal < fixedOtherDays + 1 ? cleanTotal : nextProdDays,
          qcDays: adjustedQc,
          logisticsLeadDays: adjustedLog,
          acceptanceDays: adjustedAcc,
        },
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleUpdateScalingStage = (nextStage: ModelScalingStage) => {
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        scalingStage: nextStage,
      },
    });
    triggerSavedIndicator('Сохранено');
    onNotify?.(
      `Статус модели: ${MODEL_SCALING_STAGE_LABELS_RU[nextStage]}`,
      nextStage === 'scaling'
        ? 'Открыт расчёт всех квартальных партий под годовой план продаж.'
        : 'Режим осторожного масштабирования: к заказу формируется только первая тестовая партия.',
      'success'
    );
  };

  const handleUpdateMoq = (nextMoq: number) => {
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          moqPacks: Math.max(1, Math.round(nextMoq)),
        },
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleUpdatePackMultiple = (nextMultiple: number) => {
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          packMultiple: Math.max(1, Math.round(nextMultiple)),
        },
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleUpdateSafetyDays = (nextDays: number) => {
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          safetyStockDays: Math.max(0, Math.round(nextDays)),
        },
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleUpdateModelSizeShare = (sz: 'S' | 'M' | 'L' | 'XL' | 'XXL', pct: number) => {
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          sizeSharesPct: {
            ...fp.sizeSharesPct,
            [sz]: Math.max(0, Math.min(100, Math.round(pct))),
          },
        },
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleNormalizeSizeSharesTo100 = () => {
    const defaultMatrix = { S: 10, M: 25, L: 35, XL: 20, XXL: 10 };
    if (sizeShareSum <= 0) {
      onUpdateModel({
        ...model,
        sharedSupplyAndFact: {
          ...shared,
          factoryParams: {
            ...fp,
            sizeSharesPct: defaultMatrix,
          },
        },
      });
      triggerSavedIndicator('Сохранено');
      return;
    }
    const normalized = allocatePacksBySizeLargestRemainder(100, fp.sizeSharesPct);
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          sizeSharesPct: normalized,
        },
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleRecalculateDrafts = () => {
    const nextModel = recalculateDraftProcurementPlan(model);
    onUpdateModel(nextModel);
    triggerSavedIndicator('Пересчитано');
    onNotify?.(
      'План закупок пересчитан',
      'Черновые партии обновлены по формуле плана продаж. Утверждённые заказы PO сохранены без изменений.',
      'success'
    );
  };

  const handleResetToDefaultQuarters = () => {
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          customBatchPeriods: undefined,
        },
      },
    });
    triggerSavedIndicator('Сброшено к 4 кварталам');
  };

  // Редактирование параметров конкретной черновой партии (Зона В)
  const updateDraftPeriodDef = (
    periodId: string,
    updater: (prev: CustomBatchPeriodDef) => CustomBatchPeriodDef
  ) => {
    const nextPeriods = activePeriods.map((p) => (p.id === periodId ? updater(p) : p));
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          customBatchPeriods: nextPeriods,
        },
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleMergeWithNextPeriod = (periodId: string) => {
    const idx = activePeriods.findIndex((p) => p.id === periodId);
    if (idx < 0 || idx >= activePeriods.length - 1) return;
    const current = activePeriods[idx];
    const next = activePeriods[idx + 1];
    const merged: CustomBatchPeriodDef = {
      id: current.id,
      startMonthIdx: current.startMonthIdx,
      endMonthIdx: Math.max(current.endMonthIdx, next.endMonthIdx),
    };
    const nextList = [
      ...activePeriods.slice(0, idx),
      merged,
      ...activePeriods.slice(idx + 2),
    ];
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
    triggerSavedIndicator('Партии объединены');
  };

  const handleSplitPeriod = (periodId: string) => {
    const idx = activePeriods.findIndex((p) => p.id === periodId);
    if (idx < 0) return;
    const current = activePeriods[idx];
    if (current.endMonthIdx <= current.startMonthIdx) return;
    const mid = Math.floor((current.startMonthIdx + current.endMonthIdx) / 2);
    const firstHalf: CustomBatchPeriodDef = {
      id: `${current.id}-a`,
      startMonthIdx: current.startMonthIdx,
      endMonthIdx: mid,
    };
    const secondHalf: CustomBatchPeriodDef = {
      id: `${current.id}-b`,
      startMonthIdx: mid + 1,
      endMonthIdx: current.endMonthIdx,
    };
    const nextList = [
      ...activePeriods.slice(0, idx),
      firstHalf,
      secondHalf,
      ...activePeriods.slice(idx + 1),
    ];
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
    setExpandedKey(`draft-${firstHalf.id}`);
    triggerSavedIndicator('Партия разделена');
  };

  const handleDeleteDraftPeriod = (periodId: string) => {
    if (activePeriods.length <= 1) return;
    const nextList = activePeriods.filter((p) => p.id !== periodId);
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
    triggerSavedIndicator('Партия удалена');
  };

  const handleApproveDraftBatch = (batch: RecommendedProcurementBatch) => {
    const updated = approveRecommendedBatch(model, batch, 'Владелец');
    onUpdateModel(updated);
    const newestPo = updated.sharedSupplyAndFact?.approvedOrders.slice(-1)[0];
    if (newestPo) {
      setExpandedKey(`po-${newestPo.id}`);
    }
    triggerSavedIndicator('Заказ утверждён');
    onNotify?.(
      'Партия утверждена в заказ PO',
      `Зафиксировано ${batch.recommendedPacks.toLocaleString('ru-RU')} компл. (${batch.estimatedTotalRub.toLocaleString('ru-RU')} ₽) на период ${batch.coverageMonthsLabel}.`,
      'success'
    );
  };

  const handleAddBatchSubmit = () => {
    const startM = Math.min(11, Math.max(0, newBatchStartMonth));
    const endM = Math.min(11, Math.max(startM, newBatchEndMonth));
    const cleanPacks = Math.max(1, Math.round(newBatchPacks || 1000));

    if (newBatchApproveImmediately) {
      const updated = createCustomPurchaseOrder(model, {
        packsQty: cleanPacks,
        unitCostRub: model.unitCostRub,
        arrivalMonthIdx: startM,
        orderPlacementDateIso: newBatchOrderDate,
        note: `Покрытие ${
          startM === endM
            ? `${MONTHS_SHORT[startM]} 2027`
            : `${MONTHS_SHORT[startM]}–${MONTHS_SHORT[endM]} 2027`
        }`,
      });
      onUpdateModel(updated);
      setShowAddCustomModal(false);
      triggerSavedIndicator('Добавлен PO');
      return;
    }

    const newId = `custom-${Date.now().toString(36)}`;
    const nextPeriods: CustomBatchPeriodDef[] = [
      ...activePeriods,
      {
        id: newId,
        startMonthIdx: startM,
        endMonthIdx: endM,
        customPacksQty: cleanPacks,
        customOrderDateIso: newBatchOrderDate,
      },
    ].sort((a, b) => a.startMonthIdx - b.startMonthIdx);

    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          customBatchPeriods: nextPeriods,
        },
      },
    });
    setExpandedKey(`draft-${newId}`);
    setShowAddCustomModal(false);
    triggerSavedIndicator('Партия добавлена');
  };

  const confirmedPoCount = proc.approvedOrders.filter(
    (po) => po.confirmedByFactory !== false
  ).length;

  return (
    <div className="space-y-4">
      {/* =====================================================================
          ЗОНА А · ПАРАМЕТРЫ + 2 ГЛАВНЫЕ ЦИФРЫ (Раздел 2, 7, 10 ТЗ MVP)
         ===================================================================== */}
      <div className="rounded-xl border border-[#DFE4EC] bg-white p-4 shadow-2xs">
        {/* Шапка Зоны А: Название модели + Статус масштабирования + ✓ Сохранено */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] pb-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded bg-[#111827] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
              Зона А · Параметры
            </span>
            <h3 className="text-[15px] font-bold text-[#111827]">
              ЗАКУПКИ · {model.title}
            </h3>
            <span className="rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#4B5563]">
              {model.code} · {model.unitsInPack} изд./компл.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Переключатель статуса масштабирования (Раздел 8 ТЗ) */}
            <div
              className="inline-flex items-center rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-0.5"
              title="Раздел 8 ТЗ: Пока у модели статус «Гипотеза» или «Тест», к утверждению формируется только первая тестовая партия"
            >
              {(['hypothesis', 'test', 'scaling'] as ModelScalingStage[]).map((st) => {
                const active = proc.scalingStage === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleUpdateScalingStage(st)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                      active
                        ? 'bg-[#111827] text-white shadow-2xs'
                        : 'text-[#4B5563] hover:text-[#111827]'
                    }`}
                  >
                    {MODEL_SCALING_STAGE_LABELS_RU[st]}
                  </button>
                );
              })}
            </div>

            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              <span>✓</span>
              <span>{savedStamp}</span>
            </span>
          </div>
        </div>

        {/* Строка ключевых параметров (План продаж | Остаток | Цена | Цикл | Доп. настройки) */}
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {/* 1. План продаж */}
          <div className="flex flex-col justify-between rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-medium text-[#6B7280]">
                План продаж ({currentScenario.title.split('·')[0].trim()})
              </span>
              {onOpenSalesMatrix && (
                <button
                  type="button"
                  onClick={onOpenSalesMatrix}
                  className="text-[10px] font-semibold text-[#111827] underline decoration-dotted hover:text-black"
                >
                  По месяцам ↗
                </button>
              )}
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono text-[15px] font-bold text-[#111827]">
                {proc.annualDemandPacks.toLocaleString('ru-RU')} компл.
              </span>
              <span className="text-[11px] text-[#6B7280]">
                {proc.annualDemandUnits.toLocaleString('ru-RU')} изд.
              </span>
            </div>
          </div>

          {/* 2. Начальный остаток (свободно редактируемый) */}
          <label className="flex flex-col justify-between rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 focus-within:border-[#111827] focus-within:ring-1 focus-within:ring-[#111827]">
            <span className="text-[11px] font-semibold text-[#374151]">
              Остаток на складе, компл.
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              <NumericInput
                ariaLabel="Начальный остаток, комплектов"
                value={shared.actualOpeningStockPacks}
                min={0}
                step={50}
                onChangeValue={handleUpdateOpeningStock}
                className="w-full rounded border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1 font-mono text-[14px] font-bold text-[#111827] focus:bg-white focus:outline-none"
              />
              <span className="shrink-0 text-[11px] font-medium text-[#6B7280]">компл.</span>
            </div>
          </label>

          {/* 3. Себестоимость комплекта */}
          <label className="flex flex-col justify-between rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 focus-within:border-[#111827] focus-within:ring-1 focus-within:ring-[#111827]">
            <span className="text-[11px] font-semibold text-[#374151]">
              Цена закупки (себест.), ₽
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              <NumericInput
                ariaLabel="Себестоимость комплекта, рублей"
                value={model.unitCostRub || 0}
                min={0}
                step={10}
                onChangeValue={handleUpdateUnitCost}
                className="w-full rounded border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1 font-mono text-[14px] font-bold text-[#111827] focus:bg-white focus:outline-none"
              />
              <span className="shrink-0 text-[11px] font-medium text-[#6B7280]">₽/компл.</span>
            </div>
          </label>

          {/* 4. Цикл производства и поставки */}
          <label className="flex flex-col justify-between rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 focus-within:border-[#111827] focus-within:ring-1 focus-within:ring-[#111827]">
            <span className="text-[11px] font-semibold text-[#374151]">
              Цикл поставки, дней
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              <NumericInput
                ariaLabel="Цикл производства и логистики, дней"
                value={proc.totalLeadDays}
                min={1}
                max={365}
                step={5}
                onChangeValue={handleUpdateTotalLeadDays}
                className="w-full rounded border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-1 font-mono text-[14px] font-bold text-[#111827] focus:bg-white focus:outline-none"
              />
              <span className="shrink-0 text-[11px] font-medium text-[#6B7280]">дней</span>
            </div>
          </label>

          {/* 5. Кнопка раскрытия дополнительных настроек (Размеры S–XXL, MOQ, кратность) */}
          <div className="flex flex-col justify-between rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2">
            <span className="text-[11px] font-medium text-[#6B7280]">
              MOQ {fp.moqPacks.toLocaleString('ru-RU')} · Шаг {fp.packMultiple} · Сетка S–XXL
            </span>
            <button
              type="button"
              onClick={() => setShowAdvancedSettings((v) => !v)}
              className="mt-1 inline-flex items-center justify-between rounded border border-[#D1D5DB] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#111827] hover:bg-[#F3F4F6]"
            >
              <span>Доп. настройки</span>
              <span>{showAdvancedSettings ? '▴' : '▾'}</span>
            </button>
          </div>
        </div>

        {/* Раскрывающийся блок «Дополнительные настройки» (Единая размерная сетка S-XXL, MOQ, Кратность, Страховой запас) */}
        {showAdvancedSettings && (
          <div className="mt-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              {/* Единая размерная сетка модели (%) — Раздел 5 ТЗ */}
              <div className="lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-[#111827] uppercase">
                    Единая размерная сетка модели (S–XXL, сумма = 100%)
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                        sizeShareSum === 100
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      Сумма: {sizeShareSum}%
                    </span>
                    {sizeShareSum !== 100 && (
                      <button
                        type="button"
                        onClick={handleNormalizeSizeSharesTo100}
                        className="rounded bg-[#111827] px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-black"
                      >
                        Выровнять до 100%
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {SIZES_LIST.map((sz) => (
                    <label
                      key={sz}
                      className="flex flex-col rounded border border-[#D1D5DB] bg-white px-2 py-1.5"
                    >
                      <span className="text-[10px] font-bold text-[#6B7280]">{sz}, %</span>
                      <NumericInput
                        ariaLabel={`Доля размера ${sz}, %`}
                        value={fp.sizeSharesPct[sz] ?? 20}
                        min={0}
                        max={100}
                        onChangeValue={(val) => handleUpdateModelSizeShare(sz, val)}
                        className="mt-0.5 w-full font-mono text-[13px] font-bold text-[#111827] focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* MOQ, Кратность и Целевой запас */}
              <div className="grid grid-cols-3 gap-2 lg:col-span-5">
                <label className="flex flex-col justify-between rounded border border-[#D1D5DB] bg-white px-2.5 py-1.5">
                  <span className="text-[10px] font-bold text-[#6B7280]">
                    MOQ (мин. партия)
                  </span>
                  <div className="mt-1 flex items-center gap-1">
                    <NumericInput
                      ariaLabel="MOQ, комплектов"
                      value={fp.moqPacks}
                      min={1}
                      step={100}
                      onChangeValue={handleUpdateMoq}
                      className="w-full font-mono text-[13px] font-bold text-[#111827] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#6B7280]">компл.</span>
                  </div>
                </label>

                <label className="flex flex-col justify-between rounded border border-[#D1D5DB] bg-white px-2.5 py-1.5">
                  <span className="text-[10px] font-bold text-[#6B7280]">
                    Кратность (шаг)
                  </span>
                  <div className="mt-1 flex items-center gap-1">
                    <NumericInput
                      ariaLabel="Кратность заказа, комплектов"
                      value={fp.packMultiple}
                      min={1}
                      step={50}
                      onChangeValue={handleUpdatePackMultiple}
                      className="w-full font-mono text-[13px] font-bold text-[#111827] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#6B7280]">компл.</span>
                  </div>
                </label>

                <label className="flex flex-col justify-between rounded border border-[#D1D5DB] bg-white px-2.5 py-1.5">
                  <span className="text-[10px] font-bold text-[#6B7280]">
                    Целевой запас
                  </span>
                  <div className="mt-1 flex items-center gap-1">
                    <NumericInput
                      ariaLabel="Целевой запас на конец периода, дней"
                      value={fp.safetyStockDays}
                      min={0}
                      max={180}
                      step={5}
                      onChangeValue={handleUpdateSafetyDays}
                      className="w-full font-mono text-[13px] font-bold text-[#111827] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#6B7280]">дн.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ДВЕ ГЛАВНЫЕ ЦИФРЫ («К заказу, компл.» и «Бюджет, ₽») + компактная строка остатков и PO + кнопки */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-4 py-3">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-[11px] font-semibold text-[#6B7280] uppercase">
                К заказу, компл.
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-mono text-[22px] font-extrabold text-[#111827]">
                  {proc.totalRecommendedPacks.toLocaleString('ru-RU')} компл.
                </span>
                <span className="text-[12px] font-medium text-[#6B7280]">
                  ({proc.totalRecommendedUnits.toLocaleString('ru-RU')} изд.)
                </span>
              </div>
            </div>

            <div className="h-9 w-px bg-[#D1D5DB]" />

            <div>
              <div className="text-[11px] font-semibold text-[#6B7280] uppercase">
                Бюджет, ₽
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-mono text-[22px] font-extrabold text-[#111827]">
                  {proc.totalRecommendedBudgetRub !== null
                    ? formatRubMillions(proc.totalRecommendedBudgetRub)
                    : 'Не задана цена'}
                </span>
                {proc.totalRecommendedBudgetRub !== null && (
                  <span className="text-[12px] font-medium text-[#6B7280]">
                    ({proc.totalRecommendedBudgetRub.toLocaleString('ru-RU')} ₽)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRecalculateDrafts}
              className="rounded-lg bg-[#111827] px-3.5 py-2 text-[12px] font-semibold text-white shadow-2xs transition hover:bg-black"
            >
              Рассчитать закупки
            </button>
            <button
              type="button"
              onClick={() => setShowAddCustomModal((v) => !v)}
              className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-[12px] font-semibold text-[#111827] transition hover:bg-[#F3F4F6]"
            >
              + Добавить партию
            </button>
            {fp.customBatchPeriods && (
              <button
                type="button"
                onClick={handleResetToDefaultQuarters}
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2 text-[11px] font-medium text-[#4B5563] hover:text-[#111827]"
              >
                4 квартала по умолч.
              </button>
            )}
          </div>
        </div>

        {/* Компактная строка под двумя главными цифрами: остатки и подтверждённые заказы */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-[#4B5563]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Остаток на складе:{' '}
              <strong className="font-mono text-[#111827]">
                {proc.netOpeningAvailablePacks.toLocaleString('ru-RU')} компл.
              </strong>
            </span>
            <span>·</span>
            <span>
              Подтверждённые заказы PO:{' '}
              <strong className="font-mono text-[#111827]">
                {proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} компл.
              </strong>{' '}
              ({confirmedPoCount} шт.)
            </span>
            {proc.futureScalingPacks > 0 && (
              <>
                <span>·</span>
                <span className="text-amber-800">
                  Будущая потребность (после теста):{' '}
                  <strong className="font-mono">
                    {proc.futureScalingPacks.toLocaleString('ru-RU')} компл.
                  </strong>
                  {proc.futureScalingBudgetRub !== null &&
                    ` (${formatRubMillions(proc.futureScalingBudgetRub)})`}
                </span>
              </>
            )}
          </div>
          <span className="text-[11px] text-[#6B7280]">{proc.supplyStatusLabel}</span>
        </div>

        {/* Форма «+ Добавить партию» (раскрывается по кнопке) */}
        {showAddCustomModal && (
          <div className="mt-3 rounded-lg border border-[#111827] bg-[#F9FAFB] p-3">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[12px] font-bold text-[#111827]">
                Новая партия закупки
              </span>
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="text-[11px] font-medium text-[#6B7280] hover:text-[#111827]"
              >
                Закрыть ✕
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
              <label className="flex flex-col text-[11px] font-medium text-[#4B5563]">
                Начало покрытия
                <select
                  value={newBatchStartMonth}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setNewBatchStartMonth(m);
                    if (newBatchEndMonth < m) setNewBatchEndMonth(m);
                  }}
                  className="mt-1 rounded border border-[#D1D5DB] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#111827]"
                >
                  {MONTHS_SHORT.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m} 2027
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col text-[11px] font-medium text-[#4B5563]">
                Конец покрытия
                <select
                  value={newBatchEndMonth}
                  onChange={(e) => setNewBatchEndMonth(Number(e.target.value))}
                  className="mt-1 rounded border border-[#D1D5DB] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#111827]"
                >
                  {MONTHS_SHORT.map((m, idx) => (
                    <option key={m} value={idx} disabled={idx < newBatchStartMonth}>
                      {m} 2027
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col text-[11px] font-medium text-[#4B5563]">
                Количество, компл.
                <NumericInput
                  value={newBatchPacks}
                  min={1}
                  step={50}
                  onChangeValue={setNewBatchPacks}
                  className="mt-1 rounded border border-[#D1D5DB] bg-white px-2 py-1.5 font-mono text-[12px] font-bold text-[#111827]"
                />
              </label>

              <label className="flex flex-col text-[11px] font-medium text-[#4B5563]">
                Дата заказа до
                <input
                  type="date"
                  value={newBatchOrderDate}
                  onChange={(e) => setNewBatchOrderDate(e.target.value)}
                  className="mt-1 rounded border border-[#D1D5DB] bg-white px-2 py-1.5 font-mono text-[12px] font-semibold text-[#111827]"
                />
              </label>

              <div className="flex flex-col justify-end gap-1.5">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-[#374151]">
                  <input
                    type="checkbox"
                    checked={newBatchApproveImmediately}
                    onChange={(e) => setNewBatchApproveImmediately(e.target.checked)}
                    className="rounded border-[#D1D5DB]"
                  />
                  <span>Сразу утвердить PO</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddBatchSubmit}
                  className="rounded bg-[#111827] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-black"
                >
                  Сохранить партию
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          ЗОНА Б · ПЛАН ЗАКУПОК + ЗОНА В · ДЕТАЛИЗАЦИЯ ПО КЛИКУ (Раздел 2, 6, 10)
         ===================================================================== */}
      <div className="rounded-xl border border-[#DFE4EC] bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="rounded bg-[#111827] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
              Зона Б · План закупок
            </span>
            <h4 className="text-[14px] font-bold text-[#111827]">
              Партии к заказу и утверждённые поставки
            </h4>
          </div>
          <span className="text-[11px] text-[#6B7280]">
            Нажмите на строку партии, чтобы открыть Зону В (формула расчёта, размеры S–XXL и управление)
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {/* 1. Уже утверждённые заказы PO (не переписываются пересчётом!) */}
          {proc.approvedOrders.map((po, poIdx) => {
            const rowKey = `po-${po.id}`;
            const isExpanded = activeExpandedKey === rowKey;
            const confirmed = po.confirmedByFactory !== false;
            const discrepancy = proc.orderDiscrepancies.find((d) => d.orderId === po.id);
            const poSizes =
              po.sizeBreakdownPacks ||
              allocatePacksBySizeLargestRemainder(po.packsQty, fp.sizeSharesPct);
            const poSizeTotal = SIZES_LIST.reduce((s, sz) => s + (poSizes[sz] || 0), 0);

            return (
              <div
                key={po.id}
                className={`rounded-xl border transition ${
                  isExpanded
                    ? 'border-[#111827] bg-[#F9FAFB]'
                    : 'border-[#E5E7EB] bg-white hover:border-[#D1D5DB]'
                }`}
              >
                {/* Компактная строка партии */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedKey(isExpanded ? null : rowKey);
                    }
                  }}
                  className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-[12px] font-bold text-[#111827]">
                      Заказ #{poIdx + 1} ·{' '}
                      {po.coverageMonthsLabel || `${MONTHS_SHORT[po.arrivalMonthIdx]} 2027`}
                    </span>
                    <span className="rounded border border-[#E5E7EB] bg-[#F3F4F6] px-2 py-0.5 font-mono text-[11px] text-[#374151]">
                      {po.orderNumber}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[12px]">
                    <span className="font-mono font-bold text-[#111827]">
                      {po.packsQty.toLocaleString('ru-RU')} компл.
                    </span>
                    <span className="text-[#D1D5DB]">|</span>
                    <span className="font-mono font-semibold text-[#111827]">
                      {formatRubMillions(po.totalOrderRub)}
                    </span>
                    <span className="text-[#D1D5DB]">|</span>
                    <span className="font-mono text-[#4B5563]">
                      Заказ от {po.orderPlacementDateIso}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        confirmed
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {confirmed ? 'Утверждено · Подтв. фабрикой' : 'Ожидает подтв. фабрики'}
                    </span>
                    <span className="text-[#6B7280]">{isExpanded ? '▴' : '▾'}</span>
                  </div>
                </div>

                {/* ЗОНА В · Детализация утверждённого заказа PO */}
                {isExpanded && (
                  <div className="border-t border-[#E5E7EB] bg-white px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                      <span className="rounded bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold text-[#111827] uppercase">
                        Зона В · Детализация утверждённого заказа {po.orderNumber}
                      </span>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-[#111827]">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => {
                            const updated = updateApprovedPurchaseOrder(model, po.id, {
                              confirmedByFactory: e.target.checked,
                            });
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="rounded border-[#D1D5DB]"
                        />
                        <span>Подтверждён фабрикой (учитывать в гарантированных поставках)</span>
                      </label>
                    </div>

                    {discrepancy && (
                      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-900">
                        <strong>Зафиксированный PO сохранён без изменений:</strong>{' '}
                        {discrepancy.message}
                      </div>
                    )}

                    {/* Таблица размеров S–XXL для PO */}
                    <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-2.5">
                      <div className="text-[11px] font-semibold text-[#374151]">
                        Размеры партии (S–XXL): комплекты и физические изделия ({po.unitsInPack}{' '}
                        шт./компл.)
                      </div>
                      <div className="mt-2 grid grid-cols-6 gap-2 text-center text-[11px]">
                        {SIZES_LIST.map((sz) => (
                          <div
                            key={sz}
                            className="rounded border border-[#E5E7EB] bg-white px-2 py-1.5"
                          >
                            <div className="font-bold text-[#6B7280]">{sz}</div>
                            <div className="font-mono text-[13px] font-bold text-[#111827]">
                              {(poSizes[sz] || 0).toLocaleString('ru-RU')} компл.
                            </div>
                            <div className="font-mono text-[10px] text-[#6B7280]">
                              {((poSizes[sz] || 0) * po.unitsInPack).toLocaleString('ru-RU')} изд.
                            </div>
                          </div>
                        ))}
                        <div className="rounded border border-[#111827] bg-[#111827] px-2 py-1.5 text-white">
                          <div className="font-bold text-gray-300">ИТОГО</div>
                          <div className="font-mono text-[13px] font-bold">
                            {poSizeTotal.toLocaleString('ru-RU')} компл.
                          </div>
                          <div className="font-mono text-[10px] text-gray-300">
                            {(poSizeTotal * po.unitsInPack).toLocaleString('ru-RU')} изд.
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Управление утверждённым PO */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#4B5563]">
                        <span>Статус поставки:</span>
                        <select
                          value={po.status}
                          onChange={(e) => {
                            const updated = updateApprovedPurchaseOrder(model, po.id, {
                              status: e.target.value as ApprovedPurchaseOrder['status'],
                            });
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="rounded border border-[#D1D5DB] bg-white px-2 py-1 text-[11px] font-semibold text-[#111827]"
                        >
                          {Object.entries(PO_STATUS_LABELS_RU).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                        <span>
                          · Зафиксированная цена: <strong>{po.lockedUnitCostRub} ₽/компл.</strong>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = removeApprovedPurchaseOrder(model, po.id);
                          onUpdateModel(updated);
                          triggerSavedIndicator('Заказ удалён');
                        }}
                        className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100"
                      >
                        Удалить тестовый заказ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* 2. Черновые рекомендуемые партии к заказу (по умолчанию 4 квартала) */}
          {proc.recommendedBatches.map((batch, bIdx) => {
            const rowKey = `draft-${batch.periodId}`;
            const isExpanded = activeExpandedKey === rowKey;
            const isEditing = editingBatchKey === rowKey;
            const sizeTotalPacks = SIZES_LIST.reduce(
              (s, sz) => s + (batch.sizeBreakdownPacks[sz] || 0),
              0
            );
            const periodIdxInList = activePeriods.findIndex((p) => p.id === batch.periodId);
            const canMergeNext =
              periodIdxInList >= 0 && periodIdxInList < activePeriods.length - 1;
            const canSplit = batch.endCoveredMonthIdx > batch.firstCoveredMonthIdx;

            return (
              <div
                key={batch.periodId}
                className={`rounded-xl border transition ${
                  isExpanded
                    ? 'border-[#111827] bg-[#F9FAFB]'
                    : 'border-[#E5E7EB] bg-white hover:border-[#D1D5DB]'
                }`}
              >
                {/* Компактная строка партии (Формат из Раздела 10 Стр. 5) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedKey(isExpanded ? null : rowKey);
                    }
                  }}
                  className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-bold text-[#111827]">
                      Партия №{bIdx + 1} · {batch.coverageMonthsLabel.replace(' 2027', '')}
                    </span>
                    {batch.isAdditionalOrder && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                        Дополнительно к заказу
                      </span>
                    )}
                    {batch.isTestBatch && (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                        Тестовая партия ({MODEL_SCALING_STAGE_LABELS_RU[proc.scalingStage]})
                      </span>
                    )}
                    {batch.isUrgentPastOrderDate && (
                      <span
                        className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900"
                        title="Расчётная дата заказа в прошлом — вы можете скорректировать дату вручную в Зоне В"
                      >
                        ⚠ Дата в прошлом
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[12px]">
                    <span className="font-mono text-[13px] font-bold text-[#111827]">
                      {batch.recommendedPacks.toLocaleString('ru-RU')} компл.
                    </span>
                    <span className="text-[#D1D5DB]">|</span>
                    <span className="font-mono font-semibold text-[#111827]">
                      {formatRubMillions(batch.estimatedTotalRub)}
                    </span>
                    <span className="text-[#D1D5DB]">|</span>
                    <span className="font-mono text-[#4B5563]">
                      Заказ до {batch.recommendedOrderDateIso}
                    </span>
                    <span className="rounded-md border border-[#D1D5DB] bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-bold text-[#111827]">
                      План
                    </span>
                    <span className="text-[#6B7280]">{isExpanded ? '▴' : '▾'}</span>
                  </div>
                </div>

                {/* ЗОНА В · Детализация выбранной партии (раскрывается по клику) */}
                {isExpanded && (
                  <div className="border-t border-[#E5E7EB] bg-white px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#111827] px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                          Зона В · Детализация партии №{bIdx + 1} ({batch.coverageMonthsLabel})
                        </span>
                        <span className="text-[11px] text-[#6B7280]">
                          Приход к {batch.requiredArrivalDateIso} · Цикл {batch.totalLeadDays} дн.
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingBatchKey(isEditing ? null : rowKey)}
                          className="rounded-lg border border-[#D1D5DB] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#111827] hover:bg-[#F3F4F6]"
                        >
                          {isEditing ? 'Готово' : 'Изменить'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveDraftBatch(batch)}
                          className="rounded-lg bg-[#111827] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-2xs hover:bg-black"
                        >
                          Утвердить заказ
                        </button>
                      </div>
                    </div>

                    {/* Формула расчёта потребности (Раздел 4 ТЗ) */}
                    <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-[11px] text-[#374151]">
                      <span className="font-semibold text-[#111827]">Формула расчёта: </span>
                      Плановые выкупы ({batch.periodDemandPacks.toLocaleString('ru-RU')} компл.) +
                      Целевой запас ({batch.safetyStockPacks.toLocaleString('ru-RU')} компл.) −
                      Остаток к началу ({batch.openingAvailableAtStartPacks.toLocaleString('ru-RU')}{' '}
                      компл.) − Подтверждённые PO (
                      {batch.confirmedReceiptsInPeriodPacks.toLocaleString('ru-RU')} компл.) ={' '}
                      <strong>
                        чистая потребность {batch.rawNetNeedPacks.toLocaleString('ru-RU')} компл.
                      </strong>{' '}
                      → с округлением до MOQ ({fp.moqPacks.toLocaleString('ru-RU')}) и шага (
                      {fp.packMultiple}):{' '}
                      <strong className="font-mono text-[#111827]">
                        {batch.recommendedPacks.toLocaleString('ru-RU')} компл. (
                        {batch.physicalUnitsQty.toLocaleString('ru-RU')} изд.)
                      </strong>
                    </div>

                    {/* Режим редактирования партии до утверждения (месяцы покрытия, количество, дата заказа, объединение/деление) */}
                    {isEditing && (
                      <div className="mt-2.5 rounded-lg border border-[#D1D5DB] bg-[#F9FAFB] p-3">
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                          <label className="flex flex-col text-[11px] font-semibold text-[#374151]">
                            Начало покрытия
                            <select
                              value={batch.firstCoveredMonthIdx}
                              onChange={(e) => {
                                const nextStart = Number(e.target.value);
                                updateDraftPeriodDef(batch.periodId, (prev) => ({
                                  ...prev,
                                  startMonthIdx: nextStart,
                                  endMonthIdx: Math.max(nextStart, prev.endMonthIdx),
                                }));
                              }}
                              className="mt-1 rounded border border-[#D1D5DB] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#111827]"
                            >
                              {MONTHS_SHORT.map((m, idx) => (
                                <option key={m} value={idx}>
                                  {m} 2027
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="flex flex-col text-[11px] font-semibold text-[#374151]">
                            Конец покрытия
                            <select
                              value={batch.endCoveredMonthIdx}
                              onChange={(e) => {
                                const nextEnd = Number(e.target.value);
                                updateDraftPeriodDef(batch.periodId, (prev) => ({
                                  ...prev,
                                  endMonthIdx: Math.max(prev.startMonthIdx, nextEnd),
                                }));
                              }}
                              className="mt-1 rounded border border-[#D1D5DB] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#111827]"
                            >
                              {MONTHS_SHORT.map((m, idx) => (
                                <option
                                  key={m}
                                  value={idx}
                                  disabled={idx < batch.firstCoveredMonthIdx}
                                >
                                  {m} 2027
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="flex flex-col text-[11px] font-semibold text-[#374151]">
                            Количество партии, компл.
                            <NumericInput
                              value={batch.recommendedPacks}
                              min={1}
                              step={50}
                              onChangeValue={(val) =>
                                updateDraftPeriodDef(batch.periodId, (prev) => ({
                                  ...prev,
                                  customPacksQty: val,
                                }))
                              }
                              className="mt-1 rounded border border-[#D1D5DB] bg-white px-2 py-1.5 font-mono text-[12px] font-bold text-[#111827]"
                            />
                          </label>

                          <label className="flex flex-col text-[11px] font-semibold text-[#374151]">
                            Дата заказа (вручную)
                            <input
                              type="date"
                              value={batch.recommendedOrderDateIso}
                              onChange={(e) =>
                                updateDraftPeriodDef(batch.periodId, (prev) => ({
                                  ...prev,
                                  customOrderDateIso: e.target.value,
                                }))
                              }
                              className="mt-1 rounded border border-[#D1D5DB] bg-white px-2 py-1.5 font-mono text-[12px] font-semibold text-[#111827]"
                            />
                          </label>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E7EB] pt-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {canMergeNext && (
                              <button
                                type="button"
                                onClick={() => handleMergeWithNextPeriod(batch.periodId)}
                                className="rounded border border-[#D1D5DB] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111827] hover:bg-[#F3F4F6]"
                              >
                                Объединить со следующей партией
                              </button>
                            )}
                            {canSplit && (
                              <button
                                type="button"
                                onClick={() => handleSplitPeriod(batch.periodId)}
                                className="rounded border border-[#D1D5DB] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111827] hover:bg-[#F3F4F6]"
                              >
                                Разделить партию на две
                              </button>
                            )}
                          </div>

                          {activePeriods.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDraftPeriod(batch.periodId)}
                              className="rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100"
                            >
                              Удалить черновую партию
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Размеры S–XXL (метод наибольших остатков, Раздел 5 и 10 ТЗ) */}
                    <div className="mt-2.5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-[#111827]">
                          Размеры: S [{batch.sizeSharesPct.S}%] · M [{batch.sizeSharesPct.M}%] · L [
                          {batch.sizeSharesPct.L}%] · XL [{batch.sizeSharesPct.XL}%] · XXL [
                          {batch.sizeSharesPct.XXL}%] ={' '}
                          {SIZES_LIST.reduce((s, sz) => s + (batch.sizeSharesPct[sz] || 0), 0)}%
                        </span>
                        <span className="text-[11px] text-[#6B7280]">
                          Метод наибольших остатков · без потери единиц
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-6 gap-2 text-center text-[11px]">
                        {SIZES_LIST.map((sz) => {
                          const packsForSize = batch.sizeBreakdownPacks[sz] || 0;
                          const unitsForSize = packsForSize * model.unitsInPack;
                          return (
                            <div
                              key={sz}
                              className="rounded border border-[#E5E7EB] bg-white px-2 py-1.5"
                            >
                              <div className="flex items-center justify-between text-[10px] font-bold text-[#6B7280]">
                                <span>{sz}</span>
                                <span>{batch.sizeSharesPct[sz]}%</span>
                              </div>
                              <div className="mt-0.5 font-mono text-[13px] font-bold text-[#111827]">
                                {packsForSize.toLocaleString('ru-RU')} компл.
                              </div>
                              <div className="font-mono text-[10px] text-[#6B7280]">
                                {unitsForSize.toLocaleString('ru-RU')} изд.
                              </div>
                            </div>
                          );
                        })}
                        <div className="rounded border border-[#111827] bg-[#111827] px-2 py-1.5 text-white">
                          <div className="flex items-center justify-between text-[10px] font-bold text-gray-300">
                            <span>ИТОГ</span>
                            <span>100%</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[13px] font-bold">
                            {sizeTotalPacks.toLocaleString('ru-RU')} компл.
                          </div>
                          <div className="font-mono text-[10px] text-gray-300">
                            {(sizeTotalPacks * model.unitsInPack).toLocaleString('ru-RU')} изд.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* 3. Будущая потребность (для моделей в статусе «Гипотеза» или «Тест», Раздел 8 ТЗ) */}
          {proc.futureScalingBatches.length > 0 && (
            <div className="mt-3 rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                <div>
                  <span className="text-[12px] font-bold text-[#111827]">
                    Будущая потребность после прохождения теста (статус «
                    {MODEL_SCALING_STAGE_LABELS_RU[proc.scalingStage]}»)
                  </span>
                  <p className="text-[11px] text-[#6B7280]">
                    По правилу осторожного масштабирования (Раздел 8 ТЗ) эти кварталы не предлагаются к заказу до перевода модели в статус «Масштабирование».
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateScalingStage('scaling')}
                  className="rounded-lg border border-[#111827] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#111827] hover:bg-[#111827] hover:text-white"
                >
                  Перевести в «Масштабирование»
                </button>
              </div>

              <div className="space-y-1.5">
                {proc.futureScalingBatches.map((fb) => (
                  <div
                    key={fb.periodId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] text-[#4B5563]"
                  >
                    <span className="font-mono font-semibold text-[#111827]">
                      Партия №{fb.batchIndex} · {fb.coverageMonthsLabel.replace(' 2027', '')}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono font-semibold text-[#111827]">
                        {fb.recommendedPacks.toLocaleString('ru-RU')} компл.
                      </span>
                      <span>|</span>
                      <span className="font-mono">{formatRubMillions(fb.estimatedTotalRub)}</span>
                      <span>|</span>
                      <span className="font-mono text-[11px]">
                        Заказ до {fb.recommendedOrderDateIso}
                      </span>
                      <span className="rounded bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-semibold text-[#6B7280]">
                        Будущая потребность
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {proc.approvedOrders.length === 0 &&
            proc.recommendedBatches.length === 0 &&
            proc.futureScalingBatches.length === 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-[12px] font-medium text-emerald-900">
                Потребность в закупках полностью закрыта текущим остатком на складе (
                {proc.netOpeningAvailablePacks.toLocaleString('ru-RU')} компл.).
              </div>
            )}
        </div>
      </div>

      {/* =====================================================================
          СКРЫТАЯ ПО УМОЛЧАНИЮ ТАБЛИЦА НА 12 МЕСЯЦЕВ (Раздел 7 ТЗ MVP)
         ===================================================================== */}
      <div className="rounded-xl border border-[#DFE4EC] bg-white px-4 py-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[#374151]">
            Помесячный расчёт остатков, выкупов и поступлений (Янв–Дек 2027)
          </span>
          <button
            type="button"
            onClick={() => setShowMonthlyTable((v) => !v)}
            className="rounded-lg border border-[#D1D5DB] bg-[#F9FAFB] px-3 py-1.5 text-[12px] font-semibold text-[#111827] hover:bg-[#F3F4F6]"
          >
            {showMonthlyTable ? 'Скрыть расчёт (12 мес.) ▴' : 'Показать расчёт (12 мес.) ▾'}
          </button>
        </div>

        {showMonthlyTable && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]">
                  <th className="py-2 pr-3 pl-2 font-semibold">Показатель (компл.)</th>
                  {proc.monthlyBalance.map((r) => (
                    <th key={r.monthIdx} className="px-2 py-2 text-right font-mono font-semibold">
                      {r.monthLabel}
                    </th>
                  ))}
                  <th className="py-2 pr-2 pl-3 text-right font-mono font-bold text-[#111827]">
                    Год
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                <tr>
                  <td className="py-2 pr-3 pl-2 font-medium text-[#374151]">
                    Остаток на начало мес.
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td key={r.monthIdx} className="px-2 py-2 text-right font-mono text-[#4B5563]">
                      {r.openingAvailablePacks.toLocaleString('ru-RU')}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-3 text-right font-mono font-semibold text-[#111827]">
                    {proc.netOpeningAvailablePacks.toLocaleString('ru-RU')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 pl-2 font-medium text-[#374151]">
                    Подтверждённые приходы PO
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td
                      key={r.monthIdx}
                      className={`px-2 py-2 text-right font-mono ${
                        r.approvedReceiptsPacks > 0
                          ? 'font-bold text-emerald-700'
                          : 'text-[#9CA3AF]'
                      }`}
                    >
                      {r.approvedReceiptsPacks > 0
                        ? `+${r.approvedReceiptsPacks.toLocaleString('ru-RU')}`
                        : '0'}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-3 text-right font-mono font-bold text-emerald-700">
                    {proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 pl-2 font-semibold text-[#111827]">
                    План выкупов (продажи)
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td
                      key={r.monthIdx}
                      className="px-2 py-2 text-right font-mono font-semibold text-[#111827]"
                    >
                      {r.demandPacks.toLocaleString('ru-RU')}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-3 text-right font-mono font-bold text-[#111827]">
                    {proc.annualDemandPacks.toLocaleString('ru-RU')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 pl-2 font-medium text-[#374151]">
                    Непокрытый дефицит без PO
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td
                      key={r.monthIdx}
                      className={`px-2 py-2 text-right font-mono ${
                        r.deficitPacks > 0 ? 'font-bold text-amber-800' : 'text-[#9CA3AF]'
                      }`}
                    >
                      {r.deficitPacks > 0 ? r.deficitPacks.toLocaleString('ru-RU') : '0'}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-3 text-right font-mono font-bold text-amber-800">
                    {proc.totalDeficitPacks.toLocaleString('ru-RU')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
