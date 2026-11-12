import type { ConceptStage, ProductConcept } from '../types/platform.ts';
import type {
  GalleryMediaItem,
  GrowthScenarioDef,
  ScenarioModelSpec,
} from './scenarioData.ts';
import { INITIAL_SCENARIOS } from './scenarioData.ts';
import {
  type CanonicalBrandCode,
  changeModelBrandWithAudit,
  createBrandProductModel,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
} from './unifiedBusinessEngine.ts';

export function formatLabBrandLabel(brandId?: string | null): string {
  const norm = normalizePortfolioBrandCode(brandId || 'BORNERS');
  if (norm === 'NA_TELE') return 'НА ТЕЛЕ';
  if (norm === 'FUKAI') return 'FUKAI';
  if (norm === 'AKUSHA') return 'AKUSHA';
  if (norm === 'LISKANI') return 'LISKANI';
  return 'BORNERS';
}

export function normalizeLabBrandCode(brandId?: string | null): CanonicalBrandCode {
  const norm = normalizePortfolioBrandCode(brandId || 'BORNERS');
  return norm === 'ALL' ? 'BORNERS' : norm;
}

export function mapConceptStageToLaunchStatus(
  stage: ConceptStage
): NonNullable<ScenarioModelSpec['launchStatus']> {
  switch (stage) {
    case 'LAUNCH':
    case 'APPROVED':
      return 'Утверждено';
    case 'PRODUCTION':
    case 'DECISION':
      return 'В плане';
    case 'IDEA':
    case 'ANALYSIS':
    case 'SAMPLE':
    case 'TEST':
    default:
      return 'В разработке';
  }
}

export function findLinkedScenarioModelForConcept(
  concept: Pick<ProductConcept, 'id' | 'code' | 'name' | 'brandId' | 'linkedScenarioModelId'>,
  models: ScenarioModelSpec[]
): ScenarioModelSpec | null {
  if (!concept || !Array.isArray(models)) return null;
  if (concept.linkedScenarioModelId) {
    const byId = models.find(
      (m) => m.id === concept.linkedScenarioModelId && m.launchStatus !== 'В архиве'
    );
    if (byId) return byId;
  }

  const targetBrand = normalizeLabBrandCode(concept.brandId);
  const cleanCode = (concept.code || '').trim().toUpperCase();
  const altPrdCode = cleanCode.replace('-LAB-', '-PRD-');
  const cleanName = (concept.name || '').trim().toUpperCase();

  return (
    models.find((m) => {
      if (m.launchStatus === 'В архиве') return false;
      if (!matchesBrandFilter(m, targetBrand)) return false;
      const mCode = (m.code || '').trim().toUpperCase();
      const mTitle = (m.title || '').trim().toUpperCase();
      return (
        (cleanCode.length > 0 && (mCode === cleanCode || mCode === altPrdCode)) ||
        (cleanName.length > 0 && mTitle === cleanName)
      );
    }) || null
  );
}

function buildGalleryFromConcept(
  concept: ProductConcept,
  existingGallery: GalleryMediaItem[] = []
): GalleryMediaItem[] {
  const urls: { url: string; label: string; category: GalleryMediaItem['category'] }[] = [];
  const seen = new Set<string>();

  const pushUrl = (
    rawUrl: string | undefined,
    label: string,
    category: GalleryMediaItem['category'] = 'pack'
  ) => {
    const clean = (rawUrl || '').trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    urls.push({ url: clean, label, category });
  };

  pushUrl(concept.imageUrl, concept.name || 'Главное фото R&D', 'pack');
  for (const gp of concept.galleryPhotos || []) {
    pushUrl(gp?.url, gp?.caption || concept.name || 'Фото R&D', 'pack');
  }
  for (const sample of concept.samples || []) {
    for (const sp of sample.photos || []) {
      pushUrl(sp, `${concept.name} · ${sample.versionCode || 'Образец'}`, 'pack');
    }
  }
  for (const eg of existingGallery) {
    pushUrl(eg?.url, eg?.label || concept.name, eg?.category || 'pack');
  }

  return urls.map((item, idx) => ({
    id: `g-rnd-${concept.id}-${idx + 1}`,
    category: item.category,
    label: item.label,
    url: item.url,
    originalUrl: item.url.startsWith('data:image/') ? '' : item.url,
    isMain: idx === 0,
  }));
}

