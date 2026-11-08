// Автоматически сгенерировано из вложенного пакета BORNERS_2027_import_bundle.zip (sales_2027.json)
// Сценарий: «Исходный план 2027 / ИП Нерсесянц» (7 артикулов × 12 месяцев = 84 записи)

import type { GrowthScenarioDef, ScenarioModelSpec } from './scenarioData';
import type { Product } from '@/types/platform';

export interface ActingAssortmentMonthlyRow {
  month: number;
  period: string;
  orders_sets: number;
  buyouts_sets: number;
  buyout_rate: number;
  realization_price_rub: number;
  revenue_rub: number;
  cost_of_goods_rub: number;
}

export interface ActingAssortmentSkuData {
  orderNum: number;
  vendorSku: string;
  wbSku: string;
  unitsInPack: number;
  brandStatus: string;
  brandVerified: boolean;
  warningNote: string;
  subtitle: string;
  composition: string;
  sizeRange: string;
  colorsSummary: string[];
  photoUrl: string;
  totalOrdersSets: number;
  totalBuyoutsSets: number;
  avgBuyoutRatePct: number;
  weightedAvgPriceRub: number;
  totalRevenueRub: number;
  decemberRevenueRub: number;
  totalCostOfGoodsRub: number;
  unitCogRub: number;
  monthly: ActingAssortmentMonthlyRow[];
}

export const ACTING_2027_SCENARIO_ID = 100;

export const ACTING_2027_CONTROL_TOTALS = {
  recordsCount: 84,
  skusCount: 7,
  annualBuyoutsSets: 223_713,
  annualRevenueRub: 267_731_943,
  decemberRevenueRub: 22_729_352,
  annualCostOfGoodsRub: 91_462_155,
  seller: 'ИП Нерсесянц',
  scenarioTitle: 'Исходный план 2027 / ИП Нерсесянц',
  sourceLabel: '_2027_design.xlsx / лист «Продажи» / сценарий «Без реплик»',
} as const;

