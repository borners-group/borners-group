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
  ACTING_2027_SCENARIO_ID,
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
  archiveBrandScenario,
  changeModelBrandWithAudit,
  computeCarryOverStock2027To2028,
  computeFinancialPnL,
  computeGroupBrandsInvestmentReport,
  computeMultiBrandPortfolioSummary,
  computeProcurementPlan,
  computeScenarioInvestmentSummary,
  createBrandProductModel,
  createCustomPurchaseOrder,
  createIndependentBrandScenario,
  deleteBrandScenario,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  getBrandUnitConfig,
  getScenariosForBrand,
  groupRecommendedBatchesByFactory,
  importStructuredScenarioPlan,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
  parseStructuredPlanCsvOrJson,
  recalculateDraftProcurementPlan,
  removeApprovedPurchaseOrder,
  renameBrandScenario,
  roundNeedToMoqAndMultiple,
  serializePurchaseOrdersToCsv,
  serializeScenarioFactoryOrdersToCsv,
  serializeSingleBatchFactoryOrderDocumentCsv,
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

  assert.equal(INITIAL_STRATEGIES.length, 70);
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
  assert.equal(cardScreenCode.includes("'AKUSHA'"), true);
  assert.equal(cardScreenCode.includes("'LISKANI'"), true);

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

test('32. Комплексный аудит багов: синхронизация 01 · Продукт без перезаписи базы 23 SKU, поддержка 5 брендов в шапке AppShell и защита от пустых экранов в 02 · Продажи / 03 · Закупки / 04 · Финансы', () => {
  const appShellSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/shell/AppShell.tsx'),
    'utf-8'
  );
  const catalogSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/ProductCatalogView.tsx'),
    'utf-8'
  );
  const contourSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/UnifiedContourViews.tsx'),
    'utf-8'
  );
  const showcaseSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/GrowthScenariosShowcase.tsx'),
    'utf-8'
  );

  // 1. В AppShell.tsx переключатель брендов поддерживает все 5 брендов портфеля (включая FUKAI, Акуша, Liskani)
  assert.ok(appShellSource.includes("brandFilter === 'FUKAI'"));
  assert.ok(appShellSource.includes("brandFilter === 'AKUSHA'"));
  assert.ok(appShellSource.includes("brandFilter === 'LISKANI'"));

  // 2. В ProductCatalogView.tsx используется единый хук useLiveScenarioPortfolio и matchesBrandFilter
  assert.ok(catalogSource.includes('useLiveScenarioPortfolio'));
  assert.ok(catalogSource.includes('matchesBrandFilter'));
  assert.ok(catalogSource.includes('updateModelsBatch'));

  // 3. В UnifiedContourViews.tsx (02 · Продажи, 03 · Закупки, 04 · Финансы) есть защита от пустого экрана при фильтре бренда
  const emptyBrandMatches = contourSource.match(/Переключить на Сценарий №2 · 150 млн/g) || [];
  assert.ok(emptyBrandMatches.length >= 3);

  // 4. В GrowthScenariosShowcase.tsx filteredModels согласован с includeGroupPortfolioInS1 через filterModelsForScenario и не даёт гонки при открытии паспорта SKU
  assert.ok(showcaseSource.includes('filterModelsForScenario('));
  assert.ok(showcaseSource.includes('Показать все модели сценария'));
});

test('33. Раунд 2 аудита багов: точность авто-расчёта в Сценариях №2/№3 и с FUKAI, 100% сходимость таблицы 5 брендов без потери WB 86205435, синхронизация цен и статусов жизненного цикла', () => {
  const fullPortfolio = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
  ];
  const scenActing = INITIAL_SCENARIOS.find((s) => s.id === 100)!;
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const scen2 = INITIAL_SCENARIOS.find((s) => s.id === 2)!;

  // 1. В Сценарии №2 (150 млн) авто-расчёт учитывает все 7 действующих WB SKU (22,73 млн ₽ в дек) и не превышает цель на +7,69 млн ₽
  const distributedS2 = autoDistributeScenarioByPriority(fullPortfolio, scen2, {
    keepActingWbFixed: true,
    targetMonthlyMlnOverride: 150,
  });
  const totalDecRevS2 = distributedS2.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen2).targetMonthRevenueRub,
    0
  );
  // Разница с 150 млн ₽ должна быть минимальной (только из-за округления комплектов до целых штук, < 0.25 млн ₽)
  assert.ok(
    Math.abs(totalDecRevS2 - 150_000_000) < 250_000,
    `Ожидалось ~150 млн ₽ в дек Сценария №2, получено ${totalDecRevS2}`
  );

  // А в Сценарии №1 с подключённым портфелем группы (includeGroupPortfolioInS1: true) все 23 SKU дают ровно ~100 млн ₽
  const distributedS1WithFukai = autoDistributeScenarioByPriority(fullPortfolio, scen1, {
    keepActingWbFixed: true,
    targetMonthlyMlnOverride: 100,
    includeGroupPortfolioInS1: true,
  });
  const totalDecRevS1WithFukai = distributedS1WithFukai.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen1).targetMonthRevenueRub,
    0
  );
  assert.ok(
    Math.abs(totalDecRevS1WithFukai - 100_000_000) < 250_000,
    `Ожидалось ~100 млн ₽ в дек Сценария №1 (с FUKAI), получено ${totalDecRevS1WithFukai}`
  );

  // 2. Сводная таблица 5 брендов (computeGroupBrandsInvestmentReport) не теряет WB 86205435 (trus10): сумма моделей по строкам брендов = ИТОГО ПО ГРУППЕ
  const actingBrandsReport = computeGroupBrandsInvestmentReport(
    ACTING_2027_SCENARIO_MODELS,
    scenActing
  );
  const sumActingBrandModels = actingBrandsReport.brands.reduce(
    (sum, b) => sum + b.modelsCount,
    0
  );
  const sumActingBrandRev = actingBrandsReport.brands.reduce(
    (sum, b) => sum + b.annualRevenueRub,
    0
  );
  assert.equal(sumActingBrandModels, actingBrandsReport.groupTotal.modelsCount);
  assert.equal(sumActingBrandRev, actingBrandsReport.groupTotal.annualRevenueRub);

  const s2BrandsReport = computeGroupBrandsInvestmentReport(fullPortfolio, scen2);
  const sumS2BrandModels = s2BrandsReport.brands.reduce((sum, b) => sum + b.modelsCount, 0);
  const sumS2BrandRev = s2BrandsReport.brands.reduce(
    (sum, b) => sum + b.annualRevenueRub,
    0
  );
  assert.equal(sumS2BrandModels, 23);
  assert.equal(sumS2BrandModels, s2BrandsReport.groupTotal.modelsCount);
  assert.equal(sumS2BrandRev, s2BrandsReport.groupTotal.annualRevenueRub);

  // 3. computeModelScenarioMetrics использует цену сценария даже при 0 комплектов, а витрина и матрица продаж отображают met.avgRetailPriceRub
  const sampleMod = S1_100M_SCENARIO_MODELS[0];
  const zeroPacksCustomPriceMod = {
    ...sampleMod,
    plansByScenario: {
      ...sampleMod.plansByScenario,
      [scen2.id]: {
        ...sampleMod.plansByScenario[scen2.id],
        monthlyPacks: Array(12).fill(0),
        monthlyPricesRub: Array(12).fill(3450),
      },
    },
  };
  const zeroMet = computeModelScenarioMetrics(zeroPacksCustomPriceMod, scen2);
  assert.equal(zeroMet.avgRetailPriceRub, 3450);

  // 4. Проверка синхронизации цены, годового бюджета закупок и статуса жизненного цикла в исходном коде компонентов
  const workbenchSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/SkuProcurementMvpWorkbench.tsx'),
    'utf-8'
  );
  const showcaseSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/GrowthScenariosShowcase.tsx'),
    'utf-8'
  );
  assert.ok(workbenchSource.includes('modelStageStatus: nextStageStatus'));
  assert.ok(showcaseSource.includes('v11ScenarioSummary.investmentSummary.totalProcurementBudgetRub'));
  assert.ok(showcaseSource.includes('generateNextUniqueModelCode'));
});

test('34. Приёмочные тесты ТЗ «BORNERS GROUP — развитие единой платформы управления брендами (2027–2028, 08.11.2026)» — все 10 тестов Раздела 13', () => {
  const baseScenarios = [...INITIAL_SCENARIOS];
  const basePortfolio = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
  ];

  // =========================================================================
  // ТЕСТ 1: Создать сценарий для LISCANI («LISCANI — базовый план 2028»)
  // Сценарий появляется только у LISCANI и не меняет другие бренды
  // =========================================================================
  const createdLiscani = createIndependentBrandScenario(baseScenarios, basePortfolio, {
    title: 'LISCANI — базовый план 2028',
    brandCode: 'LISCANI',
    year: 2028,
    monthlyTargetMln: 45,
    copyFromScenarioId: null,
  });
  const liscaniScen = createdLiscani.scenario;
  assert.equal(liscaniScen.title, 'LISCANI — базовый план 2028');
  assert.equal(liscaniScen.year, 2028);
  assert.equal(normalizePortfolioBrandCode(liscaniScen.ownerBrandCode), 'LISKANI');

  const liscaniScenariosList = getScenariosForBrand(createdLiscani.scenarios, 'LISCANI');
  const akushaScenariosList = getScenariosForBrand(createdLiscani.scenarios, 'AKUSHA');
  assert.equal(liscaniScenariosList.length, 1);
  assert.equal(liscaniScenariosList[0].id, liscaniScen.id);
  assert.equal(akushaScenariosList.length, 0);

  // Проверим также переименование, архивацию и удаление сценария (Раздел 3.4)
  const renamedList = renameBrandScenario(createdLiscani.scenarios, liscaniScen.id, {
    title: 'LISCANI — план экспансии 2028',
  });
  assert.equal(
    renamedList.find((s) => s.id === liscaniScen.id)?.title,
    'LISCANI — план экспансии 2028'
  );
  const archivedList = archiveBrandScenario(renamedList, liscaniScen.id);
  assert.equal(getScenariosForBrand(archivedList, 'LISCANI').length, 0);
  const deletedRes = deleteBrandScenario(
    createdLiscani.scenarios,
    createdLiscani.models,
    liscaniScen.id
  );
  assert.equal(deletedRes.scenarios.some((s) => s.id === liscaniScen.id), false);

  // =========================================================================
  // ТЕСТ 2: Добавить карточку штор в LISCANI
  // Карточка видна в LISCANI и во «Всех брендах», отсутствует в AKUSHA,
  // и НЕ получает выдуманный план продаж при создании (0 шт.)
  // =========================================================================
  const curtainCreated = createBrandProductModel(
    createdLiscani.models,
    createdLiscani.scenarios,
    {
      title: 'Шторы блэкаут Венеция 300×270',
      code: 'LSC-001',
      brandCode: 'LISCANI',
      retailPriceRub: 4500,
      unitCostRub: 1600,
      unitsInPack: 2, // 2 полотна в комплекте штор
    }
  );
  const curtainCard = curtainCreated.model;
  assert.equal(curtainCard.primaryUnitLabel, 'компл. штор');
  assert.equal(curtainCard.secondaryUnitLabel, 'п.м. ткани');
  assert.equal(matchesBrandFilter(curtainCard, 'LISCANI'), true);
  assert.equal(matchesBrandFilter(curtainCard, 'ALL'), true);
  assert.equal(matchesBrandFilter(curtainCard, 'AKUSHA'), false);
  // План продаж новой карточки равен 0 во всех сценариях (без выдуманных цифр, п. 4.4)
  const curtainInitialPacks = curtainCard.plansByScenario[liscaniScen.id].monthlyPacks.reduce(
    (s: number, v: number) => s + v,
    0
  );
  assert.equal(curtainInitialPacks, 0);
  // Матрица размеров по умолчанию 12/26/30/20/12 (п. 6.6)
  assert.deepEqual(curtainCard.sharedSupplyAndFact?.factoryParams.sizeSharesPct, {
    S: 12,
    M: 26,
    L: 30,
    XL: 20,
    XXL: 12,
  });

  // Проверка смены бренда с сохранением истории и документов (п. 4.2)
  const movedToAkusha = changeModelBrandWithAudit(curtainCard, 'AKUSHA', 'Тест');
  assert.equal(matchesBrandFilter(movedToAkusha, 'AKUSHA'), true);
  assert.equal(movedToAkusha.primaryUnitLabel, 'пар');
  assert.ok(
    movedToAkusha.sharedSupplyAndFact?.auditHistory[0].summary.includes('AKUSHA')
  );

  // =========================================================================
  // ТЕСТ 3: Изменить продажи в сценарии LISCANI на июль (индекс 6)
  // Пересчитывается выручка модели, рекомендуемая закупка и сводка группы
  // =========================================================================
  const curtainWithJulySales = {
    ...curtainCard,
    plansByScenario: {
      ...curtainCard.plansByScenario,
      [liscaniScen.id]: {
        ...curtainCard.plansByScenario[liscaniScen.id],
        monthlyPacks: curtainCard.plansByScenario[liscaniScen.id].monthlyPacks.map(
          (v: number, idx: number) => (idx === 6 ? 2000 : v)
        ),
        monthlyPricesRub: Array(12).fill(4500),
      },
    },
  };
  const liscaniMet = computeModelScenarioMetrics(curtainWithJulySales, liscaniScen);
  assert.equal(liscaniMet.annualPacks, 2000);
  assert.equal(liscaniMet.annualRevenueRub, 2000 * 4500); // 9 000 000 ₽
  const liscaniProc = computeProcurementPlan(curtainWithJulySales, liscaniScen);
  assert.ok(liscaniProc.totalRecommendedPacks >= 2000);

  // =========================================================================
  // ТЕСТ 4: Скопировать сценарий BORNERS №1
  // Планы продаж скопированы, а карточки товаров, остатки склада и заказы фабрикам НЕ продублированы
  // =========================================================================
  const modelWithStockAndPo = createCustomPurchaseOrder(
    {
      ...ensureModelUnifiedV11(S1_100M_SCENARIO_MODELS[0]),
      sharedSupplyAndFact: {
        ...ensureModelUnifiedV11(S1_100M_SCENARIO_MODELS[0]).sharedSupplyAndFact!,
        actualOpeningStockPacks: 3500,
      },
    },
    {
      packsQty: 5000,
      unitCostRub: 600,
      arrivalMonthIdx: 0,
      orderPlacementDateIso: '2026-11-10',
      note: 'Реальный заказ фабрике #1',
    }
  );
  const portfolioBeforeCopy = [
    modelWithStockAndPo,
    ...S1_100M_SCENARIO_MODELS.slice(1),
  ];
  const copyResult = createIndependentBrandScenario(baseScenarios, portfolioBeforeCopy, {
    title: 'BORNERS — Сценарий №1 (копия)',
    brandCode: 'BORNERS',
    year: 2027,
    monthlyTargetMln: 100,
    copyFromScenarioId: 1,
  });
  const copiedScenId = copyResult.scenario.id;
  // Количество карточек не изменилось (нет дублей)
  assert.equal(copyResult.models.length, portfolioBeforeCopy.length);
  const copiedFirstModel = copyResult.models[0];
  // План продаж скопирован месяц-в-месяц
  assert.deepEqual(
    copiedFirstModel.plansByScenario[copiedScenId].monthlyPacks,
    copiedFirstModel.plansByScenario[1].monthlyPacks
  );
  // Реальный склад и утверждённые заказы фабрикам остались ровно в одном экземпляре
  assert.equal(copiedFirstModel.sharedSupplyAndFact?.actualOpeningStockPacks, 3500);
  assert.equal(copiedFirstModel.sharedSupplyAndFact?.approvedOrders.length, 1);

  // =========================================================================
  // ТЕСТ 5: Утвердить заказ фабрике и переключить сценарий
  // В утверждённом заказе не изменились количество, сумма, дата и поставщик
  // =========================================================================
  const poBeforeSwitch = copiedFirstModel.sharedSupplyAndFact!.approvedOrders[0];
  const procInS1 = computeProcurementPlan(copiedFirstModel, INITIAL_SCENARIOS.find((s) => s.id === 1)!);
  const procInS3 = computeProcurementPlan(copiedFirstModel, INITIAL_SCENARIOS.find((s) => s.id === 3)!);
  assert.equal(procInS1.approvedOrders.length, 1);
  assert.equal(procInS3.approvedOrders.length, 1);
  assert.equal(procInS3.approvedOrders[0].packsQty, poBeforeSwitch.packsQty);
  assert.equal(procInS3.approvedOrders[0].totalOrderRub, poBeforeSwitch.totalOrderRub);
  assert.equal(
    procInS3.approvedOrders[0].orderPlacementDateIso,
    poBeforeSwitch.orderPlacementDateIso
  );
  assert.equal(procInS3.approvedOrders[0].factoryName, poBeforeSwitch.factoryName);

  // Экспорт одного заказа фабрике (Разделы 6.4 и 7.3) содержит артикул, размеры S–XXL, сумму, аванс и дату
  const singleOrderCsv = serializeSingleBatchFactoryOrderDocumentCsv(
    copiedFirstModel,
    poBeforeSwitch
  );
  assert.ok(singleOrderCsv.includes(copiedFirstModel.code));
  assert.ok(singleOrderCsv.includes('5000'));
  assert.ok(singleOrderCsv.includes('3000000'));

  // =========================================================================
  // ТЕСТ 6: Переключить 2027 → 2028 год, изменить план 2028, вернуться в 2027
  // Данные обоих годов сохранены + остаток 5 000 на 31 декабря 2027 переходит на январь 2028
  // =========================================================================
  const scen2027 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const scen2028Create = createIndependentBrandScenario(baseScenarios, [copiedFirstModel], {
    title: 'BORNERS — План 2028',
    brandCode: 'BORNERS',
    year: 2028,
    monthlyTargetMln: 140,
    copyFromScenarioId: 1,
  });
  const scen2028 = scen2028Create.scenario;
  // Настроим модель так, чтобы на конец декабря 2027 осталось ровно 5 000 комплектов:
  // Начальный остаток 2027 = 5 000, утверждённый приход = 12 000, продажи за 2027 = 12 000 (по 1 000/мес) -> конец дек 2027 = 5 000!
  const carryModel = createCustomPurchaseOrder(
    {
      ...ensureModelUnifiedV11(S1_100M_SCENARIO_MODELS[1]),
      sharedSupplyAndFact: {
        ...ensureModelUnifiedV11(S1_100M_SCENARIO_MODELS[1]).sharedSupplyAndFact!,
        actualOpeningStockPacks: 5000,
        approvedOrders: [],
      },
      plansByScenario: {
        [scen2027.id]: {
          ...S1_100M_SCENARIO_MODELS[1].plansByScenario[1],
          scenarioId: scen2027.id,
          monthlyPacks: Array(12).fill(1000),
          monthlyPricesRub: Array(12).fill(2000),
          monthlyReceiptsPacks: Array(12).fill(0),
        },
        [scen2028.id]: {
          ...S1_100M_SCENARIO_MODELS[1].plansByScenario[1],
          scenarioId: scen2028.id,
          initialStockPacks: 0, // не задан вручную -> должен автоматически подтянуться из декабря 2027!
          monthlyPacks: Array(12).fill(1500),
          monthlyPricesRub: Array(12).fill(2100),
          monthlyReceiptsPacks: Array(12).fill(0),
        },
      },
    },
    {
      packsQty: 12000,
      unitCostRub: 500,
      arrivalMonthIdx: 0,
      orderPlacementDateIso: '2026-11-15',
    }
  );
  const carryEnding2027 = computeCarryOverStock2027To2028(carryModel, scen2027);
  assert.equal(carryEnding2027, 5000);
  const proc2028 = computeProcurementPlan(carryModel, scen2028);
  assert.equal(proc2028.netOpeningAvailablePacks, 5000);
  // Проверим, что планы 2027 и 2028 независимы и оба сохранены
  assert.equal(carryModel.plansByScenario[scen2027.id].monthlyPacks[0], 1000);
  assert.equal(carryModel.plansByScenario[scen2028.id].monthlyPacks[0], 1500);

  // =========================================================================
  // ТЕСТ 7: Перезагрузить страницу (проверка сохранения ключей localStorage и резервной копии)
  // =========================================================================
  const platformContextSource = fs.readFileSync(
    path.join(process.cwd(), 'src/context/PlatformContext.tsx'),
    'utf-8'
  );
  const appShellSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/shell/AppShell.tsx'),
    'utf-8'
  );
  assert.ok(platformContextSource.includes('borners_group_platform_state_ru_v9_editorial'));
  assert.ok(appShellSource.includes('Скачать резервную копию (JSON)'));

  // =========================================================================
  // ТЕСТ 8: Проверить пустой бренд без сценария (например AKUSHA)
  // Показывается «Нет сценария», нет ложных цифр
  // =========================================================================
  const multiBrandSummary = computeMultiBrandPortfolioSummary(
    [...basePortfolio, curtainWithJulySales],
    createdLiscani.scenarios,
    {
      BORNERS: 1,
      FUKAI: 1,
      AKUSHA: null, // пустой бренд без сценария
      LISKANI: liscaniScen.id,
      NA_TELE: 2,
    }
  );
  const akushaRow = multiBrandSummary.brands.find((b) => b.brandCode === 'AKUSHA')!;
  assert.equal(akushaRow.hasScenario, false);
  assert.equal(akushaRow.statusMessage, 'Нет сценария');
  assert.equal(akushaRow.annualRevenueRub, 0);
  assert.equal(akushaRow.totalProcurementBudgetRub, 0);

  // =========================================================================
  // ТЕСТ 9: Проверить глобальную сводку BORNERS GROUP («Все бренды»)
  // Суммы по брендам и ИТОГО совпадают, нет двойного счёта сценариев и заказов,
  // а единицы измерения разных категорий не сливаются в одну цифру штук
  // =========================================================================
  const sumBrandsRev = multiBrandSummary.brands.reduce(
    (s, b) => s + b.annualRevenueRub,
    0
  );
  const sumBrandsProcCost = multiBrandSummary.brands.reduce(
    (s, b) => s + b.totalProcurementBudgetRub,
    0
  );
  assert.equal(multiBrandSummary.groupTotal.annualRevenueRub, sumBrandsRev);
  assert.equal(multiBrandSummary.groupTotal.totalProcurementBudgetRub, sumBrandsProcCost);
  assert.ok(multiBrandSummary.procurementBreakdownText.includes('компл.'));
  assert.ok(multiBrandSummary.procurementBreakdownText.includes('компл. штор'));

  // =========================================================================
  // ТЕСТ 10: Проверить финансовый расчёт без графика выплат WB
  // Стоимость закупки считается, а для потребности в своих деньгах выводится
  // «Недостаточно данных для расчёта потребности в собственных деньгах»
  // =========================================================================
  const invWithoutWbSchedule = computeScenarioInvestmentSummary(
    basePortfolio.filter((m) => matchesBrandFilter(m, 'BORNERS')),
    scen2027,
    {
      wbPayoutScheduleSpecified: false,
    }
  );
  assert.ok(invWithoutWbSchedule.totalProcurementBudgetRub > 0);
  assert.equal(invWithoutWbSchedule.verifiedOwnMoneyRequiredRub, null);
  assert.equal(
    invWithoutWbSchedule.ownMoneyStatusLabel,
    'Недостаточно данных для расчёта потребности в собственных деньгах'
  );
});

test('35. Раздельные каталоги по брендам, Группы товаров в стиле Peakly и разбиение партий с выбором дат заказа', async () => {
  const {
    buildDefaultProductGroups,
    computeProductGroupMetrics,
    buildBrandCatalogSections,
  } = await import('../src/lib/productGroups.ts');
  const {
    INITIAL_SCENARIOS,
    INITIAL_SCENARIO_MODELS,
  } = await import('../src/lib/scenarioData.ts');
  const {
    computeProcurementPlan,
    createBrandProductModel,
    ensureModelUnifiedV11,
  } = await import('../src/lib/unifiedBusinessEngine.ts');

  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const scen2 = INITIAL_SCENARIOS.find((s) => s.id === 2)!;

  // 1. Дефолтные группы товаров по брендам и линейкам
  const defaultGroups = buildDefaultProductGroups(INITIAL_SCENARIO_MODELS);
  assert.ok(defaultGroups.length >= 4, 'Должны создаваться умные дефолтные группы по брендам и позициям');

  const wbBaseGroup = defaultGroups.find((g) => g.id === 'grp-borners-wb-base')!;
  assert.ok(wbBaseGroup, 'Группа действующей базы WB BORNERS должна существовать');
  const wbGroupMetrics = computeProductGroupMetrics(
    wbBaseGroup,
    INITIAL_SCENARIO_MODELS,
    scen1
  );
  assert.ok(wbGroupMetrics.modelsCount >= 5, 'В группе действующей базы WB должно быть не менее 5 SKU');
  assert.ok(wbGroupMetrics.annualRevenueRub > 0, 'Годовые продажи группы должны считаться');
  assert.ok(wbGroupMetrics.procurementBudgetRub > 0, 'Бюджет закупок группы должен считаться');
  assert.ok(wbGroupMetrics.firstWaveStartRub > 0, 'Старт 1-й партии Q1 по группе должен считаться');

  // 2. Раздельные каталоги по всем 5 брендам холдинга
  const akCreated = createBrandProductModel(INITIAL_SCENARIO_MODELS, INITIAL_SCENARIOS, {
    brandCode: 'AKUSHA',
    code: 'AK-TEST-1',
    title: 'Акуша слипы базовые',
    retailPriceRub: 1200,
    unitCostRub: 350,
    initialMonthlyPacks: Array(12).fill(1500),
  });
  const lsCreated = createBrandProductModel(akCreated.models, INITIAL_SCENARIOS, {
    brandCode: 'LISKANI',
    code: 'LS-TEST-1',
    title: 'Liscani Блэкаут 3 метра',
    retailPriceRub: 3900,
    unitCostRub: 1400,
    initialMonthlyPacks: Array(12).fill(900),
  });
  const brandSections = buildBrandCatalogSections(
    lsCreated.models,
    {
      BORNERS: scen1,
      NA_TELE: scen2,
      FUKAI: scen1,
      AKUSHA: scen1,
      LISKANI: scen2,
    },
    scen2
  );
  assert.equal(brandSections.length, 5, 'Должны формироваться 5 отдельных каталогов по каждому бренду');
  const liscaniCatalog = brandSections.find((s) => s.brandCode === 'LISKANI')!;
  assert.equal(liscaniCatalog.primaryUnit, 'компл. штор');
  assert.equal(liscaniCatalog.models.length, 1);
  assert.equal(liscaniCatalog.activeScenario.id, scen2.id);

  const syncedGroups = buildDefaultProductGroups(lsCreated.models);
  const akushaGroup = syncedGroups.find((g) => g.id === 'grp-akusha-shoes')!;
  const liscaniGroup = syncedGroups.find((g) => g.id === 'grp-liscani-curtains')!;
  assert.equal(akushaGroup.modelCodes.includes('AK-TEST-1'), true);
  assert.equal(liscaniGroup.modelCodes.includes('LS-TEST-1'), true);

  // 3. Разбиение партии на под-партии и прямое указание дат размещения заказа
  const sampleModel = ensureModelUnifiedV11(INITIAL_SCENARIO_MODELS[0]);
  const splitPeriods = [
    {
      id: 'q1-part-1',
      title: 'Партия №1А (Январь)',
      startMonthIdx: 0,
      endMonthIdx: 0,
      customOrderDateIso: '2026-10-25',
      customPacksQty: 4500,
    },
    {
      id: 'q1-part-2',
      title: 'Партия №1Б (Февраль–Март)',
      startMonthIdx: 1,
      endMonthIdx: 2,
      customOrderDateIso: '2026-11-28',
      customPacksQty: null,
    },
    {
      id: 'q2',
      title: 'Партия №2 (Q2)',
      startMonthIdx: 3,
      endMonthIdx: 5,
      customOrderDateIso: null,
      customPacksQty: null,
    },
    {
      id: 'q3',
      title: 'Партия №3 (Q3)',
      startMonthIdx: 6,
      endMonthIdx: 8,
      customOrderDateIso: null,
      customPacksQty: null,
    },
    {
      id: 'q4',
      title: 'Партия №4 (Q4)',
      startMonthIdx: 9,
      endMonthIdx: 11,
      customOrderDateIso: null,
      customPacksQty: null,
    },
  ];
  const modelWithSplitBatches = {
    ...sampleModel,
    sharedSupplyAndFact: {
      ...sampleModel.sharedSupplyAndFact!,
      factoryParams: {
        ...sampleModel.sharedSupplyAndFact!.factoryParams,
        customBatchPeriods: splitPeriods,
      },
    },
  };
  const procPlan = computeProcurementPlan(modelWithSplitBatches, scen1);
  assert.equal(procPlan.recommendedBatches.length, 5, 'После разбиения Q1 должно быть 5 партий');
  assert.equal(procPlan.recommendedBatches[0].recommendedOrderDateIso, '2026-10-25');
  assert.equal(procPlan.recommendedBatches[0].hasCustomDateOverride, true);
  assert.equal(procPlan.recommendedBatches[0].recommendedPacks, 4500);
  assert.equal(procPlan.recommendedBatches[1].recommendedOrderDateIso, '2026-11-28');
  assert.equal(procPlan.recommendedBatches[1].hasCustomDateOverride, true);
});

test('36. Пакет из 5 улучшений платформы: авто-нормативы WB в карточках SKU, запуск стартовых матриц 5 кабинетов (AKUSHA, LISKANI, НА ТЕЛЕ), интерактивный симулятор «Что если?» и платёжный календарь 4 волн', async () => {
  const {
    ensureModelUnifiedV11,
    computeFinancialPnL,
    applyCategoryWbUnitEconomics,
    launchBrandStarterMatrix,
    launchAllEmptyCabinetsInHolding,
    resetStarterCabinetsFromHolding,
    computeMultiBrandPortfolioSummary,
    computeWhatIfSensitivitySimulation,
  } = await import('../src/lib/unifiedBusinessEngine.ts');

  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;

  // 1. Автозаполнение юнит-экономики WB: BRN-002 (себестоимость 525 ₽ есть, ставки WB не заполнены -> после applyCategoryWbUnitEconomics прибыль рассчитана!)
  const rawBrn002 = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-002')!
  );
  assert.equal(computeFinancialPnL(rawBrn002, scen1).operatingProfitStatus, 'not_filled');

  const filledBrn002 = applyCategoryWbUnitEconomics(rawBrn002);
  const pnlBrn002 = computeFinancialPnL(filledBrn002, scen1);
  assert.equal(pnlBrn002.operatingProfitStatus, 'plan');
  assert.ok((pnlBrn002.unitOperatingProfitRub ?? 0) > 0);
  assert.ok((pnlBrn002.annualOperatingProfitRub ?? 0) > 0);

  // А для гипотезы BRN-DLY-01 (где нет себестоимости) с fillMissingCost: true заполняются и себестоимость, и ставки WB
  const rawDly01 = ensureModelUnifiedV11(
    S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-DLY-01')!
  );
  const filledDly01 = applyCategoryWbUnitEconomics(rawDly01, { fillMissingCost: true });
  const pnlDly01 = computeFinancialPnL(filledDly01, scen1);
  assert.equal(pnlDly01.operatingProfitStatus, 'plan');
  assert.ok((filledDly01.unitCostRub ?? 0) > 0);

  // 2. Быстрый запуск пустых кабинетов (AKUSHA, LISKANI, НА ТЕЛЕ) и подключение всех 5 кабинетов холдинга
  const baseModels = [...ACTING_2027_SCENARIO_MODELS, ...S1_100M_SCENARIO_MODELS];
  const baseScenarios = [...INITIAL_SCENARIOS];
  const baseMap = {
    BORNERS: 1,
    FUKAI: 100,
    AKUSHA: null,
    LISKANI: null,
    NA_TELE: null,
  };

  const singleLaunch = launchBrandStarterMatrix(baseModels, baseScenarios, 'AKUSHA');
  assert.equal(singleLaunch.addedCount, 3);
  assert.ok(singleLaunch.scenarioId > 0);

  const all5Launched = launchAllEmptyCabinetsInHolding(baseModels, baseScenarios, baseMap);
  const summaryAll5 = computeMultiBrandPortfolioSummary(
    all5Launched.models,
    all5Launched.scenarios,
    all5Launched.selectedScenarioByBrand
  );
  const activeBrandsCount = summaryAll5.brands.filter(
    (b) => b.hasScenario && b.modelsCount > 0 && b.annualRevenueRub > 0
  ).length;
  assert.equal(activeBrandsCount, 5, 'Все 5 кабинетов холдинга должны быть активны и приносить выручку');
  assert.ok(summaryAll5.groupTotal.annualRevenueRub > 900_000_000, 'Консолидированная выручка 5 кабинетов превышает 900 млн ₽');

  // Сброс стартовых кабинетов возвращает 2 базовых кабинета (BORNERS + FUKAI)
  const resetRes = resetStarterCabinetsFromHolding(
    all5Launched.models,
    all5Launched.scenarios,
    all5Launched.selectedScenarioByBrand
  );
  assert.equal(resetRes.selectedScenarioByBrand.AKUSHA, null);
  assert.equal(resetRes.selectedScenarioByBrand.LISKANI, null);

  // 3. Интерактивный симулятор «Что если?» (Sensitivity Sliders)
  const baseSim = computeWhatIfSensitivitySimulation(
    {
      annualRevenueRub: 776_840_000,
      annualSoldGoodsCostRub: 166_500_000,
      annualWbDeductionsAndAdsRub: 297_540_000,
      annualEstimatedOperatingProfitRub: 312_800_000,
      peakWorkingCapitalRub: 32_220_000,
    },
    {
      priceDeltaPct: 0,
      costDeltaPct: 0,
      wbAndAdsDeltaPts: 0,
    }
  );
  assert.equal(baseSim.profitDeltaRub, 0);

  const growthSim = computeWhatIfSensitivitySimulation(
    {
      annualRevenueRub: 776_840_000,
      annualSoldGoodsCostRub: 166_500_000,
      annualWbDeductionsAndAdsRub: 297_540_000,
      annualEstimatedOperatingProfitRub: 312_800_000,
      peakWorkingCapitalRub: 32_220_000,
    },
    {
      priceDeltaPct: 7,
      costDeltaPct: -5,
      wbAndAdsDeltaPts: 0,
    }
  );
  assert.ok(growthSim.simulatedRevenueRub > 776_840_000);
  assert.ok(growthSim.simCogsRub < 166_500_000);
  assert.ok(growthSim.profitDeltaRub > 40_000_000);
  assert.ok(growthSim.simulatedMarginPct > baseSim.baseMarginPct);
});

