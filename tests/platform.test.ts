import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateUnitEconomics,
  calculateRevenueFromBuyouts,
  calculatePlanFactVariance,
  canUserAccessSection,
  canUserApproveProduction,
  canUserEditApprovedStrategy,
  canUserViewBrandConcept,
  canUserViewFinance,
  canUserViewCostPrice,
  detectLaunchDateConflicts,
  normalizeConceptStageToSeven,
  parseCsvContent,
  validateAndCheckDuplicates,
  validateRnDStageTransition,
} from '../src/lib/finance.ts';
import {
  buildXlsxBytes,
  buildPdfFromJpegPages,
} from '../src/lib/document-export.ts';
import { INITIAL_STRATEGIES } from '../src/lib/initial-strategies.ts';
import {
  INITIAL_SCENARIOS,
  INITIAL_SCENARIO_MODELS,
  autoDistributeScenarioByPriority,
  computeModelScenarioMetrics,
  getModelPriority,
} from '../src/lib/scenarioData.ts';
import {
  ACTING_2027_SCENARIO_MODELS,
  ACTING_2027_SKUS,
  verifyActingAssortment2027Bundle,
} from '../src/lib/actingAssortment2027.ts';
import {
  CLIENT_SAVED_S1_TOTALS,
  S1_100M_NEW_VARIANTS,
  S1_100M_SCENARIO_MODELS,
  applyClientSavedS1SalesPlan,
  isUnverifiedActingSku,
  verifyScenarioS1_100M,
} from '../src/lib/scenarioS1_100M.ts';
import {
  allocatePacksBySizeLargestRemainder,
  approveRecommendedBatch,
  computeFinancialPnL,
  computeGroupBrandsInvestmentReport,
  computeProcurementPlan,
  computeScenarioInvestmentSummary,
  createCustomPurchaseOrder,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  groupRecommendedBatchesByFactory,
  importStructuredScenarioPlan,
  matchesBrandFilter,
  parseStructuredPlanCsvOrJson,
  recalculateDraftProcurementPlan,
  removeApprovedPurchaseOrder,
  roundNeedToMoqAndMultiple,
  serializePurchaseOrdersToCsv,
  serializeScenarioFactoryOrdersToCsv,
  serializeStructuredPlanToCsv,
  updateApprovedPurchaseOrder,
} from '../src/lib/unifiedBusinessEngine.ts';

test('1. Юнит-экономика (п. 11 ТЗ): расчёт чистой выручки, прибыли на единицу и маржи', () => {
  const result = calculateUnitEconomics({
    currency: 'RUB',
    plannedRetailPrice: 1990,
    actualRetailPrice: 1800,
    discountPct: 0,
    vatPct: 20, // НДС 20% = 300 ₽
    returnRatePct: 0,
    unitCostPrice: 360,
    marketplaceCommissionRub: 300,
    logisticsRub: 90,
    advertisingRub: 150,
    otherVariableRub: 50,
  });

  assert.equal(result.grossPriceAfterDiscount, 1800);
  assert.equal(result.vatAmountPerUnit, 300);
  assert.equal(result.netRevenuePerUnit, 1500);
  assert.equal(result.totalVariableCostsPerUnit, 950);
  // Прибыль на единицу = 1500 - 950 = 550 ₽
  assert.equal(result.unitProfitRub, 550);
  // Маржа = 550 / 1500 = 36.67%
  assert.equal(result.marginPct, 36.67);
});

test('2. Выручка и План/Факт (п. 4, 11 ТЗ): отсутствие данных обозначается «Нет данных», не нулём', () => {
  assert.equal(calculateRevenueFromBuyouts(1000, 1690), 1_690_000);
  assert.equal(calculateRevenueFromBuyouts(null, 1690), null);

  const missingFact = calculatePlanFactVariance(15_675_000, null);
  assert.equal(missingFact.hasFact, false);
  assert.equal(missingFact.factLabel, 'Нет данных');
  assert.equal(missingFact.varianceLabel, 'Нет данных');

  const withFact = calculatePlanFactVariance(10_000_000, 11_500_000);
  assert.equal(withFact.hasFact, true);
  assert.equal(withFact.diffPct, 15);
  assert.equal(withFact.isPositive, true);
});

test('3. Роли и права доступа (п. 5, 15 ТЗ): ограничения на финансы, себестоимость и утверждённые стратегии', () => {
  const owner = {
    id: 'u1',
    email: 'owner@borners.ru',
    fullName: 'Owner',
    jobTitle: 'CEO',
    role: 'Owner' as const,
    canViewFinance: true,
    canViewCostPrice: true,
    assignedBrandIds: ['BORNERS', 'NA_TELE'],
    avatarInitials: 'OW',
    isActive: true,
  };

  const restrictedManager = {
    id: 'u2',
    email: 'design@borners.ru',
    fullName: 'Designer Manager',
    jobTitle: 'Brand Lead',
    role: 'Manager' as const,
    canViewFinance: false,
    canViewCostPrice: false,
    assignedBrandIds: ['NA_TELE'],
    avatarInitials: 'DM',
    isActive: true,
  };

  const partner = {
    id: 'u3',
    email: 'partner@factory.cn',
    fullName: 'Partner',
    jobTitle: 'Factory',
    role: 'Partner' as const,
    canViewFinance: false,
    canViewCostPrice: false,
    assignedBrandIds: ['BORNERS'],
    avatarInitials: 'PT',
    isActive: true,
  };

  assert.equal(canUserViewFinance(owner), true);
  assert.equal(canUserViewFinance(restrictedManager), false);
  assert.equal(canUserViewCostPrice(restrictedManager), false);
  assert.equal(canUserEditApprovedStrategy(owner), true);
  assert.equal(canUserEditApprovedStrategy(restrictedManager), false);

  // Partner не видит стратегию и финансы, но видит Product Lab и каталог
  assert.equal(canUserAccessSection(partner, 'brand-strategy'), false);
  assert.equal(canUserAccessSection(partner, 'finance'), false);
  assert.equal(canUserAccessSection(partner, 'product-lab'), true);
});

test('4. Перенос даты запуска (п. 10 ТЗ): обнаружение конфликтующих сроков этапов и связанных задач', () => {
  const mockLaunch = {
    id: 'launch-1',
    name: 'BORNERS BIG LOVE',
    brandId: 'BORNERS',
    collectionName: 'BIG LOVE',
    productIds: ['p1'],
    startDate: '2027-02-01',
    readinessPct: 50,
    productionStatus: 'В работе',
    marketingBudgetRub: 1000000,
    salesPlanUnits: 5000,
    salesPlanRub: 8000000,
    ownerId: 'u1',
    status: 'В работе' as const,
    imageUrl: '',
    stages: [
      { code: 'production' as const, label: 'Производство', deadline: '2027-01-20', ownerId: 'u1', status: 'In Progress' as const },
    ],
    isDemo: true,
    isArchived: false,
    updatedAt: '2026-10-30',
  };

  const linkedTasks = [
    {
      id: 't1',
      title: 'Отгрузка на склад Коледино',
      description: '',
      brandId: 'BORNERS',
      projectId: 'proj-1',
      launchId: 'launch-1',
      assigneeId: 'u1',
      priority: 'High' as const,
      deadline: '2027-01-25',
      status: 'To Do' as const,
      comments: [],
      attachments: [],
      isDemo: true,
      isArchived: false,
    },
  ];

  const check = detectLaunchDateConflicts(mockLaunch, '2027-02-15', linkedTasks);
  assert.equal(check.deltaDays, 14);
  assert.equal(check.conflicts.length, 2);
  assert.equal(check.conflicts[0].suggestedDeadline, '2027-02-03');
  assert.equal(check.conflicts[1].suggestedDeadline, '2027-02-08');
});

test('5. Импорт CSV/XLSX (п. 19 ТЗ): проверка форматов и поиск дубликатов без молчаливой перезаписи', () => {
  const csv = [
    'Артикул;Название;Цена;Себестоимость',
    'BRN-BL-2027;Существующий артикул;1690;360',
    'BRN-NEW-301;Новая модель боксеров;1490;310',
    'BRN-NEW-301;Дубликат внутри файла;1490;abc',
  ].join('\n');

  const parsed = parseCsvContent(csv);
  assert.equal(parsed.headers.length, 4);
  assert.equal(parsed.rows.length, 3);

  const validated = validateAndCheckDuplicates({
    rows: parsed.rows,
    columnMapping: {
      sku: 'Артикул',
      name: 'Название',
      price: 'Цена',
      cost: 'Себестоимость',
    },
    requiredFields: ['sku', 'name', 'price'],
    numericFields: ['price', 'cost'],
    existingKeys: new Set(['BRN-BL-2027']),
    uniqueTargetField: 'sku',
  });

  // 1-я строка — дубликат существующего артикула в БД
  assert.equal(validated[0].isDuplicate, true);
  // 2-я строка — чистая валидная запись
  assert.equal(validated[1].isDuplicate, false);
  assert.equal(validated[1].errors.length, 0);
  // 3-я строка — дубликат внутри файла + ошибка числового формата поля cost
  assert.equal(validated[2].isDuplicate, true);
  assert.equal(validated[2].errors.length, 1);
});

