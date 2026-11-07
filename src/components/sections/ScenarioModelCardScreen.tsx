'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Edit3,
  Printer,
  MoreHorizontal,
  Copy,
  Trash2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Info,
  FileText,
  ZoomIn,
  Download,
  ExternalLink,
  Eye,
  Plus,
  X,
  BarChart3,
  Table as TableIcon,
  ShieldCheck,
  Clock,
  Package,
  Wallet,
  Layers,
  History,
} from 'lucide-react';
import {
  AttachedModelPdf,
  GrowthScenarioDef,
  MONTHS_SHORT_RU,
  ScenarioModelSpec,
  computeModelScenarioMetrics,
} from '@/lib/scenarioData';
import {
  PO_STATUS_LABELS_RU,
  VALUE_STATUS_LABELS_RU,
  approveRecommendedBatch,
  computeFinancialPnL,
  computeProcurementPlan,
  createCustomPurchaseOrder,
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  exportStructuredScenarioPlan,
  getModelChannelSplit,
  importStructuredScenarioPlan,
  parseStructuredPlanCsvOrJson,
  removeApprovedPurchaseOrder,
  serializePurchaseOrdersToCsv,
  serializeStructuredPlanToCsv,
  updateApprovedPurchaseOrder,
  type ApprovedPurchaseOrder,
  type ModelAuditEntry,
  type StructuredPlanRowV11,
  type ValueStatusCode,
} from '@/lib/unifiedBusinessEngine';
import { FullscreenPhotoLightbox } from '@/components/sections/FullscreenPhotoLightbox';
import { compressImageFileToDataUrl } from '@/lib/document-export';
import {
  savePdfBlobToIdb,
  loadPdfBlobUrlFromIdb,
  deletePdfBlobFromIdb,
} from '@/lib/safeStorage';