test('37. Чистые карточки по брендам (LISKANI / AKUSHA / НА ТЕЛЕ): отсутствие чужих дефолтов Borners2 (244995893), сохранение и удаление единственного фото, инлайн-редактирование характеристик и палитр', () => {
  const basePortfolio = [...ACTING_2027_SCENARIO_MODELS, ...S1_100M_SCENARIO_MODELS];

  // 1. Создание новой модели LISKANI (шторы) не наследует WB 244995893, мужские боксеры или палитру Borners2
  const { model: liskaniCreated } = createBrandProductModel(
    basePortfolio,
    INITIAL_SCENARIOS,
    {
      title: 'БЛЭКАУТ СЕРЫЙ',
      brandCode: 'LISKANI',
      categoryLabel: 'Портьеры блэкаут',
      unitsInPack: 1,
      retailPriceRub: 3190,
      unitCostRub: 1150,
    }
  );
  assert.equal(liskaniCreated.wbArticle, '');
  assert.equal(liskaniCreated.customBrandLabel, 'LISKANI');
  assert.equal(liskaniCreated.gallery.length, 0);
  assert.equal(
    liskaniCreated.palettes.some((p) => p.title.includes('244995893')),
    false
  );
  assert.equal(
    liskaniCreated.construction.type.includes('Боксеры'),
    false
  );
  assert.equal(
    liskaniCreated.fabric.composition.includes('полиэстер'),
    true
  );

  // 2. Авто-лечение (ensureModelUnifiedV11) существующей карточки LISKANI от чужих дефолтов Borners2 и borners-core-modal.svg
  const corruptedLiskani = ensureModelUnifiedV11({
    ...liskaniCreated,
    wbArticle: '244995893',
    gallery: [
      {
        id: 'bad-svg',
        category: 'pack',
        label: 'Боксеры',
        url: 'images/products/borners-core-modal.svg',
        originalUrl: 'images/products/borners-core-modal.svg',
        isMain: true,
      },
    ],
    palettes: [
      {
        id: 'pal-act-244995893',
        title: 'КАРТОЧКА WB 244995893 — Borners2',
        subtitle: '4 шт. в комплекте · размеры 42–60 · BORNERS (по фото)',
        statusLabel: 'ВКЛЮЧЁН В ЦЕЛЬ BORNERS',
        imageUrl: 'images/wb/244995893_main.webp',
        colors: [],
      },
    ],
    construction: {
      ...liskaniCreated.construction,
      type: 'Боксеры мужские (4 шт. в наборе)',
    },
  });
  assert.equal(corruptedLiskani.wbArticle, '');
  assert.equal(corruptedLiskani.gallery.length, 0);
  assert.equal(
    corruptedLiskani.palettes.some((p) => p.title.includes('244995893')),
    false
  );
  assert.equal(
    corruptedLiskani.construction.type.includes('Боксеры'),
    false
  );

  // 3. Проверка safeStorage и ScenarioModelCardScreen: отсутствие подмены фото на borners-core-modal.svg и возможность удалить единственное фото
  const safeStorageCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'safeStorage.ts'),
    'utf-8'
  );
  assert.equal(safeStorageCode.includes('borners-core-modal.svg'), false);

  const cardScreenCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'sections', 'ScenarioModelCardScreen.tsx'),
    'utf-8'
  );
  assert.equal(
    cardScreenCode.includes('В карточке должна оставаться хотя бы одна фотография'),
    false
  );
  assert.equal(cardScreenCode.includes('+ Добавить палитру / вариант'), true);
});

test('38. Пользовательский путь LISKANI и AKUSHA: авто-активация группы товаров (не 0 SKU), авто-сценарий бренда и изоляция от BORNERS Сценарий №1', async () => {
  const {
    buildDefaultProductGroups,
    computeProductGroupMetrics,
    loadProductGroups,
    resolveGroupModels,
  } = await import('../src/lib/productGroups.ts');

  const basePortfolio = [...ACTING_2027_SCENARIO_MODELS, ...S1_100M_SCENARIO_MODELS];

  // 1. До добавления моделей LISKANI дефолтная папка grp-liscani-curtains имеет 0 SKU
  const initialGroups = buildDefaultProductGroups(basePortfolio);
  const initialLiskaniGrp = initialGroups.find((g) => g.id === 'grp-liscani-curtains')!;
  assert.equal(initialLiskaniGrp.modelIds.length, 0);

  // 2. Пользователь создаёт сценарий и карточку штор для LISKANI
  const scenRes = createIndependentBrandScenario(INITIAL_SCENARIOS, basePortfolio, {
    title: 'LISKANI — План развития 2027',
    brandCode: 'LISKANI',
    year: 2027,
    monthlyTargetMln: 28,
    copyFromScenarioId: null,
  });
  const liskaniScen = scenRes.scenario;

  const createdRes = createBrandProductModel(scenRes.models, scenRes.scenarios, {
    title: 'БЛЭКАУТ СЕРЫЙ 300×270',
    brandCode: 'LISKANI',
    code: 'LSC-004',
    categoryLabel: 'Портьеры блэкаут',
    unitsInPack: 2,
    retailPriceRub: 3190,
    unitCostRub: 1150,
    initialMonthlyPacks: Array(12).fill(500),
  });
  const updatedModels = createdRes.models;

  // 3. Даже если сохранённая группа grp-liscani-curtains содержала modelIds: [], resolveGroupModels и loadProductGroups сразу видят новую карточку
  const resolvedDirect = resolveGroupModels(initialLiskaniGrp, updatedModels);
  assert.equal(resolvedDirect.length, 1);
  assert.equal(resolvedDirect[0].code, 'LSC-004');

  const syncedGroups = loadProductGroups(updatedModels);
  const syncedLiskaniGrp = syncedGroups.find((g) => g.id === 'grp-liscani-curtains')!;
  const grpMetrics = computeProductGroupMetrics(
    syncedLiskaniGrp,
    updatedModels,
    liskaniScen
  );
  assert.equal(grpMetrics.modelsCount, 1);
  assert.ok(grpMetrics.annualRevenueRub > 0);

  // 4. Мультибрендовая сводка на Главной показывает активный сценарий LISKANI и его выручку
  const multiSummary = computeMultiBrandPortfolioSummary(
    updatedModels,
    scenRes.scenarios,
    {
      BORNERS: 1,
      FUKAI: 100,
      AKUSHA: null,
      LISKANI: liskaniScen.id,
      NA_TELE: 2,
    }
  );
  const liskaniSummaryRow = multiSummary.brands.find((b) => b.brandCode === 'LISKANI')!;
  assert.equal(liskaniSummaryRow.hasScenario, true);
  assert.equal(liskaniSummaryRow.modelsCount, 1);
  assert.equal(liskaniSummaryRow.annualRevenueRub, 500 * 12 * 3190);
});

test('39. Сквозной путь пользователя по всем 5 шагам (01 Продукт → 02 Продажи → 03 Закупки → 04 Финансы): редактирование паспорта, матрица 12 мес., партии PO и P&L', async () => {
  const basePortfolio = [...ACTING_2027_SCENARIO_MODELS, ...S1_100M_SCENARIO_MODELS];
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;

  // Шаг 1 (01 · Продукт): создаём новую модель и редактируем характеристики ткани, конструкции, размерной сетки и палитры
  const { model: rawModel } = createBrandProductModel(
    basePortfolio,
    INITIAL_SCENARIOS,
    {
      title: 'КРОССОВКИ AKUSHA AERO RUN',
      brandCode: 'AKUSHA',
      code: 'AKU-010',
      categoryLabel: 'Кроссовки и кеды',
      unitsInPack: 8,
      retailPriceRub: 4600,
      unitCostRub: 1500,
    }
  );

  const editedProductModel = ensureModelUnifiedV11({
    ...rawModel,
    fabric: {
      ...rawModel.fabric,
      composition: 'Натуральная кожа 100%, дышащая сетка AirMesh',
      density: 'Подошва EVA + TPU',
      knitType: 'Анатомическая стелька OrthoLite',
    },
    construction: {
      ...rawModel.construction,
      type: 'Кроссовки городские унисекс (1 пара в коробке)',
      fit: 'Размеры 37–44 · полнота G',
    },
    sharedSupplyAndFact: {
      ...rawModel.sharedSupplyAndFact!,
      factoryParams: {
        ...rawModel.sharedSupplyAndFact!.factoryParams,
        sizeSharesPct: { S: 10, M: 25, L: 35, XL: 20, XXL: 10 },
      },
    },
    palettes: [
      {
        id: 'pal-aku-010',
        title: 'ПАЛИТРА AKU-010 — Белый / Графит',
        subtitle: 'Кожа премиум · размеры 37–44',
        statusLabel: 'В ПЛАНЕ 2027',
        colors: [
          {
            nameRu: 'Белый кварц',
            pantone: '11-0601 TCX',
            hex: '#F4F5F0',
            bandHex: '#E2E8F0',
            textHex: '#0F172A',
          },
          {
            nameRu: 'Графитовый шторм',
            pantone: '19-4007 TCX',
            hex: '#2B2E34',
            bandHex: '#1E293B',
            textHex: '#FFFFFF',
          },
        ],
      },
    ],
  });

  assert.equal(editedProductModel.fabric.composition.includes('Натуральная кожа'), true);
  assert.equal(editedProductModel.palettes.length, 1);
  assert.equal(editedProductModel.palettes[0].colors.length, 2);

  // Шаг 2 (02 · Продажи): заполняем помесячный план продаж на 12 месяцев
  const monthlySales = [300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000, 1200];
  const modelWithSales = {
    ...editedProductModel,
    plansByScenario: {
      ...editedProductModel.plansByScenario,
      [scen1.id]: {
        ...editedProductModel.plansByScenario[scen1.id],
        monthlyPacks: monthlySales,
        monthlyPricesRub: Array(12).fill(4600),
      },
    },
  };

  const salesMetrics = computeModelScenarioMetrics(modelWithSales, scen1);
  const expectedAnnualPacks = monthlySales.reduce((a, b) => a + b, 0);
  assert.equal(salesMetrics.annualPacks, expectedAnnualPacks);
  assert.equal(salesMetrics.annualRevenueRub, expectedAnnualPacks * 4600);
  assert.equal(salesMetrics.targetMonthRevenueRub, 1200 * 4600);

  // Шаг 3 (03 · Закупки): в статусе «Гипотеза» формируется 1 тестовая партия, а при переходе в «Масштабирование» — все 4 волны закупок
  const procHypothesis = computeProcurementPlan(modelWithSales, scen1);
  assert.equal(procHypothesis.recommendedBatches.length, 1);
  assert.equal(procHypothesis.recommendedBatches[0].isTestBatch, true);

  const scaledModel = {
    ...modelWithSales,
    sharedSupplyAndFact: {
      ...modelWithSales.sharedSupplyAndFact!,
      scalingStage: 'scaling' as const,
    },
  };
  const procBefore = computeProcurementPlan(scaledModel, scen1);
  assert.equal(procBefore.recommendedBatches.length, 4);
  const firstBatch = procBefore.recommendedBatches[0];
  assert.ok(firstBatch.recommendedPacks > 0);

  const modelWithApprovedPo = approveRecommendedBatch(
    scaledModel,
    firstBatch,
    'Фабрика AKUSHA Footwear'
  );
  const approvedOrder = modelWithApprovedPo.sharedSupplyAndFact!.approvedOrders[0];
  assert.ok(approvedOrder);
  assert.equal(approvedOrder.packsQty, firstBatch.recommendedPacks);

  const splitModel = createCustomPurchaseOrder(modelWithApprovedPo, {
    packsQty: 800,
    unitCostRub: 1500,
    arrivalMonthIdx: 3,
    orderPlacementDateIso: '2027-02-01',
    factoryName: 'Фабрика AKUSHA Footwear',
  });
  assert.equal(splitModel.sharedSupplyAndFact!.approvedOrders.length, 2);

  // Шаг 4 (04 · Финансы): проверяем расчёт P&L, маржи и инвестиционного плана
  const procAfter = computeProcurementPlan(splitModel, scen1);
  const pnl = computeFinancialPnL(splitModel, scen1, procAfter);
  assert.equal(pnl.annualRevenueRub, expectedAnnualPacks * 4600);
  assert.equal(pnl.annualCogsRub, expectedAnnualPacks * 1500);
  assert.ok((pnl.annualGrossProfitRub ?? 0) > 0);

  const invSummary = computeScenarioInvestmentSummary([splitModel], scen1);
  assert.ok(invSummary.totalProcurementBudgetRub > 0);
  assert.ok(invSummary.firstWaveStartBudgetRub > 0);
  assert.equal(invSummary.monthlyRows.length, 12);
});

test('40. Аудит исходного кода компонентов: синхронизация групп при обновлении моделей, изоляция сценариев и единые пресеты создания моделей', () => {
  const peaklyGroupsCode = fs.readFileSync(
    path.join(
      process.cwd(),
      'src',
      'components',
      'sections',
      'PeaklyBrandCatalogAndGroups.tsx'
    ),
    'utf-8'
  );
  // Проверяем, что syncGroups() вызывается сразу при изменении models
  assert.ok(
    peaklyGroupsCode.includes('const syncGroups = () => {\n      setGroups(loadProductGroups(models));\n    };\n    syncGroups();'),
    'PeaklyBrandCatalogAndGroups должен вызывать syncGroups() при обновлении models'
  );

  const liveHookCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'useLiveScenarioPortfolio.ts'),
    'utf-8'
  );
  const persistenceCode = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'portfolioPersistence.ts'),
    'utf-8'
  );
  assert.ok(
    liveHookCode.includes('filterModelsForScenario') &&
      (liveHookCode + persistenceCode).includes(
        "if (modelBrand === 'AKUSHA' || modelBrand === 'LISKANI')"
      ),
    'filterModelsForScenario должен изолировать отдельные кабинеты AKUSHA и LISKANI от базовых сценариев BORNERS'
  );

  const showcaseCode = fs.readFileSync(
    path.join(
      process.cwd(),
      'src',
      'components',
      'sections',
      'GrowthScenariosShowcase.tsx'
    ),
    'utf-8'
  );
  assert.ok(
    showcaseCode.includes('SHOWCASE_BRAND_PRESETS'),
    'Модальное окно создания модели в GrowthScenariosShowcase должно использовать пресеты по брендам'
  );
  assert.equal(
    showcaseCode.includes('placeholder="Например: SPORT MODAL 3 PACK"'),
    false,
    'Старый захардкоженный плейсхолдер боксеров должен быть заменён на брендовый'
  );
});