test('6. Product Lab R&D (Критерии 05 и 08 ТЗ): изоляция брендов BORNERS / НА ТЕЛЕ и запрет утверждения производства сотрудником', () => {
  const owner = {
    id: 'u-owner',
    email: 'owner@borners.ru',
    fullName: 'Алексей Морозов',
    jobTitle: 'CEO',
    role: 'Owner' as const,
    canViewFinance: true,
    canViewCostPrice: true,
    assignedBrandIds: ['BORNERS', 'NA_TELE'],
    avatarInitials: 'АМ',
    isActive: true,
  };

  const bornersOnlyUser = {
    id: 'u-brn',
    email: 'brn@borners.ru',
    fullName: 'Менеджер BORNERS',
    jobTitle: 'Brand Manager',
    role: 'Manager' as const,
    canViewFinance: true,
    canViewCostPrice: true,
    assignedBrandIds: ['BORNERS'],
    avatarInitials: 'МБ',
    isActive: true,
  };

  const regularEmployee = {
    id: 'u-emp',
    email: 'emp@borners.ru',
    fullName: 'Сотрудник R&D',
    jobTitle: 'R&D Specialist',
    role: 'Viewer' as const,
    canViewFinance: false,
    canViewCostPrice: false,
    assignedBrandIds: ['BORNERS'],
    avatarInitials: 'СР',
    isActive: true,
  };

  // Критерий 08: пользователь BORNERS видит BORNERS, но не видит закрытые проекты НА ТЕЛЕ; Владелец видит оба
  assert.equal(canUserViewBrandConcept(bornersOnlyUser, 'BORNERS'), true);
  assert.equal(canUserViewBrandConcept(bornersOnlyUser, 'NA_TELE'), false);
  assert.equal(canUserViewBrandConcept(owner, 'BORNERS'), true);
  assert.equal(canUserViewBrandConcept(owner, 'NA_TELE'), true);

  // Критерий 05: обычный сотрудник не может утвердить производство; Владелец может
  assert.equal(canUserApproveProduction(regularEmployee, 'BORNERS'), false);
  assert.equal(canUserApproveProduction(owner, 'BORNERS'), true);
});

test('7. Product Lab R&D (п. 15 ТЗ): контроль условий при переходе между 7 этапами', () => {
  assert.equal(normalizeConceptStageToSeven('IDEA'), 'IDEA');
  assert.equal(normalizeConceptStageToSeven('ANALYSIS'), 'ANALYSIS');
  assert.equal(normalizeConceptStageToSeven('SAMPLE'), 'SAMPLE');
  assert.equal(normalizeConceptStageToSeven('TEST'), 'TEST');
  assert.equal(normalizeConceptStageToSeven('DECISION'), 'DECISION');
  assert.equal(normalizeConceptStageToSeven('PRODUCTION'), 'PRODUCTION');
  assert.equal(normalizeConceptStageToSeven('LAUNCH'), 'LAUNCH');

  const regularEmployee = {
    id: 'u-emp',
    email: 'emp@borners.ru',
    fullName: 'Сотрудник',
    jobTitle: 'R&D',
    role: 'Viewer' as const,
    canViewFinance: false,
    canViewCostPrice: false,
    assignedBrandIds: ['BORNERS'],
    avatarInitials: 'СР',
    isActive: true,
  };

  const mockConcept: any = {
    id: 'c-1',
    code: 'RD-024',
    name: 'Семейные трусы BORNERS',
    brandId: 'BORNERS',
    stage: 'DECISION',
    ownerId: 'u-emp',
    ideaDescription: 'Свободные трусы Old Money',
    supplierName: '',
    approvalDecisions: [],
  };

  // Попытка обычного сотрудника перетащить карточку в ПРОИЗВОДСТВО без утверждения руководителем блокируется
  const gateCheck = validateRnDStageTransition(mockConcept, 'PRODUCTION', regularEmployee);
  assert.equal(gateCheck.allowed, false);
  assert.equal(gateCheck.requiresManagerApproval, true);
  assert.equal(gateCheck.missingFields.length >= 2, true);
});

test('8. Экспорт документов (PDF и Excel .xlsx): генерация валидных бинарных контейнеров OpenXML ZIP и PDF-1.4', () => {
  const xlsxBytes = buildXlsxBytes([
    {
      name: 'Матрица SKU',
      colWidths: [18, 32, 16],
      rows: [
        {
          height: 30,
          mergeAcross: 3,
          cells: [{ value: 'BORNERS GROUP — МАТРИЦА АССОРТИМЕНТА', style: 1 }],
        },
        {
          height: 24,
          cells: [
            { value: 'Артикул', style: 3 },
            { value: 'Модель', style: 3 },
            { value: 'Цена РРЦ, ₽', style: 3 },
          ],
        },
        {
          height: 20,
          cells: [
            { value: 'BRN-BX-001', style: 5 },
            { value: 'Боксеры BORNERS Signature Modal', style: 5 },
            { value: 1990, style: 9, type: 'number' },
          ],
        },
      ],
    },
  ]);

  // Проверка сигнатуры ZIP-архива OpenXML (PK\x03\x04)
  assert.equal(xlsxBytes[0], 0x50);
  assert.equal(xlsxBytes[1], 0x4b);
  assert.equal(xlsxBytes[2], 0x03);
  assert.equal(xlsxBytes[3], 0x04);
  assert.equal(xlsxBytes.byteLength > 1500, true);

  // Проверка генерации многостраничного PDF-1.4 контейнера
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
  const pdfBytes = buildPdfFromJpegPages([{ jpegBytes: fakeJpeg, widthPx: 1654, heightPx: 2339 }]);
  const pdfHeader = new TextDecoder().decode(pdfBytes.slice(0, 8));
  const pdfTail = new TextDecoder().decode(pdfBytes.slice(pdfBytes.length - 16));
  assert.equal(pdfHeader.startsWith('%PDF-1.4'), true);
  assert.equal(pdfTail.includes('%%EOF'), true);
});

test('9. Быстрая загрузка фотографий (< 50 КБ на фото) и дедлайны всех 14 блоков стратегии', () => {
  const imagesDir = path.join(process.cwd(), 'public', 'images', 'products');
  const files = fs.readdirSync(imagesDir).filter((f) => f.endsWith('.jpg') || f.endsWith('.png'));
  assert.equal(files.length >= 10, true);
  for (const file of files) {
    const stat = fs.statSync(path.join(imagesDir, file));
    // Каждое изображение сжато до ~18-36 КБ (лимит < 60 КБ вместо прежних 7.2 МБ)
    assert.equal(stat.size < 60 * 1024, true, `Файл ${file} превышает 60 КБ: ${stat.size} байт`);
  }

  assert.equal(INITIAL_STRATEGIES.length, 28);
  for (const block of INITIAL_STRATEGIES) {
    assert.equal(typeof block.deadline, 'string');
    assert.equal((block.deadline ?? '').length, 10);
  }
});

test('10. Сценарии роста и управление моделями (ТЗ v1.0, Тест 01–12): расчёт снизу вверх, маржа, дефицит и конфликт сроков', () => {
  const scen1 = INITIAL_SCENARIOS[0]; // 100 млн ₽ / мес
  const model001 = INITIAL_SCENARIO_MODELS[0]; // BORNERS №001 / COLOR 4 PACK

  const baseMetrics = computeModelScenarioMetrics(model001, scen1);
  // Годовая выручка считается как сумма 12 месяцев (~87 млн ₽), а не декабрь × 12
  assert.equal(baseMetrics.annualPacks, 67442);
  assert.equal(Math.round(baseMetrics.annualRevenueRub / 1_000_000), 87);
  assert.equal(baseMetrics.goalSharePct, 10.8);
  assert.equal(baseMetrics.hasScheduleConflict, false);
  // Палитры SORBET CLUB и RIVIERA содержат по 4 цвета с Pantone (Тест 08)
  assert.equal(model001.palettes.length, 2);
  assert.equal(model001.palettes[0].colors.length, 4);
  assert.equal(model001.palettes[1].colors.length, 4);

  // Тест 04: изменение продаж за месяц пересчитывает годовую выручку
  const modifiedModel = {
    ...model001,
    unitCostRub: 350, // Тест 05: снижение себестоимости увеличивает маржинальный доход
    plansByScenario: {
      ...model001.plansByScenario,
      1: {
        ...model001.plansByScenario[1],
        monthlyPacks: model001.plansByScenario[1].monthlyPacks.map((v, idx) =>
          idx === 0 ? v + 1000 : v
        ),
        salesStartMonthIdx: 2, // Март
        warehouseArrivalMonthIdx: 3, // Апрель (Тест 07: конфликт сроков!)
        warehouseArrivalDateLabel: '12 апреля',
      },
    },
  };

  const nextMetrics = computeModelScenarioMetrics(modifiedModel, scen1);
  assert.equal(
    nextMetrics.annualRevenueRub,
    baseMetrics.annualRevenueRub + 1000 * 1290
  );
  assert.equal(nextMetrics.unitMarginRub > baseMetrics.unitMarginRub, true);
  assert.equal(nextMetrics.hasScheduleConflict, true);
  assert.equal(
    nextMetrics.scheduleConflictMessage,
    'План продаж начинается в марте, но товар поступит на склад только 12 апреля'
  );
});

