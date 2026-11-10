// Утверждённый реестр ассортимента и помесячного плана продаж AKUSHA на 2027 год
// Источник: «AKUSHA · План продаж на 2027 год · 31 модель · исходные фотографии · помесячные планы» (15 стр., 11.11.2026)
// Формат карточек: 24 карточки, представляющие все 31 модель и цветомодель в 9 товарных группах
// (Замшевые лоферы №09–16 объединены в общую карточку AKU-009 с 8 цветами в палитре и общим планом 4 920 пар)
// Суммарные продажи (выкупленные пары) 2027: 20 377 пар
// Суммарные заказы покупателей (по моделям с заданным % выкупа): 47 808 пар
// Плановая выручка (по моделям с заданной ценой): 105 793 210 ₽ (105,79 млн ₽)
// Себестоимость выкупленных пар (по моделям с заданной себестоимостью): 37 448 200 ₽ (37,45 млн ₽)

import type {
  AttachedModelPdf,
  GalleryMediaItem,
  GrowthScenarioDef,
  PackColor,
  ScenarioCommercialPlan,
  ScenarioModelSpec,
} from './scenarioData.ts';

export const AKUSHA_2027_SCENARIO_ID = 202706;

export const AKUSHA_2027_SCENARIO_DEF: GrowthScenarioDef = {
  id: AKUSHA_2027_SCENARIO_ID,
  title: 'AKUSHA — Утверждённый план 2027 (105,79 млн ₽ · 20 377 пар · 31 модель)',
  monthlyTargetMln: 11.98,
  targetMonthLabel: 'Декабрь 2027',
  targetMonthIdx: 11,
  scopeLabel: 'AKUSHA',
  includedBrands: ['BORNERS'],
  year: 2027,
  ownerBrandCode: 'AKUSHA',
};

export const AKUSHA_2027_PDF_ATTACHMENT: AttachedModelPdf = {
  id: 'pdf-akusha-2027-official-31-models',
  name: 'AKUSHA_План_продаж_2027_31_модель_исходные_фото.pdf',
  sizeBytes: 941628,
  uploadedAt: '11.11.2026',
  staticUrl: '/docs/akusha_plan_2027_31_models.pdf',
};

export interface AkushaProductGroupSummary {
  groupId: string;
  groupTitle: string;
  modelsRangeLabel: string;
  modelVariantsCount: number;
  cardsCount: number;
  retailPriceRub: number;
  unitCostRub: number;
  buyoutRatePct: number;
  annualBuyoutsPairs: number;
  annualOrdersPairs: number;
  annualRevenueRub: number;
  annualCogsRub: number;
  monthlyBuyoutsPairs: number[];
  statusNote: string;
}

export const AKUSHA_2027_SUMMARY = {
  totalModelVariants: 31,
  totalCards: 24,
  totalGroups: 9,
  annualBuyoutsPairs: 20_377,
  annualOrdersPairs: 47_808,
  annualRevenueRub: 105_793_210,
  annualCogsRub: 37_448_200,
  monthlyBuyoutsPairsTotal: [573, 808, 628, 849, 1298, 1740, 2218, 3056, 2265, 2282, 2656, 2004],
  groups: [
    {
      groupId: 'grp-akusha-winter-boots',
      groupTitle: 'Зимние ботинки',
      modelsRangeLabel: '№01–04',
      modelVariantsCount: 4,
      cardsCount: 4,
      retailPriceRub: 7500,
      unitCostRub: 2800,
      buyoutRatePct: 50,
      annualBuyoutsPairs: 4557,
      annualOrdersPairs: 9114,
      annualRevenueRub: 34_177_500,
      annualCogsRub: 12_759_600,
      monthlyBuyoutsPairs: [410, 515, 170, 34, 17, 17, 34, 170, 410, 790, 995, 995],
      statusNote: 'Полный расчёт',
    },
    {
      groupId: 'grp-akusha-suede-sneakers',
      groupTitle: 'Замшевые кеды',
      modelsRangeLabel: '№05–06',
      modelVariantsCount: 2,
      cardsCount: 2,
      retailPriceRub: 5990,
      unitCostRub: 2200,
      buyoutRatePct: 35,
      annualBuyoutsPairs: 1985,
      annualOrdersPairs: 5678,
      annualRevenueRub: 11_890_150,
      annualCogsRub: 4_367_000,
      monthlyBuyoutsPairs: [0, 0, 0, 85, 165, 250, 345, 450, 325, 215, 110, 40],
      statusNote: 'Полный расчёт',
    },
    {
      groupId: 'grp-akusha-leather-sneakers',
      groupTitle: 'Кроссовки из кожи',
      modelsRangeLabel: '№07–08',
      modelVariantsCount: 2,
      cardsCount: 2,
      retailPriceRub: 5990,
      unitCostRub: 2200,
      buyoutRatePct: 35,
      annualBuyoutsPairs: 2175,
      annualOrdersPairs: 6222,
      annualRevenueRub: 13_028_250,
      annualCogsRub: 4_785_000,
      monthlyBuyoutsPairs: [0, 0, 0, 95, 180, 270, 380, 495, 355, 235, 120, 45],
      statusNote: 'Полный расчёт',
    },
    {
      groupId: 'grp-akusha-suede-loafers',
      groupTitle: 'Замшевые лоферы · 8 цветов',
      modelsRangeLabel: '№09–16',
      modelVariantsCount: 8,
      cardsCount: 1,
      retailPriceRub: 5990,
      unitCostRub: 1900,
      buyoutRatePct: 33,
      annualBuyoutsPairs: 4920,
      annualOrdersPairs: 14_915,
      annualRevenueRub: 29_470_800,
      annualCogsRub: 9_348_000,
      monthlyBuyoutsPairs: [0, 0, 80, 190, 270, 380, 750, 1200, 600, 400, 550, 500],
      statusNote: 'Общая карточка · 8 цветов (Бежевый, Чёрный, Графит, Оранжевый, Жёлтый, Шоколад, Синий, Мятный)',
    },
    {
      groupId: 'grp-akusha-topsiders',
      groupTitle: 'Топсайдеры',
      modelsRangeLabel: '№17–20',
      modelVariantsCount: 4,
      cardsCount: 4,
      retailPriceRub: 0,
      unitCostRub: 0,
      buyoutRatePct: 40,
      annualBuyoutsPairs: 2668,
      annualOrdersPairs: 6681,
      annualRevenueRub: 0,
      annualCogsRub: 0,
      monthlyBuyoutsPairs: [63, 103, 193, 157, 249, 307, 274, 391, 293, 187, 247, 204],
      statusNote: 'Уточнить цену и себестоимость',
    },
    {
      groupId: 'grp-akusha-felt-italy',
      groupTitle: 'Войлок Италия',
      modelsRangeLabel: '№21–22',
      modelVariantsCount: 2,
      cardsCount: 2,
      retailPriceRub: 6990,
      unitCostRub: 2400,
      buyoutRatePct: 45,
      annualBuyoutsPairs: 1294,
      annualOrdersPairs: 2886,
      annualRevenueRub: 9_045_060,
      annualCogsRub: 3_105_600,
      monthlyBuyoutsPairs: [100, 190, 125, 68, 32, 16, 10, 60, 115, 225, 325, 28],
      statusNote: 'Полный расчёт',
    },
    {
      groupId: 'grp-akusha-premium-sneakers',
      groupTitle: 'Премиальные кроссовки',
      modelsRangeLabel: '№23',
      modelVariantsCount: 1,
      cardsCount: 1,
      retailPriceRub: 9900,
      unitCostRub: 3500,
      buyoutRatePct: 50,
      annualBuyoutsPairs: 418,
      annualOrdersPairs: 836,
      annualRevenueRub: 4_138_200,
      annualCogsRub: 1_463_000,
      monthlyBuyoutsPairs: [0, 0, 0, 0, 0, 0, 0, 20, 52, 103, 151, 92],
      statusNote: 'Полный расчёт (3 ракурса в карточке)',
    },
    {
      groupId: 'grp-akusha-tomori-mule',
      groupTitle: 'Tomori Walk Mule',
      modelsRangeLabel: '№24–27',
      modelVariantsCount: 4,
      cardsCount: 4,
      retailPriceRub: 5990,
      unitCostRub: 2400,
      buyoutRatePct: 46,
      annualBuyoutsPairs: 675,
      annualOrdersPairs: 1476,
      annualRevenueRub: 4_043_250,
      annualCogsRub: 1_620_000,
      monthlyBuyoutsPairs: [0, 0, 0, 70, 145, 200, 165, 95, 0, 0, 0, 0],
      statusNote: 'Полный расчёт (сезон Апрель–Август)',
    },
    {
      groupId: 'grp-akusha-moccasins',
      groupTitle: 'Дыхабельные мокасины',
      modelsRangeLabel: '№28–31',
      modelVariantsCount: 4,
      cardsCount: 4,
      retailPriceRub: 0,
      unitCostRub: 0,
      buyoutRatePct: 0,
      annualBuyoutsPairs: 1685,
      annualOrdersPairs: 0,
      annualRevenueRub: 0,
      annualCogsRub: 0,
      monthlyBuyoutsPairs: [0, 0, 60, 150, 240, 300, 260, 175, 115, 127, 158, 100],
      statusNote: 'Уточнить цену, себестоимость и % выкупа',
    },
  ] satisfies AkushaProductGroupSummary[],
};