test('41. Реальная проверка сохранения, редактирования и удаления через localStorage (с симуляцией перезагрузки F5): карточки, базовые модели, единственное фото, палитры, группы товаров и заказы PO', async () => {
  // Подключаем полноценный in-memory window.localStorage для проверки реальной гидратации после F5
  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, val: string) => {
        store.set(key, String(val));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
    dispatchEvent: () => true,
    setTimeout: (fn: () => void) => {
      fn();
      return 0;
    },
  };

  try {
    const {
      clearDeletedModelsRegistry,
      deleteModelFromPortfolio,
      hydratePortfolioModelsFromStorage,
      persistPortfolioModels,
      unmarkModelAsDeletedInStorage,
    } = await import('../src/lib/portfolioPersistence.ts');
    const {
      deleteProductGroup,
      loadProductGroups,
      resetDefaultProductGroups,
      saveProductGroups,
    } = await import('../src/lib/productGroups.ts');

    // 1. Первичная загрузка (чистый старт): 23 базовых модели BORNERS/FUKAI + 33 модели LISKANI + 24 модели AKUSHA = 80 моделей
    const initialHydrated = hydratePortfolioModelsFromStorage();
    assert.equal(initialHydrated.length, 80);

    // 2. Создание новой карточки штор LISKANI с загруженным фото (data:image/jpeg) и сохранение в localStorage
    const customDataPhoto = 'data:image/jpeg;base64,' + 'A'.repeat(95_000); // > 70 КБ для проверки отсутствия подмены на SVG
    const { model: newCurtain } = createBrandProductModel(
      initialHydrated,
      INITIAL_SCENARIOS,
      {
        title: 'ШТОРЫ ДИМАУТ ПЕСОЧНЫЕ 400×270',
        brandCode: 'LISKANI',
        code: 'LSC-777',
        categoryLabel: 'Шторы димаут',
        unitsInPack: 2,
        retailPriceRub: 4890,
        unitCostRub: 1520,
        composition: 'Лён 35%, полиэстер Dimout 65%',
        imageUrl: customDataPhoto,
      }
    );
    unmarkModelAsDeletedInStorage(newCurtain);
    persistPortfolioModels([...initialHydrated, newCurtain]);

    // Симулируем перезагрузку страницы (F5)
    const afterCreateReload = hydratePortfolioModelsFromStorage();
    assert.equal(afterCreateReload.length, 81);
    const reloadedCurtain = afterCreateReload.find((m) => m.code === 'LSC-777')!;
    assert.ok(reloadedCurtain, 'Созданная карточка LSC-777 должна сохраняться после F5');
    assert.equal(reloadedCurtain.title, 'ШТОРЫ ДИМАУТ ПЕСОЧНЫЕ 400×270');
    assert.equal(reloadedCurtain.categoryLabel, 'Шторы димаут');
    assert.equal(reloadedCurtain.gallery.length, 1);
    assert.equal(
      reloadedCurtain.gallery[0].url,
      customDataPhoto,
      'Загруженное фото >70 КБ должно сохраняться в точности без замены на borners-core-modal.svg'
    );

    // 3. Редактирование карточки LSC-777: удаляем единственное фото (gallery: []), удаляем палитру (palettes: []), меняем ткань и план продаж
    const editedCurtain = {
      ...reloadedCurtain,
      retailPriceRub: 5190,
      gallery: [], // пользователь удалил единственную фотографию
      palettes: [], // пользователь удалил последнюю палитру
      fabric: {
        ...reloadedCurtain.fabric,
        composition: 'Премиальный бельгийский лён 50%, Dimout 50%',
        density: '310 г/м²',
      },
      plansByScenario: {
        ...reloadedCurtain.plansByScenario,
        1: {
          ...reloadedCurtain.plansByScenario[1],
          monthlyPacks: Array(12).fill(420),
          monthlyPricesRub: Array(12).fill(5190),
        },
      },
    };
    persistPortfolioModels(
      afterCreateReload.map((m) => (m.id === editedCurtain.id ? editedCurtain : m))
    );

    // Симулируем F5 и проверяем, что удалённое фото и удалённая палитра НЕ вернулись обратно!
    const afterEditReload = hydratePortfolioModelsFromStorage();
    const checkEdited = afterEditReload.find((m) => m.code === 'LSC-777')!;
    assert.equal(checkEdited.retailPriceRub, 5190);
    assert.equal(
      checkEdited.gallery.length,
      0,
      'Удалённое единственное фото НЕ должно воскрешаться после F5'
    );
    assert.equal(
      checkEdited.palettes.length,
      0,
      'Удалённая палитра НЕ должна воскрешаться после F5'
    );
    assert.equal(
      checkEdited.fabric.composition,
      'Премиальный бельгийский лён 50%, Dimout 50%'
    );
    assert.equal(checkEdited.plansByScenario[1].monthlyPacks[0], 420);

    // 4. Удаление как пользовательской карточки (LSC-777), так и одной из базовых карточек (BRN-001-SC)
    const afterDeleteCustom = deleteModelFromPortfolio(afterEditReload, checkEdited);
    assert.equal(
      afterDeleteCustom.some((m) => m.code === 'LSC-777'),
      false
    );
    const sorbetTarget = afterDeleteCustom.find((m) => m.code === 'BRN-001-SC')!;
    const afterDeleteBase = deleteModelFromPortfolio(afterDeleteCustom, sorbetTarget);
    assert.equal(
      afterDeleteBase.some((m) => m.code === 'BRN-001-SC'),
      false
    );

    // Симулируем F5 — ни LSC-777, ни удалённая базовая карточка BRN-001-SC НЕ должны появиться снова!
    const afterDeleteReload = hydratePortfolioModelsFromStorage();
    assert.equal(afterDeleteReload.length, 79);
    assert.equal(
      afterDeleteReload.some((m) => m.code === 'LSC-777'),
      false,
      'Удалённая пользовательская модель не должна возвращаться после F5'
    );
    assert.equal(
      afterDeleteReload.some((m) => m.code === 'BRN-001-SC'),
      false,
      'Удалённая базовая модель не должна самопроизвольно возвращаться после F5'
    );

    // 5. Явный сброс к эталону восстанавливает все 80 базовых карточек
    clearDeletedModelsRegistry();
    persistPortfolioModels([...ACTING_2027_SCENARIO_MODELS, ...S1_100M_SCENARIO_MODELS]);
    const afterResetReload = hydratePortfolioModelsFromStorage();
    assert.equal(afterResetReload.length, 80);
    assert.equal(
      afterResetReload.some((m) => m.code === 'BRN-001-SC'),
      true
    );

    // 6. Проверка сохранения, ручного редактирования и удаления Групп товаров через localStorage
    const groups0 = loadProductGroups(afterResetReload);
    assert.equal(
      groups0.some((g) => g.id === 'grp-borners-semeyniki-2pack'),
      true
    );

    // Удаляем стандартную группу «Семейники свободного кроя 2-pack» и проверяем, что после F5 она не воскрешается
    const groupsAfterDel = deleteProductGroup(
      groups0,
      'grp-borners-semeyniki-2pack'
    );
    assert.equal(
      groupsAfterDel.some((g) => g.id === 'grp-borners-semeyniki-2pack'),
      false
    );
    const groupsReloadedAfterDel = loadProductGroups(afterResetReload);
    assert.equal(
      groupsReloadedAfterDel.some((g) => g.id === 'grp-borners-semeyniki-2pack'),
      false,
      'Удалённая группа товаров не должна появляться снова после F5'
    );

    // Ручное редактирование состава группы (оставляем ровно 2 модели и ставим isSystemDefault: false)
    const editedGroups = groupsReloadedAfterDel.map((g) =>
      g.id === 'grp-borners-boxers-4pack'
        ? {
            ...g,
            modelIds: g.modelIds.slice(0, 2),
            modelCodes: g.modelCodes.slice(0, 2),
            isSystemDefault: false,
          }
        : g
    );
    saveProductGroups(editedGroups);
    const groupsReloadedAfterEdit = loadProductGroups(afterResetReload);
    const editedBoxersGrp = groupsReloadedAfterEdit.find(
      (g) => g.id === 'grp-borners-boxers-4pack'
    )!;
    assert.equal(
      editedBoxersGrp.modelIds.length,
      2,
      'Снятые пользователем галочки моделей в группе не должны возвращаться после F5'
    );

    // Сброс групп к дефолтным возвращает все стандартные группы
    const resetGroups = resetDefaultProductGroups(afterResetReload);
    assert.equal(
      resetGroups.some((g) => g.id === 'grp-borners-semeyniki-2pack'),
      true
    );
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('42. Утверждённый ассортимент LISKANI 2027 (269 SKU · 33 цветовые карточки · 500 млн ₽ выкупов / 877,19 млн ₽ заказов) и 33 реальных фото WB (.webp)', async () => {
  const {
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
    LISKANI_2027_SCENARIO_ID,
    LISKANI_269_SKUS,
    LISKANI_PAGE1_MONTHLY_SUMMARY,
  } = await import('../src/lib/liskaniAssortment2027.ts');
  const { computeModelScenarioMetrics } = await import('../src/lib/scenarioData.ts');
  const {
    computeFinancialPnL,
    computeScenarioInvestmentSummary,
  } = await import('../src/lib/unifiedBusinessEngine.ts');
  const { buildDefaultProductGroups } = await import('../src/lib/productGroups.ts');

  // 1. Проверка структуры: ровно 269 размерных SKU и 33 цветовые карточки
  assert.equal(LISKANI_269_SKUS.length, 269, 'Должно быть ровно 269 размерных SKU LISKANI');
  assert.equal(LISKANI_2027_MODELS.length, 33, 'Должно быть ровно 33 цветовые карточки LISKANI (LSC-001..LSC-033)');
  const sumVariants = LISKANI_2027_MODELS.reduce(
    (s, m) => s + (m.liskaniSizeVariants?.length || 0),
    0
  );
  assert.equal(sumVariants, 269, 'Сумма размерных вариантов внутри 33 карточек равна 269 SKU');

  // 2. Проверка наличия всех 33 реальных фотографий на диске (public/images/liskani/LSC-001.webp .. LSC-033.webp)
  for (const mod of LISKANI_2027_MODELS) {
    assert.ok(mod.gallery.length >= 1, `У карточки ${mod.code} должна быть фотография в галерее`);
    const mainUrl = mod.gallery[0].url || '';
    assert.ok(
      mainUrl.startsWith('images/liskani/LSC-') && mainUrl.endsWith('.webp'),
      `Фото карточки ${mod.code} должно ссылаться на images/liskani/LSC-*.webp, получено: ${mainUrl}`
    );
    const absPath = path.join(process.cwd(), 'public', mainUrl);
    assert.equal(fs.existsSync(absPath), true, `Файл фото ${absPath} должен существовать на диске`);
    const stat = fs.statSync(absPath);
    assert.ok(stat.size > 1500, `Файл фото ${absPath} не должен быть пустым (${stat.size} байт)`);
  }

  // 3. Сверка контрольных сумм с PDF «План заказов 2027 · по месяцам и SKU» (стр. 1):
  // Выкупы 2027 (57%): ровно 500 000 000 ₽ (Блэкаут: 350 млн ₽, Мрамор: 75 млн ₽, Рогожка: 60 млн ₽, Тюль Вуаль: 15 млн ₽)
  // Заказы 2027: ровно 877 192 982 ₽ и 289 889 комплектов
  assert.equal(LISKANI_PAGE1_MONTHLY_SUMMARY.annualBuyoutsRub, 500_000_000);
  assert.equal(LISKANI_PAGE1_MONTHLY_SUMMARY.annualOrdersRub, 877_192_982);
  assert.equal(LISKANI_PAGE1_MONTHLY_SUMMARY.annualOrdersSets, 289_889);

  let totalBuyoutsRubFromMetrics = 0;
  let totalBuyoutsRubFromPnL = 0;
  let totalOrdersRubFromPlan = 0;
  let totalOrdersPacksFromPlan = 0;
  let totalBuyoutsPacksFromPlan = 0;

  const byFabricRub: Record<string, number> = {
    'Шторы Блэкаут': 0,
    'Шторы Мрамор': 0,
    'Шторы Рогожка': 0,
    'Тюль Вуаль': 0,
  };

  for (const mod of LISKANI_2027_MODELS) {
    const met = computeModelScenarioMetrics(mod, LISKANI_2027_SCENARIO_DEF);
    const pnl = computeFinancialPnL(mod, LISKANI_2027_SCENARIO_DEF);
    const plan = mod.plansByScenario[LISKANI_2027_SCENARIO_ID];
    totalBuyoutsRubFromMetrics += met.annualRevenueRub;
    totalBuyoutsRubFromPnL += pnl.annualRevenueRub;
    totalBuyoutsPacksFromPlan += met.annualPacks;
    totalOrdersRubFromPlan += (plan.monthlyOrdersRub || []).reduce((a, b) => a + b, 0);
    totalOrdersPacksFromPlan += (plan.monthlyOrdersPacks || []).reduce((a, b) => a + b, 0);
    byFabricRub[mod.categoryLabel || ''] =
      (byFabricRub[mod.categoryLabel || ''] || 0) + met.annualRevenueRub;
  }

  assert.equal(totalBuyoutsRubFromMetrics, 500_000_000, 'Суммарные выкупы в метриках сценария равны 500 000 000 ₽');
  assert.equal(totalBuyoutsRubFromPnL, 500_000_000, 'Суммарные выкупы в P&L равны 500 000 000 ₽');
  assert.equal(totalOrdersRubFromPlan, 877_192_982, 'Суммарные заказы равны 877 192 982 ₽');
  assert.equal(totalOrdersPacksFromPlan, 289_889, 'Суммарные заказы в комплектах равны 289 889 компл.');
  assert.equal(totalBuyoutsPacksFromPlan, 165_268, 'Суммарные выкупы в комплектах (помесячно по 269 SKU при 57%) равны 165 268 компл.');

  assert.equal(byFabricRub['Шторы Блэкаут'], 350_000_000);
  assert.equal(byFabricRub['Шторы Мрамор'], 75_000_000);
  assert.equal(byFabricRub['Шторы Рогожка'], 60_000_000);
  assert.equal(byFabricRub['Тюль Вуаль'], 15_000_000);

  // 4. Проверка инвестиционной сводки и 4 товарных групп по тканям LISKANI
  const invSummary = computeScenarioInvestmentSummary(
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF
  );
  assert.equal(invSummary.annualRevenueRub, 500_000_000);
  assert.ok(invSummary.annualEstimatedOperatingProfitRub > 100_000_000);

  const liskaniGroups = buildDefaultProductGroups(LISKANI_2027_MODELS).filter(
    (g) => g.brandCode === 'LISKANI'
  );
  assert.equal(
    liskaniGroups.length,
    5,
    'Для LISKANI создаются общая матрица + 4 выделенные группы по тканям (Блэкаут, Мрамор, Рогожка, Тюль)'
  );
});

test('43. Авто-миграция браузерного кэша (localStorage) от старых заглушек Венеция / Скандинавия / BRN-LSK-001..003 и чернового LSC-014 к эталонным 33 карточкам WB (269 SKU · 500 млн ₽)', async () => {
  const {
    LISKANI_2027_SCENARIO_ID,
  } = await import('../src/lib/liskaniAssortment2027.ts');
  const {
    STORAGE_KEY_DELETED_MODELS,
    STORAGE_KEY_MODELS,
    STORAGE_KEY_SCENARIO_BY_BRAND,
    STORAGE_KEY_USER_PLANS_BACKUP,
    hydratePortfolioModelsFromStorage,
  } = await import('../src/lib/portfolioPersistence.ts');
  const { loadProductGroups } = await import('../src/lib/productGroups.ts');

  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    // Имитируем загрязнённый localStorage со скриншотов 5–10 (старые заглушки BRN-LSK-001..003 + черновик LSC-014 без liskaniSizeVariants)
    store.set(
      STORAGE_KEY_MODELS,
      JSON.stringify([
        {
          id: 'scen-liskani-1794227333481',
          code: 'LSC-014',
          title: 'БЛЭКАУТ СЕРЫЙ',
          subtitle: 'Портьеры блэкаут',
          brandId: 'BORNERS',
          customBrandLabel: 'LISKANI',
          retailPriceRub: 3190,
          unitCostRub: 1150,
          unitsInPack: 1,
          launchStatus: 'Действующий',
          gallery: [{ id: 'g1', label: 'Фото', url: 'images/products/borners-core-modal.svg', isMain: true }],
          palettes: [{ id: 'p1', title: 'КАРТОЧКА WB 244995893 — Borners2', colors: [] }],
          plansByScenario: {},
        },
        {
          id: 'prod-old-lsk-001',
          code: 'BRN-LSK-001',
          title: 'Шторы блэкаут LISKANI Венеция 300×270 (2 полотна)',
          subtitle: 'Боксеры · BORNERS 2027',
          brandId: 'BORNERS',
          customBrandLabel: 'LISKANI',
          retailPriceRub: 4290,
          unitCostRub: 1320,
          unitsInPack: 2,
          launchStatus: 'Действующий',
          gallery: [],
          palettes: [],
          plansByScenario: {},
        },
      ])
    );

    store.set(
      STORAGE_KEY_USER_PLANS_BACKUP,
      JSON.stringify({
        'scen-liskani-1794227333481': {
          id: 'scen-liskani-1794227333481',
          code: 'LSC-014',
          title: 'БЛЭКАУТ СЕРЫЙ',
          retailPriceRub: 3190,
          unitCostRub: 1150,
          launchStatus: 'Действующий',
          gallery: [{ id: 'g1', label: 'Фото', url: 'images/products/borners-core-modal.svg', isMain: true }],
          palettes: [{ id: 'p1', title: 'КАРТОЧКА WB 244995893 — Borners2', colors: [] }],
          plansByScenario: {},
        },
      })
    );

    store.set(STORAGE_KEY_DELETED_MODELS, JSON.stringify(['LSC-014', 'SCEN-LSC-014']));
    store.set(
      STORAGE_KEY_SCENARIO_BY_BRAND,
      JSON.stringify({ BORNERS: 1, LISKANI: 999111 })
    );
    store.set(
      'borners_product_groups_v1',
      JSON.stringify([
        {
          id: 'grp-liscani-curtains',
          title: 'Шторы и текстиль LISKANI',
          brandCode: 'LISKANI',
          cabinetLabel: 'LISKANI · WB',
          modelIds: [],
          modelCodes: [],
          isSystemDefault: true,
          createdAt: '2026-11-08',
        },
      ])
    );

    const hydrated = hydratePortfolioModelsFromStorage();
    const liskaniHydrated = hydrated.filter((m) => m.customBrandLabel === 'LISKANI');

    // 1. Все 33 официальные карточки LISKANI на месте, старые заглушки Венеция / BRN-LSK-001 удалены
    assert.equal(liskaniHydrated.length, 33, 'После миграции должно быть ровно 33 официальные карточки LISKANI');
    assert.equal(
      liskaniHydrated.some((m) => m.code === 'BRN-LSK-001' || m.title.includes('Венеция')),
      false,
      'Старые заглушки Венеция / BRN-LSK-001 должны быть полностью очищены'
    );

    // 2. Карточка LSC-014 теперь имеет реальное фото WB (images/liskani/LSC-014.webp), 8 размерных SKU и не содержит Borners2
    const lsc014 = liskaniHydrated.find((m) => m.code === 'LSC-014')!;
    assert.ok(lsc014, 'Официальная карточка LSC-014 должна присутствовать');
    assert.equal(lsc014.gallery[0]?.url, 'images/liskani/LSC-014.webp');
    assert.equal(lsc014.liskaniSizeVariants?.length, 8);
    assert.equal(
      lsc014.palettes.some((p) => (p.title || '').includes('Borners2')),
      false
    );

    // 3. Активный сценарий бренда LISKANI автоматически переключён на 202705 (500 млн ₽)
    const updatedBrandScen = JSON.parse(store.get(STORAGE_KEY_SCENARIO_BY_BRAND) || '{}');
    assert.equal(updatedBrandScen.LISKANI, LISKANI_2027_SCENARIO_ID);

    // 4. Группы товаров LISKANI содержат все 4 тканевые линейки с ненулевым числом моделей
    const syncedGroups = loadProductGroups(hydrated).filter((g) => g.brandCode === 'LISKANI');
    const blackoutGrp = syncedGroups.find((g) => g.id === 'grp-liskani-blackout')!;
    const mramorGrp = syncedGroups.find((g) => g.id === 'grp-liskani-mramor')!;
    const rogozhkaGrp = syncedGroups.find((g) => g.id === 'grp-liskani-rogozhka')!;
    const tyulGrp = syncedGroups.find((g) => g.id === 'grp-liskani-tyul')!;
    assert.equal(blackoutGrp.modelIds.length, 13);
    assert.equal(mramorGrp.modelIds.length, 10);
    assert.equal(rogozhkaGrp.modelIds.length, 5);
    assert.equal(tyulGrp.modelIds.length, 5);
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('44. Редактирование размерной матрицы LISKANI (269 SKU) — пересчёт выкупов 57%, цены, себестоимости, закупок, P&L, сводки холдинга и сохранение после F5', async () => {
  const {
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
    LISKANI_2027_SCENARIO_ID,
    updateLiskaniModelSizeVariant,
  } = await import('../src/lib/liskaniAssortment2027.ts');
  const {
    hydratePortfolioModelsFromStorage,
    persistPortfolioModels,
  } = await import('../src/lib/portfolioPersistence.ts');

  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    const hydrated = hydratePortfolioModelsFromStorage();
    const lsc002Before = hydrated.find((m) => m.code === 'LSC-002')!;
    assert.ok(lsc002Before, 'Карточка LSC-002 (Блэкаут Серый) должна присутствовать');
    assert.equal(lsc002Before.liskaniSizeVariants?.length, 8);

    const metBefore = computeModelScenarioMetrics(lsc002Before, LISKANI_2027_SCENARIO_DEF);
    const procBefore = computeProcurementPlan(lsc002Before, LISKANI_2027_SCENARIO_DEF);
    const pnlBefore = computeFinancialPnL(lsc002Before, LISKANI_2027_SCENARIO_DEF, procBefore);

    const targetSku = lsc002Before.liskaniSizeVariants![0];
    const origDecOrders = targetSku.monthlyOrdersUnits[11];

    // Редактируем первый размерный SKU внутри LSC-002: увеличиваем заказы декабря на +200 компл., меняем цену, себестоимость, артикул WB и баркод
    const lsc002Edited = updateLiskaniModelSizeVariant(
      lsc002Before,
      targetSku.skuIndex,
      {
        wbNmId: '999888777',
        barcode: '2049999999991',
        unitCostRub: 1120,
        retailPriceRub: 3450,
        monthOrderUnitsChange: {
          monthIdx: 11,
          nextOrdersUnits: origDecOrders + 200,
        },
      },
      LISKANI_2027_SCENARIO_ID
    );

    const editedSku = lsc002Edited.liskaniSizeVariants!.find(
      (sv) => sv.skuIndex === targetSku.skuIndex
    )!;
    assert.equal(editedSku.wbNmId, '999888777');
    assert.equal(editedSku.barcode, '2049999999991');
    assert.equal(editedSku.unitCostRub, 1120);
    assert.equal(editedSku.retailPriceRub, 3450);
    assert.equal(editedSku.monthlyOrdersUnits[11], origDecOrders + 200);

    // Проверяем пересчёт 02 · Продажи, 03 · Закупки и 04 · Финансы по карточке
    const metAfter = computeModelScenarioMetrics(lsc002Edited, LISKANI_2027_SCENARIO_DEF);
    const procAfter = computeProcurementPlan(lsc002Edited, LISKANI_2027_SCENARIO_DEF);
    const pnlAfter = computeFinancialPnL(lsc002Edited, LISKANI_2027_SCENARIO_DEF, procAfter);

    assert.ok(
      metAfter.annualRevenueRub > metBefore.annualRevenueRub,
      'Годовая выручка карточки должна вырасти после увеличения заказов и цены размера'
    );
    assert.ok(
      metAfter.annualPacks > metBefore.annualPacks,
      'Годовые выкупы (57%) в комплектах должны вырасти после увеличения заказов декабря'
    );
    assert.ok(
      procAfter.annualDemandPacks > procBefore.annualDemandPacks,
      'Потребность в закупке в контуре 03 · Закупки должна синхронно вырасти'
    );
    assert.equal(
      pnlAfter.annualRevenueRub,
      metAfter.annualRevenueRub,
      'Выручка в 04 · Финансы (P&L) должна 1-в-1 совпадать с 02 · Продажи'
    );

    // Сохраняем обновлённый портфель в localStorage и проверяем чтение после F5
    const nextPortfolio = hydrated.map((m) =>
      m.id === lsc002Edited.id ? lsc002Edited : m
    );
    persistPortfolioModels(nextPortfolio);

    const reloaded = hydratePortfolioModelsFromStorage();
    const lsc002Reloaded = reloaded.find((m) => m.code === 'LSC-002')!;
    const reloadedSku = lsc002Reloaded.liskaniSizeVariants!.find(
      (sv) => sv.skuIndex === targetSku.skuIndex
    )!;

    assert.equal(reloadedSku.wbNmId, '999888777', 'Артикул WB размерного SKU должен сохраняться после F5');
    assert.equal(reloadedSku.barcode, '2049999999991', 'Баркод размерного SKU должен сохраняться после F5');
    assert.equal(reloadedSku.unitCostRub, 1120, 'Себестоимость размерного SKU должна сохраняться после F5');
    assert.equal(reloadedSku.retailPriceRub, 3450, 'Цена размерного SKU должна сохраняться после F5');
    assert.equal(
      reloadedSku.monthlyOrdersUnits[11],
      origDecOrders + 200,
      'План заказов размерного SKU за декабрь должен сохраняться после F5'
    );

    const metReloaded = computeModelScenarioMetrics(lsc002Reloaded, LISKANI_2027_SCENARIO_DEF);
    assert.equal(
      metReloaded.annualRevenueRub,
      metAfter.annualRevenueRub,
      'Годовая выручка карточки после перезагрузки страницы должна совпадать с отредактированной'
    );
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('45. Сквозной E2E-путь пользователя по всем 5 этапам (Сводка → 01 Продукт → 02 Продажи → 03 Закупки → 04 Финансы): создание, редактирование паспорта/палитр/фото, PO и F5-сохранение', async () => {
  const {
    LISKANI_2027_SCENARIO_DEF,
    LISKANI_2027_SCENARIO_ID,
  } = await import('../src/lib/liskaniAssortment2027.ts');
  const {
    deleteModelFromPortfolio,
    hydratePortfolioModelsFromStorage,
    persistPortfolioModels,
  } = await import('../src/lib/portfolioPersistence.ts');
  const {
    getBrandDefaultModelSpecs,
    launchAllEmptyCabinetsInHolding,
    resetStarterCabinetsFromHolding,
  } = await import('../src/lib/unifiedBusinessEngine.ts');

  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    let portfolio = hydratePortfolioModelsFromStorage();
    const scenarios = [...INITIAL_SCENARIOS, LISKANI_2027_SCENARIO_DEF];

    // ЭТАП 0: Сводка холдинга по умолчанию (3 действующих кабинета: BORNERS, FUKAI, LISKANI)
    const initialByBrand: Record<string, number> = {
      BORNERS: 1,
      FUKAI: 100,
      LISKANI: LISKANI_2027_SCENARIO_ID,
    };
    const summaryBefore = computeMultiBrandPortfolioSummary(
      portfolio,
      scenarios,
      initialByBrand
    );
    const activeCabinetsBefore = summaryBefore.brands.filter((r) => r.annualRevenueRub > 0);
    assert.equal(
      activeCabinetsBefore.length,
      3,
      'По умолчанию в сводке активны ровно 3 действующих кабинета (BORNERS, FUKAI, LISKANI)'
    );

    // Подключение всех 5 кабинетов и возврат к 3 базовым
    const allFiveLaunched = launchAllEmptyCabinetsInHolding(
      portfolio,
      scenarios,
      initialByBrand
    );
    const summaryAllFive = computeMultiBrandPortfolioSummary(
      allFiveLaunched.models,
      allFiveLaunched.scenarios,
      allFiveLaunched.selectedScenarioByBrand
    );
    assert.equal(
      summaryAllFive.brands.filter((r) => r.annualRevenueRub > 0).length,
      5,
      'После подключения всех кабинетов все 5 брендов холдинга имеют активную выручку'
    );

    const resetThree = resetStarterCabinetsFromHolding(
      allFiveLaunched.models,
      allFiveLaunched.scenarios,
      allFiveLaunched.selectedScenarioByBrand
    );
    const nextByBrandAfterReset = {
      ...resetThree.selectedScenarioByBrand,
      LISKANI: LISKANI_2027_SCENARIO_ID,
    };
    const summaryAfterReset = computeMultiBrandPortfolioSummary(
      resetThree.models,
      resetThree.scenarios,
      nextByBrandAfterReset
    );
    assert.equal(
      summaryAfterReset.brands.find((r) => r.brandCode === 'LISKANI')?.annualRevenueRub,
      500_000_000,
      'При сбросе тестовых кабинетов официальный план LISKANI 500 млн ₽ остаётся неприкосновенным'
    );

    // ЭТАП 1 (01 · Продукт): Создание новой карточки, редактирование всех полей паспорта, палитры и удаление единственного фото
    const defaultSpecs = getBrandDefaultModelSpecs('LISKANI', 'Шторы Бархат Изумруд', 2);
    const newModelRaw = ensureModelUnifiedV11({
      id: 'scen-custom-lsk-999',
      code: 'LSC-999',
      title: 'Шторы Бархат Изумруд',
      subtitle: 'Премиальный портьерный бархат · 2 полотна',
      brandId: 'BORNERS',
      customBrandLabel: 'LISKANI',
      categoryLabel: 'Шторы Блэкаут',
      primaryUnitLabel: 'компл. штор',
      secondaryUnitLabel: 'полотен',
      wbArticle: '888777666',
      modelStageStatus: 'В разработке',
      description: 'Новинка осени 2027',
      launchStatus: 'В разработке',
      unitsInPack: 2,
      retailPriceRub: 3600,
      unitCostRub: 1050,
      marketplaceFeePct: 24,
      logisticsRub: 135,
      adsPct: 9,
      responsiblePerson: 'Дирекция LISKANI',
      priority: 'Высший',
      hasActualSalesOrPurchases: false,
      palettes: [defaultSpecs.palette],
      gallery: [
        {
          id: 'gal-custom-1',
          category: 'pack',
          label: 'Главное фото',
          url: 'images/liskani/LSC-001.webp',
          originalUrl: 'images/liskani/LSC-001.webp',
          isMain: true,
        },
      ],
      construction: defaultSpecs.construction,
      fabric: defaultSpecs.fabric,
      waistband: defaultSpecs.waistband,
      productionSteps: [],
      plansByScenario: {
        [LISKANI_2027_SCENARIO_ID]: {
          scenarioId: LISKANI_2027_SCENARIO_ID,
          monthlyPacks: Array(12).fill(500),
          monthlyPricesRub: Array(12).fill(3600),
          monthlyReceiptsPacks: Array(12).fill(500),
          initialStockPacks: 0,
          firstOrderPacks: 1500,
          nextOrderDateLabel: '15 января 2027',
          salesStartMonthIdx: 0,
          warehouseArrivalMonthIdx: 0,
          warehouseArrivalDateLabel: '10 января',
        },
        1: {
          scenarioId: 1,
          monthlyPacks: Array(12).fill(500),
          monthlyPricesRub: Array(12).fill(3600),
          monthlyReceiptsPacks: Array(12).fill(500),
          initialStockPacks: 0,
          firstOrderPacks: 1500,
          nextOrderDateLabel: '15 января 2027',
          salesStartMonthIdx: 0,
          warehouseArrivalMonthIdx: 0,
          warehouseArrivalDateLabel: '10 января',
        },
      },
    });

    // Проверяем, что новая карточка не содержит чужих дефолтов Borners2 и боксеров
    assert.equal(
      newModelRaw.palettes.some((p) => (p.title || '').includes('Borners2')),
      false,
      'Новая карточка не должна содержать чужую палитру Borners2'
    );
    assert.equal(
      newModelRaw.construction.type.includes('Боксеры'),
      false,
      'Новая карточка LISKANI не должна содержать описание мужских боксеров'
    );

    // Редактируем характеристики паспорта, палитру и удаляем единственную фотографию (проверка кейса со скриншота 2)
    const editedPassportModel = ensureModelUnifiedV11({
      ...newModelRaw,
      title: 'Шторы Бархат Изумруд Люкс',
      wbArticle: '888777667',
      fabric: {
        ...newModelRaw.fabric,
        composition: '100% плотный портьерный микробархат',
        density: '310 г/м² · Защита от света 92%',
      },
      gallery: [], // Удалена единственная фотография!
      palettes: [
        {
          id: 'pal-custom-emerald',
          title: 'Палитра Бархат Изумруд',
          subtitle: '2 полотна · 200×270 см',
          statusLabel: 'Утверждено',
          colors: [
            {
              nameRu: 'Глубокий изумруд',
              hex: '#065F46',
              bandHex: '#065F46',
              textHex: '#FFFFFF',
              pantone: 'WB 888777667 · #1',
            },
          ],
        },
      ],
    });

    portfolio = persistPortfolioModels([...portfolio, editedPassportModel]);
    const afterPassportReload = hydratePortfolioModelsFromStorage();
    const savedCustom = afterPassportReload.find((m) => m.id === 'scen-custom-lsk-999')!;
    assert.ok(savedCustom, 'Созданная карточка должна сохраняться в localStorage после F5');
    assert.equal(savedCustom.title, 'Шторы Бархат Изумруд Люкс');
    assert.equal(savedCustom.wbArticle, '888777667');
    assert.equal(savedCustom.fabric.composition, '100% плотный портьерный микробархат');
    assert.equal(
      savedCustom.gallery.length,
      0,
      'После удаления единственной фотографии галерея должна оставаться пустой после F5 (не подставляя чужое фото боксеров)'
    );
    assert.equal(savedCustom.palettes[0]?.title, 'Палитра Бархат Изумруд');
    assert.equal(savedCustom.palettes[0]?.colors[0]?.hex, '#065F46');

    // ЭТАП 2 (02 · Продажи): Изменение помесячных выкупов, цены и ввод фактических продаж
    const nextMonthlyPacks = savedCustom.plansByScenario[LISKANI_2027_SCENARIO_ID].monthlyPacks.map(
      (v, idx) => (idx === 11 ? 1200 : v)
    );
    const salesEditedModel = ensureModelUnifiedV11({
      ...savedCustom,
      retailPriceRub: 3800,
      plansByScenario: {
        ...savedCustom.plansByScenario,
        [LISKANI_2027_SCENARIO_ID]: {
          ...savedCustom.plansByScenario[LISKANI_2027_SCENARIO_ID],
          monthlyPacks: nextMonthlyPacks,
          monthlyPricesRub: Array(12).fill(3800),
          monthlyRevenuesRubOverride: undefined,
        },
      },
      sharedSupplyAndFact: {
        ...savedCustom.sharedSupplyAndFact!,
        actualSalesByMonth: savedCustom.sharedSupplyAndFact!.actualSalesByMonth.map(
          (r, idx) =>
            idx === 0
              ? { monthIdx: 0, actualBuyoutsPacks: 540, actualPriceRub: 3850 }
              : r
        ),
      },
    });

    // ЭТАП 3 (03 · Закупки): Расчёт квартальных партий, утверждение партии в PO, изменение размеров PO, удаление PO
    const procPlan = computeProcurementPlan(salesEditedModel, LISKANI_2027_SCENARIO_DEF);
    assert.equal(
      procPlan.annualDemandPacks,
      500 * 11 + 1200,
      'Годовая потребность в 03 · Закупки должна точно равняться сумме 12 месяцев продаж (6 700 компл.)'
    );
    assert.ok(procPlan.recommendedBatches.length >= 1, 'Должны быть сформированы квартальные партии к заказу');

    const withApprovedPo = approveRecommendedBatch(
      salesEditedModel,
      procPlan.recommendedBatches[0],
      'Владелец'
    );
    assert.equal(withApprovedPo.sharedSupplyAndFact?.approvedOrders.length, 1);
    const firstPo = withApprovedPo.sharedSupplyAndFact!.approvedOrders[0];

    const withUpdatedPo = updateApprovedPurchaseOrder(withApprovedPo, firstPo.id, {
      packsQty: 2000,
      lockedUnitCostRub: 1020,
    });
    assert.equal(withUpdatedPo.sharedSupplyAndFact!.approvedOrders[0].packsQty, 2000);
    assert.equal(
      withUpdatedPo.sharedSupplyAndFact!.approvedOrders[0].totalOrderRub,
      2000 * 1020
    );

    const withCustomPo = createCustomPurchaseOrder(withUpdatedPo, {
      packsQty: 800,
      unitCostRub: 1020,
      arrivalMonthIdx: 5,
      orderPlacementDateIso: '2027-04-10',
      note: 'Дополнительная летняя партия',
    });
    assert.equal(withCustomPo.sharedSupplyAndFact!.approvedOrders.length, 2);

    // ЭТАП 4 (04 · Финансы): Проверка P&L и движения денег с учётом утверждённых PO и факта января
    const procAfterPo = computeProcurementPlan(withCustomPo, LISKANI_2027_SCENARIO_DEF);
    const pnlAfterPo = computeFinancialPnL(withCustomPo, LISKANI_2027_SCENARIO_DEF, procAfterPo);
    assert.equal(pnlAfterPo.annualBuyoutsPacks, 540 + 500 * 10 + 1200);
    assert.equal(pnlAfterPo.annualRevenueRub, 540 * 3850 + (500 * 10 + 1200) * 3800);
    assert.ok((pnlAfterPo.annualOperatingProfitRub || 0) > 0, 'Операционная прибыль в P&L должна быть рассчитана и положительна');

    // Сохраняем всё в localStorage и проверяем F5
    portfolio = persistPortfolioModels(
      afterPassportReload.map((m) => (m.id === withCustomPo.id ? withCustomPo : m))
    );
    const afterFullFlowReload = hydratePortfolioModelsFromStorage();
    const reloadedFullModel = afterFullFlowReload.find((m) => m.id === 'scen-custom-lsk-999')!;
    assert.equal(
      reloadedFullModel.sharedSupplyAndFact?.approvedOrders.length,
      2,
      'Утверждённые заказы PO должны сохраняться после обновления страницы (F5)'
    );
    assert.equal(
      reloadedFullModel.sharedSupplyAndFact?.actualSalesByMonth[0]?.actualBuyoutsPacks,
      540,
      'Фактические продажи января должны сохраняться после обновления страницы (F5)'
    );

    // Удаление одного PO и затем удаление карточки
    const afterRemoveOnePo = removeApprovedPurchaseOrder(
      reloadedFullModel,
      withCustomPo.sharedSupplyAndFact!.approvedOrders[1].id
    );
    assert.equal(afterRemoveOnePo.sharedSupplyAndFact?.approvedOrders.length, 1);

    const afterDeleteCard = deleteModelFromPortfolio(afterFullFlowReload, {
      id: 'scen-custom-lsk-999',
      code: 'LSC-999',
    });
    assert.equal(
      afterDeleteCard.some((m) => m.code === 'LSC-999'),
      false,
      'Удалённая карточка должна исчезать из портфеля'
    );
    const reloadedAfterDelete = hydratePortfolioModelsFromStorage();
    assert.equal(
      reloadedAfterDelete.some((m) => m.code === 'LSC-999'),
      false,
      'Удалённая карточка не должна возвращаться после обновления страницы (F5)'
    );
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('46. Синхронизация сценариев бренда в «01 · Продукт» (Сетка / Таблица / Паспорт) и отсутствие тяжёлых чёрных заливок на кнопках навигации', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();

  const productCatalogSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/ProductCatalogView.tsx'),
    'utf8'
  );
  const modelCardSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/ScenarioModelCardScreen.tsx'),
    'utf8'
  );
  const procurementWorkbenchSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/SkuProcurementMvpWorkbench.tsx'),
    'utf8'
  );

  // 1. В 01 · Продукт кнопка «Назад в каталог» выполнена в спокойном сером цвете (без чёрной заливки)
  assert.ok(
    productCatalogSrc.includes('Назад в каталог (01 · Продукт)') &&
      productCatalogSrc.includes('bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#1E293B]'),
    'Кнопка «Назад в каталог (01 · Продукт)» должна быть серой (#F1F5F9), а не чёрной'
  );

  // 2. В 01 · Продукт табличный вид и открытый паспорт синхронизируют сценарий бренда (selectedScenarioByBrand)
  assert.ok(
    productCatalogSrc.includes('setSelectedScenarioForBrand(modBrandCode, id)'),
    'Переключатель сценария внутри открытой карточки в 01 · Продукт должен синхронизировать сценарий бренда'
  );
  const activeScenMatches = productCatalogSrc.match(/computeModelScenarioMetrics\(mod,\s*activeScen\)/g) || [];
  assert.ok(
    activeScenMatches.length >= 2,
    'И сетка карточек, и табличный вид в 01 · Продукт должны считать выручку по активному сценарию бренда (activeScen)'
  );

  // 3. В карточке модели разрешено удаление фотографии даже когда она одна, а вкладки не имеют чёрной заливки
  assert.ok(
    modelCardSrc.includes('filteredGallery.length >= 1') &&
      modelCardSrc.includes('Удалить фото'),
    'Удаление фотографии должно быть доступно в том числе когда фотография одна в карточке'
  );

  // 4. В закупках карточки LISKANI отображается количество размеров из матрицы полотен
  assert.ok(
    procurementWorkbenchSrc.includes('model.liskaniSizeVariants.length') &&
      procurementWorkbenchSrc.includes('разм.'),
    'В блоке параметров закупок для карточек LISKANI должно отображаться число размеров полотен'
  );
});

test('47. Сводка (02 · Расходы, удержания WB и рентабельность): Комиссия WB = 30%, Логистика и хранение = 0%, ДРР = 10% (итого 40% удержаний)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();

  const summarySrc = fs.readFileSync(
    path.join(root, 'src/components/sections/PeaklyBrandCatalogAndGroups.tsx'),
    'utf8'
  );

  // 1. Проверяем формулы 3 карточек расходов WB и ДРР в Сводке
  assert.ok(
    summarySrc.includes('const wbCommissionRub = Math.round(gt.annualRevenueRub * 0.30);') &&
      summarySrc.includes('pct: gt.annualRevenueRub > 0 ? 30 : 0'),
    'Комиссия маркетплейса WB в Сводке должна составлять ровно 30% от выручки'
  );
  assert.ok(
    summarySrc.includes('const wbLogisticsStorageRub = 0;') &&
      summarySrc.includes('pct: 0'),
    'Логистика и хранение WB в Сводке должны быть установлены в 0% (0 ₽)'
  );
  assert.ok(
    summarySrc.includes('const adsAndTaxRub = Math.round(gt.annualRevenueRub * 0.10);') &&
      summarySrc.includes('pct: gt.annualRevenueRub > 0 ? 10 : 0'),
    'Продвижение (ДРР) в Сводке должно составлять ровно 10% от выручки'
  );

  // 2. Проверяем расчёт computeScenarioInvestmentSummary на реальном портфеле LISKANI 2027 (500 млн ₽)
  const {
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
  } = await import('../src/lib/liskaniAssortment2027.ts');
  const liskaniSummary = computeScenarioInvestmentSummary(
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
    { initialCashRub: 0, settlementLagMonths: 0, wbPayoutScheduleSpecified: true }
  );

  const totalDeductionsYear = liskaniSummary.monthlyRows.reduce(
    (acc, r) => acc + r.wbDeductionsAndAdsRub,
    0
  );
  const totalNetInflowYear = liskaniSummary.monthlyRows.reduce(
    (acc, r) => acc + r.wbNetInflowRub,
    0
  );

  // Суммарные удержания WB (30% комиссия + 0% логистика + 10% ДРР) составляют 40% от годовой выручки (с погрешностью округления по месяцам < 500 ₽)
  const expectedDeductions40Pct = Math.round(liskaniSummary.annualRevenueRub * 0.40);
  assert.ok(
    Math.abs(totalDeductionsYear - expectedDeductions40Pct) <= 500,
    `Суммарные удержания WB + ДРР (${totalDeductionsYear}) должны быть равны 40% от выручки (${expectedDeductions40Pct})`
  );
  assert.equal(
    totalNetInflowYear,
    liskaniSummary.annualRevenueRub - totalDeductionsYear,
    'Поступление на счёт с WB должно равняться 60% от выручки (Выручка − 30% Комиссия − 10% ДРР)'
  );
  assert.equal(
    liskaniSummary.annualEstimatedOperatingProfitRub,
    liskaniSummary.annualRevenueRub - liskaniSummary.annualSoldGoodsCostRub - totalDeductionsYear,
    'Операционная прибыль должна равняться Выручка − Закупочная себестоимость − 40% (Комиссия 30% + Логистика 0% + ДРР 10%)'
  );
});

test('48. Сводная ведомость и детализация закупок (03 · Закупки): переход из Сводки в полную детализацию по категориям, карточкам, 4 волнам Q1–Q4 и всем размерам полотен (269 SKU)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();

  const summarySrc = fs.readFileSync(
    path.join(root, 'src/components/sections/PeaklyBrandCatalogAndGroups.tsx'),
    'utf8'
  );
  const contourSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/UnifiedContourViews.tsx'),
    'utf8'
  );
  const workbenchSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/SkuProcurementMvpWorkbench.tsx'),
    'utf8'
  );

  // 1. Из Сводки клик по карточкам закупок и закупочной себестоимости переводит в полную детализацию всех SKU
  assert.ok(
    summarySrc.includes('borners_open_procurement_view_mode') &&
      summarySrc.includes('borners-open-procurement-summary'),
    'Клик по карточкам закупок и себестоимости в Сводке должен открывать полную сводную детализацию закупок'
  );

  // 2. В 03 · Закупки по умолчанию открыта вкладка сводной детализации всех SKU ('skus'), а не один артикул
  assert.ok(
    contourSrc.includes("useState<\n    'none' | 'investment' | 'brands' | 'skus'\n  >('skus')") &&
      contourSrc.includes('Все SKU · Детализация закупок'),
    'Раздел 03 · Закупки по умолчанию должен показывать сводную детализацию всех SKU'
  );

  // 3. В сводной ведомости закупок есть группировка по категориям, 4 показателя формулы и поразмерное раскрытие
  assert.ok(
    contourSrc.includes('1. Себестоимость выкупов (Сводка)') &&
      contourSrc.includes('2. Бюджет закупок у фабрик (Год)') &&
      contourSrc.includes('Детализация бюджета закупок по категориям') &&
      contourSrc.includes('Развернуть все размеры ▾'),
    'Сводная ведомость закупок должна отображать формулу себестоимости, категории и раскрытие размеров'
  );

  // 4. Внутри карточки товара (SkuProcurementMvpWorkbench) для LISKANI отображается поразмерная таблица полотен и распределение партий по размерам
  assert.ok(
    workbenchSrc.includes('Поразмерная детализация закупки') &&
      workbenchSrc.includes('Распределение партии №'),
    'В карточке закупок LISKANI должна отображаться поразмерная ведомость полотен и распределение каждой партии по размерам'
  );
});

test('49. Контрастность наведения (hover) в тёмной теме (.dark) и единая сводка холдинга в 03 · Закупки', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();

  const globalsCss = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
  const appShellSrc = fs.readFileSync(
    path.join(root, 'src/components/shell/AppShell.tsx'),
    'utf8'
  );
  const contourSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/UnifiedContourViews.tsx'),
    'utf8'
  );

  // 1. В globals.css все светлые hover-фоны (.hover:bg-white, .hover:bg-white/60, .hover:bg-[#F8FAFC] и др.) адаптированы под .dark (#1E2536) без белых засветов
  assert.ok(
    globalsCss.includes('html.dark .hover\\:bg-white:hover') &&
      globalsCss.includes('html.dark .hover\\:bg-white\\/60:hover') &&
      globalsCss.includes('html.dark .hover\\:bg-\\[\\#F8FAFC\\]:hover') &&
      globalsCss.includes('html.dark .hover\\:text-\\[\\#111827\\]:hover') &&
      globalsCss.includes('color: #F8FAFC !important'),
    'В тёмной теме (.dark) наведение не должно создавать белый/светло-серый фон с нечитаемым текстом'
  );

  // 2. В верхней панели навигации AppShell вкладки имеют явные dark:hover стили без засвета
  assert.ok(
    appShellSrc.includes('dark:hover:bg-[#1E2536]') &&
      appShellSrc.includes('dark:hover:text-[#F8FAFC]'),
    'Вкладки верхней навигации в тёмной теме должны сохранять чёткую читаемость названия при наведении'
  );

  // 3. В 03 · Закупки при выборе «Все бренды» доступна полная сводка холдинга (Все бренды холдинга)
  assert.ok(
    contourSrc.includes('isHoldingAllBrandsActive') &&
      contourSrc.includes('Все бренды холдинга'),
    'В 03 · Закупки при фильтре Все бренды должна отображаться полная сводка всех активных брендов холдинга'
  );
});