function resolveConceptPrimaryUnitCostRub(
  concept: Pick<ProductConcept, 'plannedRetailPrice' | 'plannedUnitCost' | 'packUnitsCount'>
): number {
  const packUnits = Math.max(1, Math.round(concept.packUnitsCount || 1));
  const retail = Math.max(100, Math.round(concept.plannedRetailPrice || 2490));
  const rawUnitCost = Math.max(0, Math.round(concept.plannedUnitCost || 0));
  if (rawUnitCost <= 0) {
    return Math.max(50, Math.round(retail * 0.25));
  }
  if (packUnits > 1 && rawUnitCost * packUnits < retail * 0.92) {
    return Math.round(rawUnitCost * packUnits);
  }
  return rawUnitCost;
}

function buildSafeCatalogSkuCode(
  concept: Pick<ProductConcept, 'code' | 'brandId'>,
  brandCode: CanonicalBrandCode,
  existingModels: ScenarioModelSpec[]
): string | undefined {
  const rawCode = (concept.code || '').trim();
  if (!rawCode) return undefined;
  const forbidden = new Set(['№001', '№002', '№003', '№004', 'SCEN-MODEL-001']);
  if (forbidden.has(rawCode.toUpperCase())) return undefined;

  const prefix =
    brandCode === 'NA_TELE'
      ? 'NTL'
      : brandCode === 'FUKAI'
      ? 'FUK'
      : brandCode === 'AKUSHA'
      ? 'AKU'
      : brandCode === 'LISKANI'
      ? 'LSK'
      : 'BRN';

  let candidate = rawCode.replace('-LAB-', '-');
  if (/^RD-\d+$/i.test(candidate)) {
    candidate = `${prefix}-${candidate.toUpperCase()}`;
  }

  const takenByOther = existingModels.some(
    (m) => m.code.trim().toUpperCase() === candidate.trim().toUpperCase()
  );
  return takenByOther ? undefined : candidate;
}

export interface SyncConceptToPortfolioResult {
  model: ScenarioModelSpec;
  models: ScenarioModelSpec[];
  createdNew: boolean;
}

