'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Columns3,
  FileText,
  LayoutGrid,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import {
  ConceptStage,
  ProductConcept,
  RnDDevelopmentType,
} from '@/types/platform';
import {
  CONCEPT_STAGE_LABELS_RU,
  RND_DEVELOPMENT_TYPE_LABELS_RU,
  SEVEN_KANBAN_STAGES,
  SevenKanbanStage,
  canUserApproveProduction,
  canUserEditBrand,
  validateRnDStageTransition,
  normalizeConceptStageToSeven,
} from '@/lib/finance';
import {
  ProductLabCardBody,
  RND_CARD_TABS,
  RnDCardTabId,
} from '@/components/sections/ProductLabTabs';
import { PdfConstructorModal } from '@/components/sections/PdfConstructorModal';
import { MiroBoardView } from '@/components/sections/MiroBoardView';
import { compressImageFileToDataUrl } from '@/lib/document-export';
import { ScenarioModelSpec, resolvePublicAssetUrl } from '@/lib/scenarioData';
import { saveModelGalleryToIdb } from '@/lib/safeStorage';
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';
import { detectModelBrandPortfolioLabel } from '@/lib/unifiedBusinessEngine';
import {
  buildConceptPatchFromScenarioModel,
  findLinkedScenarioModelForConcept,
  formatLabBrandLabel,
  normalizeLabBrandCode,
  syncAllBrandConceptsToScenarioPortfolio,
  syncConceptToScenarioPortfolio,
} from '@/lib/rndCatalogSync';

