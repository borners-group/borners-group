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
export const STORAGE_KEY_DELETED_PRODUCT_GROUP_IDS =
  'borners_deleted_product_group_ids_v1';

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
  const hasOfficialAkusha2027 = akushaModels.some((m) =>
    Boolean(m.plansByScenario?.[202706])
  );
  const akushaWinterBoots = akushaModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('зимние ботинки')
  );
  const akushaSuedeSneakers = akushaModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('замшевые кеды')
  );
  const akushaLeatherSneakers = akushaModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('кроссовки из кожи')
  );
  const akushaSuedeLoafers = akushaModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('замшевые лоферы')
  );
  const akushaTopsiders = akushaModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('топсайдеры')
  );
  const akushaFeltItaly = akushaModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('войлок италия')
  );
  const akushaPremiumSneakers = akushaModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('премиальные кроссовки')
  );
  const akushaTomoriMule = akushaModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('tomori walk mule')
  );
  const akushaMoccasins = akushaModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('дыхабельные мокасины')
  );

  const liscaniModels = activeModels.filter((m) =>
    matchesBrandFilter(m, 'LISKANI')
  );
  const liskaniBlackout = liscaniModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('блэкаут')
  );
  const liskaniMramor = liscaniModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('мрамор')
  );
  const liskaniRogozhka = liscaniModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('рогожк')
  );
  const liskaniTyul = liscaniModels.filter((m) =>
    (m.categoryLabel || m.title).toLowerCase().includes('тюль')
  );
  const hasOfficialLiskaniFabrics = liscaniModels.some(
    (m) => Array.isArray(m.liskaniSizeVariants) && m.liskaniSizeVariants.length > 0
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
      title: hasOfficialAkusha2027
        ? 'Обувная коллекция AKUSHA · Полный план 2027 (31 модель · 24 карточки · 9 групп)'
        : 'Обувная коллекция AKUSHA',
      subtitle: hasOfficialAkusha2027
        ? 'Все 9 товарных групп AKUSHA: 20 377 выкупленных пар · 47 808 заказов · 105,79 млн ₽ плановой выручки'
        : 'Основная линейка обуви бренда AKUSHA (учёт в парах)',
      brandCode: 'AKUSHA',
      cabinetLabel: 'AKUSHA · WB',
      modelIds: akushaModels.map((m) => m.id),
      modelCodes: akushaModels.map((m) => m.code),
      isSystemDefault: true,
      createdAt: '2026-11-08',
    },
    ...(hasOfficialAkusha2027
      ? ([
          {
            id: 'grp-akusha-winter-boots',
            title: 'Зимние ботинки AKUSHA (№01–04 · 4 модели)',
            subtitle:
              'Цена 7 500 ₽ · Себестоимость 2 800 ₽ · Выкуп 50% · План 2027: 4 557 выкупленных пар (9 114 заказов · 34,18 млн ₽)',
            brandCode: 'AKUSHA',
            cabinetLabel: 'AKUSHA · WB',
            modelIds: akushaWinterBoots.map((m) => m.id),
            modelCodes: akushaWinterBoots.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-10',
          },
          {
            id: 'grp-akusha-suede-sneakers',
            title: 'Замшевые кеды AKUSHA (№05–06 · 2 цвета)',
            subtitle:
              'Цена 5 990 ₽ · Себестоимость 2 200 ₽ · Выкуп 35% · План 2027: 1 985 выкупленных пар (5 678 заказов · 11,89 млн ₽)',
            brandCode: 'AKUSHA',
            cabinetLabel: 'AKUSHA · WB',
            modelIds: akushaSuedeSneakers.map((m) => m.id),
            modelCodes: akushaSuedeSneakers.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-10',
          },
          {
            id: 'grp-akusha-leather-sneakers',
            title: 'Кроссовки из кожи AKUSHA (№07–08 · 2 модели)',
            subtitle:
              'Цена 5 990 ₽ · Себестоимость 2 200 ₽ · Выкуп 35% · План 2027: 2 175 выкупленных пар (6 222 заказа · 13,03 млн ₽)',
            brandCode: 'AKUSHA',
            cabinetLabel: 'AKUSHA · WB',
            modelIds: akushaLeatherSneakers.map((m) => m.id),
            modelCodes: akushaLeatherSneakers.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-10',
          },
          {
            id: 'grp-akusha-suede-loafers',
            title: 'Замшевые лоферы AKUSHA · 8 цветов (№09–16 · Общая карточка)',
            subtitle:
              'Цена 5 990 ₽ · Себестоимость 1 900 ₽ · Выкуп 33% · План 2027: 4 920 выкупленных пар (14 915 заказов · 29,47 млн ₽)',
            brandCode: 'AKUSHA',
            cabinetLabel: 'AKUSHA · WB',
            modelIds: akushaSuedeLoafers.map((m) => m.id),
            modelCodes: akushaSuedeLoafers.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-10',
          },
          {
            id: 'grp-akusha-topsiders',
            title: 'Топсайдеры AKUSHA (№17–20 · 4 модели)',
            subtitle:
              'Выкуп 40% · План 2027: 2 668 выкупленных пар (6 681 заказ · цену и себестоимость уточнить)',
            brandCode: 'AKUSHA',
            cabinetLabel: 'AKUSHA · WB',
            modelIds: akushaTopsiders.map((m) => m.id),
            modelCodes: akushaTopsiders.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-10',
          },
          {
            id: 'grp-akusha-felt-italy',
            title: 'Войлок Италия AKUSHA (№21–22 · 2 модели)',
            subtitle:
              'Цена 6 990 ₽ · Себестоимость 2 400 ₽ · Выкуп 45% · План 2027: 1 294 выкупленные пары (2 886 заказов · 9,05 млн ₽)',
            brandCode: 'AKUSHA',
            cabinetLabel: 'AKUSHA · WB',
            modelIds: akushaFeltItaly.map((m) => m.id),
            modelCodes: akushaFeltItaly.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-10',
          },
          {
            id: 'grp-akusha-premium-sneakers',
            title: 'Премиальные кроссовки AKUSHA (№23 · 1 модель · 3 фото ракурса)',
            subtitle:
              'Цена 9 900 ₽ · Себестоимость 3 500 ₽ · Выкуп 50% · План 2027: 418 выкупленных пар (836 заказов · 4,14 млн ₽)',
            brandCode: 'AKUSHA',
            cabinetLabel: 'AKUSHA · WB',
            modelIds: akushaPremiumSneakers.map((m) => m.id),
            modelCodes: akushaPremiumSneakers.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-10',
          },
          {
            id: 'grp-akusha-tomori-mule',
            title: 'Tomori Walk Mule AKUSHA (№24–27 · 4 цвета)',
            subtitle:
              'Цена 5 990 ₽ · Себестоимость 2 400 ₽ · Выкуп 46% · План 2027: 675 выкупленных пар (1 476 заказов · 4,04 млн ₽)',
            brandCode: 'AKUSHA',
            cabinetLabel: 'AKUSHA · WB',
            modelIds: akushaTomoriMule.map((m) => m.id),
            modelCodes: akushaTomoriMule.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-10',
          },
          {
            id: 'grp-akusha-moccasins',
            title: 'Дыхабельные мокасины AKUSHA (№28–31 · 4 цвета)',
            subtitle:
              'План 2027: 1 685 выкупленных пар (цену, себестоимость и % выкупа уточнить)',
            brandCode: 'AKUSHA',
            cabinetLabel: 'AKUSHA · WB',
            modelIds: akushaMoccasins.map((m) => m.id),
            modelCodes: akushaMoccasins.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-10',
          },
        ] as ProductGroupDef[])
      : []),
    {
      id: 'grp-liscani-curtains',
      title: hasOfficialLiskaniFabrics
        ? 'Шторы и текстиль LISKANI · Полная матрица (33 цвета · 269 SKU)'
        : 'Шторы и текстиль LISKANI',
      subtitle: hasOfficialLiskaniFabrics
        ? 'Все 4 линейки тканей: Блэкаут (350 млн ₽), Мрамор (75 млн ₽), Рогожка (60 млн ₽), Тюль Вуаль (15 млн ₽) — план 500 млн ₽ выкупов'
        : 'Портьеры, блэкаут и тюль LISKANI (комплекты штор и метраж ткани)',
      brandCode: 'LISKANI',
      cabinetLabel: 'LISKANI · WB',
      modelIds: liscaniModels.map((m) => m.id),
      modelCodes: liscaniModels.map((m) => m.code),
      isSystemDefault: true,
      createdAt: '2026-11-08',
    },
    ...(hasOfficialLiskaniFabrics
      ? ([
          {
            id: 'grp-liskani-blackout',
            title: 'Портьеры Блэкаут LISKANI (13 цветов · 104 SKU)',
            subtitle:
              'Светонепроницаемые шторы Блэкаут 300×240..400×270 · План 2027: 350,00 млн ₽ выкупов (614,04 млн ₽ заказов)',
            brandCode: 'LISKANI',
            cabinetLabel: 'LISKANI · WB',
            modelIds: liskaniBlackout.map((m) => m.id),
            modelCodes: liskaniBlackout.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-09',
          },
          {
            id: 'grp-liskani-mramor',
            title: 'Портьеры Мрамор LISKANI (10 цветов · 80 SKU)',
            subtitle:
              'Фактурные шторы Софт-Мрамор 300×240..400×270 · План 2027: 75,00 млн ₽ выкупов (131,58 млн ₽ заказов)',
            brandCode: 'LISKANI',
            cabinetLabel: 'LISKANI · WB',
            modelIds: liskaniMramor.map((m) => m.id),
            modelCodes: liskaniMramor.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-09',
          },
          {
            id: 'grp-liskani-rogozhka',
            title: 'Портьеры Рогожка LISKANI (5 цветов · 40 SKU)',
            subtitle:
              'Интерьерные шторы Рогожка 300×240..400×270 · План 2027: 60,00 млн ₽ выкупов (105,26 млн ₽ заказов)',
            brandCode: 'LISKANI',
            cabinetLabel: 'LISKANI · WB',
            modelIds: liskaniRogozhka.map((m) => m.id),
            modelCodes: liskaniRogozhka.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-09',
          },
          {
            id: 'grp-liskani-tyul',
            title: 'Тюль Вуаль LISKANI (5 цветов · 45 SKU)',
            subtitle:
              'Воздушная вуаль с утяжелителем 400×250..600×270 · План 2027: 15,00 млн ₽ выкупов (26,32 млн ₽ заказов)',
            brandCode: 'LISKANI',
            cabinetLabel: 'LISKANI · WB',
            modelIds: liskaniTyul.map((m) => m.id),
            modelCodes: liskaniTyul.map((m) => m.code),
            isSystemDefault: true,
            createdAt: '2026-11-09',
          },
        ] as ProductGroupDef[])
      : []),
  ];

  return groups;
}