export function syncConceptToScenarioPortfolio(
  concept: ProductConcept,
  existingModels: ScenarioModelSpec[],
  scenarios: GrowthScenarioDef[] = INITIAL_SCENARIOS,
  options?: {
    initialMonthlyBuyouts?: number[];
    targetScenarioIds?: number[];
  }
): SyncConceptToPortfolioResult {
  const brandCode = normalizeLabBrandCode(concept.brandId);
  const packUnits = Math.max(1, Math.round(concept.packUnitsCount || 1));
  const retailPriceRub = Math.max(100, Math.round(concept.plannedRetailPrice || 2490));
  const unitCostRub = resolveConceptPrimaryUnitCostRub(concept);
  const launchStatus = mapConceptStageToLaunchStatus(concept.stage);

  const selectedSample =
    concept.samples?.find((s) => s.status === 'approved') ||
    concept.samples?.[concept.samples.length - 1];
  const composition =
    selectedSample?.materialAndComposition?.trim() ||
    concept.techPack?.ru?.compositionAndDensity?.trim() ||
    '';
  const factoryName =
    concept.productionOrders?.[0]?.factoryName?.trim() ||
    concept.supplierName?.trim() ||
    '';

  const existing = findLinkedScenarioModelForConcept(concept, existingModels);

  if (existing) {
    let baseUpdated = ensureModelUnifiedV11(existing);
    if (!matchesBrandFilter(baseUpdated, brandCode)) {
      baseUpdated = changeModelBrandWithAudit(baseUpdated, brandCode, 'Product Lab R&D');
    }

    const mergedGallery = buildGalleryFromConcept(concept, baseUpdated.gallery || []);

    const nextPlans = { ...baseUpdated.plansByScenario };
    if (options?.initialMonthlyBuyouts && options.initialMonthlyBuyouts.length === 12) {
      const targetIds =
        options.targetScenarioIds && options.targetScenarioIds.length > 0
          ? options.targetScenarioIds
          : Object.keys(nextPlans).map(Number);
      for (const scId of targetIds) {
        if (nextPlans[scId]) {
          nextPlans[scId] = {
            ...nextPlans[scId],
            monthlyPacks: options.initialMonthlyBuyouts.map((v) =>
              Math.max(0, Math.round(v))
            ),
          };
        }
      }
    }

    const updatedModel: ScenarioModelSpec = ensureModelUnifiedV11({
      ...baseUpdated,
      title: concept.name.trim() || baseUpdated.title,
      subtitle:
        concept.collectionName?.trim() ||
        concept.ideaDescription?.slice(0, 90) ||
        baseUpdated.subtitle,
      launchStatus,
      unitsInPack: packUnits,
      retailPriceRub,
      unitCostRub,
      fabric: {
        ...baseUpdated.fabric,
        ...(composition ? { composition } : {}),
      },
      gallery: mergedGallery.length > 0 ? mergedGallery : baseUpdated.gallery,
      sharedSupplyAndFact: {
        ...baseUpdated.sharedSupplyAndFact!,
        factoryParams: {
          ...baseUpdated.sharedSupplyAndFact!.factoryParams,
          ...(factoryName ? { factoryName } : {}),
        },
      },
      plansByScenario: nextPlans,
    });

    const nextModels = existingModels.map((m) =>
      m.id === existing.id ? updatedModel : m
    );

    return {
      model: updatedModel,
      models: nextModels,
      createdNew: false,
    };
  }

  const safeSku = buildSafeCatalogSkuCode(concept, brandCode, existingModels);
  const gallery = buildGalleryFromConcept(concept, []);
  const created = createBrandProductModel(existingModels, scenarios, {
    brandCode,
    title: concept.name.trim() || 'Новая R&D модель',
    code: safeSku,
    categoryLabel:
      concept.collectionName?.trim() || 'Перенесено из Лаборатории R&D',
    retailPriceRub,
    unitCostRub,
    unitsInPack: packUnits,
    composition: composition || undefined,
    factoryName: factoryName || undefined,
    imageUrl: gallery[0]?.url || concept.imageUrl || undefined,
    initialMonthlyPacks: options?.initialMonthlyBuyouts,
  });

  let enrichedModel: ScenarioModelSpec = ensureModelUnifiedV11({
    ...created.model,
    launchStatus,
    gallery: gallery.length > 0 ? gallery : created.model.gallery,
  });

  if (options?.initialMonthlyBuyouts && options.initialMonthlyBuyouts.length === 12) {
    const nextPlans = { ...enrichedModel.plansByScenario };
    const targetIds =
      options.targetScenarioIds && options.targetScenarioIds.length > 0
        ? options.targetScenarioIds
        : Object.keys(nextPlans).map(Number);
    for (const scId of targetIds) {
      if (nextPlans[scId]) {
        nextPlans[scId] = {
          ...nextPlans[scId],
          monthlyPacks: options.initialMonthlyBuyouts.map((v) =>
            Math.max(0, Math.round(v))
          ),
        };
      }
    }
    enrichedModel = {
      ...enrichedModel,
      plansByScenario: nextPlans,
    };
  }

  const finalModels = created.models.map((m) =>
    m.id === created.model.id ? enrichedModel : m
  );

  return {
    model: enrichedModel,
    models: finalModels,
    createdNew: true,
  };
}

export function syncAllBrandConceptsToScenarioPortfolio(
  concepts: ProductConcept[],
  brandCode: CanonicalBrandCode,
  existingModels: ScenarioModelSpec[],
  scenarios: GrowthScenarioDef[] = INITIAL_SCENARIOS
): {
  models: ScenarioModelSpec[];
  syncedItems: { conceptId: string; model: ScenarioModelSpec; createdNew: boolean }[];
} {
  let workingModels = [...existingModels];
  const syncedItems: {
    conceptId: string;
    model: ScenarioModelSpec;
    createdNew: boolean;
  }[] = [];

  const matchingConcepts = concepts.filter(
    (c) => !c.isArchived && normalizeLabBrandCode(c.brandId) === brandCode
  );

  for (const concept of matchingConcepts) {
    const res = syncConceptToScenarioPortfolio(concept, workingModels, scenarios);
    workingModels = res.models;
    syncedItems.push({
      conceptId: concept.id,
      model: res.model,
      createdNew: res.createdNew,
    });
  }

  return {
    models: workingModels,
    syncedItems,
  };
}