export function ProductLabView() {
  const {
    concepts,
    products,
    launches,
    tasks,
    competitors,
    users,
    currentUser,
    brandFilter,
    setBrandFilter,
    selectedConceptId,
    setSelectedConceptId,
    navigateTo,
    createConcept,
    updateConcept,
    updateConceptStage,
    deleteConcept,
    createProduct,
    createProductFromConcept,
    createLaunch,
    createTask,
    notify,
  } = usePlatform();

  const isStrategyMode = false;

  const [viewMode, setViewMode] = useState<'kanban' | 'gallery' | 'miro'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');

  const [draggedConceptId, setDraggedConceptId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<SevenKanbanStage | null>(null);
  const [isDraggingPhotoOverCard, setIsDraggingPhotoOverCard] = useState(false);

  // Вкладка внутри открытой карточки (7 этапов + История)
  const [activeCardTab, setActiveCardTab] = useState<RnDCardTabId>('overview');

  // Индекс выбранного фото в галерее карточки и зум-лайтбокс
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [zoomPhotoUrl, setZoomPhotoUrl] = useState<string | null>(null);
  const [pdfConstructorOpen, setPdfConstructorOpen] = useState(false);

  // Быстрое создание новой идеи (за 30–60 секунд, Стр. 2 и 4 PDF)
  const [quickIdeaOpen, setQuickIdeaOpen] = useState(false);
  const [addFromCatalogOpen, setAddFromCatalogOpen] = useState(false);
  const [targetStageForImport, setTargetStageForImport] =
    useState<ConceptStage>('IDEA');

  const {
    models: liveScenarioModels,
    scenarios: liveScenarios,
    updateModelsBatch,
  } = useLiveScenarioPortfolio();

  // Единый список карточек из базы (Сценарии роста + Каталог моделей SKU)
  const unifiedCatalogItems = useMemo(() => {
    const items: Array<{
      key: string;
      scenarioModel?: ScenarioModelSpec;
      code: string;
      name: string;
      subtitle: string;
      brandId: string;
      imageUrl?: string;
      retailPriceRub: number;
      unitCostRub: number;
      materials: string;
      sourceLabel: string;
    }> = [];
    const seenNames = new Set<string>();

    for (const sm of liveScenarioModels) {
      if (sm.launchStatus === 'В архиве') continue;
      const detectedBrand = normalizeLabBrandCode(detectModelBrandPortfolioLabel(sm));
      if (
        brandFilter !== 'ALL' &&
        detectedBrand !== normalizeLabBrandCode(brandFilter)
      ) {
        continue;
      }
      const photo =
        (sm.gallery.find((g) => g.isMain && g.url) ||
          sm.gallery.find((g) => Boolean(g.url)))?.url ||
        sm.palettes.find((p) => Boolean(p.imageUrl))?.imageUrl;
      seenNames.add(sm.title.trim().toUpperCase());
      items.push({
        key: `scen-${sm.id}`,
        scenarioModel: sm,
        code: sm.code,
        name: sm.title,
        subtitle: sm.subtitle,
        brandId: detectedBrand,
        imageUrl: photo,
        retailPriceRub: sm.retailPriceRub,
        unitCostRub: sm.unitCostRub,
        materials: sm.fabric.composition,
        sourceLabel: 'Сценарии / Каталог',
      });
    }

    for (const pr of products) {
      if (pr.isArchived) continue;
      const prBrand = normalizeLabBrandCode(pr.brandId);
      if (
        brandFilter !== 'ALL' &&
        prBrand !== normalizeLabBrandCode(brandFilter)
      ) {
        continue;
      }
      if (seenNames.has(pr.name.trim().toUpperCase())) continue;
      seenNames.add(pr.name.trim().toUpperCase());
      items.push({
        key: `prod-${pr.id}`,
        code: pr.sku,
        name: pr.name,
        subtitle: `${pr.category} · ${pr.productType}`,
        brandId: prBrand,
        imageUrl: pr.imageUrl,
        retailPriceRub: pr.economics.plannedRetailPrice,
        unitCostRub: pr.economics.unitCostPrice,
        materials: pr.materials,
        sourceLabel: 'Каталог SKU',
      });
    }

    return items;
  }, [liveScenarioModels, products, brandFilter]);

  const handleImportModelToBoard = (
    item: (typeof unifiedCatalogItems)[number],
    stage: ConceptStage = targetStageForImport
  ) => {
    const patchFromModel = item.scenarioModel
      ? buildConceptPatchFromScenarioModel(item.scenarioModel)
      : null;
    const created = createConcept({
      name: patchFromModel?.name || item.name,
      brandId: patchFromModel?.brandId || item.brandId,
      stage,
      developmentType: 'new_construction',
      whatAttracted: `${item.subtitle} · ${item.materials}`,
      ideaDescription:
        patchFromModel?.ideaDescription ||
        `${item.subtitle} (${item.code}) — розница ${item.retailPriceRub} ₽, себестоимость ${item.unitCostRub} ₽`,
      ownerId: currentUser.id,
      targetLaunchDate: '2027-03-15',
      imageUrl: patchFromModel?.imageUrl || item.imageUrl,
      plannedRetailPrice: patchFromModel?.plannedRetailPrice || item.retailPriceRub,
      plannedUnitCost: patchFromModel?.plannedUnitCost || item.unitCostRub,
      packUnitsCount: patchFromModel?.packUnitsCount || 1,
      supplierName: patchFromModel?.supplierName,
      linkedScenarioModelId: patchFromModel?.linkedScenarioModelId,
    });
    const nextPhotos =
      patchFromModel?.galleryPhotos && patchFromModel.galleryPhotos.length > 0
        ? patchFromModel.galleryPhotos
        : item.imageUrl
        ? [
            {
              id: `ph-import-${Date.now()}`,
              url: item.imageUrl,
              caption: 'Главное фото из базы',
            },
          ]
        : undefined;
    if (nextPhotos || patchFromModel?.linkedScenarioModelId) {
      updateConcept(created.id, {
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
        ...(nextPhotos ? { galleryPhotos: nextPhotos } : {}),
        ...(patchFromModel?.linkedScenarioModelId
          ? { linkedScenarioModelId: patchFromModel.linkedScenarioModelId }
          : {}),
      });
    }
    setAddFromCatalogOpen(false);
    setQuickIdeaOpen(false);
    notify(
      'success',
      `✓ Карточка «${item.name}» добавлена в Лабораторию R&D`,
      `Бренд: ${formatLabBrandLabel(item.brandId)} · Этап: ${CONCEPT_STAGE_LABELS_RU[stage]}`
    );
  };
  const [quickIdeaForm, setQuickIdeaForm] = useState<{
    brandId: string;
    name: string;
    comment: string;
    referenceLink: string;
    developmentType: RnDDevelopmentType;
    ownerId: string;
    targetLaunchDate: string;
    images: string[];
  }>({
    brandId:
      brandFilter && brandFilter !== 'ALL'
        ? normalizeLabBrandCode(brandFilter)
        : 'BORNERS',
    name: '',
    comment: '',
    referenceLink: '',
    developmentType: 'new_construction',
    ownerId: currentUser.id,
    targetLaunchDate: '2027-01-15',
    images: [],
  });

  useEffect(() => {
    if (brandFilter && brandFilter !== 'ALL') {
      const nextBrand = normalizeLabBrandCode(brandFilter);
      setQuickIdeaForm((prev) =>
        prev.brandId === nextBrand ? prev : { ...prev, brandId: nextBrand }
      );
    }
  }, [brandFilter]);

  // Короткая проверка перед сменой этапа (Стр. 3 и Сценарий №3 PDF)
  const [stageGateModal, setStageGateModal] = useState<{
    concept: ProductConcept;
    targetStage: ConceptStage;
    missingFields: string[];
    requiresManagerApproval: boolean;
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoomPhotoUrl) setZoomPhotoUrl(null);
        else if (pdfConstructorOpen) setPdfConstructorOpen(false);
        else if (stageGateModal) setStageGateModal(null);
        else if (quickIdeaOpen) setQuickIdeaOpen(false);
        else if (selectedConceptId) setSelectedConceptId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomPhotoUrl, pdfConstructorOpen, stageGateModal, quickIdeaOpen, selectedConceptId, setSelectedConceptId]);

  const [gateFillForm, setGateFillForm] = useState({
    ownerId: currentUser.id,
    whatAttracted: '',
    hypothesis: '',
    risks: '',
    supplierName: '',
    approvalJustification: '',
  });

  const accessibleConcepts = useMemo(() => {
    return concepts.filter((c) => {
      if (c.isArchived) return false;
      if (
        brandFilter !== 'ALL' &&
        normalizeLabBrandCode(c.brandId) !== normalizeLabBrandCode(brandFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [concepts, brandFilter]);

  const filteredConcepts = useMemo(() => {
    return accessibleConcepts.filter((c) => {
      const normStage = normalizeConceptStageToSeven(c.stage);
      if (stageFilter !== 'ALL' && normStage !== stageFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText =
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.ideaDescription.toLowerCase().includes(q) ||
          (c.whatAttracted || '').toLowerCase().includes(q);
        if (!matchesText) return false;
      }
      return true;
    });
  }, [accessibleConcepts, stageFilter, searchQuery]);

  const getUserFullName = (id?: string) =>
    users.find((u) => u.id === id)?.fullName || 'Алексей Морозов';

  const getUserShortName = (id?: string) => {
    const full = getUserFullName(id);
    return full.split(' ')[0] || full;
  };

  const stageToTabId = (st: SevenKanbanStage): RnDCardTabId => {
    switch (st) {
      case 'IDEA':
        return 'overview';
      case 'ANALYSIS':
        return 'analysis';
      case 'SAMPLE':
        return 'samples';
      case 'TEST':
        return 'testing';
      case 'DECISION':
        return 'decisions';
      case 'PRODUCTION':
        return 'production';
      case 'LAUNCH':
        return 'launch';
    }
  };

  const openConceptCard = (concept: ProductConcept, tab?: RnDCardTabId) => {
    setSelectedConceptId(concept.id);
    setActivePhotoIndex(0);
    const norm = normalizeConceptStageToSeven(concept.stage);
    setActiveCardTab(tab || stageToTabId(norm));
  };

  // Короткая проверка перед сменой этапа (Стр. 3 и Сценарий №3 PDF)
  const attemptStageTransition = (concept: ProductConcept, targetStage: ConceptStage) => {
    const normTarget = normalizeConceptStageToSeven(targetStage);
    const normCurrent = normalizeConceptStageToSeven(concept.stage);

    if (normCurrent === normTarget && targetStage !== 'REJECTED') {
      setActiveCardTab(stageToTabId(normTarget));
      return;
    }

    const check = validateRnDStageTransition(concept, targetStage, currentUser);
    if (!check.allowed) {
      setGateFillForm({
        ownerId: concept.ownerId || currentUser.id,
        whatAttracted: concept.whatAttracted || concept.ideaDescription || '',
        hypothesis:
          concept.analysisReport?.whatWeCreate ||
          concept.whatAttracted ||
          concept.ideaDescription ||
          '',
        risks:
          concept.analysisReport?.openQuestionsAndRisks ||
          'Проверить посадку и усадку после стирки',
        supplierName: concept.supplierName || 'Ташкент Текстиль №1 (Узбекистан)',
        approvalJustification: 'Образец и тесты проверены, утверждено в производство',
      });
      setStageGateModal({
        concept,
        targetStage,
        missingFields: check.missingFields,
        requiresManagerApproval: check.requiresManagerApproval,
      });
      return;
    }

    updateConceptStage(
      concept.id,
      targetStage,
      `Переход на этап «${CONCEPT_STAGE_LABELS_RU[targetStage]}»`
    );
    setActiveCardTab(stageToTabId(normTarget));
  };

  const handleConfirmStageGateModal = () => {
    if (!stageGateModal) return;
    const { concept, targetStage, requiresManagerApproval } = stageGateModal;

    if (requiresManagerApproval && !canUserApproveProduction(currentUser, concept.brandId)) {
      notify(
        'error',
        'Утвердить передачу в производство может только руководитель'
      );
      return;
    }

    const normalizedTarget = normalizeConceptStageToSeven(targetStage);
    const patch: Partial<ProductConcept> = {
      stage: targetStage,
      ownerId: gateFillForm.ownerId || concept.ownerId || currentUser.id,
      whatAttracted:
        gateFillForm.whatAttracted || concept.whatAttracted || concept.name,
      ideaDescription:
        gateFillForm.whatAttracted || concept.ideaDescription || concept.name,
      supplierName: gateFillForm.supplierName || concept.supplierName,
    };

    if (normalizedTarget === 'SAMPLE') {
      patch.analysisReport = {
        ...(concept.analysisReport || {
          whatWeCreate: '',
          targetBuyer: '',
          concreteAdvantage: '',
          whyChooseUs: '',
          demandType: 'incremental',
          marketEvidences: [],
          nicheConclusion: '',
          buyerMotives: '',
          competitorProsAndComplaints: '',
          priceBenchmarksAndObjections: '',
          potentialFactories: '',
          materialsAndMoq: '',
          estimatedProductionCostNote: '',
          estimatedLogisticsNote: '',
          estimatedLandedCostNote: '',
          productionRisks: '',
          summaryAndPros: '',
          openQuestionsAndRisks: '',
          confidenceLevel: 'medium',
          whatToVerifyOnSample: '',
          recommendation: 'continue',
        }),
        whatWeCreate: gateFillForm.hypothesis || 'Продуктовая гипотеза зафиксирована',
        openQuestionsAndRisks:
          gateFillForm.risks || 'Проверить посадку и стирку на образце',
        recommendation: 'continue',
      };
    }

    const nowTime = new Date().toISOString().slice(0, 16).replace('T', ' ');
    patch.stageHistory = [
      {
        id: `sh-${Date.now()}`,
        timestamp: nowTime,
        authorName: currentUser.fullName,
        authorRole: currentUser.role,
        actionType: 'stage_change',
        fromStage: concept.stage,
        toStage: targetStage,
        reason: `Дополнены недостающие поля и выполнен переход на этап «${CONCEPT_STAGE_LABELS_RU[targetStage]}»`,
      },
      ...(concept.stageHistory || []),
    ];

    updateConcept(concept.id, patch);
    setStageGateModal(null);
    setActiveCardTab(stageToTabId(normalizedTarget));
    notify('success', `Статус изменён: «${CONCEPT_STAGE_LABELS_RU[targetStage]}»`);
  };

  const handleSyncConceptToCatalog = (
    conceptToSync: ProductConcept,
    silentToast = false
  ) => {
    const syncRes = syncConceptToScenarioPortfolio(
      conceptToSync,
      liveScenarioModels,
      liveScenarios
    );
    updateModelsBatch(() => syncRes.models);
    if (syncRes.model.gallery?.length) {
      void saveModelGalleryToIdb(syncRes.model.id, syncRes.model.gallery);
    }
    if (conceptToSync.linkedScenarioModelId !== syncRes.model.id) {
      updateConcept(conceptToSync.id, { linkedScenarioModelId: syncRes.model.id });
    }
    if (!silentToast) {
      notify(
        'success',
        syncRes.createdNew
          ? `✓ Передано в Каталог ${formatLabBrandLabel(conceptToSync.brandId)}: ${syncRes.model.code}`
          : `✓ Обновлено в Каталоге ${formatLabBrandLabel(conceptToSync.brandId)}: ${syncRes.model.code}`,
        'Карточка доступна в 01 · Продукт, 02 · Продажи, 03 · Закупки и 04 · Финансы.'
      );
    }
    return syncRes.model;
  };

  // Быстрое создание новой идеи (Сценарий №1 и №2 со Стр. 10 PDF)
  const handleQuickCreateIdea = (openAfterSave = true) => {
    if (!quickIdeaForm.name.trim() && !quickIdeaForm.comment.trim()) {
      notify('warning', 'Укажите название или короткую суть идеи');
      return;
    }
    const title =
      quickIdeaForm.name.trim() ||
      quickIdeaForm.comment.trim().slice(0, 60) ||
      'Новая продуктовая идея';

    const cleanBrand = normalizeLabBrandCode(quickIdeaForm.brandId);
    const galleryPhotos = quickIdeaForm.images.map((url, idx) => ({
      id: `ph-${Date.now()}-${idx}`,
      url,
      caption: idx === 0 ? 'Обложка карточки' : `Фото ${idx + 1}`,
    }));

    const created = createConcept({
      name: title,
      brandId: cleanBrand,
      stage: 'IDEA',
      developmentType: quickIdeaForm.developmentType,
      whatAttracted: quickIdeaForm.comment.trim() || title,
      ideaDescription: quickIdeaForm.comment.trim() || title,
      ownerId: quickIdeaForm.ownerId || currentUser.id,
      targetLaunchDate: quickIdeaForm.targetLaunchDate || '2027-01-15',
      referenceLinks: quickIdeaForm.referenceLink.trim()
        ? [quickIdeaForm.referenceLink.trim()]
        : [],
      imageUrl: quickIdeaForm.images[0] || undefined,
      galleryPhotos: galleryPhotos.length > 0 ? galleryPhotos : undefined,
    });

    const conceptWithMedia: ProductConcept = {
      ...created,
      brandId: cleanBrand,
      ...(quickIdeaForm.images[0] ? { imageUrl: quickIdeaForm.images[0] } : {}),
      ...(galleryPhotos.length > 0 ? { galleryPhotos } : {}),
    };

    if (galleryPhotos.length > 0) {
      updateConcept(created.id, {
        imageUrl: quickIdeaForm.images[0],
        galleryPhotos,
      });
    }

    // Безопасная двухсторонняя синхронизация с единым каталогом ScenarioModelSpec без затирания портфеля!
    const syncedModel = handleSyncConceptToCatalog(conceptWithMedia, true);
    updateConcept(created.id, { linkedScenarioModelId: syncedModel.id });

    createProduct({
      sku: syncedModel.code,
      name: title,
      brandId: cleanBrand,
      category: 'Разработка R&D',
      productType: 'Новая коллекция',
      priceSegment: cleanBrand === 'NA_TELE' || cleanBrand === 'AKUSHA' ? 'Premium' : 'Middle+',
      collection: `${formatLabBrandLabel(cleanBrand)} 2027`,
      materials: quickIdeaForm.comment.trim() || syncedModel.fabric.composition,
      fitType: 'Разработка R&D',
      imageUrl: quickIdeaForm.images[0] || undefined,
      status: 'in_development',
    });

    setQuickIdeaOpen(false);
    setQuickIdeaForm({
      brandId:
        brandFilter && brandFilter !== 'ALL'
          ? normalizeLabBrandCode(brandFilter)
          : cleanBrand,
      name: '',
      comment: '',
      referenceLink: '',
      developmentType: 'new_construction',
      ownerId: currentUser.id,
      targetLaunchDate: '2027-01-15',
      images: [],
    });
    if (openAfterSave) {
      openConceptCard(
        { ...conceptWithMedia, linkedScenarioModelId: syncedModel.id },
        'overview'
      );
    } else {
      setSelectedConceptId(null);
    }
    notify(
      'success',
      `✓ Карточка «${created.code} · ${created.name}» сохранена и добавлена в Каталог (${syncedModel.code})`
    );
  };

  const activeConcept: ProductConcept | null = useMemo(
    () => accessibleConcepts.find((c) => c.id === selectedConceptId) || null,
    [accessibleConcepts, selectedConceptId]
  );

  const activeLinkedScenarioModel = useMemo(
    () =>
      activeConcept
        ? findLinkedScenarioModelForConcept(activeConcept, liveScenarioModels)
        : null,
    [activeConcept, liveScenarioModels]
  );

  const canEditActiveConcept =
    activeConcept !== null &&
    canUserEditBrand(currentUser, activeConcept.brandId);

  // Все фотографии открытой карточки (главное фото + лента миниатюр, Стр. 4 и 9 PDF)
  const activeGalleryPhotos = useMemo(() => {
    if (!activeConcept) return [];
    if (activeConcept.galleryPhotos && activeConcept.galleryPhotos.length > 0) {
      return activeConcept.galleryPhotos;
    }
    if (activeConcept.imageUrl) {
      return [
        {
          id: 'ph-cover',
          url: activeConcept.imageUrl,
          caption: 'Главное фото',
        },
      ];
    }
    return [];
  }, [activeConcept]);

  const appendPhotosToActiveConcept = (dataUrls: string[]) => {
    if (!activeConcept || dataUrls.length === 0) return;
    const existing = activeGalleryPhotos;
    const added = dataUrls.map((url, idx) => ({
      id: `ph-${Date.now()}-${idx}`,
      url,
      caption: `Фото ${existing.length + idx + 1}`,
    }));
    const nextList = [...existing, ...added];
    updateConcept(activeConcept.id, {
      imageUrl: nextList[0].url,
      galleryPhotos: nextList,
    });
    notify(
      'success',
      dataUrls.length === 1
        ? 'Фотография добавлена в галерею карточки'
        : `Добавлено фотографий: ${dataUrls.length}`
    );
  };

  const setPhotoAsCover = (idx: number) => {
    if (!activeConcept) return;
    const list = [...activeGalleryPhotos];
    const [picked] = list.splice(idx, 1);
    if (!picked) return;
    const reordered = [picked, ...list];
    updateConcept(activeConcept.id, {
      imageUrl: picked.url,
      galleryPhotos: reordered,
    });
    setActivePhotoIndex(0);
    notify('success', 'Назначено главным фото (обложкой карточки)');
  };

  const movePhotoOrder = (idx: number, dir: -1 | 1) => {
    if (!activeConcept) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= activeGalleryPhotos.length) return;
    const list = [...activeGalleryPhotos];
    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;
    updateConcept(activeConcept.id, {
      imageUrl: list[0].url,
      galleryPhotos: list,
    });
    setActivePhotoIndex(targetIdx);
  };

  const removePhotoFromGallery = (idx: number) => {
    if (!activeConcept) return;
    const list = activeGalleryPhotos.filter((_, i) => i !== idx);
    updateConcept(activeConcept.id, {
      imageUrl: list[0]?.url || '',
      galleryPhotos: list,
    });
    setActivePhotoIndex(0);
  };

  // Короткая 3-я строка статуса на карточке фотодоски (Стр. 3 PDF)
  const getBoardCardStatusLine = (c: ProductConcept, stage: SevenKanbanStage) => {
    if (stage === 'TEST') {
      return { text: 'Требуется тест', highlight: true };
    }
    if (stage === 'SAMPLE') {
      if (c.targetLaunchDate) {
        const [, mm, dd] = c.targetLaunchDate.split('-');
        return { text: `Образец · ${dd || '15'}.${mm || '03'}`, highlight: false };
      }
      return { text: 'Проверка образца', highlight: false };
    }
    if (c.targetLaunchDate) {
      const [yyyy, mm] = c.targetLaunchDate.split('-');
      return {
        text: `Запуск · ${mm || '01'}.${yyyy || '2027'}`,
        highlight: false,
      };
    }
    return { text: 'Запуск · 01.2027', highlight: false };
  };

  return (
    <div className="space-y-6 pb-20">
      {/* =====================================================================
          02 / ГЛАВНЫЙ ЭКРАН — ЛАБОРАТОРИЯ R&D (АРХИТЕКТУРНАЯ РАМКА 1.5px БЕЗ ЛИШНИХ ИКОНОК)
      ===================================================================== */}
      <div className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-5 md:p-6 space-y-5 shadow-[0_2px_10px_rgba(20,20,19,0.03)]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-[1.5px] border-[#DFDED6] pb-4">
          <div className="space-y-0.5">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.07em] text-[#5E5D58]">
              01 · Продукт · 7 этапов отбора образцов
            </div>
            <h1 className="text-[23px] font-bold tracking-[-0.02em] text-[#141413]">
              Лаборатория R&amp;D
            </h1>
            <p className="text-[12.5px] text-[#5E5D58]">
              От первой фотографии и анализа рынка до протокола стирки и передачи фабрике
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigateTo('product-catalog', { brandId: brandFilter })}
              className="h-9 rounded-[9px] bg-[#FAF9F6] hover:border-[#141413] border-[1.5px] border-[#CECDC4] text-[#141413] px-3.5 text-[12px] font-semibold transition cursor-pointer"
            >
              Каталог SKU →
            </button>

            {brandFilter !== 'ALL' && accessibleConcepts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const targetCode = normalizeLabBrandCode(brandFilter);
                  const res = syncAllBrandConceptsToScenarioPortfolio(
                    concepts,
                    targetCode,
                    liveScenarioModels,
                    liveScenarios
                  );
                  updateModelsBatch(() => res.models);
                  for (const item of res.syncedItems) {
                    updateConcept(item.conceptId, {
                      linkedScenarioModelId: item.model.id,
                    });
                    if (item.model.gallery?.length) {
                      void saveModelGalleryToIdb(item.model.id, item.model.gallery);
                    }
                  }
                  notify(
                    'success',
                    `✓ Синхронизировано ${res.syncedItems.length} SKU бренда ${formatLabBrandLabel(targetCode)}`,
                    'Все карточки перенесены в 01 · Продукт и 02 · Продажи.'
                  );
                }}
                className="h-9 rounded-[9px] bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 text-[12px] font-semibold transition cursor-pointer"
              >
                Перенести {formatLabBrandLabel(brandFilter)} в План 2027 ({accessibleConcepts.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => setAddFromCatalogOpen(true)}
              className="h-9 rounded-[9px] bg-white hover:border-[#141413] border-[1.5px] border-[#CECDC4] text-[#141413] px-3.5 text-[12px] font-semibold transition cursor-pointer"
            >
              Из каталога ({unifiedCatalogItems.length})
            </button>

            <button
              type="button"
              onClick={() => setQuickIdeaOpen(true)}
              className="h-9 rounded-[9px] bg-[#141413] hover:bg-[#2A2A28] text-white px-4 text-[12px] font-semibold transition cursor-pointer"
            >
              + Новая идея
            </button>
          </div>
        </div>

        {/* Панель фильтров: Все бренды | Все этапы | Поиск | Вид */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="h-9 rounded-[9px] bg-white hover:border-[#141413] border-[1.5px] border-[#CECDC4] px-3 text-[12px] font-semibold text-[#141413] outline-none cursor-pointer transition"
            >
              <option value="ALL">Все бренды</option>
              <option value="BORNERS">BORNERS</option>
              <option value="NA_TELE">НА ТЕЛЕ</option>
              <option value="FUKAI">FUKAI</option>
              <option value="AKUSHA">AKUSHA</option>
              <option value="LISKANI">LISKANI</option>
            </select>

            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="h-9 rounded-[9px] bg-white hover:border-[#141413] border-[1.5px] border-[#CECDC4] px-3 text-[12px] font-semibold text-[#141413] outline-none cursor-pointer transition"
            >
              <option value="ALL">Все этапы (01–07)</option>
              {SEVEN_KANBAN_STAGES.map((st) => (
                <option key={st} value={st}>
                  {CONCEPT_STAGE_LABELS_RU[st]}
                </option>
              ))}
            </select>

            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск образца или ID..."
              className="w-52 sm:w-60 h-9 rounded-[9px] bg-[#F7F7F4] border-[1.5px] border-[#CECDC4] px-3.5 text-[12.5px] font-medium text-[#141413] placeholder:text-[#7E7D77] outline-none focus:bg-white focus:border-[#141413]"
            />
          </div>

          <div className="inline-flex items-center rounded-[9px] bg-[#EFEFE9] border-[1.5px] border-[#CECDC4] p-0.5 text-[12px]">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`h-8 px-3.5 rounded-[7px] font-semibold transition cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-[#141413] text-white shadow-2xs'
                  : 'text-[#3F3E3A] hover:text-[#141413]'
              }`}
            >
              Фотодоска
            </button>
            <button
              type="button"
              onClick={() => setViewMode('gallery')}
              className={`h-8 px-3.5 rounded-[7px] font-semibold transition cursor-pointer ${
                viewMode === 'gallery'
                  ? 'bg-[#141413] text-white shadow-2xs'
                  : 'text-[#3F3E3A] hover:text-[#141413]'
              }`}
            >
              Галерея
            </button>
            <button
              type="button"
              onClick={() => setViewMode('miro')}
              className={`h-8 px-3.5 rounded-[7px] font-semibold transition cursor-pointer ${
                viewMode === 'miro'
                  ? 'bg-[#141413] text-white shadow-2xs'
                  : 'text-[#3F3E3A] hover:text-[#141413]'
              }`}
            >
              Холст идей (Miro)
            </button>
          </div>
        </div>

        {/* ===================================================================
            ФОТОДОСКА KANBAN (Крупные карточки 256px, фото 60% высоты, 3 строки текста без зажатия)
        =================================================================== */}
        {viewMode === 'kanban' && (
          <div className="space-y-3" data-no-swipe-nav="true">
            <div
              data-no-swipe-nav="true"
              className="flex gap-3.5 overflow-x-auto overscroll-x-contain pb-3 pt-1"
            >
              {SEVEN_KANBAN_STAGES.map((stage, stageIdx) => {
                const stageItems = filteredConcepts.filter(
                  (c) => normalizeConceptStageToSeven(c.stage) === stage
                );
                const isOver = dragOverStage === stage;
                const cleanStageTitle = CONCEPT_STAGE_LABELS_RU[stage].replace(/^\d+\s*[·-]\s*/, '');

                return (
                  <div
                    key={stage}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverStage(stage);
                    }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      const cid =
                        e.dataTransfer.getData('text/plain') || draggedConceptId;
                      setDraggedConceptId(null);
                      setDragOverStage(null);
                      if (!cid) return;
                      const found = concepts.find((x) => x.id === cid);
                      if (found) {
                        attemptStageTransition(found, stage);
                      }
                    }}
                    className={`w-[258px] shrink-0 rounded-[10px] p-3 flex flex-col gap-3 min-h-[520px] border transition ${
                      isOver
                        ? 'border-[#181715] bg-[#EFECE6]'
                        : 'border-[#EAE6DF] bg-[#FAF8F5]'
                    }`}
                  >
                    {/* Заголовок колонки без дублирования 01 01 */}
                    <div className="flex items-center justify-between px-1 pb-2 border-b border-[#EAE6DF]">
                      <span className="text-[13px] text-[#181715] font-medium flex items-center gap-2">
                        <span className="text-[11.5px] tabular-nums text-[#9E988E] font-normal">
                          0{stageIdx + 1}
                        </span>
                        <span>{cleanStageTitle}</span>
                      </span>
                      <span className="text-[12px] tabular-nums text-[#8C867E]">
                        {stageItems.length}
                      </span>
                    </div>

                    {/* Список крупных фото-карточек */}
                    <div className="space-y-3 flex-1">
                      {stageItems.map((concept) => {
                        const statusLine = getBoardCardStatusLine(concept, stage);
                        const hasPhoto = Boolean(concept.imageUrl && concept.imageUrl.trim());

                        return (
                          <div
                            key={concept.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedConceptId(concept.id);
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', concept.id);
                            }}
                            onClick={() => openConceptCard(concept)}
                            className="group relative bg-white rounded-[8px] border border-[#EAE6DF] hover:border-[#CBC5B9] hover:shadow-xs overflow-hidden cursor-pointer transition flex flex-col"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConcept(concept.id);
                              }}
                              title="Удалить карточку"
                              className="opacity-85 group-hover:opacity-100 absolute top-2.5 right-2.5 z-10 h-7 w-7 rounded-[7px] bg-white/95 border border-[#DCD6CC] flex items-center justify-center text-[#7A756D] hover:text-[#B83E3E] hover:border-[#B83E3E] shadow-2xs transition cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>

                            {/* Крупное изображение (~60% высоты карточки) */}
                            <div className="h-[196px] w-full bg-[#F3EFE8] border-b border-[#EAE6DF] overflow-hidden flex items-center justify-center">
                              {hasPhoto ? (
                                <img
                                  src={resolvePublicAssetUrl(concept.imageUrl)}
                                  alt={concept.name}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                                />
                              ) : (
                                <div className="text-center px-4 text-[12px] text-[#8C867E]">
                                  Фото образца не загружено
                                </div>
                              )}
                            </div>

                            {/* Ровно 3 чистые строки под фото + наглядный индикатор пройденных и оставшихся этапов */}
                            <div className="p-3.5 space-y-1.5">
                              <h4 className="text-[14px] font-medium text-[#181715] leading-snug line-clamp-1">
                                {concept.name}
                              </h4>

                              <div className="text-[12px] text-[#7A756D] truncate">
                                {formatLabBrandLabel(concept.brandId)} ·{' '}
                                {getUserShortName(concept.ownerId)}
                              </div>

                              {/* Наглядная полоска этапов: какие закончены, какой сейчас и сколько осталось */}
                              <div className="pt-1 space-y-1">
                                <div className="grid grid-cols-7 gap-1">
                                  {SEVEN_KANBAN_STAGES.map((st, idx) => {
                                    const isDone = idx < stageIdx;
                                    const isCurr = idx === stageIdx;
                                    return (
                                      <span
                                        key={st}
                                        title={CONCEPT_STAGE_LABELS_RU[st]}
                                        className={`h-1.5 rounded-full ${
                                          isDone
                                            ? 'bg-[#1F6E50]'
                                            : isCurr
                                            ? 'bg-[#B85D35]'
                                            : 'bg-[#E5E0D8]'
                                        }`}
                                      />
                                    );
                                  })}
                                </div>
                                <div className="flex items-center justify-between text-[10.5px] font-mono">
                                  <span className="text-[#1F6E50] font-semibold">
                                    ✓ Готово: {stageIdx}/7
                                  </span>
                                  <span className="text-[#7A756D]">
                                    Осталось: {Math.max(0, 6 - stageIdx)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-2 pt-0.5 min-h-[24px]">
                                <span
                                  className={`text-[12px] tabular-nums whitespace-nowrap ${
                                    statusLine.highlight
                                      ? 'text-[#B85D35] font-medium'
                                      : 'text-[#8C867E]'
                                  }`}
                                >
                                  {statusLine.text}
                                </span>

                                <select
                                  value={stage}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    attemptStageTransition(
                                      concept,
                                      e.target.value as ConceptStage
                                    );
                                  }}
                                  title="Переместить в этап..."
                                  className="hidden group-hover:block focus:block text-[11px] text-[#181715] bg-[#FAF8F5] border border-[#DCD6CC] rounded-[5px] px-1.5 py-0.5 cursor-pointer transition max-w-[118px] truncate"
                                >
                                  {SEVEN_KANBAN_STAGES.map((st) => (
                                    <option key={st} value={st}>
                                      → {CONCEPT_STAGE_LABELS_RU[st].replace(/^\d+\s*[·-]\s*/, '')}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================
            РЕЖИМ ГАЛЕРЕИ КАРТОЧЕК
        =================================================================== */}
        {viewMode === 'gallery' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 pt-2">
            {filteredConcepts.map((concept) => {
              const stage = normalizeConceptStageToSeven(concept.stage);
              const statusLine = getBoardCardStatusLine(concept, stage);
              return (
                <div
                  key={concept.id}
                  onClick={() => openConceptCard(concept)}
                  className="group relative bg-white rounded-2xl border border-[#E8E8E5] hover:border-[#171717] p-4 space-y-3 cursor-pointer transition shadow-2xs"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConcept(concept.id);
                    }}
                    title="Удалить карточку"
                    className=" absolute top-6 right-6 z-10 h-7 w-7 rounded-lg bg-white/95 border border-[#DCD6CC] flex items-center justify-center text-[#737373] hover:text-[#DC2626] hover:border-[#DC2626] shadow-2xs transition cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="h-56 w-full rounded-xl bg-[#EFECE8] border border-[#E8E8E5] flex items-center justify-center p-3">
                    {concept.imageUrl ? (
                      <img
                        src={resolvePublicAssetUrl(concept.imageUrl)}
                        alt={concept.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-[13px] text-[#737373]">Карточка без фото</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[12px] font-bold text-[#737373]">
                      <span>{concept.code}</span>
                      <span className="text-[#D97745] uppercase">
                        {CONCEPT_STAGE_LABELS_RU[stage]}
                      </span>
                    </div>
                    <h4 className="text-[16px] font-bold text-[#171717] truncate">
                      {concept.name}
                    </h4>
                    <div className="flex items-center justify-between text-[13px] text-[#737373]">
                      <span>
                        {formatLabBrandLabel(concept.brandId)} ·{' '}
                        {getUserShortName(concept.ownerId)}
                      </span>
                      <span className="font-semibold">{statusLine.text}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===================================================================
            РЕЖИМ ХОЛСТА ИДЕЙ (СТУДИЯ MIRO — СТИКЕРЫ, ФОТО, ГОЛОСОВЫЕ ЗАМЕТКИ)
        =================================================================== */}
        {viewMode === 'miro' && (
          <div className="pt-2" data-no-swipe-nav="true">
            <MiroBoardView />
          </div>
        )}
      </div>

      {/* =====================================================================
          03 / КАРТОЧКА ИДЕИ И ЗАГРУЗКА ФОТОГРАФИЙ (СТР. 4 PDF UX SPEC V2.0)
          Большой просмотр продукта: слева галерея, справа краткий паспорт, ниже — этапы
      ===================================================================== */}
      {activeConcept && (
        <div
          onClick={() => setSelectedConceptId(null)}
          onPaste={(e) => {
            const items = Array.from(e.clipboardData?.items || []);
            items.forEach((item) => {
              if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (!file) return;
                compressImageFileToDataUrl(file).then((url) => {
                  if (url) appendPhotosToActiveConcept([url]);
                });
              }
            });
          }}
          className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl bg-[#FAF8F5] h-full overflow-y-auto p-6 md:p-10 space-y-7 shadow-2xl"
          >
            {/* ВЕРХНЯЯ СТРОКА: RD-024 / НА ТЕЛЕ / ИДЕЯ + АВТОСОХРАНЕНИЕ + КОНСТРУКТОР PDF + УДАЛИТЬ + ЗАКРЫТЬ */}
            <div className="rounded-3xl bg-white border-[1.5px] border-[#CFC8BC] p-6 md:p-8 space-y-6 shadow-2xs">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-[260px]">
                  <div className="flex flex-wrap items-center gap-2.5 text-[12px] font-bold uppercase tracking-wider text-[#737373]">
                    <span>
                      {activeConcept.code} /{' '}
                      {formatLabBrandLabel(activeConcept.brandId)} /{' '}
                      {CONCEPT_STAGE_LABELS_RU[
                        normalizeConceptStageToSeven(activeConcept.stage)
                      ].toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        updateConcept(activeConcept.id, {
                          name: activeConcept.name,
                          whatAttracted: activeConcept.whatAttracted,
                          ideaDescription: activeConcept.ideaDescription,
                        });
                        notify(
                          'success',
                          '✓ Карточка сохранена',
                          `${activeConcept.code} · ${activeConcept.name}`
                        );
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E8F5E9] hover:bg-[#D1EBD5] text-[#16805D] text-[11px] font-bold normal-case transition cursor-pointer"
                    >
                      <Check className="h-3 w-3" />
                      Сохранено
                    </button>
                  </div>

                  {/* Крупный редактируемый заголовок модели */}
                  <input
                    disabled={!canEditActiveConcept}
                    value={activeConcept.name}
                    onChange={(e) =>
                      updateConcept(activeConcept.id, { name: e.target.value })
                    }
                    className="w-full text-[26px] md:text-[32px] font-bold tracking-tight text-[#171717] bg-transparent border-b border-transparent hover:border-[#E8E8E5] focus:border-[#171717] outline-none pb-1"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSyncConceptToCatalog(activeConcept)}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold transition cursor-pointer shadow-2xs"
                  >
                    <span>
                      {activeLinkedScenarioModel
                        ? `✓ Обновить в Каталоге (${activeLinkedScenarioModel.code})`
                        : '+ В Каталог SKU и План 2027'}
                    </span>
                  </button>

                  {activeLinkedScenarioModel && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedConceptId(null);
                        navigateTo('launch-calendar', {
                          brandId: normalizeLabBrandCode(activeConcept.brandId),
                        });
                      }}
                      className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-[#FAF8F5] hover:bg-[#EFECE6] border border-[#CFC8BC] text-[#171717] text-[12.5px] font-bold transition cursor-pointer"
                    >
                      <span>02 · Продажи →</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      updateConcept(activeConcept.id, {
                        name: activeConcept.name,
                        whatAttracted: activeConcept.whatAttracted,
                        ideaDescription: activeConcept.ideaDescription,
                      });
                      if (activeLinkedScenarioModel) {
                        handleSyncConceptToCatalog(activeConcept, true);
                      }
                      notify(
                        'success',
                        '✓ Карточка сохранена',
                        `${activeConcept.code} · ${activeConcept.name}`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#16805D] hover:bg-[#116649] text-white text-[13px] font-bold transition cursor-pointer shadow-2xs"
                  >
                    <Check className="h-4 w-4" />
                    <span>Сохранить карточку</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPdfConstructorOpen(true)}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#B85D35] hover:bg-[#9E4D29] text-white text-[13px] font-bold transition cursor-pointer shadow-2xs"
                  >
                    <FileText className="h-4 w-4" />
                    <span>Выгрузить в PDF (Конструктор · 中文 + ₽/$/¥)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const idToRemove = activeConcept.id;
                      setSelectedConceptId(null);
                      deleteConcept(idToRemove);
                    }}
                    className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-[#E8E8E5] text-[#737373] hover:text-[#DC2626] hover:border-[#DC2626] text-[13px] font-semibold transition cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Удалить</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedConceptId(null)}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#111111] text-white text-[13px] font-bold hover:opacity-90 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                    <span>Закрыть</span>
                  </button>
                </div>
              </div>

              {/* ===============================================================
                  ПЕРВЫЙ ЭКРАН КАРТОЧКИ (СТР. 4 PDF):
                  СЛЕВА — БОЛЬШАЯ ФОТОГАЛЕРЕЯ (3 СПОСОБА ЗАГРУЗКИ),
                  СПРАВА — КРАТКИЙ ПАСПОРТ (4 БЛОКА)
              =============================================================== */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* ЛЕВАЯ КОЛОНКА (7/12): Большое главное фото + лента миниатюр + Drag&Drop/Paste/Upload */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingPhotoOverCard(true);
                  }}
                  onDragLeave={() => setIsDraggingPhotoOverCard(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingPhotoOverCard(false);
                    const files = Array.from(e.dataTransfer.files || []).filter((f) =>
                      f.type.startsWith('image/')
                    );
                    if (files.length === 0) return;
                    Promise.all(
                      files.map((file) => compressImageFileToDataUrl(file, 720, 0.78))
                    ).then((urls) => {
                      const valid = urls.filter(Boolean);
                      if (valid.length > 0) appendPhotosToActiveConcept(valid);
                    });
                  }}
                  className={`lg:col-span-7 space-y-3 rounded-2xl transition ${
                    isDraggingPhotoOverCard ? 'ring-2 ring-[#D97745] bg-[#FDF3EB]/40 p-2' : ''
                  }`}
                >
                  {/* Крупное главное фото */}
                  <div className="relative h-[340px] w-full rounded-2xl bg-[#EFECE8] border border-[#E8E8E5] overflow-hidden flex items-center justify-center group">
                    {activeGalleryPhotos[activePhotoIndex]?.url ? (
                      <>
                        <img
                          src={resolvePublicAssetUrl(activeGalleryPhotos[activePhotoIndex].url)}
                          alt={activeConcept.name}
                          onClick={() =>
                            setZoomPhotoUrl(
                              activeGalleryPhotos[activePhotoIndex]?.url || null
                            )
                          }
                          className="h-full w-full object-contain p-3 cursor-zoom-in"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setZoomPhotoUrl(
                              activeGalleryPhotos[activePhotoIndex]?.url || null
                            )
                          }
                          className="opacity-0 group-hover:opacity-100 absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/75 text-white text-[12px] font-semibold cursor-pointer transition"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                          <span>Увеличить</span>
                        </button>
                      </>
                    ) : (
                      <div className="text-center p-6 space-y-2 text-[#737373]">
                        <div className="text-[15px] font-bold text-[#171717]">
                          Перетащите сюда 1–20 фото или нажмите Cmd+V
                        </div>
                        <div className="text-[13px]">
                          Поддерживаются PNG / JPG / WEBP и скриншоты из буфера обмена
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Лента миниатюр + управление порядком / обложкой + кнопка «Добавить фото» */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {activeGalleryPhotos.map((ph, idx) => {
                      const isCurrent = idx === activePhotoIndex;
                      const isCover = idx === 0;
                      return (
                        <div
                          key={ph.id}
                          onClick={() => setActivePhotoIndex(idx)}
                          className={`group relative h-20 w-24 rounded-xl overflow-hidden border-2 bg-[#EFECE8] cursor-pointer transition ${
                            isCurrent
                              ? 'border-[#171717] shadow-xs'
                              : 'border-[#E8E8E5] opacity-85 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={resolvePublicAssetUrl(ph.url)}
                            alt={ph.caption || 'thumb'}
                            className="h-full w-full object-cover"
                          />
                          {isCover && (
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-bold uppercase">
                              Обложка
                            </span>
                          )}
                          {canEditActiveConcept && (
                            <div className="opacity-0 group-hover:opacity-100 absolute inset-x-0 bottom-0 bg-black/80 p-1 flex items-center justify-between text-white transition">
                              {!isCover && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPhotoAsCover(idx);
                                  }}
                                  title="Сделать обложкой"
                                  className="p-0.5 hover:text-[#D97745] cursor-pointer"
                                >
                                  <Star className="h-3 w-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePhotoOrder(idx, -1);
                                }}
                                title="Сдвинуть влево"
                                className="p-0.5 hover:text-[#D97745] cursor-pointer"
                              >
                                <ArrowLeft className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  movePhotoOrder(idx, 1);
                                }}
                                title="Сдвинуть вправо"
                                className="p-0.5 hover:text-[#D97745] cursor-pointer"
                              >
                                <ArrowRight className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePhotoFromGallery(idx);
                                }}
                                title="Удалить фото"
                                className="p-0.5 hover:text-[#DC2626] cursor-pointer"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Кнопка загрузки «Добавить фото» (множественная загрузка + drag-and-drop + Cmd+V) */}
                    {canEditActiveConcept && (
                      <label className="h-20 px-4 rounded-xl border-2 border-dashed border-[#D5D3CE] hover:border-[#D97745] bg-[#F7F7F5] flex flex-col items-center justify-center text-center cursor-pointer transition">
                        <Upload className="h-4 w-4 text-[#D97745] mb-1" />
                        <span className="text-[11px] font-bold text-[#171717]">
                          + Добавить фото
                        </span>
                        <span className="text-[10px] text-[#737373]">
                          или Cmd+V / Drag
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length === 0) return;
                            Promise.all(
                              files.map((f) => compressImageFileToDataUrl(f, 720, 0.78))
                            ).then((urls) => {
                              const valid = urls.filter(Boolean);
                              if (valid.length > 0) appendPhotosToActiveConcept(valid);
                            });
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* ПРАВАЯ КОЛОНКА (5/12): Краткий паспорт из 4 чистых карточек (Один в один со Стр. 4 PDF!) */}
                <div className="lg:col-span-5 space-y-3">
                  {/* 1. БРЕНД / АВТОР */}
                  <div className="rounded-2xl bg-[#F7F7F5] border border-[#E8E8E5] p-4 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                      БРЕНД / АВТОР
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <select
                        disabled={!canEditActiveConcept}
                        value={normalizeLabBrandCode(activeConcept.brandId)}
                        onChange={(e) =>
                          updateConcept(activeConcept.id, { brandId: e.target.value })
                        }
                        className="text-[15px] font-bold text-[#171717] bg-transparent outline-none cursor-pointer"
                      >
                        <option value="BORNERS">BORNERS</option>
                        <option value="NA_TELE">НА ТЕЛЕ</option>
                        <option value="FUKAI">FUKAI</option>
                        <option value="AKUSHA">AKUSHA</option>
                        <option value="LISKANI">LISKANI</option>
                      </select>
                      <span className="text-[14px] font-semibold text-[#525252]">
                        · {getUserShortName(activeConcept.authorId || currentUser.id)}
                      </span>
                    </div>
                  </div>

                  {/* 2. ТИП РАЗРАБОТКИ */}
                  <div className="rounded-2xl bg-[#F7F7F5] border border-[#E8E8E5] p-4 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                      ТИП РАЗРАБОТКИ
                    </div>
                    <select
                      disabled={!canEditActiveConcept}
                      value={activeConcept.developmentType || 'new_construction'}
                      onChange={(e) =>
                        updateConcept(activeConcept.id, {
                          developmentType: e.target.value as RnDDevelopmentType,
                        })
                      }
                      className="w-full text-[15px] font-bold text-[#171717] bg-transparent outline-none cursor-pointer"
                    >
                      {Object.entries(RND_DEVELOPMENT_TYPE_LABELS_RU).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. ОТВЕТСТВЕННЫЙ / СРОК */}
                  <div className="rounded-2xl bg-[#F7F7F5] border border-[#E8E8E5] p-4 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                      ОТВЕТСТВЕННЫЙ / СРОК
                    </div>
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <select
                        disabled={!canEditActiveConcept}
                        value={activeConcept.ownerId}
                        onChange={(e) =>
                          updateConcept(activeConcept.id, { ownerId: e.target.value })
                        }
                        className="text-[15px] font-bold text-[#171717] bg-transparent outline-none cursor-pointer truncate"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName.split(' ')[0]} ({u.fullName})
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        disabled={!canEditActiveConcept}
                        value={activeConcept.targetLaunchDate || '2027-01-15'}
                        onChange={(e) =>
                          updateConcept(activeConcept.id, {
                            targetLaunchDate: e.target.value,
                          })
                        }
                        className="text-[14px] font-bold text-[#171717] bg-transparent outline-none text-right"
                      />
                    </div>
                  </div>

                  {/* 4. СУТЬ ИДЕИ (тёплая карточка как на Стр. 4 PDF) */}
                  <div className="rounded-2xl bg-[#FDF5EF] border border-[#F3DFD1] p-4 space-y-1.5">
                    <div className="text-[13px] font-bold text-[#171717]">
                      Суть идеи
                    </div>
                    <textarea
                      rows={3}
                      disabled={!canEditActiveConcept}
                      value={
                        activeConcept.whatAttracted ??
                        activeConcept.ideaDescription ??
                        ''
                      }
                      onChange={(e) =>
                        updateConcept(activeConcept.id, {
                          whatAttracted: e.target.value,
                          ideaDescription: e.target.value,
                        })
                      }
                      placeholder="Тонкий материал, мягкая посадка, почти незаметные края..."
                      className="w-full bg-transparent text-[14px] text-[#525252] leading-relaxed outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* ===============================================================
                  ПОЛОСА 7 ЭТАПОВ НИЖЕ ПАСПОРТА:
                  НАГЛЯДНО ПОКАЗЫВАЕТ КАКИЕ ЭТАПЫ ЗАКОНЧЕНЫ (✓ ГОТОВО), КАКОЙ СЕЙЧАС (● В РАБОТЕ), А КАКИЕ ОСТАЛИСЬ (○ ОСТАЛОСЬ)
              =============================================================== */}
              {(() => {
                const currentNormStage = normalizeConceptStageToSeven(activeConcept.stage);
                const currentStageIdx = Math.max(
                  0,
                  SEVEN_KANBAN_STAGES.indexOf(currentNormStage)
                );
                const completedCount = currentStageIdx;
                const remainingCount = Math.max(0, 6 - currentStageIdx);

                return (
                  <div className="pt-4 border-t-2 border-[#E5E0D8] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#E6F4EE] border border-[#1F6E50]/30 text-[#1F6E50] font-semibold">
                          ✓ Завершено этапов: {completedCount} из 7
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#FCE8DF] border border-[#B85D35]/40 text-[#9E4622] font-semibold">
                          ● Сейчас в работе: {CONCEPT_STAGE_LABELS_RU[currentNormStage]}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#F3EFE8] border border-[#D4CDC2] text-[#5C5852] font-medium">
                          ○ Осталось пройти: {remainingCount}
                        </span>
                      </div>
                      <span className="text-[11.5px] text-[#7A756D]">
                        Нажмите на любой этап для просмотра или заполнения
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                      {RND_CARD_TABS.map((t, idx) => {
                        const isTabActive = activeCardTab === t.id;
                        const isHistoryTab = t.id === 'history';
                        const isCompleted = !isHistoryTab && idx < currentStageIdx;
                        const isCurrentStage = !isHistoryTab && idx === currentStageIdx;

                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveCardTab(t.id)}
                            className={`rounded-[10px] p-2.5 text-left transition cursor-pointer border-[1.5px] flex flex-col justify-between gap-1 ${
                              isTabActive
                                ? 'bg-[#181715] text-white border-[#181715] shadow-xs'
                                : isCompleted
                                ? 'bg-[#EBF5F0] text-[#14533C] border-[#1F6E50]/50 hover:border-[#1F6E50]'
                                : isCurrentStage
                                ? 'bg-[#FBF3EE] text-[#181715] border-[#B85D35] hover:bg-[#F7E8DE]'
                                : 'bg-[#FAF8F5] text-[#7A756D] border-dashed border-[#D4CDC2] hover:border-[#181715] hover:text-[#181715]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] font-mono uppercase">
                              <span>
                                {isHistoryTab
                                  ? 'ЖУРНАЛ'
                                  : isCompleted
                                  ? '✓ ГОТОВО'
                                  : isCurrentStage
                                  ? '● В РАБОТЕ'
                                  : '○ ОСТАЛОСЬ'}
                              </span>
                            </div>
                            <div className="text-[12px] font-bold leading-tight truncate">
                              {t.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ЭКРАН ВЫБРАННОГО ЭТАПА (01 ИДЕЯ ... 07 ЗАПУСК) */}
            <ProductLabCardBody
              concept={activeConcept}
              activeTab={activeCardTab}
              canEdit={canEditActiveConcept}
              isStrategyMode={false}
              currentUser={currentUser}
              users={users}
              products={products}
              launches={launches}
              tasks={tasks}
              competitors={competitors}
              onUpdateConcept={updateConcept}
              onChangeStageWithGate={attemptStageTransition}
              onCreateLaunchFromConcept={(c) => {
                const created = createLaunch({
                  name: `Запуск R&D: ${c.name}`,
                  brandId: c.brandId,
                  collectionName: c.collectionName,
                  conceptId: c.id,
                  startDate: c.targetLaunchDate || '2027-03-01',
                  marketingBudgetRub: 450000,
                  salesPlanUnits: 2500,
                  salesPlanRub: 2500 * (c.plannedRetailPrice || 1890),
                  ownerId: c.ownerId || currentUser.id,
                });
                updateConcept(c.id, { linkedLaunchId: created.id });
                setSelectedConceptId(null);
                navigateTo('launch-calendar', { launchId: created.id });
              }}
              onCreateProductFromConcept={(cid) => {
                createProductFromConcept(cid);
              }}
              linkedScenarioModelCode={activeLinkedScenarioModel?.code || null}
              onSyncToScenarioCatalog={(c) => {
                handleSyncConceptToCatalog(c);
              }}
              onCreateTaskForConcept={(title, assigneeId, deadline) => {
                createTask({
                  title,
                  brandId: activeConcept.brandId,
                  conceptId: activeConcept.id,
                  assigneeId,
                  priority: 'High',
                  deadline,
                });
              }}
              onNavigateToSection={(sec, opts) => {
                setSelectedConceptId(null);
                navigateTo(sec, opts);
              }}
              notify={notify}
            />

            {/* НИЖНЯЯ ПАНЕЛЬ СОХРАНЕНИЯ И УДАЛЕНИЯ КАРТОЧКИ */}
            <div className="rounded-2xl bg-white border-[1.5px] border-[#CFC8BC] p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <button
                type="button"
                onClick={() => {
                  const idToRemove = activeConcept.id;
                  setSelectedConceptId(null);
                  deleteConcept(idToRemove);
                }}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-[#E8E8E5] text-[#737373] hover:text-[#DC2626] hover:border-[#DC2626] text-[13px] font-semibold transition cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Удалить карточку</span>
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    updateConcept(activeConcept.id, {
                      name: activeConcept.name,
                      whatAttracted: activeConcept.whatAttracted,
                      ideaDescription: activeConcept.ideaDescription,
                    });
                    notify(
                      'success',
                      '✓ Карточка сохранена',
                      `${activeConcept.code} · ${activeConcept.name}`
                    );
                  }}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-[#16805D] hover:bg-[#116649] text-white text-[13.5px] font-bold transition cursor-pointer shadow-xs"
                >
                  <Check className="h-4 w-4" />
                  <span>Сохранить карточку</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateConcept(activeConcept.id, {
                      name: activeConcept.name,
                      whatAttracted: activeConcept.whatAttracted,
                      ideaDescription: activeConcept.ideaDescription,
                    });
                    notify(
                      'success',
                      '✓ Карточка сохранена',
                      `${activeConcept.code} · ${activeConcept.name}`
                    );
                    setSelectedConceptId(null);
                  }}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-[#111111] hover:opacity-90 text-white text-[13.5px] font-bold transition cursor-pointer"
                >
                  <span>Сохранить и закрыть</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          МОДАЛЬНОЕ ОКНО БЫСТРОГО СОЗДАНИЯ НОВОЙ ИДЕИ ЗА 30–60 СЕКУНД (СТР. 2, 4, 5 PDF)
          Перетащить 1–20 фото сразу, вставить Cmd+V, минимум полей
      ===================================================================== */}
      {quickIdeaOpen && (
        <div
          onClick={() => setQuickIdeaOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData?.items || []);
              items.forEach((item) => {
                if (item.type.startsWith('image/')) {
                  const file = item.getAsFile();
                  if (!file) return;
                  compressImageFileToDataUrl(file, 720, 0.78).then((url) => {
                    if (url) {
                      setQuickIdeaForm((prev) => ({
                        ...prev,
                        images: [...prev.images, url],
                      }));
                      notify('success', 'Скриншот из буфера добавлен в галерею');
                    }
                  });
                }
              });
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files || []).filter((f) =>
                f.type.startsWith('image/')
              );
              Promise.all(
                files.map((file) => compressImageFileToDataUrl(file, 720, 0.78))
              ).then((urls) => {
                const valid = urls.filter(Boolean);
                if (valid.length > 0) {
                  setQuickIdeaForm((prev) => ({
                    ...prev,
                    images: [...prev.images, ...valid],
                  }));
                }
              });
            }}
            className="w-full max-w-2xl bg-white rounded-3xl border border-[#E8E8E5] p-7 md:p-8 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#E8E8E5] pb-4">
              <div>
                <h3 className="text-[24px] font-bold text-[#171717]">
                  Новая идея продукта
                </h3>
                <p className="text-[13px] text-[#737373]">
                  Минимум полей: бренд, название, ответственный, короткая суть и фотографии
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickCreateIdea(true)}
                  className="h-10 px-5 rounded-full bg-[#16805D] hover:bg-[#116649] text-white text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Check className="h-4 w-4" />
                  <span>Сохранить карточку</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuickIdeaOpen(false)}
                  className="p-2 rounded-xl border border-[#E8E8E5] text-[#737373] hover:text-[#171717] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-[#FAF6EE] border border-[#E5DEC9] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[12.5px] font-semibold text-[#4A4740]">
                Хотите добавить на доску уже созданную карточку из Каталога или Сценариев?
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuickIdeaOpen(false);
                  setAddFromCatalogOpen(true);
                }}
                className="h-8 px-3.5 rounded-xl bg-[#1D1D1F] text-white text-[12px] font-bold cursor-pointer hover:bg-[#323236] transition"
              >
                Выбрать из базы ({unifiedCatalogItems.length}) →
              </button>
            </div>

            <div className="space-y-4 text-[14px]">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Бренд
                  </label>
                  <select
                    value={quickIdeaForm.brandId}
                    onChange={(e) =>
                      setQuickIdeaForm({ ...quickIdeaForm, brandId: e.target.value })
                    }
                    className="w-full h-11 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] px-3 font-bold"
                  >
                    <option value="BORNERS">BORNERS</option>
                    <option value="NA_TELE">НА ТЕЛЕ</option>
                    <option value="FUKAI">FUKAI</option>
                    <option value="AKUSHA">AKUSHA</option>
                    <option value="LISKANI">LISKANI</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Ответственный
                  </label>
                  <select
                    value={quickIdeaForm.ownerId}
                    onChange={(e) =>
                      setQuickIdeaForm({ ...quickIdeaForm, ownerId: e.target.value })
                    }
                    className="w-full h-11 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] px-3 font-semibold"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Плановая дата запуска
                  </label>
                  <input
                    type="date"
                    value={quickIdeaForm.targetLaunchDate}
                    onChange={(e) =>
                      setQuickIdeaForm({
                        ...quickIdeaForm,
                        targetLaunchDate: e.target.value,
                      })
                    }
                    className="w-full h-11 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] px-3 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Название модели
                  </label>
                  <input
                    value={quickIdeaForm.name}
                    onChange={(e) =>
                      setQuickIdeaForm({ ...quickIdeaForm, name: e.target.value })
                    }
                    placeholder="Напр.: Бесшовная база 2.0"
                    className="w-full h-11 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] px-3.5 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Тип разработки
                  </label>
                  <select
                    value={quickIdeaForm.developmentType}
                    onChange={(e) =>
                      setQuickIdeaForm({
                        ...quickIdeaForm,
                        developmentType: e.target.value as RnDDevelopmentType,
                      })
                    }
                    className="w-full h-11 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] px-3 font-semibold"
                  >
                    {Object.entries(RND_DEVELOPMENT_TYPE_LABELS_RU).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                  Короткая суть идеи
                </label>
                <textarea
                  rows={2}
                  value={quickIdeaForm.comment}
                  onChange={(e) =>
                    setQuickIdeaForm({ ...quickIdeaForm, comment: e.target.value })
                  }
                  placeholder="Тонкий материал, мягкая посадка, почти незаметные края..."
                  className="w-full rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] p-3.5"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                  Ссылка на референс / карточку конкурента (опционально)
                </label>
                <input
                  value={quickIdeaForm.referenceLink}
                  onChange={(e) =>
                    setQuickIdeaForm({
                      ...quickIdeaForm,
                      referenceLink: e.target.value,
                    })
                  }
                  placeholder="https://www.wildberries.ru/catalog/..."
                  className="w-full h-10 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] px-3.5"
                />
              </div>

              {/* Зона загрузки 1–20 фото (ПЕРЕТАЩИТЬ / ВСТАВИТЬ Cmd+V / ВЫБРАТЬ, Стр. 4 и Сценарий №1 PDF) */}
              <div className="rounded-2xl border-2 border-dashed border-[#D5D3CE] hover:border-[#D97745] bg-[#F7F7F5]/70 p-5 space-y-3 text-center transition">
                <label className="block cursor-pointer">
                  <div className="inline-flex items-center gap-2 text-[14px] font-bold text-[#171717]">
                    <Upload className="h-4 w-4 text-[#D97745]" />
                    <span>
                      Перетащите 1–20 фото сюда, нажмите Cmd+V или выберите файлы
                    </span>
                  </div>
                  <div className="text-[12px] text-[#737373] mt-0.5">
                    Можно сразу выбрать обложку и поменять порядок миниатюр
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;
                      Promise.all(
                        files.map((f) => compressImageFileToDataUrl(f, 720, 0.78))
                      ).then((urls) => {
                        const valid = urls.filter(Boolean);
                        if (valid.length > 0) {
                          setQuickIdeaForm((prev) => ({
                            ...prev,
                            images: [...prev.images, ...valid],
                          }));
                        }
                      });
                      e.target.value = '';
                    }}
                  />
                </label>

                {quickIdeaForm.images.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                    {quickIdeaForm.images.map((img, i) => (
                      <div
                        key={i}
                        className={`relative h-20 w-20 rounded-xl overflow-hidden border-2 bg-white ${
                          i === 0 ? 'border-[#D97745]' : 'border-[#E8E8E5]'
                        }`}
                      >
                        <img
                          src={resolvePublicAssetUrl(img)}
                          alt="preview"
                          className="h-full w-full object-cover"
                        />
                        {i === 0 ? (
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-[#D97745] text-white text-[9px] font-bold">
                            Обложка
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setQuickIdeaForm((prev) => {
                                const list = [...prev.images];
                                const [picked] = list.splice(i, 1);
                                return { ...prev, images: [picked, ...list] };
                              })
                            }
                            className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-bold cursor-pointer"
                          >
                            Сделать обложкой
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setQuickIdeaForm((prev) => ({
                              ...prev,
                              images: prev.images.filter((_, idx) => idx !== i),
                            }))
                          }
                          className="absolute top-1 right-1 h-4 w-4 rounded-full bg-black/75 text-white flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Кнопки сохранения карточки внизу модального окна */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-[#E8E8E5]">
                <button
                  type="button"
                  onClick={() => setQuickIdeaOpen(false)}
                  className="h-11 px-5 rounded-xl border border-[#E8E8E5] text-[13.5px] font-semibold text-[#525252] hover:text-[#171717] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickCreateIdea(false)}
                  className="h-11 px-5 rounded-xl bg-[#16805D] hover:bg-[#116649] text-white text-[13.5px] font-bold inline-flex items-center gap-2 cursor-pointer transition shadow-2xs"
                >
                  <Check className="h-4 w-4" />
                  <span>Сохранить карточку</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickCreateIdea(true)}
                  className="h-11 px-5 rounded-xl bg-[#111111] hover:opacity-90 text-white text-[13.5px] font-bold cursor-pointer transition"
                >
                  <span>Сохранить и открыть →</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          МОДАЛЬНОЕ ОКНО: ДОБАВИТЬ КАРТОЧКУ ИЗ ЕДИНОЙ БАЗЫ (КАТАЛОГ / СЦЕНАРИИ РОСТА)
      ===================================================================== */}
      {addFromCatalogOpen && (
        <div
          onClick={() => setAddFromCatalogOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-3xl border border-[#E8E8E5] p-6 md:p-7 space-y-5 shadow-2xl my-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E8E8E5] pb-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#8B6F47]">
                  Единая база моделей (Сценарии роста · Каталог SKU · Производство)
                </div>
                <h3 className="text-[22px] font-bold text-[#171717] mt-0.5">
                  Добавить созданную карточку из базы в Лабораторию R&amp;D
                </h3>
                <p className="text-[12.5px] text-[#737373] mt-0.5">
                  Выберите любую модель, созданную в Каталоге или Сценариях роста, чтобы разместить её на доске разработки
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddFromCatalogOpen(false)}
                className="p-2 rounded-xl border border-[#E8E8E5] text-[#737373] hover:text-[#171717] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FAF8F4] border border-[#E6E0D4] rounded-2xl p-3.5">
              <span className="text-[13px] font-semibold text-[#1D1D1F]">
                На какой этап доски добавить карточку:
              </span>
              <select
                value={targetStageForImport}
                onChange={(e) =>
                  setTargetStageForImport(e.target.value as ConceptStage)
                }
                className="h-9 rounded-xl bg-white border border-[#D4CDC2] px-3 text-[13px] font-bold text-[#1D1D1F] cursor-pointer"
              >
                {SEVEN_KANBAN_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {CONCEPT_STAGE_LABELS_RU[st]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
              {unifiedCatalogItems.map((item) => (
                <div
                  key={item.key}
                  className="rounded-2xl bg-[#FAF8F4] hover:bg-white border border-[#E6E0D4] hover:border-[#1D1D1F] p-3.5 flex items-center justify-between gap-3 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-14 w-14 rounded-xl bg-white border border-[#E5DEC9] flex items-center justify-center overflow-hidden shrink-0">
                      {item.imageUrl ? (
                        <img
                          src={resolvePublicAssetUrl(item.imageUrl)}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] font-bold text-[#8B6F47] text-center px-1">
                          {formatLabBrandLabel(item.brandId)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10.5px] font-bold text-[#8B6F47]">
                        {formatLabBrandLabel(item.brandId)} · {item.code}
                      </div>
                      <div className="text-[13.5px] font-bold text-[#1D1D1F] truncate">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-[#6E6E73] truncate">
                        {item.subtitle} · {item.retailPriceRub} ₽
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleImportModelToBoard(item, targetStageForImport)
                    }
                    className="h-9 px-3.5 rounded-xl bg-[#1D1D1F] hover:bg-[#323236] text-white text-[12px] font-bold shrink-0 cursor-pointer transition"
                  >
                    + На доску
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          КОРОТКАЯ ПРОВЕРКА ПЕРЕД СМЕНОЙ ЭТАПА (СТР. 3 И СЦЕНАРИЙ №3 PDF)
          Если данных не хватает — показать перечень недостающего с возможностью заполнить или вернуться
      ===================================================================== */}
      {stageGateModal && (
        <div
          onClick={() => setStageGateModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl border border-[#E8E8E5] p-7 space-y-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#E8E8E5] pb-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#D97745]">
                  Короткая проверка перед сменой этапа
                </div>
                <h3 className="text-[20px] font-bold text-[#171717] mt-0.5">
                  Перевод в этап «{CONCEPT_STAGE_LABELS_RU[stageGateModal.targetStage]}»
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStageGateModal(null)}
                className="p-2 rounded-xl border border-[#E8E8E5] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-[#FDF3EB] border border-[#D97745]/30 p-4 space-y-1.5 text-[13px]">
              <div className="font-bold text-[#171717]">
                Чтобы перевести карточку вперёд, укажите недостающие данные:
              </div>
              {stageGateModal.missingFields.map((mf, i) => (
                <div key={i} className="text-[#171717]">
                  • {mf}
                </div>
              ))}
            </div>

            <div className="space-y-3 text-[14px]">
              {normalizeConceptStageToSeven(stageGateModal.targetStage) ===
                'ANALYSIS' && (
                <>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                      Ответственный
                    </label>
                    <select
                      value={gateFillForm.ownerId}
                      onChange={(e) =>
                        setGateFillForm({ ...gateFillForm, ownerId: e.target.value })
                      }
                      className="w-full h-10 rounded-xl border border-[#E8E8E5] px-3 bg-white font-semibold"
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                      Короткая суть идеи
                    </label>
                    <input
                      value={gateFillForm.whatAttracted}
                      onChange={(e) =>
                        setGateFillForm({
                          ...gateFillForm,
                          whatAttracted: e.target.value,
                        })
                      }
                      className="w-full h-10 rounded-xl border border-[#E8E8E5] px-3"
                    />
                  </div>
                </>
              )}

              {normalizeConceptStageToSeven(stageGateModal.targetStage) ===
                'SAMPLE' && (
                <>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                      Что берём за основу и чем лучше?
                    </label>
                    <input
                      value={gateFillForm.hypothesis}
                      onChange={(e) =>
                        setGateFillForm({ ...gateFillForm, hypothesis: e.target.value })
                      }
                      className="w-full h-10 rounded-xl border border-[#E8E8E5] px-3"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                      Какой риск проверяем на образце?
                    </label>
                    <input
                      value={gateFillForm.risks}
                      onChange={(e) =>
                        setGateFillForm({ ...gateFillForm, risks: e.target.value })
                      }
                      className="w-full h-10 rounded-xl border border-[#E8E8E5] px-3"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E8E5]">
              <button
                type="button"
                onClick={() => setStageGateModal(null)}
                className="h-10 px-4 rounded-xl border border-[#E8E8E5] text-[13px] font-semibold cursor-pointer"
              >
                Вернуться в карточку
              </button>
              <button
                type="button"
                onClick={handleConfirmStageGateModal}
                className="h-10 px-5 rounded-xl bg-[#111111] text-white text-[13px] font-bold cursor-pointer"
              >
                Заполнить и перевести →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ЗУМ-ЛАЙТБОКС ДЛЯ УВЕЛИЧЕНИЯ ЛЮБОЙ ФОТОГРАФИИ (СТР. 4 И 9 PDF) */}
      {zoomPhotoUrl && (
        <div
          onClick={() => setZoomPhotoUrl(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6 cursor-zoom-out"
        >
          <img
            src={resolvePublicAssetUrl(zoomPhotoUrl)}
            alt="Увеличенное фото"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain bg-white p-4"
          />
        </div>
      )}

      {/* МОДАЛЬНЫЙ КОНСТРУКТОР PDF С ВЫБОРОМ ВАЛЮТЫ (CNY/USD/RUB), ФОТО Спереди/Сзади И КРУПНЫМ КИТАЙСКИМ */}
      {pdfConstructorOpen && activeConcept && (
        <PdfConstructorModal
          concept={activeConcept}
          onClose={() => setPdfConstructorOpen(false)}
          onSaveToConcept={(patch) => {
            updateConcept(activeConcept.id, patch);
            notify('success', 'PDF-спецификация выгружена, параметры сохранены в карточку');
          }}
        />
      )}
    </div>
  );
}
