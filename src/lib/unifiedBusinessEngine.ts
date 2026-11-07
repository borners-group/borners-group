// Единый движок архитектуры данных, закупок и финансов по ТЗ v1.1
// «Единая платформа управления товарным бизнесом»: Продукт -> Продажи -> Закупки -> Финансы

import type { GrowthScenarioDef, ScenarioModelSpec } from './scenarioData.ts';
import { getActingSkuByWbOrVendor } from './actingAssortment2027.ts';
import { getS1NewVariantByCodeOrId, isUnverifiedActingSku } from './scenarioS1_100M.ts';

export type ValueStatusCode =
  | 'fact'
  | 'approved'
  | 'plan'
  | 'hypothesis'
  | 'not_filled';

export const VALUE_STATUS_LABELS_RU: Record<ValueStatusCode, string> = {
  fact: 'Факт',
  approved: 'Утверждено',
  plan: 'План',
  hypothesis: 'Гипотеза',
  not_filled: 'Не заполнено',
};

export type GalleryCategoryV11 =
  | 'pack'
  | 'single'
  | 'construction'
  | 'waistband'
  | 'fabric'
  | 'pantone'
  | 'packaging'
  | 'fit'
  | 'video';

export const GALLERY_CATEGORY_LABELS_RU: Record<GalleryCategoryV11, string> = {
  pack: 'Комплект',
  single: 'Отдельное изделие',
  construction: 'Конструкция спереди/сзади',
  waistband: 'Резинка',
  fabric: 'Ткань',
  pantone: 'Pantone',
  packaging: 'Упаковка',
  fit: 'Посадка',
  video: 'Видео',
};

export type ModelScalingStage = 'hypothesis' | 'test' | 'scaling';

export const MODEL_SCALING_STAGE_LABELS_RU: Record<ModelScalingStage, string> = {
  hypothesis: 'Гипотеза',
  test: 'Тест',
  scaling: 'Масштабирование',
};

export interface CustomBatchPeriodDef {
  id: string;
  startMonthIdx: number; // 0..11
  endMonthIdx: number; // 0..11 (>= startMonthIdx)
  customPacksQty?: number | null; // ручная корректировка количества комплектов до утверждения
  customOrderDateIso?: string | null; // ручная корректировка даты заказа до утверждения
  customSizeSharesPct?: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number> | null; // ручная корректировка долей % для конкретной партии
}

export const DEFAULT_QUARTERLY_BATCH_PERIODS: CustomBatchPeriodDef[] = [
  { id: 'q1', startMonthIdx: 0, endMonthIdx: 2 },
  { id: 'q2', startMonthIdx: 3, endMonthIdx: 5 },
  { id: 'q3', startMonthIdx: 6, endMonthIdx: 8 },
  { id: 'q4', startMonthIdx: 9, endMonthIdx: 11 },
];

export interface FactoryProcurementParams {
  factoryName: string;
  moqPacks: number; // MOQ в комплектах
  packMultiple: number; // кратность короба в комплектах
  productionLeadDays: number; // производство (например 30 или 60 дней)
  qcDays: number; // контроль качества
  logisticsLeadDays: number; // транспортировка в РФ
  acceptanceDays: number; // приёмка и распределение на склады MP
  safetyStockDays: number; // страховой запас в днях продаж
  coverageWindowMonths: number; // глубина покрытия одной партии (мес.)
  prepaymentPct: number; // предоплата % при запуске в производство
  balancePaymentPct: number; // доплата % перед отгрузкой
  currency: 'RUB' | 'CNY' | 'USD';
  sizeSharesPct: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number>;
  customBatchPeriods?: CustomBatchPeriodDef[];
}

export interface ApprovedPurchaseOrder {
  id: string;
  orderNumber: string; // например PO-2027-001
  version: number;
  status: 'approved' | 'in_production' | 'in_transit' | 'received';
  confirmedByFactory?: boolean; // по умолчанию true; если false — не считается гарантированным поступлением (Раздел 12 ТЗ)
  factoryName: string;
  approvedAt: string;
  approvedBy: string;
  arrivalMonthIdx: number; // 0..11 (Янв..Дек 2027)
  coveredEndMonthIdx?: number; // 0..11
  coverageMonthsLabel?: string; // например Янв–Мар 2027
  requiredArrivalDateIso: string; // YYYY-MM-DD
  orderPlacementDateIso: string; // зафиксированная дата размещения заказа при утверждении
  leadTimeDaysAtApproval: number; // зафиксированный цикл на момент утверждения
  packsQty: number; // количество комплектов
  unitsInPack: number; // изделий в 1 комплекте
  physicalUnitsQty: number; // физические изделия = packsQty * unitsInPack
  lockedUnitCostRub: number; // себестоимость за 1 комплект на момент утверждения
  totalOrderRub: number; // строго packsQty * lockedUnitCostRub (без повторного умножения на unitsInPack!)
  prepaymentRub: number;
  balancePaymentRub: number;
  sizeBreakdownPacks?: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number>;
  note?: string;
}

export interface ActualMonthSaleRecord {
  monthIdx: number; // 0..11
  actualBuyoutsPacks: number | null; // null = факт ещё не наступил / не заполнен (НЕ ноль!)
  actualPriceRub: number | null;
}

export interface ModelAuditEntry {
  id: string;
  timestamp: string;
  author: string;
  category: 'product' | 'sales' | 'procurement' | 'finance';
  summary: string;
  beforeValue?: string;
  afterValue?: string;
  passportVersion?: number;
}

export interface ChannelSplitPct {
  wb: number;
  otherMp: number;
  website: number;
}

export interface SharedSkuSupplyAndFact {
  // Общие реальные остатки и заказы (единые между всеми сценариями 100 / 150 / 200 млн ₽!)
  actualOpeningStockPacks: number;
  reservedStockPacks: number;
  scalingStage?: ModelScalingStage; // Гипотеза -> Тест -> Масштабирование (Раздел 8 ТЗ)
  costStatus: ValueStatusCode;
  confirmedUnitCostRub: number | null;
  expensesFilled: boolean; // заполнены ли реальные расходы MP / логистики / OPEX
  otherVariableRubPerPack: number; // прочие переменные расходы ₽/компл.
  allocatedFixedOpexRubPerPack: number | null; // распределённые постоянные расходы OPEX ₽/компл. (null = не заполнено)
  settlementLagMonths: number; // задержка поступления выручки от MP (в месяцах, 0 или 1)
  factoryParams: FactoryProcurementParams;
  approvedOrders: ApprovedPurchaseOrder[];
  actualSalesByMonth: ActualMonthSaleRecord[];
  passportVersion: number;
  auditHistory: ModelAuditEntry[];
}

export interface RecommendedProcurementBatch {
  batchIndex: number;
  periodId: string;
  factoryName: string;
  coverageMonthsLabel: string;
  firstCoveredMonthIdx: number;
  endCoveredMonthIdx: number;
  requiredArrivalDateIso: string;
  recommendedOrderDateIso: string;
  totalLeadDays: number;
  periodDemandPacks: number;
  openingAvailableAtStartPacks: number;
  confirmedReceiptsInPeriodPacks: number;
  rawNetNeedPacks: number;
  safetyStockPacks: number;
  recommendedPacks: number; // округлено с учётом MOQ и кратности короба
  physicalUnitsQty: number; // recommendedPacks * unitsInPack
  unitCostRub: number;
  estimatedTotalRub: number; // строго recommendedPacks * unitCostRub (если себестоимость задана)
  prepaymentRub: number;
  balancePaymentRub: number;
  isUrgentPastOrderDate: boolean;
  isAdditionalOrder?: boolean; // true, если в периоде уже есть утверждённый PO, но план продаж вырос («Дополнительно к заказу»)
  isTestBatch?: boolean; // true для первой тестовой партии при статусе «Гипотеза» / «Тест»
  isFutureScalingNeed?: boolean; // true для будущих кварталов до перехода в статус «Масштабирование»
  hasCustomPacksOverride?: boolean;
  hasCustomDateOverride?: boolean;
  sizeSharesPct: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number>;
  sizeBreakdownPacks: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number>;
  colorBreakdownUnits: { colorName: string; unitsQty: number }[];
}

export interface ApprovedOrderDiscrepancy {
  orderId: string;
  orderNumber: string;
  message: string;
  recalculatedOrderDateIso: string;
  daysShifted: number;
  costDeltaRub: number;
}

export interface MonthlySupplyBalanceRow {
  monthIdx: number;
  monthLabel: string;
  demandPacks: number;
  demandUnits: number;
  approvedReceiptsPacks: number;
  approvedReceiptsUnits: number;
  openingAvailablePacks: number;
  endingAvailablePacks: number; // может быть отрицательным -> дефицит!
  deficitPacks: number;
  deficitUnits: number;
}

export interface ProcurementComputationResult {
  unitsInPack: number;
  totalLeadDays: number;
  scalingStage: ModelScalingStage;
  actualOpeningStockPacks: number;
  reservedStockPacks: number;
  netOpeningAvailablePacks: number;
  annualDemandPacks: number;
  annualDemandUnits: number;
  totalApprovedReceiptsPacks: number;
  totalApprovedReceiptsUnits: number;
  totalDeficitPacks: number;
  totalDeficitUnits: number;
  hasDeficit: boolean;
  coveredMonthsCount: number;
  supplyStatusLabel: string;
  supplyStatusTone: 'danger' | 'warning' | 'success' | 'neutral';
  monthlyBalance: MonthlySupplyBalanceRow[];
  recommendedBatches: RecommendedProcurementBatch[];
  futureScalingBatches: RecommendedProcurementBatch[];
  allPeriodBatches: RecommendedProcurementBatch[];
  totalRecommendedPacks: number;
  totalRecommendedUnits: number;
  totalRecommendedBudgetRub: number | null;
  futureScalingPacks: number;
  futureScalingBudgetRub: number | null;
  approvedOrders: ApprovedPurchaseOrder[];
  orderDiscrepancies: ApprovedOrderDiscrepancy[];
}

export interface MonthlyCashFlowRow {
  monthIdx: number;
  monthLabel: string;
  inflowSalesRub: number;
  outflowProcurementRub: number;
  outflowVariableAndOpexRub: number;
  netCashFlowRub: number;
  cumulativeCashBalanceRub: number;
}