interface RawAkushaCardSeed {
  id: string;
  code: string;
  pdfModelNumLabel: string;
  title: string;
  subtitle: string;
  groupTitle: string;
  colorNameRu: string;
  swatchHex: string;
  bandHex: string;
  retailPriceRub: number;
  unitCostRub: number;
  buyoutRatePct: number; // 0 означает «не задан — уточнить»
  unitsInPack: number;
  monthlyPacks: number[];
  monthlyOrdersPacks: number[];
  imageUrls: { url: string; label: string; category: GalleryMediaItem['category'] }[];
  paletteColors?: PackColor[];
  upperMaterial: string;
  soleType: string;
  seasonLabel: string;
  description: string;
  priority: 'Высший' | 'Высокий' | 'Средний';
}

const RAW_AKUSHA_2027_SEEDS: RawAkushaCardSeed[] = [
  // Группа 1: Зимние ботинки (№01–04)
  {
    id: 'scen-akusha-001',
    code: 'AKU-001',
    pdfModelNumLabel: '№01',
    title: 'Зимние ботинки · Модель №01 (Тёмно-коричневый нубук)',
    subtitle: 'Зимние ботинки · План 2027: 1 330 выкупленных пар (2 660 заказов при 50% выкупа)',
    groupTitle: 'Зимние ботинки',
    colorNameRu: 'Тёмно-коричневый / Чёрный рант',
    swatchHex: '#3B2B23',
    bandHex: '#1F1916',
    retailPriceRub: 7500,
    unitCostRub: 2800,
    buyoutRatePct: 50,
    unitsInPack: 1,
    monthlyPacks: [120, 150, 50, 10, 5, 5, 10, 50, 120, 230, 290, 290],
    monthlyOrdersPacks: [240, 300, 100, 20, 10, 10, 20, 100, 240, 460, 580, 580],
    imageUrls: [
      { url: '/models/akusha/AKU-001_main.jpg', label: '№01 · Зимние ботинки · Фото 1', category: 'pack' },
    ],
    upperMaterial: 'Натуральный нубук / кожа, зимний утеплитель',
    soleType: 'ТЭП протекторная зимняя',
    seasonLabel: 'Зима / Осень–Зима (пик Окт–Фев)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 4, 13): Зимние ботинки · Фото 1 (доля 29,19% в группе). Цена реализации 7 500 ₽, себестоимость 2 800 ₽, выкуп 50%. Годовой план: 1 330 выкупленных пар, 2 660 заказов, выручка 9 975 000 ₽.',
    priority: 'Высший',
  },
  {
    id: 'scen-akusha-002',
    code: 'AKU-002',
    pdfModelNumLabel: '№02',
    title: 'Зимние ботинки · Модель №02 (Оливково-серый нубук)',
    subtitle: 'Зимние ботинки · План 2027: 1 188 выкупленных пар (2 376 заказов при 50% выкупа)',
    groupTitle: 'Зимние ботинки',
    colorNameRu: 'Оливково-серый / Тёмный графит',
    swatchHex: '#52544A',
    bandHex: '#252722',
    retailPriceRub: 7500,
    unitCostRub: 2800,
    buyoutRatePct: 50,
    unitsInPack: 1,
    monthlyPacks: [105, 135, 45, 9, 5, 5, 9, 45, 105, 205, 260, 260],
    monthlyOrdersPacks: [210, 270, 90, 18, 10, 10, 18, 90, 210, 410, 520, 520],
    imageUrls: [
      { url: '/models/akusha/AKU-002_main.jpg', label: '№02 · Зимние ботинки · Фото 2', category: 'pack' },
    ],
    upperMaterial: 'Натуральный нубук с водоотталкивающей пропиткой, мех',
    soleType: 'ТЭП нескользящая со светлым кантом',
    seasonLabel: 'Зима / Осень–Зима (пик Окт–Фев)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 4, 13): Зимние ботинки · Фото 2 (доля 26,07% в группе). Цена реализации 7 500 ₽, себестоимость 2 800 ₽, выкуп 50%. Годовой план: 1 188 выкупленных пар, 2 376 заказов, выручка 8 910 000 ₽.',
    priority: 'Высший',
  },
  {
    id: 'scen-akusha-003',
    code: 'AKU-003',
    pdfModelNumLabel: '№03',
    title: 'Зимние ботинки · Модель №03 (Чёрный нубук и кожа)',
    subtitle: 'Зимние ботинки · План 2027: 1 059 выкупленных пар (2 118 заказов при 50% выкупа)',
    groupTitle: 'Зимние ботинки',
    colorNameRu: 'Чёрный матовый',
    swatchHex: '#232528',
    bandHex: '#111214',
    retailPriceRub: 7500,
    unitCostRub: 2800,
    buyoutRatePct: 50,
    unitsInPack: 1,
    monthlyPacks: [95, 120, 40, 8, 4, 4, 8, 40, 95, 185, 230, 230],
    monthlyOrdersPacks: [190, 240, 80, 16, 8, 8, 16, 80, 190, 370, 460, 460],
    imageUrls: [
      { url: '/models/akusha/AKU-003_main.jpg', label: '№03 · Зимние ботинки · Фото 3', category: 'pack' },
    ],
    upperMaterial: 'Комбинированная натуральная кожа и нубук, зимний мех',
    soleType: 'ТЭП рельефная зимняя',
    seasonLabel: 'Зима / Осень–Зима (пик Окт–Фев)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 4, 13): Зимние ботинки · Фото 3 (доля 23,24% в группе). Цена реализации 7 500 ₽, себестоимость 2 800 ₽, выкуп 50%. Годовой план: 1 059 выкупленных пар, 2 118 заказов, выручка 7 942 500 ₽.',
    priority: 'Высокий',
  },
  {
    id: 'scen-akusha-004',
    code: 'AKU-004',
    pdfModelNumLabel: '№04',
    title: 'Зимние ботинки · Модель №04 (Чёрная зернистая кожа)',
    subtitle: 'Зимние ботинки · План 2027: 980 выкупленных пар (1 960 заказов при 50% выкупа)',
    groupTitle: 'Зимние ботинки',
    colorNameRu: 'Чёрный классический',
    swatchHex: '#1C1D20',
    bandHex: '#0F1012',
    retailPriceRub: 7500,
    unitCostRub: 2800,
    buyoutRatePct: 50,
    unitsInPack: 1,
    monthlyPacks: [90, 110, 35, 7, 3, 3, 7, 35, 90, 170, 215, 215],
    monthlyOrdersPacks: [180, 220, 70, 14, 6, 6, 14, 70, 180, 340, 430, 430],
    imageUrls: [
      { url: '/models/akusha/AKU-004_main.jpg', label: '№04 · Зимние ботинки · Фото 4', category: 'pack' },
    ],
    upperMaterial: 'Натуральная зернистая кожа флотер, натуральная шерсть',
    soleType: 'ТЭП монолитная с глубоким протектором',
    seasonLabel: 'Зима / Осень–Зима (пик Окт–Фев)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 4, 13): Зимние ботинки · Фото 4 (доля 21,51% в группе). Цена реализации 7 500 ₽, себестоимость 2 800 ₽, выкуп 50%. Годовой план: 980 выкупленных пар, 1 960 заказов, выручка 7 350 000 ₽.',
    priority: 'Высокий',
  },

  // Группа 2: Замшевые кеды (№05–06)
  {
    id: 'scen-akusha-005',
    code: 'AKU-005',
    pdfModelNumLabel: '№05',
    title: 'Замшевые кеды · Серые (Модель №05)',
    subtitle: 'Замшевые кеды · План 2027: 830 выкупленных пар (2 374 заказа при 35% выкупа)',
    groupTitle: 'Замшевые кеды',
    colorNameRu: 'Серый / Медовая подошва',
    swatchHex: '#7A7B7E',
    bandHex: '#B6864C',
    retailPriceRub: 5990,
    unitCostRub: 2200,
    buyoutRatePct: 35,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 0, 35, 70, 105, 145, 190, 135, 90, 45, 15],
    monthlyOrdersPacks: [0, 0, 0, 100, 200, 300, 415, 543, 386, 258, 129, 43],
    imageUrls: [
      { url: '/models/akusha/AKU-005_main.jpg', label: '№05 · Замшевые кеды · Серые', category: 'pack' },
    ],
    upperMaterial: 'Натуральная велюровая замша премиум-выделки',
    soleType: 'Каучуковая медовая gum-sole',
    seasonLabel: 'Весна–Лето–Осень (старт с апреля)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 5, 13): Замшевые кеды · Серые (доля 41,81% в группе). Цена реализации 5 990 ₽, себестоимость 2 200 ₽, выкуп 35%. Годовой план: 830 выкупленных пар, 2 374 заказа, выручка 4 971 700 ₽.',
    priority: 'Высокий',
  },
  {
    id: 'scen-akusha-006',
    code: 'AKU-006',
    pdfModelNumLabel: '№06',
    title: 'Замшевые кеды · Чёрные (Модель №06)',
    subtitle: 'Замшевые кеды · План 2027: 1 155 выкупленных пар (3 304 заказа при 35% выкупа)',
    groupTitle: 'Замшевые кеды',
    colorNameRu: 'Чёрный / Медовая подошва',
    swatchHex: '#202124',
    bandHex: '#B6864C',
    retailPriceRub: 5990,
    unitCostRub: 2200,
    buyoutRatePct: 35,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 0, 50, 95, 145, 200, 260, 190, 125, 65, 25],
    monthlyOrdersPacks: [0, 0, 0, 143, 272, 415, 572, 743, 543, 358, 186, 72],
    imageUrls: [
      { url: '/models/akusha/AKU-006_main.jpg', label: '№06 · Замшевые кеды · Чёрные', category: 'pack' },
    ],
    upperMaterial: 'Натуральная велюровая замша премиум-выделки',
    soleType: 'Каучуковая медовая gum-sole',
    seasonLabel: 'Весна–Лето–Осень (старт с апреля)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 5, 13): Замшевые кеды · Чёрные (доля 58,19% в группе). Цена реализации 5 990 ₽, себестоимость 2 200 ₽, выкуп 35%. Годовой план: 1 155 выкупленных пар, 3 304 заказа, выручка 6 918 450 ₽.',
    priority: 'Высший',
  },

  // Группа 3: Кроссовки из кожи (№07–08)
  {
    id: 'scen-akusha-007',
    code: 'AKU-007',
    pdfModelNumLabel: '№07',
    title: 'Кроссовки из кожи · Чёрные (Модель №07)',
    subtitle: 'Кроссовки из кожи · План 2027: 1 235 выкупленных пар (3 532 заказа при 35% выкупа)',
    groupTitle: 'Кроссовки из кожи',
    colorNameRu: 'Чёрный монохром',
    swatchHex: '#1E2022',
    bandHex: '#111214',
    retailPriceRub: 5990,
    unitCostRub: 2200,
    buyoutRatePct: 35,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 0, 55, 100, 155, 215, 280, 200, 135, 70, 25],
    monthlyOrdersPacks: [0, 0, 0, 158, 286, 443, 615, 800, 572, 386, 200, 72],
    imageUrls: [
      { url: '/models/akusha/AKU-007_main.jpg', label: '№07 · Кроссовки из кожи · Чёрные', category: 'pack' },
    ],
    upperMaterial: 'Натуральная гладкая телячья кожа',
    soleType: 'Облегчённая EVA / ТПУ чёрная',
    seasonLabel: 'Весна–Лето–Осень (старт с апреля)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 5, 13): Кроссовки из кожи · Чёрные (доля 56,78% в группе). Цена реализации 5 990 ₽, себестоимость 2 200 ₽, выкуп 35%. Годовой план: 1 235 выкупленных пар, 3 532 заказа, выручка 7 397 650 ₽.',
    priority: 'Высший',
  },
  {
    id: 'scen-akusha-008',
    code: 'AKU-008',
    pdfModelNumLabel: '№08',
    title: 'Кроссовки из кожи · С белыми шнурками и рант-подошвой (Модель №08)',
    subtitle: 'Кроссовки из кожи · План 2027: 940 выкупленных пар (2 690 заказов при 35% выкупа)',
    groupTitle: 'Кроссовки из кожи',
    colorNameRu: 'Чёрный / Белая подошва и шнурки',
    swatchHex: '#25282C',
    bandHex: '#F3F4F6',
    retailPriceRub: 5990,
    unitCostRub: 2200,
    buyoutRatePct: 35,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 0, 40, 80, 115, 165, 215, 155, 100, 50, 20],
    monthlyOrdersPacks: [0, 0, 0, 115, 229, 329, 472, 615, 443, 286, 143, 58],
    imageUrls: [
      { url: '/models/akusha/AKU-008_main.jpg', label: '№08 · Кроссовки из кожи · С белыми шнурками', category: 'pack' },
    ],
    upperMaterial: 'Натуральная гладкая кожа с контрастной отделкой',
    soleType: 'Светлая cupsole с бежевым протектором',
    seasonLabel: 'Весна–Лето–Осень (старт с апреля)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 5, 13): Кроссовки из кожи · С белыми шнурками (доля 43,22% в группе). Цена реализации 5 990 ₽, себестоимость 2 200 ₽, выкуп 35%. Годовой план: 940 выкупленных пар, 2 690 заказов, выручка 5 630 600 ₽.',
    priority: 'Высокий',
  },

  // Группа 4: Замшевые лоферы · 8 цветов (№09–16) — ОБЩАЯ КАРТОЧКА по требованию PDF и основателя
  {
    id: 'scen-akusha-009',
    code: 'AKU-009',
    pdfModelNumLabel: '№09–16',
    title: 'Замшевые лоферы · Общая карточка 8 цветов (Модели №09–16)',
    subtitle: 'Замшевые лоферы · 8 цветов в линейке · Общий план 2027: 4 920 выкупленных пар (14 915 заказов при 33% выкупа)',
    groupTitle: 'Замшевые лоферы · 8 цветов',
    colorNameRu: '8 цветов: Бежевый, Чёрный, Графит, Оранжевый, Жёлтый, Шоколад, Синий, Мятный',
    swatchHex: '#2E5A88',
    bandHex: '#8C6239',
    retailPriceRub: 5990,
    unitCostRub: 1900,
    buyoutRatePct: 33,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 80, 190, 270, 380, 750, 1200, 600, 400, 550, 500],
    monthlyOrdersPacks: [0, 0, 243, 576, 819, 1152, 2273, 3637, 1819, 1213, 1667, 1516],
    imageUrls: [
      { url: '/models/akusha/AKU-009_16_main.jpg', label: '№09–16 · Замшевые лоферы · 8 цветов (фото в таблице: Синий)', category: 'pack' },
    ],
    paletteColors: [
      { nameRu: '09 · Бежевый', pantone: 'AKUSHA LOAFER 09', hex: '#D6C2A8', bandHex: '#B89F80', textHex: '#3B2F2F' },
      { nameRu: '10 · Чёрный', pantone: 'AKUSHA LOAFER 10', hex: '#222326', bandHex: '#111214', textHex: '#FFFFFF' },
      { nameRu: '11 · Графитово-серый', pantone: 'AKUSHA LOAFER 11', hex: '#5A5E66', bandHex: '#3E4248', textHex: '#FFFFFF' },
      { nameRu: '12 · Оранжевый', pantone: 'AKUSHA LOAFER 12', hex: '#D96B27', bandHex: '#B35216', textHex: '#FFFFFF' },
      { nameRu: '13 · Жёлтый', pantone: 'AKUSHA LOAFER 13', hex: '#E3B434', bandHex: '#C2941D', textHex: '#222326' },
      { nameRu: '14 · Шоколадный', pantone: 'AKUSHA LOAFER 14', hex: '#4E3529', bandHex: '#362219', textHex: '#FFFFFF' },
      { nameRu: '15 · Синий (фото в таблице)', pantone: 'AKUSHA LOAFER 15', hex: '#2E5A88', bandHex: '#1D3F63', textHex: '#FFFFFF' },
      { nameRu: '16 · Мятный', pantone: 'AKUSHA LOAFER 16', hex: '#78B8A8', bandHex: '#569686', textHex: '#1E2926' },
    ],
    upperMaterial: 'Натуральная мягкая замша Summer Walk (8 цветов в палитре)',
    soleType: 'Бежевая эластичная лоферная подошва Loro-style',
    seasonLabel: 'Март–Декабрь (пик Июль–Август: 750 и 1 200 выкупленных пар/мес)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 6, 13): Общая карточка для 8 цветов замшевых лоферов (№09 Бежевый, №10 Чёрный, №11 Графитово-серый, №12 Оранжевый, №13 Жёлтый, №14 Шоколадный, №15 Синий, №16 Мятный). Цена реализации 5 990 ₽, себестоимость 1 900 ₽, выкуп 33%. Общий план на 8 цветов: 4 920 выкупленных пар, 14 915 заказов, выручка 29 470 800 ₽.',
    priority: 'Высший',
  },

  // Группа 5: Топсайдеры (№17–20) — цена и себестоимость «уточнить» (0 ₽)
  {
    id: 'scen-akusha-017',
    code: 'AKU-017',
    pdfModelNumLabel: '№17',
    title: 'Топсайдеры · Чёрная замша (Модель №17)',
    subtitle: 'Топсайдеры · План 2027: 986 выкупленных пар (2 468 заказов при 40% выкупа · цену и себестоимость уточнить)',
    groupTitle: 'Топсайдеры',
    colorNameRu: 'Чёрная замша / Белая подошва',
    swatchHex: '#232428',
    bandHex: '#E5E7EB',
    retailPriceRub: 0,
    unitCostRub: 0,
    buyoutRatePct: 40,
    unitsInPack: 1,
    monthlyPacks: [24, 38, 71, 58, 92, 114, 101, 145, 108, 69, 91, 75],
    monthlyOrdersPacks: [60, 95, 178, 145, 230, 285, 253, 363, 270, 173, 228, 188],
    imageUrls: [
      { url: '/models/akusha/AKU-017_main.jpg', label: '№17 · Топсайдеры · Чёрная замша', category: 'pack' },
    ],
    upperMaterial: 'Натуральная чёрная замша с кожаным шнурком 360°',
    soleType: 'Белая яхтенная нескользящая подошва',
    seasonLabel: 'Круглогодично (пик Май–Сентябрь)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 7, 14): Топсайдеры · Чёрная замша (доля 36,96% в группе). Выкуп 40%. Годовой план: 986 выкупленных пар, 2 468 заказов. Цена реализации и себестоимость в исходном файле помечены «уточнить» (не заполнены искусственными допущениями).',
    priority: 'Высокий',
  },
  {
    id: 'scen-akusha-018',
    code: 'AKU-018',
    pdfModelNumLabel: '№18',
    title: 'Топсайдеры · Коричневая замша (Модель №18)',
    subtitle: 'Топсайдеры · План 2027: 773 выкупленные пары (1 935 заказов при 40% выкупа · цену и себестоимость уточнить)',
    groupTitle: 'Топсайдеры',
    colorNameRu: 'Коричневая замша / Белая подошва',
    swatchHex: '#6E4B35',
    bandHex: '#E5E7EB',
    retailPriceRub: 0,
    unitCostRub: 0,
    buyoutRatePct: 40,
    unitsInPack: 1,
    monthlyPacks: [18, 30, 56, 46, 72, 89, 79, 113, 85, 54, 72, 59],
    monthlyOrdersPacks: [45, 75, 140, 115, 180, 223, 198, 283, 213, 135, 180, 148],
    imageUrls: [
      { url: '/models/akusha/AKU-018_main.jpg', label: '№18 · Топсайдеры · Коричневая замша', category: 'pack' },
    ],
    upperMaterial: 'Натуральная коричневая замша с ручным швом мокасин',
    soleType: 'Белая яхтенная нескользящая подошва',
    seasonLabel: 'Круглогодично (пик Май–Сентябрь)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 7, 14): Топсайдеры · Коричневая замша (доля 28,97% в группе). Выкуп 40%. Годовой план: 773 выкупленные пары, 1 935 заказов. Цена реализации и себестоимость в исходном файле помечены «уточнить».',
    priority: 'Высокий',
  },
  {
    id: 'scen-akusha-019',
    code: 'AKU-019',
    pdfModelNumLabel: '№19',
    title: 'Топсайдеры · Коричневая кожа (Модель №19)',
    subtitle: 'Топсайдеры · План 2027: 561 выкупленная пара (1 405 заказов при 40% выкупа · цену и себестоимость уточнить)',
    groupTitle: 'Топсайдеры',
    colorNameRu: 'Коричневая гладкая кожа',
    swatchHex: '#5C3A24',
    bandHex: '#E5E7EB',
    retailPriceRub: 0,
    unitCostRub: 0,
    buyoutRatePct: 40,
    unitsInPack: 1,
    monthlyPacks: [13, 22, 41, 33, 52, 64, 58, 82, 62, 39, 52, 43],
    monthlyOrdersPacks: [33, 55, 103, 83, 130, 160, 145, 205, 155, 98, 130, 108],
    imageUrls: [
      { url: '/models/akusha/AKU-019_main.jpg', label: '№19 · Топсайдеры · Коричневая кожа', category: 'pack' },
    ],
    upperMaterial: 'Натуральная гладкая кожа пулл-ап',
    soleType: 'Белая яхтенная нескользящая подошва',
    seasonLabel: 'Круглогодично (пик Май–Сентябрь)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 7, 14): Топсайдеры · Коричневая кожа (доля 21,03% в группе). Выкуп 40%. Годовой план: 561 выкупленная пара, 1 405 заказов. Цена реализации и себестоимость в исходном файле помечены «уточнить».',
    priority: 'Средний',
  },
  {
    id: 'scen-akusha-020',
    code: 'AKU-020',
    pdfModelNumLabel: '№20',
    title: 'Топсайдеры · Синяя замша (Модель №20)',
    subtitle: 'Топсайдеры · План 2027: 348 выкупленных пар (873 заказа при 40% выкупа · цену и себестоимость уточнить)',
    groupTitle: 'Топсайдеры',
    colorNameRu: 'Тёмно-синяя замша / Белая подошва',
    swatchHex: '#253B56',
    bandHex: '#E5E7EB',
    retailPriceRub: 0,
    unitCostRub: 0,
    buyoutRatePct: 40,
    unitsInPack: 1,
    monthlyPacks: [8, 13, 25, 20, 33, 40, 36, 51, 38, 25, 32, 27],
    monthlyOrdersPacks: [20, 33, 63, 50, 83, 100, 90, 128, 95, 63, 80, 68],
    imageUrls: [
      { url: '/models/akusha/AKU-020_main.jpg', label: '№20 · Топсайдеры · Синяя замша', category: 'pack' },
    ],
    upperMaterial: 'Натуральная тёмно-синяя велюровая замша',
    soleType: 'Белая яхтенная нескользящая подошва',
    seasonLabel: 'Круглогодично (пик Май–Сентябрь)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 7, 14): Топсайдеры · Синяя замша (доля 13,04% в группе). Выкуп 40%. Годовой план: 348 выкупленных пар, 873 заказа. Цена реализации и себестоимость в исходном файле помечены «уточнить».',
    priority: 'Средний',
  },

  // Группа 6: Войлок Италия (№21–22)
  {
    id: 'scen-akusha-021',
    code: 'AKU-021',
    pdfModelNumLabel: '№21',
    title: 'Войлок Италия · Чёрная подошва (Модель №21)',
    subtitle: 'Войлок Италия · План 2027: 777 выкупленных пар (1 733 заказа при 45% выкупа)',
    groupTitle: 'Войлок Италия',
    colorNameRu: 'Графитовый войлок / Чёрная подошва',
    swatchHex: '#4A4D52',
    bandHex: '#18191C',
    retailPriceRub: 6990,
    unitCostRub: 2400,
    buyoutRatePct: 45,
    unitsInPack: 1,
    monthlyPacks: [60, 114, 75, 41, 19, 10, 6, 36, 69, 135, 195, 17],
    monthlyOrdersPacks: [134, 254, 167, 92, 43, 23, 14, 80, 154, 300, 434, 38],
    imageUrls: [
      { url: '/models/akusha/AKU-021_main.jpg', label: '№21 · Войлок Италия · Чёрная подошва', category: 'pack' },
    ],
    upperMaterial: 'Итальянский обувной шерстяной войлок с кожаными вставками',
    soleType: 'ТЭП анатомическая чёрная подошва',
    seasonLabel: 'Осень–Зима–Весна (пик Окт–Ноя и Янв–Мар)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 8, 14): Войлок Италия · Чёрная подошва (доля 60,05% в группе). Цена реализации 6 990 ₽, себестоимость 2 400 ₽, выкуп 45%. Годовой план: 777 выкупленных пар, 1 733 заказа, выручка 5 431 230 ₽.',
    priority: 'Высокий',
  },
  {
    id: 'scen-akusha-022',
    code: 'AKU-022',
    pdfModelNumLabel: '№22',
    title: 'Войлок Италия · Белая подошва (Модель №22)',
    subtitle: 'Войлок Италия · План 2027: 517 выкупленных пар (1 153 заказа при 45% выкупа)',
    groupTitle: 'Войлок Италия',
    colorNameRu: 'Графитовый войлок / Белая подошва',
    swatchHex: '#55585E',
    bandHex: '#F3F4F6',
    retailPriceRub: 6990,
    unitCostRub: 2400,
    buyoutRatePct: 45,
    unitsInPack: 1,
    monthlyPacks: [40, 76, 50, 27, 13, 6, 4, 24, 46, 90, 130, 11],
    monthlyOrdersPacks: [89, 169, 112, 60, 29, 14, 9, 54, 103, 200, 289, 25],
    imageUrls: [
      { url: '/models/akusha/AKU-022_main.jpg', label: '№22 · Войлок Италия · Белая подошва', category: 'pack' },
    ],
    upperMaterial: 'Итальянский обувной шерстяной войлок с кожаным задником',
    soleType: 'Облегчённая белая подошва',
    seasonLabel: 'Осень–Зима–Весна (пик Окт–Ноя и Янв–Мар)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 8, 14): Войлок Италия · Белая подошва (доля 39,95% в группе). Цена реализации 6 990 ₽, себестоимость 2 400 ₽, выкуп 45%. Годовой план: 517 выкупленных пар, 1 153 заказа, выручка 3 613 830 ₽.',
    priority: 'Высокий',
  },

  // Группа 7: Премиальные кроссовки (№23) — 3 ракурса в карточке
  {
    id: 'scen-akusha-023',
    code: 'AKU-023',
    pdfModelNumLabel: '№23',
    title: 'Премиальные кроссовки · Чёрные (Модель №23)',
    subtitle: 'Премиальные кроссовки · План 2027: 418 выкупленных пар (836 заказов при 50% выкупа)',
    groupTitle: 'Премиальные кроссовки',
    colorNameRu: 'Чёрный премиум / Скульптурная белая подошва',
    swatchHex: '#1B1C1E',
    bandHex: '#ECEEEF',
    retailPriceRub: 9900,
    unitCostRub: 3500,
    buyoutRatePct: 50,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 0, 0, 0, 0, 0, 20, 52, 103, 151, 92],
    monthlyOrdersPacks: [0, 0, 0, 0, 0, 0, 0, 40, 104, 206, 302, 184],
    imageUrls: [
      { url: '/models/akusha/AKU-023_main.jpg', label: '№23 · Премиальные кроссовки · Основной вид', category: 'pack' },
      { url: '/models/akusha/AKU-023_side.jpg', label: '№23 · Премиальные кроссовки · Вид сбоку', category: 'single' },
      { url: '/models/akusha/AKU-023_sole.jpg', label: '№23 · Премиальные кроссовки · Протектор подошвы', category: 'fabric' },
    ],
    upperMaterial: 'Премиальная итальянская телячья кожа и плотный нубук',
    soleType: 'Многослойная амортизирующая подошва с фирменным протектором',
    seasonLabel: 'Август–Декабрь (осенне-зимний запуск премиум-линейки)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 9, 14): Премиальные кроссовки · Чёрные (100% группы, 3 оригинальных фото ракурса в карточке). Цена реализации 9 900 ₽, себестоимость 3 500 ₽, выкуп 50%. Годовой план: 418 выкупленных пар, 836 заказов, выручка 4 138 200 ₽.',
    priority: 'Высший',
  },

  // Группа 8: Tomori Walk Mule (№24–27)
  {
    id: 'scen-akusha-024',
    code: 'AKU-024',
    pdfModelNumLabel: '№24',
    title: 'Tomori Walk Mule · Графит (Модель №24)',
    subtitle: 'Tomori Walk Mule · План 2027: 161 выкупленная пара (351 заказ при 46% выкупа)',
    groupTitle: 'Tomori Walk Mule',
    colorNameRu: 'Графит (Тёмно-серый)',
    swatchHex: '#4F5259',
    bandHex: '#D8CFC2',
    retailPriceRub: 5990,
    unitCostRub: 2400,
    buyoutRatePct: 46,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 0, 17, 34, 48, 40, 22, 0, 0, 0, 0],
    monthlyOrdersPacks: [0, 0, 0, 37, 74, 105, 87, 48, 0, 0, 0, 0],
    imageUrls: [
      { url: '/models/akusha/AKU-024_main.jpg', label: '№24 · Tomori Walk Mule · Графит', category: 'pack' },
    ],
    upperMaterial: 'Натуральная замша с открытой пяткой (мюли / сабо)',
    soleType: 'Анатомическая пробково-каучуковая стелька и светлая подошва',
    seasonLabel: 'Весна–Лето (Апрель–Август)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 10, 15): Tomori Walk Mule · Графит (доля 23,85% в группе). Цена реализации 5 990 ₽, себестоимость 2 400 ₽, выкуп 46%. Годовой план: 161 выкупленная пара, 351 заказ, выручка 964 390 ₽.',
    priority: 'Средний',
  },
  {
    id: 'scen-akusha-025',
    code: 'AKU-025',
    pdfModelNumLabel: '№25',
    title: 'Tomori Walk Mule · Бежевый (Модель №25)',
    subtitle: 'Tomori Walk Mule · План 2027: 209 выкупленных пар (456 заказов при 46% выкупа)',
    groupTitle: 'Tomori Walk Mule',
    colorNameRu: 'Бежевый песочный',
    swatchHex: '#CBB79D',
    bandHex: '#E5DEC9',
    retailPriceRub: 5990,
    unitCostRub: 2400,
    buyoutRatePct: 46,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 0, 22, 45, 62, 51, 29, 0, 0, 0, 0],
    monthlyOrdersPacks: [0, 0, 0, 48, 98, 135, 111, 64, 0, 0, 0, 0],
    imageUrls: [
      { url: '/models/akusha/AKU-025_main.jpg', label: '№25 · Tomori Walk Mule · Бежевый', category: 'pack' },
    ],
    upperMaterial: 'Натуральная замша с открытой пяткой (мюли / сабо)',
    soleType: 'Анатомическая пробково-каучуковая стелька и светлая подошва',
    seasonLabel: 'Весна–Лето (Апрель–Август)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 10, 15): Tomori Walk Mule · Бежевый (доля 30,96% в группе — флагманский цвет линейки Mule). Цена реализации 5 990 ₽, себестоимость 2 400 ₽, выкуп 46%. Годовой план: 209 выкупленных пар, 456 заказов, выручка 1 251 910 ₽.',
    priority: 'Высокий',
  },
  {
    id: 'scen-akusha-026',
    code: 'AKU-026',
    pdfModelNumLabel: '№26',
    title: 'Tomori Walk Mule · Шоколад (Модель №26)',
    subtitle: 'Tomori Walk Mule · План 2027: 182 выкупленные пары (398 заказов при 46% выкупа)',
    groupTitle: 'Tomori Walk Mule',
    colorNameRu: 'Шоколадный',
    swatchHex: '#543B2E',
    bandHex: '#D8CFC2',
    retailPriceRub: 5990,
    unitCostRub: 2400,
    buyoutRatePct: 46,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 0, 19, 39, 54, 44, 26, 0, 0, 0, 0],
    monthlyOrdersPacks: [0, 0, 0, 42, 85, 118, 96, 57, 0, 0, 0, 0],
    imageUrls: [
      { url: '/models/akusha/AKU-026_main.jpg', label: '№26 · Tomori Walk Mule · Шоколад', category: 'pack' },
    ],
    upperMaterial: 'Натуральная замша с открытой пяткой (мюли / сабо)',
    soleType: 'Анатомическая пробково-каучуковая стелька и светлая подошва',
    seasonLabel: 'Весна–Лето (Апрель–Август)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 10, 15): Tomori Walk Mule · Шоколад (доля 26,96% в группе). Цена реализации 5 990 ₽, себестоимость 2 400 ₽, выкуп 46%. Годовой план: 182 выкупленные пары, 398 заказов, выручка 1 090 180 ₽.',
    priority: 'Средний',
  },
  {
    id: 'scen-akusha-027',
    code: 'AKU-027',
    pdfModelNumLabel: '№27',
    title: 'Tomori Walk Mule · Коньяк (Модель №27)',
    subtitle: 'Tomori Walk Mule · План 2027: 123 выкупленные пары (271 заказ при 46% выкупа)',
    groupTitle: 'Tomori Walk Mule',
    colorNameRu: 'Коньячный (Рыже-коричневый)',
    swatchHex: '#8E5431',
    bandHex: '#D8CFC2',
    retailPriceRub: 5990,
    unitCostRub: 2400,
    buyoutRatePct: 46,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 0, 12, 27, 36, 30, 18, 0, 0, 0, 0],
    monthlyOrdersPacks: [0, 0, 0, 27, 59, 79, 66, 40, 0, 0, 0, 0],
    imageUrls: [
      { url: '/models/akusha/AKU-027_main.jpg', label: '№27 · Tomori Walk Mule · Коньяк', category: 'pack' },
    ],
    upperMaterial: 'Натуральная замша с открытой пяткой (мюли / сабо)',
    soleType: 'Анатомическая пробково-каучуковая стелька и светлая подошва',
    seasonLabel: 'Весна–Лето (Апрель–Август)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 10, 15): Tomori Walk Mule · Коньяк (доля 18,22% в группе). Цена реализации 5 990 ₽, себестоимость 2 400 ₽, выкуп 46%. Годовой план: 123 выкупленные пары, 271 заказ, выручка 736 770 ₽.',
    priority: 'Средний',
  },

  // Группа 9: Дыхабельные мокасины (№28–31) — цена, себестоимость и % выкупа «уточнить»
  {
    id: 'scen-akusha-028',
    code: 'AKU-028',
    pdfModelNumLabel: '№28',
    title: 'Дыхабельные мокасины · Коричневые (Модель №28)',
    subtitle: 'Дыхабельные мокасины · План 2027: 387 выкупленных пар (цену, себестоимость и % выкупа уточнить)',
    groupTitle: 'Дыхабельные мокасины',
    colorNameRu: 'Коричневый с перфорацией',
    swatchHex: '#6B442A',
    bandHex: '#E5DEC9',
    retailPriceRub: 0,
    unitCostRub: 0,
    buyoutRatePct: 0,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 14, 35, 55, 69, 60, 40, 26, 29, 36, 23],
    monthlyOrdersPacks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    imageUrls: [
      { url: '/models/akusha/AKU-028_main.jpg', label: '№28 · Дыхабельные мокасины · Коричневые', category: 'pack' },
    ],
    upperMaterial: 'Натуральная перфорированная дышащая кожа',
    soleType: 'Гибкая мокасиновая подошва с воздушными каналами',
    seasonLabel: 'Март–Декабрь (пик Май–Июль)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 11, 15): Дыхабельные мокасины · Коричневые (доля 22,97% в группе). Годовой план продаж: 387 выкупленных пар. Цена реализации, себестоимость и % выкупа в исходном документе помечены «уточнить» (без искусственных допущений).',
    priority: 'Средний',
  },
  {
    id: 'scen-akusha-029',
    code: 'AKU-029',
    pdfModelNumLabel: '№29',
    title: 'Дыхабельные мокасины · Коньячные (Модель №29)',
    subtitle: 'Дыхабельные мокасины · План 2027: 319 выкупленных пар (цену, себестоимость и % выкупа уточнить)',
    groupTitle: 'Дыхабельные мокасины',
    colorNameRu: 'Коньячный светло-коричневый с перфорацией',
    swatchHex: '#9A5B32',
    bandHex: '#E5DEC9',
    retailPriceRub: 0,
    unitCostRub: 0,
    buyoutRatePct: 0,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 11, 28, 46, 57, 49, 33, 22, 24, 30, 19],
    monthlyOrdersPacks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    imageUrls: [
      { url: '/models/akusha/AKU-029_main.jpg', label: '№29 · Дыхабельные мокасины · Коньячные', category: 'pack' },
    ],
    upperMaterial: 'Натуральная перфорированная дышащая кожа',
    soleType: 'Гибкая мокасиновая подошва с воздушными каналами',
    seasonLabel: 'Март–Декабрь (пик Май–Июль)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 11, 15): Дыхабельные мокасины · Коньячные (доля 18,93% в группе). Годовой план продаж: 319 выкупленных пар. Цена реализации, себестоимость и % выкупа в исходном документе помечены «уточнить».',
    priority: 'Средний',
  },
  {
    id: 'scen-akusha-030',
    code: 'AKU-030',
    pdfModelNumLabel: '№30',
    title: 'Дыхабельные мокасины · Тёмно-коричневые (Модель №30)',
    subtitle: 'Дыхабельные мокасины · План 2027: 439 выкупленных пар (цену, себестоимость и % выкупа уточнить)',
    groupTitle: 'Дыхабельные мокасины',
    colorNameRu: 'Тёмно-коричневый эспрессо с перфорацией',
    swatchHex: '#3E2A1E',
    bandHex: '#251912',
    retailPriceRub: 0,
    unitCostRub: 0,
    buyoutRatePct: 0,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 16, 39, 62, 78, 68, 46, 30, 33, 41, 26],
    monthlyOrdersPacks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    imageUrls: [
      { url: '/models/akusha/AKU-030_main.jpg', label: '№30 · Дыхабельные мокасины · Тёмно-коричневые', category: 'pack' },
    ],
    upperMaterial: 'Натуральная перфорированная дышащая кожа',
    soleType: 'Гибкая мокасиновая подошва с воздушными каналами',
    seasonLabel: 'Март–Декабрь (пик Май–Июль)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 11, 15): Дыхабельные мокасины · Тёмно-коричневые (доля 26,05% в группе). Годовой план продаж: 439 выкупленных пар. Цена реализации, себестоимость и % выкупа в исходном документе помечены «уточнить».',
    priority: 'Высокий',
  },
  {
    id: 'scen-akusha-031',
    code: 'AKU-031',
    pdfModelNumLabel: '№31',
    title: 'Дыхабельные мокасины · Чёрные (Модель №31)',
    subtitle: 'Дыхабельные мокасины · План 2027: 540 выкупленных пар (цену, себестоимость и % выкупа уточнить)',
    groupTitle: 'Дыхабельные мокасины',
    colorNameRu: 'Чёрный классический с перфорацией',
    swatchHex: '#1D1E21',
    bandHex: '#111214',
    retailPriceRub: 0,
    unitCostRub: 0,
    buyoutRatePct: 0,
    unitsInPack: 1,
    monthlyPacks: [0, 0, 19, 48, 77, 96, 83, 56, 37, 41, 51, 32],
    monthlyOrdersPacks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    imageUrls: [
      { url: '/models/akusha/AKU-031_main.jpg', label: '№31 · Дыхабельные мокасины · Чёрные', category: 'pack' },
    ],
    upperMaterial: 'Натуральная перфорированная дышащая кожа',
    soleType: 'Гибкая мокасиновая подошва с воздушными каналами',
    seasonLabel: 'Март–Декабрь (пик Май–Июль)',
    description:
      'Утверждённый план AKUSHA 2027 (стр. 11, 15): Дыхабельные мокасины · Чёрные (доля 32,05% в группе — лидер продаж среди мокасин). Годовой план продаж: 540 выкупленных пар. Цена реализации, себестоимость и % выкупа в исходном документе помечены «уточнить».',
    priority: 'Высокий',
  },
];

