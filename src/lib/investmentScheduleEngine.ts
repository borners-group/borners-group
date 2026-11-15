// Хронологический движок инвестиций, реинвестирования с Wildberries и календаря движения денег (ТЗ BORNERS GROUP v13)
// Строгий расчёт по конкретным датам платежей (YYYY-MM-DD), разделение сценариев и общих утверждённых/фактических операций,
// дробление платежей на транши, контроль неснижаемого резерва, аудит правок и пересчёт дефицита при переносе поставок.

import type { GrowthScenarioDef, ScenarioModelSpec } from './scenarioData.ts';
import { getActingSkuByWbOrVendor } from './actingAssortment2027.ts';
import { isUnverifiedActingSku } from './scenarioS1_100M.ts';
import {
  BRAND_UNIT_CONFIGS,
  type CanonicalBrandCode,
  computeCarryOverStock2027To2028,
  computeProcurementPlan,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  getBrandUnitConfig,
  getPoArrivalYear,
  getScenariosForBrand,
  isScenarioCompatibleWithBrand,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
} from './unifiedBusinessEngine.ts';
import { safeGetStorageJson, safeSetStorageJson } from './safeStorage.ts';

export const STORAGE_KEY_INVESTMENT_LEDGER = 'borners_investment_ledger_v1';

export type OperationPaymentStatus = 'Запланировано' | 'Утверждено' | 'Оплачено';

export interface PaymentTrancheSpec {
  id: string;
  dateIso: string; // YYYY-MM-DD
  amountRub: number;
  label: string;
  status: OperationPaymentStatus;
}

export interface ManualPaymentOverride {
  opKey: string; // уникальный ключ платежа (например `${batchKey}::prepay`)
  batchKey: string;
  customDateIso?: string;
  customAmountRub?: number;
  customFactoryName?: string;
  status?: OperationPaymentStatus;
  splitTranches?: PaymentTrancheSpec[];
  note?: string;
  updatedAtIso: string;
  updatedBy: string;
}

export interface BatchTermsManualOverride {
  batchKey: string; // `${modelId}::rb:${periodId}` или `${modelId}::po:${poId}`
  customPrepaymentPct?: number; // 0..100 (доплата = 100 - customPrepaymentPct)
  customFactoryName?: string;
  customArrivalDateIso?: string; // перенос самой поставки -> пересчёт обеспеченности и дефицита!
  customOrderDateIso?: string;
  customPacksQty?: number; // изменение объёма плановой партии -> пересчёт бюджета закупки и обеспеченности товара (Раздел 6 ТЗ v14)
  updatedAtIso: string;
  updatedBy: string;
}

export interface CapitalInjectionRecord {
  id: string;
  dateIso: string; // YYYY-MM-DD
  amountRub: number;
  title: string;
  sourceComment?: string; // комментарий или источник финансирования (Раздел 5 ТЗ v14)
  status: OperationPaymentStatus;
  brandCode?: CanonicalBrandCode | 'ALL';
  updatedAtIso: string;
  updatedBy: string;
}

export interface CustomCashOperationRecord {
  id: string;
  kind: 'expense' | 'inflow';
  category: 'opex' | 'tax' | 'logistics_customs' | 'marketing_ext' | 'other_inflow' | 'factory_extra';
  dateIso: string; // YYYY-MM-DD
  amountRub: number;
  title: string;
  factoryName?: string;
  linkedBatchKey?: string;
  status: OperationPaymentStatus;
  brandCode?: CanonicalBrandCode | 'ALL';
  updatedAtIso: string;
  updatedBy: string;
}

export interface ScenarioManualLedgerPlan {
  paymentOverrides: Record<string, ManualPaymentOverride>;
  batchOverrides: Record<string, BatchTermsManualOverride>;
  plannedCapitalInjections: CapitalInjectionRecord[];
  plannedOtherOperations: CustomCashOperationRecord[];
}

export interface InvestmentLedgerAuditEntry {
  id: string;
  timestampIso: string;
  author: string;
  scenarioScopeKey: string;
  operationTitle: string;
  actionType:
    | 'edit_date'
    | 'edit_amount'
    | 'edit_terms'
    | 'split_payment'
    | 'edit_supplier'
    | 'edit_arrival'
    | 'status_change'
    | 'add_investment'
    | 'add_operation'
    | 'delete_operation'
    | 'undo_override'
    | 'reset_to_auto'
    | 'edit_global_params';
  beforeValue: string;
  afterValue: string;
}

export interface InvestmentLedgerGlobalSettings {
  initialCashRub: number; // первоначальный собственный капитал на счёте на старте
  minCashReserveRub: number; // неснижаемый денежный резерв
  wbPayoutDelayDays: number; // задержка получения денег от WB в днях (0, 7, 14, 21, 30, 45, 60)
  wbPayoutScheduleSpecified: boolean; // если false — честное предупреждение вместо выдуманной суммы
  wbPayoutFrequency: 'twice_monthly' | 'weekly' | 'month_end';
  selectedFinanceYear?: 2027 | 2028; // переключатель Год: 2027 / 2028 (Раздел 2 ТЗ v14)
}

export interface InvestmentLedgerState {
  version: 1;
  globalSettings: InvestmentLedgerGlobalSettings;
  // Общие между сценариями утверждённые («Утверждено») и фактические («Оплачено») операции (Раздел 5, 7, 8 ТЗ)
  sharedCommitted: {
    committedPaymentOverrides: Record<string, ManualPaymentOverride>;
    committedBatchOverrides: Record<string, BatchTermsManualOverride>;
    committedCapitalInjections: CapitalInjectionRecord[];
    committedOtherOperations: CustomCashOperationRecord[];
  };
  // Сценарные ручные корректировки со статусом «Запланировано» (ключ `${brandCode}:${scenarioId}` или `GROUP:ALL`)
  scenarioPlans: Record<string, ScenarioManualLedgerPlan>;
  auditHistory: InvestmentLedgerAuditEntry[];
  updatedAtIso: string;
}

export interface LinkedProcurementBatchDetails {
  batchKey: string;
  isApprovedPo: boolean;
  poId?: string;
  poNumber?: string;
  periodId: string;
  modelId: string;
  modelCode: string;
  modelTitle: string;
  brandCode: CanonicalBrandCode;
  brandDisplayTitle: string;
  factoryName: string;
  coverageMonthsLabel: string;
  firstCoveredMonthIdx: number;
  endCoveredMonthIdx: number;
  packsQty: number;
  defaultPacksQty: number;
  primaryUnitLabel: string;
  physicalUnitsQty: number;
  unitCostRub: number;
  totalBatchCostRub: number;
  prepaymentPct: number;
  balancePaymentPct: number;
  prepaymentRub: number;
  balancePaymentRub: number;
  orderDateIso: string;
  defaultOrderDateIso: string;
  arrivalDateIso: string;
  originalArrivalDateIso: string;
  totalLeadDays: number;
  sizeBreakdownText: string;
  hasArrivalShiftDeficit: boolean;
  arrivalShiftDeficitPacks: number;
}

export interface ChronologicalCashEvent {
  id: string;
  opKey: string;
  dateIso: string; // YYYY-MM-DD (фактическая хронологическая дата операции)
  calendarMonthIdx: number; // 0..11 в календаре года сценария (операции старта Q1 до 1 янв попадают в Янв с точной датой)
  type: 'wb_inflow' | 'other_inflow' | 'factory_payment' | 'other_expense' | 'capital_injection';
  paymentRole?: 'prepay' | 'balance' | 'tranche' | 'extra';
  status: OperationPaymentStatus;
  isFactual: boolean; // status === 'Оплачено'
  isApprovedLocked: boolean; // status === 'Утверждено' || status === 'Оплачено' || isApprovedPo
  hasManualOverride: boolean;
  scenarioScopeKey: string;
  brandCode: CanonicalBrandCode | 'ALL';
  brandTitle: string;
  title: string;
  purposeShort: string;
  factoryName?: string;
  batchKey?: string;
  batchDetails?: LinkedProcurementBatchDetails;
  trancheIndex?: number;
  tranchesTotal?: number;

  // Исходные плановые значения (для кнопки «Отменить ручную корректировку» и предпросмотра возврата к плану)
  autoDateIso?: string;
  autoAmountRub?: number;

  // Суммы операции и результат хронологического расчёта на эту дату:
  amountRub: number;
  inflowRub: number;
  outflowRub: number;
  userCapitalInjectionRub: number;
  reinvestedFromSalesRub: number; // сколько из платежа фабрике покрыто свободными поступлениями WB
  coveredByOwnCapitalOnAccountRub: number; // сколько покрыто уже внесённым собственным капиталом
  needToInvestRub: number; // сколько дополнительных собственных денег нужно вложить в эту дату
  closingTotalCashRub: number; // общий остаток на счёте после операции (включая резерв)
  closingFreeCashRub: number; // свободные деньги сверх неснижаемого резерва после операции
}

export interface MonthlyInvestmentCalendarRow {
  monthIdx: number; // 0..11
  periodLabel: string; // Январь 2027 .. Декабрь 2027
  shortMonthLabel: string; // Янв .. Дек
  inflowsRub: number; // Поступления (WB и другие источники)
  wbInflowsRub: number;
  otherInflowsRub: number;
  outflowsRub: number; // Платежи (фабрики и остальные расходы)
  factoryOutflowsRub: number;
  otherExpensesRub: number;
  reinvestedRub: number; // Реинвестирование (часть закупок, покрытая поступлениями)
  needToInvestRub: number; // Нужно вложить (дополнительные собственные деньги)
  userCapitalInjectionsRub: number; // Запланированные / внесённые пользователем доп. инвестиции в этом месяце
  endingFreeCashRub: number; // Остаток (свободные деньги после всех операций сверх резерва)
  endingTotalCashRub: number; // Полный остаток на конец месяца с учётом резерва
  intraMonthMinRawBalanceRub: number; // для гладкой совместимости с графиком 12 мес.
  businessFreeCashRub: number; // Раздел 8 ТЗ v14: > 0 доступны с учётом резерва, < 0 требуется доп. финансирование
  hasManualOverrides: boolean;
  hasCashShortage: boolean;
  hasSupplyDeficit: boolean;
  events: ChronologicalCashEvent[];
  dateGroups: {
    dateIso: string;
    dateHumanRu: string;
    inflowsRub: number;
    outflowsRub: number;
    reinvestedRub: number;
    needToInvestRub: number;
    userCapitalInjectionsRub: number;
    endingFreeCashRub: number;
    events: ChronologicalCashEvent[];
  }[];
}

export interface SupplyDeficitWarning {
  batchKey: string;
  modelId: string;
  modelCode: string;
  modelTitle: string;
  brandTitle: string;
  originalArrivalDateIso: string;
  shiftedArrivalDateIso: string;
  deficitPacks: number;
  unitLabel: string;
  affectedMonthsLabel: string;
  message: string;
}

export interface InvestmentDataWarning {
  code: 'wb_schedule_unspecified' | 'missing_unit_costs' | 'cash_shortage' | 'supply_deficit';
  severity: 'danger' | 'warning';
  title: string;
  description: string;
}

export interface ResetToAutoPreviewItem {
  key: string;
  scenarioScopeKey: string;
  title: string;
  currentSummary: string;
  autoPlanSummary: string;
}

export interface ResetToAutoPlanPreview {
  willResetCount: number;
  preservedLockedCount: number;
  items: ResetToAutoPreviewItem[];
}

// Раздел 4 ТЗ v14: Конкретный платёж фабрике внутри раскрывающейся строки «Когда и сколько вложить» (все 7 полей)
export interface WhenAndHowMuchFactoryPaymentItem {
  opKey: string;
  prepayOpKey: string;
  balanceOpKey: string;
  balanceDateIso: string;
  balanceDateDotRu: string;
  balanceAmountRub: number;
  batchKey: string;
  modelId: string;
  modelCode: string;
  productTitle: string; // 1. Название товара
  batchNumber: string; // 2. Номер партии
  factoryName: string; // 3. Фабрика
  paymentDateIso: string; // 4. Дата платежа (ISO)
  paymentDateDotRu: string; // 4. Дата платежа (ДД.ММ.ГГГГ)
  amountRub: number; // 5. Сумма
  paymentStageLabel: string; // 6. Предоплата или окончательный расчёт
  arrivalDateIso: string; // 7. Дата поступления товара (ISO)
  arrivalDateDotRu: string; // 7. Дата поступления товара (ДД.ММ.ГГГГ)
  packsQty: number;
  defaultPacksQty: number;
  unitLabel: string;
  prepaymentPct: number;
  status: OperationPaymentStatus;
  isApprovedPo: boolean;
  isApprovedLocked: boolean;
  hasManualOverride: boolean;
  scenarioScopeKey: string;
  event: ChronologicalCashEvent;
}

// Раздел 4 ТЗ v14: Строка таблицы «Когда и сколько вложить»
export interface WhenAndHowMuchRow {
  dateIso: string;
  dateDotRu: string; // ДД.ММ.ГГГГ (напр. 12.11.2026)
  dateHumanRu: string;
  calculatedNeedRub: number; // Расчётная потребность на эту дату (не занижается искусственно вложениями)
  coveredByOwnMoneyRub: number; // Сколько уже закрыто собственными вложениями
  remainingNeedRub: number; // Сколько ещё осталось профинансировать к этой дате
  isFullyCoveredByOwnMoney: boolean;
  purposeLabel: string; // Напр. «Закупочные партии»
  batchesCount: number;
  factoryPayments: WhenAndHowMuchFactoryPaymentItem[];
  otherExpenseEvents: ChronologicalCashEvent[];
}

// Раздел 7 ТЗ v14: Компактный блок «Что нужно сделать» (максимум 3 рекомендации по важности)
export interface SystemActionRecommendation {
  id: string;
  priority: 1 | 2 | 3 | 4;
  severity: 'danger' | 'warning' | 'info' | 'success';
  categoryLabel: string; // «Не хватает денег» | «Недостаточно данных» | «Риск нехватки товара» | «План финансирования закрыт»
  message: string;
  ctaLabel: string; // «Посмотреть платежи» | «Заполнить данные» | «Открыть закупку»
  actionTarget:
    | 'focus_payment_date'
    | 'open_procurement'
    | 'open_missing_cost_sku'
    | 'open_investment_settings';
  targetDateIso?: string;
  modelId?: string;
  batchKey?: string;
}

// Раздел 9 ТЗ v14: Результат «Сравнить с исходным планом»
export interface PlanComparisonWithBaseline {
  hasDifferences: boolean;
  autoProcurementRub: number;
  currentProcurementRub: number;
  deltaProcurementRub: number;
  autoCalculatedNeedRub: number | null;
  currentCalculatedNeedRub: number | null;
  deltaCalculatedNeedRub: number | null;
  autoRemainingNeedRub: number | null;
  currentRemainingNeedRub: number | null;
  deltaRemainingNeedRub: number | null;
  autoReinvestedRub: number | null;
  currentReinvestedRub: number | null;
  deltaReinvestedRub: number | null;
  autoPeakMonthRu: string;
  currentPeakMonthRu: string;
  autoDeficitPacks: number;
  currentDeficitPacks: number;
  deltaDeficitPacks: number;
  summaryVerdictRu: string;
}

// Раздел 10 ТЗ v14: Строка таблицы «Общая сводка группы» при выборе «Все бренды»
export interface HoldingBrandSummaryRow {
  brandCode: CanonicalBrandCode;
  displayBrandName: string; // BORNERS / FUKAI / AKUSHA / LISCANI / НА ТЕЛЕ
  scenarioId: number | null;
  scenarioName: string;
  scenarioYear: number;
  revenueRub: number;
  procurementRub: number;
  ownMoneyNeedRub: number | null;
  remainingOwnMoneyRub: number | null;
  reinvestedRub: number | null;
  isPreliminary: boolean;
  nextPayment: {
    dateIso: string;
    dateDotRu: string;
    dateHumanRu: string;
    amountRub: number;
    purposeLabel: string;
  } | null;
}

export interface HoldingGroupOverviewSummary {
  rows: HoldingBrandSummaryRow[];
  sumOfBrandPeaksRub: number;
  unifiedGroupCalculatedNeedRub: number | null;
  unifiedGroupSynergySavingsRub: number;
}

export interface ComputedInvestmentScheduleResult {
  scenarioYear: number;
  isGroupAllBrands: boolean;
  activeScopeKey: string;
  wbPayoutScheduleSpecified: boolean;
  wbPayoutDelayDays: number;
  initialCashRub: number;
  minCashReserveRub: number;