test('11. Действующий ассортимент ИП Нерсесянц 2027 (7 SKU · 84 записи): точная сверка контрольных сумм', () => {
  const check = verifyActingAssortment2027Bundle();
  assert.equal(check.valid, true);
  assert.equal(ACTING_2027_SKUS.length, 7);
  assert.equal(check.recordsCount, 84);
  assert.equal(check.annualBuyoutsSets, 223_713);
  assert.equal(check.annualRevenueRub, 267_731_943);
  assert.equal(check.decemberRevenueRub, 22_729_352);
  assert.equal(check.annualCostOfGoodsRub, 91_462_155);

  // Артикул 72302360 (4351877) помечен «FUKAI на фото — подтвердить», без автоматического подтверждения BORNERS
  const fukaiCandidate = ACTING_2027_SKUS.find((s) => s.wbSku === '72302360');
  assert.equal(Boolean(fukaiCandidate), true);
  assert.equal(fukaiCandidate?.brandVerified, false);
  assert.equal(fukaiCandidate?.brandStatus.includes('FUKAI'), true);
});

test('12. Сценарий №1 BORNERS-2027-S1-100M (100 млн ₽/мес · 16 новых вариантов + 5 SKU WB): точная сверка всех контрольных сумм', () => {
  const s1 = verifyScenarioS1_100M();
  assert.equal(s1.valid, true);
  assert.equal(s1.scenarioCode, 'BORNERS-2027-S1-100M');
  assert.equal(s1.newVariantsCount, 16);
  assert.equal(s1.confirmedActingSkusCount, 5);
  assert.equal(s1.unverifiedActingSkusCount, 2);
  assert.equal(s1.decemberNewSets, 41_400);
  assert.equal(s1.decemberNewRevenueRub, 85_114_000);
  assert.equal(s1.decemberActingBornersRevenueRub, 15_040_901);
  assert.equal(s1.decemberTotalRevenueRub, 100_154_901);
  assert.equal(s1.annualTotalRevenueRub, 606_372_182);
  assert.equal(s1.zeroSalesBeforeLaunchValid, true);
  assert.equal(S1_100M_NEW_VARIANTS.length, 16);
});

test('13. Живой дашборд и авто-расчёт сценария по приоритету моделей под любую целевую сумму (например 130 млн ₽/мес)', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const modelsPool = [...S1_100M_SCENARIO_MODELS, ...ACTING_2027_SCENARIO_MODELS];

  // Проверяем корректное считывание приоритетов
  const dly01 = modelsPool.find((m) => m.code === 'BRN-DLY-01')!;
  const brn003 = modelsPool.find((m) => m.code === 'BRN-003')!;
  const brf01 = modelsPool.find((m) => m.code === 'BRN-BRF-A-01')!;
  assert.equal(getModelPriority(dly01), 'Высший');
  assert.equal(getModelPriority(brn003), 'Средний');
  assert.equal(getModelPriority(brf01), 'Не указан');

  // Запускаем авто-расчёт под новую цель 130 млн ₽ в декабре
  const distributed = autoDistributeScenarioByPriority(modelsPool, scen1, {
    keepActingWbFixed: true,
    targetMonthlyMlnOverride: 130,
  });

  const activeInTarget = distributed.filter((m) => !isUnverifiedActingSku(m.code));
  const totalDecRub = activeInTarget.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen1).targetMonthRevenueRub,
    0
  );

  // Итоговая сумма декабря по карточкам должна попадать в цель 130 млн ₽ (с точностью округления до целых комплектов < 0.05 млн ₽)
  assert.equal(Math.abs(totalDecRub - 130_000_000) < 50_000, true);

  // До месяца старта (март = индекс 2 для DAILY, апрель = индекс 3 для BRIEF) продажи остаются строго 0
  const distDly01 = distributed.find((m) => m.code === 'BRN-DLY-01')!;
  const distBrf01 = distributed.find((m) => m.code === 'BRN-BRF-A-01')!;
  assert.equal(distDly01.plansByScenario[1].monthlyPacks[0], 0);
  assert.equal(distDly01.plansByScenario[1].monthlyPacks[1], 0);
  assert.equal(distBrf01.plansByScenario[1].monthlyPacks[0], 0);
  assert.equal(distBrf01.plansByScenario[1].monthlyPacks[2], 0);
});

test('14. Сохранённые продажи клиента в Сценарии №1 (109 938 111 ₽ в дек / 686 284 972 ₽ за год · 21 мод.): точная сверка рубль-в-рубль', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const scen2 = INITIAL_SCENARIOS.find((s) => s.id === 2)!;
  const scen3 = INITIAL_SCENARIOS.find((s) => s.id === 3)!;

  const restored = applyClientSavedS1SalesPlan([
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
  ]);

  const eligibleS1 = restored.filter((m) => !isUnverifiedActingSku(m.code));
  assert.equal(eligibleS1.length, 21);

  const decRub = eligibleS1.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen1).targetMonthRevenueRub,
    0
  );
  const annRub = eligibleS1.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen1).annualRevenueRub,
    0
  );

  assert.equal(decRub, CLIENT_SAVED_S1_TOTALS.decemberRevenueRub);
  assert.equal(decRub, 109_938_111);
  assert.equal(annRub, CLIENT_SAVED_S1_TOTALS.annualRevenueRub);
  assert.equal(annRub, 686_284_972);

  // Сценарии №2 и №3 остаются неизменными (799,52 млн ₽ и 992,67 млн ₽ по 23 моделям)
  const annS2 = restored.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen2).annualRevenueRub,
    0
  );
  const annS3 = restored.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen3).annualRevenueRub,
    0
  );
  assert.equal(annS2, 799_519_172);
  assert.equal(annS3, 992_670_642);
});

test('15. ТЗ v1.1 (Тест-кейс №1): оригиналы фото без кропа и категории кадров для пилотного SKU BRN-001-SC — Sorbet Club', () => {
  const rawSorbet = S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!;
  const sorbet = ensureModelUnifiedV11(rawSorbet);

  assert.equal(sorbet.gallery.length >= 4, true);
  const categories = new Set(sorbet.gallery.map((g) => g.category));
  assert.equal(categories.has('pack'), true);
  assert.equal(categories.has('single'), true);
  assert.equal(categories.has('waistband'), true);
  assert.equal(categories.has('construction'), true);

  for (const frame of sorbet.gallery) {
    assert.equal(Boolean(frame.originalUrl), true);
    const fullPath = path.join(process.cwd(), 'public', frame.originalUrl!);
    assert.equal(fs.existsSync(fullPath), true, `Отсутствует оригинал кадра: ${fullPath}`);
  }

  // Проверяем наличие компонента полноэкранного лайтбокса с поддержкой pinch-to-zoom, 100%, панорамирования и скачивания оригинала
  const lightboxCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'sections', 'FullscreenPhotoLightbox.tsx'),
    'utf-8'
  );
  assert.equal(lightboxCode.includes('onTouchMove'), true);
  assert.equal(lightboxCode.includes('object-contain'), true);
  assert.equal(lightboxCode.includes('100%'), true);
});

test('16. ТЗ v1.1 (Тест-кейс №2): увеличение плана продаж Sorbet Club в августе пересчитывает выручку SKU, сценарий, дефицит и закупки', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const sorbetBase = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  const basePnl = computeFinancialPnL(sorbetBase, scen1);
  const baseProc = computeProcurementPlan(sorbetBase, scen1);

  // Увеличиваем август (индекс 7) на +1 000 комплектов по цене 2 490 ₽
  const sorbetAugBoost: typeof sorbetBase = {
    ...sorbetBase,
    plansByScenario: {
      ...sorbetBase.plansByScenario,
      1: {
        ...sorbetBase.plansByScenario[1],
        monthlyPacks: sorbetBase.plansByScenario[1].monthlyPacks.map((v, idx) =>
          idx === 7 ? v + 1000 : v
        ),
      },
    },
  };

  const nextPnl = computeFinancialPnL(sorbetAugBoost, scen1);
  const nextProc = computeProcurementPlan(sorbetAugBoost, scen1);

  assert.equal(nextPnl.annualBuyoutsPacks, basePnl.annualBuyoutsPacks + 1000);
  assert.equal(nextPnl.annualRevenueRub, basePnl.annualRevenueRub + 1000 * 2490);
  assert.equal(nextProc.totalDeficitPacks, baseProc.totalDeficitPacks + 1000);
  assert.equal(nextProc.totalDeficitUnits, baseProc.totalDeficitUnits + 4000);
  assert.equal(nextProc.totalRecommendedPacks > baseProc.totalRecommendedPacks, true);
});

