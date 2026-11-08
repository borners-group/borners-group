import {
  type GrowthScenarioDef,
  type ScenarioModelSpec,
  computeModelScenarioMetrics,
} from './scenarioData.ts';
import { getActingSkuByWbOrVendor } from './actingAssortment2027.ts';
import {
  type CanonicalBrandCode,
  computeProcurementPlan,
  detectModelBrandPortfolioLabel,
  getBrandUnitConfig,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
} from './unifiedBusinessEngine.ts';
import { safeGetStorageJson, safeSetStorageJson } from './safeStorage.ts';

export const STORAGE_KEY_PRODUCT_GROUPS = 'borners_product_groups_v1';

export interface ProductGroupDef {
  id: string;
  title: string;
  subtitle?: string;
  brandCode: CanonicalBrandCode | 'ALL';
  cabinetLabel: string;
  modelIds: string[];
  modelCodes: string[];
  isSystemDefault?: boolean;
  createdAt: string;
}

export interface ProductGroupComputedMetrics {
  group: ProductGroupDef;
  models: ScenarioModelSpec[];
  modelsCount: number;
  decRevenueRub: number;
  annualRevenueRub: number;
  decPacks: number;
  annualPacks: number;
  procurementPacks: number;
  procurementUnits: number;
  procurementBudgetRub: number;
  firstWaveStartRub: number;
  firstWavePrepayRub: number;
  avgMarginPct: number;
  totalBatchesCount: number;
  approvedPosCount: number;
  earliestOrderDateIso: string | null;
  primaryUnit: string;
}

export function buildDefaultProductGroups(
  models: ScenarioModelSpec[]
): ProductGroupDef[] {
  const activeModels = models.filter((m) => m.launchStatus !== 'В архиве');

  const wbActingBorners = activeModels.filter((m) => {
    const act = getActingSkuByWbOrVendor(m.code, m.title);
    return Boolean(act) && matchesBrandFilter(m, 'BORNERS');
  });

  const newBoxersBorners = activeModels.filter((m) => {
    const act = getActingSkuByWbOrVendor(m.code, m.title);
    const isSemeyniki =
      m.title.toLowerCase().includes('семейник') ||
      m.subtitle.toLowerCase().includes('семейник') ||
      m.unitsInPack === 2;
    return !act && matchesBrandFilter(m, 'BORNERS') && !isSemeyniki;
  });

  const semeynikiBorners = activeModels.filter((m) => {
    const act = getActingSkuByWbOrVendor(m.code, m.title);
    const isSemeyniki =
      m.title.toLowerCase().includes('семейник') ||
      m.subtitle.toLowerCase().includes('семейник') ||
      m.unitsInPack === 2;
    return !act && matchesBrandFilter(m, 'BORNERS') && isSemeyniki;
  });

  const naTeleModels = activeModels.filter((m) =>
    matchesBrandFilter(m, 'NA_TELE')
  );

  const fukaiModels = activeModels.filter((m) =>
    matchesBrandFilter(m, 'FUKAI')
  );

  const akushaModels = activeModels.filter((m) =>
    matchesBrandFilter(m, 'AKUSHA')
  );

  const liscaniModels = activeModels.filter((m) =>
    matchesBrandFilter(m, 'LISKANI')
  );

  const groups: ProductGroupDef[] = [
    {
      id: 'grp-borners-wb-base',
      title: 'Действующий ассортимент WB · База BORNERS',
      subtitle: 'Подтверждённые артикулы ИП Нерсесянц с историей продаж WB',
      brandCode: 'BORNERS',
      cabinetLabel: 'BORNERS · WB',
      modelIds: wbActingBorners.map((m) => m.id),
      modelCodes: wbActingBorners.map((m) => m.code),
      isSystemDefault: true,
      createdAt: '2026-11-08',
    },
    {
      id: 'grp-borners-boxers-4pack',
      title: 'Мужские боксеры 4-pack · Новая коллекция',
      subtitle: 'Ключевые цветовые сеты BORNERS для масштабирования 2027–2028',
      brandCode: 'BORNERS',
      cabinetLabel: 'BORNERS · WB',
      modelIds: newBoxersBorners.map((m) => m.id),
      modelCodes: newBoxersBorners.map((m) => m.code),
      isSystemDefault: true,
      createdAt: '2026-11-08',
    },
    {
      id: 'grp-borners-semeyniki-2pack',
      title: 'Семейники свободного кроя 2-pack',
      subtitle: 'Тканые семейные боксеры из 100% хлопка (Клетка / Оксфорд)',
      brandCode: 'BORNERS',
      cabinetLabel: 'BORNERS · WB',
      modelIds: semeynikiBorners.map((m) => m.id),
      modelCodes: semeynikiBorners.map((m) => m.code),
      isSystemDefault: true,
      createdAt: '2026-11-08',
    },
    {
      id: 'grp-natele-womens-base',
      title: 'Женская и базовая линейка НА ТЕЛЕ',
      subtitle: 'Женские комплекты, топы, велосипедки и лонгсливы второго бренда',
      brandCode: 'NA_TELE',
      cabinetLabel: 'НА ТЕЛЕ · WB',
      modelIds: naTeleModels.map((m) => m.id),
      modelCodes: naTeleModels.map((m) => m.code),
      isSystemDefault: true,
      createdAt: '2026-11-08',
    },
    {
      id: 'grp-fukai-wb',
      title: 'Боксеры и трикотаж FUKAI',
      subtitle: 'Выделенные артикулы бренда FUKAI на Wildberries',
      brandCode: 'FUKAI',
      cabinetLabel: 'FUKAI · WB',
      modelIds: fukaiModels.map((m) => m.id),
      modelCodes: fukaiModels.map((m) => m.code),
      isSystemDefault: true,
      createdAt: '2026-11-08',
    },
    {
      id: 'grp-akusha-shoes',
      title: 'Обувная коллекция AKUSHA',
      subtitle: 'Основная линейка обуви бренда AKUSHA (учёт в парах)',
      brandCode: 'AKUSHA',
      cabinetLabel: 'AKUSHA · WB',
      modelIds: akushaModels.map((m) => m.id),
      modelCodes: akushaModels.map((m) => m.code),
      isSystemDefault: true,
      createdAt: '2026-11-08',
    },
    {
      id: 'grp-liscani-curtains',
      title: 'Шторы и текстиль LISKANI',
      subtitle: 'Портьеры, блэкаут и тюль LISKANI (комплекты штор и метраж ткани)',
      brandCode: 'LISKANI',
      cabinetLabel: 'LISKANI · WB',
      modelIds: liscaniModels.map((m) => m.id),
      modelCodes: liscaniModels.map((m) => m.code),
      isSystemDefault: true,
      createdAt: '2026-11-08',
    },
  ];

  return groups;
}