export const ACTING_2027_SKUS: ActingAssortmentSkuData[] = [
  {
    "orderNum": 1,
    "vendorSku": "Borners2",
    "wbSku": "244995893",
    "unitsInPack": 4,
    "brandStatus": "BORNERS (по фото)",
    "brandVerified": false,
    "warningNote": "Внешний вид взят из переданного изображения (SKU 01).",
    "subtitle": "Боксеры мужские · 4 шт. в комплекте · WB 244995893",
    "composition": "93% хлопок компакт-пенье, 7% спандекс",
    "sizeRange": "42–60",
    "colorsSummary": [
      "Чёрный",
      "Тёмно-синий",
      "Графит",
      "Серый меланж"
    ],
    "photoUrl": "images/products/acting-2027/244995893_main.webp",
    "totalOrdersSets": 72416,
    "totalBuyoutsSets": 58803,
    "avgBuyoutRatePct": 81.2,
    "weightedAvgPriceRub": 1280,
    "totalRevenueRub": 75277608,
    "decemberRevenueRub": 6391581,
    "totalCostOfGoodsRub": 24032198,
    "unitCogRub": 409,
    "monthly": [
      {
        "month": 1,
        "period": "2027-01",
        "orders_sets": 5799,
        "buyouts_sets": 4709,
        "buyout_rate": 0.812,
        "realization_price_rub": 1211,
        "revenue_rub": 5702599,
        "cost_of_goods_rub": 1924521
      },
      {
        "month": 2,
        "period": "2027-02",
        "orders_sets": 6267,
        "buyouts_sets": 5089,
        "buyout_rate": 0.812,
        "realization_price_rub": 1223,
        "revenue_rub": 6223847,
        "cost_of_goods_rub": 2079823
      },
      {
        "month": 3,
        "period": "2027-03",
        "orders_sets": 5742,
        "buyouts_sets": 4663,
        "buyout_rate": 0.812,
        "realization_price_rub": 1235,
        "revenue_rub": 5758805,
        "cost_of_goods_rub": 1905721
      },
      {
        "month": 4,
        "period": "2027-04",
        "orders_sets": 6204,
        "buyouts_sets": 5038,
        "buyout_rate": 0.812,
        "realization_price_rub": 1248,
        "revenue_rub": 6287424,
        "cost_of_goods_rub": 2058980
      },
      {
        "month": 5,
        "period": "2027-05",
        "orders_sets": 5485,
        "buyouts_sets": 4454,
        "buyout_rate": 0.812,
        "realization_price_rub": 1260,
        "revenue_rub": 5612040,
        "cost_of_goods_rub": 1820305
      },
      {
        "month": 6,
        "period": "2027-06",
        "orders_sets": 6360,
        "buyouts_sets": 5164,
        "buyout_rate": 0.812,
        "realization_price_rub": 1273,
        "revenue_rub": 6573772,
        "cost_of_goods_rub": 2110475
      },
      {
        "month": 7,
        "period": "2027-07",
        "orders_sets": 5951,
        "buyouts_sets": 4832,
        "buyout_rate": 0.812,
        "realization_price_rub": 1286,
        "revenue_rub": 6213952,
        "cost_of_goods_rub": 1974790
      },
      {
        "month": 8,
        "period": "2027-08",
        "orders_sets": 5963,
        "buyouts_sets": 4842,
        "buyout_rate": 0.812,
        "realization_price_rub": 1298,
        "revenue_rub": 6284916,
        "cost_of_goods_rub": 1978877
      },
      {
        "month": 9,
        "period": "2027-09",
        "orders_sets": 6623,
        "buyouts_sets": 5378,
        "buyout_rate": 0.812,
        "realization_price_rub": 1311,
        "revenue_rub": 7050558,
        "cost_of_goods_rub": 2197935
      },
      {
        "month": 10,
        "period": "2027-10",
        "orders_sets": 6342,
        "buyouts_sets": 5150,
        "buyout_rate": 0.812,
        "realization_price_rub": 1324,
        "revenue_rub": 6818600,
        "cost_of_goods_rub": 2104754
      },
      {
        "month": 11,
        "period": "2027-11",
        "orders_sets": 5854,
        "buyouts_sets": 4753,
        "buyout_rate": 0.812,
        "realization_price_rub": 1338,
        "revenue_rub": 6359514,
        "cost_of_goods_rub": 1942504
      },
      {
        "month": 12,
        "period": "2027-12",
        "orders_sets": 5826,
        "buyouts_sets": 4731,
        "buyout_rate": 0.812,
        "realization_price_rub": 1351,
        "revenue_rub": 6391581,
        "cost_of_goods_rub": 1933512
      }
    ]
  },
  {
    "orderNum": 2,
    "vendorSku": "435tru",
    "wbSku": "86205435",
    "unitsInPack": 4,
    "brandStatus": "Бренд подтвердить",
    "brandVerified": false,
    "warningNote": "Бренд требует подтверждения по WB (SKU 02).",
    "subtitle": "Боксеры мужские · 4 шт. в комплекте · WB 86205435",
    "composition": "70% хлопок, 22% бамбук, 8% спандекс",
    "sizeRange": "42–60",
    "colorsSummary": [
      "Графит принт",
      "Тёмно-синий принт",
      "Серый принт",
      "Чёрный принт"
    ],
    "photoUrl": "images/products/acting-2027/86205435_main.webp",
    "totalOrdersSets": 40709,
    "totalBuyoutsSets": 35311,
    "avgBuyoutRatePct": 86.7,
    "weightedAvgPriceRub": 1290,
    "totalRevenueRub": 45542259,
    "decemberRevenueRub": 3866601,
    "totalCostOfGoodsRub": 15002231,
    "unitCogRub": 425,
    "monthly": [
      {
        "month": 1,
        "period": "2027-01",
        "orders_sets": 3260,
        "buyouts_sets": 2828,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1220,
        "revenue_rub": 3450160,
        "cost_of_goods_rub": 1201504
      },
      {
        "month": 2,
        "period": "2027-02",
        "orders_sets": 3523,
        "buyouts_sets": 3056,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1232,
        "revenue_rub": 3764992,
        "cost_of_goods_rub": 1298372
      },
      {
        "month": 3,
        "period": "2027-03",
        "orders_sets": 3227,
        "buyouts_sets": 2799,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1245,
        "revenue_rub": 3484755,
        "cost_of_goods_rub": 1189183
      },
      {
        "month": 4,
        "period": "2027-04",
        "orders_sets": 3488,
        "buyouts_sets": 3025,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1257,
        "revenue_rub": 3802425,
        "cost_of_goods_rub": 1285202
      },
      {
        "month": 5,
        "period": "2027-05",
        "orders_sets": 3082,
        "buyouts_sets": 2673,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1270,
        "revenue_rub": 3394710,
        "cost_of_goods_rub": 1135651
      },
      {
        "month": 6,
        "period": "2027-06",
        "orders_sets": 3576,
        "buyouts_sets": 3102,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1282,
        "revenue_rub": 3976764,
        "cost_of_goods_rub": 1317916
      },
      {
        "month": 7,
        "period": "2027-07",
        "orders_sets": 3346,
        "buyouts_sets": 2902,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1295,
        "revenue_rub": 3758090,
        "cost_of_goods_rub": 1232944
      },
      {
        "month": 8,
        "period": "2027-08",
        "orders_sets": 3352,
        "buyouts_sets": 2908,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1308,
        "revenue_rub": 3803664,
        "cost_of_goods_rub": 1235493
      },
      {
        "month": 9,
        "period": "2027-09",
        "orders_sets": 3724,
        "buyouts_sets": 3230,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1321,
        "revenue_rub": 4266830,
        "cost_of_goods_rub": 1372298
      },
      {
        "month": 10,
        "period": "2027-10",
        "orders_sets": 3565,
        "buyouts_sets": 3092,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1334,
        "revenue_rub": 4124728,
        "cost_of_goods_rub": 1313667
      },
      {
        "month": 11,
        "period": "2027-11",
        "orders_sets": 3291,
        "buyouts_sets": 2855,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1348,
        "revenue_rub": 3848540,
        "cost_of_goods_rub": 1212975
      },
      {
        "month": 12,
        "period": "2027-12",
        "orders_sets": 3275,
        "buyouts_sets": 2841,
        "buyout_rate": 0.8674,
        "realization_price_rub": 1361,
        "revenue_rub": 3866601,
        "cost_of_goods_rub": 1207027
      }
    ]
  },
  {
    "orderNum": 3,
    "vendorSku": "4351877",
    "wbSku": "72302360",
    "unitsInPack": 4,
    "brandStatus": "FUKAI на фото — подтвердить",
    "brandVerified": false,
    "warningNote": "На фото виден FUKAI: бренд требует проверки (не присваивать автоматически подтверждённый бренд BORNERS).",
    "subtitle": "Боксеры мужские · 4 шт. · WB 72302360 (FUKAI на фото — проверить)",
    "composition": "93% хлопок, 7% спандекс",
    "sizeRange": "42–60",
    "colorsSummary": [
      "Чёрный",
      "Тёмно-синий",
      "Серый",
      "Графит"
    ],
    "photoUrl": "images/products/acting-2027/72302360_main.webp",
    "totalOrdersSets": 40182,
    "totalBuyoutsSets": 35421,
    "avgBuyoutRatePct": 88.2,
    "weightedAvgPriceRub": 1271,
    "totalRevenueRub": 45011142,
    "decemberRevenueRub": 3821850,
    "totalCostOfGoodsRub": 15048966,
    "unitCogRub": 425,
    "monthly": [
      {
        "month": 1,
        "period": "2027-01",
        "orders_sets": 3218,
        "buyouts_sets": 2837,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1202,
        "revenue_rub": 3410074,
        "cost_of_goods_rub": 1205328
      },
      {
        "month": 2,
        "period": "2027-02",
        "orders_sets": 3477,
        "buyouts_sets": 3065,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1214,
        "revenue_rub": 3720910,
        "cost_of_goods_rub": 1302196
      },
      {
        "month": 3,
        "period": "2027-03",
        "orders_sets": 3187,
        "buyouts_sets": 2809,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1226,
        "revenue_rub": 3443834,
        "cost_of_goods_rub": 1193432
      },
      {
        "month": 4,
        "period": "2027-04",
        "orders_sets": 3443,
        "buyouts_sets": 3035,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1238,
        "revenue_rub": 3757330,
        "cost_of_goods_rub": 1289450
      },
      {
        "month": 5,
        "period": "2027-05",
        "orders_sets": 3043,
        "buyouts_sets": 2682,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1251,
        "revenue_rub": 3355182,
        "cost_of_goods_rub": 1139475
      },
      {
        "month": 6,
        "period": "2027-06",
        "orders_sets": 3530,
        "buyouts_sets": 3112,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1263,
        "revenue_rub": 3930456,
        "cost_of_goods_rub": 1322164
      },
      {
        "month": 7,
        "period": "2027-07",
        "orders_sets": 3302,
        "buyouts_sets": 2911,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1276,
        "revenue_rub": 3714436,
        "cost_of_goods_rub": 1236767
      },
      {
        "month": 8,
        "period": "2027-08",
        "orders_sets": 3309,
        "buyouts_sets": 2917,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1289,
        "revenue_rub": 3760013,
        "cost_of_goods_rub": 1239317
      },
      {
        "month": 9,
        "period": "2027-09",
        "orders_sets": 3674,
        "buyouts_sets": 3239,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1302,
        "revenue_rub": 4217178,
        "cost_of_goods_rub": 1376122
      },
      {
        "month": 10,
        "period": "2027-10",
        "orders_sets": 3518,
        "buyouts_sets": 3101,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1315,
        "revenue_rub": 4077815,
        "cost_of_goods_rub": 1317491
      },
      {
        "month": 11,
        "period": "2027-11",
        "orders_sets": 3248,
        "buyouts_sets": 2863,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1328,
        "revenue_rub": 3802064,
        "cost_of_goods_rub": 1216374
      },
      {
        "month": 12,
        "period": "2027-12",
        "orders_sets": 3233,
        "buyouts_sets": 2850,
        "buyout_rate": 0.8815,
        "realization_price_rub": 1341,
        "revenue_rub": 3821850,
        "cost_of_goods_rub": 1210851
      }
    ]
  },
  {
    "orderNum": 4,
    "vendorSku": "1art-borners",
    "wbSku": "440758616",
    "unitsInPack": 4,
    "brandStatus": "BORNERS (по фото)",
    "brandVerified": false,
    "warningNote": "Внешний вид взят из переданного изображения (SKU 04).",
    "subtitle": "Набор трусов 42–60 · 4 шт. в комплекте · WB 440758616",
    "composition": "93% хлопок компакт-пенье, 7% спандекс",
    "sizeRange": "42–60",
    "colorsSummary": [
      "Графит",
      "Светло-серый",
      "Тёмно-синий",
      "Чёрный"
    ],
    "photoUrl": "images/products/acting-2027/440758616_main.webp",
    "totalOrdersSets": 40093,
    "totalBuyoutsSets": 32986,
    "avgBuyoutRatePct": 82.3,
    "weightedAvgPriceRub": 1061,
    "totalRevenueRub": 35007152,
    "decemberRevenueRub": 2971360,
    "totalCostOfGoodsRub": 13481048,
    "unitCogRub": 409,
    "monthly": [
      {
        "month": 1,
        "period": "2027-01",
        "orders_sets": 3211,
        "buyouts_sets": 2642,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1004,
        "revenue_rub": 2652568,
        "cost_of_goods_rub": 1079759
      },
      {
        "month": 2,
        "period": "2027-02",
        "orders_sets": 3469,
        "buyouts_sets": 2854,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1014,
        "revenue_rub": 2893956,
        "cost_of_goods_rub": 1166401
      },
      {
        "month": 3,
        "period": "2027-03",
        "orders_sets": 3179,
        "buyouts_sets": 2615,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1024,
        "revenue_rub": 2677760,
        "cost_of_goods_rub": 1068724
      },
      {
        "month": 4,
        "period": "2027-04",
        "orders_sets": 3435,
        "buyouts_sets": 2826,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1034,
        "revenue_rub": 2922084,
        "cost_of_goods_rub": 1154958
      },
      {
        "month": 5,
        "period": "2027-05",
        "orders_sets": 3036,
        "buyouts_sets": 2498,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1045,
        "revenue_rub": 2610410,
        "cost_of_goods_rub": 1020908
      },
      {
        "month": 6,
        "period": "2027-06",
        "orders_sets": 3522,
        "buyouts_sets": 2898,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1055,
        "revenue_rub": 3057390,
        "cost_of_goods_rub": 1184384
      },
      {
        "month": 7,
        "period": "2027-07",
        "orders_sets": 3295,
        "buyouts_sets": 2711,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1066,
        "revenue_rub": 2889926,
        "cost_of_goods_rub": 1107959
      },
      {
        "month": 8,
        "period": "2027-08",
        "orders_sets": 3302,
        "buyouts_sets": 2717,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1076,
        "revenue_rub": 2923492,
        "cost_of_goods_rub": 1110411
      },
      {
        "month": 9,
        "period": "2027-09",
        "orders_sets": 3667,
        "buyouts_sets": 3017,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1087,
        "revenue_rub": 3279479,
        "cost_of_goods_rub": 1233018
      },
      {
        "month": 10,
        "period": "2027-10",
        "orders_sets": 3510,
        "buyouts_sets": 2888,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1098,
        "revenue_rub": 3171024,
        "cost_of_goods_rub": 1180297
      },
      {
        "month": 11,
        "period": "2027-11",
        "orders_sets": 3242,
        "buyouts_sets": 2667,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1109,
        "revenue_rub": 2957703,
        "cost_of_goods_rub": 1089976
      },
      {
        "month": 12,
        "period": "2027-12",
        "orders_sets": 3225,
        "buyouts_sets": 2653,
        "buyout_rate": 0.8227,
        "realization_price_rub": 1120,
        "revenue_rub": 2971360,
        "cost_of_goods_rub": 1084255
      }
    ]
  },
  {
    "orderNum": 5,
    "vendorSku": "borners4",
    "wbSku": "439426186",
    "unitsInPack": 4,
    "brandStatus": "BORNERS (по фото)",
    "brandVerified": false,
    "warningNote": "Внешний вид взят из переданного изображения (SKU 05).",
    "subtitle": "Боксеры мужские · 4 шт. в комплекте · WB 439426186",
    "composition": "93% хлопок компакт-пенье, 7% спандекс",
    "sizeRange": "42–60",
    "colorsSummary": [
      "Чёрный × 4 шт."
    ],
    "photoUrl": "images/products/acting-2027/439426186_main.webp",
    "totalOrdersSets": 37759,
    "totalBuyoutsSets": 31094,
    "avgBuyoutRatePct": 82.3,
    "weightedAvgPriceRub": 1110,
    "totalRevenueRub": 34518273,
    "decemberRevenueRub": 2929842,
    "totalCostOfGoodsRub": 12707807,
    "unitCogRub": 409,
    "monthly": [
      {
        "month": 1,
        "period": "2027-01",
        "orders_sets": 3024,
        "buyouts_sets": 2490,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1050,
        "revenue_rub": 2614500,
        "cost_of_goods_rub": 1017638
      },
      {
        "month": 2,
        "period": "2027-02",
        "orders_sets": 3267,
        "buyouts_sets": 2690,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1061,
        "revenue_rub": 2854090,
        "cost_of_goods_rub": 1099376
      },
      {
        "month": 3,
        "period": "2027-03",
        "orders_sets": 2994,
        "buyouts_sets": 2466,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1071,
        "revenue_rub": 2641086,
        "cost_of_goods_rub": 1007830
      },
      {
        "month": 4,
        "period": "2027-04",
        "orders_sets": 3235,
        "buyouts_sets": 2664,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1082,
        "revenue_rub": 2882448,
        "cost_of_goods_rub": 1088750
      },
      {
        "month": 5,
        "period": "2027-05",
        "orders_sets": 2859,
        "buyouts_sets": 2354,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1093,
        "revenue_rub": 2572922,
        "cost_of_goods_rub": 962056
      },
      {
        "month": 6,
        "period": "2027-06",
        "orders_sets": 3317,
        "buyouts_sets": 2732,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1104,
        "revenue_rub": 3016128,
        "cost_of_goods_rub": 1116541
      },
      {
        "month": 7,
        "period": "2027-07",
        "orders_sets": 3103,
        "buyouts_sets": 2555,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1115,
        "revenue_rub": 2848825,
        "cost_of_goods_rub": 1044203
      },
      {
        "month": 8,
        "period": "2027-08",
        "orders_sets": 3109,
        "buyouts_sets": 2560,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1126,
        "revenue_rub": 2882560,
        "cost_of_goods_rub": 1046246
      },
      {
        "month": 9,
        "period": "2027-09",
        "orders_sets": 3453,
        "buyouts_sets": 2844,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1137,
        "revenue_rub": 3233628,
        "cost_of_goods_rub": 1162314
      },
      {
        "month": 10,
        "period": "2027-10",
        "orders_sets": 3307,
        "buyouts_sets": 2723,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1148,
        "revenue_rub": 3126004,
        "cost_of_goods_rub": 1112863
      },
      {
        "month": 11,
        "period": "2027-11",
        "orders_sets": 3053,
        "buyouts_sets": 2514,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1160,
        "revenue_rub": 2916240,
        "cost_of_goods_rub": 1027447
      },
      {
        "month": 12,
        "period": "2027-12",
        "orders_sets": 3038,
        "buyouts_sets": 2502,
        "buyout_rate": 0.8235,
        "realization_price_rub": 1171,
        "revenue_rub": 2929842,
        "cost_of_goods_rub": 1022542
      }
    ]
  },
  {
    "orderNum": 6,
    "vendorSku": "2art-borners",
    "wbSku": "440759654",
    "unitsInPack": 4,
    "brandStatus": "BORNERS (по фото)",
    "brandVerified": false,
    "warningNote": "Внешний вид взят из переданного изображения (SKU 06).",
    "subtitle": "Боксеры мужские · 4 шт. в комплекте · WB 440759654",
    "composition": "93% хлопок компакт-пенье, 7% спандекс",
    "sizeRange": "42–60",
    "colorsSummary": [
      "Графит",
      "Чёрный",
      "Тёмно-синий",
      "Серый"
    ],
    "photoUrl": "images/products/acting-2027/440759654_main.webp",
    "totalOrdersSets": 20867,
    "totalBuyoutsSets": 17529,
    "avgBuyoutRatePct": 84,
    "weightedAvgPriceRub": 1110,
    "totalRevenueRub": 19459414,
    "decemberRevenueRub": 1651110,
    "totalCostOfGoodsRub": 7163927,
    "unitCogRub": 409,
    "monthly": [
      {
        "month": 1,
        "period": "2027-01",
        "orders_sets": 1671,
        "buyouts_sets": 1404,
        "buyout_rate": 0.84,
        "realization_price_rub": 1050,
        "revenue_rub": 1474200,
        "cost_of_goods_rub": 573801
      },
      {
        "month": 2,
        "period": "2027-02",
        "orders_sets": 1805,
        "buyouts_sets": 1516,
        "buyout_rate": 0.84,
        "realization_price_rub": 1061,
        "revenue_rub": 1608476,
        "cost_of_goods_rub": 619574
      },
      {
        "month": 3,
        "period": "2027-03",
        "orders_sets": 1654,
        "buyouts_sets": 1389,
        "buyout_rate": 0.84,
        "realization_price_rub": 1071,
        "revenue_rub": 1487619,
        "cost_of_goods_rub": 567670
      },
      {
        "month": 4,
        "period": "2027-04",
        "orders_sets": 1788,
        "buyouts_sets": 1502,
        "buyout_rate": 0.84,
        "realization_price_rub": 1082,
        "revenue_rub": 1625164,
        "cost_of_goods_rub": 613852
      },
      {
        "month": 5,
        "period": "2027-05",
        "orders_sets": 1581,
        "buyouts_sets": 1328,
        "buyout_rate": 0.84,
        "realization_price_rub": 1093,
        "revenue_rub": 1451504,
        "cost_of_goods_rub": 542740
      },
      {
        "month": 6,
        "period": "2027-06",
        "orders_sets": 1833,
        "buyouts_sets": 1540,
        "buyout_rate": 0.84,
        "realization_price_rub": 1104,
        "revenue_rub": 1700160,
        "cost_of_goods_rub": 629383
      },
      {
        "month": 7,
        "period": "2027-07",
        "orders_sets": 1715,
        "buyouts_sets": 1441,
        "buyout_rate": 0.84,
        "realization_price_rub": 1115,
        "revenue_rub": 1606715,
        "cost_of_goods_rub": 588922
      },
      {
        "month": 8,
        "period": "2027-08",
        "orders_sets": 1718,
        "buyouts_sets": 1443,
        "buyout_rate": 0.84,
        "realization_price_rub": 1126,
        "revenue_rub": 1624818,
        "cost_of_goods_rub": 589740
      },
      {
        "month": 9,
        "period": "2027-09",
        "orders_sets": 1909,
        "buyouts_sets": 1604,
        "buyout_rate": 0.84,
        "realization_price_rub": 1137,
        "revenue_rub": 1823748,
        "cost_of_goods_rub": 655539
      },
      {
        "month": 10,
        "period": "2027-10",
        "orders_sets": 1827,
        "buyouts_sets": 1535,
        "buyout_rate": 0.84,
        "realization_price_rub": 1148,
        "revenue_rub": 1762180,
        "cost_of_goods_rub": 627339
      },
      {
        "month": 11,
        "period": "2027-11",
        "orders_sets": 1687,
        "buyouts_sets": 1417,
        "buyout_rate": 0.84,
        "realization_price_rub": 1160,
        "revenue_rub": 1643720,
        "cost_of_goods_rub": 579114
      },
      {
        "month": 12,
        "period": "2027-12",
        "orders_sets": 1679,
        "buyouts_sets": 1410,
        "buyout_rate": 0.84,
        "realization_price_rub": 1171,
        "revenue_rub": 1651110,
        "cost_of_goods_rub": 576253
      }
    ]
  },
  {
    "orderNum": 7,
    "vendorSku": "borners3",
    "wbSku": "257807266",
    "unitsInPack": 3,
    "brandStatus": "BORNERS (по фото)",
    "brandVerified": false,
    "warningNote": "На фото — упаковка 3 шт. (SKU 07).",
    "subtitle": "Боксеры мужские · 3 шт. в комплекте · WB 257807266",
    "composition": "93% хлопок компакт-пенье, 7% спандекс",
    "sizeRange": "42–60",
    "colorsSummary": [
      "Чёрный × 3 шт."
    ],
    "photoUrl": "images/products/acting-2027/257807266_main.webp",
    "totalOrdersSets": 15278,
    "totalBuyoutsSets": 12569,
    "avgBuyoutRatePct": 82.3,
    "weightedAvgPriceRub": 1028,
    "totalRevenueRub": 12916095,
    "decemberRevenueRub": 1097008,
    "totalCostOfGoodsRub": 4025976,
    "unitCogRub": 320,
    "monthly": [
      {
        "month": 1,
        "period": "2027-01",
        "orders_sets": 1223,
        "buyouts_sets": 1006,
        "buyout_rate": 0.8228,
        "realization_price_rub": 972,
        "revenue_rub": 977832,
        "cost_of_goods_rub": 322232
      },
      {
        "month": 2,
        "period": "2027-02",
        "orders_sets": 1322,
        "buyouts_sets": 1088,
        "buyout_rate": 0.8228,
        "realization_price_rub": 982,
        "revenue_rub": 1068416,
        "cost_of_goods_rub": 348497
      },
      {
        "month": 3,
        "period": "2027-03",
        "orders_sets": 1211,
        "buyouts_sets": 996,
        "buyout_rate": 0.8228,
        "realization_price_rub": 992,
        "revenue_rub": 988032,
        "cost_of_goods_rub": 319029
      },
      {
        "month": 4,
        "period": "2027-04",
        "orders_sets": 1309,
        "buyouts_sets": 1077,
        "buyout_rate": 0.8228,
        "realization_price_rub": 1001,
        "revenue_rub": 1078077,
        "cost_of_goods_rub": 344974
      },
      {
        "month": 5,
        "period": "2027-05",
        "orders_sets": 1157,
        "buyouts_sets": 952,
        "buyout_rate": 0.8228,
        "realization_price_rub": 1011,
        "revenue_rub": 962472,
        "cost_of_goods_rub": 304935
      },
      {
        "month": 6,
        "period": "2027-06",
        "orders_sets": 1342,
        "buyouts_sets": 1104,
        "buyout_rate": 0.8228,
        "realization_price_rub": 1022,
        "revenue_rub": 1128288,
        "cost_of_goods_rub": 353622
      },
      {
        "month": 7,
        "period": "2027-07",
        "orders_sets": 1256,
        "buyouts_sets": 1033,
        "buyout_rate": 0.8228,
        "realization_price_rub": 1032,
        "revenue_rub": 1066056,
        "cost_of_goods_rub": 330880
      },
      {
        "month": 8,
        "period": "2027-08",
        "orders_sets": 1258,
        "buyouts_sets": 1035,
        "buyout_rate": 0.8228,
        "realization_price_rub": 1042,
        "revenue_rub": 1078470,
        "cost_of_goods_rub": 331521
      },
      {
        "month": 9,
        "period": "2027-09",
        "orders_sets": 1397,
        "buyouts_sets": 1149,
        "buyout_rate": 0.8228,
        "realization_price_rub": 1053,
        "revenue_rub": 1209897,
        "cost_of_goods_rub": 368036
      },
      {
        "month": 10,
        "period": "2027-10",
        "orders_sets": 1338,
        "buyouts_sets": 1101,
        "buyout_rate": 0.8228,
        "realization_price_rub": 1063,
        "revenue_rub": 1170363,
        "cost_of_goods_rub": 352661
      },
      {
        "month": 11,
        "period": "2027-11",
        "orders_sets": 1235,
        "buyouts_sets": 1016,
        "buyout_rate": 0.8228,
        "realization_price_rub": 1074,
        "revenue_rub": 1091184,
        "cost_of_goods_rub": 325435
      },
      {
        "month": 12,
        "period": "2027-12",
        "orders_sets": 1230,
        "buyouts_sets": 1012,
        "buyout_rate": 0.8228,
        "realization_price_rub": 1084,
        "revenue_rub": 1097008,
        "cost_of_goods_rub": 324154
      }
    ]
  }
];

