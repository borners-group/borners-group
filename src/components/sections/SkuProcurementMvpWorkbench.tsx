'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  GrowthScenarioDef,
  MONTHS_SHORT_RU,
  ScenarioModelSpec,
} from '@/lib/scenarioData';

const MONTHS_SHORT = MONTHS_SHORT_RU;

const MONTHS_GENITIVE_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

function formatHumanDateRu(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const monthLbl = MONTHS_GENITIVE_RU[(m || 1) - 1] || '';
  return `${d} ${monthLbl} ${y}`;
}

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
      onFocus={() => {
        setFocused(true);
      }}
      onChange={(e) => {
        let nextRaw = e.target.value;
        if (!/^[0-9\s.,]*$/.test(nextRaw)) return;
        if (nextRaw.length > 1 && /^0+\d/.test(nextRaw.trim())) {
          nextRaw = nextRaw.trim().replace(/^0+(?=\d)/, '');
        }
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
  headerLeftSlot?: React.ReactNode;
}

export function SkuProcurementMvpWorkbench({
  model: rawModel,
  currentScenario,
  onUpdateModel,
  onNotify,
  onOpenSalesMatrix,
  headerLeftSlot,
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
        ? 'Расчёт всех квартальных партий под годовой план'
        : 'В расчёте только первая тестовая партия',
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

  const handleResetAllApprovedOrders = () => {
    if (shared.approvedOrders.length === 0) return;
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          customBatchPeriods: undefined,
        },
        approvedOrders: [],
      },
    });
    setExpandedKey(null);
    triggerSavedIndicator('Все PO возвращены в план');
    onNotify?.(
      'Утверждённые PO возвращены в черновик',
      'Все партии снова доступны в черновом плане по 4 кварталам для свободного редактирования.',
      'success'
    );
  };

  const sortedApprovedOrders = useMemo(
    () =>
      [...proc.approvedOrders].sort((a, b) => {
        if (a.arrivalMonthIdx !== b.arrivalMonthIdx) {
          return a.arrivalMonthIdx - b.arrivalMonthIdx;
        }
        return (a.orderPlacementDateIso || '').localeCompare(b.orderPlacementDateIso || '');
      }),
    [proc.approvedOrders]
  );

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

  const handleUpdateDraftBatchSizePacks = (
    batch: RecommendedProcurementBatch,
    sz: 'S' | 'M' | 'L' | 'XL' | 'XXL',
    nextSizePacks: number
  ) => {
    const cleanVal = Math.max(0, Math.round(nextSizePacks));
    const nextBreakdown: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number> = {
      ...batch.sizeBreakdownPacks,
      [sz]: cleanVal,
    };
    const nextTotalPacks = Math.max(
      1,
      SIZES_LIST.reduce((sum, key) => sum + (nextBreakdown[key] || 0), 0)
    );
    updateDraftPeriodDef(batch.periodId, (prev) => ({
      ...prev,
      customPacksQty: nextTotalPacks,
      customSizeBreakdownPacks: nextBreakdown,
    }));
  };

  const handleUpdateDraftBatchSizeShare = (
    batch: RecommendedProcurementBatch,
    sz: 'S' | 'M' | 'L' | 'XL' | 'XXL',
    nextPct: number
  ) => {
    const cleanPct = Math.max(0, Math.min(100, Math.round(nextPct)));
    updateDraftPeriodDef(batch.periodId, (prev) => ({
      ...prev,
      customSizeSharesPct: {
        ...(prev.customSizeSharesPct || batch.sizeSharesPct || fp.sizeSharesPct),
        [sz]: cleanPct,
      },
      customSizeBreakdownPacks: null,
    }));
  };

  const handleUpdatePoSizePacks = (
    po: ApprovedPurchaseOrder,
    currentSizes: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number>,
    sz: 'S' | 'M' | 'L' | 'XL' | 'XXL',
    nextSizePacks: number
  ) => {
    const cleanVal = Math.max(0, Math.round(nextSizePacks));
    const nextBreakdown: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number> = {
      ...currentSizes,
      [sz]: cleanVal,
    };
    const nextTotalPacks = Math.max(
      1,
      SIZES_LIST.reduce((sum, key) => sum + (nextBreakdown[key] || 0), 0)
    );
    const updated = updateApprovedPurchaseOrder(model, po.id, {
      packsQty: nextTotalPacks,
      sizeBreakdownPacks: nextBreakdown,
    });
    onUpdateModel(updated);
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
          БЛОК 1 · ИТОГИ И ПАРАМЕТРЫ ЗАКУПКИ МОДЕЛИ (Единая спокойная карточка)
         ===================================================================== */}
      <div className="rounded-[16px] border border-[#D8D7CE] bg-white p-5 shadow-[0_1px_3px_rgba(20,20,19,0.03)]">
        {/* Шапка: Выбор модели (или название) слева + Статус масштабирования + ✓ Сохранено справа */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE9E2] pb-3.5">
          {headerLeftSlot ? (
            <div className="flex-1 min-w-[280px]">{headerLeftSlot}</div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-[16px] font-bold text-[#141413]">
                {model.title}
              </h3>
              <span className="rounded-md border border-[#DFDED6] bg-[#F7F7F3] px-2.5 py-0.5 font-mono text-[11.5px] font-semibold text-[#52514C]">
                {model.code} · {model.unitsInPack} изд./компл.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] font-medium text-[#6B6A64]">Статус:</span>
            <div
              className="inline-flex items-center rounded-[9px] border border-[#E2E1D9] bg-[#F2F1EC] p-0.5"
              title="Пока у модели статус «Гипотеза» или «Тест», к утверждению формируется только первая тестовая партия"
            >
              {(['hypothesis', 'test', 'scaling'] as ModelScalingStage[]).map((st) => {
                const active = proc.scalingStage === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleUpdateScalingStage(st)}
                    className={`rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-white text-[#141413] shadow-[0_1px_2px_rgba(20,20,19,0.08)] border border-[#D4D3C9]'
                        : 'text-[#686762] hover:text-[#141413] border border-transparent'
                    }`}
                  >
                    {MODEL_SCALING_STAGE_LABELS_RU[st]}
                  </button>
                );
              })}
            </div>

            <span className="inline-flex items-center gap-1 rounded-[7px] bg-[#EAF6F0] px-2.5 py-1 text-[11px] font-semibold text-[#157347]">
              <span>✓</span>
              <span>{savedStamp}</span>
            </span>
          </div>
        </div>

        {/* 4 ПОКАЗАТЕЛЯ В ЕДИНОМ СПОКОЙНОМ СТИЛЕ (Без рваных чёрных рамок) */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[12px] border border-[#E4E3DC] bg-[#F9F9F6] px-4 py-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold text-[#686762] uppercase tracking-wide">
                План продаж (год)
              </span>
              {onOpenSalesMatrix && (
                <button
                  type="button"
                  onClick={onOpenSalesMatrix}
                  className="text-[11px] font-semibold text-[#141413] hover:underline cursor-pointer"
                >
                  По месяцам ↗
                </button>
              )}
            </div>
            <div className="mt-1 font-mono text-[20px] font-bold text-[#141413]">
              {proc.annualDemandPacks.toLocaleString('ru-RU')} компл.
            </div>
            <div className="mt-0.5 text-[11.5px] text-[#686762]">
              {proc.annualDemandUnits.toLocaleString('ru-RU')} изд. · {currentScenario.title.split('·')[0].trim()}
            </div>
          </div>

          <div className="rounded-[12px] border border-[#E4E3DC] bg-[#F9F9F6] px-4 py-3">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-semibold text-[#686762] uppercase tracking-wide">
                Доступный товар
              </span>
              {proc.approvedOrders.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetAllApprovedOrders}
                  className="text-[11px] font-semibold text-rose-700 hover:underline cursor-pointer"
                >
                  Сбросить PO ({proc.approvedOrders.length}) ↺
                </button>
              )}
            </div>
            <div className="mt-1 font-mono text-[20px] font-bold text-[#141413]">
              {(proc.netOpeningAvailablePacks + proc.totalApprovedReceiptsPacks).toLocaleString('ru-RU')} компл.
            </div>
            <div className="mt-0.5 text-[11.5px] text-[#686762]">
              Склад: {proc.netOpeningAvailablePacks.toLocaleString('ru-RU')} · Утв. PO: {proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} ({confirmedPoCount} шт.)
            </div>
          </div>

          <div className="rounded-[12px] border border-[#D4D3C9] bg-[#F4F3EE] px-4 py-3">
            <span className="text-[11px] font-semibold text-[#4A4944] uppercase tracking-wide">
              К заказу на фабрике
            </span>
            <div className="mt-1 font-mono text-[20px] font-extrabold text-[#141413]">
              {proc.totalRecommendedPacks.toLocaleString('ru-RU')} компл.
            </div>
            <div className="mt-0.5 text-[11.5px] text-[#5C5B55]">
              {proc.totalRecommendedUnits.toLocaleString('ru-RU')} изд. · {proc.recommendedBatches.length} кварт. парт.
            </div>
          </div>

          <div className="rounded-[12px] border border-[#D4D3C9] bg-[#F4F3EE] px-4 py-3">
            <span className="text-[11px] font-semibold text-[#4A4944] uppercase tracking-wide">
              Стоимость заказа
            </span>
            <div className="mt-1 font-mono text-[20px] font-extrabold text-[#141413]">
              {proc.totalRecommendedBudgetRub !== null
                ? formatRubMillions(proc.totalRecommendedBudgetRub)
                : 'Не заполнена себест.'}
            </div>
            <div className="mt-0.5 text-[11.5px] text-[#5C5B55]">
              {proc.totalRecommendedBudgetRub !== null
                ? `${proc.totalRecommendedBudgetRub.toLocaleString('ru-RU')} ₽ · по ${model.unitCostRub} ₽/компл.`
                : 'Укажите себестоимость комплекта'}
            </div>
          </div>
        </div>

        {/* Редактируемые параметры: ОДИН уровень чистых полей (без рамок внутри рамок!) */}
        <div className="mt-4 border-t border-[#EAE9E2] pt-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
            {/* 1. Начальный остаток */}
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-[#52514C]">
                Остаток на складе сейчас
              </span>
              <div className="relative flex items-center">
                <NumericInput
                  ariaLabel="Начальный остаток, комплектов"
                  value={shared.actualOpeningStockPacks}
                  min={0}
                  step={50}
                  onChangeValue={handleUpdateOpeningStock}
                  className="h-9.5 w-full rounded-[9px] border border-[#D8D7CE] bg-white pr-14 pl-3 font-mono text-[14px] font-bold text-[#141413] hover:border-[#B8B7AE] focus:border-[#9E9D95] focus:bg-[#FCFBF9] focus:outline-none transition-colors"
                />
                <span className="pointer-events-none absolute right-3 text-[11px] font-medium text-[#787770]">
                  компл.
                </span>
              </div>
            </label>

            {/* 2. Себестоимость комплекта */}
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-[#52514C]">
                Себестоимость под ключ
              </span>
              <div className="relative flex items-center">
                <NumericInput
                  ariaLabel="Себестоимость комплекта, рублей"
                  value={model.unitCostRub || 0}
                  min={0}
                  step={10}
                  onChangeValue={handleUpdateUnitCost}
                  className="h-9.5 w-full rounded-[9px] border border-[#D8D7CE] bg-white pr-16 pl-3 font-mono text-[14px] font-bold text-[#141413] hover:border-[#B8B7AE] focus:border-[#9E9D95] focus:bg-[#FCFBF9] focus:outline-none transition-colors"
                />
                <span className="pointer-events-none absolute right-3 text-[11px] font-medium text-[#787770]">
                  ₽/компл.
                </span>
              </div>
            </label>

            {/* 3. Срок производства (дней) */}
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-[#52514C]">
                Срок производства
              </span>
              <div className="relative flex items-center">
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
                  className="h-9.5 w-full rounded-[9px] border border-[#D8D7CE] bg-white pr-12 pl-3 font-mono text-[14px] font-bold text-[#141413] hover:border-[#B8B7AE] focus:border-[#9E9D95] focus:bg-[#FCFBF9] focus:outline-none transition-colors"
                />
                <span className="pointer-events-none absolute right-3 text-[11px] font-medium text-[#787770]">
                  дней
                </span>
              </div>
            </label>

            {/* 4. Срок доставки и приёмки (дней) */}
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-[#52514C]">
                Доставка в РФ (цикл {proc.totalLeadDays} дн.)
              </span>
              <div className="relative flex items-center">
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
                  className="h-9.5 w-full rounded-[9px] border border-[#D8D7CE] bg-white pr-12 pl-3 font-mono text-[14px] font-bold text-[#141413] hover:border-[#B8B7AE] focus:border-[#9E9D95] focus:bg-[#FCFBF9] focus:outline-none transition-colors"
                />
                <span className="pointer-events-none absolute right-3 text-[11px] font-medium text-[#787770]">
                  дней
                </span>
              </div>
            </label>

            {/* 5. Кнопка раскрытия дополнительных настроек (Размеры S–XXL, MOQ, кратность, страховой запас) */}
            <div className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-[#52514C]">
                MOQ {fp.moqPacks.toLocaleString('ru-RU')} · Запас {fp.safetyStockDays} дн.
              </span>
              <button
                type="button"
                onClick={() => setShowAdvancedSettings((v) => !v)}
                className={`h-9.5 inline-flex items-center justify-between rounded-[9px] border px-3 text-[12px] font-semibold transition cursor-pointer ${
                  showAdvancedSettings
                    ? 'border-[#B8B7AE] bg-[#EFEFE9] text-[#141413]'
                    : 'border-[#D8D7CE] bg-[#F8F8F5] text-[#141413] hover:border-[#B8B7AE] hover:bg-white'
                }`}
              >
                <span>Размеры S–XXL и MOQ</span>
                <span>{showAdvancedSettings ? '▴' : '▾'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Раскрывающийся блок «Дополнительные настройки» (Единая размерная сетка S-XXL, MOQ, Кратность, Страховой запас) */}
        {showAdvancedSettings && (
          <div className="mt-3.5 rounded-[12px] border border-[#DFDED6] bg-[#F8F8F5] p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] font-bold text-[#141413]">
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
                        className="rounded bg-[#141413] px-2.5 py-0.5 text-[10.5px] font-semibold text-white hover:bg-black cursor-pointer"
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
                      className="flex flex-col rounded-[8px] border border-[#D8D7CE] bg-white px-2.5 py-1.5"
                    >
                      <span className="text-[10.5px] font-semibold text-[#686762]">{sz}, %</span>
                      <NumericInput
                        ariaLabel={`Доля размера ${sz}, %`}
                        value={fp.sizeSharesPct[sz] ?? 20}
                        min={0}
                        max={100}
                        onChangeValue={(val) => handleUpdateModelSizeShare(sz, val)}
                        className="mt-0.5 w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 lg:col-span-5">
                <label className="flex flex-col justify-between rounded-[8px] border border-[#D8D7CE] bg-white px-2.5 py-1.5">
                  <span className="text-[10.5px] font-semibold text-[#686762]">
                    MOQ (мин. заказ)
                  </span>
                  <div className="mt-1 flex items-center gap-1">
                    <NumericInput
                      ariaLabel="MOQ, комплектов"
                      value={fp.moqPacks}
                      min={1}
                      step={100}
                      onChangeValue={handleUpdateMoq}
                      className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#686762]">компл.</span>
                  </div>
                </label>

                <label className="flex flex-col justify-between rounded-[8px] border border-[#D8D7CE] bg-white px-2.5 py-1.5">
                  <span className="text-[10.5px] font-semibold text-[#686762]">
                    Кратность (шаг)
                  </span>
                  <div className="mt-1 flex items-center gap-1">
                    <NumericInput
                      ariaLabel="Кратность заказа, комплектов"
                      value={fp.packMultiple}
                      min={1}
                      step={50}
                      onChangeValue={handleUpdatePackMultiple}
                      className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#686762]">компл.</span>
                  </div>
                </label>

                <label className="flex flex-col justify-between rounded-[8px] border border-[#D8D7CE] bg-white px-2.5 py-1.5">
                  <span className="text-[10.5px] font-semibold text-[#686762]">
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
                      className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                    />
                    <span className="text-[10px] text-[#686762]">дн.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          БЛОК 2 · ГРАФИК ПАРТИЙ К ЗАКАЗУ (Прямое редактирование в каждой строке и размерах S–XXL)
         ===================================================================== */}
      <div className="rounded-[16px] border border-[#D8D7CE] bg-white p-5 shadow-[0_1px_3px_rgba(20,20,19,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5">
          <div>
            <h4 className="text-[15.5px] font-bold text-[#141413]">
              Партии к заказу по кварталам ({proc.recommendedBatches.length} план · {proc.approvedOrders.length} утв. PO)
            </h4>
            <p className="mt-0.5 text-[12px] text-[#686762]">
              Меняйте объём, даты и период прямо в строке партии или откройте «Размеры S–XXL ▾» для точной правки по каждому размеру.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRecalculateDrafts}
              className="h-8.5 rounded-[8px] border border-[#D8D7CE] bg-[#F8F8F5] px-3 text-[12px] font-semibold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
            >
              Пересчитать по плану
            </button>
            {proc.approvedOrders.length > 0 && (
              <button
                type="button"
                onClick={handleResetAllApprovedOrders}
                className="h-8.5 rounded-[8px] border border-rose-200 bg-rose-50 px-3 text-[12px] font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer"
              >
                ↺ Вернуть все PO в черновик ({proc.approvedOrders.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddCustomModal((v) => !v)}
              className="h-8.5 rounded-[8px] border border-[#D8D7CE] bg-white px-3 text-[12px] font-semibold text-[#141413] hover:border-[#B8B7AE] hover:bg-[#FAF9F6] cursor-pointer"
            >
              + Своя партия
            </button>
            {fp.customBatchPeriods && (
              <button
                type="button"
                onClick={handleResetToDefaultQuarters}
                className="h-8.5 rounded-[8px] border border-[#D8D7CE] bg-white px-2.5 text-[11.5px] font-medium text-[#686762] hover:text-[#141413] cursor-pointer"
              >
                Сбросить к 4 кварталам
              </button>
            )}
            {proc.recommendedBatches.length > 0 && (
              <button
                type="button"
                onClick={handleApproveAllDraftBatches}
                className="h-8.5 rounded-[8px] border border-[#BCE3CF] bg-[#EAF6F0] px-3.5 text-[12px] font-semibold text-[#146C43] hover:bg-[#157347] hover:text-white transition cursor-pointer"
              >
                ✓ Утвердить все ({proc.recommendedBatches.length})
              </button>
            )}
          </div>
        </div>

        {/* Форма «+ Своя партия» (раскрывается по кнопке) */}
        {showAddCustomModal && (
          <div className="mb-4 rounded-[12px] border border-[#D8D7CE] bg-[#F8F8F5] p-3.5">
            <div className="flex items-center justify-between pb-2.5">
              <span className="text-[13px] font-bold text-[#141413]">
                Добавление произвольной партии закупки
              </span>
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="text-[11.5px] font-semibold text-[#686762] hover:text-[#141413] cursor-pointer"
              >
                Закрыть ✕
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
              <label className="flex flex-col text-[11px] font-semibold text-[#52514C]">
                Начало покрытия
                <select
                  value={newBatchStartMonth}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    setNewBatchStartMonth(m);
                    if (newBatchEndMonth < m) setNewBatchEndMonth(m);
                  }}
                  className="mt-1 rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#141413]"
                >
                  {MONTHS_SHORT.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m} 2027
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col text-[11px] font-semibold text-[#52514C]">
                Конец покрытия
                <select
                  value={newBatchEndMonth}
                  onChange={(e) => setNewBatchEndMonth(Number(e.target.value))}
                  className="mt-1 rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#141413]"
                >
                  {MONTHS_SHORT.map((m, idx) => (
                    <option key={m} value={idx} disabled={idx < newBatchStartMonth}>
                      {m} 2027
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col text-[11px] font-semibold text-[#52514C]">
                Количество, компл.
                <NumericInput
                  value={newBatchPacks}
                  min={1}
                  step={50}
                  onChangeValue={setNewBatchPacks}
                  className="mt-1 rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 py-1.5 font-mono text-[12.5px] font-bold text-[#141413]"
                />
              </label>

              <label className="flex flex-col text-[11px] font-semibold text-[#52514C]">
                Дата заказа до
                <input
                  type="date"
                  value={newBatchOrderDate}
                  onChange={(e) => setNewBatchOrderDate(e.target.value)}
                  className="mt-1 rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 py-1.5 font-mono text-[12px] font-semibold text-[#141413]"
                />
              </label>

              <div className="flex flex-col justify-end gap-1.5">
                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#52514C]">
                  <input
                    type="checkbox"
                    checked={newBatchApproveImmediately}
                    onChange={(e) => setNewBatchApproveImmediately(e.target.checked)}
                    className="rounded border-[#CFCEC6]"
                  />
                  <span>Сразу утвердить в PO</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddBatchSubmit}
                  className="rounded-[8px] bg-[#141413] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-black cursor-pointer"
                >
                  Сохранить партию
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Утверждённые заказы PO (хронологически отсортированные, с прямым инлайн-редактированием объёма, дат, цены и размеров S–XXL!) */}
        {sortedApprovedOrders.length > 0 && (
          <div className="mb-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-[12px] font-bold uppercase tracking-wider text-[#157347]">
                Утверждённые заказы PO ({sortedApprovedOrders.length} шт. · {proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} компл.)
              </span>
              <span className="text-[11.5px] text-[#52514C]">
                Все поля в строке и внутри размеров S–XXL можно редактировать напрямую
              </span>
            </div>

            {sortedApprovedOrders.map((po, poIdx) => {
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
                  className="rounded-[12px] border border-[#BBE5CE] bg-[#F4FBF7] transition-shadow hover:shadow-xs"
                >
                  {/* КЛИКАБЕЛЬНАЯ СТРОКА PO С ПРЯМЫМИ ИНЛАЙН-ПОЛЯМИ */}
                  <div
                    onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-md bg-[#157347] px-2.5 py-1 font-mono text-[11px] font-bold text-white">
                        PO #{poIdx + 1}
                      </span>

                      {/* Прямой выбор месяца прихода */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1"
                      >
                        <select
                          aria-label={`Месяц прихода заказа ${po.orderNumber}`}
                          value={po.arrivalMonthIdx}
                          onChange={(e) => {
                            const nextArrival = Number(e.target.value);
                            const updated = updateApprovedPurchaseOrder(model, po.id, {
                              arrivalMonthIdx: nextArrival,
                              coveredEndMonthIdx: Math.max(
                                nextArrival,
                                po.coveredEndMonthIdx ?? nextArrival
                              ),
                            });
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-8 rounded-[7px] border border-[#BBE5CE] bg-white px-2 text-[13px] font-bold text-[#141413] hover:border-[#157347] focus:border-[#141413] focus:outline-none cursor-pointer"
                        >
                          {MONTHS_SHORT.map((m, idx) => (
                            <option key={m} value={idx}>
                              Приход: {m} 2027
                            </option>
                          ))}
                        </select>
                      </div>

                      <span className="rounded border border-[#CBEAD9] bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#157347]">
                        {po.orderNumber}
                      </span>

                      {/* Прямое редактирование даты заказа */}
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 text-[12px] text-[#52514C]"
                      >
                        <span>Заказ до:</span>
                        <input
                          type="date"
                          aria-label={`Дата размещения заказа ${po.orderNumber}`}
                          value={po.orderPlacementDateIso}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const updated = updateApprovedPurchaseOrder(model, po.id, {
                              orderPlacementDateIso: e.target.value,
                            });
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-8 rounded-[7px] border border-[#BBE5CE] bg-white px-2 font-mono text-[12px] font-semibold text-[#141413] hover:border-[#157347] focus:border-[#141413] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex flex-wrap items-center gap-2.5"
                    >
                      {/* Прямое редактирование объёма PO прямо в строке */}
                      <div className="inline-flex items-center rounded-[8px] border border-[#BBE5CE] bg-white p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = Math.max(50, po.packsQty - (fp.packMultiple || 50));
                            const updated = updateApprovedPurchaseOrder(model, po.id, {
                              packsQty: nextVal,
                            });
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#52514C] hover:bg-[#F0F0EC] hover:text-[#141413] cursor-pointer"
                          title="Уменьшить объём партии"
                        >
                          −
                        </button>
                        <NumericInput
                          ariaLabel={`Количество комплектов в ${po.orderNumber}`}
                          value={po.packsQty}
                          min={1}
                          step={fp.packMultiple || 50}
                          onChangeValue={(val) => {
                            const updated = updateApprovedPurchaseOrder(model, po.id, {
                              packsQty: val,
                            });
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-7 w-20 text-center font-mono text-[13.5px] font-bold text-[#141413] focus:outline-none"
                        />
                        <span className="pr-1.5 text-[11px] font-medium text-[#686762]">
                          компл.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = po.packsQty + (fp.packMultiple || 50);
                            const updated = updateApprovedPurchaseOrder(model, po.id, {
                              packsQty: nextVal,
                            });
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#52514C] hover:bg-[#F0F0EC] hover:text-[#141413] cursor-pointer"
                          title="Увеличить объём партии"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right min-w-[105px]">
                        <div className="font-mono text-[14px] font-bold text-[#141413]">
                          {formatRubMillions(po.totalOrderRub)}
                        </div>
                        <div className="font-mono text-[10.5px] text-[#52514C]">
                          {(po.packsQty * po.unitsInPack).toLocaleString('ru-RU')} изд.
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                        className="h-8 rounded-[8px] border border-[#CBEAD9] bg-white px-2.5 text-[11.5px] font-semibold text-[#141413] hover:bg-[#EAF6F0] cursor-pointer"
                      >
                        {isExpanded ? 'Скрыть ▴' : 'Размеры S–XXL ▾'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = removeApprovedPurchaseOrder(model, po.id);
                          onUpdateModel(updated);
                          triggerSavedIndicator('Возвращён в план');
                        }}
                        title="Вернуть этот заказ обратно в черновой план"
                        className="h-8 rounded-[8px] border border-rose-200 bg-white px-2.5 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        ↺ В план
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#CBEAD9] bg-white px-4 py-3.5 rounded-b-[11px]">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
                        <span className="text-[12.5px] font-bold text-[#141413]">
                          Размерная сетка S–XXL и параметры заказа {po.orderNumber} (нажмите на любой размер для ввода количества)
                        </span>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-[#141413]">
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
                          <span>Подтверждён фабрикой (учитывать в поставках)</span>
                        </label>
                      </div>

                      {discrepancy && (
                        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900">
                          <strong>Зафиксированный PO сохранён без изменений:</strong>{' '}
                          {discrepancy.message}
                        </div>
                      )}

                      {/* ИНТЕРАКТИВНЫЕ РАЗМЕРЫ S–XXL УТВЕРЖДЁННОГО PO */}
                      <div className="rounded-lg border border-[#E4E3DC] bg-[#F8F8F5] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11.5px] font-semibold text-[#52514C]">
                            Количество комплектов по размерам S–XXL ({po.unitsInPack} изд. в 1 компл.) — меняйте любое поле, итог пересчитается сразу:
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const redistributed = allocatePacksBySizeLargestRemainder(
                                po.packsQty,
                                fp.sizeSharesPct
                              );
                              const updated = updateApprovedPurchaseOrder(model, po.id, {
                                sizeBreakdownPacks: redistributed,
                              });
                              onUpdateModel(updated);
                              triggerSavedIndicator('Размеры выровнены по %');
                            }}
                            className="rounded border border-[#CFCEC6] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#141413] hover:border-[#141413] cursor-pointer"
                          >
                            Пересчитать по пропорции % ({fp.sizeSharesPct.S}/{fp.sizeSharesPct.M}/{fp.sizeSharesPct.L}/{fp.sizeSharesPct.XL}/{fp.sizeSharesPct.XXL})
                          </button>
                        </div>

                        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px]">
                          {SIZES_LIST.map((sz) => {
                            const szPacks = poSizes[sz] || 0;
                            const sharePct =
                              poSizeTotal > 0 ? Math.round((szPacks / poSizeTotal) * 100) : 0;
                            return (
                              <label
                                key={sz}
                                className="flex flex-col justify-between rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 py-2 hover:border-[#141413] focus-within:border-[#141413] focus-within:ring-1 focus-within:ring-[#141413]"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-[#141413]">{sz}</span>
                                  <span className="font-mono text-[10px] text-[#686762]">
                                    {sharePct}%
                                  </span>
                                </div>
                                <div className="my-1 flex items-center justify-center gap-1">
                                  <NumericInput
                                    ariaLabel={`Размер ${sz} в комплектах для ${po.orderNumber}`}
                                    value={szPacks}
                                    min={0}
                                    step={10}
                                    onChangeValue={(val) =>
                                      handleUpdatePoSizePacks(po, poSizes, sz, val)
                                    }
                                    className="w-full rounded border border-[#E4E3DC] bg-[#FAF9F6] py-1 text-center font-mono text-[13.5px] font-bold text-[#141413] focus:bg-white focus:border-[#141413] focus:outline-none"
                                  />
                                </div>
                                <div className="font-mono text-[10px] text-[#686762]">
                                  компл. · {(szPacks * po.unitsInPack).toLocaleString('ru-RU')} изд.
                                </div>
                              </label>
                            );
                          })}
                          <div className="flex flex-col justify-between rounded-[8px] border border-[#BCE3CF] bg-[#F3FAF6] px-2.5 py-2 text-[#141413]">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-[#146C43]">ИТОГО</span>
                              <span className="font-mono text-[10px] text-[#146C43]">100%</span>
                            </div>
                            <div className="my-1 font-mono text-[15px] font-extrabold text-[#141413]">
                              {poSizeTotal.toLocaleString('ru-RU')} компл.
                            </div>
                            <div className="font-mono text-[10px] text-[#52514C]">
                              {(poSizeTotal * po.unitsInPack).toLocaleString('ru-RU')} изд.
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#52514C]">
                          <label className="inline-flex items-center gap-1.5">
                            <span className="font-medium">Статус поставки:</span>
                            <select
                              value={po.status}
                              onChange={(e) => {
                                const updated = updateApprovedPurchaseOrder(model, po.id, {
                                  status: e.target.value as ApprovedPurchaseOrder['status'],
                                });
                                onUpdateModel(updated);
                                triggerSavedIndicator('Сохранено');
                              }}
                              className="h-8 rounded-md border border-[#CFCEC6] bg-white px-2.5 text-[12px] font-semibold text-[#141413]"
                            >
                              {Object.entries(PO_STATUS_LABELS_RU).map(([k, lbl]) => (
                                <option key={k} value={k}>
                                  {lbl}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="inline-flex items-center gap-1.5">
                            <span className="font-medium">Цена в заказе:</span>
                            <NumericInput
                              ariaLabel={`Цена комплекта в заказе ${po.orderNumber}`}
                              value={po.lockedUnitCostRub}
                              min={0}
                              step={10}
                              onChangeValue={(val) => {
                                const updated = updateApprovedPurchaseOrder(model, po.id, {
                                  lockedUnitCostRub: val,
                                });
                                onUpdateModel(updated);
                                triggerSavedIndicator('Сохранено');
                              }}
                              className="h-8 w-20 rounded-md border border-[#CFCEC6] bg-white px-2 text-center font-mono text-[12.5px] font-bold text-[#141413] focus:border-[#141413] focus:outline-none"
                            />
                            <span>₽/компл.</span>
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const updated = removeApprovedPurchaseOrder(model, po.id);
                            onUpdateModel(updated);
                            triggerSavedIndicator('Заказ удалён');
                          }}
                          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11.5px] font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer"
                        >
                          Вернуть в черновик / Удалить PO
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ЧИСТАЯ ИНТЕРАКТИВНАЯ ТАБЛИЦА КВАРТАЛЬНЫХ ПАРТИЙ (С прямым редактированием периода, даты, объёма и размеров S–XXL!) */}
        {proc.recommendedBatches.length > 0 && (
          <div className="overflow-x-auto rounded-[12px] border border-[#E2E1D8]">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E2E1D8] bg-[#F8F8F5] text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                  <th className="py-2.5 pl-4 pr-3">Партия и период покрытия</th>
                  <th className="px-3 py-2.5 text-right">План продаж</th>
                  <th className="px-3 py-2.5">Заказать до (дата)</th>
                  <th className="px-3 py-2.5">Приход на склад</th>
                  <th className="px-3 py-2.5 text-right">К заказу (компл.)</th>
                  <th className="px-3 py-2.5 text-right">Сумма партии</th>
                  <th className="py-2.5 pr-4 pl-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE9E2]">
                {proc.recommendedBatches.map((batch, bIdx) => {
                  const rowKey = `draft-${batch.periodId}`;
                  const isExpanded = activeExpandedKey === rowKey;
                  const sizeTotalPacks = SIZES_LIST.reduce(
                    (s, sz) => s + (batch.sizeBreakdownPacks[sz] || 0),
                    0
                  );
                  const periodIdxInList = activePeriods.findIndex(
                    (p) => p.id === batch.periodId
                  );
                  const canMergeNext =
                    periodIdxInList >= 0 && periodIdxInList < activePeriods.length - 1;
                  const canSplit = batch.endCoveredMonthIdx > batch.firstCoveredMonthIdx;

                  return (
                    <React.Fragment key={batch.periodId}>
                      <tr
                        onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded ? 'bg-[#F8F8F4]' : 'bg-white hover:bg-[#FAF9F6]'
                        }`}
                      >
                        {/* 1. Партия и прямой выбор месяцев покрытия */}
                        <td className="py-3 pl-4 pr-3">
                          <div className="flex items-center gap-2.5">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#D4D3C9] bg-[#F4F3EE] font-mono text-[11.5px] font-bold text-[#141413]">
                              {bIdx + 1}
                            </span>
                            <div>
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1"
                              >
                                <select
                                  aria-label={`Начало периода партии №${bIdx + 1}`}
                                  value={batch.firstCoveredMonthIdx}
                                  onChange={(e) => {
                                    const nextStart = Number(e.target.value);
                                    updateDraftPeriodDef(batch.periodId, (prev) => ({
                                      ...prev,
                                      startMonthIdx: nextStart,
                                      endMonthIdx: Math.max(nextStart, prev.endMonthIdx),
                                    }));
                                  }}
                                  className="h-7 rounded-[6px] border border-[#DFDED6] bg-white px-1.5 text-[12.5px] font-bold text-[#141413] hover:border-[#B8B7AE] focus:border-[#9E9D95] focus:outline-none cursor-pointer"
                                >
                                  {MONTHS_SHORT.map((m, idx) => (
                                    <option key={m} value={idx}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                                <span className="text-[12px] text-[#686762]">–</span>
                                <select
                                  aria-label={`Конец периода партии №${bIdx + 1}`}
                                  value={batch.endCoveredMonthIdx}
                                  onChange={(e) => {
                                    const nextEnd = Number(e.target.value);
                                    updateDraftPeriodDef(batch.periodId, (prev) => ({
                                      ...prev,
                                      endMonthIdx: Math.max(prev.startMonthIdx, nextEnd),
                                    }));
                                  }}
                                  className="h-7 rounded-[6px] border border-[#DFDED6] bg-white px-1.5 text-[12.5px] font-bold text-[#141413] hover:border-[#B8B7AE] focus:border-[#9E9D95] focus:outline-none cursor-pointer"
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
                              </div>
                              <div className="mt-0.5 text-[11px] text-[#686762]">
                                Партия №{bIdx + 1}
                                {batch.isAdditionalOrder ? ' · Дополнительно к PO' : ''}
                                {batch.isTestBatch
                                  ? ` · Тестовая (${MODEL_SCALING_STAGE_LABELS_RU[proc.scalingStage]})`
                                  : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. План продаж */}
                        <td className="px-3 py-3 text-right font-mono text-[13.5px] font-semibold text-[#52514C]">
                          {batch.periodDemandPacks.toLocaleString('ru-RU')} компл.
                        </td>

                        {/* 3. Заказать до — прямое поле ввода даты */}
                        <td
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-3"
                        >
                          <div className="flex flex-col items-start gap-0.5">
                            <input
                              type="date"
                              aria-label={`Дата заказа партии №${bIdx + 1}`}
                              value={batch.recommendedOrderDateIso}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                updateDraftPeriodDef(batch.periodId, (prev) => ({
                                  ...prev,
                                  customOrderDateIso: e.target.value,
                                }));
                              }}
                              className="h-8 rounded-[7px] border border-[#DFDED6] bg-white px-2 font-mono text-[12px] font-semibold text-[#141413] hover:border-[#B8B7AE] focus:border-[#9E9D95] focus:outline-none"
                            />
                            {batch.hasCustomDateOverride && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateDraftPeriodDef(batch.periodId, (prev) => ({
                                    ...prev,
                                    customOrderDateIso: null,
                                  }))
                                }
                                className="text-[10.5px] font-semibold text-[#686762] hover:text-[#141413] underline cursor-pointer"
                              >
                                ↺ авто-дата
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 4. Приход на склад */}
                        <td className="px-3 py-3">
                          <div className="font-mono text-[13px] font-medium text-[#141413]">
                            {formatHumanDateRu(batch.requiredArrivalDateIso)}
                          </div>
                          <div className="text-[10.5px] text-[#686762]">
                            цикл {proc.totalLeadDays} дн.
                          </div>
                        </td>

                        {/* 5. К заказу — прямое поле ввода комплектов со степпером - / + */}
                        <td
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-3 text-right"
                        >
                          <div className="inline-flex flex-col items-end">
                            <div className="inline-flex items-center rounded-[8px] border border-[#DFDED6] bg-white p-0.5 hover:border-[#B8B7AE] focus-within:border-[#9E9D95]">
                              <button
                                type="button"
                                onClick={() => {
                                  const step = fp.packMultiple || 50;
                                  const nextVal = Math.max(step, batch.recommendedPacks - step);
                                  updateDraftPeriodDef(batch.periodId, (prev) => ({
                                    ...prev,
                                    customPacksQty: nextVal,
                                    customSizeBreakdownPacks: null,
                                  }));
                                }}
                                className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#52514C] hover:bg-[#F0F0EC] hover:text-[#141413] cursor-pointer"
                                title="Уменьшить количество"
                              >
                                −
                              </button>
                              <NumericInput
                                ariaLabel={`Количество комплектов к заказу в партии №${bIdx + 1}`}
                                value={batch.recommendedPacks}
                                min={1}
                                step={fp.packMultiple || 50}
                                onChangeValue={(val) =>
                                  updateDraftPeriodDef(batch.periodId, (prev) => ({
                                    ...prev,
                                    customPacksQty: val,
                                    customSizeBreakdownPacks: null,
                                  }))
                                }
                                className="h-7 w-20 text-center font-mono text-[13.5px] font-bold text-[#141413] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const step = fp.packMultiple || 50;
                                  const nextVal = batch.recommendedPacks + step;
                                  updateDraftPeriodDef(batch.periodId, (prev) => ({
                                    ...prev,
                                    customPacksQty: nextVal,
                                    customSizeBreakdownPacks: null,
                                  }));
                                }}
                                className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#52514C] hover:bg-[#F0F0EC] hover:text-[#141413] cursor-pointer"
                                title="Увеличить количество"
                              >
                                +
                              </button>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] text-[#686762]">
                              <span>{batch.physicalUnitsQty.toLocaleString('ru-RU')} изд.</span>
                              {batch.hasCustomPacksOverride && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateDraftPeriodDef(batch.periodId, (prev) => ({
                                      ...prev,
                                      customPacksQty: null,
                                      customSizeBreakdownPacks: null,
                                    }))
                                  }
                                  className="font-sans font-semibold text-amber-800 hover:underline cursor-pointer"
                                >
                                  ↺ по формуле
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 6. Сумма партии */}
                        <td className="px-3 py-3 text-right">
                          <div className="font-mono text-[15px] font-bold text-[#141413]">
                            {formatRubMillions(batch.estimatedTotalRub)}
                          </div>
                          <div className="font-mono text-[11px] text-[#686762]">
                            {batch.estimatedTotalRub.toLocaleString('ru-RU')} ₽
                          </div>
                        </td>

                        {/* 7. Действия */}
                        <td
                          onClick={(e) => e.stopPropagation()}
                          className="py-3 pr-4 pl-3 text-right"
                        >
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                              className={`h-8 rounded-[7px] border px-2.5 text-[11.5px] font-semibold transition cursor-pointer ${
                                isExpanded
                                  ? 'border-[#B8B7AE] bg-[#EAE9E2] text-[#141413]'
                                  : 'border-[#D8D7CE] bg-[#F8F8F5] text-[#141413] hover:bg-[#EFEFE9]'
                              }`}
                            >
                              {isExpanded ? 'Скрыть ▴' : 'Размеры и расчёт ▾'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleApproveDraftBatch(batch)}
                              className="h-8 rounded-[7px] border border-[#BCE3CF] bg-[#F3FAF6] px-3 text-[11.5px] font-semibold text-[#146C43] hover:bg-[#157347] hover:text-white transition cursor-pointer"
                            >
                              ✓ Утвердить заказ
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Раскрываемая детализация партии: интерактивная размерная сетка S–XXL и управление партией без лишних кликов! */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-[#FAF9F5] px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
                              <div className="text-[12.5px] font-bold text-[#141413]">
                                Размерная сетка S–XXL и расчёт · Партия №{bIdx + 1} ({batch.coverageMonthsLabel})
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {canMergeNext && (
                                  <button
                                    type="button"
                                    onClick={() => handleMergeWithNextPeriod(batch.periodId)}
                                    className="rounded-[7px] border border-[#CFCEC6] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#141413] hover:border-[#141413] cursor-pointer"
                                  >
                                    Объединить со следующей партией
                                  </button>
                                )}
                                {canSplit && (
                                  <button
                                    type="button"
                                    onClick={() => handleSplitPeriod(batch.periodId)}
                                    className="rounded-[7px] border border-[#CFCEC6] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#141413] hover:border-[#141413] cursor-pointer"
                                  >
                                    Разделить партию на две
                                  </button>
                                )}
                                {(batch.hasCustomPacksOverride || batch.hasCustomDateOverride) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateDraftPeriodDef(batch.periodId, (prev) => ({
                                        ...prev,
                                        customPacksQty: null,
                                        customOrderDateIso: null,
                                        customSizeSharesPct: null,
                                        customSizeBreakdownPacks: null,
                                      }))
                                    }
                                    className="rounded-[7px] border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
                                  >
                                    ↺ Сбросить ручные правки партии
                                  </button>
                                )}
                                {activePeriods.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDraftPeriod(batch.periodId)}
                                    className="rounded-[7px] border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11.5px] font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer"
                                  >
                                    Удалить партию
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="rounded-[9px] border border-[#E4E3DC] bg-white px-3.5 py-2.5 text-[12px] text-[#52514C]">
                              <span className="font-semibold text-[#141413]">Формула партии: </span>
                              Выкупы ({batch.periodDemandPacks.toLocaleString('ru-RU')} компл.) +
                              Запас ({batch.safetyStockPacks.toLocaleString('ru-RU')} компл.) −
                              Остаток к началу ({batch.openingAvailableAtStartPacks.toLocaleString('ru-RU')} компл.) −
                              Утверждённые PO ({batch.confirmedReceiptsInPeriodPacks.toLocaleString('ru-RU')} компл.) ={' '}
                              <strong className="text-[#141413]">
                                чистая потребность {batch.rawNetNeedPacks.toLocaleString('ru-RU')} компл.
                              </strong>{' '}
                              → к заказу:{' '}
                              <strong className="font-mono text-[#141413]">
                                {batch.recommendedPacks.toLocaleString('ru-RU')} компл. ({batch.physicalUnitsQty.toLocaleString('ru-RU')} изд.)
                              </strong>
                            </div>

                            {/* ИНТЕРАКТИВНЫЕ РАЗМЕРЫ S–XXL ЧЕРНОВОЙ ПАРТИИ (редактируются и комплекты, и %!) */}
                            <div className="mt-3 rounded-[9px] border border-[#E4E3DC] bg-white p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11.5px] font-semibold text-[#141413]">
                                  Размеры партии S–XXL (нажмите на любое число комплектов или %, чтобы изменить напрямую):
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateDraftPeriodDef(batch.periodId, (prev) => ({
                                      ...prev,
                                      customSizeSharesPct: null,
                                      customSizeBreakdownPacks: null,
                                    }))
                                  }
                                  className="rounded border border-[#CFCEC6] bg-[#F8F8F5] px-2.5 py-0.5 text-[11px] font-semibold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
                                >
                                  Выровнять по базовой матрице ({fp.sizeSharesPct.S}/{fp.sizeSharesPct.M}/{fp.sizeSharesPct.L}/{fp.sizeSharesPct.XL}/{fp.sizeSharesPct.XXL}%)
                                </button>
                              </div>

                              <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px]">
                                {SIZES_LIST.map((sz) => {
                                  const packsForSize = batch.sizeBreakdownPacks[sz] || 0;
                                  const unitsForSize = packsForSize * model.unitsInPack;
                                  return (
                                    <div
                                      key={sz}
                                      className="flex flex-col justify-between rounded-[8px] border border-[#CFCEC6] bg-[#FAF9F6] px-2.5 py-2 hover:border-[#141413] focus-within:border-[#141413] focus-within:bg-white"
                                    >
                                      <div className="flex items-center justify-between gap-1 text-[11px]">
                                        <span className="font-bold text-[#141413]">{sz}</span>
                                        <div className="inline-flex items-center gap-0.5">
                                          <NumericInput
                                            ariaLabel={`Доля размера ${sz} в % для партии №${bIdx + 1}`}
                                            value={batch.sizeSharesPct[sz]}
                                            min={0}
                                            max={100}
                                            onChangeValue={(pct) =>
                                              handleUpdateDraftBatchSizeShare(batch, sz, pct)
                                            }
                                            className="w-9 rounded border border-[#DFDED6] bg-white px-1 py-0.5 text-right font-mono text-[10.5px] font-semibold text-[#52514C] focus:border-[#141413] focus:outline-none"
                                          />
                                          <span className="text-[10px] text-[#686762]">%</span>
                                        </div>
                                      </div>

                                      <div className="my-1.5">
                                        <NumericInput
                                          ariaLabel={`Количество комплектов размера ${sz} в партии №${bIdx + 1}`}
                                          value={packsForSize}
                                          min={0}
                                          step={10}
                                          onChangeValue={(val) =>
                                            handleUpdateDraftBatchSizePacks(batch, sz, val)
                                          }
                                          className="w-full rounded border border-[#D8D7CE] bg-white py-1 text-center font-mono text-[13.5px] font-bold text-[#141413] focus:border-[#141413] focus:outline-none"
                                        />
                                      </div>

                                      <div className="font-mono text-[10px] text-[#686762]">
                                        компл. · {unitsForSize.toLocaleString('ru-RU')} изд.
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="flex flex-col justify-between rounded-[8px] border border-[#BCE3CF] bg-[#F3FAF6] px-2.5 py-2 text-[#141413]">
                                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#146C43]">
                                    <span>ИТОГО</span>
                                    <span>100%</span>
                                  </div>
                                  <div className="my-1.5 font-mono text-[15px] font-extrabold text-[#141413]">
                                    {sizeTotalPacks.toLocaleString('ru-RU')} компл.
                                  </div>
                                  <div className="font-mono text-[10px] text-[#52514C]">
                                    {(sizeTotalPacks * model.unitsInPack).toLocaleString('ru-RU')} изд.
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E2E1D8] bg-[#F8F8F5] text-[12.5px] font-bold text-[#141413]">
                  <td className="py-3 pl-4 pr-3">
                    Итого к заказу ({proc.recommendedBatches.length} парт.)
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[#52514C]">
                    {proc.annualDemandPacks.toLocaleString('ru-RU')} компл.
                  </td>
                  <td colSpan={2} className="px-3 py-3 text-[11.5px] font-normal text-[#686762]">
                    Цикл производства и доставки: {proc.totalLeadDays} дн.
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {proc.totalRecommendedPacks.toLocaleString('ru-RU')} компл.
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {proc.totalRecommendedBudgetRub !== null
                      ? formatRubMillions(proc.totalRecommendedBudgetRub)
                      : '—'}
                  </td>
                  <td className="py-3 pr-4 pl-3 text-right font-mono text-[11px] font-normal text-[#686762]">
                    {proc.totalRecommendedUnits.toLocaleString('ru-RU')} физ. изд.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Будущая потребность (для моделей в статусе «Гипотеза» или «Тест») */}
        {proc.futureScalingBatches.length > 0 && (
          <div className="mt-3 rounded-[12px] border border-dashed border-[#CFCEC6] bg-[#F8F8F5] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <div>
                <span className="text-[13px] font-bold text-[#141413]">
                  Следующие кварталы после прохождения теста (режим «
                  {MODEL_SCALING_STAGE_LABELS_RU[proc.scalingStage]}»)
                </span>
                <p className="text-[11.5px] text-[#686762]">
                  Чтобы открыть все кварталы к заказу прямо сейчас, переключите статус в «Масштабирование».
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleUpdateScalingStage('scaling')}
                className="rounded-[8px] border border-[#141413] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#141413] hover:bg-[#141413] hover:text-white cursor-pointer"
              >
                Включить «Масштабирование»
              </button>
            </div>

            <div className="space-y-1.5">
              {proc.futureScalingBatches.map((fb) => (
                <div
                  key={fb.periodId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#E4E3DC] bg-white px-3.5 py-2 text-[12px] text-[#52514C]"
                >
                  <span className="font-mono font-semibold text-[#141413]">
                    Партия №{fb.batchIndex} · {fb.coverageMonthsLabel}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono font-semibold text-[#141413]">
                      {fb.recommendedPacks.toLocaleString('ru-RU')} компл.
                    </span>
                    <span>·</span>
                    <span className="font-mono">{formatRubMillions(fb.estimatedTotalRub)}</span>
                    <span>·</span>
                    <span className="font-mono text-[11px]">
                      Заказ до {formatHumanDateRu(fb.recommendedOrderDateIso)}
                    </span>
                    <span className="rounded bg-[#F3F2EC] px-2 py-0.5 text-[10.5px] font-semibold text-[#686762]">
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
            <div className="rounded-[12px] border border-[#BBE5CE] bg-[#F4FBF7] px-4 py-3 text-[13px] font-semibold text-[#157347]">
              ✓ Потребность в закупках полностью закрыта доступным товаром (склад: {proc.netOpeningAvailablePacks.toLocaleString('ru-RU')} компл., утверждённые PO: {proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} компл.).
            </div>
          )}
      </div>

      {/* =====================================================================
          СКРЫТАЯ ПО УМОЛЧАНИЮ ТАБЛИЦА НА 12 МЕСЯЦЕВ
         ===================================================================== */}
      <div className="rounded-[16px] border border-[#D8D7CE] bg-white px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-[#141413]">
            Помесячный баланс: остатки, выкупы и приходы по 12 месяцам (Янв–Дек 2027)
          </span>
          <button
            type="button"
            onClick={() => setShowMonthlyTable((v) => !v)}
            className="rounded-[8px] border border-[#D8D7CE] bg-[#F8F8F5] px-3 py-1.5 text-[12px] font-semibold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
          >
            {showMonthlyTable ? 'Скрыть таблицу 12 мес. ▴' : 'Показать таблицу 12 мес. ▾'}
          </button>
        </div>

        {showMonthlyTable && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-[#E2E1D8] bg-[#F8F8F5] text-[#686762]">
                  <th className="py-2 pr-3 pl-2 font-semibold">Показатель (компл.)</th>
                  {proc.monthlyBalance.map((r) => (
                    <th key={r.monthIdx} className="px-2 py-2 text-right font-mono font-semibold">
                      {r.monthLabel}
                    </th>
                  ))}
                  <th className="py-2 pr-2 pl-3 text-right font-mono font-bold text-[#141413]">
                    Год
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE9E2]">
                <tr>
                  <td className="py-2 pr-3 pl-2 font-medium text-[#52514C]">
                    Остаток на начало мес.
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td key={r.monthIdx} className="px-2 py-2 text-right font-mono text-[#52514C]">
                      {r.openingAvailablePacks.toLocaleString('ru-RU')}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-3 text-right font-mono font-semibold text-[#141413]">
                    {proc.netOpeningAvailablePacks.toLocaleString('ru-RU')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 pl-2 font-medium text-[#52514C]">
                    Подтверждённые приходы PO
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td
                      key={r.monthIdx}
                      className={`px-2 py-2 text-right font-mono ${
                        r.approvedReceiptsPacks > 0
                          ? 'font-bold text-[#157347]'
                          : 'text-[#A09F98]'
                      }`}
                    >
                      {r.approvedReceiptsPacks > 0
                        ? `+${r.approvedReceiptsPacks.toLocaleString('ru-RU')}`
                        : '0'}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-3 text-right font-mono font-bold text-[#157347]">
                    {proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 pl-2 font-semibold text-[#141413]">
                    План выкупов (продажи)
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td
                      key={r.monthIdx}
                      className="px-2 py-2 text-right font-mono font-semibold text-[#141413]"
                    >
                      {r.demandPacks.toLocaleString('ru-RU')}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-3 text-right font-mono font-bold text-[#141413]">
                    {proc.annualDemandPacks.toLocaleString('ru-RU')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 pl-2 font-medium text-[#52514C]">
                    Непокрытый дефицит без PO
                  </td>
                  {proc.monthlyBalance.map((r) => (
                    <td
                      key={r.monthIdx}
                      className={`px-2 py-2 text-right font-mono ${
                        r.deficitPacks > 0 ? 'font-bold text-amber-800' : 'text-[#A09F98]'
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