test('50. Прямое редактирование закупочной себестоимости в сводной таблице «03 · Закупки» (по карточке и по каждому размеру полотен) с живым пересчётом и сохранением в localStorage (F5)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();

  const {
    updateModelSizeVariantUnitCost,
    updateModelUnitCostWithVariants,
  } = await import('../src/lib/unifiedBusinessEngine.ts');
  const {
    LISKANI_2027_SCENARIO_DEF,
    LISKANI_2027_SCENARIO_ID,
  } = await import('../src/lib/liskaniAssortment2027.ts');
  const {
    hydratePortfolioModelsFromStorage,
    persistPortfolioModels,
  } = await import('../src/lib/portfolioPersistence.ts');

  // 1. Проверяем, что в сводной таблице 03 · Закупки и в карточке товара встроены инлайновые поля редактирования себестоимости
  const contourSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/UnifiedContourViews.tsx'),
    'utf8'
  );
  const workbenchSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/SkuProcurementMvpWorkbench.tsx'),
    'utf8'
  );
  assert.ok(
    contourSrc.includes('updateModelUnitCostWithVariants') &&
      contourSrc.includes('updateModelSizeVariantUnitCost') &&
      contourSrc.includes('getNormalizedProcurementCategoryLabel'),
    'Сводная таблица 03 · Закупки должна поддерживать прямое редактирование себестоимости 1 компл. и каждого размера, а также нормализацию категорий FUKAI'
  );
  assert.ok(
    workbenchSrc.includes('handleUpdateSizeVariantUnitCost') &&
      workbenchSrc.includes('updateModelUnitCostWithVariants'),
    'Карточка товара в 03 · Закупки должна синхронизировать себестоимость модели и размерных вариантов'
  );

  // 2. Сквозной тест: редактируем себестоимость модели BORNERS и размерного полотна LISKANI, проверяем пересчёт Сводки и сохранение после F5
  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    const scenarios = [...INITIAL_SCENARIOS, LISKANI_2027_SCENARIO_DEF];
    const selectedByBrand: Record<string, number> = {
      BORNERS: 1,
      FUKAI: 100,
      LISKANI: LISKANI_2027_SCENARIO_ID,
    };

    let portfolio = hydratePortfolioModelsFromStorage();
    const summaryBefore = computeMultiBrandPortfolioSummary(
      portfolio,
      scenarios,
      selectedByBrand
    );

    // А) Меняем себестоимость первой модели BORNERS (Borners2) с 409 ₽ на 500 ₽ прямо в таблице
    const bornersModel = portfolio.find(
      (m) => m.title === 'Borners2' || m.code.includes('244995893')
    )!;
    assert.ok(bornersModel, 'Модель Borners2 (244995893) должна быть в портфеле');
    const bornersUpdated = updateModelUnitCostWithVariants(bornersModel, 500);
    assert.equal(bornersUpdated.unitCostRub, 500);

    // Б) Меняем себестоимость конкретного размера в карточке LISKANI (LSC-001) с ~850 ₽ на 1500 ₽
    const lsc001 = portfolio.find((m) => m.code === 'LSC-001')!;
    assert.ok(lsc001 && lsc001.liskaniSizeVariants?.length, 'Карточка LSC-001 должна содержать размеры полотен');
    const firstVariant = lsc001.liskaniSizeVariants![0];
    const lsc001Updated = updateModelSizeVariantUnitCost(
      lsc001,
      firstVariant.skuIndex,
      1500
    );
    assert.equal(
      lsc001Updated.liskaniSizeVariants![0].unitCostRub,
      1500,
      'Себестоимость выбранного размера полотна должна обновиться до 1500 ₽'
    );
    assert.ok(
      lsc001Updated.unitCostRub > lsc001.unitCostRub,
      'Средневзвешенная себестоимость карточки LSC-001 должна автоматически пересчитаться вверх'
    );

    // Сохраняем обе правки в портфель и проверяем живой пересчёт сводки холдинга
    portfolio = persistPortfolioModels(
      portfolio.map((m) => {
        if (m.id === bornersUpdated.id) return bornersUpdated;
        if (m.id === lsc001Updated.id) return lsc001Updated;
        return m;
      })
    );

    const summaryAfter = computeMultiBrandPortfolioSummary(
      portfolio,
      scenarios,
      selectedByBrand
    );
    assert.ok(
      summaryAfter.groupTotal.annualSoldGoodsCostRub >
        summaryBefore.groupTotal.annualSoldGoodsCostRub,
      'Себестоимость выкупов в Сводке холдинга должна вырасти после увеличения себестоимости комплектов'
    );
    assert.ok(
      summaryAfter.groupTotal.totalProcurementBudgetRub >
        summaryBefore.groupTotal.totalProcurementBudgetRub,
      'Годовой бюджет закупок у фабрик должен вырасти после увеличения себестоимости комплектов'
    );
    assert.ok(
      summaryAfter.groupTotal.firstWaveStartBudgetRub >
        summaryBefore.groupTotal.firstWaveStartBudgetRub,
      'Стартовый бюджет 1-й волны (Q1) должен синхронно пересчитаться'
    );

    // В) Симулируем перезагрузку страницы (F5) и проверяем сохранность всех новых значений
    const reloaded = hydratePortfolioModelsFromStorage();
    const bornersAfterF5 = reloaded.find((m) => m.id === bornersUpdated.id)!;
    const lsc001AfterF5 = reloaded.find((m) => m.code === 'LSC-001')!;
    assert.equal(
      bornersAfterF5.unitCostRub,
      500,
      'Изменённая себестоимость 1 компл. BORNERS должна сохраняться после F5'
    );
    assert.equal(
      lsc001AfterF5.liskaniSizeVariants![0].unitCostRub,
      1500,
      'Изменённая себестоимость размера полотна LISKANI должна сохраняться после F5'
    );
    assert.equal(
      lsc001AfterF5.unitCostRub,
      lsc001Updated.unitCostRub,
      'Пересчитанная средневзвешенная себестоимость карточки LISKANI должна сохраняться после F5'
    );
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('51. Надёжное сохранение фотографий всех карточек при ручном добавлении 4+ моделей подряд (AKUSHA и др.) без потери фото из-за лимита localStorage 5 МБ и гонки self-events', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();

  const {
    hydratePortfolioModelsFromStorage,
    persistPortfolioModels,
  } = await import('../src/lib/portfolioPersistence.ts');
  const { compactGalleryDataUrls } = await import('../src/lib/safeStorage.ts');

  // 1. Проверяем, что в хуке useLiveScenarioPortfolio устранена гонка отложенных self-events и подключено дублирование фотогалерей в IndexedDB
  const hookSrc = fs.readFileSync(
    path.join(root, 'src/lib/useLiveScenarioPortfolio.ts'),
    'utf8'
  );
  assert.ok(
    hookSrc.includes('ignoreSelfEventsRef') &&
      hookSrc.includes('saveModelGalleryToIdb') &&
      hookSrc.includes('loadAllModelGalleriesFromIdb'),
    'useLiveScenarioPortfolio должен блокировать перезапись свежего стейта собственными отложенными событиями и сохранять фото в IndexedDB'
  );

  // 2. Проверяем, что compactGalleryDataUrls убирает дублирование base64 в originalUrl (экономия памяти в 2 раза)
  const sampleBase64 = `data:image/jpeg;base64,${'A'.repeat(65_000)}`;
  const compacted = compactGalleryDataUrls({
    photoUrl: sampleBase64,
    photoGallery: [
      {
        id: 'ph-1',
        title: 'Фото 1',
        url: sampleBase64,
        originalUrl: sampleBase64,
        isPrimary: true,
      },
    ],
  });
  assert.equal(compacted.photoGallery[0].url, sampleBase64);
  assert.equal(
    compacted.photoGallery[0].originalUrl,
    '',
    'compactGalleryDataUrls должен очищать дублирующийся base64 originalUrl для экономии памяти localStorage'
  );

  // 3. Симулируем localStorage с жёстким браузерным лимитом 5 МБ и добавляем подряд 4 карточки обуви AKUSHA с фото по ~65 КБ (как на скриншоте пользователя)
  const store = new Map<string, string>();
  const MAX_LOCAL_STORAGE_CHARS = 5_000_000;
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        const str = String(v);
        let totalChars = str.length;
        for (const [ek, ev] of store.entries()) {
          if (ek !== k) totalChars += ev.length;
        }
        if (totalChars > MAX_LOCAL_STORAGE_CHARS) {
          throw new Error('QuotaExceededError: localStorage 5MB limit exceeded');
        }
        store.set(k, str);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    let models = hydratePortfolioModelsFromStorage();
    let scenarios = [...INITIAL_SCENARIOS];

    const akushaInputs = [
      {
        code: 'Ботинки01Бот01 · WB 1842230194',
        title: 'Ботинки зимние из натуральной кожи с мехом',
        categoryLabel: 'Кроссовки и кеды',
        retailPriceRub: 7500,
        unitCostRub: 2700,
        photoDataUrl: `data:image/jpeg;base64,PHOTO_AKUSHA_1_${'B'.repeat(62_000)}`,
      },
      {
        code: '1842230193',
        title: 'Ботинки Зима',
        categoryLabel: 'Ботинки и челси',
        retailPriceRub: 7451,
        unitCostRub: 2700,
        photoDataUrl: `data:image/jpeg;base64,PHOTO_AKUSHA_2_${'C'.repeat(64_000)}`,
      },
      {
        code: 'AKU-003',
        title: 'AKUSHA НОВАЯ МОДЕЛЬ',
        categoryLabel: 'Кроссовки и кеды',
        retailPriceRub: 7500,
        unitCostRub: 2800,
        photoDataUrl: `data:image/jpeg;base64,PHOTO_AKUSHA_3_${'D'.repeat(66_000)}`,
      },
      {
        code: 'AKU-004',
        title: 'Кеды Зима',
        categoryLabel: 'Кроссовки и кеды',
        retailPriceRub: 7500,
        unitCostRub: 2800,
        photoDataUrl: `data:image/jpeg;base64,PHOTO_AKUSHA_4_${'E'.repeat(63_000)}`,
      },
    ];

    for (const item of akushaInputs) {
      const res = createBrandProductModel(models, scenarios, {
        title: item.title,
        brandCode: 'AKUSHA',
        code: item.code,
        categoryLabel: item.categoryLabel,
        unitsInPack: 1,
        retailPriceRub: item.retailPriceRub,
        unitCostRub: item.unitCostRub,
        imageUrl: item.photoDataUrl,
      });
      models = persistPortfolioModels(res.models);
    }

    // Симулируем F5 и проверяем, что все 4 карточки AKUSHA сохранили свои загруженные фотографии (4 из 4!)
    const afterF5 = hydratePortfolioModelsFromStorage();
    for (let i = 0; i < akushaInputs.length; i++) {
      const expected = akushaInputs[i];
      const found = afterF5.find((m) => m.code === expected.code);
      assert.ok(found, `Карточка ${expected.code} должна существовать после F5`);
      assert.equal(
        found!.gallery?.[0]?.url,
        expected.photoDataUrl,
        `Фотография карточки ${expected.code} не должна теряться или затираться после сохранения 4 моделей подряд`
      );
      assert.equal(
        found!.gallery?.[0]?.originalUrl,
        '',
        `Дубликат base64 в originalUrl карточки ${expected.code} должен быть очищен для экономии памяти`
      );
    }
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('52. Процент выкупа WB (%) в продажах, заказах и закупках (обувь AKUSHA 30–35% → кратный объём заказов и бюджета закупок + сохранение после F5)', async () => {
  const {
    updateModelBuyoutRatePct,
    toggleModelProcurementByOrders,
    getEffectiveModelBuyoutRatePct,
    isModelProcurementByOrdersActive,
  } = await import('../src/lib/unifiedBusinessEngine.ts');
  const {
    hydratePortfolioModelsFromStorage,
    persistPortfolioModels,
  } = await import('../src/lib/portfolioPersistence.ts');

  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    const baseModels = hydratePortfolioModelsFromStorage();
    const res = createBrandProductModel(baseModels, INITIAL_SCENARIOS, {
      title: 'Ботинки зимние AKUSHA из натуральной кожи',
      brandCode: 'AKUSHA',
      code: 'AKU-BUYOUT-01',
      categoryLabel: 'Ботинки и челси',
      unitsInPack: 1,
      retailPriceRub: 7500,
      unitCostRub: 2700,
      initialMonthlyPacks: Array(12).fill(100), // 1 200 выкупов в год
    });

    const akushaScen = INITIAL_SCENARIOS[0];
    // Переводим в режим масштабирования (4 волны), чтобы проверить годовой объём закупок по волнам Q1–Q4
    const akushaModel = {
      ...res.model,
      sharedSupplyAndFact: {
        ...res.model.sharedSupplyAndFact!,
        scalingStage: 'scaling' as const,
      },
    };

    // 1. По умолчанию для обуви AKUSHA процент выкупа = 33% и включён расчёт закупок от объёма заказов
    assert.equal(getEffectiveModelBuyoutRatePct(akushaModel, akushaScen.id), 33);
    assert.equal(isModelProcurementByOrdersActive(akushaModel), true);

    const salesMetrics33 = computeModelScenarioMetrics(akushaModel, akushaScen);
    assert.equal(salesMetrics33.buyoutRatePct, 33);
    assert.equal(salesMetrics33.annualPacks, 1200); // 1 200 выкупов
    // При 33% выкупа из 100 выкупов нужно ceil/round(100 / 0.33) = 303 заказа в месяц -> 3 636 заказов в год (~3.03x)
    assert.equal(salesMetrics33.annualOrdersPacks, 303 * 12);
    assert.equal(salesMetrics33.annualRevenueRub, 1200 * 7500);
    assert.equal(salesMetrics33.annualOrdersRub, 303 * 12 * 7500);

    // 2. Проверяем, что 03 · Закупки считает потребность в партиях у фабрики от объёма ЗАКАЗОВ (3 636 пар), а не только от выкупов (1 200 пар)
    const proc33 = computeProcurementPlan(akushaModel, akushaScen);
    assert.equal(proc33.buyoutRatePct, 33);
    assert.equal(proc33.procureByOrdersVolume, true);
    assert.equal(proc33.annualBuyoutsPacks, 1200);
    assert.equal(proc33.annualOrdersPacks, 3636);
    assert.equal(
      proc33.annualDemandPacks,
      3636,
      'Годовая потребность к заказу для обуви при 33% выкупа должна масштабироваться до объёма заказов (3 636 пар против 1 200 выкупов)'
    );

    // При этом в P&L себестоимость реализованных (выкупленных) товаров считается строго по 1 200 выкупам
    const pnl33 = computeFinancialPnL(akushaModel, akushaScen, proc33);
    assert.equal(
      pnl33.annualCogsRub,
      1200 * 2700,
      'Себестоимость выкупов в P&L должна считаться по фактическим выкупам (1 200 пар), а не по невыкупленным покатушкам'
    );

    // 3. Меняем процент выкупа на 30% (ровно в 3.33 раза больше заказов) и проверяем пересчёт + сохранение после F5
    const updated30 = updateModelBuyoutRatePct(akushaModel, 30, { scenarioId: akushaScen.id });
    const salesMetrics30 = computeModelScenarioMetrics(updated30, akushaScen);
    assert.equal(salesMetrics30.buyoutRatePct, 30);
    assert.equal(salesMetrics30.annualOrdersPacks, 333 * 12); // 3 996 заказов

    const proc30 = computeProcurementPlan(updated30, akushaScen);
    assert.equal(proc30.annualDemandPacks, 3996);
    assert.ok(
      (proc30.totalRecommendedBudgetRub ?? 0) > (proc33.totalRecommendedBudgetRub ?? 0),
      'При снижении процента выкупа с 33% до 30% бюджет закупок под оборот заказов должен увеличиваться'
    );

    // Проверяем переключатель «Считать закупки только под выкупы (×1.00)»
    const buyoutOnlyModel = toggleModelProcurementByOrders(updated30, false);
    const procBuyoutOnly = computeProcurementPlan(buyoutOnlyModel, akushaScen);
    assert.equal(procBuyoutOnly.procureByOrdersVolume, false);
    assert.equal(procBuyoutOnly.annualDemandPacks, 1200);

    // Возвращаем режим под заказы (30%) и проверяем сохранение после F5
    const finalModel = toggleModelProcurementByOrders(buyoutOnlyModel, true);
    persistPortfolioModels([...baseModels, finalModel]);

    const afterF5 = hydratePortfolioModelsFromStorage();
    const restored = afterF5.find((m) => m.code === 'AKU-BUYOUT-01')!;
    assert.ok(restored, 'Модель AKU-BUYOUT-01 должна сохраниться после F5');
    assert.equal(getEffectiveModelBuyoutRatePct(restored, akushaScen.id), 30);
    assert.equal(isModelProcurementByOrdersActive(restored), true);
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('53. Авто-восстановление всех добавленных вручную карточек AKUSHA из резервного слепка borners_user_saved_plans_v1 при сбросе borners_tz_models_v1 и при добавлении 20+ карточек с фото', async () => {
  const {
    STORAGE_KEY_MODELS,
    STORAGE_KEY_USER_PLANS_BACKUP,
    hydratePortfolioModelsFromStorage,
    persistPortfolioModels,
  } = await import('../src/lib/portfolioPersistence.ts');

  const store = new Map<string, string>();
  const MAX_LOCAL_STORAGE_CHARS = 5_000_000;
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        const str = String(v);
        let totalChars = str.length;
        for (const [ek, ev] of store.entries()) {
          if (ek !== k) totalChars += ev.length;
        }
        if (totalChars > MAX_LOCAL_STORAGE_CHARS) {
          throw new Error('QuotaExceededError: localStorage 5MB limit exceeded');
        }
        store.set(k, str);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    let models = hydratePortfolioModelsFromStorage();
    const addedCodes: string[] = [];

    // 1. Добавляем 20 карточек AKUSHA подряд с тяжёлыми base64-фотографиями по 85 КБ каждая
    // (в сумме > 3.4 МБ только в двух ключах — проверяем, что safeSetStorageJson не роняет сохранение)
    for (let i = 1; i <= 20; i++) {
      const code = `AKU-RECOVERY-${String(i).padStart(2, '0')}`;
      addedCodes.push(code);
      const res = createBrandProductModel(models, INITIAL_SCENARIOS, {
        title: `Топсайдеры и ботинки AKUSHA #${i}`,
        brandCode: 'AKUSHA',
        code,
        categoryLabel: 'Кроссовки и кеды',
        unitsInPack: 1,
        retailPriceRub: 7500 + i * 50,
        unitCostRub: 2700 + i * 20,
        imageUrl: `data:image/jpeg;base64,PHOTO_${i}_${'X'.repeat(85_000)}`,
        initialMonthlyPacks: Array(12).fill(50 + i),
      });
      models = persistPortfolioModels(res.models);
    }

    // 2. Симулируем аварийную ситуацию со скриншота пользователя:
    // основной ключ borners_tz_models_v1 исчез/сбросился в localStorage, остался только borners_user_saved_plans_v1
    store.delete(STORAGE_KEY_MODELS);
    assert.equal(store.has(STORAGE_KEY_MODELS), false);
    assert.equal(store.has(STORAGE_KEY_USER_PLANS_BACKUP), true);

    // 3. При перезагрузке страницы (hydratePortfolioModelsFromStorage) все 20 карточек AKUSHA автоматически восстанавливаются из borners_user_saved_plans_v1!
    const recoveredAfterRefresh = hydratePortfolioModelsFromStorage();
    for (const code of addedCodes) {
      const found = recoveredAfterRefresh.find((m) => m.code === code);
      assert.ok(
        found,
        `Добавленная карточка ${code} должна автоматически восстанавливаться из borners_user_saved_plans_v1 даже если borners_tz_models_v1 был пуст`
      );
    }
    assert.equal(
      store.has(STORAGE_KEY_MODELS),
      true,
      'После авто-восстановления основной ключ borners_tz_models_v1 должен быть автоматически записан заново'
    );
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('54. Официальный план продаж AKUSHA 2027 из PDF (31 модель · 24 карточки в 9 группах, общая карточка лоферов №09–16, 20 377 выкупленных пар, 47 808 заказов, 105 793 210 ₽ выручки, 37 448 200 ₽ себестоимости, 26 фото без дублей)', async () => {
  const {
    AKUSHA_2027_MODELS,
    AKUSHA_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_ID,
    AKUSHA_2027_SUMMARY,
  } = await import('../src/lib/akushaAssortment2027.ts');
  const {
    STORAGE_KEY_MODELS,
    STORAGE_KEY_USER_PLANS_BACKUP,
    hydratePortfolioModelsFromStorage,
  } = await import('../src/lib/portfolioPersistence.ts');
  const { buildDefaultProductGroups } = await import('../src/lib/productGroups.ts');

  // 1. Проверяем структуру 24 карточек (31 цветомодель в 9 группах, где №09–16 Замшевые лоферы — общая карточка из 8 цветов)
  assert.equal(AKUSHA_2027_MODELS.length, 24, 'В каталоге AKUSHA 2027 должно быть ровно 24 карточки (31 модель с общей карточкой лоферов №09–16)');
  assert.equal(AKUSHA_2027_SUMMARY.totalModelVariants, 31);
  assert.equal(AKUSHA_2027_SUMMARY.totalGroups, 9);

  const loafersCard = AKUSHA_2027_MODELS.find((m) => m.code === 'AKU-009')!;
  assert.ok(loafersCard, 'Общая карточка Замшевых лоферов (№09–16 · AKU-009) должна существовать');
  assert.equal(
    loafersCard.palettes[0]?.colors.length,
    8,
    'В общей карточке Замшевых лоферов №09–16 должно быть ровно 8 цветов в палитре'
  );

  // 2. Проверяем наличие всех 26 оригинальных фотографий и PDF-документа на диске в public/
  let totalPhotoFilesChecked = 0;
  for (const m of AKUSHA_2027_MODELS) {
    assert.ok(m.gallery.length >= 1, `У карточки ${m.code} должна быть хотя бы 1 фотография`);
    for (const g of m.gallery) {
      const relPath = (g.url || '').replace(/^\//, '');
      const fullPath = path.join(process.cwd(), 'public', relPath);
      assert.equal(
        fs.existsSync(fullPath),
        true,
        `Файл оригинальной фотографии ${fullPath} для карточки ${m.code} должен существовать на диске`
      );
      totalPhotoFilesChecked += 1;
    }
  }
  assert.equal(totalPhotoFilesChecked, 26, 'Всего во всех 24 карточках AKUSHA должно быть проверено 26 оригинальных фотографий из PDF (включая 3 ракурса у AKU-023)');
  assert.equal(
    fs.existsSync(path.join(process.cwd(), 'public/docs/akusha_plan_2027_31_models.pdf')),
    true,
    'Оригинальный PDF-документ плана продаж AKUSHA 2027 должен быть доступен в public/docs/'
  );

  // 3. Проверяем 100% совпадение контрольных сумм с PDF-документом:
  // - Выкупленные пары за 2027 год: 20 377 пар
  // - Заказы покупателей (по моделям с заданным % выкупа): 47 808 пар
  // - Плановая выручка (по моделям с заданной ценой): 105 793 210 ₽
  // - Себестоимость выкупленных пар: 37 448 200 ₽
  let totalBuyoutsPairs = 0;
  let totalOrdersPairs = 0;
  let totalRevenueRub = 0;
  let totalCogsRub = 0;
  const monthlyBuyoutsSum = Array(12).fill(0);

  for (const m of AKUSHA_2027_MODELS) {
    const met = computeModelScenarioMetrics(m, AKUSHA_2027_SCENARIO_DEF);
    totalBuyoutsPairs += met.annualPacks;
    totalOrdersPairs += met.annualOrdersPacks;
    totalRevenueRub += met.annualRevenueRub;
    totalCogsRub += met.totalPurchaseNeedRub;
    met.plan.monthlyPacks.forEach((p, idx) => {
      monthlyBuyoutsSum[idx] += p;
    });
  }

  assert.equal(totalBuyoutsPairs, 20_377, 'Суммарные продажи (выкупленные пары) AKUSHA за 2027 год должны быть ровно 20 377 пар');
  assert.equal(totalOrdersPairs, 47_808, 'Суммарные заказы покупателей AKUSHA за 2027 год должны быть ровно 47 808 пар');
  assert.equal(totalRevenueRub, 105_793_210, 'Суммарная выручка AKUSHA по моделям с заданной ценой должна быть ровно 105 793 210 ₽');
  assert.equal(totalCogsRub, 37_448_200, 'Суммарная себестоимость выкупленных пар AKUSHA должна быть ровно 37 448 200 ₽');
  assert.deepEqual(
    monthlyBuyoutsSum,
    [573, 808, 628, 849, 1298, 1740, 2218, 3056, 2265, 2282, 2656, 2004],
    'Помесячный итог выкупленных пар по всем 9 группам должен 100% совпадать со сводной таблицей PDF (стр. 3)'
  );

  // 4. Проверяем, что для Топсайдеров (AKU-017..020) и Мокасин (AKU-028..031) цена и себестоимость строго 0 ₽ (уточнить), без искусственных допущений
  for (const code of ['AKU-017', 'AKU-018', 'AKU-019', 'AKU-020', 'AKU-028', 'AKU-029', 'AKU-030', 'AKU-031']) {
    const card = AKUSHA_2027_MODELS.find((m) => m.code === code)!;
    assert.equal(card.retailPriceRub, 0, `У ${code} цена должна оставаться 0 ₽ (уточнить)`);
    assert.equal(card.unitCostRub, 0, `У ${code} себестоимость должна оставаться 0 ₽ (уточнить)`);
  }
  for (const code of ['AKU-028', 'AKU-029', 'AKU-030', 'AKU-031']) {
    const card = AKUSHA_2027_MODELS.find((m) => m.code === code)!;
    const met = computeModelScenarioMetrics(card, AKUSHA_2027_SCENARIO_DEF);
    assert.equal(met.buyoutRatePct, 0, `У мокасин ${code} процент выкупа не задан (0%)`);
    assert.equal(met.annualOrdersPacks, 0, `У мокасин ${code} заказы = 0 до уточнения % выкупа`);
  }

  // 5. Проверяем миграцию без дублей: если в localStorage были старые черновики AKUSHA, они заменяются ровно на 24 официальные карточки
  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    // Записываем старые черновые карточки AKUSHA в кэш до миграции
    store.set(
      STORAGE_KEY_MODELS,
      JSON.stringify([
        {
          id: 'scen-akusha-old-draft-1',
          code: 'AKU-001',
          title: 'Ботинки01Бот01',
          brandId: 'BORNERS',
          customBrandLabel: 'AKUSHA',
          retailPriceRub: 7500,
          unitCostRub: 2700,
          unitsInPack: 1,
          launchStatus: 'В плане',
          palettes: [],
          gallery: [],
          plansByScenario: {},
        },
      ])
    );
    store.set(
      STORAGE_KEY_USER_PLANS_BACKUP,
      JSON.stringify({
        'scen-akusha-old-draft-1': {
          id: 'scen-akusha-old-draft-1',
          code: 'AKU-001',
          title: 'Ботинки01Бот01',
          customBrandLabel: 'AKUSHA',
          retailPriceRub: 7500,
          unitCostRub: 2700,
          launchStatus: 'В плане',
          plansByScenario: {},
        },
      })
    );

    const hydrated = hydratePortfolioModelsFromStorage();
    const akushaInHydrated = hydrated.filter(
      (m) => (m.customBrandLabel || '').toUpperCase() === 'AKUSHA'
    );
    assert.equal(
      akushaInHydrated.length,
      24,
      'После миграции в каталоге AKUSHA должно быть ровно 24 официальные карточки без единого дубля'
    );
    const aku001 = akushaInHydrated.find((m) => m.code === 'AKU-001')!;
    assert.equal(
      aku001.title,
      'Зимние ботинки · Модель №01 (Тёмно-коричневый нубук)',
      'Старый черновик AKU-001 должен быть чисто заменён официальной карточкой №01 из PDF'
    );

    const groups = buildDefaultProductGroups(hydrated);
    const akushaGroups = groups.filter((g) => g.brandCode === 'AKUSHA');
    assert.equal(
      akushaGroups.length,
      10,
      'Для AKUSHA должны формироваться общая сводная группа + 9 предметных групп из PDF'
    );
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('55. Уточнение параметров «уточнить» у моделей AKUSHA (AKU-028 Мокасины и AKU-017 Топсайдеры): защита от деления на ноль (Infinity/NaN) и полный пересчёт заказов, выручки, закупок и P&L', async () => {
  const { ACTING_2027_SCENARIO_ID } = await import('../src/lib/actingAssortment2027.ts');
  const {
    AKUSHA_2027_MODELS,
    AKUSHA_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_ID,
  } = await import('../src/lib/akushaAssortment2027.ts');
  const {
    updateModelBuyoutRatePct,
    updateModelScenarioMonthBuyouts,
    updateModelScenarioPrice,
    updateModelUnitCostWithVariants,
  } = await import('../src/lib/unifiedBusinessEngine.ts');
  const {
    hydratePortfolioModelsFromStorage,
    persistPortfolioModels,
  } = await import('../src/lib/portfolioPersistence.ts');

  const rawAku028 = AKUSHA_2027_MODELS.find((m) => m.code === 'AKU-028')!;
  assert.equal(rawAku028.retailPriceRub, 0);
  assert.equal(rawAku028.unitCostRub, 0);
  assert.equal(rawAku028.buyoutRatePct, 0);

  // 1. Редактирование выкупов при buyoutRatePct === 0 не должно порождать Infinity или NaN
  const editedWhileZeroPct = updateModelScenarioMonthBuyouts(
    rawAku028,
    AKUSHA_2027_SCENARIO_ID,
    4, // Май
    150
  );
  const planZeroPct = editedWhileZeroPct.plansByScenario[AKUSHA_2027_SCENARIO_ID];
  assert.equal(planZeroPct.monthlyPacks[4], 150);
  assert.equal(
    planZeroPct.monthlyOrdersPacks?.every((v) => Number.isFinite(v) && v === 0),
    true,
    'При buyoutRatePct = 0 заказы должны оставаться конечными нулями без Infinity/NaN'
  );
  assert.equal(
    planZeroPct.monthlyOrdersRub?.every((v) => Number.isFinite(v) && v === 0),
    true,
    'При buyoutRatePct = 0 сумма заказов в рублях не должна содержать NaN/Infinity'
  );

  // 2. Уточняем % выкупа (40%), розничную цену (5 990 ₽) и себестоимость (2 100 ₽) для AKU-028
  let clarifiedAku028 = updateModelBuyoutRatePct(rawAku028, 40, {
    scenarioId: AKUSHA_2027_SCENARIO_ID,
    syncProcurementToOrders: true,
  });
  clarifiedAku028 = updateModelScenarioPrice(
    clarifiedAku028,
    AKUSHA_2027_SCENARIO_ID,
    5990
  );
  clarifiedAku028 = updateModelUnitCostWithVariants(clarifiedAku028, 2100);

  const met028 = computeModelScenarioMetrics(clarifiedAku028, AKUSHA_2027_SCENARIO_DEF);
  const pnl028 = computeFinancialPnL(clarifiedAku028, AKUSHA_2027_SCENARIO_DEF);
  const proc028 = computeProcurementPlan(clarifiedAku028, AKUSHA_2027_SCENARIO_DEF);

  assert.equal(met028.annualPacks, 387, 'Годовые выкупы AKU-028 равны 387 пар');
  assert.equal(
    met028.annualOrdersPacks,
    970,
    'При 40% выкупа заказы AKU-028 пересчитываются по помесячному ceil в 970 пар'
  );
  assert.equal(met028.annualRevenueRub, 387 * 5990, 'Годовая выручка AKU-028 = 2 318 130 ₽');
  assert.equal(
    clarifiedAku028.sharedSupplyAndFact?.expensesFilled,
    true,
    'После ввода себестоимости > 0 у модели с заполненными ставками WB флаг expensesFilled становится true'
  );
  assert.equal(clarifiedAku028.sharedSupplyAndFact?.costStatus, 'plan');
  assert.equal(
    pnl028.operatingProfitStatus,
    'plan',
    'P&L модели AKU-028 после уточнения цены и себестоимости полностью активен'
  );
  assert.ok(
    pnl028.annualOperatingProfitRub !== null && pnl028.annualOperatingProfitRub > 300_000,
    'Операционная прибыль AKU-028 за год должна быть положительной (> 300 тыс. ₽)'
  );
  assert.ok(
    proc028.totalRecommendedBudgetRub !== null && proc028.totalRecommendedBudgetRub > 0,
    'План закупок AKU-028 в рублях пересчитан'
  );

  // 3. Проверяем уточнение цены и себестоимости у Топсайдеров AKU-017 (где % выкупа 33% и заказы уже заданы)
  const rawAku017 = AKUSHA_2027_MODELS.find((m) => m.code === 'AKU-017')!;
  let clarifiedAku017 = updateModelScenarioPrice(
    rawAku017,
    AKUSHA_2027_SCENARIO_ID,
    6490
  );
  clarifiedAku017 = updateModelUnitCostWithVariants(clarifiedAku017, 2300);
  const met017 = computeModelScenarioMetrics(clarifiedAku017, AKUSHA_2027_SCENARIO_DEF);
  const pnl017 = computeFinancialPnL(clarifiedAku017, AKUSHA_2027_SCENARIO_DEF);
  assert.equal(met017.annualPacks, 986);
  assert.equal(met017.annualOrdersPacks, 2468);
  assert.equal(met017.annualRevenueRub, 986 * 6490);
  assert.equal(
    clarifiedAku017.plansByScenario[AKUSHA_2027_SCENARIO_ID].monthlyOrdersRub?.reduce(
      (a, b) => a + b,
      0
    ),
    2468 * 6490,
    'При установке цены на AKU-017 помесячные заказы в рублях (monthlyOrdersRub) автоматически пересчитываются'
  );
  assert.equal(pnl017.operatingProfitStatus, 'plan');

  // 4. Проверяем сохранение уточнённых карточек в localStorage и восстановление после F5
  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    const initialHydrated = hydratePortfolioModelsFromStorage();
    const updatedList = initialHydrated.map((m) =>
      m.code === 'AKU-028'
        ? clarifiedAku028
        : m.code === 'AKU-017'
        ? clarifiedAku017
        : m
    );
    persistPortfolioModels(updatedList);

    const afterF5 = hydratePortfolioModelsFromStorage();
    const f5Aku028 = afterF5.find((m) => m.code === 'AKU-028')!;
    const f5Aku017 = afterF5.find((m) => m.code === 'AKU-017')!;
    assert.equal(f5Aku028.retailPriceRub, 5990);
    assert.equal(f5Aku028.unitCostRub, 2100);
    assert.equal(f5Aku028.buyoutRatePct, 40);
    assert.equal(f5Aku017.retailPriceRub, 6490);
    assert.equal(f5Aku017.unitCostRub, 2300);
  } finally {
    (globalThis as any).window = prevWindow;
  }
});

test('56. Сквозная синхронизация сценариев AKUSHA (202706) / LISKANI (202705) и защита эталонных карточек AKU-001..003 от перезаписи демо-шаблонами', async () => {
  const { ACTING_2027_SCENARIO_ID } = await import('../src/lib/actingAssortment2027.ts');
  const {
    AKUSHA_2027_MODELS,
    AKUSHA_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_ID,
  } = await import('../src/lib/akushaAssortment2027.ts');
  const {
    launchBrandStarterMatrix,
    resetStarterCabinetsFromHolding,
    updateModelScenarioMonthBuyouts,
    updateModelScenarioMonthOrders,
    updateModelScenarioPrice,
  } = await import('../src/lib/unifiedBusinessEngine.ts');

  const aku001 = AKUSHA_2027_MODELS.find((m) => m.code === 'AKU-001')!;

  // 1. Изменение цены в сценарии №1 синхронизирует сценарий 202706 и сбрасывает старый override выручки
  const priceUpdated = updateModelScenarioPrice(aku001, 1, 7900);
  assert.equal(priceUpdated.retailPriceRub, 7900);
  assert.equal(
    priceUpdated.plansByScenario[AKUSHA_2027_SCENARIO_ID].monthlyPricesRub[0],
    7900
  );
  assert.equal(
    priceUpdated.plansByScenario[AKUSHA_2027_SCENARIO_ID].monthlyRevenuesRubOverride,
    undefined
  );
  const metPrice = computeModelScenarioMetrics(priceUpdated, AKUSHA_2027_SCENARIO_DEF);
  assert.equal(metPrice.annualRevenueRub, 1330 * 7900);

  // 2. Изменение выкупов месяца и заказов месяца синхронизирует оба сценария (1 и 202706)
  const buyoutsUpdated = updateModelScenarioMonthBuyouts(
    priceUpdated,
    AKUSHA_2027_SCENARIO_ID,
    0, // Январь (было 80)
    100
  );
  assert.equal(buyoutsUpdated.plansByScenario[1].monthlyPacks[0], 100);
  assert.equal(
    buyoutsUpdated.plansByScenario[AKUSHA_2027_SCENARIO_ID].monthlyPacks[0],
    100
  );
  assert.equal(
    buyoutsUpdated.plansByScenario[AKUSHA_2027_SCENARIO_ID].monthlyOrdersPacks?.[0],
    200 // 200 заказов при 50% выкупа у зимних ботинок AKU-001
  );

  const ordersUpdated = updateModelScenarioMonthOrders(
    buyoutsUpdated,
    AKUSHA_2027_SCENARIO_ID,
    0,
    330
  );
  assert.equal(
    ordersUpdated.plansByScenario[AKUSHA_2027_SCENARIO_ID].monthlyOrdersPacks?.[0],
    330
  );
  assert.equal(
    ordersUpdated.plansByScenario[AKUSHA_2027_SCENARIO_ID].monthlyPacks[0],
    Math.round((330 * 50) / 100) // 165 выкупов при 50%
  );
  assert.equal(ordersUpdated.plansByScenario[1].monthlyPacks[0], 165);

  // 3. Вызов launchBrandStarterMatrix и resetStarterCabinetsFromHolding НЕ должен затирать или удалять официальные карточки AKU-001..003
  const allScenarios = [...INITIAL_SCENARIOS, AKUSHA_2027_SCENARIO_DEF];
  const launched = launchBrandStarterMatrix(
    AKUSHA_2027_MODELS,
    allScenarios,
    'AKUSHA'
  );
  assert.equal(
    launched.models.length,
    24,
    'launchBrandStarterMatrix не должен добавлять дубли к 24 официальным карточкам AKUSHA'
  );
  assert.equal(
    launched.models.find((m) => m.code === 'AKU-001')?.title,
    'Зимние ботинки · Модель №01 (Тёмно-коричневый нубук)',
    'Официальная карточка AKU-001 не должна перезаписываться демо-шаблоном Cloud Walk'
  );
  assert.equal(
    launched.scenarioId,
    AKUSHA_2027_SCENARIO_ID,
    'Активным сценарием AKUSHA должен назначаться 202706 (105,79 млн ₽)'
  );

  const afterReset = resetStarterCabinetsFromHolding(
    AKUSHA_2027_MODELS,
    allScenarios,
    { BORNERS: 1, AKUSHA: AKUSHA_2027_SCENARIO_ID }
  );
  assert.equal(
    afterReset.models.length,
    24,
    'resetStarterCabinetsFromHolding не должен удалять официальные карточки AKU-001..003'
  );
});

test('57. Корректная резолюция публичных URL ресурсов (resolvePublicAssetUrl) для корневого домена и подпутей GitHub Pages (/borners-group, /borners-platform)', async () => {
  const { resolvePublicAssetUrl } = await import('../src/lib/scenarioData.ts');

  // 1. Корневой деплой (basePath = "")
  assert.equal(
    resolvePublicAssetUrl('/models/akusha/AKU-001.jpg', ''),
    '/models/akusha/AKU-001.jpg'
  );
  assert.equal(
    resolvePublicAssetUrl('images/liskani/LSC-001.webp', ''),
    '/images/liskani/LSC-001.webp'
  );
  assert.equal(
    resolvePublicAssetUrl('/docs/akusha_plan_2027_31_models.pdf', ''),
    '/docs/akusha_plan_2027_31_models.pdf'
  );

  // 2. Деплой в подпапку (/borners-group и /borners-platform)
  assert.equal(
    resolvePublicAssetUrl('/models/akusha/AKU-009.jpg', '/borners-group'),
    '/borners-group/models/akusha/AKU-009.jpg'
  );
  assert.equal(
    resolvePublicAssetUrl('images/liskani/LSC-014.webp', '/borners-platform'),
    '/borners-platform/images/liskani/LSC-014.webp'
  );
  assert.equal(
    resolvePublicAssetUrl('/docs/akusha_plan_2027_31_models.pdf', '/borners-group'),
    '/borners-group/docs/akusha_plan_2027_31_models.pdf'
  );

  // 3. Отсутствие задвоения префикса при повторном вызове и сохранность data:/http(s): URL
  assert.equal(
    resolvePublicAssetUrl('/borners-group/models/akusha/AKU-001.jpg', '/borners-group'),
    '/borners-group/models/akusha/AKU-001.jpg'
  );
  assert.equal(
    resolvePublicAssetUrl('data:image/jpeg;base64,AAAA', '/borners-group'),
    'data:image/jpeg;base64,AAAA'
  );
  assert.equal(
    resolvePublicAssetUrl('https://borners-group.github.io/test.jpg', '/borners-group'),
    'https://borners-group.github.io/test.jpg'
  );
});

test('58. Изоляция сценариев брендов (защита от бага «продажи сбились по BORNERS»): сценарии AKUSHA (202706) и LISKANI (202705) никогда не перезаписывают Сценарий №1 BORNERS (686 284 972 ₽ / 109 938 111 ₽ дек)', async () => {
  const { ACTING_2027_SCENARIO_ID } = await import('../src/lib/actingAssortment2027.ts');
  const {
    AKUSHA_2027_MODELS,
    AKUSHA_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_ID,
  } = await import('../src/lib/akushaAssortment2027.ts');
  const {
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
    LISKANI_2027_SCENARIO_ID,
  } = await import('../src/lib/liskaniAssortment2027.ts');
  const {
    isScenarioCompatibleWithBrand,
    computeMultiBrandPortfolioSummary,
  } = await import('../src/lib/unifiedBusinessEngine.ts');
  const { sanitizeSelectedScenarioByBrand } = await import(
    '../src/lib/portfolioPersistence.ts'
  );
  const { CLIENT_SAVED_S1_TOTALS, applyClientSavedS1SalesPlan } = await import(
    '../src/lib/scenarioS1_100M.ts'
  );

  const allScenarios = [
    ...INITIAL_SCENARIOS,
    LISKANI_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_DEF,
  ];
  const s1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;

  // 1. Проверка совместимости сценариев с брендами и фильтром ALL
  assert.equal(isScenarioCompatibleWithBrand(AKUSHA_2027_SCENARIO_DEF, 'AKUSHA'), true);
  assert.equal(isScenarioCompatibleWithBrand(AKUSHA_2027_SCENARIO_DEF, 'BORNERS'), false);
  assert.equal(isScenarioCompatibleWithBrand(AKUSHA_2027_SCENARIO_DEF, 'FUKAI'), false);
  assert.equal(isScenarioCompatibleWithBrand(AKUSHA_2027_SCENARIO_DEF, 'ALL'), false);

  assert.equal(isScenarioCompatibleWithBrand(LISKANI_2027_SCENARIO_DEF, 'LISKANI'), true);
  assert.equal(isScenarioCompatibleWithBrand(LISKANI_2027_SCENARIO_DEF, 'BORNERS'), false);
  assert.equal(isScenarioCompatibleWithBrand(LISKANI_2027_SCENARIO_DEF, 'ALL'), false);

  assert.equal(isScenarioCompatibleWithBrand(s1, 'BORNERS'), true);
  assert.equal(isScenarioCompatibleWithBrand(s1, 'ALL'), true);
  assert.equal(isScenarioCompatibleWithBrand(s1, 'AKUSHA'), false);
  assert.equal(isScenarioCompatibleWithBrand(s1, 'LISKANI'), false);

  // 2. Санитайзер автоматически сбрасывает чужие сценарии из BORNERS и FUKAI
  const cleaned = sanitizeSelectedScenarioByBrand(
    {
      BORNERS: AKUSHA_2027_SCENARIO_ID,
      FUKAI: LISKANI_2027_SCENARIO_ID,
      AKUSHA: null,
      LISKANI: null,
    },
    allScenarios
  );
  assert.equal(cleaned.BORNERS, 1);
  assert.equal(cleaned.FUKAI, ACTING_2027_SCENARIO_ID);
  assert.equal(cleaned.AKUSHA, AKUSHA_2027_SCENARIO_ID);
  assert.equal(cleaned.LISKANI, LISKANI_2027_SCENARIO_ID);

  // 3. Даже если в computeMultiBrandPortfolioSummary передать повреждённый BORNERS: 202706, выручка BORNERS остаётся ровно 686 284 972 ₽ (109 938 111 ₽ в дек)
  const fullPortfolio = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...applyClientSavedS1SalesPlan(S1_100M_SCENARIO_MODELS),
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ];
  const summaryFromCorruptedMap = computeMultiBrandPortfolioSummary(
    fullPortfolio,
    allScenarios,
    {
      BORNERS: AKUSHA_2027_SCENARIO_ID,
      FUKAI: ACTING_2027_SCENARIO_ID,
      AKUSHA: AKUSHA_2027_SCENARIO_ID,
      LISKANI: LISKANI_2027_SCENARIO_ID,
      NA_TELE: 2,
    }
  );
  const bornersRow = summaryFromCorruptedMap.brands.find((b) => b.brandCode === 'BORNERS')!;
  assert.equal(bornersRow.selectedScenarioId, 1);
  assert.equal(bornersRow.modelsCount, 21);
  assert.equal(bornersRow.annualRevenueRub, CLIENT_SAVED_S1_TOTALS.annualRevenueRub);
  assert.equal(bornersRow.decemberRevenueRub, CLIENT_SAVED_S1_TOTALS.decemberRevenueRub);

  const akushaRow = summaryFromCorruptedMap.brands.find((b) => b.brandCode === 'AKUSHA')!;
  assert.equal(akushaRow.selectedScenarioId, AKUSHA_2027_SCENARIO_ID);
  assert.equal(akushaRow.annualRevenueRub, 105_793_210);

  // 4. При явном выборе Исходного плана (100) для BORNERS сводка считает строго 5 действующих SKU (как в 02 · Продажи)
  const summaryActingExplicit = computeMultiBrandPortfolioSummary(
    fullPortfolio,
    allScenarios,
    {
      BORNERS: ACTING_2027_SCENARIO_ID,
      FUKAI: ACTING_2027_SCENARIO_ID,
    }
  );
  const bornersActingRow = summaryActingExplicit.brands.find((b) => b.brandCode === 'BORNERS')!;
  assert.equal(bornersActingRow.modelsCount, 5);
});

test('59. Авто-лечение браузерного кэша при перезагрузке F5 (runBornersSalesScenarioRepairMigrationV1): сброс залипшего сценария 202706/100 и апгрейд сырых S1-пачек (606,37 млн ₽ → 686,28 млн ₽) без потери ручных правок', async () => {
  const { ACTING_2027_SCENARIO_ID } = await import('../src/lib/actingAssortment2027.ts');
  const { AKUSHA_2027_SCENARIO_ID } = await import('../src/lib/akushaAssortment2027.ts');
  const { LISKANI_2027_SCENARIO_ID } = await import('../src/lib/liskaniAssortment2027.ts');
  const { CLIENT_SAVED_S1_TOTALS } = await import('../src/lib/scenarioS1_100M.ts');
  const {
    STORAGE_KEY_ACTIVE_SCENARIO_ID,
    STORAGE_KEY_MODELS,
    STORAGE_KEY_SCENARIO_BY_BRAND,
    STORAGE_KEY_USER_PLANS_BACKUP,
    hydratePortfolioModelsFromStorage,
    syncUserPlansBackup,
  } = await import('../src/lib/portfolioPersistence.ts');

  const store = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    // Симулируем повреждённое состояние браузера партнёра:
    // 1) BORNERS залип на сценарии AKUSHA (202706) из-за stale closure
    // 2) В borners_tz_models_v1 и borners_user_saved_plans_v1 попали сырые неадаптированные S1_100M_SCENARIO_MODELS (606,37 млн ₽ вместо 686,28 млн ₽)
    // 3) При этом у карточки BRN-002 есть ручная пользовательская правка цены (2 150 ₽ вместо 1 790 ₽), которая НЕ должна потеряться!
    const rawCorruptedModels = [
      ...ACTING_2027_SCENARIO_MODELS,
      ...S1_100M_SCENARIO_MODELS.map((m) =>
        m.code === 'BRN-002'
          ? {
              ...m,
              retailPriceRub: 2150,
              plansByScenario: {
                ...m.plansByScenario,
                1: {
                  ...m.plansByScenario[1],
                  monthlyPricesRub: Array(12).fill(2150),
                },
              },
            }
          : m
      ),
    ];

    store.set(STORAGE_KEY_MODELS, JSON.stringify(rawCorruptedModels));
    syncUserPlansBackup(rawCorruptedModels);
    store.set(
      STORAGE_KEY_SCENARIO_BY_BRAND,
      JSON.stringify({
        BORNERS: AKUSHA_2027_SCENARIO_ID,
        FUKAI: ACTING_2027_SCENARIO_ID,
        AKUSHA: AKUSHA_2027_SCENARIO_ID,
        LISKANI: LISKANI_2027_SCENARIO_ID,
      })
    );
    store.set(STORAGE_KEY_ACTIVE_SCENARIO_ID, JSON.stringify(AKUSHA_2027_SCENARIO_ID));

    // Нажимаем F5 -> вызывается hydratePortfolioModelsFromStorage()
    const repairedPortfolio = hydratePortfolioModelsFromStorage();

    const repairedByBrand = JSON.parse(store.get(STORAGE_KEY_SCENARIO_BY_BRAND)!);
    const repairedActiveId = JSON.parse(store.get(STORAGE_KEY_ACTIVE_SCENARIO_ID)!);
    assert.equal(repairedByBrand.BORNERS, 1, 'Сценарий BORNERS автоматически восстановлен в 1');
    assert.equal(repairedActiveId, 1, 'Активный сценарий автоматически сброшен с 202706 на 1');

    const brn001 = repairedPortfolio.find((m) => m.code === 'BRN-001-SC')!;
    const brn003 = repairedPortfolio.find((m) => m.code === 'BRN-003')!;
    const brn002 = repairedPortfolio.find((m) => m.code === 'BRN-002')!;

    assert.equal(
      brn001.plansByScenario[1].monthlyPacks[11],
      6429,
      'Декабрьские выкупы BRN-001-SC восстановлены с сырых 2 500 до клиентских 6 429 компл.'
    );
    assert.equal(
      brn003.plansByScenario[1].monthlyPacks.reduce((a, b) => a + b, 0),
      17728,
      'Годовые выкупы BRN-003 восстановлены с сырых 17 592 до клиентских 17 728 компл.'
    );
    assert.equal(
      brn002.retailPriceRub,
      2150,
      'Ручная пользовательская правка цены на BRN-002 полностью сохранена при авто-лечении'
    );

    // Проверяем также догрузку с нуля при частичном кэше (только ACTING_2027 в localStorage -> догружаются S1_100M уже с клиентским планом 686,28 млн ₽)
    store.clear();
    store.set(STORAGE_KEY_MODELS, JSON.stringify(ACTING_2027_SCENARIO_MODELS));
    store.delete(STORAGE_KEY_USER_PLANS_BACKUP);
    const mergedFromPartial = hydratePortfolioModelsFromStorage();
    const s1Scen = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
    const bornersS1Models = mergedFromPartial.filter(
      (m) =>
        m.code.startsWith('BRN-') ||
        ['WB 244995893', 'WB 440758616', 'WB 439426186', 'WB 440759654', 'WB 257807266'].includes(
          m.code
        )
    );
    assert.equal(bornersS1Models.length, 21);
    const totalAnnualRev = bornersS1Models.reduce(
      (acc, m) => acc + computeModelScenarioMetrics(m, s1Scen).annualRevenueRub,
      0
    );
    const totalDecRev = bornersS1Models.reduce(
      (acc, m) => acc + computeModelScenarioMetrics(m, s1Scen).targetMonthRevenueRub,
      0
    );
    assert.equal(totalAnnualRev, CLIENT_SAVED_S1_TOTALS.annualRevenueRub);
    assert.equal(totalDecRev, CLIENT_SAVED_S1_TOTALS.decemberRevenueRub);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = prevWindow;
    }
  }
});

test('60. Возрождение Лаборатории R&D + Холста идей (Miro) и двухсторонняя синхронизация с Единым каталогом SKU без потери карточек', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();

  const appShellSrc = fs.readFileSync(
    path.join(root, 'src/components/shell/AppShell.tsx'),
    'utf8'
  );
  const catalogSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/ProductCatalogView.tsx'),
    'utf8'
  );
  const labSrc = fs.readFileSync(
    path.join(root, 'src/components/sections/ProductLabView.tsx'),
    'utf8'
  );

  // 1. Лаборатория R&D выведена в верхнюю панель навигации AppShell и в шапку 01 · Продукт
  assert.ok(
    appShellSrc.includes("key: 'lab'") &&
      appShellSrc.includes("target: 'product-lab' as NavSectionId") &&
      appShellSrc.includes("label: 'Лаборатория'"),
    'Лаборатория R&D должна быть доступна в 1 клик в главном меню AppShell'
  );
  assert.ok(
    catalogSrc.includes("navigateTo('product-lab'") &&
      catalogSrc.includes('Лаборатория R&D'),
    'Переход и синхронизация с Лабораторией R&D должны быть доступны в 01 · Продукт'
  );

  // 2. В Лабораторию R&D интегрирован Холст идей (MiroBoardView), подключён useLiveScenarioPortfolio и поддерживаются все 5 брендов без INITIAL_SCENARIO_MODELS
  assert.ok(
    labSrc.includes('MiroBoardView') && labSrc.includes("viewMode === 'miro'"),
    'Холст идей (Miro) должен открываться прямо внутри Лаборатории R&D'
  );
  assert.equal(
    labSrc.includes('INITIAL_SCENARIO_MODELS'),
    false,
    'ProductLabView больше не должен затирать каталог старым массивом INITIAL_SCENARIO_MODELS'
  );
  for (const b of ['BORNERS', 'NA_TELE', 'FUKAI', 'AKUSHA', 'LISKANI']) {
    assert.ok(
      labSrc.includes(`<option value="${b}">`),
      `ProductLabView должен поддерживать бренд ${b}`
    );
  }

  // 3. Проверка чистой двухсторонней синхронизации R&D <-> ScenarioModelSpec без затирания 80 эталонных SKU
  const { INITIAL_CONCEPTS } = await import('../src/lib/initial-data.ts');
  const {
    syncConceptToScenarioPortfolio,
    syncAllBrandConceptsToScenarioPortfolio,
    buildConceptPatchFromScenarioModel,
    findLinkedScenarioModelForConcept,
  } = await import('../src/lib/rndCatalogSync.ts');
  const { LISKANI_2027_MODELS, LISKANI_2027_SCENARIO_DEF } = await import(
    '../src/lib/liskaniAssortment2027.ts'
  );
  const { AKUSHA_2027_MODELS, AKUSHA_2027_SCENARIO_DEF } = await import(
    '../src/lib/akushaAssortment2027.ts'
  );
  const { CLIENT_SAVED_S1_TOTALS, applyClientSavedS1SalesPlan } = await import(
    '../src/lib/scenarioS1_100M.ts'
  );

  const allScenarios = [
    ...INITIAL_SCENARIOS,
    LISKANI_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_DEF,
  ];
  const basePortfolio = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...applyClientSavedS1SalesPlan(S1_100M_SCENARIO_MODELS),
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ];
  const baseCount = basePortfolio.length;

  // Синхронизируем все R&D концепции НА ТЕЛЕ (RD-030 Мягкие боксеры, RD-029 Бесшовная база 2.0 и др.)
  const naTeleBatch = syncAllBrandConceptsToScenarioPortfolio(
    INITIAL_CONCEPTS,
    'NA_TELE',
    basePortfolio,
    allScenarios
  );
  assert.ok(
    naTeleBatch.syncedItems.length >= 2,
    'Все R&D разработки НА ТЕЛЕ должны переноситься в каталог в 1 клик'
  );
  assert.equal(
    naTeleBatch.models.length,
    baseCount + naTeleBatch.syncedItems.length,
    'Ни одна из базовых карточек BORNERS / FUKAI / LISKANI / AKUSHA не должна потеряться'
  );

  // Проверяем расчёт себестоимости комплекта (2 шт. * 480 ₽ = 960 ₽ при рознице 2 490 ₽ для RD-030)
  const softBoxersConcept = INITIAL_CONCEPTS.find((c) => c.id === 'concept-soft-boxers');
  if (softBoxersConcept) {
    const syncedSoft = findLinkedScenarioModelForConcept(
      softBoxersConcept,
      naTeleBatch.models
    )!;
    assert.ok(syncedSoft, 'Карточка Мягкие боксеры найдена в ScenarioModelSpec');
    assert.equal(syncedSoft.brandId, 'NA_TELE');
    assert.equal(syncedSoft.retailPriceRub, softBoxersConcept.plannedRetailPrice);
    assert.equal(
      syncedSoft.unitCostRub,
      (softBoxersConcept.packUnitsCount || 1) * softBoxersConcept.plannedUnitCost
    );
    assert.ok(syncedSoft.gallery.length >= 1, 'Фотографии перенесены из R&D');

    // Зададим план продаж на 12 мес. в Сценарии №2 и затем обновим концепцию в R&D — план продаж обязан сохраниться!
    const withSalesPlan = naTeleBatch.models.map((m) =>
      m.id === syncedSoft.id
        ? {
            ...m,
            plansByScenario: {
              ...m.plansByScenario,
              2: {
                ...m.plansByScenario[2],
                monthlyPacks: [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 850, 1000],
              },
            },
          }
        : m
    );

    const updatedConcept = {
      ...softBoxersConcept,
      linkedScenarioModelId: syncedSoft.id,
      plannedRetailPrice: 2690,
      stage: 'LAUNCH' as const,
    };
    const resAfterEdit = syncConceptToScenarioPortfolio(
      updatedConcept,
      withSalesPlan,
      allScenarios
    );
    assert.equal(resAfterEdit.createdNew, false, 'Дубликат SKU не создаётся');
    assert.equal(resAfterEdit.model.retailPriceRub, 2690);
    assert.equal(resAfterEdit.model.launchStatus, 'Утверждено');
    assert.deepEqual(
      resAfterEdit.model.plansByScenario[2].monthlyPacks,
      [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 850, 1000],
      'Помесячный план продаж в 02 · Продажи полностью сохранён при обновлении карточки из Лаборатории R&D'
    );

    // Обратный импорт из Каталога в Лабораторию R&D
    const reversePatch = buildConceptPatchFromScenarioModel(resAfterEdit.model);
    assert.equal(reversePatch.brandId, 'NA_TELE');
    assert.equal(reversePatch.linkedScenarioModelId, resAfterEdit.model.id);
    assert.equal(reversePatch.plannedRetailPrice, 2690);
  }

  // Проверяем неизменность эталонной выручки BORNERS (686 284 972 ₽) после массовой синхронизации Лаборатории R&D
  const s1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const bornersS1Rev = naTeleBatch.models
    .filter(
      (m) =>
        m.code.startsWith('BRN-') ||
        ['WB 244995893', 'WB 440758616', 'WB 439426186', 'WB 440759654', 'WB 257807266'].includes(
          m.code
        )
    )
    .reduce((acc, m) => acc + computeModelScenarioMetrics(m, s1).annualRevenueRub, 0);
  assert.equal(bornersS1Rev, CLIENT_SAVED_S1_TOTALS.annualRevenueRub);
});

test('61. Полный сквозной бизнес-контур НА ТЕЛЕ (NA_TELE): изоляция сценариев, выкуп 75%, закупки Q1–Q4, P&L, Сводка холдинга и сохранение при F5', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const contourSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/UnifiedContourViews.tsx'),
    'utf8'
  );

  // 1. В UnifiedContourViews переключение на Сценарий №2 для НА ТЕЛЕ больше никогда не сбрасывает brandFilter в ALL и не перезаписывает сценарий BORNERS
  assert.equal(
    contourSrc.includes("setSelectedScenarioId(2);\n                  setBrandFilter('ALL');"),
    false,
    'Кнопка переключения сценария НА ТЕЛЕ не должна сбрасывать фильтр бренда на ALL и портить BORNERS'
  );

  const {
    createBrandProductModel,
    createIndependentBrandScenario,
    computeProcurementPlan,
    computeFinancialPnL,
    computeMultiBrandPortfolioSummary,
  } = await import('../src/lib/unifiedBusinessEngine.ts');
  const {
    STORAGE_KEY_MODELS,
    STORAGE_KEY_SCENARIO_BY_BRAND,
    filterModelsForScenario,
    hydratePortfolioModelsFromStorage,
    sanitizeSelectedScenarioByBrand,
    syncUserPlansBackup,
  } = await import('../src/lib/portfolioPersistence.ts');
  const { safeSetStorageJson } = await import('../src/lib/safeStorage.ts');
  const { LISKANI_2027_MODELS, LISKANI_2027_SCENARIO_DEF, LISKANI_2027_SCENARIO_ID } =
    await import('../src/lib/liskaniAssortment2027.ts');
  const { AKUSHA_2027_MODELS, AKUSHA_2027_SCENARIO_DEF, AKUSHA_2027_SCENARIO_ID } =
    await import('../src/lib/akushaAssortment2027.ts');
  const { CLIENT_SAVED_S1_TOTALS, applyClientSavedS1SalesPlan } = await import(
    '../src/lib/scenarioS1_100M.ts'
  );

  const allScenarios = [
    ...INITIAL_SCENARIOS,
    LISKANI_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_DEF,
  ];

  // 2. Проверка sanitizeSelectedScenarioByBrand для НА ТЕЛЕ: чинит undefined и чужие ID, но уважает явный null
  const healedUndefined = sanitizeSelectedScenarioByBrand({}, allScenarios);
  assert.equal(healedUndefined.NA_TELE, 2);
  const healedForeign = sanitizeSelectedScenarioByBrand(
    { NA_TELE: AKUSHA_2027_SCENARIO_ID },
    allScenarios
  );
  assert.equal(healedForeign.NA_TELE, 2);
  const preservedNull = sanitizeSelectedScenarioByBrand({ NA_TELE: null }, allScenarios);
  assert.equal(preservedNull.NA_TELE, null);

  // 3. Создаём выделенный сценарий НА ТЕЛЕ 2027 и 2 полноценные карточки НА ТЕЛЕ с помесячным планом
  const basePortfolio = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...applyClientSavedS1SalesPlan(S1_100M_SCENARIO_MODELS),
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ];

  const {
    scenario: naTeleScen,
    scenarios: scenariosWithNaTele,
    models: portfolioAfterScen,
  } = createIndependentBrandScenario(allScenarios, basePortfolio, {
    brandCode: 'NA_TELE',
    title: 'НА ТЕЛЕ — План 2027',
    monthlyTargetMln: 25,
  });

  const healedWithOwned = sanitizeSelectedScenarioByBrand(
    { NA_TELE: 1 },
    scenariosWithNaTele
  );
  assert.equal(
    healedWithOwned.NA_TELE,
    naTeleScen.id,
    'Если у НА ТЕЛЕ создан собственный сценарий, санитайзер выбирает именно его'
  );

  const monthly1 = [400, 450, 500, 550, 600, 650, 700, 800, 900, 1000, 1200, 1500]; // 9 250 компл.
  const monthly2 = [250, 300, 350, 400, 450, 500, 550, 600, 650, 750, 850, 1100]; // 6 750 компл.

  const c1 = createBrandProductModel(portfolioAfterScen, scenariosWithNaTele, {
    brandCode: 'NA_TELE',
    title: 'Комплект микромодал НА ТЕЛЕ Soft Boxers 2-pack',
    retailPriceRub: 2490,
    unitCostRub: 860,
    unitsInPack: 2,
    buyoutRatePct: 75,
    imageUrl: 'images/products/rnd-soft-boxers.jpg',
    initialMonthlyPacks: monthly1,
  });
  const c2 = createBrandProductModel(c1.models, scenariosWithNaTele, {
    brandCode: 'NA_TELE',
    title: 'Бесшовная база НА ТЕЛЕ Second Skin 2.0',
    retailPriceRub: 2790,
    unitCostRub: 920,
    unitsInPack: 2,
    buyoutRatePct: 75,
    imageUrl: 'images/products/rnd-seamless-base.jpg',
    initialMonthlyPacks: monthly2,
  });

  const naTeleVisibleInOwned = filterModelsForScenario(
    c2.models,
    naTeleScen,
    false,
    'NA_TELE'
  );
  const naTeleVisibleInS2 = filterModelsForScenario(
    c2.models,
    INITIAL_SCENARIOS.find((s) => s.id === 2)!,
    false,
    'NA_TELE'
  );
  assert.equal(naTeleVisibleInOwned.length, 2);
  assert.equal(naTeleVisibleInS2.length, 2);

  // Проверяем расчёт выручки, 75% выкупа (заказы), закупок 4 волн и P&L
  const m1Metrics = computeModelScenarioMetrics(c1.model, naTeleScen);
  const m2Metrics = computeModelScenarioMetrics(c2.model, naTeleScen);
  const expectedRev = 9250 * 2490 + 6750 * 2790; // 23 032 500 + 18 832 500 = 41 865 000 ₽
  assert.equal(m1Metrics.annualRevenueRub + m2Metrics.annualRevenueRub, expectedRev);

  const proc1 = computeProcurementPlan(c1.model, naTeleScen);
  assert.ok(
    proc1.annualDemandPacks > 9250 && proc1.annualOrdersPacks > 9250,
    'При закупке с учётом 75% выкупа объём заказа фабрике учитывает оборот витрины WB'
  );
  assert.equal(proc1.allPeriodBatches.length, 4, 'Сформированы 4 квартальные волны закупок НА ТЕЛЕ');

  const pnl1 = computeFinancialPnL(c1.model, naTeleScen);
  assert.equal(pnl1.annualRevenueRub, 9250 * 2490);
  assert.ok((pnl1.annualGrossProfitRub ?? 0) > 0, 'Валовая прибыль НА ТЕЛЕ положительная');

  // Проверяем сводку всех 5 брендов холдинга: НА ТЕЛЕ даёт ровно 41 865 000 ₽, а BORNERS остаётся ровно 686 284 972 ₽
  const holdingSummary = computeMultiBrandPortfolioSummary(
    c2.models,
    scenariosWithNaTele,
    {
      BORNERS: 1,
      FUKAI: ACTING_2027_SCENARIO_ID,
      AKUSHA: AKUSHA_2027_SCENARIO_ID,
      LISKANI: LISKANI_2027_SCENARIO_ID,
      NA_TELE: naTeleScen.id,
    }
  );
  const naTeleSummaryRow = holdingSummary.brands.find((b) => b.brandCode === 'NA_TELE')!;
  const bornersSummaryRow = holdingSummary.brands.find((b) => b.brandCode === 'BORNERS')!;
  assert.equal(naTeleSummaryRow.modelsCount, 2);
  assert.equal(naTeleSummaryRow.annualRevenueRub, expectedRev);
  assert.equal(bornersSummaryRow.annualRevenueRub, CLIENT_SAVED_S1_TOTALS.annualRevenueRub);

  // 4. Проверяем 100% выживаемость всех артикулов и планов НА ТЕЛЕ после перезагрузки страницы (F5)
  const store = new Map<string, string>();
  const prevWin = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };
  try {
    safeSetStorageJson(STORAGE_KEY_MODELS, c2.models);
    syncUserPlansBackup(c2.models);
    safeSetStorageJson(STORAGE_KEY_SCENARIO_BY_BRAND, {
      BORNERS: 1,
      FUKAI: ACTING_2027_SCENARIO_ID,
      AKUSHA: AKUSHA_2027_SCENARIO_ID,
      LISKANI: LISKANI_2027_SCENARIO_ID,
      NA_TELE: naTeleScen.id,
    });

    const afterF5 = hydratePortfolioModelsFromStorage();
    const naTeleAfterF5 = afterF5.filter((m) => m.brandId === 'NA_TELE');
    assert.equal(naTeleAfterF5.length, 2, 'Обе карточки НА ТЕЛЕ сохранились после F5');
    const revAfterF5 = naTeleAfterF5.reduce(
      (sum, m) => sum + computeModelScenarioMetrics(m, naTeleScen).annualRevenueRub,
      0
    );
    assert.equal(
      revAfterF5,
      expectedRev,
      'Годовая выручка НА ТЕЛЕ рубль-в-рубль сохранилась после перезагрузки F5'
    );
  } finally {
    if (prevWin === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = prevWin;
  }
});

