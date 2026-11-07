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

  // Не раскрываем первую партию автоматически при загрузке — показываем все 4 квартальные партии чистым списком
  const activeExpandedKey = expandedKey;

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

  const handleApproveAllDraftBatches = () => {
    if (proc.recommendedBatches.length === 0) return;
    let updated = model;
    for (const batch of proc.recommendedBatches) {
      updated = approveRecommendedBatch(updated, batch, 'Владелец');
    }
    onUpdateModel(updated);
    triggerSavedIndicator('Все партии утверждены');
    onNotify?.(
      'Утверждены все партии по модели',
      `Создано заказов PO: ${proc.recommendedBatches.length} шт. на общий объём ${proc.totalRecommendedPacks.toLocaleString('ru-RU')} компл.`,
      'success'
    );
  };

  return (
    <div className="space-y-4">
      {/* =====================================================================
          БЛОК 1 · ИТОГИ И ПАРАМЕТРЫ ЗАКУПКИ МОДЕЛИ (Без дублирования цифр)
         ===================================================================== */}
      <div className="rounded-[14px] border-[1.5px] border-[#C8C7BE] bg-white p-5">
        {/* Шапка: Название модели + Статус масштабирования + ✓ Сохранено */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-[#E2E1D8] pb-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[16px] font-extrabold text-[#111827]">
              {model.title}
            </h3>
            <span className="rounded-md border-[1.5px] border-[#D5D4CA] bg-[#F6F5F0] px-2.5 py-0.5 font-mono text-[11.5px] font-bold text-[#141413]">
              {model.code} · {model.unitsInPack} изд./компл.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-[#5C5B55]">Режим закупки:</span>
            {/* Переключатель статуса масштабирования */}
            <div
              className="inline-flex items-center rounded-lg border-[1.5px] border-[#D5D4CA] bg-[#F4F3EE] p-0.5"
              title="Пока у модели статус «Гипотеза» или «Тест», к утверждению формируется только первая тестовая партия"
            >
              {(['hypothesis', 'test', 'scaling'] as ModelScalingStage[]).map((st) => {
                const active = proc.scalingStage === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleUpdateScalingStage(st)}
                    className={`rounded-md px-2.5 py-1 text-[11.5px] font-bold transition cursor-pointer ${
                      active
                        ? 'bg-[#141413] text-white'
                        : 'text-[#52514C] hover:text-[#141413]'
                    }`}
                  >
                    {MODEL_SCALING_STAGE_LABELS_RU[st]}
                  </button>
                );
              })}
            </div>

            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900">
              <span>✓</span>
              <span>{savedStamp}</span>
            </span>
          </div>
        </div>

        {/* 4 ГЛАВНЫХ ПОКАЗАТЕЛЯ (Без повторов ниже!) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[12px] border-[1.5px] border-[#D5D4CA] bg-[#F8F7F3] px-3.5 py-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-[#5C5B55] uppercase tracking-wider">
                1. План продаж (год)
              </span>
              {onOpenSalesMatrix && (
                <button
                  type="button"
                  onClick={onOpenSalesMatrix}
                  className="text-[11px] font-bold text-[#141413] underline decoration-dotted hover:text-black cursor-pointer"
                >
                  По месяцам ↗
                </button>
              )}
            </div>
            <div className="mt-1 font-mono text-[20px] font-black text-[#141413]">
              {proc.annualDemandPacks.toLocaleString('ru-RU')} компл.
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-[#5C5B55]">
              {proc.annualDemandUnits.toLocaleString('ru-RU')} изд. · {currentScenario.title.split('·')[0].trim()}
            </div>
          </div>

          <div className="rounded-[12px] border-[1.5px] border-[#D5D4CA] bg-[#F8F7F3] px-3.5 py-3">
            <span className="text-[11px] font-bold text-[#5C5B55] uppercase tracking-wider">
              2. Доступный товар
            </span>
            <div className="mt-1 font-mono text-[20px] font-black text-[#141413]">
              {(proc.netOpeningAvailablePacks + proc.totalApprovedReceiptsPacks).toLocaleString('ru-RU')} компл.
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-[#5C5B55]">
              Склад: <strong>{proc.netOpeningAvailablePacks.toLocaleString('ru-RU')}</strong> · Утв. PO: <strong>{proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')}</strong> ({confirmedPoCount} шт.)
            </div>
          </div>

          <div className="rounded-[12px] border-[1.5px] border-[#141413] bg-white px-3.5 py-3">
            <span className="text-[11px] font-bold text-[#141413] uppercase tracking-wider">
              3. К заказу на фабрике
            </span>
            <div className="mt-1 font-mono text-[20px] font-black text-[#141413]">
              {proc.totalRecommendedPacks.toLocaleString('ru-RU')} компл.
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-[#5C5B55]">
              {proc.totalRecommendedUnits.toLocaleString('ru-RU')} изд. · разбито на {proc.recommendedBatches.length} парт.
            </div>
          </div>

          <div className="rounded-[12px] border-[1.5px] border-[#141413] bg-white px-3.5 py-3">
            <span className="text-[11px] font-bold text-[#141413] uppercase tracking-wider">
              4. Стоимость заказа
            </span>
            <div className="mt-1 font-mono text-[20px] font-black text-[#141413]">
              {proc.totalRecommendedBudgetRub !== null
                ? formatRubMillions(proc.totalRecommendedBudgetRub)
                : 'Не заполнена себест.'}
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-[#5C5B55]">
              {proc.totalRecommendedBudgetRub !== null
                ? `${proc.totalRecommendedBudgetRub.toLocaleString('ru-RU')} ₽ (по ${model.unitCostRub} ₽/компл.)`
                : 'Укажите себестоимость комплекта ниже'}
            </div>
          </div>
        </div>

        {/* Редактируемые параметры: Начальный остаток | Себестоимость | Срок производства | Срок доставки | MOQ и размеры */}
        <div className="mt-4 border-t-[1.5px] border-[#E8E7DF] pt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-extrabold text-[#141413]">
              Исходные параметры для расчёта партий (меняйте любую цифру — расчёт обновится сразу):
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* 1. Начальный остаток */}
            <label className="flex flex-col justify-between rounded-[10px] border-[1.5px] border-[#C8C7BE] bg-white px-3 py-2.5 focus-within:border-[#141413]">
              <span className="text-[11.5px] font-bold text-[#2C2B28]">
                Остаток на складе сейчас
              </span>
              <div className="mt-1.5 flex items-center gap-1.5">
                <NumericInput
                  ariaLabel="Начальный остаток, комплектов"
                  value={shared.actualOpeningStockPacks}
                  min={0}
                  step={50}
                  onChangeValue={handleUpdateOpeningStock}
                  className="w-full rounded-md border-[1.5px] border-[#D5D4CA] bg-[#F8F7F3] px-2.5 py-1.5 font-mono text-[15px] font-extrabold text-[#141413] focus:border-[#141413] focus:bg-white focus:outline-none"
                />
                <span className="shrink-0 text-[11px] font-semibold text-[#5C5B55]">компл.</span>
              </div>
            </label>

            {/* 2. Себестоимость комплекта */}
            <label className="flex flex-col justify-between rounded-[10px] border-[1.5px] border-[#C8C7BE] bg-white px-3 py-2.5 focus-within:border-[#141413]">
              <span className="text-[11.5px] font-bold text-[#2C2B28]">
                Себестоимость под ключ
              </span>
              <div className="mt-1.5 flex items-center gap-1.5">
                <NumericInput
                  ariaLabel="Себестоимость комплекта, рублей"
                  value={model.unitCostRub || 0}
                  min={0}
                  step={10}
                  onChangeValue={handleUpdateUnitCost}
                  className="w-full rounded-md border-[1.5px] border-[#D5D4CA] bg-[#F8F7F3] px-2.5 py-1.5 font-mono text-[15px] font-extrabold text-[#141413] focus:border-[#141413] focus:bg-white focus:outline-none"
                />
                <span className="shrink-0 text-[11px] font-semibold text-[#5C5B55]">₽/компл.</span>
              </div>
            </label>

            {/* 3. Срок производства (дней) */}
            <label className="flex flex-col justify-between rounded-[10px] border-[1.5px] border-[#C8C7BE] bg-white px-3 py-2.5 focus-within:border-[#141413]">
              <span className="text-[11.5px] font-bold text-[#2C2B28]">
                Срок производства
              </span>
              <div className="mt-1.5 flex items-center gap-1.5">
                <NumericInput
                  ariaLabel="Срок производства, дней"
                  value={fp.productionLeadDays}
                  min={1}
                  max={365}
                  step={5}
                  onChangeValue={(nextProd) => {
                    onUpdateModel({
                      ...model,
                      sharedSupplyAndFact: {
                        ...shared,
                        factoryParams: {
                          ...fp,
                          productionLeadDays: Math.max(1, Math.round(nextProd)),
                        },
                      },
                    });
                    triggerSavedIndicator('Сохранено');
                  }}
                  className="w-full rounded-md border-[1.5px] border-[#D5D4CA] bg-[#F8F7F3] px-2.5 py-1.5 font-mono text-[15px] font-extrabold text-[#141413] focus:border-[#141413] focus:bg-white focus:outline-none"
                />
                <span className="shrink-0 text-[11px] font-semibold text-[#5C5B55]">дней</span>
              </div>
            </label>

            {/* 4. Срок доставки и приёмки (дней) */}
            <label className="flex flex-col justify-between rounded-[10px] border-[1.5px] border-[#C8C7BE] bg-white px-3 py-2.5 focus-within:border-[#141413]">
              <span className="text-[11.5px] font-bold text-[#2C2B28]">
                Доставка в РФ
              </span>
              <div className="mt-1.5 flex items-center gap-1.5">
                <NumericInput
                  ariaLabel="Срок доставки, дней"
                  value={fp.logisticsLeadDays}
                  min={0}
                  max={365}
                  step={2}
                  onChangeValue={(nextLog) => {
                    onUpdateModel({
                      ...model,
                      sharedSupplyAndFact: {
                        ...shared,
                        factoryParams: {
                          ...fp,
                          logisticsLeadDays: Math.max(0, Math.round(nextLog)),
                        },
                      },
                    });
                    triggerSavedIndicator('Сохранено');
                  }}
                  className="w-full rounded-md border-[1.5px] border-[#D5D4CA] bg-[#F8F7F3] px-2.5 py-1.5 font-mono text-[15px] font-extrabold text-[#141413] focus:border-[#141413] focus:bg-white focus:outline-none"
                />
                <span className="shrink-0 text-[11px] font-semibold text-[#5C5B55]">
                  дн. (цикл {proc.totalLeadDays})
                </span>
              </div>
            </label>

            {/* 5. Кнопка раскрытия дополнительных настроек (Размеры S–XXL, MOQ, кратность, страховой запас) */}
            <div className="flex flex-col justify-between rounded-[10px] border-[1.5px] border-[#D5D4CA] bg-[#F8F7F3] px-3 py-2.5">
              <span className="text-[11px] font-bold text-[#5C5B55]">
                MOQ {fp.moqPacks.toLocaleString('ru-RU')} · Запас {fp.safetyStockDays} дн.
              </span>
              <button
                type="button"
                onClick={() => setShowAdvancedSettings((v) => !v)}
                className="mt-1.5 inline-flex items-center justify-between rounded-md border-[1.5px] border-[#141413] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#141413] hover:bg-[#141413] hover:text-white transition cursor-pointer"
              >
                <span>Размеры S–XXL и MOQ</span>
                <span>{showAdvancedSettings ? '▴' : '▾'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Раскрывающийся блок «Дополнительные настройки» (Единая размерная сетка S-XXL, MOQ, Кратность, Страховой запас) */}
        {showAdvancedSettings && (
          <div className="mt-3 rounded-[10px] border-[1.5px] border-[#C8C7BE] bg-[#F8F7F3] p-3.5">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              {/* Единая размерная сетка модели (%) */}
              <div className="lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] font-extrabold text-[#141413] uppercase">
                    Пропорция размеров модели (S–XXL, сумма = 100%)
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
                        className="rounded bg-[#141413] px-2.5 py-0.5 text-[10.5px] font-bold text-white hover:bg-black cursor-pointer"
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
                      className="flex flex-col rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5"
                    >
                      <span className="text-[10.5px] font-bold text-[#5C5B55]">{sz}, %</span>
                      <NumericInput
                        ariaLabel={`Доля размера ${sz}, %`}
                        value={fp.sizeSharesPct[sz] ?? 20}
                        min={0}
                        max={100}
                        onChangeValue={(val) => handleUpdateModelSizeShare(sz, val)}
                        className="mt-0.5 w-full font-mono text-[14px] font-extrabold text-[#141413] focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* MOQ, Кратность и Целевой запас */}
              <div className="grid grid-cols-3 gap-2 lg:col-span-5">
                <label className="flex flex-col justify-between rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5">
                  <span className="text-[10.5px] font-bold text-[#5C5B55]">
                    MOQ (мин. заказ)
                  </span>
                  <div className="mt-1 flex items-center gap-1">
                    <NumericInput
                      ariaLabel="MOQ, комплектов"
                      value={fp.moqPacks}
                      min={1}
                      step={100}
                      onChangeValue={handleUpdateMoq}
                      className="w-full font-mono text-[14px] font-extrabold text-[#141413] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#5C5B55]">компл.</span>
                  </div>
                </label>

                <label className="flex flex-col justify-between rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5">
                  <span className="text-[10.5px] font-bold text-[#5C5B55]">
                    Кратность (шаг)
                  </span>
                  <div className="mt-1 flex items-center gap-1">
                    <NumericInput
                      ariaLabel="Кратность заказа, комплектов"
                      value={fp.packMultiple}
                      min={1}
                      step={50}
                      onChangeValue={handleUpdatePackMultiple}
                      className="w-full font-mono text-[14px] font-extrabold text-[#141413] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#5C5B55]">компл.</span>
                  </div>
                </label>

                <label className="flex flex-col justify-between rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5">
                  <span className="text-[10.5px] font-bold text-[#5C5B55]">
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
                      className="w-full font-mono text-[14px] font-extrabold text-[#141413] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#5C5B55]">дн.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          БЛОК 2 · ПАРТИИ К ЗАКАЗУ И УТВЕРЖДЁННЫЕ ПОСТАВКИ (Чистый список из 4 кварталов)
         ===================================================================== */}
      <div className="rounded-[14px] border-[1.5px] border-[#C8C7BE] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-[#E2E1D8] pb-3.5">
          <div>
            <h4 className="text-[16px] font-extrabold text-[#141413]">
              Партии к заказу по кварталам ({proc.recommendedBatches.length} план · {proc.approvedOrders.length} утв. PO)
            </h4>
            <p className="mt-0.5 text-[12px] text-[#5C5B55]">
              Вы можете утвердить любую партию в 1 клик или нажать «Размеры и расчёт ▾», чтобы скорректировать объём, даты и размерную сетку.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRecalculateDrafts}
              className="rounded-lg border-[1.5px] border-[#C8C7BE] bg-[#F8F7F3] px-3 py-1.5 text-[12px] font-bold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
            >
              Пересчитать по плану
            </button>
            <button
              type="button"
              onClick={() => setShowAddCustomModal((v) => !v)}
              className="rounded-lg border-[1.5px] border-[#141413] bg-white px-3 py-1.5 text-[12px] font-bold text-[#141413] hover:bg-[#F8F7F3] cursor-pointer"
            >
              + Своя партия
            </button>
            {fp.customBatchPeriods && (
              <button
                type="button"
                onClick={handleResetToDefaultQuarters}
                className="rounded-lg border border-[#D5D4CA] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-[#5C5B55] hover:text-[#141413] cursor-pointer"
              >
                Сбросить к 4 кварталам
              </button>
            )}
            {proc.recommendedBatches.length > 0 && (
              <button
                type="button"
                onClick={handleApproveAllDraftBatches}
                className="rounded-lg bg-[#141413] px-3.5 py-1.5 text-[12px] font-bold text-white hover:bg-black cursor-pointer"
              >
                ✓ Утвердить все ({proc.recommendedBatches.length})
              </button>
            )}
          </div>
        </div>

        {/* Форма «+ Своя партия» (раскрывается по кнопке) */}
        {showAddCustomModal && (
          <div className="mt-3.5 rounded-[10px] border-[1.5px] border-[#141413] bg-[#F8F7F3] p-3.5">
            <div className="flex items-center justify-between pb-2.5">
              <span className="text-[13px] font-extrabold text-[#141413]">
                Добавление произвольной партии закупки
              </span>
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="text-[11.5px] font-bold text-[#5C5B55] hover:text-[#141413] cursor-pointer"
              >
                Закрыть ✕
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
              <label className="flex flex-col text-[11px] font-bold text-[#374151]">
                Начало покрытия
                <select
                  value={newBatchStartMonth}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setNewBatchStartMonth(m);
                    if (newBatchEndMonth < m) setNewBatchEndMonth(m);
                  }}
                  className="mt-1 rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#141413]"
                >
                  {MONTHS_SHORT.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m} 2027
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col text-[11px] font-bold text-[#374151]">
                Конец покрытия
                <select
                  value={newBatchEndMonth}
                  onChange={(e) => setNewBatchEndMonth(Number(e.target.value))}
                  className="mt-1 rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5 text-[12px] font-bold text-[#141413]"
                >
                  {MONTHS_SHORT.map((m, idx) => (
                    <option key={m} value={idx} disabled={idx < newBatchStartMonth}>
                      {m} 2027
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col text-[11px] font-bold text-[#374151]">
                Количество, компл.
                <NumericInput
                  value={newBatchPacks}
                  min={1}
                  step={50}
                  onChangeValue={setNewBatchPacks}
                  className="mt-1 rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5 font-mono text-[12.5px] font-extrabold text-[#141413]"
                />
              </label>

              <label className="flex flex-col text-[11px] font-bold text-[#374151]">
                Дата заказа до
                <input
                  type="date"
                  value={newBatchOrderDate}
                  onChange={(e) => setNewBatchOrderDate(e.target.value)}
                  className="mt-1 rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5 font-mono text-[12px] font-bold text-[#141413]"
                />
              </label>

              <div className="flex flex-col justify-end gap-1.5">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#374151]">
                  <input
                    type="checkbox"
                    checked={newBatchApproveImmediately}
                    onChange={(e) => setNewBatchApproveImmediately(e.target.checked)}
                    className="rounded border-[#C8C7BE]"
                  />
                  <span>Сразу утвердить в PO</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddBatchSubmit}
                  className="rounded-md bg-[#141413] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-black cursor-pointer"
                >
                  Сохранить партию
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2.5">
          {/* 1. Уже утверждённые заказы PO */}
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
                className={`rounded-[12px] border-[1.5px] transition ${
                  isExpanded
                    ? 'border-[#141413] bg-[#F8F7F3]'
                    : 'border-emerald-300 bg-emerald-50/30 hover:border-emerald-500'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="rounded-md bg-emerald-800 px-2.5 py-1 font-mono text-[11px] font-bold text-white">
                      УТВЕРЖДЁН PO #{poIdx + 1}
                    </span>
                    <span className="text-[14px] font-extrabold text-[#141413]">
                      {po.coverageMonthsLabel || `${MONTHS_SHORT[po.arrivalMonthIdx]} 2027`}
                    </span>
                    <span className="rounded border border-[#D5D4CA] bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-[#374151]">
                      {po.orderNumber}
                    </span>
                    <span className="text-[12px] text-[#5C5B55]">
                      Заказ от <strong className="font-mono text-[#141413]">{po.orderPlacementDateIso}</strong>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right">
                      <div className="font-mono text-[15px] font-black text-[#141413]">
                        {po.packsQty.toLocaleString('ru-RU')} компл. · {formatRubMillions(po.totalOrderRub)}
                      </div>
                      <div className="text-[11px] text-[#5C5B55]">
                        {(po.packsQty * po.unitsInPack).toLocaleString('ru-RU')} изд. · {confirmed ? 'Подтверждён фабрикой' : 'Ожидает подтв. фабрики'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                      className="rounded-lg border-[1.5px] border-[#C8C7BE] bg-white px-3 py-1.5 text-[12px] font-bold text-[#141413] hover:bg-[#F4F3EE] cursor-pointer"
                    >
                      {isExpanded ? 'Скрыть детали ▴' : 'Размеры и статус ▾'}
                    </button>
                  </div>
                </div>

                {/* Детализация утверждённого заказа PO */}
                {isExpanded && (
                  <div className="border-t-[1.5px] border-[#E2E1D8] bg-white px-4 py-3.5 rounded-b-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
                      <span className="text-[12px] font-extrabold text-[#141413]">
                        Детализация утверждённого заказа {po.orderNumber}
                      </span>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-bold text-[#141413]">
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
                          className="rounded border-[#C8C7BE]"
                        />
                        <span>Подтверждён фабрикой (учитывать в гарантированных поставках)</span>
                      </label>
                    </div>

                    {discrepancy && (
                      <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
                        <strong>Зафиксированный PO сохранён без изменений:</strong>{' '}
                        {discrepancy.message}
                      </div>
                    )}

                    {/* Таблица размеров S–XXL для PO */}
                    <div className="rounded-lg border-[1.5px] border-[#E2E1D8] bg-[#F8F7F3] p-3">
                      <div className="text-[11.5px] font-bold text-[#2C2B28]">
                        Размеры партии (S–XXL): комплекты и физические изделия ({po.unitsInPack} шт./компл.)
                      </div>
                      <div className="mt-2 grid grid-cols-6 gap-2 text-center text-[11px]">
                        {SIZES_LIST.map((sz) => (
                          <div
                            key={sz}
                            className="rounded-md border border-[#D5D4CA] bg-white px-2 py-1.5"
                          >
                            <div className="font-bold text-[#5C5B55]">{sz}</div>
                            <div className="font-mono text-[13px] font-extrabold text-[#141413]">
                              {(poSizes[sz] || 0).toLocaleString('ru-RU')} компл.
                            </div>
                            <div className="font-mono text-[10px] text-[#5C5B55]">
                              {((poSizes[sz] || 0) * po.unitsInPack).toLocaleString('ru-RU')} изд.
                            </div>
                          </div>
                        ))}
                        <div className="rounded-md border border-[#141413] bg-[#141413] px-2 py-1.5 text-white">
                          <div className="font-bold text-gray-300">ИТОГО</div>
                          <div className="font-mono text-[13px] font-extrabold">
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
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#374151]">
                        <span className="font-semibold">Статус поставки:</span>
                        <select
                          value={po.status}
                          onChange={(e) => {
                            const updated = updateApprovedPurchaseOrder(model, po.id, {
                              status: e.target.value as ApprovedPurchaseOrder['status'],
                            });
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1 text-[12px] font-bold text-[#141413]"
                        >
                          {Object.entries(PO_STATUS_LABELS_RU).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                        <span>
                          · Цена в заказе: <strong>{po.lockedUnitCostRub} ₽/компл.</strong>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = removeApprovedPurchaseOrder(model, po.id);
                          onUpdateModel(updated);
                          triggerSavedIndicator('Заказ удалён');
                        }}
                        className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-[11.5px] font-bold text-rose-800 hover:bg-rose-100 cursor-pointer"
                      >
                        Вернуть в черновик / Удалить PO
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
                className={`rounded-[12px] border-[1.5px] transition ${
                  isExpanded
                    ? 'border-[#141413] bg-[#F8F7F3]'
                    : 'border-[#C8C7BE] bg-white hover:border-[#141413]'
                }`}
              >
                {/* Наглядная строка квартальной партии с прямыми кнопками действия */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#141413] px-2.5 py-0.5 font-mono text-[11.5px] font-bold text-white">
                        Партия №{bIdx + 1}
                      </span>
                      <span className="text-[15px] font-extrabold text-[#141413]">
                        Покрытие: {batch.coverageMonthsLabel}
                      </span>
                      {batch.isAdditionalOrder && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-900">
                          Дополнительно к заказу
                        </span>
                      )}
                      {batch.isTestBatch && (
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[10.5px] font-bold text-blue-900">
                          Тестовая партия ({MODEL_SCALING_STAGE_LABELS_RU[proc.scalingStage]})
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#5C5B55]">
                      <span>
                        Заказать до:{' '}
                        <strong className="font-mono text-[#141413]">
                          {batch.recommendedOrderDateIso}
                        </strong>
                      </span>
                      <span>→</span>
                      <span>
                        Приход на склад к:{' '}
                        <strong className="font-mono text-[#141413]">
                          {batch.requiredArrivalDateIso}
                        </strong>
                      </span>
                      <span>·</span>
                      <span>План продаж квартала: {batch.periodDemandPacks.toLocaleString('ru-RU')} компл.</span>
                    </div>
                  </div>

                  {/* Объём, бюджет и 2 прямые кнопки */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right pr-1">
                      <div className="font-mono text-[16px] font-black text-[#141413]">
                        {batch.recommendedPacks.toLocaleString('ru-RU')} компл. · {formatRubMillions(batch.estimatedTotalRub)}
                      </div>
                      <div className="font-mono text-[11.5px] text-[#5C5B55]">
                        {batch.physicalUnitsQty.toLocaleString('ru-RU')} изд. · {batch.estimatedTotalRub.toLocaleString('ru-RU')} ₽
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                      className="rounded-lg border-[1.5px] border-[#C8C7BE] bg-[#F8F7F3] px-3 py-2 text-[12px] font-bold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
                    >
                      {isExpanded ? 'Скрыть расчёт ▴' : 'Размеры и расчёт ▾'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleApproveDraftBatch(batch)}
                      className="rounded-lg bg-[#141413] px-3.5 py-2 text-[12px] font-bold text-white hover:bg-black cursor-pointer"
                    >
                      ✓ Утвердить заказ
                    </button>
                  </div>
                </div>

                {/* Раскрываемая карточка партии (формула, редактирование дат/кол-ва, размеры S–XXL) */}
                {isExpanded && (
                  <div className="border-t-[1.5px] border-[#E2E1D8] bg-white px-4 py-4 rounded-b-[11px]">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                      <div className="text-[12.5px] font-extrabold text-[#141413]">
                        Расчёт и размерная сетка · Партия №{bIdx + 1} ({batch.coverageMonthsLabel})
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingBatchKey(isEditing ? null : rowKey)}
                          className="rounded-lg border-[1.5px] border-[#141413] bg-white px-3 py-1.5 text-[12px] font-bold text-[#141413] hover:bg-[#F8F7F3] cursor-pointer"
                        >
                          {isEditing ? 'Готово' : 'Изменить количество или даты'}
                        </button>
                      </div>
                    </div>

                    {/* Формула расчёта потребности */}
                    <div className="rounded-lg border-[1.5px] border-[#E2E1D8] bg-[#F8F7F3] px-3.5 py-2.5 text-[12px] text-[#374151]">
                      <span className="font-bold text-[#141413]">Как посчитана партия: </span>
                      Выкупы периода ({batch.periodDemandPacks.toLocaleString('ru-RU')} компл.) +
                      Запас ({batch.safetyStockPacks.toLocaleString('ru-RU')} компл.) −
                      Остаток к началу ({batch.openingAvailableAtStartPacks.toLocaleString('ru-RU')}{' '}
                      компл.) − Утверждённые PO (
                      {batch.confirmedReceiptsInPeriodPacks.toLocaleString('ru-RU')} компл.) ={' '}
                      <strong>
                        чистая потребность {batch.rawNetNeedPacks.toLocaleString('ru-RU')} компл.
                      </strong>{' '}
                      → с учётом MOQ ({fp.moqPacks.toLocaleString('ru-RU')}) и шага ({fp.packMultiple}):{' '}
                      <strong className="font-mono text-[#141413]">
                        {batch.recommendedPacks.toLocaleString('ru-RU')} компл. (
                        {batch.physicalUnitsQty.toLocaleString('ru-RU')} изд.)
                      </strong>
                    </div>

                    {/* Режим редактирования партии до утверждения */}
                    {isEditing && (
                      <div className="mt-3 rounded-lg border-[1.5px] border-[#141413] bg-[#F8F7F3] p-3.5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                          <label className="flex flex-col text-[11.5px] font-bold text-[#2C2B28]">
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
                              className="mt-1 rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-[#141413]"
                            >
                              {MONTHS_SHORT.map((m, idx) => (
                                <option key={m} value={idx}>
                                  {m} 2027
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="flex flex-col text-[11.5px] font-bold text-[#2C2B28]">
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
                              className="mt-1 rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-[#141413]"
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

                          <label className="flex flex-col text-[11.5px] font-bold text-[#2C2B28]">
                            Своё количество, компл.
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
                              className="mt-1 rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5 font-mono text-[13px] font-extrabold text-[#141413]"
                            />
                          </label>

                          <label className="flex flex-col text-[11.5px] font-bold text-[#2C2B28]">
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
                              className="mt-1 rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1.5 font-mono text-[12.5px] font-bold text-[#141413]"
                            />
                          </label>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E1D8] pt-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {canMergeNext && (
                              <button
                                type="button"
                                onClick={() => handleMergeWithNextPeriod(batch.periodId)}
                                className="rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1 text-[11.5px] font-bold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
                              >
                                Объединить со следующей партией
                              </button>
                            )}
                            {canSplit && (
                              <button
                                type="button"
                                onClick={() => handleSplitPeriod(batch.periodId)}
                                className="rounded-md border-[1.5px] border-[#C8C7BE] bg-white px-2.5 py-1 text-[11.5px] font-bold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
                              >
                                Разделить партию на две
                              </button>
                            )}
                          </div>

                          {activePeriods.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDraftPeriod(batch.periodId)}
                              className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11.5px] font-bold text-rose-800 hover:bg-rose-100 cursor-pointer"
                            >
                              Удалить черновую партию
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Размеры S–XXL */}
                    <div className="mt-3 rounded-lg border-[1.5px] border-[#E2E1D8] bg-[#F8F7F3] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11.5px] font-bold text-[#141413]">
                          Распределение по размерам S–XXL: S [{batch.sizeSharesPct.S}%] · M [{batch.sizeSharesPct.M}%] · L [
                          {batch.sizeSharesPct.L}%] · XL [{batch.sizeSharesPct.XL}%] · XXL [
                          {batch.sizeSharesPct.XXL}%]
                        </span>
                        <span className="text-[11px] font-medium text-[#5C5B55]">
                          Без потери единиц при округлении
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-6 gap-2 text-center text-[11px]">
                        {SIZES_LIST.map((sz) => {
                          const packsForSize = batch.sizeBreakdownPacks[sz] || 0;
                          const unitsForSize = packsForSize * model.unitsInPack;
                          return (
                            <div
                              key={sz}
                              className="rounded-md border border-[#D5D4CA] bg-white px-2 py-1.5"
                            >
                              <div className="flex items-center justify-between text-[10px] font-bold text-[#5C5B55]">
                                <span>{sz}</span>
                                <span>{batch.sizeSharesPct[sz]}%</span>
                              </div>
                              <div className="mt-0.5 font-mono text-[13.5px] font-extrabold text-[#141413]">
                                {packsForSize.toLocaleString('ru-RU')} компл.
                              </div>
                              <div className="font-mono text-[10px] text-[#5C5B55]">
                                {unitsForSize.toLocaleString('ru-RU')} изд.
                              </div>
                            </div>
                          );
                        })}
                        <div className="rounded-md border border-[#141413] bg-[#141413] px-2 py-1.5 text-white">
                          <div className="flex items-center justify-between text-[10px] font-bold text-gray-300">
                            <span>ИТОГ</span>
                            <span>100%</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[13.5px] font-extrabold">
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

          {/* 3. Будущая потребность (для моделей в статусе «Гипотеза» или «Тест») */}
          {proc.futureScalingBatches.length > 0 && (
            <div className="mt-3 rounded-[12px] border-[1.5px] border-dashed border-[#C8C7BE] bg-[#F8F7F3] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                <div>
                  <span className="text-[13px] font-extrabold text-[#141413]">
                    Следующие кварталы после прохождения теста (сейчас режим «
                    {MODEL_SCALING_STAGE_LABELS_RU[proc.scalingStage]}»)
                  </span>
                  <p className="text-[11.5px] text-[#5C5B55]">
                    Чтобы открыть все кварталы к заказу прямо сейчас, переключите режим в «Масштабирование».
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateScalingStage('scaling')}
                  className="rounded-lg border-[1.5px] border-[#141413] bg-white px-3 py-1.5 text-[12px] font-bold text-[#141413] hover:bg-[#141413] hover:text-white cursor-pointer"
                >
                  Включить «Масштабирование»
                </button>
              </div>

              <div className="space-y-1.5">
                {proc.futureScalingBatches.map((fb) => (
                  <div
                    key={fb.periodId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D5D4CA] bg-white px-3.5 py-2 text-[12px] text-[#4B5563]"
                  >
                    <span className="font-mono font-bold text-[#141413]">
                      Партия №{fb.batchIndex} · {fb.coverageMonthsLabel}
                    </span>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono font-bold text-[#141413]">
                        {fb.recommendedPacks.toLocaleString('ru-RU')} компл.
                      </span>
                      <span>|</span>
                      <span className="font-mono">{formatRubMillions(fb.estimatedTotalRub)}</span>
                      <span>|</span>
                      <span className="font-mono text-[11px]">
                        Заказ до {fb.recommendedOrderDateIso}
                      </span>
                      <span className="rounded bg-[#EFEFE9] px-2 py-0.5 text-[10.5px] font-bold text-[#5C5B55]">
                        После теста
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
              <div className="rounded-xl border-[1.5px] border-emerald-300 bg-emerald-50/70 px-4 py-3 text-[13px] font-bold text-emerald-900">
                ✓ Потребность в закупках полностью закрыта доступным товаром (склад: {proc.netOpeningAvailablePacks.toLocaleString('ru-RU')} компл., утверждённые PO: {proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} компл.).
              </div>
            )}
        </div>
      </div>

      {/* =====================================================================
          СКРЫТАЯ ПО УМОЛЧАНИЮ ТАБЛИЦА НА 12 МЕСЯЦЕВ
         ===================================================================== */}
      <div className="rounded-[14px] border-[1.5px] border-[#C8C7BE] bg-white px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-bold text-[#141413]">
            Помесячный баланс: остатки, выкупы и приходы по 12 месяцам (Янв–Дек 2027)
          </span>
          <button
            type="button"
            onClick={() => setShowMonthlyTable((v) => !v)}
            className="rounded-lg border-[1.5px] border-[#C8C7BE] bg-[#F8F7F3] px-3 py-1.5 text-[12px] font-bold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
          >
            {showMonthlyTable ? 'Скрыть таблицу 12 мес. ▴' : 'Показать таблицу 12 мес. ▾'}
          </button>
        </div>

        {showMonthlyTable && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b-[1.5px] border-[#E2E1D8] bg-[#F8F7F3] text-[#5C5B55]">
                  <th className="py-2 pr-3 pl-2 font-bold">Показатель (компл.)</th>
                  {proc.monthlyBalance.map((r) => (
                    <th key={r.monthIdx} className="px-2 py-2 text-right font-mono font-bold">
                      {r.monthLabel}
                    </th>
                  ))}
                  <th className="py-2 pr-2 pl-3 text-right font-mono font-extrabold text-[#141413]">
                    Год
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E7DF]">
                <tr>
                  <td className="py-2 pr-3 pl-2 font-medium text-[#374151]">
                    Остаток на начало мес.
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td key={r.monthIdx} className="px-2 py-2 text-right font-mono text-[#4B5563]">
                      {r.openingAvailablePacks.toLocaleString('ru-RU')}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-3 text-right font-mono font-bold text-[#141413]">
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
                  <td className="py-2 pr-3 pl-2 font-bold text-[#141413]">
                    План выкупов (продажи)
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td
                      key={r.monthIdx}
                      className="px-2 py-2 text-right font-mono font-bold text-[#141413]"
                    >
                      {r.demandPacks.toLocaleString('ru-RU')}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-3 text-right font-mono font-extrabold text-[#141413]">
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
