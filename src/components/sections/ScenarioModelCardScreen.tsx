'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MoreHorizontal,
  Upload,
  FileText,
  Download,
  ExternalLink,
  Eye,
  Plus,
  X,
  BarChart3,
  Table as TableIcon,
  History,
  Star,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  AttachedModelPdf,
  GrowthScenarioDef,
  MONTHS_SHORT_RU,
  ModelPassportStageStatus,
  ScenarioModelSpec,
  computeModelScenarioMetrics,
  resolvePublicAssetUrl,
} from '@/lib/scenarioData';
import { getActingSkuByWbOrVendor } from '@/lib/actingAssortment2027';
import {
  LISKANI_2027_SCENARIO_ID,
  updateLiskaniModelSizeVariant,
  type LiskaniSizeVariantPatch,
} from '@/lib/liskaniAssortment2027';
import {
  VALUE_STATUS_LABELS_RU,
  applyCategoryWbUnitEconomics,
  changeModelBrandWithAudit,
  computeFinancialPnL,
  computeProcurementPlan,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  getBrandUnitConfig,
  getCategoryWbNormsForBrand,
  getEffectiveModelBuyoutRatePct,
  getModelChannelSplit,
  importStructuredScenarioPlan,
  isModelProcurementByOrdersActive,
  isScenarioCompatibleWithBrand,
  normalizePortfolioBrandCode,
  parseStructuredPlanCsvOrJson,
  serializeStructuredPlanToCsv,
  toggleModelProcurementByOrders,
  updateModelBuyoutRatePct,
  updateModelScenarioMonthBuyouts,
  updateModelScenarioMonthOrders,
  updateModelScenarioPrice,
  updateModelScenarioSingleMonthPrice,
  updateModelUnitCostWithVariants,
  type ModelAuditEntry,
  type ModelScalingStage,
  type ValueStatusCode,
} from '@/lib/unifiedBusinessEngine';
import { getBrandProductionProfile } from '@/lib/brandProductionConfig';
import {
  canUserEditBrand,
  canUserViewCostPrice,
  canUserViewFinance,
} from '@/lib/finance';
import { usePlatform } from '@/context/PlatformContext';
import { FullscreenPhotoLightbox } from '@/components/sections/FullscreenPhotoLightbox';
import { SkuProcurementMvpWorkbench } from '@/components/sections/SkuProcurementMvpWorkbench';
import { compressImageFileToDataUrl } from '@/lib/document-export';
import {
  savePdfBlobToIdb,
  loadPdfBlobUrlFromIdb,
  deletePdfBlobFromIdb,
  saveModelGalleryToIdb,
} from '@/lib/safeStorage';

interface ScenarioModelCardScreenProps {
  model: ScenarioModelSpec;
  scenario: GrowthScenarioDef;
  allScenarios?: GrowthScenarioDef[];
  onSelectScenario?: (scenarioId: number) => void;
  onBackToScenarios: () => void;
  onOpenSalesPlan: () => void;
  onUpdateModel: (updated: ScenarioModelSpec) => void;
  onDuplicateModel?: (model: ScenarioModelSpec) => void;
  onDeleteOrArchiveModel?: (model: ScenarioModelSpec) => void;
  onOpenPdfModal: () => void;
  notify: (type: 'success' | 'warning' | 'error', title: string, desc?: string) => void;
}

const STAGE_STATUS_OPTIONS: ModelPassportStageStatus[] = [
  'Идея',
  'В разработке',
  'Тест',
  'Масштабирование',
  'Действующий',
  'Приостановлен',
];

const DEFAULT_BRAND_OPTIONS = ['BORNERS', 'НА ТЕЛЕ', 'FUKAI', 'AKUSHA', 'LISKANI'];

