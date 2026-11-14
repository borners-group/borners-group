'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  FlaskConical,
  Folder,
  ImagePlus,
  LayoutGrid,
  Plus,
  Search,
  Table as TableIcon,
  Trash2,
  X,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import { compressImageFileToDataUrl } from '@/lib/document-export';
import {
  canUserEditBrand,
  canUserViewCostPrice,
  canUserViewFinance,
  formatCurrencyRub,
} from '@/lib/finance';
import {
  GrowthScenarioDef,
  ScenarioModelSpec,
  MONTHS_SHORT_RU,
  computeModelScenarioMetrics,
  resolvePublicAssetUrl,
} from '@/lib/scenarioData';

function resolveCatalogAssetUrl(url: string): string {
  return resolvePublicAssetUrl(url);
}
import { getActingSkuByWbOrVendor } from '@/lib/actingAssortment2027';
import { BoxerPackStackSvg } from '@/components/sections/ScenarioVisualParts';
import { PeaklyCatalogGroupsAndBrandsView } from '@/components/sections/PeaklyBrandCatalogAndGroups';
import { ScenarioModelCardScreen } from '@/components/sections/ScenarioModelCardScreen';
import { PdfConstructorModal } from '@/components/sections/PdfConstructorModal';
import {
  markModelAsDeletedInStorage,
  unmarkModelAsDeletedInStorage,
  useLiveScenarioPortfolio,
} from '@/lib/useLiveScenarioPortfolio';
import {
  CanonicalBrandCode,
  createBrandProductModel,
  createIndependentBrandScenario,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  getBrandUnitConfig,
  getDefaultBuyoutRatePctForBrand,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
} from '@/lib/unifiedBusinessEngine';
import { saveModelGalleryToIdb } from '@/lib/safeStorage';
import {
  isBrandScenarioExplicitlyNone,
  resolveEffectiveScenarioForModel,
} from '@/lib/portfolioPersistence';
import { loadProductGroups } from '@/lib/productGroups';
import {
  buildPdfConceptFromScenarioModel,
  formatLabBrandLabel,
  normalizeLabBrandCode,
  syncAllBrandConceptsToScenarioPortfolio,
} from '@/lib/rndCatalogSync';

interface BrandCreatePreset {
  skuPrefix: string;
  categories: string[];
  placeholderName: string;
  defaultCollection: string;
  defaultComposition: string;
  defaultPrice: string;
  defaultCost: string;
  defaultUnitsInPack: string;
  unitHint: string;
}

const BRAND_CREATE_PRESETS: Record<CanonicalBrandCode, BrandCreatePreset> = {
  LISKANI: {
    skuPrefix: 'LSC',
    categories: [
      'Портьеры Блэкаут',
      'Портьеры Мрамор',
      'Портьеры Рогожка',
      'Тюль Вуаль',
      'Шторы димаут',
      'Римские шторы',
      'Покрывала и пледы',
      'Декоративный текстиль',
    ],
    placeholderName: 'Например: Шторы Блэкаут — Капучино (300×240..400×270)',
    defaultCollection: 'LISKANI Home 2027',
    defaultComposition: '100% полиэстер премиум (портьерный блэкаут / мрамор / рогожка)',
    defaultPrice: '3100',
    defaultCost: '1150',
    defaultUnitsInPack: '2',
    unitHint: 'полотен / ед. в комплекте',
  },
  AKUSHA: {
    skuPrefix: 'AKU',
    categories: [
      'Кроссовки и кеды',
      'Ботинки и челси',
      'Лоферы и туфли',
      'Домашняя обувь',
      'Аксессуары',
    ],
    placeholderName: 'Например: Кроссовки кожаные AKUSHA Urban Base',
    defaultCollection: 'AKUSHA Footwear 2027',
    defaultComposition: 'Натуральная кожа / замша премиум + подошва ТЭП',
    defaultPrice: '4490',
    defaultCost: '1490',
    defaultUnitsInPack: '1',
    unitHint: 'пар в коробке',
  },
  NA_TELE: {
    skuPrefix: 'NTL',
    categories: [
      'Женские комплекты',
      'Топы и бралетты',
      'Боди и лонгсливы',
      'Базовое бельё',
      'Домашняя одежда',
    ],
    placeholderName: 'Например: Комплект микромодал НА ТЕЛЕ Soft Touch',
    defaultCollection: 'НА ТЕЛЕ 2027',
    defaultComposition: '92% микромодал (Австрия), 8% эластан',
    defaultPrice: '2690',
    defaultCost: '780',
    defaultUnitsInPack: '2',
    unitHint: 'изд. в комплекте',
  },
  FUKAI: {
    skuPrefix: 'FUK',
    categories: [
      'Базовые комплекты WB',
      'Мультипаки 3–5 шт.',
      'Термобельё и база',
      'Носки и база',
    ],
    placeholderName: 'Например: Мультипак базовый FUKAI 4 шт.',
    defaultCollection: 'FUKAI Base 2027',
    defaultComposition: '95% хлопок пенье, 5% эластан',
    defaultPrice: '1490',
    defaultCost: '480',
    defaultUnitsInPack: '4',
    unitHint: 'шт. в комплекте',
  },
  BORNERS: {
    skuPrefix: 'BRN',
    categories: [
      'Боксеры',
      'Транки',
      'Брифы',
      'Мультипак',
      'Футболки и база',
      'Лимитированная капсула',
    ],
    placeholderName: 'Например: Боксеры BORNERS Architect Modal',
    defaultCollection: 'BORNERS CORE 2027',
    defaultComposition: '92% модал / хлопок компакт-пенье, 8% эластан',
    defaultPrice: '2390',
    defaultCost: '620',
    defaultUnitsInPack: '4',
    unitHint: 'шт. в комплекте',
  },
};

function computeNextBrandSkuCode(
  models: ScenarioModelSpec[],
  brandCode: CanonicalBrandCode
): string {
  const preset = BRAND_CREATE_PRESETS[brandCode] || BRAND_CREATE_PRESETS.BORNERS;
  const brandModels = models.filter((m) => matchesBrandFilter(m, brandCode));
  const usedNums = new Set<number>();
  brandModels.forEach((m) => {
    const match = m.code.match(/(\d+)$/);
    if (match) usedNums.add(Number(match[1]));
  });
  let candidate =
    brandCode === 'BORNERS'
      ? Math.max(brandModels.length + 1, 24)
      : Math.max(brandModels.length + 1, 1);
  while (usedNums.has(candidate)) candidate += 1;
  return `${preset.skuPrefix}-${String(candidate).padStart(3, '0')}`;
}