  // 4 главных показателя (Раздел 3 ТЗ v14) + обратная совместимость v13:
  totalProcurementCostRub: number; // 2. Стоимость закупок
  approvedProcurementCostRub: number;
  plannedProcurementCostRub: number;
  calculatedCapitalNeedRub: number | null; // 3. Максимальная расчётная потребность в своих деньгах (НЕ занижается вложениями!)
  maxOwnMoneyNeededRub: number | null; // Остаточная потребность для совместимости с тестами v13
  grossOwnCapitalPeakFromZeroRub: number | null; // Полный пик собственного капитала от 0 ₽
  reinvestedFromSalesRub: number | null; // 4. Реинвестирование (строго по хронологии денежных операций!)
  reinvestedSharePct: number; // Доля закупок, покрытая реинвестированием (%)

  // Отдельная разбивка капитала (Раздел 5 ТЗ v14):
  factualOwnMoneyContributedRub: number; // Фактически внесённые («Оплачено» + стартовый кэш)
  approvedOwnMoneyInjectionsRub: number; // Утверждённые вложения («Утверждено»)
  alreadyInvestedOwnMoneyRub: number; // Стартовый капитал + утверждённые/оплаченные вложения
  plannedUserInjectionsRub: number; // Плановые вложения («Запланировано»)
  totalOwnMoneyConfiguredRub: number; // Все внесённые и запланированные собственные деньги
  remainingOwnMoneyNeededRub: number | null; // Оставшаяся непокрытая сумма финансирования
  additionalOwnMoneyStillNeededRub: number | null; // Синоним для тестов v13

  // Пометка предварительного расчёта (Раздел 7 и 11 ТЗ v14):
  isPreliminaryCalculation: boolean;
  missingCostModelsCount: number;
  missingCostModelIds: string[];

  // Ближайший платёж:
  nextUpcomingPayment: {
    opKey: string;
    dateIso: string;
    dateDotRu: string;
    dateHumanRu: string;
    amountRub: number;
    purposeLabel: string;
    factoryName: string;
    modelId?: string;
    modelCode?: string;
    batchKey?: string;
    status: OperationPaymentStatus;
  } | null;

  // Детализация продаж, реинвестирования и пика потребности:
  totalWbCashInflowRub: number; // Сколько денег вернётся от продаж на расчётный счёт за период
  totalGrossSalesRevenueRub: number; // 1. План продаж (общая прогнозируемая выручка выбранного сценария)
  totalAccrualOperatingProfitRub: number; // Справочно для «Подробной аналитики»
  totalOtherExpensesRub: number;
  batchesTotalCount: number;
  batchesFundedBySalesCount: number;
  batchesFullyFundedBySalesCount: number;
  peakShortageDateIso: string | null;
  peakShortageDateDotRu: string | null;
  peakShortageDateHumanRu: string | null;
  peakShortageMonthIdx: number;
  peakShortageMonthLabel: string;
  peakShortageMonthFullRu: string; // Напр. «Январь 2027» (подпись под карточкой №3 в Разделе 3 ТЗ v14)
  peakShortageAmountRub: number | null;
  isAddedCapitalSufficientForSubsequentPayments: boolean;
  datesRequiringOwnInjection: {
    dateIso: string;
    dateDotRu: string;
    dateHumanRu: string;
    amountRub: number;
    purposeSummary: string;
  }[];

  // Главный рабочий блок «Когда и сколько вложить» (Раздел 4 ТЗ v14) и «Что нужно сделать» (Раздел 7 ТЗ v14):
  whenAndHowMuchRows: WhenAndHowMuchRow[];
  recommendations: SystemActionRecommendation[];

  // Календарь по месяцам и датам + все связанные партии и поставщики:
  monthlyCalendarRows: MonthlyInvestmentCalendarRow[];
  allEvents: ChronologicalCashEvent[];
  batchesCatalog: LinkedProcurementBatchDetails[];
  availableSuppliers: string[];
  supplyDeficitWarnings: SupplyDeficitWarning[];
  dataWarnings: InvestmentDataWarning[];
  manualOverridesCount: number;
  lockedOperationsCount: number;
}

