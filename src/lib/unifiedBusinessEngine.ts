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
  customSizeBreakdownPacks?: Record<'S' | 'M' | 'L' | 'XL' | 'XXL', number> | null; // прямая ручная правка комплектов по размерам S–XXL
  scenarioId?: number | null; // к какому сценарию относится ручная правка объёма (чтобы при смене сценария пересчитывалось по плану!)
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
  wbPayoutScheduleConfirmed?: boolean; // подтверждён ли график выплат WB для расчёта пиковой потребности в деньгах (Стр. 6 ТЗ)
  customBrandOptions?: string[]; // пользовательские бренды, добавленные через «+ Создать бренд»
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
  logisticsFilled: boolean;
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
  wbPayoutScheduleConfirmed: boolean;
  verifiedPeakCapitalDeficitRub: number | null;
  nextFactoryPayment: {
    dateIso: string;
    amountRub: number;
    orderNumber: string;
    label: string;
  } | null;
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
    Boolean(actingSku) ||
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
    otherVariableRubPerPack: isSorbetReference ? 35 : actingSku ? 15 : 0,
    allocatedFixedOpexRubPerPack: isSorbetReference
      ? 65
      : actingSku
      ? 35
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

export function getBrandDefaultModelSpecs(
  brandInput: string,
  titleInput: string,
  unitsInPack = 1
): {
  fabric: ScenarioModelSpec['fabric'];
  construction: ScenarioModelSpec['construction'];
  waistband: ScenarioModelSpec['waistband'];
  palette: ScenarioModelSpec['palettes'][number];
} {
  const norm = normalizePortfolioBrandCode(brandInput);
  const brandCode: CanonicalBrandCode = norm === 'ALL' ? 'BORNERS' : norm;
  const cleanTitle = (titleInput || '').trim() || 'Базовая модель';
  const palId = `pal-${brandCode.toLowerCase()}-${ cleanTitle.replace(/[^a-zA-Z0-9а-яА-Я]/g, '').slice(0, 8) || 'base' }`;

  if (brandCode === 'LISKANI') {
    return {
      fabric: {
        composition: '100% полиэстер премиум (портьерный блэкаут / димаут / вуаль)',
        density: '260–310 г/м² (светонепроницаемость 85–98%)',
        knitType: 'Трёхслойное переплетение рогожка / сатин матовый',
        touchFeel: 'Мягкая фактурная ткань без блеска',
        swatchHex: '#D6CFC2',
      },
      construction: {
        type: 'Комплект готовых штор на шторной ленте',
        fit: 'Высота 270 см · ширина полотен 150–200 см',
        sideSeam: 'Широкий боковой евро-подгиб 2×2 см',
        frontPanel: 'Мягкая равномерная драпировка глубокими складками',
        gusset: 'Утяжелитель / евро-подгиб по нижнему краю',
        seams: 'Закрытые боковые швы евро-стандарта без стягивания',
      },
      waistband: {
        width: 'Шторная лента 6 см (коэффициент сборки 1:2)',
        type: 'Крепление: крючки, карнизная труба или потолочная шина',
        colorRule: 'В тон основного полотна',
        logoRepeat: 'Фирменный тканевый ярлык LISKANI и ПВХ-кофр на молнии',
        elasticity: 'Стабильная геометрия полотна после стирки',
        bandBgHex: '#D6CFC2',
        bandTextHex: '#1E293B',
      },
      palette: {
        id: palId,
        title: `Цветовая палитра — ${cleanTitle}`,
        subtitle: `Комплект штор (${unitsInPack} изд.) · размеры 300×270 / 400×270 · LISKANI`,
        statusLabel: 'В плане',
        colors: [
          {
            nameRu: 'Тёплый бежевый лён',
            hex: '#D6CFC2',
            bandHex: '#C5BDB0',
            textHex: '#2E2B26',
            pantone: 'LISKANI · Тон #1',
          },
          {
            nameRu: 'Графитовый серый',
            hex: '#4B5563',
            bandHex: '#374151',
            textHex: '#F9FAFB',
            pantone: 'LISKANI · Тон #2',
          },
          {
            nameRu: 'Молочный шёлк',
            hex: '#F3EFEA',
            bandHex: '#E5DFD7',
            textHex: '#2E2B26',
            pantone: 'LISKANI · Тон #3',
          },
        ],
      },
    };
  }

  if (brandCode === 'AKUSHA') {
    return {
      fabric: {
        composition: 'Натуральная кожа / замша премиум + дышащий текстиль',
        density: 'Износостойкая подошва ТЭП / ЭВА с амортизацией',
        knitType: 'Двухслойная анатомическая стелька Comfort',
        touchFeel: 'Мягкая выделанная кожа и комфортная подкладка',
        swatchHex: '#1F2937',
      },
      construction: {
        type: 'Пара обуви в индивидуальной фирменной коробке',
        fit: 'Комфортная полнота G · размер в размер',
        sideSeam: 'Анатомический боковой профиль стопы',
        frontPanel: 'Усиленный мысок и формованный задник',
        gusset: 'Мягкий кант щиколотки против натирания',
        seams: 'Прошивной и клеевой борт повышенной прочности',
      },
      waistband: {
        width: 'Высота подошвы 25–35 мм',
        type: 'Противоскользящий протектор город / всесезон',
        colorRule: 'Монохромная или контрастная подошва',
        logoRepeat: 'Тиснение логотипа AKUSHA на язычке и стельке',
        elasticity: 'Амортизация пятки и гибкий перекат стопы',
        bandBgHex: '#1F2937',
        bandTextHex: '#F9FAFB',
      },
      palette: {
        id: palId,
        title: `Цветовая гамма — ${cleanTitle}`,
        subtitle: `Пара обуви · размерная сетка 36–41 / 40–45 · AKUSHA`,
        statusLabel: 'В плане',
        colors: [
          {
            nameRu: 'Чёрный оникс',
            hex: '#1F2937',
            bandHex: '#111827',
            textHex: '#F9FAFB',
            pantone: 'AKUSHA · #1',
          },
          {
            nameRu: 'Молочный беж',
            hex: '#E5E0D8',
            bandHex: '#D4CEC3',
            textHex: '#1F2937',
            pantone: 'AKUSHA · #2',
          },
        ],
      },
    };
  }

  if (brandCode === 'NA_TELE') {
    return {
      fabric: {
        composition: '92% микромодал (Австрия), 8% эластан',
        density: '175–185 г/м²',
        knitType: 'Шелковистое кулирное полотно Soft Touch',
        touchFeel: 'Эффект второй кожи Soft Touch',
        swatchHex: '#F3EFEA',
      },
      construction: {
        type: 'Женский комплект / базовое изделие НА ТЕЛЕ',
        fit: 'Анатомическая посадка · размеры XS–XL',
        sideSeam: 'Деликатный боковой шов без давления',
        frontPanel: 'Мягкая бесшовная обработка краёв',
        gusset: 'Ластовица из 100% органического хлопка',
        seams: 'Плоские деликатные швы, незаметные под одеждой',
      },
      waistband: {
        width: 'Тонкая эластичная тесьма 12–18 мм',
        type: 'Мягкая брендированная посадка НА ТЕЛЕ',
        colorRule: 'Тон в тон с полотном изделия',
        logoRepeat: 'Минималистичный термотрансфер НА ТЕЛЕ внутри',
        elasticity: 'Мягкое прилегание без следов на коже',
        bandBgHex: '#F3EFEA',
        bandTextHex: '#2E2B26',
      },
      palette: {
        id: palId,
        title: `Палитра оттенков — ${cleanTitle}`,
        subtitle: `${unitsInPack} изд. в комплекте · размеры XS–XL · НА ТЕЛЕ`,
        statusLabel: 'В плане',
        colors: [
          {
            nameRu: 'Молочный',
            hex: '#F3EFEA',
            bandHex: '#E5DFD7',
            textHex: '#2E2B26',
            pantone: 'НА ТЕЛЕ · #1',
          },
          {
            nameRu: 'Пудровый беж',
            hex: '#DFC7B8',
            bandHex: '#CFAF9D',
            textHex: '#2E2B26',
            pantone: 'НА ТЕЛЕ · #2',
          },
          {
            nameRu: 'Глубокий чёрный',
            hex: '#1C1B1A',
            bandHex: '#141413',
            textHex: '#F5F5F1',
            pantone: 'НА ТЕЛЕ · #3',
          },
        ],
      },
    };
  }

  if (brandCode === 'FUKAI') {
    return {
      fabric: {
        composition: '95% хлопок пенье, 5% эластан',
        density: '180 г/м²',
        knitType: 'Кулирная гладь базовая',
        touchFeel: 'Натуральный дышащий хлопок на каждый день',
        swatchHex: '#1F242D',
      },
      construction: {
        type: 'Базовый комплект FUKAI',
        fit: 'Стандартная посадка · размеры 44–56',
        sideSeam: 'Сглаженный боковой шов',
        frontPanel: 'Двухслойная передняя деталь',
        gusset: 'Усиленная вставка',
        seams: 'Плоские распошивальные швы',
      },
      waistband: {
        width: '32–35 мм',
        type: 'Эластичный пояс FUKAI',
        colorRule: 'В тон изделия',
        logoRepeat: 'Базовый пояс без лишнего декора',
        elasticity: 'Стабильная фиксация на талии',
        bandBgHex: '#1F242D',
        bandTextHex: '#F3F4F6',
      },
      palette: {
        id: palId,
        title: `Цвета комплекта — ${cleanTitle}`,
        subtitle: `${unitsInPack} шт. в комплекте · размеры 44–56 · FUKAI`,
        statusLabel: 'В плане',
        colors: [
          {
            nameRu: 'Чёрный',
            hex: '#1F242D',
            bandHex: '#151920',
            textHex: '#F3F4F6',
            pantone: 'FUKAI · #1',
          },
          {
            nameRu: 'Тёмно-синий',
            hex: '#25334A',
            bandHex: '#1B2638',
            textHex: '#F3F4F6',
            pantone: 'FUKAI · #2',
          },
          {
            nameRu: 'Графит',
            hex: '#4B5563',
            bandHex: '#374151',
            textHex: '#F3F4F6',
            pantone: 'FUKAI · #3',
          },
        ],
      },
    };
  }

  return {
    fabric: {
      composition: '92% модал / хлопок компакт-пенье, 8% эластан',
      density: '185–195 г/м²',
      knitType: 'Кулирная гладь Premium',
      touchFeel: 'Шелковистый премиальный трикотаж',
      swatchHex: '#1B1C1E',
    },
    construction: {
      type: 'Комплект BORNERS',
      fit: 'Анатомическая посадка · размеры S–XXL',
      sideSeam: 'Без бокового шва / комфортный крой',
      frontPanel: 'Двойная профилированная передняя панель',
      gusset: 'Анатомическая ластовица без задирания',
      seams: 'Плоские эластичные швы Flatlock',
    },
    waistband: {
      width: '35–38 мм',
      type: 'Мягкий жаккардовый пояс BORNERS',
      colorRule: 'В тон основного полотна',
      logoRepeat: 'Фирменный логотип BORNERS тон в тон',
      elasticity: 'Упругая посадка без перекручивания',
      bandBgHex: '#1B1C1E',
      bandTextHex: '#F5F5F1',
    },
    palette: {
      id: palId,
      title: `Палитра комплекта — ${cleanTitle}`,
      subtitle: `${unitsInPack} шт. в комплекте · размеры S–XXL · BORNERS`,
      statusLabel: 'В плане',
      colors: [
        {
          nameRu: 'Чёрный оникс',
          hex: '#1B1C1E',
          bandHex: '#121314',
          textHex: '#F3F4F6',
          pantone: 'Pantone 19-4006 TCX',
        },
        {
          nameRu: 'Графит',
          hex: '#464B53',
          bandHex: '#34383E',
          textHex: '#F3F4F6',
          pantone: 'Pantone 19-3908 TCX',
        },
        {
          nameRu: 'Олива / Хаки',
          hex: '#4A5546',
          bandHex: '#384135',
          textHex: '#F3F4F6',
          pantone: 'Pantone 19-0414 TCX',
        },
      ],
    },
  };
}

