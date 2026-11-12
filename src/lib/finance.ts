// =============================================================================
// BORNERS GROUP — STRATEGY & PRODUCT DEVELOPMENT PLATFORM
// Финансовое ядро, права доступа (RBAC), проверка сроков и валидация импорта
// Соответствует п. 4, 5, 10, 11, 15, 17, 19 ТЗ
// =============================================================================

import type {
  AppUser,
  ConceptStage,
  ExperimentStatus,
  FinancialScenario,
  Launch,
  NavSectionId,
  ProductConcept,
  ProductEconomics,
  RnDDevelopmentType,
  TaskItem,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '@/types/platform';

export const ROLE_LABELS_RU: Record<UserRole, string> = {
  Owner: 'Владелец',
  Admin: 'Администратор',
  Manager: 'Руководитель / Менеджер',
  Viewer: 'Сотрудник / Наблюдатель',
  Partner: 'Поставщик / Фабрика',
};

export const RND_DEVELOPMENT_TYPE_LABELS_RU: Record<RnDDevelopmentType, string> = {
  new_construction: 'Новая конструкция',
  model_improvement: 'Улучшение существующей модели',
  new_variant: 'Новый вариант товара',
  seasonal_capsule: 'Сезонная / лимитированная коллекция',
  other: 'Другое',
};

export const CONCEPT_STAGE_LABELS_RU: Record<ConceptStage, string> = {
  IDEA: '01 · Идея',
  ANALYSIS: '02 · Анализ',
  SAMPLE: '03 · Образец',
  TEST: '04 · Тест',
  DECISION: '05 · Решение',
  PRODUCTION: '06 · Производство',
  LAUNCH: '07 · Запуск',
  POSTPONED: 'Отложено',
  RESEARCH: '02 · Анализ',
  DESIGN: '03 · Образец',
  PROTOTYPE: '03 · Образец',
  TESTING: '04 · Тест',
  APPROVED: '05 · Решение',
  'READY TO LAUNCH': '07 · Запуск',
  'ON HOLD': 'Отложено',
  REJECTED: 'Отклонено',
  CANCELLED: 'Отменено',
};

export const TASK_STATUS_LABELS_RU: Record<TaskStatus, string> = {
  'To Do': 'К выполнению',
  'In Progress': 'В работе',
  Review: 'На проверке',
  Done: 'Готово',
  Blocked: 'Заблокировано',
};

export const TASK_PRIORITY_LABELS_RU: Record<TaskPriority, string> = {
  Low: 'Низкий',
  Medium: 'Средний',
  High: 'Высокий',
  Critical: 'Критический',
};

export const SCENARIO_LABELS_RU: Record<FinancialScenario, string> = {
  Conservative: 'Консервативный',
  Base: 'Базовый',
  Optimistic: 'Оптимистичный',
};

export const EXPERIMENT_STATUS_LABELS_RU: Record<ExperimentStatus, string> = {
  Planned: 'Запланирован',
  Running: 'Запущен',
  Completed: 'Завершён',
  Successful: 'Успешен',
  Unsuccessful: 'Неуспешен',
};

export const PRICE_SEGMENT_LABELS_RU: Record<string, string> = {
  'Mass-Market+': 'Масс-маркет+',
  'Middle+': 'Средний+',
  Premium: 'Премиум',
};

export interface UnitEconomicsResult {
  grossPriceAfterDiscount: number;
  vatAmountPerUnit: number;
  returnReservePerUnit: number;
  netRevenuePerUnit: number;
  totalVariableCostsPerUnit: number;
  unitProfitRub: number;
  marginPct: number;
}

/**
 * Расчёт юнит-экономики согласно п. 11 ТЗ:
 * Прибыль на единицу = чистая выручка на единицу − себестоимость − комиссии − логистика − реклама − прочие переменные расходы.
 * НДС, скидки и возвраты учитываются по явной методике:
 * 1) Цена реализации со скидкой = Цена * (1 - скидка%)
 * 2) Сумма НДС = Цена со скидкой * НДС% / (100 + НДС%)
 * 3) Резерв на возвраты/логистику возвратов = Цена со скидкой * возвраты% * 0.15
 * 4) Чистая выручка на единицу = Цена со скидкой - НДС - резерв на возвраты
 */
export function calculateUnitEconomics(econ: ProductEconomics): UnitEconomicsResult {
  const retailPrice = Number(econ.actualRetailPrice || econ.plannedRetailPrice || 0);
  const discountFactor = 1 - Math.max(0, Math.min(100, econ.discountPct || 0)) / 100;
  const grossPriceAfterDiscount = roundMoney(retailPrice * discountFactor);

  const vatRate = Math.max(0, econ.vatPct || 0);
  const vatAmountPerUnit =
    vatRate > 0 ? roundMoney((grossPriceAfterDiscount * vatRate) / (100 + vatRate)) : 0;

  const returnRate = Math.max(0, econ.returnRatePct || 0);
  const returnReservePerUnit = roundMoney(grossPriceAfterDiscount * (returnRate / 100) * 0.15);

  const netRevenuePerUnit = roundMoney(
    grossPriceAfterDiscount - vatAmountPerUnit - returnReservePerUnit
  );

  const totalVariableCostsPerUnit = roundMoney(
    (econ.unitCostPrice || 0) +
      (econ.marketplaceCommissionRub || 0) +
      (econ.logisticsRub || 0) +
      (econ.advertisingRub || 0) +
      (econ.otherVariableRub || 0)
  );

  const unitProfitRub = roundMoney(netRevenuePerUnit - totalVariableCostsPerUnit);
  const marginPct =
    netRevenuePerUnit > 0 ? roundMoney((unitProfitRub / netRevenuePerUnit) * 100) : 0;

  return {
    grossPriceAfterDiscount,
    vatAmountPerUnit,
    returnReservePerUnit,
    netRevenuePerUnit,
    totalVariableCostsPerUnit,
    unitProfitRub,
    marginPct,
  };
}

/**
 * Выручка = выкупленные единицы × средняя цена реализации (п. 11 ТЗ)
 */
export function calculateRevenueFromBuyouts(
  buyoutUnits: number | null,
  avgSellingPriceRub: number
): number | null {
  if (buyoutUnits === null || buyoutUnits === undefined || Number.isNaN(buyoutUnits)) {
    return null; // Отсутствие данных обозначается null («Нет данных»), не нулём!
  }
  return roundMoney(buyoutUnits * avgSellingPriceRub);
}

/**
 * Операционная прибыль = валовая маржа после переменных расходов − постоянные и распределяемые расходы (п. 11 ТЗ)
 */
export function calculateOperatingProfit(params: {
  revenueRub: number | null;
  variableCostRatioPct: number;
  fixedCostsRub: number;
  marketingBudgetRub: number;
}): number | null {
  if (params.revenueRub === null || params.revenueRub === undefined) {
    return null;
  }
  const grossContribution =
    params.revenueRub * (1 - Math.max(0, Math.min(100, params.variableCostRatioPct)) / 100);
  return roundMoney(grossContribution - params.fixedCostsRub - params.marketingBudgetRub);
}

/**
 * Расчёт план / факт / отклонение (п. 4 ТЗ).
 * Если фактических данных нет (null/undefined), возвращает hasFact: false и label: "Нет данных".
 */
export function calculatePlanFactVariance(
  plan: number | null | undefined,
  fact: number | null | undefined
): {
  hasPlan: boolean;
  hasFact: boolean;
  diffAbs: number | null;
  diffPct: number | null;
  factLabel: string;
  varianceLabel: string;
  isPositive: boolean | null;
} {
  const hasPlan = plan !== null && plan !== undefined && !Number.isNaN(plan);
  const hasFact = fact !== null && fact !== undefined && !Number.isNaN(fact);

  if (!hasFact) {
    return {
      hasPlan,
      hasFact: false,
      diffAbs: null,
      diffPct: null,
      factLabel: 'Нет данных',
      varianceLabel: 'Нет данных',
      isPositive: null,
    };
  }

  if (!hasPlan || plan === 0) {
    return {
      hasPlan,
      hasFact: true,
      diffAbs: fact,
      diffPct: null,
      factLabel: formatCurrencyRub(fact),
      varianceLabel: 'План не задан',
      isPositive: fact >= 0,
    };
  }

  const diffAbs = roundMoney(fact - plan);
  const diffPct = roundMoney(((fact - plan) / Math.abs(plan)) * 100);
  const sign = diffPct > 0 ? '+' : '';

  return {
    hasPlan: true,
    hasFact: true,
    diffAbs,
    diffPct,
    factLabel: formatCurrencyRub(fact),
    varianceLabel: `${sign}${diffPct.toFixed(1)}% (${sign}${formatCompactRub(diffAbs)})`,
    isPositive: diffAbs >= 0,
  };
}

export function roundMoney(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function formatCurrencyRub(
  value: number | null | undefined,
  currency: 'RUB' | 'USD' | 'CNY' = 'RUB'
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Нет данных';
  }
  const symbol = currency === 'RUB' ? '₽' : currency === 'USD' ? '$' : '¥';
  return `${new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} ${symbol}`;
}

export function formatCompactRub(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Нет данных';
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)} тыс. ₽`;
  }
  return `${sign}${Math.round(abs)} ₽`;
}

// -----------------------------------------------------------------------------
// ПРАВА ДОСТУПА И РОЛЕВАЯ МОДЕЛЬ (П. 5, 15, 16 ТЗ)
// -----------------------------------------------------------------------------
export function canUserAccessSection(user: AppUser, section: NavSectionId): boolean {
  if (user.role === 'Owner' || user.role === 'Admin') return true;
  if (user.role === 'Partner') {
    // Partner — строго ограниченные разделы (каталог моделей, лаборатория/ТЗ фабрики, календарь запусков, документы производства)
    return ['dashboard', 'product-catalog', 'product-lab', 'launch-calendar', 'documents'].includes(
      section
    );
  }
  if (section === 'finance') {
    return user.canViewFinance;
  }
  return true;
}

export function canUserEditBrand(user: AppUser, brandId: string): boolean {
  if (user.role === 'Owner' || user.role === 'Admin') return true;
  if (user.role === 'Manager') {
    return (
      user.assignedBrandIds.length === 0 ||
      user.assignedBrandIds.includes(brandId) ||
      brandId === 'ALL'
    );
  }
  return false; // Viewer и Partner только просматривают (кроме комментариев)
}

export function canUserEditApprovedStrategy(user: AppUser): boolean {
  // П. 5 ТЗ: «Утверждённые версии изменяются только при наличии прав»
  return user.role === 'Owner' || user.role === 'Admin';
}

export function canUserViewFinance(user: AppUser): boolean {
  // П. 15 ТЗ: «Финансы и закупочные цены имеют отдельные ограничения»
  return user.role === 'Owner' || user.role === 'Admin' || user.canViewFinance;
}

export function canUserViewCostPrice(user: AppUser): boolean {
  // П. 15 ТЗ: отдельное ограничение на себестоимость / закупочную цену
  return user.role === 'Owner' || user.role === 'Admin' || user.canViewCostPrice;
}

/**
 * П. 2, 14, 23 (Критерий 08) ТЗ Product Lab:
 * «Пользователь BORNERS не видит закрытые проекты НА ТЕЛЕ; владелец видит оба.»
 */
export function canUserViewBrandConcept(user: AppUser, brandId: string): boolean {
  if (user.role === 'Owner' || user.role === 'Admin') return true;
  if (!user.assignedBrandIds || user.assignedBrandIds.length === 0) return true;
  return user.assignedBrandIds.includes(brandId);
}

/**
 * П. 10, 14, 23 (Критерий 05) ТЗ Product Lab:
 * «Только владелец или уполномоченный руководитель может утверждать производство.
 * Обычный сотрудник не может утвердить производство.»
 */
export function canUserApproveProduction(user: AppUser, brandId: string): boolean {
  if (user.role === 'Owner' || user.role === 'Admin') return true;
  if (user.role === 'Manager' && user.canViewFinance && canUserViewBrandConcept(user, brandId)) {
    return true;
  }
  return false;
}

export type SevenKanbanStage =
  | 'IDEA'
  | 'ANALYSIS'
  | 'SAMPLE'
  | 'TEST'
  | 'DECISION'
  | 'PRODUCTION'
  | 'LAUNCH';

export const SEVEN_KANBAN_STAGES: SevenKanbanStage[] = [
  'IDEA',
  'ANALYSIS',
  'SAMPLE',
  'TEST',
  'DECISION',
  'PRODUCTION',
  'LAUNCH',
];

export function normalizeConceptStageToSeven(stage: ConceptStage): SevenKanbanStage {
  switch (stage) {
    case 'IDEA':
      return 'IDEA';
    case 'ANALYSIS':
    case 'RESEARCH':
      return 'ANALYSIS';
    case 'SAMPLE':
    case 'DESIGN':
    case 'PROTOTYPE':
      return 'SAMPLE';
    case 'TEST':
    case 'TESTING':
      return 'TEST';
    case 'DECISION':
    case 'APPROVED':
      return 'DECISION';
    case 'PRODUCTION':
      return 'PRODUCTION';
    case 'LAUNCH':
    case 'READY TO LAUNCH':
      return 'LAUNCH';
    default:
      return 'IDEA';
  }
}

/**
 * П. 6–12, 15 ТЗ Product Lab:
 * Проверка обязательных условий при переходе между 7 этапами.
 * Простым перетаскиванием запрещено обходить утверждение производства.
 */
export function validateRnDStageTransition(
  concept: ProductConcept,
  targetStage: ConceptStage,
  user: AppUser
): {
  allowed: boolean;
  missingFields: string[];
  requiresManagerApproval: boolean;
} {
  const normalizedTarget = normalizeConceptStageToSeven(targetStage);
  const missingFields: string[] = [];
  let requiresManagerApproval = false;

  if (normalizedTarget === 'ANALYSIS') {
    if (!concept.ownerId) {
      missingFields.push('Назначить ответственного за разработку');
    }
    if (!concept.ideaDescription?.trim() && !concept.whatAttracted?.trim()) {
      missingFields.push('Сформулировать суть идеи / что привлекло внимание');
    }
  } else if (normalizedTarget === 'SAMPLE') {
    const hypothesis =
      concept.analysisReport?.whatWeCreate?.trim() || concept.ideaDescription?.trim();
    const risks =
      concept.analysisReport?.openQuestionsAndRisks?.trim() ||
      concept.analysisReport?.productionRisks?.trim();
    if (!hypothesis) {
      missingFields.push('Сформулировать продуктовую гипотезу в блоке Анализа');
    }
    if (!risks) {
      missingFields.push('Указать ключевые риски в блоке Анализа');
    }
  } else if (normalizedTarget === 'TEST') {
    const hasSamples = (concept.samples && concept.samples.length > 0) || Boolean(concept.sampleStatus?.trim());
    if (!hasSamples) {
      missingFields.push('Добавить физический образец (Паспорт образца) для проверки');
    }
  } else if (normalizedTarget === 'DECISION') {
    const hasFourChecks = Boolean(
      concept.fourChecksTest &&
        (concept.fourChecksTest.fitAndComfort !== 'untested' ||
          concept.fourChecksTest.waistbandAndSeams !== 'untested' ||
          concept.fourChecksTest.washShapeColor !== 'untested' ||
          concept.fourChecksTest.manufacturingQuality !== 'untested')
    );
    const hasTests =
      (concept.testProtocols && concept.testProtocols.length > 0) ||
      Boolean(concept.testResults && concept.testResults.trim() && concept.testResults.trim() !== 'Нет данных') ||
      hasFourChecks;
    if (!hasTests) {
      missingFields.push('Завершить протокол тестирования образца (оценка посадки и стирки)');
    }
  } else if (normalizedTarget === 'PRODUCTION') {
    const hasApprovedDecision = concept.approvalDecisions?.some((d) => d.decision === 'approve');
    if (!canUserApproveProduction(user, concept.brandId)) {
      requiresManagerApproval = true;
      missingFields.push(
        'Только Владелец или уполномоченный руководитель бренда может утвердить передачу в производство'
      );
    }
    if (!hasApprovedDecision) {
      missingFields.push(
        'Оформить официальное управленческое решение «УТВЕРДИТЬ» с выбором версии образца и обоснованием'
      );
    }
    if (!concept.supplierName?.trim()) {
      missingFields.push('Указать утверждённую фабрику-производителя');
    }
  } else if (normalizedTarget === 'LAUNCH') {
    const hasOrders = concept.productionOrders && concept.productionOrders.length > 0;
    if (!hasOrders) {
      missingFields.push('Создать производственный заказ и подтвердить готовность партии к продаже');
    }
  }

  return {
    allowed: missingFields.length === 0 && !requiresManagerApproval,
    missingFields,
    requiresManagerApproval,
  };
}

// -----------------------------------------------------------------------------
// ПРОВЕРКА КОНФЛИКТОВ ДАТ ПРИ ПЕРЕНОСЕ ЗАПУСКА (П. 10 ТЗ)
// -----------------------------------------------------------------------------
export interface LaunchDateConflict {
  type: 'stage' | 'task';
  title: string;
  currentDeadline: string;
  suggestedDeadline: string;
  reason: string;
}

/**
 * П. 10 ТЗ: «При переносе запуска предупреждать о конфликтующих сроках;
 * не менять зависимые даты без подтверждения.»
 */
export function detectLaunchDateConflicts(
  launch: Launch,
  newStartDate: string,
  linkedTasks: TaskItem[]
): {
  deltaDays: number;
  conflicts: LaunchDateConflict[];
} {
  const oldMs = new Date(launch.startDate).getTime();
  const newMs = new Date(newStartDate).getTime();
  const deltaDays = Math.round((newMs - oldMs) / (1000 * 60 * 60 * 24));

  if (deltaDays === 0 || Number.isNaN(deltaDays)) {
    return { deltaDays: 0, conflicts: [] };
  }

  const conflicts: LaunchDateConflict[] = [];

  for (const stage of launch.stages) {
    const stageMs = new Date(stage.deadline).getTime();
    const shiftedDate = shiftDateString(stage.deadline, deltaDays);
    // Конфликт возникает, если подготовительный этап оказывается позже новой даты запуска или требует сдвига
    const isPreLaunchStage = !['sales', 'analysis'].includes(stage.code);
    if ((isPreLaunchStage && stageMs > newMs) || Math.abs(deltaDays) >= 1) {
      conflicts.push({
        type: 'stage',
        title: `Этап запуска: ${stage.label}`,
        currentDeadline: stage.deadline,
        suggestedDeadline: shiftedDate,
        reason:
          isPreLaunchStage && stageMs > newMs
            ? 'Дедлайн подготовительного этапа позже новой даты старта продаж'
            : `Сдвиг даты запуска на ${deltaDays > 0 ? `+${deltaDays}` : deltaDays} дн.`,
      });
    }
  }

  for (const task of linkedTasks) {
    if (task.launchId === launch.id && task.status !== 'Done') {
      const shiftedTaskDate = shiftDateString(task.deadline, deltaDays);
      conflicts.push({
        type: 'task',
        title: `Задача: ${task.title}`,
        currentDeadline: task.deadline,
        suggestedDeadline: shiftedTaskDate,
        reason: 'Связанная задача запуска требует подтверждения переноса дедлайна',
      });
    }
  }

  return { deltaDays, conflicts };
}

export function shiftDateString(dateStr: string, deltaDays: number): string {
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return dateStr;
  dt.setDate(dt.getDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// ВАЛИДАЦИЯ И ПОИСК ДУБЛИКАТОВ ПРИ ИМПОРТЕ CSV/XLSX (П. 19 ТЗ)
// -----------------------------------------------------------------------------
export interface ParsedImportRow {
  rowIndex: number;
  raw: Record<string, string>;
  mapped: Record<string, string>;
  errors: string[];
  isDuplicate: boolean;
  duplicateKey?: string;
}

export function parseCsvContent(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));

  const rows = lines.slice(1).map((line) => {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = cols[i] ?? '';
    });
    return record;
  });

  return { headers, rows };
}

export function validateAndCheckDuplicates(params: {
  rows: Record<string, string>[];
  columnMapping: Record<string, string>; // targetField -> sourceHeader
  requiredFields: string[];
  numericFields: string[];
  existingKeys: Set<string>;
  uniqueTargetField: string;
}): ParsedImportRow[] {
  const seenInBatch = new Set<string>();

  return params.rows.map((raw, idx) => {
    const mapped: Record<string, string> = {};
    const errors: string[] = [];

    for (const [targetField, sourceHeader] of Object.entries(params.columnMapping)) {
      mapped[targetField] = sourceHeader ? (raw[sourceHeader] ?? '').trim() : '';
    }

    for (const req of params.requiredFields) {
      if (!mapped[req]) {
        errors.push(`Отсутствует обязательное поле «${req}»`);
      }
    }

    for (const numField of params.numericFields) {
      const rawVal = mapped[numField];
      if (rawVal !== undefined && rawVal !== '') {
        const normalized = Number(rawVal.replace(/\s+/g, '').replace(',', '.'));
        if (Number.isNaN(normalized)) {
          errors.push(`Неверный числовой формат поля «${numField}»: "${rawVal}"`);
        }
      }
    }

    const keyVal = (mapped[params.uniqueTargetField] || '').toUpperCase();
    let isDuplicate = false;
    let duplicateKey: string | undefined;

    if (keyVal) {
      if (params.existingKeys.has(keyVal)) {
        isDuplicate = true;
        duplicateKey = `${keyVal} (уже существует в базе)`;
      } else if (seenInBatch.has(keyVal)) {
        isDuplicate = true;
        duplicateKey = `${keyVal} (дубликат внутри файла)`;
      }
      seenInBatch.add(keyVal);
    }

    return {
      rowIndex: idx + 1,
      raw,
      mapped,
      errors,
      isDuplicate,
      duplicateKey,
    };
  });
}