function StatusPill({ status }: { status: ValueStatusCode }) {
  const styles: Record<ValueStatusCode, string> = {
    fact: 'bg-[#EAF6F0] text-[#157347] border-[#CBEAD9]',
    approved: 'bg-[#F1F1EE] text-[#141413] border-[#E5E4DF]',
    plan: 'bg-[#F6F6F4] text-[#52524E] border-[#E5E4DF]',
    hypothesis: 'bg-[#F6F6F4] text-[#686762] border-[#E5E4DF]',
    not_filled: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${styles[status]}`}
    >
      {VALUE_STATUS_LABELS_RU[status]}
    </span>
  );
}

function formatRub(val: number): string {
  return `${Math.round(val).toLocaleString('ru-RU')} ₽`;
}

function formatMln(valRub: number): string {
  return `${(valRub / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
}

function normalizeAssetUrl(url?: string): string {
  return resolvePublicAssetUrl(url);
}

function deriveModelStageStatus(model: ScenarioModelSpec): ModelPassportStageStatus {
  if (model.modelStageStatus) return model.modelStageStatus;
  const acting = getActingSkuByWbOrVendor(model.code, model.title);
  if (acting) return 'Действующий';
  const sc = model.sharedSupplyAndFact?.scalingStage;
  if (sc === 'hypothesis') return 'Идея';
  if (sc === 'test') return 'Тест';
  if (model.launchStatus === 'В разработке') return 'В разработке';
  if (model.launchStatus === 'В архиве') return 'Приостановлен';
  return 'Масштабирование';
}

function mapStageStatusToScalingStage(
  stageStatus: ModelPassportStageStatus
): ModelScalingStage {
  if (stageStatus === 'Идея' || stageStatus === 'В разработке') return 'hypothesis';
  if (stageStatus === 'Тест') return 'test';
  return 'scaling';
}

export function ScenarioModelCardScreen({
  model: rawModel,
  scenario,
  allScenarios = [],
  onSelectScenario,
  onBackToScenarios,
  onOpenSalesPlan,
  onUpdateModel,
  onDuplicateModel,
  onDeleteOrArchiveModel,
  onOpenPdfModal,
  notify,
}: ScenarioModelCardScreenProps) {
  const { currentUser } = usePlatform();
  const model = useMemo(() => ensureModelUnifiedV11(rawModel), [rawModel]);
  const shared = model.sharedSupplyAndFact!;
  const unitCfg = useMemo(() => getBrandUnitConfig(model), [model]);
  const primaryUnitShort = model.primaryUnitLabel || unitCfg.primaryUnit || 'компл.';
  const secondaryUnitShort = model.secondaryUnitLabel || unitCfg.secondaryUnit || 'изд.';
  const hasDistinctSecondary = !(
    model.unitsInPack === 1 && primaryUnitShort === secondaryUnitShort
  );
  const modelBrandCode = useMemo(
    () =>
      normalizePortfolioBrandCode(
        detectModelBrandPortfolioLabel(model) || model.brandId || 'BORNERS'
      ),
    [model]
  );
  const prodProfile = useMemo(
    () =>
      getBrandProductionProfile(
        detectModelBrandPortfolioLabel(model) || model.brandId,
        `${model.title || ''} ${model.categoryLabel || ''} ${model.construction?.fit || ''} ${model.waistband?.width || ''}`
      ),
    [model]
  );
  const hasCost = canUserViewCostPrice(currentUser);
  const hasFinance = canUserViewFinance(currentUser);
  const canEdit = canUserEditBrand(
    currentUser,
    modelBrandCode === 'ALL' ? 'BORNERS' : modelBrandCode
  );
  const auditAuthor = currentUser?.fullName || 'Владелец';
  const fpShares = shared.factoryParams.sizeSharesPct;
  const isGenericSizeShares =
    (fpShares.S === 10 &&
      fpShares.M === 25 &&
      fpShares.L === 35 &&
      fpShares.XL === 20 &&
      fpShares.XXL === 10) ||
    (fpShares.S === 12 &&
      fpShares.M === 26 &&
      fpShares.L === 30 &&
      fpShares.XL === 20 &&
      fpShares.XXL === 12);

  // Четыре вкладки без технических номеров (Стр. 2 ТЗ): «Продукт» / «Продажи» / «Закупки» / «Финансы»
  const [activeTab, setActiveTab] = useState<
    'product' | 'sales' | 'procurement' | 'finance'
  >(() => {
    if (typeof window !== 'undefined') {
      try {
        const requestedTab = window.sessionStorage.getItem(
          'borners_open_scenario_model_tab'
        );
        if (
          requestedTab === 'product' ||
          requestedTab === 'sales' ||
          requestedTab === 'procurement' ||
          requestedTab === 'finance'
        ) {
          window.sessionStorage.removeItem('borners_open_scenario_model_tab');
          return requestedTab;
        }
        const savedTab = window.localStorage.getItem(
          'borners_model_card_active_tab_v1'
        );
        if (
          savedTab === 'product' ||
          savedTab === 'sales' ||
          savedTab === 'procurement' ||
          savedTab === 'finance'
        ) {
          return savedTab;
        }
      } catch {
        // ignore
      }
    }
    return 'product';
  });

  useEffect(() => {
    if (!hasFinance && activeTab === 'finance') {
      setActiveTab('product');
    }
  }, [hasFinance, activeTab]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('borners_model_card_active_tab_v1', activeTab);
      } catch {
        // ignore
      }
    }
  }, [activeTab]);

  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(
    scenario.targetMonthIdx ?? 11
  );
  const [salesViewMode, setSalesViewMode] = useState<'table' | 'chart'>('table');
  const [showSalesExtraTools, setShowSalesExtraTools] = useState<boolean>(false);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string>(
    () => model.gallery.find((g) => g.isMain)?.id || model.gallery[0]?.id || 'g-1'
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [savedBannerText, setSavedBannerText] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Создание нового бренда в форме редактирования (Стр. 3 ТЗ)
  const [creatingBrandOpen, setCreatingBrandOpen] = useState(false);
  const [newBrandDraft, setNewBrandDraft] = useState('');

  // Состояния вкладки «Финансы» (Стр. 5 и 6 ТЗ)
  const [financePeriodMode, setFinancePeriodMode] = useState<'month' | 'year'>('year');
  const [showDetailedFinanceCalc, setShowDetailedFinanceCalc] = useState(false);
  const [showProcurementCashDetails, setShowProcurementCashDetails] = useState(false);
  const [liskaniSizeMonthFilter, setLiskaniSizeMonthFilter] = useState<'ALL' | number>('ALL');

  const [pdfUrlsById, setPdfUrlsById] = useState<Record<string, string>>({});
  const [previewPdfId, setPreviewPdfId] = useState<string | null>(null);

  const importPlanInputRef = useRef<HTMLInputElement | null>(null);
  const tabsAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedGalleryId(
      model.gallery.find((g) => g.isMain)?.id || model.gallery[0]?.id || 'g-1'
    );
    setHasUnsavedDraft(false);
    if (typeof window !== 'undefined') {
      try {
        const requestedTab = window.sessionStorage.getItem(
          'borners_open_scenario_model_tab'
        );
        if (
          requestedTab === 'product' ||
          requestedTab === 'sales' ||
          requestedTab === 'procurement' ||
          requestedTab === 'finance'
        ) {
          window.sessionStorage.removeItem('borners_open_scenario_model_tab');
          setActiveTab(requestedTab);
        }
      } catch {
        // ignore
      }
    }
  }, [model.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    async function hydratePdfs() {
      const list = model.attachedPdfs || [];
      const nextMap: Record<string, string> = {};
      for (const item of list) {
        if (item.staticUrl) {
          nextMap[item.id] = resolvePublicAssetUrl(item.staticUrl);
        } else {
          const blobUrl = await loadPdfBlobUrlFromIdb(item.id);
          if (blobUrl) nextMap[item.id] = blobUrl;
        }
      }
      if (!cancelled) {
        setPdfUrlsById(nextMap);
        if (list.length > 0 && !previewPdfId) {
          setPreviewPdfId(list[0].id);
        }
      }
    }
    hydratePdfs();
    return () => {
      cancelled = true;
    };
  }, [model.id, model.attachedPdfs, previewPdfId]);

  const baseMetrics = useMemo(
    () => computeModelScenarioMetrics(model, scenario),
    [model, scenario]
  );
  const procurement = useMemo(
    () => computeProcurementPlan(model, scenario),
    [model, scenario]
  );
  const pnl = useMemo(
    () => computeFinancialPnL(model, scenario, procurement),
    [model, scenario, procurement]
  );

  const plan = baseMetrics.plan;
  const channelSplit = getModelChannelSplit(model, scenario.id);
  const brandPortfolioLabel = detectModelBrandPortfolioLabel(model);
  const currentStageStatus = deriveModelStageStatus(model);
  const actingSkuRef = useMemo(
    () => getActingSkuByWbOrVendor(model.code, model.title),
    [model.code, model.title]
  );
  const effectiveWbArticle =
    model.wbArticle !== undefined
      ? model.wbArticle
      : actingSkuRef?.wbSku || '';

  const canCreateNewBrand = canUserEditBrand(currentUser, 'BORNERS');

  const availableBrandOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_BRAND_OPTIONS);
    if (model.customBrandLabel && model.customBrandLabel.trim()) {
      set.add(model.customBrandLabel.trim());
    }
    for (const b of shared.customBrandOptions || []) {
      if (b && b.trim()) set.add(b.trim());
    }
    if (brandPortfolioLabel && brandPortfolioLabel !== 'Подтвердить бренд') {
      set.add(brandPortfolioLabel);
    }
    return Array.from(set).filter((opt) => {
      if (opt === brandPortfolioLabel) return true;
      const norm = normalizePortfolioBrandCode(opt);
      return canUserEditBrand(currentUser, norm === 'ALL' ? 'BORNERS' : norm);
    });
  }, [model.customBrandLabel, shared.customBrandOptions, brandPortfolioLabel, currentUser]);

  const filteredGallery = useMemo(
    () => model.gallery.filter((g) => Boolean(g.url || g.originalUrl)),
    [model.gallery]
  );

  const activeGalleryItem =
    filteredGallery.find((g) => g.id === selectedGalleryId) ||
    model.gallery.find((g) => g.isMain && (g.url || g.originalUrl)) ||
    filteredGallery[0] ||
    model.gallery[0];

  const mainImageSrc = normalizeAssetUrl(
    activeGalleryItem?.url ||
      activeGalleryItem?.originalUrl ||
      model.palettes[0]?.imageUrl ||
      ''
  );

  const triggerSavedFeedback = (text = 'Изменения сохранены') => {
    const time = new Date().toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setSavedBannerText(`✓ ${text} (${time})`);
  };

  // Запись изменений в единую модель + журнал аудита
  const commitWithAudit = (
    nextModel: ScenarioModelSpec,
    category: ModelAuditEntry['category'],
    summary: string,
    beforeValue?: string,
    afterValue?: string,
    bumpPassport = false
  ) => {
    if (!canEdit) return;
    const baseS = ensureModelUnifiedV11(nextModel).sharedSupplyAndFact!;
    const nextPassportVer = bumpPassport
      ? baseS.passportVersion + 1
      : baseS.passportVersion;
    const entry: ModelAuditEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
      author: auditAuthor,
      category,
      summary,
      beforeValue,
      afterValue,
      passportVersion: nextPassportVer,
    };

    onUpdateModel({
      ...nextModel,
      sharedSupplyAndFact: {
        ...baseS,
        passportVersion: nextPassportVer,
        auditHistory: [entry, ...baseS.auditHistory].slice(0, 50),
      },
    });
    triggerSavedFeedback('Изменения сохранены');
  };

  const handleBackClick = () => {
    if (
      hasUnsavedDraft &&
      typeof window !== 'undefined' &&
      !window.confirm(
        'В форме есть незавершённые изменения. Выйти из режима редактирования и вернуться к списку моделей?'
      )
    ) {
      return;
    }
    onBackToScenarios();
  };

  const handleSaveButtonClick = () => {
    if (!canEdit) return;
    setIsEditing(false);
    setHasUnsavedDraft(false);
    setCreatingBrandOpen(false);
    triggerSavedFeedback('Изменения сохранены в паспорте модели');
    notify(
      'success',
      'Изменения сохранены',
      `Паспорт модели ${model.code} (${brandPortfolioLabel}) сохранён для всех сценариев.`
    );
  };

  // Смена бренда модели (BORNERS / FUKAI / AKUSHA / LISCANI / НА ТЕЛЕ / свой бренд, Раздел 4.2 ТЗ)
  const handleBrandSelectChange = (nextBrandLabel: string) => {
    if (!canEdit) return;
    if (nextBrandLabel === '__CREATE_NEW__') {
      if (!canCreateNewBrand) return;
      setCreatingBrandOpen(true);
      return;
    }
    const clean = nextBrandLabel.trim();
    if (!clean || clean === brandPortfolioLabel) return;
    const targetNorm = normalizePortfolioBrandCode(clean);
    if (!canUserEditBrand(currentUser, targetNorm === 'ALL' ? 'BORNERS' : targetNorm)) {
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Перенести товар «${model.title}» (${model.code}) из бренда «${brandPortfolioLabel}» в каталог бренда «${clean}»? Вся история изменений и документы карточки будут сохранены.`
      )
    ) {
      return;
    }
    const switched = changeModelBrandWithAudit(model, clean, auditAuthor);
    onUpdateModel(switched);
    setHasUnsavedDraft(false);
    triggerSavedFeedback(`Бренд изменён на «${detectModelBrandPortfolioLabel(switched)}»`);
  };

  const handleCreateCustomBrand = () => {
    if (!canEdit || !canCreateNewBrand) return;
    const clean = newBrandDraft.trim();
    if (!clean) return;
    const nextCustomList = Array.from(
      new Set([...(shared.customBrandOptions || []), clean])
    );
    const switched = changeModelBrandWithAudit(model, clean, auditAuthor);
    onUpdateModel({
      ...switched,
      sharedSupplyAndFact: {
        ...switched.sharedSupplyAndFact!,
        customBrandOptions: nextCustomList,
      },
    });
    setHasUnsavedDraft(false);
    triggerSavedFeedback(`Создан и назначен бренд «${clean}»`);
    setNewBrandDraft('');
    setCreatingBrandOpen(false);
  };

  // Смена статуса жизненного цикла модели (Стр. 3 ТЗ)
  const handleStageStatusChange = (nextStatus: ModelPassportStageStatus) => {
    if (!canEdit) return;
    const nextScaling = mapStageStatusToScalingStage(nextStatus);
    const nextLaunchStatus: ScenarioModelSpec['launchStatus'] =
      nextStatus === 'Приостановлен'
        ? 'В архиве'
        : nextStatus === 'Действующий' || nextStatus === 'Масштабирование'
        ? 'Утверждено'
        : nextStatus === 'В разработке' || nextStatus === 'Тест'
        ? 'В разработке'
        : 'В плане';

    commitWithAudit(
      {
        ...model,
        modelStageStatus: nextStatus,
        launchStatus: nextLaunchStatus,
        sharedSupplyAndFact: {
          ...shared,
          scalingStage: nextScaling,
        },
      },
      'product',
      'Изменён статус модели',
      currentStageStatus,
      nextStatus,
      true
    );
  };

  // Смена количества изделий в комплекте с подтверждением (Стр. 3 ТЗ)
  const handleUnitsInPackChange = (nextUnitsRaw: number) => {
    if (!canEdit) return;
    const clean = Math.max(1, Math.min(24, Math.round(nextUnitsRaw || 1)));
    if (clean === model.unitsInPack) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Изменить комплектацию с ${model.unitsInPack} на ${clean} ${secondaryUnitShort} в 1 ${primaryUnitShort}? Это пересчитает физические единицы в продажах и закупках.`
      )
    ) {
      return;
    }
    commitWithAudit(
      {
        ...model,
        unitsInPack: clean,
      },
      'product',
      'Изменено количество единиц в комплекте',
      `${model.unitsInPack} шт.`,
      `${clean} шт.`,
      true
    );
  };

  // Загрузка одной или нескольких фотографий сразу с надёжным сжатием для localStorage (Стр. 3 ТЗ)
  const handleUploadOriginalPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    try {
      const cleanExisting = model.gallery.filter((g) => {
        const u = (g.url || g.originalUrl || '').trim();
        if (!u) return false;
        if (
          model.code !== '244995893' &&
          (u.includes('borners-core-modal.svg') || u.includes('244995893_main.webp'))
        ) {
          return false;
        }
        return true;
      });

      const addedItems: ScenarioModelSpec['gallery'] = [];
      let existingHasMain = cleanExisting.some(
        (g) => g.isMain && Boolean(g.url || g.originalUrl)
      );

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedUrl = await compressImageFileToDataUrl(file, 760, 0.76);
        if (!compressedUrl) continue;

        const newItemId = `gal-${Date.now()}-${i}`;
        const makeMain = !existingHasMain && i === 0;
        if (makeMain) existingHasMain = true;

        addedItems.push({
          id: newItemId,
          category: 'pack' as const,
          label: file.name.replace(/\.[^.]+$/, ''),
          url: compressedUrl,
          originalUrl: '',
          isMain: makeMain,
        });
      }

      if (addedItems.length === 0) {
        notify('error', 'Не удалось обработать выбранный файл изображения');
        e.target.value = '';
        return;
      }

      const nextGallery = [
        ...cleanExisting.map((g) => ({
          ...g,
          originalUrl:
            typeof g.originalUrl === 'string' && g.originalUrl.startsWith('data:image/')
              ? ''
              : g.originalUrl,
        })),
        ...addedItems,
      ];
      void saveModelGalleryToIdb(model.id, nextGallery);
      commitWithAudit(
        { ...model, gallery: nextGallery },
        'product',
        addedItems.length === 1
          ? `Добавлено фото «${files[0].name}»`
          : `Добавлено фотографий: ${addedItems.length} шт.`,
        undefined,
        files.map((f) => f.name).join(', '),
        true
      );
      if (addedItems[0]) {
        setSelectedGalleryId(addedItems[0].id);
      }
      notify(
        'success',
        addedItems.length === 1
          ? 'Фотография загружена и сохранена'
          : `Загружено фотографий: ${addedItems.length} шт.`,
        'Изображение сохранено в карточке модели.'
      );
    } catch {
      notify('error', 'Не удалось прочитать файл изображения');
    }
    e.target.value = '';
  };

  // Сделать выбранное фото главным (Стр. 3 ТЗ)
  const handleSetMainGalleryPhoto = (photoId: string) => {
    if (!canEdit) return;
    const target = model.gallery.find((g) => g.id === photoId);
    if (!target) return;
    const reordered = [
      { ...target, isMain: true },
      ...model.gallery
        .filter((g) => g.id !== photoId)
        .map((g) => ({ ...g, isMain: false })),
    ];
    setSelectedGalleryId(photoId);
    void saveModelGalleryToIdb(model.id, reordered);
    commitWithAudit(
      { ...model, gallery: reordered },
      'product',
      `Назначено главное фото модели (${target.label || photoId})`,
      undefined,
      target.label || photoId,
      true
    );
  };

  // Перестановка миниатюр местами (Стр. 3 ТЗ)
  const handleMoveGalleryPhoto = (photoId: string, direction: -1 | 1) => {
    if (!canEdit) return;
    const idx = filteredGallery.findIndex((g) => g.id === photoId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= filteredGallery.length) return;
    const nextList = [...filteredGallery];
    const [moved] = nextList.splice(idx, 1);
    nextList.splice(targetIdx, 0, moved);
    const normalized = nextList.map((item, i) => ({
      ...item,
      isMain: i === 0,
    }));
    void saveModelGalleryToIdb(model.id, normalized);
    commitWithAudit(
      { ...model, gallery: normalized },
      'product',
      'Изменён порядок фотографий в галерее'
    );
  };

  // Удаление фото (разрешено в том числе когда фотография одна в карточке)
  const handleRemoveGalleryPhoto = (photoId?: string) => {
    if (!canEdit) return;
    const targetId = photoId || activeGalleryItem?.id;
    const remaining = targetId
      ? model.gallery.filter(
          (g) => g.id !== targetId && Boolean((g.url || g.originalUrl || '').trim())
        )
      : [];
    const hasMain = remaining.some((g) => g.isMain);
    const nextGallery = remaining.map((g, idx) => ({
      ...g,
      isMain: hasMain ? g.isMain : idx === 0,
    }));
    const nextPalettes =
      nextGallery.length === 0
        ? model.palettes.map((p) => ({ ...p, imageUrl: undefined }))
        : model.palettes;
    const nextSel =
      nextGallery.find((g) => Boolean(g.url || g.originalUrl))?.id || '';
    setSelectedGalleryId(nextSel);
    void saveModelGalleryToIdb(model.id, nextGallery);
    commitWithAudit(
      { ...model, gallery: nextGallery, palettes: nextPalettes },
      'product',
      'Удалена фотография из галереи модели'
    );
    notify('success', 'Фотография удалена из карточки');
  };

  // Загрузка фабричного PDF
  const handleUploadFactoryPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const pdfId = `pdf-u-${Date.now()}`;
    await savePdfBlobToIdb(pdfId, file);
    const nextPdf: AttachedModelPdf = {
      id: pdfId,
      name: file.name,
      sizeBytes: file.size,
      uploadedAt: new Date().toLocaleDateString('ru-RU'),
    };
    commitWithAudit(
      {
        ...model,
        attachedPdfs: [...(model.attachedPdfs || []), nextPdf],
      },
      'product',
      `Прикреплён фабричный PDF «${file.name}»`,
      undefined,
      file.name,
      true
    );
    setPreviewPdfId(pdfId);
    notify('success', `Файл ${file.name} прикреплён к паспорту модели`);
    e.target.value = '';
  };

  const handleRemovePdf = async (pdfId: string) => {
    if (!canEdit) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Удалить прикреплённый PDF-файл из карточки?')
    ) {
      return;
    }
    await deletePdfBlobFromIdb(pdfId);
    const nextList = (model.attachedPdfs || []).filter((p) => p.id !== pdfId);
    commitWithAudit(
      { ...model, attachedPdfs: nextList },
      'product',
      'Удалён прикреплённый PDF из карточки'
    );
    if (previewPdfId === pdfId) {
      setPreviewPdfId(nextList[0]?.id || null);
    }
  };

  // Обновление цены в текущем сценарии
  const handleScenarioPriceChange = (nextPriceRub: number) => {
    if (!canEdit) return;
    const clean = Math.max(0, Math.round(nextPriceRub));
    const prevPrice = plan.monthlyPricesRub[selectedMonthIdx] ?? model.retailPriceRub;
    const updatedModel = updateModelScenarioPrice(model, scenario.id, clean);
    commitWithAudit(
      updatedModel,
      'sales',
      `Изменена цена (${primaryUnitShort}) в ${scenario.title}`,
      `${prevPrice} ₽`,
      `${clean} ₽`
    );
  };

  // Обновление закупочной себестоимости
  const handleUnitCostChange = (nextCostRub: number) => {
    if (!canEdit || !hasCost) return;
    const clean = Math.max(0, Math.round(nextCostRub));
    const prev = model.unitCostRub;
    const updatedModel = updateModelUnitCostWithVariants(model, clean);
    commitWithAudit(
      updatedModel,
      'finance',
      `Изменена закупочная себестоимость (${primaryUnitShort}, выкупы неизменны)`,
      `${prev} ₽`,
      clean > 0 ? `${clean} ₽` : 'Не заполнено'
    );
  };

  // Обновление плановых выкупов конкретного месяца
  const handleMonthBuyoutsChange = (monthIdx: number, nextPacks: number) => {
    if (!canEdit) return;
    const clean = Math.max(0, Math.round(nextPacks));
    const prev = plan.monthlyPacks[monthIdx] || 0;
    const updatedModel = updateModelScenarioMonthBuyouts(
      model,
      scenario.id,
      monthIdx,
      clean
    );
    commitWithAudit(
      updatedModel,
      'sales',
      `Изменён план выкупов за ${MONTHS_SHORT_RU[monthIdx]} (${scenario.title})`,
      `${prev} ${primaryUnitShort}`,
      `${clean} ${primaryUnitShort}`
    );
  };

  // Обновление плановых заказов (до выкупа) конкретного месяца — автоматически пересчитывает выкупы по текущему % выкупа
  const handleMonthOrdersChange = (monthIdx: number, nextOrdersPacks: number) => {
    if (!canEdit) return;
    const cleanOrders = Math.max(0, Math.round(nextOrdersPacks));
    const effBuyoutPct = getEffectiveModelBuyoutRatePct(model, scenario.id);
    const prevOrders = baseMetrics.monthlyOrdersPacks[monthIdx] || 0;
    const updatedModel = updateModelScenarioMonthOrders(
      model,
      scenario.id,
      monthIdx,
      cleanOrders
    );
    const nextBuyouts =
      updatedModel.plansByScenario[scenario.id]?.monthlyPacks?.[monthIdx] ?? 0;
    commitWithAudit(
      updatedModel,
      'sales',
      `Изменён план заказов за ${MONTHS_SHORT_RU[monthIdx]} (при ${effBuyoutPct}% выкупа → ${nextBuyouts} выкупов)`,
      `${prevOrders} зак.`,
      `${cleanOrders} зак.`
    );
  };

  // Изменение процента выкупа модели (% выкупа)
  const handleBuyoutRateChange = (nextPct: number) => {
    if (!canEdit) return;
    const updated = updateModelBuyoutRatePct(model, nextPct, {
      scenarioId: scenario.id,
      syncProcurementToOrders: true,
    });
    onUpdateModel(updated);
  };

  // Переключение учёта % выкупа в закупках
  const handleToggleProcurementByOrders = (enabled: boolean) => {
    if (!canEdit) return;
    const updated = toggleModelProcurementByOrders(model, enabled);
    onUpdateModel(updated);
    notify(
      'success',
      enabled
        ? `Закупки рассчитываются под объём заказов (${baseMetrics.buyoutRatePct}% выкупа · ×${baseMetrics.orderMultiplier.toFixed(2).replace('.', ',')})`
        : 'Закупки переключены на чистый объём выкупов (×1,00)'
    );
  };

  // Редактирование параметров конкретного размера внутри карточки LISKANI (269 SKU)
  const handleUpdateLiskaniSizeVariant = (
    skuIndex: number,
    patch: LiskaniSizeVariantPatch
  ) => {
    if (!canEdit) return;
    if (patch.unitCostRub !== undefined && !hasCost) return;
    if (!model.liskaniSizeVariants) return;
    const updatedModel = updateLiskaniModelSizeVariant(
      model,
      skuIndex,
      patch,
      scenario.id
    );
    commitWithAudit(
      updatedModel,
      'product',
      `Обновлён размерный SKU №${skuIndex} в матрице LISKANI`,
      undefined,
      `SKU #${skuIndex}`,
      true
    );
  };

  // Обновление фактических продаж месяца
  const handleMonthActualSaleChange = (
    monthIdx: number,
    actualPacksRaw: string,
    actualPriceRaw?: string
  ) => {
    if (!canEdit) return;
    const currentAct = shared.actualSalesByMonth[monthIdx] || {
      monthIdx,
      actualBuyoutsPacks: null,
      actualPriceRub: null,
    };
    const nextActualPacks =
      actualPacksRaw.trim() === ''
        ? null
        : Math.max(0, Math.round(Number(actualPacksRaw)));
    const nextActualPrice =
      actualPriceRaw === undefined
        ? currentAct.actualPriceRub
        : actualPriceRaw.trim() === ''
        ? null
        : Math.max(0, Math.round(Number(actualPriceRaw)));

    const nextActuals = shared.actualSalesByMonth.map((r, idx) =>
      idx === monthIdx
        ? {
            monthIdx: idx,
            actualBuyoutsPacks: nextActualPacks,
            actualPriceRub: nextActualPrice,
          }
        : r
    );

    commitWithAudit(
      {
        ...model,
        sharedSupplyAndFact: {
          ...shared,
          actualSalesByMonth: nextActuals,
        },
      },
      'sales',
      `Обновлён факт продаж за ${MONTHS_SHORT_RU[monthIdx]}`,
      currentAct.actualBuyoutsPacks === null
        ? 'Не заполнено'
        : `${currentAct.actualBuyoutsPacks} ${primaryUnitShort}`,
      nextActualPacks === null ? 'Не заполнено' : `${nextActualPacks} ${primaryUnitShort}`
    );
  };

  // Экспорт плана текущего SKU (CSV или JSON)
  const handleExportSkuPlan = (format: 'csv' | 'json') => {
    if (!hasFinance) return;
    const rows = exportStructuredScenarioPlan([model], scenario);
    const content =
      format === 'csv'
        ? serializeStructuredPlanToCsv(rows)
        : JSON.stringify(rows, null, 2);
    const blob = new Blob([content], {
      type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.code.replace(/\s+/g, '_')}_plan_${scenario.id}.${format}`;
    if (document.body) {
      document.body.appendChild(a);
    }
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    notify(
      'success',
      `План ${model.code} экспортирован в ${format.toUpperCase()}`,
      'Сохранены идентификатор SKU, периоды, цены, выкупы и статусы значений.'
    );
  };

  // Импорт плана из JSON / CSV
  const handleImportSkuPlanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsedRows = parseStructuredPlanCsvOrJson(text, scenario.id);

      const res = importStructuredScenarioPlan([model], parsedRows, scenario.id);
      if (res.importedRowsCount > 0 && res.updatedModels[0]) {
        commitWithAudit(
          res.updatedModels[0],
          'sales',
          `Импортирован план из файла ${file.name} (${res.importedRowsCount} мес.)`
        );
        notify(
          'success',
          `Импортировано ${res.importedRowsCount} периодов по ${model.code}`
        );
      } else {
        notify('warning', `В файле не найдено строк для артикула ${model.code}`);
      }
    } catch {
      notify('error', 'Ошибка чтения файла плана (поддерживаются JSON и CSV)');
    }
    e.target.value = '';
  };

  // Выбранный месяц для первого экрана карточки и переключателя «Месяц / Год» во вкладке «Финансы»
  const selMonthAct = shared.actualSalesByMonth[selectedMonthIdx];
  const selMonthPacks =
    selMonthAct && selMonthAct.actualBuyoutsPacks !== null
      ? selMonthAct.actualBuyoutsPacks
      : plan.monthlyPacks[selectedMonthIdx] || 0;
  const selMonthUnits = selMonthPacks * model.unitsInPack;
  const selMonthPrice =
    selMonthAct && selMonthAct.actualPriceRub !== null
      ? selMonthAct.actualPriceRub
      : plan.monthlyPricesRub[selectedMonthIdx] ?? model.retailPriceRub;
  const selMonthRevRub =
    selMonthAct && selMonthAct.actualBuyoutsPacks !== null
      ? selMonthPacks * selMonthPrice
      : baseMetrics.monthlyRevenuesRub[selectedMonthIdx] || 0;
  const selMonthStatus: ValueStatusCode =
    selMonthAct && selMonthAct.actualBuyoutsPacks !== null
      ? 'fact'
      : pnl.revenueStatus;

  const maxSalesBarRub = Math.max(1, ...baseMetrics.monthlyRevenuesRub);
  const maxSalesBarPacks = Math.max(1, ...plan.monthlyPacks);

  // Расчёт показателей для Блока Б («Результат за выбранный период: Месяц / Год», Стр. 5 ТЗ)
  const periodPacks =
    financePeriodMode === 'month' ? selMonthPacks : pnl.annualBuyoutsPacks;
  const periodRevenueRub =
    financePeriodMode === 'month' ? selMonthRevRub : pnl.annualRevenueRub;
  const periodCogsRub =
    pnl.unitCostPerPackRub !== null ? periodPacks * pnl.unitCostPerPackRub : null;

  const unitSalesAndWorkExpenseRub =
    pnl.logisticsFilled && pnl.unitMpCommissionRub !== null
      ? (pnl.unitMpCommissionRub || 0) +
        (pnl.unitLogisticsRub || 0) +
        (pnl.unitAdsRub || 0) +
        (pnl.unitOtherVarRub || 0) +
        (pnl.unitAllocatedOpexRub || 0)
      : null;

  const periodSalesAndWorkExpenseRub =
    unitSalesAndWorkExpenseRub !== null
      ? periodPacks * unitSalesAndWorkExpenseRub
      : null;

  const periodOperatingProfitRub =
    pnl.unitOperatingProfitRub !== null
      ? periodPacks * pnl.unitOperatingProfitRub
      : null;

  const openProcurementTab = () => {
    setActiveTab('procurement');
    if (tabsAnchorRef.current) {
      tabsAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-4">
      {/* ПОЛНОЭКРАННАЯ ГАЛЕРЕЯ С ZOOM / PAN / 100% / ПО РАЗМЕРУ ЭКРАНА / ОТКРЫТЬ ОРИГИНАЛ (Стр. 3 ТЗ) */}
      <FullscreenPhotoLightbox
        open={lightboxOpen}
        items={
          filteredGallery.length > 0
            ? filteredGallery
            : [
                {
                  id: 'fallback-main',
                  category: 'pack',
                  label: `${model.code} · ${model.title}`,
                  url: mainImageSrc,
                  originalUrl: mainImageSrc,
                  isMain: true,
                },
              ]
        }
        activeId={activeGalleryItem?.id || 'fallback-main'}
        modelCode={model.code}
        modelTitle={model.title}
        onSelectId={(id) => setSelectedGalleryId(id)}
        onClose={() => setLightboxOpen(false)}
      />

      {/* 1. ШАПКА КАРТОЧКИ (Стр. 2 ТЗ): Код · Название · Редактируемый бренд · Статус · Сценарий · Годовой итог · Редактировать / Сохранить / Экспорт PDF */}
      <div className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] px-5 py-4 shadow-[0_2px_10px_rgba(20,20,19,0.03)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleBackClick}
              className="h-9 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:border-[#141413] border-[1.5px] border-[#CECDC4] text-[12.5px] font-semibold text-[#141413] transition cursor-pointer"
            >
              ← Сценарии
            </button>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-[6px] bg-[#EFEFE9] text-[#141413] border border-[#CECDC4] font-mono text-[11px] font-bold">
                  {model.code}
                </span>

                {/* Быстрый выбор бренда прямо в шапке или форме */}
                <select
                  aria-label="Бренд модели"
                  disabled={!canEdit}
                  value={brandPortfolioLabel}
                  onChange={(e) => handleBrandSelectChange(e.target.value)}
                  className="h-6 px-2 rounded-[6px] bg-[#F4F4F0] hover:border-[#141413] text-[#141413] border border-[#CECDC4] text-[11px] font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {availableBrandOptions.map((b) => (
                    <option key={b} value={b}>
                      Бренд: {b}
                    </option>
                  ))}
                  {canCreateNewBrand && (
                    <option value="__CREATE_NEW__">+ Создать бренд...</option>
                  )}
                </select>

                {/* Статус жизненного цикла модели (Идея / В разработке / Тест / Масштабирование / Действующий / Приостановлен) */}
                <select
                  aria-label="Статус модели"
                  disabled={!canEdit}
                  value={currentStageStatus}
                  onChange={(e) =>
                    handleStageStatusChange(e.target.value as ModelPassportStageStatus)
                  }
                  className="h-6 px-2 rounded-[6px] bg-[#F4F4F0] hover:border-[#141413] text-[#141413] border border-[#CECDC4] text-[11px] font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {STAGE_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      Статус: {st}
                    </option>
                  ))}
                </select>

                {effectiveWbArticle && (
                  <span className="px-2 py-0.5 rounded-[6px] bg-[#F7F7F4] border border-[#DFDED6] font-mono text-[11px] text-[#3F3E3A]">
                    WB: {effectiveWbArticle}
                  </span>
                )}

                <span className="text-[11px] text-[#5E5D58]">
                  {hasDistinctSecondary
                    ? `${model.unitsInPack} ${secondaryUnitShort} в 1 ${primaryUnitShort} · ID: ${model.id}`
                    : `Ед. учёта: ${primaryUnitShort} · ID: ${model.id}`}
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-3 mt-1">
                <h1 className="text-[19px] md:text-[22px] font-bold tracking-[-0.02em] text-[#141413] truncate">
                  {model.title}
                </h1>
                {/* Годовой итог компактной строкой в верхней части (Стр. 2 ТЗ: без дублирования внутри месячной карточки) */}
                <span className="text-[12px] text-[#5E5D58]">
                  За 12 мес. ({scenario.year}):{' '}
                  {hasFinance ? (
                    <>
                      <strong className="text-[#141413]">
                        {formatMln(pnl.annualRevenueRub)}
                      </strong>{' '}
                      ({pnl.annualBuyoutsPacks.toLocaleString('ru-RU')} {primaryUnitShort}
                      {hasDistinctSecondary
                        ? ` / ${pnl.annualBuyoutsUnits.toLocaleString('ru-RU')} ${secondaryUnitShort}`
                        : ''}
                      )
                    </>
                  ) : (
                    <strong className="text-[#141413]">
                      {pnl.annualBuyoutsPacks.toLocaleString('ru-RU')} {primaryUnitShort}
                      {hasDistinctSecondary
                        ? ` / ${pnl.annualBuyoutsUnits.toLocaleString('ru-RU')} ${secondaryUnitShort}`
                        : ''}
                    </strong>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Переключатель сценария + кнопки «Редактировать», «Сохранить», «Экспорт ТЗ PDF» */}
          <div className="flex flex-wrap items-center gap-2">
            {savedBannerText && (
              <span className="px-2.5 py-1 rounded-[8px] bg-[#EAF6F0] border border-[#CBEAD9] text-[#157347] text-[11.5px] font-semibold">
                {savedBannerText}
              </span>
            )}

            {allScenarios.length > 0 && onSelectScenario ? (
              <div className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[9px] bg-[#F5F5F1] border-[1.5px] border-[#CECDC4]">
                <span className="text-[11px] font-semibold text-[#5E5D58]">Сценарий:</span>
                <select
                  aria-label="Выбор сценария"
                  value={scenario.id}
                  onChange={(e) => onSelectScenario(Number(e.target.value))}
                  className="bg-transparent text-[12px] font-bold text-[#141413] focus:outline-none cursor-pointer"
                >
                  {scenario.id < 0 && (
                    <option value={-1}>Нет активного сценария</option>
                  )}
                  {allScenarios
                    .filter((sc) => {
                      if (sc.id < 0) return false;
                      if (sc.id === scenario.id) return true;
                      if (sc.isArchived) return false;
                      const mCode = normalizePortfolioBrandCode(brandPortfolioLabel);
                      return mCode === 'ALL' || isScenarioCompatibleWithBrand(sc, mCode);
                    })
                    .map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {hasFinance
                          ? `${sc.title} (${sc.monthlyTargetMln} млн ₽/мес)`
                          : sc.title}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <span className="h-9 px-3 rounded-[9px] bg-[#F5F5F1] border-[1.5px] border-[#CECDC4] text-[12px] font-semibold text-[#141413] inline-flex items-center">
                {scenario.id < 0
                  ? 'Нет активного сценария'
                  : hasFinance
                  ? `${scenario.title} · ${scenario.monthlyTargetMln} млн ₽/мес`
                  : scenario.title}
              </span>
            )}

            <button
              type="button"
              disabled={!canEdit}
              onClick={() => canEdit && setIsEditing((v) => !v)}
              className={`h-9 px-3.5 rounded-[9px] text-[12.5px] font-semibold border-[1.5px] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isEditing && canEdit
                  ? 'bg-[#E6E5DE] text-[#141413] border-[#9E9D94]'
                  : 'bg-white hover:bg-[#F5F5F1] text-[#141413] border-[#CECDC4]'
              }`}
            >
              Редактировать
            </button>

            <button
              type="button"
              disabled={!canEdit}
              onClick={handleSaveButtonClick}
              className="h-9 px-3.5 rounded-lg bg-[#141413] hover:bg-[#282724] text-white text-[12.5px] font-medium border border-[#141413] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Сохранить
            </button>

            <button
              type="button"
              onClick={onOpenPdfModal}
              className="h-9 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border-[1.5px] border-[#CECDC4] text-[12.5px] font-semibold transition cursor-pointer"
            >
              Экспорт ТЗ PDF
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Дополнительные действия"
                className="h-9 w-9 rounded-[9px] bg-white hover:border-[#141413] border-[1.5px] border-[#CECDC4] flex items-center justify-center text-[#141413] cursor-pointer"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 rounded-[14px] bg-white border-[1.5px] border-[#141413] shadow-[0_18px_44px_rgba(20,20,19,0.16)] py-1.5 z-30 text-[12.5px]">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenSalesPlan();
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-[#F5F5F1] font-medium text-[#141413] cursor-pointer"
                  >
                    Сводная матрица портфеля (12 мес.)
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      if (!canEdit) return;
                      setMenuOpen(false);
                      onDuplicateModel?.(model);
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-[#F5F5F1] font-medium text-[#141413] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Создать цветовой вариант
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      if (!canEdit) return;
                      setMenuOpen(false);
                      onDeleteOrArchiveModel?.(model);
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-[#FFF2F2] text-[#B42318] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Удалить / В архив
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Быстрое создание нового бренда (если нажали «+ Создать бренд...») */}
        {creatingBrandOpen && canEdit && canCreateNewBrand && (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-[#F7F7F4] border border-[#CECDC4] px-3.5 py-2.5 text-[12.5px]">
            <span className="font-semibold text-[#141413]">Новый бренд:</span>
            <input
              type="text"
              value={newBrandDraft}
              onChange={(e) => setNewBrandDraft(e.target.value)}
              placeholder="Введите название бренда..."
              className="h-8 w-56 rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-semibold text-[#141413]"
            />
            <button
              type="button"
              onClick={handleCreateCustomBrand}
              className="h-8 px-3 rounded-[8px] bg-[#EAE9E2] hover:bg-[#DFDED6] text-[#141413] border border-[#CECDC4] font-semibold cursor-pointer"
            >
              Создать и выбрать
            </button>
            <button
              type="button"
              onClick={() => setCreatingBrandOpen(false)}
              className="h-8 px-2.5 rounded-[8px] bg-white border border-[#CECDC4] text-[#5E5D58] font-semibold cursor-pointer"
            >
              Отмена
            </button>
          </div>
        )}

        {/* ФОРМА «РЕДАКТИРОВАТЬ» (Раздел 03 ТЗ, Стр. 3): Бренд, Название, Код, Артикул WB, Статус, Комплектация и Характеристики */}
        {isEditing && canEdit && (
          <div className="rounded-[14px] bg-[#F7F7F4] border-[1.5px] border-[#141413] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DFDED6] pb-2.5">
              <div>
                <div className="text-[13.5px] font-bold text-[#141413]">
                  Форма редактирования паспорта модели
                </div>
                <div className="text-[11.5px] text-[#5E5D58]">
                  Системный идентификатор неизменяем:{' '}
                  <span className="font-mono font-semibold text-[#141413]">
                    {model.id}
                  </span>{' '}
                  · Все изменения едины для всех сценариев и сохраняются при обновлении страницы (F5).
                </div>
              </div>
              {canCreateNewBrand && (
                <button
                  type="button"
                  onClick={() => setCreatingBrandOpen(true)}
                  className="h-8 px-3 rounded-[8px] bg-white hover:border-[#141413] border border-[#CECDC4] text-[12px] font-semibold text-[#141413] cursor-pointer"
                >
                  + Создать бренд
                </button>
              )}
            </div>

            {/* Поля 1–5 из таблицы на Стр. 3 ТЗ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-[12px]">
              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">1. Бренд</span>
                <select
                  value={brandPortfolioLabel}
                  onChange={(e) => handleBrandSelectChange(e.target.value)}
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-bold text-[#141413]"
                >
                  {availableBrandOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  {canCreateNewBrand && (
                    <option value="__CREATE_NEW__">+ Создать бренд...</option>
                  )}
                </select>
              </label>

              <label className="space-y-1 lg:col-span-2">
                <span className="font-semibold text-[#3F3E3A] block">
                  2. Название модели
                </span>
                <input
                  type="text"
                  value={model.title}
                  onChange={(e) => {
                    setHasUnsavedDraft(true);
                    commitWithAudit(
                      { ...model, title: e.target.value },
                      'product',
                      'Изменено название модели',
                      model.title,
                      e.target.value,
                      true
                    );
                  }}
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-semibold text-[#141413]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">
                  Внутренний код
                </span>
                <input
                  type="text"
                  value={model.code}
                  onChange={(e) => {
                    setHasUnsavedDraft(true);
                    commitWithAudit(
                      { ...model, code: e.target.value },
                      'product',
                      'Изменён внутренний код модели',
                      model.code,
                      e.target.value,
                      true
                    );
                  }}
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-mono font-semibold text-[#141413]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">
                  Артикул WB
                </span>
                <input
                  type="text"
                  value={effectiveWbArticle}
                  placeholder="Напр. 244995893"
                  onChange={(e) => {
                    setHasUnsavedDraft(true);
                    commitWithAudit(
                      { ...model, wbArticle: e.target.value },
                      'product',
                      'Изменён артикул WB',
                      effectiveWbArticle || 'Не задан',
                      e.target.value || 'Не задан',
                      true
                    );
                  }}
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-mono font-semibold text-[#141413]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">3. Статус</span>
                <select
                  value={currentStageStatus}
                  onChange={(e) =>
                    handleStageStatusChange(e.target.value as ModelPassportStageStatus)
                  }
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-semibold text-[#141413]"
                >
                  {STAGE_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Комплектация + Характеристики (Ткань, Состав, Плотность, Посадка, Конструкция, Резинка, Описание) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-[12px]">
              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">
                  4. Ед. в 1 {primaryUnitShort}
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    disabled={!canEdit}
                    value={model.unitsInPack}
                    onChange={(e) => handleUnitsInPackChange(Number(e.target.value))}
                    className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-mono font-bold text-[#141413] disabled:opacity-60"
                  />
                  <span className="text-[11px] text-[#5E5D58] shrink-0">
                    {secondaryUnitShort}
                  </span>
                </div>
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">
                  5. Состав ткани
                </span>
                <input
                  type="text"
                  value={model.fabric.composition}
                  onChange={(e) =>
                    commitWithAudit(
                      {
                        ...model,
                        fabric: { ...model.fabric, composition: e.target.value },
                      },
                      'product',
                      'Обновлён состав ткани',
                      model.fabric.composition,
                      e.target.value,
                      true
                    )
                  }
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-medium text-[#141413]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">
                  Плотность и плетение
                </span>
                <input
                  type="text"
                  value={model.fabric.density}
                  onChange={(e) =>
                    commitWithAudit(
                      {
                        ...model,
                        fabric: { ...model.fabric, density: e.target.value },
                      },
                      'product',
                      'Обновлена плотность ткани',
                      model.fabric.density,
                      e.target.value,
                      true
                    )
                  }
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-medium text-[#141413]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">
                  Конструкция и посадка
                </span>
                <input
                  type="text"
                  value={model.construction.fit}
                  onChange={(e) =>
                    commitWithAudit(
                      {
                        ...model,
                        construction: { ...model.construction, fit: e.target.value },
                      },
                      'product',
                      'Обновлена посадка модели',
                      model.construction.fit,
                      e.target.value,
                      true
                    )
                  }
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-medium text-[#141413]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">
                  Резинка / пояс
                </span>
                <input
                  type="text"
                  value={model.waistband.type}
                  onChange={(e) =>
                    commitWithAudit(
                      {
                        ...model,
                        waistband: { ...model.waistband, type: e.target.value },
                      },
                      'product',
                      'Обновлён тип резинки/пояса',
                      model.waistband.type,
                      e.target.value,
                      true
                    )
                  }
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-medium text-[#141413]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-[#3F3E3A] block">
                  Описание / подзаголовок
                </span>
                <input
                  type="text"
                  value={model.description ?? model.subtitle}
                  onChange={(e) =>
                    commitWithAudit(
                      {
                        ...model,
                        subtitle: e.target.value,
                        description: e.target.value,
                      },
                      'product',
                      'Обновлено описание модели',
                      model.subtitle,
                      e.target.value,
                      true
                    )
                  }
                  className="h-9 w-full rounded-[8px] border border-[#CECDC4] bg-white px-2.5 font-medium text-[#141413]"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* 2. ПЕРВЫЙ ЭКРАН (Стр. 2 ТЗ): ЛЕВАЯ КОЛОНКА (ГАЛЕРЕЯ ФОТО) + ПРАВАЯ КОЛОНКА (РОВНО 4 КАРТОЧКИ 2×2 + СТРОКА НАЛИЧИЯ) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ЛЕВАЯ КОЛОНКА: Большое фото без фильтров + ряд миниатюр + «+ Загрузить фото» */}
        <div className="lg:col-span-6 rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-4 md:p-5 flex flex-col justify-between space-y-3">
          {mainImageSrc ? (
            <div
              onClick={() => setLightboxOpen(true)}
              title="Нажмите для полноэкранного просмотра фотографии (Zoom, 100%, По размеру экрана, Оригинал)"
              className="relative rounded-[14px] bg-[#F5F5F1] border-[1.5px] border-[#DFDED6] h-[310px] md:h-[360px] flex items-center justify-center p-3 overflow-hidden group cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mainImageSrc}
                alt={`${model.code} ${model.title}`}
                className="max-h-full max-w-full w-auto h-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
              />
            </div>
          ) : canEdit ? (
            <label className="relative rounded-[14px] bg-[#F5F5F1] hover:bg-[#EFEFE9] border-[1.5px] border-dashed border-[#CECDC4] hover:border-[#141413] h-[310px] md:h-[360px] flex flex-col items-center justify-center gap-2.5 p-6 text-center cursor-pointer transition">
              <div className="h-11 w-11 rounded-full bg-white border border-[#CECDC4] flex items-center justify-center text-[#141413]">
                <Plus className="h-5 w-5" />
              </div>
              <div className="text-[14px] font-bold text-[#141413]">
                Нажмите, чтобы загрузить фото модели
              </div>
              <div className="text-[12px] text-[#686762]">
                Поддерживаются PNG, JPG, WEBP · можно выбрать сразу несколько файлов
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleUploadOriginalPhotos}
                className="hidden"
              />
            </label>
          ) : (
            <div className="relative rounded-[14px] bg-[#F5F5F1] border-[1.5px] border-dashed border-[#CECDC4] h-[310px] md:h-[360px] flex flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="text-[14px] font-bold text-[#3F3E3A]">
                Фото модели пока не загружено
              </div>
              <div className="text-[12px] text-[#686762]">
                Режим чтения — загрузка фотографий недоступна для вашей роли
              </div>
            </div>
          )}

          {/* Горизонтальный ряд миниатюр + управление главным фото / порядком / удалением + кнопка «+ Загрузить фото» */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              {filteredGallery.map((g, idx) => {
                const isSel = g.id === activeGalleryItem?.id;
                const src = normalizeAssetUrl(g.url || g.originalUrl || '');
                return (
                  <div key={g.id} className="relative shrink-0 group/thumb">
                    <button
                      type="button"
                      onClick={() => setSelectedGalleryId(g.id)}
                      onDoubleClick={() => {
                        setSelectedGalleryId(g.id);
                        setLightboxOpen(true);
                      }}
                      title="Клик — выбрать фото · Двойной клик — полноэкранный просмотр"
                      aria-label={`Фото ${idx + 1}`}
                      className={`rounded-[9px] p-1 border-[1.5px] transition cursor-pointer block ${
                        isSel
                          ? 'border-[#141413] bg-[#F5F5F1]'
                          : 'border-[#DFDED6] bg-white hover:border-[#141413]'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`${model.title} ${idx + 1}`}
                        className="h-12 w-14 object-contain rounded-[5px] bg-[#F5F5F1]"
                      />
                    </button>

                    {/* Панель действий над миниатюрой: Главное / Влево / Вправо / Удалить */}
                    {canEdit && (
                      <div className="hidden group-hover/thumb:flex items-center gap-0.5 absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#141413]/90 text-white rounded-md px-1 py-0.5 shadow z-10">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetMainGalleryPhoto(g.id);
                            }}
                            title="Сделать главным фото"
                            className="p-0.5 hover:text-amber-300 cursor-pointer"
                          >
                            <Star className="h-2.5 w-2.5" />
                          </button>
                        )}
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveGalleryPhoto(g.id, -1);
                            }}
                            title="Сдвинуть влево"
                            className="p-0.5 hover:text-emerald-300 cursor-pointer"
                          >
                            <ArrowLeft className="h-2.5 w-2.5" />
                          </button>
                        )}
                        {idx < filteredGallery.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveGalleryPhoto(g.id, 1);
                            }}
                            title="Сдвинуть вправо"
                            className="p-0.5 hover:text-emerald-300 cursor-pointer"
                          >
                            <ArrowRight className="h-2.5 w-2.5" />
                          </button>
                        )}
                        {filteredGallery.length >= 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveGalleryPhoto(g.id);
                            }}
                            title="Удалить фото"
                            className="p-0.5 hover:text-rose-300 cursor-pointer"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {mainImageSrc && (
                <>
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="h-8.5 px-3 rounded-[8px] bg-white hover:bg-[#F5F5F1] border-[1.5px] border-[#CECDC4] text-[12px] font-semibold text-[#141413] cursor-pointer transition"
                  >
                    Во весь экран
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleRemoveGalleryPhoto(activeGalleryItem?.id)}
                      title="Удалить текущую фотографию из карточки"
                      className="h-8.5 px-3 rounded-[8px] bg-white hover:bg-[#FEF2F2] border-[1.5px] border-[#FECACA] text-[12px] font-semibold text-[#B42318] inline-flex items-center gap-1 cursor-pointer transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Удалить фото</span>
                    </button>
                  )}
                </>
              )}
              {canEdit && (
                <label className="h-8.5 px-3 rounded-[8px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border-[1.5px] border-[#CECDC4] text-[12px] font-semibold inline-flex items-center shrink-0 cursor-pointer transition">
                  <span>+ Загрузить фото</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadOriginalPhotos}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА (Стр. 2 ТЗ): РОВНО ЧЕТЫРЕ КАРТОЧКИ (2×2) + ОДНА КОМПАКТНАЯ СТРОКА НАЛИЧИЯ ТОВАРА НИЖЕ */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Карточка 1: Выручка выбранного месяца (без дублирования годовой выручки внутри карточки) */}
            <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-[#3F3E3A]">
                  {hasFinance ? 'Выручка выбранного месяца' : 'Выкупы выбранного месяца'}
                </span>
                <StatusPill status={selMonthStatus} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-[23px] font-bold tracking-[-0.02em] text-[#141413]">
                  {hasFinance
                    ? formatMln(selMonthRevRub)
                    : `${selMonthPacks.toLocaleString('ru-RU')} ${primaryUnitShort}`}
                </div>
                <select
                  aria-label="Месяц выручки"
                  value={selectedMonthIdx}
                  onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}
                  className="h-7 px-2 rounded-[6px] bg-[#F5F5F1] border border-[#CECDC4] text-[11.5px] font-bold text-[#141413] cursor-pointer"
                >
                  {MONTHS_SHORT_RU.map((mName, idx) => (
                    <option key={mName} value={idx}>
                      {mName} {scenario.year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-[11.5px] text-[#5E5D58]">
                {hasFinance ? (
                  <>
                    {formatRub(selMonthRevRub)} · Выкупы:{' '}
                    <strong className="text-[#141413]">
                      {selMonthPacks.toLocaleString('ru-RU')} {primaryUnitShort}
                    </strong>
                    {hasDistinctSecondary
                      ? ` (${selMonthUnits.toLocaleString('ru-RU')} ${secondaryUnitShort})`
                      : ''}
                  </>
                ) : (
                  <>
                    Выручка: <strong className="text-[#686762]">Скрыто</strong>
                    {hasDistinctSecondary
                      ? ` · ${selMonthUnits.toLocaleString('ru-RU')} ${secondaryUnitShort}`
                      : ''}
                  </>
                )}
              </div>
            </div>

            {/* Карточка 2: Цена комплекта / единицы */}
            <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-[#3F3E3A]">
                  {primaryUnitShort === 'компл.'
                    ? 'Цена комплекта'
                    : `Цена за 1 ${primaryUnitShort}`}
                </span>
                <StatusPill status={pnl.revenueStatus} />
              </div>

              {isEditing && canEdit ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={plan.monthlyPricesRub[selectedMonthIdx] ?? model.retailPriceRub}
                    onChange={(e) => handleScenarioPriceChange(Number(e.target.value))}
                    className="h-9 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 text-[16px] font-bold text-[#141413]"
                  />
                  <span className="text-[13px] font-semibold text-[#5E5D58]">₽</span>
                </div>
              ) : (
                <div className="text-[23px] font-bold tracking-[-0.02em] text-[#141413]">
                  {formatRub(pnl.avgRealizedPricePerPackRub)}
                </div>
              )}

              <div className="text-[11.5px] text-[#5E5D58]">
                {hasDistinctSecondary ? (
                  <>
                    За 1 {primaryUnitShort} ({model.unitsInPack} {secondaryUnitShort}) ·{' '}
                    <strong className="text-[#141413]">
                      {formatRub(pnl.avgRealizedPricePerUnitRub)} / {secondaryUnitShort}
                    </strong>
                  </>
                ) : (
                  <>Розничная цена за 1 {primaryUnitShort}</>
                )}
              </div>
            </div>

            {/* Карточка 3: Себестоимость под ключ (если неизвестна — показывать «Не заполнено», не подставлять 0 ₽) */}
            <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-[#3F3E3A]">
                  Себестоимость под ключ
                </span>
                {hasCost && <StatusPill status={pnl.costStatus} />}
              </div>

              {!hasCost ? (
                <div className="text-[17px] font-bold text-[#686762]">Скрыто</div>
              ) : isEditing && canEdit ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={model.unitCostRub > 0 ? model.unitCostRub : ''}
                    placeholder="Не заполнено"
                    onChange={(e) => handleUnitCostChange(Number(e.target.value))}
                    className="h-9 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 text-[16px] font-bold text-[#141413]"
                  />
                  <span className="text-[13px] font-semibold text-[#5E5D58]">₽</span>
                </div>
              ) : pnl.unitCostPerPackRub !== null ? (
                <div className="text-[23px] font-bold tracking-[-0.02em] text-[#141413]">
                  {formatRub(pnl.unitCostPerPackRub)}
                </div>
              ) : (
                <div className="text-[17px] font-bold text-[#B91C1C]">
                  Не заполнено
                </div>
              )}

              <div className="text-[11.5px] text-[#5E5D58]">
                {!hasCost
                  ? 'Недоступно для вашей роли'
                  : pnl.unitCostPerSingleItemRub !== null
                  ? hasDistinctSecondary
                    ? `За 1 ${primaryUnitShort} · ${pnl.unitCostPerSingleItemRub.toLocaleString('ru-RU')} ₽ / ${secondaryUnitShort}`
                    : `За 1 ${primaryUnitShort}`
                  : 'Себестоимость не указана (0 ₽ не подставляется)'}
              </div>
            </div>

            {/* Карточка 4: Прибыль с комплекта (если себестоимость или логистика не заполнены — показывать «Не рассчитано») */}
            <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-[#3F3E3A]">
                  {primaryUnitShort === 'компл.'
                    ? 'Прибыль с комплекта'
                    : `Прибыль с 1 ${primaryUnitShort}`}
                </span>
                {hasFinance && hasCost && <StatusPill status={pnl.operatingProfitStatus} />}
              </div>

              {!hasFinance || !hasCost ? (
                <>
                  <div className="text-[17px] font-bold text-[#686762]">Скрыто</div>
                  <div className="text-[11px] text-[#5E5D58]">
                    Финансовые показатели скрыты для вашей роли
                  </div>
                </>
              ) : pnl.unitOperatingProfitRub !== null ? (
                <>
                  <div
                    className={`text-[23px] font-bold tracking-[-0.02em] ${
                      pnl.unitOperatingProfitRub >= 0
                        ? 'text-[#157347]'
                        : 'text-[#B42318]'
                    }`}
                  >
                    {pnl.unitOperatingProfitRub >= 0 ? '+' : ''}
                    {formatRub(pnl.unitOperatingProfitRub)}{' '}
                    <span className="text-[13px] font-semibold">
                      ({pnl.operatingMarginPct}%)
                    </span>
                  </div>
                  <div className="text-[11.5px] text-[#5E5D58]">
                    Остаётся с 1 {primaryUnitShort} · За год:{' '}
                    <strong className="text-[#141413]">
                      {formatMln(pnl.annualOperatingProfitRub || 0)}
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[14.5px] font-bold text-[#B91C1C] leading-snug">
                    {!pnl.logisticsFilled && pnl.unitCostPerPackRub !== null
                      ? 'Не рассчитано, пока не заполнена логистика'
                      : 'Не рассчитано'}
                  </div>
                  <div className="text-[11px] text-[#5E5D58] leading-snug">
                    {pnl.operatingProfitNotCalculatedReason}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* НИЖЕ ЧЕТЫРЁХ КАРТОЧЕК — ОДНА КОМПАКТНАЯ СТРОКА НАЛИЧИЯ ТОВАРА (Стр. 2 ТЗ) */}
          <div
            className={`rounded-[14px] border-[1.5px] px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
              procurement.hasDeficit
                ? 'bg-[#FEF2F2] border-[#FECACA]'
                : 'bg-[#EAF6F0] border-[#CBEAD9]'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span
                className={`font-bold ${
                  procurement.hasDeficit ? 'text-[#B42318]' : 'text-[#157347]'
                }`}
              >
                {procurement.hasDeficit
                  ? `Наличие товара: дефицит ${procurement.totalDeficitPacks.toLocaleString('ru-RU')} ${primaryUnitShort}`
                  : 'Наличие товара: достаточно'}
              </span>
              <span className="text-[12px] text-[#52524E]">
                (Склад: {procurement.netOpeningAvailablePacks.toLocaleString('ru-RU')} {primaryUnitShort} · Утв. PO:{' '}
                {procurement.totalApprovedReceiptsPacks.toLocaleString('ru-RU')} {primaryUnitShort})
              </span>
            </div>

            <button
              type="button"
              onClick={openProcurementTab}
              className="text-[12.5px] font-bold text-[#141413] underline hover:opacity-75 cursor-pointer shrink-0"
            >
              Открыть закупки →
            </button>
          </div>
        </div>
      </div>

      {/* 3. НИЖНЯЯ ЧАСТЬ: ЧЕТЫРЕ ВКЛАДКИ БЕЗ ТЕХНИЧЕСКИХ НОМЕРОВ («Продукт» / «Продажи» / «Закупки» / «Финансы») */}
      <div
        ref={tabsAnchorRef}
        className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] overflow-hidden shadow-[0_2px_10px_rgba(20,20,19,0.03)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-3 bg-[#F7F7F4] border-b-[1.5px] border-[#DFDED6]">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-[10px] bg-[#EFEFE9] border-[1.5px] border-[#CECDC4] p-0.5">
            {(
              [
                { id: 'product', label: 'Продукт' },
                { id: 'sales', label: 'Продажи' },
                { id: 'procurement', label: 'Закупки' },
                ...(hasFinance ? ([{ id: 'finance', label: 'Финансы' }] as const) : []),
              ] as const
            ).map((tab) => {
              const isAct = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-8.5 px-4 rounded-[8px] text-[12.5px] font-semibold inline-flex items-center transition cursor-pointer ${
                    isAct
                      ? 'bg-white text-[#141413] border border-[#CECDC4] shadow-2xs'
                      : 'text-[#3F3E3A] hover:text-[#141413] hover:bg-white/60'
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <span className="text-[11.5px] font-medium text-[#5E5D58]">
            Единая карточка товара во всех сценариях · отдельные планы продаж для Сценария №1 / №2 / №3
          </span>
        </div>

        {/* ==================== ВКЛАДКА «ПРОДУКТ» (ПРЯМОЕ INLINE-РЕДАКТИРОВАНИЕ ВСЕХ ПОЛЕЙ) ==================== */}
        {activeTab === 'product' && (
          <div className="p-5 md:p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Блок 1: Материалы, состав и плотность */}
              <div className="rounded-[14px] bg-[#F7F7F4] border-[1.5px] border-[#CECDC4] p-4 space-y-2.5">
                <div className="text-[11px] font-mono font-bold uppercase tracking-[0.06em] text-[#5E5D58]">
                  1. Материалы, состав и плотность
                </div>
                <div className="space-y-2 text-[12.5px] text-[#141413]">
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-[#5E5D58]">Состав материала:</span>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={model.fabric.composition}
                      placeholder="Например: 100% полиэстер блэкаут / 92% модал"
                      onChange={(e) =>
                        commitWithAudit(
                          {
                            ...model,
                            fabric: { ...model.fabric, composition: e.target.value },
                          },
                          'product',
                          'Изменён состав материала',
                          model.fabric.composition,
                          e.target.value,
                          true
                        )
                      }
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] focus:border-[#141413] bg-white px-2.5 font-semibold text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-[#5E5D58]">Плотность / светозащита:</span>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={model.fabric.density}
                      placeholder="Например: 280 г/м² или 190 г/м²"
                      onChange={(e) =>
                        commitWithAudit(
                          {
                            ...model,
                            fabric: { ...model.fabric, density: e.target.value },
                          },
                          'product',
                          'Изменена плотность материала',
                          model.fabric.density,
                          e.target.value,
                          true
                        )
                      }
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] focus:border-[#141413] bg-white px-2.5 font-semibold text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-[#5E5D58]">Фактура / переплетение:</span>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={model.fabric.knitType}
                      placeholder="Например: Рогожка матовая / Кулирная гладь"
                      onChange={(e) =>
                        commitWithAudit(
                          {
                            ...model,
                            fabric: { ...model.fabric, knitType: e.target.value },
                          },
                          'product',
                          'Изменено переплетение / фактура',
                          model.fabric.knitType,
                          e.target.value,
                          true
                        )
                      }
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] focus:border-[#141413] bg-white px-2.5 text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                </div>
              </div>

              {/* Блок 2: Конструкция и комплектация */}
              <div className="rounded-[14px] bg-[#F7F7F4] border-[1.5px] border-[#CECDC4] p-4 space-y-2.5">
                <div className="text-[11px] font-mono font-bold uppercase tracking-[0.06em] text-[#5E5D58]">
                  2. Конструкция и комплектация
                </div>
                <div className="space-y-2 text-[12.5px] text-[#141413]">
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-[#5E5D58]">
                      Тип и комплектация
                      {hasDistinctSecondary
                        ? ` (${model.unitsInPack} ${secondaryUnitShort} = 1 ${primaryUnitShort})`
                        : ` (${primaryUnitShort})`}
                      :
                    </span>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={model.construction.type}
                      placeholder="Например: Комплект штор 2 полотна / Комплект"
                      onChange={(e) =>
                        commitWithAudit(
                          {
                            ...model,
                            construction: { ...model.construction, type: e.target.value },
                          },
                          'product',
                          'Изменена комплектация / тип изделия',
                          model.construction.type,
                          e.target.value,
                          true
                        )
                      }
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] focus:border-[#141413] bg-white px-2.5 font-semibold text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-[#5E5D58]">Габариты / посадка:</span>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={model.construction.fit}
                      placeholder="Например: Высота 270 см · ширина 300 см"
                      onChange={(e) =>
                        commitWithAudit(
                          {
                            ...model,
                            construction: { ...model.construction, fit: e.target.value },
                          },
                          'product',
                          'Изменены габариты / посадка',
                          model.construction.fit,
                          e.target.value,
                          true
                        )
                      }
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] focus:border-[#141413] bg-white px-2.5 text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-[#5E5D58]">Детали и пошив:</span>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={model.construction.seams}
                      placeholder="Например: Закрытые боковые швы евро-стандарта"
                      onChange={(e) =>
                        commitWithAudit(
                          {
                            ...model,
                            construction: { ...model.construction, seams: e.target.value },
                          },
                          'product',
                          'Изменены детали пошива',
                          model.construction.seams,
                          e.target.value,
                          true
                        )
                      }
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] focus:border-[#141413] bg-white px-2.5 text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                </div>
              </div>

              {/* Блок 3: Крепление / обработка и размерная сетка */}
              <div className="rounded-[14px] bg-[#F7F7F4] border-[1.5px] border-[#CECDC4] p-4 space-y-2.5">
                <div className="text-[11px] font-mono font-bold uppercase tracking-[0.06em] text-[#5E5D58]">
                  3. Характеристики и размерная сетка
                </div>
                <div className="space-y-2 text-[12.5px] text-[#141413]">
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-[#5E5D58]">Крепление / верх / пояс:</span>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={model.waistband.width}
                      placeholder="Например: Шторная лента 6 см / Пояс 35 мм"
                      onChange={(e) =>
                        commitWithAudit(
                          {
                            ...model,
                            waistband: { ...model.waistband, width: e.target.value },
                          },
                          'product',
                          'Изменены параметры верха / крепления',
                          model.waistband.width,
                          e.target.value,
                          true
                        )
                      }
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] focus:border-[#141413] bg-white px-2.5 font-semibold text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                  <label className="block space-y-0.5">
                    <span className="text-[11px] font-semibold text-[#5E5D58]">Упаковка и маркировка:</span>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={model.waistband.logoRepeat}
                      placeholder="Например: Фирменный кофр на молнии + ярлык"
                      onChange={(e) =>
                        commitWithAudit(
                          {
                            ...model,
                            waistband: { ...model.waistband, logoRepeat: e.target.value },
                          },
                          'product',
                          'Изменены параметры упаковки / маркировки',
                          model.waistband.logoRepeat,
                          e.target.value,
                          true
                        )
                      }
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] focus:border-[#141413] bg-white px-2.5 text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </label>
                  <div className="pt-0.5">
                    {model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0 ? (
                      <>
                        <span className="text-[#5E5D58] text-[11px] font-semibold">
                          Размерная линейка полотен ({model.liskaniSizeVariants.length} SKU):
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {model.liskaniSizeVariants.map((sv) => {
                            const totalAnnual = Math.max(
                              1,
                              model.liskaniSizeVariants!.reduce(
                                (s, x) => s + x.annualBuyoutsUnits,
                                0
                              )
                            );
                            const sharePct = Math.round(
                              (sv.annualBuyoutsUnits / totalAnnual) * 100
                            );
                            return (
                              <span
                                key={sv.skuIndex}
                                className="rounded-[6px] bg-white border border-[#CECDC4] px-2 py-0.5 text-[10.5px] font-mono font-bold text-[#141413]"
                              >
                                {sv.sizeCm}{' '}
                                <span className="text-[#157347]">({sharePct}%)</span>
                              </span>
                            );
                          })}
                        </div>
                      </>
                    ) : isGenericSizeShares &&
                      (modelBrandCode === 'AKUSHA' || modelBrandCode === 'LISKANI') &&
                      prodProfile.sizes.length > 5 ? (
                      <>
                        <span className="text-[#5E5D58] text-[11px] font-semibold">
                          Доли размеров ({prodProfile.sizes[0]}–{prodProfile.sizes[prodProfile.sizes.length - 1]}, %):
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {prodProfile.sizes.map((sz) => (
                            <span
                              key={sz}
                              className="rounded-[6px] bg-white border border-[#CECDC4] px-2 py-0.5 text-[10.5px] font-mono font-bold text-[#141413]"
                            >
                              {sz}{' '}
                              <span className="text-[#157347]">
                                ({prodProfile.sizeSharesPct[sz] ?? Math.round(100 / prodProfile.sizes.length)}%)
                              </span>
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-[#5E5D58] text-[11px] font-semibold">
                          Доли размеров / вариантов (%):
                        </span>
                        <div className="grid grid-cols-5 gap-1 mt-1">
                          {(['S', 'M', 'L', 'XL', 'XXL'] as const).map((sz, szIdx) => {
                            const displaySz =
                              (modelBrandCode === 'NA_TELE' ||
                                modelBrandCode === 'AKUSHA' ||
                                modelBrandCode === 'LISKANI') &&
                              prodProfile.sizes.length >= 5
                                ? prodProfile.sizes.length === 5
                                  ? prodProfile.sizes[szIdx]
                                  : szIdx < 4
                                  ? prodProfile.sizes[szIdx]
                                  : prodProfile.sizes.slice(4).join('/')
                                : sz;
                            const displayShare =
                              isGenericSizeShares &&
                              modelBrandCode === 'NA_TELE' &&
                              prodProfile.sizes.length === 5
                                ? prodProfile.sizeSharesPct[prodProfile.sizes[szIdx]] ??
                                  shared.factoryParams.sizeSharesPct[sz]
                                : shared.factoryParams.sizeSharesPct[sz];
                            return (
                              <label
                                key={sz}
                                className="rounded-[6px] bg-white border border-[#CECDC4] px-1.5 py-1 flex flex-col items-center"
                              >
                                <span className="text-[9.5px] font-bold text-[#5E5D58]">
                                  {displaySz}
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  disabled={!canEdit}
                                  value={displayShare}
                                  onChange={(e) => {
                                    const nextVal = Math.max(
                                      0,
                                      Math.min(100, Math.round(Number(e.target.value) || 0))
                                    );
                                    commitWithAudit(
                                      {
                                        ...model,
                                        sharedSupplyAndFact: {
                                          ...shared,
                                          factoryParams: {
                                            ...shared.factoryParams,
                                            sizeSharesPct: {
                                              ...shared.factoryParams.sizeSharesPct,
                                              [sz]: nextVal,
                                            },
                                          },
                                        },
                                      },
                                      'product',
                                      `Изменена доля размера ${displaySz}`,
                                      `${displayShare}%`,
                                      `${nextVal}%`,
                                      true
                                    );
                                  }}
                                  className="w-full text-center font-mono text-[11px] font-bold text-[#141413] bg-transparent focus:outline-none disabled:opacity-60"
                                />
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Матрица 8–9 размеров штор / тюля LISKANI (из утверждённого ассортимента 269 SKU и помесячного плана 2027) */}
            {model.liskaniSizeVariants && model.liskaniSizeVariants.length > 0 && (
              <div className="rounded-[16px] border-[1.5px] border-[#CECDC4] bg-[#F7F7F4] p-4 md:p-5 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-[6px] bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[10.5px] font-mono font-bold">
                        УТВЕРЖДЁННЫЙ АССОРТИМЕНТ 2027 · {model.liskaniSizeVariants.length} РАЗМЕРОВ SKU
                      </span>
                      {effectiveWbArticle ? (
                        <a
                          href={`https://www.wildberries.ru/catalog/${effectiveWbArticle}/detail.aspx`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-0.5 rounded-[6px] bg-[#EDE9FE] border border-[#C4B5FD] text-[#5B21B6] text-[11px] font-mono font-bold hover:underline"
                        >
                          WB {effectiveWbArticle} ↗
                        </a>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-[6px] bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-[11px] font-semibold">
                          Новинка (запуск март 2027)
                        </span>
                      )}
                    </div>
                    <h3 className="text-[15px] font-bold text-[#141413] mt-1">
                      Размерная матрица полотен, штрихкодов, себестоимости и плана заказов ({model.title})
                    </h3>
                    <p className="text-[11.5px] text-[#5E5D58]">
                      Все {model.liskaniSizeVariants.length} размерных SKU этого цвета из файла «Ассортимент 2027 (269 SKU)» и «План заказов 2027 (выкупы {Math.round(model.buyoutRatePct || 57)}%)». Вы можете редактировать себестоимость, цену, артикул WB, баркод и объём заказа прямо в таблице.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-[#5E5D58]">
                      Период плана:
                    </span>
                    <select
                      aria-label="Период размерной матрицы LISKANI"
                      value={liskaniSizeMonthFilter}
                      onChange={(e) =>
                        setLiskaniSizeMonthFilter(
                          e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                        )
                      }
                      className="h-8.5 px-3 rounded-[8px] bg-white border-[1.5px] border-[#141413] text-[12px] font-bold text-[#141413] cursor-pointer"
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

                <div className="overflow-x-auto rounded-[12px] border border-[#CECDC4] bg-white">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="bg-[#EFEFE9] border-b border-[#CECDC4] text-[10.5px] font-mono uppercase tracking-[0.04em] text-[#5E5D58]">
                        <th className="py-2.5 px-3">№</th>
                        <th className="py-2.5 px-3">Размер (Ш×В)</th>
                        <th className="py-2.5 px-3">Артикул продавца</th>
                        <th className="py-2.5 px-3">Артикул WB</th>
                        <th className="py-2.5 px-3">Баркод</th>
                        <th className="py-2.5 px-3 text-right">Себест., ₽</th>
                        <th className="py-2.5 px-3 text-right">Цена реал., ₽</th>
                        <th className="py-2.5 px-3 text-right">
                          Заказать ({liskaniSizeMonthFilter === 'ALL' ? 'год' : MONTHS_SHORT_RU[liskaniSizeMonthFilter]}), {primaryUnitShort}
                        </th>
                        <th className="py-2.5 px-3 text-right">
                          Заказы ({liskaniSizeMonthFilter === 'ALL' ? 'год' : MONTHS_SHORT_RU[liskaniSizeMonthFilter]}), ₽
                        </th>
                        <th className="py-2.5 px-3 text-right">
                          Выкупы {Math.round(model.buyoutRatePct || 57)}% ({liskaniSizeMonthFilter === 'ALL' ? 'год' : MONTHS_SHORT_RU[liskaniSizeMonthFilter]}), {primaryUnitShort}
                        </th>
                        <th className="py-2.5 px-3 text-right">
                          Выкупы {Math.round(model.buyoutRatePct || 57)}% ({liskaniSizeMonthFilter === 'ALL' ? 'год' : MONTHS_SHORT_RU[liskaniSizeMonthFilter]}), ₽
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E6E5DEC0]">
                      {model.liskaniSizeVariants.map((sv) => {
                        const ordPacks =
                          liskaniSizeMonthFilter === 'ALL'
                            ? sv.annualOrdersUnits
                            : sv.monthlyOrdersUnits[liskaniSizeMonthFilter] || 0;
                        const ordRub =
                          liskaniSizeMonthFilter === 'ALL'
                            ? sv.annualOrdersRub
                            : sv.monthlyOrdersRub[liskaniSizeMonthFilter] || 0;
                        const buyPacks =
                          liskaniSizeMonthFilter === 'ALL'
                            ? sv.annualBuyoutsUnits
                            : sv.monthlyBuyoutsUnits[liskaniSizeMonthFilter] || 0;
                        const buyRub =
                          liskaniSizeMonthFilter === 'ALL'
                            ? sv.annualBuyoutsRub
                            : sv.monthlyBuyoutsRub[liskaniSizeMonthFilter] || 0;

                        return (
                          <tr
                            key={sv.skuIndex}
                            className="hover:bg-[#F7F7F4] transition-colors"
                          >
                            <td className="py-2 px-3 font-mono text-[11px] text-[#5E5D58]">
                              {sv.skuIndex}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-[#141413]">
                              {sv.sizeCm}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11.5px] font-semibold text-[#141413]">
                              {sv.sellerSku}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11.5px]">
                              <input
                                type="text"
                                disabled={!canEdit}
                                value={sv.wbNmId}
                                placeholder="Новый SKU"
                                onChange={(e) =>
                                  handleUpdateLiskaniSizeVariant(sv.skuIndex, {
                                    wbNmId: e.target.value,
                                  })
                                }
                                className="h-7 w-28 rounded-[6px] border border-[#DFDED6] focus:border-[#141413] bg-[#F7F7F4] focus:bg-white px-2 font-mono text-[11.5px] text-[#141413] disabled:opacity-60"
                              />
                            </td>
                            <td className="py-2 px-3 font-mono text-[11.5px]">
                              <input
                                type="text"
                                disabled={!canEdit}
                                value={sv.barcode}
                                placeholder="Штрихкод"
                                onChange={(e) =>
                                  handleUpdateLiskaniSizeVariant(sv.skuIndex, {
                                    barcode: e.target.value,
                                  })
                                }
                                className="h-7 w-32 rounded-[6px] border border-[#DFDED6] focus:border-[#141413] bg-[#F7F7F4] focus:bg-white px-2 font-mono text-[11px] text-[#5E5D58] disabled:opacity-60"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              {hasCost ? (
                                <input
                                  type="number"
                                  min={0}
                                  step={10}
                                  disabled={!canEdit}
                                  value={sv.unitCostRub}
                                  onChange={(e) =>
                                    handleUpdateLiskaniSizeVariant(sv.skuIndex, {
                                      unitCostRub: Number(e.target.value),
                                    })
                                  }
                                  className="h-7 w-20 rounded-[6px] border border-[#DFDED6] focus:border-[#141413] bg-[#F7F7F4] focus:bg-white px-2 text-right font-mono font-semibold text-[#141413] disabled:opacity-60"
                                />
                              ) : (
                                <span className="font-mono text-[11px] text-[#686762]">Скрыто</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step={10}
                                disabled={!canEdit}
                                value={sv.retailPriceRub}
                                onChange={(e) =>
                                  handleUpdateLiskaniSizeVariant(sv.skuIndex, {
                                    retailPriceRub: Number(e.target.value),
                                  })
                                }
                                className="h-7 w-20 rounded-[6px] border border-[#DFDED6] focus:border-[#141413] bg-[#F7F7F4] focus:bg-white px-2 text-right font-mono font-bold text-[#141413] disabled:opacity-60"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-[#141413]">
                              {liskaniSizeMonthFilter === 'ALL' ? (
                                ordPacks.toLocaleString('ru-RU')
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  disabled={!canEdit}
                                  value={ordPacks}
                                  onChange={(e) =>
                                    handleUpdateLiskaniSizeVariant(sv.skuIndex, {
                                      monthOrderUnitsChange: {
                                        monthIdx: liskaniSizeMonthFilter,
                                        nextOrdersUnits: Number(e.target.value),
                                      },
                                    })
                                  }
                                  className="h-7 w-20 rounded-[6px] border border-[#CECDC4] focus:border-[#141413] bg-white px-2 text-right font-mono font-bold text-[#141413] disabled:opacity-60"
                                />
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[#5E5D58]">
                              {hasFinance ? `${ordRub.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-[#157347]">
                              {buyPacks.toLocaleString('ru-RU')}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-[#157347]">
                              {hasFinance ? `${buyRub.toLocaleString('ru-RU')} ₽` : 'Скрыто'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[#EFEFE9] border-t-[1.5px] border-[#CECDC4] font-mono font-bold text-[#141413]">
                        <td colSpan={7} className="py-2.5 px-3 text-right">
                          ИТОГО ПО ЦВЕТУ ({model.liskaniSizeVariants.length} размеров):
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {model.liskaniSizeVariants
                            .reduce(
                              (s, v) =>
                                s +
                                (liskaniSizeMonthFilter === 'ALL'
                                  ? v.annualOrdersUnits
                                  : v.monthlyOrdersUnits[liskaniSizeMonthFilter] || 0),
                              0
                            )
                            .toLocaleString('ru-RU')}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {hasFinance
                            ? `${model.liskaniSizeVariants
                                .reduce(
                                  (s, v) =>
                                    s +
                                    (liskaniSizeMonthFilter === 'ALL'
                                      ? v.annualOrdersRub
                                      : v.monthlyOrdersRub[liskaniSizeMonthFilter] || 0),
                                  0
                                )
                                .toLocaleString('ru-RU')} ₽`
                            : 'Скрыто'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[#157347]">
                          {model.liskaniSizeVariants
                            .reduce(
                              (s, v) =>
                                s +
                                (liskaniSizeMonthFilter === 'ALL'
                                  ? v.annualBuyoutsUnits
                                  : v.monthlyBuyoutsUnits[liskaniSizeMonthFilter] || 0),
                              0
                            )
                            .toLocaleString('ru-RU')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[#157347]">
                          {hasFinance
                            ? `${(liskaniSizeMonthFilter === 'ALL'
                                ? baseMetrics.annualRevenueRub
                                : baseMetrics.monthlyRevenuesRub[liskaniSizeMonthFilter] || 0
                              ).toLocaleString('ru-RU')} ₽`
                            : 'Скрыто'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Палитры, цвета и варианты модели (100% редактируемые заголовки, цвета, HEX и удаление/добавление) */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-bold text-[#141413]">
                    Цвета, палитры и варианты модели
                    {hasDistinctSecondary
                      ? ` (${model.unitsInPack} ${secondaryUnitShort} в 1 ${primaryUnitShort})`
                      : ` (${primaryUnitShort})`}
                  </h3>
                  <p className="text-[11.5px] text-[#5E5D58]">
                    Все названия палитр, оттенки, HEX-цвета и артикулы редактируются прямо в карточке
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!canEdit) return;
                      const newPal = {
                        id: `pal-${Date.now()}`,
                        title: `Палитра — ${model.title}`,
                        subtitle: hasDistinctSecondary
                          ? `${model.unitsInPack} ${secondaryUnitShort} · ${brandPortfolioLabel}`
                          : `${primaryUnitShort} · ${brandPortfolioLabel}`,
                        statusLabel: 'В плане',
                        colors: [
                          {
                            nameRu: 'Основной цвет #1',
                            hex: '#334155',
                            bandHex: '#1E293B',
                            textHex: '#FFFFFF',
                            pantone: `${model.code} · #1`,
                          },
                        ],
                      };
                      commitWithAudit(
                        { ...model, palettes: [...model.palettes, newPal] },
                        'product',
                        `Добавлена цветовая палитра «${newPal.title}»`,
                        undefined,
                        newPal.title,
                        true
                      );
                    }}
                    className="h-8 px-3 rounded-[8px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Добавить палитру / вариант</span>
                  </button>
                )}
              </div>

              {model.palettes.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[#CECDC4] bg-[#F7F7F4] p-5 text-center text-[13px] text-[#5E5D58]">
                  {canEdit
                    ? 'Цветовые палитры пока не добавлены. Нажмите «+ Добавить палитру / вариант», чтобы задать цвета модели.'
                    : 'Цветовые палитры пока не добавлены.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {model.palettes.map((pal) => (
                    <div
                      key={pal.id}
                      className="rounded-[14px] border-[1.5px] border-[#CECDC4] p-4 space-y-3 bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <input
                            type="text"
                            disabled={!canEdit}
                            value={pal.title}
                            placeholder="Название палитры / карточки"
                            onChange={(e) => {
                              const nextPalettes = model.palettes.map((p) =>
                                p.id === pal.id ? { ...p, title: e.target.value } : p
                              );
                              commitWithAudit(
                                { ...model, palettes: nextPalettes },
                                'product',
                                'Изменено название палитры',
                                pal.title,
                                e.target.value,
                                true
                              );
                            }}
                            className="h-7.5 w-full rounded-[6px] border border-[#DFDED6] focus:border-[#141413] bg-[#F7F7F4] focus:bg-white px-2 text-[13px] font-bold text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                          <input
                            type="text"
                            disabled={!canEdit}
                            value={pal.subtitle}
                            placeholder="Описание комплектации и размеров"
                            onChange={(e) => {
                              const nextPalettes = model.palettes.map((p) =>
                                p.id === pal.id ? { ...p, subtitle: e.target.value } : p
                              );
                              commitWithAudit(
                                { ...model, palettes: nextPalettes },
                                'product',
                                'Изменено описание палитры',
                                pal.subtitle,
                                e.target.value,
                                true
                              );
                            }}
                            className="h-7 w-full rounded-[6px] border border-[#DFDED6] focus:border-[#141413] bg-[#F7F7F4] focus:bg-white px-2 text-[11.5px] text-[#5E5D58] disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="text"
                            disabled={!canEdit}
                            value={pal.statusLabel}
                            onChange={(e) => {
                              const nextPalettes = model.palettes.map((p) =>
                                p.id === pal.id ? { ...p, statusLabel: e.target.value } : p
                              );
                              commitWithAudit(
                                { ...model, palettes: nextPalettes },
                                'product',
                                'Изменён статус палитры',
                                pal.statusLabel,
                                e.target.value
                              );
                            }}
                            className="h-7 w-28 rounded-[6px] bg-[#F4F4F0] border border-[#CECDC4] px-2 text-[10.5px] font-semibold text-[#3F3E3A] text-center disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextPalettes = model.palettes.filter(
                                  (p) => p.id !== pal.id
                                );
                                commitWithAudit(
                                  { ...model, palettes: nextPalettes },
                                  'product',
                                  `Удалена палитра «${pal.title}»`
                                );
                              }}
                              title="Удалить эту палитру"
                              className="h-7 w-7 rounded-[6px] border border-[#FECACA] bg-white hover:bg-[#FEF2F2] text-[#B42318] flex items-center justify-center cursor-pointer transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {pal.colors.map((c, cIdx) => (
                          <div
                            key={`${pal.id}-${cIdx}`}
                            className="relative rounded-[10px] border border-[#DFDED6] p-2 bg-[#F7F7F4] space-y-1.5 group/color"
                          >
                            <div className="flex items-center gap-1.5">
                              <label
                                title={canEdit ? 'Нажмите, чтобы выбрать цвет' : c.nameRu}
                                className={`relative h-7 flex-1 rounded-[6px] border border-black/15 overflow-hidden block ${
                                  canEdit ? 'cursor-pointer' : 'cursor-default'
                                }`}
                                style={{ backgroundColor: c.hex }}
                              >
                                <input
                                  type="color"
                                  disabled={!canEdit}
                                  value={/^#[0-9A-Fa-f]{6}$/.test(c.hex) ? c.hex : '#334155'}
                                  onChange={(e) => {
                                    if (!canEdit) return;
                                    const nextHex = e.target.value;
                                    const nextPalettes = model.palettes.map((p) =>
                                      p.id !== pal.id
                                        ? p
                                        : {
                                            ...p,
                                            colors: p.colors.map((col, idx) =>
                                              idx === cIdx
                                                ? { ...col, hex: nextHex, bandHex: nextHex }
                                                : col
                                            ),
                                          }
                                    );
                                    commitWithAudit(
                                      { ...model, palettes: nextPalettes },
                                      'product',
                                      `Изменён оттенок цвета «${c.nameRu}»`,
                                      c.hex,
                                      nextHex
                                    );
                                  }}
                                  className="opacity-0 inset-0 w-full h-full cursor-pointer disabled:cursor-default"
                                />
                              </label>
                              {canEdit && pal.colors.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextPalettes = model.palettes.map((p) =>
                                      p.id !== pal.id
                                        ? p
                                        : {
                                            ...p,
                                            colors: p.colors.filter((_, idx) => idx !== cIdx),
                                          }
                                    );
                                    commitWithAudit(
                                      { ...model, palettes: nextPalettes },
                                      'product',
                                      `Удалён цвет «${c.nameRu}» из палитры`
                                    );
                                  }}
                                  title="Удалить цвет"
                                  className="h-7 w-6 rounded-[5px] border border-[#DFDED6] bg-white hover:bg-[#FEF2F2] hover:border-[#FECACA] text-[#686762] hover:text-[#B42318] text-[12px] font-bold flex items-center justify-center cursor-pointer"
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            <input
                              type="text"
                              disabled={!canEdit}
                              value={c.nameRu}
                              placeholder="Название цвета"
                              onChange={(e) => {
                                const nextPalettes = model.palettes.map((p) =>
                                  p.id !== pal.id
                                    ? p
                                    : {
                                        ...p,
                                        colors: p.colors.map((col, idx) =>
                                          idx === cIdx
                                            ? { ...col, nameRu: e.target.value }
                                            : col
                                        ),
                                      }
                                );
                                commitWithAudit(
                                  { ...model, palettes: nextPalettes },
                                  'product',
                                  `Изменён цвет #${cIdx + 1} в палитре ${pal.title}`,
                                  c.nameRu,
                                  e.target.value,
                                  true
                                );
                              }}
                              className="w-full h-6.5 px-1.5 rounded border border-[#DED8CC] focus:border-[#141413] bg-white text-[11px] font-semibold text-[#141413] disabled:opacity-60 disabled:cursor-not-allowed"
                            />

                            <input
                              type="text"
                              disabled={!canEdit}
                              value={c.pantone}
                              placeholder="Код / артикул"
                              onChange={(e) => {
                                const nextPalettes = model.palettes.map((p) =>
                                  p.id !== pal.id
                                    ? p
                                    : {
                                        ...p,
                                        colors: p.colors.map((col, idx) =>
                                          idx === cIdx
                                            ? { ...col, pantone: e.target.value }
                                            : col
                                        ),
                                      }
                                );
                                commitWithAudit(
                                  { ...model, palettes: nextPalettes },
                                  'product',
                                  `Изменён код цвета «${c.nameRu}»`,
                                  c.pantone,
                                  e.target.value
                                );
                              }}
                              className="w-full h-6 px-1.5 rounded border border-[#DFDED6] focus:border-[#141413] bg-white text-[10px] font-mono text-[#5E5D58] disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                          </div>
                        ))}

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextIdx = pal.colors.length + 1;
                              const nextPalettes = model.palettes.map((p) =>
                                p.id !== pal.id
                                  ? p
                                  : {
                                      ...p,
                                      colors: [
                                        ...p.colors,
                                        {
                                          nameRu: `Цвет #${nextIdx}`,
                                          hex: '#64748B',
                                          bandHex: '#475569',
                                          textHex: '#FFFFFF',
                                          pantone: `${model.code} · #${nextIdx}`,
                                        },
                                      ],
                                    }
                              );
                              commitWithAudit(
                                { ...model, palettes: nextPalettes },
                                'product',
                                `Добавлен цвет #${nextIdx} в палитру «${pal.title}»`
                              );
                            }}
                            className="rounded-[10px] border border-dashed border-[#CECDC4] hover:border-[#141413] bg-white hover:bg-[#F7F7F4] p-2 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#3F3E3A] hover:text-[#141413] min-h-[86px] cursor-pointer transition"
                          >
                            <Plus className="h-4 w-4" />
                            <span>+ Цвет</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Фабричные PDF */}
            <div className="rounded-[16px] bg-[#FAF8F4] border border-[#E6E0D4] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#8B6F47]" />
                  <h3 className="text-[14px] font-bold text-[#1D1D1F]">
                    Фабричные файлы и техкарты PDF ({(model.attachedPdfs || []).length})
                  </h3>
                </div>

                {canEdit && (
                  <label className="h-8 px-3 rounded-[9px] bg-white hover:bg-[#EFECE4] border border-[#DED8CC] text-[12px] font-semibold text-[#1D1D1F] inline-flex items-center gap-1.5 cursor-pointer transition">
                    <Plus className="h-3.5 w-3.5" />
                    <span>Прикрепить PDF фабрики</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleUploadFactoryPdf}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {(model.attachedPdfs || []).length === 0 ? (
                <div className="text-[12.5px] text-[#6E6E73]">
                  К модели пока не прикреплён исходный PDF-файл техкарты.
                </div>
              ) : (
                <div className="space-y-2">
                  {(model.attachedPdfs || []).map((pdf) => {
                    const url =
                      pdfUrlsById[pdf.id] ||
                      (pdf.staticUrl ? resolvePublicAssetUrl(pdf.staticUrl) : '');
                    return (
                      <div
                        key={pdf.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-white border border-[#E6E0D4] px-3.5 py-2.5 text-[12.5px]"
                      >
                        <div className="font-medium text-[#1D1D1F] truncate">
                          {pdf.name}{' '}
                          <span className="text-[11px] text-[#6E6E73]">
                            · добавлен {pdf.uploadedAt}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {url && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewPdfId(previewPdfId === pdf.id ? null : pdf.id)
                                }
                                className="h-7 px-2.5 rounded-[8px] bg-[#FAF8F4] hover:bg-[#EFECE4] border border-[#DED8CC] text-[11.5px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>{previewPdfId === pdf.id ? 'Скрыть' : 'Просмотр'}</span>
                              </button>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="h-7 px-2.5 rounded-[8px] bg-[#FAF8F4] hover:bg-[#EFECE4] border border-[#DED8CC] text-[11.5px] font-semibold inline-flex items-center gap-1"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>Открыть</span>
                              </a>
                              <a
                                href={url}
                                download={pdf.name.split('/').pop() || 'techpack.pdf'}
                                className="h-7 px-2.5 rounded-[8px] bg-[#FAF8F4] hover:bg-[#EFECE4] border border-[#DED8CC] text-[11.5px] font-semibold inline-flex items-center gap-1"
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span>Скачать</span>
                              </a>
                            </>
                          )}
                          {!pdf.staticUrl && canEdit && (
                            <button
                              type="button"
                              onClick={() => handleRemovePdf(pdf.id)}
                              className="h-7 w-7 rounded-[8px] hover:bg-[#FFF2F2] text-[#B42318] flex items-center justify-center cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {previewPdfId &&
                    (pdfUrlsById[previewPdfId] ||
                      (model.attachedPdfs || []).find((p) => p.id === previewPdfId)?.staticUrl) && (
                      <iframe
                        title="Предпросмотр фабричной техкарты PDF"
                        src={
                          pdfUrlsById[previewPdfId] ||
                          resolvePublicAssetUrl(
                            (model.attachedPdfs || []).find((p) => p.id === previewPdfId)
                              ?.staticUrl || ''
                          )
                        }
                        className="w-full h-[420px] rounded-[12px] border border-[#DED8CC] bg-white mt-2"
                      />
                    )}
                </div>
              )}
            </div>

            {/* Компактная история изменений */}
            <div className="rounded-[16px] border border-[#E6E0D4] p-4 space-y-2">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#1D1D1F]">
                <History className="h-4 w-4 text-[#6E6E73]" />
                <span>История изменений карточки (v{shared.passportVersion})</span>
              </div>
              <div className="max-h-36 overflow-y-auto divide-y divide-[#EFECE4] text-[12px]">
                {shared.auditHistory.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="py-1.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-[#1D1D1F]">{entry.summary}</span>
                      {entry.beforeValue || entry.afterValue ? (
                        <span className="text-[#6E6E73] ml-1.5">
                          ({entry.beforeValue ? `${entry.beforeValue} → ` : ''}
                          {entry.afterValue})
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-[#8E8A82]">
                      {entry.author} · {entry.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== ВКЛАДКА «ПРОДАЖИ» (Раздел 04 ТЗ, Стр. 4) ==================== */}
        {activeTab === 'sales' && (
          <div className="p-5 md:p-6 space-y-4">
            {/* Верхняя строка вкладки «Продажи»: Источник прогноза («Прогноз — гипотеза» или «На базе истории продаж») + кнопка «Дополнительно» */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-[15px] font-bold text-[#141413]">
                  План продаж на 12 месяцев ({scenario.title} · {scenario.year})
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold border ${
                    actingSkuRef
                      ? 'bg-[#EAF6F0] text-[#157347] border-[#CBEAD9]'
                      : 'bg-[#F6F6F4] text-[#3F3E3A] border-[#CECDC4]'
                  }`}
                >
                  {actingSkuRef ? 'На базе истории продаж' : 'Прогноз — гипотеза'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSalesExtraTools((v) => !v)}
                  className="h-8 px-3 rounded-[8px] bg-[#F5F5F1] hover:border-[#141413] border border-[#CECDC4] text-[12px] font-semibold text-[#141413] cursor-pointer"
                >
                  {showSalesExtraTools ? 'Скрыть дополнительно ▴' : 'График, факт и CSV ▾'}
                </button>
              </div>
            </div>

            {/* БЛОК УПРАВЛЕНИЯ ПРОЦЕНТОМ ВЫКУПА (% ВЫКУПА WB -> ЗАКАЗЫ И ЗАКУПКИ) */}
            <div className="rounded-[14px] bg-[#F8FAFC] border border-[#CBD5E1] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-extrabold text-[#0F172A]">
                      Процент выкупа WB (%) — расчёт заказов и оборотного стока в закупках
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 font-mono text-[11px] font-bold">
                      Коэффициент к заказам ×{baseMetrics.orderMultiplier.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#475569] mt-0.5">
                    При выкупе {baseMetrics.buyoutRatePct}% из 100 заказов выкупаются {baseMetrics.buyoutRatePct} {primaryUnitShort} — система автоматически считает нужный объём заказов и партий закупки.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[30, 33, 35, 57, 75, 88, 100].map((pctPreset) => (
                    <button
                      key={pctPreset}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => handleBuyoutRateChange(pctPreset)}
                      className={`h-8 px-2.5 rounded-[7px] font-mono text-[11.5px] font-bold border cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed ${
                        baseMetrics.buyoutRatePct === pctPreset
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                          : 'bg-white text-[#334155] border-[#CBD5E1] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      {pctPreset}%
                    </button>
                  ))}
                  <div className="relative flex items-center ml-1">
                    <input
                      type="number"
                      min={5}
                      max={100}
                      step={1}
                      disabled={!canEdit}
                      value={baseMetrics.buyoutRatePct}
                      onChange={(e) => handleBuyoutRateChange(Number(e.target.value))}
                      className="h-8 w-20 rounded-[7px] border border-[#0F172A] bg-white px-2.5 pr-6 font-mono text-[13px] font-extrabold text-right text-[#0F172A] disabled:opacity-60"
                    />
                    <span className="absolute right-2 text-[11px] font-bold text-[#64748B] pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                <div className="rounded-[10px] bg-white border border-[#CBD5E1] px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                    1. План выкупов (продажи)
                  </div>
                  <div className="font-mono text-[15px] font-extrabold text-[#0F172A] mt-0.5">
                    {baseMetrics.annualPacks.toLocaleString('ru-RU')}{' '}
                    {primaryUnitShort}
                    {hasFinance ? ` · ${formatMln(baseMetrics.annualRevenueRub)}` : ''}
                  </div>
                </div>

                <div className="rounded-[10px] bg-white border border-emerald-500/40 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-800">
                    2. План заказов (при {baseMetrics.buyoutRatePct}% выкупа · ×{baseMetrics.orderMultiplier.toFixed(2).replace('.', ',')})
                  </div>
                  <div className="font-mono text-[15px] font-extrabold text-emerald-700 mt-0.5">
                    {baseMetrics.annualOrdersPacks.toLocaleString('ru-RU')}{' '}
                    {primaryUnitShort}
                    {hasFinance ? ` · ${formatMln(baseMetrics.annualOrdersRub)}` : ''}
                  </div>
                </div>

                <div className="rounded-[10px] bg-white border border-[#CBD5E1] px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                      3. Потребность в закупках (03 · Закупки)
                    </div>
                    <div className="text-[12px] font-bold text-[#0F172A] mt-0.5">
                      {isModelProcurementByOrdersActive(model)
                        ? `Под заказы ×${baseMetrics.orderMultiplier.toFixed(2).replace('.', ',')} (${procurement.annualDemandPacks.toLocaleString('ru-RU')} ${primaryUnitShort})`
                        : `Под выкупы ×1,00 (${procurement.annualDemandPacks.toLocaleString('ru-RU')} ${primaryUnitShort})`}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      handleToggleProcurementByOrders(
                        !isModelProcurementByOrdersActive(model)
                      )
                    }
                    className={`h-8 px-3 rounded-[8px] text-[11.5px] font-bold border cursor-pointer transition shrink-0 disabled:opacity-60 disabled:cursor-not-allowed ${
                      isModelProcurementByOrdersActive(model)
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-[#F1F5F9] text-[#334155] border-[#CBD5E1] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    {isModelProcurementByOrdersActive(model)
                      ? `✓ С учётом ${baseMetrics.buyoutRatePct}%`
                      : 'Включить × выкупа'}
                  </button>
                </div>
              </div>
            </div>

            {/* Дополнительные инструменты (свёрнуты по умолчанию, чтобы таблица 12 месяцев была максимально чистой) */}
            {showSalesExtraTools && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-[#FAF8F4] border border-[#E6E0D4] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-[9px] bg-[#EFEFE9] border border-[#CECDC4] p-0.5">
                    <button
                      type="button"
                      onClick={() => setSalesViewMode('table')}
                      className={`h-7.5 px-3 rounded-[7px] text-[11.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                        salesViewMode === 'table'
                          ? 'bg-white text-[#1D1D1F] border border-[#CECDC4] shadow-2xs'
                          : 'text-[#5A564F]'
                      }`}
                    >
                      <TableIcon className="h-3.5 w-3.5" />
                      <span>Таблица 12 мес.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSalesViewMode('chart')}
                      className={`h-7.5 px-3 rounded-[7px] text-[11.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                        salesViewMode === 'chart'
                          ? 'bg-white text-[#1D1D1F] border border-[#CECDC4] shadow-2xs'
                          : 'text-[#5A564F]'
                      }`}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span>График</span>
                    </button>
                  </div>

                  <span className="text-[11.5px] text-[#5A564F] px-2">
                    Каналы: <strong>WB {channelSplit.wb}%</strong> · Другие MP{' '}
                    <strong>{channelSplit.otherMp}%</strong> · Сайт{' '}
                    <strong>{channelSplit.website}%</strong>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {hasFinance && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleExportSkuPlan('csv')}
                        className="h-7.5 px-2.5 rounded-[8px] bg-white hover:bg-[#EFECE4] border border-[#DED8CC] text-[11.5px] font-semibold text-[#1D1D1F] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Экспорт CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportSkuPlan('json')}
                        className="h-7.5 px-2.5 rounded-[8px] bg-white hover:bg-[#EFECE4] border border-[#DED8CC] text-[11.5px] font-semibold text-[#1D1D1F] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Экспорт JSON</span>
                      </button>
                    </>
                  )}
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => importPlanInputRef.current?.click()}
                        className="h-7.5 px-2.5 rounded-[8px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#1D1D1F] border border-[#DED8CC] text-[11.5px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Импорт плана</span>
                      </button>
                      <input
                        ref={importPlanInputRef}
                        type="file"
                        accept=".json,.csv"
                        onChange={handleImportSkuPlanFile}
                        className="hidden"
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {salesViewMode === 'chart' && showSalesExtraTools ? (
              <div className="rounded-[16px] bg-[#FAF8F4] border border-[#E6E0D4] p-5 space-y-4">
                <div className="flex items-center justify-between text-[12.5px] text-[#5A564F]">
                  <span>
                    {hasFinance
                      ? `Помесячная динамика выручки и выкупов (${scenario.title} · ${scenario.year})`
                      : `Помесячная динамика выкупов (${scenario.title} · ${scenario.year})`}
                  </span>
                  <strong>
                    Итоги за год:{' '}
                    {hasFinance
                      ? formatMln(pnl.annualRevenueRub)
                      : `${baseMetrics.annualPacks.toLocaleString('ru-RU')} ${primaryUnitShort}`}
                  </strong>
                </div>
                <div className="grid grid-cols-12 gap-2 items-end h-52 pt-4">
                  {MONTHS_SHORT_RU.map((mLabel, mIdx) => {
                    const rev = baseMetrics.monthlyRevenuesRub[mIdx] || 0;
                    const packs = plan.monthlyPacks[mIdx] || 0;
                    const hPct = Math.max(
                      4,
                      Math.round(
                        ((hasFinance ? rev : packs) /
                          (hasFinance ? maxSalesBarRub : maxSalesBarPacks)) *
                          100
                      )
                    );
                    return (
                      <div
                        key={mLabel}
                        className="flex flex-col items-center justify-end h-full gap-1.5"
                      >
                        <span className="text-[10px] font-semibold text-[#4E4A42]">
                          {hasFinance
                            ? `${(rev / 1_000_000).toFixed(1)}м`
                            : packs.toLocaleString('ru-RU')}
                        </span>
                        <div
                          style={{ height: `${hPct}%` }}
                          className="w-full max-w-[34px] rounded-t-[8px] bg-emerald-600/85 transition-all"
                          title={
                            hasFinance
                              ? `${mLabel}: ${packs.toLocaleString('ru-RU')} ${primaryUnitShort} = ${formatRub(rev)}`
                              : `${mLabel}: ${packs.toLocaleString('ru-RU')} ${primaryUnitShort}`
                          }
                        />
                        <span className="text-[11px] font-semibold text-[#1D1D1F]">
                          {mLabel}
                        </span>
                        <span className="text-[10px] text-[#6E6E73]">
                          {packs} {primaryUnitShort}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* ЧИСТАЯ ТАБЛИЦА 12 МЕСЯЦЕВ (Стр. 4 ТЗ): Месяц · Цена, ₽ · Выкупы · Заказы (с учётом % выкупа) · Выручка выкупов, ₽ + Итоги за год */
              <div className="overflow-x-auto rounded-[16px] border-[1.5px] border-[#C8C7BE]">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-[#F7F7F4] border-b-[1.5px] border-[#DFDED6] text-[11px] uppercase tracking-wider text-[#5E5D58]">
                      <th className="py-2.5 px-4">Месяц</th>
                      <th className="py-2.5 px-4">Цена, ₽</th>
                      <th className="py-2.5 px-4">Выкупы ({primaryUnitShort})</th>
                      <th className="py-2.5 px-4">
                        Заказы (при {baseMetrics.buyoutRatePct}% выкупа)
                      </th>
                      <th className="py-2.5 px-4">Сумма заказов, ₽</th>
                      <th className="py-2.5 px-4">Выручка, ₽</th>
                      {showSalesExtraTools && (
                        <>
                          <th className="py-2.5 px-4">
                            Факт выкупов ({primaryUnitShort})
                          </th>
                          <th className="py-2.5 px-4">Статус</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE4]">
                    {MONTHS_SHORT_RU.map((mLabel, mIdx) => {
                      const planPacks = plan.monthlyPacks[mIdx] || 0;
                      const planUnits = planPacks * model.unitsInPack;
                      const planOrdersPacks = baseMetrics.monthlyOrdersPacks[mIdx] || 0;
                      const planOrdersRub = baseMetrics.monthlyOrdersRub[mIdx] || 0;
                      const planPrice =
                        plan.monthlyPricesRub[mIdx] ?? model.retailPriceRub;
                      const planRev = baseMetrics.monthlyRevenuesRub[mIdx] || 0;
                      const actRec = shared.actualSalesByMonth[mIdx];
                      const actPacks = actRec?.actualBuyoutsPacks ?? null;
                      const rowStatus: ValueStatusCode =
                        actPacks !== null ? 'fact' : pnl.revenueStatus;

                      return (
                        <tr key={mLabel} className="hover:bg-[#F7F7F4]/70">
                          <td className="py-2 px-4 font-semibold text-[#141413]">
                            {mLabel} {scenario.year}
                          </td>
                          <td className="py-2 px-4">
                            <div className="inline-flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                step={10}
                                disabled={!canEdit}
                                value={planPrice}
                                onChange={(e) => {
                                  if (!canEdit) return;
                                  const val = Math.max(
                                    0,
                                    Math.round(Number(e.target.value))
                                  );
                                  const updatedModel = updateModelScenarioSingleMonthPrice(
                                    model,
                                    scenario.id,
                                    mIdx,
                                    val
                                  );
                                  commitWithAudit(
                                    updatedModel,
                                    'sales',
                                    `Изменена цена ${mLabel} (${scenario.title})`,
                                    `${planPrice} ₽`,
                                    `${val} ₽`
                                  );
                                }}
                                className="h-7.5 w-24 rounded-[7px] border border-[#CECDC4] bg-white px-2 font-mono font-semibold text-[#141413] disabled:opacity-60"
                              />
                              <span className="text-[11px] text-[#5E5D58]">₽</span>
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="inline-flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                step={50}
                                disabled={!canEdit}
                                value={planPacks}
                                onChange={(e) =>
                                  handleMonthBuyoutsChange(mIdx, Number(e.target.value))
                                }
                                className="h-7.5 w-28 rounded-[7px] border border-[#CECDC4] bg-white px-2 font-mono font-bold text-[#141413] disabled:opacity-60"
                              />
                              <span className="text-[11.5px] text-[#5E5D58]">
                                {primaryUnitShort}
                                {hasDistinctSecondary
                                  ? ` (${planUnits.toLocaleString('ru-RU')} ${secondaryUnitShort})`
                                  : ''}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="inline-flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                step={50}
                                disabled={!canEdit}
                                value={planOrdersPacks}
                                onChange={(e) =>
                                  handleMonthOrdersChange(mIdx, Number(e.target.value))
                                }
                                className="h-7.5 w-28 rounded-[7px] border border-emerald-600/40 bg-emerald-50/40 px-2 font-mono font-bold text-emerald-800 disabled:opacity-60"
                              />
                              <span className="text-[11.5px] text-[#5E5D58]">
                                {primaryUnitShort}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-4 font-mono font-semibold text-[#475569]">
                            {hasFinance ? formatRub(planOrdersRub) : 'Скрыто'}
                          </td>
                          <td className="py-2 px-4 font-mono font-bold text-[#141413]">
                            {hasFinance ? formatRub(planRev) : 'Скрыто'}
                          </td>
                          {showSalesExtraTools && (
                            <>
                              <td className="py-2 px-4">
                                <input
                                  type="number"
                                  min={0}
                                  disabled={!canEdit}
                                  placeholder="Не заполнено"
                                  value={actPacks === null ? '' : actPacks}
                                  onChange={(e) =>
                                    handleMonthActualSaleChange(mIdx, e.target.value)
                                  }
                                  className="h-7.5 w-28 rounded-[7px] border border-[#DED8CC] bg-[#FAF8F4] px-2 text-[12px] disabled:opacity-60"
                                />
                              </td>
                              <td className="py-2 px-4">
                                <StatusPill status={rowStatus} />
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#F7F7F4] border-t-[1.5px] border-[#C8C7BE] font-bold text-[#141413]">
                      <td className="py-3 px-4">Итоги за год ({scenario.year})</td>
                      <td className="py-3 px-4 font-mono">
                        ср. {formatRub(pnl.avgRealizedPricePerPackRub)}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {baseMetrics.annualPacks.toLocaleString('ru-RU')}{' '}
                        {primaryUnitShort}
                        {hasDistinctSecondary
                          ? ` (${baseMetrics.annualUnits.toLocaleString('ru-RU')} ${secondaryUnitShort})`
                          : ''}
                      </td>
                      <td className="py-3 px-4 font-mono text-emerald-700">
                        {baseMetrics.annualOrdersPacks.toLocaleString('ru-RU')}{' '}
                        {primaryUnitShort} (×{baseMetrics.orderMultiplier.toFixed(2).replace('.', ',')})
                      </td>
                      <td className="py-3 px-4 font-mono text-[#334155]">
                        {hasFinance
                          ? `${formatRub(baseMetrics.annualOrdersRub)} (${formatMln(baseMetrics.annualOrdersRub)})`
                          : 'Скрыто'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[14px]">
                        {hasFinance
                          ? `${formatRub(baseMetrics.annualRevenueRub)} (${formatMln(baseMetrics.annualRevenueRub)})`
                          : 'Скрыто'}
                      </td>
                      {showSalesExtraTools && <td className="py-3 px-4" colSpan={2} />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================== ВКЛАДКА «ЗАКУПКИ» (Раздел 06 ТЗ, Стр. 6) ==================== */}
        {activeTab === 'procurement' && (
          <div className="p-4 md:p-6">
            <SkuProcurementMvpWorkbench
              key={model.id}
              model={model}
              currentScenario={scenario}
              onUpdateModel={onUpdateModel}
              onNotify={(title, message, type = 'success') => notify(type, title, message)}
              onOpenSalesMatrix={() => setActiveTab('sales')}
            />
          </div>
        )}

        {/* ==================== ВКЛАДКА «ФИНАНСЫ» (Раздел 05 ТЗ, Стр. 5 и 6) ==================== */}
        {activeTab === 'finance' && hasFinance && (
          <div className="p-5 md:p-6 space-y-6">
            {/* БАННЕР АВТОЗАПОЛНЕНИЯ НОРМАТИВОВ WB В 1 КЛИК (если у модели-гипотезы не заполнена логистика / комиссия / себестоимость) */}
            {(!pnl.logisticsFilled || !pnl.expensesFilled || pnl.unitCostPerPackRub === null) && (
              <div className="rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-[13.5px] font-semibold text-[#141413] inline-flex items-center gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-[#5C5953]" strokeWidth={1.5} />
                    <span>Быстрое заполнение юнит-экономики по нормативам категории WB</span>
                  </div>
                  <p className="text-[12px] text-[#5C5953]">
                    Применить отраслевые нормативы для бренда {brandPortfolioLabel} (комиссия WB{' '}
                    {getCategoryWbNormsForBrand(model).marketplaceFeePct}%, логистика{' '}
                    {getCategoryWbNormsForBrand(model).logisticsRub} ₽, реклама ДРР{' '}
                    {getCategoryWbNormsForBrand(model).adsPct}%, OPEX{' '}
                    {getCategoryWbNormsForBrand(model).allocatedFixedOpexRubPerPack} ₽/{primaryUnitShort}) и сразу рассчитать чистую прибыль.
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = applyCategoryWbUnitEconomics(model, {
                        fillMissingCost: true,
                        forceOverwriteRates: true,
                      });
                      commitWithAudit(
                        updated,
                        'finance',
                        'Применены отраслевые нормативы юнит-экономики WB (комиссия, логистика, ДРР, OPEX)',
                        'Не заполнено',
                        `WB ${updated.marketplaceFeePct}% · Лог. ${updated.logisticsRub} ₽ · ДРР ${updated.adsPct}%`
                      );
                      notify(
                        'success',
                        'Юнит-экономика WB заполнена',
                        `Комиссия ${updated.marketplaceFeePct}%, логистика ${updated.logisticsRub} ₽, ДРР ${updated.adsPct}%`
                      );
                    }}
                    className="h-9 px-4 rounded-lg bg-[#141413] hover:bg-[#282724] text-white text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <span>Заполнить отраслевые нормативы WB</span>
                  </button>
                )}
              </div>
            )}

            {/* ВЕРХНЯЯ СЕТКА: БЛОК А (Сколько остаётся с одной ед.) + БЛОК Б (Результат за выбранный период) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* БЛОК А. Сколько остаётся с одного комплекта (Стр. 5 ТЗ) */}
              <div className="lg:col-span-6 rounded-xl bg-white border border-[#E4E1DA] p-4 md:p-5 space-y-3 shadow-[0_1px_2px_rgba(20,20,19,0.04)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E1DA] pb-2.5">
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#141413]">
                      {primaryUnitShort === 'компл.'
                        ? 'Блок А. Сколько остаётся с одного комплекта'
                        : `Блок А. Сколько остаётся с 1 ед. (${primaryUnitShort})`}
                    </h3>
                    <p className="text-[11.5px] text-[#5C5953]">
                      Последовательный расчёт расходов на 1 {primaryUnitShort}
                      {hasDistinctSecondary
                        ? ` (${model.unitsInPack} ${secondaryUnitShort})`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit &&
                      (!pnl.logisticsFilled ||
                        !pnl.expensesFilled ||
                        pnl.unitCostPerPackRub === null) && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = applyCategoryWbUnitEconomics(model, {
                              fillMissingCost: true,
                              forceOverwriteRates: true,
                            });
                            commitWithAudit(
                              updated,
                              'finance',
                              'Автозаполнение нормативов WB',
                              'Не заполнено',
                              `${updated.marketplaceFeePct}% / ${updated.logisticsRub} ₽`
                            );
                          }}
                          className="h-7 px-2.5 rounded-md bg-[#FAF9F6] hover:bg-[#EFECE6] border border-[#E4E1DA] text-[#141413] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <SlidersHorizontal className="h-3 w-3" strokeWidth={1.5} />
                          <span>Авто-нормы WB</span>
                        </button>
                      )}
                    <StatusPill status={pnl.operatingProfitStatus} />
                  </div>
                </div>

                <div className="divide-y divide-[#EFECE4] text-[13px]">
                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#141413]">
                      {primaryUnitShort === 'компл.'
                        ? 'Цена продажи комплекта'
                        : `Цена продажи (${primaryUnitShort})`}
                    </span>
                    <span className="font-mono font-bold text-[#141413]">
                      {formatRub(pnl.avgRealizedPricePerPackRub)}
                    </span>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-[#3F3E3A]">Закупочная себестоимость</span>
                    {!hasCost ? (
                      <span className="font-semibold text-[#64748B]">Скрыто</span>
                    ) : pnl.unitCostPerPackRub !== null ? (
                      <span className="font-mono font-semibold text-[#141413]">
                        −{formatRub(pnl.unitCostPerPackRub)}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#B91C1C]">Не заполнено</span>
                    )}
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-[#3F3E3A]">
                      Комиссия маркетплейса, % ({model.marketplaceFeePct}%)
                    </span>
                    {pnl.unitMpCommissionRub !== null ? (
                      <span className="font-mono font-semibold text-[#141413]">
                        −{formatRub(pnl.unitMpCommissionRub)}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#B91C1C]">Не заполнено</span>
                    )}
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-[#3F3E3A]">Доставка и обработка заказа</span>
                    {pnl.logisticsFilled && pnl.unitLogisticsRub !== null ? (
                      <span className="font-mono font-semibold text-[#141413]">
                        −{formatRub(pnl.unitLogisticsRub)}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#B91C1C]">Не заполнено</span>
                    )}
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-[#3F3E3A]">
                      Реклама, % от выручки ({model.adsPct}%)
                    </span>
                    {pnl.unitAdsRub !== null ? (
                      <span className="font-mono font-semibold text-[#141413]">
                        −{formatRub(pnl.unitAdsRub)}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#B91C1C]">Не заполнено</span>
                    )}
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-[#3F3E3A]">Прочие расходы на продажу</span>
                    {pnl.unitOtherVarRub !== null ? (
                      <span className="font-mono font-semibold text-[#141413]">
                        −{formatRub(pnl.unitOtherVarRub)}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#B91C1C]">Не заполнено</span>
                    )}
                  </div>

                  <div className="py-2 flex items-center justify-between gap-2">
                    <span className="text-[#3F3E3A]">
                      Постоянные расходы (доля на 1 {primaryUnitShort})
                    </span>
                    {pnl.unitAllocatedOpexRub !== null ? (
                      <span className="font-mono font-semibold text-[#141413]">
                        −{formatRub(pnl.unitAllocatedOpexRub)}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#B91C1C]">Не заполнено</span>
                    )}
                  </div>

                  {/* Итог Блока А */}
                  <div className="pt-3 mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#141413]">
                      {primaryUnitShort === 'компл.'
                        ? 'Остаётся с продажи комплекта'
                        : `Остаётся с продажи (${primaryUnitShort})`}
                    </span>
                    {!hasCost ? (
                      <span className="font-mono text-[15px] font-bold text-[#64748B]">
                        Скрыто
                      </span>
                    ) : pnl.unitOperatingProfitRub !== null ? (
                      <span
                        className={`font-mono text-[17px] font-extrabold ${
                          pnl.unitOperatingProfitRub >= 0
                            ? 'text-[#157347]'
                            : 'text-[#B42318]'
                        }`}
                      >
                        {pnl.unitOperatingProfitRub >= 0 ? '+' : ''}
                        {formatRub(pnl.unitOperatingProfitRub)}
                      </span>
                    ) : (
                      <span className="text-[13px] font-bold text-[#B91C1C]">
                        {!pnl.logisticsFilled && pnl.unitCostPerPackRub !== null
                          ? 'Не рассчитано, пока не заполнена логистика'
                          : pnl.operatingProfitNotCalculatedReason}
                      </span>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-[#5E5D58]">
                      Сколько остаётся после расходов на продажу, %
                    </span>
                    <span className="font-mono font-bold text-[#141413]">
                      {!hasCost
                        ? 'Скрыто'
                        : pnl.operatingMarginPct !== null
                          ? `${pnl.operatingMarginPct}%`
                          : 'Не рассчитано'}
                    </span>
                  </div>
                </div>
              </div>

              {/* БЛОК Б. Результат за выбранный период (переключатель «Месяц / Год», Стр. 5 ТЗ) */}
              <div className="lg:col-span-6 rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 md:p-5 flex flex-col justify-between space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFECE4] pb-2.5">
                  <div>
                    <h3 className="text-[15px] font-bold text-[#141413]">
                      Блок Б. Результат за выбранный период
                    </h3>
                    <p className="text-[11.5px] text-[#5E5D58]">
                      {financePeriodMode === 'month'
                        ? `Месяц: ${MONTHS_SHORT_RU[selectedMonthIdx]} ${scenario.year} (${periodPacks.toLocaleString('ru-RU')} ${primaryUnitShort})`
                        : `Весь ${scenario.year} год (${periodPacks.toLocaleString('ru-RU')} ${primaryUnitShort})`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {financePeriodMode === 'month' && (
                      <select
                        value={selectedMonthIdx}
                        onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}
                        className="h-8 px-2 rounded-[8px] bg-[#F5F5F1] border border-[#CECDC4] text-[12px] font-bold text-[#141413] cursor-pointer"
                      >
                        {MONTHS_SHORT_RU.map((mName, idx) => (
                          <option key={mName} value={idx}>
                            {mName}
                          </option>
                        ))}
                      </select>
                    )}

                    <div className="inline-flex rounded-[9px] bg-[#EFEFE9] border border-[#CECDC4] p-0.5">
                      <button
                        type="button"
                        onClick={() => setFinancePeriodMode('month')}
                        className={`h-7.5 px-3 rounded-[7px] text-[12px] font-semibold cursor-pointer ${
                          financePeriodMode === 'month'
                            ? 'bg-white text-[#141413] border border-[#CECDC4] shadow-2xs'
                            : 'text-[#3F3E3A]'
                        }`}
                      >
                        Месяц
                      </button>
                      <button
                        type="button"
                        onClick={() => setFinancePeriodMode('year')}
                        className={`h-7.5 px-3 rounded-[7px] text-[12px] font-semibold cursor-pointer ${
                          financePeriodMode === 'year'
                            ? 'bg-white text-[#141413] border border-[#CECDC4] shadow-2xs'
                            : 'text-[#3F3E3A]'
                        }`}
                      >
                        Год
                      </button>
                    </div>
                  </div>
                </div>

                {/* Четыре показателя Блока Б */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-[12px] bg-[#F7F7F4] border border-[#DFDED6] p-3.5 space-y-1">
                    <span className="text-[11.5px] font-semibold text-[#5E5D58]">
                      1. Выручка
                    </span>
                    <div className="font-mono text-[19px] font-bold text-[#141413]">
                      {formatMln(periodRevenueRub)}
                    </div>
                    <div className="text-[11px] text-[#5E5D58]">
                      {formatRub(periodRevenueRub)} · {periodPacks.toLocaleString('ru-RU')}{' '}
                      {primaryUnitShort}
                    </div>
                  </div>

                  <div className="rounded-[12px] bg-[#F7F7F4] border border-[#DFDED6] p-3.5 space-y-1">
                    <span className="text-[11.5px] font-semibold text-[#5E5D58]">
                      2. Стоимость проданного товара
                    </span>
                    {!hasCost ? (
                      <div className="text-[15px] font-bold text-[#64748B] pt-1">
                        Скрыто
                      </div>
                    ) : periodCogsRub !== null ? (
                      <>
                        <div className="font-mono text-[19px] font-bold text-[#141413]">
                          {formatMln(periodCogsRub)}
                        </div>
                        <div className="text-[11px] text-[#5E5D58]">
                          {formatRub(periodCogsRub)} (по {formatRub(pnl.unitCostPerPackRub || 0)}/
                          {primaryUnitShort})
                        </div>
                      </>
                    ) : (
                      <div className="text-[14px] font-bold text-[#B91C1C] pt-1">
                        Не заполнено
                      </div>
                    )}
                  </div>

                  <div className="rounded-[12px] bg-[#F7F7F4] border border-[#DFDED6] p-3.5 space-y-1">
                    <span className="text-[11.5px] font-semibold text-[#5E5D58]">
                      3. Удержания WB, логистика и реклама
                    </span>
                    {periodSalesAndWorkExpenseRub !== null ? (
                      <>
                        <div className="font-mono text-[19px] font-bold text-[#141413]">
                          {formatMln(periodSalesAndWorkExpenseRub)}
                        </div>
                        <div className="text-[11px] text-[#5E5D58]">
                          {formatRub(periodSalesAndWorkExpenseRub)} (комиссия WB, доставка, реклама, постоянные)
                        </div>
                      </>
                    ) : (
                      <div className="text-[13px] font-bold text-[#B91C1C] pt-1">
                        Не рассчитано, пока не заполнена логистика
                      </div>
                    )}
                  </div>

                  <div className="rounded-[12px] bg-[#F7F7F4] border border-[#DFDED6] p-3.5 space-y-1">
                    <span className="text-[11.5px] font-semibold text-[#5E5D58]">
                      4. Расчётная операционная прибыль
                    </span>
                    {!hasCost ? (
                      <div className="text-[15px] font-bold text-[#64748B] pt-1">
                        Скрыто
                      </div>
                    ) : periodOperatingProfitRub !== null ? (
                      <>
                        <div
                          className={`font-mono text-[19px] font-bold ${
                            periodOperatingProfitRub >= 0
                              ? 'text-[#157347]'
                              : 'text-[#B42318]'
                          }`}
                        >
                          {formatMln(periodOperatingProfitRub)}
                        </div>
                        <div className="text-[11px] text-[#5E5D58]">
                          {formatRub(periodOperatingProfitRub)} · остаётся {pnl.operatingMarginPct}%
                        </div>
                      </>
                    ) : (
                      <div className="text-[13px] font-bold text-[#B91C1C] pt-1">
                        {!pnl.logisticsFilled && pnl.unitCostPerPackRub !== null
                          ? 'Не рассчитано, пока не заполнена логистика'
                          : pnl.operatingProfitNotCalculatedReason}
                      </div>
                    )}
                  </div>
                </div>

                {/* Кнопка открытия Блока В («Показать подробный расчёт», Стр. 5 ТЗ) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[11.5px] text-[#5E5D58]">
                    Чтобы изменить комиссию маркетплейса, логистику, рекламу или постоянные расходы — откройте подробный расчёт.
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDetailedFinanceCalc((v) => !v)}
                    className="h-8.5 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:bg-[#EAE9E2] text-[#141413] border border-[#CECDC4] text-[12px] font-semibold cursor-pointer shrink-0"
                  >
                    {showDetailedFinanceCalc
                      ? 'Скрыть подробный расчёт ▴'
                      : 'Показать подробный расчёт ▾'}
                  </button>
                </div>
              </div>
            </div>

            {/* БЛОК В. Подробности (свёрнут по умолчанию, раскрывается по кнопке «Показать подробный расчёт», Стр. 5 ТЗ) */}
            {showDetailedFinanceCalc && (
              <div className="rounded-[16px] bg-[#FAF8F4] border-[1.5px] border-[#C8C7BE] p-4 md:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-[14px] font-bold text-[#141413]">
                      Блок В. Настройка исходных расходов и таблица «Доходы и расходы»
                    </h4>
                    <p className="text-[11.5px] text-[#5E5D58]">
                      Все поля редактируемые. Если логистика не заполнена — система честно пишет «Не рассчитано, пока не заполнена логистика».
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = applyCategoryWbUnitEconomics(model, {
                            fillMissingCost: true,
                            forceOverwriteRates: true,
                          });
                          commitWithAudit(
                            updated,
                            'finance',
                            'Применены отраслевые нормативы WB в Блоке В',
                            `${model.marketplaceFeePct}% / ${model.logisticsRub} ₽`,
                            `${updated.marketplaceFeePct}% / ${updated.logisticsRub} ₽`
                          );
                          notify('success', 'Применены отраслевые нормативы WB');
                        }}
                        className="h-8 px-3 rounded-lg bg-[#141413] hover:bg-[#282724] text-white text-[11.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
                        <span>Применить нормативы WB</span>
                      </button>
                      {model.logisticsRub > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            commitWithAudit(
                              { ...model, logisticsRub: 0 },
                              'finance',
                              'Очищено поле логистики (проверка защиты от ложной прибыли)',
                              `${model.logisticsRub} ₽`,
                              'Не заполнено'
                            )
                          }
                          className="h-8 px-3 rounded-[8px] bg-white hover:bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-[11.5px] font-semibold cursor-pointer"
                        >
                          Очистить поле логистики
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Редактируемые поля с человеческими названиями и пояснением под каждым полем */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-[12px]">
                  <label className="rounded-[10px] bg-white border border-[#DED8CC] p-2.5 space-y-1">
                    <span className="font-semibold text-[#141413] block">
                      Закупочная себестоимость, ₽
                    </span>
                    {!hasCost ? (
                      <div className="h-8 w-full rounded-[7px] border border-[#CECDC4] bg-[#F7F7F4] px-2 flex items-center font-semibold text-[#64748B]">
                        Скрыто
                      </div>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        step={10}
                        disabled={!canEdit}
                        value={model.unitCostRub > 0 ? model.unitCostRub : ''}
                        placeholder="Не заполнено"
                        onChange={(e) => handleUnitCostChange(Number(e.target.value))}
                        className="h-8 w-full rounded-[7px] border border-[#CECDC4] bg-[#F7F7F4] px-2 font-mono font-bold text-[#141413] disabled:opacity-60"
                      />
                    )}
                    <span className="text-[10.5px] text-[#6E6E73] block">
                      Цена фабрики с доставкой в РФ за 1 {primaryUnitShort}
                    </span>
                  </label>

                  <label className="rounded-[10px] bg-white border border-[#DED8CC] p-2.5 space-y-1">
                    <span className="font-semibold text-[#141413] block">
                      Комиссия маркетплейса, %
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      step={0.5}
                      disabled={!canEdit}
                      value={model.marketplaceFeePct}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value));
                        commitWithAudit(
                          {
                            ...model,
                            marketplaceFeePct: val,
                            sharedSupplyAndFact: {
                              ...shared,
                              expensesFilled:
                                val > 0 || model.logisticsRub > 0 || model.adsPct > 0,
                            },
                          },
                          'finance',
                          'Обновлена комиссия маркетплейса, %',
                          `${model.marketplaceFeePct}%`,
                          `${val}%`
                        );
                      }}
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] bg-[#F7F7F4] px-2 font-mono font-bold text-[#141413] disabled:opacity-60"
                    />
                    <span className="text-[10.5px] text-[#6E6E73] block">
                      Удержание площадки с цены продажи
                    </span>
                  </label>

                  <label className="rounded-[10px] bg-white border border-[#DED8CC] p-2.5 space-y-1">
                    <span className="font-semibold text-[#141413] block">
                      Доставка и обработка заказа, ₽
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      disabled={!canEdit}
                      value={model.logisticsRub > 0 ? model.logisticsRub : ''}
                      placeholder="Не заполнено"
                      onChange={(e) => {
                        const raw = e.target.value;
                        const val =
                          raw.trim() === ''
                            ? 0
                            : Math.max(0, Math.round(Number(raw)));
                        commitWithAudit(
                          {
                            ...model,
                            logisticsRub: val,
                            sharedSupplyAndFact: {
                              ...shared,
                              expensesFilled:
                                val > 0 || model.marketplaceFeePct > 0 || model.adsPct > 0,
                            },
                          },
                          'finance',
                          'Обновлена доставка и обработка заказа',
                          model.logisticsRub > 0 ? `${model.logisticsRub} ₽` : 'Не заполнено',
                          val > 0 ? `${val} ₽` : 'Не заполнено'
                        );
                      }}
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] bg-[#F7F7F4] px-2 font-mono font-bold text-[#141413] disabled:opacity-60"
                    />
                    <span className="text-[10.5px] text-[#6E6E73] block">
                      Логистика WB до клиента с учётом возвратов
                    </span>
                  </label>

                  <label className="rounded-[10px] bg-white border border-[#DED8CC] p-2.5 space-y-1">
                    <span className="font-semibold text-[#141413] block">
                      Реклама, % от выручки
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      disabled={!canEdit}
                      value={model.adsPct}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value));
                        commitWithAudit(
                          {
                            ...model,
                            adsPct: val,
                            sharedSupplyAndFact: {
                              ...shared,
                              expensesFilled:
                                val > 0 || model.marketplaceFeePct > 0 || model.logisticsRub > 0,
                            },
                          },
                          'finance',
                          'Обновлена реклама, % от выручки',
                          `${model.adsPct}%`,
                          `${val}%`
                        );
                      }}
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] bg-[#F7F7F4] px-2 font-mono font-bold text-[#141413] disabled:opacity-60"
                    />
                    <span className="text-[10.5px] text-[#6E6E73] block">
                      Доля рекламных расходов от цены 1 {primaryUnitShort}
                    </span>
                  </label>

                  <label className="rounded-[10px] bg-white border border-[#DED8CC] p-2.5 space-y-1">
                    <span className="font-semibold text-[#141413] block">
                      Прочие расходы на продажу, ₽
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      disabled={!canEdit}
                      value={shared.otherVariableRubPerPack}
                      onChange={(e) => {
                        const val = Math.max(0, Math.round(Number(e.target.value)));
                        commitWithAudit(
                          {
                            ...model,
                            sharedSupplyAndFact: {
                              ...shared,
                              otherVariableRubPerPack: val,
                            },
                          },
                          'finance',
                          'Обновлены прочие расходы на продажу',
                          `${shared.otherVariableRubPerPack} ₽`,
                          `${val} ₽`
                        );
                      }}
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] bg-[#F7F7F4] px-2 font-mono font-bold text-[#141413] disabled:opacity-60"
                    />
                    <span className="text-[10.5px] text-[#6E6E73] block">
                      Упаковка, маркировка «Честный знак», брак
                    </span>
                  </label>

                  <label className="rounded-[10px] bg-white border border-[#DED8CC] p-2.5 space-y-1">
                    <span className="font-semibold text-[#141413] block">
                      Постоянные расходы, ₽
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      disabled={!canEdit}
                      value={
                        shared.allocatedFixedOpexRubPerPack === null
                          ? ''
                          : shared.allocatedFixedOpexRubPerPack
                      }
                      placeholder="Не задано"
                      onChange={(e) => {
                        const raw = e.target.value;
                        const val =
                          raw.trim() === ''
                            ? null
                            : Math.max(0, Math.round(Number(raw)));
                        commitWithAudit(
                          {
                            ...model,
                            sharedSupplyAndFact: {
                              ...shared,
                              allocatedFixedOpexRubPerPack: val,
                            },
                          },
                          'finance',
                          `Обновлены постоянные расходы на 1 ${primaryUnitShort}`,
                          shared.allocatedFixedOpexRubPerPack === null
                            ? 'Не задано'
                            : `${shared.allocatedFixedOpexRubPerPack} ₽`,
                          val === null ? 'Не задано' : `${val} ₽`
                        );
                      }}
                      className="h-8 w-full rounded-[7px] border border-[#CECDC4] bg-[#F7F7F4] px-2 font-mono font-bold text-[#141413] disabled:opacity-60"
                    />
                    <span className="text-[10.5px] text-[#6E6E73] block">
                      Доля команды, офиса и сервисов на 1 {primaryUnitShort}
                    </span>
                  </label>
                </div>

                {/* Подробная таблица «Доходы и расходы» */}
                <div className="overflow-x-auto rounded-[12px] border border-[#DED8CC] bg-white">
                  <table className="w-full text-left border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-[#F7F7F4] border-b border-[#DED8CC] text-[11px] uppercase text-[#5E5D58]">
                        <th className="py-2 px-3">Статья доходов и расходов</th>
                        <th className="py-2 px-3">Как считается</th>
                        <th className="py-2 px-3">На 1 {primaryUnitShort}</th>
                        <th className="py-2 px-3">За {scenario.year} год</th>
                        <th className="py-2 px-3">Доля от выручки</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFECE4]">
                      <tr>
                        <td className="py-2 px-3 font-bold text-[#141413]">Выручка</td>
                        <td className="py-2 px-3 text-[#5E5D58]">
                          Выкупы × средняя цена ({primaryUnitShort})
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold">
                          {formatRub(pnl.avgRealizedPricePerPackRub)}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold">
                          {formatRub(pnl.annualRevenueRub)}
                        </td>
                        <td className="py-2 px-3 font-mono">100%</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-[#3F3E3A]">
                          Стоимость проданного товара
                        </td>
                        <td className="py-2 px-3 text-[#5E5D58]">
                          Выкупы × закупочная себестоимость ({primaryUnitShort})
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {!hasCost
                            ? 'Скрыто'
                            : pnl.unitCostPerPackRub !== null
                              ? `−${formatRub(pnl.unitCostPerPackRub)}`
                              : 'Не заполнено'}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {!hasCost
                            ? 'Скрыто'
                            : pnl.annualCogsRub !== null
                              ? `−${formatRub(pnl.annualCogsRub)}`
                              : 'Не заполнено'}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {!hasCost
                            ? 'Скрыто'
                            : pnl.annualCogsRub !== null && pnl.annualRevenueRub > 0
                              ? `${Math.round((pnl.annualCogsRub / pnl.annualRevenueRub) * 1000) / 10}%`
                              : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-[#3F3E3A]">
                          Расходы на продажу (комиссия, доставка, реклама, прочие)
                        </td>
                        <td className="py-2 px-3 text-[#5E5D58]">
                          Комиссия {model.marketplaceFeePct}% + доставка{' '}
                          {pnl.logisticsFilled ? `${model.logisticsRub} ₽` : 'Не заполнено'} + реклама{' '}
                          {model.adsPct}% + прочие {shared.otherVariableRubPerPack} ₽
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {pnl.expensesFilled
                            ? `−${formatRub(
                                (pnl.unitMpCommissionRub || 0) +
                                  (pnl.unitLogisticsRub || 0) +
                                  (pnl.unitAdsRub || 0) +
                                  (pnl.unitOtherVarRub || 0)
                              )}`
                            : 'Не заполнено'}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {pnl.expensesFilled
                            ? `−${formatRub(
                                (pnl.annualMpCommissionRub || 0) +
                                  (pnl.annualLogisticsRub || 0) +
                                  (pnl.annualAdsRub || 0) +
                                  (pnl.annualOtherVarRub || 0)
                              )}`
                            : 'Не заполнено'}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {!hasCost
                            ? 'Скрыто'
                            : pnl.contributionMarginPct !== null
                              ? `Остаётся ${pnl.contributionMarginPct}%`
                              : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-[#3F3E3A]">Постоянные расходы</td>
                        <td className="py-2 px-3 text-[#5E5D58]">
                          Выкупы × доля постоянных расходов на 1 {primaryUnitShort}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {pnl.unitAllocatedOpexRub !== null
                            ? `−${formatRub(pnl.unitAllocatedOpexRub)}`
                            : 'Не заполнено'}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {pnl.annualAllocatedOpexRub !== null
                            ? `−${formatRub(pnl.annualAllocatedOpexRub)}`
                            : 'Не заполнено'}
                        </td>
                        <td className="py-2 px-3 font-mono">—</td>
                      </tr>
                      <tr className="bg-[#EAF6F0]/60 font-bold text-[#141413]">
                        <td className="py-2.5 px-3">
                          Расчётная операционная прибыль (остаётся с продажи)
                        </td>
                        <td className="py-2.5 px-3 text-[#3F3E3A] font-normal">
                          Выручка − себестоимость − расходы на продажу − постоянные расходы
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {!hasCost
                            ? 'Скрыто'
                            : pnl.unitOperatingProfitRub !== null
                              ? formatRub(pnl.unitOperatingProfitRub)
                              : 'Не рассчитано'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#157347]">
                          {!hasCost
                            ? 'Скрыто'
                            : pnl.annualOperatingProfitRub !== null
                              ? formatRub(pnl.annualOperatingProfitRub)
                              : pnl.operatingProfitNotCalculatedReason}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {!hasCost
                            ? 'Скрыто'
                            : pnl.operatingMarginPct !== null
                              ? `${pnl.operatingMarginPct}%`
                              : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* РАЗДЕЛ «ДЕНЬГИ НА ЗАКУПКИ» (Стр. 6 ТЗ): 3 понятных показателя + компактная таблица по кнопке «Подробнее» */}
            <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 md:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFECE4] pb-2.5">
                <div>
                  <h3 className="text-[15px] font-bold text-[#141413]">
                    Деньги на закупки
                  </h3>
                  <p className="text-[11.5px] text-[#5E5D58]">
                    Предоплата фабрике {shared.factoryParams.prepaymentPct}% при размещении заказа и доплата{' '}
                    {shared.factoryParams.balancePaymentPct}% перед отгрузкой
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-[11.5px] text-[#3F3E3A] bg-[#F7F7F4] border border-[#CECDC4] rounded-[8px] px-2.5 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={Boolean(shared.wbPayoutScheduleConfirmed)}
                      onChange={(e) =>
                        commitWithAudit(
                          {
                            ...model,
                            sharedSupplyAndFact: {
                              ...shared,
                              wbPayoutScheduleConfirmed: e.target.checked,
                            },
                          },
                          'finance',
                          e.target.checked
                            ? 'Подтверждён график выплат WB для расчёта пиковой потребности в деньгах'
                            : 'Отключён график выплат WB'
                        )
                      }
                      className="rounded border-[#CECDC4]"
                    />
                    <span>График выплат WB известен</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowProcurementCashDetails((v) => !v)}
                    className="h-8 px-3 rounded-[8px] bg-[#F5F5F1] hover:border-[#141413] border border-[#CECDC4] text-[12px] font-semibold text-[#141413] cursor-pointer"
                  >
                    {showProcurementCashDetails ? 'Скрыть подробности ▴' : 'Подробнее ▾'}
                  </button>
                </div>
              </div>

              {/* Три показателя раздела «Деньги на закупки» (Стр. 6 ТЗ) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* 1. Общая стоимость плановых партий */}
                <div className="rounded-[12px] bg-[#F7F7F4] border border-[#DFDED6] p-3.5 space-y-1">
                  <span className="text-[11.5px] font-semibold text-[#5E5D58]">
                    1. Общая стоимость плановых партий
                  </span>
                  {!hasCost ? (
                    <div className="text-[15px] font-bold text-[#64748B] pt-1">
                      Скрыто
                    </div>
                  ) : procurement.totalRecommendedBudgetRub !== null ? (
                    <>
                      <div className="font-mono text-[19px] font-bold text-[#141413]">
                        {formatMln(procurement.totalRecommendedBudgetRub)}
                      </div>
                      <div className="text-[11px] text-[#5E5D58]">
                        {formatRub(procurement.totalRecommendedBudgetRub)} ·{' '}
                        {procurement.totalRecommendedPacks.toLocaleString('ru-RU')}{' '}
                        {primaryUnitShort} по ещё не утверждённому плану
                      </div>
                    </>
                  ) : (
                    <div className="text-[13.5px] font-bold text-[#B91C1C] pt-1">
                      Не заполнена себестоимость
                    </div>
                  )}
                </div>

                {/* 2. Следующий платёж фабрике */}
                <div className="rounded-[12px] bg-[#F7F7F4] border border-[#DFDED6] p-3.5 space-y-1">
                  <span className="text-[11.5px] font-semibold text-[#5E5D58]">
                    2. Следующий платёж фабрике
                  </span>
                  {!hasCost ? (
                    <div className="text-[15px] font-bold text-[#64748B] pt-1">
                      Скрыто
                    </div>
                  ) : pnl.nextFactoryPayment ? (
                    <>
                      <div className="font-mono text-[19px] font-bold text-[#141413]">
                        {formatRub(pnl.nextFactoryPayment.amountRub)} · {pnl.nextFactoryPayment.dateIso}
                      </div>
                      <div className="text-[11px] text-[#5E5D58]">
                        {pnl.nextFactoryPayment.label}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[14px] font-bold text-[#3F3E3A] pt-0.5">
                        Нет подтверждённых заказов PO
                      </div>
                      <div className="text-[11px] text-[#5E5D58]">
                        Утвердите партию во вкладке «Закупки», чтобы зафиксировать дату платежа
                      </div>
                    </>
                  )}
                </div>

                {/* 3. Максимально потребуется собственных денег */}
                <div className="rounded-[12px] bg-[#F7F7F4] border border-[#DFDED6] p-3.5 space-y-1">
                  <span className="text-[11.5px] font-semibold text-[#5E5D58]">
                    3. Максимально потребуется собственных денег
                  </span>
                  {pnl.verifiedPeakCapitalDeficitRub !== null ? (
                    !hasCost ? (
                      <div className="text-[15px] font-bold text-[#64748B] pt-1">
                        Скрыто
                      </div>
                    ) : (
                      <>
                        <div className="font-mono text-[19px] font-bold text-[#B42318]">
                          {pnl.verifiedPeakCapitalDeficitRub > 0
                            ? formatMln(pnl.verifiedPeakCapitalDeficitRub)
                            : '0 ₽ (хватает выручки)'}
                        </div>
                        <div className="text-[11px] text-[#5E5D58]">
                          {formatRub(pnl.verifiedPeakCapitalDeficitRub)} · наибольший минус денег во времени
                        </div>
                      </>
                    )
                  ) : (
                    <>
                      <div className="text-[13.5px] font-bold text-[#9A5B00] pt-0.5">
                        Нельзя рассчитать без графика выплат
                      </div>
                      <div className="text-[11px] text-[#5E5D58]">
                        Отметьте «График выплат WB известен» выше для расчёта кассового разрыва
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Компактная таблица по месяцам «Платежи фабрике / Выплаты от продаж / Разница» по кнопке «Подробнее» (Стр. 6 ТЗ) */}
              {showProcurementCashDetails && (
                <div className="overflow-x-auto rounded-[12px] border border-[#DED8CC]">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="bg-[#F7F7F4] border-b border-[#DED8CC] text-[10.5px] uppercase text-[#5E5D58]">
                        <th className="py-2 px-3">Показатель</th>
                        {pnl.monthlyCashFlow.map((cf) => (
                          <th key={cf.monthLabel} className="py-2 px-2.5 font-mono">
                            {cf.monthLabel}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFECE4]">
                      <tr>
                        <td className="py-2 px-3 font-semibold text-[#B42318]">
                          Платежи фабрике
                        </td>
                        {pnl.monthlyCashFlow.map((cf) => (
                          <td key={cf.monthLabel} className="py-2 px-2.5 font-mono text-[#B42318]">
                            {!hasCost
                              ? 'Скрыто'
                              : cf.outflowProcurementRub > 0
                                ? `−${(cf.outflowProcurementRub / 1_000_000).toFixed(2).replace('.', ',')}м`
                                : '0'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-[#157347]">
                          Выплаты от продаж (после комиссий)
                        </td>
                        {pnl.monthlyCashFlow.map((cf) => {
                          const netInflow = Math.max(
                            0,
                            cf.inflowSalesRub - cf.outflowVariableAndOpexRub
                          );
                          return (
                            <td key={cf.monthLabel} className="py-2 px-2.5 font-mono text-[#157347]">
                              {!hasFinance
                                ? 'Скрыто'
                                : netInflow > 0
                                  ? `+${(netInflow / 1_000_000).toFixed(2).replace('.', ',')}м`
                                  : '0'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr className="bg-[#F7F7F4] font-bold">
                        <td className="py-2 px-3 text-[#141413]">Разница за месяц</td>
                        {pnl.monthlyCashFlow.map((cf) => (
                          <td
                            key={cf.monthLabel}
                            className={`py-2 px-2.5 font-mono ${
                              !hasCost || !hasFinance
                                ? 'text-[#64748B]'
                                : cf.netCashFlowRub >= 0
                                  ? 'text-[#157347]'
                                  : 'text-[#B42318]'
                            }`}
                          >
                            {!hasCost || !hasFinance
                              ? 'Скрыто'
                              : `${cf.netCashFlowRub >= 0 ? '+' : ''}${(cf.netCashFlowRub / 1_000_000).toFixed(2).replace('.', ',')}м`}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