function buildAkushaCommercialPlan(
  scenarioId: number,
  seed: RawAkushaCardSeed
): ScenarioCommercialPlan {
  const firstActiveIdx = seed.monthlyPacks.findIndex((p) => p > 0);
  const salesStartMonthIdx = firstActiveIdx >= 0 ? firstActiveIdx : 0;
  const monthlyRevenuesRubOverride = seed.monthlyPacks.map(
    (packs) => packs * seed.retailPriceRub
  );
  const monthlyOrdersRub = seed.monthlyOrdersPacks.map(
    (ord) => ord * seed.retailPriceRub
  );
  const firstOrderPacks = seed.monthlyPacks
    .slice(salesStartMonthIdx, Math.min(12, salesStartMonthIdx + 3))
    .reduce((acc, v) => acc + v, 0);

  return {
    scenarioId,
    monthlyPacks: [...seed.monthlyPacks],
    monthlyPricesRub: Array(12).fill(seed.retailPriceRub),
    monthlyReceiptsPacks: [...seed.monthlyPacks],
    monthlyRevenuesRubOverride,
    monthlyOrdersPacks: [...seed.monthlyOrdersPacks],
    monthlyOrdersRub,
    buyoutRatePct: seed.buyoutRatePct,
    initialStockPacks: 0,
    firstOrderPacks,
    nextOrderDateLabel: 'По графику поставок 2027',
    salesStartMonthIdx,
    warehouseArrivalMonthIdx: salesStartMonthIdx,
    warehouseArrivalDateLabel: 'К старту сезона',
  };
}