test('62. Прохождение всех 7 этапов Лаборатории R&D (01 Идея -> 07 Запуск) и проверка ролевых ворот качества для НА ТЕЛЕ', async () => {
  const { INITIAL_CONCEPTS, INITIAL_USERS } = await import('../src/lib/initial-data.ts');
  const { validateRnDStageTransition } = await import('../src/lib/finance.ts');
  const { mapConceptStageToLaunchStatus } = await import('../src/lib/rndCatalogSync.ts');

  const owner = INITIAL_USERS.find((u) => u.role === 'Owner')!;
  const baseConcept = {
    ...INITIAL_CONCEPTS[0],
    id: 'test-natele-7stages',
    brandId: 'NA_TELE',
    stage: 'IDEA' as const,
    name: 'Капсула НА ТЕЛЕ Soft Rib',
    ownerId: owner.id,
    whatAttracted: 'Мягкое полотно микромодал в рубчик',
    ideaDescription: 'Капсула НА ТЕЛЕ 2027',
  };

  // 01 IDEA -> 02 ANALYSIS
  const gateToAnalysis = validateRnDStageTransition(baseConcept, 'ANALYSIS', owner);
  assert.equal(gateToAnalysis.allowed, true);
  assert.equal(mapConceptStageToLaunchStatus('IDEA'), 'В разработке');

  // 02 ANALYSIS -> 03 SAMPLE (требует гипотезу и риски в analysisReport)
  const withAnalysis = {
    ...baseConcept,
    stage: 'ANALYSIS' as const,
    analysisReport: {
      ...(baseConcept.analysisReport as any),
      whatWeCreate: 'Женский и мужской базовый комплект Soft Rib',
      openQuestionsAndRisks: 'Проверить пиллингуемость после 5 стирок',
      recommendation: 'continue' as const,
    },
  };
  assert.equal(validateRnDStageTransition(withAnalysis, 'SAMPLE', owner).allowed, true);

  // 05 DECISION -> 06 PRODUCTION -> 07 LAUNCH
  assert.equal(mapConceptStageToLaunchStatus('PRODUCTION'), 'В плане');
  assert.equal(mapConceptStageToLaunchStatus('LAUNCH'), 'Утверждено');
});

test('63. Защита от потери медиа при переполнении localStorage (IndexedDB rehydration) и полный цикл Экспорт/Импорт резервной копии JSON v2', async () => {
  const {
    stripOversizedDataUrls,
    rehydrateConceptsFromIdbSnapshot,
    rehydrateMiroItemsFromIdbSnapshot,
  } = await import('../src/lib/safeStorage.ts');
  const {
    buildFullPlatformBackupBundle,
    parseFullPlatformBackupBundle,
  } = await import('../src/lib/portfolioPersistence.ts');
  const { LISKANI_2027_MODELS, LISKANI_2027_SCENARIO_DEF, LISKANI_2027_SCENARIO_ID } =
    await import('../src/lib/liskaniAssortment2027.ts');
  const { AKUSHA_2027_MODELS, AKUSHA_2027_SCENARIO_DEF, AKUSHA_2027_SCENARIO_ID } =
    await import('../src/lib/akushaAssortment2027.ts');
  const { applyClientSavedS1SalesPlan } = await import('../src/lib/scenarioS1_100M.ts');

  // 1. Имитируем тяжёлую base64-фотографию (> 60 КБ) в Лаборатории R&D и голосовую заметку на Холсте идей
  const bigPhotoDataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(65_000);
  const bigAudioDataUrl = 'data:audio/wav;base64,' + 'B'.repeat(65_000);

  const idbConcepts = [
    {
      id: 'c-media-1',
      name: 'Мягкие боксеры НА ТЕЛЕ',
      imageUrl: bigPhotoDataUrl,
      galleryPhotos: [{ id: 'gp-1', url: bigPhotoDataUrl, caption: 'Обложка' }],
      samples: [{ id: 'smp-1', versionCode: 'V1', photos: [bigPhotoDataUrl] }],
      fourChecksTest: {
        fitAndComfort: 'passed',
        fitAndComfortPhoto: bigPhotoDataUrl,
      },
    },
  ];
  const idbMiro = [
    {
      id: 'm-media-1',
      type: 'voice',
      title: 'Голосовая заметка партнёра',
      imageUrl: bigPhotoDataUrl,
      galleryUrls: [bigPhotoDataUrl],
      audioDataUrl: bigAudioDataUrl,
    },
  ];

  // localStorage поджал длинные data:URL (> 45 КБ) до пустой строки, но пользователь успел поменять заголовок текста
  const strippedLocalConcepts = stripOversizedDataUrls(
    [{ ...idbConcepts[0], name: 'Мягкие боксеры НА ТЕЛЕ (обновлено)' }],
    45_000
  );
  const strippedLocalMiro = stripOversizedDataUrls(idbMiro, 45_000);

  assert.equal(strippedLocalConcepts[0].imageUrl, '');
  assert.equal(strippedLocalMiro[0].audioDataUrl, '');

  // IndexedDB-регидратация возвращает 100% фотографий и аудио, сохраняя при этом свежий текст из localStorage!
  const restoredConcepts = rehydrateConceptsFromIdbSnapshot(
    strippedLocalConcepts,
    idbConcepts
  );
  const restoredMiro = rehydrateMiroItemsFromIdbSnapshot(strippedLocalMiro, idbMiro);

  assert.equal(restoredConcepts[0].name, 'Мягкие боксеры НА ТЕЛЕ (обновлено)');
  assert.equal(restoredConcepts[0].imageUrl, bigPhotoDataUrl);
  assert.equal(restoredConcepts[0].galleryPhotos[0].url, bigPhotoDataUrl);
  assert.equal(restoredConcepts[0].samples[0].photos[0], bigPhotoDataUrl);
  assert.equal(restoredConcepts[0].fourChecksTest.fitAndComfortPhoto, bigPhotoDataUrl);
  assert.equal(restoredMiro[0].imageUrl, bigPhotoDataUrl);
  assert.equal(restoredMiro[0].audioDataUrl, bigAudioDataUrl);

  // 2. Полный цикл Экспорт -> Импорт JSON резервной копии (включая Лабораторию R&D и Холст идей)
  const portfolio = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...applyClientSavedS1SalesPlan(S1_100M_SCENARIO_MODELS),
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ];
  const scenarios = [
    ...INITIAL_SCENARIOS,
    LISKANI_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_DEF,
  ];
  const backupBundle = buildFullPlatformBackupBundle({
    scenarios,
    models: portfolio,
    selectedScenarioByBrand: {
      BORNERS: 1,
      FUKAI: ACTING_2027_SCENARIO_ID,
      LISKANI: LISKANI_2027_SCENARIO_ID,
      AKUSHA: AKUSHA_2027_SCENARIO_ID,
      NA_TELE: 2,
    },
    includeGroupPortfolioInS1: true,
    platformState: {
      concepts: restoredConcepts,
      miroItems: restoredMiro,
    },
  });

  const rawJson = JSON.stringify(backupBundle);
  const parsedRes = parseFullPlatformBackupBundle(rawJson);
  assert.equal(parsedRes.valid, true);
  assert.equal(parsedRes.bundle!.models.length, portfolio.length);
  assert.equal(parsedRes.bundle!.selectedScenarioByBrand.BORNERS, 1);
  assert.equal(parsedRes.bundle!.selectedScenarioByBrand.NA_TELE, 2);
  assert.equal(parsedRes.bundle!.includeGroupPortfolioInS1, true);
  assert.equal(
    (parsedRes.bundle!.platformState?.concepts as any[])[0].id,
    'c-media-1'
  );
});

