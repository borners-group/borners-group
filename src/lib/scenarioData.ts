import {
  ACTING_2027_SCENARIO_DEF,
  ACTING_2027_SCENARIO_ID,
  ACTING_2027_SCENARIO_MODELS,
  getActingSkuByWbOrVendor,
} from './actingAssortment2027.ts';
import {
  S1_100M_NEW_VARIANTS,
  S1_100M_SCENARIO_MODELS,
  getS1NewVariantByCodeOrId,
  isConfirmedBornersActingSku,
  isUnverifiedActingSku,
} from './scenarioS1_100M.ts';

export type ModelPriorityLevel = 'Высший' | 'Высокий' | 'Средний' | 'Не указан';

export interface PackColor {
  nameRu: string;
  pantone: string;
  hex: string;
  bandHex: string;
  textHex: string;
}

export interface PalettePack {
  id: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  imageUrl?: string;
  colors: PackColor[];
}

export interface AttachedModelPdf {
  id: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  staticUrl?: string;
}

export interface ProductionStep {
  id: string;
  stepNum: number;
  title: string;
  datesLabel: string;
  monthIndex: number; // 0 = Jan, 1 = Feb, 2 = Mar, 3 = Apr ...
  dayOfMonth?: number;
  status: 'done' | 'in_progress' | 'planned';
  confirmation: 'factory_confirmed' | 'planned' | 'needs_confirmation';
}

import type {
  ChannelSplitPct,
  GalleryCategoryV11,
  SharedSkuSupplyAndFact,
} from './unifiedBusinessEngine.ts';

export interface GalleryMediaItem {
  id: string;
  category: GalleryCategoryV11;
  label: string;
  url?: string;
  originalUrl?: string;
  isMain: boolean;
}

export interface ScenarioCommercialPlan {
  scenarioId: number;
  monthlyPacks: number[]; // 12 months (Jan..Dec)
  monthlyPricesRub: number[]; // 12 months (Jan..Dec)
  monthlyReceiptsPacks: number[]; // 12 months warehouse arrivals in packs
  initialStockPacks: number;
  firstOrderPacks: number;
  nextOrderDateLabel: string;
  salesStartMonthIdx: number; // e.g., 2 = March (0-indexed)
  warehouseArrivalMonthIdx: number; // e.g., 2 = March, or 3 = April (conflict!)
  warehouseArrivalDateLabel: string; // e.g., '18 марта' or '12 апреля'
  channelSplitPct?: ChannelSplitPct;
}

export type ModelPassportStageStatus =
  | 'Идея'
  | 'В разработке'
  | 'Тест'
  | 'Масштабирование'
  | 'Действующий'
  | 'Приостановлен';

export interface ScenarioModelSpec {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  brandId: 'BORNERS' | 'NA_TELE';
  customBrandLabel?: string; // редактируемый бренд (BORNERS / FUKAI / НА ТЕЛЕ / свой бренд)
  wbArticle?: string; // редактируемый артикул WB
  modelStageStatus?: ModelPassportStageStatus; // статус жизненного цикла модели (Идея / В разработке / Тест / Масштабирование / Действующий / Приостановлен)
  description?: string; // текстовое описание и примечания к модели
  launchStatus: 'В плане' | 'В разработке' | 'Утверждено' | 'В архиве';
  unitsInPack: number;
  retailPriceRub: number;
  unitCostRub: number; // закупочная себестоимость с доставкой в РФ за 1 комплект
  marketplaceFeePct: number; // комиссия площадки %
  logisticsRub: number; // логистика ₽ / комплект
  adsPct: number; // реклама %
  responsiblePerson: string;
  priority?: ModelPriorityLevel;
  hasActualSalesOrPurchases: boolean;
  palettes: PalettePack[];
  gallery: GalleryMediaItem[];
  attachedPdfs?: AttachedModelPdf[];
  sharedSupplyAndFact?: SharedSkuSupplyAndFact;
  construction: {
    type: string;
    fit: string;
    sideSeam: string;
    frontPanel: string;
    gusset: string;
    seams: string;
  };
  fabric: {
    composition: string;
    density: string;
    knitType: string;
    touchFeel: string;
    swatchHex: string;
  };
  waistband: {
    width: string;
    type: string;
    colorRule: string;
    logoRepeat: string;
    elasticity: string;
    bandBgHex: string;
    bandTextHex: string;
  };
  productionSteps: ProductionStep[];
  plansByScenario: Record<number, ScenarioCommercialPlan>;
}

export interface GrowthScenarioDef {
  id: number;
  title: string;
  monthlyTargetMln: number;
  targetMonthLabel: string;
  targetMonthIdx: number; // 11 = Декабрь
  scopeLabel: string;
  includedBrands: ('BORNERS' | 'NA_TELE')[];
  year: number;
}