export function loadProductGroups(models: ScenarioModelSpec[]): ProductGroupDef[] {
  const defaults = buildDefaultProductGroups(models);
  const stored = safeGetStorageJson<ProductGroupDef[]>(STORAGE_KEY_PRODUCT_GROUPS);
  if (!Array.isArray(stored) || stored.length === 0) {
    return defaults;
  }

  // Находим все модели, которые уже распределены хотя бы в одну сохранённую группу
  const assignedIds = new Set<string>();
  const assignedCodes = new Set<string>();
  for (const g of stored) {
    for (const id of g.modelIds || []) assignedIds.add(id);
    for (const code of g.modelCodes || []) assignedCodes.add(code.toUpperCase());
  }

  // Синхронизируем новые созданные карточки товаров в системные дефолтные группы соответствующего бренда
  const merged = stored.map((g) => {
    if (!g.isSystemDefault) return g;
    const defMatch = defaults.find((d) => d.id === g.id);
    if (!defMatch) return g;

    const nextIds = [...(g.modelIds || [])];
    const nextCodes = [...(g.modelCodes || [])];
    for (let i = 0; i < defMatch.modelIds.length; i++) {
      const mId = defMatch.modelIds[i];
      const mCode = defMatch.modelCodes[i];
      if (!assignedIds.has(mId) && (!mCode || !assignedCodes.has(mCode.toUpperCase()))) {
        nextIds.push(mId);
        if (mCode) nextCodes.push(mCode);
        assignedIds.add(mId);
        if (mCode) assignedCodes.add(mCode.toUpperCase());
      }
    }
    return {
      ...g,
      modelIds: nextIds,
      modelCodes: nextCodes,
    };
  });

  // Если для какого-то бренда появились карточки, а его дефолтной группы ещё не было в stored — добавляем её
  for (const defGrp of defaults) {
    const exists = merged.some((g) => g.id === defGrp.id);
    if (!exists && defGrp.modelIds.length > 0) {
      merged.push(defGrp);
    }
  }

  return merged;
}