export function ProductCatalogView() {
  const {
    currentUser,
    products,
    concepts,
    updateConcept,
    brandFilter,
    setBrandFilter,
    selectedProductId,
    setSelectedProductId,
    navigateTo,
    archiveEntity,
    notify,
  } = usePlatform();

  const hasCost = canUserViewCostPrice(currentUser);
  const hasFinance = canUserViewFinance(currentUser);
  const canEditModel = (m: ScenarioModelSpec) => {
    const norm = normalizePortfolioBrandCode(
      detectModelBrandPortfolioLabel(m) || m.brandId || 'BORNERS'
    );
    return canUserEditBrand(currentUser, norm === 'ALL' ? 'BORNERS' : norm);
  };
  const canCreateInActiveScope =
    brandFilter === 'ALL'
      ? (['BORNERS', 'FUKAI', 'NA_TELE', 'AKUSHA', 'LISKANI'] as const).some((c) =>
          canUserEditBrand(currentUser, c)
        )
      : canUserEditBrand(
          currentUser,
          normalizePortfolioBrandCode(brandFilter) === 'ALL'
            ? 'BORNERS'
            : normalizePortfolioBrandCode(brandFilter)
        );

  const [viewMode, setViewMode] = useState<'grid' | 'groups' | 'table' | 'liskani_269'>('grid');
  const [liskani269MonthIdx, setLiskani269MonthIdx] = useState<'ALL' | number>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [activePassportModelId, setActivePassportModelId] = useState<string | null>(null);
  const [pdfModalModel, setPdfModalModel] = useState<ScenarioModelSpec | null>(null);

  const {
    models: rawScenarioModels,
    scenarios,
    currentScenario,
    includeGroupPortfolioInS1,
    selectedScenarioByBrand,
    setSelectedScenarioForBrand,
    setSelectedScenarioId,
    updateModelSpec,
    updateModelsBatch,
    updateScenariosBatch,
    launchStarterCabinet,
  } = useLiveScenarioPortfolio();

  // Гарантируем, что все модели очищены от чужих дефолтов Borners2
  const scenarioModels = useMemo(
    () => rawScenarioModels.map((m) => ensureModelUnifiedV11(m)),
    [rawScenarioModels]
  );

  const [productGroupsReloadTick, setProductGroupsReloadTick] = useState(0);
  useEffect(() => {
    const handleGroupsChanged = () => {
      loadProductGroups(scenarioModels);
      setProductGroupsReloadTick((v) => v + 1);
    };
    window.addEventListener('borners-product-groups-changed', handleGroupsChanged);
    return () =>
      window.removeEventListener('borners-product-groups-changed', handleGroupsChanged);
  }, [scenarioModels]);

  const emptyNoneScenario: GrowthScenarioDef = useMemo(
    () => ({
      ...(scenarios[0] || currentScenario),
      id: -1,
      title: 'Нет активного сценария',
      monthlyTargetMln: 0,
    }),
    [scenarios, currentScenario]
  );

  const resolveCatalogModelScenario = (mod: ScenarioModelSpec) => {
    const modBrandCode = normalizePortfolioBrandCode(
      detectModelBrandPortfolioLabel(mod) || mod.brandId || 'BORNERS'
    );
    const fallbackValidScenario = resolveEffectiveScenarioForModel(
      mod,
      scenarios,
      selectedScenarioByBrand,
      currentScenario,
      includeGroupPortfolioInS1
    );
    const explicitlyNone =
      isBrandScenarioExplicitlyNone(brandFilter, selectedScenarioByBrand) ||
      isBrandScenarioExplicitlyNone(modBrandCode, selectedScenarioByBrand);
    return {
      modBrandCode,
      explicitlyNone,
      effectiveScenario: explicitlyNone ? emptyNoneScenario : fallbackValidScenario,
      fallbackValidScenario,
    };
  };

  const activeLabConceptsForFilter = useMemo(
    () =>
      concepts.filter((c) => {
        if (c.isArchived || ['REJECTED', 'CANCELLED'].includes(c.stage)) return false;
        if (!brandFilter || brandFilter === 'ALL') return true;
        return normalizeLabBrandCode(c.brandId) === normalizeLabBrandCode(brandFilter);
      }),
    [concepts, brandFilter]
  );

  const handleSyncBrandFromLab = () => {
    const targetBrand: CanonicalBrandCode =
      brandFilter && brandFilter !== 'ALL'
        ? normalizeLabBrandCode(brandFilter)
        : 'NA_TELE';
    const res = syncAllBrandConceptsToScenarioPortfolio(
      concepts,
      targetBrand,
      scenarioModels,
      scenarios
    );
    if (res.syncedItems.length === 0) {
      navigateTo('product-lab', { brandId: targetBrand });
      return;
    }
    updateModelsBatch(() => res.models);
    for (const item of res.syncedItems) {
      updateConcept(item.conceptId, { linkedScenarioModelId: item.model.id });
      if (item.model.gallery?.length) {
        void saveModelGalleryToIdb(item.model.id, item.model.gallery);
      }
    }
    notify(
      'success',
      `Перенесено в каталог ${formatLabBrandLabel(targetBrand)}: ${res.syncedItems.length} SKU`,
      'Все фото, цены, себестоимость и состав синхронизированы с 02 · Продажи и 03 · Закупки.'
    );
  };

  // Сбрасываем фильтр категории при смене бренда
  useEffect(() => {
    setCategoryFilter('ALL');
  }, [brandFilter]);

  // Автоматическое открытие паспорта модели при переходе из R&D, поиска или дашборда
  useEffect(() => {
    if (!selectedProductId || scenarioModels.length === 0) return;
    const targetUpper = selectedProductId.trim().toUpperCase();
    const linkedCatalogProd = products.find((p) => p.id === selectedProductId);
    const linkedConcept = concepts.find(
      (c) =>
        c.linkedProductId === selectedProductId ||
        c.linkedScenarioModelId === selectedProductId ||
        c.code.trim().toUpperCase() === targetUpper
    );
    const matched = scenarioModels.find((m) => {
      if (m.id === selectedProductId) return true;
      if (m.code.trim().toUpperCase() === targetUpper) return true;
      if (linkedConcept?.linkedScenarioModelId && m.id === linkedConcept.linkedScenarioModelId) {
        return true;
      }
      if (linkedConcept && m.code.trim().toUpperCase() === linkedConcept.code.trim().toUpperCase()) {
        return true;
      }
      if (linkedCatalogProd) {
        const prodSku = (linkedCatalogProd.sku || '').trim().toUpperCase();
        const prodName = (linkedCatalogProd.name || '').trim().toUpperCase();
        if (prodSku && m.code.trim().toUpperCase() === prodSku) return true;
        if (prodName && m.title.trim().toUpperCase() === prodName) return true;
      }
      return false;
    });
    if (matched) {
      setActivePassportModelId(matched.id);
      setSelectedProductId(null);
    }
  }, [selectedProductId, scenarioModels, products, concepts, setSelectedProductId]);

  // Форма создания новой модели с адаптацией под выбранный бренд
  const initialModalBrand: CanonicalBrandCode =
    brandFilter && brandFilter !== 'ALL'
      ? normalizePortfolioBrandCode(brandFilter) === 'ALL'
        ? 'BORNERS'
        : (normalizePortfolioBrandCode(brandFilter) as CanonicalBrandCode)
      : 'BORNERS';

  const [newSkuForm, setNewSkuForm] = useState(() => {
    const preset = BRAND_CREATE_PRESETS[initialModalBrand];
    return {
      brandCode: initialModalBrand,
      sku: computeNextBrandSkuCode(scenarioModels, initialModalBrand),
      name: '',
      category: preset.categories[0],
      customCategory: '',
      collection: preset.defaultCollection,
      materials: preset.defaultComposition,
      unitsInPack: preset.defaultUnitsInPack,
      plannedRetailPrice: preset.defaultPrice,
      unitCostPrice: hasCost ? preset.defaultCost : '0',
      buyoutRatePct: String(getDefaultBuyoutRatePctForBrand(initialModalBrand)),
      imageUrl: '',
    };
  });

  useEffect(() => {
    if (createModalOpen) return;
    const norm = normalizePortfolioBrandCode(
      brandFilter && brandFilter !== 'ALL' ? brandFilter : 'BORNERS'
    );
    const bCode: CanonicalBrandCode = norm === 'ALL' ? 'BORNERS' : norm;
    const preset = BRAND_CREATE_PRESETS[bCode] || BRAND_CREATE_PRESETS.BORNERS;
    setNewSkuForm((prev) =>
      prev.brandCode === bCode
        ? prev
        : {
            ...prev,
            brandCode: bCode,
            sku: computeNextBrandSkuCode(scenarioModels, bCode),
            category: preset.categories[0],
            customCategory: '',
            collection: preset.defaultCollection,
            materials: preset.defaultComposition,
            unitsInPack: preset.defaultUnitsInPack,
            plannedRetailPrice: preset.defaultPrice,
            unitCostPrice: hasCost ? preset.defaultCost : '0',
            buyoutRatePct: String(getDefaultBuyoutRatePctForBrand(bCode)),
          }
    );
  }, [brandFilter, createModalOpen, scenarioModels, hasCost]);

  const editableBrandCodes = useMemo(
    () =>
      (['BORNERS', 'LISKANI', 'AKUSHA', 'NA_TELE', 'FUKAI'] as const).filter((c) =>
        canUserEditBrand(currentUser, c)
      ),
    [currentUser]
  );

  const openCreateModalForBrand = (targetBrandInput?: string) => {
    const norm = normalizePortfolioBrandCode(
      targetBrandInput || (brandFilter !== 'ALL' ? brandFilter : 'BORNERS')
    );
    const candidate: CanonicalBrandCode = norm === 'ALL' ? 'BORNERS' : norm;
    const bCode: CanonicalBrandCode = canUserEditBrand(currentUser, candidate)
      ? candidate
      : editableBrandCodes[0] || candidate;
    if (!canUserEditBrand(currentUser, bCode)) return;
    const preset = BRAND_CREATE_PRESETS[bCode] || BRAND_CREATE_PRESETS.BORNERS;
    setNewSkuForm({
      brandCode: bCode,
      sku: computeNextBrandSkuCode(scenarioModels, bCode),
      name: '',
      category: preset.categories[0],
      customCategory: '',
      collection: preset.defaultCollection,
      materials: preset.defaultComposition,
      unitsInPack: preset.defaultUnitsInPack,
      plannedRetailPrice: preset.defaultPrice,
      unitCostPrice: hasCost ? preset.defaultCost : '0',
      buyoutRatePct: String(getDefaultBuyoutRatePctForBrand(bCode)),
      imageUrl: '',
    });
    setCreateModalOpen(true);
  };

  const handleModalBrandChange = (nextBrandRaw: string) => {
    const norm = normalizePortfolioBrandCode(nextBrandRaw);
    const bCode: CanonicalBrandCode = norm === 'ALL' ? 'BORNERS' : norm;
    const preset = BRAND_CREATE_PRESETS[bCode] || BRAND_CREATE_PRESETS.BORNERS;
    setNewSkuForm((prev) => ({
      ...prev,
      brandCode: bCode,
      sku: computeNextBrandSkuCode(scenarioModels, bCode),
      category: preset.categories[0],
      customCategory: '',
      collection: preset.defaultCollection,
      materials: preset.defaultComposition,
      unitsInPack: preset.defaultUnitsInPack,
      plannedRetailPrice: preset.defaultPrice,
      unitCostPrice: hasCost ? preset.defaultCost : '0',
      buyoutRatePct: String(getDefaultBuyoutRatePctForBrand(bCode)),
    }));
  };

  const handleDeleteScenarioModel = (
    modelToDelete: ScenarioModelSpec,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    if (!canEditModel(modelToDelete)) return;
    markModelAsDeletedInStorage(modelToDelete);
    updateModelsBatch((prev) =>
      prev.filter(
        (x) =>
          x.id !== modelToDelete.id &&
          x.code.trim().toUpperCase() !== modelToDelete.code.trim().toUpperCase()
      )
    );

    const cleanCode = modelToDelete.code.replace(/[^0-9A-Za-zА-Яа-я-]/g, '') || '001';
    const delBrandNorm = normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(modelToDelete));
    const delPrefix =
      delBrandNorm !== 'ALL' && BRAND_CREATE_PRESETS[delBrandNorm]
        ? BRAND_CREATE_PRESETS[delBrandNorm].skuPrefix
        : 'BRN';
    const targetSku = `${delPrefix}-${cleanCode}`.toUpperCase();
    products.forEach((p) => {
      if (
        !p.isArchived &&
        (p.sku.trim().toUpperCase() === targetSku ||
          p.sku.trim().toUpperCase() === modelToDelete.code.trim().toUpperCase() ||
          p.name.trim().toUpperCase() === modelToDelete.title.trim().toUpperCase())
      ) {
        archiveEntity('product', p.id);
      }
    });

    if (activePassportModelId === modelToDelete.id) {
      setActivePassportModelId(null);
    }

    notify(
      'warning',
      `Карточка модели ${modelToDelete.code} · ${modelToDelete.title} удалена`
    );
  };

  const handleQuickUploadCardPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mod: ScenarioModelSpec
  ) => {
    if (!canEditModel(mod)) {
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedUrl = await compressImageFileToDataUrl(file, 760, 0.76);
      if (!compressedUrl) return;
      const cleanExisting = mod.gallery.filter((g) => {
        const u = (g.url || g.originalUrl || '').trim();
        return (
          Boolean(u) &&
          !u.includes('borners-core-modal.svg') &&
          !u.includes('244995893_main.webp')
        );
      });
      const updatedGallery: ScenarioModelSpec['gallery'] = [
        {
          id: `gal-${Date.now()}`,
          category: 'pack',
          label: file.name.replace(/\.[^.]+$/, ''),
          url: compressedUrl,
          originalUrl: '',
          isMain: true,
        },
        ...cleanExisting.map((g) => ({
          ...g,
          originalUrl:
            typeof g.originalUrl === 'string' && g.originalUrl.startsWith('data:image/')
              ? ''
              : g.originalUrl,
          isMain: false,
        })),
      ];
      void saveModelGalleryToIdb(mod.id, updatedGallery);
      updateModelsBatch((prev) =>
        prev.map((m) =>
          m.id === mod.id
            ? {
                ...m,
                gallery: updatedGallery,
              }
            : m
        )
      );
      notify('success', `Фотография для ${mod.code} загружена и сохранена`);
    } catch {
      notify('error', 'Не удалось загрузить фотографию');
    }
    e.target.value = '';
  };

  const handleCreateProduct = (openPassportAfterCreate: boolean) => {
    const bCode = newSkuForm.brandCode;
    const unitCfg = getBrandUnitConfig(bCode);
    const cleanTitle =
      newSkuForm.name.trim() || `${unitCfg.displayCode} НОВАЯ МОДЕЛЬ`;
    const resolvedCategory =
      newSkuForm.category === '__CUSTOM__'
        ? newSkuForm.customCategory.trim() || unitCfg.categoryDefault
        : newSkuForm.category || unitCfg.categoryDefault;
    const rawRetailStr = newSkuForm.plannedRetailPrice.trim();
    const parsedRetail = rawRetailStr !== '' ? Number(rawRetailStr) : NaN;
    const retail = Number.isFinite(parsedRetail) ? Math.max(0, parsedRetail) : 1990;
    const rawCostStr = newSkuForm.unitCostPrice.trim();
    const parsedCost = hasCost ? (rawCostStr !== '' ? Number(rawCostStr) : NaN) : 0;
    const cost = hasCost
      ? Number.isFinite(parsedCost)
        ? Math.max(0, parsedCost)
        : 650
      : 0;
    const units = Math.max(
      1,
      Number(newSkuForm.unitsInPack) || unitCfg.secondaryPerPrimaryDefault
    );
    const buyoutPct = Math.min(
      100,
      Math.max(
        5,
        Math.round(
          Number(newSkuForm.buyoutRatePct) || getDefaultBuyoutRatePctForBrand(bCode)
        )
      )
    );

    // Если у бренда ещё нет активного сценария (например, AKUSHA или LISKANI) — создаём / подключаем его автоматически
    let workingScenarios = [...scenarios];
    let workingModels = [...scenarioModels];
    const currentBrandScenId = selectedScenarioByBrand[bCode];
    const hasValidBrandScen =
      typeof currentBrandScenId === 'number' &&
      workingScenarios.some((s) => s.id === currentBrandScenId && !s.isArchived);

    if (!hasValidBrandScen) {
      const existingOwned = workingScenarios.find(
        (s) =>
          !s.isArchived &&
          s.ownerBrandCode &&
          normalizePortfolioBrandCode(s.ownerBrandCode) === bCode
      );
      if (existingOwned) {
        setSelectedScenarioForBrand(bCode, existingOwned.id);
      } else {
        const createdScenRes = createIndependentBrandScenario(
          workingScenarios,
          workingModels,
          {
            title: `${unitCfg.displayCode} — План развития 2027`,
            brandCode: bCode,
            year: 2027,
            monthlyTargetMln: bCode === 'AKUSHA' ? 35 : bCode === 'LISKANI' ? 28 : 30,
            copyFromScenarioId: null,
          }
        );
        workingScenarios = createdScenRes.scenarios;
        workingModels = createdScenRes.models;
        updateScenariosBatch(() => workingScenarios);
        setSelectedScenarioForBrand(bCode, createdScenRes.scenario.id);
      }
    }

    const { model: rawCreatedModel } = createBrandProductModel(
      workingModels,
      workingScenarios,
      {
        title: cleanTitle,
        brandCode: bCode,
        code: newSkuForm.sku.trim() || undefined,
        categoryLabel: resolvedCategory,
        retailPriceRub: retail,
        unitCostRub: cost,
        unitsInPack: units,
        buyoutRatePct: buyoutPct,
        composition: newSkuForm.materials.trim() || undefined,
        imageUrl: newSkuForm.imageUrl || undefined,
      }
    );
    const createdScenarioModel: ScenarioModelSpec = {
      ...rawCreatedModel,
      retailPriceRub: retail === 0 ? 0 : rawCreatedModel.retailPriceRub,
      unitCostRub: cost,
      primaryUnitLabel: unitCfg.primaryUnit,
      secondaryUnitLabel: unitCfg.secondaryUnit,
    };

    if (createdScenarioModel.gallery.length > 0) {
      void saveModelGalleryToIdb(
        createdScenarioModel.id,
        createdScenarioModel.gallery
      );
    }

    unmarkModelAsDeletedInStorage(createdScenarioModel);
    updateModelsBatch(() => [...workingModels, createdScenarioModel]);
    setCreateModalOpen(false);
    notify(
      'success',
      `✓ Карточка ${createdScenarioModel.code} · ${createdScenarioModel.title} создана`,
      `Бренд: ${unitCfg.displayCode} · Выкуп: ${buyoutPct}% (×${(100 / buyoutPct).toFixed(2).replace('.', ',')})`
    );

    if (openPassportAfterCreate) {
      setActivePassportModelId(createdScenarioModel.id);
    }
  };

  // Фильтрация моделей по бренду
  const brandFilteredModels = useMemo(
    () =>
      scenarioModels.filter(
        (m) =>
          m.launchStatus !== 'В архиве' &&
          (brandFilter === 'ALL' || matchesBrandFilter(m, brandFilter))
      ),
    [scenarioModels, brandFilter]
  );

  // Динамический список категорий для выбранного бренда
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    brandFilteredModels.forEach((m) => {
      const cat = (m.categoryLabel || getBrandUnitConfig(m).categoryDefault).trim();
      if (cat) set.add(cat);
    });
    return Array.from(set);
  }, [brandFilteredModels]);

  // Финальный отфильтрованный список моделей для Витрины и Таблицы
  const filteredModels = useMemo(() => {
    return brandFilteredModels.filter((m) => {
      const cat = (m.categoryLabel || getBrandUnitConfig(m).categoryDefault).trim();
      if (categoryFilter !== 'ALL' && cat !== categoryFilter) return false;
      const stage = m.modelStageStatus || m.launchStatus;
      if (stageFilter !== 'ALL' && stage !== stageFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const brandLabel = detectModelBrandPortfolioLabel(m).toLowerCase();
        const sizeMatch = (m.liskaniSizeVariants || []).some(
          (sv) =>
            sv.sellerSku.toLowerCase().includes(q) ||
            sv.wbNmId.toLowerCase().includes(q) ||
            sv.barcode.toLowerCase().includes(q) ||
            sv.sizeCm.toLowerCase().includes(q)
        );
        return (
          m.title.toLowerCase().includes(q) ||
          m.code.toLowerCase().includes(q) ||
          (m.wbArticle || '').toLowerCase().includes(q) ||
          m.subtitle.toLowerCase().includes(q) ||
          (m.fabric?.composition || '').toLowerCase().includes(q) ||
          brandLabel.includes(q) ||
          sizeMatch
        );
      }
      return true;
    });
  }, [brandFilteredModels, categoryFilter, stageFilter, searchQuery]);

  // Счётчики SKU по каждому бренду
  const countsByBrand = useMemo(() => {
    const active = scenarioModels.filter((m) => m.launchStatus !== 'В архиве');
    return {
      ALL: active.length,
      BORNERS: active.filter((m) => matchesBrandFilter(m, 'BORNERS')).length,
      FUKAI: active.filter((m) => matchesBrandFilter(m, 'FUKAI')).length,
      AKUSHA: active.filter((m) => matchesBrandFilter(m, 'AKUSHA')).length,
      LISKANI: active.filter((m) => matchesBrandFilter(m, 'LISKANI')).length,
      NA_TELE: active.filter((m) => matchesBrandFilter(m, 'NA_TELE')).length,
    };
  }, [scenarioModels]);

  const activePassportModel = useMemo(
    () =>
      activePassportModelId
        ? scenarioModels.find((m) => m.id === activePassportModelId) || null
        : null,
    [scenarioModels, activePassportModelId]
  );

  // ЕСЛИ ОТКРЫТ ПАСПОРТ МОДЕЛИ — ПОКАЗЫВАЕМ ЕГО ПРЯМО ВНУТРИ 01 · ПРОДУКТ (СО ВСЕМИ ПОЛЯМИ РЕДАКТИРОВАНИЯ)
  if (activePassportModel) {
    const {
      modBrandCode,
      effectiveScenario,
      fallbackValidScenario: modelEffectiveScenario,
    } = resolveCatalogModelScenario(activePassportModel);

    return (
      <div className="space-y-4 pb-20">
        <div className="rounded-[14px] bg-white border border-[#CBD5E1] px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <button
            type="button"
            onClick={() => setActivePassportModelId(null)}
            className="h-9 px-3.5 rounded-[9px] bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#1E293B] border border-[#CBD5E1] text-[12.5px] font-bold inline-flex items-center gap-2 cursor-pointer transition"
          >
            <ArrowLeft className="h-4 w-4 text-[#475569]" />
            <span>Назад в каталог (01 · Продукт)</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#475569]">
            <select
              value={activePassportModel.id}
              onChange={(e) => setActivePassportModelId(e.target.value)}
              className="h-8 px-2.5 rounded-[8px] border border-[#CBD5E1] bg-[#F8FAFC] text-[12px] font-semibold text-[#0F172A] cursor-pointer"
            >
              {(filteredModels.length > 0 ? filteredModels : scenarioModels).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.title}
                </option>
              ))}
            </select>
            {canEditModel(activePassportModel) && (
              <button
                type="button"
                onClick={() => handleDeleteScenarioModel(activePassportModel)}
                className="h-8 px-3 rounded-[8px] border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#B42318] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Удалить карточку</span>
              </button>
            )}
          </div>
        </div>

        <ScenarioModelCardScreen
          key={activePassportModel.id}
          model={activePassportModel}
          scenario={effectiveScenario}
          allScenarios={scenarios}
          onSelectScenario={(id) => {
            if (id < 0) {
              if (modBrandCode !== 'ALL') {
                setSelectedScenarioForBrand(modBrandCode, null);
              }
              return;
            }
            setSelectedScenarioId(id, modBrandCode);
            if (modBrandCode !== 'ALL') {
              setSelectedScenarioForBrand(modBrandCode, id);
            }
          }}
          onBackToScenarios={() => setActivePassportModelId(null)}
          onOpenSalesPlan={() => {
            const targetBrand = normalizePortfolioBrandCode(
              detectModelBrandPortfolioLabel(activePassportModel) ||
                activePassportModel.brandId ||
                'BORNERS'
            );
            if (targetBrand !== 'ALL') {
              setBrandFilter(targetBrand);
              setSelectedScenarioId(modelEffectiveScenario.id, targetBrand);
              if (isBrandScenarioExplicitlyNone(targetBrand, selectedScenarioByBrand)) {
                setSelectedScenarioForBrand(targetBrand, modelEffectiveScenario.id);
              }
              navigateTo('launch-calendar', {
                brandId: targetBrand,
                scenarioModelId: activePassportModel.id,
              });
            } else {
              setSelectedScenarioId(modelEffectiveScenario.id);
              navigateTo('launch-calendar', {
                scenarioModelId: activePassportModel.id,
              });
            }
          }}
          onUpdateModel={updateModelSpec}
          onDuplicateModel={
            canEditModel(activePassportModel)
              ? (m) => {
                  const copyBrand: CanonicalBrandCode =
                    modBrandCode === 'ALL' ? 'BORNERS' : modBrandCode;
                  const nextCode = computeNextBrandSkuCode(scenarioModels, copyBrand);
                  const copyId = `scen-copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                  const copy: ScenarioModelSpec = {
                    ...m,
                    id: copyId,
                    code: nextCode,
                    title: `${m.title} (КОПИЯ)`,
                  };
                  unmarkModelAsDeletedInStorage(copy);
                  updateModelsBatch((prev) => [...prev, copy]);
                  if (copy.gallery?.length) {
                    void saveModelGalleryToIdb(copy.id, copy.gallery);
                  }
                  setActivePassportModelId(copy.id);
                  notify('success', `Создана копия модели ${copy.code}`);
                }
              : undefined
          }
          onDeleteOrArchiveModel={
            canEditModel(activePassportModel)
              ? (m) => handleDeleteScenarioModel(m)
              : undefined
          }
          onOpenPdfModal={() => setPdfModalModel(activePassportModel)}
          notify={notify}
        />

        {pdfModalModel && (
          <PdfConstructorModal
            concept={buildPdfConceptFromScenarioModel(pdfModalModel, concepts)}
            onClose={() => setPdfModalModel(null)}
            onSaveToConcept={(patch) => {
              const built = buildPdfConceptFromScenarioModel(pdfModalModel, concepts);
              if (!built.id.startsWith('scen-pdf-')) {
                updateConcept(built.id, patch);
              }
              notify(
                'success',
                `PDF ТЗ для ${pdfModalModel.code} · ${pdfModalModel.title} сформирован`
              );
            }}
          />
        )}
      </div>
    );
  }

  const activeModalPreset =
    BRAND_CREATE_PRESETS[newSkuForm.brandCode] || BRAND_CREATE_PRESETS.BORNERS;
  const liskaniPrimaryUnit = getBrandUnitConfig('LISKANI').primaryUnit;
  const liskaniBuyoutRates = Array.from(
    new Set(
      (filteredModels.some((m) => (m.liskaniSizeVariants?.length || 0) > 0)
        ? filteredModels
        : brandFilteredModels
      )
        .filter((m) => matchesBrandFilter(m, 'LISKANI') || (m.liskaniSizeVariants?.length || 0) > 0)
        .map((m) => Math.round(m.buyoutRatePct || 57))
    )
  );
  const liskaniBannerBuyoutText =
    liskaniBuyoutRates.length === 1 ? `ВЫКУП ${liskaniBuyoutRates[0]}%` : 'ВЫКУП %';
  const liskaniTableBuyoutHeader =
    liskaniBuyoutRates.length === 1 ? `Выкупы ${liskaniBuyoutRates[0]}%` : 'Выкупы %';

  return (
    <div className="space-y-5 pb-20">
      {/* 1. ШАПКА ЕДИНОГО КАТАЛОГА 01 · ПРОДУКТ */}
      <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-5 md:p-6 space-y-4 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[#78746C] dark:text-[#9E9A92]">
              01 · Продукт · Единый каталог моделей и паспортов ({filteredModels.length} SKU)
            </div>
            <h1 className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.02em] text-[#141413] dark:text-[#F5F4F0] mt-0.5">
              Каталог моделей (SKU)
            </h1>
            <p className="text-[12.5px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
              Нажмите на любую карточку, чтобы загрузить фото, изменить характеристики, цвета, закупки и план продаж на 12 мес.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] p-1 text-[12px]">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`h-8 px-3 rounded-md font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] shadow-2xs'
                    : 'text-[#5C5953] dark:text-[#9E9A92] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Витрина</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('groups')}
                className={`h-8 px-3 rounded-md font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'groups'
                    ? 'bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] shadow-2xs'
                    : 'text-[#5C5953] dark:text-[#9E9A92] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                }`}
              >
                <Folder className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Группы и бренды</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-8 px-3 rounded-md font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] shadow-2xs'
                    : 'text-[#5C5953] dark:text-[#9E9A92] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                <span>Таблица</span>
              </button>
              {filteredModels.some(
                (m) => Array.isArray(m.liskaniSizeVariants) && m.liskaniSizeVariants.length > 0
              ) && (
                <button
                  type="button"
                  onClick={() => setViewMode('liskani_269')}
                  className={`h-8 px-3 rounded-md font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    viewMode === 'liskani_269'
                      ? 'bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] shadow-2xs'
                      : 'text-[#5C5953] dark:text-[#9E9A92] hover:text-[#141413] dark:hover:text-[#F5F4F0]'
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  <span>Все 269 размеров SKU</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigateTo('product-lab', { brandId: brandFilter })}
              className="h-9.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] dark:bg-[#1D1C1A] dark:hover:bg-[#282724] dark:text-[#F5F4F0] dark:border-[#282724] text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FlaskConical className="h-4 w-4 text-[#5C5953] dark:text-[#9E9A92]" strokeWidth={1.5} />
              <span>Лаборатория R&D</span>
              {activeLabConceptsForFilter.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] font-mono text-[10.5px]">
                  {activeLabConceptsForFilter.length}
                </span>
              )}
            </button>

            {canCreateInActiveScope && (
              <button
                type="button"
                onClick={() => openCreateModalForBrand()}
                className="h-9.5 px-4 rounded-lg bg-[#141413] hover:bg-[#282724] dark:bg-[#F5F4F0] dark:hover:bg-[#E4E1DA] text-white dark:text-[#141413] text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} />
                <span>Добавить модель</span>
              </button>
            )}
          </div>
        </div>

        {/* Быстрый переключатель брендов прямо в шапке каталога */}
        <div className="pt-3 border-t border-[#E4E1DA] dark:border-[#282724] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { code: 'ALL', label: 'Все бренды', count: countsByBrand.ALL },
                { code: 'BORNERS', label: 'BORNERS', count: countsByBrand.BORNERS },
                { code: 'FUKAI', label: 'FUKAI', count: countsByBrand.FUKAI },
                { code: 'AKUSHA', label: 'AKUSHA', count: countsByBrand.AKUSHA },
                { code: 'LISKANI', label: 'LISKANI', count: countsByBrand.LISKANI },
                { code: 'NA_TELE', label: 'НА ТЕЛЕ', count: countsByBrand.NA_TELE },
              ] as const
            ).map((b) => {
              const isAct =
                b.code === 'ALL'
                  ? brandFilter === 'ALL'
                  : normalizePortfolioBrandCode(brandFilter) === b.code;
              return (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => {
                    setBrandFilter(b.code);
                    if (b.code !== 'ALL') {
                      const targetScenId = selectedScenarioByBrand[b.code];
                      if (typeof targetScenId === 'number') {
                        setSelectedScenarioId(targetScenId, b.code);
                      }
                    } else {
                      const bornersScenId = selectedScenarioByBrand.BORNERS ?? 1;
                      if (typeof bornersScenId === 'number') {
                        setSelectedScenarioId(bornersScenId, 'ALL');
                      }
                    }
                  }}
                  className={`h-8 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    isAct
                      ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] border-[#141413] dark:border-[#F5F4F0]'
                      : 'bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:bg-white dark:hover:bg-[#282724] text-[#141413] dark:text-[#F5F4F0] border-[#E4E1DA] dark:border-[#282724]'
                  }`}
                >
                  <span>{b.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded font-mono text-[10.5px] ${
                      isAct
                        ? 'bg-white/15 dark:bg-black/15 text-white dark:text-[#141413]'
                        : 'bg-[#EFECE6] dark:bg-[#282724] text-[#5C5953] dark:text-[#9E9A92]'
                    }`}
                  >
                    {b.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="h-3.5 w-3.5 text-[#78746C] absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.5} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск SKU, названия, ткани..."
                className="w-full h-8.5 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] focus:bg-white dark:focus:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] focus:border-[#141413] dark:focus:border-[#F5F4F0] pl-8.5 pr-3 text-[12.5px] text-[#141413] dark:text-[#F5F4F0] outline-none transition-colors"
              />
            </div>

            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="h-8.5 rounded-lg bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] px-2.5 text-[12px] font-medium text-[#141413] dark:text-[#F5F4F0] outline-none cursor-pointer"
            >
              <option value="ALL">Все статусы</option>
              <option value="Действующий">Действующий</option>
              <option value="В плане">В плане</option>
              <option value="Идея">Идея</option>
              <option value="В разработке">В разработке</option>
              <option value="Тест">Тест</option>
              <option value="Масштабирование">Масштабирование</option>
            </select>
          </div>
        </div>

        {/* Фильтр по категориям выбранного бренда */}
        {availableCategories.length > 1 && viewMode !== 'groups' && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`h-7.5 px-3 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
                categoryFilter === 'ALL'
                  ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] border-[#141413] dark:border-[#F5F4F0]'
                  : 'bg-white dark:bg-[#151514] text-[#5C5953] dark:text-[#9E9A92] border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953]'
              }`}
            >
              Все категории ({brandFilteredModels.length})
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`h-7.5 px-3 rounded-md text-[12px] font-medium border transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] border-[#141413] dark:border-[#F5F4F0]'
                    : 'bg-white dark:bg-[#151514] text-[#5C5953] dark:text-[#9E9A92] border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* СВОДКА ОФИЦИАЛЬНОЛЬНОГО ПЛАНА AKUSHA 2027 (31 МОДЕЛЬ · 24 КАРТОЧКИ · 20 377 ПАР · 47 808 ЗАКАЗОВ · 105,79 МЛН ₽) */}
        {normalizePortfolioBrandCode(brandFilter) === 'AKUSHA' && (
          <div className="rounded-xl bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] font-mono text-[10.5px] font-medium">
                    AKUSHA · ПЛАН 2027 (31 МОДЕЛЬ · 9 ГРУПП)
                  </span>
                  <span className="font-mono tabular-nums text-[13px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                    20 377 выкупленных пар · 47 808 заказов
                    {hasFinance ? ' · 105,79 млн ₽ выручки' : ''}
                    {hasCost ? ' · 37,45 млн ₽ себестоимость' : ''}
                  </span>
                </div>
                <p className="text-[12px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                  24 карточки в каталоге (включая общую карточку №09–16 «Замшевые лоферы · 8 цветов» на 4 920 пар / 14 915 заказов) · 26 оригинальных фотографий из утверждённого документа · для Топсайдеров (№17–20) и Мокасин (№28–31) цена и себестоимость помечены «уточнить» без искусственных допущений.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={resolveCatalogAssetUrl('/docs/akusha_plan_2027_31_models.pdf')}
                  target="_blank"
                  rel="noreferrer"
                  className="h-8 px-3 rounded-lg bg-white dark:bg-[#151514] hover:bg-[#EFECE6] dark:hover:bg-[#282724] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>↗ План продаж AKUSHA 2027 · 31 модель (.pdf)</span>
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setViewMode(viewMode === 'groups' ? 'grid' : 'groups')
                  }
                  className="h-8 px-3 rounded-lg bg-[#141413] hover:bg-[#282724] dark:bg-[#F5F4F0] dark:hover:bg-[#E4E1DA] text-white dark:text-[#141413] text-[11.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>
                    {viewMode === 'groups'
                      ? 'Показать 24 карточки с фото'
                      : 'Показать 9 товарных групп'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* СВОДКА ОФИЦИАЛЬНОГО ПЛАНА LISKANI 2027 (500 МЛН ₽ ВЫКУПОВ · 877,19 МЛН ₽ ЗАКАЗОВ · 269 SKU) */}
        {(normalizePortfolioBrandCode(brandFilter) === 'LISKANI' ||
          viewMode === 'liskani_269') && (
          <div className="rounded-xl bg-[#FAF9F6] dark:bg-[#1D1C1A] border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-white dark:bg-[#151514] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] font-mono text-[10.5px] font-medium">
                    LISKANI · ПЛАН 2027 ({liskaniBannerBuyoutText})
                  </span>
                  <span className="font-mono tabular-nums text-[13px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                    {hasFinance ? '500,00 млн ₽ выкупов · 877,19 млн ₽ заказов · ' : ''}289 889 {liskaniPrimaryUnit}
                  </span>
                </div>
                <p className="text-[12px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                  33 цветовые карточки Wildberries с реальными студийными фото · 269 размерных SKU{' '}
                  {hasFinance
                    ? '(Блэкаут: 350 млн ₽ / 104 SKU · Мрамор: 75 млн ₽ / 80 SKU · Рогожка: 60 млн ₽ / 40 SKU · Тюль Вуаль: 15 млн ₽ / 45 SKU)'
                    : '(Блэкаут: 104 SKU · Мрамор: 80 SKU · Рогожка: 40 SKU · Тюль Вуаль: 45 SKU)'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={resolveCatalogAssetUrl('/docs/liskani_assortment_2027_269_sku.xlsx')}
                  download="Ассортимент_LISKANI_2027_269_SKU.xlsx"
                  className="h-8 px-3 rounded-lg bg-white dark:bg-[#151514] hover:bg-[#EFECE6] dark:hover:bg-[#282724] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>↓ Ассортимент 269 SKU (.xlsx)</span>
                </a>
                <a
                  href={resolveCatalogAssetUrl('/docs/liskani_plan_2027_269_sku.pdf')}
                  target="_blank"
                  rel="noreferrer"
                  className="h-8 px-3 rounded-lg bg-white dark:bg-[#151514] hover:bg-[#EFECE6] dark:hover:bg-[#282724] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>↗ План 2027 помесячно (.pdf)</span>
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setViewMode(viewMode === 'liskani_269' ? 'grid' : 'liskani_269')
                  }
                  className="h-8 px-3 rounded-lg bg-[#141413] hover:bg-[#282724] dark:bg-[#F5F4F0] dark:hover:bg-[#E4E1DA] text-white dark:text-[#141413] text-[11.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>
                    {viewMode === 'liskani_269'
                      ? 'Показать 33 карточки с фото'
                      : 'Показать все 269 размеров SKU'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* РЕЖИМ 1: ВИТРИНА КАРТОЧЕК — COS / ACNE LOOKBOOK LINESHEET */}
      {viewMode === 'grid' && (
        <>
          {filteredModels.length === 0 ? (
            <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-10 text-center space-y-4">
              <div className="text-[16px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                В выбранном фильтре пока нет карточек моделей
              </div>
              <p className="text-[13px] text-[#5C5953] dark:text-[#9E9A92] max-w-lg mx-auto">
                Добавьте новую модель для бренда{' '}
                <strong>
                  {brandFilter === 'ALL' ? 'холдинга' : formatLabBrandLabel(brandFilter)}
                </strong>
                , перенесите готовые карточки из «Лаборатории R&D» в 1 клик или разверните стартовую матрицу.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                {canCreateInActiveScope && (
                  <button
                    type="button"
                    onClick={() => openCreateModalForBrand()}
                    className="h-9.5 px-4 rounded-lg bg-[#141413] hover:bg-[#282724] dark:bg-[#F5F4F0] dark:hover:bg-[#E4E1DA] text-white dark:text-[#141413] text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                    <span>+ Добавить первую модель</span>
                  </button>
                )}
                {canCreateInActiveScope &&
                  brandFilter !== 'ALL' &&
                  activeLabConceptsForFilter.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSyncBrandFromLab}
                      className="h-9.5 px-4 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] dark:bg-[#1D1C1A] dark:hover:bg-[#282724] dark:text-[#F5F4F0] dark:border-[#282724] text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <FlaskConical className="h-4 w-4" strokeWidth={1.5} />
                      <span>
                        Перенести из Лаборатории R&D ({activeLabConceptsForFilter.length})
                      </span>
                    </button>
                  )}
                {canCreateInActiveScope &&
                  (() => {
                    const normFilter = normalizePortfolioBrandCode(brandFilter);
                    if (
                      normFilter !== 'NA_TELE' &&
                      normFilter !== 'AKUSHA' &&
                      normFilter !== 'LISKANI'
                    ) {
                      return null;
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          const res = launchStarterCabinet(normFilter);
                          notify(
                            'success',
                            `Стартовая матрица ${formatLabBrandLabel(normFilter)} добавлена (${res.addedCount} SKU)`
                          );
                        }}
                        className="h-9.5 px-4 rounded-lg bg-[#141413] hover:bg-[#282724] text-white text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
                        <span>Запустить стартовую матрицу (3 SKU)</span>
                      </button>
                    );
                  })()}
                <button
                  type="button"
                  onClick={() => navigateTo('product-lab', { brandId: brandFilter })}
                  className="h-9.5 px-3.5 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#141413] border border-[#E4E1DA] dark:bg-[#1D1C1A] dark:hover:bg-[#282724] dark:text-[#F5F4F0] dark:border-[#282724] text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>Открыть Лабораторию R&D →</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredModels.map((mod) => {
                const displayBrand = detectModelBrandPortfolioLabel(mod);
                const { effectiveScenario: activeScen, explicitlyNone } =
                  resolveCatalogModelScenario(mod);
                const met = explicitlyNone
                  ? computeModelScenarioMetrics({ ...mod, plansByScenario: {} }, activeScen)
                  : computeModelScenarioMetrics(mod, activeScen);
                const unitCfg = getBrandUnitConfig(mod);
                const actingMeta = getActingSkuByWbOrVendor(mod.code, mod.title);
                const mainGallery =
                  mod.gallery.find((g) => g.isMain && Boolean(g.url || g.originalUrl)) ||
                  mod.gallery.find((g) => Boolean(g.url || g.originalUrl));
                const mainPhotoUrl = mainGallery?.url || mainGallery?.originalUrl || '';
                const colors = mod.palettes[0]?.colors || [];
                const categoryText = mod.categoryLabel || unitCfg.categoryDefault;
                const canEditThisModel = canEditModel(mod);
                const stageLabel = mod.modelStageStatus || mod.launchStatus || 'В плане';
                const isActiveStage =
                  stageLabel === 'Действующий' ||
                  stageLabel === 'Утверждено' ||
                  stageLabel === 'Масштабирование';
                const skuDisplay = actingMeta
                  ? `WB ${actingMeta.wbSku}`
                  : mod.wbArticle
                  ? `${mod.code} · WB ${mod.wbArticle}`
                  : mod.code;
                const unitPackCaption =
                  mod.unitsInPack === 1 && unitCfg.primaryUnit === unitCfg.secondaryUnit
                    ? unitCfg.primaryUnit === 'пар'
                      ? '1 пара'
                      : `1 ${unitCfg.primaryUnit}`
                    : `${mod.unitsInPack} ${unitCfg.secondaryUnit} / ${unitCfg.primaryUnit}`;

                return (
                  <div
                    key={mod.id}
                    onClick={() => setActivePassportModelId(mod.id)}
                    className="relative rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] hover:border-[#141413] dark:hover:border-[#5C5953] flex flex-col justify-between transition-colors cursor-pointer group overflow-hidden"
                  >
                    <div>
                      {/* Studio photo frame at the top on a clean #F6F5F2 gallery mat */}
                      <div className="relative h-52 w-full bg-[#F6F5F2] dark:bg-[#1D1C1A] border-b border-[#E4E1DA] dark:border-[#282724] flex items-center justify-center p-4 overflow-hidden">
                        <BoxerPackStackSvg
                          colors={colors}
                          brandLabel={displayBrand}
                          customPhotoUrl={mainPhotoUrl}
                        />

                        {/* Calm monochrome badge in top-left with subtle status dot */}
                        <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/92 dark:bg-[#151514]/92 backdrop-blur-xs border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] font-mono text-[10.5px]">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${
                              isActiveStage ? 'bg-[#15803D]' : 'bg-[#78746C]'
                            }`}
                          />
                          <span>{stageLabel}</span>
                          {mod.liskaniSizeVariants && mod.liskaniSizeVariants.length > 0 && (
                            <span className="text-[#78746C] dark:text-[#9E9A92]">
                              · {mod.liskaniSizeVariants.length} разм.
                            </span>
                          )}
                        </div>

                        {/* Top-right quiet actions (always present & clickable in DOM) */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5">
                          {canEditThisModel && (
                            <label
                              onClick={(e) => e.stopPropagation()}
                              title="Загрузить или заменить фото карточки"
                              className="h-7 px-2 rounded-md bg-white/92 dark:bg-[#151514]/92 hover:bg-white dark:hover:bg-[#282724] text-[#5C5953] hover:text-[#141413] dark:text-[#9E9A92] dark:hover:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] text-[10.5px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.5} />
                              <span>{mainPhotoUrl ? 'Фото' : '+ Фото'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleQuickUploadCardPhoto(e, mod)}
                                className="hidden"
                              />
                            </label>
                          )}
                          {canEditThisModel && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteScenarioModel(mod, e)}
                              title="Удалить карточку модели"
                              className="h-7 w-7 rounded-md bg-white/92 dark:bg-[#151514]/92 hover:bg-[#FEF2F2] border border-[#E4E1DA] dark:border-[#282724] hover:border-[#FECACA] text-[#8A867E] hover:text-[#B91C1C] flex items-center justify-center text-[14px] leading-none transition-colors cursor-pointer"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Editorial Linesheet Body */}
                      <div className="p-4 pb-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-[#5C5953] dark:text-[#9E9A92]">
                          <span className="truncate">
                            {displayBrand} · {skuDisplay}
                          </span>
                          <span className="shrink-0 text-[#78746C] dark:text-[#9E9A92]">
                            {unitPackCaption}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-[15.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] leading-snug tracking-[-0.01em]">
                            {mod.title}
                          </h3>
                          <div className="text-[12px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                            {categoryText}
                          </div>
                        </div>

                        {(mod.fabric?.composition || mod.fabric?.density) && (
                          <p className="text-[12px] text-[#78746C] dark:text-[#9E9A92] leading-relaxed line-clamp-1">
                            {mod.fabric?.composition}
                            {mod.fabric?.density ? ` · ${mod.fabric.density}` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Hairline-separated metric strip */}
                    <div>
                      <div className="grid grid-cols-3 divide-x divide-[#E4E1DA] dark:divide-[#282724] border-t border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6]/60 dark:bg-[#1D1C1A]/50">
                        <div className="px-3.5 py-2.5">
                          <div className="text-[10.5px] text-[#78746C] dark:text-[#9E9A92]">РРЦ</div>
                          <div className="font-mono tabular-nums text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5">
                            {met.avgRetailPriceRub > 0
                              ? formatCurrencyRub(met.avgRetailPriceRub)
                              : 'уточнить'}
                          </div>
                        </div>
                        <div className="px-3.5 py-2.5">
                          <div className="text-[10.5px] text-[#78746C] dark:text-[#9E9A92]">Себест.</div>
                          <div className="font-mono tabular-nums text-[13.5px] font-medium text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                            {!hasCost
                              ? 'Скрыто'
                              : mod.unitCostRub > 0
                              ? formatCurrencyRub(mod.unitCostRub)
                              : 'уточнить'}
                          </div>
                        </div>
                        <div className="px-3.5 py-2.5 text-right">
                          <div className="text-[10.5px] text-[#78746C] dark:text-[#9E9A92]">
                            {!hasFinance || met.annualRevenueRub <= 0
                              ? 'План / Год'
                              : !hasCost
                              ? 'Выручка'
                              : 'Маржа / Год'}
                          </div>
                          <div className="font-mono tabular-nums text-[13px] font-semibold text-[#15803D] dark:text-emerald-400 mt-0.5">
                            {!hasFinance || met.annualRevenueRub <= 0
                              ? `${met.annualPacks.toLocaleString('ru-RU')} ${unitCfg.primaryUnit}`
                              : !hasCost
                              ? `${(met.annualRevenueRub / 1_000_000).toFixed(1).replace('.', ',')} млн`
                              : `${met.unitMarginPct.toFixed(0)}% · ${(met.annualRevenueRub / 1_000_000).toFixed(1).replace('.', ',')} млн`}
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-2.5 border-t border-[#E4E1DA] dark:border-[#282724] flex items-center justify-between text-[11px] text-[#5C5953] dark:text-[#9E9A92]">
                        <span>
                          Выкуп WB:{' '}
                          {met.buyoutRatePct > 0 ? (
                            <>
                              <strong className="font-mono text-[#141413] dark:text-[#F5F4F0]">
                                {met.buyoutRatePct}%
                              </strong>{' '}
                              (×{met.orderMultiplier.toFixed(2).replace('.', ',')})
                            </>
                          ) : (
                            <strong className="font-mono text-[#78746C]">уточнить</strong>
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium text-[#141413] dark:text-[#F5F4F0]">
                          <span>
                            {canEditThisModel ? 'Паспорт модели' : 'Открыть'}
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-[#78746C] group-hover:text-[#141413] dark:group-hover:text-[#F5F4F0] transition-colors" strokeWidth={1.5} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* РЕЖИМ 2: ГРУППЫ ТОВАРОВ И КАБИНЕТЫ БРЕНДОВ */}
      {viewMode === 'groups' && (
        <div className="rounded-xl bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-5 md:p-6 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
          <PeaklyCatalogGroupsAndBrandsView
            key={`groups-${productGroupsReloadTick}`}
            models={scenarioModels}
            filteredModels={filteredModels}
            currentScenario={currentScenario}
            scenarios={scenarios}
            brandFilter={brandFilter}
            onSelectBrandFilter={(bCode) => setBrandFilter(bCode)}
            selectedScenarioByBrand={selectedScenarioByBrand}
            onSelectScenarioForBrand={(bCode, scenId) => {
              setSelectedScenarioForBrand(bCode, scenId);
            }}
            onSelectActiveScenarioId={(scenId, explicitBrandCode) => {
              setSelectedScenarioId(scenId, explicitBrandCode);
            }}
            onOpenModelPassport={(modelId) => {
              setActivePassportModelId(modelId);
            }}
            onUpdateModel={updateModelSpec}
            onDeleteModel={(m) => handleDeleteScenarioModel(m)}
            onOpenCreateModel={(defaultBrandCode) => {
              openCreateModalForBrand(defaultBrandCode);
            }}
            notify={notify}
          />
        </div>
      )}

      {/* РЕЖИМ 3: СВОДНАЯ ТАБЛИЦА КАТАЛОГА */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-[#151514] rounded-xl border border-[#E4E1DA] dark:border-[#282724] overflow-x-auto shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
          <table className="w-full text-left text-[13.5px]">
            <thead className="border-b border-[#E4E1DA] dark:border-[#282724] text-[11px] font-semibold uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92] bg-[#FAF9F6] dark:bg-[#1D1C1A]">
              <tr>
                <th className="py-3.5 px-5">Артикул</th>
                <th className="py-3.5 px-4">Модель и материалы</th>
                <th className="py-3.5 px-4">Бренд</th>
                <th className="py-3.5 px-4">Категория</th>
                <th className="py-3.5 px-4 text-right">РРЦ</th>
                <th className="py-3.5 px-4 text-right">Себест.</th>
                <th className="py-3.5 px-4 text-right">Маржа</th>
                <th className="py-3.5 px-4 text-right">Выручка 2027</th>
                <th className="py-3.5 px-5 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1DA] dark:divide-[#282724]">
              {filteredModels.map((mod) => {
                const displayBrand = detectModelBrandPortfolioLabel(mod);
                const { effectiveScenario: activeScen, explicitlyNone } =
                  resolveCatalogModelScenario(mod);
                const unitCfg = getBrandUnitConfig(mod);
                const met = explicitlyNone
                  ? computeModelScenarioMetrics({ ...mod, plansByScenario: {} }, activeScen)
                  : computeModelScenarioMetrics(mod, activeScen);
                const canEditThisModel = canEditModel(mod);
                const unitPackCaption =
                  mod.unitsInPack === 1 && unitCfg.primaryUnit === unitCfg.secondaryUnit
                    ? unitCfg.primaryUnit === 'пар'
                      ? '1 пара'
                      : `1 ${unitCfg.primaryUnit}`
                    : `${mod.unitsInPack} ${unitCfg.secondaryUnit} / ${unitCfg.primaryUnit}`;
                return (
                  <tr
                    key={mod.id}
                    onClick={() => setActivePassportModelId(mod.id)}
                    className="hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A] transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-5 font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                      {mod.code}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#141413] dark:text-[#F5F4F0]">{mod.title}</div>
                      <div className="text-[12px] text-[#78746C] dark:text-[#9E9A92] truncate max-w-md">
                        {mod.fabric?.composition}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded font-mono text-[10.5px] font-medium bg-[#FAF9F6] dark:bg-[#1D1C1A] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724]">
                        {displayBrand}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[#5C5953] dark:text-[#9E9A92]">
                      <div>{mod.categoryLabel || unitCfg.categoryDefault}</div>
                      <div className="text-[11px] text-[#78746C]">
                        {unitPackCaption}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#141413] dark:text-[#F5F4F0]">
                      {met.avgRetailPriceRub > 0
                        ? formatCurrencyRub(met.avgRetailPriceRub)
                        : 'уточнить'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#5C5953] dark:text-[#9E9A92]">
                      {!hasCost
                        ? 'Скрыто'
                        : mod.unitCostRub > 0
                        ? formatCurrencyRub(mod.unitCostRub)
                        : 'уточнить'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#15803D] dark:text-emerald-400">
                      {!hasCost || !hasFinance
                        ? 'Скрыто'
                        : met.avgRetailPriceRub > 0 && mod.unitCostRub > 0
                        ? `${met.unitMarginPct.toFixed(1)}%`
                        : 'уточнить'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-[#141413] dark:text-[#F5F4F0]">
                      {!hasFinance
                        ? 'Скрыто'
                        : met.annualRevenueRub > 0
                        ? `${(met.annualRevenueRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`
                        : `${met.annualPacks.toLocaleString('ru-RU')} ${unitCfg.primaryUnit}`}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActivePassportModelId(mod.id);
                          }}
                          className="h-7.5 px-2.5 rounded-md bg-[#FAF9F6] dark:bg-[#1D1C1A] hover:bg-[#EFECE6] dark:hover:bg-[#282724] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] text-[11.5px] font-medium transition-colors cursor-pointer"
                        >
                          {canEditThisModel ? 'Редактировать' : 'Открыть'}
                        </button>
                        {canEditThisModel && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteScenarioModel(mod, e)}
                            title="Удалить карточку"
                            className="h-7.5 w-7.5 rounded-md border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:bg-[#FEF2F2] hover:border-[#FECACA] text-[#8A867E] hover:text-[#B91C1C] flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* РЕЖИМ 4: ПОЛНЫЙ РЕЕСТР 269 РАЗМЕРНЫХ SKU LISKANI (ВСЕ РАЗМЕРЫ 300×240..600×270 И ПОМЕСЯЧНЫЙ ПЛАН 2027) */}
      {viewMode === 'liskani_269' && (
        <div className="bg-white rounded-2xl border border-[#CBD5E1] p-5 space-y-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-extrabold text-[#0F172A]">
                Полный реестр 269 размерных SKU · План заказов и выкупов 2027
              </h2>
              <p className="text-[12px] text-[#475569]">
                Нажмите на любую строку размера, чтобы открыть карточку цвета с фотографиями WB и параметрами паспорта.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-[#475569]">
                Период:
              </span>
              <select
                value={liskani269MonthIdx}
                onChange={(e) =>
                  setLiskani269MonthIdx(
                    e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                  )
                }
                className="h-8.5 px-3 rounded-[8px] bg-[#F8FAFC] border border-[#0F172A] text-[12px] font-bold text-[#0F172A] cursor-pointer"
              >
                <option value="ALL">Весь 2027 год (12 мес.)</option>
                {MONTHS_SHORT_RU.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName} 2027
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#CBD5E1]">
            <table className="w-full text-left text-[12.5px]">
              <thead className="border-b border-[#CBD5E1] text-[10.5px] font-bold uppercase tracking-wider text-[#475569] bg-[#F8FAFC]">
                <tr>
                  <th className="py-3 px-3">№</th>
                  <th className="py-3 px-3">Фото и Цвет</th>
                  <th className="py-3 px-3">Ткань</th>
                  <th className="py-3 px-3">Размер</th>
                  <th className="py-3 px-3">Артикул продавца</th>
                  <th className="py-3 px-3">Артикул WB</th>
                  <th className="py-3 px-3">Баркод</th>
                  <th className="py-3 px-3 text-right">Себест.</th>
                  <th className="py-3 px-3 text-right">Цена</th>
                  <th className="py-3 px-3 text-right">
                    Заказать ({liskani269MonthIdx === 'ALL' ? 'год' : MONTHS_SHORT_RU[liskani269MonthIdx]}), {liskaniPrimaryUnit}
                  </th>
                  <th className="py-3 px-3 text-right">
                    Заказы ({liskani269MonthIdx === 'ALL' ? 'год' : MONTHS_SHORT_RU[liskani269MonthIdx]}), ₽
                  </th>
                  <th className="py-3 px-3 text-right">
                    {liskaniTableBuyoutHeader} ({liskani269MonthIdx === 'ALL' ? 'год' : MONTHS_SHORT_RU[liskani269MonthIdx]}), ₽
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredModels
                  .filter(
                    (m) =>
                      Array.isArray(m.liskaniSizeVariants) &&
                      m.liskaniSizeVariants.length > 0
                  )
                  .flatMap((mod) => {
                    const photoUrl = resolveCatalogAssetUrl(
                      mod.gallery[0]?.url || mod.gallery[0]?.originalUrl || ''
                    );
                    const q = searchQuery.trim().toLowerCase();
                    return (mod.liskaniSizeVariants || [])
                      .filter((sv) => {
                        if (!q) return true;
                        return (
                          mod.title.toLowerCase().includes(q) ||
                          mod.code.toLowerCase().includes(q) ||
                          sv.sellerSku.toLowerCase().includes(q) ||
                          sv.wbNmId.toLowerCase().includes(q) ||
                          sv.barcode.toLowerCase().includes(q) ||
                          sv.sizeCm.toLowerCase().includes(q) ||
                          sv.fabric.toLowerCase().includes(q) ||
                          sv.color.toLowerCase().includes(q)
                        );
                      })
                      .map((sv) => {
                        const ordPacks =
                          liskani269MonthIdx === 'ALL'
                            ? sv.annualOrdersUnits
                            : sv.monthlyOrdersUnits[liskani269MonthIdx] || 0;
                        const ordRub =
                          liskani269MonthIdx === 'ALL'
                            ? sv.annualOrdersRub
                            : sv.monthlyOrdersRub[liskani269MonthIdx] || 0;
                        const buyRub =
                          liskani269MonthIdx === 'ALL'
                            ? sv.annualBuyoutsRub
                            : sv.monthlyBuyoutsRub[liskani269MonthIdx] || 0;

                        return (
                          <tr
                            key={`${mod.id}-${sv.skuIndex}`}
                            onClick={() => setActivePassportModelId(mod.id)}
                            className="hover:bg-[#F8FAFC] transition cursor-pointer"
                          >
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">
                              {sv.skuIndex}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2.5">
                                {photoUrl && (
                                  <img
                                    src={photoUrl}
                                    alt={mod.title}
                                    className="h-9 w-7 rounded object-cover border border-[#CBD5E1] shrink-0"
                                  />
                                )}
                                <div>
                                  <div className="font-bold text-[#0F172A]">
                                    {sv.color}
                                  </div>
                                  <div className="font-mono text-[10.5px] text-[#64748B]">
                                    {mod.code}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-[#334155]">
                              {sv.fabric}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[#0F172A]">
                              {sv.sizeCm}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11.5px] text-[#0F172A]">
                              {sv.sellerSku}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11.5px] text-[#475569]">
                              {sv.wbNmId || 'Новинка 03.2027'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">
                              {sv.barcode || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#334155]">
                              {hasCost ? `${sv.unitCostRub.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0F172A]">
                              {sv.retailPriceRub.toLocaleString('ru-RU')} ₽
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0F172A]">
                              {ordPacks.toLocaleString('ru-RU')}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[#334155]">
                              {hasFinance ? `${ordRub.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                              {hasFinance ? `${buyRub.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                            </td>
                          </tr>
                        );
                      });
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* УМНОЕ МОДАЛЬНОЕ ОКНО СОЗДАНИЯ МОДЕЛИ (С КАТЕГОРИЯМИ И ПАРАМЕТРАМИ ПОД БРЕНД LISKANI / AKUSHA / НА ТЕЛЕ / FUKAI / BORNERS) */}
      {createModalOpen && (
        <div
          onClick={() => setCreateModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white rounded-2xl border border-[#CBD5E1] p-6 sm:p-7 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3.5">
              <div>
                <h3 className="text-[20px] font-extrabold text-[#0F172A]">
                  Новая модель в каталоге
                </h3>
                <p className="text-[12px] text-[#475569]">
                  Категории и характеристики автоматически подстраиваются под выбранный бренд
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="h-8 w-8 rounded-lg border border-[#CBD5E1] flex items-center justify-center text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13.5px]">
              <div>
                <label className="block font-bold text-[#0F172A] mb-1">Бренд</label>
                <select
                  value={newSkuForm.brandCode}
                  onChange={(e) => handleModalBrandChange(e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#CBD5E1] px-3 text-[14px] bg-white font-bold text-[#0F172A] cursor-pointer"
                >
                  {(
                    [
                      { code: 'BORNERS', label: 'BORNERS (Мужское бельё и база)' },
                      { code: 'LISKANI', label: 'LISKANI (Шторы и домашний текстиль)' },
                      { code: 'AKUSHA', label: 'AKUSHA (Обувь и аксессуары)' },
                      { code: 'NA_TELE', label: 'НА ТЕЛЕ (Женское бельё и одежда)' },
                      { code: 'FUKAI', label: 'FUKAI (Базовые мультипаки WB)' },
                    ] as const
                  )
                    .filter((opt) => canUserEditBrand(currentUser, opt.code))
                    .map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#0F172A] mb-1">Артикул (SKU)</label>
                <input
                  value={newSkuForm.sku}
                  onChange={(e) =>
                    setNewSkuForm({ ...newSkuForm, sku: e.target.value })
                  }
                  className="w-full h-10 rounded-xl border border-[#CBD5E1] px-3 font-mono font-bold text-[14px] text-[#0F172A]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-[#0F172A] mb-1">
                  Наименование модели
                </label>
                <input
                  value={newSkuForm.name}
                  onChange={(e) =>
                    setNewSkuForm({ ...newSkuForm, name: e.target.value })
                  }
                  placeholder={activeModalPreset.placeholderName}
                  className="w-full h-10 rounded-xl border border-[#CBD5E1] px-3.5 text-[14px] text-[#0F172A]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#0F172A] mb-1">
                  Категория ({formatLabBrandLabel(newSkuForm.brandCode)})
                </label>
                <select
                  value={newSkuForm.category}
                  onChange={(e) =>
                    setNewSkuForm({
                      ...newSkuForm,
                      category: e.target.value,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-[#CBD5E1] px-3 text-[14px] bg-white font-medium text-[#0F172A] cursor-pointer"
                >
                  {activeModalPreset.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__CUSTOM__">+ Своя категория...</option>
                </select>
                {newSkuForm.category === '__CUSTOM__' && (
                  <input
                    type="text"
                    value={newSkuForm.customCategory}
                    onChange={(e) =>
                      setNewSkuForm({
                        ...newSkuForm,
                        customCategory: e.target.value,
                      })
                    }
                    placeholder="Введите название категории"
                    className="mt-2 w-full h-9 rounded-lg border border-[#CBD5E1] px-3 text-[13px]"
                  />
                )}
              </div>

              <div>
                <label className="block font-bold text-[#0F172A] mb-1">
                  Комплектация ({activeModalPreset.unitHint})
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={newSkuForm.unitsInPack}
                  onChange={(e) =>
                    setNewSkuForm({ ...newSkuForm, unitsInPack: e.target.value })
                  }
                  className="w-full h-10 rounded-xl border border-[#CBD5E1] px-3.5 text-[14px] font-bold text-[#0F172A]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-[#0F172A] mb-1">
                  Состав / материал изделия
                </label>
                <input
                  type="text"
                  value={newSkuForm.materials}
                  onChange={(e) =>
                    setNewSkuForm({ ...newSkuForm, materials: e.target.value })
                  }
                  placeholder={activeModalPreset.defaultComposition}
                  className="w-full h-10 rounded-xl border border-[#CBD5E1] px-3.5 text-[13.5px] text-[#0F172A]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#0F172A] mb-1">
                  Розничная цена (РРЦ, ₽)
                </label>
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={newSkuForm.plannedRetailPrice}
                  onChange={(e) =>
                    setNewSkuForm({
                      ...newSkuForm,
                      plannedRetailPrice: e.target.value,
                    })
                  }
                  className="w-full h-10 rounded-xl border border-[#CBD5E1] px-3.5 text-[14px] font-bold text-[#0F172A]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#0F172A] mb-1">
                  Себестоимость под ключ (₽)
                </label>
                {hasCost ? (
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={newSkuForm.unitCostPrice}
                    onChange={(e) =>
                      setNewSkuForm({
                        ...newSkuForm,
                        unitCostPrice: e.target.value,
                      })
                    }
                    className="w-full h-10 rounded-xl border border-[#CBD5E1] px-3.5 text-[14px] font-bold text-[#0F172A]"
                  />
                ) : (
                  <div className="w-full h-10 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-3.5 flex items-center text-[13px] font-semibold text-[#64748B]">
                    Скрыто (доступ по роли)
                  </div>
                )}
              </div>

              <div className="sm:col-span-2 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="block font-bold text-[#0F172A] text-[13px]">
                      Процент выкупа WB (%) — расчёт заказов и закупок
                    </label>
                    <p className="text-[11.5px] text-[#475569]">
                      В обуви из 100 заказов выкупаются в среднем 30–35% (коэффициент к заказам и закупкам ~×3,0)
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[30, 33, 35, 57, 75, 88].map((pctPreset) => (
                      <button
                        key={pctPreset}
                        type="button"
                        onClick={() =>
                          setNewSkuForm((prev) => ({
                            ...prev,
                            buyoutRatePct: String(pctPreset),
                          }))
                        }
                        className={`h-7 px-2 rounded-md font-mono text-[11px] font-bold border cursor-pointer transition ${
                          Number(newSkuForm.buyoutRatePct) === pctPreset
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-white text-[#334155] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        {pctPreset}%
                      </button>
                    ))}
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        min={5}
                        max={100}
                        step={1}
                        value={newSkuForm.buyoutRatePct}
                        onChange={(e) =>
                          setNewSkuForm({
                            ...newSkuForm,
                            buyoutRatePct: e.target.value,
                          })
                        }
                        className="w-18 h-8 rounded-lg border border-[#0F172A] bg-white px-2 pr-5 font-mono font-extrabold text-[13px] text-right text-[#0F172A]"
                      />
                      <span className="absolute right-2 text-[11px] font-bold text-[#64748B] pointer-events-none">
                        %
                      </span>
                    </div>
                  </div>
                </div>
                {(() => {
                  const pct = Math.min(
                    100,
                    Math.max(5, Math.round(Number(newSkuForm.buyoutRatePct) || 33))
                  );
                  const mult = (100 / pct).toFixed(2).replace('.', ',');
                  const ordersFor100 = Math.round(10000 / pct);
                  return (
                    <div className="text-[11.5px] font-medium text-emerald-800 bg-emerald-50/80 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                      При выкупе <strong>{pct}%</strong>: чтобы получить{' '}
                      <strong>100</strong> выкупов (продаж), потребуется{' '}
                      <strong>~{ordersFor100}</strong> заказов и оборотный запас{' '}
                      <strong>×{mult}</strong> в закупках.
                    </div>
                  );
                })()}
              </div>

              <div className="sm:col-span-2 space-y-2">
                <label className="block font-bold text-[#0F172A]">
                  Фото модели (опционально — чужие заглушки не подставляются)
                </label>
                {newSkuForm.imageUrl ? (
                  <div className="flex items-center gap-3 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveCatalogAssetUrl(newSkuForm.imageUrl)}
                      alt="Превью"
                      className="h-16 w-20 object-contain rounded-lg bg-white border border-[#E2E8F0]"
                    />
                    <div className="flex-1 text-[12px] text-emerald-700 font-semibold">
                      ✓ Фотография выбрана и готова к сохранению
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNewSkuForm((prev) => ({ ...prev, imageUrl: '' }))
                      }
                      className="h-8 px-2.5 rounded-lg border border-[#FECACA] bg-white hover:bg-[#FEF2F2] text-[#B42318] text-[12px] font-semibold cursor-pointer"
                    >
                      Удалить фото
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-[#CBD5E1] hover:border-[#0F172A] bg-[#F8FAFC] hover:bg-white text-[13px] font-semibold text-[#334155] cursor-pointer transition">
                    <ImagePlus className="h-4 w-4" />
                    <span>Выбрать файл фотографии (PNG, JPG, WEBP)</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        compressImageFileToDataUrl(f, 760, 0.76).then((url) => {
                          if (url) {
                            setNewSkuForm((prev) => ({ ...prev, imageUrl: url }));
                          }
                        });
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-4 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="h-10 px-4 rounded-xl border border-[#CBD5E1] text-[13px] font-semibold text-[#334155] cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleCreateProduct(false)}
                className="h-10 px-4 rounded-xl border border-[#0F172A] bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-[13px] font-bold cursor-pointer transition"
              >
                Сохранить в каталог
              </button>
              <button
                type="button"
                onClick={() => handleCreateProduct(true)}
                className="h-10 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
              >
                <Check className="h-4 w-4" />
                <span>Сохранить и открыть карточку →</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