export interface FinancialPnLResult {
  revenueStatus: ValueStatusCode;
  costStatus: ValueStatusCode;
  marginStatus: ValueStatusCode;
  operatingProfitStatus: ValueStatusCode;

  annualBuyoutsPacks: number;
  annualBuyoutsUnits: number;
  avgRealizedPricePerPackRub: number;
  avgRealizedPricePerUnitRub: number;
  annualRevenueRub: number;
  targetMonthRevenueRub: number;
  targetMonthPacks: number;
  targetMonthUnits: number;

  unitCostPerPackRub: number | null;
  unitCostPerSingleItemRub: number | null;
  annualCogsRub: number | null;

  // 1. Валовая прибыль = Выручка - Себестоимость выкупленного товара
  unitGrossProfitRub: number | null;
  annualGrossProfitRub: number | null;
  grossMarginPct: number | null;

  // 2. Маржинальная прибыль = Валовая прибыль - комиссии MP - логистика - реклама - прочие переменные
  expensesFilled: boolean;
  unitMpCommissionRub: number | null;
  unitLogisticsRub: number | null;
  unitAdsRub: number | null;
  unitOtherVarRub: number | null;
  unitContributionMarginRub: number | null;
  annualMpCommissionRub: number | null;
  annualLogisticsRub: number | null;
  annualAdsRub: number | null;
  annualOtherVarRub: number | null;
  annualContributionMarginRub: number | null;
  contributionMarginPct: number | null;

  // 3. Операционная прибыль = Маржинальная прибыль - распределённые постоянные расходы OPEX
  opexFilled: boolean;
  unitAllocatedOpexRub: number | null;
  annualAllocatedOpexRub: number | null;
  unitOperatingProfitRub: number | null;
  annualOperatingProfitRub: number | null;
  operatingMarginPct: number | null;
  operatingProfitNotCalculatedReason: string | null;

  // 4. Потребность в капитале (денежный поток партий и продаж)
  monthlyCashFlow: MonthlyCashFlowRow[];
  peakCapitalDeficitRub: number;
  totalProcurementOutflowRub: number;
}

const MONTHS_SHORT = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
];

function subtractDaysFromMonthStart(year: number, monthIdx: number, daysToSubtract: number): string {
  // Начало нужного месяца (1-е число месяца в UTC) минус длительность цикла поставки
  const arrivalUtc = Date.UTC(year, monthIdx, 1);
  const orderUtc = arrivalUtc - daysToSubtract * 24 * 60 * 60 * 1000;
  const d = new Date(orderUtc);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getDefaultSharedSupplyAndFact(model: ScenarioModelSpec): SharedSkuSupplyAndFact {
  const codeUpper = (model.code || '').trim().toUpperCase();
  const isSorbetReference =
    codeUpper === 'BRN-001-SC' || model.id === 'scen-brn-001-sc';
  const s1Var =
    getS1NewVariantByCodeOrId(model.code) || getS1NewVariantByCodeOrId(model.id);
  const actingSku = getActingSkuByWbOrVendor(model.code, model.title);

  // Для эталонного товара BRN-001-SC — Sorbet Club заполняем проверяемый профиль фабрики и расходов,
  // а для моделей без заданных расходов (DAILY, WOVEN 2PACK и др.) честно оставляем expensesFilled = false!
  const hasExplicitRates =
    isSorbetReference ||
    (model.unitCostRub > 0 &&
      (model.marketplaceFeePct > 0 || model.logisticsRub > 0 || model.adsPct > 0));

  const costStatus: ValueStatusCode = actingSku
    ? 'approved'
    : model.unitCostRub > 0
    ? s1Var?.isCostConfirmed
      ? 'plan'
      : 'plan'
    : 'not_filled';

  const defaultScalingStage: ModelScalingStage = 'scaling';

  return {
    actualOpeningStockPacks: 0,
    reservedStockPacks: 0,
    scalingStage: defaultScalingStage,
    costStatus,
    confirmedUnitCostRub: actingSku ? actingSku.unitCogRub : null,
    expensesFilled: hasExplicitRates,
    otherVariableRubPerPack: isSorbetReference ? 35 : 0,
    allocatedFixedOpexRubPerPack: isSorbetReference
      ? 65
      : hasExplicitRates
      ? 55
      : null,
    settlementLagMonths: 0,
    factoryParams: {
      factoryName: actingSku
        ? 'Действующий поставщик ИП Нерсесянц'
        : isSorbetReference
        ? 'Zhongshan Knitwear Factory #1 (КНР)'
        : 'Фабрика-партнёр BORNERS (КНР)',
      moqPacks: isSorbetReference ? 1000 : 1000,
      packMultiple: 50,
      productionLeadDays: 30,
      qcDays: 3,
      logisticsLeadDays: 14,
      acceptanceDays: 3,
      safetyStockDays: 15,
      coverageWindowMonths: 3,
      prepaymentPct: 30,
      balancePaymentPct: 70,
      currency: 'RUB',
      sizeSharesPct: { S: 10, M: 25, L: 35, XL: 20, XXL: 10 },
    },
    approvedOrders: [],
    actualSalesByMonth: Array.from({ length: 12 }, (_, idx) => ({
      monthIdx: idx,
      actualBuyoutsPacks: null,
      actualPriceRub: null,
    })),
    passportVersion: 1,
    auditHistory: [
      {
        id: `aud-init-${model.id}`,
        timestamp: '2026-11-07 18:00',
        author: 'Система (ТЗ v1.1)',
        category: 'product',
        summary: 'Инициализирован единый паспорт SKU, общие остатки и контур закупок v1.1',
        passportVersion: 1,
      },
    ],
  };
}

export function ensureModelUnifiedV11(model: ScenarioModelSpec): ScenarioModelSpec {
  const codeUpper = (model.code || '').trim().toUpperCase();
  const isSorbetReference =
    codeUpper === 'BRN-001-SC' || model.id === 'scen-brn-001-sc';

  const baseShared = getDefaultSharedSupplyAndFact(model);
  const existingShared = model.sharedSupplyAndFact;

  const mergedShared: SharedSkuSupplyAndFact = existingShared
    ? {
        ...baseShared,
        ...existingShared,
        factoryParams: {
          ...baseShared.factoryParams,
          ...(existingShared.factoryParams || {}),
          sizeSharesPct: {
            ...baseShared.factoryParams.sizeSharesPct,
            ...(existingShared.factoryParams?.sizeSharesPct || {}),
          },
        },
        approvedOrders: Array.isArray(existingShared.approvedOrders)
          ? existingShared.approvedOrders
          : [],
        actualSalesByMonth:
          Array.isArray(existingShared.actualSalesByMonth) &&
          existingShared.actualSalesByMonth.length === 12
            ? existingShared.actualSalesByMonth
            : baseShared.actualSalesByMonth,
        auditHistory: Array.isArray(existingShared.auditHistory)
          ? existingShared.auditHistory
          : baseShared.auditHistory,
      }
    : baseShared;

  const enrichedGallery =
    isSorbetReference && model.gallery.length <= 1
      ? [
          {
            id: model.gallery[0]?.id || 'g-sc-pack',
            category: 'pack' as const,
            label: 'Комплект Sorbet Club (4 шт. · оригинал 1448×1086)',
            url: model.gallery[0]?.url || 'images/products/s1-100m/BRN-001-SC.jpg',
            originalUrl: 'images/products/s1-100m/originals/BRN-001-SC-sheet-1.jpg',
            isMain: true,
          },
          {
            id: 'g-sc-single',
            category: 'single' as const,
            label: 'Отдельное изделие · Персиковый сорбет',
            url: 'images/products/s1-100m/originals/BRN-001-SC-single.jpg',
            originalUrl: 'images/products/s1-100m/originals/BRN-001-SC-single.jpg',
            isMain: false,
          },
          {
            id: 'g-sc-waistband',
            category: 'waistband' as const,
            label: 'Жаккардовый пояс BORNERS тон в тон (макро)',
            url: 'images/products/s1-100m/originals/BRN-001-SC-waistband.jpg',
            originalUrl: 'images/products/s1-100m/originals/BRN-001-SC-waistband.jpg',
            isMain: false,
          },
          {
            id: 'g-sc-factory-sheet',
            category: 'construction' as const,
            label: 'Паспорт и техкарта Sorbet Club (HD оригинал)',
            url: 'images/products/s1-100m/originals/BRN-001-SC-factory-card.jpg',
            originalUrl: 'images/products/s1-100m/originals/BRN-001-SC-factory-card.jpg',
            isMain: false,
          },
        ]
      : model.gallery;

  // Для эталонного товара BRN-001-SC — Sorbet Club заполняем комиссии WB 24%, логистику 115 ₽ и рекламу 10%,
  // если они ещё стояли в 0 из первичного импорта S1, не трогая цену 2 490 ₽, себестоимость 600 ₽ и выкупы!
  if (
    isSorbetReference &&
    model.marketplaceFeePct === 0 &&
    model.logisticsRub === 0 &&
    model.adsPct === 0 &&
    !existingShared
  ) {
    return {
      ...model,
      gallery: enrichedGallery,
      marketplaceFeePct: 24,
      logisticsRub: 115,
      adsPct: 10,
      sharedSupplyAndFact: {
        ...mergedShared,
        expensesFilled: true,
        otherVariableRubPerPack: 35,
        allocatedFixedOpexRubPerPack: 65,
      },
    };
  }

  return {
    ...model,
    gallery: enrichedGallery,
    sharedSupplyAndFact: mergedShared,
  };
}

export function getModelChannelSplit(
  model: ScenarioModelSpec,
  scenarioId: number
): ChannelSplitPct {
  const plan = model.plansByScenario[scenarioId] || model.plansByScenario[1];
  if (plan?.channelSplitPct) {
    return plan.channelSplitPct;
  }
  const acting = getActingSkuByWbOrVendor(model.code, model.title);
  if (acting) {
    return { wb: 100, otherMp: 0, website: 0 };
  }
  return { wb: 82, otherMp: 13, website: 5 };
}

/**
 * Округление чистой потребности до MOQ и кратности шага заказа (Раздел 4 и Тест 3 ТЗ MVP Закупок).
 * MOQ и кратность применяются ТОЛЬКО после расчёта чистой потребности (не прибавляются как надбавка!).
 * Контрольный тест: MOQ = 1 000, потребность = 2 100, кратность = 1 000 -> заказ строго 3 000 (НЕ 3 100).
 */
export function roundNeedToMoqAndMultiple(
  rawNetNeedPacks: number,
  moqPacks: number,
  packMultiple = 1
): number {
  if (rawNetNeedPacks <= 0) return 0;
  const moq = Math.max(1, Math.round(moqPacks || 1));
  const step = Math.max(1, Math.round(packMultiple || 1));
  const afterMoq = Math.max(moq, Math.ceil(rawNetNeedPacks));
  return Math.ceil(afterMoq / step) * step;
}

/**
 * Распределение комплектов партии по размерам S–XXL методом наибольших остатков (Раздел 4, 5 и Тест 5 ТЗ MVP Закупок).
 * Сумма по размерам строго равна общему количеству комплектов партии без потери или лишних единиц!
 * Контрольный тест: партия 1 003 компл., матрица 10/25/35/20/10 -> 100 + 251 + 351 + 201 + 100 = 1 003.
 */
export function allocatePacksBySizeLargestRemainder(
  totalPacks: number,
  sizeSharesPct: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number>
): Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number> {
  const sizes: ('S' | 'M' | 'L' | 'XL' | 'XXL')[] = ['S', 'M', 'L', 'XL', 'XXL'];
  const cleanTotal = Math.max(0, Math.round(totalPacks || 0));
  if (cleanTotal === 0) {
    return { S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  }

  const rawWeights = sizes.map((sz) => Math.max(0, Number(sizeSharesPct?.[sz] ?? 0)));
  const weightSum = rawWeights.reduce((s, v) => s + v, 0);
  const normalizedWeights =
    weightSum > 0 ? rawWeights.map((w) => w / weightSum) : [0.1, 0.25, 0.35, 0.2, 0.1];

  const quotas = sizes.map((sz, idx) => {
    const exact = cleanTotal * normalizedWeights[idx];
    const floored = Math.floor(exact);
    return {
      sz,
      idx,
      floored,
      remainder: exact - floored,
      weight: normalizedWeights[idx],
    };
  });

  let remainderToDistribute =
    cleanTotal - quotas.reduce((sum, item) => sum + item.floored, 0);

  const sortedForRemainder = [...quotas].sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder;
    }
    if (Math.abs(b.weight - a.weight) > 1e-9) {
      return b.weight - a.weight;
    }
    return a.idx - b.idx;
  });

  for (let i = 0; i < sortedForRemainder.length && remainderToDistribute > 0; i++) {
    sortedForRemainder[i].floored += 1;
    remainderToDistribute -= 1;
  }

  const result: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number> = {
    S: 0,
    M: 0,
    L: 0,
    XL: 0,
    XXL: 0,
  };
  for (const item of quotas) {
    result[item.sz] = item.floored;
  }
  return result;
}