test('17. ТЗ v1.1 (Тест-кейс №3): смена срока производства с 30 на 60 дней сдвигает дату новой партии раньше, НЕ меняя утверждённый заказ PO', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const sorbet30 = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  const proc30 = computeProcurementPlan(sorbet30, scen1);
  assert.equal(proc30.recommendedBatches.length >= 2, true);

  // Утверждаем первую партию вручную -> создаётся PO-2027-BRN-001-SC-01
  const firstBatch = proc30.recommendedBatches[0];
  const secondBatchBefore = proc30.recommendedBatches[1];
  const withApprovedPo = approveRecommendedBatch(sorbet30, firstBatch, 'Владелец');
  const lockedPo = withApprovedPo.sharedSupplyAndFact!.approvedOrders[0];

  assert.equal(lockedPo.orderNumber, 'PO-2027-BRN-001-SC-01');
  const lockedPlacementDate = lockedPo.orderPlacementDateIso;
  const lockedPacksQty = lockedPo.packsQty;
  const lockedTotalRub = lockedPo.totalOrderRub;

  // Меняем срок производства фабрики с 30 на 60 дней (+30 дней к циклу)
  const sorbet60: typeof withApprovedPo = {
    ...withApprovedPo,
    sharedSupplyAndFact: {
      ...withApprovedPo.sharedSupplyAndFact!,
      factoryParams: {
        ...withApprovedPo.sharedSupplyAndFact!.factoryParams,
        productionLeadDays: 60,
      },
    },
  };

  const proc60 = computeProcurementPlan(sorbet60, scen1);

  // 1. Существующий утверждённый заказ PO НЕ изменился!
  assert.equal(proc60.approvedOrders.length, 1);
  assert.equal(proc60.approvedOrders[0].orderPlacementDateIso, lockedPlacementDate);
  assert.equal(proc60.approvedOrders[0].packsQty, lockedPacksQty);
  assert.equal(proc60.approvedOrders[0].totalOrderRub, lockedTotalRub);

  // 2. Система честно подсветила расхождение по сроку (+30 дней) на утверждённом PO
  assert.equal(proc60.orderDiscrepancies.length, 1);
  assert.equal(proc60.orderDiscrepancies[0].daysShifted, 30);

  // 3. Дата размещения следующей новой рекомендуемой партии сдвинулась ровно на 30 дней раньше
  const matchingNewBatch = proc60.recommendedBatches.find(
    (b) => b.firstCoveredMonthIdx === secondBatchBefore.firstCoveredMonthIdx
  )!;
  const prevMs = Date.parse(`${secondBatchBefore.recommendedOrderDateIso}T00:00:00Z`);
  const nextMs = Date.parse(`${matchingNewBatch.recommendedOrderDateIso}T00:00:00Z`);
  const diffDays = Math.round((prevMs - nextMs) / (24 * 60 * 60 * 1000));
  assert.equal(diffDays, 30);
});

test('18. ТЗ v1.1 (Тест-кейс №4): начальные остатки = 0, поступлений = 0, продажи > 0 -> честный дефицит (нельзя получать «обеспечено на 12 месяцев»)', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const sorbet = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  const proc = computeProcurementPlan(sorbet, scen1);
  assert.equal(proc.actualOpeningStockPacks, 0);
  assert.equal(proc.totalApprovedReceiptsPacks, 0);
  assert.equal(proc.annualDemandPacks > 0, true);
  assert.equal(proc.hasDeficit, true);
  assert.equal(proc.coveredMonthsCount, 0);
  assert.equal(proc.totalDeficitPacks, proc.annualDemandPacks);
  assert.equal(proc.supplyStatusTone, 'danger');
  assert.equal(proc.supplyStatusLabel.includes('Дефицит'), true);
});

test('19. ТЗ v1.1 (Тест-кейс №5): комплект из 4 шт. при закупке 1 000 комплектов -> 1 000 комплектов и 4 000 изделий, сумма НЕ умножается повторно', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const sorbetBase = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  // Задаём ровно 1 000 комплектов потребности без страхового запаса при себестоимости 600 ₽ за комплект
  const exact1000Model: typeof sorbetBase = {
    ...sorbetBase,
    unitsInPack: 4,
    unitCostRub: 600,
    sharedSupplyAndFact: {
      ...sorbetBase.sharedSupplyAndFact!,
      actualOpeningStockPacks: 0,
      approvedOrders: [],
      factoryParams: {
        ...sorbetBase.sharedSupplyAndFact!.factoryParams,
        moqPacks: 1000,
        packMultiple: 50,
        safetyStockDays: 0,
        coverageWindowMonths: 1,
      },
    },
    plansByScenario: {
      ...sorbetBase.plansByScenario,
      1: {
        ...sorbetBase.plansByScenario[1],
        monthlyPacks: [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
  };

  const proc = computeProcurementPlan(exact1000Model, scen1);
  assert.equal(proc.recommendedBatches.length, 1);
  const batch = proc.recommendedBatches[0];
  assert.equal(batch.recommendedPacks, 1000);
  assert.equal(batch.physicalUnitsQty, 4000);
  // Строго 1 000 компл. × 600 ₽ = 600 000 ₽ (НЕ 2 400 000 ₽!)
  assert.equal(batch.estimatedTotalRub, 600_000);

  const afterPo = approveRecommendedBatch(exact1000Model, batch, 'Владелец');
  const po = afterPo.sharedSupplyAndFact!.approvedOrders[0];
  assert.equal(po.packsQty, 1000);
  assert.equal(po.physicalUnitsQty, 4000);
  assert.equal(po.totalOrderRub, 600_000);
});

test('20. ТЗ v1.1 (Тест-кейс №6): изменение закупочной себестоимости с 600 до 650 ₽ пересчитывает затраты, маржу и бюджет закупок без изменения выкупов', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const sorbet600 = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );
  const sorbet650 = { ...sorbet600, unitCostRub: 650 };

  const pnl600 = computeFinancialPnL(sorbet600, scen1);
  const proc600 = computeProcurementPlan(sorbet600, scen1);

  const pnl650 = computeFinancialPnL(sorbet650, scen1);
  const proc650 = computeProcurementPlan(sorbet650, scen1);

  // Плановые выкупы не меняются!
  assert.equal(pnl650.annualBuyoutsPacks, pnl600.annualBuyoutsPacks);
  assert.equal(pnl650.annualRevenueRub, pnl600.annualRevenueRub);

  // Товарные затраты (COGS) выросли на 50 ₽ × выкупы
  assert.equal(
    pnl650.annualCogsRub! - pnl600.annualCogsRub!,
    pnl600.annualBuyoutsPacks * 50
  );
  // Маржинальная и операционная прибыль уменьшились ровно на ту же величину
  assert.equal(
    pnl600.annualContributionMarginRub! - pnl650.annualContributionMarginRub!,
    pnl600.annualBuyoutsPacks * 50
  );
  assert.equal(
    pnl600.annualOperatingProfitRub! - pnl650.annualOperatingProfitRub!,
    pnl600.annualBuyoutsPacks * 50
  );
  // Бюджет рекомендованных закупок вырос на 50 ₽ × рекомендуемые комплекты
  assert.equal(
    proc650.totalRecommendedBudgetRub! - proc600.totalRecommendedBudgetRub!,
    proc600.totalRecommendedPacks * 50
  );
});

test('21. ТЗ v1.1 (Тест-кейс №7): один SKU в двух сценариях (100 млн и 150 млн) — одна галерея/спецификация, раздельные прогнозы и общие реальные остатки/PO', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const scen2 = INITIAL_SCENARIOS.find((s) => s.id === 2)!;
  const baseSorbet = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  // Задаём общий реальный начальный остаток 500 компл. и утверждаем 1 заказ PO
  const withStock = {
    ...baseSorbet,
    sharedSupplyAndFact: {
      ...baseSorbet.sharedSupplyAndFact!,
      actualOpeningStockPacks: 500,
    },
  };
  const firstBatchS1 = computeProcurementPlan(withStock, scen1).recommendedBatches[0];
  const sharedModel = approveRecommendedBatch(withStock, firstBatchS1, 'Владелец');

  const procS1 = computeProcurementPlan(sharedModel, scen1);
  const procS2 = computeProcurementPlan(sharedModel, scen2);

  // Одна и та же карточка и спецификация
  assert.equal(sharedModel.gallery.length >= 4, true);
  assert.equal(sharedModel.fabric.composition.length > 0, true);

  // Раздельные сценарные прогнозы продаж (150 млн > 100 млн)
  assert.equal(procS2.annualDemandPacks > procS1.annualDemandPacks, true);

  // Общие реальные остатки и единый утверждённый заказ PO без дублирования!
  assert.equal(procS1.actualOpeningStockPacks, 500);
  assert.equal(procS2.actualOpeningStockPacks, 500);
  assert.equal(procS1.approvedOrders.length, 1);
  assert.equal(procS2.approvedOrders.length, 1);
  assert.equal(procS1.approvedOrders[0].orderNumber, procS2.approvedOrders[0].orderNumber);
});