export function buildConceptPatchFromScenarioModel(
  model: ScenarioModelSpec
): Partial<ProductConcept> & { name: string; brandId: string } {
  const brandCode = normalizeLabBrandCode(detectModelBrandPortfolioLabel(model));
  const packUnits = Math.max(1, Math.round(model.unitsInPack || 1));
  const perPieceUnitCost =
    packUnits > 1
      ? Math.max(1, Math.round((model.unitCostRub || 0) / packUnits))
      : Math.max(1, Math.round(model.unitCostRub || 0));

  const mainPhoto =
    model.gallery?.find((g) => g.isMain)?.url ||
    model.gallery?.[0]?.url ||
    'images/products/borners-editorial-hero.jpg';

  const galleryPhotos = (model.gallery || [])
    .filter((g): g is GalleryMediaItem & { url: string } => Boolean(g?.url))
    .map((g, idx) => ({
      id: g.id || `gp-cat-${model.id}-${idx + 1}`,
      url: g.url,
      caption: g.label || model.title,
    }));

  const stage: ConceptStage =
    model.launchStatus === 'Утверждено'
      ? 'LAUNCH'
      : model.launchStatus === 'В плане'
      ? 'PRODUCTION'
      : model.launchStatus === 'В разработке'
      ? 'SAMPLE'
      : 'IDEA';

  return {
    name: model.title,
    code: model.code,
    brandId: brandCode,
    collectionName: model.subtitle || 'Каталог SKU 2027',
    stage,
    linkedScenarioModelId: model.id,
    imageUrl: mainPhoto,
    galleryPhotos:
      galleryPhotos.length > 0
        ? galleryPhotos
        : [{ id: `gp-cat-${model.id}-main`, url: mainPhoto, caption: model.title }],
    plannedRetailPrice: model.retailPriceRub || 2490,
    plannedUnitCost: perPieceUnitCost,
    packUnitsCount: packUnits,
    supplierName:
      model.sharedSupplyAndFact?.factoryParams?.factoryName ||
      'Фабрика по паспорту SKU',
    ideaDescription: `${model.subtitle || model.title}. Состав: ${model.fabric?.composition || 'по паспорту SKU'}.`,
  };
}