/**
 * Пересчёт чернового плана закупок («Рассчитать закупки» — Раздел 3 и Тест 8 ТЗ MVP Закупок).
 * Сбрасывает ручные переопределения черновых партий, но НИКОГДА не меняет уже утверждённые заказы PO!
 */
export function recalculateDraftProcurementPlan(
  rawModel: ScenarioModelSpec
): ScenarioModelSpec {
  const model = ensureModelUnifiedV11(rawModel);
  const shared = model.sharedSupplyAndFact!;
  const currentPeriods = shared.factoryParams.customBatchPeriods;
  const cleanedPeriods = Array.isArray(currentPeriods)
    ? currentPeriods.map((p) => ({
        id: p.id,
        startMonthIdx: p.startMonthIdx,
        endMonthIdx: p.endMonthIdx,
      }))
    : undefined;

  return {
    ...model,
    sharedSupplyAndFact: {
      ...shared,
      factoryParams: {
        ...shared.factoryParams,
        customBatchPeriods: cleanedPeriods,
      },
      // Утверждённые заказы PO остаются строго неизменными!
      approvedOrders: [...shared.approvedOrders],
    },
  };
}

/**
 * Раздел 04 ТЗ v1.1 + ТЗ MVP «Закупки»: Автоматическое планирование закупок
 * Считает в физических единицах (комплекты И изделия), учитывает общие реальные остатки,
 * подтверждённые фабрикой заказы PO, 4 квартальные партии (с возможностью объединения/деления),
 * MOQ, кратность шага, метод наибольших остатков для размеров S–XXL и статус масштабирования модели.
 */