export const AKUSHA_2027_MODELS: ScenarioModelSpec[] = RAW_AKUSHA_2027_SEEDS.map(
  (seed) => {
    const gallery: GalleryMediaItem[] = seed.imageUrls.map((img, idx) => ({
      id: `${seed.id}-photo-${idx + 1}`,
      category: img.category,
      label: img.label,
      url: img.url,
      originalUrl: img.url,
      isMain: idx === 0,
    }));

    const paletteColors: PackColor[] = seed.paletteColors || [
      {
        nameRu: seed.colorNameRu,
        pantone: `AKUSHA ${seed.pdfModelNumLabel}`,
        hex: seed.swatchHex,
        bandHex: seed.bandHex,
        textHex: '#FFFFFF',
      },
    ];

    const plan202706 = buildAkushaCommercialPlan(AKUSHA_2027_SCENARIO_ID, seed);
    const plan1 = buildAkushaCommercialPlan(1, seed);
    const plan2 = buildAkushaCommercialPlan(2, seed);
    const plan3 = buildAkushaCommercialPlan(3, seed);

    return {
      id: seed.id,
      code: seed.code,
      title: seed.title,
      subtitle: seed.subtitle,
      brandId: 'BORNERS',
      customBrandLabel: 'AKUSHA',
      categoryLabel: `Обувь · ${seed.groupTitle}`,
      primaryUnitLabel: 'пар',
      secondaryUnitLabel: 'пар',
      wbArticle: `AKUSHA ${seed.pdfModelNumLabel}`,
      modelStageStatus:
        seed.retailPriceRub > 0 && seed.unitCostRub > 0 ? 'Масштабирование' : 'В разработке',
      description: seed.description,
      launchStatus:
        seed.retailPriceRub > 0 && seed.unitCostRub > 0 ? 'Утверждено' : 'В плане',
      unitsInPack: seed.unitsInPack,
      retailPriceRub: seed.retailPriceRub,
      unitCostRub: seed.unitCostRub,
      marketplaceFeePct: 24,
      logisticsRub: 180,
      adsPct: 10,
      buyoutRatePct: seed.buyoutRatePct,
      procureByOrdersVolume: true,
      responsiblePerson: `Бренд-команда AKUSHA · Группа «${seed.groupTitle}»`,
      priority: seed.priority,
      hasActualSalesOrPurchases: false,
      palettes: [
        {
          id: `pal-${seed.id}`,
          title:
            seed.code === 'AKU-009'
              ? 'ПАЛИТРА 8 ЦВЕТОВ (№09–16 · ОБЩАЯ КАРТОЧКА)'
              : `ЦВЕТОВАЯ КАРТА · ${seed.pdfModelNumLabel}`,
          subtitle:
            seed.code === 'AKU-009'
              ? '8 цветов в общей карточке · 1 пара в коробке'
              : '1 пара в коробке · размерный ряд 39–45',
          statusLabel: 'Утверждено в PDF 2027',
          imageUrl: seed.imageUrls[0]?.url,
          colors: paletteColors,
        },
      ],
      gallery,
      attachedPdfs: [{ ...AKUSHA_2027_PDF_ATTACHMENT }],
      construction: {
        type: seed.groupTitle,
        fit: 'Анатомическая колодка (размеры 39–45)',
        sideSeam: seed.soleType,
        frontPanel: seed.upperMaterial,
        gusset: seed.seasonLabel,
        seams: 'Усиленная прошивка и клеевой контур по ТЗ фабрики',
      },
      fabric: {
        composition: seed.upperMaterial,
        density: seed.soleType,
        knitType: seed.groupTitle,
        touchFeel: seed.seasonLabel,
        swatchHex: seed.swatchHex,
      },
      waistband: {
        width: 'Размерный ряд 39–45',
        type: seed.soleType,
        colorRule: seed.colorNameRu,
        logoRepeat: 'Тиснение AKUSHA на стельке и язычке',
        elasticity:
          seed.buyoutRatePct > 0
            ? `Плановый выкуп ${seed.buyoutRatePct}%`
            : 'Процент выкупа уточнить',
        bandBgHex: seed.bandHex,
        bandTextHex: '#FFFFFF',
      },
      productionSteps: [
        {
          id: `${seed.id}-step-1`,
          stepNum: 1,
          title: 'Спецификация, колодка и фото образца в плане 2027',
          datesLabel: 'Утверждено (PDF 2027)',
          monthIndex: 0,
          status: 'done',
          confirmation: 'factory_confirmed',
        },
        {
          id: `${seed.id}-step-2`,
          stepNum: 2,
          title: 'Запуск партий под помесячный график заказов и выкупов',
          datesLabel: seed.seasonLabel,
          monthIndex: plan202706.salesStartMonthIdx,
          status: 'planned',
          confirmation:
            seed.retailPriceRub > 0 && seed.unitCostRub > 0
              ? 'factory_confirmed'
              : 'needs_confirmation',
        },
      ],
      plansByScenario: {
        1: plan1,
        2: plan2,
        3: plan3,
        [AKUSHA_2027_SCENARIO_ID]: plan202706,
      },
    };
  }
);