export const ACTING_2027_MONTHLY_TOTALS_MLN: number[] = [
  20.28, 22.13, 20.48, 22.35, 19.96, 23.38, 22.10, 22.36, 25.08, 24.25, 22.62, 22.73,
];

export const ACTING_2027_SCENARIO_DEF: GrowthScenarioDef = {
  id: ACTING_2027_SCENARIO_ID,
  title: 'Исходный план 2027 / ИП Нерсесянц',
  monthlyTargetMln: 22.73,
  targetMonthLabel: 'Декабрь 2027',
  targetMonthIdx: 11,
  scopeLabel: 'ИП Нерсесянц · 7 SKU',
  includedBrands: ['BORNERS', 'NA_TELE'],
  year: 2027,
};

/**
 * Проверка контрольных сумм по разделу 03 инструкции импорта:
 * 84 записи; 223 713 выкупов; 267 731 943 ₽ за год; 22 729 352 ₽ выручки в декабре.
 */
export function verifyActingAssortment2027Bundle(): {
  valid: boolean;
  recordsCount: number;
  annualBuyoutsSets: number;
  annualRevenueRub: number;
  decemberRevenueRub: number;
  annualCostOfGoodsRub: number;
} {
  let recordsCount = 0;
  let annualBuyoutsSets = 0;
  let annualRevenueRub = 0;
  let decemberRevenueRub = 0;
  let annualCostOfGoodsRub = 0;

  for (const sku of ACTING_2027_SKUS) {
    for (const m of sku.monthly) {
      recordsCount += 1;
      annualBuyoutsSets += m.buyouts_sets;
      annualRevenueRub += m.revenue_rub;
      annualCostOfGoodsRub += m.cost_of_goods_rub;
      if (m.month === 12) {
        decemberRevenueRub += m.revenue_rub;
      }
    }
  }

  const valid =
    recordsCount === ACTING_2027_CONTROL_TOTALS.recordsCount &&
    annualBuyoutsSets === ACTING_2027_CONTROL_TOTALS.annualBuyoutsSets &&
    annualRevenueRub === ACTING_2027_CONTROL_TOTALS.annualRevenueRub &&
    decemberRevenueRub === ACTING_2027_CONTROL_TOTALS.decemberRevenueRub;

  return {
    valid,
    recordsCount,
    annualBuyoutsSets,
    annualRevenueRub,
    decemberRevenueRub,
    annualCostOfGoodsRub,
  };
}