export function ensureModelUnifiedV11(rawModel: ScenarioModelSpec): ScenarioModelSpec {
  const codeUpper = (rawModel.code || '').trim().toUpperCase();
  const isBorners2Original =
    codeUpper === '244995893' || rawModel.id === 'scen-acting-244995893';
  const detectedBrand = detectModelBrandPortfolioLabel(rawModel);
  const normBrand = normalizePortfolioBrandCode(detectedBrand);
  const brandSpecs = getBrandDefaultModelSpecs(
    normBrand,
    rawModel.title,
    rawModel.unitsInPack || 1
  );

  // Автоматическая очистка чужих дефолтов Borners2 (WB 244995893 / мужские боксеры / borners-core-modal.svg)
  // у всех новых карточек и карточек брендов LISKANI / AKUSHA / НА ТЕЛЕ / FUKAI
  const rawPalettes = Array.isArray(rawModel.palettes) ? rawModel.palettes : [];
  const hasForeignBorners2Palette =
    !isBorners2Original &&
    (rawPalettes.length === 0 ||
      rawPalettes.some(
        (p) =>
          (p.title || '').includes('244995893') ||
          (p.title || '').includes('Borners2') ||
          (p.imageUrl || '').includes('244995893_main.webp')
      ));

  let cleanedWbArticle = rawModel.wbArticle;
  if (
    !isBorners2Original &&
    cleanedWbArticle === '244995893' &&
    (hasForeignBorners2Palette || normBrand !== 'BORNERS')
  ) {
    cleanedWbArticle = '';
  }

  const rawGallery = Array.isArray(rawModel.gallery) ? rawModel.gallery : [];
  const sanitizedGallery = isBorners2Original
    ? rawGallery
    : rawGallery.filter((g) => {
        const u = (g.url || '').trim();
        const orig = (g.originalUrl || '').trim();
        if (!u && !orig) return false;
        if (
          u.includes('borners-core-modal.svg') ||
          orig.includes('borners-core-modal.svg') ||
          u.includes('244995893_main.webp') ||
          orig.includes('244995893_main.webp')
        ) {
          return false;
        }
        return true;
      });

  const sanitizedPalettes = hasForeignBorners2Palette
    ? [brandSpecs.palette]
    : rawPalettes.map((p) =>
        !isBorners2Original && (p.imageUrl || '').includes('244995893_main.webp')
          ? { ...p, imageUrl: undefined }
          : p
      );

  const isNonUnderwearOrForeignSpec =
    !isBorners2Original &&
    (normBrand === 'LISKANI' ||
      normBrand === 'AKUSHA' ||
      normBrand === 'NA_TELE' ||
      hasForeignBorners2Palette) &&
    ((rawModel.construction?.type || '').includes('Боксеры мужские') ||
      (rawModel.waistband?.type || '').includes('BORNERS (по фото)') ||
      (rawModel.waistband?.logoRepeat || '').includes('Жаккардовый пояс по фото карточки'));

  const model: ScenarioModelSpec = {
    ...rawModel,
    wbArticle: cleanedWbArticle,
    gallery: sanitizedGallery,
    palettes: sanitizedPalettes,
    fabric: isNonUnderwearOrForeignSpec
      ? {
          ...brandSpecs.fabric,
          composition:
            rawModel.fabric?.composition &&
            rawModel.fabric.composition !== '93% хлопок компакт-пенье, 7% спандекс'
              ? rawModel.fabric.composition
              : brandSpecs.fabric.composition,
          density:
            rawModel.fabric?.density && rawModel.fabric.density !== '180–190 г/м²'
              ? rawModel.fabric.density
              : brandSpecs.fabric.density,
          knitType: brandSpecs.fabric.knitType,
        }
      : rawModel.fabric || brandSpecs.fabric,
    construction: isNonUnderwearOrForeignSpec
      ? brandSpecs.construction
      : rawModel.construction || brandSpecs.construction,
    waistband: isNonUnderwearOrForeignSpec
      ? brandSpecs.waistband
      : rawModel.waistband || brandSpecs.waistband,
  };

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

  // Для 7 действующих артикулов WB (ИП Нерсесянц / BORNERS / FUKAI), если они были загружены из старого кэша с нулями (0/0/0),
  // подставляем рабочие ставки WB (комиссия 22%, логистика 95 ₽, реклама 10%, прочие 15 ₽, постоянные 35 ₽)
  const actingSku = getActingSkuByWbOrVendor(model.code, model.title);
  if (
    actingSku &&
    model.marketplaceFeePct === 0 &&
    model.logisticsRub === 0 &&
    model.adsPct === 0
  ) {
    return {
      ...model,
      gallery: enrichedGallery,
      marketplaceFeePct: 22,
      logisticsRub: 95,
      adsPct: 10,
      sharedSupplyAndFact: {
        ...mergedShared,
        expensesFilled: true,
        otherVariableRubPerPack: mergedShared.otherVariableRubPerPack || 15,
        allocatedFixedOpexRubPerPack:
          mergedShared.allocatedFixedOpexRubPerPack ?? 35,
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

  let netOpeningAvailablePacks = Math.max(
    0,
    shared.actualOpeningStockPacks - shared.reservedStockPacks
  );

  // Раздел 5.3 ТЗ: если это сценарий 2028 года, переносим конечный физический остаток 31 декабря 2027 года в начальный остаток января 2028 года
  if (year === 2028) {
    if (plan.initialStockPacks > 0) {
      netOpeningAvailablePacks = Math.max(0, plan.initialStockPacks);
    } else {
      const ref2027Id = scenario.copiedFromScenarioId || 1;
      const plan2027 =
        model.plansByScenario[ref2027Id] ||
        model.plansByScenario[1] ||
        Object.values(model.plansByScenario).find((p) => p.scenarioId !== scenario.id);
      if (plan2027) {
        let stock2027 = Math.max(
          0,
          (shared.actualOpeningStockPacks || plan2027.initialStockPacks || 0) -
            shared.reservedStockPacks
        );
        for (let m27 = 0; m27 < 12; m27++) {
          const rec27 =
            (approvedByMonth[m27] || 0) + (plan2027.monthlyReceiptsPacks?.[m27] || 0);
          const dem27 = Math.max(0, plan2027.monthlyPacks?.[m27] || 0);
          stock2027 = Math.max(0, stock2027 + rec27 - dem27);
        }
        netOpeningAvailablePacks = stock2027;
      }
    }
  }

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
  let unmetPriorDemandPacks = 0;
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
      const netStep = simStock + r - d;
      if (netStep < 0) {
        unmetPriorDemandPacks += -netStep;
        simStock = 0;
      } else {
        simStock = netStep;
      }
      currentCursorM += 1;
    }

    const openingAvailableAtStartPacks = simStock;
    let periodDemandPacks = 0;
    let confirmedReceiptsInPeriodPacks = 0;
    let tempRunning = openingAvailableAtStartPacks - unmetPriorDemandPacks;
    let maxIntraPeriodShortfall = Math.max(0, unmetPriorDemandPacks - openingAvailableAtStartPacks);

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

    // Формула Раздела 4 ТЗ (с учётом переходящего дефицита, если предыдущая партия была уменьшена вручную):
    // потребность = max(0, сумма плановых выкупов за месяцы покрытия + переходящий дефицит + целевой запас на конец периода - доступный остаток к началу покрытия - подтверждённые поступления)
    const formulaNeed = Math.max(
      0,
      periodDemandPacks +
        unmetPriorDemandPacks +
        targetSafety -
        openingAvailableAtStartPacks -
        confirmedReceiptsInPeriodPacks
    );
    const rawNetNeedPacks = Math.max(formulaNeed, maxIntraPeriodShortfall);

    const isScenarioMatchingOverride =
      !pDef.scenarioId || pDef.scenarioId === scenario.id;
    const hasCustomPacksOverride =
      isScenarioMatchingOverride &&
      typeof pDef.customPacksQty === 'number' &&
      pDef.customPacksQty > 0;
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

      const customSizesSum = pDef.customSizeBreakdownPacks
        ? (['S', 'M', 'L', 'XL', 'XXL'] as const).reduce(
            (s, sz) => s + Math.max(0, Math.round(Number(pDef.customSizeBreakdownPacks?.[sz]) || 0)),
            0
          )
        : 0;

      const sizeBreakdownPacks =
        pDef.customSizeBreakdownPacks && customSizesSum === recommendedPacks
          ? {
              S: Math.max(0, Math.round(Number(pDef.customSizeBreakdownPacks.S) || 0)),
              M: Math.max(0, Math.round(Number(pDef.customSizeBreakdownPacks.M) || 0)),
              L: Math.max(0, Math.round(Number(pDef.customSizeBreakdownPacks.L) || 0)),
              XL: Math.max(0, Math.round(Number(pDef.customSizeBreakdownPacks.XL) || 0)),
              XXL: Math.max(0, Math.round(Number(pDef.customSizeBreakdownPacks.XXL) || 0)),
            }
          : allocatePacksBySizeLargestRemainder(
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

    // Продвигаем симулируемый остаток и переходящую потребность через месяцы startM..endM с учётом запланированной партии
    const totalPeriodSupply =
      openingAvailableAtStartPacks + confirmedReceiptsInPeriodPacks + recommendedPacks;
    const totalPeriodRequirement = periodDemandPacks + unmetPriorDemandPacks;
    const netAfterPeriod = totalPeriodSupply - totalPeriodRequirement;
    if (netAfterPeriod < 0) {
      simStock = 0;
      unmetPriorDemandPacks = -netAfterPeriod;
    } else {
      simStock = netAfterPeriod;
      unmetPriorDemandPacks = 0;
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
      | 'coveredEndMonthIdx'
      | 'coverageMonthsLabel'
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
  const nextCoveredEndMonthIdx =
    patch.coveredEndMonthIdx !== undefined
      ? Math.min(11, Math.max(nextArrivalMonthIdx, Math.round(patch.coveredEndMonthIdx)))
      : patch.arrivalMonthIdx !== undefined
      ? Math.max(nextArrivalMonthIdx, target.coveredEndMonthIdx ?? nextArrivalMonthIdx)
      : target.coveredEndMonthIdx ?? nextArrivalMonthIdx;
  const nextCoverageMonthsLabel =
    patch.coverageMonthsLabel !== undefined
      ? patch.coverageMonthsLabel
      : patch.arrivalMonthIdx !== undefined || patch.coveredEndMonthIdx !== undefined
      ? nextArrivalMonthIdx === nextCoveredEndMonthIdx
        ? `${MONTHS_SHORT[nextArrivalMonthIdx]} ${year}`
        : `${MONTHS_SHORT[nextArrivalMonthIdx]}–${MONTHS_SHORT[nextCoveredEndMonthIdx]} ${year}`
      : target.coverageMonthsLabel;
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
    coveredEndMonthIdx: nextCoveredEndMonthIdx,
    coverageMonthsLabel: nextCoverageMonthsLabel,
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
  const logisticsFilled = model.logisticsRub > 0;
  const hasAnyExpenseRate =
    shared.expensesFilled ||
    model.marketplaceFeePct > 0 ||
    model.logisticsRub > 0 ||
    model.adsPct > 0;
  const expensesFilled = hasCost && logisticsFilled && hasAnyExpenseRate;

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

  if (hasCost && hasAnyExpenseRate && annualGrossProfitRub !== null && unitGrossProfitRub !== null) {
    unitMpCommissionRub = Math.round(
      (avgRealizedPricePerPackRub * model.marketplaceFeePct) / 100
    );
    unitAdsRub = Math.round((avgRealizedPricePerPackRub * model.adsPct) / 100);
    unitOtherVarRub = shared.otherVariableRubPerPack || 0;

    annualMpCommissionRub = Math.round(
      (annualRevenueRub * model.marketplaceFeePct) / 100
    );
    annualAdsRub = Math.round((annualRevenueRub * model.adsPct) / 100);
    annualOtherVarRub = annualBuyoutsPacks * unitOtherVarRub;

    if (logisticsFilled) {
      unitLogisticsRub = model.logisticsRub;
      annualLogisticsRub = annualBuyoutsPacks * model.logisticsRub;

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
  }

  const marginStatus: ValueStatusCode = expensesFilled ? 'plan' : 'not_filled';

  // 3. Операционная прибыль = Маржинальная прибыль - распределённые постоянные расходы (OPEX)
  const hasFixedOpexValue =
    shared.allocatedFixedOpexRubPerPack !== null &&
    shared.allocatedFixedOpexRubPerPack >= 0;
  const opexFilled = expensesFilled && hasFixedOpexValue;

  let unitAllocatedOpexRub: number | null = hasFixedOpexValue
    ? shared.allocatedFixedOpexRubPerPack!
    : null;
  let annualAllocatedOpexRub: number | null = hasFixedOpexValue
    ? annualBuyoutsPacks * shared.allocatedFixedOpexRubPerPack!
    : null;
  let unitOperatingProfitRub: number | null = null;
  let annualOperatingProfitRub: number | null = null;
  let operatingMarginPct: number | null = null;
  let operatingProfitNotCalculatedReason: string | null = null;

  if (!hasCost) {
    operatingProfitNotCalculatedReason =
      'Не рассчитано: не заполнена закупочная себестоимость комплекта';
  } else if (!logisticsFilled) {
    operatingProfitNotCalculatedReason =
      'Не рассчитано, пока не заполнена логистика';
  } else if (!expensesFilled) {
    operatingProfitNotCalculatedReason =
      'Не рассчитано: не заполнены комиссия маркетплейса, логистика и реклама';
  } else if (!opexFilled) {
    operatingProfitNotCalculatedReason =
      'Не рассчитано: не заданы постоянные расходы';
  } else if (
    annualContributionMarginRub !== null &&
    unitContributionMarginRub !== null &&
    unitAllocatedOpexRub !== null &&
    annualAllocatedOpexRub !== null
  ) {
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

  // Ближайший платёж фабрике по подтверждённому графику PO (Стр. 6 ТЗ)
  const confirmedPos = procurement.approvedOrders.filter(
    (po) => po.confirmedByFactory !== false && po.status !== 'received'
  );
  let nextFactoryPayment: FinancialPnLResult['nextFactoryPayment'] = null;
  if (confirmedPos.length > 0) {
    const sortedPos = [...confirmedPos].sort((a, b) =>
      a.orderPlacementDateIso.localeCompare(b.orderPlacementDateIso)
    );
    const firstPo = sortedPos[0];
    if (firstPo.status === 'approved') {
      nextFactoryPayment = {
        dateIso: firstPo.orderPlacementDateIso,
        amountRub: firstPo.prepaymentRub,
        orderNumber: firstPo.orderNumber,
        label: `Предоплата ${shared.factoryParams.prepaymentPct}% по ${firstPo.orderNumber}`,
      };
    } else {
      nextFactoryPayment = {
        dateIso: firstPo.requiredArrivalDateIso,
        amountRub: firstPo.balancePaymentRub,
        orderNumber: firstPo.orderNumber,
        label: `Доплата ${shared.factoryParams.balancePaymentPct}% по ${firstPo.orderNumber}`,
      };
    }
  }

  const wbPayoutScheduleConfirmed = Boolean(shared.wbPayoutScheduleConfirmed);
  const peakCapitalDeficitRub = Math.abs(minCumulativeCash);
  const verifiedPeakCapitalDeficitRub = wbPayoutScheduleConfirmed
    ? peakCapitalDeficitRub
    : null;

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
    logisticsFilled,
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
    peakCapitalDeficitRub,
    wbPayoutScheduleConfirmed,
    verifiedPeakCapitalDeficitRub,
    nextFactoryPayment,
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
): 'BORNERS' | 'FUKAI' | 'НА ТЕЛЕ' | 'AKUSHA' | 'LISKANI' | 'Подтвердить бренд' | string {
  if (model.customBrandLabel && model.customBrandLabel.trim().length > 0) {
    const raw = model.customBrandLabel.trim();
    const upper = raw.toUpperCase();
    if (upper === 'АКУША' || upper === 'AKUSHA') return 'AKUSHA';
    if (['LISKANI', 'LISCANI', 'LEZKANI', 'ЛЕЗКАНИ', 'ЛИСКАНИ'].includes(upper)) {
      return 'LISKANI';
    }
    return raw;
  }
  if (model.brandId === 'NA_TELE') return 'НА ТЕЛЕ';
  const digits = model.code.replace(/\D/g, '');
  if (digits === '72302360') return 'FUKAI';
  if (isUnverifiedActingSku(model.code)) return 'Подтвердить бренд';
  return 'BORNERS';
}

export function matchesBrandFilter(
  model: ScenarioModelSpec,
  brandFilter: string
): boolean {
  if (!brandFilter || brandFilter === 'ALL') return true;
  const portfolioBrand = detectModelBrandPortfolioLabel(model).trim();
  const upperBrand = portfolioBrand.toUpperCase();
  const upperFilter = brandFilter.trim().toUpperCase();

  if (upperFilter === 'BORNERS') return upperBrand === 'BORNERS';
  if (upperFilter === 'NA_TELE' || upperFilter === 'НА ТЕЛЕ') {
    return upperBrand === 'НА ТЕЛЕ' || upperBrand === 'NA_TELE' || model.brandId === 'NA_TELE';
  }
  if (upperFilter === 'FUKAI') {
    return upperBrand === 'FUKAI' || upperBrand === 'ПОДТВЕРДИТЬ БРЕНД';
  }
  if (upperFilter === 'AKUSHA' || upperFilter === 'АКУША') {
    return upperBrand === 'АКУША' || upperBrand === 'AKUSHA';
  }
  if (
    upperFilter === 'LISKANI' ||
    upperFilter === 'LISCANI' ||
    upperFilter === 'LEZKANI' ||
    upperFilter === 'ЛЕЗКАНИ' ||
    upperFilter === 'ЛИСКАНИ'
  ) {
    return ['LISKANI', 'LISCANI', 'LEZKANI', 'ЛЕЗКАНИ', 'ЛИСКАНИ'].includes(upperBrand);
  }
  return upperBrand === upperFilter;
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

// =============================================================================
// РАЗДЕЛ 07 И 09 НОВОГО ТЗ (2027): ИНВЕСТИЦИОННЫЙ КАЛЬКУЛЯТОР, ПИК СОБСТВЕННЫХ
// ДЕНЕГ С УЧЁТОМ ОБОРОТА WB, КАЛЕНДАРЬ КЭШФЛОУ 12 МЕС. И СВОДНАЯ ПО БРЕНДАМ
// =============================================================================

export interface ScenarioMonthlyCashflowRow {
  monthIdx: number;
  monthLabel: string;
  grossSalesRub: number;
  wbDeductionsAndAdsRub: number;
  wbNetInflowRub: number;
  factoryPrepaymentOutflowRub: number;
  factoryBalanceOutflowRub: number;
  factoryTotalOutflowRub: number;
  netMonthlyCashflowRub: number;
  cumulativeCashBalanceRub: number;
  isPeakDeficitMonth: boolean;
}

export interface ScenarioInvestmentSummary {
  modelsCount: number;
  annualRevenueRub: number;
  decemberRevenueRub: number;
  annualDemandPacks: number;
  annualDemandUnits: number;

  // 1. Стоимость всех закупок за период (все партии 4 кварталов: утв. + план)
  totalProcurementPacks: number;
  totalProcurementUnits: number;
  totalProcurementBudgetRub: number;
  approvedOrdersCount: number;
  approvedOrdersBudgetRub: number;
  plannedBatchesCount: number;
  plannedBatchesBudgetRub: number;

  // 2. Себестоимость проданного товара (участвует в расчёте прибыли за период)
  annualSoldGoodsCostRub: number;
  annualGrossProfitRub: number;
  annualWbDeductionsAndAdsRub: number;
  annualEstimatedOperatingProfitRub: number;
  operatingMarginPct: number;

  // 3. Вложения до первых поступлений (Старт · Партия №1 / Q1 и аванс 30%)
  firstWavePacks: number;
  firstWaveUnits: number;
  firstWaveStartBudgetRub: number;
  firstWavePrepaymentRub: number;
  firstWaveBalanceRub: number;

  // 4. Максимальная потребность в собственных деньгах (Пик капитала с учётом возврата выручки WB)
  initialCashOnHandRub: number;
  settlementLagMonths: number;
  wbPayoutScheduleSpecified?: boolean;
  verifiedOwnMoneyRequiredRub?: number | null;
  ownMoneyStatusLabel?: string;
  peakWorkingCapitalRub: number;
  netOwnMoneyRequiredRub: number;
  peakMonthIdx: number;
  peakMonthLabel: string;
  selfFundingMonthIdx: number | null;
  selfFundingMonthLabel: string | null;
  yearEndCashBalanceRub: number;
  monthlyRows: ScenarioMonthlyCashflowRow[];
}

export interface ScenarioInvestmentOptions {
  initialCashRub?: number;
  settlementLagMonths?: number | null;
  wbPayoutScheduleSpecified?: boolean;
}

/**
 * Единый расчёт 4 разделённых финансовых показателей сценария (Раздел 07.1–07.3 ТЗ):
 * 1) Стоимость всех закупок за год (4 квартала)
 * 2) Себестоимость проданного товара (в прибыли)
 * 3) Вложить на старт (Партия №1 · Q1 + аванс 30%)
 * 4) Пик собственных денег с учётом помесячного возврата выручки с WB (за вычетом комиссии, логистики и рекламы)
 */
export function computeScenarioInvestmentSummary(
  rawModels: ScenarioModelSpec[],
  scenario: GrowthScenarioDef,
  options: ScenarioInvestmentOptions = {}
): ScenarioInvestmentSummary {
  const initialCashOnHandRub = Math.max(0, Math.round(options.initialCashRub || 0));
  const wbPayoutScheduleSpecified =
    options.wbPayoutScheduleSpecified !== undefined
      ? options.wbPayoutScheduleSpecified
      : options.settlementLagMonths !== null &&
        (options.settlementLagMonths === undefined || options.settlementLagMonths >= 0);
  const settlementLagMonths = Math.max(
    0,
    Math.min(3, Math.round(options.settlementLagMonths ?? 0))
  );

  // Защита от двойного счёта моделей по ID/коду
  const seenModelIds = new Set<string>();
  const uniqueModels: ScenarioModelSpec[] = [];
  for (const rm of rawModels) {
    if (!rm || rm.launchStatus === 'В архиве') continue;
    const key = rm.id || rm.code;
    if (seenModelIds.has(key)) continue;
    seenModelIds.add(key);
    uniqueModels.push(ensureModelUnifiedV11(rm));
  }

  let annualRevenueRub = 0;
  let decemberRevenueRub = 0;
  let annualDemandPacks = 0;
  let annualDemandUnits = 0;

  let totalProcurementPacks = 0;
  let totalProcurementUnits = 0;
  let totalProcurementBudgetRub = 0;
  let approvedOrdersCount = 0;
  let approvedOrdersBudgetRub = 0;
  let plannedBatchesCount = 0;
  let plannedBatchesBudgetRub = 0;

  let annualSoldGoodsCostRub = 0;
  let annualWbDeductionsAndAdsRub = 0;

  let firstWavePacks = 0;
  let firstWaveUnits = 0;
  let firstWaveStartBudgetRub = 0;
  let firstWavePrepaymentRub = 0;

  const monthlyGrossSalesRub = Array(12).fill(0) as number[];
  const monthlyWbDeductionsRub = Array(12).fill(0) as number[];
  const monthlyPrepayOutflowRub = Array(12).fill(0) as number[];
  const monthlyBalanceOutflowRub = Array(12).fill(0) as number[];

  for (const m of uniqueModels) {
    const proc = computeProcurementPlan(m, scenario);
    const pnl = computeFinancialPnL(m, scenario, proc);
    const shared = m.sharedSupplyAndFact!;
    const prepayPct = shared.factoryParams.prepaymentPct ?? 30;

    annualRevenueRub += pnl.annualRevenueRub;
    decemberRevenueRub += pnl.targetMonthRevenueRub;
    annualDemandPacks += proc.annualDemandPacks;
    annualDemandUnits += proc.annualDemandUnits;

    const confirmedPos = proc.approvedOrders.filter(
      (po) => po.confirmedByFactory !== false
    );
    const modelApprovedRub = confirmedPos.reduce((s, po) => s + po.totalOrderRub, 0);
    const modelPlannedRub = proc.totalRecommendedBudgetRub || 0;

    approvedOrdersCount += confirmedPos.length;
    approvedOrdersBudgetRub += modelApprovedRub;
    plannedBatchesCount += proc.recommendedBatches.length;
    plannedBatchesBudgetRub += modelPlannedRub;

    totalProcurementPacks +=
      proc.totalApprovedReceiptsPacks + proc.totalRecommendedPacks;
    totalProcurementUnits +=
      proc.totalApprovedReceiptsUnits + proc.totalRecommendedUnits;
    totalProcurementBudgetRub += modelApprovedRub + modelPlannedRub;

    // 2. Себестоимость проданного товара (выкупы * себестоимость комплекта)
    const unitCost = Math.max(0, m.unitCostRub || 0);
    const soldCost =
      pnl.annualCogsRub !== null ? pnl.annualCogsRub : proc.annualDemandPacks * unitCost;
    annualSoldGoodsCostRub += soldCost;

    // 3. Вложения на старт (Партия №1 / Q1)
    const firstDraft = proc.recommendedBatches[0];
    const earliestPo = [...confirmedPos].sort(
      (a, b) => a.arrivalMonthIdx - b.arrivalMonthIdx
    )[0];
    if (
      earliestPo &&
      (!firstDraft || earliestPo.arrivalMonthIdx <= firstDraft.firstCoveredMonthIdx)
    ) {
      firstWavePacks += earliestPo.packsQty;
      firstWaveUnits += earliestPo.packsQty * earliestPo.unitsInPack;
      firstWaveStartBudgetRub += earliestPo.totalOrderRub;
      firstWavePrepaymentRub += Math.round((earliestPo.totalOrderRub * prepayPct) / 100);
    } else if (firstDraft) {
      firstWavePacks += firstDraft.recommendedPacks;
      firstWaveUnits += firstDraft.physicalUnitsQty;
      firstWaveStartBudgetRub += firstDraft.estimatedTotalRub;
      firstWavePrepaymentRub += firstDraft.prepaymentRub;
    }

    // 4. Помесячные потоки WB и оплат фабрикам по модели
    const plan =
      m.plansByScenario[scenario.id] ||
      m.plansByScenario[1] || {
        monthlyPacks: Array(12).fill(0),
        monthlyPricesRub: Array(12).fill(m.retailPriceRub),
      };
    const actingSku = getActingSkuByWbOrVendor(m.code, m.title);
    const isUnmodifiedActing =
      actingSku &&
      plan.monthlyPacks.every((p, idx) => p === actingSku.monthly[idx]?.buyouts_sets) &&
      plan.monthlyPricesRub.every(
        (pr, idx) => pr === actingSku.monthly[idx]?.realization_price_rub
      );

    // Ставки удержаний WB и рекламы для реалистичного расчёта возврата выручки на счёт
    const mpPct = m.marketplaceFeePct > 0 ? m.marketplaceFeePct : 22;
    const adsPct = m.adsPct > 0 ? m.adsPct : 10;
    const logRub = m.logisticsRub > 0 ? m.logisticsRub : 95;
    const otherVarRub = shared.otherVariableRubPerPack || 0;

    for (let idx = 0; idx < 12; idx++) {
      const act = shared.actualSalesByMonth[idx];
      const packsM =
        act && act.actualBuyoutsPacks !== null
          ? Math.max(0, act.actualBuyoutsPacks)
          : Math.max(0, plan.monthlyPacks[idx] || 0);
      const revM =
        act && act.actualBuyoutsPacks !== null
          ? packsM *
            (act.actualPriceRub !== null
              ? act.actualPriceRub
              : plan.monthlyPricesRub[idx] ?? m.retailPriceRub)
          : isUnmodifiedActing
          ? actingSku.monthly[idx]?.revenue_rub || 0
          : packsM * (plan.monthlyPricesRub[idx] ?? m.retailPriceRub);

      const deductionsM =
        Math.round((revM * (mpPct + adsPct)) / 100) +
        packsM * (logRub + otherVarRub);

      monthlyGrossSalesRub[idx] += revM;
      monthlyWbDeductionsRub[idx] += Math.min(revM, deductionsM);
      annualWbDeductionsAndAdsRub += Math.min(revM, deductionsM);
    }

    // График оплат фабрикам: аванс (в месяц размещения заказа) + доплата (к приходу партии)
    for (const po of confirmedPos) {
      const orderM = Math.max(
        0,
        po.arrivalMonthIdx - Math.ceil(po.leadTimeDaysAtApproval / 30)
      );
      const arrivalM = Math.min(11, Math.max(0, po.arrivalMonthIdx));
      monthlyPrepayOutflowRub[orderM] += po.prepaymentRub;
      monthlyBalanceOutflowRub[arrivalM] += po.balancePaymentRub;
    }
    for (const rb of proc.recommendedBatches) {
      const orderM = Math.max(
        0,
        rb.firstCoveredMonthIdx - Math.ceil(rb.totalLeadDays / 30)
      );
      const arrivalM = Math.min(11, Math.max(0, rb.firstCoveredMonthIdx));
      monthlyPrepayOutflowRub[orderM] += rb.prepaymentRub;
      monthlyBalanceOutflowRub[arrivalM] += rb.balancePaymentRub;
    }
  }

  const firstWaveBalanceRub = Math.max(0, firstWaveStartBudgetRub - firstWavePrepaymentRub);
  const annualGrossProfitRub = annualRevenueRub - annualSoldGoodsCostRub;
  const annualEstimatedOperatingProfitRub =
    annualGrossProfitRub - annualWbDeductionsAndAdsRub;
  const operatingMarginPct =
    annualRevenueRub > 0
      ? Math.round((annualEstimatedOperatingProfitRub / annualRevenueRub) * 1000) / 10
      : 0;

  // Строим 12-месячный календарь кэшфлоу и находим точку максимального кассового разрыва (пик капитала)
  const monthlyRows: ScenarioMonthlyCashflowRow[] = [];
  let runningCashFromZero = 0;
  let minCumulativeFromZero = 0;
  let peakMonthIdx = 0;

  for (let m = 0; m < 12; m++) {
    const srcM = m - settlementLagMonths;
    const grossSalesRub = srcM >= 0 ? monthlyGrossSalesRub[srcM] : 0;
    const wbDeductionsAndAdsRub = srcM >= 0 ? monthlyWbDeductionsRub[srcM] : 0;
    const wbNetInflowRub = Math.max(0, grossSalesRub - wbDeductionsAndAdsRub);

    const factoryPrepaymentOutflowRub = monthlyPrepayOutflowRub[m] || 0;
    const factoryBalanceOutflowRub = monthlyBalanceOutflowRub[m] || 0;
    const factoryTotalOutflowRub =
      factoryPrepaymentOutflowRub + factoryBalanceOutflowRub;

    // Внутри месяца сначала уходят платежи фабрике на старт периода, затем поступает выручка WB.
    // Для честной оценки пика капитала в Январе (месяц 0) проверяем также предоплату + доплату Партии №1 до прихода выручки:
    const intraMonthLowBeforeInflow = runningCashFromZero - factoryTotalOutflowRub;
    if (m === 0 && intraMonthLowBeforeInflow < minCumulativeFromZero) {
      minCumulativeFromZero = intraMonthLowBeforeInflow;
      peakMonthIdx = 0;
    }

    const netMonthlyCashflowRub = wbNetInflowRub - factoryTotalOutflowRub;
    runningCashFromZero += netMonthlyCashflowRub;

    if (runningCashFromZero < minCumulativeFromZero) {
      minCumulativeFromZero = runningCashFromZero;
      peakMonthIdx = m;
    }

    monthlyRows.push({
      monthIdx: m,
      monthLabel: MONTHS_SHORT[m],
      grossSalesRub,
      wbDeductionsAndAdsRub,
      wbNetInflowRub,
      factoryPrepaymentOutflowRub,
      factoryBalanceOutflowRub,
      factoryTotalOutflowRub,
      netMonthlyCashflowRub,
      cumulativeCashBalanceRub: initialCashOnHandRub + runningCashFromZero,
      isPeakDeficitMonth: false,
    });
  }

  if (monthlyRows[peakMonthIdx]) {
    monthlyRows[peakMonthIdx].isPeakDeficitMonth = true;
  }

  // Пик потребности в оборотном капитале (от 0 ₽) — не меньше стартового аванса 1-й волны
  // Раздел 8.5 и Тест 10 ТЗ: если график выплат WB не указан, не выдумываем точную максимальную потребность в собственных деньгах
  const rawPeakWorkingCapitalRub = Math.max(
    firstWavePrepaymentRub,
    Math.abs(Math.min(0, minCumulativeFromZero))
  );
  const peakWorkingCapitalRub = wbPayoutScheduleSpecified ? rawPeakWorkingCapitalRub : 0;
  const netOwnMoneyRequiredRub = wbPayoutScheduleSpecified
    ? Math.max(0, peakWorkingCapitalRub - initialCashOnHandRub)
    : 0;
  const verifiedOwnMoneyRequiredRub = wbPayoutScheduleSpecified
    ? netOwnMoneyRequiredRub
    : null;
  const ownMoneyStatusLabel = wbPayoutScheduleSpecified
    ? 'Рассчитано по календарю выплат WB и платежей фабрикам'
    : 'Недостаточно данных для расчёта потребности в собственных деньгах';

  // Месяц выхода на самоокупаемость (когда накопленный баланс после пика стабильно >= 0)
  let selfFundingMonthIdx: number | null = null;
  for (let m = peakMonthIdx; m < 12; m++) {
    const allSubsequentNonNegative = monthlyRows
      .slice(m)
      .every((r) => r.cumulativeCashBalanceRub >= 0);
    if (allSubsequentNonNegative && monthlyRows[m].cumulativeCashBalanceRub >= 0) {
      selfFundingMonthIdx = m;
      break;
    }
  }

  return {
    modelsCount: uniqueModels.length,
    annualRevenueRub,
    decemberRevenueRub,
    annualDemandPacks,
    annualDemandUnits,
    totalProcurementPacks,
    totalProcurementUnits,
    totalProcurementBudgetRub,
    approvedOrdersCount,
    approvedOrdersBudgetRub,
    plannedBatchesCount,
    plannedBatchesBudgetRub,
    annualSoldGoodsCostRub,
    annualGrossProfitRub,
    annualWbDeductionsAndAdsRub,
    annualEstimatedOperatingProfitRub,
    operatingMarginPct,
    firstWavePacks,
    firstWaveUnits,
    firstWaveStartBudgetRub,
    firstWavePrepaymentRub,
    firstWaveBalanceRub,
    initialCashOnHandRub,
    settlementLagMonths,
    wbPayoutScheduleSpecified,
    verifiedOwnMoneyRequiredRub,
    ownMoneyStatusLabel,
    peakWorkingCapitalRub,
    netOwnMoneyRequiredRub,
    peakMonthIdx,
    peakMonthLabel: MONTHS_SHORT[peakMonthIdx] || 'Янв',
    selfFundingMonthIdx,
    selfFundingMonthLabel:
      selfFundingMonthIdx !== null ? MONTHS_SHORT[selfFundingMonthIdx] : null,
    yearEndCashBalanceRub:
      monthlyRows[11]?.cumulativeCashBalanceRub ?? initialCashOnHandRub,
    monthlyRows,
  };
}

export interface BrandInvestmentSummaryRow {
  brandCode: 'BORNERS' | 'FUKAI' | 'NA_TELE' | 'AKUSHA' | 'LISKANI';
  brandTitle: string;
  modelsCount: number;
  decemberRevenueRub: number;
  annualRevenueRub: number;
  annualDemandPacks: number;
  totalProcurementPacks: number;
  totalProcurementUnits: number;
  firstWaveStartBudgetRub: number;
  firstWavePrepaymentRub: number;
  peakWorkingCapitalRub: number;
  totalProcurementBudgetRub: number;
  annualSoldGoodsCostRub: number;
  annualEstimatedOperatingProfitRub: number;
  operatingMarginPct: number;
}

export interface GroupBrandsInvestmentReport {
  brands: BrandInvestmentSummaryRow[];
  groupTotal: ScenarioInvestmentSummary;
}

const PORTFOLIO_BRANDS_ORDER: {
  code: BrandInvestmentSummaryRow['brandCode'];
  title: string;
}[] = [
  { code: 'BORNERS', title: 'BORNERS' },
  { code: 'FUKAI', title: 'FUKAI' },
  { code: 'NA_TELE', title: 'НА ТЕЛЕ' },
  { code: 'AKUSHA', title: 'AKUSHA' },
  { code: 'LISKANI', title: 'LISKANI' },
];

/**
 * Сводный расчёт инвестиций, закупок и прибыли по каждому из 5 брендов холдинга + ИТОГО ГРУППА без двойного счёта (Раздел 09.2 ТЗ).
 */
export function computeGroupBrandsInvestmentReport(
  eligibleModels: ScenarioModelSpec[],
  scenario: GrowthScenarioDef,
  options: ScenarioInvestmentOptions = {}
): GroupBrandsInvestmentReport {
  const seenIds = new Set<string>();
  const dedupedModels: ScenarioModelSpec[] = [];
  for (const m of eligibleModels) {
    if (!m || m.launchStatus === 'В архиве') continue;
    const key = m.id || m.code;
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    dedupedModels.push(ensureModelUnifiedV11(m));
  }

  const brands: BrandInvestmentSummaryRow[] = PORTFOLIO_BRANDS_ORDER.map(
    ({ code, title }) => {
      const brandModels = dedupedModels.filter((m) => matchesBrandFilter(m, code));
      const summary = computeScenarioInvestmentSummary(brandModels, scenario, {
        initialCashRub: 0,
        settlementLagMonths: options.settlementLagMonths ?? 0,
      });
      return {
        brandCode: code,
        brandTitle: title,
        modelsCount: summary.modelsCount,
        decemberRevenueRub: summary.decemberRevenueRub,
        annualRevenueRub: summary.annualRevenueRub,
        annualDemandPacks: summary.annualDemandPacks,
        totalProcurementPacks: summary.totalProcurementPacks,
        totalProcurementUnits: summary.totalProcurementUnits,
        firstWaveStartBudgetRub: summary.firstWaveStartBudgetRub,
        firstWavePrepaymentRub: summary.firstWavePrepaymentRub,
        peakWorkingCapitalRub: summary.peakWorkingCapitalRub,
        totalProcurementBudgetRub: summary.totalProcurementBudgetRub,
        annualSoldGoodsCostRub: summary.annualSoldGoodsCostRub,
        annualEstimatedOperatingProfitRub: summary.annualEstimatedOperatingProfitRub,
        operatingMarginPct: summary.operatingMarginPct,
      };
    }
  );

  const groupTotal = computeScenarioInvestmentSummary(
    dedupedModels,
    scenario,
    options
  );

  return {
    brands,
    groupTotal,
  };
}

/**
 * Выгрузка полной спецификации заказа фабрике в CSV для Excel (Раздел 06.5 ТЗ):
 * включает как утверждённые заказы PO, так и плановые партии (или только 1-ю волну Q1),
 * с разбивкой по размерам S–XXL, комплектам, физ. единицам, авансу 30%, доплате 70% и датам.
 */
export function serializeScenarioFactoryOrdersToCsv(
  rawModels: ScenarioModelSpec[],
  scenario: GrowthScenarioDef,
  mode: 'all' | 'first_wave' | 'approved_only' = 'all'
): string {
  const header = [
    'Тип партии',
    'Номер заказа / Партия',
    'Статус',
    'Бренд',
    'Артикул SKU',
    'Название модели',
    'Фабрика',
    'Период покрытия',
    'Заказать до (дата)',
    'Приход на склад (дата)',
    'Изделий в компл.',
    'К заказу (компл.)',
    'К заказу (физ. изд.)',
    'Размер S (компл.)',
    'Размер M (компл.)',
    'Размер L (компл.)',
    'Размер XL (компл.)',
    'Размер XXL (компл.)',
    'Себестоимость компл. ₽',
    'Сумма партии ₽',
    'Аванс ₽',
    'Доплата перед отгрузкой ₽',
  ].join(';');

  const rows: string[] = [];
  const seenIds = new Set<string>();

  for (const rm of rawModels) {
    if (!rm || rm.launchStatus === 'В архиве') continue;
    const key = rm.id || rm.code;
    if (seenIds.has(key)) continue;
    seenIds.add(key);

    const model = ensureModelUnifiedV11(rm);
    const brandLabel = detectModelBrandPortfolioLabel(model);
    const proc = computeProcurementPlan(model, scenario);
    const defaultShares = model.sharedSupplyAndFact?.factoryParams.sizeSharesPct || {
      S: 10,
      M: 25,
      L: 35,
      XL: 20,
      XXL: 10,
    };

    const sortedPos = [...proc.approvedOrders].sort(
      (a, b) => a.arrivalMonthIdx - b.arrivalMonthIdx
    );

    for (let idx = 0; idx < sortedPos.length; idx++) {
      const po = sortedPos[idx];
      if (mode === 'first_wave' && idx > 0 && po.arrivalMonthIdx > 2) continue;
      const sizes =
        po.sizeBreakdownPacks ||
        allocatePacksBySizeLargestRemainder(po.packsQty, defaultShares);
      rows.push(
        [
          'Утверждённый заказ фабрике',
          po.orderNumber,
          PO_STATUS_LABELS_RU[po.status] || po.status,
          `"${brandLabel.replace(/"/g, '""')}"`,
          model.code,
          `"${(model.title || '').replace(/"/g, '""')}"`,
          `"${(po.factoryName || '').replace(/"/g, '""')}"`,
          po.coverageMonthsLabel || MONTHS_SHORT[po.arrivalMonthIdx] || '',
          po.orderPlacementDateIso,
          po.requiredArrivalDateIso,
          po.unitsInPack,
          po.packsQty,
          po.physicalUnitsQty,
          sizes.S,
          sizes.M,
          sizes.L,
          sizes.XL,
          sizes.XXL,
          po.lockedUnitCostRub,
          po.totalOrderRub,
          po.prepaymentRub,
          po.balancePaymentRub,
        ].join(';')
      );
    }

    if (mode !== 'approved_only') {
      for (let idx = 0; idx < proc.recommendedBatches.length; idx++) {
        const rb = proc.recommendedBatches[idx];
        if (mode === 'first_wave' && idx > 0 && rb.firstCoveredMonthIdx > 2) continue;
        rows.push(
          [
            'Плановая партия к заказу',
            `Партия №${rb.batchIndex}`,
            rb.isTestBatch ? 'Тестовая партия' : 'Черновик плана',
            `"${brandLabel.replace(/"/g, '""')}"`,
            model.code,
            `"${(model.title || '').replace(/"/g, '""')}"`,
            `"${(rb.factoryName || '').replace(/"/g, '""')}"`,
            rb.coverageMonthsLabel,
            rb.recommendedOrderDateIso,
            rb.requiredArrivalDateIso,
            model.unitsInPack,
            rb.recommendedPacks,
            rb.physicalUnitsQty,
            rb.sizeBreakdownPacks.S,
            rb.sizeBreakdownPacks.M,
            rb.sizeBreakdownPacks.L,
            rb.sizeBreakdownPacks.XL,
            rb.sizeBreakdownPacks.XXL,
            rb.unitCostRub,
            rb.estimatedTotalRub,
            rb.prepaymentRub,
            rb.balancePaymentRub,
          ].join(';')
        );
      }
    }
  }

  return `\uFEFF${[header, ...rows].join('\n')}`;
}

// =============================================================================
// ТЗ 08.11.2026: ЕДИНАЯ ПЛАТФОРМА УПРАВЛЕНИЯ НЕСКОЛЬКИМИ БРЕНДАМИ (2027–2028)
// =============================================================================

export type CanonicalBrandCode =
  | 'BORNERS'
  | 'FUKAI'
  | 'AKUSHA'
  | 'LISKANI'
  | 'NA_TELE';

export interface BrandUnitConfig {
  brandCode: CanonicalBrandCode;
  displayCode: 'BORNERS' | 'FUKAI' | 'AKUSHA' | 'LISKANI' | 'НА ТЕЛЕ';
  displayTitle: string;
  categoryDefault: string;
  primaryUnit: string; // компл. | пар | компл. штор
  secondaryUnit: string; // изд. | пар обуви | п.м. ткани
  secondaryPerPrimaryDefault: number;
}

export const BRAND_UNIT_CONFIGS: Record<CanonicalBrandCode, BrandUnitConfig> = {
  BORNERS: {
    brandCode: 'BORNERS',
    displayCode: 'BORNERS',
    displayTitle: 'BORNERS',
    categoryDefault: 'Мужское бельё (комплекты)',
    primaryUnit: 'компл.',
    secondaryUnit: 'изд.',
    secondaryPerPrimaryDefault: 4,
  },
  FUKAI: {
    brandCode: 'FUKAI',
    displayCode: 'FUKAI',
    displayTitle: 'FUKAI',
    categoryDefault: 'Базовые комплекты белья WB',
    primaryUnit: 'компл.',
    secondaryUnit: 'изд.',
    secondaryPerPrimaryDefault: 4,
  },
  AKUSHA: {
    brandCode: 'AKUSHA',
    displayCode: 'AKUSHA',
    displayTitle: 'AKUSHA',
    categoryDefault: 'Обувь',
    primaryUnit: 'пар',
    secondaryUnit: 'пар обуви',
    secondaryPerPrimaryDefault: 1,
  },
  LISKANI: {
    brandCode: 'LISKANI',
    displayCode: 'LISKANI',
    displayTitle: 'LISKANI',
    categoryDefault: 'Шторы и интерьерный текстиль',
    primaryUnit: 'компл. штор',
    secondaryUnit: 'п.м. ткани',
    secondaryPerPrimaryDefault: 6,
  },
  NA_TELE: {
    brandCode: 'NA_TELE',
    displayCode: 'НА ТЕЛЕ',
    displayTitle: 'НА ТЕЛЕ',
    categoryDefault: 'Базовое и женское бельё',
    primaryUnit: 'компл.',
    secondaryUnit: 'изд.',
    secondaryPerPrimaryDefault: 2,
  },
};

export function normalizePortfolioBrandCode(
  brandInput?: string | null
): CanonicalBrandCode | 'ALL' {
  if (!brandInput) return 'ALL';
  const upper = brandInput.trim().toUpperCase();
  if (upper === 'ALL' || upper === 'ВСЕ БРЕНДЫ') return 'ALL';
  if (upper === 'BORNERS') return 'BORNERS';
  if (upper === 'FUKAI' || upper === 'ПОДТВЕРДИТЬ БРЕНД') return 'FUKAI';
  if (upper === 'AKUSHA' || upper === 'АКУША') return 'AKUSHA';
  if (
    upper === 'LISKANI' ||
    upper === 'LISCANI' ||
    upper === 'LEZKANI' ||
    upper === 'ЛИСКАНИ' ||
    upper === 'ЛЕЗКАНИ'
  ) {
    return 'LISKANI';
  }
  if (upper === 'NA_TELE' || upper === 'НА ТЕЛЕ') return 'NA_TELE';
  return 'BORNERS';
}

export function getBrandUnitConfig(
  brandOrModel: string | ScenarioModelSpec
): BrandUnitConfig {
  if (typeof brandOrModel === 'string') {
    const code = normalizePortfolioBrandCode(brandOrModel);
    return BRAND_UNIT_CONFIGS[code === 'ALL' ? 'BORNERS' : code];
  }
  const detectedLabel = detectModelBrandPortfolioLabel(brandOrModel);
  const code = normalizePortfolioBrandCode(detectedLabel);
  const base = BRAND_UNIT_CONFIGS[code === 'ALL' ? 'BORNERS' : code];
  return {
    ...base,
    categoryDefault: brandOrModel.categoryLabel || base.categoryDefault,
    primaryUnit: brandOrModel.primaryUnitLabel || base.primaryUnit,
    secondaryUnit: brandOrModel.secondaryUnitLabel || base.secondaryUnit,
  };
}

/**
 * Раздел 3 и Тест 1, 8 ТЗ: Получение независимых сценариев конкретного бренда.
 * Если строгий режим (onlyExplicitForNewBrands = true), для брендов AKUSHA / LISCANI / НА ТЕЛЕ
 * возвращает только сценарии, явно созданные для этого бренда (если их ещё нет -> пустой массив => «Нет сценария»).
 */
export function getScenariosForBrand(
  scenarios: GrowthScenarioDef[],
  brandFilter: string,
  options?: { yearFilter?: number | 'ALL'; onlyExplicitForNewBrands?: boolean }
): GrowthScenarioDef[] {
  const activeScenarios = scenarios.filter((s) => !s.isArchived);
  const normBrand = normalizePortfolioBrandCode(brandFilter);
  const yearFilter = options?.yearFilter ?? 'ALL';
  const onlyExplicit = options?.onlyExplicitForNewBrands ?? false;

  const byBrand = activeScenarios.filter((s) => {
    if (normBrand === 'ALL') return true;
    const owner = s.ownerBrandCode
      ? normalizePortfolioBrandCode(s.ownerBrandCode)
      : 'BORNERS';
    if (s.ownerBrandCode === 'ALL') return !onlyExplicit;
    if (owner === normBrand) return true;
    // Для BORNERS и FUKAI базовые сценарии 100, 1, 2, 3 доступны по умолчанию
    if (!s.ownerBrandCode && (normBrand === 'BORNERS' || normBrand === 'FUKAI')) {
      return true;
    }
    if (!onlyExplicit && !s.ownerBrandCode && normBrand === 'NA_TELE' && (s.id === 2 || s.id === 3)) {
      return true;
    }
    return false;
  });

  const byYear =
    yearFilter === 'ALL'
      ? byBrand
      : byBrand.filter((s) => (s.year || 2027) === yearFilter);

  return [...byYear].sort((a, b) =>
    a.id === 100 ? -1 : b.id === 100 ? 1 : a.id - b.id
  );
}

/**
 * Раздел 5.3 и Тест 6 ТЗ: Расчёт переходящего физического остатка с 31 декабря 2027 года на 1 января 2028 года.
 */
export function computeCarryOverStock2027To2028(
  rawModel: ScenarioModelSpec,
  scenario2027OrId?: GrowthScenarioDef | number
): number {
  const model = ensureModelUnifiedV11(rawModel);
  const shared = model.sharedSupplyAndFact!;
  const scen2027Id =
    typeof scenario2027OrId === 'number'
      ? scenario2027OrId
      : scenario2027OrId?.id || 1;
  const plan2027 =
    model.plansByScenario[scen2027Id] ||
    model.plansByScenario[1] ||
    Object.values(model.plansByScenario)[0];

  const approvedByMonth = Array(12).fill(0);
  for (const po of shared.approvedOrders) {
    if (po.confirmedByFactory === false) continue;
    if (po.arrivalMonthIdx >= 0 && po.arrivalMonthIdx < 12) {
      approvedByMonth[po.arrivalMonthIdx] += po.packsQty;
    }
  }

  let running = Math.max(
    0,
    (shared.actualOpeningStockPacks || plan2027?.initialStockPacks || 0) -
      shared.reservedStockPacks
  );
  if (!plan2027) return running;

  for (let m = 0; m < 12; m++) {
    const receipts =
      (approvedByMonth[m] || 0) + (plan2027.monthlyReceiptsPacks?.[m] || 0);
    const demand = Math.max(0, plan2027.monthlyPacks?.[m] || 0);
    running = Math.max(0, running + receipts - demand);
  }
  return running;
}

/**
 * Раздел 3.1–3.4 и Тест 1, 4, 6 ТЗ: Создание независимого сценария бренда (или копирование из существующего)
 * БЕЗ дублирования карточек товаров, фотографий, реальных складских остатков и утверждённых заказов фабрикам!
 */
export function createIndependentBrandScenario(
  scenarios: GrowthScenarioDef[],
  models: ScenarioModelSpec[],
  input: {
    title: string;
    brandCode: string;
    year?: number;
    monthlyTargetMln: number;
    copyFromScenarioId?: number | null;
  }
): {
  scenario: GrowthScenarioDef;
  scenarios: GrowthScenarioDef[];
  models: ScenarioModelSpec[];
} {
  const normBrand = normalizePortfolioBrandCode(input.brandCode);
  const effectiveBrand: CanonicalBrandCode =
    normBrand === 'ALL' ? 'BORNERS' : normBrand;
  const unitCfg = BRAND_UNIT_CONFIGS[effectiveBrand];
  const year = input.year === 2028 ? 2028 : 2027;
  const maxId = scenarios.reduce((mx, s) => Math.max(mx, s.id === 100 ? 3 : s.id), 3);
  const newId = maxId + 1;
  const copySourceId = input.copyFromScenarioId ?? null;
  const sourceScenario =
    copySourceId !== null ? scenarios.find((s) => s.id === copySourceId) : undefined;

  const newScenario: GrowthScenarioDef = {
    id: newId,
    title: input.title.trim() || `${unitCfg.displayCode} — базовый план ${year}`,
    monthlyTargetMln: Math.max(1, Number(input.monthlyTargetMln) || 50),
    targetMonthLabel: `Декабрь ${year}`,
    targetMonthIdx: 11,
    scopeLabel: unitCfg.displayCode,
    includedBrands:
      effectiveBrand === 'NA_TELE' ? ['BORNERS', 'NA_TELE'] : ['BORNERS', 'NA_TELE'],
    year,
    ownerBrandCode: effectiveBrand,
    copiedFromScenarioId: copySourceId,
    isArchived: false,
  };

  // Обновляем только сценарные планы внутри существующих моделей (без дублирования карточек и заказов PO!)
  const updatedModels = models.map((rawM) => {
    const m = ensureModelUnifiedV11(rawM);
    const belongsToBrand = matchesBrandFilter(m, effectiveBrand);
    const sourcePlan =
      copySourceId !== null ? m.plansByScenario[copySourceId] : undefined;

    const carryOverStock =
      year === 2028 && (!sourceScenario || sourceScenario.year === 2027)
        ? computeCarryOverStock2027To2028(m, copySourceId || 1)
        : sourcePlan?.initialStockPacks ?? 0;

    const nextPlan =
      sourcePlan && belongsToBrand
        ? {
            ...sourcePlan,
            scenarioId: newId,
            monthlyPacks: [...sourcePlan.monthlyPacks],
            monthlyPricesRub: [...sourcePlan.monthlyPricesRub],
            monthlyReceiptsPacks:
              year === 2028 ? Array(12).fill(0) : [...sourcePlan.monthlyReceiptsPacks],
            initialStockPacks: carryOverStock,
          }
        : {
            scenarioId: newId,
            monthlyPacks: Array(12).fill(0),
            monthlyPricesRub: Array(12).fill(m.retailPriceRub),
            monthlyReceiptsPacks: Array(12).fill(0),
            initialStockPacks: belongsToBrand ? carryOverStock : 0,
            firstOrderPacks: 0,
            nextOrderDateLabel: `15 января ${year}`,
            salesStartMonthIdx: 0,
            warehouseArrivalMonthIdx: 0,
            warehouseArrivalDateLabel: '1 января',
          };

    return {
      ...m,
      plansByScenario: {
        ...m.plansByScenario,
        [newId]: nextPlan,
      },
      // Физический склад и утверждённые заказы фабрикам остаются строго общими и неизменными!
      sharedSupplyAndFact: m.sharedSupplyAndFact
        ? {
            ...m.sharedSupplyAndFact,
            approvedOrders: [...m.sharedSupplyAndFact.approvedOrders],
          }
        : m.sharedSupplyAndFact,
    };
  });

  return {
    scenario: newScenario,
    scenarios: [...scenarios, newScenario],
    models: updatedModels,
  };
}

export function renameBrandScenario(
  scenarios: GrowthScenarioDef[],
  scenarioId: number,
  patch: { title?: string; monthlyTargetMln?: number; year?: number }
): GrowthScenarioDef[] {
  return scenarios.map((s) => {
    if (s.id !== scenarioId) return s;
    const nextYear = patch.year ?? s.year;
    return {
      ...s,
      title: patch.title !== undefined ? patch.title.trim() || s.title : s.title,
      monthlyTargetMln:
        patch.monthlyTargetMln !== undefined
          ? Math.max(1, patch.monthlyTargetMln)
          : s.monthlyTargetMln,
      year: nextYear,
      targetMonthLabel: `Декабрь ${nextYear}`,
    };
  });
}

export function archiveBrandScenario(
  scenarios: GrowthScenarioDef[],
  scenarioId: number
): GrowthScenarioDef[] {
  if (scenarioId === 100) return scenarios;
  return scenarios.map((s) =>
    s.id === scenarioId ? { ...s, isArchived: true } : s
  );
}

export function deleteBrandScenario(
  scenarios: GrowthScenarioDef[],
  models: ScenarioModelSpec[],
  scenarioId: number
): {
  deleted: boolean;
  reason?: string;
  scenarios: GrowthScenarioDef[];
  models: ScenarioModelSpec[];
} {
  if (scenarioId === 100 || scenarios.filter((s) => !s.isArchived).length <= 1) {
    return {
      deleted: false,
      reason: 'Базовый сценарий нельзя удалить',
      scenarios,
      models,
    };
  }
  const nextScenarios = scenarios.filter((s) => s.id !== scenarioId);
  const nextModels = models.map((m) => {
    const restPlans = { ...m.plansByScenario };
    delete restPlans[scenarioId];
    return {
      ...m,
      plansByScenario: restPlans,
    };
  });
  return {
    deleted: true,
    scenarios: nextScenarios,
    models: nextModels,
  };
}

/**
 * Раздел 4.4 и Тест 2 ТЗ: Создание нового товара внутри выбранного бренда.
 * Автоматически привязывается к выбранному бренду (например LISCANI), получает правильные единицы измерения,
 * размерную сетку 12/26/30/20/12 (Раздел 6.6) и НЕ получает выдуманный план продаж (0 по всем 12 месяцам до ввода пользователем).
 */
export function createBrandProductModel(
  existingModels: ScenarioModelSpec[],
  scenarios: GrowthScenarioDef[],
  input: {
    title: string;
    brandCode: string;
    code?: string;
    categoryLabel?: string;
    retailPriceRub: number;
    unitCostRub: number;
    unitsInPack?: number;
    factoryName?: string;
    composition?: string;
    imageUrl?: string;
    initialMonthlyPacks?: number[];
  }
): { model: ScenarioModelSpec; models: ScenarioModelSpec[] } {
  const normBrand = normalizePortfolioBrandCode(input.brandCode);
  const effectiveBrand: CanonicalBrandCode =
    normBrand === 'ALL' ? 'BORNERS' : normBrand;
  const unitCfg = BRAND_UNIT_CONFIGS[effectiveBrand];

  const brandModels = existingModels.filter((m) =>
    matchesBrandFilter(m, effectiveBrand)
  );
  const usedNums = new Set<number>();
  brandModels.forEach((m) => {
    const match = m.code.match(/(\d+)$/);
    if (match) usedNums.add(Number(match[1]));
  });
  let candidate =
    effectiveBrand === 'BORNERS'
      ? Math.max(brandModels.length + 1, 24)
      : Math.max(brandModels.length + 1, 1);
  while (usedNums.has(candidate)) candidate += 1;

  const prefix =
    effectiveBrand === 'LISKANI'
      ? 'LSC'
      : effectiveBrand === 'AKUSHA'
        ? 'AKU'
        : effectiveBrand === 'FUKAI'
          ? 'FUK'
          : effectiveBrand === 'NA_TELE'
            ? 'NTL'
            : '№';
  const generatedCode =
    input.code?.trim() ||
    (prefix === '№'
      ? `№${String(candidate).padStart(3, '0')}`
      : `${prefix}-${String(candidate).padStart(3, '0')}`);

  const unitsInPack = Math.max(
    1,
    input.unitsInPack ?? unitCfg.secondaryPerPrimaryDefault
  );
  const cleanPrice = Math.max(0, Math.round(input.retailPriceRub || 1990));
  const cleanCost = Math.max(0, Math.round(input.unitCostRub || 650));
  const category = input.categoryLabel?.trim() || unitCfg.categoryDefault;
  const cleanTitle = input.title.trim() || `${unitCfg.displayCode} НОВАЯ МОДЕЛЬ`;

  const customBrandLabel =
    effectiveBrand === 'AKUSHA'
      ? 'AKUSHA'
      : effectiveBrand === 'LISKANI'
        ? 'LISKANI'
        : effectiveBrand === 'FUKAI'
          ? 'FUKAI'
          : effectiveBrand === 'NA_TELE'
            ? 'НА ТЕЛЕ'
            : 'BORNERS';

  // Раздел 4.4 ТЗ: товар НЕ получает выдуманный план продаж при создании (по умолчанию 0)
  const monthlyPacks =
    Array.isArray(input.initialMonthlyPacks) &&
    input.initialMonthlyPacks.length === 12
      ? [...input.initialMonthlyPacks]
      : Array(12).fill(0);

  const plansByScenario: ScenarioModelSpec['plansByScenario'] = {};
  for (const sc of scenarios) {
    if (sc.id === 100) continue;
    plansByScenario[sc.id] = {
      scenarioId: sc.id,
      monthlyPacks: [...monthlyPacks],
      monthlyPricesRub: Array(12).fill(cleanPrice),
      monthlyReceiptsPacks: Array(12).fill(0),
      initialStockPacks: 0,
      firstOrderPacks: 0,
      nextOrderDateLabel: `15 января ${sc.year || 2027}`,
      salesStartMonthIdx: 0,
      warehouseArrivalMonthIdx: 0,
      warehouseArrivalDateLabel: '1 января',
    };
  }

  const brandSpecs = getBrandDefaultModelSpecs(
    effectiveBrand,
    cleanTitle,
    unitsInPack
  );
  const cleanImageUrl = input.imageUrl?.trim() || '';

  const baseCreated: ScenarioModelSpec = {
    id: `scen-${effectiveBrand.toLowerCase()}-${Date.now()}-${candidate}`,
    code: generatedCode,
    wbArticle: '',
    title: cleanTitle,
    subtitle: `${category} · ${unitsInPack} ${unitCfg.secondaryUnit} / ${unitCfg.primaryUnit}`,
    brandId: effectiveBrand === 'NA_TELE' ? 'NA_TELE' : 'BORNERS',
    customBrandLabel,
    categoryLabel: category,
    primaryUnitLabel: unitCfg.primaryUnit,
    secondaryUnitLabel: unitCfg.secondaryUnit,
    modelStageStatus: 'Идея',
    launchStatus: 'В плане',
    unitsInPack,
    retailPriceRub: cleanPrice,
    unitCostRub: cleanCost,
    marketplaceFeePct: 22,
    logisticsRub: 95,
    adsPct: 10,
    responsiblePerson: 'Владелец бренда',
    priority: 'Высокий',
    hasActualSalesOrPurchases: false,
    fabric: {
      ...brandSpecs.fabric,
      ...(input.composition?.trim()
        ? { composition: input.composition.trim() }
        : {}),
    },
    construction: brandSpecs.construction,
    waistband: brandSpecs.waistband,
    palettes: [brandSpecs.palette],
    gallery: cleanImageUrl
      ? [
          {
            id: `g-main-${Date.now()}`,
            category: 'pack',
            label: cleanTitle,
            url: cleanImageUrl,
            originalUrl: cleanImageUrl,
            isMain: true,
          },
        ]
      : [],
    attachedPdfs: [],
    productionSteps: [],
    plansByScenario,
  };

  const unified = ensureModelUnifiedV11(baseCreated);
  const withDefaultMatrix: ScenarioModelSpec = {
    ...unified,
    sharedSupplyAndFact: {
      ...unified.sharedSupplyAndFact!,
      scalingStage: 'hypothesis',
      factoryParams: {
        ...unified.sharedSupplyAndFact!.factoryParams,
        factoryName:
          input.factoryName?.trim() ||
          unified.sharedSupplyAndFact!.factoryParams.factoryName,
        // Раздел 6.6 ТЗ: размерная сетка по умолчанию S 12%, M 26%, L 30%, XL 20%, XXL 12% = 100%
        sizeSharesPct: { S: 12, M: 26, L: 30, XL: 20, XXL: 12 },
      },
      approvedOrders: [],
    },
  };

  return {
    model: withDefaultMatrix,
    models: [...existingModels, withDefaultMatrix],
  };
}

/**
 * Раздел 4.2 ТЗ: Смена бренда карточки товара с сохранением всей истории, фотографий и документов.
 */
export function changeModelBrandWithAudit(
  rawModel: ScenarioModelSpec,
  nextBrandInput: string,
  author = 'Владелец'
): ScenarioModelSpec {
  const model = ensureModelUnifiedV11(rawModel);
  const prevBrand = detectModelBrandPortfolioLabel(model);
  const normNext = normalizePortfolioBrandCode(nextBrandInput);
  const effectiveNext: CanonicalBrandCode =
    normNext === 'ALL' ? 'BORNERS' : normNext;
  const unitCfg = BRAND_UNIT_CONFIGS[effectiveNext];
  const nextCustomLabel =
    effectiveNext === 'AKUSHA'
      ? 'AKUSHA'
      : effectiveNext === 'LISKANI'
        ? 'LISKANI'
        : effectiveNext === 'FUKAI'
          ? 'FUKAI'
          : effectiveNext === 'NA_TELE'
            ? 'НА ТЕЛЕ'
            : 'BORNERS';

  const shared = model.sharedSupplyAndFact!;
  return {
    ...model,
    brandId: effectiveNext === 'NA_TELE' ? 'NA_TELE' : 'BORNERS',
    customBrandLabel: nextCustomLabel,
    primaryUnitLabel: unitCfg.primaryUnit,
    secondaryUnitLabel: unitCfg.secondaryUnit,
    sharedSupplyAndFact: {
      ...shared,
      passportVersion: (shared.passportVersion || 1) + 1,
      auditHistory: [
        {
          id: `aud-brand-${Date.now()}`,
          timestamp: new Date().toISOString(),
          author,
          category: 'product',
          summary: `Карточка перенесена в каталог бренда ${unitCfg.displayCode}`,
          beforeValue: prevBrand,
          afterValue: unitCfg.displayCode,
          passportVersion: (shared.passportVersion || 1) + 1,
        },
        ...(shared.auditHistory || []),
      ],
    },
  };
}

export interface MultiBrandRowSummary {
  brandCode: CanonicalBrandCode;
  displayCode: 'BORNERS' | 'FUKAI' | 'AKUSHA' | 'LISKANI' | 'НА ТЕЛЕ';
  brandTitle: string;
  primaryUnit: string;
  secondaryUnit: string;
  availableScenarios: GrowthScenarioDef[];
  selectedScenarioId: number | null;
  selectedScenarioTitle: string;
  hasScenario: boolean;
  hasModels: boolean;
  statusMessage: string | null; // «Нет сценария» или «Добавьте первую модель для планирования продаж»
  modelsCount: number;
  annualRevenueRub: number;
  decemberRevenueRub: number;
  totalProcurementQuantity: number;
  totalProcurementSecondaryQuantity: number;
  totalProcurementBudgetRub: number;
  firstWaveStartBudgetRub: number;
  firstWavePrepaymentRub: number;
  peakWorkingCapitalRub: number;
  verifiedOwnMoneyRequiredRub: number | null;
  annualSoldGoodsCostRub: number;
  annualEstimatedOperatingProfitRub: number;
  monthlyRows: ScenarioMonthlyCashflowRow[];
}

export interface MultiBrandPortfolioSummaryResult {
  brands: MultiBrandRowSummary[];
  procurementBreakdownByUnit: {
    brandCode: CanonicalBrandCode;
    displayCode: string;
    quantity: number;
    unitLabel: string;
  }[];
  procurementBreakdownText: string;
  wbPayoutScheduleSpecified: boolean;
  ownMoneyStatusLabel: string;
  groupTotal: {
    modelsCount: number;
    annualRevenueRub: number;
    decemberRevenueRub: number;
    totalProcurementBudgetRub: number;
    firstWaveStartBudgetRub: number;
    firstWavePrepaymentRub: number;
    peakWorkingCapitalRub: number;
    netOwnMoneyRequiredRub: number;
    verifiedOwnMoneyRequiredRub: number | null;
    annualSoldGoodsCostRub: number;
    annualEstimatedOperatingProfitRub: number;
    monthlyRows: ScenarioMonthlyCashflowRow[];
  };
}

const MULTI_BRAND_TABLE_ORDER: CanonicalBrandCode[] = [
  'BORNERS',
  'FUKAI',
  'AKUSHA',
  'LISKANI',
  'NA_TELE',
];

/**
 * Раздел 9 и Тесты 8, 9, 10 ТЗ: Глобальная сводка BORNERS GROUP («Все бренды»).
 * Для каждого бренда выбирается ОДИН свой сценарий (например: BORNERS — сценарий №2, AKUSHA — сценарий №1, LISCANI — сценарий №3).
 * Все сценарии одного бренда никогда не суммируются одновременно (защита от двойного счёта продаж и реальных заказов фабрикам).
 * Единицы измерения разных категорий (комплекты белья, пары обуви, шторы) не сливаются в одно бессмысленное число штук.
 */
export function computeMultiBrandPortfolioSummary(
  rawModels: ScenarioModelSpec[],
  scenarios: GrowthScenarioDef[],
  selectedScenarioByBrand: Partial<Record<CanonicalBrandCode | 'LISCANI', number | null>>,
  options: ScenarioInvestmentOptions = {}
): MultiBrandPortfolioSummaryResult {
  const initialCashOnHandRub = Math.max(0, Math.round(options.initialCashRub || 0));
  const wbPayoutScheduleSpecified =
    options.wbPayoutScheduleSpecified !== undefined
      ? options.wbPayoutScheduleSpecified
      : options.settlementLagMonths !== null &&
        (options.settlementLagMonths === undefined || options.settlementLagMonths >= 0);
  const settlementLagMonths = Math.max(
    0,
    Math.min(3, Math.round(options.settlementLagMonths ?? 0))
  );

  // Дедупликация карточек товаров по ID/коду (единый каталог, Раздел 4 и 10.3 ТЗ)
  const seenModelKeys = new Set<string>();
  const catalogModels: ScenarioModelSpec[] = [];
  for (const rm of rawModels) {
    if (!rm || rm.launchStatus === 'В архиве') continue;
    const key = rm.id || rm.code;
    if (seenModelKeys.has(key)) continue;
    seenModelKeys.add(key);
    catalogModels.push(ensureModelUnifiedV11(rm));
  }

  const combinedMonthlyGrossSalesRub = Array(12).fill(0) as number[];
  const combinedMonthlyWbDeductionsRub = Array(12).fill(0) as number[];
  const combinedMonthlyPrepayOutflowRub = Array(12).fill(0) as number[];
  const combinedMonthlyBalanceOutflowRub = Array(12).fill(0) as number[];

  let totalModelsCount = 0;
  let totalAnnualRevenueRub = 0;
  let totalDecemberRevenueRub = 0;
  let totalProcurementBudgetRub = 0;
  let totalFirstWaveStartBudgetRub = 0;
  let totalFirstWavePrepaymentRub = 0;
  let totalAnnualSoldGoodsCostRub = 0;
  let totalAnnualOperatingProfitRub = 0;

  const procurementBreakdownByUnit: MultiBrandPortfolioSummaryResult['procurementBreakdownByUnit'] =
    [];

  const brandRows: MultiBrandRowSummary[] = MULTI_BRAND_TABLE_ORDER.map(
    (brandCode) => {
      const cfg = BRAND_UNIT_CONFIGS[brandCode];
      const brandModels = catalogModels.filter((m) =>
        matchesBrandFilter(m, brandCode)
      );
      const availableScenarios = getScenariosForBrand(scenarios, brandCode, {
        onlyExplicitForNewBrands: false,
      });

      const rawSelectedId =
        brandCode === 'LISKANI'
          ? (selectedScenarioByBrand.LISKANI ??
            selectedScenarioByBrand.LISCANI)
          : selectedScenarioByBrand[brandCode];

      // Если передан null — у бренда явно «Нет сценария» (Тест 8)
      const defaultScenarioId =
        brandCode === 'BORNERS' || brandCode === 'FUKAI'
          ? availableScenarios.find((s) => s.id === 1)?.id ??
            availableScenarios[0]?.id ??
            null
          : availableScenarios.find(
              (s) =>
                s.ownerBrandCode &&
                normalizePortfolioBrandCode(s.ownerBrandCode) === brandCode
            )?.id ??
            (brandModels.length > 0 ? availableScenarios[0]?.id ?? null : null);

      const resolvedScenarioId =
        rawSelectedId === null
          ? null
          : rawSelectedId !== undefined
            ? rawSelectedId
            : defaultScenarioId;

      const selectedScenario =
        resolvedScenarioId !== null
          ? scenarios.find((s) => s.id === resolvedScenarioId && !s.isArchived) ||
            null
          : null;

      if (!selectedScenario) {
        return {
          brandCode,
          displayCode: cfg.displayCode,
          brandTitle: cfg.displayTitle,
          primaryUnit: cfg.primaryUnit,
          secondaryUnit: cfg.secondaryUnit,
          availableScenarios,
          selectedScenarioId: null,
          selectedScenarioTitle: 'Нет сценария',
          hasScenario: false,
          hasModels: brandModels.length > 0,
          statusMessage: 'Нет сценария',
          modelsCount: brandModels.length,
          annualRevenueRub: 0,
          decemberRevenueRub: 0,
          totalProcurementQuantity: 0,
          totalProcurementSecondaryQuantity: 0,
          totalProcurementBudgetRub: 0,
          firstWaveStartBudgetRub: 0,
          firstWavePrepaymentRub: 0,
          peakWorkingCapitalRub: 0,
          verifiedOwnMoneyRequiredRub: wbPayoutScheduleSpecified ? 0 : null,
          annualSoldGoodsCostRub: 0,
          annualEstimatedOperatingProfitRub: 0,
          monthlyRows: [],
        };
      }

      if (brandModels.length === 0) {
        return {
          brandCode,
          displayCode: cfg.displayCode,
          brandTitle: cfg.displayTitle,
          primaryUnit: cfg.primaryUnit,
          secondaryUnit: cfg.secondaryUnit,
          availableScenarios,
          selectedScenarioId: selectedScenario.id,
          selectedScenarioTitle: selectedScenario.title,
          hasScenario: true,
          hasModels: false,
          statusMessage: 'Добавьте первую модель для планирования продаж',
          modelsCount: 0,
          annualRevenueRub: 0,
          decemberRevenueRub: 0,
          totalProcurementQuantity: 0,
          totalProcurementSecondaryQuantity: 0,
          totalProcurementBudgetRub: 0,
          firstWaveStartBudgetRub: 0,
          firstWavePrepaymentRub: 0,
          peakWorkingCapitalRub: 0,
          verifiedOwnMoneyRequiredRub: wbPayoutScheduleSpecified ? 0 : null,
          annualSoldGoodsCostRub: 0,
          annualEstimatedOperatingProfitRub: 0,
          monthlyRows: [],
        };
      }

      const summary = computeScenarioInvestmentSummary(
        brandModels,
        selectedScenario,
        {
          initialCashRub: 0,
          settlementLagMonths,
          wbPayoutScheduleSpecified,
        }
      );

      totalModelsCount += summary.modelsCount;
      totalAnnualRevenueRub += summary.annualRevenueRub;
      totalDecemberRevenueRub += summary.decemberRevenueRub;
      totalProcurementBudgetRub += summary.totalProcurementBudgetRub;
      totalFirstWaveStartBudgetRub += summary.firstWaveStartBudgetRub;
      totalFirstWavePrepaymentRub += summary.firstWavePrepaymentRub;
      totalAnnualSoldGoodsCostRub += summary.annualSoldGoodsCostRub;
      totalAnnualOperatingProfitRub += summary.annualEstimatedOperatingProfitRub;

      if (summary.totalProcurementPacks > 0) {
        procurementBreakdownByUnit.push({
          brandCode,
          displayCode: cfg.displayCode,
          quantity: summary.totalProcurementPacks,
          unitLabel: cfg.primaryUnit,
        });
      }

      for (let m = 0; m < 12; m++) {
        const r = summary.monthlyRows[m];
        if (!r) continue;
        combinedMonthlyGrossSalesRub[m] += r.grossSalesRub;
        combinedMonthlyWbDeductionsRub[m] += r.wbDeductionsAndAdsRub;
        combinedMonthlyPrepayOutflowRub[m] += r.factoryPrepaymentOutflowRub;
        combinedMonthlyBalanceOutflowRub[m] += r.factoryBalanceOutflowRub;
      }

      return {
        brandCode,
        displayCode: cfg.displayCode,
        brandTitle: cfg.displayTitle,
        primaryUnit: cfg.primaryUnit,
        secondaryUnit: cfg.secondaryUnit,
        availableScenarios,
        selectedScenarioId: selectedScenario.id,
        selectedScenarioTitle: selectedScenario.title,
        hasScenario: true,
        hasModels: true,
        statusMessage: null,
        modelsCount: summary.modelsCount,
        annualRevenueRub: summary.annualRevenueRub,
        decemberRevenueRub: summary.decemberRevenueRub,
        totalProcurementQuantity: summary.totalProcurementPacks,
        totalProcurementSecondaryQuantity: summary.totalProcurementUnits,
        totalProcurementBudgetRub: summary.totalProcurementBudgetRub,
        firstWaveStartBudgetRub: summary.firstWaveStartBudgetRub,
        firstWavePrepaymentRub: summary.firstWavePrepaymentRub,
        peakWorkingCapitalRub: summary.peakWorkingCapitalRub,
        verifiedOwnMoneyRequiredRub: summary.verifiedOwnMoneyRequiredRub ?? null,
        annualSoldGoodsCostRub: summary.annualSoldGoodsCostRub,
        annualEstimatedOperatingProfitRub: summary.annualEstimatedOperatingProfitRub,
        monthlyRows: summary.monthlyRows,
      };
    }
  );

  // Строим единый 12-месячный календарь движения денег группы по выбранным сценариям брендов
  const groupMonthlyRows: ScenarioMonthlyCashflowRow[] = [];
  let runningCashFromZero = 0;
  let minCumulativeFromZero = 0;
  let peakMonthIdx = 0;

  for (let m = 0; m < 12; m++) {
    const grossSalesRub = combinedMonthlyGrossSalesRub[m] || 0;
    const wbDeductionsAndAdsRub = combinedMonthlyWbDeductionsRub[m] || 0;
    const wbNetInflowRub = Math.max(0, grossSalesRub - wbDeductionsAndAdsRub);
    const factoryPrepaymentOutflowRub = combinedMonthlyPrepayOutflowRub[m] || 0;
    const factoryBalanceOutflowRub = combinedMonthlyBalanceOutflowRub[m] || 0;
    const factoryTotalOutflowRub =
      factoryPrepaymentOutflowRub + factoryBalanceOutflowRub;

    const intraLow = runningCashFromZero - factoryTotalOutflowRub;
    if (m === 0 && intraLow < minCumulativeFromZero) {
      minCumulativeFromZero = intraLow;
      peakMonthIdx = 0;
    }

    const netMonthlyCashflowRub = wbNetInflowRub - factoryTotalOutflowRub;
    runningCashFromZero += netMonthlyCashflowRub;
    if (runningCashFromZero < minCumulativeFromZero) {
      minCumulativeFromZero = runningCashFromZero;
      peakMonthIdx = m;
    }

    groupMonthlyRows.push({
      monthIdx: m,
      monthLabel: MONTHS_SHORT[m],
      grossSalesRub,
      wbDeductionsAndAdsRub,
      wbNetInflowRub,
      factoryPrepaymentOutflowRub,
      factoryBalanceOutflowRub,
      factoryTotalOutflowRub,
      netMonthlyCashflowRub,
      cumulativeCashBalanceRub: initialCashOnHandRub + runningCashFromZero,
      isPeakDeficitMonth: false,
    });
  }
  if (groupMonthlyRows[peakMonthIdx]) {
    groupMonthlyRows[peakMonthIdx].isPeakDeficitMonth = true;
  }

  const rawGroupPeak = Math.max(
    totalFirstWavePrepaymentRub,
    Math.abs(Math.min(0, minCumulativeFromZero))
  );
  const groupPeakWorkingCapitalRub = wbPayoutScheduleSpecified ? rawGroupPeak : 0;
  const groupNetOwnMoneyRub = wbPayoutScheduleSpecified
    ? Math.max(0, groupPeakWorkingCapitalRub - initialCashOnHandRub)
    : 0;
  const groupVerifiedOwnMoneyRub = wbPayoutScheduleSpecified
    ? groupNetOwnMoneyRub
    : null;
  const ownMoneyStatusLabel = wbPayoutScheduleSpecified
    ? 'Рассчитано по календарю выплат WB и платежей фабрикам'
    : 'Недостаточно данных для расчёта потребности в собственных деньгах';

  const procurementBreakdownText =
    procurementBreakdownByUnit.length > 0
      ? procurementBreakdownByUnit
          .map(
            (item) =>
              `${item.displayCode}: ${item.quantity.toLocaleString('ru-RU')} ${item.unitLabel}`
          )
          .join(' · ')
      : 'Нет партий к заказу';

  return {
    brands: brandRows,
    procurementBreakdownByUnit,
    procurementBreakdownText,
    wbPayoutScheduleSpecified,
    ownMoneyStatusLabel,
    groupTotal: {
      modelsCount: totalModelsCount,
      annualRevenueRub: totalAnnualRevenueRub,
      decemberRevenueRub: totalDecemberRevenueRub,
      totalProcurementBudgetRub,
      firstWaveStartBudgetRub: totalFirstWaveStartBudgetRub,
      firstWavePrepaymentRub: totalFirstWavePrepaymentRub,
      peakWorkingCapitalRub: groupPeakWorkingCapitalRub,
      netOwnMoneyRequiredRub: groupNetOwnMoneyRub,
      verifiedOwnMoneyRequiredRub: groupVerifiedOwnMoneyRub,
      annualSoldGoodsCostRub: totalAnnualSoldGoodsCostRub,
      annualEstimatedOperatingProfitRub: totalAnnualOperatingProfitRub,
      monthlyRows: groupMonthlyRows,
    },
  };
}

/**
 * Раздел 6.4 и 7.3 ТЗ: Выгрузка документа заказа конкретной партии/заказа для фабрики
 * (содержит: название модели и артикул, фотографию при наличии, размеры и количества, цвета,
 * общий объём, цену и стоимость заказа, условия предоплаты и остатка платежа, срок поставки и комментарии).
 */
export function serializeSingleBatchFactoryOrderDocumentCsv(
  rawModel: ScenarioModelSpec,
  batchOrPo: RecommendedProcurementBatch | ApprovedPurchaseOrder,
  commentOverride?: string
): string {
  const model = ensureModelUnifiedV11(rawModel);
  const unitCfg = getBrandUnitConfig(model);
  const mainPhoto =
    model.gallery.find((g) => g.isMain)?.url || model.gallery[0]?.url || 'Фото в карточке';
  const colorsLabel =
    model.palettes[0]?.colors?.map((c) => c.nameRu).join(', ') || 'Базовая палитра';

  const isApprovedPo = 'orderNumber' in batchOrPo;
  const orderTitle = isApprovedPo
    ? batchOrPo.orderNumber
    : `Партия №${batchOrPo.batchIndex}`;
  const statusLabel = isApprovedPo
    ? PO_STATUS_LABELS_RU[batchOrPo.status] || 'Утверждённый заказ фабрике'
    : 'Плановая партия к заказу';
  const factoryName = batchOrPo.factoryName || model.sharedSupplyAndFact?.factoryParams.factoryName || 'Фабрика';
  const orderDate = isApprovedPo
    ? batchOrPo.orderPlacementDateIso
    : batchOrPo.recommendedOrderDateIso;
  const arrivalDate = batchOrPo.requiredArrivalDateIso;
  const qty = isApprovedPo ? batchOrPo.packsQty : batchOrPo.recommendedPacks;
  const physicalQty = batchOrPo.physicalUnitsQty;
  const unitCost = isApprovedPo ? batchOrPo.lockedUnitCostRub : batchOrPo.unitCostRub;
  const totalRub = isApprovedPo ? batchOrPo.totalOrderRub : batchOrPo.estimatedTotalRub;
  const prepayRub = batchOrPo.prepaymentRub;
  const balanceRub = batchOrPo.balancePaymentRub;
  const sizes =
    batchOrPo.sizeBreakdownPacks ||
    allocatePacksBySizeLargestRemainder(qty, {
      S: 12,
      M: 26,
      L: 30,
      XL: 20,
      XXL: 12,
    });
  const comment =
    commentOverride ??
    (isApprovedPo ? batchOrPo.note || '' : `Период покрытия: ${batchOrPo.coverageMonthsLabel}`);

  const header = [
    'Документ заказа фабрике',
    'Статус',
    'Бренд',
    'Артикул',
    'Название модели',
    'Фотография',
    'Цвета',
    'Фабрика',
    'Дата заказа',
    'Плановая дата поступления',
    `Общий объём (${unitCfg.primaryUnit})`,
    `Физический объём (${unitCfg.secondaryUnit})`,
    'Размер S',
    'Размер M',
    'Размер L',
    'Размер XL',
    'Размер XXL',
    'Закупочная цена ₽',
    'Стоимость заказа ₽',
    'Сумма предоплаты ₽',
    'Остаток платежа ₽',
    'Комментарий',
  ].join(';');

  const row = [
    `"${orderTitle}"`,
    `"${statusLabel}"`,
    `"${unitCfg.displayCode}"`,
    `"${model.code}"`,
    `"${(model.title || '').replace(/"/g, '""')}"`,
    `"${mainPhoto}"`,
    `"${colorsLabel.replace(/"/g, '""')}"`,
    `"${factoryName.replace(/"/g, '""')}"`,
    orderDate,
    arrivalDate,
    qty,
    physicalQty,
    sizes.S,
    sizes.M,
    sizes.L,
    sizes.XL,
    sizes.XXL,
    unitCost,
    totalRub,
    prepayRub,
    balanceRub,
    `"${comment.replace(/"/g, '""')}"`,
  ].join(';');

  return `\uFEFF${header}\n${row}`;
}

// =============================================================================
// АВТОЗАПОЛНЕНИЕ ОТРАСЛЕВЫХ НОРМАТИВОВ WB И СТАРТОВЫЕ МАТРИЦЫ КАБИНЕТОВ
// =============================================================================

export interface CategoryWbNorms {
  brandCode: CanonicalBrandCode;
  marketplaceFeePct: number;
  logisticsRub: number;
  adsPct: number;
  otherVariableRubPerPack: number;
  allocatedFixedOpexRubPerPack: number;
  defaultCostSharePct: number;
}

export function getCategoryWbNormsForBrand(
  brandOrModel: string | ScenarioModelSpec
): CategoryWbNorms {
  const cfg = getBrandUnitConfig(brandOrModel);
  switch (cfg.brandCode) {
    case 'AKUSHA':
      return {
        brandCode: 'AKUSHA',
        marketplaceFeePct: 24,
        logisticsRub: 140,
        adsPct: 10,
        otherVariableRubPerPack: 20,
        allocatedFixedOpexRubPerPack: 55,
        defaultCostSharePct: 30,
      };
    case 'LISKANI':
      return {
        brandCode: 'LISKANI',
        marketplaceFeePct: 21,
        logisticsRub: 130,
        adsPct: 9,
        otherVariableRubPerPack: 15,
        allocatedFixedOpexRubPerPack: 45,
        defaultCostSharePct: 31,
      };
    case 'NA_TELE':
      return {
        brandCode: 'NA_TELE',
        marketplaceFeePct: 22,
        logisticsRub: 90,
        adsPct: 10,
        otherVariableRubPerPack: 15,
        allocatedFixedOpexRubPerPack: 35,
        defaultCostSharePct: 26,
      };
    case 'FUKAI':
    case 'BORNERS':
    default:
      return {
        brandCode: cfg.brandCode,
        marketplaceFeePct: 22,
        logisticsRub: 95,
        adsPct: 10,
        otherVariableRubPerPack: 0,
        allocatedFixedOpexRubPerPack: 35,
        defaultCostSharePct: 28,
      };
  }
}

/**
 * Применяет реалистичные отраслевые нормативы WB к карточке товара,
 * чтобы в Блоке А и Блоке Б не оставалось пустых строк «Не заполнено».
 */
export function applyCategoryWbUnitEconomics(
  rawModel: ScenarioModelSpec,
  options?: { fillMissingCost?: boolean; forceOverwriteRates?: boolean }
): ScenarioModelSpec {
  const model = ensureModelUnifiedV11(rawModel);
  const shared = model.sharedSupplyAndFact!;
  const norms = getCategoryWbNormsForBrand(model);
  const fillMissingCost = options?.fillMissingCost ?? false;
  const forceOverwrite = options?.forceOverwriteRates ?? false;

  const nextUnitCostRub =
    model.unitCostRub > 0
      ? model.unitCostRub
      : fillMissingCost
      ? Math.max(
          250,
          Math.round(((model.retailPriceRub || 1990) * norms.defaultCostSharePct) / 100 / 5) * 5
        )
      : model.unitCostRub;

  const hasUnitCost = nextUnitCostRub > 0;
  const shouldFillRates =
    forceOverwrite ||
    hasUnitCost ||
    fillMissingCost;

  if (!shouldFillRates) {
    return model;
  }

  const nextMpPct =
    forceOverwrite || (model.marketplaceFeePct ?? 0) <= 0
      ? norms.marketplaceFeePct
      : model.marketplaceFeePct;
  const nextLogRub =
    forceOverwrite || (model.logisticsRub ?? 0) <= 0
      ? norms.logisticsRub
      : model.logisticsRub;
  const nextAdsPct =
    forceOverwrite || (model.adsPct ?? 0) <= 0
      ? norms.adsPct
      : model.adsPct;

  const nextOpexRub =
    forceOverwrite || shared.allocatedFixedOpexRubPerPack === null
      ? norms.allocatedFixedOpexRubPerPack
      : shared.allocatedFixedOpexRubPerPack;

  return {
    ...model,
    unitCostRub: nextUnitCostRub,
    marketplaceFeePct: nextMpPct,
    logisticsRub: nextLogRub,
    adsPct: nextAdsPct,
    sharedSupplyAndFact: {
      ...shared,
      costStatus: nextUnitCostRub > 0 ? (shared.costStatus === 'not_filled' ? 'plan' : shared.costStatus) : 'not_filled',
      expensesFilled: true,
      otherVariableRubPerPack:
        shared.otherVariableRubPerPack > 0
          ? shared.otherVariableRubPerPack
          : norms.otherVariableRubPerPack,
      allocatedFixedOpexRubPerPack: nextOpexRub,
      wbPayoutScheduleConfirmed: shared.wbPayoutScheduleConfirmed ?? true,
    },
  };
}

export function applyCategoryWbUnitEconomicsToPortfolio(
  models: ScenarioModelSpec[],
  options?: { fillMissingCost?: boolean; forceOverwriteRates?: boolean }
): ScenarioModelSpec[] {
  return models.map((m) => applyCategoryWbUnitEconomics(m, options));
}

export interface StarterBrandSkuTemplate {
  code: string;
  title: string;
  subtitle: string;
  retailPriceRub: number;
  unitCostRub: number;
  unitsInPack: number;
  priority: 'Высший' | 'Высокий' | 'Средний';
  monthlyPacks: number[];
  composition: string;
  density: string;
}

export const STARTER_BRAND_MATRICES: Record<
  'AKUSHA' | 'LISKANI' | 'NA_TELE',
  {
    scenarioTitle: string;
    monthlyTargetMln: number;
    skus: StarterBrandSkuTemplate[];
  }
> = {
  AKUSHA: {
    scenarioTitle: 'AKUSHA · Старт обувной линейки 2027',
    monthlyTargetMln: 32,
    skus: [
      {
        code: 'AKU-001',
        title: 'Кроссовки городские AKUSHA Cloud Walk',
        subtitle: 'Натуральная замша и дышащая сетка · анатомическая стелька',
        retailPriceRub: 4490,
        unitCostRub: 1350,
        unitsInPack: 1,
        priority: 'Высший',
        monthlyPacks: [850, 1050, 1300, 1650, 1950, 2200, 2450, 2750, 3100, 3400, 3700, 4100],
        composition: 'Натуральная замша 65%, текстиль Mesh 35%, подошва EVA',
        density: 'Всесезонная пара',
      },
      {
        code: 'AKU-002',
        title: 'Лоферы базовые AKUSHA Soft Suede',
        subtitle: 'Мягкая замша премиум · гибкая облегчённая колодка',
        retailPriceRub: 4890,
        unitCostRub: 1480,
        unitsInPack: 1,
        priority: 'Высокий',
        monthlyPacks: [620, 780, 950, 1200, 1450, 1680, 1850, 2100, 2350, 2600, 2850, 3100],
        composition: 'Натуральная замша 100%, кожаная стелька, термоэластопласт',
        density: 'Демисезон / лето',
      },
      {
        code: 'AKU-003',
        title: 'Кеды минималистичные AKUSHA Everyday',
        subtitle: 'Базовая капсула на каждый день · износостойкая подошва',
        retailPriceRub: 3990,
        unitCostRub: 1190,
        unitsInPack: 1,
        priority: 'Высокий',
        monthlyPacks: [700, 880, 1100, 1350, 1600, 1850, 2050, 2300, 2550, 2800, 3050, 3300],
        composition: 'Эко-кожа премиум микрофибра, хлопок 100% внутри',
        density: 'Базовая капсула',
      },
    ],
  },
  LISKANI: {
    scenarioTitle: 'LISKANI · Интерьерный текстиль и шторы 2027',
    monthlyTargetMln: 28,
    skus: [
      {
        code: 'LSK-001',
        title: 'Шторы блэкаут LISKANI Венеция 300×270 (2 полотна)',
        subtitle: 'Светонепроницаемость 98% · плотный матовый велюр-рогожка',
        retailPriceRub: 4290,
        unitCostRub: 1320,
        unitsInPack: 6,
        priority: 'Высший',
        monthlyPacks: [680, 820, 980, 1180, 1400, 1650, 1900, 2200, 2550, 2850, 3150, 3500],
        composition: 'Трёхслойный Blackout полиэстер 100% на шторной ленте 6 см',
        density: '290 г/м²',
      },
      {
        code: 'LSK-002',
        title: 'Шторы димаут со льном LISKANI Скандинавия 400×270',
        subtitle: 'Природная фактура льна · защита от солнца 85%',
        retailPriceRub: 4690,
        unitCostRub: 1450,
        unitsInPack: 8,
        priority: 'Высокий',
        monthlyPacks: [520, 640, 780, 940, 1120, 1320, 1520, 1760, 2040, 2300, 2550, 2850],
        composition: 'Лён 30%, полиэстер Dimout 70%',
        density: '265 г/м²',
      },
      {
        code: 'LSK-003',
        title: 'Тюль вуаль премиум LISKANI Воздушный шёлк 400×270',
        subtitle: 'Утяжелитель по низу · мягкая драпировка без глажки',
        retailPriceRub: 2490,
        unitCostRub: 740,
        unitsInPack: 4,
        priority: 'Средний',
        monthlyPacks: [900, 1100, 1320, 1580, 1850, 2150, 2450, 2800, 3200, 3550, 3900, 4300],
        composition: 'Микровуаль грек-сетка с утяжелителем 100% ПЭ',
        density: '75 г/м²',
      },
    ],
  },
  NA_TELE: {
    scenarioTitle: 'НА ТЕЛЕ · Женская и базовая капсула 2027',
    monthlyTargetMln: 26,
    skus: [
      {
        code: 'NTL-001',
        title: 'Комплект женских слипов НА ТЕЛЕ Invisible Seam (3 шт.)',
        subtitle: 'Бесшовная лазерная обработка края · неощутимая посадка',
        retailPriceRub: 1790,
        unitCostRub: 460,
        unitsInPack: 3,
        priority: 'Высший',
        monthlyPacks: [1100, 1350, 1650, 2000, 2400, 2850, 3300, 3800, 4350, 4900, 5450, 6100],
        composition: 'Микромодал 86%, эластан 14%, хлопковая ластовица',
        density: '165 г/м²',
      },
      {
        code: 'NTL-002',
        title: 'Топ-бра и бразилиана НА ТЕЛЕ Ribbed Modal Set',
        subtitle: 'Мягкий трикотаж в рубчик без косточек · тактильный комфорт',
        retailPriceRub: 2290,
        unitCostRub: 610,
        unitsInPack: 2,
        priority: 'Высокий',
        monthlyPacks: [850, 1050, 1280, 1550, 1880, 2220, 2600, 3000, 3450, 3900, 4350, 4850],
        composition: 'Модал лензинг 92%, эластан 8%',
        density: '190 г/м²',
      },
      {
        code: 'NTL-003',
        title: 'Базовые шортики женские НА ТЕЛЕ Pure Cotton (3 шт.)',
        subtitle: 'Хлопок компакт-пенье · мягкая резинка без давления',
        retailPriceRub: 1690,
        unitCostRub: 430,
        unitsInPack: 3,
        priority: 'Высокий',
        monthlyPacks: [950, 1180, 1450, 1750, 2100, 2480, 2900, 3350, 3820, 4300, 4780, 5300],
        composition: 'Хлопок компакт-пенье 95%, эластан 5%',
        density: '180 г/м²',
      },
    ],
  },
};

/**
 * Запускает стартовую товарную матрицу (3 флагманских SKU + независимый сценарий 2027)
 * для кабинета AKUSHA, LISKANI или НА ТЕЛЕ в 1 клик.
 */
export function launchBrandStarterMatrix(
  models: ScenarioModelSpec[],
  scenarios: GrowthScenarioDef[],
  brandCode: 'AKUSHA' | 'LISKANI' | 'NA_TELE'
): {
  models: ScenarioModelSpec[];
  scenarios: GrowthScenarioDef[];
  scenarioId: number;
  addedCount: number;
} {
  const template = STARTER_BRAND_MATRICES[brandCode];
  let currentScenarios = [...scenarios];
  let currentModels = [...models];

  // Проверяем, есть ли уже сценарий у этого бренда
  const existingBrandScenarios = getScenariosForBrand(currentScenarios, brandCode, {
    onlyExplicitForNewBrands: brandCode !== 'NA_TELE',
  });

  let targetScenarioId: number;
  if (existingBrandScenarios.length > 0) {
    targetScenarioId = existingBrandScenarios[0].id;
  } else {
    const created = createIndependentBrandScenario(currentScenarios, currentModels, {
      title: template.scenarioTitle,
      brandCode,
      year: 2027,
      monthlyTargetMln: template.monthlyTargetMln,
      copyFromScenarioId: null,
    });
    currentScenarios = created.scenarios;
    currentModels = created.models;
    targetScenarioId = created.scenario.id;
  }

  let addedCount = 0;
  for (const skuTpl of template.skus) {
    const existingIdx = currentModels.findIndex(
      (m) => m.code.toUpperCase() === skuTpl.code.toUpperCase()
    );
    if (existingIdx >= 0) {
      // Обновляем план продаж и юнит-экономику, если модель уже была создана с 0 продаж
      const existingMod = currentModels[existingIdx];
      const updatedPlans = { ...existingMod.plansByScenario };
      for (const sc of currentScenarios) {
        updatedPlans[sc.id] = {
          ...(updatedPlans[sc.id] || {
            scenarioId: sc.id,
            monthlyReceiptsPacks: Array(12).fill(0),
            initialStockPacks: 0,
            firstOrderPacks: skuTpl.monthlyPacks[0] * 3,
            nextOrderDateLabel: '15 ноября 2026',
            salesStartMonthIdx: 0,
            warehouseArrivalMonthIdx: 0,
            warehouseArrivalDateLabel: '10 января 2027',
          }),
          scenarioId: sc.id,
          monthlyPacks: [...skuTpl.monthlyPacks],
          monthlyPricesRub: Array(12).fill(skuTpl.retailPriceRub),
        };
      }
      currentModels[existingIdx] = applyCategoryWbUnitEconomics(
        {
          ...existingMod,
          plansByScenario: updatedPlans,
        },
        { fillMissingCost: true, forceOverwriteRates: true }
      );
    } else {
      const created = createBrandProductModel(currentModels, currentScenarios, {
        brandCode,
        code: skuTpl.code,
        title: skuTpl.title,
        retailPriceRub: skuTpl.retailPriceRub,
        unitCostRub: skuTpl.unitCostRub,
        unitsInPack: skuTpl.unitsInPack,
        initialMonthlyPacks: [...skuTpl.monthlyPacks],
      });
      const newMod = applyCategoryWbUnitEconomics(
        {
          ...created.model,
          subtitle: skuTpl.subtitle,
          priority: skuTpl.priority,
          fabric: {
            ...created.model.fabric,
            composition: skuTpl.composition,
            density: skuTpl.density,
          },
        },
        { fillMissingCost: true, forceOverwriteRates: true }
      );
      currentModels = [
        ...created.models.filter((m) => m.id !== created.model.id),
        newMod,
      ];
      addedCount += 1;
    }
  }

  return {
    models: currentModels,
    scenarios: currentScenarios,
    scenarioId: targetScenarioId,
    addedCount,
  };
}

/**
 * Подключает сразу все 3 новых кабинета (AKUSHA, LISKANI, НА ТЕЛЕ), чтобы все 5 кабинетов холдинга работали на полную мощность.
 */
export function launchAllEmptyCabinetsInHolding(
  models: ScenarioModelSpec[],
  scenarios: GrowthScenarioDef[],
  selectedScenarioByBrand: Partial<Record<CanonicalBrandCode, number | null>>
): {
  models: ScenarioModelSpec[];
  scenarios: GrowthScenarioDef[];
  selectedScenarioByBrand: Partial<Record<CanonicalBrandCode, number | null>>;
  addedCount: number;
} {
  let nextModels = [...models];
  let nextScenarios = [...scenarios];
  const nextMap: Partial<Record<CanonicalBrandCode, number | null>> = {
    ...selectedScenarioByBrand,
  };
  let totalAdded = 0;

  for (const bCode of ['AKUSHA', 'LISKANI', 'NA_TELE'] as const) {
    const res = launchBrandStarterMatrix(nextModels, nextScenarios, bCode);
    nextModels = res.models;
    nextScenarios = res.scenarios;
    nextMap[bCode] = res.scenarioId;
    totalAdded += res.addedCount;
  }

  return {
    models: nextModels,
    scenarios: nextScenarios,
    selectedScenarioByBrand: nextMap,
    addedCount: totalAdded,
  };
}

/**
 * Сбрасывает демо-матрицы AKUSHA, LISKANI и НА ТЕЛЕ обратно к базовым 2 активным кабинетам (BORNERS + FUKAI).
 */
export function resetStarterCabinetsFromHolding(
  models: ScenarioModelSpec[],
  scenarios: GrowthScenarioDef[],
  selectedScenarioByBrand: Partial<Record<CanonicalBrandCode, number | null>>
): {
  models: ScenarioModelSpec[];
  scenarios: GrowthScenarioDef[];
  selectedScenarioByBrand: Partial<Record<CanonicalBrandCode, number | null>>;
} {
  const starterCodes = new Set(
    [
      ...STARTER_BRAND_MATRICES.AKUSHA.skus,
      ...STARTER_BRAND_MATRICES.LISKANI.skus,
      ...STARTER_BRAND_MATRICES.NA_TELE.skus,
    ].map((s) => s.code.toUpperCase())
  );

  const nextModels = models.filter((m) => !starterCodes.has(m.code.toUpperCase()));
  const starterTitles = new Set([
    STARTER_BRAND_MATRICES.AKUSHA.scenarioTitle,
    STARTER_BRAND_MATRICES.LISKANI.scenarioTitle,
    STARTER_BRAND_MATRICES.NA_TELE.scenarioTitle,
  ]);
  const nextScenarios = scenarios.filter((s) => !starterTitles.has(s.title));

  return {
    models: nextModels,
    scenarios: nextScenarios,
    selectedScenarioByBrand: {
      ...selectedScenarioByBrand,
      BORNERS: selectedScenarioByBrand.BORNERS ?? 1,
      FUKAI: selectedScenarioByBrand.FUKAI ?? 100,
      AKUSHA: null,
      LISKANI: null,
      NA_TELE: 2,
    },
  };
}

export interface WhatIfSensitivityResult {
  simRevenueRub: number;
  simCogsRub: number;
  simDeductionsRub: number;
  simNetProfitRub: number;
  simMarginPct: number;
  simPeakCapitalRub: number;
  simRoiMultiplier: number;
  profitDeltaRub: number;
  marginDeltaPts: number;
  revenueDeltaRub: number;
  // Удобные алиасы для UI-компонентов
  simulatedRevenueRub: number;
  simulatedProfitRub: number;
  simulatedMarginPct: number;
  simulatedOwnCapitalRub: number;
  simulatedRoiMult: number;
  baseMarginPct: number;
}

/**
 * Интерактивный калькулятор чувствительности «Что если?» (Sensitivity Sliders):
 * пересчитывает выручку, себестоимость, удержания WB/ДРР, чистую прибыль, маржу и ROI.
 */
export function computeWhatIfSensitivitySimulation(
  base: {
    annualRevenueRub: number;
    annualSoldGoodsCostRub: number;
    annualWbDeductionsAndAdsRub?: number;
    annualEstimatedOperatingProfitRub: number;
    peakWorkingCapitalRub?: number;
    totalProcurementBudgetRub?: number;
    verifiedOwnMoneyRequiredRub?: number | null;
  },
  params: {
    priceDeltaPct: number; // -20 .. +25 (%)
    costDeltaPct: number; // -20 .. +30 (%)
    wbAndAdsDeltaPts?: number; // -8 .. +12 (п.п. к ставке удержаний и ДРР)
    mpAndAdsDeltaPt?: number;
  }
): WhatIfSensitivityResult {
  const baseRev = Math.max(0, base.annualRevenueRub);
  const baseCogs = Math.max(0, base.annualSoldGoodsCostRub);
  const baseProfit = base.annualEstimatedOperatingProfitRub;
  const baseDed = Math.max(
    0,
    base.annualWbDeductionsAndAdsRub ?? baseRev - baseCogs - baseProfit
  );
  const baseMarginPct = baseRev > 0 ? (baseProfit / baseRev) * 100 : 0;

  const priceFactor = 1 + params.priceDeltaPct / 100;
  const costFactor = 1 + params.costDeltaPct / 100;
  const deltaPts = params.wbAndAdsDeltaPts ?? params.mpAndAdsDeltaPt ?? 0;

  const simRevenueRub = Math.round(baseRev * priceFactor);
  const simCogsRub = Math.round(baseCogs * costFactor);

  // Базовая доля удержаний (комиссия + логистика + реклама) + сдвиг в п.п.
  const baseDedSharePct = baseRev > 0 ? (baseDed / baseRev) * 100 : 38;
  const simDedSharePct = Math.max(10, Math.min(75, baseDedSharePct + deltaPts));
  const simDeductionsRub = Math.round((simRevenueRub * simDedSharePct) / 100);

  const simNetProfitRub = simRevenueRub - simCogsRub - simDeductionsRub;
  const simMarginPct =
    simRevenueRub > 0
      ? Math.round((simNetProfitRub / simRevenueRub) * 1000) / 10
      : 0;

  const basePeakCap =
    base.peakWorkingCapitalRub ??
    base.verifiedOwnMoneyRequiredRub ??
    Math.round((base.totalProcurementBudgetRub ?? baseCogs) * 0.182);
  const simPeakCapitalRub = Math.max(
    1,
    Math.round(Math.max(1, basePeakCap) * costFactor)
  );
  const simRoiMultiplier =
    Math.round((simNetProfitRub / simPeakCapitalRub) * 10) / 10;

  return {
    simRevenueRub,
    simCogsRub,
    simDeductionsRub,
    simNetProfitRub,
    simMarginPct,
    simPeakCapitalRub,
    simRoiMultiplier,
    profitDeltaRub: simNetProfitRub - baseProfit,
    marginDeltaPts: Math.round((simMarginPct - baseMarginPct) * 10) / 10,
    revenueDeltaRub: simRevenueRub - baseRev,
    simulatedRevenueRub: simRevenueRub,
    simulatedProfitRub: simNetProfitRub,
    simulatedMarginPct: simMarginPct,
    simulatedOwnCapitalRub: simPeakCapitalRub,
    simulatedRoiMult: simRoiMultiplier,
    baseMarginPct: Math.round(baseMarginPct * 10) / 10,
  };
}



