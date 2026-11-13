import {
  type CanonicalBrandCode,
  normalizePortfolioBrandCode,
} from './unifiedBusinessEngine.ts';

export interface BrandProductionProfile {
  brandCode: CanonicalBrandCode;
  brandLabel: string;
  sizes: string[];
  sizeGridLabelRu: string;
  sizeGridLabelEn: string;
  sizeGridLabelZh: string;
  sizeSharesPct: Record<string, number>;
  itemsUnitLabelRu: string;
  packUnitLabelRu: string;
  defaultPackUnits: number;
  defaultCategoryZh: string;
  defaultFactoryNameZh: string;
  defaultMaterialRu: string;
  defaultMaterialEn: string;
  defaultMaterialZh: string;
  defaultConstructionRu: string;
  defaultConstructionEn: string;
  defaultConstructionZh: string;
  defaultWaistbandOrTrimRu: string;
  defaultWaistbandOrTrimZh: string;
  defaultDetailCaptionRu: string;
  defaultDetailCaptionZh: string;
}

export function isPlaceholderTechString(val?: string | null): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  if (!trimmed) return true;
  return (
    trimmed === '待定' ||
    trimmed.includes('待定') ||
    trimmed.includes('Определяется') ||
    trimmed.toUpperCase() === 'TBD'
  );
}

export function cleanTechPackText(val: string | undefined | null, fallback: string): string {
  if (isPlaceholderTechString(val)) return fallback;
  return val!.trim();
}