export function getActingSkuByWbOrVendor(
  codeOrSku?: string,
  titleOrName?: string
): ActingAssortmentSkuData | undefined {
  const c = (codeOrSku || '').trim().toUpperCase();
  const t = (titleOrName || '').trim().toUpperCase();
  return ACTING_2027_SKUS.find((s) => {
    const wb = s.wbSku.toUpperCase();
    const vendor = s.vendorSku.toUpperCase();
    return (
      c === wb ||
      c === `WB ${wb}` ||
      c === `WB-${wb}` ||
      c.includes(wb) ||
      t === vendor ||
      c === vendor
    );
  });
}

export const ACTING_2027_SCENARIO_MODELS: ScenarioModelSpec[] = ACTING_2027_SKUS.map((s) => {
  const monthlyPacks = s.monthly.map((m) => m.buyouts_sets);
  const monthlyPricesRub = s.monthly.map((m) => m.realization_price_rub);
  const isConfirmedBorners = ['244995893', '440758616', '439426186', '440759654', '257807266'].includes(
    s.wbSku
  );
  const planObj = {
    scenarioId: ACTING_2027_SCENARIO_ID,
    monthlyPacks,
    monthlyPricesRub,
    monthlyReceiptsPacks: [...monthlyPacks],
    initialStockPacks: 0,
    firstOrderPacks: monthlyPacks[0] + monthlyPacks[1],
    nextOrderDateLabel: 'По графику действующего ассортимента 2027',
    salesStartMonthIdx: 0,
    warehouseArrivalMonthIdx: 0,
    warehouseArrivalDateLabel: 'Действующий ассортимент (в продаже с января 2027)',
  };

  const zeroPlanForBornersTarget = {
    ...planObj,
    scenarioId: 1,
    monthlyPacks: Array(12).fill(0),
    monthlyReceiptsPacks: Array(12).fill(0),
    firstOrderPacks: 0,
    nextOrderDateLabel: 'Бренд не подтверждён — не в цели BORNERS (Правило 03)',
  };

  return {
    id: `scen-wb-${s.wbSku}`,
    code: `WB ${s.wbSku}`,
    title: s.vendorSku,
    subtitle: isConfirmedBorners
      ? `${s.subtitle} · ВКЛЮЧЁН В ЦЕЛЬ BORNERS`
      : `${s.subtitle} · БРЕНД НЕ ПОДТВЕРЖДЁН — НЕ В ЦЕЛИ`,
    brandId: 'BORNERS',
    launchStatus: 'Утверждено',
    unitsInPack: s.unitsInPack,
    retailPriceRub: s.weightedAvgPriceRub,
    unitCostRub: s.unitCogRub,
    marketplaceFeePct: 22,
    logisticsRub: 95,
    adsPct: 10,
    responsiblePerson: isConfirmedBorners
      ? `ИП Нерсесянц · ВКЛЮЧЁН В ЦЕЛЬ BORNERS`
      : `ИП Нерсесянц · БРЕНД НЕ ПОДТВЕРЖДЁН — НЕ В ЦЕЛИ`,
    hasActualSalesOrPurchases: true,
    palettes: [
      {
        id: `pal-wb-${s.wbSku}`,
        title: `КАРТОЧКА WB ${s.wbSku} — ${s.vendorSku}`,
        subtitle: `${s.unitsInPack} шт. в комплекте · размеры ${s.sizeRange} · ${s.brandStatus}`,
        statusLabel: isConfirmedBorners
          ? 'ВКЛЮЧЁН В ЦЕЛЬ BORNERS'
          : 'БРЕНД НЕ ПОДТВЕРЖДЁН — НЕ В ЦЕЛИ',
        imageUrl: s.photoUrl,
        colors: s.colorsSummary.map((cName, idx) => ({
          nameRu: cName,
          pantone: `WB ${s.wbSku} · #${idx + 1}`,
          hex: idx % 2 === 0 ? '#1F242D' : '#374151',
          bandHex: '#111827',
          textHex: '#F9FAFB',
        })),
      },
    ],
    gallery: [
      {
        id: `gal-wb-${s.wbSku}-main`,
        category: 'pack',
        label: `Главное фото WB ${s.wbSku}`,
        url: s.photoUrl,
        isMain: true,
      },
    ],
    attachedPdfs: [
      {
        id: `pdf-acting-2027-${s.wbSku}`,
        name: 'Действующий ассортимент — План продаж 2027 (ИП Нерсесянц).pdf',
        sizeBytes: 9796089,
        uploadedAt: '01.11.2026',
        staticUrl: 'docs/acting-2027/BORNERS_2027_acting_assortment.pdf',
      },
      {
        id: `pdf-s1-2027-${s.wbSku}`,
        name: 'BORNERS-2027-S1-100M — План роста 100 млн ₽ в месяц (28 стр.).pdf',
        sizeBytes: 2969931,
        uploadedAt: '02.11.2026',
        staticUrl: 'docs/s1-100m/BORNERS_2027_S1_100M_Plan.pdf',
      },
    ],
    construction: {
      type: `Боксеры мужские (${s.unitsInPack} шт. в наборе)`,
      fit: `Идеальная посадка · размеры ${s.sizeRange}`,
      sideSeam: 'Анатомический крой на каждый день',
      frontPanel: 'Двойная передняя панель',
      gusset: 'Комфортная ластовица без задирания',
      seams: 'Плоские эластичные швы',
    },
    fabric: {
      composition: s.composition,
      density: '180–190 г/м²',
      knitType: 'Кулирная гладь Premium',
      touchFeel: s.warningNote,
      swatchHex: '#1F242D',
    },
    waistband: {
      width: '35–38 мм',
      type: `Статус бренда: ${s.brandStatus}`,
      colorRule: 'В тон изделия / контрастный жаккард',
      logoRepeat: s.wbSku === '72302360' ? 'На фото виден FUKAI — требует проверки' : 'Жаккардовый пояс по фото карточки',
      elasticity: `Выкуп по плану 2027: ${s.avgBuyoutRatePct}%`,
      bandBgHex: '#1F242D',
      bandTextHex: '#F3F4F6',
    },
    productionSteps: [
      {
        id: `ps-wb-${s.wbSku}-1`,
        stepNum: 1,
        title: 'Действующий артикул WB (ИП Нерсесянц)',
        datesLabel: 'Январь – Декабрь 2027',
        monthIndex: 0,
        dayOfMonth: 1,
        status: 'done',
        confirmation: 'factory_confirmed',
      },
    ],
    plansByScenario: {
      [ACTING_2027_SCENARIO_ID]: planObj,
      1: isConfirmedBorners ? { ...planObj, scenarioId: 1 } : zeroPlanForBornersTarget,
      2: isConfirmedBorners
        ? { ...planObj, scenarioId: 2 }
        : { ...zeroPlanForBornersTarget, scenarioId: 2 },
      3: isConfirmedBorners
        ? { ...planObj, scenarioId: 3 }
        : { ...zeroPlanForBornersTarget, scenarioId: 3 },
    },
  };
});

