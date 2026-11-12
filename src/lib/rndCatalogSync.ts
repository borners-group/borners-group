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