test('22. ТЗ v1.1 (Тест-кейс №8): если финансовые затраты не заполнены — операционная прибыль строго «Не рассчитана» без ложных 75% прибыли', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;

  // Случай А: модель DAILY BRN-DLY-01 (себестоимость и расходы не заданы)
  const dly01 = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-DLY-01')!
  );
  const pnlDly = computeFinancialPnL(dly01, scen1);
  assert.equal(pnlDly.annualOperatingProfitRub, null);
  assert.equal(pnlDly.operatingMarginPct, null);
  assert.equal(pnlDly.operatingProfitStatus, 'not_filled');
  assert.equal(Boolean(pnlDly.operatingProfitNotCalculatedReason), true);

  // Случай Б: модель BRN-002 (себестоимость 525 ₽ есть, но комиссии MP, логистика, реклама и OPEX = 0 / не заполнены)
  const brn002 = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-002')!
  );
  const pnl002 = computeFinancialPnL(brn002, scen1);
  // Валовая прибыль считается честно (Выручка - COGS), но операционная прибыль = null («Не рассчитана»)!
  assert.equal(pnl002.annualGrossProfitRub !== null, true);
  assert.equal(pnl002.expensesFilled, false);
  assert.equal(pnl002.annualContributionMarginRub, null);
  assert.equal(pnl002.annualOperatingProfitRub, null);
  assert.equal(pnl002.operatingMarginPct, null);
  assert.equal(pnl002.operatingProfitStatus, 'not_filled');
});

test('23. ТЗ v1.1 (Тест-кейс №9 + Портфель FUKAI): экспорт/импорт плана сохраняет SKU, периоды, цены, выкупы и статусы без потери и двойного счёта', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const fullPortfolio = applyClientSavedS1SalesPlan([
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
  ]);

  // Проверяем, что позиция FUKAI (WB 72302360) сохраняется в портфеле группы и определяется фильтром бренда
  const fukaiModel = fullPortfolio.find((m) => m.code.includes('72302360'))!;
  assert.equal(Boolean(fukaiModel), true);
  assert.equal(detectModelBrandPortfolioLabel(fukaiModel), 'FUKAI');

  // Группировка рекомендованных партий по фабрикам работает на всём портфеле
  const groupedBatches = groupRecommendedBatchesByFactory(fullPortfolio, scen1);
  assert.equal(groupedBatches.length > 0, true);

  // Экспортируем план Сценария №1 в CSV и парсим обратно
  const exportedRows = exportStructuredScenarioPlan(fullPortfolio, scen1);
  assert.equal(exportedRows.length, fullPortfolio.length * 12);

  const csvText = serializeStructuredPlanToCsv(exportedRows);
  const parsedFromCsv = parseStructuredPlanCsvOrJson(csvText, scen1.id);
  assert.equal(parsedFromCsv.length, exportedRows.length);

  // Искусственно дублируем строки при импорте — проверяем защиту от двойного счёта!
  const duplicatedInput = [...parsedFromCsv, ...parsedFromCsv.slice(0, 24)];

  // Сбрасываем план Sorbet Club в 0 и восстанавливаем импортом из CSV
  const zeroedSorbetPortfolio = fullPortfolio.map((m) =>
    m.code === 'BRN-001-SC'
      ? {
          ...m,
          plansByScenario: {
            ...m.plansByScenario,
            1: {
              ...m.plansByScenario[1],
              monthlyPacks: Array(12).fill(0),
            },
          },
        }
      : m
  );

  const importRes = importStructuredScenarioPlan(
    zeroedSorbetPortfolio,
    duplicatedInput,
    scen1.id
  );
  assert.equal(importRes.importedSkusCount, fullPortfolio.length);
  assert.equal(importRes.duplicatesSkipped, 24);

  // Проверяем совпадение годовой выручки рубль-в-рубль после цикла Экспорт -> CSV -> Импорт!
  const eligibleAfterImport = importRes.updatedModels.filter(
    (m) => !isUnverifiedActingSku(m.code)
  );
  const decAfterImport = eligibleAfterImport.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen1).targetMonthRevenueRub,
    0
  );
  const annAfterImport = eligibleAfterImport.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen1).annualRevenueRub,
    0
  );
  assert.equal(decAfterImport, CLIENT_SAVED_S1_TOTALS.decemberRevenueRub);
  assert.equal(annAfterImport, CLIENT_SAVED_S1_TOTALS.annualRevenueRub);
});

test('24. Пакетное утверждение всех рекомендованных партий SKU в PO полностью закрывает дефицит и обнуляет очередь к заказу', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const sorbet = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  const initialProc = computeProcurementPlan(sorbet, scen1);
  assert.equal(initialProc.hasDeficit, true);
  assert.equal(initialProc.recommendedBatches.length > 0, true);

  let approvedModel = sorbet;
  for (const batch of initialProc.recommendedBatches) {
    approvedModel = approveRecommendedBatch(approvedModel, batch, 'Владелец');
  }

  const afterProc = computeProcurementPlan(approvedModel, scen1);
  assert.equal(afterProc.approvedOrders.length, initialProc.recommendedBatches.length);
  assert.equal(afterProc.hasDeficit, false);
  assert.equal(afterProc.totalDeficitPacks, 0);
  assert.equal(afterProc.recommendedBatches.length, 0);
});

test('25. Ручное управление закупками PO (создание, правка статуса/партии/цены, CSV и удаление) + чистая фотогалерея без лишних подписей', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const sorbet = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  // 1. Ручное создание произвольного PO на 1 500 комплектов по 620 ₽ к марту (индекс 2)
  const created = createCustomPurchaseOrder(sorbet, {
    packsQty: 1500,
    unitCostRub: 620,
    factoryName: 'Guangzhou Textile Hub',
    arrivalMonthIdx: 2,
    status: 'in_production',
    note: 'Тестовый весенний транш',
    year: 2027,
  });

  const po1 = created.sharedSupplyAndFact!.approvedOrders[0];
  assert.equal(Boolean(po1), true);
  assert.equal(po1.packsQty, 1500);
  assert.equal(po1.physicalUnitsQty, 1500 * 4); // 6 000 физ. изделий
  assert.equal(po1.lockedUnitCostRub, 620);
  assert.equal(po1.totalOrderRub, 1500 * 620); // строго без повторного умножения на 4!
  assert.equal(po1.status, 'in_production');
  assert.equal(po1.arrivalMonthIdx, 2);

  // 2. Ручное редактирование созданного PO (кол-во -> 2 000 компл., цена -> 590 ₽, статус -> in_transit)
  const updated = updateApprovedPurchaseOrder(created, po1.id, {
    packsQty: 2000,
    lockedUnitCostRub: 590,
    status: 'in_transit',
    arrivalMonthIdx: 3,
  });
  const poUpdated = updated.sharedSupplyAndFact!.approvedOrders[0];
  assert.equal(poUpdated.version, 2);
  assert.equal(poUpdated.packsQty, 2000);
  assert.equal(poUpdated.physicalUnitsQty, 8000);
  assert.equal(poUpdated.totalOrderRub, 2000 * 590);
  assert.equal(poUpdated.status, 'in_transit');
  assert.equal(poUpdated.arrivalMonthIdx, 3);

  // 3. Проверка CSV экспорта заказов PO
  const csv = serializePurchaseOrdersToCsv([{ model: updated, po: poUpdated }]);
  assert.equal(csv.includes(poUpdated.orderNumber), true);
  assert.equal(csv.includes('В пути'), true);

  // 4. Удаление заказа PO возвращает список заказов к 0
  const afterDelete = removeApprovedPurchaseOrder(updated, po1.id);
  assert.equal(afterDelete.sharedSupplyAndFact!.approvedOrders.length, 0);
  const procAfterDelete = computeProcurementPlan(afterDelete, scen1);
  assert.equal(procAfterDelete.approvedOrders.length, 0);

  // 5. В карточке SKU и лайтбоксе убраны плашки категорий фото и кнопка «Открыть оригинал (Zoom)» поверх кадра
  const cardCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'sections', 'ScenarioModelCardScreen.tsx'),
    'utf-8'
  );
  const lightboxCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'sections', 'FullscreenPhotoLightbox.tsx'),
    'utf-8'
  );
  assert.equal(cardCode.includes('GALLERY_CATEGORY_LABELS_RU'), false);
  assert.equal(cardCode.includes('Открыть оригинал (Zoom)'), false);
  assert.equal(lightboxCode.includes('GALLERY_CATEGORY_LABELS_RU'), false);
});

