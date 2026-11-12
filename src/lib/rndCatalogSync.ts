import type { ConceptStage, ProductConcept } from '../types/platform.ts';
import type {
  GalleryMediaItem,
  GrowthScenarioDef,
  PackColor,
  PalettePack,
  ScenarioCommercialPlan,
  ScenarioModelSpec,
} from './scenarioData.ts';
import { INITIAL_SCENARIOS } from './scenarioData.ts';
import {
  cleanTechPackText,
  getBrandProductionProfile,
} from './brandProductionConfig.ts';
import {
  type CanonicalBrandCode,
  changeModelBrandWithAudit,
  createBrandProductModel,
  createCustomPurchaseOrder,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  isScenarioCompatibleWithBrand,
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
    case 'REJECTED':
    case 'CANCELLED':
      return 'В архиве';
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

  // Если в самой R&D-карточке нет ни одного фото, сохраняем ранее привязанную галерею модели;
  // если в R&D-карточке фото заданы — считаем их авторитетными (чтобы удалённые в R&D фото не воскресали)
  if (urls.length === 0) {
    for (const eg of existingGallery) {
      pushUrl(eg?.url, eg?.label || concept.name, eg?.category || 'pack');
    }
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
  concept: Pick<
    ProductConcept,
    'plannedRetailPrice' | 'plannedUnitCost' | 'packUnitsCount' | 'productionOrders'
  >
): number {
  const packUnits = Math.max(1, Math.round(concept.packUnitsCount || 1));
  const retail = Math.max(100, Math.round(concept.plannedRetailPrice || 2490));
  const po = concept.productionOrders?.[0];
  const poRubUnitCost =
    po && po.unitPrice > 0 && (!po.currency || po.currency === 'RUB')
      ? Math.round(po.unitPrice)
      : 0;
  const rawUnitCost =
    poRubUnitCost > 0 ? poRubUnitCost : Math.max(0, Math.round(concept.plannedUnitCost || 0));
  if (rawUnitCost <= 0) {
    return Math.max(50, Math.round(retail * 0.25));
  }
  return Math.round(rawUnitCost * packUnits);
}

function parseMonthIndexFromIsoDate(iso?: string, fallbackMonthIdx = 2): number {
  if (!iso || typeof iso !== 'string') return fallbackMonthIdx;
  const m = iso.trim().match(/^\d{4}-(\d{2})/);
  if (!m) return fallbackMonthIdx;
  const parsed = Number(m[1]) - 1;
  return Number.isFinite(parsed) ? Math.min(11, Math.max(0, parsed)) : fallbackMonthIdx;
}

function extractConceptOrderPacksAndMonth(
  concept: ProductConcept,
  packUnits: number
): { orderPacks: number; arrivalMonthIdx: number; factoryName: string; readinessIso?: string } {
  const po = concept.productionOrders?.[0];
  const arrivalMonthIdx = parseMonthIndexFromIsoDate(
    po?.plannedReadyDate || concept.targetLaunchDate,
    2
  );
  const factoryName = (po?.factoryName || concept.supplierName || '').trim();
  if (!po) {
    return { orderPacks: 0, arrivalMonthIdx, factoryName };
  }
  const sumBySize = Object.values(po.packsBySize || {}).reduce(
    (acc, v) => acc + Math.max(0, Math.round(Number(v) || 0)),
    0
  );
  const fromUnits =
    po.totalUnits && po.totalUnits > 0
      ? Math.max(1, Math.round(po.totalUnits / Math.max(1, packUnits)))
      : 0;
  return {
    orderPacks: sumBySize > 0 ? sumBySize : fromUnits,
    arrivalMonthIdx,
    factoryName,
    readinessIso: po.plannedReadyDate || concept.targetLaunchDate,
  };
}

function buildInitialRampPacksFromBatch(totalPacks: number, startMonthIdx: number): number[] {
  const out = Array<number>(12).fill(0);
  if (totalPacks <= 0) return out;
  const safeStart = Math.min(11, Math.max(0, startMonthIdx));
  const remainingMonths = 12 - safeStart;
  const span = Math.min(4, Math.max(1, remainingMonths));
  const weights =
    span === 1
      ? [1]
      : span === 2
      ? [0.45, 0.55]
      : span === 3
      ? [0.3, 0.38, 0.32]
      : [0.22, 0.28, 0.26, 0.24];

  let allocated = 0;
  for (let i = 0; i < span; i++) {
    const mIdx = safeStart + i;
    const val =
      i === span - 1
        ? Math.max(0, totalPacks - allocated)
        : Math.max(0, Math.round(totalPacks * weights[i]));
    out[mIdx] = val;
    allocated += val;
  }
  return out;
}

function buildPalettesFromConceptColors(
  concept: ProductConcept,
  existingPalettes: PalettePack[] = [],
  coverUrl?: string
): PalettePack[] {
  const rawPoComp = (concept.productionOrders?.[0]?.packColorComposition || '').trim();
  const poColors = rawPoComp
    ? rawPoComp
        .split(/[,;/+·]+/)
        .map((s) => s.replace(/\(\s*\d+\s*шт\.?\s*\)/gi, '').trim())
        .filter(Boolean)
    : [];
  const rawNames =
    poColors.length > 0
      ? poColors
      : (concept.colorCombinations || []).map((c) => c.trim()).filter(Boolean);
  if (rawNames.length === 0) return existingPalettes;

  const existingByName = new Map<string, PackColor>();
  for (const p of existingPalettes) {
    for (const c of p.colors || []) {
      existingByName.set(c.nameRu.trim().toLowerCase(), c);
    }
  }

  const fallbackSwatches = ['#1F2937', '#D6CFC7', '#7D7268', '#8C6D53', '#3B5249', '#B85D35'];
  const colors: PackColor[] = rawNames.map((name, idx) => {
    const prev = existingByName.get(name.toLowerCase());
    if (prev) return prev;
    const hex = fallbackSwatches[idx % fallbackSwatches.length];
    return {
      nameRu: name,
      pantone: 'По карте R&D',
      hex,
      bandHex: hex,
      textHex: '#FFFFFF',
    };
  });

  const firstExisting = existingPalettes[0];
  const updatedFirst: PalettePack = {
    id: firstExisting?.id || `pal-rnd-${concept.id}`,
    title: firstExisting?.title || concept.collectionName || 'Палитра R&D',
    subtitle: `${colors.length} цв. · Комплект ${Math.max(1, concept.packUnitsCount || 1)} ед.`,
    statusLabel: 'Из Лаборатории R&D',
    imageUrl: coverUrl || firstExisting?.imageUrl,
    colors,
  };

  return [updatedFirst, ...existingPalettes.slice(1)];
}

function applyRndProductionOrderToModel(
  model: ScenarioModelSpec,
  concept: ProductConcept,
  orderPacks: number,
  arrivalMonthIdx: number,
  factoryName: string,
  unitCostRub: number,
  readinessIso?: string
): ScenarioModelSpec {
  if (orderPacks <= 0) return model;
  const shared = model.sharedSupplyAndFact!;
  const rndNoteMarker = `[R&D ${concept.code || concept.id}]`;
  const existingRndPoIdx = shared.approvedOrders.findIndex(
    (po) => typeof po.note === 'string' && po.note.includes(rndNoteMarker)
  );

  if (existingRndPoIdx >= 0) {
    const prevPo = shared.approvedOrders[existingRndPoIdx];
    const unitsInPack = Math.max(1, model.unitsInPack || 1);
    const totalOrderRub = orderPacks * unitCostRub;
    const prepayPct = shared.factoryParams.prepaymentPct || 30;
    const prepaymentRub = Math.round((totalOrderRub * prepayPct) / 100);
    const updatedPo = {
      ...prevPo,
      factoryName: factoryName || prevPo.factoryName,
      arrivalMonthIdx,
      coveredEndMonthIdx: arrivalMonthIdx,
      packsQty: orderPacks,
      unitsInPack,
      physicalUnitsQty: orderPacks * unitsInPack,
      lockedUnitCostRub: unitCostRub,
      totalOrderRub,
      prepaymentRub,
      balancePaymentRub: totalOrderRub - prepaymentRub,
    };
    const nextOrders = [...shared.approvedOrders];
    nextOrders[existingRndPoIdx] = updatedPo;
    return {
      ...model,
      sharedSupplyAndFact: {
        ...shared,
        approvedOrders: nextOrders,
      },
    };
  }

  return createCustomPurchaseOrder(model, {
    packsQty: orderPacks,
    unitCostRub,
    factoryName: factoryName || undefined,
    arrivalMonthIdx,
    requiredArrivalDateIso: readinessIso,
    note: `${rndNoteMarker} Партия из Лаборатории R&D`,
    author: 'Product Lab R&D',
  });
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
  const rawComp =
    selectedSample?.materialAndComposition?.trim() ||
    concept.techPack?.ru?.compositionAndDensity?.trim() ||
    '';
  const composition = rawComp.includes('待定') || rawComp.includes('Определяется') ? '' : rawComp;

  const { orderPacks, arrivalMonthIdx, factoryName, readinessIso } =
    extractConceptOrderPacksAndMonth(concept, packUnits);
  const isProductionOrLaunchStage =
    concept.stage === 'PRODUCTION' ||
    concept.stage === 'LAUNCH' ||
    concept.stage === 'APPROVED';

  const existing = findLinkedScenarioModelForConcept(concept, existingModels);

  if (existing) {
    let baseUpdated = ensureModelUnifiedV11(existing);
    const prevRetail = baseUpdated.retailPriceRub;
    if (!matchesBrandFilter(baseUpdated, brandCode)) {
      baseUpdated = changeModelBrandWithAudit(baseUpdated, brandCode, 'Product Lab R&D');
    }

    const mergedGallery = buildGalleryFromConcept(concept, baseUpdated.gallery || []);
    const mergedPalettes = buildPalettesFromConceptColors(
      concept,
      baseUpdated.palettes || [],
      mergedGallery[0]?.url
    );

    const nextPlans: Record<number, ScenarioCommercialPlan> = { ...baseUpdated.plansByScenario };

    // Гарантируем наличие слота плана для каждого совместимого сценария бренда (включая новые независимые сценарии 4, 5...)
    for (const sc of scenarios) {
      if (sc.isArchived || sc.id === 100) continue;
      if (!nextPlans[sc.id]) {
        const templatePlan =
          nextPlans[2] ||
          nextPlans[1] ||
          Object.values(nextPlans)[0];
        nextPlans[sc.id] = templatePlan
          ? {
              ...templatePlan,
              scenarioId: sc.id,
              monthlyPacks: Array<number>(12).fill(0),
              monthlyPricesRub: Array<number>(12).fill(retailPriceRub),
              monthlyReceiptsPacks: Array<number>(12).fill(0),
            }
          : {
              scenarioId: sc.id,
              monthlyPacks: Array<number>(12).fill(0),
              monthlyPricesRub: Array<number>(12).fill(retailPriceRub),
              monthlyReceiptsPacks: Array<number>(12).fill(0),
              initialStockPacks: 0,
              firstOrderPacks: orderPacks,
              nextOrderDateLabel: 'По графику R&D',
              salesStartMonthIdx: arrivalMonthIdx,
              warehouseArrivalMonthIdx: arrivalMonthIdx,
              warehouseArrivalDateLabel: 'По партии R&D',
            };
      }
    }

    // Обновляем базовую цену только в тех месяцах, где не была выставлена индивидуальная сезонная цена
    for (const scIdStr of Object.keys(nextPlans)) {
      const scId = Number(scIdStr);
      const pl = nextPlans[scId];
      if (!pl) continue;
      const updatedMonthlyPrices = (pl.monthlyPricesRub || Array<number>(12).fill(retailPriceRub)).map(
        (pr) => (!pr || pr === prevRetail ? retailPriceRub : pr)
      );
      let updatedMonthlyPacks = pl.monthlyPacks || Array<number>(12).fill(0);
      let updatedReceipts = pl.monthlyReceiptsPacks || Array<number>(12).fill(0);

      const scDef = scenarios.find((s) => s.id === scId);
      const isCompatibleForAutoSeed =
        scDef &&
        !scDef.isArchived &&
        isScenarioCompatibleWithBrand(scDef, brandCode) &&
        (scId !== 1 || brandCode === 'BORNERS');

      if (
        !options?.initialMonthlyBuyouts &&
        isProductionOrLaunchStage &&
        orderPacks > 0 &&
        isCompatibleForAutoSeed &&
        updatedMonthlyPacks.every((v) => !v)
      ) {
        updatedMonthlyPacks = buildInitialRampPacksFromBatch(orderPacks, arrivalMonthIdx);
        updatedReceipts = [...updatedReceipts];
        updatedReceipts[arrivalMonthIdx] = Math.max(updatedReceipts[arrivalMonthIdx] || 0, orderPacks);
      }

      const buyoutPct = Math.min(100, Math.max(10, pl.buyoutRatePct || baseUpdated.buyoutRatePct || 80));
      const updatedOrdersRub = pl.monthlyOrdersPacks
        ? pl.monthlyOrdersPacks.map((op, idx) =>
            Math.round(op * (updatedMonthlyPrices[idx] || retailPriceRub))
          )
        : updatedMonthlyPacks.map((bp, idx) =>
            Math.round(
              Math.round((bp * 100) / buyoutPct) * (updatedMonthlyPrices[idx] || retailPriceRub)
            )
          );

      nextPlans[scId] = {
        ...pl,
        monthlyPacks: updatedMonthlyPacks,
        monthlyPricesRub: updatedMonthlyPrices,
        monthlyReceiptsPacks: updatedReceipts,
        monthlyOrdersRub: pl.monthlyOrdersRub ? updatedOrdersRub : pl.monthlyOrdersRub,
        firstOrderPacks: orderPacks > 0 ? orderPacks : pl.firstOrderPacks,
        salesStartMonthIdx: orderPacks > 0 ? arrivalMonthIdx : pl.salesStartMonthIdx,
        warehouseArrivalMonthIdx: orderPacks > 0 ? arrivalMonthIdx : pl.warehouseArrivalMonthIdx,
      };
    }

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

    let updatedModel: ScenarioModelSpec = ensureModelUnifiedV11({
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
      palettes: mergedPalettes,
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

    if (orderPacks > 0) {
      updatedModel = applyRndProductionOrderToModel(
        updatedModel,
        concept,
        orderPacks,
        arrivalMonthIdx,
        factoryName,
        unitCostRub,
        readinessIso
      );
    }

    const nextModels = existingModels.map((m) =>
      m.id === existing.id ? updatedModel : m
    );

    return {
      model: updatedModel,
      models: nextModels,
      createdNew: false,
    };
  }

  const autoSeedPacks =
    !options?.initialMonthlyBuyouts && isProductionOrLaunchStage && orderPacks > 0
      ? buildInitialRampPacksFromBatch(orderPacks, arrivalMonthIdx)
      : undefined;

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
    initialMonthlyPacks: options?.initialMonthlyBuyouts || autoSeedPacks,
  });

  const createdPalettes = buildPalettesFromConceptColors(
    concept,
    created.model.palettes || [],
    gallery[0]?.url
  );

  let enrichedModel: ScenarioModelSpec = ensureModelUnifiedV11({
    ...created.model,
    launchStatus,
    palettes: createdPalettes,
    gallery: gallery.length > 0 ? gallery : created.model.gallery,
  });

  // Если авто-посев был из производственной партии R&D для не-BORNERS бренда, очищаем Сценарий №1 BORNERS для чистоты инварианта
  if (autoSeedPacks && brandCode !== 'BORNERS' && enrichedModel.plansByScenario[1]) {
    enrichedModel = {
      ...enrichedModel,
      plansByScenario: {
        ...enrichedModel.plansByScenario,
        1: {
          ...enrichedModel.plansByScenario[1],
          monthlyPacks: Array<number>(12).fill(0),
          monthlyReceiptsPacks: Array<number>(12).fill(0),
        },
      },
    };
  }

  if (orderPacks > 0) {
    const nextPlans = { ...enrichedModel.plansByScenario };
    for (const scIdStr of Object.keys(nextPlans)) {
      const scId = Number(scIdStr);
      if (scId === 1 && brandCode !== 'BORNERS') continue;
      const pl = nextPlans[scId];
      if (!pl) continue;
      const nextReceipts = [...(pl.monthlyReceiptsPacks || Array<number>(12).fill(0))];
      nextReceipts[arrivalMonthIdx] = Math.max(nextReceipts[arrivalMonthIdx] || 0, orderPacks);
      nextPlans[scId] = {
        ...pl,
        firstOrderPacks: orderPacks,
        salesStartMonthIdx: arrivalMonthIdx,
        warehouseArrivalMonthIdx: arrivalMonthIdx,
        monthlyReceiptsPacks: nextReceipts,
      };
    }
    enrichedModel = applyRndProductionOrderToModel(
      { ...enrichedModel, plansByScenario: nextPlans },
      concept,
      orderPacks,
      arrivalMonthIdx,
      factoryName,
      unitCostRub,
      readinessIso
    );
  }

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
  const profile = getBrandProductionProfile(brandCode, `${model.title} ${model.categoryLabel || ''}`);
  const brandLabel = profile.brandLabel;
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

  const validModelPhotos = (model.gallery || []).filter(
    (g): g is GalleryMediaItem & { url: string } => Boolean(g?.url && g.url.trim().length > 0)
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

  const rawModelComp = [
    model.fabric?.composition,
    model.fabric?.density ? `Плотность ${model.fabric.density}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const compositionRu = cleanTechPackText(
    rawModelComp || linkedConcept?.techPack?.ru?.compositionAndDensity,
    profile.defaultMaterialRu
  );

  const rawModelConstr = [
    model.construction?.type,
    model.construction?.fit,
    model.construction?.seams,
  ]
    .filter(Boolean)
    .join(' · ');

  const constructionRu = cleanTechPackText(
    rawModelConstr || linkedConcept?.techPack?.ru?.construction,
    profile.defaultConstructionRu
  );

  const rawWaistband = [model.waistband?.width, model.waistband?.type].filter(Boolean).join(' · ');
  const waistbandRu = cleanTechPackText(
    rawWaistband || linkedConcept?.techPack?.ru?.waistbandSpec,
    profile.defaultWaistbandOrTrimRu
  );

  const zhModelName = cleanTechPackText(
    linkedConcept?.techPack?.zh?.modelName,
    brandCode === 'NA_TELE'
      ? `НА ТЕЛЕ 女士无痕亲肤内衣 · ${model.code}`
      : brandCode === 'AKUSHA'
      ? `AKUSHA 真皮舒适鞋履 · ${model.code}`
      : brandCode === 'LISKANI'
      ? `LISKANI 高精密遮光窗帘套装 · ${model.code}`
      : `${brandLabel} 莫代尔内衣系列 · ${model.code}`
  );

  const zhConstruction = cleanTechPackText(
    linkedConcept?.techPack?.zh?.construction,
    profile.defaultConstructionZh
  );

  const zhComposition = cleanTechPackText(
    linkedConcept?.techPack?.zh?.compositionAndDensity,
    profile.defaultMaterialZh
  );

  const colorList = (model.palettes || []).flatMap((p) => {
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
    stage:
      mapConceptStageToLaunchStatus(linkedConcept?.stage || 'LAUNCH') === 'Утверждено'
        ? 'LAUNCH'
        : 'PRODUCTION',
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
        sizeGrading: profile.sizeGridLabelRu,
        waistbandSpec: waistbandRu,
        seamsSpec: constructionRu,
        packagingSpec: `Комплект ${packUnits} ед. со штрихкодом EAC / Честный ЗНАК`,
        qualityRequirements: 'Инспекция AQL 1.5 перед отгрузкой партии',
        referencesNote: model.wbArticle ? `Артикул WB: ${model.wbArticle}` : model.code,
      },
      en: {
        modelName: `${brandLabel} ${model.code}`,
        construction: profile.defaultConstructionEn,
        material: profile.defaultMaterialEn,
        compositionAndDensity: profile.defaultMaterialEn,
        colorAndPantone: colorList.join(' / ') || 'Approved Pantone colorway',
        sizeGrading: profile.sizeGridLabelEn,
        waistbandSpec: waistbandRu,
        seamsSpec: profile.defaultConstructionEn,
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
        sizeGrading: profile.sizeGridLabelZh,
        waistbandSpec: profile.defaultWaistbandOrTrimZh,
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