export function computeProcurementPlan(
  rawModel: ScenarioModelSpec,
  scenario: GrowthScenarioDef
): ProcurementComputationResult {
  const model = ensureModelUnifiedV11(rawModel);
  const shared = model.sharedSupplyAndFact!;
  const fp = shared.factoryParams;
  const unitsInPack = Math.max(1, model.unitsInPack || 1);
  const year = scenario.year || 2027;
  const scalingStage: ModelScalingStage = shared.scalingStage || 'scaling';

  const plan =
    model.plansByScenario[scenario.id] ||
    model.plansByScenario[1] || {
      scenarioId: scenario.id,
      monthlyPacks: Array(12).fill(0),
      monthlyPricesRub: Array(12).fill(model.retailPriceRub),
      monthlyReceiptsPacks: Array(12).fill(0),
      initialStockPacks: 0,
      firstOrderPacks: 0,
      nextOrderDateLabel: '',
      salesStartMonthIdx: 0,
      warehouseArrivalMonthIdx: 0,
      warehouseArrivalDateLabel: '',
    };

  const totalLeadDays =
    Math.max(0, fp.productionLeadDays) +
    Math.max(0, fp.qcDays) +
    Math.max(0, fp.logisticsLeadDays) +
    Math.max(0, fp.acceptanceDays);

  // Раздел 12 ТЗ MVP: Неподтверждённые фабрикой заказы (confirmedByFactory === false) не считать гарантированными поступлениями!
  const approvedByMonth = Array(12).fill(0);
  for (const po of shared.approvedOrders) {
    if (po.confirmedByFactory === false) continue;
    if (po.arrivalMonthIdx >= 0 && po.arrivalMonthIdx < 12) {
      approvedByMonth[po.arrivalMonthIdx] += po.packsQty;
    }
  }

  const netOpeningAvailablePacks = Math.max(
    0,
    shared.actualOpeningStockPacks - shared.reservedStockPacks
  );

  // 1. Помесячный баланс реального обеспечения (ТОЛЬКО реальный остаток + подтверждённые фабрикой PO!)
  let runningAvailable = netOpeningAvailablePacks;
  const monthlyBalance: MonthlySupplyBalanceRow[] = [];
  let coveredMonthsCount = 0;
  let totalDeficitPacks = 0;

  for (let m = 0; m < 12; m++) {
    const demandPacks = Math.max(0, plan.monthlyPacks[m] || 0);
    const demandUnits = demandPacks * unitsInPack;
    const approvedReceiptsPacks = approvedByMonth[m] || 0;
    const approvedReceiptsUnits = approvedReceiptsPacks * unitsInPack;
    const openingAvailablePacks = runningAvailable;

    const afterReceipts = openingAvailablePacks + approvedReceiptsPacks;
    const endingAvailablePacks = afterReceipts - demandPacks;
    const monthUncovered = Math.max(0, demandPacks - Math.max(0, afterReceipts));

    if (demandPacks === 0 || afterReceipts >= demandPacks) {
      if (demandPacks > 0) coveredMonthsCount += 1;
    }
    totalDeficitPacks += monthUncovered;

    monthlyBalance.push({
      monthIdx: m,
      monthLabel: MONTHS_SHORT[m],
      demandPacks,
      demandUnits,
      approvedReceiptsPacks,
      approvedReceiptsUnits,
      openingAvailablePacks,
      endingAvailablePacks,
      deficitPacks: monthUncovered,
      deficitUnits: monthUncovered * unitsInPack,
    });

    runningAvailable = Math.max(0, endingAvailablePacks);
  }

  const annualDemandPacks = monthlyBalance.reduce((s, r) => s + r.demandPacks, 0);
  const annualDemandUnits = annualDemandPacks * unitsInPack;
  const totalApprovedReceiptsPacks = approvedByMonth.reduce((s, v) => s + v, 0);
  const totalApprovedReceiptsUnits = totalApprovedReceiptsPacks * unitsInPack;
  const hasDeficit = totalDeficitPacks > 0;

  // 2. Генерация партий закупки по 4 кварталам (или настроенным пользователем периодам покрытия)
  const periodDefs: CustomBatchPeriodDef[] =
    Array.isArray(fp.customBatchPeriods) && fp.customBatchPeriods.length > 0
      ? [...fp.customBatchPeriods].sort((a, b) => a.startMonthIdx - b.startMonthIdx)
      : DEFAULT_QUARTERLY_BATCH_PERIODS;

  const allPeriodBatches: RecommendedProcurementBatch[] = [];
  let simStock = netOpeningAvailablePacks;
  let currentCursorM = 0;
  const moq = Math.max(1, fp.moqPacks || 1);
  const multiple = Math.max(1, fp.packMultiple || 1);
  const colorsList = model.palettes[0]?.colors || [];

  for (let pIdx = 0; pIdx < periodDefs.length; pIdx++) {
    const pDef = periodDefs[pIdx];
    const startM = Math.min(11, Math.max(0, Math.round(pDef.startMonthIdx)));
    const endM = Math.min(11, Math.max(startM, Math.round(pDef.endMonthIdx)));

    // Прокручиваем месяцы до начала периода, если между периодами был зазор
    while (currentCursorM < startM) {
      const d = Math.max(0, plan.monthlyPacks[currentCursorM] || 0);
      const r = approvedByMonth[currentCursorM] || 0;
      simStock = Math.max(0, simStock + r - d);
      currentCursorM += 1;
    }

    const openingAvailableAtStartPacks = simStock;
    let periodDemandPacks = 0;
    let confirmedReceiptsInPeriodPacks = 0;
    let tempRunning = openingAvailableAtStartPacks;
    let maxIntraPeriodShortfall = 0;

    for (let k = startM; k <= endM; k++) {
      const d = Math.max(0, plan.monthlyPacks[k] || 0);
      const r = approvedByMonth[k] || 0;
      periodDemandPacks += d;
      confirmedReceiptsInPeriodPacks += r;
      tempRunning += r - d;
      if (tempRunning < 0) {
        maxIntraPeriodShortfall = Math.max(maxIntraPeriodShortfall, -tempRunning);
      }
    }

    const endMonthDemand = Math.max(0, plan.monthlyPacks[endM] || 0);
    const targetSafety =
      periodDemandPacks > 0
        ? Math.ceil((endMonthDemand * Math.max(0, fp.safetyStockDays)) / 30)
        : 0;

    // Формула Раздела 4 ТЗ:
    // потребность = max(0, сумма плановых выкупов за месяцы покрытия + целевой запас на конец периода - доступный остаток к началу покрытия - подтверждённые поступления)
    const formulaNeed = Math.max(
      0,
      periodDemandPacks +
        targetSafety -
        openingAvailableAtStartPacks -
        confirmedReceiptsInPeriodPacks
    );
    const rawNetNeedPacks = Math.max(formulaNeed, maxIntraPeriodShortfall);

    const hasCustomPacksOverride =
      typeof pDef.customPacksQty === 'number' && pDef.customPacksQty > 0;
    const shouldCreateBatch = rawNetNeedPacks > 0 || hasCustomPacksOverride;

    let recommendedPacks = 0;
    if (shouldCreateBatch) {
      recommendedPacks = hasCustomPacksOverride
        ? Math.max(1, Math.round(pDef.customPacksQty!))
        : roundNeedToMoqAndMultiple(rawNetNeedPacks, moq, multiple);

      const physicalUnitsQty = recommendedPacks * unitsInPack;
      const requiredArrivalDateIso = `${year}-${String(startM + 1).padStart(2, '0')}-01`;
      const autoOrderDateIso = subtractDaysFromMonthStart(year, startM, totalLeadDays);
      const hasCustomDateOverride =
        typeof pDef.customOrderDateIso === 'string' && pDef.customOrderDateIso.trim().length > 0;
      const recommendedOrderDateIso = hasCustomDateOverride
        ? pDef.customOrderDateIso!.trim()
        : autoOrderDateIso;

      const unitCostRub = Math.max(0, model.unitCostRub || 0);
      // Строго: бюджет = закупаемые комплекты * себестоимость комплекта (дважды не умножать!)
      const estimatedTotalRub = recommendedPacks * unitCostRub;
      const prepaymentRub = Math.round((estimatedTotalRub * fp.prepaymentPct) / 100);
      const balancePaymentRub = estimatedTotalRub - prepaymentRub;

      const effectiveSizeShares: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number> =
        pDef.customSizeSharesPct
          ? { ...fp.sizeSharesPct, ...pDef.customSizeSharesPct }
          : { ...fp.sizeSharesPct };

      const sizeBreakdownPacks = allocatePacksBySizeLargestRemainder(
        recommendedPacks,
        effectiveSizeShares
      );

      const colorCount = Math.max(1, colorsList.length || unitsInPack);
      const colorBreakdownUnits = (
        colorsList.length > 0
          ? colorsList.map((c) => c.nameRu)
          : Array.from({ length: unitsInPack }, (_, i) => `Цвет #${i + 1}`)
      ).map((colorName, idx) => {
        const perColor = Math.floor(physicalUnitsQty / colorCount);
        const rem = idx === 0 ? physicalUnitsQty - perColor * colorCount : 0;
        return { colorName, unitsQty: perColor + rem };
      });

      allPeriodBatches.push({
        batchIndex: allPeriodBatches.length + 1,
        periodId: pDef.id || `p-${startM}-${endM}`,
        factoryName: fp.factoryName,
        coverageMonthsLabel:
          startM === endM
            ? `${MONTHS_SHORT[startM]} ${year}`
            : `${MONTHS_SHORT[startM]}–${MONTHS_SHORT[endM]} ${year}`,
        firstCoveredMonthIdx: startM,
        endCoveredMonthIdx: endM,
        requiredArrivalDateIso,
        recommendedOrderDateIso,
        totalLeadDays,
        periodDemandPacks,
        openingAvailableAtStartPacks,
        confirmedReceiptsInPeriodPacks,
        rawNetNeedPacks,
        safetyStockPacks: targetSafety,
        recommendedPacks,
        physicalUnitsQty,
        unitCostRub,
        estimatedTotalRub,
        prepaymentRub,
        balancePaymentRub,
        isUrgentPastOrderDate: recommendedOrderDateIso < '2027-01-01',
        isAdditionalOrder: confirmedReceiptsInPeriodPacks > 0,
        hasCustomPacksOverride,
        hasCustomDateOverride,
        sizeSharesPct: effectiveSizeShares,
        sizeBreakdownPacks,
        colorBreakdownUnits,
      });
    }

    // Продвигаем симулируемый остаток через месяцы startM..endM с учётом запланированной партии
    for (let k = startM; k <= endM; k++) {
      const d = Math.max(0, plan.monthlyPacks[k] || 0);
      const r = (approvedByMonth[k] || 0) + (k === startM ? recommendedPacks : 0);
      simStock = Math.max(0, simStock + r - d);
    }
    currentCursorM = Math.max(currentCursorM, endM + 1);
  }

  // Раздел 8 ТЗ MVP: Осторожное масштабирование новой модели («Гипотеза» -> «Тест» -> «Масштабирование»).
  // Пока у модели статус «Гипотеза» или «Тест», к утверждению формируется только первая тестовая партия
  // (если ещё нет утверждённых заказов PO), а остальные квартальные объёмы отображаются как «Будущая потребность».
  let recommendedBatches: RecommendedProcurementBatch[] = [];
  let futureScalingBatches: RecommendedProcurementBatch[] = [];

  if (scalingStage === 'hypothesis' || scalingStage === 'test') {
    const hasConfirmedApprovedOrder = shared.approvedOrders.some(
      (po) => po.confirmedByFactory !== false
    );
    if (!hasConfirmedApprovedOrder && allPeriodBatches.length > 0) {
      recommendedBatches = [{ ...allPeriodBatches[0], isTestBatch: true }];
      futureScalingBatches = allPeriodBatches.slice(1).map((b) => ({
        ...b,
        isFutureScalingNeed: true,
      }));
    } else {
      recommendedBatches = [];
      futureScalingBatches = allPeriodBatches.map((b) => ({
        ...b,
        isFutureScalingNeed: true,
      }));
    }
  } else {
    recommendedBatches = allPeriodBatches;
    futureScalingBatches = [];
  }

  // 3. Проверка расхождений по уже утверждённым заказам PO (Тест-кейс №3: утверждённый заказ НЕ переписывается,
  // но если изменился срок производства или целевая себестоимость — показываем расхождение!)
  const orderDiscrepancies: ApprovedOrderDiscrepancy[] = [];
  for (const po of shared.approvedOrders) {
    const recalcDate = subtractDaysFromMonthStart(year, po.arrivalMonthIdx, totalLeadDays);
    const daysShifted = totalLeadDays - po.leadTimeDaysAtApproval;
    const currentUnitCost = Math.max(0, model.unitCostRub || 0);
    const costDeltaRub =
      currentUnitCost > 0 ? (currentUnitCost - po.lockedUnitCostRub) * po.packsQty : 0;

    if (daysShifted !== 0 || costDeltaRub !== 0) {
      const parts: string[] = [];
      if (daysShifted !== 0) {
        parts.push(
          `при новом цикле ${totalLeadDays} дн. расчётная дата заказа ${recalcDate} (сдвиг ${
            daysShifted > 0 ? `+${daysShifted}` : daysShifted
          } дн., в PO зафиксирована ${po.orderPlacementDateIso})`
        );
      }
      if (costDeltaRub !== 0) {
        parts.push(
          `разница с новой целевой себестоимостью: ${
            costDeltaRub > 0 ? '+' : ''
          }${costDeltaRub.toLocaleString('ru-RU')} ₽ (в PO зафиксировано ${po.lockedUnitCostRub} ₽/компл.)`
        );
      }
      orderDiscrepancies.push({
        orderId: po.id,
        orderNumber: po.orderNumber,
        message: parts.join('; '),
        recalculatedOrderDateIso: recalcDate,
        daysShifted,
        costDeltaRub,
      });
    }
  }

  const totalRecommendedPacks = recommendedBatches.reduce(
    (s, b) => s + b.recommendedPacks,
    0
  );
  const totalRecommendedUnits = totalRecommendedPacks * unitsInPack;
  const totalRecommendedBudgetRub =
    model.unitCostRub > 0
      ? recommendedBatches.reduce((s, b) => s + b.estimatedTotalRub, 0)
      : null;

  const futureScalingPacks = futureScalingBatches.reduce(
    (s, b) => s + b.recommendedPacks,
    0
  );
  const futureScalingBudgetRub =
    model.unitCostRub > 0
      ? futureScalingBatches.reduce((s, b) => s + b.estimatedTotalRub, 0)
      : null;

  let supplyStatusLabel = 'Нет планового спроса';
  let supplyStatusTone: 'danger' | 'warning' | 'success' | 'neutral' = 'neutral';
  if (annualDemandPacks > 0) {
    if (hasDeficit && netOpeningAvailablePacks === 0 && totalApprovedReceiptsPacks === 0) {
      supplyStatusLabel = `Дефицит ${totalDeficitPacks.toLocaleString('ru-RU')} компл. (${(
        totalDeficitPacks * unitsInPack
      ).toLocaleString('ru-RU')} изд.) — остаток 0, заказы не утверждены`;
      supplyStatusTone = 'danger';
    } else if (hasDeficit) {
      supplyStatusLabel = `Частично обеспечено (${coveredMonthsCount} мес.) · дефицит ${totalDeficitPacks.toLocaleString(
        'ru-RU'
      )} компл.`;
      supplyStatusTone = 'warning';
    } else {
      supplyStatusLabel = `Полностью обеспечено утверждёнными запасами (${annualDemandPacks.toLocaleString(
        'ru-RU'
      )} компл.)`;
      supplyStatusTone = 'success';
    }
  }

  return {
    unitsInPack,
    totalLeadDays,
    scalingStage,
    actualOpeningStockPacks: shared.actualOpeningStockPacks,
    reservedStockPacks: shared.reservedStockPacks,
    netOpeningAvailablePacks,
    annualDemandPacks,
    annualDemandUnits,
    totalApprovedReceiptsPacks,
    totalApprovedReceiptsUnits,
    totalDeficitPacks,
    totalDeficitUnits: totalDeficitPacks * unitsInPack,
    hasDeficit,
    coveredMonthsCount,
    supplyStatusLabel,
    supplyStatusTone,
    monthlyBalance,
    recommendedBatches,
    futureScalingBatches,
    allPeriodBatches,
    totalRecommendedPacks,
    totalRecommendedUnits,
    totalRecommendedBudgetRub,
    futureScalingPacks,
    futureScalingBudgetRub,
    approvedOrders: shared.approvedOrders,
    orderDiscrepancies,
  };
}