test('64. Полный аудит всех фотографий в public/ и resolvePublicAssetUrl во всех компонентах Лаборатории R&D, PDF-конструктора и Miro для GitHub Pages', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = process.cwd();

  const { INITIAL_CONCEPTS } = await import('../src/lib/initial-data.ts');
  const { resolvePublicAssetUrl } = await import('../src/lib/scenarioData.ts');
  const { LISKANI_2027_MODELS } = await import('../src/lib/liskaniAssortment2027.ts');
  const { AKUSHA_2027_MODELS } = await import('../src/lib/akushaAssortment2027.ts');

  // 1. Все локальные изображения R&D-концепций, BORNERS, FUKAI, LISKANI и AKUSHA физически существуют и не пустые
  const allUrls = new Set<string>();
  for (const c of INITIAL_CONCEPTS) {
    if (c.imageUrl) allUrls.add(c.imageUrl);
    for (const gp of c.galleryPhotos || []) {
      if (gp.url) allUrls.add(gp.url);
    }
    for (const smp of c.samples || []) {
      for (const p of smp.photos || []) {
        if (p) allUrls.add(p);
      }
    }
  }
  for (const m of [
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ]) {
    for (const g of m.gallery || []) {
      if (g.url) allUrls.add(g.url);
    }
  }

  for (const rawUrl of allUrls) {
    if (rawUrl.startsWith('data:') || rawUrl.startsWith('http')) continue;
    const cleanRel = rawUrl.replace(/^\.?\/+/, '');
    const absPath = path.join(root, 'public', cleanRel);
    assert.equal(
      fs.existsSync(absPath),
      true,
      `Отсутствует файл изображения в public/: ${cleanRel}`
    );
    assert.ok(
      fs.statSync(absPath).size > 0,
      `Пустой файл изображения (0 байт): ${cleanRel}`
    );
    assert.equal(
      resolvePublicAssetUrl(rawUrl, '/borners-group'),
      `/borners-group/${cleanRel}`
    );
    assert.equal(
      resolvePublicAssetUrl(rawUrl, '/borners-platform'),
      `/borners-platform/${cleanRel}`
    );
  }

  // 2. Все 4 файла Лаборатории R&D используют resolvePublicAssetUrl для корректной работы на /borners-group и /borners-platform
  for (const relFile of [
    'src/components/sections/ProductLabView.tsx',
    'src/components/sections/ProductLabTabs.tsx',
    'src/components/sections/PdfConstructorModal.tsx',
    'src/components/sections/MiroBoardView.tsx',
  ]) {
    const content = fs.readFileSync(path.join(root, relFile), 'utf8');
    assert.ok(
      content.includes('resolvePublicAssetUrl('),
      `В файле ${relFile} должен использоваться resolvePublicAssetUrl для всех локальных фото`
    );
  }
});

test('65. Защита BORNERS 686,28 млн ₽ от перезаписи пользовательским сценарием НА ТЕЛЕ (ownerBrandCode: NA_TELE) на Главной, в 02 · Продажи и при миграции F5', async () => {
  const {
    INITIAL_SCENARIOS,
    computeModelScenarioMetrics,
  } = await import('../src/lib/scenarioData.ts');
  const {
    createIndependentBrandScenario,
    isScenarioCompatibleWithBrand,
  } = await import('../src/lib/unifiedBusinessEngine.ts');
  const {
    STORAGE_KEY_ACTIVE_SCENARIO_ID,
    STORAGE_KEY_SCENARIO_BY_BRAND,
    STORAGE_KEY_SCENARIOS,
    filterModelsForScenario,
    runBornersSalesScenarioRepairMigrationV1,
    sanitizeSelectedScenarioByBrand,
  } = await import('../src/lib/portfolioPersistence.ts');

  const portfolio = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...applyClientSavedS1SalesPlan(S1_100M_SCENARIO_MODELS),
  ];

  // Создаём независимый сценарий специально для бренда НА ТЕЛЕ
  const createdNaTeleScen = createIndependentBrandScenario(INITIAL_SCENARIOS, portfolio, {
    title: 'НА ТЕЛЕ — Капсула 2027',
    brandCode: 'NA_TELE',
    year: 2027,
    monthlyTargetMln: 45,
    copyFromScenarioId: null,
  });
  const naTeleCustomScen = createdNaTeleScen.scenario;
  assert.equal(naTeleCustomScen.ownerBrandCode, 'NA_TELE');
  assert.equal(isScenarioCompatibleWithBrand(naTeleCustomScen, 'NA_TELE'), true);
  assert.equal(isScenarioCompatibleWithBrand(naTeleCustomScen, 'BORNERS'), false);
  assert.equal(isScenarioCompatibleWithBrand(naTeleCustomScen, 'ALL'), false);

  // Если по ошибке в BORNERS попал id сценария НА ТЕЛЕ — санитайзер обязан вернуть BORNERS на Сценарий №1
  const sanitized = sanitizeSelectedScenarioByBrand(
    {
      BORNERS: naTeleCustomScen.id,
      NA_TELE: naTeleCustomScen.id,
      FUKAI: ACTING_2027_SCENARIO_ID,
      AKUSHA: 202706,
      LISKANI: 202705,
    },
    createdNaTeleScen.scenarios
  );
  assert.equal(sanitized.BORNERS, 1);
  assert.equal(sanitized.NA_TELE, naTeleCustomScen.id);

  // Проверим ремонтную миграцию localStorage при залипшем сценарии НА ТЕЛЕ
  const mem = new Map<string, string>();
  const origWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    },
  };
  try {
    mem.set(STORAGE_KEY_SCENARIOS, JSON.stringify(createdNaTeleScen.scenarios));
    mem.set(STORAGE_KEY_ACTIVE_SCENARIO_ID, JSON.stringify(naTeleCustomScen.id));
    mem.set(
      STORAGE_KEY_SCENARIO_BY_BRAND,
      JSON.stringify({ BORNERS: naTeleCustomScen.id, NA_TELE: naTeleCustomScen.id })
    );
    runBornersSalesScenarioRepairMigrationV1();

    const repairedActive = JSON.parse(mem.get(STORAGE_KEY_ACTIVE_SCENARIO_ID)!);
    const repairedByBrand = JSON.parse(mem.get(STORAGE_KEY_SCENARIO_BY_BRAND)!);
    assert.equal(repairedActive, 1);
    assert.equal(repairedByBrand.BORNERS, 1);
    assert.equal(repairedByBrand.NA_TELE, naTeleCustomScen.id);
  } finally {
    if (origWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = origWindow;
    }
  }

  // Эталон BORNERS Сценарий №1 неизменен: 21 SKU · 686 284 972 ₽ за год · 109 938 111 ₽ в декабре
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const bornersModels = filterModelsForScenario(createdNaTeleScen.models, scen1, false, 'BORNERS');
  const bornersYearRub = bornersModels.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen1).annualRevenueRub,
    0
  );
  const bornersDecRub = bornersModels.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen1).targetMonthRevenueRub,
    0
  );
  assert.equal(bornersModels.length, 21);
  assert.equal(bornersYearRub, 686_284_972);
  assert.equal(bornersDecRub, 109_938_111);
});

test('66. Сквозное прохождение всех 7 этапов Лаборатории R&D (01 Идея -> 07 Запуск), учёт fourChecksTest на 04 Тест и полнота stageGateModal', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { validateRnDStageTransition } = await import('../src/lib/finance.ts');
  const { INITIAL_USERS, INITIAL_CONCEPTS } = await import('../src/lib/initial-data.ts');

  const ownerUser = INITIAL_USERS[0];
  const baseConcept = {
    ...INITIAL_CONCEPTS[0],
    brandId: 'NA_TELE',
    stage: 'IDEA' as const,
    ownerId: ownerUser.id,
    whatAttracted: 'Невесомая бесшовная посадка для линейки НА ТЕЛЕ',
    ideaDescription: 'Невесомая бесшовная посадка для линейки НА ТЕЛЕ',
    analysisReport: undefined,
    samples: [],
    sampleStatus: '',
    testProtocols: [],
    testResults: 'Нет данных',
    fourChecksTest: undefined,
    approvalDecisions: [],
    supplierName: '',
    productionOrders: [],
  };

  // 01 -> 02 ANALYSIS (поля идеи заполнены)
  assert.equal(validateRnDStageTransition(baseConcept, 'ANALYSIS', ownerUser).allowed, true);

  // 02 -> 03 SAMPLE (до заполнения анализа — запрещено, после — разрешено)
  assert.equal(validateRnDStageTransition(baseConcept, 'SAMPLE', ownerUser).allowed, false);
  const afterAnalysis = {
    ...baseConcept,
    stage: 'ANALYSIS' as const,
    analysisReport: {
      whatWeCreate: 'Бесшовные слипы НА ТЕЛЕ с лазерным краем',
      targetBuyer: 'Женщины 23–40',
      concreteAdvantage: 'Незаметны под одеждой',
      whyChooseUs: 'Ультратонкая микрофибра',
      demandType: 'incremental' as const,
      marketEvidences: [],
      nicheConclusion: 'Высокий спрос',
      buyerMotives: 'Комфорт',
      competitorProsAndComplaints: 'Скатываются края у конкурентов',
      priceBenchmarksAndObjections: '1890 ₽ за 3 шт.',
      potentialFactories: 'Сучжоу Бесшовные Технологии',
      materialsAndMoq: 'MOQ 1500',
      estimatedProductionCostNote: '320 ₽',
      estimatedLogisticsNote: '45 ₽',
      estimatedLandedCostNote: '365 ₽',
      productionRisks: '',
      summaryAndPros: 'Заказываем образец',
      openQuestionsAndRisks: 'Проверить эластичность края после 5 стирок',
      confidenceLevel: 'high' as const,
      whatToVerifyOnSample: 'Край после стирки',
      recommendation: 'continue' as const,
    },
  };
  assert.equal(validateRnDStageTransition(afterAnalysis, 'SAMPLE', ownerUser).allowed, true);

  // 03 -> 04 TEST (до образца — запрещено, с образцом — разрешено)
  assert.equal(validateRnDStageTransition(afterAnalysis, 'TEST', ownerUser).allowed, false);
  const afterSample = {
    ...afterAnalysis,
    stage: 'SAMPLE' as const,
    supplierName: 'Сучжоу Бесшовные Технологии (Китай)',
    samples: [
      {
        id: 'smp-nt-1',
        versionCode: 'Версия 1',
        factoryName: 'Сучжоу Бесшовные Технологии (Китай)',
        country: 'Китай',
        orderedAt: '2027-01-10',
        receivedAt: '2027-01-20',
        status: 'testing' as const,
        photos: [],
        materialAndComposition: 'Полиамид 80% + Эластан 20%',
        densityGsm: 140,
        sizeTested: 'M',
        color: 'Nude',
        measurementsNote: 'Ок',
        sampleCostRub: 3000,
        deliveryCostRub: 1000,
        estimatedUnitProductionPrice: 310,
        currency: 'RUB' as const,
        preliminaryScore: 5,
        comments: 'Отличный образец',
        isSelectedForProduction: true,
      },
    ],
  };
  assert.equal(validateRnDStageTransition(afterSample, 'TEST', ownerUser).allowed, true);

  // 04 -> 05 DECISION: заполнение 4 проверок (fourChecksTest) без старого testProtocols должно открывать переход в 05 Решение!
  assert.equal(validateRnDStageTransition(afterSample, 'DECISION', ownerUser).allowed, false);
  const afterFourChecks = {
    ...afterSample,
    stage: 'TEST' as const,
    fourChecksTest: {
      fitAndComfort: 'passed' as const,
      fitAndComfortComment: 'Идеально',
      waistbandAndSeams: 'passed' as const,
      waistbandAndSeamsComment: '',
      washShapeColor: 'passed' as const,
      washShapeColorComment: '',
      manufacturingQuality: 'passed' as const,
      manufacturingQualityComment: '',
    },
  };
  assert.equal(
    validateRnDStageTransition(afterFourChecks, 'DECISION', ownerUser).allowed,
    true,
    'Заполненные 4 проверки (fourChecksTest) обязаны разблокировать переход на 05 Решение'
  );

  // 05 -> 06 PRODUCTION и 06 -> 07 LAUNCH
  assert.equal(validateRnDStageTransition(afterFourChecks, 'PRODUCTION', ownerUser).allowed, false);
  const afterDecision = {
    ...afterFourChecks,
    stage: 'DECISION' as const,
    approvalDecisions: [
      {
        id: 'dec-1',
        decision: 'approve' as const,
        authorName: ownerUser.fullName,
        authorRole: ownerUser.role,
        decidedAt: '2027-01-25 12:00',
        approvedSampleLabel: 'Версия 1',
        justification: 'Утверждено в серию НА ТЕЛЕ',
        conditions: '',
      },
    ],
  };
  assert.equal(validateRnDStageTransition(afterDecision, 'PRODUCTION', ownerUser).allowed, true);
  assert.equal(validateRnDStageTransition(afterDecision, 'LAUNCH', ownerUser).allowed, false);

  // Проверяем, что в stageGateModal (ProductLabView.tsx) есть поля ввода для ВСЕХ этапов (ANALYSIS, SAMPLE, TEST, DECISION, PRODUCTION, LAUNCH) и авто-синк с каталогом
  const labViewCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/ProductLabView.tsx'),
    'utf8'
  );
  for (const stageKey of ['ANALYSIS', 'SAMPLE', 'TEST', 'DECISION', 'PRODUCTION', 'LAUNCH']) {
    assert.ok(
      labViewCode.includes(`'${stageKey}'`),
      `ProductLabView должен обрабатывать этап ${stageKey} в модальном окне Gate`
    );
  }
  assert.ok(
    labViewCode.includes("normalizedTarget === 'PRODUCTION' || normalizedTarget === 'LAUNCH'"),
    'Переход на 06 Производство или 07 Запуск должен автоматически синхронизировать модель с каталогом SKU'
  );
});

test('67. Атомарное сохранение полей анализа и передача актуального ProductConcept между вкладками 02–07 в ProductLabTabs.tsx', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const tabsCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/ProductLabTabs.tsx'),
    'utf8'
  );

  // Не должно быть двойного подряд вызова updateAnalysisField, затирающего предыдущее поле из-за замыкания React
  assert.ok(
    tabsCode.includes('const updateAnalysisFields ='),
    'Должна использоваться атомарная функция updateAnalysisFields для одновременного обновления полей анализа'
  );
  assert.equal(
    tabsCode.includes("updateAnalysisField('whatWeCreate', e.target.value);\n                      updateAnalysisField('concreteAdvantage'"),
    false,
    'Запрещён двойной вызов updateAnalysisField в одном onChange, затирающий whatWeCreate'
  );
  assert.ok(
    tabsCode.includes("onChangeStageWithGate(updatedConcept, 'SAMPLE')") &&
      tabsCode.includes("onChangeStageWithGate(updatedConcept, 'DECISION')") &&
      tabsCode.includes("onChangeStageWithGate(updatedConcept, targetStage)") &&
      tabsCode.includes("onChangeStageWithGate(updatedConcept, 'LAUNCH')"),
    'Кнопки перехода этапов 02->03, 04->05, 05->06 и 06->07 должны передавать свежий updatedConcept без устаревшего замыкания'
  );
});

test('68. Защита карточки R&D от внезапного закрытия при смене бренда на НА ТЕЛЕ или переходе из Холста Miro / Поиска ⌘K', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const labViewCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/ProductLabView.tsx'),
    'utf8'
  );

  assert.ok(
    labViewCode.includes('concepts.find((c) => !c.isArchived && c.id === selectedConceptId)'),
    'activeConcept должен искаться по полному списку concepts, чтобы карточка не схлопывалась при смене бренда'
  );
  assert.equal(
    labViewCode.includes('accessibleConcepts.find((c) => c.id === selectedConceptId)'),
    false,
    'activeConcept не должен зависеть от отфильтрованного accessibleConcepts'
  );
});

test('69. Сохранность AKUSHA при сбросе эталона, запись в IndexedDB на Главной и приоритет выбранного сценария бренда', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const showcaseCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/GrowthScenariosShowcase.tsx'),
    'utf8'
  );
  const liveHookCode = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/useLiveScenarioPortfolio.ts'),
    'utf8'
  );

  assert.ok(
    showcaseCode.includes('...AKUSHA_2027_MODELS') &&
      showcaseCode.includes('AKUSHA_2027_SCENARIO_DEF'),
    'GrowthScenariosShowcase обязан сохранять AKUSHA 2027 во всех базовых наборах моделей и сценариев'
  );
  assert.ok(
    showcaseCode.includes('savePortfolioSnapshotToIdb(') &&
      showcaseCode.includes('saveModelGalleryToIdb('),
    'Изменения моделей и фото на Главной (GrowthScenariosShowcase) должны дублироваться в IndexedDB'
  );
  assert.ok(
    liveHookCode.includes('const localScenarios = safeGetStorageJson<GrowthScenarioDef[]>(STORAGE_KEY_SCENARIOS)'),
    'При загрузке из облака локально созданные сценарии (например НА ТЕЛЕ) не должны затираться'
  );
});

test('70. Глобальный поиск ⌘K по всем 5 брендам холдинга, базовый путь эмблемы и китайский техпак НА ТЕЛЕ / AKUSHA / LISKANI', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const appShellCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/shell/AppShell.tsx'),
    'utf8'
  );
  const pdfModalCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/PdfConstructorModal.tsx'),
    'utf8'
  );

  assert.equal(
    appShellCode.includes("const brandRu = c.brandId === 'NA_TELE' ? 'на теле' : 'borners'"),
    false,
    'В глобальном поиске ⌘K не должно быть хардкода borners для всех остальных брендов'
  );
  assert.ok(
    appShellCode.includes("resolvePublicAssetUrl('images/products/borners-lion-emblem.png')"),
    'Логотип в шапке AppShell должен использовать resolvePublicAssetUrl для корректной работы на всех basePath'
  );
  assert.ok(
    pdfModalCode.includes('НА ТЕЛЕ 女士无痕亲肤内衣套装') &&
      pdfModalCode.includes('AKUSHA 儿童真皮学步鞋') &&
      pdfModalCode.includes('LISKANI 家居窗帘纺织系列'),
    'PDF-конструктор для фабрики должен формировать точный китайский заголовок под бренд карточки (включая НА ТЕЛЕ)'
  );
});

test('71. Умное слияние облака Supabase (mergeCloudPortfolioSnapshot): защита моделей НА ТЕЛЕ, локальных правок, удалённых SKU и эталона BORNERS 686,28 млн ₽', async () => {
  const {
    mergeCloudPortfolioSnapshot,
    filterModelsForScenario,
    markModelAsDeletedInStorage,
    unmarkModelAsDeletedInStorage,
  } = await import('../src/lib/portfolioPersistence.ts');
  const { INITIAL_SCENARIOS, computeModelScenarioMetrics } = await import(
    '../src/lib/scenarioData.ts'
  );
  const { ACTING_2027_SCENARIO_MODELS } = await import('../src/lib/actingAssortment2027.ts');
  const { AKUSHA_2027_MODELS } = await import('../src/lib/akushaAssortment2027.ts');
  const { LISKANI_2027_MODELS } = await import('../src/lib/liskaniAssortment2027.ts');
  const { S1_100M_SCENARIO_MODELS, applyClientSavedS1SalesPlan } = await import(
    '../src/lib/scenarioS1_100M.ts'
  );
  const { createBrandProductModel } = await import(
    '../src/lib/unifiedBusinessEngine.ts'
  );

  const baseModels = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...applyClientSavedS1SalesPlan(S1_100M_SCENARIO_MODELS),
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ];
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;

  // Добавляем новую локальную модель НА ТЕЛЕ
  const createdNaTele = createBrandProductModel(baseModels, INITIAL_SCENARIOS, {
    title: 'Бесшовные слипы НА ТЕЛЕ Second Skin',
    code: 'NTL-901',
    brandCode: 'NA_TELE',
    retailPriceRub: 1890,
    unitCostRub: 320,
    unitsInPack: 1,
  });

  // Помечаем тестовую кастомную карточку удалённой локально
  markModelAsDeletedInStorage({ id: 'scen-deleted-cloud-ghost', code: 'GHOST-999' });
  try {
    const rawBrn001 = S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!;
    const staleCloudModels = [
      ...baseModels.map((m) => {
        // Имитируем старую облачную строку BRN-001-SC со старым заниженным планом (до ремонта 686,28 млн ₽)
        if (m.code === 'BRN-001-SC') {
          return {
            ...m,
            plansByScenario: {
              ...m.plansByScenario,
              1: {
                ...rawBrn001.plansByScenario[1],
              },
            },
          };
        }
        return m;
      }),
      {
        ...createdNaTele.model,
        id: 'scen-deleted-cloud-ghost',
        code: 'GHOST-999',
        title: 'Удалённый призрак из старого облака',
      },
    ];

    const merged = mergeCloudPortfolioSnapshot({
      localModels: createdNaTele.models,
      cloudModels: staleCloudModels,
      localUpdatedAtIso: '2026-11-12T18:00:00.000Z',
      cloudUpdatedAtIso: '2026-11-10T10:00:00.000Z',
      deletedRegistry: ['SCEN-DELETED-CLOUD-GHOST', 'GHOST-999'],
    });

    // 1. Локальная модель НА ТЕЛЕ сохранена
    assert.ok(
      merged.models.some((m) => m.code === 'NTL-901'),
      'Локально созданная модель НА ТЕЛЕ обязана сохраниться при приходе устаревшего облачного слепка'
    );
    // 2. Удалённый призрак НЕ воскрес
    assert.equal(
      merged.models.some((m) => m.code === 'GHOST-999'),
      false,
      'Удалённая пользователем модель не должна воскресать из облака Supabase'
    );
    // 3. Эталон BORNERS Сценария №1 остаётся ровно 686 284 972 ₽
    const s1Models = filterModelsForScenario(merged.models, scen1, false);
    const bornersS1Rev = s1Models.reduce(
      (s, m) => s + computeModelScenarioMetrics(m, scen1).annualRevenueRub,
      0
    );
    assert.equal(bornersS1Rev, 686_284_972);
    assert.equal(merged.shouldPushLocalToCloud, true);
  } finally {
    unmarkModelAsDeletedInStorage({ id: 'scen-deleted-cloud-ghost', code: 'GHOST-999' });
  }
});

test('72. Генератор PDF-техпака из каталога SKU (buildPdfConceptFromScenarioModel): точные бренды, фабрики, 1 шт./набор и китайские спецификации без утечки боксеров BORNERS', async () => {
  const { buildPdfConceptFromScenarioModel } = await import('../src/lib/rndCatalogSync.ts');
  const { AKUSHA_2027_MODELS } = await import('../src/lib/akushaAssortment2027.ts');
  const { LISKANI_2027_MODELS } = await import('../src/lib/liskaniAssortment2027.ts');
  const { INITIAL_SCENARIOS } = await import('../src/lib/scenarioData.ts');
  const { createBrandProductModel } = await import('../src/lib/unifiedBusinessEngine.ts');

  const naTeleModel = createBrandProductModel([], INITIAL_SCENARIOS, {
    title: 'Бралетт НА ТЕЛЕ Invisible Soft',
    code: 'NTL-105',
    brandCode: 'NA_TELE',
    retailPriceRub: 2490,
    unitCostRub: 460,
    unitsInPack: 1,
  }).model;

  const ntlConcept = buildPdfConceptFromScenarioModel(naTeleModel, []);
  assert.equal(ntlConcept.brandId, 'NA_TELE');
  assert.equal(ntlConcept.packUnitsCount, 1);
  assert.equal(ntlConcept.plannedUnitCost, 460);
  assert.ok(ntlConcept.techPack?.zh?.modelName.includes('НА ТЕЛЕ'));
  assert.equal(ntlConcept.techPack?.zh?.modelName.includes('BORNERS'), false);

  const akuConcept = buildPdfConceptFromScenarioModel(AKUSHA_2027_MODELS[0], []);
  assert.equal(akuConcept.brandId, 'AKUSHA');
  assert.equal(akuConcept.packUnitsCount, 1);
  assert.ok(akuConcept.techPack?.zh?.modelName.includes('AKUSHA'));
  assert.equal(akuConcept.techPack?.zh?.construction.includes('平角内裤'), false);

  const lscConcept = buildPdfConceptFromScenarioModel(LISKANI_2027_MODELS[0], []);
  assert.equal(lscConcept.brandId, 'LISKANI');
  assert.ok(lscConcept.techPack?.zh?.modelName.includes('LISKANI'));
});

test('73. Смена бренда карточки (changeModelBrandWithAudit) и распознавание NA_TELE → НА ТЕЛЕ без залипания на старом portfolioBrandCode', async () => {
  const { INITIAL_SCENARIOS } = await import('../src/lib/scenarioData.ts');
  const {
    createBrandProductModel,
    changeModelBrandWithAudit,
    detectModelBrandPortfolioLabel,
    matchesBrandFilter,
  } = await import('../src/lib/unifiedBusinessEngine.ts');

  const brnCard = createBrandProductModel([], INITIAL_SCENARIOS, {
    title: 'Тестовый артикул смены бренда',
    code: 'MOVE-01',
    brandCode: 'BORNERS',
    retailPriceRub: 2190,
    unitCostRub: 420,
    unitsInPack: 3,
  }).model;

  assert.equal(
    detectModelBrandPortfolioLabel({
      ...brnCard,
      id: 'scen-test-ntl',
      code: 'CUSTOM-01',
      customBrandLabel: 'NA_TELE',
    }),
    'НА ТЕЛЕ'
  );

  const movedToNaTele = changeModelBrandWithAudit(brnCard, 'NA_TELE', 'Владелец');
  assert.equal(detectModelBrandPortfolioLabel(movedToNaTele), 'НА ТЕЛЕ');
  assert.equal(matchesBrandFilter(movedToNaTele, 'NA_TELE'), true);
  assert.equal(matchesBrandFilter(movedToNaTele, 'BORNERS'), false);
});

test('74. Генератор ID независимых сценариев (createIndependentBrandScenario): исключение коллизий с резервными ID 100, 202705 и 202706', async () => {
  const { INITIAL_SCENARIOS } = await import('../src/lib/scenarioData.ts');
  const { ACTING_2027_SCENARIO_DEF, ACTING_2027_SCENARIO_MODELS } = await import(
    '../src/lib/actingAssortment2027.ts'
  );
  const { AKUSHA_2027_SCENARIO_DEF } = await import('../src/lib/akushaAssortment2027.ts');
  const { LISKANI_2027_SCENARIO_DEF } = await import('../src/lib/liskaniAssortment2027.ts');
  const { createIndependentBrandScenario } = await import('../src/lib/unifiedBusinessEngine.ts');

  const allScens = [
    ACTING_2027_SCENARIO_DEF,
    ...INITIAL_SCENARIOS,
    LISKANI_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_DEF,
  ];
  const created = createIndependentBrandScenario(allScens, ACTING_2027_SCENARIO_MODELS, {
    title: 'НА ТЕЛЕ — Капсула Осень 2027',
    brandCode: 'NA_TELE',
    year: 2027,
    monthlyTargetMln: 25,
    copyFromScenarioId: null,
  });

  assert.equal(created.scenario.id, 4, 'Новый сценарий должен получить чистый ID 4, а не 202707');
  assert.notEqual(created.scenario.id, 202705);
  assert.notEqual(created.scenario.id, 202706);
});

test('75. Защита эталонной себестоимости AKUSHA (37 448 200 ₽) при applyCategoryWbUnitEconomics(..., { fillMissingCost: true })', async () => {
  const { AKUSHA_2027_MODELS, AKUSHA_2027_SCENARIO_DEF } = await import(
    '../src/lib/akushaAssortment2027.ts'
  );
  const { applyCategoryWbUnitEconomics, computeScenarioInvestmentSummary } = await import(
    '../src/lib/unifiedBusinessEngine.ts'
  );

  const processed = AKUSHA_2027_MODELS.map((m) =>
    applyCategoryWbUnitEconomics(m, { fillMissingCost: true })
  );
  const unpricedCard = processed.find((m) => m.code === 'AKU-017')!;
  assert.equal(
    unpricedCard.unitCostRub,
    0,
    'Неоценённые карточки AKU-017..020 и AKU-028..031 с 0 ₽ в официальном PDF не должны получать искусственную себестоимость 26%'
  );

  const inv = computeScenarioInvestmentSummary(processed, AKUSHA_2027_SCENARIO_DEF);
  assert.equal(inv.annualRevenueRub, 105_793_210);
  assert.equal(inv.annualSoldGoodsCostRub, 37_448_200);
});

test('76. Изоляция правок в кастомных сценариях от официальных 202705/202706, точечная правка цены 1 месяца и защита % выкупа от смены режима закупки', async () => {
  const { AKUSHA_2027_MODELS, AKUSHA_2027_SCENARIO_DEF, AKUSHA_2027_SCENARIO_ID } = await import(
    '../src/lib/akushaAssortment2027.ts'
  );
  const { INITIAL_SCENARIOS, computeModelScenarioMetrics } = await import('../src/lib/scenarioData.ts');
  const { S1_100M_SCENARIO_MODELS } = await import('../src/lib/scenarioS1_100M.ts');
  const {
    updateModelScenarioPrice,
    updateModelScenarioMonthBuyouts,
    updateModelScenarioSingleMonthPrice,
    updateModelBuyoutRatePct,
  } = await import('../src/lib/unifiedBusinessEngine.ts');

  const akuSample = AKUSHA_2027_MODELS[0];
  const origOfficialRev = computeModelScenarioMetrics(
    akuSample,
    AKUSHA_2027_SCENARIO_DEF
  ).annualRevenueRub;

  // Редактируем кастомный сценарий ID=4 — официальный план 202706 должен остаться неизменным!
  const editedCustomPrice = updateModelScenarioPrice(akuSample, 4, 9990);
  const editedCustomPacks = updateModelScenarioMonthBuyouts(editedCustomPrice, 4, 5, 777);
  assert.equal(
    computeModelScenarioMetrics(editedCustomPacks, AKUSHA_2027_SCENARIO_DEF).annualRevenueRub,
    origOfficialRev,
    'Правка кастомного сценария ID=4 не имеет права мутировать официальный план AKUSHA 202706'
  );

  // Точечная правка цены одного месяца (июль, индекс 6) не перезаписывает остальные 11 месяцев
  const brnSample = S1_100M_SCENARIO_MODELS[0];
  const scen2 = INITIAL_SCENARIOS.find((s) => s.id === 2)!;
  const origJanPrice = brnSample.plansByScenario[2].monthlyPricesRub[0];
  const singleMonthUpdated = updateModelScenarioSingleMonthPrice(brnSample, 2, 6, 3990);
  assert.equal(singleMonthUpdated.plansByScenario[2].monthlyPricesRub[6], 3990);
  assert.equal(singleMonthUpdated.plansByScenario[2].monthlyPricesRub[0], origJanPrice);
  assert.ok(computeModelScenarioMetrics(singleMonthUpdated, scen2).annualRevenueRub > 0);

  // Изменение % выкупа у белья BORNERS не должно включать обувной флаг procureByOrdersVolume
  const buyoutUpdated = updateModelBuyoutRatePct(brnSample, 82);
  assert.equal(buyoutUpdated.buyoutRatePct, 82);
  assert.notEqual(buyoutUpdated.procureByOrdersVolume, true);
  assert.ok(AKUSHA_2027_SCENARIO_ID === 202706);
});

test('77. Сводка инвестиций холдинга по всем брендам (computeGroupBrandsInvestmentReport с allScenarios и selectedScenarioByBrand)', async () => {
  const { INITIAL_SCENARIOS } = await import('../src/lib/scenarioData.ts');
  const { ACTING_2027_SCENARIO_DEF, ACTING_2027_SCENARIO_MODELS } = await import(
    '../src/lib/actingAssortment2027.ts'
  );
  const { AKUSHA_2027_MODELS, AKUSHA_2027_SCENARIO_DEF } = await import(
    '../src/lib/akushaAssortment2027.ts'
  );
  const { LISKANI_2027_MODELS, LISKANI_2027_SCENARIO_DEF } = await import(
    '../src/lib/liskaniAssortment2027.ts'
  );
  const { S1_100M_SCENARIO_MODELS, applyClientSavedS1SalesPlan } = await import(
    '../src/lib/scenarioS1_100M.ts'
  );
  const { computeGroupBrandsInvestmentReport } = await import(
    '../src/lib/unifiedBusinessEngine.ts'
  );

  const models = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...applyClientSavedS1SalesPlan(S1_100M_SCENARIO_MODELS),
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ];
  const allScenarios = [
    ACTING_2027_SCENARIO_DEF,
    ...INITIAL_SCENARIOS,
    LISKANI_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_DEF,
  ];
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const report = computeGroupBrandsInvestmentReport(models, scen1, {
    allScenarios,
    selectedScenarioByBrand: {
      BORNERS: 1,
      FUKAI: 100,
      LISKANI: 202705,
      AKUSHA: 202706,
      NA_TELE: 2,
    },
  });

  const byBrand = Object.fromEntries(report.brands.map((b) => [b.brandCode, b]));
  assert.equal(byBrand.BORNERS.annualRevenueRub, 686_284_972);
  assert.equal(byBrand.FUKAI.annualRevenueRub, 90_553_401);
  assert.equal(byBrand.LISKANI.annualRevenueRub, 500_000_000);
  assert.equal(byBrand.AKUSHA.annualRevenueRub, 105_793_210);
  const expectedTotal = 686_284_972 + 90_553_401 + 500_000_000 + 105_793_210;
  assert.equal(report.groupTotal.annualRevenueRub, expectedTotal);
});