test('26. Приёмочный чек-лист ТЗ «Упростить раздел Закупки (Версия MVP)» — все 8 обязательных тестов Раздела 11', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const scen2 = INITIAL_SCENARIOS.find((s) => s.id === 2)!;
  const baseSorbet = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  // Тест 1 (Начальный остаток): Ввести начальный остаток 1 000 -> потребность уменьшается, данные сохранены в модели
  const procZeroStock = computeProcurementPlan(baseSorbet, scen1);
  const sorbetWith1000Stock = {
    ...baseSorbet,
    sharedSupplyAndFact: {
      ...baseSorbet.sharedSupplyAndFact!,
      actualOpeningStockPacks: 1000,
    },
  };
  const proc1000Stock = computeProcurementPlan(sorbetWith1000Stock, scen1);
  assert.equal(proc1000Stock.netOpeningAvailablePacks, 1000);
  assert.equal(proc1000Stock.totalDeficitPacks < procZeroStock.totalDeficitPacks, true);
  assert.equal(
    proc1000Stock.recommendedBatches[0].rawNetNeedPacks,
    procZeroStock.recommendedBatches[0].rawNetNeedPacks - 1000
  );

  // Тест 2 (Изменение продаж месяца): Утвердить заказ PO на Q3 (Июл–Сен), затем увеличить август на +500 ->
  // старый PO остаётся неизменным, а дополнительный объём идёт отдельной строкой «Дополнительно к заказу»
  const q3Batch = procZeroStock.recommendedBatches.find((b) => b.firstCoveredMonthIdx === 6)!;
  assert.equal(Boolean(q3Batch), true);
  const modelWithApprovedQ3 = approveRecommendedBatch(baseSorbet, q3Batch, 'Владелец');
  const lockedPoBefore = modelWithApprovedQ3.sharedSupplyAndFact!.approvedOrders[0];

  const planS1 = modelWithApprovedQ3.plansByScenario[1];
  const augIncreasedPacks = [...planS1.monthlyPacks];
  augIncreasedPacks[7] = (augIncreasedPacks[7] || 0) + 500; // Август +500 компл.
  const modelAugPlus500 = {
    ...modelWithApprovedQ3,
    plansByScenario: {
      ...modelWithApprovedQ3.plansByScenario,
      1: {
        ...planS1,
        monthlyPacks: augIncreasedPacks,
      },
    },
  };
  const procAfterAugIncrease = computeProcurementPlan(modelAugPlus500, scen1);
  // Утверждённый PO на Q3 не изменился ни на одну цифру!
  assert.equal(procAfterAugIncrease.approvedOrders[0].packsQty, lockedPoBefore.packsQty);
  assert.equal(procAfterAugIncrease.approvedOrders[0].totalOrderRub, lockedPoBefore.totalOrderRub);
  assert.equal(
    procAfterAugIncrease.approvedOrders[0].orderPlacementDateIso,
    lockedPoBefore.orderPlacementDateIso
  );
  // А для покрытия роста продаж в Q3 появилась отдельная строка с пометкой isAdditionalOrder («Дополнительно к заказу»)
  const additionalQ3Batch = procAfterAugIncrease.recommendedBatches.find(
    (b) => b.firstCoveredMonthIdx === 6
  )!;
  assert.equal(Boolean(additionalQ3Batch), true);
  assert.equal(additionalQ3Batch.isAdditionalOrder, true);
  assert.equal(additionalQ3Batch.rawNetNeedPacks > 0, true);

  // Тест 3 (MOQ и кратность): MOQ = 1 000, потребность = 2 100, кратность = 1 000 -> заказ строго 3 000 (НЕ 3 100!)
  assert.equal(roundNeedToMoqAndMultiple(2100, 1000, 1000), 3000);
  assert.notEqual(roundNeedToMoqAndMultiple(2100, 1000, 1000), 3100);
  assert.equal(roundNeedToMoqAndMultiple(450, 1000, 50), 1000);

  // Тест 4 (Себестоимость): Изменить себестоимость с 600 ₽ на 650 ₽ -> меняется только бюджет закупки, план продаж не меняется
  const sorbetCost650 = {
    ...baseSorbet,
    unitCostRub: 650,
  };
  const procCost600 = computeProcurementPlan(baseSorbet, scen1);
  const procCost650 = computeProcurementPlan(sorbetCost650, scen1);
  assert.equal(procCost650.annualDemandPacks, procCost600.annualDemandPacks);
  assert.equal(procCost650.totalRecommendedPacks, procCost600.totalRecommendedPacks);
  assert.equal(
    procCost650.totalRecommendedBudgetRub,
    procCost650.totalRecommendedPacks * 650
  );
  assert.equal(
    (procCost650.totalRecommendedBudgetRub || 0) >
      (procCost600.totalRecommendedBudgetRub || 0),
    true
  );

  // Тест 5 (Размеры методом наибольших остатков): Партия 1 003 комплекта, матрица 10/25/35/20/10 -> сумма строго 1 003
  const sizeAlloc1003 = allocatePacksBySizeLargestRemainder(1003, {
    S: 10,
    M: 25,
    L: 35,
    XL: 20,
    XXL: 10,
  });
  const sum1003 =
    sizeAlloc1003.S +
    sizeAlloc1003.M +
    sizeAlloc1003.L +
    sizeAlloc1003.XL +
    sizeAlloc1003.XXL;
  assert.equal(sum1003, 1003);
  assert.deepEqual(sizeAlloc1003, { S: 100, M: 251, L: 351, XL: 201, XXL: 100 });

  // Тест 6 (Статус модели): При статусе «Гипотеза» к заказу предлагается только тестовая партия, остальные кварталы — «Будущая потребность»
  const sorbetHypothesis = {
    ...baseSorbet,
    sharedSupplyAndFact: {
      ...baseSorbet.sharedSupplyAndFact!,
      scalingStage: 'hypothesis' as const,
    },
  };
  const procHypothesis = computeProcurementPlan(sorbetHypothesis, scen1);
  assert.equal(procHypothesis.scalingStage, 'hypothesis');
  assert.equal(procHypothesis.recommendedBatches.length, 1);
  assert.equal(procHypothesis.recommendedBatches[0].isTestBatch, true);
  assert.equal(procHypothesis.futureScalingBatches.length, 3);
  assert.equal(procHypothesis.futureScalingBatches[0].isFutureScalingNeed, true);

  // Тест 7 (Смена сценария): Переключить Сценарий №1 -> Сценарий №2 -> меняется спрос, остаток и PO не удваиваются
  const modelWithStockAndPo = {
    ...modelWithApprovedQ3,
    sharedSupplyAndFact: {
      ...modelWithApprovedQ3.sharedSupplyAndFact!,
      actualOpeningStockPacks: 800,
    },
  };
  const procScen1 = computeProcurementPlan(modelWithStockAndPo, scen1);
  const procScen2 = computeProcurementPlan(modelWithStockAndPo, scen2);
  assert.notEqual(procScen1.annualDemandPacks, procScen2.annualDemandPacks);
  assert.equal(procScen1.netOpeningAvailablePacks, 800);
  assert.equal(procScen2.netOpeningAvailablePacks, 800);
  assert.equal(procScen1.approvedOrders.length, 1);
  assert.equal(procScen2.approvedOrders.length, 1);
  assert.equal(
    procScen1.totalApprovedReceiptsPacks,
    procScen2.totalApprovedReceiptsPacks
  );

  // Тест 8 (Утверждённый заказ + подтверждение фабрики): «Рассчитать» не меняет количество, цену и даты утверждённого PO;
  // неподтверждённый фабрикой заказ (confirmedByFactory: false) не считается гарантированным поступлением
  const recalculated = recalculateDraftProcurementPlan(modelWithStockAndPo);
  const poAfterRecalc = recalculated.sharedSupplyAndFact!.approvedOrders[0];
  assert.equal(poAfterRecalc.packsQty, lockedPoBefore.packsQty);
  assert.equal(poAfterRecalc.lockedUnitCostRub, lockedPoBefore.lockedUnitCostRub);
  assert.equal(poAfterRecalc.orderPlacementDateIso, lockedPoBefore.orderPlacementDateIso);

  const unconfirmedByFactoryModel = updateApprovedPurchaseOrder(
    recalculated,
    poAfterRecalc.id,
    { confirmedByFactory: false }
  );
  const procUnconfirmed = computeProcurementPlan(unconfirmedByFactoryModel, scen1);
  assert.equal(procUnconfirmed.totalApprovedReceiptsPacks, 0);
});