/**
 * Ручное утверждение рекомендованной партии закупки ответственным лицом (Раздел 04 ТЗ v1.1 + ТЗ MVP).
 * Присваивает номер PO, фиксирует количество, себестоимость, размеры и даты; не переписывается будущими пересчётами!
 */
export function approveRecommendedBatch(
  rawModel: ScenarioModelSpec,
  batch: RecommendedProcurementBatch,
  approverName = 'Владелец'
): ScenarioModelSpec {
  const model = ensureModelUnifiedV11(rawModel);
  const shared = model.sharedSupplyAndFact!;
  const nextSeq = shared.approvedOrders.length + 1;
  const codeClean = model.code.replace(/\s+/g, '');
  const orderNumber = `PO-2027-${codeClean}-${String(nextSeq).padStart(2, '0')}`;
  const lockedCost = Math.max(0, model.unitCostRub || batch.unitCostRub || 0);
  const totalOrderRub = batch.recommendedPacks * lockedCost;
  const prepaymentRub = Math.round(
    (totalOrderRub * shared.factoryParams.prepaymentPct) / 100
  );
  const balancePaymentRub = totalOrderRub - prepaymentRub;

  const newPo: ApprovedPurchaseOrder = {
    id: `po-${Date.now()}-${nextSeq}`,
    orderNumber,
    version: 1,
    status: 'approved',
    confirmedByFactory: true,
    factoryName: batch.factoryName,
    approvedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    approvedBy: approverName,
    arrivalMonthIdx: batch.firstCoveredMonthIdx,
    coveredEndMonthIdx: batch.endCoveredMonthIdx,
    coverageMonthsLabel: batch.coverageMonthsLabel,
    requiredArrivalDateIso: batch.requiredArrivalDateIso,
    orderPlacementDateIso: batch.recommendedOrderDateIso,
    leadTimeDaysAtApproval: batch.totalLeadDays,
    packsQty: batch.recommendedPacks,
    unitsInPack: model.unitsInPack,
    physicalUnitsQty: batch.recommendedPacks * model.unitsInPack,
    lockedUnitCostRub: lockedCost,
    totalOrderRub,
    prepaymentRub,
    balancePaymentRub,
    sizeBreakdownPacks: batch.sizeBreakdownPacks,
    note: `Покрытие ${batch.coverageMonthsLabel}`,
  };

  // Сбрасываем ручное переопределение customPacksQty у утверждённого периода, чтобы он не создавал дубль
  const updatedCustomPeriods = Array.isArray(shared.factoryParams.customBatchPeriods)
    ? shared.factoryParams.customBatchPeriods.map((p) =>
        p.id === batch.periodId ||
        (p.startMonthIdx === batch.firstCoveredMonthIdx &&
          p.endMonthIdx === batch.endCoveredMonthIdx)
          ? {
              id: p.id,
              startMonthIdx: p.startMonthIdx,
              endMonthIdx: p.endMonthIdx,
            }
          : p
      )
    : undefined;

  const auditEntry: ModelAuditEntry = {
    id: `aud-po-${Date.now()}-${nextSeq}`,
    timestamp: newPo.approvedAt,
    author: approverName,
    category: 'procurement',
    summary: `Утверждён заказ ${orderNumber}: ${newPo.packsQty.toLocaleString(
      'ru-RU'
    )} компл. (${newPo.physicalUnitsQty.toLocaleString('ru-RU')} изд.) на сумму ${totalOrderRub.toLocaleString(
      'ru-RU'
    )} ₽`,
    afterValue: `${orderNumber} · заказ ${newPo.orderPlacementDateIso} -> приход ${newPo.requiredArrivalDateIso}`,
    passportVersion: shared.passportVersion,
  };

  return {
    ...model,
    sharedSupplyAndFact: {
      ...shared,
      factoryParams: {
        ...shared.factoryParams,
        customBatchPeriods: updatedCustomPeriods,
      },
      approvedOrders: [...shared.approvedOrders, newPo],
      auditHistory: [auditEntry, ...shared.auditHistory],
    },
  };
}

export const PO_STATUS_LABELS_RU: Record<ApprovedPurchaseOrder['status'], string> = {
  approved: 'Согласован',
  in_production: 'В производстве',
  in_transit: 'В пути',
  received: 'На складе',
};

/**
 * Ручное создание произвольного заказа фабрике PO (в том числе вне авто-рекомендаций, с любой партией, ценой и датой).
 */