export function loadProductGroups(models: ScenarioModelSpec[]): ProductGroupDef[] {
  const defaults = buildDefaultProductGroups(models);
  const deletedGroupIds = new Set(
    safeGetStorageJson<string[]>(STORAGE_KEY_DELETED_PRODUCT_GROUP_IDS) || []
  );
  const stored = safeGetStorageJson<ProductGroupDef[]>(STORAGE_KEY_PRODUCT_GROUPS);
  if (!Array.isArray(stored) || stored.length === 0) {
    return defaults.filter((g) => !deletedGroupIds.has(g.id));
  }

  // Находим все модели, которые уже распределены хотя бы в одну сохранённую группу
  const assignedIds = new Set<string>();
  const assignedCodes = new Set<string>();
  for (const g of stored) {
    for (const id of g.modelIds || []) assignedIds.add(id);
    for (const code of g.modelCodes || []) assignedCodes.add(code.toUpperCase());
  }

  // Синхронизируем новые созданные карточки товаров в системные дефолтные группы соответствующего бренда
  const merged = stored
    .filter((g) => !deletedGroupIds.has(g.id))
    .map((g) => {
      if (!g.isSystemDefault) return g;
      const defMatch = defaults.find((d) => d.id === g.id);
      if (!defMatch) return g;

      const nextIds = [...(g.modelIds || [])];
      const nextCodes = [...(g.modelCodes || [])];
      for (let i = 0; i < defMatch.modelIds.length; i++) {
        const mId = defMatch.modelIds[i];
        const mCode = defMatch.modelCodes[i];
        const alreadyInGroup =
          nextIds.includes(mId) ||
          (Boolean(mCode) &&
            nextCodes.some((c) => c.toUpperCase() === mCode.toUpperCase()));
        if (!alreadyInGroup) {
          nextIds.push(mId);
          if (mCode) nextCodes.push(mCode);
          assignedIds.add(mId);
          if (mCode) assignedCodes.add(mCode.toUpperCase());
        }
      }
      return {
        ...g,
        title: defMatch.title || g.title,
        subtitle: defMatch.subtitle || g.subtitle,
        modelIds: nextIds,
        modelCodes: nextCodes,
      };
    });

  // Если для какого-то бренда появились карточки, а его дефолтной группы ещё не было в stored (и пользователь не удалял её вручную) — добавляем её
  for (const defGrp of defaults) {
    if (deletedGroupIds.has(defGrp.id)) continue;
    const exists = merged.some((g) => g.id === defGrp.id);
    if (!exists && defGrp.modelIds.length > 0) {
      merged.push(defGrp);
    }
  }

  return merged;
}