export function saveProductGroups(groups: ProductGroupDef[]): void {
  safeSetStorageJson(STORAGE_KEY_PRODUCT_GROUPS, groups);
  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('borners-product-groups-changed'));
    }, 0);
  }
}

export function resolveGroupModels(
  group: ProductGroupDef,
  allModels: ScenarioModelSpec[]
): ScenarioModelSpec[] {
  const idSet = new Set(group.modelIds);
  const codeSet = new Set(group.modelCodes.map((c) => c.toUpperCase()));
  return allModels.filter(
    (m) =>
      m.launchStatus !== 'В архиве' &&
      (idSet.has(m.id) || codeSet.has(m.code.toUpperCase()))
  );
}

export function computeProductGroupMetrics(
  group: ProductGroupDef,
  allModels: ScenarioModelSpec[],
  scenario: GrowthScenarioDef
): ProductGroupComputedMetrics {
  const models = resolveGroupModels(group, allModels);
  const unitCfg = getBrandUnitConfig(
    group.brandCode === 'ALL' ? 'BORNERS' : group.brandCode
  );

  let decRevenueRub = 0;
  let annualRevenueRub = 0;
  let decPacks = 0;
  let annualPacks = 0;
  let procurementPacks = 0;
  let procurementUnits = 0;
  let procurementBudgetRub = 0;
  let firstWaveStartRub = 0;
  let firstWavePrepayRub = 0;
  let weightedMarginSum = 0;
  let totalBatchesCount = 0;
  let approvedPosCount = 0;
  let earliestOrderDateIso: string | null = null;

  for (const m of models) {
    const met = computeModelScenarioMetrics(m, scenario);
    const proc = computeProcurementPlan(m, scenario);

    decRevenueRub += met.targetMonthRevenueRub;
    annualRevenueRub += met.annualRevenueRub;
    decPacks += met.targetMonthPacks;
    annualPacks += met.annualPacks;

    const confirmedPos = proc.approvedOrders.filter(
      (o) => o.confirmedByFactory !== false
    );
    const approvedRub = confirmedPos.reduce((s, o) => s + o.totalOrderRub, 0);
    const modelProcPacks =
      proc.totalApprovedReceiptsPacks + proc.totalRecommendedPacks;
    const modelProcUnits =
      proc.totalApprovedReceiptsUnits + proc.totalRecommendedUnits;
    const modelProcRub = approvedRub + (proc.totalRecommendedBudgetRub || 0);

    procurementPacks += modelProcPacks;
    procurementUnits += modelProcUnits;
    procurementBudgetRub += modelProcRub;

    totalBatchesCount += confirmedPos.length + proc.recommendedBatches.length;
    approvedPosCount += confirmedPos.length;

    const firstDraft = proc.recommendedBatches[0];
    const earliestPo = [...confirmedPos].sort(
      (a, b) => a.arrivalMonthIdx - b.arrivalMonthIdx
    )[0];

    if (earliestPo) {
      const prepayPct = m.sharedSupplyAndFact?.factoryParams.prepaymentPct ?? 30;
      firstWaveStartRub += earliestPo.totalOrderRub;
      firstWavePrepayRub += Math.round(
        (earliestPo.totalOrderRub * prepayPct) / 100
      );
      if (
        earliestPo.orderPlacementDateIso &&
        (!earliestOrderDateIso ||
          earliestPo.orderPlacementDateIso < earliestOrderDateIso)
      ) {
        earliestOrderDateIso = earliestPo.orderPlacementDateIso;
      }
    } else if (firstDraft) {
      firstWaveStartRub += firstDraft.estimatedTotalRub;
      firstWavePrepayRub += firstDraft.prepaymentRub;
      if (
        firstDraft.recommendedOrderDateIso &&
        (!earliestOrderDateIso ||
          firstDraft.recommendedOrderDateIso < earliestOrderDateIso)
      ) {
        earliestOrderDateIso = firstDraft.recommendedOrderDateIso;
      }
    }

    weightedMarginSum += met.unitMarginPct * Math.max(1, met.annualRevenueRub);
  }

  const totalRevWeight = models.reduce(
    (s, m) =>
      s + Math.max(1, computeModelScenarioMetrics(m, scenario).annualRevenueRub),
    0
  );
  const avgMarginPct =
    models.length > 0 && totalRevWeight > 0
      ? Math.round((weightedMarginSum / totalRevWeight) * 10) / 10
      : 0;

  return {
    group,
    models,
    modelsCount: models.length,
    decRevenueRub,
    annualRevenueRub,
    decPacks,
    annualPacks,
    procurementPacks,
    procurementUnits,
    procurementBudgetRub,
    firstWaveStartRub,
    firstWavePrepayRub,
    avgMarginPct,
    totalBatchesCount,
    approvedPosCount,
    earliestOrderDateIso,
    primaryUnit: unitCfg.primaryUnit,
  };
}