export function createCustomPurchaseOrder(
  rawModel: ScenarioModelSpec,
  params: {
    packsQty: number;
    unitCostRub?: number;
    factoryName?: string;
    arrivalMonthIdx: number;
    orderPlacementDateIso?: string;
    requiredArrivalDateIso?: string;
    status?: ApprovedPurchaseOrder['status'];
    note?: string;
    author?: string;
    year?: number;
  }
): ScenarioModelSpec {
  const model = ensureModelUnifiedV11(rawModel);
  const shared = model.sharedSupplyAndFact!;
  const fp = shared.factoryParams;
  const year = params.year || 2027;
  const arrivalMonthIdx = Math.min(11, Math.max(0, Math.round(params.arrivalMonthIdx || 0)));
  const packsQty = Math.max(1, Math.round(params.packsQty || 1));
  const unitsInPack = Math.max(1, model.unitsInPack || 1);
  const physicalUnitsQty = packsQty * unitsInPack;

  const totalLeadDays =
    Math.max(0, fp.productionLeadDays) +
    Math.max(0, fp.qcDays) +
    Math.max(0, fp.logisticsLeadDays) +
    Math.max(0, fp.acceptanceDays);

  const requiredArrivalDateIso =
    params.requiredArrivalDateIso ||
    `${year}-${String(arrivalMonthIdx + 1).padStart(2, '0')}-01`;
  const orderPlacementDateIso =
    params.orderPlacementDateIso ||
    subtractDaysFromMonthStart(year, arrivalMonthIdx, totalLeadDays);

  const lockedUnitCostRub = Math.max(
    0,
    params.unitCostRub !== undefined ? Math.round(params.unitCostRub) : model.unitCostRub || 0
  );
  // Строго Тест-кейс №5: сумма считается от комплектов (packsQty * lockedUnitCostRub)
  const totalOrderRub = packsQty * lockedUnitCostRub;
  const prepaymentRub = Math.round((totalOrderRub * fp.prepaymentPct) / 100);
  const balancePaymentRub = totalOrderRub - prepaymentRub;

  const nextSeq = shared.approvedOrders.length + 1;
  const codeClean = model.code.replace(/\s+/g, '');
  const orderNumber = `PO-${year}-${codeClean}-${String(nextSeq).padStart(2, '0')}`;
  const author = params.author || 'Владелец';
  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const factoryName = (params.factoryName || fp.factoryName || 'Фабрика-партнёр BORNERS').trim();

  const newPo: ApprovedPurchaseOrder = {
    id: `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orderNumber,
    version: 1,
    status: params.status || 'approved',
    confirmedByFactory: true,
    factoryName,
    approvedAt: nowStr,
    approvedBy: author,
    arrivalMonthIdx,
    coveredEndMonthIdx: arrivalMonthIdx,
    coverageMonthsLabel: `${MONTHS_SHORT[arrivalMonthIdx]} ${year}`,
    requiredArrivalDateIso,
    orderPlacementDateIso,
    leadTimeDaysAtApproval: totalLeadDays,
    packsQty,
    unitsInPack,
    physicalUnitsQty,
    lockedUnitCostRub,
    totalOrderRub,
    prepaymentRub,
    balancePaymentRub,
    sizeBreakdownPacks: allocatePacksBySizeLargestRemainder(packsQty, fp.sizeSharesPct),
    note: params.note?.trim() || `Поставка к ${MONTHS_SHORT[arrivalMonthIdx]} ${year}`,
  };

  const nextUnitCostRub =
    model.unitCostRub > 0 ? model.unitCostRub : lockedUnitCostRub > 0 ? lockedUnitCostRub : 0;

  const auditEntry: ModelAuditEntry = {
    id: `aud-po-create-${Date.now()}`,
    timestamp: nowStr,
    author,
    category: 'procurement',
    summary: `Создан заказ ${orderNumber}: ${packsQty.toLocaleString('ru-RU')} компл. (${physicalUnitsQty.toLocaleString('ru-RU')} изд.) · ${totalOrderRub.toLocaleString('ru-RU')} ₽`,
    afterValue: `${factoryName} · приход ${MONTHS_SHORT[arrivalMonthIdx]} ${year}`,
    passportVersion: shared.passportVersion,
  };

  return {
    ...model,
    unitCostRub: nextUnitCostRub,
    sharedSupplyAndFact: {
      ...shared,
      costStatus: nextUnitCostRub > 0 && shared.costStatus === 'not_filled' ? 'plan' : shared.costStatus,
      approvedOrders: [...shared.approvedOrders, newPo],
      auditHistory: [auditEntry, ...shared.auditHistory],
    },
  };
}

/**
 * Редактирование параметров уже созданного заказа PO (статус, количество, цена, фабрика, месяц/даты, комментарий).
 * Срабатывает ТОЛЬКО по явному действию пользователя (сохраняя защиту от автоматической перезаписи Тест-кейса №3).
 */
export function updateApprovedPurchaseOrder(
  rawModel: ScenarioModelSpec,
  poId: string,
  patch: Partial<
    Pick<
      ApprovedPurchaseOrder,
      | 'packsQty'
      | 'lockedUnitCostRub'
      | 'factoryName'
      | 'arrivalMonthIdx'
      | 'orderPlacementDateIso'
      | 'requiredArrivalDateIso'
      | 'status'
      | 'confirmedByFactory'
      | 'sizeBreakdownPacks'
      | 'note'
    >
  >,
  author = 'Владелец',
  year = 2027
): ScenarioModelSpec {
  const model = ensureModelUnifiedV11(rawModel);
  const shared = model.sharedSupplyAndFact!;
  const target = shared.approvedOrders.find((p) => p.id === poId);
  if (!target) return model;

  const unitsInPack = Math.max(1, model.unitsInPack || target.unitsInPack || 1);
  const nextPacks =
    patch.packsQty !== undefined
      ? Math.max(1, Math.round(patch.packsQty))
      : target.packsQty;
  const nextLockedCost =
    patch.lockedUnitCostRub !== undefined
      ? Math.max(0, Math.round(patch.lockedUnitCostRub))
      : target.lockedUnitCostRub;
  const nextArrivalMonthIdx =
    patch.arrivalMonthIdx !== undefined
      ? Math.min(11, Math.max(0, Math.round(patch.arrivalMonthIdx)))
      : target.arrivalMonthIdx;
  const nextRequiredArrivalIso =
    patch.requiredArrivalDateIso !== undefined
      ? patch.requiredArrivalDateIso
      : patch.arrivalMonthIdx !== undefined
      ? `${year}-${String(nextArrivalMonthIdx + 1).padStart(2, '0')}-01`
      : target.requiredArrivalDateIso;

  const totalOrderRub = nextPacks * nextLockedCost;
  const prepaymentRub = Math.round(
    (totalOrderRub * shared.factoryParams.prepaymentPct) / 100
  );
  const balancePaymentRub = totalOrderRub - prepaymentRub;

  const updatedPo: ApprovedPurchaseOrder = {
    ...target,
    version: (target.version || 1) + 1,
    status: patch.status ?? target.status,
    confirmedByFactory:
      patch.confirmedByFactory !== undefined
        ? patch.confirmedByFactory
        : target.confirmedByFactory ?? true,
    factoryName:
      patch.factoryName !== undefined
        ? patch.factoryName.trim() || target.factoryName
        : target.factoryName,
    arrivalMonthIdx: nextArrivalMonthIdx,
    requiredArrivalDateIso: nextRequiredArrivalIso,
    orderPlacementDateIso: patch.orderPlacementDateIso ?? target.orderPlacementDateIso,
    packsQty: nextPacks,
    unitsInPack,
    physicalUnitsQty: nextPacks * unitsInPack,
    lockedUnitCostRub: nextLockedCost,
    totalOrderRub,
    prepaymentRub,
    balancePaymentRub,
    sizeBreakdownPacks:
      patch.sizeBreakdownPacks ??
      (patch.packsQty !== undefined
        ? allocatePacksBySizeLargestRemainder(nextPacks, shared.factoryParams.sizeSharesPct)
        : target.sizeBreakdownPacks),
    note: patch.note !== undefined ? patch.note : target.note,
  };

  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const auditEntry: ModelAuditEntry = {
    id: `aud-po-upd-${Date.now()}`,
    timestamp: nowStr,
    author,
    category: 'procurement',
    summary: `Обновлён заказ ${updatedPo.orderNumber} (v${updatedPo.version}): ${PO_STATUS_LABELS_RU[updatedPo.status]} · ${updatedPo.packsQty.toLocaleString('ru-RU')} компл. · ${updatedPo.totalOrderRub.toLocaleString('ru-RU')} ₽`,
    passportVersion: shared.passportVersion,
  };

  return {
    ...model,
    sharedSupplyAndFact: {
      ...shared,
      approvedOrders: shared.approvedOrders.map((p) => (p.id === poId ? updatedPo : p)),
      auditHistory: [auditEntry, ...shared.auditHistory],
    },
  };
}

/**
 * Удаление / отмена заказа PO из реестра SKU.
 */
export function removeApprovedPurchaseOrder(
  rawModel: ScenarioModelSpec,
  poId: string,
  author = 'Владелец'
): ScenarioModelSpec {
  const model = ensureModelUnifiedV11(rawModel);
  const shared = model.sharedSupplyAndFact!;
  const target = shared.approvedOrders.find((p) => p.id === poId);
  if (!target) return model;

  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const auditEntry: ModelAuditEntry = {
    id: `aud-po-del-${Date.now()}`,
    timestamp: nowStr,
    author,
    category: 'procurement',
    summary: `Удалён заказ ${target.orderNumber} (${target.packsQty.toLocaleString('ru-RU')} компл.)`,
    passportVersion: shared.passportVersion,
  };

  return {
    ...model,
    sharedSupplyAndFact: {
      ...shared,
      approvedOrders: shared.approvedOrders.filter((p) => p.id !== poId),
      auditHistory: [auditEntry, ...shared.auditHistory],
    },
  };
}

/**
 * Экспорт реестра заказов PO в CSV (с BOM для корректного открытия в Excel).
 */
export function serializePurchaseOrdersToCsv(
  items: { model: ScenarioModelSpec; po: ApprovedPurchaseOrder }[]
): string {
  const header = [
    'Номер PO',
    'Статус',
    'Артикул SKU',
    'Модель',
    'Фабрика',
    'Дата заказа',
    'Месяц прихода',
    'Дата прихода',
    'Комплектов',
    'Изделий в компл.',
    'Физических изделий',
    'Себест. за компл. ₽',
    'Сумма заказа ₽',
    'Предоплата ₽',
    'Доплата ₽',
    'Комментарий',
  ].join(';');

  const rows = items.map(({ model, po }) =>
    [
      po.orderNumber,
      PO_STATUS_LABELS_RU[po.status] || po.status,
      model.code,
      `"${(model.title || '').replace(/"/g, '""')}"`,
      `"${(po.factoryName || '').replace(/"/g, '""')}"`,
      po.orderPlacementDateIso,
      MONTHS_SHORT[po.arrivalMonthIdx] || '',
      po.requiredArrivalDateIso,
      po.packsQty,
      po.unitsInPack,
      po.physicalUnitsQty,
      po.lockedUnitCostRub,
      po.totalOrderRub,
      po.prepaymentRub,
      po.balancePaymentRub,
      `"${(po.note || '').replace(/"/g, '""')}"`,
    ].join(';')
  );

  return `\uFEFF${[header, ...rows].join('\n')}`;
}

/**
 * Раздел 05 ТЗ v1.1: Проверяемые финансовые формулы P&L и Потребность в капитале.
 * Тест-кейс №8: Если финансовые затраты не заполнены — операционная прибыль строго «Не рассчитана» (null), без ложных 75%!
 */