export const MONTHS_SHORT_RU = [
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

export const MONTHS_FULL_GENITIVE_RU = [
  'январе',
  'феврале',
  'марте',
  'апреле',
  'мае',
  'июне',
  'июле',
  'августе',
  'сентябре',
  'октябре',
  'ноябре',
  'декабре',
];

export const INITIAL_SCENARIOS: GrowthScenarioDef[] = [
  {
    id: 1,
    title: 'Сценарий №1',
    monthlyTargetMln: 100,
    targetMonthLabel: 'Декабрь 2027',
    targetMonthIdx: 11,
    scopeLabel: 'BORNERS',
    includedBrands: ['BORNERS'],
    year: 2027,
  },
  {
    id: 2,
    title: 'Сценарий №2',
    monthlyTargetMln: 150,
    targetMonthLabel: 'Декабрь 2027',
    targetMonthIdx: 11,
    scopeLabel: 'группа',
    includedBrands: ['BORNERS', 'NA_TELE'],
    year: 2027,
  },
  {
    id: 3,
    title: 'Сценарий №3',
    monthlyTargetMln: 200,
    targetMonthLabel: 'Декабрь 2027',
    targetMonthIdx: 11,
    scopeLabel: 'группа',
    includedBrands: ['BORNERS', 'NA_TELE'],
    year: 2027,
  },
  ACTING_2027_SCENARIO_DEF,
];

function buildPlan(
  scenarioId: number,
  monthlyPacks: number[],
  priceRub: number,
  firstOrderPacks: number,
  receiptsPacks: number[]
): ScenarioCommercialPlan {
  return {
    scenarioId,
    monthlyPacks,
    monthlyPricesRub: Array(12).fill(priceRub),
    monthlyReceiptsPacks: receiptsPacks,
    initialStockPacks: 0,
    firstOrderPacks,
    nextOrderDateLabel: '10 мая 2027',
    salesStartMonthIdx: 2, // Март
    warehouseArrivalMonthIdx: 2, // Март (18 марта)
    warehouseArrivalDateLabel: '18 марта',
  };
}

export const INITIAL_SCENARIO_MODELS: ScenarioModelSpec[] = [
  {
    id: 'scen-model-001',
    code: '№001',
    title: 'COLOR 4 PACK',
    subtitle: 'Боксеры мужские · 4 шт. в комплекте',
    brandId: 'BORNERS',
    launchStatus: 'В разработке',
    unitsInPack: 4,
    retailPriceRub: 1290,
    unitCostRub: 420,
    marketplaceFeePct: 24,
    logisticsRub: 115,
    adsPct: 10,
    responsiblePerson: 'А. Соколова (Продакт-лид)',
    hasActualSalesOrPurchases: true,
    palettes: [
      {
        id: 'pal-sorbet',
        title: 'ПАЛИТРА №1 — SORBET CLUB',
        subtitle: '4 шт. в комплекте',
        statusLabel: 'Заполнено',
        colors: [
          {
            nameRu: 'Пыльная клубника',
            pantone: 'PANTONE 16-1620 TCX',
            hex: '#D48B92',
            bandHex: '#C67A82',
            textHex: '#9E545D',
          },
          {
            nameRu: 'Абрикосовый сорбет',
            pantone: 'PANTONE 15-1239 TCX',
            hex: '#E49F75',
            bandHex: '#D68D61',
            textHex: '#A65F36',
          },
          {
            nameRu: 'Фисташковое мороженое',
            pantone: 'PANTONE 14-6011 TCX',
            hex: '#A3BE9D',
            bandHex: '#8FAD88',
            textHex: '#5D7B57',
          },
          {
            nameRu: 'Лавандовое молоко',
            pantone: 'PANTONE 15-3817 TCX',
            hex: '#B0A3C8',
            bandHex: '#9D8EB7',
            textHex: '#695B82',
          },
        ],
      },
      {
        id: 'pal-riviera',
        title: 'ПАЛИТРА №2 — RIVIERA',
        subtitle: '4 шт. в комплекте',
        statusLabel: 'Заполнено',
        colors: [
          {
            nameRu: 'Морской бриз',
            pantone: 'PANTONE 16-4519 TCX',
            hex: '#6999B3',
            bandHex: '#5888A2',
            textHex: '#356078',
          },
          {
            nameRu: 'Шалфейный лист',
            pantone: 'PANTONE 16-5808 TCX',
            hex: '#89A89B',
            bandHex: '#769689',
            textHex: '#4B6B5E',
          },
          {
            nameRu: 'Тёплый песок',
            pantone: 'PANTONE 14-1118 TCX',
            hex: '#D8C29D',
            bandHex: '#C9B18A',
            textHex: '#8C744E',
          },
          {
            nameRu: 'Терракотовый закат',
            pantone: 'PANTONE 16-1526 TCX',
            hex: '#D68A74',
            bandHex: '#C47760',
            textHex: '#8F4833',
          },
        ],
      },
    ],
    gallery: [
      { id: 'g-1', category: 'pack', label: 'Весь комплект', isMain: true },
      { id: 'g-2', category: 'single', label: 'Отдельное изделие', isMain: false },
      { id: 'g-3', category: 'waistband', label: 'Резинка', isMain: false },
      { id: 'g-4', category: 'fabric', label: 'Ткань', isMain: false },
      { id: 'g-5', category: 'fit', label: 'Посадка', isMain: false },
      { id: 'g-6', category: 'video', label: 'Видео', isMain: false },
    ],
    construction: {
      type: 'Боксеры (trunks)',
      fit: 'Средняя, комфортная на каждый день',
      sideSeam: '≈ 25 см (размер L)',
      frontPanel: 'Анатомическая 3D, двойной слой',
      gusset: 'Да, комфорт при движении, без задирания',
      seams: 'Плоские мягкие швы (Flatlock)',
    },
    fabric: {
      composition: '93% хлопок компакт-пенье, 7% спандекс',
      density: '185 г/м²',
      knitType: 'Кулирная гладь премиум',
      touchFeel: 'Мягкая матовая фактура',
      swatchHex: '#D48B92',
    },
    waistband: {
      width: '38 мм',
      type: 'Мягкая жаккардовая резинка с микрофиброй',
      colorRule: 'В тон ткани каждого боксера',
      logoRepeat: 'В тон, на 15–20% темнее/светлее (без белого и чёрного)',
      elasticity: 'Не передавливает, не скручивается',
      bandBgHex: '#C67A82',
      bandTextHex: '#9E545D',
    },
    productionSteps: [
      {
        id: 'ps-1',
        stepNum: 1,
        title: 'Разработка и утверждение ТЗ',
        datesLabel: 'до 20 января',
        monthIndex: 0,
        dayOfMonth: 20,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps-2',
        stepNum: 2,
        title: 'Изготовление образцов',
        datesLabel: 'до 5 февраля',
        monthIndex: 1,
        dayOfMonth: 5,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps-3',
        stepNum: 3,
        title: 'Утверждение образцов',
        datesLabel: 'до 12 февраля',
        monthIndex: 1,
        dayOfMonth: 12,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps-4',
        stepNum: 4,
        title: 'Производство партии',
        datesLabel: '15 фев – 10 мар',
        monthIndex: 2,
        dayOfMonth: 10,
        status: 'in_progress',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps-5',
        stepNum: 5,
        title: 'Доставка в Россию',
        datesLabel: '11 – 17 марта',
        monthIndex: 2,
        dayOfMonth: 17,
        status: 'planned',
        confirmation: 'planned',
      },
      {
        id: 'ps-6',
        stepNum: 6,
        title: 'Поступление на склад',
        datesLabel: '18 марта',
        monthIndex: 2,
        dayOfMonth: 18,
        status: 'planned',
        confirmation: 'planned',
      },
      {
        id: 'ps-7',
        stepNum: 7,
        title: 'Начало продаж',
        datesLabel: 'с 25 марта',
        monthIndex: 2,
        dayOfMonth: 25,
        status: 'planned',
        confirmation: 'planned',
      },
    ],
    plansByScenario: {
      // В Сценарии №1: годовая сумма = 67 442 компл. * 1 290 ₽ ≈ 87,0 млн ₽, декабрь = 8 372 компл. ≈ 10,8 млн ₽ (10,8% цели)
      1: buildPlan(
        1,
        [2480, 2945, 3565, 4265, 4885, 5350, 5815, 6355, 6900, 7675, 8835, 8372],
        1290,
        7500,
        [7500, 0, 12000, 0, 15000, 0, 18000, 0, 20000, 0, 0, 0]
      ),
      2: buildPlan(
        2,
        [3100, 3680, 4450, 5330, 6100, 6680, 7270, 7940, 8620, 9590, 11040, 10465],
        1290,
        9500,
        [9500, 0, 15000, 0, 19000, 0, 22000, 0, 25000, 0, 0, 0]
      ),
      3: buildPlan(
        3,
        [4200, 4980, 6020, 7200, 8250, 9040, 9820, 10740, 11660, 12960, 14920, 14150],
        1290,
        12500,
        [12500, 0, 20000, 0, 25000, 0, 30000, 0, 34000, 0, 0, 0]
      ),
    },
  },
  {
    id: 'scen-model-002',
    code: '№002',
    title: 'BASIC 4 PACK',
    subtitle: 'Боксеры мужские · 4 шт. в комплекте',
    brandId: 'BORNERS',
    launchStatus: 'Утверждено',
    unitsInPack: 4,
    retailPriceRub: 1290,
    unitCostRub: 390,
    marketplaceFeePct: 24,
    logisticsRub: 110,
    adsPct: 9,
    responsiblePerson: 'А. Соколова (Продакт-лид)',
    hasActualSalesOrPurchases: true,
    palettes: [
      {
        id: 'pal-nordic',
        title: 'ПАЛИТРА №1 — NORDIC ESSENTIAL',
        subtitle: '4 шт. в комплекте',
        statusLabel: 'Заполнено',
        colors: [
          {
            nameRu: 'Глубокий графит',
            pantone: 'PANTONE 19-4008 TCX',
            hex: '#36383F',
            bandHex: '#2B2D33',
            textHex: '#7A7E8A',
          },
          {
            nameRu: 'Полуночный синий',
            pantone: 'PANTONE 19-4024 TCX',
            hex: '#2F3E55',
            bandHex: '#253246',
            textHex: '#6E829E',
          },
          {
            nameRu: 'Северный шалфей',
            pantone: 'PANTONE 17-6212 TCX',
            hex: '#67786F',
            bandHex: '#56665E',
            textHex: '#96A89E',
          },
          {
            nameRu: 'Тёплый тауп',
            pantone: 'PANTONE 17-1312 TCX',
            hex: '#8C7D72',
            bandHex: '#7A6C61',
            textHex: '#B8A99E',
          },
        ],
      },
    ],
    gallery: [
      { id: 'g2-1', category: 'pack', label: 'Весь комплект', isMain: true },
      { id: 'g2-2', category: 'single', label: 'Отдельное изделие', isMain: false },
      { id: 'g2-3', category: 'waistband', label: 'Резинка', isMain: false },
      { id: 'g2-4', category: 'fabric', label: 'Ткань', isMain: false },
    ],
    construction: {
      type: 'Боксеры удлинённые (boxer briefs)',
      fit: 'Средняя, анатомическая фиксация',
      sideSeam: '≈ 26 см (размер L)',
      frontPanel: 'Анатомическая 3D, двойной слой',
      gusset: 'Да, комфорт при движении',
      seams: 'Плоские эластичные швы (Flatlock)',
    },
    fabric: {
      composition: '93% хлопок компакт-пенье, 7% эластан',
      density: '190 г/м²',
      knitType: 'Кулирная гладь Silky Touch',
      touchFeel: 'Плотная шелковистая фактура',
      swatchHex: '#36383F',
    },
    waistband: {
      width: '38 мм',
      type: 'Мягкая жаккардовая с микрофиброй',
      colorRule: 'В тон ткани каждого боксера',
      logoRepeat: 'Матовый тон-в-тон рельеф',
      elasticity: 'Мягкая посадка 360°',
      bandBgHex: '#2F3E55',
      bandTextHex: '#7A8EA8',
    },
    productionSteps: [
      {
        id: 'ps2-1',
        stepNum: 1,
        title: 'Разработка и утверждение ТЗ',
        datesLabel: 'до 10 января',
        monthIndex: 0,
        dayOfMonth: 10,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps2-2',
        stepNum: 2,
        title: 'Изготовление образцов',
        datesLabel: 'до 20 января',
        monthIndex: 0,
        dayOfMonth: 20,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps2-3',
        stepNum: 3,
        title: 'Утверждение образцов',
        datesLabel: 'до 25 января',
        monthIndex: 0,
        dayOfMonth: 25,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps2-4',
        stepNum: 4,
        title: 'Производство партии',
        datesLabel: '1 – 25 февраля',
        monthIndex: 1,
        dayOfMonth: 25,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps2-5',
        stepNum: 5,
        title: 'Доставка в Россию',
        datesLabel: '26 фев – 8 мар',
        monthIndex: 2,
        dayOfMonth: 8,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps2-6',
        stepNum: 6,
        title: 'Поступление на склад',
        datesLabel: '10 марта',
        monthIndex: 2,
        dayOfMonth: 10,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps2-7',
        stepNum: 7,
        title: 'Начало продаж',
        datesLabel: 'с 15 марта',
        monthIndex: 2,
        dayOfMonth: 15,
        status: 'in_progress',
        confirmation: 'factory_confirmed',
      },
    ],
    plansByScenario: {
      // Годовая сумма ≈ 112 млн ₽, декабрь = 14,2 млн ₽ (14,2% цели)
      1: buildPlan(
        1,
        [3200, 3800, 4600, 5500, 6300, 6900, 7500, 8200, 8900, 9900, 11015, 11008],
        1290,
        9000,
        [9000, 0, 15000, 0, 20000, 0, 22000, 0, 25000, 0, 0, 0]
      ),
      2: buildPlan(
        2,
        [4100, 4850, 5880, 7040, 8060, 8820, 9600, 10500, 11400, 12650, 14100, 14080],
        1290,
        11500,
        [11500, 0, 19000, 0, 25000, 0, 28000, 0, 32000, 0, 0, 0]
      ),
      3: buildPlan(
        3,
        [5400, 6400, 7750, 9280, 10620, 11640, 12650, 13840, 15020, 16680, 18580, 18550],
        1290,
        15000,
        [15000, 0, 25000, 0, 33000, 0, 38000, 0, 42000, 0, 0, 0]
      ),
    },
  },
  {
    id: 'scen-model-003',
    code: '№003',
    title: 'BLACK LINE 3 PACK',
    subtitle: 'Боксеры мужские · 3 шт. в комплекте',
    brandId: 'BORNERS',
    launchStatus: 'В плане',
    unitsInPack: 3,
    retailPriceRub: 1190,
    unitCostRub: 375,
    marketplaceFeePct: 24,
    logisticsRub: 105,
    adsPct: 9,
    responsiblePerson: 'Д. Волков (Категорийный менеджер)',
    hasActualSalesOrPurchases: false,
    palettes: [
      {
        id: 'pal-obsidian',
        title: 'ПАЛИТРА №1 — OBSIDIAN CORE',
        subtitle: '3 шт. в комплекте',
        statusLabel: 'Заполнено',
        colors: [
          {
            nameRu: 'Угольно-чёрный',
            pantone: 'PANTONE 19-4007 TCX',
            hex: '#222326',
            bandHex: '#18191B',
            textHex: '#9CA3AF',
          },
          {
            nameRu: 'Чёрный оникс',
            pantone: 'PANTONE 19-0303 TCX',
            hex: '#2B2C30',
            bandHex: '#1F2023',
            textHex: '#A1A1AA',
          },
          {
            nameRu: 'Тёмный графит',
            pantone: 'PANTONE 19-3908 TCX',
            hex: '#35373C',
            bandHex: '#27292D',
            textHex: '#D4D4D8',
          },
        ],
      },
    ],
    gallery: [
      { id: 'g3-1', category: 'pack', label: 'Весь комплект', isMain: true },
      { id: 'g3-2', category: 'single', label: 'Отдельное изделие', isMain: false },
      { id: 'g3-3', category: 'waistband', label: 'Резинка', isMain: false },
    ],
    construction: {
      type: 'Боксеры классические (trunks)',
      fit: 'Средняя универсальная',
      sideSeam: '≈ 24,5 см (размер L)',
      frontPanel: 'Анатомическая профилированная',
      gusset: 'Да, двойной слой без заднего шва',
      seams: 'Плоские эластичные (Flatlock)',
    },
    fabric: {
      composition: '95% гребенной хлопок Compact, 5% эластан',
      density: '190 г/м²',
      knitType: 'Single Jersey Enzyme Wash',
      touchFeel: 'Гладкий угольный хлопок',
      swatchHex: '#222326',
    },
    waistband: {
      width: '38 мм',
      type: 'Жаккард повышенной плотности',
      colorRule: 'Чёрный с графитовым логотипом',
      logoRepeat: 'BORNERS × 3 (повтор)',
      elasticity: 'Высокая, без скручивания',
      bandBgHex: '#232428',
      bandTextHex: '#9CA3AF',
    },
    productionSteps: [
      {
        id: 'ps3-1',
        stepNum: 1,
        title: 'Разработка и утверждение ТЗ',
        datesLabel: 'до 25 января',
        monthIndex: 0,
        dayOfMonth: 25,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps3-2',
        stepNum: 2,
        title: 'Изготовление образцов',
        datesLabel: 'до 10 февраля',
        monthIndex: 1,
        dayOfMonth: 10,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps3-3',
        stepNum: 3,
        title: 'Утверждение образцов',
        datesLabel: 'до 18 февраля',
        monthIndex: 1,
        dayOfMonth: 18,
        status: 'in_progress',
        confirmation: 'needs_confirmation',
      },
      {
        id: 'ps3-4',
        stepNum: 4,
        title: 'Производство партии',
        datesLabel: '20 фев – 15 мар',
        monthIndex: 2,
        dayOfMonth: 15,
        status: 'planned',
        confirmation: 'planned',
      },
      {
        id: 'ps3-5',
        stepNum: 5,
        title: 'Доставка в Россию',
        datesLabel: '16 – 24 марта',
        monthIndex: 2,
        dayOfMonth: 24,
        status: 'planned',
        confirmation: 'planned',
      },
      {
        id: 'ps3-6',
        stepNum: 6,
        title: 'Поступление на склад',
        datesLabel: '25 марта',
        monthIndex: 2,
        dayOfMonth: 25,
        status: 'planned',
        confirmation: 'planned',
      },
      {
        id: 'ps3-7',
        stepNum: 7,
        title: 'Начало продаж',
        datesLabel: 'с 1 апреля',
        monthIndex: 3,
        dayOfMonth: 1,
        status: 'planned',
        confirmation: 'planned',
      },
    ],
    plansByScenario: {
      // Годовая сумма ≈ 95 млн ₽, декабрь = 11,9 млн ₽ (11,9% цели)
      1: buildPlan(
        1,
        [2900, 3450, 4200, 5020, 5750, 6300, 6850, 7480, 8120, 9030, 10730, 10000],
        1190,
        12000,
        [12000, 0, 16000, 0, 20000, 0, 22000, 0, 24000, 0, 0, 0]
      ),
      2: buildPlan(
        2,
        [3700, 4400, 5350, 6400, 7330, 8030, 8730, 9540, 10350, 11510, 13680, 12750],
        1190,
        15000,
        [15000, 0, 20000, 0, 25000, 0, 28000, 0, 30000, 0, 0, 0]
      ),
      3: buildPlan(
        3,
        [4900, 5820, 7080, 8470, 9700, 10630, 11550, 12620, 13700, 15230, 18100, 16870],
        1190,
        20000,
        [20000, 0, 26000, 0, 32000, 0, 36000, 0, 40000, 0, 0, 0]
      ),
    },
  },
  {
    id: 'scen-model-004',
    code: '№004',
    title: 'SECOND SKIN SET',
    subtitle: 'Бесшовный комплект · бралетт + брифы',
    brandId: 'NA_TELE',
    launchStatus: 'В разработке',
    unitsInPack: 2,
    retailPriceRub: 1690,
    unitCostRub: 510,
    marketplaceFeePct: 23,
    logisticsRub: 110,
    adsPct: 11,
    responsiblePerson: 'М. Лебедева (Бренд-директор НА ТЕЛЕ)',
    hasActualSalesOrPurchases: false,
    palettes: [
      {
        id: 'pal-nude',
        title: 'ПАЛИТРА №1 — SKIN TONES',
        subtitle: '2 предмета в комплекте',
        statusLabel: 'Заполнено',
        colors: [
          {
            nameRu: 'Тёплый миндаль',
            pantone: 'PANTONE 15-1315 TCX',
            hex: '#D5B29C',
            bandHex: '#C6A18A',
            textHex: '#7A5B47',
          },
          {
            nameRu: 'Овсяное молоко',
            pantone: 'PANTONE 13-1009 TCX',
            hex: '#E6D7C8',
            bandHex: '#D8C7B6',
            textHex: '#847262',
          },
          {
            nameRu: 'Тёмный какао',
            pantone: 'PANTONE 18-1222 TCX',
            hex: '#7E5E52',
            bandHex: '#6D4F44',
            textHex: '#D4B9AE',
          },
        ],
      },
    ],
    gallery: [
      { id: 'g4-1', category: 'pack', label: 'Весь комплект', isMain: true },
      { id: 'g4-2', category: 'single', label: 'Отдельное изделие', isMain: false },
      { id: 'g4-3', category: 'fabric', label: 'Ткань', isMain: false },
      { id: 'g4-4', category: 'fit', label: 'Посадка', isMain: false },
    ],
    construction: {
      type: 'Бесшовный комплект Second Skin (бралетт + брифы)',
      fit: 'Невесомая анатомическая посадка без швов',
      sideSeam: 'Лазерный крой Clean-Cut (клеевой шов)',
      frontPanel: 'Двухслойная мягкая чашка без косточек',
      gusset: '100% органический хлопок (внутренний слой)',
      seams: 'Невидимая ультразвуковая склейка под одеждой',
    },
    fabric: {
      composition: '78% микромодал Sensil, 22% эластан Lycra',
      density: '145 г/м²',
      knitType: 'Warp Knit Free-Cut (не осыпается)',
      touchFeel: 'Эффект второй кожи, пудровый финиш',
      swatchHex: '#D5B29C',
    },
    waistband: {
      width: 'Бесшовный пояс 22 мм',
      type: 'Внутренняя силиконовая микро-лента Free-Cut',
      colorRule: '100% совпадение с оттенком кожи',
      logoRepeat: 'Минималистичный термотрансфер НА ТЕЛЕ внутри',
      elasticity: 'Не оставляет следов на теле',
      bandBgHex: '#C6A18A',
      bandTextHex: '#7A5B47',
    },
    productionSteps: [
      {
        id: 'ps4-1',
        stepNum: 1,
        title: 'Разработка и утверждение ТЗ',
        datesLabel: 'до 1 февраля',
        monthIndex: 1,
        dayOfMonth: 1,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps4-2',
        stepNum: 2,
        title: 'Изготовление образцов',
        datesLabel: 'до 18 февраля',
        monthIndex: 1,
        dayOfMonth: 18,
        status: 'in_progress',
        confirmation: 'factory_confirmed',
      },
      {
        id: 'ps4-3',
        stepNum: 3,
        title: 'Утверждение образцов',
        datesLabel: 'до 26 февраля',
        monthIndex: 1,
        dayOfMonth: 26,
        status: 'planned',
        confirmation: 'needs_confirmation',
      },
      {
        id: 'ps4-4',
        stepNum: 4,
        title: 'Производство партии',
        datesLabel: '1 – 25 марта',
        monthIndex: 2,
        dayOfMonth: 25,
        status: 'planned',
        confirmation: 'planned',
      },
      {
        id: 'ps4-5',
        stepNum: 5,
        title: 'Доставка в Россию',
        datesLabel: '26 мар – 5 апр',
        monthIndex: 3,
        dayOfMonth: 5,
        status: 'planned',
        confirmation: 'planned',
      },
      {
        id: 'ps4-6',
        stepNum: 6,
        title: 'Поступление на склад',
        datesLabel: '8 апреля',
        monthIndex: 3,
        dayOfMonth: 8,
        status: 'planned',
        confirmation: 'planned',
      },
      {
        id: 'ps4-7',
        stepNum: 7,
        title: 'Начало продаж',
        datesLabel: 'с 15 апреля',
        monthIndex: 3,
        dayOfMonth: 15,
        status: 'planned',
        confirmation: 'planned',
      },
    ],
    plansByScenario: {
      1: buildPlan(
        1,
        [1500, 1800, 2200, 2800, 3400, 3900, 4400, 4900, 5400, 6100, 7200, 7600],
        1690,
        6000,
        [6000, 0, 9000, 0, 12000, 0, 14000, 0, 15000, 0, 0, 0]
      ),
      2: buildPlan(
        2,
        [2400, 2900, 3600, 4500, 5400, 6200, 7000, 7800, 8600, 9700, 11400, 12100],
        1690,
        9000,
        [9000, 0, 14000, 0, 18000, 0, 22000, 0, 24000, 0, 0, 0]
      ),
      3: buildPlan(
        3,
        [3400, 4100, 5100, 6400, 7600, 8800, 9900, 11000, 12200, 13700, 16100, 17100],
        1690,
        12500,
        [12500, 0, 20000, 0, 26000, 0, 30000, 0, 34000, 0, 0, 0]
      ),
    },
  },
  ...S1_100M_SCENARIO_MODELS,
  ...ACTING_2027_SCENARIO_MODELS,
];

// Расчёт экономики одного комплекта и модели в выбранном сценарии (снизу вверх по ТЗ п. 8)
export function computeModelScenarioMetrics(
  model: ScenarioModelSpec,
  scenario: GrowthScenarioDef
) {
  const plan =
    model.plansByScenario[scenario.id] ||
    model.plansByScenario[1] || {
      scenarioId: scenario.id,
      monthlyPacks: Array(12).fill(0),
      monthlyPricesRub: Array(12).fill(model.retailPriceRub),
      monthlyReceiptsPacks: Array(12).fill(0),
      initialStockPacks: 0,
      firstOrderPacks: 5000,
      nextOrderDateLabel: '15 мая 2027',
      salesStartMonthIdx: 2,
      warehouseArrivalMonthIdx: 2,
      warehouseArrivalDateLabel: '18 марта',
    };

  const actingSku = getActingSkuByWbOrVendor(model.code, model.title);
  const isUnmodifiedActingPlan =
    actingSku &&
    plan.monthlyPacks.every((p, idx) => p === actingSku.monthly[idx]?.buyouts_sets) &&
    plan.monthlyPricesRub.every(
      (pr, idx) => pr === actingSku.monthly[idx]?.realization_price_rub
    );

  const monthlyRevenuesRub = isUnmodifiedActingPlan
    ? actingSku.monthly.map((m) => m.revenue_rub)
    : plan.monthlyPacks.map(
        (packs, idx) => packs * (plan.monthlyPricesRub[idx] ?? model.retailPriceRub)
      );

  const annualRevenueRub = monthlyRevenuesRub.reduce((acc, v) => acc + v, 0);
  const annualPacks = plan.monthlyPacks.reduce((acc, v) => acc + v, 0);
  const annualUnits = annualPacks * model.unitsInPack;
  const avgMonthlyPacks = Math.round(annualPacks / 12);

  const avgRetailPriceRub =
    annualPacks > 0 ? Math.round(annualRevenueRub / annualPacks) : model.retailPriceRub;

  const noCostSpecified = model.unitCostRub <= 0;

  // Экономика одного комплекта:
  const feeRub = Math.round((avgRetailPriceRub * model.marketplaceFeePct) / 100);
  const adsRub = Math.round((avgRetailPriceRub * model.adsPct) / 100);
  const totalUnitVariableCostRub =
    model.unitCostRub + feeRub + model.logisticsRub + adsRub;
  const unitMarginRub = noCostSpecified
    ? 0
    : avgRetailPriceRub - totalUnitVariableCostRub;
  const unitMarginPct =
    !noCostSpecified && avgRetailPriceRub > 0
      ? Math.round((unitMarginRub / avgRetailPriceRub) * 1000) / 10
      : 0;

  // Выручка в целевом месяце (декабрь = индекс 11)
  const targetMonthIdx = scenario.targetMonthIdx ?? 11;
  const targetMonthRevenueRub = monthlyRevenuesRub[targetMonthIdx] || 0;
  const targetMonthPacks = plan.monthlyPacks[targetMonthIdx] || 0;
  const scenarioTargetRub =
    scenario.id === ACTING_2027_SCENARIO_ID
      ? 22_729_352
      : scenario.monthlyTargetMln * 1_000_000;
  const goalSharePct =
    scenarioTargetRub > 0
      ? Math.round((targetMonthRevenueRub / scenarioTargetRub) * 1000) / 10
      : 0;

  // Закупка / товарные затраты на год и плановая прибыль:
  const totalPurchaseNeedRub = isUnmodifiedActingPlan
    ? actingSku.totalCostOfGoodsRub
    : noCostSpecified
    ? 0
    : annualPacks * model.unitCostRub;
  const annualProfitRub =
    scenario.id === ACTING_2027_SCENARIO_ID || actingSku || noCostSpecified
      ? 0
      : annualPacks * unitMarginRub;

  // Помесячное движение остатков (Конечный остаток = начальный остаток + поступления − продажи)
  let runningStock = plan.initialStockPacks;
  const monthlyEndingStockPacks: number[] = [];
  const deficitMonths: { monthIdx: number; monthLabel: string; missingPacks: number }[] = [];

  for (let m = 0; m < 12; m++) {
    const receipt = plan.monthlyReceiptsPacks[m] || 0;
    const sales = plan.monthlyPacks[m] || 0;
    const ending = runningStock + receipt - sales;
    monthlyEndingStockPacks.push(ending);
    if (ending < 0) {
      deficitMonths.push({
        monthIdx: m,
        monthLabel: MONTHS_SHORT_RU[m],
        missingPacks: Math.abs(ending),
      });
    }
    runningStock = ending;
  }

  // Проверка конфликта сроков (Тест 07): старт продаж раньше поступления на склад
  const hasScheduleConflict =
    plan.salesStartMonthIdx < plan.warehouseArrivalMonthIdx;
  const scheduleConflictMessage = hasScheduleConflict
    ? `План продаж начинается в ${
        MONTHS_FULL_GENITIVE_RU[plan.salesStartMonthIdx] || 'марте'
      }, но товар поступит на склад только ${plan.warehouseArrivalDateLabel}`
    : null;

  return {
    plan,
    monthlyRevenuesRub,
    annualRevenueRub,
    annualPacks,
    annualUnits,
    avgMonthlyPacks,
    avgRetailPriceRub,
    feeRub,
    adsRub,
    unitMarginRub,
    unitMarginPct,
    targetMonthRevenueRub,
    targetMonthPacks,
    goalSharePct,
    totalPurchaseNeedRub,
    annualProfitRub,
    monthlyEndingStockPacks,
    deficitMonths,
    hasScheduleConflict,
    scheduleConflictMessage,
  };
}

export const PRIORITY_WEIGHTS: Record<ModelPriorityLevel, number> = {
  Высший: 1.4,
  Высокий: 1.15,
  Средний: 0.9,
  'Не указан': 0.75,
};

export function getModelPriority(model: ScenarioModelSpec): ModelPriorityLevel {
  if (
    model.priority === 'Высший' ||
    model.priority === 'Высокий' ||
    model.priority === 'Средний' ||
    model.priority === 'Не указан'
  ) {
    return model.priority;
  }
  const s1Var =
    getS1NewVariantByCodeOrId(model.code) || getS1NewVariantByCodeOrId(model.id);
  if (s1Var) {
    return s1Var.priorityLabel;
  }
  const resp = model.responsiblePerson || '';
  if (resp.includes('Высший')) return 'Высший';
  if (resp.includes('Высокий')) return 'Высокий';
  if (resp.includes('Средний')) return 'Средний';
  return 'Не указан';
}

export function cycleModelPriority(current: ModelPriorityLevel): ModelPriorityLevel {
  const order: ModelPriorityLevel[] = ['Высший', 'Высокий', 'Средний', 'Не указан'];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

/**
 * Автоматический расчёт помесячных объёмов продаж моделей под целевую выручку сценария
 * с учётом приоритетности каждой карточки (Высший ×1.40, Высокий ×1.15, Средний ×0.90, Не указан ×0.75)
 * и сохранением нулевых продаж до месяца запуска (Правило 05).
 */
export function autoDistributeScenarioByPriority(
  models: ScenarioModelSpec[],
  scenario: GrowthScenarioDef,
  options?: {
    keepActingWbFixed?: boolean;
    targetMonthlyMlnOverride?: number;
  }
): ScenarioModelSpec[] {
  const keepActingWbFixed = options?.keepActingWbFixed ?? true;
  const targetMln = options?.targetMonthlyMlnOverride ?? scenario.monthlyTargetMln;
  const targetDecRub = Math.round(targetMln * 1_000_000);
  const targetMonthIdx = scenario.targetMonthIdx ?? 11;

  // Определяем модели, участвующие в сценарии
  const isIncludedInScenario = (m: ScenarioModelSpec) => {
    if (m.launchStatus === 'В архиве') return false;
    if (scenario.id === ACTING_2027_SCENARIO_ID) {
      return Boolean(getActingSkuByWbOrVendor(m.code, m.title));
    }
    if (
      scenario.id === 1 &&
      ['scen-model-001', 'scen-model-002', 'scen-model-003', 'scen-model-004'].includes(m.id)
    ) {
      return false;
    }
    if (isUnverifiedActingSku(m.code)) {
      return false;
    }
    return scenario.includedBrands.includes(m.brandId);
  };

  let fixedActingDecRub = 0;
  if (keepActingWbFixed && scenario.id !== ACTING_2027_SCENARIO_ID) {
    for (const m of models) {
      if (!isIncludedInScenario(m)) continue;
      if (isConfirmedBornersActingSku(m.code) || getActingSkuByWbOrVendor(m.code, m.title)) {
        const met = computeModelScenarioMetrics(m, scenario);
        fixedActingDecRub += met.targetMonthRevenueRub;
      }
    }
  }

  const remainingTargetDecRub = Math.max(0, targetDecRub - fixedActingDecRub);

  // Собираем модели, которые масштабируются по приоритету
  const adjustableEntries: {
    model: ScenarioModelSpec;
    weight: number;
    baseDecPacks: number;
    decPriceRub: number;
    score: number;
    baseMonthlyCurve: number[];
    salesStartMonthIdx: number;
  }[] = [];

  for (const m of models) {
    if (!isIncludedInScenario(m)) continue;
    const isActing =
      isConfirmedBornersActingSku(m.code) || Boolean(getActingSkuByWbOrVendor(m.code, m.title));
    if (keepActingWbFixed && isActing && scenario.id !== ACTING_2027_SCENARIO_ID) {
      continue;
    }

    const plan = m.plansByScenario[scenario.id] || m.plansByScenario[1];
    const s1Var =
      getS1NewVariantByCodeOrId(m.code) || getS1NewVariantByCodeOrId(m.id);
    const salesStartMonthIdx = s1Var
      ? s1Var.launchMonthIdx
      : plan?.salesStartMonthIdx ?? 0;

    const baseCurve = s1Var
      ? [...s1Var.monthlyBuyoutsSets]
      : plan?.monthlyPacks?.some((p) => p > 0)
      ? [...plan.monthlyPacks]
      : Array.from({ length: 12 }, (_, idx) =>
          idx < salesStartMonthIdx ? 0 : 500 + (idx - salesStartMonthIdx) * 250
        );

    const baseDecPacks = Math.max(100, baseCurve[targetMonthIdx] || 1500);
    const decPriceRub = Math.max(
      100,
      plan?.monthlyPricesRub?.[targetMonthIdx] || m.retailPriceRub || 1990
    );
    const priority = getModelPriority(m);
    const weight = PRIORITY_WEIGHTS[priority] || 1.0;
    const score = baseDecPacks * decPriceRub * weight;

    adjustableEntries.push({
      model: m,
      weight,
      baseDecPacks,
      decPriceRub,
      score,
      baseMonthlyCurve: baseCurve,
      salesStartMonthIdx,
    });
  }

  const totalScore = adjustableEntries.reduce((acc, item) => acc + item.score, 0);
  if (totalScore <= 0 || adjustableEntries.length === 0) {
    return models;
  }

  const updatedMap = new Map<string, number[]>();

  for (const entry of adjustableEntries) {
    const share = entry.score / totalScore;
    const modelTargetDecRub = remainingTargetDecRub * share;
    const newDecPacks = Math.max(0, Math.round(modelTargetDecRub / entry.decPriceRub));
    const scaleFactor = entry.baseDecPacks > 0 ? newDecPacks / entry.baseDecPacks : 1;

    const nextMonthlyPacks = entry.baseMonthlyCurve.map((baseVal, mIdx) => {
      if (mIdx < entry.salesStartMonthIdx) return 0;
      if (mIdx === targetMonthIdx) return newDecPacks;
      return Math.max(0, Math.round(baseVal * scaleFactor));
    });

    updatedMap.set(entry.model.id, nextMonthlyPacks);
  }

  return models.map((m) => {
    const nextPacks = updatedMap.get(m.id);
    if (!nextPacks) return m;
    const prevPlan = m.plansByScenario[scenario.id] || m.plansByScenario[1];
    return {
      ...m,
      plansByScenario: {
        ...m.plansByScenario,
        [scenario.id]: {
          ...prevPlan,
          scenarioId: scenario.id,
          monthlyPacks: nextPacks,
          monthlyReceiptsPacks: [...nextPacks],
        },
      },
    };
  });
}