interface ScenarioModelCardScreenProps {
  model: ScenarioModelSpec;
  scenario: GrowthScenarioDef;
  allScenarios?: GrowthScenarioDef[];
  onSelectScenario?: (scenarioId: number) => void;
  onBackToScenarios: () => void;
  onOpenSalesPlan: () => void;
  onUpdateModel: (updated: ScenarioModelSpec) => void;
  onDuplicateModel: (model: ScenarioModelSpec) => void;
  onDeleteOrArchiveModel: (model: ScenarioModelSpec) => void;
  onOpenPdfModal: () => void;
  notify: (type: 'success' | 'warning' | 'error', title: string, desc?: string) => void;
}

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
  if (!url) return '';
  return url.replace(/^\/(images|docs)\//, '$1/');
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
  const model = useMemo(() => ensureModelUnifiedV11(rawModel), [rawModel]);
  const shared = model.sharedSupplyAndFact!;

  // Четыре вкладки карточки (Раздел 02 и 03 ТЗ v1.1): Продукт / Продажи / Закупки / Финансы
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
      } catch {
        // ignore
      }
    }
    return 'product';
  });

  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(
    scenario.targetMonthIdx ?? 11
  );
  const [salesViewMode, setSalesViewMode] = useState<'table' | 'chart'>('table');
  const [selectedGalleryId, setSelectedGalleryId] = useState<string>(
    () => model.gallery.find((g) => g.isMain)?.id || model.gallery[0]?.id || 'g-1'
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [formulaOpenKey, setFormulaOpenKey] = useState<string | null>(null);

  const [pdfUrlsById, setPdfUrlsById] = useState<Record<string, string>>({});
  const [previewPdfId, setPreviewPdfId] = useState<string | null>(null);

  // Состояния рабочего контура «Закупки» (ручной конструктор PO + правка рекомендованных партий перед утверждением)
  const [customPoOpen, setCustomPoOpen] = useState(false);
  const [draftPoPacks, setDraftPoPacks] = useState<number>(
    () => Math.max(shared.factoryParams.moqPacks || 1000, 500)
  );
  const [draftPoCost, setDraftPoCost] = useState<number>(() => model.unitCostRub || 0);
  const [draftPoFactory, setDraftPoFactory] = useState<string>(
    () => shared.factoryParams.factoryName || 'Фабрика-партнёр BORNERS (КНР)'
  );
  const [draftPoMonthIdx, setDraftPoMonthIdx] = useState<number>(0);
  const [draftPoStatus, setDraftPoStatus] =
    useState<ApprovedPurchaseOrder['status']>('approved');
  const [draftPoNote, setDraftPoNote] = useState<string>('');
  const [batchOverrides, setBatchOverrides] = useState<
    Record<
      number,
      {
        packsQty?: number;
        unitCostRub?: number;
        arrivalMonthIdx?: number;
        factoryName?: string;
      }
    >
  >({});

  const importPlanInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedGalleryId(
      model.gallery.find((g) => g.isMain)?.id || model.gallery[0]?.id || 'g-1'
    );
    setDraftPoCost(model.unitCostRub || 0);
    setDraftPoFactory(shared.factoryParams.factoryName || 'Фабрика-партнёр BORNERS (КНР)');
    setBatchOverrides({});
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
          nextMap[item.id] = item.staticUrl;
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

  // Добавление записи в журнал истории изменений (Audit Trail, Раздел 06 ТЗ v1.1)
  const commitWithAudit = (
    nextModel: ScenarioModelSpec,
    category: ModelAuditEntry['category'],
    summary: string,
    beforeValue?: string,
    afterValue?: string,
    bumpPassport = false
  ) => {
    const baseS = ensureModelUnifiedV11(nextModel).sharedSupplyAndFact!;
    const nextPassportVer = bumpPassport
      ? baseS.passportVersion + 1
      : baseS.passportVersion;
    const entry: ModelAuditEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
      author: 'Владелец',
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
  };

  // Загрузка оригинальной фотографии с сохранением полного оригинала без потери разрешения
  const handleUploadOriginalPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const originalDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Read error'));
        reader.readAsDataURL(file);
      });
      const previewUrl =
        file.size > 350_000
          ? await compressImageFileToDataUrl(file, 1400, 0.9)
          : originalDataUrl;

      const newItemId = `gal-${Date.now()}`;
      const isFirst = model.gallery.filter((g) => Boolean(g.url)).length === 0;
      const nextGallery = [
        ...model.gallery,
        {
          id: newItemId,
          category: 'pack' as const,
          label: file.name.replace(/\.[^.]+$/, ''),
          url: previewUrl,
          originalUrl: previewUrl,
          isMain: isFirst,
        },
      ];
      commitWithAudit(
        { ...model, gallery: nextGallery },
        'product',
        `Добавлено фото «${file.name}»`,
        undefined,
        file.name,
        true
      );
      setSelectedGalleryId(newItemId);
      notify(
        'success',
        'Фотография добавлена в паспорт модели',
        'Отражена во всех сценариях без дублирования товара.'
      );
    } catch {
      notify('error', 'Не удалось прочитать файл изображения');
    }
    e.target.value = '';
  };

  const handleRemoveGalleryPhoto = (photoId: string) => {
    if (filteredGallery.length <= 1) return;
    const nextGallery = model.gallery.filter((g) => g.id !== photoId);
    const nextSel =
      nextGallery.find((g) => Boolean(g.url || g.originalUrl))?.id || 'g-1';
    setSelectedGalleryId(nextSel);
    commitWithAudit(
      { ...model, gallery: nextGallery },
      'product',
      'Удалён кадр из галереи модели'
    );
    notify('success', 'Фотография удалена из галереи');
  };

  const handleDownloadModelOrdersCsv = () => {
    if (procurement.approvedOrders.length === 0) {
      notify('warning', 'Нет утверждённых заказов PO для выгрузки');
      return;
    }
    const csv = serializePurchaseOrdersToCsv(
      procurement.approvedOrders.map((po) => ({ model, po }))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PO_${model.code.replace(/\s+/g, '_')}_2027.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', `Выгружен реестр заказов PO (${procurement.approvedOrders.length})`);
  };

  // Загрузка фабричного PDF
  const handleUploadFactoryPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  // Обновление цены в текущем сценарии (без перезаписи других сценариев!)
  const handleScenarioPriceChange = (nextPriceRub: number) => {
    const clean = Math.max(0, Math.round(nextPriceRub));
    const prevPrice = plan.monthlyPricesRub[selectedMonthIdx] ?? model.retailPriceRub;
    const nextPlan = {
      ...plan,
      scenarioId: scenario.id,
      monthlyPricesRub: Array(12).fill(clean),
    };
    commitWithAudit(
      {
        ...model,
        retailPriceRub: scenario.id === 1 ? clean : model.retailPriceRub,
        plansByScenario: {
          ...model.plansByScenario,
          [scenario.id]: nextPlan,
        },
      },
      'sales',
      `Изменена плановая цена в ${scenario.title}`,
      `${prevPrice} ₽`,
      `${clean} ₽`
    );
  };

  // Обновление целевой себестоимости комплекта (Тест-кейс №6: меняются затраты, маржа и бюджет закупок; выкупы НЕ меняются!)
  const handleUnitCostChange = (nextCostRub: number) => {
    const clean = Math.max(0, Math.round(nextCostRub));
    const prev = model.unitCostRub;
    commitWithAudit(
      {
        ...model,
        unitCostRub: clean,
        sharedSupplyAndFact: {
          ...shared,
          costStatus: clean > 0 ? 'plan' : 'not_filled',
        },
      },
      'finance',
      'Изменена целевая закупочная себестоимость комплекта (выкупы неизменны)',
      `${prev} ₽`,
      `${clean} ₽`
    );
  };

  // Обновление плановых выкупов конкретного месяца (Тест-кейс №2: август на Sorbet -> меняются выручка, сценарий, остатки и закупки!)
  const handleMonthBuyoutsChange = (monthIdx: number, nextPacks: number) => {
    const clean = Math.max(0, Math.round(nextPacks));
    const prev = plan.monthlyPacks[monthIdx] || 0;
    const nextMonthlyPacks = plan.monthlyPacks.map((v, idx) =>
      idx === monthIdx ? clean : v
    );
    commitWithAudit(
      {
        ...model,
        plansByScenario: {
          ...model.plansByScenario,
          [scenario.id]: {
            ...plan,
            scenarioId: scenario.id,
            monthlyPacks: nextMonthlyPacks,
          },
        },
      },
      'sales',
      `Изменён план выкупов за ${MONTHS_SHORT_RU[monthIdx]} (${scenario.title})`,
      `${prev} компл.`,
      `${clean} компл.`
    );
  };

  // Обновление фактических продаж месяца (общее для всех сценариев!)
  const handleMonthActualSaleChange = (
    monthIdx: number,
    actualPacksRaw: string,
    actualPriceRaw?: string
  ) => {
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
        : `${currentAct.actualBuyoutsPacks} компл.`,
      nextActualPacks === null ? 'Не заполнено' : `${nextActualPacks} компл.`
    );
  };

  // Экспорт плана текущего SKU (CSV или JSON)
  const handleExportSkuPlan = (format: 'csv' | 'json') => {
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
    a.click();
    URL.revokeObjectURL(url);
    notify(
      'success',
      `План ${model.code} экспортирован в ${format.toUpperCase()}`,
      'Сохранены идентификатор SKU, периоды, цены, выкупы и статусы значений.'
    );
  };

  // Импорт плана из JSON / CSV без потери и двойного счёта (Тест-кейс №9)
  const handleImportSkuPlanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          `Импортирован план из файла ${file.name} (${res.importedRowsCount} мес., пропущено дублей: ${res.duplicatesSkipped})`
        );
        notify(
          'success',
          `Импортировано ${res.importedRowsCount} периодов по ${model.code}`,
          res.duplicatesSkipped > 0
            ? `Защита от двойного счёта: отсеяно ${res.duplicatesSkipped} дублирующихся строк.`
            : 'Идентификатор SKU, цены, выкупы и статусы применены.'
        );
      } else {
        notify(
          'warning',
          `В файле не найдено строк для артикула ${model.code}`
        );
      }
    } catch {
      notify('error', 'Ошибка чтения файла плана (поддерживаются JSON и CSV)');
    }
    e.target.value = '';
  };

  // Выбранный месяц для первого экрана карточки
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

  return (
    <div className="space-y-5">
      {/* ПОЛНОЭКРАННАЯ ГАЛЕРЕЯ С ZOOM / PAN / 100% / ОРИГИНАЛОМ (Раздел 02 ТЗ v1.1) */}
      <FullscreenPhotoLightbox
        open={lightboxOpen}
        items={
          model.gallery.filter((g) => Boolean(g.url || g.originalUrl)).length > 0
            ? model.gallery
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

      {/* 1. КОМПАКТНАЯ ШАПКА КАРТОЧКИ С ЧЁТКИМИ ГРАНИЦАМИ БЕЗ ЛИШНИХ ИКОНОК */}
      <div className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] px-5 py-4 shadow-[0_2px_10px_rgba(20,20,19,0.03)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToScenarios}
            className="h-9 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:border-[#141413] border-[1.5px] border-[#CECDC4] text-[12.5px] font-semibold text-[#141413] transition cursor-pointer"
          >
            ← Сценарии
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded-[6px] bg-[#141413] text-white font-mono text-[11px] font-semibold">
                {model.code}
              </span>
              <span className="px-2 py-0.5 rounded-[6px] bg-[#F4F4F0] text-[#262624] border border-[#CECDC4] text-[11px] font-semibold">
                {brandPortfolioLabel}
              </span>
              <span className="px-2 py-0.5 rounded-[6px] bg-[#F4F4F0] text-[#262624] border border-[#CECDC4] text-[11px] font-semibold">
                {model.launchStatus}
              </span>
              <span className="text-[11px] text-[#5E5D58]">
                Паспорт v{shared.passportVersion} · {model.unitsInPack} изд. в комплекте
              </span>
            </div>
            <h1 className="text-[19px] md:text-[22px] font-bold tracking-[-0.02em] text-[#141413] truncate mt-0.5">
              {model.title}
            </h1>
          </div>
        </div>

        {/* Переключатель активного сценария + чистые текстовые кнопки */}
        <div className="flex flex-wrap items-center gap-2">
          {allScenarios.length > 0 && onSelectScenario ? (
            <div className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[9px] bg-[#F5F5F1] border-[1.5px] border-[#CECDC4]">
              <span className="text-[11px] font-semibold text-[#5E5D58]">Сценарий:</span>
              <select
                value={scenario.id}
                onChange={(e) => onSelectScenario(Number(e.target.value))}
                className="bg-transparent text-[12px] font-bold text-[#141413] focus:outline-none cursor-pointer"
              >
                {allScenarios.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.title} ({sc.monthlyTargetMln} млн ₽/мес)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="h-9 px-3 rounded-[9px] bg-[#F5F5F1] border-[1.5px] border-[#CECDC4] text-[12px] font-semibold text-[#141413] inline-flex items-center">
              {scenario.title} · {scenario.monthlyTargetMln} млн ₽/мес
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className={`h-9 px-3.5 rounded-[9px] text-[12.5px] font-semibold border-[1.5px] transition cursor-pointer ${
              isEditing
                ? 'bg-[#157347] text-white border-[#157347]'
                : 'bg-white hover:border-[#141413] text-[#141413] border-[#CECDC4]'
            }`}
          >
            {isEditing ? 'Сохранить' : 'Редактировать'}
          </button>

          <button
            type="button"
            onClick={onOpenPdfModal}
            className="h-9 px-3.5 rounded-[9px] bg-[#141413] hover:bg-[#2A2A28] text-white text-[12.5px] font-semibold transition cursor-pointer"
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
                  Матрица продаж (12 мес.)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDuplicateModel(model);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-[#F5F5F1] font-medium text-[#141413] cursor-pointer"
                >
                  Создать цветовой вариант
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDeleteOrArchiveModel(model);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-[#FFF2F2] text-[#B42318] font-medium cursor-pointer"
                >
                  Удалить / В архив
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. ПЕРВЫЙ ЭКРАН: ЛЕВАЯ КОЛОНКА (ОРИГИНАЛЬНОЕ ФОТО БЕЗ ОБРЕЗКИ) + ПРАВАЯ КОЛОНКА (5 КЛЮЧЕВЫХ МЕТРИК) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ЛЕВАЯ КОЛОНКА: Чистая фотогалерея без лишних плашек и комментариев */}
        <div className="lg:col-span-6 rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] p-4 md:p-5 flex flex-col justify-between space-y-3">
          {/* Крупное фото целиком без обрезки (object-contain) */}
          <div
            onClick={() => mainImageSrc && setLightboxOpen(true)}
            title="Нажмите для полноэкранного просмотра фото"
            className="relative rounded-[14px] bg-[#F5F5F1] border-[1.5px] border-[#DFDED6] h-[330px] md:h-[390px] flex items-center justify-center p-3 overflow-hidden group cursor-zoom-in"
          >
            {mainImageSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={mainImageSrc}
                alt={`${model.code} ${model.title}`}
                className="max-h-full max-w-full w-auto h-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="text-center text-[13px] text-[#686762]">
                Фотография ещё не загружена
              </div>
            )}
          </div>

          {/* Чистые миниатюры кадров + загрузка фото */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2 overflow-x-auto py-0.5">
              {filteredGallery.map((g, idx) => {
                const isSel = g.id === activeGalleryItem?.id;
                const src = normalizeAssetUrl(g.url || g.originalUrl || '');
                return (
                  <div key={g.id} className="relative shrink-0 group/thumb">
                    <button
                      type="button"
                      onClick={() => setSelectedGalleryId(g.id)}
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
                    {filteredGallery.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveGalleryPhoto(g.id);
                        }}
                        title="Удалить фото"
                        className="hidden group-hover/thumb:flex absolute -top-1.5 -right-1.5 h-4.5 w-4.5 rounded-full bg-[#141413] text-white text-[10px] items-center justify-center shadow cursor-pointer"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <label className="h-8.5 px-3 rounded-[8px] bg-[#F5F5F1] hover:bg-white border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[12px] font-semibold text-[#141413] inline-flex items-center shrink-0 cursor-pointer transition">
              <span>+ Загрузить фото</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadOriginalPhoto}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: Строго 5 ключевых показателей с единицами, периодом, статусом и формулой (Раздел 02 и 06 ТЗ v1.1) */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5 content-start">
          {/* Метрика 1: Выручка выбранного месяца (на всю ширину правой колонки) */}
          <div className="sm:col-span-2 rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-[#3F3E3A]">
                  01 · Выручка месяца
                </span>
                <select
                  value={selectedMonthIdx}
                  onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}
                  className="h-6.5 px-2 rounded-[6px] bg-[#F5F5F1] border border-[#CECDC4] text-[11.5px] font-bold text-[#141413] cursor-pointer"
                >
                  {MONTHS_SHORT_RU.map((mName, idx) => (
                    <option key={mName} value={idx}>
                      {mName} {scenario.year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <StatusPill status={selMonthStatus} />
                <button
                  type="button"
                  onClick={() =>
                    setFormulaOpenKey(formulaOpenKey === 'rev' ? null : 'rev')
                  }
                  className="h-6 px-2 rounded-[6px] bg-[#F4F4F0] hover:border-[#141413] border border-[#CECDC4] text-[10.5px] font-bold text-[#3F3E3A] cursor-pointer"
                >
                  Формула
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="text-[26px] font-bold tracking-[-0.02em] text-[#141413]">
                  {formatMln(selMonthRevRub)}
                </div>
                <div className="text-[12px] text-[#5E5D58]">
                  {formatRub(selMonthRevRub)} · Выкупы:{' '}
                  <strong className="text-[#141413]">
                    {selMonthPacks.toLocaleString('ru-RU')} компл.
                  </strong>{' '}
                  ({selMonthUnits.toLocaleString('ru-RU')} изд.)
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] text-[#5E5D58]">Сумма 12 мес. {scenario.year}</div>
                <div className="text-[15px] font-bold text-[#141413]">
                  {formatMln(pnl.annualRevenueRub)}
                </div>
                <div className="text-[11px] text-[#5E5D58]">
                  {pnl.annualBuyoutsPacks.toLocaleString('ru-RU')} компл. ·{' '}
                  {pnl.annualBuyoutsUnits.toLocaleString('ru-RU')} изд.
                </div>
              </div>
            </div>

            {formulaOpenKey === 'rev' && (
              <div className="rounded-[10px] bg-[#F5F5F1] border border-[#CECDC4] px-3 py-2 text-[11.5px] text-[#262624]">
                <strong>Формула:</strong> Выкупленные комплекты ({selMonthPacks.toLocaleString('ru-RU')}{' '}
                компл.) × Средняя цена реализации комплекта ({selMonthPrice.toLocaleString('ru-RU')} ₽) ={' '}
                {formatRub(selMonthRevRub)}. Изделия в комплекте ({model.unitsInPack} шт.) учитываются справочно и не умножают выручку повторно.
              </div>
            )}
          </div>

          {/* Метрика 2: Цена реализации */}
          <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-[#3F3E3A]">
                02 · Цена комплекта
              </span>
              <StatusPill status={pnl.revenueStatus} />
            </div>

            {isEditing ? (
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
              <div className="text-[22px] font-bold text-[#141413]">
                {formatRub(pnl.avgRealizedPricePerPackRub)}
              </div>
            )}

            <div className="text-[11.5px] text-[#5E5D58]">
              За 1 компл. ({model.unitsInPack} шт.) ·{' '}
              <span className="font-semibold text-[#141413]">
                {formatRub(pnl.avgRealizedPricePerUnitRub)} / изд.
              </span>
            </div>
          </div>

          {/* Метрика 3: Себестоимость под ключ */}
          <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-[#3F3E3A]">
                03 · Себестоимость под ключ
              </span>
              <StatusPill status={pnl.costStatus} />
            </div>

            {isEditing ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={model.unitCostRub || ''}
                  placeholder="Не заполнено"
                  onChange={(e) => handleUnitCostChange(Number(e.target.value))}
                  className="h-9 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 text-[16px] font-bold text-[#141413]"
                />
                <span className="text-[13px] font-semibold text-[#5E5D58]">₽</span>
              </div>
            ) : pnl.unitCostPerPackRub !== null ? (
              <div className="text-[22px] font-bold text-[#141413]">
                {formatRub(pnl.unitCostPerPackRub)}
              </div>
            ) : (
              <div className="text-[16px] font-bold text-[#9F2D2D]">
                Не заполнено
              </div>
            )}

            <div className="text-[11.5px] text-[#5E5D58]">
              {pnl.unitCostPerSingleItemRub !== null
                ? `За 1 компл. · ${pnl.unitCostPerSingleItemRub.toLocaleString('ru-RU')} ₽ / изд.`
                : 'Укажите себестоимость для расчёта маржи и бюджета партий'}
            </div>
          </div>

          {/* Метрика 4: Обеспеченность товаром (единый реальный остаток + утверждённые PO!) */}
          <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-[#3F3E3A]">
                04 · Обеспеченность
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('procurement')}
                className="text-[11px] font-bold text-[#141413] underline hover:opacity-75 cursor-pointer"
              >
                К партиям →
              </button>
            </div>

            <div
              className={`text-[15px] font-bold leading-snug ${
                procurement.supplyStatusTone === 'danger'
                  ? 'text-[#B42318]'
                  : procurement.supplyStatusTone === 'warning'
                  ? 'text-[#9A5B00]'
                  : procurement.supplyStatusTone === 'success'
                  ? 'text-[#157347]'
                  : 'text-[#141413]'
              }`}
            >
              {procurement.hasDeficit
                ? `Дефицит ${procurement.totalDeficitPacks.toLocaleString('ru-RU')} компл.`
                : procurement.annualDemandPacks > 0
                ? 'Обеспечено запасом и PO'
                : 'Спрос не задан'}
            </div>

            <div className="text-[11.5px] text-[#5E5D58]">
              Склад: <strong className="text-[#141413]">{procurement.netOpeningAvailablePacks}</strong> компл. · PO:{' '}
              <strong className="text-[#141413]">{procurement.totalApprovedReceiptsPacks}</strong> компл. · К заказу:{' '}
              <strong className="text-[#141413]">{procurement.recommendedBatches.length} парт.</strong>
            </div>
          </div>

          {/* Метрика 5: Операционная прибыль (Тест-кейс №8: честное «Не рассчитана» без ложных 75%!) */}
          <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-[#3F3E3A]">
                05 · Операционная прибыль
              </span>
              <div className="flex items-center gap-1">
                <StatusPill status={pnl.operatingProfitStatus} />
                <button
                  type="button"
                  onClick={() =>
                    setFormulaOpenKey(formulaOpenKey === 'op' ? null : 'op')
                  }
                  className="h-6 px-2 rounded-[6px] bg-[#F4F4F0] hover:border-[#141413] border border-[#CECDC4] text-[10.5px] font-bold text-[#3F3E3A] cursor-pointer"
                >
                  Формула
                </button>
              </div>
            </div>

            {pnl.annualOperatingProfitRub !== null ? (
              <>
                <div
                  className={`text-[20px] font-bold ${
                    pnl.annualOperatingProfitRub >= 0
                      ? 'text-[#157347]'
                      : 'text-[#B42318]'
                  }`}
                >
                  {formatMln(pnl.annualOperatingProfitRub)}{' '}
                  <span className="text-[13px] font-semibold">
                    ({pnl.operatingMarginPct}%)
                  </span>
                </div>
                <div className="text-[11.5px] text-[#5E5D58]">
                  За 2027 г. · {formatRub(pnl.unitOperatingProfitRub || 0)} / компл. (после MP, рекламы и OPEX)
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-bold text-[#9F2D2D]">
                  Не рассчитана
                </div>
                <div className="text-[11px] text-[#5E5D58] leading-snug">
                  {pnl.operatingProfitNotCalculatedReason}
                </div>
              </>
            )}

            {formulaOpenKey === 'op' && (
              <div className="rounded-[10px] bg-[#F5F5F1] border border-[#CECDC4] px-2.5 py-1.5 text-[11px] text-[#262624]">
                Выручка − Себестоимость − Комиссии MP − Логистика − Реклама − Постоянные OPEX. При незаполненных расходах ложный % не выводится.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. ПЕРЕКЛЮЧАТЕЛЬ 4 КОНТУРОВ ВНУТРИ ПАСПОРТА SKU (01 Продукт -> 02 Продажи -> 03 Закупки -> 04 Финансы) */}
      <div className="rounded-[18px] bg-white border-[1.5px] border-[#C8C7BE] overflow-hidden shadow-[0_2px_10px_rgba(20,20,19,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-3 bg-[#F7F7F4] border-b-[1.5px] border-[#DFDED6]">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-[10px] bg-[#EFEFE9] border-[1.5px] border-[#CECDC4] p-0.5">
            {(
              [
                { id: 'product', step: '01', label: 'Продукт' },
                { id: 'sales', step: '02', label: 'Продажи (12 мес.)' },
                {
                  id: 'procurement',
                  step: '03',
                  label: `Закупки (${procurement.recommendedBatches.length} рек. / ${procurement.approvedOrders.length} PO)`,
                },
                { id: 'finance', step: '04', label: 'Финансы (P&L и капитал)' },
              ] as const
            ).map((tab) => {
              const isAct = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-8.5 px-3.5 rounded-[8px] text-[12px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                    isAct
                      ? 'bg-[#141413] text-white shadow-2xs'
                      : 'text-[#3F3E3A] hover:text-[#141413] hover:bg-white'
                  }`}
                >
                  <span
                    className={`font-mono text-[10.5px] ${
                      isAct ? 'text-white/75' : 'text-[#686762]'
                    }`}
                  >
                    {tab.step}
                  </span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <span className="text-[11px] font-medium text-[#5E5D58]">
            Единый SKU · паспорт, остатки и PO общие для всех сценариев
          </span>
        </div>

        {/* ==================== ВКЛАДКА 1: ПРОДУКТ ==================== */}
        {activeTab === 'product' && (
          <div className="p-5 md:p-6 space-y-6">
            {/* Спецификация ткани, конструкции, пояса и комплектности */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-[14px] bg-[#F7F7F4] border-[1.5px] border-[#CECDC4] p-4 space-y-2.5">
                <div className="text-[11px] font-mono font-bold uppercase tracking-[0.06em] text-[#5E5D58]">
                  Ткань и плотность
                </div>
                {isEditing ? (
                  <div className="space-y-2 text-[12.5px]">
                    <label className="block">
                      <span className="text-[#5E5D58] text-[11px]">Состав</span>
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
                            'Обновлён состав ткани (новая версия паспорта PDF)',
                            model.fabric.composition,
                            e.target.value,
                            true
                          )
                        }
                        className="mt-0.5 w-full h-8 px-2.5 rounded-[8px] border-[1.5px] border-[#CECDC4] bg-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[#5E5D58] text-[11px]">Плотность</span>
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
                        className="mt-0.5 w-full h-8 px-2.5 rounded-[8px] border-[1.5px] border-[#CECDC4] bg-white"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-[13px] text-[#141413]">
                    <div>
                      <span className="text-[#5E5D58]">Состав:</span>{' '}
                      <strong>{model.fabric.composition}</strong>
                    </div>
                    <div>
                      <span className="text-[#5E5D58]">Плотность:</span>{' '}
                      <strong>{model.fabric.density}</strong>
                    </div>
                    <div>
                      <span className="text-[#5E5D58]">Переплетение:</span>{' '}
                      {model.fabric.knitType}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[14px] bg-[#F7F7F4] border-[1.5px] border-[#CECDC4] p-4 space-y-2.5">
                <div className="text-[11px] font-mono font-bold uppercase tracking-[0.06em] text-[#5E5D58]">
                  Конструкция и посадка
                </div>
                <div className="space-y-1.5 text-[13px] text-[#141413]">
                  <div>
                    <span className="text-[#5E5D58]">Тип и комплект:</span>{' '}
                    <strong>
                      {model.construction.type} ({model.unitsInPack} изд. = 1 компл.)
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#5E5D58]">Посадка:</span> {model.construction.fit}
                  </div>
                  <div>
                    <span className="text-[#5E5D58]">Передняя панель:</span>{' '}
                    {model.construction.frontPanel}
                  </div>
                  <div>
                    <span className="text-[#5E5D58]">Швы и ластовица:</span>{' '}
                    {model.construction.gusset} · {model.construction.seams}
                  </div>
                </div>
              </div>

              <div className="rounded-[14px] bg-[#F7F7F4] border-[1.5px] border-[#CECDC4] p-4 space-y-2.5">
                <div className="text-[11px] font-mono font-bold uppercase tracking-[0.06em] text-[#5E5D58]">
                  Резинка / пояс и размеры
                </div>
                <div className="space-y-1.5 text-[13px] text-[#141413]">
                  <div>
                    <span className="text-[#5E5D58]">Ширина и тип:</span>{' '}
                    <strong>
                      {model.waistband.width} · {model.waistband.type}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#5E5D58]">Шаг логотипа:</span>{' '}
                    {model.waistband.logoRepeat}
                  </div>
                  <div className="pt-1">
                    <span className="text-[#5E5D58] text-[12px]">
                      Размерная матрица партии (%):
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(['S', 'M', 'L', 'XL', 'XXL'] as const).map((sz) => (
                        <span
                          key={sz}
                          className="px-2 py-0.5 rounded-[6px] bg-white border border-[#CECDC4] text-[11px] font-bold text-[#141413]"
                        >
                          {sz}: {shared.factoryParams.sizeSharesPct[sz]}%
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Палитры и Pantone */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-[#141413]">
                  Комплектация цветов и Pantone ({model.unitsInPack} изд. в 1 комплекте)
                </h3>
                <span className="text-[11.5px] text-[#5E5D58]">
                  Изменение цвета создаёт новую версию паспорта PDF, не меняя старые утверждённые PO
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {model.palettes.map((pal) => (
                  <div
                    key={pal.id}
                    className="rounded-[14px] border-[1.5px] border-[#CECDC4] p-4 space-y-3 bg-white"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[13.5px] font-bold text-[#141413]">
                          {pal.title}
                        </div>
                        <div className="text-[11.5px] text-[#5E5D58]">{pal.subtitle}</div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-[6px] bg-[#F4F4F0] border border-[#CECDC4] text-[11px] font-semibold text-[#3F3E3A]">
                        {pal.statusLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {pal.colors.map((c, cIdx) => (
                        <div
                          key={`${pal.id}-${cIdx}`}
                          className="rounded-[10px] border border-[#DFDED6] p-2 bg-[#F7F7F4] space-y-1.5"
                        >
                          <div
                            className="h-8 w-full rounded-[6px] border border-black/10"
                            style={{ backgroundColor: c.hex }}
                          />
                          {isEditing ? (
                            <input
                              type="text"
                              value={c.nameRu}
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
                              className="w-full h-6 px-1.5 rounded border border-[#DED8CC] bg-white text-[11px]"
                            />
                          ) : (
                            <div className="text-[11.5px] font-semibold text-[#1D1D1F] leading-tight">
                              {c.nameRu}
                            </div>
                          )}
                          <div className="text-[10px] font-mono text-[#6E6E73] truncate">
                            {c.pantone}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Оригинальные PDF техкарты фабрики */}
            <div className="rounded-[16px] bg-[#FAF8F4] border border-[#E6E0D4] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#8B6F47]" />
                  <h3 className="text-[14px] font-bold text-[#1D1D1F]">
                    Оригиналы и фабричные техкарты PDF ({(model.attachedPdfs || []).length})
                  </h3>
                </div>

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
              </div>

              {(model.attachedPdfs || []).length === 0 ? (
                <div className="text-[12.5px] text-[#6E6E73]">
                  К модели пока не прикреплён исходный PDF-файл техкарты.
                </div>
              ) : (
                <div className="space-y-2">
                  {(model.attachedPdfs || []).map((pdf) => {
                    const url = pdfUrlsById[pdf.id] || pdf.staticUrl || '';
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
                          {isEditing && !pdf.staticUrl && (
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

                  {previewPdfId && pdfUrlsById[previewPdfId] && (
                    <iframe
                      title="Предпросмотр фабричной техкарты PDF"
                      src={pdfUrlsById[previewPdfId]}
                      className="w-full h-[420px] rounded-[12px] border border-[#DED8CC] bg-white mt-2"
                    />
                  )}
                </div>
              )}
            </div>

            {/* История изменений паспорта, прогнозов и заказов (Раздел 06 ТЗ v1.1) */}
            <div className="rounded-[16px] border border-[#E6E0D4] p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#1D1D1F]">
                <History className="h-4 w-4 text-[#6E6E73]" />
                <span>История изменений и версий (Audit Log · v{shared.passportVersion})</span>
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-[#EFECE4] text-[12px]">
                {shared.auditHistory.slice(0, 12).map((entry) => (
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
                      {entry.passportVersion ? ` · PDF v${entry.passportVersion}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== ВКЛАДКА 2: ПРОДАЖИ (12 МЕСЯЦЕВ) ==================== */}
        {activeTab === 'sales' && (
          <div className="p-5 md:p-6 space-y-5">
            {/* Панель каналов, переключения График/Таблица и Экспорта/Импорта */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-[10px] bg-[#FAF8F4] border border-[#DED8CC] p-0.5">
                  <button
                    type="button"
                    onClick={() => setSalesViewMode('table')}
                    className={`h-8 px-3 rounded-[8px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                      salesViewMode === 'table'
                        ? 'bg-[#1D1D1F] text-white'
                        : 'text-[#5A564F]'
                    }`}
                  >
                    <TableIcon className="h-3.5 w-3.5" />
                    <span>Таблица 12 мес.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSalesViewMode('chart')}
                    className={`h-8 px-3 rounded-[8px] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                      salesViewMode === 'chart'
                        ? 'bg-[#1D1D1F] text-white'
                        : 'text-[#5A564F]'
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span>График</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-[11.5px] text-[#5A564F] bg-[#FAF8F4] border border-[#E6E0D4] rounded-[10px] px-3 py-1.5">
                  <span>Каналы продаж:</span>
                  <strong>WB {channelSplit.wb}%</strong>
                  <span>·</span>
                  <strong>Другие MP {channelSplit.otherMp}%</strong>
                  <span>·</span>
                  <strong>Сайт {channelSplit.website}%</strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportSkuPlan('csv')}
                  className="h-8 px-3 rounded-[9px] bg-[#FAF8F4] hover:bg-[#EFECE4] border border-[#DED8CC] text-[12px] font-semibold text-[#1D1D1F] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Экспорт CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSkuPlan('json')}
                  className="h-8 px-3 rounded-[9px] bg-[#FAF8F4] hover:bg-[#EFECE4] border border-[#DED8CC] text-[12px] font-semibold text-[#1D1D1F] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Экспорт JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => importPlanInputRef.current?.click()}
                  className="h-8 px-3 rounded-[9px] bg-[#1D1D1F] hover:bg-[#323236] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
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
              </div>
            </div>

            {salesViewMode === 'chart' ? (
              <div className="rounded-[16px] bg-[#FAF8F4] border border-[#E6E0D4] p-5 space-y-4">
                <div className="flex items-center justify-between text-[12.5px] text-[#5A564F]">
                  <span>
                    Помесячная динамика выручки и выкупов ({scenario.title} · {scenario.year})
                  </span>
                  <strong>Годовой итог: {formatMln(pnl.annualRevenueRub)}</strong>
                </div>
                <div className="grid grid-cols-12 gap-2 items-end h-52 pt-4">
                  {MONTHS_SHORT_RU.map((mLabel, mIdx) => {
                    const rev = baseMetrics.monthlyRevenuesRub[mIdx] || 0;
                    const packs = plan.monthlyPacks[mIdx] || 0;
                    const hPct = Math.max(4, Math.round((rev / maxSalesBarRub) * 100));
                    return (
                      <div
                        key={mLabel}
                        className="flex flex-col items-center justify-end h-full gap-1.5"
                      >
                        <span className="text-[10px] font-semibold text-[#4E4A42]">
                          {(rev / 1_000_000).toFixed(1)}м
                        </span>
                        <div
                          style={{ height: `${hPct}%` }}
                          className="w-full max-w-[34px] rounded-t-[8px] bg-[#4E6A85] transition-all"
                          title={`${mLabel}: ${packs.toLocaleString('ru-RU')} компл. (${(
                            packs * model.unitsInPack
                          ).toLocaleString('ru-RU')} изд.) = ${formatRub(rev)}`}
                        />
                        <span className="text-[11px] font-semibold text-[#1D1D1F]">
                          {mLabel}
                        </span>
                        <span className="text-[10px] text-[#6E6E73]">{packs} к.</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[16px] border border-[#E6E0D4]">
                <table className="w-full text-left border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-[#FAF8F4] border-b border-[#E6E0D4] text-[11px] uppercase tracking-wider text-[#6E6E73]">
                      <th className="py-2.5 px-3">Месяц</th>
                      <th className="py-2.5 px-3">План цены (₽/компл.)</th>
                      <th className="py-2.5 px-3">План выкупов (компл.)</th>
                      <th className="py-2.5 px-3">Физические изделия (шт.)</th>
                      <th className="py-2.5 px-3">Плановая выручка</th>
                      <th className="py-2.5 px-3">Факт выкупов (компл.)</th>
                      <th className="py-2.5 px-3">Отклонение</th>
                      <th className="py-2.5 px-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE4]">
                    {MONTHS_SHORT_RU.map((mLabel, mIdx) => {
                      const planPacks = plan.monthlyPacks[mIdx] || 0;
                      const planUnits = planPacks * model.unitsInPack;
                      const planPrice =
                        plan.monthlyPricesRub[mIdx] ?? model.retailPriceRub;
                      const planRev = baseMetrics.monthlyRevenuesRub[mIdx] || 0;
                      const actRec = shared.actualSalesByMonth[mIdx];
                      const actPacks = actRec?.actualBuyoutsPacks ?? null;
                      const diffPacks =
                        actPacks !== null ? actPacks - planPacks : null;
                      const rowStatus: ValueStatusCode =
                        actPacks !== null ? 'fact' : pnl.revenueStatus;

                      return (
                        <tr key={mLabel} className="hover:bg-[#FAF8F4]/60">
                          <td className="py-2 px-3 font-semibold text-[#1D1D1F]">
                            {mLabel} {scenario.year}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={0}
                              step={10}
                              value={planPrice}
                              onChange={(e) => {
                                const val = Math.max(0, Math.round(Number(e.target.value)));
                                const nextPrices = plan.monthlyPricesRub.map((pr, idx) =>
                                  idx === mIdx ? val : pr
                                );
                                commitWithAudit(
                                  {
                                    ...model,
                                    plansByScenario: {
                                      ...model.plansByScenario,
                                      [scenario.id]: {
                                        ...plan,
                                        scenarioId: scenario.id,
                                        monthlyPricesRub: nextPrices,
                                      },
                                    },
                                  },
                                  'sales',
                                  `Изменена цена ${mLabel} (${scenario.title})`,
                                  `${planPrice} ₽`,
                                  `${val} ₽`
                                );
                              }}
                              className="h-7 w-24 rounded-[7px] border border-[#DED8CC] bg-white px-2 font-medium text-[#1D1D1F]"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={0}
                              step={50}
                              value={planPacks}
                              onChange={(e) =>
                                handleMonthBuyoutsChange(mIdx, Number(e.target.value))
                              }
                              className="h-7 w-24 rounded-[7px] border border-[#DED8CC] bg-white px-2 font-semibold text-[#1D1D1F]"
                            />
                          </td>
                          <td className="py-2 px-3 text-[#5A564F]">
                            {planUnits.toLocaleString('ru-RU')} изд.
                          </td>
                          <td className="py-2 px-3 font-semibold text-[#1D1D1F]">
                            {formatRub(planRev)}
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={0}
                              placeholder="Не заполнено"
                              value={actPacks === null ? '' : actPacks}
                              onChange={(e) =>
                                handleMonthActualSaleChange(mIdx, e.target.value)
                              }
                              className="h-7 w-28 rounded-[7px] border border-[#DED8CC] bg-[#FAF8F4] px-2 text-[12px]"
                            />
                          </td>
                          <td className="py-2 px-3 text-[12px]">
                            {diffPacks === null ? (
                              <span className="text-[#8E8A82]">—</span>
                            ) : (
                              <span
                                className={
                                  diffPacks >= 0
                                    ? 'font-semibold text-[#17643A]'
                                    : 'font-semibold text-[#B42318]'
                                }
                              >
                                {diffPacks >= 0 ? `+${diffPacks}` : diffPacks} компл.
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <StatusPill status={rowStatus} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#FAF8F4] border-t border-[#DED8CC] font-bold text-[#1D1D1F]">
                      <td className="py-2.5 px-3">ИТОГО 12 мес.</td>
                      <td className="py-2.5 px-3">
                        ср. {formatRub(pnl.avgRealizedPricePerPackRub)}
                      </td>
                      <td className="py-2.5 px-3">
                        {baseMetrics.annualPacks.toLocaleString('ru-RU')} компл.
                      </td>
                      <td className="py-2.5 px-3">
                        {baseMetrics.annualUnits.toLocaleString('ru-RU')} изд.
                      </td>
                      <td className="py-2.5 px-3">
                        {formatRub(baseMetrics.annualRevenueRub)}
                      </td>
                      <td className="py-2.5 px-3" colSpan={3}>
                        Изменение плана пересчитывает сценарий, остатки и партии закупок
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================== ВКЛАДКА 3: ЗАКУПКИ (ПОЛНОЕ УПРАВЛЕНИЕ ОСТАТКАМИ, ПАРАМЕТРАМИ И ЗАКАЗАМИ PO) ==================== */}
        {activeTab === 'procurement' && (
          <div className="p-5 md:p-6 space-y-5">
            {/* Панель быстрых действий по закупкам SKU */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-[1.5px] border-[#DFDED6]">
              <div>
                <div className="text-[16px] font-bold text-[#141413]">
                  Управление закупками, остатками и заказами фабрике (PO)
                </div>
                <div className="text-[12px] text-[#5E5D58] mt-0.5">
                  Редактируйте фабрику, себестоимость и склад, утверждайте расчётные партии или создавайте свои заказы PO
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCustomPoOpen((v) => !v)}
                  className={`h-9 px-3.5 rounded-[9px] text-[12px] font-semibold border-[1.5px] transition cursor-pointer ${
                    customPoOpen
                      ? 'bg-white text-[#141413] border-[#141413]'
                      : 'bg-[#141413] hover:bg-[#292927] text-white border-[#141413]'
                  }`}
                >
                  {customPoOpen ? 'Скрыть форму заказа' : '+ Новый заказ фабрике (PO)'}
                </button>

                {procurement.recommendedBatches.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      let curModel = model;
                      let count = 0;
                      for (const batch of procurement.recommendedBatches) {
                        const ov = batchOverrides[batch.batchIndex];
                        if (ov) {
                          curModel = createCustomPurchaseOrder(curModel, {
                            packsQty: ov.packsQty ?? batch.recommendedPacks,
                            unitCostRub: ov.unitCostRub ?? batch.unitCostRub,
                            factoryName: ov.factoryName ?? batch.factoryName,
                            arrivalMonthIdx:
                              ov.arrivalMonthIdx ?? batch.firstCoveredMonthIdx,
                            year: scenario.year || 2027,
                            note: `Покрытие ${batch.coverageMonthsLabel}`,
                          });
                        } else {
                          curModel = approveRecommendedBatch(curModel, batch, 'Владелец');
                        }
                        count += 1;
                      }
                      onUpdateModel(curModel);
                      notify(
                        'success',
                        `Утверждены все партии по ${model.code} (${count} PO)`
                      );
                    }}
                    className="h-9 px-3.5 rounded-[9px] bg-[#F5F5F1] hover:bg-white border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[12px] font-semibold text-[#141413] transition cursor-pointer"
                  >
                    Утвердить все партии ({procurement.recommendedBatches.length})
                  </button>
                )}

                {procurement.approvedOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadModelOrdersCsv}
                    className="h-9 px-3.5 rounded-[9px] bg-white hover:bg-[#F5F5F1] border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[12px] font-semibold text-[#141413] transition cursor-pointer"
                  >
                    Скачать PO (CSV · {procurement.approvedOrders.length})
                  </button>
                )}
              </div>
            </div>

            {/* КОНСТРУКТОР ПРОИЗВОЛЬНОГО ЗАКАЗА PO */}
            {customPoOpen && (
              <div className="rounded-[16px] bg-[#F7F7F4] border-[1.5px] border-[#141413] p-4 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[14px] font-bold text-[#141413]">
                    Новый заказ фабрике (PO) по артикулу {model.code}
                  </div>
                  <div className="text-[12px] font-semibold text-[#141413]">
                    Сумма заказа:{' '}
                    <span className="font-mono">
                      {formatRub(Math.max(1, draftPoPacks) * Math.max(0, draftPoCost))}
                    </span>{' '}
                    <span className="text-[#5E5D58] font-normal">
                      ({(Math.max(1, draftPoPacks) * model.unitsInPack).toLocaleString('ru-RU')} физ. изд. · аванс{' '}
                      {shared.factoryParams.prepaymentPct}%:{' '}
                      {formatRub(
                        Math.round(
                          (Math.max(1, draftPoPacks) *
                            Math.max(0, draftPoCost) *
                            shared.factoryParams.prepaymentPct) /
                            100
                        )
                      )}
                      )
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-[12px]">
                  <label className="space-y-1 lg:col-span-2">
                    <span className="text-[#5E5D58] font-medium block">
                      Фабрика / Поставщик
                    </span>
                    <input
                      type="text"
                      value={draftPoFactory}
                      onChange={(e) => setDraftPoFactory(e.target.value)}
                      placeholder="Название фабрики..."
                      className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[#5E5D58] font-medium block">
                      Месяц прихода
                    </span>
                    <select
                      value={draftPoMonthIdx}
                      onChange={(e) => setDraftPoMonthIdx(Number(e.target.value))}
                      className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                    >
                      {MONTHS_SHORT_RU.map((mName, idx) => (
                        <option key={mName} value={idx}>
                          {mName} {scenario.year || 2027}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[#5E5D58] font-medium block">
                      Партия (компл.)
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={50}
                      value={draftPoPacks}
                      onChange={(e) =>
                        setDraftPoPacks(Math.max(1, Math.round(Number(e.target.value) || 0)))
                      }
                      className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[#5E5D58] font-medium block">
                      Себест. (₽/компл.)
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={draftPoCost}
                      onChange={(e) =>
                        setDraftPoCost(Math.max(0, Math.round(Number(e.target.value) || 0)))
                      }
                      className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[#5E5D58] font-medium block">Статус PO</span>
                    <select
                      value={draftPoStatus}
                      onChange={(e) =>
                        setDraftPoStatus(
                          e.target.value as ApprovedPurchaseOrder['status']
                        )
                      }
                      className="h-9 w-full rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                    >
                      {(
                        Object.keys(
                          PO_STATUS_LABELS_RU
                        ) as ApprovedPurchaseOrder['status'][]
                      ).map((st) => (
                        <option key={st} value={st}>
                          {PO_STATUS_LABELS_RU[st]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <input
                    type="text"
                    value={draftPoNote}
                    onChange={(e) => setDraftPoNote(e.target.value)}
                    placeholder="Комментарий к заказу (например: 1-й транш к весеннему сезону, упаковка zip-lock)..."
                    className="h-9 flex-1 min-w-[240px] rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-3 text-[12px] text-[#141413] outline-none"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomPoOpen(false)}
                      className="h-9 px-3 rounded-[8px] bg-white border-[1.5px] border-[#CECDC4] text-[12px] font-semibold text-[#5E5D58] hover:text-[#141413] cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = createCustomPurchaseOrder(model, {
                          packsQty: draftPoPacks,
                          unitCostRub: draftPoCost,
                          factoryName: draftPoFactory,
                          arrivalMonthIdx: draftPoMonthIdx,
                          status: draftPoStatus,
                          note: draftPoNote,
                          year: scenario.year || 2027,
                        });
                        onUpdateModel(updated);
                        setDraftPoNote('');
                        setCustomPoOpen(false);
                        notify(
                          'success',
                          `Создан заказ PO на ${draftPoPacks.toLocaleString('ru-RU')} компл.`,
                          `Приход: ${MONTHS_SHORT_RU[draftPoMonthIdx]} ${scenario.year || 2027}`
                        );
                      }}
                      className="h-9 px-4 rounded-[8px] bg-[#141413] hover:bg-[#292927] text-white text-[12px] font-semibold transition cursor-pointer"
                    >
                      Создать и зафиксировать PO
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4 шага цепочки обеспечения */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="rounded-[15px] bg-[#F7F7F4] border-[1.5px] border-[#C8C7BE] p-4 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#5E5D58]">
                  1. Спрос за год
                </div>
                <div className="text-[20px] font-bold text-[#141413]">
                  {procurement.annualDemandPacks.toLocaleString('ru-RU')} компл.
                </div>
                <div className="text-[11.5px] text-[#5E5D58]">
                  {procurement.annualDemandUnits.toLocaleString('ru-RU')} физ. изд. (по{' '}
                  {model.unitsInPack} шт.)
                </div>
              </div>

              <div className="rounded-[15px] bg-[#F7F7F4] border-[1.5px] border-[#C8C7BE] p-4 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#5E5D58]">
                  2. Обеспечено (склад + PO)
                </div>
                <div className="text-[20px] font-bold text-[#141413]">
                  {(
                    procurement.netOpeningAvailablePacks +
                    procurement.totalApprovedReceiptsPacks
                  ).toLocaleString('ru-RU')}{' '}
                  компл.
                </div>
                <div className="text-[11.5px] text-[#5E5D58]">
                  Склад {procurement.netOpeningAvailablePacks} + Заказы PO{' '}
                  {procurement.totalApprovedReceiptsPacks} (резерв {procurement.reservedStockPacks})
                </div>
              </div>

              <div className="rounded-[15px] bg-[#F7F7F4] border-[1.5px] border-[#C8C7BE] p-4 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#5E5D58]">
                  3. Дефицит без PO
                </div>
                <div
                  className={`text-[20px] font-bold ${
                    procurement.hasDeficit ? 'text-[#B91C1C]' : 'text-[#157347]'
                  }`}
                >
                  {procurement.totalDeficitPacks.toLocaleString('ru-RU')} компл.
                </div>
                <div className="text-[11.5px] text-[#5E5D58]">
                  {procurement.hasDeficit
                    ? `${procurement.totalDeficitUnits.toLocaleString('ru-RU')} изд. ждут заказа PO`
                    : 'План продаж полностью обеспечен'}
                </div>
              </div>

              <div className="rounded-[15px] bg-[#F7F7F4] border-[1.5px] border-[#C8C7BE] p-4 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wide text-[#5E5D58]">
                  4. К заказу / Бюджет
                </div>
                <div className="text-[20px] font-bold text-[#141413]">
                  {procurement.totalRecommendedPacks.toLocaleString('ru-RU')} компл.
                </div>
                <div className="text-[11.5px] text-[#5E5D58]">
                  {model.unitCostRub > 0
                    ? `${formatMln(procurement.totalRecommendedBudgetRub || 0)} · по ${model.unitCostRub} ₽/к.`
                    : 'Укажите себестоимость комплекта ниже ↓'}
                </div>
              </div>
            </div>

            {/* ЖИВЫЕ ПАРАМЕТРЫ ФАБРИКИ, СЕБЕСТОИМОСТИ, СКЛАДА И ЦИКЛА ПОСТАВКИ */}
            <div className="rounded-[16px] border-[1.5px] border-[#C8C7BE] p-4 space-y-3.5 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[14px] font-bold text-[#141413]">
                  Параметры фабрики, себестоимости, остатков и логистики (общие для SKU)
                </div>
                <span className="text-[11.5px] font-semibold text-[#5E5D58]">
                  Полный цикл поставки: <strong className="text-[#141413]">{procurement.totalLeadDays} дн.</strong>{' '}
                  (производство {shared.factoryParams.productionLeadDays} + QC{' '}
                  {shared.factoryParams.qcDays} + доставка{' '}
                  {shared.factoryParams.logisticsLeadDays} + приёмка{' '}
                  {shared.factoryParams.acceptanceDays})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-[12px]">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[#5E5D58] font-medium block">
                    Фабрика / Поставщик
                  </span>
                  <input
                    type="text"
                    value={shared.factoryParams.factoryName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraftPoFactory(val);
                      onUpdateModel({
                        ...model,
                        sharedSupplyAndFact: {
                          ...shared,
                          factoryParams: {
                            ...shared.factoryParams,
                            factoryName: val,
                          },
                        },
                      });
                    }}
                    className="h-8.5 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] font-medium block">
                    Себестоимость (₽/компл.)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={model.unitCostRub || 0}
                    onChange={(e) => {
                      const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                      setDraftPoCost(val);
                      commitWithAudit(
                        {
                          ...model,
                          unitCostRub: val,
                          sharedSupplyAndFact: {
                            ...shared,
                            costStatus: val > 0 ? 'plan' : 'not_filled',
                          },
                        },
                        'procurement',
                        'Обновлена закупочная себестоимость комплекта',
                        `${model.unitCostRub || 0} ₽`,
                        `${val} ₽`
                      );
                    }}
                    className="h-8.5 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] font-medium block">
                    Аванс фабрике (%)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={shared.factoryParams.prepaymentPct}
                    onChange={(e) => {
                      const val = Math.min(
                        100,
                        Math.max(0, Math.round(Number(e.target.value) || 0))
                      );
                      commitWithAudit(
                        {
                          ...model,
                          sharedSupplyAndFact: {
                            ...shared,
                            factoryParams: {
                              ...shared.factoryParams,
                              prepaymentPct: val,
                              balancePaymentPct: 100 - val,
                            },
                          },
                        },
                        'procurement',
                        'Изменён процент аванса фабрике',
                        `${shared.factoryParams.prepaymentPct}%`,
                        `${val}%`
                      );
                    }}
                    className="h-8.5 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] font-medium block">
                    Остаток на складе (компл.)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={shared.actualOpeningStockPacks}
                    onChange={(e) => {
                      const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                      commitWithAudit(
                        {
                          ...model,
                          sharedSupplyAndFact: {
                            ...shared,
                            actualOpeningStockPacks: val,
                          },
                        },
                        'procurement',
                        'Изменён начальный остаток на складе',
                        `${shared.actualOpeningStockPacks} компл.`,
                        `${val} компл.`
                      );
                    }}
                    className="h-8.5 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[12px] pt-1 border-t border-[#ECEBE6]">
                <label className="space-y-1">
                  <span className="text-[#5E5D58] block">В резерве (компл.)</span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={shared.reservedStockPacks}
                    onChange={(e) => {
                      const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                      commitWithAudit(
                        {
                          ...model,
                          sharedSupplyAndFact: {
                            ...shared,
                            reservedStockPacks: val,
                          },
                        },
                        'procurement',
                        'Изменён резерв склада',
                        `${shared.reservedStockPacks} компл.`,
                        `${val} компл.`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] block">MOQ фабрики (компл.)</span>
                  <input
                    type="number"
                    min={1}
                    step={100}
                    value={shared.factoryParams.moqPacks}
                    onChange={(e) => {
                      const val = Math.max(1, Math.round(Number(e.target.value) || 1));
                      commitWithAudit(
                        {
                          ...model,
                          sharedSupplyAndFact: {
                            ...shared,
                            factoryParams: { ...shared.factoryParams, moqPacks: val },
                          },
                        },
                        'procurement',
                        'Обновлён MOQ фабрики',
                        `${shared.factoryParams.moqPacks} компл.`,
                        `${val} компл.`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] block">Производство (дней)</span>
                  <input
                    type="number"
                    min={1}
                    step={5}
                    value={shared.factoryParams.productionLeadDays}
                    onChange={(e) => {
                      const val = Math.max(1, Math.round(Number(e.target.value) || 1));
                      commitWithAudit(
                        {
                          ...model,
                          sharedSupplyAndFact: {
                            ...shared,
                            factoryParams: {
                              ...shared.factoryParams,
                              productionLeadDays: val,
                            },
                          },
                        },
                        'procurement',
                        'Изменён срок производства фабрики',
                        `${shared.factoryParams.productionLeadDays} дн.`,
                        `${val} дн.`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] block">Доставка в РФ (дней)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={shared.factoryParams.logisticsLeadDays}
                    onChange={(e) => {
                      const val = Math.max(1, Math.round(Number(e.target.value) || 1));
                      commitWithAudit(
                        {
                          ...model,
                          sharedSupplyAndFact: {
                            ...shared,
                            factoryParams: {
                              ...shared.factoryParams,
                              logisticsLeadDays: val,
                            },
                          },
                        },
                        'procurement',
                        'Изменён срок доставки партии',
                        `${shared.factoryParams.logisticsLeadDays} дн.`,
                        `${val} дн.`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] block">Страх. запас (дней)</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={shared.factoryParams.safetyStockDays}
                    onChange={(e) => {
                      const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                      commitWithAudit(
                        {
                          ...model,
                          sharedSupplyAndFact: {
                            ...shared,
                            factoryParams: {
                              ...shared.factoryParams,
                              safetyStockDays: val,
                            },
                          },
                        },
                        'procurement',
                        'Изменён страховой запас',
                        `${shared.factoryParams.safetyStockDays} дн.`,
                        `${val} дн.`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#5E5D58] block">Окно партии (мес.)</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={shared.factoryParams.coverageWindowMonths}
                    onChange={(e) => {
                      const val = Math.min(
                        6,
                        Math.max(1, Math.round(Number(e.target.value) || 1))
                      );
                      commitWithAudit(
                        {
                          ...model,
                          sharedSupplyAndFact: {
                            ...shared,
                            factoryParams: {
                              ...shared.factoryParams,
                              coverageWindowMonths: val,
                            },
                          },
                        },
                        'procurement',
                        'Изменена глубина покрытия партии',
                        `${shared.factoryParams.coverageWindowMonths} мес.`,
                        `${val} мес.`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border-[1.5px] border-[#CECDC4] focus:border-[#141413] px-2.5 font-semibold text-[#141413] outline-none"
                  />
                </label>
              </div>
            </div>

            {/* РЕЕСТР УТВЕРЖДЁННЫХ ЗАКАЗОВ PO (ПОЛНОЕ РЕДАКТИРОВАНИЕ СТАТУСА, ОБЪЁМА, ЦЕНЫ, СРОКОВ И УДАЛЕНИЕ) */}
            <div className="rounded-[16px] bg-white border-[1.5px] border-[#C8C7BE] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[14px] font-bold text-[#141413]">
                    Утверждённые заказы PO ({procurement.approvedOrders.length})
                  </div>
                  <div className="text-[11.5px] text-[#5E5D58]">
                    Защищены от автоматического пересчёта, но вы можете вручную менять статус, партию, цену, сроки или удалять заказ
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomPoOpen(true)}
                  className="h-8 px-3 rounded-[8px] bg-[#F5F5F1] hover:bg-white border-[1.5px] border-[#CECDC4] hover:border-[#141413] text-[11.5px] font-semibold text-[#141413] cursor-pointer"
                >
                  + Добавить заказ PO
                </button>
              </div>

              {procurement.approvedOrders.length === 0 ? (
                <div className="rounded-[12px] bg-[#F7F7F4] border border-dashed border-[#CECDC4] px-4 py-3 text-[12.5px] text-[#5E5D58] flex flex-wrap items-center justify-between gap-2">
                  <span>
                    По этому артикулу ещё нет оформленных заказов PO. Утвердите расчётную партию ниже или создайте свой заказ.
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomPoOpen(true)}
                    className="text-[12px] font-bold text-[#141413] underline cursor-pointer"
                  >
                    Создать заказ PO →
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {procurement.approvedOrders.map((po) => {
                    const disc = procurement.orderDiscrepancies.find(
                      (d) => d.orderId === po.id
                    );
                    return (
                      <div
                        key={po.id}
                        className="rounded-[13px] bg-[#F7F7F4] border-[1.5px] border-[#CECDC4] p-3.5 space-y-2.5 text-[12px]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-[6px] bg-[#141413] text-white font-mono text-[11px] font-semibold">
                              {po.orderNumber} · v{po.version}
                            </span>
                            <select
                              value={po.status}
                              onChange={(e) => {
                                const nextSt = e.target
                                  .value as ApprovedPurchaseOrder['status'];
                                onUpdateModel(
                                  updateApprovedPurchaseOrder(model, po.id, {
                                    status: nextSt,
                                  })
                                );
                                notify(
                                  'success',
                                  `${po.orderNumber}: статус «${PO_STATUS_LABELS_RU[nextSt]}»`
                                );
                              }}
                              className="h-7 px-2 rounded-[7px] bg-white border-[1.5px] border-[#CECDC4] focus:border-[#141413] text-[11.5px] font-semibold text-[#141413] cursor-pointer outline-none"
                            >
                              {(
                                Object.keys(
                                  PO_STATUS_LABELS_RU
                                ) as ApprovedPurchaseOrder['status'][]
                              ).map((st) => (
                                <option key={st} value={st}>
                                  {PO_STATUS_LABELS_RU[st]}
                                </option>
                              ))}
                            </select>
                            <span className="text-[11.5px] text-[#5E5D58]">
                              {po.physicalUnitsQty.toLocaleString('ru-RU')} физ. изд.
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="text-right">
                              <span className="font-bold text-[14px] text-[#141413]">
                                {formatRub(po.totalOrderRub)}
                              </span>
                              <span className="text-[11px] text-[#5E5D58] ml-1.5">
                                (аванс {formatRub(po.prepaymentRub)} · доплата{' '}
                                {formatRub(po.balancePaymentRub)})
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                onUpdateModel(removeApprovedPurchaseOrder(model, po.id));
                                notify('warning', `Заказ ${po.orderNumber} удалён`);
                              }}
                              className="h-7 px-2.5 rounded-[7px] bg-white hover:bg-[#FEF2F2] border border-[#CECDC4] hover:border-[#FCA5A5] text-[11px] font-semibold text-[#B91C1C] transition cursor-pointer"
                            >
                              Удалить
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                          <label className="space-y-0.5 lg:col-span-2">
                            <span className="text-[10.5px] text-[#5E5D58] block">
                              Фабрика
                            </span>
                            <input
                              type="text"
                              value={po.factoryName}
                              onChange={(e) =>
                                onUpdateModel(
                                  updateApprovedPurchaseOrder(model, po.id, {
                                    factoryName: e.target.value,
                                  })
                                )
                              }
                              className="h-8 w-full rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                            />
                          </label>

                          <label className="space-y-0.5">
                            <span className="text-[10.5px] text-[#5E5D58] block">
                              Комплектов
                            </span>
                            <input
                              type="number"
                              min={1}
                              step={50}
                              value={po.packsQty}
                              onChange={(e) =>
                                onUpdateModel(
                                  updateApprovedPurchaseOrder(model, po.id, {
                                    packsQty: Math.max(
                                      1,
                                      Math.round(Number(e.target.value) || 1)
                                    ),
                                  })
                                )
                              }
                              className="h-8 w-full rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                            />
                          </label>

                          <label className="space-y-0.5">
                            <span className="text-[10.5px] text-[#5E5D58] block">
                              Цена (₽/компл.)
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={10}
                              value={po.lockedUnitCostRub}
                              onChange={(e) =>
                                onUpdateModel(
                                  updateApprovedPurchaseOrder(model, po.id, {
                                    lockedUnitCostRub: Math.max(
                                      0,
                                      Math.round(Number(e.target.value) || 0)
                                    ),
                                  })
                                )
                              }
                              className="h-8 w-full rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                            />
                          </label>

                          <label className="space-y-0.5">
                            <span className="text-[10.5px] text-[#5E5D58] block">
                              Месяц прихода
                            </span>
                            <select
                              value={po.arrivalMonthIdx}
                              onChange={(e) =>
                                onUpdateModel(
                                  updateApprovedPurchaseOrder(
                                    model,
                                    po.id,
                                    { arrivalMonthIdx: Number(e.target.value) },
                                    'Владелец',
                                    scenario.year || 2027
                                  )
                                )
                              }
                              className="h-8 w-full rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                            >
                              {MONTHS_SHORT_RU.map((mName, idx) => (
                                <option key={mName} value={idx}>
                                  {mName} {scenario.year || 2027}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="space-y-0.5">
                            <span className="text-[10.5px] text-[#5E5D58] block">
                              Дата заказа
                            </span>
                            <input
                              type="date"
                              value={po.orderPlacementDateIso}
                              onChange={(e) =>
                                onUpdateModel(
                                  updateApprovedPurchaseOrder(model, po.id, {
                                    orderPlacementDateIso: e.target.value,
                                  })
                                )
                              }
                              className="h-8 w-full rounded-[7px] bg-white border border-[#CECDC4] focus:border-[#141413] px-2 font-mono text-[11px] font-semibold text-[#141413] outline-none"
                            />
                          </label>
                        </div>

                        {disc && (
                          <div className="rounded-[9px] bg-[#FFFBEB] border border-[#FCD34D] px-3 py-2 text-[11.5px] text-[#92400E] flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <strong>Изменились базовые параметры SKU:</strong>{' '}
                              {disc.message}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateModel(
                                  updateApprovedPurchaseOrder(model, po.id, {
                                    orderPlacementDateIso: disc.recalculatedOrderDateIso,
                                    lockedUnitCostRub:
                                      model.unitCostRub > 0
                                        ? model.unitCostRub
                                        : po.lockedUnitCostRub,
                                  })
                                );
                                notify(
                                  'success',
                                  `Заказ ${po.orderNumber} синхронизирован с текущими параметрами`
                                );
                              }}
                              className="h-7 px-2.5 rounded-[6px] bg-white border border-[#F59E0B] text-[11px] font-semibold text-[#92400E] hover:bg-[#FEF3C7] cursor-pointer shrink-0"
                            >
                              Обновить в PO
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* РЕКОМЕНДОВАННЫЕ ПАРТИИ (С ВОЗМОЖНОСТЬЮ СКОРРЕКТИРОВАТЬ КОЛ-ВО И ЦЕНУ ПЕРЕД УТВЕРЖДЕНИЕМ) */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-bold text-[#141413]">
                  Рекомендованные закупочные партии ({procurement.recommendedBatches.length})
                </h3>
                <span className="text-[11.5px] text-[#5E5D58]">
                  Можно скорректировать объём, цену и месяц прихода прямо перед утверждением в PO
                </span>
              </div>

              {procurement.recommendedBatches.length === 0 ? (
                <div className="rounded-[14px] bg-[#EAF6F0] border border-[#CBEAD9] px-4 py-3 text-[13px] font-medium text-[#157347]">
                  Весь плановый спрос полностью покрыт текущими остатками и утверждёнными заказами PO.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {procurement.recommendedBatches.map((batch) => {
                    const ov = batchOverrides[batch.batchIndex] || {};
                    const effPacks = ov.packsQty ?? batch.recommendedPacks;
                    const effCost = ov.unitCostRub ?? (model.unitCostRub || batch.unitCostRub || 0);
                    const effMonthIdx = ov.arrivalMonthIdx ?? batch.firstCoveredMonthIdx;
                    const effFactory = ov.factoryName ?? batch.factoryName;
                    const effTotalRub = effPacks * effCost;
                    const effPrepayRub = Math.round(
                      (effTotalRub * shared.factoryParams.prepaymentPct) / 100
                    );

                    return (
                      <div
                        key={batch.batchIndex}
                        className="rounded-[16px] border-[1.5px] border-[#C8C7BE] bg-white p-4 space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-bold text-[#141413]">
                              Партия #{batch.batchIndex} · покрытие {batch.coverageMonthsLabel}
                            </span>
                            {batch.isUrgentPastOrderDate ? (
                              <span className="px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] text-[10.5px] font-semibold">
                                Срочный заказ ({batch.recommendedOrderDateIso})
                              </span>
                            ) : (
                              <StatusPill status="plan" />
                            )}
                          </div>

                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                              <div className="text-[19px] font-bold text-[#141413]">
                                {effPacks.toLocaleString('ru-RU')} компл.
                              </div>
                              <div className="text-[11.5px] text-[#5E5D58]">
                                {(effPacks * model.unitsInPack).toLocaleString('ru-RU')} физ. изд.
                                (потребность {batch.rawNetNeedPacks} к. · MOQ{' '}
                                {shared.factoryParams.moqPacks})
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[17px] font-bold text-[#141413]">
                                {effCost > 0
                                  ? formatRub(effTotalRub)
                                  : 'Укажите цену ↓'}
                              </div>
                              {effCost > 0 && (
                                <div className="text-[11px] text-[#5E5D58]">
                                  Аванс {shared.factoryParams.prepaymentPct}%:{' '}
                                  {formatRub(effPrepayRub)}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Инлайн-корректировка партии перед утверждением */}
                          <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                            <label className="space-y-0.5">
                              <span className="text-[#5E5D58] block">К заказу (компл.)</span>
                              <input
                                type="number"
                                min={1}
                                step={50}
                                value={effPacks}
                                onChange={(e) =>
                                  setBatchOverrides((prev) => ({
                                    ...prev,
                                    [batch.batchIndex]: {
                                      ...prev[batch.batchIndex],
                                      packsQty: Math.max(
                                        1,
                                        Math.round(Number(e.target.value) || 1)
                                      ),
                                    },
                                  }))
                                }
                                className="h-8 w-full rounded-[7px] bg-[#F7F7F4] border border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                              />
                            </label>

                            <label className="space-y-0.5">
                              <span className="text-[#5E5D58] block">Цена (₽/компл.)</span>
                              <input
                                type="number"
                                min={0}
                                step={10}
                                value={effCost}
                                onChange={(e) =>
                                  setBatchOverrides((prev) => ({
                                    ...prev,
                                    [batch.batchIndex]: {
                                      ...prev[batch.batchIndex],
                                      unitCostRub: Math.max(
                                        0,
                                        Math.round(Number(e.target.value) || 0)
                                      ),
                                    },
                                  }))
                                }
                                className="h-8 w-full rounded-[7px] bg-[#F7F7F4] border border-[#CECDC4] focus:border-[#141413] px-2 font-semibold text-[#141413] outline-none"
                              />
                            </label>

                            <label className="space-y-0.5">
                              <span className="text-[#5E5D58] block">Приход на склад</span>
                              <select
                                value={effMonthIdx}
                                onChange={(e) =>
                                  setBatchOverrides((prev) => ({
                                    ...prev,
                                    [batch.batchIndex]: {
                                      ...prev[batch.batchIndex],
                                      arrivalMonthIdx: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="h-8 w-full rounded-[7px] bg-[#F7F7F4] border border-[#CECDC4] focus:border-[#141413] px-1.5 font-semibold text-[#141413] outline-none"
                              >
                                {MONTHS_SHORT_RU.map((mName, idx) => (
                                  <option key={mName} value={idx}>
                                    {mName} {scenario.year || 2027}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="flex flex-wrap gap-1 text-[10.5px] text-[#5E5D58]">
                            {(['S', 'M', 'L', 'XL', 'XXL'] as const).map((sz) => (
                              <span
                                key={sz}
                                className="px-2 py-0.5 rounded bg-[#F7F7F4] border border-[#DFDED6]"
                              >
                                {sz}: {Math.round((effPacks * (shared.factoryParams.sizeSharesPct[sz] || 20)) / 100)} к.
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const hasCustomEdit = Boolean(batchOverrides[batch.batchIndex]);
                            const updated = hasCustomEdit
                              ? createCustomPurchaseOrder(model, {
                                  packsQty: effPacks,
                                  unitCostRub: effCost,
                                  factoryName: effFactory,
                                  arrivalMonthIdx: effMonthIdx,
                                  year: scenario.year || 2027,
                                  note: `Партия #${batch.batchIndex} (${batch.coverageMonthsLabel})`,
                                })
                              : approveRecommendedBatch(model, batch, 'Владелец');
                            onUpdateModel(updated);
                            notify(
                              'success',
                              `Партия #${batch.batchIndex} (${effPacks.toLocaleString('ru-RU')} компл.) оформлена в PO`,
                              `Поступление: ${MONTHS_SHORT_RU[effMonthIdx]} ${scenario.year || 2027}`
                            );
                          }}
                          className="h-9 w-full rounded-[9px] bg-[#141413] hover:bg-[#292927] text-white text-[12px] font-semibold transition cursor-pointer"
                        >
                          Утвердить заказ PO ({effPacks.toLocaleString('ru-RU')} компл.)
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Помесячный баланс реального наличия + закрытие дефицита месяца в 1 клик */}
            <div className="overflow-x-auto rounded-[16px] border-[1.5px] border-[#C8C7BE] bg-white">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="bg-[#F5F5F1] border-b-[1.5px] border-[#C8C7BE] text-[11px] uppercase text-[#5E5D58]">
                    <th className="py-2.5 px-3">Месяц</th>
                    <th className="py-2.5 px-3">Нач. остаток</th>
                    <th className="py-2.5 px-3">Приход по PO</th>
                    <th className="py-2.5 px-3">План продаж</th>
                    <th className="py-2.5 px-3">Кон. остаток</th>
                    <th className="py-2.5 px-3 text-right">Обеспечение / Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEBE6]">
                  {procurement.monthlyBalance.map((row) => (
                    <tr key={row.monthLabel} className="hover:bg-[#FAF9F6]">
                      <td className="py-2 px-3 font-semibold text-[#141413]">
                        {row.monthLabel}
                      </td>
                      <td className="py-2 px-3 text-[#3F3E3A]">
                        {row.openingAvailablePacks.toLocaleString('ru-RU')} к.
                      </td>
                      <td className="py-2 px-3 font-semibold text-[#141413]">
                        {row.approvedReceiptsPacks > 0
                          ? `+${row.approvedReceiptsPacks.toLocaleString('ru-RU')} к.`
                          : '—'}
                      </td>
                      <td className="py-2 px-3 text-[#3F3E3A]">
                        {row.demandPacks.toLocaleString('ru-RU')} к. (
                        {row.demandUnits.toLocaleString('ru-RU')} изд.)
                      </td>
                      <td className="py-2 px-3 font-semibold text-[#141413]">
                        {Math.max(0, row.endingAvailablePacks).toLocaleString('ru-RU')} к.
                      </td>
                      <td className="py-2 px-3 text-right">
                        {row.deficitPacks > 0 ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="font-semibold text-[#B91C1C]">
                              −{row.deficitPacks.toLocaleString('ru-RU')} к.
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const mult = Math.max(
                                  1,
                                  shared.factoryParams.packMultiple || 50
                                );
                                const orderQty = Math.ceil(row.deficitPacks / mult) * mult;
                                const updated = createCustomPurchaseOrder(model, {
                                  packsQty: orderQty,
                                  unitCostRub: model.unitCostRub || 0,
                                  factoryName: shared.factoryParams.factoryName,
                                  arrivalMonthIdx: row.monthIdx,
                                  year: scenario.year || 2027,
                                  note: `Закрытие дефицита ${row.monthLabel} ${scenario.year || 2027}`,
                                });
                                onUpdateModel(updated);
                                notify(
                                  'success',
                                  `Создан PO на ${orderQty.toLocaleString('ru-RU')} компл. к ${row.monthLabel}`
                                );
                              }}
                              className="h-7 px-2.5 rounded-[7px] bg-[#141413] hover:bg-[#292927] text-white text-[11px] font-semibold transition cursor-pointer"
                            >
                              + Заказать {row.deficitPacks.toLocaleString('ru-RU')} к.
                            </button>
                          </div>
                        ) : (
                          <span className="text-[#157347] font-semibold">Обеспечено</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== ВКЛАДКА 4: ФИНАНСЫ (КАСКАДНЫЙ P&L И КАПИТАЛ, РАЗДЕЛ 05 ТЗ v1.1) ==================== */}
        {activeTab === 'finance' && (
          <div className="p-5 md:p-6 space-y-6">
            {/* Редактор операционных расходов и OPEX */}
            <div className="rounded-[16px] bg-[#FAF8F4] border border-[#E6E0D4] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[14px] font-bold text-[#1D1D1F]">
                  Параметры себестоимости, комиссий MP, логистики, рекламы и постоянных OPEX
                </div>
                <span className="text-[11.5px] text-[#6E6E73]">
                  Если расходы не заполнены — операционная прибыль отображается как «Не рассчитана»
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[12px]">
                <label className="space-y-1">
                  <span className="text-[#6E6E73] block">Себестоимость (₽/компл.)</span>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={model.unitCostRub || ''}
                    placeholder="Не заполнено"
                    onChange={(e) => handleUnitCostChange(Number(e.target.value))}
                    className="h-8 w-full rounded-[8px] border border-[#DED8CC] bg-white px-2.5 font-semibold"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#6E6E73] block">Комиссия MP (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    step={0.5}
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
                        'Обновлена комиссия маркетплейса',
                        `${model.marketplaceFeePct}%`,
                        `${val}%`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border border-[#DED8CC] bg-white px-2.5 font-semibold"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#6E6E73] block">Логистика (₽/компл.)</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={model.logisticsRub}
                    onChange={(e) => {
                      const val = Math.max(0, Math.round(Number(e.target.value)));
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
                        'Обновлена стоимость логистики за комплект',
                        `${model.logisticsRub} ₽`,
                        `${val} ₽`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border border-[#DED8CC] bg-white px-2.5 font-semibold"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#6E6E73] block">Реклама ДРР (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
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
                        'Обновлена доля рекламных расходов (ДРР)',
                        `${model.adsPct}%`,
                        `${val}%`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border border-[#DED8CC] bg-white px-2.5 font-semibold"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#6E6E73] block">Прочие перем. (₽/компл.)</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
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
                        'Обновлены прочие переменные расходы',
                        `${shared.otherVariableRubPerPack} ₽`,
                        `${val} ₽`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border border-[#DED8CC] bg-white px-2.5 font-semibold"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-[#6E6E73] block">Постоянные OPEX (₽/компл.)</span>
                  <input
                    type="number"
                    min={0}
                    step={5}
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
                        'Обновлены распределённые постоянные расходы OPEX',
                        shared.allocatedFixedOpexRubPerPack === null
                          ? 'Не задано'
                          : `${shared.allocatedFixedOpexRubPerPack} ₽`,
                        val === null ? 'Не задано' : `${val} ₽`
                      );
                    }}
                    className="h-8 w-full rounded-[8px] border border-[#DED8CC] bg-white px-2.5 font-semibold"
                  />
                </label>
              </div>
            </div>

            {/* Каскадная таблица P&L: 1 комплект vs Год 2027 */}
            <div className="overflow-x-auto rounded-[16px] border border-[#E6E0D4]">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[#FAF8F4] border-b border-[#E6E0D4] text-[11px] uppercase text-[#6E6E73]">
                    <th className="py-2.5 px-4">Показатель P&L</th>
                    <th className="py-2.5 px-4">Формула расчёта</th>
                    <th className="py-2.5 px-4">На 1 комплект</th>
                    <th className="py-2.5 px-4">За 2027 год</th>
                    <th className="py-2.5 px-4">Доля от выручки</th>
                    <th className="py-2.5 px-4">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE4]">
                  <tr>
                    <td className="py-2.5 px-4 font-bold text-[#1D1D1F]">1. Выручка</td>
                    <td className="py-2.5 px-4 text-[12px] text-[#6E6E73]">
                      Выкупленные комплекты × средняя реализованная цена
                    </td>
                    <td className="py-2.5 px-4 font-semibold">
                      {formatRub(pnl.avgRealizedPricePerPackRub)}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-[#1D1D1F]">
                      {formatRub(pnl.annualRevenueRub)}
                    </td>
                    <td className="py-2.5 px-4">100%</td>
                    <td className="py-2.5 px-4">
                      <StatusPill status={pnl.revenueStatus} />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-4 font-medium text-[#5A564F]">
                      − Себестоимость выкупленного товара
                    </td>
                    <td className="py-2.5 px-4 text-[12px] text-[#6E6E73]">
                      Выкупленные комплекты × себестоимость под ключ
                    </td>
                    <td className="py-2.5 px-4">
                      {pnl.unitCostPerPackRub !== null
                        ? formatRub(pnl.unitCostPerPackRub)
                        : 'Не заполнено'}
                    </td>
                    <td className="py-2.5 px-4">
                      {pnl.annualCogsRub !== null
                        ? formatRub(pnl.annualCogsRub)
                        : 'Не заполнено'}
                    </td>
                    <td className="py-2.5 px-4">
                      {pnl.annualCogsRub !== null && pnl.annualRevenueRub > 0
                        ? `${Math.round((pnl.annualCogsRub / pnl.annualRevenueRub) * 1000) / 10}%`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusPill status={pnl.costStatus} />
                    </td>
                  </tr>

                  <tr className="bg-[#FAF8F4]/70">
                    <td className="py-2.5 px-4 font-bold text-[#1D1D1F]">
                      2. Валовая прибыль (не операционная)
                    </td>
                    <td className="py-2.5 px-4 text-[12px] text-[#6E6E73]">
                      Выручка − себестоимость выкупленного товара
                    </td>
                    <td className="py-2.5 px-4 font-semibold">
                      {pnl.unitGrossProfitRub !== null
                        ? formatRub(pnl.unitGrossProfitRub)
                        : 'Не рассчитана'}
                    </td>
                    <td className="py-2.5 px-4 font-bold">
                      {pnl.annualGrossProfitRub !== null
                        ? formatRub(pnl.annualGrossProfitRub)
                        : 'Не рассчитана'}
                    </td>
                    <td className="py-2.5 px-4 font-semibold">
                      {pnl.grossMarginPct !== null ? `${pnl.grossMarginPct}%` : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusPill
                        status={pnl.annualGrossProfitRub !== null ? 'plan' : 'not_filled'}
                      />
                    </td>
                  </tr>

                  <tr>
                    <td className="py-2.5 px-4 font-medium text-[#5A564F]">
                      − Комиссии MP, логистика, реклама и перем. расходы
                    </td>
                    <td className="py-2.5 px-4 text-[12px] text-[#6E6E73]">
                      MP {model.marketplaceFeePct}% + лог. {model.logisticsRub} ₽ + рекл.{' '}
                      {model.adsPct}% + проч. {shared.otherVariableRubPerPack} ₽
                    </td>
                    <td className="py-2.5 px-4">
                      {pnl.expensesFilled
                        ? formatRub(
                            (pnl.unitMpCommissionRub || 0) +
                              (pnl.unitLogisticsRub || 0) +
                              (pnl.unitAdsRub || 0) +
                              (pnl.unitOtherVarRub || 0)
                          )
                        : 'Не заполнено'}
                    </td>
                    <td className="py-2.5 px-4">
                      {pnl.expensesFilled
                        ? formatRub(
                            (pnl.annualMpCommissionRub || 0) +
                              (pnl.annualLogisticsRub || 0) +
                              (pnl.annualAdsRub || 0) +
                              (pnl.annualOtherVarRub || 0)
                          )
                        : 'Не заполнено'}
                    </td>
                    <td className="py-2.5 px-4">—</td>
                    <td className="py-2.5 px-4">
                      <StatusPill status={pnl.marginStatus} />
                    </td>
                  </tr>

                  <tr className="bg-[#FAF8F4]/70">
                    <td className="py-2.5 px-4 font-bold text-[#1D1D1F]">
                      3. Маржинальная прибыль
                    </td>
                    <td className="py-2.5 px-4 text-[12px] text-[#6E6E73]">
                      Валовая прибыль − комиссии MP − логистика − реклама
                    </td>
                    <td className="py-2.5 px-4 font-semibold">
                      {pnl.unitContributionMarginRub !== null
                        ? formatRub(pnl.unitContributionMarginRub)
                        : 'Не рассчитана'}
                    </td>
                    <td className="py-2.5 px-4 font-bold">
                      {pnl.annualContributionMarginRub !== null
                        ? formatRub(pnl.annualContributionMarginRub)
                        : 'Не рассчитана'}
                    </td>
                    <td className="py-2.5 px-4 font-semibold">
                      {pnl.contributionMarginPct !== null
                        ? `${pnl.contributionMarginPct}%`
                        : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusPill status={pnl.marginStatus} />
                    </td>
                  </tr>

                  <tr className="bg-[#F4F8F5]">
                    <td className="py-3 px-4 font-bold text-[#1D1D1F]">
                      4. Операционная прибыль
                    </td>
                    <td className="py-3 px-4 text-[12px] text-[#6E6E73]">
                      Маржинальная прибыль − распределённые постоянные расходы OPEX
                    </td>
                    <td className="py-3 px-4 font-bold">
                      {pnl.unitOperatingProfitRub !== null
                        ? formatRub(pnl.unitOperatingProfitRub)
                        : 'Не рассчитана'}
                    </td>
                    <td className="py-3 px-4 font-bold text-[#17643A]">
                      {pnl.annualOperatingProfitRub !== null
                        ? formatRub(pnl.annualOperatingProfitRub)
                        : pnl.operatingProfitNotCalculatedReason}
                    </td>
                    <td className="py-3 px-4 font-bold">
                      {pnl.operatingMarginPct !== null
                        ? `${pnl.operatingMarginPct}%`
                        : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <StatusPill status={pnl.operatingProfitStatus} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Потребность в капитале и график платежей */}
            <div className="rounded-[16px] border border-[#E6E0D4] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[14px] font-bold text-[#1D1D1F]">
                    5. Потребность в оборотном капитале и денежный поток закупок
                  </div>
                  <div className="text-[12px] text-[#6E6E73]">
                    Учитывает график предоплаты ({shared.factoryParams.prepaymentPct}%) и доплаты (
                    {shared.factoryParams.balancePaymentPct}%) за партии vs поступления от продаж
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-[#6E6E73]">Пиковый кассовый дефицит</div>
                  <div className="text-[18px] font-bold text-[#B42318]">
                    {pnl.peakCapitalDeficitRub > 0
                      ? formatRub(pnl.peakCapitalDeficitRub)
                      : '0 ₽ (самоокупаемость)'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-[11.5px]">
                {pnl.monthlyCashFlow.map((cf) => (
                  <div
                    key={cf.monthLabel}
                    className="rounded-[10px] bg-[#FAF8F4] border border-[#ECE8DF] p-2.5 space-y-0.5"
                  >
                    <div className="font-bold text-[#1D1D1F]">{cf.monthLabel}</div>
                    <div className="text-[#17643A]">
                      +{formatMln(cf.inflowSalesRub)}
                    </div>
                    <div className="text-[#B42318]">
                      −{formatMln(cf.outflowProcurementRub + cf.outflowVariableAndOpexRub)}
                    </div>
                    <div className="text-[10.5px] font-semibold text-[#4E4A42] pt-0.5 border-t border-[#E6E0D4]">
                      Баланс: {formatMln(cf.cumulativeCashBalanceRub)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
