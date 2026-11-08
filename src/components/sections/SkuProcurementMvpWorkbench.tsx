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
  serializeSingleBatchFactoryOrderDocumentCsv,
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

  const clearPeriodQtyOverrides = (
    periods?: CustomBatchPeriodDef[]
  ): CustomBatchPeriodDef[] | undefined => {
    if (!Array.isArray(periods) || periods.length === 0) return undefined;
    return periods.map((p) => ({
      ...p,
      customPacksQty: null,
      customSizeBreakdownPacks: null,
    }));
  };

  // Прямое изменение годового плана продаж модели прямо из контура «03 · Закупки» (пропорционально масштабирует 12 месяцев и сразу пересчитывает партии)
  const handleUpdateAnnualSalesPacks = (nextAnnualPacks: number) => {
    const cleanTarget = Math.max(0, Math.round(nextAnnualPacks));
    const currentPlan =
      model.plansByScenario[currentScenario.id] ||
      model.plansByScenario[1] || {
        scenarioId: currentScenario.id,
        monthlyPacks: Array(12).fill(0),
        monthlyPricesRub: Array(12).fill(model.retailPriceRub || 1990),
        monthlyReceiptsPacks: Array(12).fill(0),
        initialStockPacks: 0,
        firstOrderPacks: 0,
        nextOrderDateLabel: '',
        salesStartMonthIdx: 0,
        warehouseArrivalMonthIdx: 0,
        warehouseArrivalDateLabel: '',
      };

    const existingMonths = currentPlan.monthlyPacks || Array(12).fill(0);
    const currentSum = existingMonths.reduce((s, v) => s + Math.max(0, v || 0), 0);

    let nextMonthlyPacks: number[];
    if (cleanTarget === 0) {
      nextMonthlyPacks = Array(12).fill(0);
    } else if (currentSum > 0) {
      const exacts = existingMonths.map((v) => (Math.max(0, v || 0) / currentSum) * cleanTarget);
      const floored = exacts.map((x) => Math.floor(x));
      let rem = cleanTarget - floored.reduce((s, v) => s + v, 0);
      const order = exacts
        .map((x, idx) => ({ idx, frac: x - Math.floor(x) }))
        .sort((a, b) => b.frac - a.frac);
      for (let i = 0; i < order.length && rem > 0; i++) {
        floored[order[i].idx] += 1;
        rem -= 1;
      }
      nextMonthlyPacks = floored;
    } else {
      const base = Math.floor(cleanTarget / 12);
      let rem = cleanTarget - base * 12;
      nextMonthlyPacks = Array.from({ length: 12 }, () => {
        const add = rem > 0 ? 1 : 0;
        if (rem > 0) rem -= 1;
        return base + add;
      });
    }

    onUpdateModel({
      ...model,
      plansByScenario: {
        ...model.plansByScenario,
        [currentScenario.id]: {
          ...currentPlan,
          scenarioId: currentScenario.id,
          monthlyPacks: nextMonthlyPacks,
        },
      },
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          customBatchPeriods: clearPeriodQtyOverrides(fp.customBatchPeriods),
        },
      },
    });
    triggerSavedIndicator('Пересчитано от продаж');
  };

  const handleUpdatePrepaymentPct = (nextPct: number) => {
    const cleanPct = Math.max(0, Math.min(100, Math.round(nextPct)));
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          prepaymentPct: cleanPct,
          balancePaymentPct: 100 - cleanPct,
        },
      },
    });
    triggerSavedIndicator('Сохранено');
  };

  const handleUpdateOpeningStock = (nextPacks: number) => {
    const clean = Math.max(0, Math.round(nextPacks));
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        actualOpeningStockPacks: clean,
        factoryParams: {
          ...fp,
          customBatchPeriods: clearPeriodQtyOverrides(fp.customBatchPeriods),
        },
      },
    });
    triggerSavedIndicator('Пересчитано');
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
    const nextStageStatus =
      nextStage === 'hypothesis'
        ? 'Идея'
        : nextStage === 'test'
          ? 'Тест'
          : 'Масштабирование';
    const nextLaunchStatus =
      nextStage === 'scaling'
        ? 'Утверждено'
        : nextStage === 'test'
          ? 'В разработке'
          : 'В плане';
    onUpdateModel({
      ...model,
      modelStageStatus: nextStageStatus,
      launchStatus: nextLaunchStatus,
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
          customBatchPeriods: clearPeriodQtyOverrides(fp.customBatchPeriods),
        },
      },
    });
    triggerSavedIndicator('Пересчитано');
  };

  const handleUpdatePackMultiple = (nextMultiple: number) => {
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          packMultiple: Math.max(1, Math.round(nextMultiple)),
          customBatchPeriods: clearPeriodQtyOverrides(fp.customBatchPeriods),
        },
      },
    });
    triggerSavedIndicator('Пересчитано');
  };

  const handleUpdateSafetyDays = (nextDays: number) => {
    onUpdateModel({
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        factoryParams: {
          ...fp,
          safetyStockDays: Math.max(0, Math.round(nextDays)),
          customBatchPeriods: clearPeriodQtyOverrides(fp.customBatchPeriods),
        },
      },
    });
    triggerSavedIndicator('Пересчитано');
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

  // Редактирование объёма конкретной партии с автоматическим пересчётом последующих партий по остаточной потребности плана продаж
  const handleUpdateDraftBatchPacks = (periodId: string, nextPacks: number) => {
    const cleanVal = Math.max(1, Math.round(nextPacks));
    const targetIdx = activePeriods.findIndex((p) => p.id === periodId);
    const nextPeriods = activePeriods.map((p, idx) => {
      if (p.id === periodId) {
        return {
          ...p,
          customPacksQty: cleanVal,
          customSizeBreakdownPacks: null,
          scenarioId: currentScenario.id,
        };
      }
      // Сбрасываем ручной замок на последующих партиях, чтобы они автоматически пересчитались под годовую потребность!
      if (targetIdx >= 0 && idx > targetIdx) {
        return {
          ...p,
          customPacksQty: null,
          customSizeBreakdownPacks: null,
        };
      }
      return p;
    });

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
    triggerSavedIndicator('Партии пересчитаны');
  };
  const updateDraftPeriodDef = (
    periodId: string,
    updater: (prev: CustomBatchPeriodDef) => CustomBatchPeriodDef
  ) => {
    const nextPeriods = activePeriods.map((p) =>
      p.id === periodId ? { ...updater(p), scenarioId: currentScenario.id } : p
    );
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

  const modelAnnualRevenueRub = useMemo(() => {
    const plan = model.plansByScenario[currentScenario.id] || model.plansByScenario[1];
    if (!plan) return proc.annualDemandPacks * (model.retailPriceRub || 0);
    return plan.monthlyPacks.reduce((sum, packs, mIdx) => {
      const price = plan.monthlyPricesRub?.[mIdx] || model.retailPriceRub || 0;
      return sum + Math.max(0, packs || 0) * price;
    }, 0);
  }, [model, currentScenario.id, proc.annualDemandPacks]);

  const approvedTotalRub = useMemo(
    () =>
      proc.approvedOrders
        .filter((o) => o.confirmedByFactory !== false)
        .reduce((s, o) => s + o.totalOrderRub, 0),
    [proc.approvedOrders]
  );

  const totalModelSupplyPacks = proc.totalApprovedReceiptsPacks + proc.totalRecommendedPacks;
  const totalModelSupplyUnits = proc.totalApprovedReceiptsUnits + proc.totalRecommendedUnits;
  const totalModelSupplyBudgetRub =
    approvedTotalRub + (proc.totalRecommendedBudgetRub || 0);

  // Первая стартовая партия (Партия №1 · Q1) — сколько денег нужно вложить сразу для старта модели
  const firstStartWave = useMemo(() => {
    const firstDraft = proc.recommendedBatches[0];
    const earliestPo = sortedApprovedOrders.find((o) => o.confirmedByFactory !== false);
    const prepayPct = fp.prepaymentPct ?? 30;

    if (
      earliestPo &&
      (!firstDraft || earliestPo.arrivalMonthIdx <= firstDraft.firstCoveredMonthIdx)
    ) {
      const totalRub = earliestPo.totalOrderRub;
      const prepayRub = Math.round((totalRub * prepayPct) / 100);
      return {
        label: earliestPo.coverageMonthsLabel || `${MONTHS_SHORT[earliestPo.arrivalMonthIdx]} 2027`,
        packs: earliestPo.packsQty,
        units: earliestPo.packsQty * earliestPo.unitsInPack,
        totalRub,
        prepayRub,
        balanceRub: totalRub - prepayRub,
        orderDateIso: earliestPo.orderPlacementDateIso,
        isApprovedPo: true,
      };
    }

    if (firstDraft) {
      return {
        label: firstDraft.coverageMonthsLabel,
        packs: firstDraft.recommendedPacks,
        units: firstDraft.physicalUnitsQty,
        totalRub: firstDraft.estimatedTotalRub,
        prepayRub: firstDraft.prepaymentRub,
        balanceRub: firstDraft.balancePaymentRub,
        orderDateIso: firstDraft.recommendedOrderDateIso,
        isApprovedPo: false,
      };
    }

    return {
      label: 'Янв–Мар 2027',
      packs: 0,
      units: 0,
      totalRub: 0,
      prepayRub: 0,
      balanceRub: 0,
      orderDateIso: '',
      isApprovedPo: false,
    };
  }, [proc.recommendedBatches, sortedApprovedOrders, fp.prepaymentPct]);

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

  const handleExportSingleOrderCsv = (
    batchOrOrder: RecommendedProcurementBatch | ApprovedPurchaseOrder,
    fileSuffix: string
  ) => {
    const csv = serializeSingleBatchFactoryOrderDocumentCsv(model, batchOrOrder);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Zakaz_Fabrike_${model.code}_${fileSuffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    triggerSavedIndicator('Выгружен заказ фабрике');
  };

  return (
    <div className="space-y-4">
      {/* =====================================================================
          БЛОК 1 · ПАСПОРТ ЗАКУПКИ МОДЕЛИ В СТИЛЕ PEAKLY (Без вложенных цветных рамок и лишнего шума)
         ===================================================================== */}
      <div className="rounded-[16px] border border-[#D8D7CE] bg-white overflow-hidden shadow-[0_1px_3px_rgba(20,20,19,0.03)]">
        {/* Шапка карточки: Выбор модели слева + Статус + Кнопка «Параметры и размеры ▾» справа */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE9E2] bg-[#FAF9F6] px-5 py-3">
          {headerLeftSlot ? (
            <div className="flex-1 min-w-[280px]">{headerLeftSlot}</div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-[16px] font-bold text-[#141413]">
                {model.title}
              </h3>
              <span className="rounded-md border border-[#DFDED6] bg-white px-2.5 py-0.5 font-mono text-[11.5px] font-semibold text-[#52514C]">
                {model.code} · {model.unitsInPack} изд./компл.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
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

            <button
              type="button"
              onClick={() => setShowAdvancedSettings((v) => !v)}
              className={`h-8 inline-flex items-center gap-1.5 rounded-[8px] border px-3 text-[11.5px] font-semibold transition cursor-pointer ${
                showAdvancedSettings
                  ? 'border-[#B8B7AE] bg-[#EFEFE9] text-[#141413]'
                  : 'border-[#D8D7CE] bg-white text-[#141413] hover:bg-[#F4F3EE]'
              }`}
              title="Открыть себестоимость, остаток на складе, аванс, цикл поставки и размерную сетку S–XXL"
            >
              <span>Параметры:</span>
              <span className="font-mono font-bold">
                {model.unitCostRub || 0} ₽ · {proc.totalLeadDays} дн. · S–XXL
              </span>
              <span className="text-[10px] text-[#686762]">
                {showAdvancedSettings ? '▴' : '▾'}
              </span>
            </button>

            <span className="inline-flex items-center gap-1 rounded-[7px] bg-[#EAF6F0] px-2.5 py-1 text-[11px] font-semibold text-[#157347]">
              <span>✓</span>
              <span>{savedStamp}</span>
            </span>
          </div>
        </div>

        {/* 4 ПОКАЗАТЕЛЯ МОДЕЛИ В ЕДИНОЙ PEAKLY-ПОЛОСЕ (Чистый белый фон с тонкими разделителями divide-x без рамок в рамках) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#EAE9E2] bg-white">
          {/* 1. План продаж (год) */}
          <div className="px-5 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                План продаж (год)
              </span>
              {onOpenSalesMatrix && (
                <button
                  type="button"
                  onClick={onOpenSalesMatrix}
                  className="text-[11px] font-semibold text-[#141413] hover:underline cursor-pointer"
                >
                  По месяцам →
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="inline-flex items-center rounded-[8px] border border-[#E2E1D9] bg-[#FAF9F6] p-0.5 hover:border-[#C8C7BE]">
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateAnnualSalesPacks(Math.max(0, proc.annualDemandPacks - 500))
                  }
                  className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#686762] hover:bg-white hover:text-[#141413] cursor-pointer"
                  title="Уменьшить годовой план продаж на 500 компл."
                >
                  −
                </button>
                <NumericInput
                  ariaLabel="Годовой план продаж модели, комплектов"
                  value={proc.annualDemandPacks}
                  min={0}
                  step={500}
                  onChangeValue={handleUpdateAnnualSalesPacks}
                  className="h-7 w-24 text-center font-mono text-[17px] font-extrabold text-[#141413] bg-transparent focus:bg-white focus:outline-none rounded-[5px]"
                />
                <button
                  type="button"
                  onClick={() => handleUpdateAnnualSalesPacks(proc.annualDemandPacks + 500)}
                  className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#686762] hover:bg-white hover:text-[#141413] cursor-pointer"
                  title="Увеличить годовой план продаж на 500 компл."
                >
                  +
                </button>
              </div>
              <span className="text-[12px] font-semibold text-[#686762]">компл.</span>
            </div>
            <div className="mt-1.5 text-[11.5px] text-[#686762]">
              Выручка: <strong className="text-[#141413]">{formatRubMillions(modelAnnualRevenueRub)}</strong> · {proc.annualDemandUnits.toLocaleString('ru-RU')} изд.
            </div>
          </div>

          {/* 2. К заказу на фабрике */}
          <div className="px-5 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                К заказу на фабрике
              </span>
              {proc.approvedOrders.length > 0 ? (
                <button
                  type="button"
                  onClick={handleResetAllApprovedOrders}
                  className="text-[11px] font-semibold text-rose-700 hover:underline cursor-pointer"
                >
                  Сбросить PO ({proc.approvedOrders.length}) ↺
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings((v) => !v)}
                  className="text-[11px] font-medium text-[#686762] hover:text-[#141413] cursor-pointer"
                >
                  Склад: {proc.netOpeningAvailablePacks.toLocaleString('ru-RU')}
                </button>
              )}
            </div>
            <div className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] text-[#141413]">
              {totalModelSupplyPacks.toLocaleString('ru-RU')} компл.
            </div>
            <div className="mt-1.5 text-[11.5px] text-[#686762]">
              {totalModelSupplyUnits.toLocaleString('ru-RU')} изд. · {proc.recommendedBatches.length} план. парт.
              {proc.totalApprovedReceiptsPacks > 0
                ? ` · Утв.: ${proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')}`
                : ''}
            </div>
          </div>

          {/* 3. Вложить на старт (Партия №1) */}
          <div className="px-5 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                Вложить на старт (Партия №1)
              </span>
              <span className="rounded-md bg-[#EAF6F0] px-2 py-0.5 text-[10px] font-bold text-[#146C43]">
                {firstStartWave.label}
              </span>
            </div>
            <div className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] text-[#157347]">
              {formatRubMillions(firstStartWave.totalRub)}
            </div>
            <div className="mt-1.5 text-[11.5px] text-[#686762]">
              Аванс {fp.prepaymentPct}% сейчас: <strong className="text-[#141413]">{formatRubMillions(firstStartWave.prepayRub)}</strong> · {firstStartWave.packs.toLocaleString('ru-RU')} компл.
            </div>
          </div>

          {/* 4. Бюджет закупок (год) */}
          <div className="px-5 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                Бюджет закупок (год)
              </span>
              <span className="font-mono text-[10.5px] font-semibold text-[#686762]">
                {modelAnnualRevenueRub > 0
                  ? `${((totalModelSupplyBudgetRub / modelAnnualRevenueRub) * 100)
                      .toFixed(1)
                      .replace('.', ',')}% от выр.`
                  : ''}
              </span>
            </div>
            <div className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] text-[#141413]">
              {model.unitCostRub > 0
                ? formatRubMillions(totalModelSupplyBudgetRub)
                : 'Укажите себест.'}
            </div>
            <div className="mt-1.5 text-[11.5px] text-[#686762]">
              По <button type="button" onClick={() => setShowAdvancedSettings((v) => !v)} className="font-semibold text-[#141413] underline decoration-[#C8C7BE] hover:decoration-[#141413] cursor-pointer">{model.unitCostRub} ₽/компл.</button> · Q2–Q4 из оборота WB
            </div>
          </div>
        </div>

        {/* РАСКРЫВАЮЩИЙСЯ БЛОК ПАРАМЕТРОВ МОДЕЛИ И РАЗМЕРОВ S–XXL (Упакован по кнопке «Параметры ▾», чтобы не засорять экран!) */}
        {showAdvancedSettings && (
          <div className="border-t border-[#EAE9E2] bg-[#FAF9F6] px-5 py-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold text-[#141413]">
                Параметры закупки, производства и размерная сетка S–XXL
              </span>
              <button
                type="button"
                onClick={() => setShowAdvancedSettings(false)}
                className="text-[11.5px] font-semibold text-[#686762] hover:text-[#141413] cursor-pointer"
              >
                Скрыть параметры ▴
              </button>
            </div>

            {/* 7 компактных полей параметров в одну чистую сетку */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              <label className="flex flex-col justify-between rounded-[9px] border border-[#DEDDD5] bg-white px-3 py-2">
                <span className="text-[10.5px] font-semibold text-[#686762]">
                  Себестоимость
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <NumericInput
                    ariaLabel="Себестоимость комплекта, рублей"
                    value={model.unitCostRub || 0}
                    min={0}
                    step={10}
                    onChangeValue={handleUpdateUnitCost}
                    className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                  />
                  <span className="text-[10.5px] text-[#686762]">₽</span>
                </div>
              </label>

              <label className="flex flex-col justify-between rounded-[9px] border border-[#DEDDD5] bg-white px-3 py-2">
                <span className="text-[10.5px] font-semibold text-[#686762]">
                  Остаток сейчас
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <NumericInput
                    ariaLabel="Начальный остаток, комплектов"
                    value={shared.actualOpeningStockPacks}
                    min={0}
                    step={50}
                    onChangeValue={handleUpdateOpeningStock}
                    className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#686762]">компл.</span>
                </div>
              </label>

              <label className="flex flex-col justify-between rounded-[9px] border border-[#DEDDD5] bg-white px-3 py-2">
                <span className="text-[10.5px] font-semibold text-[#686762]">
                  Аванс фабрике
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <NumericInput
                    ariaLabel="Аванс фабрике, %"
                    value={fp.prepaymentPct}
                    min={0}
                    max={100}
                    step={5}
                    onChangeValue={handleUpdatePrepaymentPct}
                    className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                  />
                  <span className="text-[10.5px] text-[#686762]">%</span>
                </div>
              </label>

              <label className="flex flex-col justify-between rounded-[9px] border border-[#DEDDD5] bg-white px-3 py-2">
                <span className="text-[10.5px] font-semibold text-[#686762]">
                  Цикл поставки
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <NumericInput
                    ariaLabel="Полный цикл производства и доставки, дней"
                    value={proc.totalLeadDays}
                    min={1}
                    max={365}
                    step={5}
                    onChangeValue={handleUpdateTotalLeadDays}
                    className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                  />
                  <span className="text-[10.5px] text-[#686762]">дн.</span>
                </div>
              </label>

              <label className="flex flex-col justify-between rounded-[9px] border border-[#DEDDD5] bg-white px-3 py-2">
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

              <label className="flex flex-col justify-between rounded-[9px] border border-[#DEDDD5] bg-white px-3 py-2">
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

              <label className="flex flex-col justify-between rounded-[9px] border border-[#DEDDD5] bg-white px-3 py-2">
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
                  <span className="text-[10.5px] text-[#686762]">дн.</span>
                </div>
              </label>
            </div>

            {/* Пропорция размеров S-XXL */}
            <div className="rounded-[10px] border border-[#E4E3DC] bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11.5px] font-semibold text-[#141413]">
                  Базовая пропорция размеров S–XXL (применяется ко всем партиям модели, сумма = 100%)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateModel({
                        ...model,
                        sharedSupplyAndFact: {
                          ...shared,
                          factoryParams: {
                            ...fp,
                            sizeSharesPct: { S: 12, M: 26, L: 30, XL: 20, XXL: 12 },
                          },
                        },
                      });
                      triggerSavedIndicator('Матрица 12/26/30/20/12%');
                    }}
                    className="rounded border border-[#CFCEC6] bg-[#FAF9F6] px-2 py-0.5 text-[10.5px] font-semibold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
                  >
                    Эталон 12/26/30/20/12%
                  </button>
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                      sizeShareSum === 100
                        ? 'bg-[#EAF6F0] text-[#146C43]'
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
                    className="flex items-center justify-between rounded-[8px] border border-[#DEDDD5] bg-[#FAF9F6] px-3 py-1.5"
                  >
                    <span className="text-[11.5px] font-bold text-[#141413]">{sz}</span>
                    <div className="inline-flex items-center gap-1">
                      <NumericInput
                        ariaLabel={`Доля размера ${sz}, %`}
                        value={fp.sizeSharesPct[sz] ?? 20}
                        min={0}
                        max={100}
                        onChangeValue={(val) => handleUpdateModelSizeShare(sz, val)}
                        className="w-12 text-right font-mono text-[13.5px] font-bold text-[#141413] bg-transparent focus:outline-none"
                      />
                      <span className="text-[11px] text-[#686762]">%</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          БЛОК 2 · ГРАФИК ПАРТИЙ К ЗАКАЗУ (Чистые строки в стиле Peakly, детали внутри «Размеры и расчёт ▾»)
         ===================================================================== */}
      <div className="rounded-[16px] border border-[#D8D7CE] bg-white p-5 shadow-[0_1px_3px_rgba(20,20,19,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5">
          <div>
            <h4 className="text-[15.5px] font-bold text-[#141413]">
              Партии к заказу по кварталам ({proc.recommendedBatches.length} план · {proc.approvedOrders.length} утв. PO)
            </h4>
            <p className="mt-0.5 text-[12px] text-[#686762]">
              Нажмите на любую партию или «Размеры и расчёт ▾», чтобы открыть размерную сетку S–XXL, формулу и даты.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {fp.customBatchPeriods && (
              <button
                type="button"
                onClick={handleResetToDefaultQuarters}
                className="h-8 rounded-[8px] border border-[#D8D7CE] bg-[#FAF9F6] px-2.5 text-[11.5px] font-semibold text-[#686762] hover:text-[#141413] cursor-pointer"
                title="Сбросить ручные правки партий и пересчитать 4 стандартных квартала по плану продаж"
              >
                ↺ По формуле (4 кварт.)
              </button>
            )}
            {proc.approvedOrders.length > 0 && (
              <button
                type="button"
                onClick={handleResetAllApprovedOrders}
                className="h-8 rounded-[8px] border border-rose-200 bg-rose-50 px-2.5 text-[11.5px] font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer"
              >
                ↺ Вернуть PO в черновик ({proc.approvedOrders.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddCustomModal((v) => !v)}
              className="h-8 rounded-[8px] border border-[#D8D7CE] bg-white px-3 text-[12px] font-semibold text-[#141413] hover:bg-[#FAF9F6] cursor-pointer"
            >
              + Своя партия
            </button>
            {proc.recommendedBatches.length > 0 && (
              <button
                type="button"
                onClick={handleApproveAllDraftBatches}
                className="h-8 rounded-[8px] border border-[#BCE3CF] bg-[#EAF6F0] px-3.5 text-[12px] font-semibold text-[#146C43] hover:bg-[#157347] hover:text-white transition cursor-pointer"
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

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleExportSingleOrderCsv(po, po.orderNumber)}
                            className="rounded-md border border-[#CFCEC6] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#141413] hover:bg-[#FAF9F6] cursor-pointer"
                          >
                            Экспорт заказа фабрике (CSV)
                          </button>
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ЧИСТАЯ 5-КОЛОНОЧНАЯ ТАБЛИЦА КВАРТАЛЬНЫХ ПАРТИЙ В СТИЛЕ PEAKLY (Без лишних выпадающих списков и календарей в закрытой строке — всё управление датами и размерами внутри «Размеры и расчёт ▾») */}
        {proc.recommendedBatches.length > 0 && (
          <div className="overflow-x-auto rounded-[12px] border border-[#E2E1D8]">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E2E1D8] bg-[#FAF9F6] text-[10.5px] font-bold uppercase tracking-wider text-[#686762]">
                  <th className="py-2.5 pl-4 pr-3">Партия и покрытие</th>
                  <th className="px-3 py-2.5 text-right">План продаж</th>
                  <th className="px-3 py-2.5 text-right">К заказу (компл.)</th>
                  <th className="px-3 py-2.5 text-right">Сумма и аванс</th>
                  <th className="py-2.5 pr-4 pl-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE9E2]">
                {proc.recommendedBatches.map((batch, bIdx) => {
                  const rowKey = `draft-${batch.periodId}`;
                  const isExpanded = activeExpandedKey === rowKey;
                  const isFirstStartBatch = bIdx === 0 && proc.approvedOrders.length === 0;
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
                          isExpanded
                            ? 'bg-[#F8F8F4]'
                            : 'bg-white hover:bg-[#FAF9F6]'
                        }`}
                      >
                        {/* 1. Партия, спокойный бейдж, период и даты чистым текстом */}
                        <td className="py-3.5 pl-4 pr-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                                isFirstStartBatch
                                  ? 'bg-[#EAF6F0] text-[#146C43] border border-[#BCE3CF]'
                                  : 'bg-[#F4F3EE] text-[#52514C] border border-[#E2E1D9]'
                              }`}
                            >
                              {bIdx + 1}
                            </span>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[13.5px] font-bold text-[#141413]">
                                  Партия №{bIdx + 1} · {batch.coverageMonthsLabel}
                                </span>
                                {isFirstStartBatch ? (
                                  <span className="rounded-md bg-[#EAF6F0] px-2 py-0.5 text-[10px] font-bold text-[#146C43]">
                                    Старт Q1
                                  </span>
                                ) : (
                                  <span className="rounded-md bg-[#F4F3EE] px-2 py-0.5 text-[10px] font-medium text-[#686762]">
                                    Из оборота
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11.5px] text-[#686762]">
                                Заказать до <strong className="font-semibold text-[#52514C]">{formatHumanDateRu(batch.recommendedOrderDateIso)}</strong> · приход к {formatHumanDateRu(batch.requiredArrivalDateIso)}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. План продаж периода */}
                        <td className="px-3 py-3.5 text-right">
                          <div className="font-mono text-[13.5px] font-semibold text-[#52514C]">
                            {batch.periodDemandPacks.toLocaleString('ru-RU')} компл.
                          </div>
                        </td>

                        {/* 3. К заказу — чистое инлайн-редактирование объёма */}
                        <td
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-3.5 text-right"
                        >
                          <div className="inline-flex flex-col items-end">
                            <div className="inline-flex items-center rounded-[8px] border border-[#E2E1D9] bg-[#FAF9F6] p-0.5 hover:border-[#C8C7BE] focus-within:border-[#9E9D95] focus-within:bg-white">
                              <button
                                type="button"
                                onClick={() => {
                                  const step = fp.packMultiple || 50;
                                  const nextVal = Math.max(step, batch.recommendedPacks - step);
                                  handleUpdateDraftBatchPacks(batch.periodId, nextVal);
                                }}
                                className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#686762] hover:bg-white hover:text-[#141413] cursor-pointer"
                                title="Уменьшить количество (остаток перейдёт в следующую партию)"
                              >
                                −
                              </button>
                              <NumericInput
                                ariaLabel={`Количество комплектов к заказу в партии №${bIdx + 1}`}
                                value={batch.recommendedPacks}
                                min={1}
                                step={fp.packMultiple || 50}
                                onChangeValue={(val) =>
                                  handleUpdateDraftBatchPacks(batch.periodId, val)
                                }
                                className="h-7 w-20 text-center font-mono text-[13.5px] font-bold text-[#141413] bg-transparent focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const step = fp.packMultiple || 50;
                                  const nextVal = batch.recommendedPacks + step;
                                  handleUpdateDraftBatchPacks(batch.periodId, nextVal);
                                }}
                                className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#686762] hover:bg-white hover:text-[#141413] cursor-pointer"
                                title="Увеличить количество (следующая партия уменьшится на эту разницу)"
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
                                  ↺ сброс
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 4. Сумма партии и аванс */}
                        <td className="px-3 py-3.5 text-right">
                          <div
                            className={`font-mono text-[15px] font-extrabold ${
                              isFirstStartBatch ? 'text-[#157347]' : 'text-[#141413]'
                            }`}
                          >
                            {formatRubMillions(batch.estimatedTotalRub)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#686762]">
                            Аванс {fp.prepaymentPct}%: <span className="font-semibold text-[#52514C]">{formatRubMillions(batch.prepaymentRub)}</span>
                          </div>
                        </td>

                        {/* 5. Размеры S–XXL и утверждение */}
                        <td
                          onClick={(e) => e.stopPropagation()}
                          className="py-3.5 pr-4 pl-3 text-right"
                        >
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                              className={`h-8 rounded-[7px] border px-2.5 text-[11.5px] font-semibold transition cursor-pointer ${
                                isExpanded
                                  ? 'border-[#B8B7AE] bg-[#EAE9E2] text-[#141413]'
                                  : 'border-[#D8D7CE] bg-white text-[#141413] hover:bg-[#F4F3EE]'
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

                      {/* Раскрываемая детализация партии: выбор дат, периода, формула расчёта и интерактивная размерная сетка S–XXL */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-[#FAF9F5] px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
                              {/* Выбор периода покрытия и даты заказа внутри раскрытой карточки */}
                              <div className="flex flex-wrap items-center gap-3 text-[12px]">
                                <span className="font-bold text-[#141413]">
                                  Партия №{bIdx + 1}:
                                </span>

                                <label className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#D8D7CE] bg-white px-2.5 py-1">
                                  <span className="text-[#686762]">Покрытие:</span>
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
                                    className="font-bold text-[#141413] bg-transparent focus:outline-none cursor-pointer"
                                  >
                                    {MONTHS_SHORT.map((m, idx) => (
                                      <option key={m} value={idx}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                  <span className="text-[#686762]">–</span>
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
                                    className="font-bold text-[#141413] bg-transparent focus:outline-none cursor-pointer"
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

                                <label className="inline-flex items-center gap-1.5 rounded-[7px] border border-[#D8D7CE] bg-white px-2.5 py-1">
                                  <span className="text-[#686762]">Заказать до:</span>
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
                                    className="font-mono text-[11.5px] font-semibold text-[#141413] bg-transparent focus:outline-none"
                                  />
                                </label>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {canMergeNext && (
                                  <button
                                    type="button"
                                    onClick={() => handleMergeWithNextPeriod(batch.periodId)}
                                    className="rounded-[7px] border border-[#CFCEC6] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#141413] hover:bg-[#F4F3EE] cursor-pointer"
                                  >
                                    Объединить со следующей
                                  </button>
                                )}
                                {canSplit && (
                                  <button
                                    type="button"
                                    onClick={() => handleSplitPeriod(batch.periodId)}
                                    className="rounded-[7px] border border-[#CFCEC6] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#141413] hover:bg-[#F4F3EE] cursor-pointer"
                                  >
                                    Разделить на две
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
                                    ↺ Сбросить правки
                                  </button>
                                )}
                                {activePeriods.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDraftPeriod(batch.periodId)}
                                    className="rounded-[7px] border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11.5px] font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer"
                                  >
                                    Удалить
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
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleExportSingleOrderCsv(batch, `Partiya_${bIdx + 1}`)
                                    }
                                    className="rounded border border-[#CFCEC6] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer"
                                  >
                                    Экспорт заказа фабрике (CSV)
                                  </button>
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
                              </div>

                              <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px]">
                                {SIZES_LIST.map((sz) => {
                                  const packsForSize = batch.sizeBreakdownPacks[sz] || 0;
                                  const unitsForSize = packsForSize * model.unitsInPack;
                                  return (
                                    <div
                                      key={sz}
                                      className="flex flex-col justify-between rounded-[8px] border border-[#CFCEC6] bg-[#FAF9F6] px-2.5 py-2 hover:border-[#B8B7AE] focus-within:border-[#9E9D95] focus-within:bg-white"
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
                                            className="w-9 rounded border border-[#DFDED6] bg-white px-1 py-0.5 text-right font-mono text-[10.5px] font-semibold text-[#52514C] focus:border-[#9E9D95] focus:outline-none"
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
                                          className="w-full rounded border border-[#D8D7CE] bg-white py-1 text-center font-mono text-[13.5px] font-bold text-[#141413] focus:border-[#9E9D95] focus:outline-none"
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
                <tr className="border-t border-[#E2E1D8] bg-[#FAF9F6] text-[12px] font-bold text-[#141413]">
                  <td className="py-3 pl-4 pr-3">
                    <span>Итого по модели ({proc.recommendedBatches.length} парт.)</span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[#686762]">
                    {proc.annualDemandPacks.toLocaleString('ru-RU')} компл.
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {proc.totalRecommendedPacks.toLocaleString('ru-RU')} компл.{' '}
                    <span className="text-[11px] font-normal text-[#686762]">
                      ({proc.totalRecommendedUnits.toLocaleString('ru-RU')} изд.)
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {proc.totalRecommendedBudgetRub !== null
                      ? formatRubMillions(proc.totalRecommendedBudgetRub)
                      : '—'}
                  </td>
                  <td className="py-3 pr-4 pl-3 text-right text-[11px] font-semibold text-[#146C43]">
                    Старт Q1: {formatRubMillions(firstStartWave.totalRub)} (аванс {formatRubMillions(firstStartWave.prepayRub)})
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