export function buildPdfConceptFromScenarioModel(
  model: ScenarioModelSpec,
  concepts: ProductConcept[] = []
): ProductConcept {
  const brandCode = normalizeLabBrandCode(detectModelBrandPortfolioLabel(model));
  const brandLabel = formatLabBrandLabel(brandCode);
  const packUnits = Math.max(1, Math.round(model.unitsInPack || 1));
  const perPieceUnitCost =
    packUnits > 1
      ? Math.max(1, Math.round((model.unitCostRub || 0) / packUnits))
      : Math.max(1, Math.round(model.unitCostRub || 0));

  const cleanCodeUpper = (model.code || '').trim().toUpperCase();
  const cleanTitleUpper = (model.title || '').trim().toUpperCase();

  const linkedConcept =
    concepts.find((c) => {
      if (c.isArchived) return false;
      if (c.linkedScenarioModelId && c.linkedScenarioModelId === model.id) return true;
      if (normalizeLabBrandCode(c.brandId) !== brandCode) return false;
      const cCode = (c.code || '').trim().toUpperCase();
      const cAlt = cCode.replace('-LAB-', '-');
      const cName = (c.name || '').trim().toUpperCase();
      return (
        (cleanCodeUpper.length > 0 && (cCode === cleanCodeUpper || cAlt === cleanCodeUpper)) ||
        (cleanTitleUpper.length > 0 && cName === cleanTitleUpper)
      );
    }) || null;

  const validModelPhotos = (model.gallery || []).filter((g): g is GalleryMediaItem & { url: string } =>
    Boolean(g?.url && g.url.trim().length > 0)
  );
  const defaultBrandHero =
    brandCode === 'NA_TELE'
      ? 'images/products/rnd-seamless-base.jpg'
      : brandCode === 'AKUSHA'
      ? 'models/akusha/AKU-001_main.jpg'
      : brandCode === 'LISKANI'
      ? 'images/liskani/liskani-2027-01.jpg'
      : 'images/products/borners-editorial-hero.jpg';

  const mainPhoto =
    validModelPhotos.find((g) => g.isMain)?.url ||
    validModelPhotos[0]?.url ||
    linkedConcept?.imageUrl ||
    defaultBrandHero;

  const galleryPhotos =
    validModelPhotos.length > 0
      ? validModelPhotos.map((g, idx) => ({
          id: g.id || `gp-pdf-${model.id}-${idx + 1}`,
          url: g.url,
          caption: g.label || `${brandLabel} · ${model.title}`,
        }))
      : linkedConcept?.galleryPhotos && linkedConcept.galleryPhotos.length > 0
      ? linkedConcept.galleryPhotos
      : [{ id: `gp-pdf-${model.id}-main`, url: mainPhoto, caption: `${brandLabel} · ${model.title}` }];

  const compositionRu =
    [model.fabric?.composition, model.fabric?.density ? `Плотность ${model.fabric.density}` : '']
      .filter(Boolean)
      .join(' · ') ||
    linkedConcept?.techPack?.ru?.compositionAndDensity ||
    (brandCode === 'NA_TELE'
      ? '78% полиамид Sensil + 22% эластан Lycra · Бесшовное микрополотно 145 г/м²'
      : brandCode === 'AKUSHA'
      ? '100% натуральная кожа КРС / текстильная дышащая подкладка · Подошва ТЭП'
      : brandCode === 'LISKANI'
      ? '100% плотный полиэстер премиум плетения · Плотность 280 г/м²'
      : '92% микромодал Lenzing + 8% эластан · Плотность 180 г/м²');

  const constructionRu =
    [model.construction?.type, model.construction?.fit, model.construction?.seams]
      .filter(Boolean)
      .join(' · ') ||
    linkedConcept?.techPack?.ru?.construction ||
    (brandCode === 'NA_TELE'
      ? 'Бесшовная анатомическая посадка second-skin, лазерная обработка краёв без давления'
      : brandCode === 'AKUSHA'
      ? 'Анатомическая детская колодка с жёстким задником и гибким перекатом стопы'
      : brandCode === 'LISKANI'
      ? 'Шторная лента равномерной драпировки, усиленный нижний подгиб, ровная геометрия полотна'
      : 'Анатомический 3D-крой, плоские швы 4 иглы / 6 нитей, комфортная посадка');

  const waistbandRu =
    [model.waistband?.width, model.waistband?.type].filter(Boolean).join(' · ') ||
    linkedConcept?.techPack?.ru?.waistbandSpec ||
    (brandCode === 'NA_TELE'
      ? 'Невидимый клеевой пояс / мягкая микрофибровая окантовка'
      : brandCode === 'AKUSHA'
      ? 'Фиксация липучкой Velcro + эластичная шнуровка, размерный короб'
      : brandCode === 'LISKANI'
      ? 'Универсальная шторная тесьма 6 см под крючки и трубу'
      : 'Мягкая жаккардовая резинка 38 мм');

  const zhModelName =
    linkedConcept?.techPack?.zh?.modelName && linkedConcept.techPack.zh.modelName !== '待定'
      ? linkedConcept.techPack.zh.modelName
      : brandCode === 'NA_TELE'
      ? `НА ТЕЛЕ 女士无痕亲肤内衣 · ${model.code}`
      : brandCode === 'AKUSHA'
      ? `AKUSHA 儿童真皮舒适童鞋 · ${model.code}`
      : brandCode === 'LISKANI'
      ? `LISKANI 高精密遮光窗帘套装 · ${model.code}`
      : `${brandLabel} 莫代尔内衣系列 · ${model.code}`;

  const zhConstruction =
    linkedConcept?.techPack?.zh?.construction && linkedConcept.techPack.zh.construction !== '待定'
      ? linkedConcept.techPack.zh.construction
      : brandCode === 'NA_TELE'
      ? '无痕超声波贴合工艺 · 激光裁剪隐形边 · 亲肤零束缚版型'
      : brandCode === 'AKUSHA'
      ? '人体工学护踝童鞋楦型 · 防滑耐磨柔韧大底 · 加固车缝工艺'
      : brandCode === 'LISKANI'
      ? '高精密垂感定型窗帘工艺 · 均匀褶皱挂带 · 精细包边底摆'
      : '3D立体剪裁工艺 · 四针六线无骨平缝 · 舒适贴合版型';

  const zhComposition =
    linkedConcept?.techPack?.zh?.compositionAndDensity &&
    linkedConcept.techPack.zh.compositionAndDensity !== '待定'
      ? linkedConcept.techPack.zh.compositionAndDensity
      : brandCode === 'NA_TELE'
      ? '78% 锦纶超细纤维 + 22% 莱卡氨纶 · 克重 145g/m²'
      : brandCode === 'AKUSHA'
      ? '头层牛皮鞋面 + 透气内里 · 环保防滑TPR大底'
      : brandCode === 'LISKANI'
      ? '100% 高克重遮光聚酯纤维面料 · 克重 280g/m²'
      : '92% 兰精超细莫代尔 + 8% 氨纶 · 克重 180g/m²';

  const colorList = (model.palettes || [])
    .flatMap((p) => {
      const names = (p.colors || []).map((c) => c.nameRu).filter(Boolean);
      return names.length > 0 ? names : [p.title].filter(Boolean);
    });

  const factoryName =
    model.sharedSupplyAndFact?.factoryParams?.factoryName?.trim() ||
    linkedConcept?.productionOrders?.[0]?.factoryName ||
    linkedConcept?.supplierName ||
    (brandCode === 'NA_TELE'
      ? 'Фабрика Ханчжоу Бесшовные Технологии (Ханчжоу, КНР)'
      : brandCode === 'AKUSHA'
      ? 'Фабрика Гуанчжоу Детская Обувь (Гуанчжоу, КНР)'
      : brandCode === 'LISKANI'
      ? 'Фабрика Шаосин Домашний Текстиль (Шаосин, КНР)'
      : 'Фабрика Гуандун Апекс Интимэйт (Фошань, КНР)');

  return {
    id: linkedConcept?.id || `pdf-concept-${model.id}`,
    code: model.code.replace(/^№/, ''),
    name: `${brandLabel} · ${model.title}`,
    brandId: brandCode,
    collectionName: model.subtitle || model.categoryLabel || `Каталог ${brandLabel} 2027`,
    stage: mapConceptStageToLaunchStatus(linkedConcept?.stage || 'LAUNCH') === 'Утверждено' ? 'LAUNCH' : 'PRODUCTION',
    priority: 'High',
    linkedScenarioModelId: model.id,
    imageUrl: mainPhoto,
    galleryPhotos,
    ideaDescription: model.description || model.subtitle || model.title,
    customerProblem: model.subtitle || model.title,
    targetAudience: brandLabel,
    keyDifferentiators: constructionRu,
    referencesNotes: compositionRu,
    plannedRetailPrice: model.retailPriceRub || 2490,
    plannedUnitCost: perPieceUnitCost,
    packUnitsCount: packUnits,
    currency: 'RUB',
    targetLaunchDate: '2027-03-01',
    ownerId: 'user-owner',
    supplierName: factoryName,
    sampleStatus: 'Образец утверждён к запуску',
    testResults: 'Посадка и качество пошива подтверждены',
    developmentBudgetRub: 0,
    selectedDesignVersion: 1,
    designVersions: linkedConcept?.designVersions || [],
    comments: linkedConcept?.comments || [],
    colorCombinations: colorList.length > 0 ? colorList : ['Базовая палитра модели'],
    samples: linkedConcept?.samples || [],
    productionOrders: linkedConcept?.productionOrders || [],
    stageHistory: linkedConcept?.stageHistory || [],
    techPack: {
      ru: {
        modelName: `${brandLabel} · ${model.title} (${model.code})`,
        construction: constructionRu,
        material: compositionRu,
        compositionAndDensity: compositionRu,
        colorAndPantone: colorList.join(' / ') || 'По утверждённой карте цветов',
        sizeGrading: 'Полная размерная сетка по стандарту бренда',
        waistbandSpec: waistbandRu,
        seamsSpec: constructionRu,
        packagingSpec: `Комплект ${packUnits} ед. со штрихкодом EAC / Честный ЗНАК`,
        qualityRequirements: 'Инспекция AQL 1.5 перед отгрузкой партии',
        referencesNote: model.wbArticle ? `Артикул WB: ${model.wbArticle}` : model.code,
      },
      en: {
        modelName: `${brandLabel} ${model.code}`,
        construction: constructionRu,
        material: compositionRu,
        compositionAndDensity: compositionRu,
        colorAndPantone: colorList.join(' / ') || 'Approved Pantone colorway',
        sizeGrading: 'Standard brand size grading',
        waistbandSpec: waistbandRu,
        seamsSpec: constructionRu,
        packagingSpec: `${packUnits}-unit pack with EAC barcode`,
        qualityRequirements: 'AQL 1.5 pre-shipment inspection',
        referencesNote: model.code,
      },
      zh: {
        modelName: zhModelName,
        construction: zhConstruction,
        material: zhComposition,
        compositionAndDensity: zhComposition,
        colorAndPantone: '按确认色卡配比生产',
        sizeGrading: '按确认尺码表跳码生产',
        waistbandSpec: waistbandRu,
        seamsSpec: zhConstruction,
        packagingSpec: `每盒/组 ${packUnits} 件独立条码包装 (Честный ЗНАК)`,
        qualityRequirements: '出货前执行 AQL 1.5 验货标准',
        referencesNote: model.code,
      },
    },
    isDemo: false,
    isArchived: false,
    createdAt: linkedConcept?.createdAt || new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}