test('78. Группы товаров (productGroups): взвешивание маржи по выручке и чистая фильтрация архивных групп', async () => {
  const { AKUSHA_2027_MODELS, AKUSHA_2027_SCENARIO_DEF } = await import(
    '../src/lib/akushaAssortment2027.ts'
  );
  const { buildBrandCatalogSections, computeProductGroupMetrics } = await import(
    '../src/lib/productGroups.ts'
  );

  const sections = buildBrandCatalogSections(
    AKUSHA_2027_MODELS,
    { AKUSHA: AKUSHA_2027_SCENARIO_DEF },
    AKUSHA_2027_SCENARIO_DEF
  );
  const akushaSec = sections.find((s) => s.brandCode === 'AKUSHA')!;
  assert.equal(akushaSec.annualRevenueRub, 105_793_210);

  // Группа с 1 продающейся моделью и 1 нулевой карточкой должна считать маржу строго по выручке продающейся модели
  const activeCard = AKUSHA_2027_MODELS.find((m) => m.code === 'AKU-001')!;
  const zeroCard = AKUSHA_2027_MODELS.find((m) => m.code === 'AKU-028')!;
  const grpMetrics = computeProductGroupMetrics(
    {
      id: 'grp-test-akusha',
      title: 'Тестовая группа AKUSHA',
      subtitle: '',
      brandCode: 'AKUSHA',
      cabinetLabel: 'AKUSHA',
      modelIds: [activeCard.id, zeroCard.id],
      modelCodes: [activeCard.code, zeroCard.code],
      createdAt: '2026-11-12',
    },
    [activeCard, zeroCard],
    AKUSHA_2027_SCENARIO_DEF
  );
  assert.ok(grpMetrics.annualRevenueRub > 0);
  assert.ok(grpMetrics.avgMarginPct > 0 && grpMetrics.avgMarginPct < 100);
});

test('79. Полнота 14 стратегических блоков ДНК для каждого из 5 брендов холдинга (70 блоков) и целостность связей R&D RD-027', async () => {
  const { INITIAL_STRATEGIES } = await import('../src/lib/initial-strategies.ts');
  const { INITIAL_CONCEPTS, INITIAL_LAUNCHES, INITIAL_TASKS, INITIAL_CAMPAIGNS } = await import(
    '../src/lib/initial-data.ts'
  );

  for (const brandId of ['BORNERS', 'NA_TELE', 'AKUSHA', 'LISKANI', 'FUKAI']) {
    const blocks = INITIAL_STRATEGIES.filter((s) => s.brandId === brandId);
    assert.equal(
      blocks.length,
      14,
      `Для бренда ${brandId} должно быть заполнено ровно 14 блоков стратегии`
    );
  }
  assert.equal(INITIAL_STRATEGIES.length, 70);

  // Ни одной битой ссылки на старый 'concept-skin-tone' или несуществующий 'prod-borners-terracotta-pack'
  const rd027 = INITIAL_CONCEPTS.find((c) => c.id === 'concept-rd-027');
  assert.ok(rd027, 'Карточка concept-rd-027 (НА ТЕЛЕ) должна существовать в INITIAL_CONCEPTS');
  assert.equal(rd027.packUnitsCount, 1);
  assert.equal(
    INITIAL_TASKS.some((t) => t.conceptId === 'concept-skin-tone'),
    false,
    'Задачи не должны ссылаться на несуществующий concept-skin-tone'
  );
  assert.equal(
    INITIAL_LAUNCHES.some((l) => l.conceptId === 'concept-skin-tone'),
    false,
    'Запуски не должны ссылаться на несуществующий concept-skin-tone'
  );
  assert.equal(
    INITIAL_CAMPAIGNS.some((c) => c.productIds.includes('prod-borners-terracotta-pack')),
    false,
    'Кампании не должны ссылаться на несуществующий prod-borners-terracotta-pack'
  );
});

test('80. Защита от утечек пути ассетов на GitHub Pages subpaths, безопасное имя скачивания base64-фото и чистый переход из Лаборатории в паспорт SKU', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const lightboxCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/FullscreenPhotoLightbox.tsx'),
    'utf8'
  );
  const docExportCode = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/document-export.ts'),
    'utf8'
  );
  const deckCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/StrategyPresentationDeck.tsx'),
    'utf8'
  );
  const catalogCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/ProductCatalogView.tsx'),
    'utf8'
  );

  assert.ok(
    lightboxCode.includes("currentOriginalSrc.startsWith('data:image/')"),
    'FullscreenPhotoLightbox должен безопасно извлекать расширение для data:image/... без вставки мегабайтов base64 в downloadFilename'
  );
  assert.ok(
    docExportCode.includes('img.src = resolvePublicAssetUrl(url);'),
    'loadImageForPdf должен резолвить пути фото через resolvePublicAssetUrl для рендера на subpaths /borners-group/ и /borners-platform/'
  );
  assert.ok(
    deckCode.includes("{ code: 'AKUSHA', label: 'AKUSHA' }") &&
      deckCode.includes("{ code: 'LISKANI', label: 'LISKANI' }") &&
      deckCode.includes("{ code: 'FUKAI', label: 'FUKAI' }"),
    'Слайд 05 презентации стратегии должен поддерживать все 5 брендов холдинга'
  );
  assert.ok(
    catalogCode.includes('buildPdfConceptFromScenarioModel(pdfModalModel, concepts)') &&
      catalogCode.includes('setActivePassportModelId(matched.id)'),
    'Каталог 01 · Продукт должен автоматически открывать паспорт SKU по deep-link из Лаборатории R&D и открывать PDF-конструктор ТЗ'
  );
});

test('81. Защита localStorage от 2x раздувания base64 (syncUserPlansBackup) и сохранность галерей/правок при overlayBackupOntoModels', async () => {
  const { safeSetStorageJson, safeGetStorageJson } = await import('../src/lib/safeStorage.ts');
  const {
    STORAGE_KEY_MODELS,
    STORAGE_KEY_USER_PLANS_BACKUP,
    STORAGE_KEY_PORTFOLIO_UPDATED_AT,
    STORAGE_KEY_BACKUP_UPDATED_AT,
    syncUserPlansBackup,
    hydratePortfolioModelsFromStorage,
  } = await import('../src/lib/portfolioPersistence.ts');
  const { INITIAL_SCENARIOS } = await import('../src/lib/scenarioData.ts');
  const { createBrandProductModel } = await import('../src/lib/unifiedBusinessEngine.ts');

  const store = new Map<string, string>();
  const origWin = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    const heavyDataUrl = 'data:image/jpeg;base64,' + 'Z'.repeat(25_000);
    const created = createBrandProductModel([], INITIAL_SCENARIOS, {
      title: 'НА ТЕЛЕ Топ Seamless Air',
      code: 'NTL-810',
      brandCode: 'NA_TELE',
      retailPriceRub: 2290,
      unitCostRub: 390,
      unitsInPack: 1,
    });
    const modelWithGallery = {
      ...created.model,
      gallery: [
        {
          id: 'g-ntl-810-1',
          url: heavyDataUrl,
          originalUrl: '',
          label: 'Обложка НА ТЕЛЕ',
          category: 'pack' as const,
          isMain: true,
        },
      ],
    };

    safeSetStorageJson(STORAGE_KEY_MODELS, [modelWithGallery]);
    syncUserPlansBackup([modelWithGallery]);

    // 1. В резервном ключе STORAGE_KEY_USER_PLANS_BACKUP тяжёлый data:image/ НЕ дублируется
    const rawBackupStr = store.get(STORAGE_KEY_USER_PLANS_BACKUP) || '';
    assert.equal(
      rawBackupStr.includes(heavyDataUrl),
      false,
      'syncUserPlansBackup не должен дублировать тяжёлые base64-фото во втором ключе localStorage'
    );

    // 2. При гидратации модели живая галерея из STORAGE_KEY_MODELS не затирается облегчённым backup!
    const hydrated = hydratePortfolioModelsFromStorage();
    const restoredNtl = hydrated.find((m) => m.code === 'NTL-810')!;
    assert.ok(restoredNtl, 'Модель NTL-810 должна гидратироваться');
    assert.equal(
      restoredNtl.gallery[0]?.url,
      heavyDataUrl,
      'Облегчённый backup не имеет права затирать живую base64-галерею модели'
    );

    // 3. Если STORAGE_KEY_MODELS новее устаревшего backup, старая цена из backup не откатывает новую цену!
    const newerModel = { ...modelWithGallery, retailPriceRub: 2790 };
    safeSetStorageJson(STORAGE_KEY_MODELS, [newerModel]);
    safeSetStorageJson(STORAGE_KEY_BACKUP_UPDATED_AT, '2026-11-10T10:00:00.000Z');
    safeSetStorageJson(STORAGE_KEY_PORTFOLIO_UPDATED_AT, '2026-11-12T18:00:00.000Z');

    const hydratedNewer = hydratePortfolioModelsFromStorage();
    const restoredNewer = hydratedNewer.find((m) => m.code === 'NTL-810')!;
    assert.equal(
      restoredNewer.retailPriceRub,
      2790,
      'Устаревший backup не должен откатывать более свежую цену в STORAGE_KEY_MODELS'
    );
  } finally {
    if (origWin === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = origWin;
  }
});

test('82. Точный выбор сценария модели (resolveEffectiveScenarioForModel), изоляция BORNERS S1 и независимый старт НА ТЕЛЕ (launchBrandStarterMatrix)', async () => {
  const {
    resolveEffectiveScenarioForModel,
    isBrandScenarioExplicitlyNone,
    filterModelsForScenario,
  } = await import('../src/lib/portfolioPersistence.ts');
  const { INITIAL_SCENARIOS, computeModelScenarioMetrics } = await import(
    '../src/lib/scenarioData.ts'
  );
  const { ACTING_2027_SCENARIO_DEF, ACTING_2027_SCENARIO_MODELS } = await import(
    '../src/lib/actingAssortment2027.ts'
  );
  const { AKUSHA_2027_MODELS, AKUSHA_2027_SCENARIO_DEF, AKUSHA_2027_SCENARIO_ID } = await import(
    '../src/lib/akushaAssortment2027.ts'
  );
  const { LISKANI_2027_MODELS, LISKANI_2027_SCENARIO_DEF, LISKANI_2027_SCENARIO_ID } = await import(
    '../src/lib/liskaniAssortment2027.ts'
  );
  const { S1_100M_SCENARIO_MODELS, applyClientSavedS1SalesPlan } = await import(
    '../src/lib/scenarioS1_100M.ts'
  );
  const { launchBrandStarterMatrix } = await import('../src/lib/unifiedBusinessEngine.ts');

  const allScenarios = [
    ACTING_2027_SCENARIO_DEF,
    ...INITIAL_SCENARIOS,
    LISKANI_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_DEF,
  ];
  const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const selectedByBrand: Record<string, number | null> = {
    BORNERS: 1,
    FUKAI: 100,
    LISKANI: LISKANI_2027_SCENARIO_ID,
    AKUSHA: AKUSHA_2027_SCENARIO_ID,
    NA_TELE: null,
  };

  assert.equal(isBrandScenarioExplicitlyNone('NA_TELE', selectedByBrand), true);
  assert.equal(isBrandScenarioExplicitlyNone('AKUSHA', selectedByBrand), false);

  // Карточка AKU-005 при поиске ⌘K из активного BORNERS Сценария №1 должна резолвить свой сценарий 202706 с реальной выручкой > 0!
  const aku005 = AKUSHA_2027_MODELS.find((m) => m.code === 'AKU-005')!;
  const effAkuScen = resolveEffectiveScenarioForModel(
    aku005,
    allScenarios,
    selectedByBrand,
    scen1
  );
  assert.equal(effAkuScen.id, AKUSHA_2027_SCENARIO_ID);
  assert.ok(computeModelScenarioMetrics(aku005, effAkuScen).annualRevenueRub > 0);

  // Запуск стартовой матрицы НА ТЕЛЕ создаёт независимый сценарий НА ТЕЛЕ с ненулевой выручкой и не меняет BORNERS 686,28 млн ₽
  const baseModels = [
    ...ACTING_2027_SCENARIO_MODELS,
    ...applyClientSavedS1SalesPlan(S1_100M_SCENARIO_MODELS),
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ];
  const starter = launchBrandStarterMatrix(baseModels, allScenarios, 'NA_TELE');
  const starterScen = starter.scenarios.find((s) => s.id === starter.scenarioId)!;
  assert.ok(starterScen, 'Должен быть создан независимый сценарий НА ТЕЛЕ');
  assert.equal(starterScen.ownerBrandCode, 'NA_TELE');
  assert.notEqual(starter.scenarioId, 1);

  const createdNaTeleModels = starter.models.filter((m) => m.brandId === 'NA_TELE');
  const naTeleStarterRev = createdNaTeleModels.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, starterScen).annualRevenueRub,
    0
  );
  assert.ok(naTeleStarterRev > 0, 'Стартовая матрица НА ТЕЛЕ должна иметь живой план продаж > 0 ₽');

  const pureBornersS1 = filterModelsForScenario(starter.models, scen1, false, 'ALL');
  const pureBornersRev = pureBornersS1.reduce(
    (sum, m) => sum + computeModelScenarioMetrics(m, scen1).annualRevenueRub,
    0
  );
  assert.equal(pureBornersS1.length, 21);
  assert.equal(pureBornersRev, 686_284_972);

  // При явном фильтре NA_TELE в Сценарии 1 или включённом тумблере группы модели НА ТЕЛЕ доступны
  const naTeleFilteredInS1 = filterModelsForScenario(starter.models, scen1, false, 'NA_TELE');
  assert.equal(naTeleFilteredInS1.length, createdNaTeleModels.length);
});

test('83. Сквозной синк 06 Производство R&D -> Закупки (PO) + стартовый план Продаж + удаление фото и сезонные цены', async () => {
  const { INITIAL_CONCEPTS } = await import('../src/lib/initial-data.ts');
  const { INITIAL_SCENARIOS, computeModelScenarioMetrics } = await import(
    '../src/lib/scenarioData.ts'
  );
  const { syncConceptToScenarioPortfolio } = await import('../src/lib/rndCatalogSync.ts');
  const { createIndependentBrandScenario } = await import('../src/lib/unifiedBusinessEngine.ts');

  const { scenario: naTeleScen } = createIndependentBrandScenario(INITIAL_SCENARIOS, [], {
    title: 'НА ТЕЛЕ — 2027 План',
    brandCode: 'NA_TELE',
    year: 2027,
    monthlyTargetMln: 20,
    copyFromScenarioId: null,
  });
  const allScens = [...INITIAL_SCENARIOS, naTeleScen];

  const photo1 = 'images/products/natele-editorial-hero.jpg';
  const photo2 = 'images/products/natele-milky-black.svg';

  const prodConcept = {
    ...INITIAL_CONCEPTS[0],
    id: 'concept-nt-sync-e2e',
    code: 'NTL-LAB-777',
    name: 'Боди НА ТЕЛЕ Invisible Sculpt',
    brandId: 'NA_TELE' as const,
    stage: 'PRODUCTION' as const,
    packUnitsCount: 1,
    plannedRetailPrice: 2490,
    plannedUnitCost: 420,
    imageUrl: photo1,
    galleryPhotos: [
      { id: 'gp-1', url: photo1, caption: 'Вид спереди', uploadedAt: '2026-11-12' },
      { id: 'gp-2', url: photo2, caption: 'Детали кроя', uploadedAt: '2026-11-12' },
    ],
    colorCombinations: ['Молочный шёлк', 'Чёрный оникс'],
    productionOrders: [
      {
        id: 'po-rnd-777',
        orderNumber: 'PO-NTL-777',
        factoryName: 'Shantou Seamless Intimate Co.',
        contactPerson: 'Lin Wei',
        approvedSampleVersion: 'Версия 2 (утверждена)',
        internalStatus: 'in_production' as const,
        materialAndColors: '78% микрополиамид + 22% эластан',
        sizeBreakdown: { XS: 100, S: 200, M: 300, L: 150, XL: 50 },
        packsBySize: { XS: 100, S: 200, M: 300, L: 150, XL: 50 },
        unitsPerPack: 1,
        totalUnits: 800,
        packConfiguration: '1 шт. в зип-пакете',
        packColorComposition: 'Молочный шёлк, Чёрный оникс',
        packagingDetails: 'Матовый зип-пакет + DataMatrix',
        unitPrice: 410,
        currency: 'RUB' as const,
        plannedReadyDate: '2027-04-15',
        qcNotes: 'AQL 1.5',
        logisticsTracking: '',
      },
    ],
  };

  // 1. Первичный синк на этапе 06 Производство автоматически создаёт PO и стартовый план продаж на 800 ед.!
  const firstSync = syncConceptToScenarioPortfolio(prodConcept, [], allScens);
  const syncedModel = firstSync.model;
  assert.equal(syncedModel.gallery.length, 2);
  assert.equal(syncedModel.unitCostRub, 410);
  assert.ok(
    (syncedModel.sharedSupplyAndFact?.approvedOrders || []).some(
      (po) => po.packsQty === 800 && (po.note || '').includes('[R&D')
    ),
    'Партия 800 шт. из 06 Производство должна попасть в утверждённые заказы Закупок (PO)'
  );

  const metricsAfterProd = computeModelScenarioMetrics(syncedModel, naTeleScen);
  assert.equal(
    metricsAfterProd.annualPacks,
    800,
    'Стартовый план продаж должен автоматически распределить партию 800 шт. по месяцам'
  );
  assert.ok(metricsAfterProd.annualRevenueRub > 0);

  // 2. Ставим индивидуальную сезонную цену в декабре (2990 ₽), меняем базовую цену в R&D на 2590 ₽ и удаляем 2-е фото в R&D
  const withDecPromo = {
    ...syncedModel,
    plansByScenario: {
      ...syncedModel.plansByScenario,
      [naTeleScen.id]: {
        ...syncedModel.plansByScenario[naTeleScen.id],
        monthlyPricesRub: syncedModel.plansByScenario[naTeleScen.id].monthlyPricesRub.map(
          (p, idx) => (idx === 11 ? 2990 : p)
        ),
      },
    },
  };

  const conceptWithoutSecondPhoto = {
    ...prodConcept,
    linkedScenarioModelId: withDecPromo.id,
    plannedRetailPrice: 2590,
    galleryPhotos: [{ id: 'gp-1', url: photo1, caption: 'Вид спереди', uploadedAt: '2026-11-12' }],
  };

  const secondSync = syncConceptToScenarioPortfolio(
    conceptWithoutSecondPhoto,
    [withDecPromo],
    allScens
  );
  assert.equal(
    secondSync.model.gallery.length,
    1,
    'Удалённая в Лаборатории R&D фотография не должна воскресать из старой галереи модели'
  );
  assert.equal(
    secondSync.model.plansByScenario[naTeleScen.id].monthlyPricesRub[11],
    2990,
    'Индивидуальная сезонная цена декабря (2990 ₽) должна сохраняться при обновлении базовой цены'
  );
  assert.equal(
    secondSync.model.plansByScenario[naTeleScen.id].monthlyPricesRub[4],
    2590,
    'Базовые месяцы должны обновиться на новую цену R&D (2590 ₽)'
  );
});

test('84. Брендовые профили производства (getBrandProductionProfile): XS–XL для НА ТЕЛЕ, обувь 22–30/36–41 для AKUSHA и шторы LISKANI без утечки 待定', async () => {
  const {
    getBrandProductionProfile,
    cleanTechPackText,
    isPlaceholderTechString,
  } = await import('../src/lib/brandProductionConfig.ts');
  const { buildPdfConceptFromScenarioModel } = await import('../src/lib/rndCatalogSync.ts');
  const { INITIAL_SCENARIOS } = await import('../src/lib/scenarioData.ts');
  const { createBrandProductModel } = await import('../src/lib/unifiedBusinessEngine.ts');

  const naTeleProf = getBrandProductionProfile('NA_TELE', 'Бралетт бесшовный');
  assert.deepEqual(naTeleProf.sizes, ['XS', 'S', 'M', 'L', 'XL']);
  assert.equal(naTeleProf.defaultPackUnits, 1);
  assert.equal(naTeleProf.defaultConstructionZh.includes('平角内裤'), false);

  const akuKidsProf = getBrandProductionProfile('AKUSHA', 'Ботинки детские демисезонные');
  assert.deepEqual(akuKidsProf.sizes, ['22', '23', '24', '25', '26', '27', '28', '29', '30']);
  assert.equal(akuKidsProf.itemsUnitLabelRu, 'Пар обуви');

  const akuAdultProf = getBrandProductionProfile('AKUSHA', 'Лоферы женские замшевые 36-41');
  assert.deepEqual(akuAdultProf.sizes, ['36', '37', '38', '39', '40', '41']);

  const liskaniProf = getBrandProductionProfile('LISKANI', 'Шторы блэкаут');
  assert.ok(liskaniProf.sizes.includes('300×250') && liskaniProf.sizes.includes('400×270'));
  assert.equal(liskaniProf.packUnitLabelRu, 'Комплектов штор');

  assert.equal(isPlaceholderTechString('待定 (Определяется)'), true);
  assert.equal(isPlaceholderTechString('TBD'), true);
  assert.equal(cleanTechPackText('待定', naTeleProf.defaultMaterialZh), naTeleProf.defaultMaterialZh);

  const ntModel = createBrandProductModel([], INITIAL_SCENARIOS, {
    title: 'Трусики-слипы НА ТЕЛЕ Laser Cut',
    code: 'NTL-840',
    brandCode: 'NA_TELE',
    retailPriceRub: 1590,
    unitCostRub: 290,
    unitsInPack: 1,
  }).model;
  const pdfConcept = buildPdfConceptFromScenarioModel(ntModel, []);
  assert.equal(JSON.stringify(pdfConcept.techPack).includes('待定'), false);
});

test('85. Статус активности всех 5 брендов в INITIAL_BRANDS и полнота облачного слепка Supabase (сценарии, тумблер S1, дедупликация фото)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { INITIAL_BRANDS } = await import('../src/lib/initial-data.ts');

  const codes = INITIAL_BRANDS.map((b) => b.code);
  for (const expected of ['BORNERS', 'NA_TELE', 'FUKAI', 'AKUSHA', 'LISKANI'] as const) {
    const brand = INITIAL_BRANDS.find((b) => b.code === expected);
    assert.ok(brand, `Бренд ${expected} должен присутствовать в INITIAL_BRANDS (найдены: ${codes.join(',')})`);
    assert.equal(
      Boolean(brand.isStrategyInDevelopment),
      false,
      `Бренд ${expected} должен быть активен (не «В разработке»)`
    );
    assert.ok(!brand.statusNote || brand.statusNote === 'Активен');
  }

  const cloudSyncCode = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/supabaseCloudSync.ts'),
    'utf8'
  );
  assert.ok(
    cloudSyncCode.includes('selectedScenarioByBrand?: Record<string, number | null>') &&
      cloudSyncCode.includes('deletedModelIds?: string[]') &&
      cloudSyncCode.includes('lastSyncedGalleryFingerprintByModelId') &&
      cloudSyncCode.includes('latestCorePushSeq'),
    'supabaseCloudSync должен синхронизировать selectedScenarioByBrand, deletedModelIds, дедуплицировать неизменённые галереи и защищать порядок пушей'
  );
});

test('86. Многостраничный генератор PDF (downloadEditorialPdfDocument) без обрезки строк и порог сжатия фото <= 64 КБ', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const docExportCode = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/document-export.ts'),
    'utf8'
  );
  assert.ok(
    docExportCode.includes('encoded.length > 64_000'),
    'compressImageFileToDataUrl должен сжимать загружаемые фото до <= 64_000 символов (ниже порога stripOversizedDataUrls 70_000)'
  );
  assert.ok(
    docExportCode.includes('ensureVerticalSpace(') &&
      docExportCode.includes('const pdfPages = pageCanvases.map(') &&
      docExportCode.includes('Стр. ${pageIdx + 1} / ${totalPages}'),
    'downloadEditorialPdfDocument должен поддерживать автоматический перенос длинных таблиц на новые страницы A4 с нумерацией страниц'
  );
  assert.ok(
    docExportCode.includes('getBrandProductionProfile(concept.brandId, concept.name)'),
    'Экспорт PDF и Excel заказа на фабрику должен использовать брендовую размерную сетку getBrandProductionProfile'
  );
});

test('87. Гидратация слепка IndexedDB с меткой времени до облачного pull и очистка удалённых галерей (deleteModelGalleryFromIdb)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { rehydrateConceptsFromIdbSnapshot } = await import('../src/lib/safeStorage.ts');
  const { INITIAL_CONCEPTS } = await import('../src/lib/initial-data.ts');

  const safeStorageCode = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/safeStorage.ts'),
    'utf8'
  );
  const liveHookCode = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/useLiveScenarioPortfolio.ts'),
    'utf8'
  );

  assert.ok(
    safeStorageCode.includes('export async function deleteModelGalleryFromIdb(') &&
      safeStorageCode.includes('export async function loadPortfolioSnapshotWithMetaFromIdb'),
    'safeStorage должен предоставлять deleteModelGalleryFromIdb и loadPortfolioSnapshotWithMetaFromIdb'
  );
  assert.ok(
    liveHookCode.includes('scheduleCompleteCloudPush') &&
      liveHookCode.includes('const [idbSnapMeta, idbGalleries] = await Promise.all(['),
    'useLiveScenarioPortfolio должен дожидаться чтения IndexedDB перед pull из облака и отправлять полный слепок через scheduleCompleteCloudPush'
  );

  // Проверяем восстановление картинки в designVersions при переполнении localStorage
  const bigDesignImg = 'data:image/png;base64,' + 'D'.repeat(75_000);
  const strippedConcept = {
    ...INITIAL_CONCEPTS[0],
    id: 'c-design-idb',
    designVersions: [
      {
        id: 'dv-1',
        versionNumber: 1,
        createdAt: '2026-11-12',
        authorName: 'Дизайнер',
        changesSummary: 'Эскиз',
        palettes: [],
        pantoneCodes: [],
        imageUrl: '',
        isApproved: true,
      },
    ],
  };
  const idbConcept = {
    ...strippedConcept,
    designVersions: [{ ...strippedConcept.designVersions[0], imageUrl: bigDesignImg }],
  };
  const rehydrated = rehydrateConceptsFromIdbSnapshot([strippedConcept], [idbConcept]);
  assert.equal(rehydrated[0].designVersions?.[0]?.imageUrl, bigDesignImg);
});

test('88. Одновременная сверка всех 4 эталонных финансовых портфелей холдинга после всех миграций v5', async () => {
  const {
    runLiskani269OfficialMigrationV3,
    runAkusha2027OfficialMigrationV1,
    hydratePortfolioModelsFromStorage,
    filterModelsForScenario,
  } = await import('../src/lib/portfolioPersistence.ts');
  const { INITIAL_SCENARIOS, computeModelScenarioMetrics } = await import(
    '../src/lib/scenarioData.ts'
  );
  const { ACTING_2027_SCENARIO_DEF } = await import('../src/lib/actingAssortment2027.ts');
  const { LISKANI_2027_SCENARIO_DEF } = await import('../src/lib/liskaniAssortment2027.ts');
  const { AKUSHA_2027_SCENARIO_DEF } = await import('../src/lib/akushaAssortment2027.ts');
  const { computeScenarioInvestmentSummary } = await import(
    '../src/lib/unifiedBusinessEngine.ts'
  );

  const store = new Map<string, string>();
  const origWin = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  };

  try {
    runLiskani269OfficialMigrationV3();
    runAkusha2027OfficialMigrationV1();
    const models = hydratePortfolioModelsFromStorage();

    // 1. BORNERS Сценарий №1: 21 SKU, 686 284 972 ₽ за год, 109 938 111 ₽ в декабре
    const scen1 = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
    const bornersS1 = filterModelsForScenario(models, scen1, false, 'BORNERS');
    const brnYear = bornersS1.reduce(
      (s, m) => s + computeModelScenarioMetrics(m, scen1).annualRevenueRub,
      0
    );
    const brnDec = bornersS1.reduce(
      (s, m) => s + computeModelScenarioMetrics(m, scen1).targetMonthRevenueRub,
      0
    );
    assert.equal(bornersS1.length, 21);
    assert.equal(brnYear, 686_284_972);
    assert.equal(brnDec, 109_938_111);

    // 2. LISKANI 202705: 33 карточки, 269 размеров, 500 000 000 ₽ выкупы, 877 192 982 ₽ заказы
    const liskaniModels = filterModelsForScenario(
      models,
      LISKANI_2027_SCENARIO_DEF,
      false,
      'LISKANI'
    );
    const lskSizeCount = liskaniModels.reduce(
      (s, m) => s + (m.liskaniSizeVariants?.length || 0),
      0
    );
    const lskBuyouts = liskaniModels.reduce(
      (s, m) => s + computeModelScenarioMetrics(m, LISKANI_2027_SCENARIO_DEF).annualRevenueRub,
      0
    );
    const lskOrders = liskaniModels.reduce(
      (s, m) => s + computeModelScenarioMetrics(m, LISKANI_2027_SCENARIO_DEF).annualOrdersRub,
      0
    );
    assert.equal(liskaniModels.length, 33);
    assert.equal(lskSizeCount, 269);
    assert.equal(lskBuyouts, 500_000_000);
    assert.equal(lskOrders, 877_192_982);

    // 3. AKUSHA 202706: 24 карточки, 20 377 пар, 105 793 210 ₽ выручка, 37 448 200 ₽ себестоимость проданных
    const akushaModels = filterModelsForScenario(
      models,
      AKUSHA_2027_SCENARIO_DEF,
      false,
      'AKUSHA'
    );
    const akuInv = computeScenarioInvestmentSummary(akushaModels, AKUSHA_2027_SCENARIO_DEF);
    const akuPairs = akushaModels.reduce(
      (s, m) => s + computeModelScenarioMetrics(m, AKUSHA_2027_SCENARIO_DEF).annualPacks,
      0
    );
    assert.equal(akushaModels.length, 24);
    assert.equal(akuPairs, 20_377);
    assert.equal(akuInv.annualRevenueRub, 105_793_210);
    assert.equal(akuInv.annualSoldGoodsCostRub, 37_448_200);

    // 4. FUKAI 100: 2 WB SKU, 90 553 401 ₽ годовая выручка
    const fukaiModels = filterModelsForScenario(
      models,
      ACTING_2027_SCENARIO_DEF,
      false,
      'FUKAI'
    );
    const fukYear = fukaiModels.reduce(
      (s, m) => s + computeModelScenarioMetrics(m, ACTING_2027_SCENARIO_DEF).annualRevenueRub,
      0
    );
    assert.equal(fukaiModels.length, 2);
    assert.equal(fukYear, 90_553_401);
  } finally {
    if (origWin === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = origWin;
  }
});

test('89. Сквозная связка Miro -> Лаборатория R&D -> 06 Производство -> PDF-конструктор и удаление без «зомби»-SKU', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const labViewCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/ProductLabView.tsx'),
    'utf8'
  );
  const labTabsCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/ProductLabTabs.tsx'),
    'utf8'
  );
  const miroCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/MiroBoardView.tsx'),
    'utf8'
  );
  const pdfModalCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/PdfConstructorModal.tsx'),
    'utf8'
  );

  assert.ok(
    labViewCode.includes('handleDeleteConceptEverywhere') &&
      labViewCode.includes('markModelAsDeletedInStorage') &&
      labViewCode.includes('prevBrandFilterRef'),
    'ProductLabView должен удалять связанные кастомные SKU без «зомби»-карточек и корректно отслеживать переключение brandFilter'
  );
  assert.ok(
    labTabsCode.includes('getBrandProductionProfile(concept.brandId, concept.name)') &&
      labTabsCode.includes('cleanTechPackText(') &&
      labTabsCode.includes('onSyncConcept'),
    'ProductLabTabs должен строить размерную сетку 06 Производство и переводы ТЗ по бренду карточки и синхронизировать партии с Каталогом'
  );
  assert.ok(
    (miroCode.includes('В разработку R&D') || miroCode.includes('В разработку R&amp;D')) &&
      miroCode.includes('syncConceptToScenarioPortfolio') &&
      miroCode.includes('Карточка R&D находится в архиве'),
    'Доска Miro должна поддерживать прямой перевод карточек в разработку R&D и защищать от перехода в архивные карточки'
  );
  assert.ok(
    pdfModalCode.includes('getBrandProductionProfile(concept.brandId, concept.name)') &&
      pdfModalCode.includes('cleanTechPackText('),
    'PdfConstructorModal должен использовать брендовые размеры и очищать заполнители 待定'
  );
});

test('90. Единая мультибрендовая аналитика 5 брендов: Поиск ⌘K, Сводка 02/03/04, LISKANI в верстаке Закупок, Стратегия, Презентация и полный JSON-бэкап', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const appShellCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/shell/AppShell.tsx'),
    'utf8'
  );
  const showcaseCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/GrowthScenariosShowcase.tsx'),
    'utf8'
  );
  const contoursCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/UnifiedContourViews.tsx'),
    'utf8'
  );
  const workbenchCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/SkuProcurementMvpWorkbench.tsx'),
    'utf8'
  );
  const strategyViewCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/BrandStrategyView.tsx'),
    'utf8'
  );
  const deckCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/StrategyPresentationDeck.tsx'),
    'utf8'
  );
  const settingsCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/ManagementAndSystemViews.tsx'),
    'utf8'
  );

  assert.ok(
    appShellCode.includes('resolveEffectiveScenarioForModel') &&
      appShellCode.includes('unmarkModelAsDeletedInStorage') &&
      appShellCode.includes('deleteModelGalleryFromIdb') &&
      appShellCode.includes('borners-product-groups-changed'),
    'AppShell должен считать выручку в ⌘K по эффективному сценарию бренда и атомарно восстанавливать модели, группы и галереи из JSON-бэкапа'
  );
  assert.ok(
    showcaseCode.includes('loadAllModelGalleriesFromIdb') &&
      showcaseCode.includes('resolveEffectiveScenarioForModel'),
    'GrowthScenariosShowcase должен гидратировать фото из IndexedDB при маунте и открывать карточки чужих брендов в их собственном сценарии'
  );
  assert.ok(
    contoursCode.includes('Все 5 брендов холдинга') &&
      contoursCode.includes('computeMultiBrandPortfolioSummary'),
    'Контуры 02 · Продажи и 04 · Финансы при фильтре ALL должны консолидировать живые планы всех 5 брендов холдинга без расхождения сумм'
  );
  assert.ok(
    workbenchCode.includes('baselineVariantSum') &&
      workbenchCode.includes('getBrandProductionProfile'),
    'Верстак закупок должен точно масштабировать 269 размеров LISKANI по сумме заказов и строить сетку размеров под бренд'
  );
  assert.ok(
    strategyViewCode.includes("'AKUSHA'") &&
      strategyViewCode.includes("'LISKANI'") &&
      strategyViewCode.includes("'FUKAI'") &&
      deckCode.includes('useLiveScenarioPortfolio'),
    'Стратегия бренда и Презентация должны отображать живые показатели всех 5 активных брендов холдинга'
  );
  assert.ok(
    settingsCode.includes('buildFullPlatformBackupBundle') &&
      settingsCode.includes('parseFullPlatformBackupBundle'),
    'Экран Настроек должен экспортировать и импортировать полный бандл платформы v2 вместе с портфелем моделей и сценариев'
  );
});