const MONTHS_SHORT_RU = [
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

const MONTHS_FULL_RU = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const MONTHS_GENITIVE_SHORT_RU = [
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

const MULTI_BRAND_ORDER: CanonicalBrandCode[] = [
  'BORNERS',
  'FUKAI',
  'NA_TELE',
  'AKUSHA',
  'LISKANI',
];

export function formatIsoDateHumanRu(dateIso: string): string {
  const m = (dateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateIso || '—';
  const yr = Number(m[1]);
  const mo = Math.max(1, Math.min(12, Number(m[2]))) - 1;
  const day = Number(m[3]);
  return `${day} ${MONTHS_GENITIVE_SHORT_RU[mo]} ${yr}`;
}

export function formatIsoDateDotRu(dateIso: string): string {
  const m = (dateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateIso || '—';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

const MONTHS_GENITIVE_FULL_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const MONTHS_PREPOSITIONAL_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function formatDayMonthGenitiveRu(dateIso: string): string {
  const m = (dateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateIso || '—';
  const mo = Math.max(1, Math.min(12, Number(m[2]))) - 1;
  const day = Number(m[3]);
  return `${day} ${MONTHS_GENITIVE_FULL_RU[mo]}`;
}

function formatMonthYearFullRu(dateIso: string | null, fallbackMonthIdx: number, fallbackYear: number): string {
  const m = (dateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    return `${MONTHS_FULL_RU[Math.max(0, Math.min(11, fallbackMonthIdx))] || 'Январь'} ${fallbackYear}`;
  }
  const yr = Number(m[1]);
  const mo = Math.max(1, Math.min(12, Number(m[2]))) - 1;
  return `${MONTHS_FULL_RU[mo]} ${yr}`;
}

function formatMillionsCompactRu(rub: number): string {
  const abs = Math.abs(rub);
  const sign = rub < 0 ? '−' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs).toLocaleString('ru-RU')} ₽`;
  }
  return `${sign}${Math.round(abs)} ₽`;
}

function pluralizeModelsGenitiveRu(count: number): string {
  const mod100 = Math.abs(count) % 100;
  const mod10 = mod100 % 10;
  if (mod10 === 1 && mod100 !== 11) return 'модели';
  return 'моделей';
}

export function addDaysToIsoDate(dateIso: string, deltaDays: number): string {
  const m = (dateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateIso;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const shifted = new Date(utc + Math.round(deltaDays) * 86_400_000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getLastDayOfMonthIso(year: number, monthIdx: number): string {
  const lastDayUtc = new Date(Date.UTC(year, monthIdx + 1, 0));
  const yyyy = lastDayUtc.getUTCFullYear();
  const mm = String(lastDayUtc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(lastDayUtc.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function resolveCalendarMonthIdxForYear(dateIso: string, scenarioYear: number): number {
  const m = (dateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const yr = Number(m[1]);
  const mo = Math.max(0, Math.min(11, Number(m[2]) - 1));
  if (yr < scenarioYear) return 0;
  if (yr > scenarioYear) return 11;
  return mo;
}

export function buildScenarioScopeKey(
  brandCode: CanonicalBrandCode | 'ALL',
  scenarioId: number | null
): string {
  if (brandCode === 'ALL' || scenarioId === null) return 'GROUP:ALL';
  return `${brandCode}:${scenarioId}`;
}

export function createDefaultInvestmentLedgerState(): InvestmentLedgerState {
  return {
    version: 1,
    globalSettings: {
      initialCashRub: 0,
      minCashReserveRub: 0,
      wbPayoutDelayDays: 0,
      wbPayoutScheduleSpecified: true,
      wbPayoutFrequency: 'twice_monthly',
    },
    sharedCommitted: {
      committedPaymentOverrides: {},
      committedBatchOverrides: {},
      committedCapitalInjections: [],
      committedOtherOperations: [],
    },
    scenarioPlans: {},
    auditHistory: [],
    updatedAtIso: '2026-01-01T00:00:00.000Z',
  };
}

export function normalizeInvestmentLedgerState(
  raw: Partial<InvestmentLedgerState> | null | undefined,
  options?: { syncWithStorage?: boolean }
): InvestmentLedgerState {
  const base = createDefaultInvestmentLedgerState();
  const savedFinance = options?.syncWithStorage
    ? safeGetStorageJson<{
        initialCashMln?: number;
        wbLagMonths?: number;
      }>('borners_finance_contour_params_v1')
    : null;

  if (!raw || typeof raw !== 'object') {
    if (!savedFinance) return base;
    const initCash =
      typeof savedFinance.initialCashMln === 'number' && Number.isFinite(savedFinance.initialCashMln)
        ? Math.max(0, Math.round(savedFinance.initialCashMln * 1_000_000))
        : 0;
    const wbLag =
      typeof savedFinance.wbLagMonths === 'number' && Number.isFinite(savedFinance.wbLagMonths)
        ? savedFinance.wbLagMonths
        : 0;
    return {
      ...base,
      globalSettings: {
        ...base.globalSettings,
        initialCashRub: initCash,
        wbPayoutDelayDays: wbLag > 0 ? wbLag * 30 : 0,
        wbPayoutScheduleSpecified: wbLag >= 0,
      },
    };
  }

  const rawGs = (raw.globalSettings || {}) as Partial<InvestmentLedgerGlobalSettings>;
  let initialCashRub =
    typeof rawGs.initialCashRub === 'number' && Number.isFinite(rawGs.initialCashRub)
      ? Math.max(0, Math.round(rawGs.initialCashRub))
      : base.globalSettings.initialCashRub;

  if (
    typeof savedFinance?.initialCashMln === 'number' &&
    Number.isFinite(savedFinance.initialCashMln)
  ) {
    initialCashRub = Math.max(0, Math.round(savedFinance.initialCashMln * 1_000_000));
  }

  let wbPayoutScheduleSpecified =
    typeof rawGs.wbPayoutScheduleSpecified === 'boolean'
      ? rawGs.wbPayoutScheduleSpecified
      : base.globalSettings.wbPayoutScheduleSpecified;

  let wbPayoutDelayDays =
    typeof rawGs.wbPayoutDelayDays === 'number' && Number.isFinite(rawGs.wbPayoutDelayDays)
      ? Math.max(0, Math.min(120, Math.round(rawGs.wbPayoutDelayDays)))
      : base.globalSettings.wbPayoutDelayDays;

  if (typeof savedFinance?.wbLagMonths === 'number') {
    if (savedFinance.wbLagMonths < 0) {
      wbPayoutScheduleSpecified = false;
    } else if (rawGs.wbPayoutScheduleSpecified === false) {
      // Если в finance_contour_params включили обратно >= 0
      wbPayoutScheduleSpecified = true;
    }
    if (
      savedFinance.wbLagMonths > 0 &&
      Math.floor(wbPayoutDelayDays / 30) !== savedFinance.wbLagMonths
    ) {
      wbPayoutDelayDays = savedFinance.wbLagMonths * 30;
    }
  }

  return {
    version: 1,
    globalSettings: {
      initialCashRub,
      minCashReserveRub:
        typeof rawGs.minCashReserveRub === 'number' && Number.isFinite(rawGs.minCashReserveRub)
          ? Math.max(0, Math.round(rawGs.minCashReserveRub))
          : 0,
      wbPayoutDelayDays,
      wbPayoutScheduleSpecified,
      wbPayoutFrequency:
        rawGs.wbPayoutFrequency === 'weekly' ||
        rawGs.wbPayoutFrequency === 'month_end' ||
        rawGs.wbPayoutFrequency === 'twice_monthly'
          ? rawGs.wbPayoutFrequency
          : 'twice_monthly',
      selectedFinanceYear:
        rawGs.selectedFinanceYear === 2028
          ? 2028
          : rawGs.selectedFinanceYear === 2027
          ? 2027
          : undefined,
    },
    sharedCommitted: {
      committedPaymentOverrides: {
        ...(raw.sharedCommitted?.committedPaymentOverrides || {}),
      },
      committedBatchOverrides: {
        ...(raw.sharedCommitted?.committedBatchOverrides || {}),
      },
      committedCapitalInjections: Array.isArray(raw.sharedCommitted?.committedCapitalInjections)
        ? raw.sharedCommitted!.committedCapitalInjections
        : [],
      committedOtherOperations: Array.isArray(raw.sharedCommitted?.committedOtherOperations)
        ? raw.sharedCommitted!.committedOtherOperations
        : [],
    },
    scenarioPlans:
      raw.scenarioPlans && typeof raw.scenarioPlans === 'object' ? { ...raw.scenarioPlans } : {},
    auditHistory: Array.isArray(raw.auditHistory) ? raw.auditHistory.slice(0, 250) : [],
    updatedAtIso:
      typeof raw.updatedAtIso === 'string' && raw.updatedAtIso
        ? raw.updatedAtIso
        : base.updatedAtIso,
  };
}

export function loadInvestmentLedgerState(): InvestmentLedgerState {
  const stored = safeGetStorageJson<Partial<InvestmentLedgerState>>(STORAGE_KEY_INVESTMENT_LEDGER);
  return normalizeInvestmentLedgerState(stored, { syncWithStorage: true });
}

export function saveInvestmentLedgerState(
  next: InvestmentLedgerState,
  options: { syncFinanceParams?: boolean } = { syncFinanceParams: true }
): InvestmentLedgerState {
  const stamped: InvestmentLedgerState = {
    ...next,
    version: 1,
    updatedAtIso: new Date().toISOString(),
  };
  safeSetStorageJson(STORAGE_KEY_INVESTMENT_LEDGER, stamped);

  if (options.syncFinanceParams !== false) {
    const prevFin =
      safeGetStorageJson<Record<string, unknown>>('borners_finance_contour_params_v1') || {};
    const nextInitialCashMln =
      Math.round((stamped.globalSettings.initialCashRub / 1_000_000) * 1000) / 1000;
    const nextWbLagMonths = !stamped.globalSettings.wbPayoutScheduleSpecified
      ? -1
      : Math.min(2, Math.floor(stamped.globalSettings.wbPayoutDelayDays / 30));
    const finChanged =
      prevFin.initialCashMln !== nextInitialCashMln || prevFin.wbLagMonths !== nextWbLagMonths;
    if (finChanged) {
      const mergedFin = {
        ...prevFin,
        initialCashMln: nextInitialCashMln,
        wbLagMonths: nextWbLagMonths,
      };
      safeSetStorageJson('borners_finance_contour_params_v1', mergedFin);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('borners-finance-params-changed', { detail: mergedFin })
        );
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('borners-investment-ledger-changed', { detail: stamped })
    );
  }
  return stamped;
}

export function appendLedgerAudit(
  state: InvestmentLedgerState,
  entry: Omit<InvestmentLedgerAuditEntry, 'id' | 'timestampIso'>
): InvestmentLedgerAuditEntry[] {
  const item: InvestmentLedgerAuditEntry = {
    ...entry,
    id: `inv-aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestampIso: new Date().toISOString(),
  };
  return [item, ...(state.auditHistory || [])].slice(0, 250);
}

export function ensureScenarioPlanSlot(
  state: InvestmentLedgerState,
  scopeKey: string
): ScenarioManualLedgerPlan {
  const existing = state.scenarioPlans[scopeKey];
  if (existing) {
    return {
      paymentOverrides: { ...(existing.paymentOverrides || {}) },
      batchOverrides: { ...(existing.batchOverrides || {}) },
      plannedCapitalInjections: [...(existing.plannedCapitalInjections || [])],
      plannedOtherOperations: [...(existing.plannedOtherOperations || [])],
    };
  }
  return {
    paymentOverrides: {},
    batchOverrides: {},
    plannedCapitalInjections: [],
    plannedOtherOperations: [],
  };
}

interface ScopedBrandScenarioInput {
  brandCode: CanonicalBrandCode;
  brandTitle: string;
  scenario: GrowthScenarioDef;
  scopeKey: string;
  isProjectedYear: boolean;
  models: ScenarioModelSpec[];
}

function adaptScenarioForTargetYear(
  scen: GrowthScenarioDef,
  brandCode: CanonicalBrandCode,
  allScenarios: GrowthScenarioDef[],
  targetYear?: 2027 | 2028
): { scenario: GrowthScenarioDef; scopeKey: string; isProjectedYear: boolean } {
  const baseYear = scen.year || 2027;
  if (!targetYear || baseYear === targetYear) {
    return {
      scenario: scen,
      scopeKey: buildScenarioScopeKey(brandCode, scen.id),
      isProjectedYear: false,
    };
  }
  if (targetYear === 2028) {
    const explicit2028 = allScenarios.find(
      (s) =>
        !s.isArchived &&
        s.year === 2028 &&
        s.copiedFromScenarioId === scen.id &&
        isScenarioCompatibleWithBrand(s, brandCode)
    );
    if (explicit2028) {
      return {
        scenario: explicit2028,
        scopeKey: buildScenarioScopeKey(brandCode, explicit2028.id),
        isProjectedYear: false,
      };
    }
    return {
      scenario: {
        ...scen,
        year: 2028,
        copiedFromScenarioId: scen.copiedFromScenarioId || scen.id,
      },
      scopeKey: `${buildScenarioScopeKey(brandCode, scen.id)}@2028`,
      isProjectedYear: true,
    };
  }
  // targetYear === 2027 при исходном сценарии 2028 года
  if (scen.copiedFromScenarioId) {
    const source2027 = allScenarios.find(
      (s) => !s.isArchived && s.id === scen.copiedFromScenarioId && (s.year || 2027) === 2027
    );
    if (source2027) {
      return {
        scenario: source2027,
        scopeKey: buildScenarioScopeKey(brandCode, source2027.id),
        isProjectedYear: false,
      };
    }
  }
  return {
    scenario: { ...scen, year: 2027 },
    scopeKey: `${buildScenarioScopeKey(brandCode, scen.id)}@2027`,
    isProjectedYear: true,
  };
}

function resolveScopedBrandScenarios(params: {
  models: ScenarioModelSpec[];
  scenarios: GrowthScenarioDef[];
  activeScenario: GrowthScenarioDef;
  brandFilter: string;
  selectedScenarioByBrand?: Partial<Record<CanonicalBrandCode | 'LISCANI', number | null>>;
  includeGroupPortfolioInS1?: boolean;
  targetYear?: 2027 | 2028;
}): ScopedBrandScenarioInput[] {
  const seenKeys = new Set<string>();
  const dedupedModels: ScenarioModelSpec[] = [];
  for (const rm of params.models) {
    if (!rm || rm.launchStatus === 'В архиве') continue;
    if (
      ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(rm.id) ||
      ['№001', '№002', '№003', '№004'].includes(rm.code)
    ) {
      continue;
    }
    const key = rm.id || rm.code;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    dedupedModels.push(ensureModelUnifiedV11(rm));
  }

  const normFilter =
    !params.brandFilter || params.brandFilter === 'ALL'
      ? 'ALL'
      : normalizePortfolioBrandCode(params.brandFilter);

  if (normFilter !== 'ALL') {
    const cfg = BRAND_UNIT_CONFIGS[normFilter];
    const rawBrandModels = dedupedModels.filter((m) => matchesBrandFilter(m, normFilter));
    const adapted = adaptScenarioForTargetYear(
      params.activeScenario,
      normFilter,
      params.scenarios,
      params.targetYear
    );
    const scen = adapted.scenario;
    const scopedModels =
      scen.id === 100
        ? rawBrandModels.filter(
            (m) =>
              Boolean(getActingSkuByWbOrVendor(m.code, m.title)) ||
              Boolean(m.plansByScenario[100])
          )
        : normFilter === 'BORNERS' && scen.id === 1 && !params.includeGroupPortfolioInS1
        ? rawBrandModels.filter((m) => !isUnverifiedActingSku(m.code))
        : rawBrandModels;

    return [
      {
        brandCode: normFilter,
        brandTitle: cfg.displayCode,
        scenario: scen,
        scopeKey: adapted.scopeKey,
        isProjectedYear: adapted.isProjectedYear,
        models: scopedModels,
      },
    ];
  }

  // Режим BORNERS GROUP («Все бренды»): строим единый портфель по выбранным сценариям каждого из 5 брендов
  const result: ScopedBrandScenarioInput[] = [];
  for (const brandCode of MULTI_BRAND_ORDER) {
    const cfg = BRAND_UNIT_CONFIGS[brandCode];
    const brandModels = dedupedModels.filter((m) => matchesBrandFilter(m, brandCode));
    if (brandModels.length === 0) continue;

    const availableScenarios = getScenariosForBrand(params.scenarios, brandCode, {
      onlyExplicitForNewBrands: false,
    });
    const rawSelectedId =
      brandCode === 'LISKANI'
        ? params.selectedScenarioByBrand?.LISKANI ?? params.selectedScenarioByBrand?.LISCANI
        : params.selectedScenarioByBrand?.[brandCode];

    const defaultScenarioId =
      brandCode === 'BORNERS'
        ? availableScenarios.find((s) => s.id === 1)?.id ?? availableScenarios[0]?.id ?? null
        : brandCode === 'FUKAI'
        ? availableScenarios.find((s) => s.id === 100)?.id ??
          availableScenarios.find((s) => s.id === 1)?.id ??
          availableScenarios[0]?.id ??
          null
        : availableScenarios.find(
            (s) =>
              s.ownerBrandCode && normalizePortfolioBrandCode(s.ownerBrandCode) === brandCode
          )?.id ??
          availableScenarios[0]?.id ??
          null;

    const resolvedId =
      rawSelectedId === null
        ? null
        : rawSelectedId !== undefined
        ? rawSelectedId
        : defaultScenarioId;
    if (resolvedId === null) continue;

    const candidate =
      params.scenarios.find((s) => s.id === resolvedId && !s.isArchived) || null;
    const baseSelectedScenario =
      candidate && isScenarioCompatibleWithBrand(candidate, brandCode)
        ? candidate
        : defaultScenarioId !== null
        ? params.scenarios.find((s) => s.id === defaultScenarioId && !s.isArchived) || null
        : null;
    if (!baseSelectedScenario) continue;

    const adapted = adaptScenarioForTargetYear(
      baseSelectedScenario,
      brandCode,
      params.scenarios,
      params.targetYear
    );
    const selectedScenario = adapted.scenario;

    const scopedModels =
      selectedScenario.id === 100
        ? brandModels.filter(
            (m) =>
              Boolean(getActingSkuByWbOrVendor(m.code, m.title)) ||
              Boolean(m.plansByScenario[100])
          )
        : brandCode === 'BORNERS' &&
          selectedScenario.id === 1 &&
          !params.includeGroupPortfolioInS1
        ? brandModels.filter((m) => !isUnverifiedActingSku(m.code))
        : brandModels;

    if (scopedModels.length > 0) {
      result.push({
        brandCode,
        brandTitle: cfg.displayCode,
        scenario: selectedScenario,
        scopeKey: adapted.scopeKey,
        isProjectedYear: adapted.isProjectedYear,
        models: scopedModels,
      });
    }
  }

  return result;
}

function formatSizeBreakdownSummary(
  breakdown: Record<string, number> | undefined
): string {
  if (!breakdown) return '';
  const entries = Object.entries(breakdown).filter(([, qty]) => qty > 0);
  if (entries.length === 0) return '';
  return entries.map(([sz, qty]) => `${sz}: ${qty.toLocaleString('ru-RU')}`).join(' · ');
}

function checkBatchSupplyDeficit(params: {
  model: ScenarioModelSpec;
  monthlyDemandPacks: number[];
  openingNetPacks: number;
  allBatchReceiptsByMonthOriginal: number[];
  originalArrivalMonthIdx: number;
  shiftedArrivalDateIso: string;
  originalBatchPacksQty: number;
  effectiveBatchPacksQty: number;
  scenarioYear: number;
}): { deficitPacks: number; affectedMonthsLabel: string } | null {
  const m = (params.shiftedArrivalDateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const yr = Number(m[1]);
  const mo = Math.max(0, Math.min(11, Number(m[2]) - 1));
  const day = Number(m[3]);

  const effectiveReceiptMonthIdx = yr > params.scenarioYear ? 12 : yr < params.scenarioYear ? 0 : mo;
  const isVolumeReduced = params.effectiveBatchPacksQty < params.originalBatchPacksQty;
  const isArrivalDelayed =
    effectiveReceiptMonthIdx > params.originalArrivalMonthIdx ||
    (effectiveReceiptMonthIdx === params.originalArrivalMonthIdx && day > 12);

  if (!isArrivalDelayed && !isVolumeReduced) {
    return null;
  }

  const adjustedReceipts = [...params.allBatchReceiptsByMonthOriginal];
  adjustedReceipts[params.originalArrivalMonthIdx] = Math.max(
    0,
    (adjustedReceipts[params.originalArrivalMonthIdx] || 0) - params.originalBatchPacksQty
  );

  if (effectiveReceiptMonthIdx < 12) {
    if (
      effectiveReceiptMonthIdx === params.originalArrivalMonthIdx &&
      day > 12 &&
      !isVolumeReduced
    ) {
      // Приход во второй половине месяца: доступно только (30 - day)/30 в этом месяце
      const lostWindowShare = Math.min(0.85, Math.max(0.25, (day - 1) / 30));
      const monthDemand = params.monthlyDemandPacks[effectiveReceiptMonthIdx] || 0;
      const availableBefore =
        params.openingNetPacks +
        params.allBatchReceiptsByMonthOriginal
          .slice(0, effectiveReceiptMonthIdx)
          .reduce((a, b) => a + b, 0) -
        params.monthlyDemandPacks
          .slice(0, effectiveReceiptMonthIdx)
          .reduce((a, b) => a + b, 0);
      const demandBeforeArrival = Math.round(monthDemand * lostWindowShare);
      const intraMonthShortfall = Math.max(0, demandBeforeArrival - Math.max(0, availableBefore));
      if (intraMonthShortfall > 0) {
        return {
          deficitPacks: intraMonthShortfall,
          affectedMonthsLabel: `${MONTHS_SHORT_RU[effectiveReceiptMonthIdx]} ${params.scenarioYear} (до ${day}-го числа)`,
        };
      }
      return null;
    }
    adjustedReceipts[effectiveReceiptMonthIdx] =
      (adjustedReceipts[effectiveReceiptMonthIdx] || 0) + params.effectiveBatchPacksQty;
  }

  let runningStock = params.openingNetPacks;
  let maxDeficitPacks = 0;
  const deficitMonths: string[] = [];
  for (let idx = 0; idx < 12; idx++) {
    runningStock += adjustedReceipts[idx] || 0;
    const dem = params.monthlyDemandPacks[idx] || 0;
    runningStock -= dem;
    if (runningStock < 0) {
      const defHere = Math.abs(runningStock);
      if (defHere > maxDeficitPacks) maxDeficitPacks = defHere;
      deficitMonths.push(MONTHS_SHORT_RU[idx]);
      runningStock = 0;
    }
  }

  if (maxDeficitPacks <= 0) return null;
  const label =
    deficitMonths.length === 1
      ? `${deficitMonths[0]} ${params.scenarioYear}`
      : `${deficitMonths[0]}–${deficitMonths[deficitMonths.length - 1]} ${params.scenarioYear}`;
  return {
    deficitPacks: maxDeficitPacks,
    affectedMonthsLabel: label,
  };
}

export interface ComputeInvestmentScheduleParams {
  models: ScenarioModelSpec[];
  scenarios: GrowthScenarioDef[];
  activeScenario: GrowthScenarioDef;
  brandFilter?: string; // 'ALL' или код бренда
  selectedScenarioByBrand?: Partial<Record<CanonicalBrandCode | 'LISCANI', number | null>>;
  includeGroupPortfolioInS1?: boolean;
  ledgerState?: InvestmentLedgerState;
  explicitInitialCashRub?: number;
  explicitWbLagMonths?: number | null;
  explicitWbScheduleSpecified?: boolean;
  targetYear?: 2027 | 2028;
}

export function computeInvestmentSchedule(
  params: ComputeInvestmentScheduleParams
): ComputedInvestmentScheduleResult {
  const baseLedger = params.ledgerState
    ? normalizeInvestmentLedgerState(params.ledgerState)
    : loadInvestmentLedgerState();

  const initialCashRub =
    params.explicitInitialCashRub !== undefined
      ? Math.max(0, Math.round(params.explicitInitialCashRub))
      : baseLedger.globalSettings.initialCashRub;

  const minCashReserveRub = Math.max(0, Math.round(baseLedger.globalSettings.minCashReserveRub || 0));

  const wbPayoutScheduleSpecified =
    params.explicitWbScheduleSpecified !== undefined
      ? params.explicitWbScheduleSpecified
      : params.explicitWbLagMonths !== undefined
      ? params.explicitWbLagMonths !== null && params.explicitWbLagMonths >= 0
      : baseLedger.globalSettings.wbPayoutScheduleSpecified;

  let wbPayoutDelayDays = baseLedger.globalSettings.wbPayoutDelayDays;
  if (
    typeof params.explicitWbLagMonths === 'number' &&
    params.explicitWbLagMonths >= 0 &&
    Math.floor(wbPayoutDelayDays / 30) !== params.explicitWbLagMonths
  ) {
    wbPayoutDelayDays = params.explicitWbLagMonths * 30;
  }

  const normFilter =
    !params.brandFilter || params.brandFilter === 'ALL'
      ? 'ALL'
      : normalizePortfolioBrandCode(params.brandFilter);
  const isGroupAllBrands = normFilter === 'ALL';

  const requestedYear: 2027 | 2028 | undefined =
    params.targetYear === 2028
      ? 2028
      : params.targetYear === 2027
      ? 2027
      : baseLedger.globalSettings.selectedFinanceYear === 2028
      ? 2028
      : baseLedger.globalSettings.selectedFinanceYear === 2027
      ? 2027
      : undefined;

  const scopedInputs = resolveScopedBrandScenarios({
    models: params.models,
    scenarios: params.scenarios,
    activeScenario: params.activeScenario,
    brandFilter: normFilter,
    selectedScenarioByBrand: params.selectedScenarioByBrand,
    includeGroupPortfolioInS1: params.includeGroupPortfolioInS1,
    targetYear: requestedYear,
  });

  const scenarioYear =
    requestedYear || scopedInputs[0]?.scenario?.year || params.activeScenario?.year || 2027;
  const groupScopeKeyForYear = scenarioYear === 2028 ? 'GROUP:ALL@2028' : 'GROUP:ALL';
  const activeScopeKey = isGroupAllBrands
    ? groupScopeKeyForYear
    : scopedInputs[0]?.scopeKey ||
      buildScenarioScopeKey(normFilter, params.activeScenario?.id ?? 1);

  const batchesCatalog: LinkedProcurementBatchDetails[] = [];
  const suppliersSet = new Set<string>();
  const supplyDeficitWarnings: SupplyDeficitWarning[] = [];
  const missingCostSkus: string[] = [];
  const missingCostModelIds: string[] = [];

  const monthlyGrossSalesByMonth = Array(12).fill(0) as number[];
  const monthlyWbNetPayoutGeneratedByMonth = Array(12).fill(0) as number[];
  let totalGrossSalesRevenueRub = 0;
  let totalSoldGoodsCostRub = 0;
  let totalWbDeductionsRub = 0;

  let approvedProcurementCostRub = 0;
  let plannedProcurementCostRub = 0;

  const rawEvents: ChronologicalCashEvent[] = [];
  let manualOverridesCount = 0;
  let lockedOperationsCount = 0;

  const resolveBatchOverride = (
    batchKey: string,
    scopeKey: string,
    isApprovedPo: boolean
  ): BatchTermsManualOverride | undefined => {
    const committed = baseLedger.sharedCommitted.committedBatchOverrides[batchKey];
    if (committed) return committed;
    if (isApprovedPo) return undefined;
    return (
      baseLedger.scenarioPlans[scopeKey]?.batchOverrides?.[batchKey] ||
      baseLedger.scenarioPlans[groupScopeKeyForYear]?.batchOverrides?.[batchKey]
    );
  };

  const resolvePaymentOverride = (
    opKey: string,
    scopeKey: string,
    isApprovedPo: boolean
  ): { override?: ManualPaymentOverride; isSharedCommitted: boolean } => {
    const committed = baseLedger.sharedCommitted.committedPaymentOverrides[opKey];
    if (committed) {
      return { override: committed, isSharedCommitted: true };
    }
    if (isApprovedPo) {
      return { override: undefined, isSharedCommitted: true };
    }
    const scenOvr =
      baseLedger.scenarioPlans[scopeKey]?.paymentOverrides?.[opKey] ||
      baseLedger.scenarioPlans[groupScopeKeyForYear]?.paymentOverrides?.[opKey];
    return { override: scenOvr, isSharedCommitted: false };
  };

  for (const scoped of scopedInputs) {
    const {
      brandCode,
      brandTitle,
      scenario,
      scopeKey,
      isProjectedYear,
      models: brandModels,
    } = scoped;
    const yr = scenario.year || scenarioYear;

    for (const m of brandModels) {
      const mForCalc: ScenarioModelSpec =
        isProjectedYear && yr >= 2028
          ? (() => {
              const ref2027Id = scenario.copiedFromScenarioId || scenario.id || 1;
              const carryOverPacks = computeCarryOverStock2027To2028(m, ref2027Id);
              const baseShared = m.sharedSupplyAndFact!;
              const existingPlan = m.plansByScenario[scenario.id];
              return {
                ...m,
                sharedSupplyAndFact: {
                  ...baseShared,
                  actualOpeningStockPacks: carryOverPacks,
                  reservedStockPacks: 0,
                },
                plansByScenario: existingPlan
                  ? {
                      ...m.plansByScenario,
                      [scenario.id]: {
                        ...existingPlan,
                        initialStockPacks: carryOverPacks,
                      },
                    }
                  : m.plansByScenario,
              };
            })()
          : m;
      const proc = computeProcurementPlan(mForCalc, scenario);
      const shared = mForCalc.sharedSupplyAndFact!;
      const unitCfg = getBrandUnitConfig(m);
      if (shared.factoryParams?.factoryName) {
        suppliersSet.add(shared.factoryParams.factoryName);
      }

      // 1. Помесячная выручка и генерация выплат WB по модели
      const planScenarioKey =
        m.plansByScenario[scenario.id]
          ? scenario.id
          : scenario.copiedFromScenarioId && m.plansByScenario[scenario.copiedFromScenarioId]
          ? scenario.copiedFromScenarioId
          : null;
      const plan =
        (planScenarioKey !== null ? m.plansByScenario[planScenarioKey] : undefined) ||
        m.plansByScenario[202706] ||
        m.plansByScenario[202705] ||
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
      const hasValidRevOverride =
        Array.isArray(plan.monthlyRevenuesRubOverride) &&
        plan.monthlyRevenuesRubOverride.length === 12 &&
        (plan.monthlyRevenuesRubOverride.some((r) => (r || 0) > 0) ||
          !plan.monthlyPacks.some((p) => (p || 0) > 0));

      const monthlyDemandPacks = proc.monthlyBalance.map((mb) => mb.demandPacks);
      const hasAnySales = proc.annualDemandPacks > 0;
      if (hasAnySales && (m.unitCostRub || 0) <= 0) {
        missingCostSkus.push(`${m.code} (${m.title})`);
        if (!missingCostModelIds.includes(m.id)) {
          missingCostModelIds.push(m.id);
        }
      }

      const unitCost = Math.max(0, m.unitCostRub || 0);
      totalSoldGoodsCostRub += proc.annualDemandPacks * unitCost;

      for (let idx = 0; idx < 12; idx++) {
        // Фактические продажи за 2027 год не подмешиваем при прогнозе на 2028 год
        const act = !isProjectedYear && yr === 2027 ? shared.actualSalesByMonth[idx] : undefined;
        const packsM =
          act && act.actualBuyoutsPacks !== null
            ? Math.max(0, act.actualBuyoutsPacks)
            : Math.max(0, plan.monthlyPacks[idx] || 0);
        const effPriceM =
          (plan.monthlyPricesRub[idx] || 0) > 0 ? plan.monthlyPricesRub[idx] : m.retailPriceRub;
        const revM =
          act && act.actualBuyoutsPacks !== null
            ? packsM * (act.actualPriceRub !== null ? act.actualPriceRub : effPriceM)
            : isUnmodifiedActing
            ? actingSku.monthly[idx]?.revenue_rub || 0
            : hasValidRevOverride && plan.monthlyRevenuesRubOverride![idx] !== undefined
            ? plan.monthlyRevenuesRubOverride![idx]
            : packsM * effPriceM;

        const wbDedM = Math.min(revM, Math.round((revM * 40) / 100));
        const netPayoutM = Math.max(0, revM - wbDedM);

        monthlyGrossSalesByMonth[idx] += revM;
        monthlyWbNetPayoutGeneratedByMonth[idx] += netPayoutM;
        totalGrossSalesRevenueRub += revM;
        totalWbDeductionsRub += wbDedM;
      }

      // Собираем исходные приходы по месяцам (PO + рекомендованные партии) для проверки дефицита при сдвиге поставки/оплаты или изменении объёма
      const confirmedPos = proc.approvedOrders.filter(
        (po) => po.confirmedByFactory !== false && getPoArrivalYear(po) === yr
      );
      const originalReceiptsByMonth = Array(12).fill(0) as number[];
      for (const po of confirmedPos) {
        const am = Math.max(0, Math.min(11, po.arrivalMonthIdx));
        originalReceiptsByMonth[am] += po.packsQty;
      }
      for (const rb of proc.recommendedBatches) {
        const am = Math.max(0, Math.min(11, rb.firstCoveredMonthIdx));
        originalReceiptsByMonth[am] += rb.recommendedPacks;
      }

      const pushBatchPayments = (opts: {
        batchKey: string;
        isApprovedPo: boolean;
        poId?: string;
        poNumber?: string;
        periodId: string;
        defaultFactoryName: string;
        coverageMonthsLabel: string;
        firstCoveredMonthIdx: number;
        endCoveredMonthIdx: number;
        packsQty: number;
        physicalUnitsQty: number;
        batchUnitCostRub: number;
        totalBatchRub: number;
        defaultPrepayPct: number;
        defaultPrepayRub: number;
        defaultBalanceRub: number;
        defaultOrderDateIso: string;
        defaultArrivalDateIso: string;
        totalLeadDays: number;
        sizeBreakdownText: string;
      }) => {
        if (opts.totalBatchRub <= 0 && opts.packsQty <= 0) return;

        const batchOvr = resolveBatchOverride(opts.batchKey, scopeKey, opts.isApprovedPo);
        const effectiveFactoryName =
          batchOvr?.customFactoryName?.trim() || opts.defaultFactoryName;
        suppliersSet.add(effectiveFactoryName);

        const unitsPerPack =
          opts.packsQty > 0 ? Math.max(1, Math.round(opts.physicalUnitsQty / opts.packsQty)) : 1;
        const hasCustomPacks =
          !opts.isApprovedPo &&
          batchOvr?.customPacksQty !== undefined &&
          Number.isFinite(batchOvr.customPacksQty);
        const effectivePacksQty = hasCustomPacks
          ? Math.max(0, Math.round(batchOvr!.customPacksQty!))
          : opts.packsQty;
        const effectivePhysicalUnitsQty = hasCustomPacks
          ? effectivePacksQty * unitsPerPack
          : opts.physicalUnitsQty;
        const effectiveTotalBatchRub = hasCustomPacks
          ? Math.round(effectivePacksQty * opts.batchUnitCostRub)
          : opts.totalBatchRub;

        if (hasCustomPacks && effectiveTotalBatchRub !== opts.totalBatchRub) {
          plannedProcurementCostRub += effectiveTotalBatchRub - opts.totalBatchRub;
        }

        const effectivePrepayPct =
          batchOvr?.customPrepaymentPct !== undefined
            ? Math.max(0, Math.min(100, Math.round(batchOvr.customPrepaymentPct)))
            : opts.defaultPrepayPct;
        const effectiveBalancePct = Math.max(0, 100 - effectivePrepayPct);

        const recomputeLegs = batchOvr?.customPrepaymentPct !== undefined || hasCustomPacks;
        const effectivePrepayRub = recomputeLegs
          ? Math.round((effectiveTotalBatchRub * effectivePrepayPct) / 100)
          : opts.defaultPrepayRub;
        const effectiveBalanceRub = recomputeLegs
          ? Math.max(0, effectiveTotalBatchRub - effectivePrepayRub)
          : opts.defaultBalanceRub;

        const effectiveOrderDateIso =
          batchOvr?.customOrderDateIso || opts.defaultOrderDateIso;
        const effectiveArrivalDateIso =
          batchOvr?.customArrivalDateIso || opts.defaultArrivalDateIso;

        // Проверяем также ручной перенос предоплаты или окончательного расчёта, который сдвигает выпуск/выдачу партии
        const prepayOvrInfo = resolvePaymentOverride(
          `${opts.batchKey}::prepay`,
          scopeKey,
          opts.isApprovedPo
        );
        const balanceOvrInfo = resolvePaymentOverride(
          `${opts.batchKey}::balance`,
          scopeKey,
          opts.isApprovedPo
        );

        let simulatedSupplyArrivalDateIso = effectiveArrivalDateIso;
        let deficitTriggerKind: 'arrival_shift' | 'payment_delay' | 'volume_reduction' =
          batchOvr?.customArrivalDateIso &&
          batchOvr.customArrivalDateIso !== opts.defaultArrivalDateIso
            ? 'arrival_shift'
            : 'volume_reduction';

        const delayedPrepayDate =
          prepayOvrInfo.override?.splitTranches && prepayOvrInfo.override.splitTranches.length > 0
            ? prepayOvrInfo.override.splitTranches[0]?.dateIso
            : prepayOvrInfo.override?.customDateIso;
        if (delayedPrepayDate && delayedPrepayDate > opts.defaultOrderDateIso) {
          const leadDays = Math.max(0, opts.totalLeadDays || 0);
          const projectedFromPrepay = addDaysToIsoDate(delayedPrepayDate, leadDays);
          if (projectedFromPrepay > simulatedSupplyArrivalDateIso) {
            simulatedSupplyArrivalDateIso = projectedFromPrepay;
            if (deficitTriggerKind !== 'arrival_shift') {
              deficitTriggerKind = 'payment_delay';
            }
          }
        }

        const delayedBalanceDate =
          balanceOvrInfo.override?.splitTranches &&
          balanceOvrInfo.override.splitTranches.length > 0
            ? balanceOvrInfo.override.splitTranches[0]?.dateIso
            : balanceOvrInfo.override?.customDateIso;
        if (delayedBalanceDate && delayedBalanceDate > simulatedSupplyArrivalDateIso) {
          simulatedSupplyArrivalDateIso = delayedBalanceDate;
          if (deficitTriggerKind !== 'arrival_shift') {
            deficitTriggerKind = 'payment_delay';
          }
        }

        let hasDeficit = false;
        let deficitPacks = 0;
        if (
          simulatedSupplyArrivalDateIso !== opts.defaultArrivalDateIso ||
          effectivePacksQty < opts.packsQty
        ) {
          const defCheck = checkBatchSupplyDeficit({
            model: m,
            monthlyDemandPacks,
            openingNetPacks: proc.netOpeningAvailablePacks,
            allBatchReceiptsByMonthOriginal: originalReceiptsByMonth,
            originalArrivalMonthIdx: opts.firstCoveredMonthIdx,
            shiftedArrivalDateIso: simulatedSupplyArrivalDateIso,
            originalBatchPacksQty: opts.packsQty,
            effectiveBatchPacksQty: effectivePacksQty,
            scenarioYear: yr,
          });
          if (defCheck && defCheck.deficitPacks > 0) {
            hasDeficit = true;
            deficitPacks = defCheck.deficitPacks;
            const shiftedM = simulatedSupplyArrivalDateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            const targetMonthPrep = shiftedM
              ? MONTHS_PREPOSITIONAL_RU[Math.max(0, Math.min(11, Number(shiftedM[2]) - 1))]
              : formatIsoDateHumanRu(simulatedSupplyArrivalDateIso);
            const origMonthPrep =
              MONTHS_PREPOSITIONAL_RU[Math.max(0, Math.min(11, opts.firstCoveredMonthIdx))];

            const warningMsg =
              deficitTriggerKind === 'volume_reduction' &&
              simulatedSupplyArrivalDateIso === opts.defaultArrivalDateIso
                ? `Снижение объёма партии ${m.code} (${m.title}) до ${effectivePacksQty.toLocaleString(
                    'ru-RU'
                  )} ${unitCfg.primaryUnit} создаёт риск нехватки ${defCheck.deficitPacks.toLocaleString(
                    'ru-RU'
                  )} ${unitCfg.primaryUnit} в периоде ${defCheck.affectedMonthsLabel}.`
                : `Перенос партии ${m.code} (${m.title}) на ${targetMonthPrep} снижает потребность в деньгах на ${origMonthPrep}, но создаёт риск нехватки ${defCheck.deficitPacks.toLocaleString(
                    'ru-RU'
                  )} ${unitCfg.primaryUnit} в периоде ${defCheck.affectedMonthsLabel}.`;

            supplyDeficitWarnings.push({
              batchKey: opts.batchKey,
              modelId: m.id,
              modelCode: m.code,
              modelTitle: m.title,
              brandTitle,
              originalArrivalDateIso: opts.defaultArrivalDateIso,
              shiftedArrivalDateIso: simulatedSupplyArrivalDateIso,
              deficitPacks: defCheck.deficitPacks,
              unitLabel: unitCfg.primaryUnit,
              affectedMonthsLabel: defCheck.affectedMonthsLabel,
              message: warningMsg,
            });
          }
        }

        const batchDetails: LinkedProcurementBatchDetails = {
          batchKey: opts.batchKey,
          isApprovedPo: opts.isApprovedPo,
          poId: opts.poId,
          poNumber: opts.poNumber,
          periodId: opts.periodId,
          modelId: m.id,
          modelCode: m.code,
          modelTitle: m.title,
          brandCode,
          brandDisplayTitle: brandTitle,
          factoryName: effectiveFactoryName,
          coverageMonthsLabel: opts.coverageMonthsLabel,
          firstCoveredMonthIdx: opts.firstCoveredMonthIdx,
          endCoveredMonthIdx: opts.endCoveredMonthIdx,
          packsQty: effectivePacksQty,
          defaultPacksQty: opts.packsQty,
          primaryUnitLabel: unitCfg.primaryUnit,
          physicalUnitsQty: effectivePhysicalUnitsQty,
          unitCostRub: opts.batchUnitCostRub,
          totalBatchCostRub: effectiveTotalBatchRub,
          prepaymentPct: effectivePrepayPct,
          balancePaymentPct: effectiveBalancePct,
          prepaymentRub: effectivePrepayRub,
          balancePaymentRub: effectiveBalanceRub,
          orderDateIso: effectiveOrderDateIso,
          defaultOrderDateIso: opts.defaultOrderDateIso,
          arrivalDateIso: effectiveArrivalDateIso,
          originalArrivalDateIso: opts.defaultArrivalDateIso,
          totalLeadDays: opts.totalLeadDays,
          sizeBreakdownText: opts.sizeBreakdownText,
          hasArrivalShiftDeficit: hasDeficit,
          arrivalShiftDeficitPacks: deficitPacks,
        };
        batchesCatalog.push(batchDetails);

        const emitLeg = (
          legRole: 'prepay' | 'balance',
          autoDateIso: string,
          baseLegAmountRub: number,
          legPct: number
        ) => {
          const opKey = `${opts.batchKey}::${legRole}`;
          const { override: payOvr, isSharedCommitted } = resolvePaymentOverride(
            opKey,
            scopeKey,
            opts.isApprovedPo
          );

          const defaultStatus: OperationPaymentStatus = opts.isApprovedPo
            ? 'Утверждено'
            : 'Запланировано';
          const effectiveStatus: OperationPaymentStatus = payOvr?.status || defaultStatus;
          const isLocked =
            opts.isApprovedPo ||
            effectiveStatus === 'Утверждено' ||
            effectiveStatus === 'Оплачено' ||
            isSharedCommitted;

          const hasBatchTermEdit = Boolean(
            batchOvr &&
              (batchOvr.customPrepaymentPct !== undefined ||
                batchOvr.customFactoryName ||
                batchOvr.customArrivalDateIso ||
                batchOvr.customOrderDateIso ||
                batchOvr.customPacksQty !== undefined)
          );
          const hasPayEdit = Boolean(
            payOvr &&
              (payOvr.customDateIso ||
                payOvr.customAmountRub !== undefined ||
                payOvr.customFactoryName ||
                (Array.isArray(payOvr.splitTranches) && payOvr.splitTranches.length > 0))
          );

          if ((hasPayEdit || hasBatchTermEdit) && !isLocked) {
            manualOverridesCount += 1;
          }
          if (isLocked) {
            lockedOperationsCount += 1;
          }

          const supName = payOvr?.customFactoryName?.trim() || effectiveFactoryName;
          suppliersSet.add(supName);

          // Если платёж разбит на несколько траншей («Разбить платёж»)
          if (payOvr?.splitTranches && payOvr.splitTranches.length > 0) {
            const totalTranches = payOvr.splitTranches.length;
            payOvr.splitTranches.forEach((tr, tIdx) => {
              if ((tr.amountRub || 0) <= 0) return;
              const trStatus = tr.status || effectiveStatus;
              const trLocked =
                opts.isApprovedPo || trStatus === 'Утверждено' || trStatus === 'Оплачено';
              rawEvents.push({
                id: `${opKey}::tr:${tr.id || tIdx}`,
                opKey,
                dateIso: tr.dateIso || autoDateIso,
                calendarMonthIdx: resolveCalendarMonthIdxForYear(
                  tr.dateIso || autoDateIso,
                  yr
                ),
                type: 'factory_payment',
                paymentRole: 'tranche',
                status: trStatus,
                isFactual: trStatus === 'Оплачено',
                isApprovedLocked: trLocked,
                hasManualOverride: true,
                scenarioScopeKey: scopeKey,
                brandCode,
                brandTitle,
                title: `${tr.label || `Транш ${tIdx + 1}/${totalTranches}`} · ${m.code} (${opts.coverageMonthsLabel})`,
                purposeShort: `${tr.label || `Транш ${tIdx + 1}/${totalTranches}`} · ${m.code}`,
                factoryName: supName,
                batchKey: opts.batchKey,
                batchDetails,
                trancheIndex: tIdx + 1,
                tranchesTotal: totalTranches,
                autoDateIso,
                autoAmountRub: baseLegAmountRub,
                amountRub: Math.round(tr.amountRub),
                inflowRub: 0,
                outflowRub: Math.round(tr.amountRub),
                userCapitalInjectionRub: 0,
                reinvestedFromSalesRub: 0,
                coveredByOwnCapitalOnAccountRub: 0,
                needToInvestRub: 0,
                closingTotalCashRub: 0,
                closingFreeCashRub: 0,
              });
            });
            return;
          }

          const finalAmountRub =
            payOvr?.customAmountRub !== undefined
              ? Math.max(0, Math.round(payOvr.customAmountRub))
              : Math.max(0, Math.round(baseLegAmountRub));
          if (finalAmountRub <= 0) return;

          const finalDateIso = payOvr?.customDateIso || autoDateIso;
          const roleWord = legRole === 'prepay' ? `Аванс ${legPct}%` : `Доплата ${legPct}%`;
          const poPrefix = opts.poNumber ? `${opts.poNumber} · ` : '';

          rawEvents.push({
            id: opKey,
            opKey,
            dateIso: finalDateIso,
            calendarMonthIdx: resolveCalendarMonthIdxForYear(finalDateIso, yr),
            type: 'factory_payment',
            paymentRole: legRole,
            status: effectiveStatus,
            isFactual: effectiveStatus === 'Оплачено',
            isApprovedLocked: isLocked,
            hasManualOverride: hasPayEdit || hasBatchTermEdit,
            scenarioScopeKey: scopeKey,
            brandCode,
            brandTitle,
            title: `${poPrefix}${roleWord} · ${m.code} — ${m.title} (${opts.coverageMonthsLabel})`,
            purposeShort: `${roleWord} · ${m.code} (${opts.coverageMonthsLabel})`,
            factoryName: supName,
            batchKey: opts.batchKey,
            batchDetails,
            autoDateIso,
            autoAmountRub: baseLegAmountRub,
            amountRub: finalAmountRub,
            inflowRub: 0,
            outflowRub: finalAmountRub,
            userCapitalInjectionRub: 0,
            reinvestedFromSalesRub: 0,
            coveredByOwnCapitalOnAccountRub: 0,
            needToInvestRub: 0,
            closingTotalCashRub: 0,
            closingFreeCashRub: 0,
          });
        };

        emitLeg(
          'prepay',
          effectiveOrderDateIso,
          effectivePrepayRub,
          effectivePrepayPct
        );
        emitLeg(
          'balance',
          effectiveArrivalDateIso,
          effectiveBalanceRub,
          effectiveBalancePct
        );
      };

      // А) Общие утверждённые заказы фабрикам (PO) — не дублируются между сценариями и защищены от автопересчёта
      for (const po of confirmedPos) {
        approvedProcurementCostRub += po.totalOrderRub;
        const poPrepayPct =
          po.totalOrderRub > 0
            ? Math.round((po.prepaymentRub / po.totalOrderRub) * 100)
            : shared.factoryParams.prepaymentPct || 30;
        pushBatchPayments({
          batchKey: `${m.id}::po:${po.id}`,
          isApprovedPo: true,
          poId: po.id,
          poNumber: po.orderNumber,
          periodId: `po-${po.id}`,
          defaultFactoryName: po.factoryName || shared.factoryParams.factoryName,
          coverageMonthsLabel:
            po.coverageMonthsLabel || `${MONTHS_SHORT_RU[po.arrivalMonthIdx]} ${yr}`,
          firstCoveredMonthIdx: po.arrivalMonthIdx,
          endCoveredMonthIdx: po.coveredEndMonthIdx ?? po.arrivalMonthIdx,
          packsQty: po.packsQty,
          physicalUnitsQty: po.physicalUnitsQty,
          batchUnitCostRub: po.lockedUnitCostRub,
          totalBatchRub: po.totalOrderRub,
          defaultPrepayPct: poPrepayPct,
          defaultPrepayRub: po.prepaymentRub,
          defaultBalanceRub: po.balancePaymentRub,
          defaultOrderDateIso: po.orderPlacementDateIso,
          defaultArrivalDateIso: po.requiredArrivalDateIso,
          totalLeadDays: po.leadTimeDaysAtApproval,
          sizeBreakdownText: formatSizeBreakdownSummary(po.sizeBreakdownPacks),
        });
      }

      // Б) Плановые рекомендованные партии выбранного сценария
      for (const rb of proc.recommendedBatches) {
        plannedProcurementCostRub += rb.estimatedTotalRub;
        const rbPrepayPct =
          rb.estimatedTotalRub > 0
            ? Math.round((rb.prepaymentRub / rb.estimatedTotalRub) * 100)
            : shared.factoryParams.prepaymentPct || 30;
        pushBatchPayments({
          batchKey: `${m.id}::rb:${rb.periodId}`,
          isApprovedPo: false,
          periodId: rb.periodId,
          defaultFactoryName: rb.factoryName || shared.factoryParams.factoryName,
          coverageMonthsLabel: rb.coverageMonthsLabel,
          firstCoveredMonthIdx: rb.firstCoveredMonthIdx,
          endCoveredMonthIdx: rb.endCoveredMonthIdx,
          packsQty: rb.recommendedPacks,
          physicalUnitsQty: rb.physicalUnitsQty,
          batchUnitCostRub: rb.unitCostRub,
          totalBatchRub: rb.estimatedTotalRub,
          defaultPrepayPct: rbPrepayPct,
          defaultPrepayRub: rb.prepaymentRub,
          defaultBalanceRub: rb.balancePaymentRub,
          defaultOrderDateIso: rb.recommendedOrderDateIso,
          defaultArrivalDateIso: rb.requiredArrivalDateIso,
          totalLeadDays: rb.totalLeadDays,
          sizeBreakdownText: formatSizeBreakdownSummary(rb.sizeBreakdownPacks),
        });
      }
    }
  }

  // 2. Генерируем хронологические поступления от продаж WB по конкретным датам (с учётом задержки wbPayoutDelayDays)
  if (wbPayoutScheduleSpecified) {
    const freq = baseLedger.globalSettings.wbPayoutFrequency || 'twice_monthly';
    for (let m = 0; m < 12; m++) {
      const monthPayoutRub = Math.round(monthlyWbNetPayoutGeneratedByMonth[m] || 0);
      if (monthPayoutRub <= 0) continue;

      const mm = String(m + 1).padStart(2, '0');
      const tranches: { rawDateIso: string; amountRub: number; label: string }[] = [];

      if (freq === 'month_end') {
        tranches.push({
          rawDateIso: getLastDayOfMonthIso(scenarioYear, m),
          amountRub: monthPayoutRub,
          label: `Выплата WB за ${MONTHS_SHORT_RU[m]} ${scenarioYear}`,
        });
      } else if (freq === 'weekly') {
        const q1 = Math.round(monthPayoutRub * 0.22);
        const q2 = Math.round(monthPayoutRub * 0.25);
        const q3 = Math.round(monthPayoutRub * 0.26);
        const q4 = Math.max(0, monthPayoutRub - q1 - q2 - q3);
        tranches.push(
          { rawDateIso: `${scenarioYear}-${mm}-07`, amountRub: q1, label: `Выплата WB · 1-я нед. ${MONTHS_SHORT_RU[m]}` },
          { rawDateIso: `${scenarioYear}-${mm}-14`, amountRub: q2, label: `Выплата WB · 2-я нед. ${MONTHS_SHORT_RU[m]}` },
          { rawDateIso: `${scenarioYear}-${mm}-21`, amountRub: q3, label: `Выплата WB · 3-я нед. ${MONTHS_SHORT_RU[m]}` },
          { rawDateIso: getLastDayOfMonthIso(scenarioYear, m), amountRub: q4, label: `Выплата WB · 4-я нед. ${MONTHS_SHORT_RU[m]}` }
        );
      } else {
        // twice_monthly (15-е число и последний день месяца): реалистично разделяет 1–15 число (до прихода WB) и конец месяца!
        const firstHalfRub = Math.round(monthPayoutRub * 0.45);
        const secondHalfRub = Math.max(0, monthPayoutRub - firstHalfRub);
        tranches.push(
          {
            rawDateIso: `${scenarioYear}-${mm}-15`,
            amountRub: firstHalfRub,
            label: `Поступление от продаж WB (1–15 ${MONTHS_GENITIVE_SHORT_RU[m]})`,
          },
          {
            rawDateIso: getLastDayOfMonthIso(scenarioYear, m),
            amountRub: secondHalfRub,
            label: `Поступление от продаж WB (16–конец ${MONTHS_GENITIVE_SHORT_RU[m]})`,
          }
        );
      }

      tranches.forEach((tr, idx) => {
        if (tr.amountRub <= 0) return;
        const effectiveDateIso =
          wbPayoutDelayDays > 0
            ? addDaysToIsoDate(tr.rawDateIso, wbPayoutDelayDays)
            : tr.rawDateIso;

        // Если задержка WB уводит выплату за пределы анализируемого года (например Декабрь + 30 дн. -> Январь 2028),
        // в рамках 12-месячного горизонта 2027 года эти деньги ещё НЕ поступили на расчётный счёт в 2027 году!
        const parsedYr = Number(effectiveDateIso.slice(0, 4));
        if (parsedYr > scenarioYear) {
          return;
        }

        rawEvents.push({
          id: `wb-inflow-${scenarioYear}-${m}-${idx}`,
          opKey: `wb-inflow-${scenarioYear}-${m}-${idx}`,
          dateIso: effectiveDateIso,
          calendarMonthIdx: resolveCalendarMonthIdxForYear(effectiveDateIso, scenarioYear),
          type: 'wb_inflow',
          status: 'Запланировано',
          isFactual: false,
          isApprovedLocked: false,
          hasManualOverride: false,
          scenarioScopeKey: activeScopeKey,
          brandCode: isGroupAllBrands ? 'ALL' : scopedInputs[0]?.brandCode || 'BORNERS',
          brandTitle: isGroupAllBrands ? 'BORNERS GROUP' : scopedInputs[0]?.brandTitle || 'BORNERS',
          title:
            wbPayoutDelayDays > 0
              ? `${tr.label} (лаг +${wbPayoutDelayDays} дн.)`
              : tr.label,
          purposeShort: `Выручка WB на р/с (${MONTHS_SHORT_RU[m]})`,
          amountRub: tr.amountRub,
          inflowRub: tr.amountRub,
          outflowRub: 0,
          userCapitalInjectionRub: 0,
          reinvestedFromSalesRub: 0,
          coveredByOwnCapitalOnAccountRub: 0,
          needToInvestRub: 0,
          closingTotalCashRub: 0,
          closingFreeCashRub: 0,
        });
      });
    }
  }

  // 3. Подключаем дополнительные собственные инвестиции и прочие расходы/поступления:
  //    - общие утверждённые/фактические (sharedCommitted)
  //    - сценарные плановые (для активных scopeKey)
  const activeScopeKeys = new Set<string>(scopedInputs.map((s) => s.scopeKey));
  activeScopeKeys.add(activeScopeKey);
  if (isGroupAllBrands) activeScopeKeys.add(groupScopeKeyForYear);

  const isDateWithinYearHorizon = (dateIso: string, isSharedRecord: boolean): boolean => {
    if (!isSharedRecord) return true;
    const m = (dateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return true;
    const yr = Number(m[1]);
    const mo = Number(m[2]);
    // В горизонт года Y входят стартовые Q1-операции с сентября (Y-1) по 31 декабря Y включительно
    if (yr === scenarioYear) return true;
    if (yr === scenarioYear - 1 && mo >= 9) return true;
    return false;
  };

  const seenInjectionIds = new Set<string>();
  const pushCapitalInjection = (inj: CapitalInjectionRecord, scopeKey: string, isShared: boolean) => {
    if (!inj || (inj.amountRub || 0) <= 0 || seenInjectionIds.has(inj.id)) return;
    if (!isDateWithinYearHorizon(inj.dateIso, isShared)) return;
    if (
      !isGroupAllBrands &&
      inj.brandCode &&
      inj.brandCode !== 'ALL' &&
      inj.brandCode !== normFilter
    ) {
      return;
    }
    seenInjectionIds.add(inj.id);
    const locked = isShared || inj.status === 'Утверждено' || inj.status === 'Оплачено';
    if (!locked) manualOverridesCount += 1;
    else lockedOperationsCount += 1;

    const commentSuffix = inj.sourceComment?.trim() ? ` · ${inj.sourceComment.trim()}` : '';
    rawEvents.push({
      id: `cap-inj-${inj.id}`,
      opKey: `cap-inj::${inj.id}`,
      dateIso: inj.dateIso,
      calendarMonthIdx: resolveCalendarMonthIdxForYear(inj.dateIso, scenarioYear),
      type: 'capital_injection',
      status: inj.status,
      isFactual: inj.status === 'Оплачено',
      isApprovedLocked: locked,
      hasManualOverride: !locked,
      scenarioScopeKey: scopeKey,
      brandCode: inj.brandCode || 'ALL',
      brandTitle: inj.brandCode && inj.brandCode !== 'ALL' ? inj.brandCode : 'Капитал',
      title: `${inj.title || 'Вложение собственного капитала'}${commentSuffix}`,
      purposeShort: inj.title || 'Собственная инвестиция',
      amountRub: Math.round(inj.amountRub),
      inflowRub: 0,
      outflowRub: 0,
      userCapitalInjectionRub: Math.round(inj.amountRub),
      reinvestedFromSalesRub: 0,
      coveredByOwnCapitalOnAccountRub: 0,
      needToInvestRub: 0,
      closingTotalCashRub: 0,
      closingFreeCashRub: 0,
    });
  };

  for (const inj of baseLedger.sharedCommitted.committedCapitalInjections) {
    pushCapitalInjection(inj, 'SHARED', true);
  }
  for (const sk of activeScopeKeys) {
    const slot = baseLedger.scenarioPlans[sk];
    if (!slot) continue;
    for (const inj of slot.plannedCapitalInjections || []) {
      pushCapitalInjection(inj, sk, false);
    }
  }

  const seenOtherOpIds = new Set<string>();
  const pushCustomCashOp = (
    op: CustomCashOperationRecord,
    scopeKey: string,
    isShared: boolean
  ) => {
    if (!op || (op.amountRub || 0) <= 0 || seenOtherOpIds.has(op.id)) return;
    if (!isDateWithinYearHorizon(op.dateIso, isShared)) return;
    if (
      !isGroupAllBrands &&
      op.brandCode &&
      op.brandCode !== 'ALL' &&
      op.brandCode !== normFilter
    ) {
      return;
    }
    seenOtherOpIds.add(op.id);
    const locked = isShared || op.status === 'Утверждено' || op.status === 'Оплачено';
    if (!locked) manualOverridesCount += 1;
    else lockedOperationsCount += 1;

    if (op.factoryName) suppliersSet.add(op.factoryName);
    const linkedBatch = op.linkedBatchKey
      ? batchesCatalog.find((b) => b.batchKey === op.linkedBatchKey)
      : undefined;

    const isFactoryExtra =
      op.kind === 'expense' && (op.category === 'factory_extra' || Boolean(linkedBatch));
    const eventType: ChronologicalCashEvent['type'] =
      op.kind === 'inflow'
        ? 'other_inflow'
        : isFactoryExtra
        ? 'factory_payment'
        : 'other_expense';

    const amt = Math.round(op.amountRub);
    if (isFactoryExtra) {
      if (locked) approvedProcurementCostRub += amt;
      else plannedProcurementCostRub += amt;
    }

    rawEvents.push({
      id: `custom-op-${op.id}`,
      opKey: `custom-op::${op.id}`,
      dateIso: op.dateIso,
      calendarMonthIdx: resolveCalendarMonthIdxForYear(op.dateIso, scenarioYear),
      type: eventType,
      paymentRole: isFactoryExtra ? 'extra' : undefined,
      status: op.status,
      isFactual: op.status === 'Оплачено',
      isApprovedLocked: locked,
      hasManualOverride: !locked,
      scenarioScopeKey: scopeKey,
      brandCode: op.brandCode || 'ALL',
      brandTitle:
        op.brandCode && op.brandCode !== 'ALL'
          ? BRAND_UNIT_CONFIGS[op.brandCode]?.displayCode || op.brandCode
          : 'Операция',
      title: op.title,
      purposeShort: op.title,
      factoryName: op.factoryName || linkedBatch?.factoryName,
      batchKey: op.linkedBatchKey,
      batchDetails: linkedBatch,
      amountRub: amt,
      inflowRub: op.kind === 'inflow' ? amt : 0,
      outflowRub: op.kind === 'expense' ? amt : 0,
      userCapitalInjectionRub: 0,
      reinvestedFromSalesRub: 0,
      coveredByOwnCapitalOnAccountRub: 0,
      needToInvestRub: 0,
      closingTotalCashRub: 0,
      closingFreeCashRub: 0,
    });
  };

  for (const op of baseLedger.sharedCommitted.committedOtherOperations) {
    pushCustomCashOp(op, 'SHARED', true);
  }
  for (const sk of activeScopeKeys) {
    const slot = baseLedger.scenarioPlans[sk];
    if (!slot) continue;
    for (const op of slot.plannedOtherOperations || []) {
      pushCustomCashOp(op, sk, false);
    }
  }

  // 4. СТРОГАЯ ХРОНОЛОГИЧЕСКАЯ СОРТИРОВКА ПО ДАТАМ (Раздел 6 ТЗ: учитываем только деньги, доступные к конкретной дате!)
  // Внутри одной даты сначала учитываются вложения капитала и приходы денег, затем обязательные расходы, затем платежи фабрикам.
  const eventTypePriority: Record<ChronologicalCashEvent['type'], number> = {
    capital_injection: 1,
    wb_inflow: 2,
    other_inflow: 3,
    other_expense: 4,
    factory_payment: 5,
  };

  const sortedEvents = [...rawEvents].sort((a, b) => {
    if (a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? -1 : 1;
    const pa = eventTypePriority[a.type] || 9;
    const pb = eventTypePriority[b.type] || 9;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });

  // 5А. ЧИСТЫЙ РАСЧЁТНЫЙ ПРОХОД (без стартового кэша и без собственных вложений пользователя — Раздел 5 ТЗ v14):
  // Собственные вложения НЕ должны искусственно уменьшать расчётную потребность в капитале!
  let pureCashOnAccountRub = 0;
  let pureSalesPoolRub = 0;
  let totalPureCalculatedNeedRub = 0;
  const pureNeedByDateMap = new Map<string, number>();

  for (const ev of sortedEvents) {
    if (ev.type === 'capital_injection') continue;
    if (ev.type === 'wb_inflow' || ev.type === 'other_inflow') {
      pureCashOnAccountRub += ev.inflowRub;
      if (ev.type === 'wb_inflow') {
        pureSalesPoolRub += ev.inflowRub;
      }
      continue;
    }
    if (ev.type === 'other_expense') {
      const deductSales = Math.min(pureSalesPoolRub, ev.outflowRub);
      pureSalesPoolRub = Math.max(0, pureSalesPoolRub - deductSales);
      pureCashOnAccountRub -= ev.outflowRub;
      if (pureCashOnAccountRub < minCashReserveRub) {
        const def = minCashReserveRub - pureCashOnAccountRub;
        totalPureCalculatedNeedRub += def;
        pureCashOnAccountRub += def;
        pureNeedByDateMap.set(ev.dateIso, (pureNeedByDateMap.get(ev.dateIso) || 0) + def);
      }
      continue;
    }
    // factory_payment
    const payRub = ev.outflowRub;
    const pureFreeAboveReserve = Math.max(0, pureCashOnAccountRub - minCashReserveRub);
    const pureAvailSales = Math.min(pureFreeAboveReserve, Math.max(0, pureSalesPoolRub));
    const pureReinv = wbPayoutScheduleSpecified ? Math.min(payRub, pureAvailSales) : 0;
    pureSalesPoolRub = Math.max(0, pureSalesPoolRub - pureReinv);
    const pureRem = payRub - pureReinv;
    const pureAvailOwn = Math.max(0, pureFreeAboveReserve - pureReinv);
    const pureCovOwn = Math.min(pureRem, pureAvailOwn);
    const pureReserveGap = Math.max(0, minCashReserveRub - pureCashOnAccountRub);
    const pureNeedHere = Math.max(0, pureRem - pureCovOwn) + pureReserveGap;

    totalPureCalculatedNeedRub += pureNeedHere;
    pureCashOnAccountRub = pureCashOnAccountRub - payRub + pureNeedHere;
    if (pureNeedHere > 0) {
      pureNeedByDateMap.set(
        ev.dateIso,
        (pureNeedByDateMap.get(ev.dateIso) || 0) + pureNeedHere
      );
    }
  }

  // 5Б. ПОШАГОВЫЙ ХРОНОЛОГИЧЕСКИЙ АВТОМАТ С УЧЁТОМ ВНЕСЁННЫХ И ЗАПЛАНИРОВАННЫХ СОБСТВЕННЫХ ДЕНЕГ
  let totalCashOnAccountRub = initialCashRub;
  let salesGeneratedPoolRub = 0;

  let rawCashFromZeroRub = 0;
  let minRawCashFromZeroRub = 0;
  let peakShortageDateIso: string | null = null;
  let peakShortageMonthIdx = 0;

  let totalReinvestedFromSalesRub = 0;
  let totalAdditionalNeedToInvestRub = 0;
  let totalWbCashInflowRub = 0;
  let totalOtherExpensesRub = 0;
  let factualInjectionsOnlyRub = 0;
  let approvedInjectionsOnlyRub = 0;
  let alreadyCommittedInjectionsRub = 0;
  let plannedUserInjectionsRub = 0;

  const batchFundingStats = new Map<
    string,
    { totalPaidRub: number; reinvestedRub: number }
  >();

  for (const ev of sortedEvents) {
    if (ev.type === 'capital_injection') {
      totalCashOnAccountRub += ev.userCapitalInjectionRub;
      if (ev.status === 'Оплачено') {
        factualInjectionsOnlyRub += ev.userCapitalInjectionRub;
        alreadyCommittedInjectionsRub += ev.userCapitalInjectionRub;
      } else if (ev.status === 'Утверждено') {
        approvedInjectionsOnlyRub += ev.userCapitalInjectionRub;
        alreadyCommittedInjectionsRub += ev.userCapitalInjectionRub;
      } else {
        plannedUserInjectionsRub += ev.userCapitalInjectionRub;
      }
      ev.closingTotalCashRub = totalCashOnAccountRub;
      ev.closingFreeCashRub = Math.max(0, totalCashOnAccountRub - minCashReserveRub);
      continue;
    }

    if (ev.type === 'wb_inflow' || ev.type === 'other_inflow') {
      totalCashOnAccountRub += ev.inflowRub;
      rawCashFromZeroRub += ev.inflowRub;
      if (ev.type === 'wb_inflow') {
        salesGeneratedPoolRub += ev.inflowRub;
        totalWbCashInflowRub += ev.inflowRub;
      }
      ev.closingTotalCashRub = totalCashOnAccountRub;
      ev.closingFreeCashRub = Math.max(0, totalCashOnAccountRub - minCashReserveRub);
      continue;
    }

    if (ev.type === 'other_expense') {
      totalOtherExpensesRub += ev.outflowRub;
      rawCashFromZeroRub -= ev.outflowRub;
      if (rawCashFromZeroRub - minCashReserveRub < minRawCashFromZeroRub) {
        minRawCashFromZeroRub = rawCashFromZeroRub - minCashReserveRub;
        peakShortageDateIso = ev.dateIso;
        peakShortageMonthIdx = ev.calendarMonthIdx;
      }

      const deductFromSales = Math.min(salesGeneratedPoolRub, ev.outflowRub);
      salesGeneratedPoolRub = Math.max(0, salesGeneratedPoolRub - deductFromSales);
      totalCashOnAccountRub -= ev.outflowRub;

      if (totalCashOnAccountRub < minCashReserveRub) {
        const deficit = minCashReserveRub - totalCashOnAccountRub;
        ev.needToInvestRub = deficit;
        totalAdditionalNeedToInvestRub += deficit;
        totalCashOnAccountRub += deficit;
      }
      ev.closingTotalCashRub = totalCashOnAccountRub;
      ev.closingFreeCashRub = Math.max(0, totalCashOnAccountRub - minCashReserveRub);
      continue;
    }

    // ev.type === 'factory_payment'
    const paymentRub = ev.outflowRub;
    rawCashFromZeroRub -= paymentRub;
    if (rawCashFromZeroRub - minCashReserveRub < minRawCashFromZeroRub) {
      minRawCashFromZeroRub = rawCashFromZeroRub - minCashReserveRub;
      peakShortageDateIso = ev.dateIso;
      peakShortageMonthIdx = ev.calendarMonthIdx;
    }

    const freeCashAboveReserve = Math.max(0, totalCashOnAccountRub - minCashReserveRub);
    const availableSalesCash = Math.min(
      freeCashAboveReserve,
      Math.max(0, salesGeneratedPoolRub)
    );

    const reinvestedHereRub = wbPayoutScheduleSpecified
      ? Math.min(paymentRub, availableSalesCash)
      : 0;
    salesGeneratedPoolRub = Math.max(0, salesGeneratedPoolRub - reinvestedHereRub);
    totalReinvestedFromSalesRub += reinvestedHereRub;

    const remAfterReinvest = paymentRub - reinvestedHereRub;
    const availableOwnFreeCash = Math.max(0, freeCashAboveReserve - reinvestedHereRub);
    const coveredByOwnOnAccount = Math.min(remAfterReinvest, availableOwnFreeCash);

    const reserveGapBefore = Math.max(0, minCashReserveRub - totalCashOnAccountRub);
    const additionalOwnNeededHere =
      Math.max(0, remAfterReinvest - coveredByOwnOnAccount) + reserveGapBefore;

    ev.reinvestedFromSalesRub = reinvestedHereRub;
    ev.coveredByOwnCapitalOnAccountRub = coveredByOwnOnAccount;
    ev.needToInvestRub = additionalOwnNeededHere;

    totalAdditionalNeedToInvestRub += additionalOwnNeededHere;
    totalCashOnAccountRub = totalCashOnAccountRub - paymentRub + additionalOwnNeededHere;
    ev.closingTotalCashRub = totalCashOnAccountRub;
    ev.closingFreeCashRub = Math.max(0, totalCashOnAccountRub - minCashReserveRub);

    if (ev.batchKey) {
      const prevStat = batchFundingStats.get(ev.batchKey) || {
        totalPaidRub: 0,
        reinvestedRub: 0,
      };
      prevStat.totalPaidRub += paymentRub;
      prevStat.reinvestedRub += reinvestedHereRub;
      batchFundingStats.set(ev.batchKey, prevStat);
    }
  }

  let batchesFundedBySalesCount = 0;
  let batchesFullyFundedBySalesCount = 0;
  for (const [, st] of batchFundingStats.entries()) {
    if (st.reinvestedRub > 0) {
      batchesFundedBySalesCount += 1;
      if (st.totalPaidRub > 0 && st.reinvestedRub >= st.totalPaidRub - 1) {
        batchesFullyFundedBySalesCount += 1;
      }
    }
  }

  const totalProcurementCostRub = approvedProcurementCostRub + plannedProcurementCostRub;
  const factualOwnMoneyContributedRub = initialCashRub + factualInjectionsOnlyRub;
  const approvedOwnMoneyInjectionsRub = approvedInjectionsOnlyRub;
  const alreadyInvestedOwnMoneyRub = initialCashRub + alreadyCommittedInjectionsRub;
  const totalOwnMoneyConfiguredRub = alreadyInvestedOwnMoneyRub + plannedUserInjectionsRub;

  const rawGrossPeakRub = Math.max(
    Math.abs(Math.min(0, minRawCashFromZeroRub)),
    totalPureCalculatedNeedRub
  );
  const grossOwnCapitalPeakFromZeroRub = wbPayoutScheduleSpecified ? rawGrossPeakRub : null;
  const calculatedCapitalNeedRub = grossOwnCapitalPeakFromZeroRub;

  const maxOwnMoneyNeededRub = wbPayoutScheduleSpecified
    ? totalAdditionalNeedToInvestRub
    : null;
  const remainingOwnMoneyNeededRub = maxOwnMoneyNeededRub;

  const reinvestedSharePct =
    wbPayoutScheduleSpecified && totalProcurementCostRub > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((totalReinvestedFromSalesRub / totalProcurementCostRub) * 100))
        )
      : 0;

  // 6. ГРУППИРУЕМ В 12-МЕСЯЧНЫЙ КАЛЕНДАРЬ С РАСКРЫТИЕМ ПО КОНКРЕТНЫМ ДАТАМ (Раздел 3 и 8 ТЗ)
  const monthlyCalendarRows: MonthlyInvestmentCalendarRow[] = [];
  let runningCarryFreeCash = Math.max(0, initialCashRub - minCashReserveRub);
  let runningCarryTotalCash = initialCashRub;
  let runningSimRawForChart = initialCashRub;

  for (let m = 0; m < 12; m++) {
    const monthEvents = sortedEvents.filter((e) => e.calendarMonthIdx === m);

    let inflowsRub = 0;
    let wbInflowsRub = 0;
    let otherInflowsRub = 0;
    let outflowsRub = 0;
    let factoryOutflowsRub = 0;
    let otherExpensesRub = 0;
    let reinvestedRub = 0;
    let needToInvestRub = 0;
    let userCapitalInjectionsRub = 0;
    let hasManualOverrides = false;

    let minIntraChartCash = runningSimRawForChart;
    for (const ev of monthEvents) {
      inflowsRub += ev.inflowRub;
      if (ev.type === 'wb_inflow') wbInflowsRub += ev.inflowRub;
      if (ev.type === 'other_inflow') otherInflowsRub += ev.inflowRub;
      outflowsRub += ev.outflowRub;
      if (ev.type === 'factory_payment') factoryOutflowsRub += ev.outflowRub;
      if (ev.type === 'other_expense') otherExpensesRub += ev.outflowRub;
      reinvestedRub += ev.reinvestedFromSalesRub;
      needToInvestRub += ev.needToInvestRub;
      userCapitalInjectionsRub += ev.userCapitalInjectionRub;
      if (ev.hasManualOverride) hasManualOverrides = true;

      runningSimRawForChart += ev.userCapitalInjectionRub + ev.inflowRub - ev.outflowRub;
      if (runningSimRawForChart < minIntraChartCash) {
        minIntraChartCash = runningSimRawForChart;
      }
      runningCarryFreeCash = ev.closingFreeCashRub;
      runningCarryTotalCash = ev.closingTotalCashRub;
    }

    const byDateMap = new Map<string, ChronologicalCashEvent[]>();
    for (const ev of monthEvents) {
      const list = byDateMap.get(ev.dateIso) || [];
      list.push(ev);
      byDateMap.set(ev.dateIso, list);
    }

    const dateGroups = Array.from(byDateMap.entries())
      .sort(([d1], [d2]) => (d1 < d2 ? -1 : d1 > d2 ? 1 : 0))
      .map(([dateIso, evs]) => {
        const lastEv = evs[evs.length - 1];
        return {
          dateIso,
          dateHumanRu: formatIsoDateHumanRu(dateIso),
          inflowsRub: evs.reduce((s, x) => s + x.inflowRub, 0),
          outflowsRub: evs.reduce((s, x) => s + x.outflowRub, 0),
          reinvestedRub: evs.reduce((s, x) => s + x.reinvestedFromSalesRub, 0),
          needToInvestRub: evs.reduce((s, x) => s + x.needToInvestRub, 0),
          userCapitalInjectionsRub: evs.reduce((s, x) => s + x.userCapitalInjectionRub, 0),
          endingFreeCashRub: lastEv ? lastEv.closingFreeCashRub : runningCarryFreeCash,
          events: evs,
        };
      });

    const hasSupplyDeficit = monthEvents.some(
      (e) => Boolean(e.batchDetails?.hasArrivalShiftDeficit)
    );

    // Раздел 8 ТЗ v14: «Свободные деньги бизнеса» по датированным операциям с учётом резерва:
    // ниже нуля, если в месяце требуется дополнительное финансирование; выше нуля, когда деньги доступны сверх резерва.
    const businessFreeCashRub =
      needToInvestRub > 0 ? -needToInvestRub : runningCarryFreeCash;

    monthlyCalendarRows.push({
      monthIdx: m,
      periodLabel: `${MONTHS_FULL_RU[m]} ${scenarioYear}`,
      shortMonthLabel: MONTHS_SHORT_RU[m],
      inflowsRub,
      wbInflowsRub,
      otherInflowsRub,
      outflowsRub,
      factoryOutflowsRub,
      otherExpensesRub,
      reinvestedRub,
      needToInvestRub,
      userCapitalInjectionsRub,
      endingFreeCashRub: runningCarryFreeCash,
      endingTotalCashRub: runningCarryTotalCash,
      intraMonthMinRawBalanceRub: minIntraChartCash,
      businessFreeCashRub,
      hasManualOverrides,
      hasCashShortage: needToInvestRub > 0,
      hasSupplyDeficit,
      events: monthEvents,
      dateGroups,
    });
  }

  // 7. Ближайший неоплаченный платёж
  const unpaidPaymentEvents = sortedEvents.filter(
    (e) =>
      (e.type === 'factory_payment' || e.type === 'other_expense') &&
      e.outflowRub > 0 &&
      e.status !== 'Оплачено'
  );
  const nearestEv = unpaidPaymentEvents[0] || null;
  const nextUpcomingPayment = nearestEv
    ? {
        opKey: nearestEv.opKey,
        dateIso: nearestEv.dateIso,
        dateDotRu: formatIsoDateDotRu(nearestEv.dateIso),
        dateHumanRu: formatIsoDateHumanRu(nearestEv.dateIso),
        amountRub: nearestEv.outflowRub,
        purposeLabel: nearestEv.purposeShort,
        factoryName: nearestEv.factoryName || 'Поставщик',
        modelId: nearestEv.batchDetails?.modelId,
        modelCode: nearestEv.batchDetails?.modelCode,
        batchKey: nearestEv.batchKey,
        status: nearestEv.status,
      }
    : null;

  // Список конкретных дат непокрытой потребности (для обратной совместимости с тестами v13)
  const injectionDatesMap = new Map<
    string,
    { amountRub: number; purposes: string[] }
  >();
  for (const ev of sortedEvents) {
    if (ev.needToInvestRub > 0) {
      const cur = injectionDatesMap.get(ev.dateIso) || { amountRub: 0, purposes: [] };
      cur.amountRub += ev.needToInvestRub;
      if (cur.purposes.length < 3) {
        cur.purposes.push(ev.purposeShort);
      }
      injectionDatesMap.set(ev.dateIso, cur);
    }
  }
  const datesRequiringOwnInjection = Array.from(injectionDatesMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dateIso, info]) => ({
      dateIso,
      dateDotRu: formatIsoDateDotRu(dateIso),
      dateHumanRu: formatIsoDateHumanRu(dateIso),
      amountRub: info.amountRub,
      purposeSummary: info.purposes.join(', '),
    }));

  // 8. Раздел 4 ТЗ v14: Главный рабочий блок «Когда и сколько вложить» (со всеми 7 полями платежей фабрикам!)
  const balanceEventByBatchKey = new Map<
    string,
    { dateIso: string; amountRub: number }
  >();
  for (const ev of sortedEvents) {
    if (ev.type === 'factory_payment' && ev.batchKey && ev.paymentRole === 'balance') {
      balanceEventByBatchKey.set(ev.batchKey, {
        dateIso: ev.dateIso,
        amountRub: ev.outflowRub,
      });
    }
  }

  const candidateNeedDates = new Set<string>([
    ...Array.from(pureNeedByDateMap.keys()),
    ...Array.from(injectionDatesMap.keys()),
  ]);

  const whenAndHowMuchRows: WhenAndHowMuchRow[] = Array.from(candidateNeedDates)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((dateIso) => {
      const dateEvents = sortedEvents.filter((e) => e.dateIso === dateIso);
      const calcNeed = Math.round(pureNeedByDateMap.get(dateIso) || 0);
      const remNeed = Math.round(
        dateEvents.reduce((s, e) => s + (e.needToInvestRub || 0), 0)
      );
      const effectiveCalcNeed = Math.max(calcNeed, remNeed);
      const coveredByOwn = Math.max(0, effectiveCalcNeed - remNeed);

      const factoryEventsOnDate = dateEvents.filter((e) => e.type === 'factory_payment');
      const otherExpensesOnDate = dateEvents.filter((e) => e.type === 'other_expense');

      const factoryPayments: WhenAndHowMuchFactoryPaymentItem[] = factoryEventsOnDate.map(
        (ev, idx) => {
          const bd = ev.batchDetails;
          const bKey = ev.batchKey || `extra-${ev.id}`;
          const balInfo = balanceEventByBatchKey.get(bKey);
          const balanceDateIso =
            balInfo?.dateIso || bd?.arrivalDateIso || ev.dateIso;
          const balanceAmountRub =
            balInfo?.amountRub ?? bd?.balancePaymentRub ?? 0;

          const stageLabel =
            ev.paymentRole === 'prepay'
              ? `Предоплата ${bd?.prepaymentPct ?? 30}%`
              : ev.paymentRole === 'balance'
              ? `Окончательный расчёт ${bd?.balancePaymentPct ?? 70}%`
              : ev.paymentRole === 'tranche'
              ? `Частичный транш ${ev.trancheIndex || idx + 1}/${ev.tranchesTotal || 2}`
              : 'Закупочный платёж';

          const batchNumberLabel = bd?.poNumber
            ? bd.poNumber
            : bd
            ? `ПАРТИЯ ${bd.periodId.toUpperCase()} · ${bd.coverageMonthsLabel}`
            : `ПЛАТЁЖ #${idx + 1}`;

          const arrivalIso = bd?.arrivalDateIso || ev.dateIso;

          return {
            opKey: ev.opKey,
            prepayOpKey: `${bKey}::prepay`,
            balanceOpKey: `${bKey}::balance`,
            balanceDateIso,
            balanceDateDotRu: formatIsoDateDotRu(balanceDateIso),
            balanceAmountRub,
            batchKey: bKey,
            modelId: bd?.modelId || '',
            modelCode: bd?.modelCode || '',
            productTitle: bd ? `${bd.modelCode} — ${bd.modelTitle}` : ev.title,
            batchNumber: batchNumberLabel,
            factoryName: ev.factoryName || bd?.factoryName || 'Фабрика',
            paymentDateIso: ev.dateIso,
            paymentDateDotRu: formatIsoDateDotRu(ev.dateIso),
            amountRub: ev.outflowRub,
            paymentStageLabel: stageLabel,
            arrivalDateIso: arrivalIso,
            arrivalDateDotRu: formatIsoDateDotRu(arrivalIso),
            packsQty: bd?.packsQty ?? 0,
            defaultPacksQty: bd?.defaultPacksQty ?? bd?.packsQty ?? 0,
            unitLabel: bd?.primaryUnitLabel || 'ед.',
            prepaymentPct: bd?.prepaymentPct ?? 30,
            status: ev.status,
            isApprovedPo: Boolean(bd?.isApprovedPo),
            isApprovedLocked: ev.isApprovedLocked,
            hasManualOverride: ev.hasManualOverride,
            scenarioScopeKey: ev.scenarioScopeKey,
            event: ev,
          };
        }
      );

      const distinctBatches = new Set(factoryPayments.map((fp) => fp.batchKey));
      const purposeLabel =
        factoryPayments.length > 0 && otherExpensesOnDate.length > 0
          ? 'Закупочные партии и расходы'
          : factoryPayments.length > 0
          ? 'Закупочные партии'
          : 'Операционные расходы';

      return {
        dateIso,
        dateDotRu: formatIsoDateDotRu(dateIso),
        dateHumanRu: formatIsoDateHumanRu(dateIso),
        calculatedNeedRub: effectiveCalcNeed,
        coveredByOwnMoneyRub: coveredByOwn,
        remainingNeedRub: remNeed,
        isFullyCoveredByOwnMoney: remNeed <= 0 && effectiveCalcNeed > 0,
        purposeLabel,
        batchesCount: distinctBatches.size,
        factoryPayments,
        otherExpenseEvents: otherExpensesOnDate,
      };
    })
    .filter((r) => r.calculatedNeedRub > 0 || r.remainingNeedRub > 0);

  // 9. Пометка предварительности и блок «Что нужно сделать» (Раздел 7 и 11 ТЗ v14 — максимум 3 рекомендации по важности!)
  const missingCostModelsCount = missingCostModelIds.length;
  const isPreliminaryCalculation = !wbPayoutScheduleSpecified || missingCostModelsCount > 0;

  const recommendations: SystemActionRecommendation[] = [];

  if (supplyDeficitWarnings.length > 0) {
    const firstDef = supplyDeficitWarnings[0]!;
    recommendations.push({
      id: `rec-deficit-${firstDef.batchKey}`,
      priority: 1,
      severity: 'danger',
      categoryLabel: 'Риск нехватки товара',
      message: `Перенос партии ${firstDef.modelCode} создаст дефицит ${firstDef.deficitPacks.toLocaleString(
        'ru-RU'
      )} ${firstDef.unitLabel} в периоде ${firstDef.affectedMonthsLabel}.`,
      ctaLabel: 'Открыть закупку',
      actionTarget: 'open_procurement',
      modelId: firstDef.modelId,
      batchKey: firstDef.batchKey,
    });
  }

  const firstUncoveredRow = whenAndHowMuchRows.find((r) => r.remainingNeedRub > 0);
  if (wbPayoutScheduleSpecified && firstUncoveredRow) {
    recommendations.push({
      id: `rec-cash-${firstUncoveredRow.dateIso}`,
      priority: 2,
      severity: 'warning',
      categoryLabel: 'Не хватает денег',
      message: `К ${formatDayMonthGenitiveRu(
        firstUncoveredRow.dateIso
      )} необходимо подготовить ${formatMillionsCompactRu(
        firstUncoveredRow.remainingNeedRub
      )}.`,
      ctaLabel: 'Посмотреть платежи',
      actionTarget: 'focus_payment_date',
      targetDateIso: firstUncoveredRow.dateIso,
    });
  }

  if (!wbPayoutScheduleSpecified) {
    recommendations.push({
      id: 'rec-missing-wb-schedule',
      priority: 3,
      severity: 'warning',
      categoryLabel: 'Недостаточно данных',
      message:
        'Не задан срок выплат Wildberries. Расчёт инвестиций и реинвестирования предварительный.',
      ctaLabel: 'Заполнить данные',
      actionTarget: 'open_investment_settings',
    });
  } else if (missingCostModelsCount > 0) {
    recommendations.push({
      id: 'rec-missing-unit-costs',
      priority: 3,
      severity: 'warning',
      categoryLabel: 'Недостаточно данных',
      message: `У ${missingCostModelsCount} ${pluralizeModelsGenitiveRu(
        missingCostModelsCount
      )} не заполнена себестоимость. Расчёт инвестиций предварительный.`,
      ctaLabel: 'Заполнить данные',
      actionTarget: 'open_missing_cost_sku',
      modelId: missingCostModelIds[0],
    });
  }

  if (
    recommendations.length === 0 &&
    wbPayoutScheduleSpecified &&
    totalAdditionalNeedToInvestRub <= 0 &&
    nextUpcomingPayment
  ) {
    recommendations.push({
      id: 'rec-funded-ready',
      priority: 4,
      severity: 'success',
      categoryLabel: 'Финансирование обеспечено',
      message: `Собственные вложения закрывают расчётную потребность. Ближайший платёж фабрике ${formatDayMonthGenitiveRu(
        nextUpcomingPayment.dateIso
      )} на ${formatMillionsCompactRu(nextUpcomingPayment.amountRub)}.`,
      ctaLabel: 'Посмотреть платежи',
      actionTarget: 'focus_payment_date',
      targetDateIso: nextUpcomingPayment.dateIso,
    });
  }

  const top3Recommendations = recommendations
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);

  // Честные предупреждения (Раздел 6 и 8 ТЗ)
  const dataWarnings: InvestmentDataWarning[] = [];
  if (!wbPayoutScheduleSpecified) {
    dataWarnings.push({
      code: 'wb_schedule_unspecified',
      severity: 'danger',
      title: 'Срок поступления денег от Wildberries не задан',
      description:
        'Для честного расчёта реинвестирования и максимальной потребности в собственных деньгах укажите срок выплат WB (например, 0, 7, 14 или 30 дней). Система не выдумывает точную сумму без графика поступлений.',
    });
  }
  if (missingCostSkus.length > 0) {
    dataWarnings.push({
      code: 'missing_unit_costs',
      severity: 'warning',
      title: `Не заполнена закупочная себестоимость у ${missingCostSkus.length} SKU`,
      description: `Модели с планом продаж без себестоимости: ${missingCostSkus
        .slice(0, 4)
        .join(', ')}${missingCostSkus.length > 4 ? ' и др.' : ''}. Заполните себестоимость в Паспорте SKU для полного бюджета закупок.`,
    });
  }
  if (wbPayoutScheduleSpecified && totalAdditionalNeedToInvestRub > 0) {
    dataWarnings.push({
      code: 'cash_shortage',
      severity: 'warning',
      title: `Потребуется вложить собственные средства: ${(
        totalAdditionalNeedToInvestRub / 1_000_000
      )
        .toFixed(2)
        .replace('.', ',')} млн ₽`,
      description: peakShortageDateIso
        ? `Пик кассовой потребности наступает ${formatIsoDateHumanRu(
            peakShortageDateIso
          )}. Запланируйте собственные вложения по датам или скорректируйте график платежей фабрикам.`
        : 'На стартовые партии до прихода выручки WB требуются собственные вложения.',
    });
  }
  if (supplyDeficitWarnings.length > 0) {
    dataWarnings.push({
      code: 'supply_deficit',
      severity: 'danger',
      title: `Риск дефицита товара (${supplyDeficitWarnings.length} парт.)`,
      description: supplyDeficitWarnings[0].message,
    });
  }

  const totalAccrualOperatingProfitRub =
    totalGrossSalesRevenueRub - totalSoldGoodsCostRub - totalWbDeductionsRub;

  const peakShortageMonthFullRu = formatMonthYearFullRu(
    wbPayoutScheduleSpecified ? peakShortageDateIso : null,
    peakShortageMonthIdx,
    scenarioYear
  );

  return {
    scenarioYear,
    isGroupAllBrands,
    activeScopeKey,
    wbPayoutScheduleSpecified,
    wbPayoutDelayDays,
    initialCashRub,
    minCashReserveRub,
    totalProcurementCostRub,
    approvedProcurementCostRub,
    plannedProcurementCostRub,
    calculatedCapitalNeedRub,
    maxOwnMoneyNeededRub,
    grossOwnCapitalPeakFromZeroRub,
    reinvestedFromSalesRub: wbPayoutScheduleSpecified ? totalReinvestedFromSalesRub : null,
    reinvestedSharePct,
    factualOwnMoneyContributedRub,
    approvedOwnMoneyInjectionsRub,
    alreadyInvestedOwnMoneyRub,
    plannedUserInjectionsRub,
    totalOwnMoneyConfiguredRub,
    remainingOwnMoneyNeededRub,
    additionalOwnMoneyStillNeededRub: remainingOwnMoneyNeededRub,
    isPreliminaryCalculation,
    missingCostModelsCount,
    missingCostModelIds,
    nextUpcomingPayment,
    totalWbCashInflowRub,
    totalGrossSalesRevenueRub,
    totalAccrualOperatingProfitRub,
    totalOtherExpensesRub,
    batchesTotalCount: batchesCatalog.length,
    batchesFundedBySalesCount,
    batchesFullyFundedBySalesCount,
    peakShortageDateIso: wbPayoutScheduleSpecified ? peakShortageDateIso : null,
    peakShortageDateDotRu:
      wbPayoutScheduleSpecified && peakShortageDateIso
        ? formatIsoDateDotRu(peakShortageDateIso)
        : null,
    peakShortageDateHumanRu:
      wbPayoutScheduleSpecified && peakShortageDateIso
        ? formatIsoDateHumanRu(peakShortageDateIso)
        : null,
    peakShortageMonthIdx,
    peakShortageMonthLabel: MONTHS_SHORT_RU[peakShortageMonthIdx] || 'Янв',
    peakShortageMonthFullRu,
    peakShortageAmountRub: wbPayoutScheduleSpecified
      ? Math.max(0, rawGrossPeakRub - initialCashRub)
      : null,
    isAddedCapitalSufficientForSubsequentPayments:
      wbPayoutScheduleSpecified && totalAdditionalNeedToInvestRub <= 0,
    datesRequiringOwnInjection,
    whenAndHowMuchRows,
    recommendations: top3Recommendations,
    monthlyCalendarRows,
    allEvents: sortedEvents,
    batchesCatalog,
    availableSuppliers: Array.from(suppliersSet).sort((a, b) => a.localeCompare(b, 'ru')),
    supplyDeficitWarnings,
    dataWarnings,
    manualOverridesCount,
    lockedOperationsCount,
  };
}

/**
 * Формирует предварительный просмотр изменений перед нажатием «Вернуть расчёт по плану» (Раздел 5 ТЗ).
 * ВАЖНО: утверждённые («Утверждено») и оплаченные («Оплачено») операции защищены и НЕ сбрасываются!
 */
export function computeResetToAutoPlanPreview(
  schedule: ComputedInvestmentScheduleResult,
  ledgerState: InvestmentLedgerState
): ResetToAutoPlanPreview {
  const items: ResetToAutoPreviewItem[] = [];
  const groupKey = schedule.scenarioYear === 2028 ? 'GROUP:ALL@2028' : 'GROUP:ALL';
  const relevantScopes = schedule.isGroupAllBrands
    ? Object.keys(ledgerState.scenarioPlans).filter((k) =>
        schedule.scenarioYear === 2028 ? k.endsWith('@2028') : !k.endsWith('@2028')
      )
    : Array.from(new Set([schedule.activeScopeKey, groupKey]));

  for (const sk of relevantScopes) {
    const plan = ledgerState.scenarioPlans[sk];
    if (!plan) continue;

    for (const [opKey, ovr] of Object.entries(plan.paymentOverrides || {})) {
      const matchingEv = schedule.allEvents.find((e) => e.opKey === opKey);
      if (matchingEv?.isApprovedLocked) continue;

      const curParts: string[] = [];
      if (ovr.splitTranches && ovr.splitTranches.length > 0) {
        curParts.push(`Разбит на ${ovr.splitTranches.length} транша(ей)`);
      } else {
        if (ovr.customDateIso) curParts.push(`Дата: ${formatIsoDateHumanRu(ovr.customDateIso)}`);
        if (ovr.customAmountRub !== undefined) {
          curParts.push(`Сумма: ${ovr.customAmountRub.toLocaleString('ru-RU')} ₽`);
        }
      }
      if (ovr.customFactoryName) curParts.push(`Поставщик: ${ovr.customFactoryName}`);

      const autoParts: string[] = [];
      if (matchingEv?.autoDateIso) {
        autoParts.push(`Дата: ${formatIsoDateHumanRu(matchingEv.autoDateIso)}`);
      }
      if (matchingEv?.autoAmountRub !== undefined) {
        autoParts.push(`Сумма: ${matchingEv.autoAmountRub.toLocaleString('ru-RU')} ₽`);
      }

      items.push({
        key: `pay:${sk}:${opKey}`,
        scenarioScopeKey: sk,
        title: matchingEv?.purposeShort || opKey,
        currentSummary: curParts.join(' · ') || 'Ручная правка платежа',
        autoPlanSummary: autoParts.join(' · ') || 'Автоматический расчёт по партии',
      });
    }

    for (const [batchKey, bOvr] of Object.entries(plan.batchOverrides || {})) {
      const batch = schedule.batchesCatalog.find((b) => b.batchKey === batchKey);
      if (batch?.isApprovedPo) continue;
      const curParts: string[] = [];
      if (bOvr.customPacksQty !== undefined) {
        curParts.push(
          `Объём: ${bOvr.customPacksQty.toLocaleString('ru-RU')} ${batch?.primaryUnitLabel || 'ед.'}`
        );
      }
      if (bOvr.customPrepaymentPct !== undefined) {
        curParts.push(`Условия: ${bOvr.customPrepaymentPct}/${100 - bOvr.customPrepaymentPct}%`);
      }
      if (bOvr.customArrivalDateIso) {
        curParts.push(`Поставка: ${formatIsoDateHumanRu(bOvr.customArrivalDateIso)}`);
      }
      if (bOvr.customFactoryName) {
        curParts.push(`Фабрика: ${bOvr.customFactoryName}`);
      }
      items.push({
        key: `batch:${sk}:${batchKey}`,
        scenarioScopeKey: sk,
        title: batch ? `Партия ${batch.modelCode} (${batch.coverageMonthsLabel})` : batchKey,
        currentSummary: curParts.join(' · ') || 'Ручные условия партии',
        autoPlanSummary: batch
          ? `Объём: ${batch.defaultPacksQty.toLocaleString('ru-RU')} ${
              batch.primaryUnitLabel
            } · Поставка: ${formatIsoDateHumanRu(batch.originalArrivalDateIso)}`
          : 'Стандартные условия фабрики',
      });
    }

    for (const inj of plan.plannedCapitalInjections || []) {
      items.push({
        key: `inj:${sk}:${inj.id}`,
        scenarioScopeKey: sk,
        title: `Плановая инвестиция: ${inj.title}`,
        currentSummary: `${formatIsoDateHumanRu(inj.dateIso)} · +${inj.amountRub.toLocaleString('ru-RU')} ₽`,
        autoPlanSummary: 'Будет удалена (автоматический расчёт потребности)',
      });
    }

    for (const op of plan.plannedOtherOperations || []) {
      items.push({
        key: `op:${sk}:${op.id}`,
        scenarioScopeKey: sk,
        title: `Плановая операция: ${op.title}`,
        currentSummary: `${formatIsoDateHumanRu(op.dateIso)} · ${op.amountRub.toLocaleString('ru-RU')} ₽`,
        autoPlanSummary: 'Будет удалена из плановых операций сценария',
      });
    }
  }

  return {
    willResetCount: items.length,
    preservedLockedCount: schedule.lockedOperationsCount,
    items,
  };
}

export function applyResetScenarioToAutoPlan(
  ledgerState: InvestmentLedgerState,
  schedule: ComputedInvestmentScheduleResult,
  author = 'Владелец'
): InvestmentLedgerState {
  const nextPlans = { ...ledgerState.scenarioPlans };
  const groupKey = schedule.scenarioYear === 2028 ? 'GROUP:ALL@2028' : 'GROUP:ALL';
  const scopesToClear = schedule.isGroupAllBrands
    ? Object.keys(nextPlans).filter((k) =>
        schedule.scenarioYear === 2028 ? k.endsWith('@2028') : !k.endsWith('@2028')
      )
    : Array.from(new Set([schedule.activeScopeKey, groupKey]));

  let clearedCount = 0;
  for (const sk of scopesToClear) {
    if (nextPlans[sk]) {
      clearedCount +=
        Object.keys(nextPlans[sk].paymentOverrides || {}).length +
        Object.keys(nextPlans[sk].batchOverrides || {}).length +
        (nextPlans[sk].plannedCapitalInjections?.length || 0) +
        (nextPlans[sk].plannedOtherOperations?.length || 0);
      delete nextPlans[sk];
    }
  }

  return {
    ...ledgerState,
    scenarioPlans: nextPlans,
    auditHistory:
      clearedCount > 0
        ? appendLedgerAudit(ledgerState, {
            author,
            scenarioScopeKey: schedule.activeScopeKey,
            operationTitle: 'Возврат расчёта по автоматическому плану',
            actionType: 'reset_to_auto',
            beforeValue: `Ручных корректировок: ${clearedCount}`,
            afterValue: `Автоматический план (утверждённые и оплаченные сохранены: ${schedule.lockedOperationsCount})`,
          })
        : ledgerState.auditHistory,
  };
}

/**
 * Раздел 9 ТЗ v14: «Сравнить с исходным планом» — показывает, насколько ручные корректировки
 * пользователя повлияли на потребность в деньгах, реинвестирование и обеспеченность товара.
 */
export function computePlanComparisonWithAutoBaseline(
  params: ComputeInvestmentScheduleParams,
  currentSchedule?: ComputedInvestmentScheduleResult
): PlanComparisonWithBaseline {
  const current = currentSchedule || computeInvestmentSchedule(params);
  const srcLedger = params.ledgerState
    ? normalizeInvestmentLedgerState(params.ledgerState)
    : loadInvestmentLedgerState();

  const autoBaselineLedger: InvestmentLedgerState = {
    ...srcLedger,
    scenarioPlans: {},
  };

  const autoBaseline = computeInvestmentSchedule({
    ...params,
    ledgerState: autoBaselineLedger,
  });

  const autoDeficitPacks = autoBaseline.supplyDeficitWarnings.reduce(
    (s, w) => s + w.deficitPacks,
    0
  );
  const currentDeficitPacks = current.supplyDeficitWarnings.reduce(
    (s, w) => s + w.deficitPacks,
    0
  );
  const deltaDeficitPacks = currentDeficitPacks - autoDeficitPacks;

  const deltaProcurementRub =
    current.totalProcurementCostRub - autoBaseline.totalProcurementCostRub;
  const deltaCalculatedNeedRub =
    current.calculatedCapitalNeedRub !== null && autoBaseline.calculatedCapitalNeedRub !== null
      ? current.calculatedCapitalNeedRub - autoBaseline.calculatedCapitalNeedRub
      : null;
  const deltaRemainingNeedRub =
    current.remainingOwnMoneyNeededRub !== null && autoBaseline.remainingOwnMoneyNeededRub !== null
      ? current.remainingOwnMoneyNeededRub - autoBaseline.remainingOwnMoneyNeededRub
      : null;
  const deltaReinvestedRub =
    current.reinvestedFromSalesRub !== null && autoBaseline.reinvestedFromSalesRub !== null
      ? current.reinvestedFromSalesRub - autoBaseline.reinvestedFromSalesRub
      : null;

  const hasDifferences =
    deltaProcurementRub !== 0 ||
    (deltaCalculatedNeedRub !== null && deltaCalculatedNeedRub !== 0) ||
    (deltaRemainingNeedRub !== null && deltaRemainingNeedRub !== 0) ||
    (deltaReinvestedRub !== null && deltaReinvestedRub !== 0) ||
    deltaDeficitPacks !== 0 ||
    current.manualOverridesCount > 0;

  let summaryVerdictRu = 'Текущий расчёт полностью совпадает с автоматическим исходным планом.';
  if (hasDifferences) {
    const parts: string[] = [];
    if (deltaCalculatedNeedRub !== null && deltaCalculatedNeedRub !== 0) {
      parts.push(
        deltaCalculatedNeedRub < 0
          ? `расчётная потребность в капитале снизилась на ${formatMillionsCompactRu(
              Math.abs(deltaCalculatedNeedRub)
            )}`
          : `расчётная потребность в капитале выросла на ${formatMillionsCompactRu(
              deltaCalculatedNeedRub
            )}`
      );
    }
    if (
      deltaRemainingNeedRub !== null &&
      deltaRemainingNeedRub !== deltaCalculatedNeedRub &&
      deltaRemainingNeedRub !== 0
    ) {
      parts.push(
        deltaRemainingNeedRub < 0
          ? `остаток к финансированию уменьшился на ${formatMillionsCompactRu(
              Math.abs(deltaRemainingNeedRub)
            )}`
          : `остаток к финансированию увеличился на ${formatMillionsCompactRu(
              deltaRemainingNeedRub
            )}`
      );
    }
    if (deltaDeficitPacks > 0) {
      parts.push(
        `возник риск нехватки ${deltaDeficitPacks.toLocaleString('ru-RU')} ед. товара`
      );
    } else if (currentDeficitPacks === 0) {
      parts.push('обеспеченность товаром без дефицита');
    }
    summaryVerdictRu =
      parts.length > 0
        ? `По сравнению с исходным планом: ${parts.join(', ')}.`
        : 'Внесены ручные корректировки дат или условий без изменения итоговой потребности.';
  }

  return {
    hasDifferences,
    autoProcurementRub: autoBaseline.totalProcurementCostRub,
    currentProcurementRub: current.totalProcurementCostRub,
    deltaProcurementRub,
    autoCalculatedNeedRub: autoBaseline.calculatedCapitalNeedRub,
    currentCalculatedNeedRub: current.calculatedCapitalNeedRub,
    deltaCalculatedNeedRub,
    autoRemainingNeedRub: autoBaseline.remainingOwnMoneyNeededRub,
    currentRemainingNeedRub: current.remainingOwnMoneyNeededRub,
    deltaRemainingNeedRub,
    autoReinvestedRub: autoBaseline.reinvestedFromSalesRub,
    currentReinvestedRub: current.reinvestedFromSalesRub,
    deltaReinvestedRub,
    autoPeakMonthRu: autoBaseline.peakShortageMonthFullRu,
    currentPeakMonthRu: current.peakShortageMonthFullRu,
    autoDeficitPacks,
    currentDeficitPacks,
    deltaDeficitPacks,
    summaryVerdictRu,
  };
}

const HOLDING_TABLE_BRAND_ORDER: {
  code: CanonicalBrandCode;
  displayName: string;
}[] = [
  { code: 'BORNERS', displayName: 'BORNERS' },
  { code: 'FUKAI', displayName: 'FUKAI' },
  { code: 'AKUSHA', displayName: 'AKUSHA' },
  { code: 'LISKANI', displayName: 'LISCANI' },
  { code: 'NA_TELE', displayName: 'НА ТЕЛЕ' },
];

/**
 * Раздел 10 ТЗ v14: Строит таблицу «Общая сводка группы» (BORNERS / FUKAI / AKUSHA / LISCANI / НА ТЕЛЕ)
 * и сравнивает сумму индивидуальных пиков с единым совокупным денежным календарём группы.
 */
export function computeHoldingBrandsOverviewRows(
  params: Omit<ComputeInvestmentScheduleParams, 'brandFilter'>,
  unifiedGroupSchedule?: ComputedInvestmentScheduleResult
): HoldingGroupOverviewSummary {
  const groupRes =
    unifiedGroupSchedule ||
    computeInvestmentSchedule({
      ...params,
      brandFilter: 'ALL',
    });

  const rows: HoldingBrandSummaryRow[] = [];
  let sumOfBrandPeaksRub = 0;

  for (const item of HOLDING_TABLE_BRAND_ORDER) {
    const available = getScenariosForBrand(params.scenarios, item.code, {
      onlyExplicitForNewBrands: false,
    });
    const rawSelectedId =
      item.code === 'LISKANI'
        ? params.selectedScenarioByBrand?.LISKANI ?? params.selectedScenarioByBrand?.LISCANI
        : params.selectedScenarioByBrand?.[item.code];

    const defaultId =
      item.code === 'BORNERS'
        ? available.find((s) => s.id === 1)?.id ?? available[0]?.id ?? null
        : item.code === 'FUKAI'
        ? available.find((s) => s.id === 100)?.id ??
          available.find((s) => s.id === 1)?.id ??
          available[0]?.id ??
          null
        : available.find(
            (s) => s.ownerBrandCode && normalizePortfolioBrandCode(s.ownerBrandCode) === item.code
          )?.id ??
          available[0]?.id ??
          null;

    const resolvedId =
      rawSelectedId === null
        ? null
        : rawSelectedId !== undefined
        ? rawSelectedId
        : defaultId;

    if (resolvedId === null) {
      rows.push({
        brandCode: item.code,
        displayBrandName: item.displayName,
        scenarioId: null,
        scenarioName: 'Не включён в портфель',
        scenarioYear: groupRes.scenarioYear,
        revenueRub: 0,
        procurementRub: 0,
        ownMoneyNeedRub: 0,
        remainingOwnMoneyRub: 0,
        reinvestedRub: 0,
        isPreliminary: false,
        nextPayment: null,
      });
      continue;
    }

    const cand = params.scenarios.find((s) => s.id === resolvedId && !s.isArchived) || null;
    const chosenScenario =
      cand && isScenarioCompatibleWithBrand(cand, item.code)
        ? cand
        : defaultId !== null
        ? params.scenarios.find((s) => s.id === defaultId && !s.isArchived) || params.activeScenario
        : params.activeScenario;

    const brandSchedule = computeInvestmentSchedule({
      ...params,
      activeScenario: chosenScenario,
      brandFilter: item.code,
    });

    if (brandSchedule.calculatedCapitalNeedRub !== null) {
      sumOfBrandPeaksRub += brandSchedule.calculatedCapitalNeedRub;
    }

    rows.push({
      brandCode: item.code,
      displayBrandName: item.displayName,
      scenarioId: chosenScenario.id,
      scenarioName: chosenScenario.title,
      scenarioYear: brandSchedule.scenarioYear,
      revenueRub: brandSchedule.totalGrossSalesRevenueRub,
      procurementRub: brandSchedule.totalProcurementCostRub,
      ownMoneyNeedRub: brandSchedule.calculatedCapitalNeedRub,
      remainingOwnMoneyRub: brandSchedule.remainingOwnMoneyNeededRub,
      reinvestedRub: brandSchedule.reinvestedFromSalesRub,
      isPreliminary: brandSchedule.isPreliminaryCalculation,
      nextPayment: brandSchedule.nextUpcomingPayment
        ? {
            dateIso: brandSchedule.nextUpcomingPayment.dateIso,
            dateDotRu: brandSchedule.nextUpcomingPayment.dateDotRu,
            dateHumanRu: brandSchedule.nextUpcomingPayment.dateHumanRu,
            amountRub: brandSchedule.nextUpcomingPayment.amountRub,
            purposeLabel: brandSchedule.nextUpcomingPayment.purposeLabel,
          }
        : null,
    });
  }

  const unifiedNeed = groupRes.calculatedCapitalNeedRub;
  const synergy =
    unifiedNeed !== null ? Math.max(0, sumOfBrandPeaksRub - unifiedNeed) : 0;

  return {
    rows,
    sumOfBrandPeaksRub,
    unifiedGroupCalculatedNeedRub: unifiedNeed,
    unifiedGroupSynergySavingsRub: synergy,
  };
}