export const ACTING_2027_CATALOG_PRODUCTS: Product[] = ACTING_2027_SKUS.map((s) => ({
  id: `prod-wb-${s.wbSku}`,
  sku: `WB-${s.wbSku}`,
  name: s.vendorSku,
  brandId: 'BORNERS',
  category: 'Боксеры',
  productType: 'Базовая коллекция',
  collection: `ИП Нерсесянц · Действующий ассортимент 2027 (${s.brandStatus})`,
  priceSegment: 'Middle+',
  status: 'active',
  description: `Действующий артикул продавца ${s.vendorSku} (Артикул WB ${s.wbSku}, ИП Нерсесянц). План 2027: заказы ${s.totalOrdersSets.toLocaleString('ru-RU')} компл., выкупы ${s.totalBuyoutsSets.toLocaleString('ru-RU')} компл. (${s.avgBuyoutRatePct}%), выручка за год ${s.totalRevenueRub.toLocaleString('ru-RU')} ₽, выручка в декабре ${s.decemberRevenueRub.toLocaleString('ru-RU')} ₽, товарные затраты (товар + упаковка + приёмка) ${s.totalCostOfGoodsRub.toLocaleString('ru-RU')} ₽. ${s.warningNote}`,
  ownerId: 'user-owner',
  imageUrl: s.photoUrl,
  galleryUrls: [s.photoUrl],
  colorCombinations: s.colorsSummary,
  materials: s.composition,
  fabricComposition: s.composition,
  fabricDensityGsm: 185,
  waistbandType: s.wbSku === '72302360' ? 'FUKAI на фото — бренд требует проверки' : `${s.brandStatus} · размеры ${s.sizeRange}`,
  fitType: `Комплект ${s.unitsInPack} шт. · размеры ${s.sizeRange}`,
  constructionDetails: `WB ${s.wbSku} · ИП Нерсесянц · Выкуп ${s.avgBuyoutRatePct}%`,
  sizes: ['S', 'M', 'L', 'XL', 'XXL'],
  supplierName: 'ИП Нерсесянц (Действующий ассортимент)',
  supplierCountry: 'Китай / РФ',
  moq: 1000,
  productionLeadDays: 30,
  deliveryLeadDays: 14,
  techFiles: [
    {
      id: `tf-wb-${s.wbSku}`,
      title: 'Действующий ассортимент — План продаж 2027 (ИП Нерсесянц).pdf',
      assetType: 'tech_pack',
      url: 'docs/acting-2027/BORNERS_2027_acting_assortment.pdf',
      uploadedAt: '2026-11-01',
    },
  ],
  economics: {
    currency: 'RUB',
    plannedRetailPrice: s.weightedAvgPriceRub,
    actualRetailPrice: s.weightedAvgPriceRub,
    discountPct: 0,
    vatPct: 0,
    returnRatePct: Math.round((100 - s.avgBuyoutRatePct) * 10) / 10,
    unitCostPrice: s.unitCogRub,
    marketplaceCommissionRub: Math.round(s.weightedAvgPriceRub * 0.22),
    logisticsRub: 95,
    advertisingRub: Math.round(s.weightedAvgPriceRub * 0.1),
    otherVariableRub: 15,
  },
  unitsSold: s.totalBuyoutsSets,
  revenueRub: s.totalRevenueRub,
  operatingProfitRub: 0,
  monthlyDynamicsPct: 10,
  salesChannels: ['Wildberries'],
  variants: [
    {
      id: `var-wb-${s.wbSku}-set`,
      productId: `prod-wb-${s.wbSku}`,
      variantSku: `WB-${s.wbSku}`,
      colorName: s.colorsSummary.join(' / '),
      colorHex: '#1F242D',
      size: 'L',
      packConfiguration: `${s.unitsInPack} шт.`,
      stockQty: s.monthly[0].buyouts_sets,
    },
  ],
  isDemo: false,
  isArchived: false,
  createdAt: '2026-11-01',
  updatedAt: '2026-11-01',
}));