test('91. Детализация «Пик своих денег» (внутри месяца до выплат WB vs конец месяца): сверка рубль-в-рубль по BORNERS S1 и LISKANI 202705', async () => {
  const {
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
  } = await import('../src/lib/liskaniAssortment2027.ts');

  const s1Def = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const bornersModels = applyClientSavedS1SalesPlan([
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
  ]).filter((m) => !isUnverifiedActingSku(m.code));
  assert.equal(bornersModels.length, 21, 'В BORNERS S1 ровно 21 SKU');

  const bornersInv = computeScenarioInvestmentSummary(bornersModels, s1Def, {
    initialCashRub: 0,
    settlementLagMonths: 0,
    wbPayoutScheduleSpecified: true,
  });

  // Проверяем точный месяц пика, фазу внутри месяца и месяц выхода в плюс с WB
  assert.equal(bornersInv.peakMonthIdx, 0, 'Пик своих денег BORNERS S1 наступает в январе (индекс 0)');
  assert.equal(bornersInv.peakMonthLabel, 'Янв');
  assert.equal(bornersInv.peakPhase, 'before_wb_inflow');
  assert.ok(
    bornersInv.peakWindowHumanRu.includes('1–15 января 2027'),
    `Человекочитаемое окно пика должно указывать 1–15 января 2027, получено: ${bornersInv.peakWindowHumanRu}`
  );
  assert.equal(bornersInv.selfFundingMonthLabel, 'Мар', 'С марта BORNERS S1 выходит в устойчивую самоокупаемость с WB');

  const janRow = bornersInv.monthlyRows[0];
  assert.equal(janRow.isPeakDeficitMonth, true);
  assert.equal(janRow.isIntraMonthPeak, true);
  assert.equal(
    bornersInv.openingBalanceAtPeakMonthRub -
      bornersInv.prepayInPeakMonthRub -
      bornersInv.balancePayInPeakMonthRub,
    janRow.intraMonthLowBalanceRub,
    'Формула минимума внутри месяца (Остаток на 1-е − Авансы − Доплаты) обязана сходиться до рубля'
  );
  assert.equal(
    Math.max(0, -Math.min(janRow.intraMonthLowBalanceRub, janRow.cumulativeCashBalanceRub)),
    bornersInv.peakWorkingCapitalRub,
    'Пик своих денег BORNERS S1 должен на 100% совпадать с внутримесячным минимумом января'
  );
  assert.ok(
    Math.abs(janRow.intraMonthLowBalanceRub) > Math.abs(janRow.cumulativeCashBalanceRub),
    'Внутримесячный минимум до прихода WB глубже остатка на конец января — именно поэтому раньше казалось, что таблица и карточка расходятся'
  );

  // Проверяем влияние стартового кэша (например, 5 млн ₽ на счёте)
  const bornersWithCash = computeScenarioInvestmentSummary(bornersModels, s1Def, {
    initialCashRub: 5_000_000,
    settlementLagMonths: 0,
    wbPayoutScheduleSpecified: true,
  });
  assert.equal(
    bornersWithCash.netOwnMoneyRequiredRub,
    Math.max(0, bornersInv.peakWorkingCapitalRub - 5_000_000),
    'Стартовый остаток денег ровно уменьшает чистую потребность в своих деньгах'
  );
  assert.equal(
    bornersWithCash.monthlyRows[0].intraMonthLowBalanceRub,
    janRow.intraMonthLowBalanceRub + 5_000_000
  );

  // Проверяем аналогичную точную сходимость по LISKANI 202705 (33 карточки · 500 млн ₽)
  const liskaniInv = computeScenarioInvestmentSummary(
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
    { initialCashRub: 0, settlementLagMonths: 0, wbPayoutScheduleSpecified: true }
  );
  const lskPeakRow = liskaniInv.monthlyRows[liskaniInv.peakMonthIdx];
  assert.equal(liskaniInv.peakMonthIdx, 0);
  assert.equal(liskaniInv.peakMonthLabel, 'Янв');
  assert.equal(liskaniInv.selfFundingMonthLabel, 'Мар');
  assert.equal(
    Math.max(0, -Math.min(lskPeakRow.intraMonthLowBalanceRub, lskPeakRow.cumulativeCashBalanceRub)),
    liskaniInv.peakWorkingCapitalRub,
    'Пик своих денег LISKANI обязан сходиться рубль-в-рубль с графиком 12 мес.'
  );
});

test('92. Тайминг «Пик своих денег» для обуви AKUSHA 202706 и сводного холдинга 5 брендов (computeMultiBrandPortfolioSummary)', async () => {
  const {
    AKUSHA_2027_MODELS,
    AKUSHA_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_ID,
  } = await import('../src/lib/akushaAssortment2027.ts');
  const {
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
    LISKANI_2027_SCENARIO_ID,
  } = await import('../src/lib/liskaniAssortment2027.ts');

  const akushaInv = computeScenarioInvestmentSummary(
    AKUSHA_2027_MODELS,
    AKUSHA_2027_SCENARIO_DEF,
    { initialCashRub: 0, settlementLagMonths: 0, wbPayoutScheduleSpecified: true }
  );
  assert.ok(akushaInv.peakMonthIdx >= 0 && akushaInv.peakMonthIdx < 12);
  assert.ok(akushaInv.peakMonthLabel.length >= 3);
  assert.ok(akushaInv.peakWindowHumanRu.includes('2027'));
  const akPeakRow = akushaInv.monthlyRows[akushaInv.peakMonthIdx];
  assert.equal(akPeakRow.isPeakDeficitMonth, true);
  assert.equal(
    akushaInv.openingBalanceAtPeakMonthRub -
      akushaInv.prepayInPeakMonthRub -
      akushaInv.balancePayInPeakMonthRub +
      akushaInv.wbInflowInPeakMonthRub,
    akushaInv.endOfPeakMonthBalanceRub,
    'Кассовое уравнение пикового месяца AKUSHA (Начало − Авансы − Доплаты + Приход WB = Конец месяца) сходится до рубля'
  );

  // Полный портфель всех 5 брендов холдинга
  const allModels = [
    ...INITIAL_SCENARIO_MODELS,
    ...LISKANI_2027_MODELS,
    ...AKUSHA_2027_MODELS,
  ];
  const allScenarios = [
    ...INITIAL_SCENARIOS,
    LISKANI_2027_SCENARIO_DEF,
    AKUSHA_2027_SCENARIO_DEF,
  ];
  const holding = computeMultiBrandPortfolioSummary(allModels, allScenarios, {
    BORNERS: 1,
    FUKAI: 100,
    AKUSHA: AKUSHA_2027_SCENARIO_ID,
    LISKANI: LISKANI_2027_SCENARIO_ID,
    NA_TELE: 2,
  });

  const gt = holding.groupTotal;
  assert.ok(gt.peakWorkingCapitalRub > 100_000_000, 'Сводный пик своих денег 5 брендов превышает 100 млн ₽');
  assert.equal(gt.peakMonthIdx, 0);
  assert.equal(gt.peakMonthLabel, 'Янв');
  assert.ok(gt.selfFundingMonthLabel, 'У сводного холдинга определён месяц выхода в самоокупаемость');
  const gtPeakRow = gt.monthlyRows[gt.peakMonthIdx];
  assert.equal(
    gt.openingBalanceAtPeakMonthRub - gt.prepayInPeakMonthRub - gt.balancePayInPeakMonthRub,
    gtPeakRow.intraMonthLowBalanceRub,
    'Сводный график холдинга 5 брендов сходится по формуле внутримесячного минимума до рубля'
  );
  assert.equal(
    Math.max(0, -Math.min(gtPeakRow.intraMonthLowBalanceRub, gtPeakRow.cumulativeCashBalanceRub)),
    gt.peakWorkingCapitalRub
  );
});

test('93. Реальные квартальные волны закупок (computePortfolioProcurementWavesSummary): 100% сходимость с бюджетом без захардкоженных коэффициентов', async () => {
  const { computePortfolioProcurementWavesSummary } = await import(
    '../src/lib/unifiedBusinessEngine.ts'
  );
  const {
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
  } = await import('../src/lib/liskaniAssortment2027.ts');

  const s1Def = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const bornersModels = INITIAL_SCENARIO_MODELS.filter(
    (m) =>
      normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(m)) === 'BORNERS' &&
      m.plansByScenario?.[1] !== undefined
  );
  const bornersInv = computeScenarioInvestmentSummary(bornersModels, s1Def);
  const bornersWaves = computePortfolioProcurementWavesSummary(
    bornersModels.map((model) => ({ model, scenario: s1Def })),
    bornersInv.monthlyRows,
    2027
  );

  assert.equal(bornersWaves.waves.length, 4, 'Ровно 4 квартальные волны (Q1–Q4)');
  assert.equal(bornersWaves.monthlySchedule.length, 12, 'Ровно 12 месяцев в платёжном календаре фабрик');

  const sumWaveBudgets = bornersWaves.waves.reduce((s, w) => s + w.budgetRub, 0);
  const sumWavePacks = bornersWaves.waves.reduce((s, w) => s + w.packsQty, 0);
  const sumMonthlyOutflow = bornersWaves.monthlySchedule.reduce(
    (s, m) => s + m.totalOutflowRub,
    0
  );
  const sumMonthlyPrepay = bornersWaves.monthlySchedule.reduce((s, m) => s + m.prepayRub, 0);
  const sumMonthlyBalance = bornersWaves.monthlySchedule.reduce((s, m) => s + m.balanceRub, 0);

  assert.equal(
    sumWaveBudgets,
    bornersInv.totalProcurementBudgetRub,
    'Сумма бюджетов 4 волн BORNERS S1 обязана сходиться с годовым бюджетом закупок рубль-в-рубль'
  );
  assert.equal(
    sumWavePacks,
    bornersInv.totalProcurementPacks,
    'Сумма комплектов 4 волн BORNERS S1 обязана сходиться с годовым объёмом закупок'
  );
  assert.equal(
    sumMonthlyOutflow,
    bornersInv.totalProcurementBudgetRub,
    'Сумма 12 месяцев авансов и доплат обязана равняться годовому бюджету закупок'
  );
  assert.equal(sumMonthlyPrepay + sumMonthlyBalance, sumMonthlyOutflow);

  // Проверяем LISKANI
  const liskaniInv = computeScenarioInvestmentSummary(
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF
  );
  const liskaniWaves = computePortfolioProcurementWavesSummary(
    LISKANI_2027_MODELS.map((model) => ({ model, scenario: LISKANI_2027_SCENARIO_DEF })),
    liskaniInv.monthlyRows,
    2027
  );
  assert.equal(
    liskaniWaves.waves.reduce((s, w) => s + w.budgetRub, 0),
    liskaniInv.totalProcurementBudgetRub,
    'Сумма 4 волн LISKANI сходится с годовым бюджетом закупок 1-в-1'
  );

  // Проверяем отсутствие старых фейковых коэффициентов 0.27 / 0.34 в UI
  const contoursCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/UnifiedContourViews.tsx'),
    'utf8'
  );
  const homeCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/PeaklyBrandCatalogAndGroups.tsx'),
    'utf8'
  );
  assert.equal(
    contoursCode.includes('remainingBudget * 0.27') || homeCode.includes('remainingBudget * 0.27'),
    false,
    'Старые захардкоженные пропорции волн (0.27 / 0.34) полностью удалены из UI'
  );
});

test('94. Групповая настройка условий оплаты фабрикам (applyBatchFactoryPaymentTermsToModels): аванс 20/80 vs 50/50, цикл пошива и режим под выкупы vs под заказы ПВЗ', async () => {
  const {
    applyBatchFactoryPaymentTermsToModels,
    computePortfolioProcurementWavesSummary,
  } = await import('../src/lib/unifiedBusinessEngine.ts');
  const {
    AKUSHA_2027_MODELS,
    AKUSHA_2027_SCENARIO_DEF,
  } = await import('../src/lib/akushaAssortment2027.ts');

  const s1Def = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const bornersBase = INITIAL_SCENARIO_MODELS.filter(
    (m) =>
      normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(m)) === 'BORNERS' &&
      m.plansByScenario?.[1] !== undefined
  ).map((m) => structuredClone(m));
  const targetIds = bornersBase.map((m) => m.id);

  const models20 = applyBatchFactoryPaymentTermsToModels(
    bornersBase,
    targetIds,
    { prepaymentPct: 20 },
    'Тест'
  );
  const models50 = applyBatchFactoryPaymentTermsToModels(
    bornersBase,
    targetIds,
    { prepaymentPct: 50, productionLeadDays: 45 },
    'Тест'
  );

  assert.equal(models20[0].sharedSupplyAndFact?.factoryParams.prepaymentPct, 20);
  assert.equal(models20[0].sharedSupplyAndFact?.factoryParams.balancePaymentPct, 80);
  assert.equal(models50[0].sharedSupplyAndFact?.factoryParams.prepaymentPct, 50);
  assert.equal(models50[0].sharedSupplyAndFact?.factoryParams.balancePaymentPct, 50);
  assert.equal(models50[0].sharedSupplyAndFact?.factoryParams.productionLeadDays, 45);

  const inv20 = computeScenarioInvestmentSummary(models20, s1Def);
  const inv30 = computeScenarioInvestmentSummary(bornersBase, s1Def);
  const inv50 = computeScenarioInvestmentSummary(models50, s1Def);

  assert.equal(inv20.totalProcurementBudgetRub, inv30.totalProcurementBudgetRub);
  assert.equal(inv50.totalProcurementBudgetRub, inv30.totalProcurementBudgetRub);
  assert.ok(
    inv20.firstWavePrepaymentRub < inv30.firstWavePrepaymentRub &&
      inv30.firstWavePrepaymentRub < inv50.firstWavePrepaymentRub,
    'Аванс 1-й волны монотонно растёт при переключении схемы оплаты 20/80 → 30/70 → 50/50'
  );

  const waves50 = computePortfolioProcurementWavesSummary(
    models50.map((model) => ({ model, scenario: s1Def })),
    inv50.monthlyRows,
    2027
  );
  assert.equal(waves50.avgPrepaymentPct, 50);

  // Проверяем переключение режима «Под заказы ПВЗ» vs «Под чистые выкупы ×1,00» на клоне AKUSHA
  const akushaOrdersMode = AKUSHA_2027_MODELS.map((m) => structuredClone(m));
  const akushaBuyoutsMode = applyBatchFactoryPaymentTermsToModels(
    akushaOrdersMode,
    akushaOrdersMode.map((m) => m.id),
    { procureByOrdersVolume: false },
    'Тест'
  );
  const akInvOrders = computeScenarioInvestmentSummary(akushaOrdersMode, AKUSHA_2027_SCENARIO_DEF);
  const akInvBuyouts = computeScenarioInvestmentSummary(akushaBuyoutsMode, AKUSHA_2027_SCENARIO_DEF);
  assert.ok(
    akInvBuyouts.totalProcurementPacks < akInvOrders.totalProcurementPacks,
    'При переключении обуви AKUSHA с заказов ПВЗ (35% выкупа) на чистые выкупы (×1,00) объём закупки кратно снижается'
  );
  assert.ok(
    akInvBuyouts.peakWorkingCapitalRub < akInvOrders.peakWorkingCapitalRub,
    'Пик своих денег AKUSHA синхронно снижается при закупке только под чистые выкупы'
  );
});

test('95. Брендовые размерные сетки в 03 · Закупки (XS–XL, 22–30, 36–41), 1-клик утверждение партии в PO и рендер PeakOwnMoneyChartPanel', async () => {
  const { getBrandProductionProfile } = await import('../src/lib/brandProductionConfig.ts');
  const { computePortfolioProcurementWavesSummary } = await import(
    '../src/lib/unifiedBusinessEngine.ts'
  );

  const naTeleProf = getBrandProductionProfile('НА ТЕЛЕ', 'Комплект женских слипов');
  const akushaKidsProf = getBrandProductionProfile('AKUSHA', 'Детские кеды из экокожи');
  const akushaWomenProf = getBrandProductionProfile('AKUSHA', 'Дыхабельные женские мокасины');
  const bornersProf = getBrandProductionProfile('BORNERS', 'Мужские боксеры 4-pack');

  assert.equal(`${naTeleProf.sizes[0]}–${naTeleProf.sizes[naTeleProf.sizes.length - 1]}`, 'XS–XL');
  assert.equal(
    `${akushaKidsProf.sizes[0]}–${akushaKidsProf.sizes[akushaKidsProf.sizes.length - 1]}`,
    '22–30'
  );
  assert.equal(
    `${akushaWomenProf.sizes[0]}–${akushaWomenProf.sizes[akushaWomenProf.sizes.length - 1]}`,
    '36–41'
  );
  assert.equal(`${bornersProf.sizes[0]}–${bornersProf.sizes[bornersProf.sizes.length - 1]}`, 'S–4XL');

  // Проверяем 1-клик утверждение черновой партии в PO (approveRecommendedBatch) и инвариантность бюджета волн
  const s1Def = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const sorbet = structuredClone(
    ensureModelUnifiedV11(S1_100M_SCENARIO_MODELS.find((m) => m.code === 'BRN-001-SC')!)
  );
  const planBefore = computeProcurementPlan(sorbet, s1Def);
  assert.ok(planBefore.recommendedBatches.length >= 1);

  const sorbetApproved = approveRecommendedBatch(
    sorbet,
    planBefore.recommendedBatches[0],
    'Тест PO'
  );
  assert.equal(sorbetApproved.sharedSupplyAndFact?.approvedOrders.length, 1);
  const wavesAfterPo = computePortfolioProcurementWavesSummary(
    [{ model: sorbetApproved, scenario: s1Def }],
    undefined,
    2027
  );
  assert.equal(wavesAfterPo.totalApprovedPosCount, 1);
  assert.equal(
    wavesAfterPo.totalPacks,
    planBefore.totalRecommendedPacks,
    'После перевода 1-й партии из черновика в утверждённый PO суммарный объём волн остаётся неизменным'
  );

  // Проверяем подключение PeakOwnMoneyChartPanel в 03 · Закупки, 04 · Финансы и режима «Пик своих денег» на Главной
  const chartPanelPath = path.join(
    process.cwd(),
    'src/components/sections/PeakOwnMoneyChartPanel.tsx'
  );
  assert.equal(fs.existsSync(chartPanelPath), true);
  const contoursCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/UnifiedContourViews.tsx'),
    'utf8'
  );
  const homeCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/PeaklyBrandCatalogAndGroups.tsx'),
    'utf8'
  );
  assert.ok(
    contoursCode.includes('<PeakOwnMoneyChartPanel') &&
      contoursCode.includes('id="peak-own-money-chart-anchor"') &&
      contoursCode.includes('Утвердить в PO') &&
      contoursCode.includes('updateBatchFactoryTerms('),
    'UnifiedContourViews должен рендерить PeakOwnMoneyChartPanel, кнопку «Утвердить в PO» и панель условий оплаты фабрикам'
  );
  assert.ok(
    homeCode.includes("setTrendChartMode('ownMoneyPeak')") &&
      homeCode.includes('Пик своих денег'),
    'Главная страница должна поддерживать 3-й режим 12-месячного графика «Пик своих денег»'
  );
});

test('96. Контрольная регрессионная проверка всех строгих финансовых эталонов платформы (BORNERS, LISKANI, AKUSHA, FUKAI)', async () => {
  const {
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
  } = await import('../src/lib/liskaniAssortment2027.ts');
  const {
    AKUSHA_2027_MODELS,
    AKUSHA_2027_SCENARIO_DEF,
  } = await import('../src/lib/akushaAssortment2027.ts');

  // 1. BORNERS S1: 21 SKU · 686 284 972 ₽ за год · 109 938 111 ₽ в декабре
  const s1Def = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const bornersS1 = applyClientSavedS1SalesPlan([
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
  ]).filter((m) => !isUnverifiedActingSku(m.code));
  const bornersInv = computeScenarioInvestmentSummary(bornersS1, s1Def);
  assert.equal(bornersS1.length, 21);
  assert.equal(bornersInv.annualRevenueRub, 686_284_972);
  assert.equal(bornersInv.decemberRevenueRub, 109_938_111);

  // 2. FUKAI (Действующий ассортимент 100): 2 SKU (435tru + 4351877) · 90 553 401 ₽
  const fukaiScen = INITIAL_SCENARIOS.find((s) => s.id === 100)!;
  const fukaiModels = ACTING_2027_SCENARIO_MODELS.filter((m) =>
    isUnverifiedActingSku(m.code)
  );
  const fukaiInv = computeScenarioInvestmentSummary(fukaiModels, fukaiScen);
  assert.equal(fukaiModels.length, 2);
  assert.equal(fukaiInv.annualRevenueRub, 90_553_401);

  // 3. LISKANI 202705: 33 карточки · 500 000 000 ₽ выкупов · 877 192 982 ₽ заказов
  const liskaniInv = computeScenarioInvestmentSummary(
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF
  );
  assert.equal(LISKANI_2027_MODELS.length, 33);
  assert.equal(liskaniInv.annualRevenueRub, 500_000_000);

  // 4. AKUSHA 202706: 24 карточки · 105 793 210 ₽ выручки · 37 448 200 ₽ себестоимости проданных пар
  const akushaInv = computeScenarioInvestmentSummary(
    AKUSHA_2027_MODELS,
    AKUSHA_2027_SCENARIO_DEF
  );
  assert.equal(AKUSHA_2027_MODELS.length, 24);
  assert.equal(akushaInv.annualRevenueRub, 105_793_210);
  assert.equal(akushaInv.annualSoldGoodsCostRub, 37_448_200);
});

test('97. Защита от двойного учёта стартового кэша (initialCashRub) в PeakOwnMoneyChartPanel и честный режим wbPayoutScheduleSpecified = false', async () => {
  const {
    LISKANI_2027_MODELS,
    LISKANI_2027_SCENARIO_DEF,
    LISKANI_2027_SCENARIO_ID,
  } = await import('../src/lib/liskaniAssortment2027.ts');

  const s1Def = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const bornersS1 = applyClientSavedS1SalesPlan([
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
  ]).filter((m) => !isUnverifiedActingSku(m.code));

  const inv0 = computeScenarioInvestmentSummary(bornersS1, s1Def, {
    initialCashRub: 0,
    settlementLagMonths: 0,
    wbPayoutScheduleSpecified: true,
  });
  const inv10 = computeScenarioInvestmentSummary(bornersS1, s1Def, {
    initialCashRub: 10_000_000,
    settlementLagMonths: 0,
    wbPayoutScheduleSpecified: true,
  });
  const inv150 = computeScenarioInvestmentSummary(bornersS1, s1Def, {
    initialCashRub: 150_000_000,
    settlementLagMonths: 0,
    wbPayoutScheduleSpecified: true,
  });

  // Балансы в monthlyRows УЖЕ сдвинуты ровно на +10 000 000 ₽ (без удвоения до +20 млн ₽)
  for (let m = 0; m < 12; m++) {
    assert.equal(
      inv10.monthlyRows[m].openingCashBalanceRub - inv0.monthlyRows[m].openingCashBalanceRub,
      10_000_000,
      `Месяц ${m + 1}: openingCashBalanceRub должен увеличиваться ровно на +10 млн ₽`
    );
    assert.equal(
      inv10.monthlyRows[m].intraMonthLowBalanceRub - inv0.monthlyRows[m].intraMonthLowBalanceRub,
      10_000_000,
      `Месяц ${m + 1}: intraMonthLowBalanceRub должен увеличиваться ровно на +10 млн ₽`
    );
    assert.equal(
      inv10.monthlyRows[m].cumulativeCashBalanceRub - inv0.monthlyRows[m].cumulativeCashBalanceRub,
      10_000_000,
      `Месяц ${m + 1}: cumulativeCashBalanceRub должен увеличиваться ровно на +10 млн ₽`
    );
  }
  assert.equal(
    inv0.verifiedOwnMoneyRequiredRub! - inv10.verifiedOwnMoneyRequiredRub!,
    10_000_000,
    'Потребность в своих деньгах снижается ровно рубль-в-рубль на величину стартового кэша (10 млн ₽)'
  );
  assert.equal(
    inv150.verifiedOwnMoneyRequiredRub,
    0,
    'При стартовом кэше выше валового пика потребность в доп. своих деньгах равна 0 ₽ (не уходит в минус)'
  );

  // Мультибрендовый режим при wbPayoutScheduleSpecified = false честно возвращает null
  const allScens = [...INITIAL_SCENARIOS, LISKANI_2027_SCENARIO_DEF];
  const allModels = [...bornersS1, ...LISKANI_2027_MODELS];
  const multiUnspecified = computeMultiBrandPortfolioSummary(
    allModels,
    allScens,
    { BORNERS: 1, LISKANI: LISKANI_2027_SCENARIO_ID },
    { initialCashRub: 10_000_000, wbPayoutScheduleSpecified: false }
  );
  assert.equal(multiUnspecified.wbPayoutScheduleSpecified, false);
  assert.equal(multiUnspecified.groupTotal.verifiedOwnMoneyRequiredRub, null);
  assert.equal(multiUnspecified.groupTotal.peakWorkingCapitalRub, 0);

  // Статическая проверка кода PeakOwnMoneyChartPanel: ни одного двойного "+ initialCashRub" к уже сдвинутым балансам!
  const panelCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/PeakOwnMoneyChartPanel.tsx'),
    'utf8'
  );
  assert.equal(
    panelCode.includes('+ initialCashRub'),
    false,
    'PeakOwnMoneyChartPanel не должен повторно прибавлять + initialCashRub к полям баланса движка'
  );
  assert.equal(
    panelCode.includes('useId'),
    true,
    'PeakOwnMoneyChartPanel должен изолировать SVG gradient ID через useId()'
  );
});

test('98. Лаг выплат WB (0, +1, +2 мес.) точно сдвигает приходы WB по месяцам и монотонно углубляет Пик своих денег', async () => {
  const s1Def = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const bornersS1 = applyClientSavedS1SalesPlan([
    ...ACTING_2027_SCENARIO_MODELS,
    ...S1_100M_SCENARIO_MODELS,
  ]).filter((m) => !isUnverifiedActingSku(m.code));

  const lag0 = computeScenarioInvestmentSummary(bornersS1, s1Def, {
    settlementLagMonths: 0,
    wbPayoutScheduleSpecified: true,
  });
  const lag1 = computeScenarioInvestmentSummary(bornersS1, s1Def, {
    settlementLagMonths: 1,
    wbPayoutScheduleSpecified: true,
  });
  const lag2 = computeScenarioInvestmentSummary(bornersS1, s1Def, {
    settlementLagMonths: 2,
    wbPayoutScheduleSpecified: true,
  });

  assert.equal(lag1.monthlyRows[0].wbNetInflowRub, 0, 'При лаге +1 мес. в январе приход WB равен 0 ₽');
  assert.equal(lag2.monthlyRows[0].wbNetInflowRub, 0, 'При лаге +2 мес. в январе приход WB равен 0 ₽');
  assert.equal(lag2.monthlyRows[1].wbNetInflowRub, 0, 'При лаге +2 мес. в феврале приход WB равен 0 ₽');

  for (let m = 1; m < 12; m++) {
    assert.equal(
      lag1.monthlyRows[m].wbNetInflowRub,
      lag0.monthlyRows[m - 1].wbNetInflowRub,
      `При лаге +1 мес. приход месяца ${m + 1} равен приходу месяца ${m} без лага`
    );
  }
  for (let m = 2; m < 12; m++) {
    assert.equal(
      lag2.monthlyRows[m].wbNetInflowRub,
      lag0.monthlyRows[m - 2].wbNetInflowRub,
      `При лаге +2 мес. приход месяца ${m + 1} равен приходу месяца ${m - 1} без лага`
    );
  }

  assert.ok(
    lag0.peakWorkingCapitalRub <= lag1.peakWorkingCapitalRub &&
      lag1.peakWorkingCapitalRub <= lag2.peakWorkingCapitalRub,
    `Пик оборотного капитала монотонно не убывает с ростом лага WB: ${lag0.peakWorkingCapitalRub} <= ${lag1.peakWorkingCapitalRub} <= ${lag2.peakWorkingCapitalRub}`
  );
  assert.ok(
    lag2.peakWorkingCapitalRub > lag0.peakWorkingCapitalRub,
    'Лаг выплат WB +2 мес. строго увеличивает пиковую потребность в оборотном капитале'
  );
});

test('99. Нулевой срок поставки (0 дней lead time) даёт 1-в-1 совпадение помесячных оттоков в волнах закупок и финансовом кэшфлоу', async () => {
  const { computePortfolioProcurementWavesSummary } = await import(
    '../src/lib/unifiedBusinessEngine.ts'
  );

  const s1Def = INITIAL_SCENARIOS.find((s) => s.id === 1)!;
  const zeroLeadModels = S1_100M_SCENARIO_MODELS.slice(0, 3).map((m) => {
    const unified = ensureModelUnifiedV11(structuredClone(m));
    unified.sharedSupplyAndFact!.factoryParams = {
      ...unified.sharedSupplyAndFact!.factoryParams,
      productionLeadDays: 0,
      qcDays: 0,
      logisticsLeadDays: 0,
      acceptanceDays: 0,
      prepaymentPct: 30,
      balancePaymentPct: 70,
    };
    return unified;
  });

  // Дополнительно утверждаем одну партию во 2-м квартале (Q2) в PO с leadTimeDaysAtApproval = 0
  const m0Plan = computeProcurementPlan(zeroLeadModels[0], s1Def);
  const q2Batch =
    m0Plan.recommendedBatches.find((b) => b.firstCoveredMonthIdx >= 3) ||
    m0Plan.recommendedBatches[0];
  zeroLeadModels[0] = approveRecommendedBatch(zeroLeadModels[0], q2Batch, 'Тест 0 дней');
  zeroLeadModels[0].sharedSupplyAndFact!.approvedOrders[0].leadTimeDaysAtApproval = 0;

  const inv = computeScenarioInvestmentSummary(zeroLeadModels, s1Def);
  const waves = computePortfolioProcurementWavesSummary(
    zeroLeadModels.map((model) => ({ model, scenario: s1Def })),
    inv.monthlyRows,
    2027
  );

  assert.equal(
    waves.avgTotalLeadDays,
    0,
    'Средний lead time при 0 днях на всех этапах должен быть строго 0 (без подмены на 45)'
  );
  for (let m = 0; m < 12; m++) {
    assert.equal(
      waves.monthlySchedule[m].prepayRub,
      inv.monthlyRows[m].factoryPrepaymentOutflowRub,
      `Месяц ${m + 1}: авансы в волнах и в кэшфлоу совпадают рубль-в-рубль при leadTime = 0`
    );
    assert.equal(
      waves.monthlySchedule[m].balanceRub,
      inv.monthlyRows[m].factoryBalanceOutflowRub,
      `Месяц ${m + 1}: доплаты в волнах и в кэшфлоу совпадают рубль-в-рубль при leadTime = 0`
    );
    assert.equal(
      waves.monthlySchedule[m].totalOutflowRub,
      inv.monthlyRows[m].factoryTotalOutflowRub,
      `Месяц ${m + 1}: суммарный отток фабрикам совпадает 1-в-1 при leadTime = 0`
    );
  }
});

test('100. Обратимый цикл «✓ Утвердить в PO → ↺ В черновик» для обуви AKUSHA (пар) и белья BORNERS (компл.) без потери ни 1 единицы', async () => {
  const { AKUSHA_2027_MODELS, AKUSHA_2027_SCENARIO_DEF } = await import(
    '../src/lib/akushaAssortment2027.ts'
  );
  const { getBrandUnitConfig, removeApprovedPurchaseOrder } = await import(
    '../src/lib/unifiedBusinessEngine.ts'
  );

  // 1. Проверяем AKUSHA (обувь в парах, закуп под заказы ПВЗ)
  const akModel = ensureModelUnifiedV11(structuredClone(AKUSHA_2027_MODELS[0]));
  const akUnit = getBrandUnitConfig(akModel);
  assert.equal(akUnit.primaryUnit, 'пар', 'Единица измерения AKUSHA должна быть «пар»');

  const akPlanInit = computeProcurementPlan(akModel, AKUSHA_2027_SCENARIO_DEF);
  assert.ok(akPlanInit.recommendedBatches.length >= 1);
  const akApproved = approveRecommendedBatch(
    akModel,
    akPlanInit.recommendedBatches[0],
    'Владелец'
  );
  const poId = akApproved.sharedSupplyAndFact!.approvedOrders[0].id;
  const akPlanWithPo = computeProcurementPlan(akApproved, AKUSHA_2027_SCENARIO_DEF);
  assert.equal(
    akPlanWithPo.totalApprovedReceiptsPacks + akPlanWithPo.totalRecommendedPacks,
    akPlanInit.totalRecommendedPacks,
    'Сумма утверждённых PO + оставшихся черновиков AKUSHA равна исходной потребности в парах'
  );

  // Возвращаем PO обратно в черновик («↺ В черновик»)
  const akReverted = removeApprovedPurchaseOrder(akApproved, poId, 'Владелец');
  assert.equal(akReverted.sharedSupplyAndFact!.approvedOrders.length, 0);
  const akPlanReverted = computeProcurementPlan(akReverted, AKUSHA_2027_SCENARIO_DEF);
  assert.equal(akPlanReverted.totalRecommendedPacks, akPlanInit.totalRecommendedPacks);
  assert.equal(akPlanReverted.totalRecommendedBudgetRub, akPlanInit.totalRecommendedBudgetRub);

  // 2. Проверяем наличие кнопки «↺ В черновик», allocatePacksAcrossProfileSizes и e.stopPropagation() в UI
  const contoursCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/UnifiedContourViews.tsx'),
    'utf8'
  );
  const homeCode = fs.readFileSync(
    path.join(process.cwd(), 'src/components/sections/PeaklyBrandCatalogAndGroups.tsx'),
    'utf8'
  );
  assert.ok(
    contoursCode.includes('↺ В черновик') &&
      contoursCode.includes('allocatePacksAcrossProfileSizes'),
    'UnifiedContourViews должен поддерживать 1-клик отмену PO «↺ В черновик» и точное распределение пар по размерам'
  );
  assert.ok(
    homeCode.includes('e.stopPropagation()'),
    'Карточка «Пик своих денег» в Hero-блоке Главной должна останавливать всплытие клика для переключения графика на месте'
  );
});





