export function computeFinancialPnL(
  rawModel: ScenarioModelSpec,
  scenario: GrowthScenarioDef,
  procurementOverride?: ProcurementComputationResult
): FinancialPnLResult {
  const model = ensureModelUnifiedV11(rawModel);
  const shared = model.sharedSupplyAndFact!;
  const procurement = procurementOverride || computeProcurementPlan(model, scenario);
  const unitsInPack = Math.max(1, model.unitsInPack || 1);

  const plan =
    model.plansByScenario[scenario.id] ||
    model.plansByScenario[1] || {
      scenarioId: scenario.id,
      monthlyPacks: Array(12).fill(0),
      monthlyPricesRub: Array(12).fill(model.retailPriceRub),
      monthlyReceiptsPacks: Array(12).fill(0),
      initialStockPacks: 0,
      firstOrderPacks: 0,
      nextOrderDateLabel: '',
      salesStartMonthIdx: 0,
      warehouseArrivalMonthIdx: 0,
      warehouseArrivalDateLabel: '',
    };

  const actingSku = getActingSkuByWbOrVendor(model.code, model.title);
  const s1Var =
    getS1NewVariantByCodeOrId(model.code) || getS1NewVariantByCodeOrId(model.id);

  // Для каждого месяца: если заполнен факт (actualBuyoutsPacks !== null), берём факт, иначе план
  const monthlyEffectivePacks: number[] = [];
  const monthlyEffectiveRevRub: number[] = [];
  let hasAnyFact = false;

  const isUnmodifiedActingPlan =
    actingSku &&
    plan.monthlyPacks.every((p, idx) => p === actingSku.monthly[idx]?.buyouts_sets) &&
    plan.monthlyPricesRub.every(
      (pr, idx) => pr === actingSku.monthly[idx]?.realization_price_rub
    );

  for (let m = 0; m < 12; m++) {
    const act = shared.actualSalesByMonth[m];
    if (act && act.actualBuyoutsPacks !== null) {
      hasAnyFact = true;
      const p = Math.max(0, act.actualBuyoutsPacks);
      const pr =
        act.actualPriceRub !== null
          ? act.actualPriceRub
          : plan.monthlyPricesRub[m] ?? model.retailPriceRub;
      monthlyEffectivePacks.push(p);
      monthlyEffectiveRevRub.push(p * pr);
    } else {
      const p = Math.max(0, plan.monthlyPacks[m] || 0);
      const rev = isUnmodifiedActingPlan
        ? actingSku.monthly[m]?.revenue_rub || 0
        : p * (plan.monthlyPricesRub[m] ?? model.retailPriceRub);
      monthlyEffectivePacks.push(p);
      monthlyEffectiveRevRub.push(rev);
    }
  }

  const annualBuyoutsPacks = monthlyEffectivePacks.reduce((a, b) => a + b, 0);
  const annualBuyoutsUnits = annualBuyoutsPacks * unitsInPack;
  const annualRevenueRub = monthlyEffectiveRevRub.reduce((a, b) => a + b, 0);

  const avgRealizedPricePerPackRub =
    annualBuyoutsPacks > 0
      ? Math.round(annualRevenueRub / annualBuyoutsPacks)
      : model.retailPriceRub;
  const avgRealizedPricePerUnitRub = Math.round(avgRealizedPricePerPackRub / unitsInPack);

  const targetMonthIdx = scenario.targetMonthIdx ?? 11;
  const targetMonthPacks = monthlyEffectivePacks[targetMonthIdx] || 0;
  const targetMonthUnits = targetMonthPacks * unitsInPack;
  const targetMonthRevenueRub = monthlyEffectiveRevRub[targetMonthIdx] || 0;

  const revenueStatus: ValueStatusCode = hasAnyFact
    ? 'fact'
    : s1Var?.isPriceHypothesis
    ? 'hypothesis'
    : actingSku
    ? 'approved'
    : 'plan';

  const hasCost = model.unitCostRub > 0;
  const unitCostPerPackRub = hasCost ? model.unitCostRub : null;
  const unitCostPerSingleItemRub = hasCost
    ? Math.round((model.unitCostRub / unitsInPack) * 100) / 100
    : null;

  const annualCogsRub = hasCost
    ? isUnmodifiedActingPlan && model.unitCostRub === actingSku.unitCogRub
      ? actingSku.totalCostOfGoodsRub
      : annualBuyoutsPacks * model.unitCostRub
    : null;

  const costStatus: ValueStatusCode = !hasCost
    ? 'not_filled'
    : shared.confirmedUnitCostRub !== null
    ? 'approved'
    : 'plan';

  // 1. Валовая прибыль = Выручка - Себестоимость выкупленного товара (НЕ операционная прибыль!)
  const annualGrossProfitRub =
    annualCogsRub !== null ? annualRevenueRub - annualCogsRub : null;
  const unitGrossProfitRub =
    unitCostPerPackRub !== null
      ? avgRealizedPricePerPackRub - unitCostPerPackRub
      : null;
  const grossMarginPct =
    annualGrossProfitRub !== null && annualRevenueRub > 0
      ? Math.round((annualGrossProfitRub / annualRevenueRub) * 1000) / 10
      : null;

  // 2. Проверка заполненности коммерческих расходов (комиссии MP, логистика, реклама)
  const expensesFilled =
    hasCost &&
    (shared.expensesFilled ||
      model.marketplaceFeePct > 0 ||
      model.logisticsRub > 0 ||
      model.adsPct > 0);

  let unitMpCommissionRub: number | null = null;
  let unitLogisticsRub: number | null = null;
  let unitAdsRub: number | null = null;
  let unitOtherVarRub: number | null = null;
  let unitContributionMarginRub: number | null = null;
  let annualMpCommissionRub: number | null = null;
  let annualLogisticsRub: number | null = null;
  let annualAdsRub: number | null = null;
  let annualOtherVarRub: number | null = null;
  let annualContributionMarginRub: number | null = null;
  let contributionMarginPct: number | null = null;

  if (expensesFilled && annualGrossProfitRub !== null && unitGrossProfitRub !== null) {
    unitMpCommissionRub = Math.round(
      (avgRealizedPricePerPackRub * model.marketplaceFeePct) / 100
    );
    unitLogisticsRub = model.logisticsRub;
    unitAdsRub = Math.round((avgRealizedPricePerPackRub * model.adsPct) / 100);
    unitOtherVarRub = shared.otherVariableRubPerPack || 0;

    annualMpCommissionRub = Math.round(
      (annualRevenueRub * model.marketplaceFeePct) / 100
    );
    annualLogisticsRub = annualBuyoutsPacks * model.logisticsRub;
    annualAdsRub = Math.round((annualRevenueRub * model.adsPct) / 100);
    annualOtherVarRub = annualBuyoutsPacks * unitOtherVarRub;

    unitContributionMarginRub =
      unitGrossProfitRub -
      unitMpCommissionRub -
      unitLogisticsRub -
      unitAdsRub -
      unitOtherVarRub;

    annualContributionMarginRub =
      annualGrossProfitRub -
      annualMpCommissionRub -
      annualLogisticsRub -
      annualAdsRub -
      annualOtherVarRub;

    contributionMarginPct =
      annualRevenueRub > 0
        ? Math.round((annualContributionMarginRub / annualRevenueRub) * 1000) / 10
        : 0;
  }

  const marginStatus: ValueStatusCode = expensesFilled ? 'plan' : 'not_filled';

  // 3. Операционная прибыль = Маржинальная прибыль - распределённые постоянные расходы (OPEX)
  const opexFilled =
    expensesFilled &&
    shared.allocatedFixedOpexRubPerPack !== null &&
    shared.allocatedFixedOpexRubPerPack >= 0;

  let unitAllocatedOpexRub: number | null = null;
  let annualAllocatedOpexRub: number | null = null;
  let unitOperatingProfitRub: number | null = null;
  let annualOperatingProfitRub: number | null = null;
  let operatingMarginPct: number | null = null;
  let operatingProfitNotCalculatedReason: string | null = null;

  if (!hasCost) {
    operatingProfitNotCalculatedReason =
      'Не рассчитана: не заполнена закупочная себестоимость комплекта';
  } else if (!expensesFilled) {
    operatingProfitNotCalculatedReason =
      'Не рассчитана: не заполнены комиссии маркетплейса, логистика и реклама';
  } else if (!opexFilled) {
    operatingProfitNotCalculatedReason =
      'Не рассчитана: не заданы распределённые постоянные операционные расходы (OPEX)';
  } else if (
    annualContributionMarginRub !== null &&
    unitContributionMarginRub !== null
  ) {
    unitAllocatedOpexRub = shared.allocatedFixedOpexRubPerPack!;
    annualAllocatedOpexRub = annualBuyoutsPacks * unitAllocatedOpexRub;
    unitOperatingProfitRub = unitContributionMarginRub - unitAllocatedOpexRub;
    annualOperatingProfitRub = annualContributionMarginRub - annualAllocatedOpexRub;
    operatingMarginPct =
      annualRevenueRub > 0
        ? Math.round((annualOperatingProfitRub / annualRevenueRub) * 1000) / 10
        : 0;
  }

  const operatingProfitStatus: ValueStatusCode =
    annualOperatingProfitRub !== null ? 'plan' : 'not_filled';

  // 4. График денежных потоков и потребность в оборотном капитале (Cash Flow)
  const procurementOutflowsByMonth = Array(12).fill(0);
  // Учитываем платежи по утверждённым заказам PO + по рекомендуемым партиям для полной картины потребности в капитале
  for (const po of procurement.approvedOrders) {
    const orderMonth = Math.max(
      0,
      po.arrivalMonthIdx - Math.ceil(po.leadTimeDaysAtApproval / 30)
    );
    procurementOutflowsByMonth[orderMonth] += po.prepaymentRub;
    procurementOutflowsByMonth[Math.max(0, po.arrivalMonthIdx)] += po.balancePaymentRub;
  }
  for (const rb of procurement.recommendedBatches) {
    const orderMonth = Math.max(
      0,
      rb.firstCoveredMonthIdx - Math.ceil(rb.totalLeadDays / 30)
    );
    procurementOutflowsByMonth[orderMonth] += rb.prepaymentRub;
    procurementOutflowsByMonth[Math.max(0, rb.firstCoveredMonthIdx)] +=
      rb.balancePaymentRub;
  }

  const monthlyCashFlow: MonthlyCashFlowRow[] = [];
  let runningCash = 0;
  let minCumulativeCash = 0;

  for (let m = 0; m < 12; m++) {
    const packsM = monthlyEffectivePacks[m];
    const revM = monthlyEffectiveRevRub[m];
    const lag = shared.settlementLagMonths || 0;
    const inflowSalesRub =
      m - lag >= 0 ? monthlyEffectiveRevRub[m - lag] : 0;

    const varAndOpexM = expensesFilled
      ? Math.round((revM * (model.marketplaceFeePct + model.adsPct)) / 100) +
        packsM *
          (model.logisticsRub +
            (shared.otherVariableRubPerPack || 0) +
            (shared.allocatedFixedOpexRubPerPack || 0))
      : 0;

    const outflowProcurementRub = procurementOutflowsByMonth[m] || 0;
    const netCashFlowRub =
      inflowSalesRub - outflowProcurementRub - varAndOpexM;
    runningCash += netCashFlowRub;
    if (runningCash < minCumulativeCash) {
      minCumulativeCash = runningCash;
    }

    monthlyCashFlow.push({
      monthIdx: m,
      monthLabel: MONTHS_SHORT[m],
      inflowSalesRub,
      outflowProcurementRub,
      outflowVariableAndOpexRub: varAndOpexM,
      netCashFlowRub,
      cumulativeCashBalanceRub: runningCash,
    });
  }

  return {
    revenueStatus,
    costStatus,
    marginStatus,
    operatingProfitStatus,
    annualBuyoutsPacks,
    annualBuyoutsUnits,
    avgRealizedPricePerPackRub,
    avgRealizedPricePerUnitRub,
    annualRevenueRub,
    targetMonthRevenueRub,
    targetMonthPacks,
    targetMonthUnits,
    unitCostPerPackRub,
    unitCostPerSingleItemRub,
    annualCogsRub,
    unitGrossProfitRub,
    annualGrossProfitRub,
    grossMarginPct,
    expensesFilled,
    unitMpCommissionRub,
    unitLogisticsRub,
    unitAdsRub,
    unitOtherVarRub,
    unitContributionMarginRub,
    annualMpCommissionRub,
    annualLogisticsRub,
    annualAdsRub,
    annualOtherVarRub,
    annualContributionMarginRub,
    contributionMarginPct,
    opexFilled,
    unitAllocatedOpexRub,
    annualAllocatedOpexRub,
    unitOperatingProfitRub,
    annualOperatingProfitRub,
    operatingMarginPct,
    operatingProfitNotCalculatedReason,
    monthlyCashFlow,
    peakCapitalDeficitRub: Math.abs(minCumulativeCash),
    totalProcurementOutflowRub: procurementOutflowsByMonth.reduce((a, b) => a + b, 0),
  };
}

/**
 * Группировка рекомендованных партий на одну фабрику / период поставки (Раздел 04 ТЗ v1.1)
 */
export interface FactoryGroupedBatchProposal {
  factoryName: string;
  orderMonthLabel: string;
  itemsCount: number;
  totalPacks: number;
  totalPhysicalUnits: number;
  totalBudgetRub: number;
  lines: {
    modelId: string;
    skuCode: string;
    title: string;
    recommendedPacks: number;
    physicalUnitsQty: number;
    recommendedOrderDateIso: string;
    requiredArrivalDateIso: string;
    estimatedTotalRub: number;
  }[];
}