export interface BrandCatalogSectionSummary {
  brandCode: CanonicalBrandCode;
  displayCode: 'BORNERS' | 'FUKAI' | 'AKUSHA' | 'LISKANI' | 'НА ТЕЛЕ';
  brandTitle: string;
  cabinetLabel: string;
  categoryLabel: string;
  primaryUnit: string;
  secondaryUnit: string;
  activeScenario: GrowthScenarioDef;
  models: ScenarioModelSpec[];
  decRevenueRub: number;
  annualRevenueRub: number;
  annualPacks: number;
  procurementPacks: number;
  procurementBudgetRub: number;
  firstWaveStartRub: number;
  firstWavePrepayRub: number;
  totalBatchesCount: number;
  earliestOrderDateIso: string | null;
}

export const ALL_CANONICAL_BRANDS: CanonicalBrandCode[] = [
  'BORNERS',
  'NA_TELE',
  'FUKAI',
  'AKUSHA',
  'LISKANI',
];

export function buildBrandCatalogSections(
  models: ScenarioModelSpec[],
  scenarioByBrand: Partial<Record<CanonicalBrandCode, GrowthScenarioDef>>,
  fallbackScenario: GrowthScenarioDef
): BrandCatalogSectionSummary[] {
  const activeModels = models.filter((m) => m.launchStatus !== 'В архиве');

  return ALL_CANONICAL_BRANDS.map((brandCode) => {
    const cfg = getBrandUnitConfig(brandCode);
    const brandModels = activeModels.filter((m) =>
      matchesBrandFilter(m, brandCode)
    );
    const activeScen = scenarioByBrand[brandCode] || fallbackScenario;

    let decRevenueRub = 0;
    let annualRevenueRub = 0;
    let annualPacks = 0;
    let procurementPacks = 0;
    let procurementBudgetRub = 0;
    let firstWaveStartRub = 0;
    let firstWavePrepayRub = 0;
    let totalBatchesCount = 0;
    let earliestOrderDateIso: string | null = null;

    for (const m of brandModels) {
      const met = computeModelScenarioMetrics(m, activeScen);
      const proc = computeProcurementPlan(m, activeScen);
      decRevenueRub += met.targetMonthRevenueRub;
      annualRevenueRub += met.annualRevenueRub;
      annualPacks += met.annualPacks;

      const confirmedPos = proc.approvedOrders.filter(
        (o) => o.confirmedByFactory !== false
      );
      const approvedRub = confirmedPos.reduce((s, o) => s + o.totalOrderRub, 0);
      procurementPacks +=
        proc.totalApprovedReceiptsPacks + proc.totalRecommendedPacks;
      procurementBudgetRub +=
        approvedRub + (proc.totalRecommendedBudgetRub || 0);
      totalBatchesCount +=
        confirmedPos.length + proc.recommendedBatches.length;

      const firstDraft = proc.recommendedBatches[0];
      const earliestPo = [...confirmedPos].sort(
        (a, b) => a.arrivalMonthIdx - b.arrivalMonthIdx
      )[0];
      if (earliestPo) {
        const prepayPct =
          m.sharedSupplyAndFact?.factoryParams.prepaymentPct ?? 30;
        firstWaveStartRub += earliestPo.totalOrderRub;
        firstWavePrepayRub += Math.round(
          (earliestPo.totalOrderRub * prepayPct) / 100
        );
        if (
          earliestPo.orderPlacementDateIso &&
          (!earliestOrderDateIso ||
            earliestPo.orderPlacementDateIso < earliestOrderDateIso)
        ) {
          earliestOrderDateIso = earliestPo.orderPlacementDateIso;
        }
      } else if (firstDraft) {
        firstWaveStartRub += firstDraft.estimatedTotalRub;
        firstWavePrepayRub += firstDraft.prepaymentRub;
        if (
          firstDraft.recommendedOrderDateIso &&
          (!earliestOrderDateIso ||
            firstDraft.recommendedOrderDateIso < earliestOrderDateIso)
        ) {
          earliestOrderDateIso = firstDraft.recommendedOrderDateIso;
        }
      }
    }

    return {
      brandCode,
      displayCode: cfg.displayCode,
      brandTitle: cfg.displayTitle,
      cabinetLabel: `${cfg.displayCode} · WB`,
      categoryLabel: cfg.categoryDefault,
      primaryUnit: cfg.primaryUnit,
      secondaryUnit: cfg.secondaryUnit,
      activeScenario: activeScen,
      models: brandModels,
      decRevenueRub,
      annualRevenueRub,
      annualPacks,
      procurementPacks,
      procurementBudgetRub,
      firstWaveStartRub,
      firstWavePrepayRub,
      totalBatchesCount,
      earliestOrderDateIso,
    };
  });
}