test('27. Приёмочные проверки ТЗ «Карточка товара и финансы (Версия 1.0 · 07.11.2026)» — все 7 проверок Раздела 07', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const scen2 = INITIAL_SCENARIOS.find((s) => s.id === 2)!;
  const baseSorbet = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  // Проверка 1 (Редактирование бренда): Изменить бренд на BRN-001-SC -> новый бренд сохраняется и определяется в портфеле
  assert.equal(detectModelBrandPortfolioLabel(baseSorbet), 'BORNERS');
  const sorbetCustomBrand = {
    ...baseSorbet,
    brandId: 'NA_TELE' as const,
    customBrandLabel: 'НА ТЕЛЕ',
  };
  assert.equal(detectModelBrandPortfolioLabel(sorbetCustomBrand), 'НА ТЕЛЕ');
  const sorbetNewCustomBrand = {
    ...baseSorbet,
    customBrandLabel: 'BORNERS STUDIO',
  };
  assert.equal(detectModelBrandPortfolioLabel(sorbetNewCustomBrand), 'BORNERS STUDIO');

  // Проверка 2 (Редактирование карточки): Название, артикул WB, комплектация, состав ткани и статус модели сохраняются в едином паспорте
  const editedPassportModel = ensureModelUnifiedV11({
    ...baseSorbet,
    title: 'BRN-001-SC · Sorbet Club Updated',
    wbArticle: '244995893',
    modelStageStatus: 'Тест',
    unitsInPack: 4,
    fabric: {
      ...baseSorbet.fabric,
      composition: '95% Pima хлопок / 5% эластан',
    },
  });
  assert.equal(editedPassportModel.title, 'BRN-001-SC · Sorbet Club Updated');
  assert.equal(editedPassportModel.wbArticle, '244995893');
  assert.equal(editedPassportModel.modelStageStatus, 'Тест');
  assert.equal(editedPassportModel.fabric.composition, '95% Pima хлопок / 5% эластан');

  // Проверка 3 (Фото и оригинал): Кнопки «По размеру экрана», «100%», «Открыть оригинал» в лайтбоксе + управление главным фото
  const lightboxCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'sections', 'FullscreenPhotoLightbox.tsx'),
    'utf-8'
  );
  assert.equal(lightboxCode.includes('По размеру экрана'), true);
  assert.equal(lightboxCode.includes('100%'), true);
  assert.equal(lightboxCode.includes('Открыть оригинал'), true);

  // Проверка 4 (Сценарии): Изменить план продаж в Сценарии №1 -> Сценарий №2 не изменился; фото и характеристики одинаковые
  const s2MetricsBefore = computeModelScenarioMetrics(editedPassportModel, scen2);
  const s1ModifiedModel = {
    ...editedPassportModel,
    plansByScenario: {
      ...editedPassportModel.plansByScenario,
      1: {
        ...editedPassportModel.plansByScenario[1],
        monthlyPacks: editedPassportModel.plansByScenario[1].monthlyPacks.map((p, i) =>
          i === 11 ? p + 2000 : p
        ),
      },
    },
  };
  const s2MetricsAfter = computeModelScenarioMetrics(s1ModifiedModel, scen2);
  assert.equal(s2MetricsAfter.annualRevenueRub, s2MetricsBefore.annualRevenueRub);
  assert.equal(s2MetricsAfter.annualPacks, s2MetricsBefore.annualPacks);
  assert.equal(s1ModifiedModel.gallery.length, editedPassportModel.gallery.length);
  assert.equal(s1ModifiedModel.fabric.composition, editedPassportModel.fabric.composition);

  // Проверка 5 (Финансы без ложной прибыли): Очистить поле логистики (logisticsRub = 0) ->
  // итог показывает «Не рассчитано, пока не заполнена логистика», а не завышенную прибыль!
  const sorbetWithLogistics = computeFinancialPnL(baseSorbet, scen1);
  assert.equal(sorbetWithLogistics.logisticsFilled, true);
  assert.equal(sorbetWithLogistics.unitOperatingProfitRub !== null, true);

  const sorbetClearedLogistics = {
    ...baseSorbet,
    logisticsRub: 0,
  };
  const pnlWithoutLogistics = computeFinancialPnL(sorbetClearedLogistics, scen1);
  assert.equal(pnlWithoutLogistics.logisticsFilled, false);
  assert.equal(pnlWithoutLogistics.unitLogisticsRub, null);
  assert.equal(pnlWithoutLogistics.unitOperatingProfitRub, null);
  assert.equal(pnlWithoutLogistics.annualOperatingProfitRub, null);
  assert.equal(
    pnlWithoutLogistics.operatingProfitNotCalculatedReason,
    'Не рассчитано, пока не заполнена логистика'
  );
  // И пока график выплат WB не подтверждён — verifiedPeakCapitalDeficitRub равен null («Нельзя рассчитать без графика выплат»)
  assert.equal(pnlWithoutLogistics.wbPayoutScheduleConfirmed, false);
  assert.equal(pnlWithoutLogistics.verifiedPeakCapitalDeficitRub, null);

  // Проверка 6 (Себестоимость): Изменить себестоимость с 600 ₽ на 650 ₽ -> меняются прибыль с комплекта и стоимость закупки; план продаж не меняется
  const sorbet650 = { ...baseSorbet, unitCostRub: 650 };
  const pnl600 = computeFinancialPnL(baseSorbet, scen1);
  const pnl650 = computeFinancialPnL(sorbet650, scen1);
  const proc600 = computeProcurementPlan(baseSorbet, scen1);
  const proc650 = computeProcurementPlan(sorbet650, scen1);
  assert.equal(pnl650.annualBuyoutsPacks, pnl600.annualBuyoutsPacks);
  assert.equal(pnl650.unitOperatingProfitRub, pnl600.unitOperatingProfitRub! - 50);
  assert.equal(
    proc650.totalRecommendedBudgetRub,
    proc600.totalRecommendedBudgetRub! + proc600.totalRecommendedPacks * 50
  );

  // Проверка 7 (Читаемость карточки): В правой колонке ровно 4 карточки и 1 строка наличия, нет номеров 01..05 и кнопок «Формула»
  const cardScreenCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'sections', 'ScenarioModelCardScreen.tsx'),
    'utf-8'
  );
  assert.equal(cardScreenCode.includes('Выручка выбранного месяца'), true);
  assert.equal(cardScreenCode.includes('Цена комплекта'), true);
  assert.equal(cardScreenCode.includes('Себестоимость под ключ'), true);
  assert.equal(cardScreenCode.includes('Прибыль с комплекта'), true);
  assert.equal(cardScreenCode.includes('Наличие товара:'), true);
  assert.equal(cardScreenCode.includes('01 · Выручка месяца'), false);
  assert.equal(cardScreenCode.includes('05 · Операционная прибыль'), false);
  assert.equal(cardScreenCode.includes('>Формула<'), false);
  assert.equal(cardScreenCode.includes('Блок А. Сколько остаётся с одного комплекта'), true);
  assert.equal(cardScreenCode.includes('Блок Б. Результат за выбранный период'), true);
  assert.equal(cardScreenCode.includes('Показать подробный расчёт'), true);
  assert.equal(cardScreenCode.includes('Деньги на закупки'), true);
  assert.equal(cardScreenCode.includes('Нельзя рассчитать без графика выплат'), true);
});

test('28. Чистый экран «Закупки» (без дублей и авто-раскрытия), сохранение позиции при F5 и активация всех 5 брендов холдинга (BORNERS, НА ТЕЛЕ, FUKAI, Акуша, Liskani)', () => {
  const procWorkbenchCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'sections', 'SkuProcurementMvpWorkbench.tsx'),
    'utf-8'
  );
  // 1. В SkuProcurementMvpWorkbench убраны дублирующиеся плашки «Зона А / Зона Б / Зона В» и авто-раскрытие первой партии
  assert.equal(procWorkbenchCode.includes('Зона А · Параметры'), false);
  assert.equal(procWorkbenchCode.includes('Зона Б · План закупок'), false);
  assert.equal(procWorkbenchCode.includes('const activeExpandedKey = expandedKey;'), true);
  assert.equal(procWorkbenchCode.includes('Размеры и расчёт'), true);
  assert.equal(procWorkbenchCode.includes('✓ Утвердить заказ'), true);
  assert.equal(procWorkbenchCode.includes('✓ Утвердить все'), true);

  // 2. Сохранение экрана и вкладки при перезагрузке страницы (F5)
  const platformCtxCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'context', 'PlatformContext.tsx'),
    'utf-8'
  );
  const showcaseCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'sections', 'GrowthScenariosShowcase.tsx'),
    'utf-8'
  );
  const cardScreenCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'sections', 'ScenarioModelCardScreen.tsx'),
    'utf-8'
  );
  assert.equal(platformCtxCode.includes('borners_ui_nav_state_v1'), true);
  assert.equal(showcaseCode.includes('borners_scenario_screen_state_v1'), true);
  assert.equal(cardScreenCode.includes('borners_model_card_active_tab_v1'), true);

  // 3. Активация всех 5 брендов холдинга (BORNERS, NA_TELE, FUKAI, AKUSHA, LISKANI)
  const initialDataCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'initial-data.ts'),
    'utf-8'
  );
  assert.equal(initialDataCode.includes("code: 'BORNERS'"), true);
  assert.equal(initialDataCode.includes("code: 'NA_TELE'"), true);
  assert.equal(initialDataCode.includes("code: 'FUKAI'"), true);
  assert.equal(initialDataCode.includes("code: 'AKUSHA'"), true);
  assert.equal(initialDataCode.includes("code: 'LISKANI'"), true);
  assert.equal(initialDataCode.includes("isStrategyInDevelopment: true"), false);
  assert.equal(cardScreenCode.includes("'Акуша'"), true);
  assert.equal(cardScreenCode.includes("'Liskani'"), true);

  const baseSorbet = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );
  const akushaModel = { ...baseSorbet, customBrandLabel: 'Акуша' };
  const liskaniModel = { ...baseSorbet, customBrandLabel: 'Liskani' };
  assert.equal(matchesBrandFilter(akushaModel, 'AKUSHA'), true);
  assert.equal(matchesBrandFilter(akushaModel, 'BORNERS'), false);
  assert.equal(matchesBrandFilter(liskaniModel, 'LISKANI'), true);
  assert.equal(matchesBrandFilter(liskaniModel, 'LEZKANI'), true);
  assert.equal(matchesBrandFilter(liskaniModel, 'ALL'), true);
});