export function deleteProductGroup(
  currentGroups: ProductGroupDef[],
  groupIdToDelete: string
): ProductGroupDef[] {
  const prevDeleted =
    safeGetStorageJson<string[]>(STORAGE_KEY_DELETED_PRODUCT_GROUP_IDS) || [];
  if (!prevDeleted.includes(groupIdToDelete)) {
    safeSetStorageJson(STORAGE_KEY_DELETED_PRODUCT_GROUP_IDS, [
      ...prevDeleted,
      groupIdToDelete,
    ]);
  }
  const next = currentGroups.filter((g) => g.id !== groupIdToDelete);
  saveProductGroups(next);
  return next;
}

export function resetDefaultProductGroups(
  models: ScenarioModelSpec[]
): ProductGroupDef[] {
  safeSetStorageJson(STORAGE_KEY_DELETED_PRODUCT_GROUP_IDS, []);
  const defaults = buildDefaultProductGroups(models);
  saveProductGroups(defaults);
  return defaults;
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
  const singleBrandDefaultIds = new Set([
    'grp-natele-womens-base',
    'grp-fukai-wb',
    'grp-akusha-shoes',
    'grp-liscani-curtains',
  ]);
  return allModels.filter(
    (m) =>
      m.launchStatus !== 'В архиве' &&
      (idSet.has(m.id) ||
        codeSet.has(m.code.toUpperCase()) ||
        (Boolean(group.isSystemDefault) &&
          singleBrandDefaultIds.has(group.id) &&
          group.brandCode !== 'ALL' &&
          matchesBrandFilter(m, group.brandCode)))
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
        badgeBg: 'bg-[#ECFDF5]',
        badgeText: 'text-[#065F46]',
        badgeBorder: 'border-[#A7F3D0]',
        folderBg: 'bg-[#F0FDF4] border-[#BBF7D0]',
        folderIconText: 'text-[#059669]',
        accentBar: 'bg-emerald-600',
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
        badgeBg: 'bg-[#F0FDFA]',
        badgeText: 'text-[#115E59]',
        badgeBorder: 'border-[#99F6E4]',
        folderBg: 'bg-[#F0FDFA] border-[#CCFBF1]',
        folderIconText: 'text-[#0D9488]',
        accentBar: 'bg-teal-600',
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