export function getModelBrandAccentStyles(brandInput?: string): {
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  folderBg: string;
  folderIconText: string;
  accentBar: string;
} {
  const code = normalizePortfolioBrandCode(brandInput);
  switch (code) {
    case 'BORNERS':
      return {
        badgeBg: 'bg-[#EEF2FA]',
        badgeText: 'text-[#1E3A8A]',
        badgeBorder: 'border-[#C7D5F2]',
        folderBg: 'bg-[#F2F5FC] border-[#D3DEF5]',
        folderIconText: 'text-[#1E40AF]',
        accentBar: 'bg-[#2B4C9B]',
      };
    case 'NA_TELE':
      return {
        badgeBg: 'bg-[#F5EFEA]',
        badgeText: 'text-[#6D452A]',
        badgeBorder: 'border-[#DFCBB9]',
        folderBg: 'bg-[#F8F3EE] border-[#E4D4C5]',
        folderIconText: 'text-[#7A4B2A]',
        accentBar: 'bg-[#8C5836]',
      };
    case 'FUKAI':
      return {
        badgeBg: 'bg-[#EEF5F9]',
        badgeText: 'text-[#1E4E68]',
        badgeBorder: 'border-[#C6DCE8]',
        folderBg: 'bg-[#F2F7FA] border-[#CFE1EC]',
        folderIconText: 'text-[#1E4E68]',
        accentBar: 'bg-[#256385]',
      };
    case 'AKUSHA':
      return {
        badgeBg: 'bg-[#FBF3E8]',
        badgeText: 'text-[#854D0E]',
        badgeBorder: 'border-[#E8D2B0]',
        folderBg: 'bg-[#FCF6EE] border-[#EAD8BC]',
        folderIconText: 'text-[#9A5B13]',
        accentBar: 'bg-[#B46914]',
      };
    case 'LISKANI':
      return {
        badgeBg: 'bg-[#ECF6F1]',
        badgeText: 'text-[#145A38]',
        badgeBorder: 'border-[#BCE3CF]',
        folderBg: 'bg-[#F0F9F4] border-[#C6E7D6]',
        folderIconText: 'text-[#157347]',
        accentBar: 'bg-[#157347]',
      };
    default:
      return {
        badgeBg: 'bg-[#F4F3EE]',
        badgeText: 'text-[#141413]',
        badgeBorder: 'border-[#D8D7CE]',
        folderBg: 'bg-[#FAF9F6] border-[#E2E1D9]',
        folderIconText: 'text-[#52514C]',
        accentBar: 'bg-[#52514C]',
      };
  }
}