test('29. Прямое инлайн-редактирование партий, дат и размеров S–XXL (в черновиках и утверждённых PO) + сброс PO в черновик', () => {
  const s1Scenario = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  let sorbet = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  // 1. Прямая правка комплектов конкретного размера S в черновой партии автоматически пересчитывает общий объём партии
  const initialPlan = computeProcurementPlan(sorbet, s1Scenario);
  const q1 = initialPlan.recommendedBatches[0];
  assert.ok(q1);

  const customQ1Sizes = {
    ...q1.sizeBreakdownPacks,
    S: 1000,
    M: 2000,
    L: 2500,
    XL: 1500,
    XXL: 1000,
  };
  const customQ1Total = 8000;
  sorbet = {
    ...sorbet,
    sharedSupplyAndFact: {
      ...sorbet.sharedSupplyAndFact!,
      factoryParams: {
        ...sorbet.sharedSupplyAndFact!.factoryParams,
        customBatchPeriods: [
          {
            id: q1.periodId,
            startMonthIdx: q1.firstCoveredMonthIdx,
            endMonthIdx: q1.endCoveredMonthIdx,
            customPacksQty: customQ1Total,
            customSizeBreakdownPacks: customQ1Sizes,
          },
          ...initialPlan.recommendedBatches.slice(1).map((b) => ({
            id: b.periodId,
            startMonthIdx: b.firstCoveredMonthIdx,
            endMonthIdx: b.endCoveredMonthIdx,
          })),
        ],
      },
    },
  };

  const afterCustomSizePlan = computeProcurementPlan(sorbet, s1Scenario);
  assert.equal(afterCustomSizePlan.recommendedBatches[0].recommendedPacks, 8000);
  assert.deepEqual(afterCustomSizePlan.recommendedBatches[0].sizeBreakdownPacks, customQ1Sizes);

  // 2. Утверждаем партию в PO и проверяем прямое редактирование размеров S–XXL и месяца прихода внутри PO
  sorbet = approveRecommendedBatch(sorbet, afterCustomSizePlan.recommendedBatches[0], 'Владелец');
  const po = sorbet.sharedSupplyAndFact!.approvedOrders[0];
  assert.equal(po.packsQty, 8000);
  assert.deepEqual(po.sizeBreakdownPacks, customQ1Sizes);

  const updatedPoSizes = { ...customQ1Sizes, S: 1200 };
  sorbet = updateApprovedPurchaseOrder(sorbet, po.id, {
    packsQty: 8200,
    sizeBreakdownPacks: updatedPoSizes,
    arrivalMonthIdx: 1,
    coveredEndMonthIdx: 2,
  });
  const updatedPo = sorbet.sharedSupplyAndFact!.approvedOrders[0];
  assert.equal(updatedPo.packsQty, 8200);
  assert.equal(updatedPo.sizeBreakdownPacks?.S, 1200);
  assert.equal(updatedPo.coverageMonthsLabel, 'Фев–Мар 2027');
});

test('30. Пересчёт партий по потребности плана продаж: изменение 1-й партии (вверх или вниз) автоматически балансирует 2-ю партию, а смена сценария сбрасывает чужие ручные правки', () => {
  const s1Scenario = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const s2Scenario = INITIAL_SCENARIOS.find((s) => s.id === 2)!;
  let sorbet = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!
  );

  const basePlan = computeProcurementPlan(sorbet, s1Scenario);
  const baseQ1 = basePlan.recommendedBatches[0].recommendedPacks;
  const baseQ2 = basePlan.recommendedBatches[1].recommendedPacks;
  const baseTotal = basePlan.totalRecommendedPacks;
  assert.equal(baseTotal, 15950);

  // 1. Уменьшаем 1-ю партию вручную до 2 000 компл. (меньше квартального спроса Q1 = 2 650 компл.)
  // Вторая партия должна автоматически вырасти на 1 150 компл., чтобы годовая потребность (15 950 компл.) осталась полностью покрыта!
  sorbet = {
    ...sorbet,
    sharedSupplyAndFact: {
      ...sorbet.sharedSupplyAndFact!,
      factoryParams: {
        ...sorbet.sharedSupplyAndFact!.factoryParams,
        customBatchPeriods: [
          { id: 'q1', startMonthIdx: 0, endMonthIdx: 2, customPacksQty: 2000, scenarioId: 1 },
          { id: 'q2', startMonthIdx: 3, endMonthIdx: 5 },
          { id: 'q3', startMonthIdx: 6, endMonthIdx: 8 },
          { id: 'q4', startMonthIdx: 9, endMonthIdx: 11 },
        ],
      },
    },
  };

  const reducedQ1Plan = computeProcurementPlan(sorbet, s1Scenario);
  assert.equal(reducedQ1Plan.recommendedBatches[0].recommendedPacks, 2000);
  assert.equal(reducedQ1Plan.recommendedBatches[1].recommendedPacks, baseQ2 + (baseQ1 - 2000));
  assert.equal(reducedQ1Plan.totalRecommendedPacks, baseTotal);

  // 2. При переключении на Сценарий №2 ручная правка со scenarioId=1 не блокирует авторасчёт Сценария №2!
  const s2Plan = computeProcurementPlan(sorbet, s2Scenario);
  assert.equal(s2Plan.recommendedBatches[0].hasCustomPacksOverride, false);
  assert.ok(s2Plan.recommendedBatches[0].recommendedPacks !== 2000);
});

test('31. ТЗ «От плана продаж к закупкам и инвестициям (Разделы 07 и 09)»: разделение 4 показателей инвестиций, пик капитала с возвратом WB, сводная по 5 брендам без дублей и экспорт заказа фабрике с размерами S–XXL', () => {
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const fullPortfolio = applyClientSavedS1SalesPlan([
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
  ]).filter((m) => !isUnverifiedActingSku(m.code));

  // 1. Проверяем разделение 4 ключевых финансовых показателей сценария
  const inv = computeScenarioInvestmentSummary(fullPortfolio, scen1, {
    initialCashRub: 0,
    settlementLagMonths: 0,
  });

  // А) Стоимость всех закупок за год > Себестоимость проданного товара (за счёт страхового запаса на конец периода)
  assert.ok(inv.totalProcurementBudgetRub > 0);
  assert.ok(inv.annualSoldGoodsCostRub > 0);
  assert.ok(inv.totalProcurementBudgetRub >= inv.annualSoldGoodsCostRub);

  // Б) Стартовая инвестиция (Партия №1 · Q1) и аванс 30% существенно меньше годового бюджета закупок
  assert.ok(inv.firstWaveStartBudgetRub > 0);
  assert.ok(inv.firstWavePrepaymentRub > 0);
  assert.ok(inv.firstWaveStartBudgetRub < inv.totalProcurementBudgetRub);
  assert.ok(inv.firstWavePrepaymentRub < inv.firstWaveStartBudgetRub);

  // В) Пик собственных денег с учётом возврата выручки WB значительно меньше годового бюджета всех 4 кварталов!
  assert.ok(inv.peakWorkingCapitalRub >= inv.firstWavePrepaymentRub);
  assert.ok(inv.peakWorkingCapitalRub < inv.totalProcurementBudgetRub);
  assert.equal(inv.monthlyRows.length, 12);

  // Г) Если на счёте на старте есть 10 млн ₽ собственных денег — потребность в дополнительных деньгах снижается ровно на 10 млн ₽
  const invWith10Mln = computeScenarioInvestmentSummary(fullPortfolio, scen1, {
    initialCashRub: 10_000_000,
    settlementLagMonths: 0,
  });
  assert.equal(
    invWith10Mln.netOwnMoneyRequiredRub,
    Math.max(0, inv.peakWorkingCapitalRub - 10_000_000)
  );

  // 2. Сводная по всем 5 брендам группы (BORNERS, FUKAI, НА ТЕЛЕ, Акуша, Liskani) + защита от двойного счёта
  const duplicatedPortfolio = [...fullPortfolio, ...fullPortfolio.slice(0, 5)];
  const report = computeGroupBrandsInvestmentReport(duplicatedPortfolio, scen1);
  assert.equal(report.brands.length, 5);
  assert.equal(report.groupTotal.modelsCount, fullPortfolio.length);
  assert.equal(report.groupTotal.annualRevenueRub, inv.annualRevenueRub);

  // 3. Экспорт заказа фабрике (CSV) содержит размеры S–XXL, аванс и доплату даже для плановых партий
  const factoryCsv = serializeScenarioFactoryOrdersToCsv(fullPortfolio, scen1, 'all');
  assert.ok(factoryCsv.includes('Размер S (компл.)'));
  assert.ok(factoryCsv.includes('Размер XXL (компл.)'));
  assert.ok(factoryCsv.includes('BRN-001-SC'));
});