export function groupRecommendedBatchesByFactory(
  models: ScenarioModelSpec[],
  scenario: GrowthScenarioDef
): FactoryGroupedBatchProposal[] {
  const groups = new Map<string, FactoryGroupedBatchProposal>();

  for (const m of models) {
    if (m.launchStatus === 'В архиве') continue;
    const proc = computeProcurementPlan(m, scenario);
    for (const b of proc.recommendedBatches) {
      const orderMonthKey = b.recommendedOrderDateIso.slice(0, 7); // YYYY-MM
      const key = `${b.factoryName}__${orderMonthKey}`;
      const existing = groups.get(key) || {
        factoryName: b.factoryName,
        orderMonthLabel: orderMonthKey,
        itemsCount: 0,
        totalPacks: 0,
        totalPhysicalUnits: 0,
        totalBudgetRub: 0,
        lines: [],
      };
      existing.itemsCount += 1;
      existing.totalPacks += b.recommendedPacks;
      existing.totalPhysicalUnits += b.physicalUnitsQty;
      existing.totalBudgetRub += b.estimatedTotalRub;
      existing.lines.push({
        modelId: m.id,
        skuCode: m.code,
        title: m.title,
        recommendedPacks: b.recommendedPacks,
        physicalUnitsQty: b.physicalUnitsQty,
        recommendedOrderDateIso: b.recommendedOrderDateIso,
        requiredArrivalDateIso: b.requiredArrivalDateIso,
        estimatedTotalRub: b.estimatedTotalRub,
      });
      groups.set(key, existing);
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.orderMonthLabel.localeCompare(b.orderMonthLabel)
  );
}

/**
 * Структурированный экспорт и импорт плана (Тест-кейс №9 Стр. 8 ТЗ v1.1):
 * Идентификаторы SKU, периоды, цены, выкупы и статусы сохраняются без потери и двойного счёта.
 */
export interface StructuredPlanRowV11 {
  scenarioId: number;
  scenarioTitle: string;
  skuCode: string;
  modelId: string;
  title: string;
  brandLabel: string;
  unitsInPack: number;
  period: string; // 2027-01 .. 2027-12
  month: number; // 1..12
  plannedPriceRub: number;
  plannedBuyoutsPacks: number;
  plannedBuyoutsUnits: number;
  plannedRevenueRub: number;
  actualPriceRub: number | null;
  actualBuyoutsPacks: number | null;
  valueStatus: ValueStatusCode;
}

export function detectModelBrandPortfolioLabel(
  model: ScenarioModelSpec
): 'BORNERS' | 'FUKAI' | 'НА ТЕЛЕ' | 'Подтвердить бренд' {
  if (model.brandId === 'NA_TELE') return 'НА ТЕЛЕ';
  const digits = model.code.replace(/\D/g, '');
  if (digits === '72302360') return 'FUKAI';
  if (isUnverifiedActingSku(model.code)) return 'Подтвердить бренд';
  return 'BORNERS';
}

export function exportStructuredScenarioPlan(
  models: ScenarioModelSpec[],
  scenario: GrowthScenarioDef
): StructuredPlanRowV11[] {
  const seenSkuMonth = new Set<string>();
  const rows: StructuredPlanRowV11[] = [];
  const year = scenario.year || 2027;

  for (const raw of models) {
    if (raw.launchStatus === 'В архиве') continue;
    const m = ensureModelUnifiedV11(raw);
    const shared = m.sharedSupplyAndFact!;
    const plan = m.plansByScenario[scenario.id] || m.plansByScenario[1];
    if (!plan) continue;
    const s1Var = getS1NewVariantByCodeOrId(m.code) || getS1NewVariantByCodeOrId(m.id);

    for (let idx = 0; idx < 12; idx++) {
      const dedupeKey = `${m.code.trim().toUpperCase()}__${idx + 1}`;
      if (seenSkuMonth.has(dedupeKey)) continue; // Защита от двойного счёта!
      seenSkuMonth.add(dedupeKey);

      const packs = Math.max(0, plan.monthlyPacks[idx] || 0);
      const price = Math.max(0, plan.monthlyPricesRub[idx] ?? m.retailPriceRub);
      const act = shared.actualSalesByMonth[idx];
      const status: ValueStatusCode =
        act && act.actualBuyoutsPacks !== null
          ? 'fact'
          : s1Var?.isPriceHypothesis
          ? 'hypothesis'
          : 'plan';

      rows.push({
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        skuCode: m.code,
        modelId: m.id,
        title: m.title,
        brandLabel: detectModelBrandPortfolioLabel(m),
        unitsInPack: m.unitsInPack,
        period: `${year}-${String(idx + 1).padStart(2, '0')}`,
        month: idx + 1,
        plannedPriceRub: price,
        plannedBuyoutsPacks: packs,
        plannedBuyoutsUnits: packs * m.unitsInPack,
        plannedRevenueRub: packs * price,
        actualPriceRub: act?.actualPriceRub ?? null,
        actualBuyoutsPacks: act?.actualBuyoutsPacks ?? null,
        valueStatus: status,
      });
    }
  }
  return rows;
}

export function serializeStructuredPlanToCsv(rows: StructuredPlanRowV11[]): string {
  const header = [
    'scenario_id',
    'sku_code',
    'model_id',
    'title',
    'brand',
    'units_in_pack',
    'period',
    'month',
    'planned_price_rub',
    'planned_buyouts_packs',
    'planned_buyouts_units',
    'planned_revenue_rub',
    'actual_price_rub',
    'actual_buyouts_packs',
    'value_status',
  ].join(',');

  const lines = rows.map((r) =>
    [
      r.scenarioId,
      `"${r.skuCode.replace(/"/g, '""')}"`,
      `"${r.modelId}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.brandLabel}"`,
      r.unitsInPack,
      r.period,
      r.month,
      r.plannedPriceRub,
      r.plannedBuyoutsPacks,
      r.plannedBuyoutsUnits,
      r.plannedRevenueRub,
      r.actualPriceRub === null ? '' : r.actualPriceRub,
      r.actualBuyoutsPacks === null ? '' : r.actualBuyoutsPacks,
      r.valueStatus,
    ].join(',')
  );

  return [header, ...lines].join('\n');
}

function splitCsvLineRespectingQuotes(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseStructuredPlanCsvOrJson(
  text: string,
  fallbackScenarioId = 1
): StructuredPlanRowV11[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: StructuredPlanRowV11[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLineRespectingQuotes(lines[i]);
    if (cols.length >= 10) {
      const units = Number(cols[5]) || 1;
      const price = Number(cols[8]) || 0;
      const packs = Number(cols[9]) || 0;
      rows.push({
        scenarioId: Number(cols[0]) || fallbackScenarioId,
        scenarioTitle: '',
        skuCode: cols[1],
        modelId: cols[2],
        title: cols[3],
        brandLabel: cols[4],
        unitsInPack: units,
        period: cols[6],
        month: Number(cols[7]) || i,
        plannedPriceRub: price,
        plannedBuyoutsPacks: packs,
        plannedBuyoutsUnits: Number(cols[10]) || packs * units,
        plannedRevenueRub: Number(cols[11]) || packs * price,
        actualPriceRub: cols[12] !== undefined && cols[12] !== '' ? Number(cols[12]) : null,
        actualBuyoutsPacks:
          cols[13] !== undefined && cols[13] !== '' ? Number(cols[13]) : null,
        valueStatus: (cols[14] as ValueStatusCode) || 'plan',
      });
    }
  }
  return rows;
}

export function importStructuredScenarioPlan(
  currentModels: ScenarioModelSpec[],
  rows: StructuredPlanRowV11[],
  targetScenarioId: number
): {
  updatedModels: ScenarioModelSpec[];
  importedSkusCount: number;
  importedRowsCount: number;
  duplicatesSkipped: number;
} {
  // Защита от двойного счёта при повторном импорте тех же строк SKU+период
  const latestBySkuMonth = new Map<string, StructuredPlanRowV11>();
  let duplicatesSkipped = 0;

  for (const r of rows) {
    if (!r.skuCode || r.month < 1 || r.month > 12) continue;
    const key = `${r.skuCode.trim().toUpperCase()}__${r.month}`;
    if (latestBySkuMonth.has(key)) {
      duplicatesSkipped += 1;
    }
    latestBySkuMonth.set(key, r);
  }

  const touchedSkus = new Set<string>();
  const updatedModels = currentModels.map((raw) => {
    const m = ensureModelUnifiedV11(raw);
    const skuKey = m.code.trim().toUpperCase();
    const basePlan = m.plansByScenario[targetScenarioId] || m.plansByScenario[1];
    if (!basePlan) return m;

    let changed = false;
    const nextPacks = [...basePlan.monthlyPacks];
    const nextPrices = [...basePlan.monthlyPricesRub];
    const nextActuals = [...m.sharedSupplyAndFact!.actualSalesByMonth];

    for (let month = 1; month <= 12; month++) {
      const rec = latestBySkuMonth.get(`${skuKey}__${month}`);
      if (!rec) continue;
      changed = true;
      touchedSkus.add(skuKey);
      nextPacks[month - 1] = Math.max(0, Math.round(rec.plannedBuyoutsPacks));
      nextPrices[month - 1] = Math.max(0, Math.round(rec.plannedPriceRub));
      nextActuals[month - 1] = {
        monthIdx: month - 1,
        actualBuyoutsPacks:
          rec.actualBuyoutsPacks === null || rec.actualBuyoutsPacks === undefined
            ? null
            : Math.max(0, Math.round(rec.actualBuyoutsPacks)),
        actualPriceRub:
          rec.actualPriceRub === null || rec.actualPriceRub === undefined
            ? null
            : Math.max(0, Math.round(rec.actualPriceRub)),
      };
    }

    if (!changed) return m;

    return {
      ...m,
      sharedSupplyAndFact: {
        ...m.sharedSupplyAndFact!,
        actualSalesByMonth: nextActuals,
      },
      plansByScenario: {
        ...m.plansByScenario,
        [targetScenarioId]: {
          ...basePlan,
          scenarioId: targetScenarioId,
          monthlyPacks: nextPacks,
          monthlyPricesRub: nextPrices,
        },
      },
    };
  });

  return {
    updatedModels,
    importedSkusCount: touchedSkus.size,
    importedRowsCount: latestBySkuMonth.size,
    duplicatesSkipped,
  };
}
