'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  GrowthScenarioDef,
  MONTHS_SHORT_RU,
  ScenarioModelSpec,
  computeModelScenarioMetrics,
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
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  getBrandUnitConfig,
  normalizePortfolioBrandCode,
  recalculateDraftProcurementPlan,
  removeApprovedPurchaseOrder,
  serializeSingleBatchFactoryOrderDocumentCsv,
  toggleModelProcurementByOrders,
  updateApprovedPurchaseOrder,
  updateModelBuyoutRatePct,
  updateModelSizeVariantUnitCost,
  updateModelUnitCostWithVariants,
} from '@/lib/unifiedBusinessEngine';
import { getBrandProductionProfile } from '@/lib/brandProductionConfig';
import { usePlatform } from '@/context/PlatformContext';
import {
  canUserEditBrand,
  canUserViewCostPrice,
  canUserViewFinance,
} from '@/lib/finance';

function getModelUnitLabels(model: ScenarioModelSpec): {
  primaryShort: string;
  secondaryShort: string;
} {
  const cfg = getBrandUnitConfig(model);
  return {
    primaryShort: model.primaryUnitLabel || cfg.primaryUnit || 'компл.',
    secondaryShort: model.secondaryUnitLabel || cfg.secondaryUnit || 'изд.',
  };
}

function allocateAcrossProfileSizes(
  totalPacks: number,
  sizes: string[],
  sharesPct: Record<string, number>
): Record<string, number> {
  const cleanTotal = Math.max(0, Math.round(totalPacks || 0));
  const out: Record<string, number> = {};
  if (sizes.length === 0) return out;
  const weights = sizes.map((sz) => Math.max(0, Number(sharesPct[sz]) || 0));
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const exacts = sizes.map((_, idx) =>
    weightSum > 0 ? (cleanTotal * weights[idx]) / weightSum : cleanTotal / sizes.length
  );
  const floored = exacts.map((v) => Math.floor(v));
  let rem = cleanTotal - floored.reduce((s, v) => s + v, 0);
  const order = exacts
    .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < order.length && rem > 0; i++) {
    floored[order[i].idx] += 1;
    rem -= 1;
  }
  sizes.forEach((sz, idx) => {
    out[sz] = floored[idx] || 0;
  });
  return out;
}

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
  disabled?: boolean;
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
  disabled = false,
}: NumericInputProps) {
  const [draft, setDraft] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(value));
      setDirty(false);
    }
  }, [value, focused]);

  const commit = (raw: string) => {
    if (disabled) {
      setDraft(String(value));
      setDirty(false);
      return;
    }
    if (!dirty) {
      setDraft(String(value));
      return;
    }
    const cleaned = raw.replace(/\s+/g, '').replace(',', '.');
    if (cleaned === '' || cleaned === '-') {
      setDraft(String(value));
      setDirty(false);
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      setDirty(false);
      return;
    }
    let clamped = Math.max(min, Math.round(parsed));
    if (typeof max === 'number') {
      clamped = Math.min(max, clamped);
    }
    setDraft(String(clamped));
    setDirty(false);
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
      disabled={disabled}
      onFocus={() => {
        if (!disabled) setFocused(true);
      }}
      onChange={(e) => {
        if (disabled) return;
        let nextRaw = e.target.value;
        if (!/^[0-9\s.,]*$/.test(nextRaw)) return;
        if (nextRaw.length > 1 && /^0+\d/.test(nextRaw.trim())) {
          nextRaw = nextRaw.trim().replace(/^0+(?=\d)/, '');
        }
        setDraft(nextRaw);
        setDirty(true);
      }}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(String(value));
          setDirty(false);
          e.currentTarget.blur();
        }
      }}
      className={`${className} disabled:opacity-60 disabled:cursor-not-allowed`}
    />
  );
}

export interface SkuProcurementMvpWorkbenchProps {
  model: ScenarioModelSpec;
  scenario?: GrowthScenarioDef;
  currentScenario?: GrowthScenarioDef;
  onUpdateModel: (updated: ScenarioModelSpec) => void;
  onNotify?: (title: string, message: string, type?: 'success' | 'warning' | 'error') => void;
  onOpenSalesMatrix?: () => void;
  headerLeftSlot?: React.ReactNode;
}