export function getBrandProductionProfile(
  brandId?: string | null,
  hintTitleOrCategory?: string | null
): BrandProductionProfile {
  const norm = normalizePortfolioBrandCode(brandId || 'BORNERS');
  const brandCode: CanonicalBrandCode = norm === 'ALL' ? 'BORNERS' : norm;
  const hint = (hintTitleOrCategory || '').toLowerCase();

  if (brandCode === 'NA_TELE') {
    return {
      brandCode: 'NA_TELE',
      brandLabel: 'НА ТЕЛЕ',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      sizeGridLabelRu: 'Женская сетка XS–XL (40–48 RU)',
      sizeGridLabelEn: "Women's Size Grid XS–XL",
      sizeGridLabelZh: '女士尺码表 XS–XL',
      sizeSharesPct: { XS: 14, S: 28, M: 30, L: 18, XL: 10 },
      itemsUnitLabelRu: 'Штук изделий',
      packUnitLabelRu: 'Упаковок / компл.',
      defaultPackUnits: 1,
      defaultCategoryZh: '女士无痕贴身内衣 (Женское бесшовное бельё)',
      defaultFactoryNameZh: '汕头/义乌精品无缝内衣制造厂',
      defaultMaterialRu:
        '78% микрополиамид Sensil + 22% эластан Lycra · Бесшовное полотно 145 г/м²',
      defaultMaterialEn:
        '78% Micro-Polyamide Sensil + 22% Lycra Elastane · Seamless Jersey 145 GSM',
      defaultMaterialZh: '78% 锦纶超细纤维 + 22% 莱卡氨纶 · 无痕亲肤面料 145g/m²',
      defaultConstructionRu:
        'Бесшовная анатомическая посадка second-skin, лазерная обработка краёв без давления',
      defaultConstructionEn:
        'Second-skin seamless anatomical fit, laser-cut invisible edges, cotton gusset',
      defaultConstructionZh: '女士无痕亲肤版型 · 激光裁剪隐形边 · 纯棉透气底裆',
      defaultWaistbandOrTrimRu:
        'Невидимый клеевой край / ультрамягкая микрофибровая окантовка без резинки',
      defaultWaistbandOrTrimZh: '无感点胶贴合边缘 · 零压迫柔滑包边',
      defaultDetailCaptionRu: 'Крупный план: лазерный край и ластовица',
      defaultDetailCaptionZh: '激光无痕边缘与纯棉底裆细节',
    };
  }

  if (brandCode === 'AKUSHA') {
    const isKidsExplicit = ['детск', 'ясли', 'дошкол', '22-30', '22–30'].some((k) =>
      hint.includes(k)
    );
    const hasAdultMenHint = ['39–45', '39-45', 'мужск'].some((k) => hint.includes(k));
    const isAdultWomen =
      !isKidsExplicit &&
      (hint.includes('женск') ||
        hint.includes('36-41') ||
        hint.includes('36–41') ||
        ((hint.includes('лофер') ||
          hint.includes('балетк') ||
          hint.includes('туфл') ||
          hint.includes('топсайдер') ||
          hint.includes('мокасин')) &&
          !hasAdultMenHint));
    const isAdultMen = !isKidsExplicit && !isAdultWomen && hasAdultMenHint;

    if (isAdultMen) {
      return {
        brandCode: 'AKUSHA',
        brandLabel: 'AKUSHA',
        sizes: ['39', '40', '41', '42', '43', '44', '45'],
        sizeGridLabelRu: 'Мужская / взрослая обувная сетка 39–45',
        sizeGridLabelEn: 'Adult Footwear Sizes EU 39–45',
        sizeGridLabelZh: '成人鞋履尺码表 EU 39–45',
        sizeSharesPct: { '39': 8, '40': 13, '41': 18, '42': 22, '43': 19, '44': 13, '45': 7 },
        itemsUnitLabelRu: 'Пар обуви',
        packUnitLabelRu: 'Пар',
        defaultPackUnits: 1,
        defaultCategoryZh: '成人鞋履 (Мужская / взрослая обувь)',
        defaultFactoryNameZh: '广州/温州精品鞋履制造厂',
        defaultMaterialRu:
          '100% натуральная кожа / замша премиум-выделки · Дышащая подкладка · Износостойкая резиновая подошва',
        defaultMaterialEn:
          '100% Full-Grain Leather / Suede Upper · Breathable Lining · Durable Rubber Outsole',
        defaultMaterialZh: '头层牛皮 / 反绒皮，透气内里，耐磨橡胶底',
        defaultConstructionRu:
          'Эргономичная колодка, нескользящая износостойкая подошва и усиленная прошивка',
        defaultConstructionEn:
          'Ergonomic footwear last, non-slip wear-resistant outsole, reinforced stitching',
        defaultConstructionZh: '人体工学鞋楦，防滑耐磨大底，加固车缝工艺',
        defaultWaistbandOrTrimRu: 'Вощёная шнуровка / металлическая фурнитура, индивидуальный короб',
        defaultWaistbandOrTrimZh: '打蜡鞋带/金属配件 · 独立防潮品牌鞋盒',
        defaultDetailCaptionRu: 'Крупный план: кожа верха, строчка и протектор подошвы',
        defaultDetailCaptionZh: '鞋面皮料纹理、车缝线与防滑大底细节',
      };
    }

    const sizes = isAdultWomen
      ? ['36', '37', '38', '39', '40', '41']
      : ['22', '23', '24', '25', '26', '27', '28', '29', '30'];
    const sizeSharesPct: Record<string, number> = isAdultWomen
      ? { '36': 10, '37': 22, '38': 28, '39': 22, '40': 12, '41': 6 }
      : { '22': 8, '23': 11, '24': 13, '25': 14, '26': 14, '27': 13, '28': 11, '29': 9, '30': 7 };

    return {
      brandCode: 'AKUSHA',
      brandLabel: 'AKUSHA',
      sizes,
      sizeGridLabelRu: isAdultWomen
        ? 'Обувная размерная сетка 36–41'
        : 'Детская обувная размерная сетка 22–30',
      sizeGridLabelEn: isAdultWomen ? 'Footwear Sizes EU 36–41' : 'Kids Footwear Sizes EU 22–30',
      sizeGridLabelZh: isAdultWomen ? '女鞋尺码表 EU 36–41' : '童鞋尺码表 EU 22–30',
      sizeSharesPct,
      itemsUnitLabelRu: 'Пар обуви',
      packUnitLabelRu: 'Пар обуви',
      defaultPackUnits: 1,
      defaultCategoryZh: isAdultWomen
        ? '女士精品鞋履 (Женская обувь 36–41)'
        : '儿童健康皮鞋 (Детская обувь 22–30)',
      defaultFactoryNameZh: isAdultWomen ? '广州/温州精品女鞋制造厂' : '温州/广州精品童鞋制造厂',
      defaultMaterialRu:
        '100% натуральная кожа / нубук премиум-выделки · Дышащая подкладка · Подошва ТЭП',
      defaultMaterialEn:
        '100% Genuine Leather / Nubuck Upper · Breathable Lining · Flexible TPR Outsole',
      defaultMaterialZh: '头层牛皮/磨砂皮鞋面 + 透气内里 · 环保防滑柔韧TPR大底',
      defaultConstructionRu:
        'Анатомическая колодка с фиксацией пятки, мягким кантом и гибким перекатом стопы',
      defaultConstructionEn:
        'Anatomical footwear last with heel support, padded collar, and flexible forefoot',
      defaultConstructionZh: '人体工学舒适鞋楦 · 护踝加固后跟 · 精密防脱胶车缝工艺',
      defaultWaistbandOrTrimRu: 'Фурнитура / застёжка Velcro + эластичная шнуровка, индивидуальный короб',
      defaultWaistbandOrTrimZh: '耐用魔术贴/弹力鞋带配件 · 独立防潮品牌鞋盒',
      defaultDetailCaptionRu: 'Крупный план: кожа верха, строчка и протектор подошвы',
      defaultDetailCaptionZh: '鞋面皮料纹理、车缝线与防滑大底细节',
    };
  }

  if (brandCode === 'LISKANI') {
    return {
      brandCode: 'LISKANI',
      brandLabel: 'LISKANI',
      sizes: ['300×240', '300×250', '300×260', '300×270', '400×250', '400×260', '400×270'],
      sizeGridLabelRu: 'Размерный ряд комплектов штор (Ш×В, см)',
      sizeGridLabelEn: 'Curtain Set Dimensions (W×H, cm)',
      sizeGridLabelZh: '窗帘套装成品尺寸表 (宽×高 cm)',
      sizeSharesPct: {
        '300×240': 14,
        '300×250': 20,
        '300×260': 18,
        '300×270': 18,
        '400×250': 10,
        '400×260': 10,
        '400×270': 10,
      },
      itemsUnitLabelRu: 'Полотен в заказе',
      packUnitLabelRu: 'Комплектов штор',
      defaultPackUnits: 1,
      defaultCategoryZh: '高精密遮光窗帘套装 (Интерьерные шторы)',
      defaultFactoryNameZh: '绍兴柯桥精品家纺窗帘制造厂',
      defaultMaterialRu:
        '100% интерьерный полиэстер премиум-плетения блэкаут / димаут · Плотность 280 г/м²',
      defaultMaterialEn:
        '100% Premium Woven Blackout / Dimout Polyester · 280 GSM Heavy Drape',
      defaultMaterialZh: '100% 高精密遮光聚酯纤维窗帘面料 · 克重 280g/m²',
      defaultConstructionRu:
        'Равномерная шторная лента 6 см под крючки и трубу, ровные боковые швы и утяжелённый низ',
      defaultConstructionEn:
        '6 cm uniform pleat header tape for hooks & rod pocket, precision side & bottom hems',
      defaultConstructionZh: '高精密高温垂感定型 · 6cm加宽均匀褶皱挂带 · 精细底摆包边',
      defaultWaistbandOrTrimRu: 'Шторная тесьма 6 см (коэффициент сборки 1:2) + комплект крючков',
      defaultWaistbandOrTrimZh: '6cm加密窗帘挂带 + 配套挂钩与防尘拉链袋包装',
      defaultDetailCaptionRu: 'Крупный план: фактура ткани, шторная лента и подгиб',
      defaultDetailCaptionZh: '面料纹理、挂带车工与底摆包边细节',
    };
  }

  const brandLabel = brandCode === 'FUKAI' ? 'FUKAI' : 'BORNERS';
  return {
    brandCode,
    brandLabel,
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
    sizeGridLabelRu: 'Мужская размерная сетка S–4XL (46–58 RU)',
    sizeGridLabelEn: "Men's Size Grid S–4XL",
    sizeGridLabelZh: '男士尺码表 S–4XL',
    sizeSharesPct: { S: 10, M: 22, L: 28, XL: 20, '2XL': 10, '3XL': 6, '4XL': 4 },
    itemsUnitLabelRu: 'Штук белья',
    packUnitLabelRu: 'Упаковок / мультипаков',
    defaultPackUnits: 3,
    defaultCategoryZh: '男士精品贴身内裤套装 (Мужское бельё / мультипак)',
    defaultFactoryNameZh: '中山小榄/汕头针织内衣制造厂',
    defaultMaterialRu: '95% гребенной хлопок пенье / микромодал + 5% эластан · Плотность 180 г/м²',
    defaultMaterialEn: '95% Combed Compact Cotton / MicroModal + 5% Elastane · 180 GSM',
    defaultMaterialZh: '95% 精梳紧密纺棉/兰精莫代尔 + 5% 氨纶 · 克重 180g/m²',
    defaultConstructionRu:
      'Анатомический 3D-гульфик без центрального заднего шва, плоские швы 4 иглы / 6 нитей',
    defaultConstructionEn:
      'Anatomical 3D ergonomic pouch, seamless back panel, 4-needle 6-thread flatlock seams',
    defaultConstructionZh: '男士3D立体囊袋版型 · 无后中缝防夹臀设计 · 四针六线无骨平缝',
    defaultWaistbandOrTrimRu: 'Мягкая эластичная жаккардовая резинка 38 мм без скручивания',
    defaultWaistbandOrTrimZh: '38mm高弹不起卷提花腰头橡筋 · 热转印无感洗水标',
    defaultDetailCaptionRu: 'Крупный план: поясная резинка и плоские швы flatlock',
    defaultDetailCaptionZh: '腰头提花橡筋与四针六线平缝细节',
  };
}