export function SkuProcurementMvpWorkbench({
  model: rawModel,
  scenario: scenarioProp,
  currentScenario: currentScenarioProp,
  onUpdateModel,
  onNotify,
  onOpenSalesMatrix,
  headerLeftSlot,
}: SkuProcurementMvpWorkbenchProps) {
  const { currentUser } = usePlatform();
  const currentScenario = (scenarioProp || currentScenarioProp)!;
  const model = useMemo(() => ensureModelUnifiedV11(rawModel), [rawModel]);
  const unitLabels = useMemo(() => getModelUnitLabels(model), [model]);
  const hasDistinctSecondaryUnit = !(
    model.unitsInPack === 1 && unitLabels.primaryShort === unitLabels.secondaryShort
  );
  const modelBrandCode = useMemo(
    () =>
      normalizePortfolioBrandCode(
        detectModelBrandPortfolioLabel(model) || model.brandId || 'BORNERS'
      ),
    [model]
  );
  const hasCost = canUserViewCostPrice(currentUser);
  const hasFinance = canUserViewFinance(currentUser);
  const canEdit = canUserEditBrand(
    currentUser,
    modelBrandCode === 'ALL' ? 'BORNERS' : modelBrandCode
  );
  const auditAuthor = currentUser?.fullName || 'Владелец';

  const brandProdProfile = useMemo(
    () =>
      getBrandProductionProfile(
        detectModelBrandPortfolioLabel(model) || model.brandId,
        `${model.title || ''} ${model.categoryLabel || ''} ${model.construction?.fit || ''} ${model.waistband?.width || ''}`
      ),
    [model]
  );
  const shared = model.sharedSupplyAndFact!;
  const fp = shared.factoryParams;

  const isGenericSizeShares =
    (fp.sizeSharesPct.S === 10 &&
      fp.sizeSharesPct.M === 25 &&
      fp.sizeSharesPct.L === 35 &&
      fp.sizeSharesPct.XL === 20 &&
      fp.sizeSharesPct.XXL === 10) ||
    (fp.sizeSharesPct.S === 12 &&
      fp.sizeSharesPct.M === 26 &&
      fp.sizeSharesPct.L === 30 &&
      fp.sizeSharesPct.XL === 20 &&
      fp.sizeSharesPct.XXL === 12);

  const useMultiSizeProfileGrid =
    !(model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0) &&
    isGenericSizeShares &&
    (modelBrandCode === 'AKUSHA' || modelBrandCode === 'LISKANI') &&
    brandProdProfile.sizes.length > 5;

  const displaySizeSlotLabels = useMemo(() => {
    if (
      (modelBrandCode === 'NA_TELE' ||
        modelBrandCode === 'AKUSHA' ||
        modelBrandCode === 'LISKANI') &&
      brandProdProfile.sizes.length >= 5
    ) {
      return brandProdProfile.sizes.length === 5
        ? brandProdProfile.sizes
        : [
            ...brandProdProfile.sizes.slice(0, 4),
            brandProdProfile.sizes.slice(4).join('/'),
          ];
    }
    return SIZES_LIST as string[];
  }, [modelBrandCode, brandProdProfile.sizes]);

  const brandMappedFiveShares = useMemo(() => {
    if (
      isGenericSizeShares &&
      (modelBrandCode === 'NA_TELE' ||
        modelBrandCode === 'AKUSHA' ||
        modelBrandCode === 'LISKANI') &&
      brandProdProfile.sizes.length >= 5
    ) {
      const sharesArr =
        brandProdProfile.sizes.length === 5
          ? brandProdProfile.sizes.map((sz) => brandProdProfile.sizeSharesPct[sz] || 20)
          : [
              brandProdProfile.sizeSharesPct[brandProdProfile.sizes[0]] || 15,
              brandProdProfile.sizeSharesPct[brandProdProfile.sizes[1]] || 20,
              brandProdProfile.sizeSharesPct[brandProdProfile.sizes[2]] || 25,
              brandProdProfile.sizeSharesPct[brandProdProfile.sizes[3]] || 20,
              brandProdProfile.sizes
                .slice(4)
                .reduce((s, sz) => s + (brandProdProfile.sizeSharesPct[sz] || 10), 0),
            ];
      return {
        S: sharesArr[0] || 10,
        M: sharesArr[1] || 25,
        L: sharesArr[2] || 35,
        XL: sharesArr[3] || 20,
        XXL: sharesArr[4] || 10,
      };
    }
    return fp.sizeSharesPct;
  }, [isGenericSizeShares, modelBrandCode, brandProdProfile, fp.sizeSharesPct]);

  const sizeRangeLabel = useMemo(() => {
    if (model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0) {
      return `${model.liskaniSizeVariants.length} разм.`;
    }
    if (brandProdProfile.sizes.length > 0) {
      return `${brandProdProfile.sizes[0]}–${brandProdProfile.sizes[brandProdProfile.sizes.length - 1]}`;
    }
    return 'S–XXL';
  }, [model.liskaniSizeVariants, brandProdProfile.sizes]);
  const proc = useMemo(
    () => computeProcurementPlan(model, currentScenario),
    [model, currentScenario]
  );

  const defaultBatchMoqPacks = Math.max(
    1,
    fp.moqPacks || (brandProdProfile as { defaultMoq?: number }).defaultMoq || 500
  );

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showMonthlyTable, setShowMonthlyTable] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [savedStamp, setSavedStamp] = useState<string>('Сохранено');

  // Локальная форма добавления произвольной партии
  const [newBatchStartMonth, setNewBatchStartMonth] = useState<number>(0);
  const [newBatchEndMonth, setNewBatchEndMonth] = useState<number>(2);
  const [newBatchPacks, setNewBatchPacks] = useState<number>(defaultBatchMoqPacks);
  const [newBatchOrderDate, setNewBatchOrderDate] = useState<string>('2026-11-12');
  const [newBatchApproveImmediately, setNewBatchApproveImmediately] = useState<boolean>(false);

  useEffect(() => {
    setExpandedKey(null);
    setShowAddCustomModal(false);
    setShowAdvancedSettings(false);
    setNewBatchStartMonth(0);
    setNewBatchEndMonth(2);
    setNewBatchPacks(
      Math.max(
        1,
        fp.moqPacks || (brandProdProfile as { defaultMoq?: number }).defaultMoq || 500
      )
    );
    setNewBatchApproveImmediately(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.id]);

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
    if (!canEdit) return;
    const cleanTarget = Math.max(0, Math.round(nextAnnualPacks));
    const currentPlan =
      model.plansByScenario[currentScenario.id] ||
      model.plansByScenario[202706] ||
      model.plansByScenario[202705] ||
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

    const ratePct = Math.max(5, Math.min(100, proc.buyoutRatePct || 85));
    const pricesRub =
      Array.isArray(currentPlan.monthlyPricesRub) &&
      currentPlan.monthlyPricesRub.length === 12
        ? currentPlan.monthlyPricesRub.map((p) => p || model.retailPriceRub || 1990)
        : Array(12).fill(model.retailPriceRub || 1990);
    const nextOrdersPacks = nextMonthlyPacks.map((b) =>
      Math.round(b / (ratePct / 100))
    );
    const nextOrdersRub = nextOrdersPacks.map((ord, idx) =>
      Math.round(ord * (pricesRub[idx] || model.retailPriceRub || 1990))
    );

    const isPrimaryEdit =
      currentScenario.id === 1 ||
      currentScenario.id === 202705 ||
      currentScenario.id === 202706;
    const isLiskaniModel =
      model.customBrandLabel === 'LISKANI' ||
      Boolean(model.plansByScenario[202705]);
    const isAkushaModel =
      model.customBrandLabel === 'AKUSHA' ||
      Boolean(model.plansByScenario[202706]);

    const updatedPlan = {
      ...currentPlan,
      scenarioId: currentScenario.id,
      monthlyPacks: nextMonthlyPacks,
      monthlyPricesRub: pricesRub,
      monthlyOrdersPacks: nextOrdersPacks,
      monthlyOrdersRub: nextOrdersRub,
      monthlyRevenuesRubOverride: undefined,
    };

    const nextPlansByScenario: ScenarioModelSpec['plansByScenario'] = {
      ...model.plansByScenario,
      [currentScenario.id]: updatedPlan,
    };
    if (isPrimaryEdit && isLiskaniModel && model.plansByScenario[202705]) {
      nextPlansByScenario[202705] = { ...updatedPlan, scenarioId: 202705 };
    }
    if (isPrimaryEdit && isAkushaModel && model.plansByScenario[202706]) {
      nextPlansByScenario[202706] = { ...updatedPlan, scenarioId: 202706 };
    }

    const scaleFactor = currentSum > 0 ? cleanTarget / currentSum : 0;
    const nextLiskaniVariants =
      isPrimaryEdit && Array.isArray(model.liskaniSizeVariants) && currentSum > 0
        ? model.liskaniSizeVariants.map((sv) => {
            const nextMonthlyBuyoutsUnits = sv.monthlyBuyoutsUnits.map((u) =>
              Math.max(0, Math.round(u * scaleFactor))
            );
            const annualBuyoutsUnits = nextMonthlyBuyoutsUnits.reduce((s, v) => s + v, 0);
            const annualOrdersUnits = Math.round(annualBuyoutsUnits / (ratePct / 100));
            return {
              ...sv,
              monthlyBuyoutsUnits: nextMonthlyBuyoutsUnits,
              annualBuyoutsUnits,
              annualBuyoutsRub: Math.round(annualBuyoutsUnits * sv.retailPriceRub),
              annualOrdersUnits,
              annualOrdersRub: Math.round(annualOrdersUnits * sv.retailPriceRub),
            };
          })
        : model.liskaniSizeVariants;

    onUpdateModel({
      ...model,
      plansByScenario: nextPlansByScenario,
      liskaniSizeVariants: nextLiskaniVariants,
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit || !hasCost) return;
    onUpdateModel(updateModelUnitCostWithVariants(model, nextCostRub));
    triggerSavedIndicator('Сохранено');
  };

  const handleUpdateSizeVariantUnitCost = (
    skuIndexOrSellerSku: number | string,
    nextCostRub: number
  ) => {
    if (!canEdit || !hasCost) return;
    onUpdateModel(
      updateModelSizeVariantUnitCost(model, skuIndexOrSellerSku, nextCostRub)
    );
    triggerSavedIndicator('Себест. размера сохранена');
  };

  const handleUpdateBuyoutRatePct = (nextPct: number) => {
    if (!canEdit) return;
    const updated = updateModelBuyoutRatePct(model, nextPct, {
      scenarioId: currentScenario.id,
    });
    onUpdateModel(updated);
    triggerSavedIndicator(`% выкупа: ${updated.buyoutRatePct}%`);
  };

  const handleToggleProcureByOrders = (enabled: boolean) => {
    if (!canEdit) return;
    const updated = toggleModelProcurementByOrders(model, enabled);
    onUpdateModel(updated);
    triggerSavedIndicator(
      enabled ? 'Закупки под заказы' : 'Закупки под выкупы'
    );
  };

  const handleUpdateTotalLeadDays = (nextTotalDays: number) => {
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
    const cleanVal = Math.max(0, Math.round(nextSizePacks));
    const nextBreakdown: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number> = {
      ...currentSizes,
      [sz]: cleanVal,
    };
    const nextTotalPacks = Math.max(
      1,
      SIZES_LIST.reduce((sum, key) => sum + (nextBreakdown[key] || 0), 0)
    );
    const updated = updateApprovedPurchaseOrder(
      model,
      po.id,
      {
        packsQty: nextTotalPacks,
        sizeBreakdownPacks: nextBreakdown,
      },
      auditAuthor
    );
    onUpdateModel(updated);
    triggerSavedIndicator('Сохранено');
  };

  const handleMergeWithNextPeriod = (periodId: string) => {
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
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
    if (!canEdit) return;
    const updated = approveRecommendedBatch(model, batch, auditAuthor);
    onUpdateModel(updated);
    const newestPo = updated.sharedSupplyAndFact?.approvedOrders.slice(-1)[0];
    if (newestPo) {
      setExpandedKey(`po-${newestPo.id}`);
    }
    triggerSavedIndicator('Заказ утверждён');
    onNotify?.(
      'Партия утверждена в заказ PO',
      `Зафиксировано ${batch.recommendedPacks.toLocaleString('ru-RU')} ${unitLabels.primaryShort}${hasCost ? ` (${batch.estimatedTotalRub.toLocaleString('ru-RU')} ₽)` : ''} на период ${batch.coverageMonthsLabel}.`,
      'success'
    );
  };

  const handleAddBatchSubmit = () => {
    if (!canEdit) return;
    const startM = Math.min(11, Math.max(0, newBatchStartMonth));
    const endM = Math.min(11, Math.max(startM, newBatchEndMonth));
    const cleanPacks = Math.max(1, Math.round(newBatchPacks || defaultBatchMoqPacks));

    if (newBatchApproveImmediately) {
      const customBreakdown = allocatePacksBySizeLargestRemainder(
        cleanPacks,
        brandMappedFiveShares
      );
      const created = createCustomPurchaseOrder(model, {
        packsQty: cleanPacks,
        unitCostRub: model.unitCostRub,
        arrivalMonthIdx: startM,
        orderPlacementDateIso: newBatchOrderDate,
        author: auditAuthor,
        note: `Покрытие ${
          startM === endM
            ? `${MONTHS_SHORT[startM]} 2027`
            : `${MONTHS_SHORT[startM]}–${MONTHS_SHORT[endM]} 2027`
        }`,
      });
      const createdOrders = created.sharedSupplyAndFact?.approvedOrders || [];
      const lastPo = createdOrders[createdOrders.length - 1];
      const updated = lastPo
        ? updateApprovedPurchaseOrder(
            created,
            lastPo.id,
            {
              sizeBreakdownPacks: customBreakdown,
            },
            auditAuthor
          )
        : created;
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
        customSizeSharesPct: isGenericSizeShares ? brandMappedFiveShares : null,
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

  const modelAnnualRevenueRub = useMemo(
    () => computeModelScenarioMetrics(model, currentScenario).annualRevenueRub,
    [model, currentScenario]
  );

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
    if (!canEdit) return;
    if (proc.recommendedBatches.length === 0) return;
    let updated = model;
    for (const batch of proc.recommendedBatches) {
      updated = approveRecommendedBatch(updated, batch, auditAuthor);
    }
    onUpdateModel(updated);
    triggerSavedIndicator('Все партии утверждены');
    onNotify?.(
      'Утверждены все партии по модели',
      `Создано заказов PO: ${proc.recommendedBatches.length} шт. на общий объём ${proc.totalRecommendedPacks.toLocaleString('ru-RU')} ${unitLabels.primaryShort}.`,
      'success'
    );
  };

  const handleExportSingleOrderCsv = (
    batchOrOrder: RecommendedProcurementBatch | ApprovedPurchaseOrder,
    fileSuffix: string
  ) => {
    const csv = serializeSingleBatchFactoryOrderDocumentCsv(
      model,
      batchOrOrder,
      undefined,
      { canViewCostPrice: hasCost }
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Zakaz_Fabrike_${model.code}_${fileSuffix}.csv`;
    if (document.body) {
      document.body.appendChild(a);
    }
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    triggerSavedIndicator('Выгружен заказ фабрике');
  };

  return (
    <div className="space-y-4">
      {/* =====================================================================
          БЛОК 1 · ПАСПОРТ ЗАКУПКИ МОДЕЛИ В СТИЛЕ PEAKLY (Без вложенных цветных рамок и лишнего шума)
         ===================================================================== */}
      <div className="rounded-xl border border-[#E4E1DA] bg-white overflow-hidden shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
        {/* Шапка карточки: Выбор модели слева + Статус + Кнопка «Параметры и размеры ▾» справа */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E1DA] bg-[#FAF9F6] px-5 py-3">
          {headerLeftSlot ? (
            <div className="flex-1 min-w-[280px]">{headerLeftSlot}</div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-[16px] font-semibold text-[#141413]">
                {model.title}
              </h3>
              <span className="rounded-md border border-[#E4E1DA] bg-white px-2.5 py-0.5 font-mono text-[11.5px] font-medium text-[#5C5953]">
                {hasDistinctSecondaryUnit
                  ? `${model.code} · ${model.unitsInPack} ${unitLabels.secondaryShort}/${unitLabels.primaryShort}`
                  : `${model.code} · ${unitLabels.primaryShort}`}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center rounded-lg border border-[#E4E1DA] bg-white p-0.5"
              title="Пока у модели статус «Гипотеза» или «Тест», к утверждению формируется только первая тестовая партия"
            >
              {(['hypothesis', 'test', 'scaling'] as ModelScalingStage[]).map((st) => {
                const active = proc.scalingStage === st;
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => handleUpdateScalingStage(st)}
                    className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                      active
                        ? 'bg-[#141413] text-white border border-[#141413]'
                        : 'text-[#5C5953] hover:text-[#141413] border border-transparent'
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
              className={`h-8 inline-flex items-center gap-1.5 rounded-lg border px-3 text-[11.5px] font-medium transition-colors cursor-pointer ${
                showAdvancedSettings
                  ? 'border-[#141413] bg-[#141413] text-white'
                  : 'border-[#E4E1DA] bg-white text-[#141413] hover:bg-[#FAF9F6]'
              }`}
              title={`Открыть себестоимость, остаток на складе, аванс, цикл поставки и размерную сетку (${sizeRangeLabel})`}
            >
              <span>Параметры:</span>
              <span className="font-mono font-semibold">
                {hasCost ? `${model.unitCostRub || 0} ₽` : 'Скрыто'} · {proc.totalLeadDays} дн. · {sizeRangeLabel}
              </span>
              <span className="text-[10px] opacity-75">
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
          {/* 1. План продаж (год) + % выкупа */}
          <div className="px-5 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                План продаж (выкупы)
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
                  disabled={!canEdit}
                  onClick={() =>
                    handleUpdateAnnualSalesPacks(Math.max(0, proc.annualBuyoutsPacks - 500))
                  }
                  className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#686762] hover:bg-white hover:text-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title={`Уменьшить годовой план выкупов на 500 ${unitLabels.primaryShort}`}
                >
                  −
                </button>
                <NumericInput
                  ariaLabel={`Годовой план продаж модели, ${unitLabels.primaryShort}`}
                  value={proc.annualBuyoutsPacks}
                  min={0}
                  step={500}
                  disabled={!canEdit}
                  onChangeValue={handleUpdateAnnualSalesPacks}
                  className="h-7 w-24 text-center font-mono text-[17px] font-extrabold text-[#141413] bg-transparent focus:bg-white focus:outline-none rounded-[5px]"
                />
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => handleUpdateAnnualSalesPacks(proc.annualBuyoutsPacks + 500)}
                  className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#686762] hover:bg-white hover:text-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title={`Увеличить годовой план выкупов на 500 ${unitLabels.primaryShort}`}
                >
                  +
                </button>
              </div>
              <span className="text-[12px] font-semibold text-[#686762]">
                {unitLabels.primaryShort}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11.5px] text-[#686762]">
              <span>
                Выручка:{' '}
                <strong className="text-[#141413]">
                  {hasFinance ? formatRubMillions(modelAnnualRevenueRub) : 'Скрыто'}
                </strong>
              </span>
              <span className="font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                Заказы ({proc.buyoutRatePct}%): {proc.annualOrdersPacks.toLocaleString('ru-RU')} (×{proc.orderMultiplier.toFixed(2).replace('.', ',')})
              </span>
            </div>
          </div>

          {/* 2. К заказу на фабрике (с учётом % выкупа) */}
          <div className="px-5 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                К заказу на фабрике
              </span>
              {proc.approvedOrders.length > 0 && canEdit ? (
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
              {totalModelSupplyPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-[#686762]">
              <div className="inline-flex items-center gap-1">
                <span>% выкупа:</span>
                <NumericInput
                  ariaLabel="Процент выкупа WB"
                  value={proc.buyoutRatePct}
                  min={5}
                  max={100}
                  step={1}
                  disabled={!canEdit}
                  onChangeValue={handleUpdateBuyoutRatePct}
                  className="h-5.5 w-11 rounded border border-[#C8C7BE] bg-[#FAF9F6] px-1 text-center font-mono text-[11px] font-bold text-[#141413]"
                />
                <span>%</span>
              </div>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => handleToggleProcureByOrders(!proc.procureByOrdersVolume)}
                className={`rounded px-2 py-0.5 font-mono text-[10.5px] font-bold border cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed ${
                  proc.procureByOrdersVolume
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-[#F2F1EC] text-[#52514C] border-[#D8D7CE] hover:bg-[#E6E5DE]'
                }`}
                title="Переключить расчёт партий закупки: под объём заказов с учётом % выкупа (например ×3,03 для обуви при 33% выкупа) или под чистые выкупы"
              >
                {proc.procureByOrdersVolume
                  ? `✓ Под заказы ×${proc.orderMultiplier.toFixed(2).replace('.', ',')}`
                  : 'Под выкупы ×1,00'}
              </button>
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
              {hasCost ? formatRubMillions(firstStartWave.totalRub) : 'Скрыто'}
            </div>
            <div className="mt-1.5 text-[11.5px] text-[#686762]">
              Аванс {fp.prepaymentPct}% сейчас:{' '}
              <strong className="text-[#141413]">
                {hasCost ? formatRubMillions(firstStartWave.prepayRub) : 'Скрыто'}
              </strong>{' '}
              · {firstStartWave.packs.toLocaleString('ru-RU')} {unitLabels.primaryShort}
            </div>
          </div>

          {/* 4. Бюджет закупок (год) */}
          <div className="px-5 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#686762]">
                Бюджет закупок (год)
              </span>
              <span className="font-mono text-[10.5px] font-semibold text-[#686762]">
                {hasCost && hasFinance && modelAnnualRevenueRub > 0
                  ? `${((totalModelSupplyBudgetRub / modelAnnualRevenueRub) * 100)
                      .toFixed(1)
                      .replace('.', ',')}% от выр.`
                  : ''}
              </span>
            </div>
            <div className="mt-2 font-mono text-[22px] font-extrabold tracking-[-0.02em] text-[#141413]">
              {!hasCost
                ? 'Скрыто'
                : model.unitCostRub > 0
                  ? formatRubMillions(totalModelSupplyBudgetRub)
                  : 'Укажите себест.'}
            </div>
            <div className="mt-1.5 text-[11.5px] text-[#686762]">
              {hasCost ? (
                <>
                  По{' '}
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings((v) => !v)}
                    className="font-semibold text-[#141413] underline decoration-[#C8C7BE] hover:decoration-[#141413] cursor-pointer"
                  >
                    {model.unitCostRub} ₽/{unitLabels.primaryShort}
                  </button>{' '}
                  · Q2–Q4 из оборота WB
                </>
              ) : (
                <span>Себестоимость скрыта · Q2–Q4 из оборота WB</span>
              )}
            </div>
          </div>
        </div>

        {/* РАСКРЫВАЮЩИЙСЯ БЛОК ПАРАМЕТРОВ МОДЕЛИ И РАЗМЕРОВ (Упакован по кнопке «Параметры ▾», чтобы не засорять экран!) */}
        {showAdvancedSettings && (
          <div className="border-t border-[#EAE9E2] bg-[#FAF9F6] px-5 py-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold text-[#141413]">
                {model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0
                  ? `Параметры закупки, производства и размерная сетка полотен (${model.liskaniSizeVariants.length} разм.)`
                  : `Параметры закупки, производства и размерная сетка (${sizeRangeLabel})`}
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
                  {hasCost ? (
                    <>
                      <NumericInput
                        ariaLabel={`Себестоимость 1 ${unitLabels.primaryShort}, рублей`}
                        value={model.unitCostRub || 0}
                        min={0}
                        step={10}
                        disabled={!canEdit}
                        onChangeValue={handleUpdateUnitCost}
                        className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                      />
                      <span className="text-[10.5px] text-[#686762]">₽</span>
                    </>
                  ) : (
                    <span className="font-mono text-[13px] font-semibold text-[#686762]">Скрыто</span>
                  )}
                </div>
              </label>

              <label className="flex flex-col justify-between rounded-[9px] border border-[#DEDDD5] bg-white px-3 py-2">
                <span className="text-[10.5px] font-semibold text-[#686762]">
                  Остаток сейчас
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <NumericInput
                    ariaLabel={`Начальный остаток, ${unitLabels.primaryShort}`}
                    value={shared.actualOpeningStockPacks}
                    min={0}
                    step={50}
                    disabled={!canEdit}
                    onChangeValue={handleUpdateOpeningStock}
                    className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#686762]">{unitLabels.primaryShort}</span>
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
                    disabled={!canEdit}
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
                    disabled={!canEdit}
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
                    ariaLabel={`MOQ, ${unitLabels.primaryShort}`}
                    value={fp.moqPacks}
                    min={1}
                    step={100}
                    disabled={!canEdit}
                    onChangeValue={handleUpdateMoq}
                    className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#686762]">{unitLabels.primaryShort}</span>
                </div>
              </label>

              <label className="flex flex-col justify-between rounded-[9px] border border-[#DEDDD5] bg-white px-3 py-2">
                <span className="text-[10.5px] font-semibold text-[#686762]">
                  Кратность (шаг)
                </span>
                <div className="mt-1 flex items-center gap-1">
                  <NumericInput
                    ariaLabel={`Кратность заказа, ${unitLabels.primaryShort}`}
                    value={fp.packMultiple}
                    min={1}
                    step={50}
                    disabled={!canEdit}
                    onChangeValue={handleUpdatePackMultiple}
                    className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                  />
                  <span className="text-[10px] text-[#686762]">{unitLabels.primaryShort}</span>
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
                    disabled={!canEdit}
                    onChangeValue={handleUpdateSafetyDays}
                    className="w-full font-mono text-[14px] font-bold text-[#141413] focus:outline-none"
                  />
                  <span className="text-[10.5px] text-[#686762]">дн.</span>
                </div>
              </label>
            </div>

            {/* Пропорция размеров */}
            {model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0 ? (
              <div className="rounded-[10px] border border-[#E4E3DC] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold text-[#141413]">
                    Размерная матрица полотен ({model.liskaniSizeVariants.length} разм. SKU · доли выкупов и себестоимость по размеру)
                  </span>
                  <span className="rounded px-2 py-0.5 font-mono text-[11px] font-bold bg-[#EAF6F0] text-[#146C43]">
                    Сумма: 100%
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(() => {
                    const totBuy = Math.max(
                      1,
                      model.liskaniSizeVariants.reduce((s, v) => s + v.annualBuyoutsUnits, 0)
                    );
                    return model.liskaniSizeVariants.map((sv) => {
                      const pct = ((sv.annualBuyoutsUnits / totBuy) * 100).toFixed(1).replace('.', ',');
                      return (
                        <div
                          key={sv.sellerSku}
                          className="flex items-center justify-between gap-2 rounded-[8px] border border-[#DEDDD5] bg-[#FAF9F6] px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-[11.5px] font-bold text-[#141413]">
                              {sv.sizeCm} см
                            </div>
                            {hasCost ? (
                              <div className="mt-0.5 inline-flex items-center gap-1 rounded border border-[#D8D7CE] bg-white px-1.5 py-0.5">
                                <NumericInput
                                  ariaLabel={`Себестоимость ${sv.sizeCm}`}
                                  value={Math.round(sv.unitCostRub)}
                                  min={0}
                                  step={10}
                                  disabled={!canEdit}
                                  onChangeValue={(nextVal) =>
                                    handleUpdateSizeVariantUnitCost(sv.skuIndex, nextVal)
                                  }
                                  className="w-14 text-right font-mono text-[11px] font-bold text-[#141413] bg-transparent focus:outline-none"
                                />
                                <span className="font-mono text-[9.5px] text-[#686762]">₽</span>
                              </div>
                            ) : (
                              <div className="mt-0.5 font-mono text-[10px] text-[#686762]">
                                Скрыто
                              </div>
                            )}
                          </div>
                          <span className="font-mono text-[12px] font-bold text-[#146C43] shrink-0">
                            {pct}%
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : useMultiSizeProfileGrid ? (
              <div className="rounded-[10px] border border-[#E4E3DC] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold text-[#141413]">
                    Базовая пропорция размеров ({brandProdProfile.sizeGridLabelRu} · {brandProdProfile.sizes.length} разм.)
                  </span>
                  <span className="rounded px-2 py-0.5 font-mono text-[11px] font-bold bg-[#EAF6F0] text-[#146C43]">
                    Сумма: 100%
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-7 gap-2">
                  {brandProdProfile.sizes.map((sz) => (
                    <div
                      key={sz}
                      className="flex items-center justify-between rounded-[8px] border border-[#DEDDD5] bg-[#FAF9F6] px-2.5 py-1.5"
                    >
                      <span className="text-[11.5px] font-bold text-[#141413]">{sz}</span>
                      <span className="font-mono text-[12px] font-bold text-[#146C43]">
                        {brandProdProfile.sizeSharesPct[sz] ?? Math.round(100 / brandProdProfile.sizes.length)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[10px] border border-[#E4E3DC] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold text-[#141413]">
                    Базовая пропорция размеров ({sizeRangeLabel}, применяется ко всем партиям модели, сумма = 100%)
                  </span>
                  <div className="flex items-center gap-2">
                    {canEdit && (
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
                    )}
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${
                        sizeShareSum === 100
                          ? 'bg-[#EAF6F0] text-[#146C43]'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      Сумма: {sizeShareSum}%
                    </span>
                    {sizeShareSum !== 100 && canEdit && (
                      <button
                        type="button"
                        onClick={handleNormalizeSizeSharesTo100}
                        className="rounded bg-[#EAE9E2] border border-[#CECDC4] px-2.5 py-0.5 text-[10.5px] font-semibold text-[#141413] hover:bg-[#DFDED6] cursor-pointer"
                      >
                        Выровнять до 100%
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {SIZES_LIST.map((sz, szIdx) => {
                    const displaySz = displaySizeSlotLabels[szIdx] || sz;
                    return (
                    <label
                      key={sz}
                      className="flex items-center justify-between rounded-[8px] border border-[#DEDDD5] bg-[#FAF9F6] px-3 py-1.5"
                    >
                      <span className="text-[11.5px] font-bold text-[#141413]">{displaySz}</span>
                      <div className="inline-flex items-center gap-1">
                        <NumericInput
                          ariaLabel={`Доля размера ${displaySz}, %`}
                          value={fp.sizeSharesPct[sz] ?? 20}
                          min={0}
                          max={100}
                          disabled={!canEdit}
                          onChangeValue={(val) => handleUpdateModelSizeShare(sz, val)}
                          className="w-12 text-right font-mono text-[13.5px] font-bold text-[#141413] bg-transparent focus:outline-none"
                        />
                        <span className="text-[11px] text-[#686762]">%</span>
                      </div>
                    </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ПОРАЗМЕРНАЯ ВЕДОМОСТЬ ЗАКУПКИ ДЛЯ КАРТОЧЕК LISKANI (269 SKU ПО РАЗМЕРАМ ПОЛОТЕН) */}
      {model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0 && (() => {
        const totalModelOrderPacks =
          proc.totalApprovedReceiptsPacks + proc.totalRecommendedPacks;
        const baselineVariantSum = model.liskaniSizeVariants.reduce(
          (s, v) => s + (v.annualOrdersUnits || v.annualBuyoutsUnits || 0),
          0
        );
        const scaleRatio =
          baselineVariantSum > 0 ? totalModelOrderPacks / baselineVariantSum : 1;

        const exactVariantOrders = model.liskaniSizeVariants.map(
          (sv) => (sv.annualOrdersUnits || sv.annualBuyoutsUnits || 0) * scaleRatio
        );
        const allocatedVariantOrders = exactVariantOrders.map((v) => Math.floor(v));
        let variantRem =
          totalModelOrderPacks - allocatedVariantOrders.reduce((s, v) => s + v, 0);
        const fracOrder = exactVariantOrders
          .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
          .sort((a, b) => b.frac - a.frac);
        for (let i = 0; i < fracOrder.length && variantRem > 0; i++) {
          allocatedVariantOrders[fracOrder[i].idx] += 1;
          variantRem -= 1;
        }

        const totalVariantsSoldCogsRub = model.liskaniSizeVariants.reduce(
          (acc, sv) => acc + sv.annualBuyoutsUnits * sv.unitCostRub,
          0
        );
        const totalVariantsOrderRub = model.liskaniSizeVariants.reduce(
          (acc, sv, idx) => acc + (allocatedVariantOrders[idx] || 0) * sv.unitCostRub,
          0
        );

        return (
          <div className="rounded-[16px] border border-[#D8D7CE] bg-white p-5 shadow-[0_1px_3px_rgba(20,20,19,0.03)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-[15px] font-bold text-[#141413]">
                  Поразмерная детализация закупки «{model.title}» ({model.liskaniSizeVariants.length} разм. SKU)
                </h4>
                <p className="mt-0.5 text-[12px] text-[#686762]">
                  Каждый размер имеет собственную закупочную себестоимость и объём ({unitLabels.primaryShort}) по 4 квартальным волнам (Q1–Q4)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-mono">
                <span className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1 text-[#334155]">
                  Себест. выкупов:{' '}
                  <strong className="text-[#0F172A]">
                    {hasCost ? formatRubMillions(totalVariantsSoldCogsRub) : 'Скрыто'}
                  </strong>
                </span>
                <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 text-emerald-800 font-bold">
                  Бюджет партий по размерам:{' '}
                  {hasCost ? formatRubMillions(totalVariantsOrderRub) : 'Скрыто'}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[11px] border border-[#E2E1D8]">
              <table className="w-full min-w-[820px] border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-[#E2E1D8] bg-[#FAF9F6] text-[10.5px] font-bold uppercase tracking-wider text-[#686762]">
                    <th className="py-2.5 px-3">Размер полотна / SKU</th>
                    <th className="py-2.5 px-2.5 text-right">Себест. 1 {unitLabels.primaryShort}</th>
                    <th className="py-2.5 px-2.5 text-right">План выкупов</th>
                    <th className="py-2.5 px-2.5 text-right">Себест. выкупов</th>
                    <th className="py-2.5 px-2.5 text-right bg-[#EAF6F0]/60 text-[#146C43]">
                      Партия №1 (Q1)
                    </th>
                    <th className="py-2.5 px-2.5 text-right">Партия №2 (Q2)</th>
                    <th className="py-2.5 px-2.5 text-right">Партия №3 (Q3)</th>
                    <th className="py-2.5 px-2.5 text-right">Партия №4 (Q4)</th>
                    <th className="py-2.5 px-2.5 text-right">К заказу (год)</th>
                    <th className="py-2.5 px-3 text-right">Сумма закупки</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE9E2]">
                  {model.liskaniSizeVariants.map((sv, svIdx) => {
                    const variantAnnualBase = Math.max(
                      1,
                      sv.annualOrdersUnits || sv.annualBuyoutsUnits || 1
                    );
                    const totalOrd = allocatedVariantOrders[svIdx] || 0;
                    const variantScale = totalOrd / variantAnnualBase;
                    const q1Dem =
                      (sv.monthlyOrdersUnits?.[0] ?? sv.monthlyBuyoutsUnits[0] ?? 0) +
                      (sv.monthlyOrdersUnits?.[1] ?? sv.monthlyBuyoutsUnits[1] ?? 0) +
                      (sv.monthlyOrdersUnits?.[2] ?? sv.monthlyBuyoutsUnits[2] ?? 0);
                    const q2Dem =
                      (sv.monthlyOrdersUnits?.[3] ?? sv.monthlyBuyoutsUnits[3] ?? 0) +
                      (sv.monthlyOrdersUnits?.[4] ?? sv.monthlyBuyoutsUnits[4] ?? 0) +
                      (sv.monthlyOrdersUnits?.[5] ?? sv.monthlyBuyoutsUnits[5] ?? 0);
                    const q3Dem =
                      (sv.monthlyOrdersUnits?.[6] ?? sv.monthlyBuyoutsUnits[6] ?? 0) +
                      (sv.monthlyOrdersUnits?.[7] ?? sv.monthlyBuyoutsUnits[7] ?? 0) +
                      (sv.monthlyOrdersUnits?.[8] ?? sv.monthlyBuyoutsUnits[8] ?? 0);
                    const q1Ord = Math.round(q1Dem * variantScale);
                    const q2Ord = Math.round(q2Dem * variantScale);
                    const q3Ord = Math.round(q3Dem * variantScale);
                    const q4Ord = Math.max(0, totalOrd - q1Ord - q2Ord - q3Ord);
                    const soldCogs = sv.annualBuyoutsUnits * sv.unitCostRub;
                    const orderSumRub = totalOrd * sv.unitCostRub;

                    return (
                      <tr key={sv.sellerSku} className="hover:bg-[#FAF9F6]">
                        <td className="py-2 px-3">
                          <span className="font-bold text-[#141413]">{sv.sizeCm}</span>{' '}
                          <span className="font-mono text-[10.5px] text-[#686762]">
                            ({sv.sellerSku})
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold text-[#141413]">
                          {hasCost ? (
                            <div className="inline-flex items-center justify-end gap-1 rounded-[7px] border border-[#D8D7CE] bg-white px-2 py-0.5 focus-within:border-[#157347]">
                              <NumericInput
                                ariaLabel={`Себестоимость размера ${sv.sizeCm}`}
                                value={Math.round(sv.unitCostRub)}
                                min={0}
                                step={10}
                                disabled={!canEdit}
                                onChangeValue={(nextVal) =>
                                  handleUpdateSizeVariantUnitCost(sv.skuIndex, nextVal)
                                }
                                className="w-16 text-right font-mono text-[12px] font-bold text-[#141413] bg-transparent focus:outline-none"
                              />
                              <span className="text-[10.5px] font-semibold text-[#686762]">₽</span>
                            </div>
                          ) : (
                            <span className="text-[#686762]">Скрыто</span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-[#52514C]">
                          {sv.annualBuyoutsUnits.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-[#52514C]">
                          {hasCost ? `${soldCogs.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-[#146C43] bg-[#EAF6F0]/35">
                          <div>
                            {q1Ord.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                          </div>
                          <div className="text-[10px] text-[#52514C]">
                            {hasCost
                              ? `${(q1Ord * sv.unitCostRub).toLocaleString('ru-RU')} ₽`
                              : 'Скрыто'}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-[#52514C]">
                          {q2Ord.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-[#52514C]">
                          {q3Ord.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-[#52514C]">
                          {q4Ord.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold text-[#141413]">
                          {totalOrd.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-extrabold text-[#141413]">
                          {hasCost ? `${orderSumRub.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#E2E1D8] bg-[#FAF9F6] font-extrabold text-[#141413]">
                    <td className="py-2.5 px-3">
                      ИТОГО ПО {model.liskaniSizeVariants.length} РАЗМЕРАМ
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono">
                      {hasCost ? `~${model.unitCostRub.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono">
                      {proc.annualDemandPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono">
                      {hasCost ? formatRubMillions(totalVariantsSoldCogsRub) : 'Скрыто'}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono text-[#146C43] bg-[#EAF6F0]/45">
                      {hasCost ? formatRubMillions(firstStartWave.totalRub) : 'Скрыто'}
                    </td>
                    <td colSpan={3} className="py-2.5 px-2.5 text-right font-mono text-[#52514C]">
                      Q2–Q4 из оборота WB
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono">
                      {totalModelOrderPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {hasCost ? formatRubMillions(totalVariantsOrderRub) : 'Скрыто'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}

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
              Нажмите на любую партию или «Размеры и расчёт ▾», чтобы открыть размерную сетку ({sizeRangeLabel}), формулу и даты.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {fp.customBatchPeriods && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={handleResetToDefaultQuarters}
                className="h-8 rounded-[8px] border border-[#D8D7CE] bg-[#FAF9F6] px-2.5 text-[11.5px] font-semibold text-[#686762] hover:text-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Сбросить ручные правки партий и пересчитать 4 стандартных квартала по плану продаж"
              >
                ↺ По формуле (4 кварт.)
              </button>
            )}
            {proc.approvedOrders.length > 0 && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={handleResetAllApprovedOrders}
                className="h-8 rounded-[8px] border border-rose-200 bg-rose-50 px-2.5 text-[11.5px] font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ↺ Вернуть PO в черновик ({proc.approvedOrders.length})
              </button>
            )}
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => canEdit && setShowAddCustomModal((v) => !v)}
              className="h-8 rounded-[8px] border border-[#D8D7CE] bg-white px-3 text-[12px] font-semibold text-[#141413] hover:bg-[#FAF9F6] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Своя партия
            </button>
            {proc.recommendedBatches.length > 0 && (
              <button
                type="button"
                disabled={!canEdit}
                onClick={handleApproveAllDraftBatches}
                className="h-8 rounded-[8px] border border-[#BCE3CF] bg-[#EAF6F0] px-3.5 text-[12px] font-semibold text-[#146C43] hover:bg-[#157347] hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                Количество, {unitLabels.primaryShort}
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
                  className="rounded-[8px] bg-[#EAE9E2] border border-[#CECDC4] px-3 py-1.5 text-[12px] font-semibold text-[#141413] hover:bg-[#DFDED6] cursor-pointer"
                >
                  Сохранить партию
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Утверждённые заказы PO (хронологически отсортированные, с прямым инлайн-редактированием объёма, дат, цены и размеров!) */}
        {sortedApprovedOrders.length > 0 && (
          <div className="mb-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-[12px] font-bold uppercase tracking-wider text-[#157347]">
                Утверждённые заказы PO ({sortedApprovedOrders.length} шт. · {proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort})
              </span>
              <span className="text-[11.5px] text-[#52514C]">
                Все поля в строке и внутри размерной сетки ({sizeRangeLabel}) можно редактировать напрямую
              </span>
            </div>

            {sortedApprovedOrders.map((po, poIdx) => {
              const rowKey = `po-${po.id}`;
              const isExpanded = activeExpandedKey === rowKey;
              const confirmed = po.confirmedByFactory !== false;
              const discrepancy = proc.orderDiscrepancies.find((d) => d.orderId === po.id);
              const poSizes =
                po.sizeBreakdownPacks ||
                allocatePacksBySizeLargestRemainder(po.packsQty, brandMappedFiveShares);
              const poSizeTotal = SIZES_LIST.reduce((s, sz) => s + (poSizes[sz] || 0), 0);
              const poLiskaniVariants =
                (po as { liskaniSizeVariants?: ScenarioModelSpec['liskaniSizeVariants'] })
                  .liskaniSizeVariants &&
                (po as { liskaniSizeVariants?: ScenarioModelSpec['liskaniSizeVariants'] })
                  .liskaniSizeVariants!.length > 0
                  ? (po as { liskaniSizeVariants?: ScenarioModelSpec['liskaniSizeVariants'] })
                      .liskaniSizeVariants!
                  : model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0
                  ? model.liskaniSizeVariants
                  : null;

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
                          disabled={!canEdit}
                          value={po.arrivalMonthIdx}
                          onChange={(e) => {
                            if (!canEdit) return;
                            const nextArrival = Number(e.target.value);
                            const updated = updateApprovedPurchaseOrder(
                              model,
                              po.id,
                              {
                                arrivalMonthIdx: nextArrival,
                                coveredEndMonthIdx: Math.max(
                                  nextArrival,
                                  po.coveredEndMonthIdx ?? nextArrival
                                ),
                              },
                              auditAuthor
                            );
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-8 rounded-[7px] border border-[#BBE5CE] bg-white px-2 text-[13px] font-bold text-[#141413] hover:border-[#157347] focus:border-[#141413] focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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
                          disabled={!canEdit}
                          value={po.orderPlacementDateIso}
                          onChange={(e) => {
                            if (!canEdit || !e.target.value) return;
                            const updated = updateApprovedPurchaseOrder(
                              model,
                              po.id,
                              {
                                orderPlacementDateIso: e.target.value,
                              },
                              auditAuthor
                            );
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-8 rounded-[7px] border border-[#BBE5CE] bg-white px-2 font-mono text-[12px] font-semibold text-[#141413] hover:border-[#157347] focus:border-[#141413] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
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
                          disabled={!canEdit}
                          onClick={() => {
                            if (!canEdit) return;
                            const nextVal = Math.max(50, po.packsQty - (fp.packMultiple || 50));
                            const updated = updateApprovedPurchaseOrder(
                              model,
                              po.id,
                              {
                                packsQty: nextVal,
                              },
                              auditAuthor
                            );
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#52514C] hover:bg-[#F0F0EC] hover:text-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Уменьшить объём партии"
                        >
                          −
                        </button>
                        <NumericInput
                          ariaLabel={`Количество ${unitLabels.primaryShort} в ${po.orderNumber}`}
                          value={po.packsQty}
                          min={1}
                          step={fp.packMultiple || 50}
                          disabled={!canEdit}
                          onChangeValue={(val) => {
                            if (!canEdit) return;
                            const updated = updateApprovedPurchaseOrder(
                              model,
                              po.id,
                              {
                                packsQty: val,
                              },
                              auditAuthor
                            );
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-7 w-20 text-center font-mono text-[13.5px] font-bold text-[#141413] focus:outline-none"
                        />
                        <span className="pr-1.5 text-[11px] font-medium text-[#686762]">
                          {unitLabels.primaryShort}
                        </span>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            if (!canEdit) return;
                            const nextVal = po.packsQty + (fp.packMultiple || 50);
                            const updated = updateApprovedPurchaseOrder(
                              model,
                              po.id,
                              {
                                packsQty: nextVal,
                              },
                              auditAuthor
                            );
                            onUpdateModel(updated);
                            triggerSavedIndicator('Сохранено');
                          }}
                          className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#52514C] hover:bg-[#F0F0EC] hover:text-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Увеличить объём партии"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right min-w-[105px]">
                        <div className="font-mono text-[14px] font-bold text-[#141413]">
                          {hasCost ? formatRubMillions(po.totalOrderRub) : 'Скрыто'}
                        </div>
                        {hasDistinctSecondaryUnit && (
                          <div className="font-mono text-[10.5px] text-[#52514C]">
                            {(po.packsQty * po.unitsInPack).toLocaleString('ru-RU')} {unitLabels.secondaryShort}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                        className="h-8 rounded-[8px] border border-[#CBEAD9] bg-white px-2.5 text-[11.5px] font-semibold text-[#141413] hover:bg-[#EAF6F0] cursor-pointer"
                      >
                        {isExpanded
                          ? 'Скрыть ▴'
                          : poLiskaniVariants
                          ? `Размеры (${poLiskaniVariants.length}) ▾`
                          : `Размеры (${sizeRangeLabel}) ▾`}
                      </button>

                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          if (!canEdit) return;
                          const updated = removeApprovedPurchaseOrder(model, po.id, auditAuthor);
                          onUpdateModel(updated);
                          triggerSavedIndicator('Возвращён в план');
                        }}
                        title="Вернуть этот заказ обратно в черновой план"
                        className="h-8 rounded-[8px] border border-rose-200 bg-white px-2.5 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ↺ В план
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#CBEAD9] bg-white px-4 py-3.5 rounded-b-[11px]">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
                        <span className="text-[12.5px] font-bold text-[#141413]">
                          {poLiskaniVariants
                            ? `Поразмерная разбивка полотен (${poLiskaniVariants.length} SKU) и параметры заказа ${po.orderNumber}`
                            : `Размерная сетка (${sizeRangeLabel}) и параметры заказа ${po.orderNumber} (нажмите на любой размер для ввода количества)`}
                        </span>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-[#141413]">
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={confirmed}
                            onChange={(e) => {
                              if (!canEdit) return;
                              const updated = updateApprovedPurchaseOrder(
                                model,
                                po.id,
                                {
                                  confirmedByFactory: e.target.checked,
                                },
                                auditAuthor
                              );
                              onUpdateModel(updated);
                              triggerSavedIndicator('Сохранено');
                            }}
                            className="rounded border-[#C8C7BE] disabled:opacity-50"
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

                      {/* РАЗМЕРНАЯ СЕТКА УТВЕРЖДЁННОГО PO (для LISKANI — полотна по размерам см, для остальных брендов — интерактивная сетка по профилю бренда) */}
                      <div className="rounded-lg border border-[#E4E3DC] bg-[#F8F8F5] p-3">
                        {poLiskaniVariants ? (
                          (() => {
                            const poStartM = Math.max(0, Math.min(11, po.arrivalMonthIdx || 0));
                            const poEndM = Math.max(
                              poStartM,
                              Math.min(11, po.coveredEndMonthIdx ?? poStartM + 2)
                            );
                            const variantWeights = poLiskaniVariants.map((sv) => {
                              let periodOrd = 0;
                              for (let mIdx = poStartM; mIdx <= poEndM; mIdx++) {
                                periodOrd +=
                                  sv.monthlyOrdersUnits?.[mIdx] ??
                                  sv.monthlyBuyoutsUnits[mIdx] ??
                                  0;
                              }
                              return periodOrd > 0
                                ? periodOrd
                                : sv.annualOrdersUnits || sv.annualBuyoutsUnits || 1;
                            });
                            const totalWeight = variantWeights.reduce((s, w) => s + w, 0);
                            const exactPoVariantPacks = variantWeights.map((w) =>
                              totalWeight > 0
                                ? (po.packsQty * w) / totalWeight
                                : po.packsQty / poLiskaniVariants.length
                            );
                            const allocPoVariantPacks = exactPoVariantPacks.map((v) =>
                              Math.floor(v)
                            );
                            let poVarRem =
                              po.packsQty -
                              allocPoVariantPacks.reduce((s, v) => s + v, 0);
                            const poFrac = exactPoVariantPacks
                              .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
                              .sort((a, b) => b.frac - a.frac);
                            for (let i = 0; i < poFrac.length && poVarRem > 0; i++) {
                              allocPoVariantPacks[poFrac[i].idx] += 1;
                              poVarRem -= 1;
                            }

                            return (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[11.5px] font-semibold text-[#52514C]">
                                    Распределение заказа {po.orderNumber} по размерам штор ({poLiskaniVariants.length} разм. SKU · ширина × высота, см):
                                  </span>
                                  <span className="font-mono text-[11px] font-bold text-[#146C43]">
                                    Итого в PO: {po.packsQty.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                  </span>
                                </div>
                                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 text-left text-[11px]">
                                  {poLiskaniVariants.map((sv, idx) => {
                                    const [widthCm, heightCm] = sv.sizeCm.split(/[×xX*]/);
                                    const dimLabel =
                                      widthCm && heightCm
                                        ? `${widthCm.trim()} × ${heightCm.trim()} см`
                                        : `${sv.sizeCm} см`;
                                    const szPoQty = allocPoVariantPacks[idx] || 0;
                                    const sharePct =
                                      po.packsQty > 0
                                        ? Math.round((szPoQty / po.packsQty) * 100)
                                        : 0;
                                    return (
                                      <div
                                        key={sv.sellerSku}
                                        className="rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 py-2 space-y-1"
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-bold text-[#141413] truncate">
                                            {dimLabel}
                                          </span>
                                          <span className="font-mono text-[10px] text-[#686762]">
                                            {sharePct}%
                                          </span>
                                        </div>
                                        <div className="font-mono text-[10px] text-[#686762] truncate">
                                          {sv.sellerSku}
                                        </div>
                                        <div className="font-mono text-[13.5px] font-extrabold text-[#141413]">
                                          {szPoQty.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                        </div>
                                        <div className="flex items-center justify-between font-mono text-[9.5px] text-[#52514C]">
                                          <span>
                                            План: {sv.annualBuyoutsUnits.toLocaleString('ru-RU')} вык. / {sv.annualOrdersUnits.toLocaleString('ru-RU')} зак.
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between font-mono text-[10px] text-[#52514C] pt-0.5 border-t border-[#ECEBE4]">
                                          <span>{hasCost ? `по ${sv.unitCostRub} ₽` : 'Себест.: Скрыто'}</span>
                                          <strong className="text-[#146C43]">
                                            {hasCost
                                              ? `${(szPoQty * sv.unitCostRub).toLocaleString('ru-RU')} ₽`
                                              : 'Скрыто'}
                                          </strong>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            );
                          })()
                        ) : useMultiSizeProfileGrid && !po.sizeBreakdownPacks ? (
                          (() => {
                            const allocMulti = allocateAcrossProfileSizes(
                              po.packsQty,
                              brandProdProfile.sizes,
                              brandProdProfile.sizeSharesPct
                            );
                            return (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[11.5px] font-semibold text-[#52514C]">
                                    Распределение заказа {po.orderNumber} по размерному ряду {sizeRangeLabel} ({brandProdProfile.sizes.length} разм.):
                                  </span>
                                  <span className="font-mono text-[11px] font-bold text-[#146C43]">
                                    Итого в PO: {po.packsQty.toLocaleString('ru-RU')} {unitLabels.primaryShort} (100%)
                                  </span>
                                </div>
                                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 text-center text-[11px]">
                                  {brandProdProfile.sizes.map((sz) => {
                                    const szPacks = allocMulti[sz] || 0;
                                    const sharePct =
                                      brandProdProfile.sizeSharesPct[sz] ??
                                      (po.packsQty > 0 ? Math.round((szPacks / po.packsQty) * 100) : 0);
                                    return (
                                      <div
                                        key={sz}
                                        className="flex flex-col justify-between rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 py-2"
                                      >
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="font-bold text-[#141413]">{sz}</span>
                                          <span className="font-mono text-[10px] text-[#686762]">
                                            {sharePct}%
                                          </span>
                                        </div>
                                        <div className="my-1 font-mono text-[13.5px] font-extrabold text-[#141413]">
                                          {szPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                        </div>
                                        {hasDistinctSecondaryUnit && (
                                          <div className="font-mono text-[10px] text-[#686762]">
                                            {(szPacks * po.unitsInPack).toLocaleString('ru-RU')} {unitLabels.secondaryShort}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  <div className="flex flex-col justify-between rounded-[8px] border border-[#BCE3CF] bg-[#F3FAF6] px-2.5 py-2 text-[#141413]">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="font-bold text-[#146C43]">ИТОГО</span>
                                      <span className="font-mono text-[10px] text-[#146C43]">100%</span>
                                    </div>
                                    <div className="my-1 font-mono text-[14px] font-extrabold text-[#141413]">
                                      {po.packsQty.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                    </div>
                                    {hasDistinctSecondaryUnit && (
                                      <div className="font-mono text-[10px] text-[#52514C]">
                                        {(po.packsQty * po.unitsInPack).toLocaleString('ru-RU')} {unitLabels.secondaryShort}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            );
                          })()
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11.5px] font-semibold text-[#52514C]">
                                Количество ({unitLabels.primaryShort}) по размерам {sizeRangeLabel}
                                {hasDistinctSecondaryUnit
                                  ? ` (${po.unitsInPack} ${unitLabels.secondaryShort} в 1 ${unitLabels.primaryShort})`
                                  : ''}{' '}
                                — меняйте любое поле, итог пересчитается сразу:
                              </span>
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => {
                                  if (!canEdit) return;
                                  const redistributed = allocatePacksBySizeLargestRemainder(
                                    po.packsQty,
                                    brandMappedFiveShares
                                  );
                                  const updated = updateApprovedPurchaseOrder(
                                    model,
                                    po.id,
                                    {
                                      sizeBreakdownPacks: redistributed,
                                    },
                                    auditAuthor
                                  );
                                  onUpdateModel(updated);
                                  triggerSavedIndicator('Размеры выровнены по %');
                                }}
                                className="rounded border border-[#CFCEC6] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#141413] hover:border-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Пересчитать по пропорции % ({brandMappedFiveShares.S}/{brandMappedFiveShares.M}/{brandMappedFiveShares.L}/{brandMappedFiveShares.XL}/{brandMappedFiveShares.XXL})
                              </button>
                            </div>

                            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px]">
                              {SIZES_LIST.map((sz, szIdx) => {
                                const szPacks = poSizes[sz] || 0;
                                const displaySz = displaySizeSlotLabels[szIdx] || sz;
                                const sharePct =
                                  poSizeTotal > 0 ? Math.round((szPacks / poSizeTotal) * 100) : 0;
                                return (
                                  <label
                                    key={sz}
                                    className="flex flex-col justify-between rounded-[8px] border border-[#CFCEC6] bg-white px-2.5 py-2 hover:border-[#141413] focus-within:border-[#141413] focus-within:ring-1 focus-within:ring-[#141413]"
                                  >
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="font-bold text-[#141413]">{displaySz}</span>
                                      <span className="font-mono text-[10px] text-[#686762]">
                                        {sharePct}%
                                      </span>
                                    </div>
                                    <div className="my-1 flex items-center justify-center gap-1">
                                      <NumericInput
                                        ariaLabel={`Размер ${displaySz} для ${po.orderNumber}`}
                                        value={szPacks}
                                        min={0}
                                        step={10}
                                        disabled={!canEdit}
                                        onChangeValue={(val) =>
                                          handleUpdatePoSizePacks(po, poSizes, sz, val)
                                        }
                                        className="w-full rounded border border-[#E4E3DC] bg-[#FAF9F6] py-1 text-center font-mono text-[13.5px] font-bold text-[#141413] focus:bg-white focus:border-[#141413] focus:outline-none"
                                      />
                                    </div>
                                    <div className="font-mono text-[10px] text-[#686762]">
                                      {hasDistinctSecondaryUnit
                                        ? `${unitLabels.primaryShort} · ${(szPacks * po.unitsInPack).toLocaleString('ru-RU')} ${unitLabels.secondaryShort}`
                                        : unitLabels.primaryShort}
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
                                  {poSizeTotal.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                </div>
                                {hasDistinctSecondaryUnit && (
                                  <div className="font-mono text-[10px] text-[#52514C]">
                                    {(poSizeTotal * po.unitsInPack).toLocaleString('ru-RU')} {unitLabels.secondaryShort}
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#52514C]">
                          <label className="inline-flex items-center gap-1.5">
                            <span className="font-medium">Статус поставки:</span>
                            <select
                              disabled={!canEdit}
                              value={po.status}
                              onChange={(e) => {
                                if (!canEdit) return;
                                const updated = updateApprovedPurchaseOrder(
                                  model,
                                  po.id,
                                  {
                                    status: e.target.value as ApprovedPurchaseOrder['status'],
                                  },
                                  auditAuthor
                                );
                                onUpdateModel(updated);
                                triggerSavedIndicator('Сохранено');
                              }}
                              className="h-8 rounded-md border border-[#CFCEC6] bg-white px-2.5 text-[12px] font-semibold text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
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
                            {hasCost ? (
                              <>
                                <NumericInput
                                  ariaLabel={`Цена ${unitLabels.primaryShort} в заказе ${po.orderNumber}`}
                                  value={po.lockedUnitCostRub}
                                  min={0}
                                  step={10}
                                  disabled={!canEdit}
                                  onChangeValue={(val) => {
                                    if (!canEdit || !hasCost) return;
                                    const updated = updateApprovedPurchaseOrder(
                                      model,
                                      po.id,
                                      {
                                        lockedUnitCostRub: val,
                                      },
                                      auditAuthor
                                    );
                                    onUpdateModel(updated);
                                    triggerSavedIndicator('Сохранено');
                                  }}
                                  className="h-8 w-20 rounded-md border border-[#CFCEC6] bg-white px-2 text-center font-mono text-[12.5px] font-bold text-[#141413] focus:border-[#141413] focus:outline-none"
                                />
                                <span>₽/{unitLabels.primaryShort}</span>
                              </>
                            ) : (
                              <span className="font-mono font-semibold text-[#686762]">Скрыто</span>
                            )}
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
                            disabled={!canEdit}
                            onClick={() => {
                              if (!canEdit) return;
                              const updated = removeApprovedPurchaseOrder(model, po.id, auditAuthor);
                              onUpdateModel(updated);
                              triggerSavedIndicator('Заказ удалён');
                            }}
                            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11.5px] font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <th className="px-3 py-2.5 text-right">К заказу ({unitLabels.primaryShort})</th>
                  <th className="px-3 py-2.5 text-right">Сумма и аванс</th>
                  <th className="py-2.5 pr-4 pl-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE9E2]">
                {proc.recommendedBatches.map((batch, bIdx) => {
                  const rowKey = `draft-${batch.periodId}`;
                  const isExpanded = activeExpandedKey === rowKey;
                  const isFirstStartBatch = bIdx === 0 && proc.approvedOrders.length === 0;
                  const periodIdxInList = activePeriods.findIndex(
                    (p) => p.id === batch.periodId
                  );
                  const periodDef =
                    periodIdxInList >= 0 ? activePeriods[periodIdxInList] : undefined;
                  const hasCustomPeriodFiveSlot = Boolean(
                    periodDef?.customSizeSharesPct || periodDef?.customSizeBreakdownPacks
                  );
                  const useMappedFiveSlot =
                    !hasCustomPeriodFiveSlot &&
                    isGenericSizeShares &&
                    modelBrandCode === 'NA_TELE' &&
                    brandProdProfile.sizes.length === 5;
                  const effectiveFiveShares = useMappedFiveSlot
                    ? brandMappedFiveShares
                    : batch.sizeSharesPct;
                  const effectiveFivePacks = useMappedFiveSlot
                    ? allocatePacksBySizeLargestRemainder(
                        batch.recommendedPacks,
                        brandMappedFiveShares
                      )
                    : batch.sizeBreakdownPacks;
                  const sizeTotalPacks = SIZES_LIST.reduce(
                    (s, sz) => s + (effectiveFivePacks[sz] || 0),
                    0
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
                        {/* 1. Партия, период покрытия и ключевые даты (чистое чтение без рамок инпутов в закрытой строке) */}
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
                                    Из оборота WB
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11.5px] text-[#686762]">
                                Приход к {formatHumanDateRu(batch.requiredArrivalDateIso)} · Заказ до{' '}
                                <span className="font-mono font-semibold text-[#141413]">
                                  {formatHumanDateRu(batch.recommendedOrderDateIso)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. План продаж периода */}
                        <td className="px-3 py-3.5 text-right">
                          <div className="font-mono text-[13.5px] font-semibold text-[#52514C]">
                            {batch.periodDemandPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
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
                                disabled={!canEdit}
                                onClick={() => {
                                  if (!canEdit) return;
                                  const step = fp.packMultiple || 50;
                                  const nextVal = Math.max(step, batch.recommendedPacks - step);
                                  handleUpdateDraftBatchPacks(batch.periodId, nextVal);
                                }}
                                className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#686762] hover:bg-white hover:text-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Уменьшить количество (остаток перейдёт в следующую партию)"
                              >
                                −
                              </button>
                              <NumericInput
                                ariaLabel={`Количество ${unitLabels.primaryShort} к заказу в партии №${bIdx + 1}`}
                                value={batch.recommendedPacks}
                                min={1}
                                step={fp.packMultiple || 50}
                                disabled={!canEdit}
                                onChangeValue={(val) =>
                                  handleUpdateDraftBatchPacks(batch.periodId, val)
                                }
                                className="h-7 w-20 text-center font-mono text-[13.5px] font-bold text-[#141413] bg-transparent focus:outline-none"
                              />
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => {
                                  if (!canEdit) return;
                                  const step = fp.packMultiple || 50;
                                  const nextVal = batch.recommendedPacks + step;
                                  handleUpdateDraftBatchPacks(batch.periodId, nextVal);
                                }}
                                className="h-7 w-6 rounded-[6px] text-[14px] font-bold text-[#686762] hover:bg-white hover:text-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Увеличить количество (следующая партия уменьшится на эту разницу)"
                              >
                                +
                              </button>
                            </div>
                            {(hasDistinctSecondaryUnit || batch.hasCustomPacksOverride) && (
                              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] text-[#686762]">
                                {hasDistinctSecondaryUnit && (
                                  <span>
                                    {batch.physicalUnitsQty.toLocaleString('ru-RU')} {unitLabels.secondaryShort}
                                  </span>
                                )}
                                {batch.hasCustomPacksOverride && canEdit && (
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
                            )}
                          </div>
                        </td>

                        {/* 4. Сумма партии и аванс */}
                        <td className="px-3 py-3.5 text-right">
                          <div
                            className={`font-mono text-[15px] font-extrabold ${
                              isFirstStartBatch ? 'text-[#157347]' : 'text-[#141413]'
                            }`}
                          >
                            {hasCost ? formatRubMillions(batch.estimatedTotalRub) : 'Скрыто'}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#686762]">
                            Аванс {fp.prepaymentPct}%:{' '}
                            <span className="font-semibold text-[#52514C]">
                              {hasCost ? formatRubMillions(batch.prepaymentRub) : 'Скрыто'}
                            </span>
                          </div>
                        </td>

                        {/* 5. Размеры и утверждение (разбиение и даты — внутри «Размеры и расчёт ▾») */}
                        <td
                          onClick={(e) => e.stopPropagation()}
                          className="py-3.5 pr-4 pl-3 text-right"
                        >
                          <div className="inline-flex items-center gap-1.5">
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
                              disabled={!canEdit}
                              onClick={() => handleApproveDraftBatch(batch)}
                              className="h-8 rounded-[7px] border border-[#BCE3CF] bg-[#F3FAF6] px-3 text-[11.5px] font-semibold text-[#146C43] hover:bg-[#157347] hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              ✓ Утвердить заказ
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Раскрываемая детализация партии: выбор дат, периода, формула расчёта и интерактивная размерная сетка */}
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
                                    disabled={!canEdit}
                                    value={batch.firstCoveredMonthIdx}
                                    onChange={(e) => {
                                      if (!canEdit) return;
                                      const nextStart = Number(e.target.value);
                                      updateDraftPeriodDef(batch.periodId, (prev) => ({
                                        ...prev,
                                        startMonthIdx: nextStart,
                                        endMonthIdx: Math.max(nextStart, prev.endMonthIdx),
                                      }));
                                    }}
                                    className="font-bold text-[#141413] bg-transparent focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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
                                    disabled={!canEdit}
                                    value={batch.endCoveredMonthIdx}
                                    onChange={(e) => {
                                      if (!canEdit) return;
                                      const nextEnd = Number(e.target.value);
                                      updateDraftPeriodDef(batch.periodId, (prev) => ({
                                        ...prev,
                                        endMonthIdx: Math.max(prev.startMonthIdx, nextEnd),
                                      }));
                                    }}
                                    className="font-bold text-[#141413] bg-transparent focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
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
                                    disabled={!canEdit}
                                    value={batch.recommendedOrderDateIso}
                                    onChange={(e) => {
                                      if (!canEdit || !e.target.value) return;
                                      updateDraftPeriodDef(batch.periodId, (prev) => ({
                                        ...prev,
                                        customOrderDateIso: e.target.value,
                                      }));
                                    }}
                                    className="font-mono text-[11.5px] font-semibold text-[#141413] bg-transparent focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                                  />
                                </label>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {canMergeNext && (
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() => handleMergeWithNextPeriod(batch.periodId)}
                                    className="rounded-[7px] border border-[#CFCEC6] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#141413] hover:bg-[#F4F3EE] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Объединить со следующей
                                  </button>
                                )}
                                {canSplit && (
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() => handleSplitPeriod(batch.periodId)}
                                    className="rounded-[7px] border border-[#CFCEC6] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#141413] hover:bg-[#F4F3EE] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Разделить на две
                                  </button>
                                )}
                                {(batch.hasCustomPacksOverride || batch.hasCustomDateOverride || hasCustomPeriodFiveSlot) && (
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      updateDraftPeriodDef(batch.periodId, (prev) => ({
                                        ...prev,
                                        customPacksQty: null,
                                        customOrderDateIso: null,
                                        customSizeSharesPct: null,
                                        customSizeBreakdownPacks: null,
                                      }))
                                    }
                                    className="rounded-[7px] border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    ↺ Сбросить правки
                                  </button>
                                )}
                                {activePeriods.length > 1 && (
                                  <button
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() => handleDeleteDraftPeriod(batch.periodId)}
                                    className="rounded-[7px] border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11.5px] font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Удалить
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="rounded-[9px] border border-[#E4E3DC] bg-white px-3.5 py-2.5 text-[12px] text-[#52514C]">
                              <span className="font-semibold text-[#141413]">Формула партии: </span>
                              Выкупы ({batch.periodDemandPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}) +
                              Запас ({batch.safetyStockPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}) −
                              Остаток к началу ({batch.openingAvailableAtStartPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}) −
                              Утверждённые PO ({batch.confirmedReceiptsInPeriodPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}) ={' '}
                              <strong className="text-[#141413]">
                                чистая потребность {batch.rawNetNeedPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                              </strong>{' '}
                              → к заказу:{' '}
                              <strong className="font-mono text-[#141413]">
                                {batch.recommendedPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                {hasDistinctSecondaryUnit
                                  ? ` (${batch.physicalUnitsQty.toLocaleString('ru-RU')} ${unitLabels.secondaryShort})`
                                  : ''}
                              </strong>
                            </div>

                            {/* ПОРАЗМЕРНАЯ СЕТКА ЧЕРНОВОЙ ПАРТИИ (для LISKANI — реальные размеры полотен 300×240..600×270, для остальных — по профилю бренда!) */}
                            <div className="mt-3 rounded-[9px] border border-[#E4E3DC] bg-white p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[11.5px] font-semibold text-[#141413]">
                                  {model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0
                                    ? `Распределение партии №${bIdx + 1} (${batch.coverageMonthsLabel}) по размерам полотен (${model.liskaniSizeVariants.length} SKU):`
                                    : useMultiSizeProfileGrid && !hasCustomPeriodFiveSlot
                                    ? `Распределение партии №${bIdx + 1} по размерному ряду ${sizeRangeLabel} (${brandProdProfile.sizes.length} разм.):`
                                    : `Размеры партии (${sizeRangeLabel}, нажмите на любое число или %, чтобы изменить напрямую):`}
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
                                  {(!model.liskaniSizeVariants || model.liskaniSizeVariants.length === 0) &&
                                    (!useMultiSizeProfileGrid || hasCustomPeriodFiveSlot) && (
                                      <button
                                        type="button"
                                        disabled={!canEdit}
                                        onClick={() =>
                                          updateDraftPeriodDef(batch.periodId, (prev) => ({
                                            ...prev,
                                            customSizeSharesPct: null,
                                            customSizeBreakdownPacks: null,
                                          }))
                                        }
                                        className="rounded border border-[#CFCEC6] bg-[#F8F8F5] px-2.5 py-0.5 text-[11px] font-semibold text-[#141413] hover:bg-[#EFEFE9] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        Выровнять по базовой матрице ({brandMappedFiveShares.S}/{brandMappedFiveShares.M}/{brandMappedFiveShares.L}/{brandMappedFiveShares.XL}/{brandMappedFiveShares.XXL}%)
                                      </button>
                                    )}
                                </div>
                              </div>

                              {model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0 ? (
                                (() => {
                                  const variantDemands = model.liskaniSizeVariants.map((sv) => {
                                    let d = 0;
                                    for (
                                      let mIdx = batch.firstCoveredMonthIdx;
                                      mIdx <= batch.endCoveredMonthIdx;
                                      mIdx++
                                    ) {
                                      d += proc.procureByOrdersVolume
                                        ? sv.monthlyOrdersUnits?.[mIdx] ??
                                          sv.monthlyBuyoutsUnits[mIdx] ??
                                          0
                                        : sv.monthlyBuyoutsUnits[mIdx] || 0;
                                    }
                                    return d > 0
                                      ? d
                                      : sv.annualOrdersUnits || sv.annualBuyoutsUnits || 1;
                                  });
                                  const periodTotalVariantDemand = variantDemands.reduce(
                                    (sum, d) => sum + d,
                                    0
                                  );
                                  const exactVariantPacks = variantDemands.map((d) =>
                                    periodTotalVariantDemand > 0
                                      ? (batch.recommendedPacks * d) / periodTotalVariantDemand
                                      : batch.recommendedPacks / model.liskaniSizeVariants!.length
                                  );
                                  const allocVariantPacks = exactVariantPacks.map((v) =>
                                    Math.floor(v)
                                  );
                                  let remVar =
                                    batch.recommendedPacks -
                                    allocVariantPacks.reduce((s, v) => s + v, 0);
                                  const fracVar = exactVariantPacks
                                    .map((v, idx) => ({ idx, frac: v - Math.floor(v) }))
                                    .sort((a, b) => b.frac - a.frac);
                                  for (let i = 0; i < fracVar.length && remVar > 0; i++) {
                                    allocVariantPacks[fracVar[i].idx] += 1;
                                    remVar -= 1;
                                  }

                                  return (
                                    <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 text-left text-[11px]">
                                      {model.liskaniSizeVariants.map((sv, svIdx) => {
                                        const szBatchPacks = allocVariantPacks[svIdx] || 0;
                                        const sharePct =
                                          batch.recommendedPacks > 0
                                            ? Math.round(
                                                (szBatchPacks / batch.recommendedPacks) * 100
                                              )
                                            : 0;
                                        const szBatchRub = szBatchPacks * sv.unitCostRub;
                                        return (
                                          <div
                                            key={sv.sellerSku}
                                            className="rounded-[8px] border border-[#CFCEC6] bg-[#FAF9F6] px-2.5 py-2 space-y-1"
                                          >
                                            <div className="flex items-center justify-between gap-1">
                                              <span className="font-bold text-[#141413] truncate">
                                                {sv.sizeCm} см
                                              </span>
                                              <span className="font-mono text-[10px] text-[#686762]">
                                                {sharePct}%
                                              </span>
                                            </div>
                                            <div className="font-mono text-[13.5px] font-extrabold text-[#141413]">
                                              {szBatchPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                            </div>
                                            <div className="flex items-center justify-between font-mono text-[10px] text-[#52514C]">
                                              <span>
                                                {hasCost ? `по ${sv.unitCostRub} ₽` : 'Себест.: Скрыто'}
                                              </span>
                                              <strong className="text-[#146C43]">
                                                {hasCost
                                                  ? `${szBatchRub.toLocaleString('ru-RU')} ₽`
                                                  : 'Скрыто'}
                                              </strong>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()
                              ) : useMultiSizeProfileGrid && !hasCustomPeriodFiveSlot ? (
                                (() => {
                                  const allocMulti = allocateAcrossProfileSizes(
                                    batch.recommendedPacks,
                                    brandProdProfile.sizes,
                                    brandProdProfile.sizeSharesPct
                                  );
                                  return (
                                    <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 text-center text-[11px]">
                                      {brandProdProfile.sizes.map((sz) => {
                                        const packsForSize = allocMulti[sz] || 0;
                                        const sharePct =
                                          brandProdProfile.sizeSharesPct[sz] ??
                                          (batch.recommendedPacks > 0
                                            ? Math.round((packsForSize / batch.recommendedPacks) * 100)
                                            : 0);
                                        return (
                                          <div
                                            key={sz}
                                            className="flex flex-col justify-between rounded-[8px] border border-[#CFCEC6] bg-[#FAF9F6] px-2.5 py-2"
                                          >
                                            <div className="flex items-center justify-between gap-1 text-[11px]">
                                              <span className="font-bold text-[#141413]">{sz}</span>
                                              <span className="font-mono text-[10.5px] font-semibold text-[#52514C]">
                                                {sharePct}%
                                              </span>
                                            </div>
                                            <div className="my-1.5 font-mono text-[14px] font-extrabold text-[#141413]">
                                              {packsForSize.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                            </div>
                                            {hasDistinctSecondaryUnit && (
                                              <div className="font-mono text-[10px] text-[#686762]">
                                                {(packsForSize * model.unitsInPack).toLocaleString('ru-RU')} {unitLabels.secondaryShort}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                      <div className="flex flex-col justify-between rounded-[8px] border border-[#BCE3CF] bg-[#F3FAF6] px-2.5 py-2 text-[#141413]">
                                        <div className="flex items-center justify-between text-[11px] font-semibold text-[#146C43]">
                                          <span>ИТОГО</span>
                                          <span>100%</span>
                                        </div>
                                        <div className="my-1.5 font-mono text-[15px] font-extrabold text-[#141413]">
                                          {batch.recommendedPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                        </div>
                                        {hasDistinctSecondaryUnit && (
                                          <div className="font-mono text-[10px] text-[#52514C]">
                                            {(batch.recommendedPacks * model.unitsInPack).toLocaleString('ru-RU')} {unitLabels.secondaryShort}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()
                              ) : (
                                <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-[11px]">
                                  {SIZES_LIST.map((sz, szIdx) => {
                                    const packsForSize = effectiveFivePacks[sz] || 0;
                                    const unitsForSize = packsForSize * model.unitsInPack;
                                    const displaySz = displaySizeSlotLabels[szIdx] || sz;
                                    return (
                                      <div
                                        key={sz}
                                        className="flex flex-col justify-between rounded-[8px] border border-[#CFCEC6] bg-[#FAF9F6] px-2.5 py-2 hover:border-[#B8B7AE] focus-within:border-[#9E9D95] focus-within:bg-white"
                                      >
                                        <div className="flex items-center justify-between gap-1 text-[11px]">
                                          <span className="font-bold text-[#141413]">{displaySz}</span>
                                          <div className="inline-flex items-center gap-0.5">
                                            <NumericInput
                                              ariaLabel={`Доля размера ${displaySz} в % для партии №${bIdx + 1}`}
                                              value={effectiveFiveShares[sz]}
                                              min={0}
                                              max={100}
                                              disabled={!canEdit}
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
                                            ariaLabel={`Количество ${unitLabels.primaryShort} размера ${displaySz} в партии №${bIdx + 1}`}
                                            value={packsForSize}
                                            min={0}
                                            step={10}
                                            disabled={!canEdit}
                                            onChangeValue={(val) =>
                                              handleUpdateDraftBatchSizePacks(batch, sz, val)
                                            }
                                            className="w-full rounded border border-[#D8D7CE] bg-white py-1 text-center font-mono text-[13.5px] font-bold text-[#141413] focus:border-[#9E9D95] focus:outline-none"
                                          />
                                        </div>

                                        <div className="font-mono text-[10px] text-[#686762]">
                                          {hasDistinctSecondaryUnit
                                            ? `${unitLabels.primaryShort} · ${unitsForSize.toLocaleString('ru-RU')} ${unitLabels.secondaryShort}`
                                            : unitLabels.primaryShort}
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
                                      {sizeTotalPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                                    </div>
                                    {hasDistinctSecondaryUnit && (
                                      <div className="font-mono text-[10px] text-[#52514C]">
                                        {(sizeTotalPacks * model.unitsInPack).toLocaleString('ru-RU')} {unitLabels.secondaryShort}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
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
                    {proc.annualDemandPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {proc.totalRecommendedPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                    {hasDistinctSecondaryUnit && (
                      <>
                        {' '}
                        <span className="text-[11px] font-normal text-[#686762]">
                          ({proc.totalRecommendedUnits.toLocaleString('ru-RU')} {unitLabels.secondaryShort})
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {!hasCost
                      ? 'Скрыто'
                      : proc.totalRecommendedBudgetRub !== null
                      ? formatRubMillions(proc.totalRecommendedBudgetRub)
                      : '—'}
                  </td>
                  <td className="py-3 pr-4 pl-3 text-right text-[11px] font-semibold text-[#146C43]">
                    {hasCost
                      ? `Старт Q1: ${formatRubMillions(firstStartWave.totalRub)} (аванс ${formatRubMillions(firstStartWave.prepayRub)})`
                      : 'Старт Q1: Скрыто'}
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
                disabled={!canEdit}
                onClick={() => handleUpdateScalingStage('scaling')}
                className="rounded-[8px] border border-[#CECDC4] bg-[#F5F5F1] px-3 py-1.5 text-[12px] font-semibold text-[#141413] hover:bg-[#EAE9E2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                      {fb.recommendedPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}
                    </span>
                    <span>·</span>
                    <span className="font-mono">
                      {hasCost ? formatRubMillions(fb.estimatedTotalRub) : 'Скрыто'}
                    </span>
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
              ✓ Потребность в закупках полностью закрыта доступным товаром (склад: {proc.netOpeningAvailablePacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}, утверждённые PO: {proc.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} {unitLabels.primaryShort}).
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
                  <th className="py-2 pr-3 pl-2 font-semibold">
                    Показатель ({unitLabels.primaryShort})
                  </th>
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
