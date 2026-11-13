'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileDown,
  Plus,
  Printer,
  Trash2,
  Upload,
  AlertTriangle,
} from 'lucide-react';
import {
  AppUser,
  Competitor,
  ConceptStage,
  Launch,
  Product,
  ProductConcept,
  RnDAnalysisReport,
  RnDDecisionOutcome,
  RnDMarketEvidence,
  RnDProductionInternalStatus,
  RnDSampleItem,
  TaskItem,
} from '@/types/platform';
import { resolvePublicAssetUrl } from '@/lib/scenarioData';
import { formatLabBrandLabel, normalizeLabBrandCode } from '@/lib/rndCatalogSync';
import {
  cleanTechPackText,
  getBrandProductionProfile,
} from '@/lib/brandProductionConfig';
import {
  canUserApproveProduction,
  canUserViewCostPrice,
  formatCurrencyRub,
} from '@/lib/finance';
import {
  compressImageFileToDataUrl,
  exportConceptProductionExcel,
  exportConceptProductionPdf,
} from '@/lib/document-export';
import { PdfConstructorModal } from './PdfConstructorModal';

export type RnDCardTabId =
  | 'overview'
  | 'analysis'
  | 'samples'
  | 'testing'
  | 'decisions'
  | 'production'
  | 'launch'
  | 'files'
  | 'history';

export const RND_CARD_TABS: { id: RnDCardTabId; label: string; shortNum: string; title: string }[] = [
  { id: 'overview', label: '01 Идея', shortNum: '01', title: 'Идея' },
  { id: 'analysis', label: '02 Анализ', shortNum: '02', title: 'Анализ' },
  { id: 'samples', label: '03 Образец', shortNum: '03', title: 'Образец' },
  { id: 'testing', label: '04 Тест', shortNum: '04', title: 'Тест' },
  { id: 'decisions', label: '05 Решение', shortNum: '05', title: 'Решение' },
  { id: 'production', label: '06 Производство', shortNum: '06', title: 'Производство' },
  { id: 'launch', label: '07 Запуск', shortNum: '07', title: 'Запуск' },
  { id: 'history', label: 'История решений', shortNum: '•', title: 'История' },
];

export const FACTORY_DIRECTORY = [
  { name: 'Ташкент Текстиль №1', country: 'Узбекистан' },
  { name: 'Фергана Коттон Полотно', country: 'Узбекистан' },
  { name: 'Гуандун Интимейтс (Guangdong Intimates)', country: 'Китай' },
  { name: 'Сучжоу Бесшовные Технологии (Suzhou Seamless)', country: 'Китай' },
  { name: 'Стамбул Трикотаж (Istanbul Knitwear)', country: 'Турция' },
  { name: 'Иваново Премиум Трикотаж', country: 'Россия' },
];

export const MATERIAL_DIRECTORY: {
  ru: string;
  en: string;
  zh: string;
}[] = [
  { ru: 'Хлопок', en: 'Cotton', zh: '棉 (Cotton)' },
  { ru: 'Модал', en: 'Modal', zh: '莫代尔 (Modal)' },
  { ru: 'Микромодал', en: 'MicroModal', zh: '超细莫代尔 (MicroModal)' },
  { ru: 'Эластан', en: 'Elastane / Spandex', zh: '氨纶 (Elastane)' },
  { ru: 'Полиамид', en: 'Polyamide / Nylon', zh: '锦纶 / 尼龙 (Polyamide)' },
  { ru: 'Бамбук', en: 'Bamboo Fiber', zh: '竹纤维 (Bamboo)' },
  { ru: 'Вискоза', en: 'Viscose', zh: '粘胶纤维 (Viscose)' },
  { ru: 'Микрофибра', en: 'Microfiber', zh: '超细纤维 (Microfiber)' },
];

export const PRODUCTION_INTERNAL_STATUSES: {
  code: RnDProductionInternalStatus;
  label: string;
}[] = [
  { code: 'order_prep', label: 'Черновик заказа' },
  { code: 'order_placed', label: 'Заказ размещён' },
  { code: 'in_production', label: 'В пошиве' },
  { code: 'qc_inspection', label: 'Проверка ОТК' },
  { code: 'ready', label: 'Готово к отгрузке' },
  { code: 'in_delivery', label: 'В доставке' },
  { code: 'received', label: 'Принято на склад' },
];

export interface ProductLabCardBodyProps {
  concept: ProductConcept;
  activeTab: RnDCardTabId;
  canEdit: boolean;
  isStrategyMode: boolean;
  currentUser: AppUser;
  users: AppUser[];
  products: Product[];
  launches: Launch[];
  tasks: TaskItem[];
  competitors: Competitor[];
  onUpdateConcept: (id: string, patch: Partial<ProductConcept>) => void;
  onChangeStageWithGate: (concept: ProductConcept, targetStage: ConceptStage) => void;
  onCreateLaunchFromConcept: (concept: ProductConcept) => void;
  onCreateProductFromConcept: (conceptId: string) => void;
  linkedScenarioModelCode?: string | null;
  onSyncToScenarioCatalog?: (concept: ProductConcept) => void;
  onSyncConcept?: (nextConcept: ProductConcept) => void;
  onCreateTaskForConcept: (title: string, assigneeId: string, deadline: string) => void;
  onNavigateToSection: (
    section:
      | 'product-catalog'
      | 'launch-calendar'
      | 'roadmap-tasks'
      | 'market-intelligence'
      | 'brand-strategy'
      | 'documents',
    opts?: { productId?: string; launchId?: string; brandId?: string }
  ) => void;
  notify: (type: 'success' | 'warning' | 'error', title: string, description?: string) => void;
}

export function ProductLabCardBody({
  concept,
  activeTab,
  canEdit,
  currentUser,
  products,
  onUpdateConcept,
  onChangeStageWithGate,
  onCreateProductFromConcept,
  linkedScenarioModelCode,
  onSyncToScenarioCatalog,
  onSyncConcept,
  onNavigateToSection,
  notify,
}: ProductLabCardBodyProps) {
  const hasCostAccess = canUserViewCostPrice(currentUser);
  const canApproveProd = canUserApproveProduction(
    currentUser,
    normalizeLabBrandCode(concept.brandId)
  );
  const prodProfile = getBrandProductionProfile(concept.brandId, concept.name);

  const defaultBrandFactoryName =
    concept.supplierName?.trim() ||
    (prodProfile.brandCode === 'NA_TELE'
      ? 'Shantou Seamless Intimate Co.'
      : prodProfile.brandCode === 'AKUSHA'
      ? 'Wenzhou Akusha Footwear Co.'
      : prodProfile.brandCode === 'LISKANI'
      ? 'Shaoxing Keqiao Home Textile'
      : 'Guangdong Apex Intimate');

  const [newRefLink, setNewRefLink] = useState('');
  const [showExtraAnalysis, setShowExtraAnalysis] = useState(false);

  // Поля добавления конкурента (Блок РЫНОК в 02 Анализ)
  const [evForm, setEvForm] = useState({
    competitorBrand: '',
    articleSku: '',
    priceRub: '',
    packQty: '4 шт.',
    estimatedRevenueRub: '',
    sourceName: 'WB / MPStats',
  });

  // Состав материала из справочника (03 Образец — сумма = 100%)
  const [compRows, setCompRows] = useState<{ material: string; pct: string }[]>([
    { material: 'Хлопок', pct: '95' },
    { material: 'Эластан', pct: '5' },
  ]);

  const [isUploadingSamplePhotos, setIsUploadingSamplePhotos] = useState(false);
  const [sampleForm, setSampleForm] = useState({
    factoryName: defaultBrandFactoryName,
    customFactory: '',
    receivedAt: new Date().toISOString().slice(0, 10),
    sampleCostRub: '3500',
    deliveryCostRub: '0',
    estimatedUnitProductionPrice: concept.plannedUnitCost ? String(concept.plannedUnitCost) : '340',
    comments: '',
    photos: [] as string[],
  });

  useEffect(() => {
    setSampleForm((prev) => ({
      ...prev,
      factoryName: defaultBrandFactoryName,
      estimatedUnitProductionPrice: concept.plannedUnitCost
        ? String(concept.plannedUnitCost)
        : prev.estimatedUnitProductionPrice,
      photos: [],
      comments: '',
    }));
  }, [concept.id, defaultBrandFactoryName, concept.plannedUnitCost]);

  // 05 Решение — комментарий и возврат на этап
  const [decisionReason, setDecisionReason] = useState('');
  const [reworkTargetStage, setReworkTargetStage] = useState<ConceptStage>('SAMPLE');

  // 06 Производство — состояние конструктора PDF и выбора секций перед скачиванием
  const [inlinePdfConstructorOpen, setInlinePdfConstructorOpen] = useState(false);
  const [pdfBlocksConfig, setPdfBlocksConfig] = useState({
    ruSection: true,
    enSection: true,
    zhSection: true,
    photosFrontBack: true,
    multiCurrency: true,
    sizeMatrix: true,
  });

  const parseCleanNumber = (raw: string): number | null => {
    const cleaned = raw.replace(/[^\d]/g, '');
    if (!cleaned) return null;
    return parseInt(cleaned, 10);
  };

  const currentAnalysis: RnDAnalysisReport = concept.analysisReport || {
    whatWeCreate: concept.ideaDescription || '',
    targetBuyer: concept.targetAudience || '',
    concreteAdvantage: concept.keyDifferentiators || '',
    whyChooseUs: '',
    demandType: 'incremental',
    marketEvidences: [],
    nicheConclusion: '',
    buyerMotives: '',
    competitorProsAndComplaints: '',
    priceBenchmarksAndObjections: '',
    potentialFactories: concept.supplierName || '',
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
  };

  const updateAnalysisField = <K extends keyof RnDAnalysisReport>(
    key: K,
    val: RnDAnalysisReport[K]
  ) => {
    onUpdateConcept(concept.id, {
      analysisReport: {
        ...currentAnalysis,
        [key]: val,
      },
    });
  };

  const updateAnalysisFields = (patch: Partial<RnDAnalysisReport>) => {
    onUpdateConcept(concept.id, {
      analysisReport: {
        ...currentAnalysis,
        ...patch,
      },
    });
  };

  const linkedProduct = products.find(
    (p) => p.id === concept.linkedProductId || p.conceptId === concept.id
  );

  // Расчёт комплекта и 1 единицы (Важное правило расчёта со Стр. 5 PDF)
  const defaultPackUnits = prodProfile.defaultPackUnits;
  const packUnits =
    concept.packUnitsCount && concept.packUnitsCount > 0 ? concept.packUnitsCount : defaultPackUnits;
  const packRetailPrice = concept.plannedRetailPrice || 2600;
  const unitRetailPrice = Math.round(packRetailPrice / packUnits);
  const unitCostPrice = concept.plannedUnitCost || 320;
  const packCostPrice = unitCostPrice * packUnits;

  // Четыре понятные проверки (04 Тест со Стр. 6 PDF)
  const fourChecks = concept.fourChecksTest || {
    fitAndComfort: 'passed' as const,
    fitAndComfortComment: '',
    waistbandAndSeams: 'passed' as const,
    waistbandAndSeamsComment: '',
    washShapeColor: 'passed' as const,
    washShapeColorComment: '',
    manufacturingQuality: 'passed' as const,
    manufacturingQualityComment: '',
  };

  const updateFourCheck = (patch: Partial<NonNullable<ProductConcept['fourChecksTest']>>) => {
    const next = { ...fourChecks, ...patch };
    onUpdateConcept(concept.id, {
      fourChecksTest: next,
    });
  };

  // ===========================================================================
  // ЭТАП 01: ИДЕЯ (Стр. 5 PDF — Ссылки и Выход в Анализ)
  // ===========================================================================
  if (activeTab === 'overview') {
    const hasRequiredForAnalysis =
      Boolean(concept.name.trim()) &&
      Boolean(concept.brandId) &&
      Boolean(concept.ownerId) &&
      Boolean((concept.whatAttracted || concept.ideaDescription || '').trim());

    return (
      <div className="space-y-6 text-[15px]">
        {/* Ссылки на источники / референсы */}
        <div className="rounded-2xl border border-[#E8E8E5] bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[17px] font-bold text-[#171717]">
                Ссылки на источники и референсы (WB / Ozon / соцсети)
              </h3>
              <p className="text-[13px] text-[#737373]">
                Сохраняются внутри карточки и доступны на всех следующих этапах
              </p>
            </div>
          </div>

          {(concept.referenceLinks || []).length > 0 ? (
            <div className="space-y-2">
              {(concept.referenceLinks || []).map((link, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] text-[13px]"
                >
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#171717] font-medium underline truncate inline-flex items-center gap-2"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#D97745]" />
                    <span className="truncate">{link}</span>
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateConcept(concept.id, {
                          referenceLinks: (concept.referenceLinks || []).filter(
                            (_, i) => i !== idx
                          ),
                        })
                      }
                      className="text-[#737373] hover:text-[#DC2626] font-semibold cursor-pointer px-2"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-[#F7F7F5] p-3.5 text-[13px] text-[#737373]">
              Ссылки пока не добавлены. Прикрепите ссылку на карточку конкурента или референс:
            </div>
          )}

          {canEdit && (
            <div className="flex gap-2.5">
              <input
                value={newRefLink}
                onChange={(e) => setNewRefLink(e.target.value)}
                placeholder="https://www.wildberries.ru/catalog/..."
                className="flex-1 h-10 rounded-xl border border-[#E8E8E5] px-3.5 text-[13px] bg-[#F7F7F5]/60 focus:bg-white outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newRefLink.trim()) return;
                  onUpdateConcept(concept.id, {
                    referenceLinks: [...(concept.referenceLinks || []), newRefLink.trim()],
                  });
                  setNewRefLink('');
                  notify('success', 'Ссылка сохранена в карточке');
                }}
                className="px-4 h-10 rounded-xl bg-[#111111] text-white text-[13px] font-semibold cursor-pointer"
              >
                + Добавить ссылку
              </button>
            </div>
          )}
        </div>

        {/* Блок результата этапа 01 ИДЕЯ (Стр. 5 PDF) */}
        <div className="rounded-2xl border border-[#E8E8E5] bg-[#F7F7F5] p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[14px] font-bold text-[#171717]">
              Выход: идея сохранена. Для перехода в анализ нужны название, бренд, ответственный и суть.
            </div>
            <div className="text-[13px] text-[#737373]">
              {hasRequiredForAnalysis
                ? '✓ Все обязательные поля идеи заполнены — можно переводить в Анализ.'
                : 'Заполните суть идеи и ответственного в паспорте выше для перевода в Анализ.'}
            </div>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => onChangeStageWithGate(concept, 'ANALYSIS')}
              className="h-11 px-6 rounded-xl bg-[#111111] hover:bg-[#D97745] text-white text-[14px] font-bold transition cursor-pointer shrink-0"
            >
              На анализ (02 Анализ) →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // ЭТАП 02: АНАЛИЗ (Стр. 5 PDF — Всего 3 блока: РЫНОК, ПРОДУКТ, ЭКОНОМИКА)
  // ===========================================================================
  if (activeTab === 'analysis') {
    return (
      <div className="space-y-6 text-[15px]">
        <div className="rounded-2xl border border-[#E8E8E5] bg-white p-6 space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FDF3EB] text-[#D97745] text-[12px] font-bold mb-2">
              02 АНАЛИЗ
            </div>
            <h3 className="text-[20px] font-bold text-[#171717]">
              Три блока доказательств перед заказом образца
            </h3>
            <p className="text-[13px] text-[#737373]">
              Всего три блока — дополнительные поля раскрываются по желанию
            </p>
          </div>

          {/* 1. РЫНОК */}
          <div className="rounded-2xl bg-[#F7F7F5]/70 border border-[#E8E8E5] p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="md:col-span-3">
                <div className="text-[14px] font-bold uppercase tracking-wider text-[#171717]">
                  1. РЫНОК
                </div>
                <div className="text-[12px] text-[#737373] mt-1">
                  Конкуренты, ссылки, цена комплекта, комплектность, ориентировочный спрос и источник
                </div>
              </div>

              <div className="md:col-span-9 space-y-3">
                {currentAnalysis.marketEvidences.length > 0 && (
                  <div className="space-y-2">
                    {currentAnalysis.marketEvidences.map((ev) => (
                      <div
                        key={ev.id}
                        className="rounded-xl bg-white border border-[#E8E8E5] p-3.5 flex flex-wrap items-center justify-between gap-3 text-[13px]"
                      >
                        <div>
                          <span className="font-bold text-[#171717]">
                            {ev.competitorBrand}
                          </span>
                          <span className="text-[#737373] ml-2">
                            Арт: {ev.articleSku} · Комплект: <b>{ev.packQty || '4 шт.'}</b> · Источник: {ev.sourceName}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span>
                            Цена комплекта: <b>{formatCurrencyRub(ev.priceRub)}</b>
                          </span>
                          <span className="text-[#D97745] font-bold">
                            Спрос: {formatCurrencyRub(ev.estimatedRevenueRub)}/мес.
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() =>
                                updateAnalysisField(
                                  'marketEvidences',
                                  currentAnalysis.marketEvidences.filter((x) => x.id !== ev.id)
                                )
                              }
                              className="text-[#737373] hover:text-[#DC2626] cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {canEdit && (
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 text-[13px]">
                    <input
                      value={evForm.competitorBrand}
                      onChange={(e) =>
                        setEvForm({ ...evForm, competitorBrand: e.target.value })
                      }
                      placeholder="Конкурент (бренд)"
                      className="h-10 rounded-xl border border-[#E8E8E5] bg-white px-3"
                    />
                    <input
                      value={evForm.articleSku}
                      onChange={(e) => setEvForm({ ...evForm, articleSku: e.target.value })}
                      placeholder="Ссылка / Артикул"
                      className="h-10 rounded-xl border border-[#E8E8E5] bg-white px-3"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={evForm.priceRub}
                      onChange={(e) =>
                        setEvForm({
                          ...evForm,
                          priceRub: e.target.value.replace(/[^\d]/g, ''),
                        })
                      }
                      placeholder="Цена набора (₽)"
                      className="h-10 rounded-xl border border-[#E8E8E5] bg-white px-3"
                    />
                    <input
                      value={evForm.packQty}
                      onChange={(e) => setEvForm({ ...evForm, packQty: e.target.value })}
                      placeholder="Комплект (4 шт.)"
                      className="h-10 rounded-xl border border-[#E8E8E5] bg-white px-3"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={evForm.estimatedRevenueRub}
                      onChange={(e) =>
                        setEvForm({
                          ...evForm,
                          estimatedRevenueRub: e.target.value.replace(/[^\d]/g, ''),
                        })
                      }
                      placeholder="Спрос ₽/мес."
                      className="h-10 rounded-xl border border-[#E8E8E5] bg-white px-3"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!evForm.competitorBrand.trim()) {
                          notify('warning', 'Укажите бренд конкурента');
                          return;
                        }
                        const item: RnDMarketEvidence = {
                          id: `ev-${Date.now()}`,
                          competitorBrand: evForm.competitorBrand.trim(),
                          articleSku: evForm.articleSku.trim() || '—',
                          productTitle: concept.name,
                          priceRub: parseCleanNumber(evForm.priceRub) || 2600,
                          packQty: evForm.packQty.trim() || '4 шт.',
                          estimatedRevenueRub:
                            parseCleanNumber(evForm.estimatedRevenueRub) || 1500000,
                          observationPeriod: '30 дней',
                          sourceName: evForm.sourceName || 'WB / MPStats',
                          confidenceStatus: 'verified',
                          comparisonNote: '',
                        };
                        updateAnalysisField('marketEvidences', [
                          ...currentAnalysis.marketEvidences,
                          item,
                        ]);
                        setEvForm({
                          competitorBrand: '',
                          articleSku: '',
                          priceRub: '',
                          packQty: '4 шт.',
                          estimatedRevenueRub: '',
                          sourceName: 'WB / MPStats',
                        });
                      }}
                      className="h-10 rounded-xl bg-[#111111] text-white font-semibold cursor-pointer px-3"
                    >
                      + Конкурент
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2. ПРОДУКТ */}
          <div className="rounded-2xl bg-[#F7F7F5]/70 border border-[#E8E8E5] p-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="md:col-span-3">
                <div className="text-[14px] font-bold uppercase tracking-wider text-[#171717]">
                  2. ПРОДУКТ
                </div>
                <div className="text-[12px] text-[#737373] mt-1">
                  Что берём за основу? Чем лучше/иначе? Какой риск или гипотезу проверяем?
                </div>
              </div>

              <div className="md:col-span-9 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[14px]">
                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Что берём за основу и чем лучше конкурентов?
                  </label>
                  <textarea
                    rows={2}
                    disabled={!canEdit}
                    value={currentAnalysis.whatWeCreate}
                    onChange={(e) => {
                      updateAnalysisFields({
                        whatWeCreate: e.target.value,
                        concreteAdvantage: e.target.value,
                      });
                    }}
                    placeholder="Базовое лекало боксеров + более мягкая резинка без давления..."
                    className="w-full rounded-xl border border-[#E8E8E5] bg-white p-3"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Какой риск или гипотезу проверяем на образце?
                  </label>
                  <textarea
                    rows={2}
                    disabled={!canEdit}
                    value={currentAnalysis.openQuestionsAndRisks}
                    onChange={(e) =>
                      updateAnalysisField('openQuestionsAndRisks', e.target.value)
                    }
                    placeholder="Проверить усадку полотна после 5 стирок и плотность краёв..."
                    className="w-full rounded-xl border border-[#E8E8E5] bg-white p-3"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. ЭКОНОМИКА (Важное правило расчёта со Стр. 5 PDF: комплект + число пар -> цена за пару) */}
          <div className="rounded-2xl bg-[#F7F7F5]/70 border border-[#E8E8E5] p-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="md:col-span-3">
                <div className="text-[14px] font-bold uppercase tracking-wider text-[#171717]">
                  3. ЭКОНОМИКА
                </div>
                <div className="text-[12px] text-[#737373] mt-1">
                  Цена комплекта + число пар → цена за пару. Экономика считается на одинаковой базе: и на комплект, и на пару.
                </div>
              </div>

              <div className="md:col-span-9 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[14px]">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                      Цена комплекта (₽)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={!canEdit}
                      value={concept.plannedRetailPrice ? String(concept.plannedRetailPrice) : ''}
                      onChange={(e) =>
                        onUpdateConcept(concept.id, {
                          plannedRetailPrice: parseCleanNumber(e.target.value) ?? 0,
                        })
                      }
                      placeholder="2600"
                      className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-white px-3.5 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                      Число пар в наборе (шт.)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={!canEdit}
                      value={String(packUnits)}
                      onChange={(e) => {
                        const val = parseCleanNumber(e.target.value);
                        onUpdateConcept(concept.id, {
                          packUnitsCount: val && val > 0 ? val : 1,
                        });
                      }}
                      placeholder="4"
                      className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-white px-3.5 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#D97745] mb-1">
                      Цена за 1 пару (авторасчёт)
                    </label>
                    <div className="h-11 rounded-xl border border-[#D97745]/40 bg-[#FDF3EB] px-3.5 flex items-center font-bold text-[#D97745] text-[16px]">
                      {formatCurrencyRub(unitRetailPrice)} / пара
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                      Себестоимость 1 пары (₽)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={!canEdit || !hasCostAccess}
                      value={
                        hasCostAccess && concept.plannedUnitCost
                          ? String(concept.plannedUnitCost)
                          : ''
                      }
                      onChange={(e) =>
                        onUpdateConcept(concept.id, {
                          plannedUnitCost: parseCleanNumber(e.target.value) ?? 0,
                        })
                      }
                      placeholder={hasCostAccess ? '320' : 'Скрыто'}
                      className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-white px-3.5 font-bold"
                    />
                  </div>
                </div>

                {/* Наглядная плашка пересчёта на одинаковой базе (Стр. 5 PDF) */}
                <div className="rounded-xl bg-white border border-[#E8E8E5] p-3.5 flex flex-wrap items-center justify-between gap-3 text-[13px]">
                  <div>
                    <span className="font-bold text-[#171717]">
                      Расчёт на единой базе:
                    </span>{' '}
                    Цена <b>{formatCurrencyRub(packRetailPrice)}</b> за комплект из{' '}
                    <b>{packUnits} шт.</b> = <b>{formatCurrencyRub(unitRetailPrice)}</b> за пару.
                  </div>
                  {hasCostAccess && (
                    <div className="text-[#737373]">
                      Себестоимость набора: <b className="text-[#171717]">{formatCurrencyRub(packCostPrice)}</b> · За 1 пару:{' '}
                      <b className="text-[#171717]">{formatCurrencyRub(unitCostPrice)}</b>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Раскрывающиеся дополнительные поля по желанию */}
          <div>
            <button
              type="button"
              onClick={() => setShowExtraAnalysis((v) => !v)}
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#737373] hover:text-[#171717] cursor-pointer"
            >
              {showExtraAnalysis ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span>
                {showExtraAnalysis
                  ? 'Скрыть дополнительные поля анализа'
                  : '+ Раскрыть дополнительные поля (жалобы в отзывах, фабрики, MOQ)'}
              </span>
            </button>

            {showExtraAnalysis && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 pt-3 border-t border-[#E8E8E5] text-[13px]">
                <div>
                  <label className="block font-semibold text-[#737373] mb-1">
                    Плюсы и жалобы покупателей в отзывах конкурентов
                  </label>
                  <input
                    disabled={!canEdit}
                    value={currentAnalysis.competitorProsAndComplaints}
                    onChange={(e) =>
                      updateAnalysisField('competitorProsAndComplaints', e.target.value)
                    }
                    placeholder="Жалуются на тугую резинку и катышки..."
                    className="w-full h-10 rounded-xl border border-[#E8E8E5] px-3"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#737373] mb-1">
                    Потенциальные фабрики и минимальная партия (MOQ)
                  </label>
                  <input
                    disabled={!canEdit}
                    value={currentAnalysis.potentialFactories}
                    onChange={(e) =>
                      updateAnalysisField('potentialFactories', e.target.value)
                    }
                    placeholder="Узбекистан / Китай, MOQ от 1 500 комплектов..."
                    className="w-full h-10 rounded-xl border border-[#E8E8E5] px-3"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Выход: короткий вывод и одно решение: «Заказывать образец» / «Доработать» / «Отложить» (Стр. 5 PDF) */}
        <div className="rounded-2xl border border-[#16805D]/30 bg-[#E8F5E9]/60 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-[260px]">
              <label className="block text-[13px] font-bold text-[#171717] mb-1">
                Выход анализа: короткий вывод и решение по заказу образца
              </label>
              <input
                disabled={!canEdit}
                value={currentAnalysis.summaryAndPros}
                onChange={(e) => updateAnalysisField('summaryAndPros', e.target.value)}
                placeholder="Спрос подтверждён, целевая цена 650 ₽/пара проходит по марже — заказываем образец"
                className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-white px-3.5 text-[14px]"
              />
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const nextReport: RnDAnalysisReport = {
                      ...currentAnalysis,
                      recommendation: 'continue',
                    };
                    const updatedConcept: ProductConcept = {
                      ...concept,
                      analysisReport: nextReport,
                    };
                    onUpdateConcept(concept.id, { analysisReport: nextReport });
                    onChangeStageWithGate(updatedConcept, 'SAMPLE');
                  }}
                  className="h-11 px-5 rounded-xl bg-[#16805D] hover:bg-[#126b4d] text-white text-[13px] font-bold cursor-pointer transition"
                >
                  Заказывать образец (03 Образец) →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateAnalysisField('recommendation', 'supplement');
                    notify('warning', 'Анализ отмечен на доработку');
                  }}
                  className="h-11 px-4 rounded-xl bg-white border border-[#E8E8E5] hover:border-[#171717] text-[#171717] text-[13px] font-bold cursor-pointer transition"
                >
                  Доработать
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateAnalysisField('recommendation', 'postpone');
                    notify('warning', 'Карточка отложена по итогам анализа');
                  }}
                  className="h-11 px-4 rounded-xl bg-white border border-[#E8E8E5] text-[#737373] hover:text-[#DC2626] text-[13px] font-bold cursor-pointer transition"
                >
                  Отложить
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // ЭТАП 03: ОБРАЗЕЦ (Стр. 6 PDF и Сценарий №5: Справочник фабрик + Состав = 100%)
  // ===========================================================================
  if (activeTab === 'samples') {
    const samples = concept.samples || [];
    const totalPct = compRows.reduce(
      (sum, r) => sum + (parseCleanNumber(r.pct) || 0),
      0
    );
    const isCompositionValid = totalPct === 100;
    const compositionLabel = compRows
      .filter((r) => (parseCleanNumber(r.pct) || 0) > 0)
      .map((r) => `${r.material} ${parseCleanNumber(r.pct) || 0}%`)
      .join(' + ');

    return (
      <div className="space-y-6 text-[15px]">
        <div className="rounded-2xl border border-[#E8E8E5] bg-white p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FDF3EB] text-[#D97745] text-[12px] font-bold mb-2">
                03 ОБРАЗЕЦ
              </div>
              <h3 className="text-[20px] font-bold text-[#171717]">
                Фабрика, состав ткани (= 100%) и версии образца
              </h3>
              <p className="text-[13px] text-[#737373]">
                Фабрика из справочника; дата получения; фотографии; ткань и состав; цена образца и доставки; предложение по серийному выпуску
              </p>
            </div>
          </div>

          {/* Список созданных версий образца */}
          {samples.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {samples.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-2xl border p-5 space-y-3 ${
                    s.isSelectedForProduction
                      ? 'border-2 border-[#16805D] bg-[#E8F5E9]/30'
                      : 'border-[#E8E8E5] bg-[#F7F7F5]/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-[16px] text-[#171717]">
                        {s.versionCode} · {s.factoryName}
                      </div>
                      <div className="text-[13px] font-semibold text-[#D97745] mt-0.5">
                        Состав: {s.materialAndComposition}
                      </div>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextSamples = samples.filter((x) => x.id !== s.id);
                          const nextSelected =
                            nextSamples.find((x) => x.isSelectedForProduction) ||
                            nextSamples[0];
                          const deletePatch: Partial<ProductConcept> = {
                            samples: nextSamples,
                            ...(nextSelected
                              ? {
                                  supplierName: nextSelected.factoryName,
                                  plannedUnitCost:
                                    nextSelected.estimatedUnitProductionPrice ||
                                    concept.plannedUnitCost,
                                }
                              : {}),
                          };
                          const updatedConcept: ProductConcept = {
                            ...concept,
                            ...deletePatch,
                          };
                          onUpdateConcept(concept.id, deletePatch);
                          onSyncConcept?.(updatedConcept);
                        }}
                        className="text-[#737373] hover:text-[#DC2626] cursor-pointer p-1"
                        title="Удалить версию образца"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {s.photos && s.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2 py-1">
                      {s.photos.map((ph, idx) => (
                        <div key={idx} className="relative group h-16 w-16 shrink-0">
                          <img
                            src={resolvePublicAssetUrl(ph)}
                            alt={s.versionCode}
                            className="h-full w-full rounded-xl object-cover border border-[#E8E8E5] bg-white"
                          />
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextSamples = samples.map((item) =>
                                  item.id === s.id
                                    ? {
                                        ...item,
                                        photos: (item.photos || []).filter((_, pIdx) => pIdx !== idx),
                                      }
                                    : item
                                );
                                onUpdateConcept(concept.id, { samples: nextSamples });
                                if (linkedScenarioModelCode) {
                                  onSyncConcept?.({ ...concept, samples: nextSamples });
                                }
                              }}
                              title="Удалить фото образца"
                              className="opacity-0 group-hover:opacity-100 absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 hover:bg-[#DC2626] text-white text-[11px] font-bold flex items-center justify-center cursor-pointer transition"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-[13px] pt-2 border-t border-[#E8E8E5]">
                    <span>
                      Дата получения: <b>{s.receivedAt}</b>
                    </span>
                    <span>
                      Образец + доставка:{' '}
                      <b>
                        {hasCostAccess
                          ? formatCurrencyRub((s.sampleCostRub || 0) + (s.deliveryCostRub || 0))
                          : 'Скрыто'}
                      </b>
                    </span>
                    <span>
                      Серийная цена:{' '}
                      <b>
                        {!hasCostAccess
                          ? 'Скрыто'
                          : s.estimatedUnitProductionPrice
                          ? `${s.estimatedUnitProductionPrice} ₽/шт.`
                          : '—'}
                      </b>
                    </span>
                  </div>

                  {canEdit && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const selectPatch: Partial<ProductConcept> = {
                            supplierName: s.factoryName,
                            plannedUnitCost:
                              s.estimatedUnitProductionPrice || concept.plannedUnitCost,
                            samples: samples.map((item) => ({
                              ...item,
                              isSelectedForProduction: item.id === s.id,
                            })),
                          };
                          const updatedConcept: ProductConcept = {
                            ...concept,
                            ...selectPatch,
                          };
                          onUpdateConcept(concept.id, selectPatch);
                          onSyncConcept?.(updatedConcept);
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold cursor-pointer transition ${
                          s.isSelectedForProduction
                            ? 'bg-[#16805D] text-white'
                            : 'bg-white border border-[#E8E8E5] text-[#171717] hover:border-[#171717]'
                        }`}
                      >
                        {s.isSelectedForProduction
                          ? '✓ Выбран для теста и серии'
                          : 'Выбрать эту версию образца'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Конструктор новой версии образца (Стр. 6 PDF) */}
          {canEdit && (
            <div className="rounded-2xl bg-[#F7F7F5] border border-[#E8E8E5] p-5 space-y-4">
              <div className="text-[15px] font-bold text-[#171717]">
                + Добавить версию образца (Версия {samples.length + 1})
              </div>

              {/* Конструктор состава ткани из справочника с проверкой 100% (Сценарий №5) */}
              <div className="rounded-xl bg-white border border-[#E8E8E5] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-bold text-[#171717]">
                      Материал ▾ {compositionLabel || 'Выберите состав'}
                    </div>
                    <div className="text-[12px] text-[#737373]">
                      Материалы добавляются строками из справочника, сумма должна быть ровно 100%
                    </div>
                  </div>

                  <div
                    className={`px-3 py-1 rounded-lg text-[13px] font-bold ${
                      isCompositionValid
                        ? 'bg-[#E8F5E9] text-[#16805D]'
                        : 'bg-[#DC2626]/10 text-[#DC2626]'
                    }`}
                  >
                    Сумма состава: {totalPct}% {isCompositionValid ? '✓' : '⚠️ (нужно 100%)'}
                  </div>
                </div>

                {!isCompositionValid && (
                  <div className="rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/30 p-3 flex items-center gap-2 text-[13px] font-semibold text-[#DC2626]">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      Предупреждение: сумма долей материалов сейчас составляет {totalPct}% (вместо 100%). Пожалуйста, проверьте проценты перед сохранением образца!
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  {compRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-[13px]">
                      <select
                        value={row.material}
                        onChange={(e) =>
                          setCompRows((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, material: e.target.value } : item
                            )
                          )
                        }
                        className="h-10 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 font-semibold min-w-[180px]"
                      >
                        {MATERIAL_DIRECTORY.map((m) => (
                          <option key={m.ru} value={m.ru}>
                            {m.ru} ({m.en})
                          </option>
                        ))}
                      </select>

                      <div className="relative w-28">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.pct}
                          onChange={(e) =>
                            setCompRows((prev) =>
                              prev.map((item, i) =>
                                i === idx
                                  ? { ...item, pct: e.target.value.replace(/[^\d]/g, '') }
                                  : item
                              )
                            )
                          }
                          className="w-full h-10 rounded-xl border border-[#E8E8E5] px-3 pr-7 font-bold"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373] font-bold">
                          %
                        </span>
                      </div>

                      {compRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setCompRows((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-[#737373] hover:text-[#DC2626] text-[12px] font-semibold cursor-pointer px-2"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setCompRows((prev) => [...prev, { material: 'Эластан', pct: '0' }])
                  }
                  className="text-[13px] font-bold text-[#D97745] hover:underline cursor-pointer"
                >
                  + Добавить материал из справочника
                </button>
              </div>

              {/* Поля фабрики, даты, цены образца и серийного предложения */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-[13px]">
                <div className="lg:col-span-2">
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Фабрика из справочника
                  </label>
                  <select
                    value={sampleForm.factoryName}
                    onChange={(e) =>
                      setSampleForm({ ...sampleForm, factoryName: e.target.value })
                    }
                    className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-white px-3 font-semibold"
                  >
                    <option value={defaultBrandFactoryName}>{defaultBrandFactoryName}</option>
                    {FACTORY_DIRECTORY.map((f) => {
                      const label = `${f.name} (${f.country})`;
                      if (label === defaultBrandFactoryName) return null;
                      return (
                        <option key={f.name} value={label}>
                          {label}
                        </option>
                      );
                    })}
                    {sampleForm.factoryName &&
                      sampleForm.factoryName !== defaultBrandFactoryName &&
                      !FACTORY_DIRECTORY.some(
                        (f) => `${f.name} (${f.country})` === sampleForm.factoryName
                      ) && (
                        <option value={sampleForm.factoryName}>
                          {sampleForm.factoryName}
                        </option>
                      )}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Дата получения
                  </label>
                  <input
                    type="date"
                    value={sampleForm.receivedAt}
                    onChange={(e) =>
                      setSampleForm({ ...sampleForm, receivedAt: e.target.value })
                    }
                    className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-white px-3"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Цена образца + доставка (₽)
                  </label>
                  {hasCostAccess ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={sampleForm.sampleCostRub}
                      onChange={(e) =>
                        setSampleForm({
                          ...sampleForm,
                          sampleCostRub: e.target.value.replace(/[^\d]/g, ''),
                        })
                      }
                      placeholder="3500"
                      className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-white px-3 font-semibold"
                    />
                  ) : (
                    <div className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-white px-3 flex items-center font-semibold text-[#737373]">
                      Скрыто
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Предложение на серию (₽/шт.)
                  </label>
                  {hasCostAccess ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      value={sampleForm.estimatedUnitProductionPrice}
                      onChange={(e) =>
                        setSampleForm({
                          ...sampleForm,
                          estimatedUnitProductionPrice: e.target.value.replace(/[^\d]/g, ''),
                        })
                      }
                      placeholder="340"
                      className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-white px-3 font-bold"
                    />
                  ) : (
                    <div className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-white px-3 flex items-center font-semibold text-[#737373]">
                      Скрыто
                    </div>
                  )}
                </div>
              </div>

              {sampleForm.photos.length > 0 && (
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {sampleForm.photos.map((ph, idx) => (
                    <div key={idx} className="relative h-16 w-16 shrink-0">
                      <img
                        src={resolvePublicAssetUrl(ph)}
                        alt={`Фото образца ${idx + 1}`}
                        className="h-full w-full rounded-xl object-cover border border-[#E8E8E5] bg-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSampleForm((prev) => ({
                            ...prev,
                            photos: prev.photos.filter((_, pIdx) => pIdx !== idx),
                          }))
                        }
                        title="Убрать фото"
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 hover:bg-[#DC2626] text-white text-[11px] font-bold flex items-center justify-center cursor-pointer transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label
                  className={`inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-white border border-[#E8E8E5] hover:border-[#171717] text-[13px] font-semibold transition ${
                    isUploadingSamplePhotos ? 'opacity-60 cursor-wait' : 'cursor-pointer'
                  }`}
                >
                  <Upload className="h-4 w-4 text-[#D97745]" />
                  <span>
                    {isUploadingSamplePhotos
                      ? 'Загрузка фото...'
                      : `+ Фото образца ${sampleForm.photos.length > 0 ? `(${sampleForm.photos.length})` : ''}`}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isUploadingSamplePhotos}
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      e.target.value = '';
                      if (files.length === 0) return;
                      setIsUploadingSamplePhotos(true);
                      try {
                        const urls = await Promise.all(
                          files.map((f) => compressImageFileToDataUrl(f, 680, 0.78))
                        );
                        const validUrls = urls.filter((u): u is string => Boolean(u));
                        if (validUrls.length > 0) {
                          setSampleForm((prev) => ({
                            ...prev,
                            photos: [...prev.photos, ...validUrls],
                          }));
                        }
                      } finally {
                        setIsUploadingSamplePhotos(false);
                      }
                    }}
                  />
                </label>

                <button
                  type="button"
                  disabled={isUploadingSamplePhotos}
                  onClick={() => {
                    if (!isCompositionValid) {
                      notify(
                        'warning',
                        `Сумма состава должна быть 100% (сейчас ${totalPct}%)`,
                        'Исправьте проценты материалов в конструкторе состава'
                      );
                      return;
                    }
                    const newSample: RnDSampleItem = {
                      id: `smp-${Date.now()}`,
                      versionCode: `Версия ${samples.length + 1}`,
                      factoryName: sampleForm.factoryName || defaultBrandFactoryName,
                      country: 'Справочник',
                      orderedAt: sampleForm.receivedAt,
                      receivedAt: sampleForm.receivedAt,
                      status: 'testing',
                      photos: sampleForm.photos,
                      materialAndComposition: compositionLabel,
                      compositionRows: compRows.map((r) => ({
                        material: r.material,
                        pct: parseCleanNumber(r.pct) || 0,
                      })),
                      densityGsm: 180,
                      sizeTested: prodProfile.sizes[Math.floor(prodProfile.sizes.length / 2)] || 'M',
                      color: 'Базовый',
                      measurementsNote: 'По спецификации',
                      sampleCostRub: parseCleanNumber(sampleForm.sampleCostRub) || 0,
                      deliveryCostRub: parseCleanNumber(sampleForm.deliveryCostRub) || 0,
                      estimatedUnitProductionPrice:
                        parseCleanNumber(sampleForm.estimatedUnitProductionPrice) || 340,
                      currency: 'RUB',
                      preliminaryScore: 5,
                      comments: sampleForm.comments.trim() || 'Образец принят на тестирование',
                      isSelectedForProduction: true,
                    };
                    const nextSamples = [
                      ...samples.map((s) => ({ ...s, isSelectedForProduction: false })),
                      newSample,
                    ];
                    const samplePatch: Partial<ProductConcept> = {
                      supplierName: newSample.factoryName,
                      plannedUnitCost: newSample.estimatedUnitProductionPrice,
                      samples: nextSamples,
                    };
                    onUpdateConcept(concept.id, samplePatch);
                    if (linkedScenarioModelCode) {
                      onSyncConcept?.({ ...concept, ...samplePatch });
                    }
                    setSampleForm((prev) => ({ ...prev, photos: [], comments: '' }));
                    notify('success', `${newSample.versionCode} (${compositionLabel}) сохранена`);
                  }}
                  className="h-10 px-6 rounded-xl bg-[#111111] disabled:opacity-50 text-white text-[13px] font-bold cursor-pointer"
                >
                  Сохранить версию образца
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Выход этапа 03 ОБРАЗЕЦ */}
        <div className="rounded-2xl border border-[#E8E8E5] bg-[#F7F7F5] p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="text-[14px] font-bold text-[#171717]">
            Итог этапа 03: Фабрика, фото, состав (= 100%) и цена образца зафиксированы.
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => onChangeStageWithGate(concept, 'TEST')}
              className="h-11 px-6 rounded-xl bg-[#111111] hover:bg-[#D97745] text-white text-[14px] font-bold transition cursor-pointer"
            >
              На тест (04 Тест) →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // ЭТАП 04: ТЕСТ (Стр. 6 PDF и Сценарий №6 — Ровно 4 понятные проверки)
  // ===========================================================================
  if (activeTab === 'testing') {
    const checkItems: {
      key: 'fitAndComfort' | 'waistbandAndSeams' | 'washShapeColor' | 'manufacturingQuality';
      commentKey:
        | 'fitAndComfortComment'
        | 'waistbandAndSeamsComment'
        | 'washShapeColorComment'
        | 'manufacturingQualityComment';
      label: string;
      placeholder: string;
    }[] = [
      {
        key: 'fitAndComfort',
        commentKey: 'fitAndComfortComment',
        label: 'Посадка и комфорт',
        placeholder: 'Комментарий по посадке и лекалам...',
      },
      {
        key: 'waistbandAndSeams',
        commentKey: 'waistbandAndSeamsComment',
        label: 'Резинка и швы',
        placeholder: 'Комментарий по эластичности резинки и обработке швов...',
      },
      {
        key: 'washShapeColor',
        commentKey: 'washShapeColorComment',
        label: 'Стирка / форма / цвет',
        placeholder: 'Отметьте усадку, пиллинг или потерю цвета после стирки...',
      },
      {
        key: 'manufacturingQuality',
        commentKey: 'manufacturingQualityComment',
        label: 'Качество изготовления',
        placeholder: 'Нитки, симметрия, маркировка...',
      },
    ];

    const statusOptions: {
      val: 'passed' | 'remarks' | 'failed' | 'untested';
      label: string;
      activeCls: string;
    }[] = [
      {
        val: 'passed',
        label: 'Прошёл',
        activeCls: 'bg-[#16805D] text-white border-[#16805D]',
      },
      {
        val: 'remarks',
        label: 'Замечания',
        activeCls: 'bg-[#D97745] text-white border-[#D97745]',
      },
      {
        val: 'failed',
        label: 'Не прошёл',
        activeCls: 'bg-[#DC2626] text-white border-[#DC2626]',
      },
      {
        val: 'untested',
        label: 'Не проверяли',
        activeCls: 'bg-[#525252] text-white border-[#525252]',
      },
    ];

    const untestedList = checkItems.filter((item) => fourChecks[item.key] === 'untested');
    const defectsList = checkItems.filter(
      (item) => fourChecks[item.key] === 'remarks' || fourChecks[item.key] === 'failed'
    );

    return (
      <div className="space-y-6 text-[15px]">
        <div className="rounded-2xl border border-[#E8E8E5] bg-white p-6 space-y-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FDF3EB] text-[#D97745] text-[12px] font-bold mb-2">
              04 ТЕСТ
            </div>
            <h3 className="text-[20px] font-bold text-[#171717]">
              Четыре понятные проверки, без длинной анкеты
            </h3>
            <p className="text-[13px] text-[#737373]">
              Никаких загадочных «5/5»: проверяем реальные характеристики и фиксируем вывод. Комментарий и фото к конкретному пункту — только если нужны.
            </p>
          </div>

          <div className="divide-y divide-[#E8E8E5] border-t border-b border-[#E8E8E5]">
            {checkItems.map((item) => {
              const currentVal = fourChecks[item.key];
              const currentComment = fourChecks[item.commentKey] || '';
              const showCommentInput =
                currentVal === 'remarks' ||
                currentVal === 'failed' ||
                Boolean(currentComment);

              return (
                <div key={item.key} className="py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="text-[16px] font-bold text-[#171717] min-w-[210px]">
                      {item.label}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {statusOptions.map((opt) => {
                        const isActive = currentVal === opt.val;
                        return (
                          <button
                            key={opt.val}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => updateFourCheck({ [item.key]: opt.val })}
                            className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition cursor-pointer ${
                              isActive
                                ? opt.activeCls
                                : 'bg-[#F7F7F5] text-[#737373] border-[#E8E8E5] hover:text-[#171717]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Комментарий к конкретному пункту (особенно при Замечаниях / Не прошёл) */}
                  <div className="flex items-center gap-2">
                    <input
                      disabled={!canEdit}
                      value={currentComment}
                      onChange={(e) =>
                        updateFourCheck({ [item.commentKey]: e.target.value })
                      }
                      placeholder={
                        showCommentInput
                          ? item.placeholder
                          : '+ Добавить комментарий к пункту (по желанию)...'
                      }
                      className={`w-full h-10 rounded-xl border px-3.5 text-[13px] ${
                        currentVal === 'failed' || currentVal === 'remarks'
                          ? 'border-[#D97745] bg-[#FDF3EB]/50 font-medium text-[#171717]'
                          : 'border-[#E8E8E5] bg-[#F7F7F5]/60 text-[#171717]'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Итоговое резюме: все дефекты и все «Не проверяли» видны сразу */}
          <div className="rounded-xl bg-[#F7F7F5] border border-[#E8E8E5] p-4 space-y-2 text-[13px]">
            <div className="font-bold text-[#171717]">
              Итоговое резюме тестирования (передаётся в этап «05 Решение»):
            </div>
            {defectsList.length > 0 ? (
              <div className="text-[#D97745] font-semibold">
                • Обнаружены замечания / дефекты:{' '}
                {defectsList
                  .map(
                    (d) =>
                      `${d.label} (${
                        fourChecks[d.commentKey] ||
                        (fourChecks[d.key] === 'failed' ? 'Не прошёл' : 'Замечания')
                      })`
                  )
                  .join('; ')}
              </div>
            ) : (
              <div className="text-[#16805D] font-semibold">
                • Дефектов и критических замечаний не отмечено.
              </div>
            )}

            {untestedList.length > 0 && (
              <div className="text-[#525252] font-semibold">
                • Пункты со статусом «Не проверяли»:{' '}
                {untestedList.map((u) => u.label).join(', ')}
              </div>
            )}
          </div>
        </div>

        {/* Выход этапа 04 ТЕСТ */}
        <div className="rounded-2xl border border-[#E8E8E5] bg-[#F7F7F5] p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="text-[14px] font-bold text-[#171717]">
            Итог этапа 04: Результаты 4 проверок сохранены и готовы для принятия решения.
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                const summaryNote =
                  defectsList.length > 0
                    ? `Замечания: ${defectsList.map((d) => d.label).join(', ')}`
                    : 'Все 4 проверки пройдены успешно';
                const testPatch: Partial<ProductConcept> = {
                  fourChecksTest: fourChecks,
                  testResults: summaryNote,
                };
                const updatedConcept: ProductConcept = {
                  ...concept,
                  ...testPatch,
                };
                onUpdateConcept(concept.id, testPatch);
                onChangeStageWithGate(updatedConcept, 'DECISION');
              }}
              className="h-11 px-6 rounded-xl bg-[#111111] hover:bg-[#D97745] text-white text-[14px] font-bold transition cursor-pointer"
            >
              Перейти к решению (05 Решение) →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // ЭТАП 05: РЕШЕНИЕ (Стр. 6 PDF и Сценарий №6 — Сводка + УТВЕРДИТЬ / ДОРАБОТАТЬ / ОТКЛОНИТЬ)
  // ===========================================================================
  if (activeTab === 'decisions') {
    const selectedSample =
      (concept.samples || []).find((s) => s.isSelectedForProduction) ||
      concept.samples?.[0];

    const checkLabels: Record<string, string> = {
      passed: 'Прошёл ✓',
      remarks: 'Замечания ⚠️',
      failed: 'Не прошёл ❌',
      untested: 'Не проверяли •',
    };

    const executeDecision = (outcome: RnDDecisionOutcome) => {
      if (!canEdit) {
        notify('error', 'Недостаточно прав для принятия решения по этой модели');
        return;
      }
      if (outcome === 'approve' && !canApproveProd) {
        notify('error', 'Утвердить в производство может только руководитель');
        return;
      }
      const targetStage: ConceptStage =
        outcome === 'approve'
          ? 'PRODUCTION'
          : outcome === 'rework'
          ? reworkTargetStage
          : 'REJECTED';

      const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const reasonText =
        decisionReason.trim() ||
        (outcome === 'approve'
          ? 'Утверждено в серийное производство'
          : outcome === 'rework'
          ? `Возвращено на доработку (этап ${reworkTargetStage})`
          : 'Отклонено по результатам проверки');

      const resolvedSupplier =
        concept.supplierName?.trim() ||
        selectedSample?.factoryName ||
        defaultBrandFactoryName;

      const decisionPatch: Partial<ProductConcept> = {
        stage: targetStage,
        isArchived: outcome === 'reject',
        ...(outcome === 'approve' ? { supplierName: resolvedSupplier } : {}),
        approvalDecisions: [
          {
            id: `dec-${Date.now()}`,
            decision: outcome,
            authorName: currentUser.fullName,
            authorRole: currentUser.role,
            decidedAt: nowStr,
            approvedSampleLabel: selectedSample?.versionCode || 'Основной образец',
            justification: reasonText,
            conditions: '',
          },
          ...(concept.approvalDecisions || []),
        ],
        stageHistory: [
          {
            id: `sh-dec-${Date.now()}`,
            timestamp: nowStr,
            authorName: currentUser.fullName,
            authorRole: currentUser.role,
            actionType: outcome === 'rework' ? 'rollback' : 'decision',
            fromStage: concept.stage,
            toStage: targetStage,
            reason: `[Решение: ${
              outcome === 'approve'
                ? 'УТВЕРДИТЬ'
                : outcome === 'rework'
                ? 'ДОРАБОТАТЬ'
                : 'ОТКЛОНИТЬ'
            }] ${reasonText}`,
          },
          ...(concept.stageHistory || []),
        ],
      };

      const updatedConcept: ProductConcept = {
        ...concept,
        ...decisionPatch,
      };
      onUpdateConcept(concept.id, decisionPatch);
      if (outcome === 'approve') {
        onSyncToScenarioCatalog?.(updatedConcept);
        onSyncConcept?.(updatedConcept);
      }
      if (outcome === 'reject') {
        onSyncConcept?.({ ...updatedConcept, stage: 'REJECTED' });
        notify('warning', 'Карточка отклонена и перенесена в архив');
        return;
      }
      onChangeStageWithGate(updatedConcept, targetStage);
    };

    return (
      <div className="space-y-6 text-[15px]">
        <div className="rounded-2xl border border-[#E8E8E5] bg-white p-6 space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FDF3EB] text-[#D97745] text-[12px] font-bold mb-2">
              05 РЕШЕНИЕ
            </div>
            <h3 className="text-[20px] font-bold text-[#171717]">
              Сводка доказательств перед выбором решения
            </h3>
            <p className="text-[13px] text-[#737373]">
              Перед выбором система показывает сводку: анализ, цену, выбранный образец, тесты и замечания. Сохраняем кто, когда и почему.
            </p>
          </div>

          {/* Сводка в 3 симметричных карточках */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[13px]">
            <div className="rounded-2xl bg-[#F7F7F5] border border-[#E8E8E5] p-4 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                1. АНАЛИЗ И ЦЕНА
              </div>
              <div className="font-bold text-[15px] text-[#171717]">
                Набор {packUnits} шт.: {formatCurrencyRub(packRetailPrice)} ({formatCurrencyRub(unitRetailPrice)} / пара)
              </div>
              <div className="text-[#737373]">
                {currentAnalysis.summaryAndPros ||
                  currentAnalysis.whatWeCreate ||
                  'Гипотеза и спрос зафиксированы'}
              </div>
            </div>

            <div className="rounded-2xl bg-[#F7F7F5] border border-[#E8E8E5] p-4 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                2. ВЫБРАННЫЙ ОБРАЗЕЦ
              </div>
              <div className="font-bold text-[15px] text-[#171717]">
                {selectedSample
                  ? `${selectedSample.versionCode} · ${selectedSample.factoryName}`
                  : concept.supplierName || 'Образец №1'}
              </div>
              <div className="text-[#D97745] font-semibold">
                {selectedSample?.materialAndComposition || 'Хлопок 95% + Эластан 5%'}
              </div>
              {hasCostAccess && (
                <div className="text-[#737373]">
                  Себестоимость: <b>{formatCurrencyRub(unitCostPrice)} / шт.</b>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[#F7F7F5] border border-[#E8E8E5] p-4 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#737373]">
                3. ТЕСТЫ И ЗАМЕЧАНИЯ
              </div>
              <div>
                Посадка: <b>{checkLabels[fourChecks.fitAndComfort]}</b>{' '}
                {fourChecks.fitAndComfortComment ? `(${fourChecks.fitAndComfortComment})` : ''}
              </div>
              <div>
                Резинка и швы: <b>{checkLabels[fourChecks.waistbandAndSeams]}</b>{' '}
                {fourChecks.waistbandAndSeamsComment
                  ? `(${fourChecks.waistbandAndSeamsComment})`
                  : ''}
              </div>
              <div>
                Стирка / цвет: <b>{checkLabels[fourChecks.washShapeColor]}</b>{' '}
                {fourChecks.washShapeColorComment ? `(${fourChecks.washShapeColorComment})` : ''}
              </div>
              <div>
                Качество: <b>{checkLabels[fourChecks.manufacturingQuality]}</b>{' '}
                {fourChecks.manufacturingQualityComment
                  ? `(${fourChecks.manufacturingQualityComment})`
                  : ''}
              </div>
            </div>
          </div>

          {/* Поле причины решения и выбор этапа при доработке */}
          {canEdit && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="md:col-span-2">
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    Причина решения / комментарий (сохраняется в историю с именем и временем)
                  </label>
                  <input
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    placeholder="Укажите причину утверждения, доработки или отказа..."
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] px-3.5 text-[14px]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                    При «Доработать» вернуть в этап:
                  </label>
                  <select
                    value={reworkTargetStage}
                    onChange={(e) => setReworkTargetStage(e.target.value as ConceptStage)}
                    className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 font-semibold text-[13px]"
                  >
                    <option value="SAMPLE">03 Образец (перешить образец)</option>
                    <option value="TEST">04 Тест (повторить проверку)</option>
                    <option value="ANALYSIS">02 Анализ (пересчитать экономику)</option>
                  </select>
                </div>
              </div>

              {/* ТРИ КРУПНЫЕ КНОПКИ СО СТР. 6 PDF: УТВЕРДИТЬ | ДОРАБОТАТЬ | ОТКЛОНИТЬ */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => executeDecision('approve')}
                  className="h-14 rounded-2xl bg-[#E8F5E9] hover:bg-[#16805D] text-[#16805D] hover:text-white border border-[#16805D]/30 font-bold text-[15px] tracking-wider uppercase transition cursor-pointer"
                >
                  УТВЕРДИТЬ
                </button>

                <button
                  type="button"
                  onClick={() => executeDecision('rework')}
                  className="h-14 rounded-2xl bg-[#FDF3EB] hover:bg-[#D97745] text-[#D97745] hover:text-white border border-[#D97745]/30 font-bold text-[15px] tracking-wider uppercase transition cursor-pointer"
                >
                  ДОРАБОТАТЬ
                </button>

                <button
                  type="button"
                  onClick={() => executeDecision('reject')}
                  className="h-14 rounded-2xl bg-[#F5F5F4] hover:bg-[#DC2626] text-[#171717] hover:text-white border border-[#E8E8E5] font-bold text-[15px] tracking-wider uppercase transition cursor-pointer"
                >
                  ОТКЛОНИТЬ
                </button>
              </div>
            </>
          )}

          {/* История принятых решений */}
          {(concept.approvalDecisions || []).length > 0 && (
            <div className="pt-4 border-t border-[#E8E8E5] space-y-2 text-[13px]">
              <div className="font-bold text-[#737373] uppercase text-[11px] tracking-wider">
                Журнал решений по карточке:
              </div>
              {(concept.approvalDecisions || []).map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F7F7F5] px-4 py-2.5 border border-[#E8E8E5]"
                >
                  <div>
                    <b className="text-[#171717]">
                      {d.decision === 'approve'
                        ? '✓ Утверждено'
                        : d.decision === 'rework'
                        ? '↻ На доработку'
                        : '✕ Отклонено'}
                    </b>{' '}
                    · {d.justification}
                  </div>
                  <div className="text-[12px] text-[#737373]">
                    {d.authorName} · {d.decidedAt}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===========================================================================
  // ЭТАП 06: ПРОИЗВОДСТВО — НАСТОЯЩИЙ ЗАКАЗ + ЭКСПОРТ PDF RU / EN / ZH (Стр. 7 и 8 PDF)
  // ===========================================================================
  if (activeTab === 'production') {
    const orders = concept.productionOrders || [];
    const starterTotalPacks =
      prodProfile.brandCode === 'AKUSHA'
        ? 600
        : prodProfile.brandCode === 'LISKANI'
        ? 500
        : prodProfile.brandCode === 'NA_TELE'
        ? 1000
        : 1800;
    const defaultStarterPacks: Record<string, number> = {};
    for (const sz of prodProfile.sizes) {
      const share =
        prodProfile.sizeSharesPct[sz] ??
        Math.round(100 / Math.max(1, prodProfile.sizes.length));
      defaultStarterPacks[sz] = Math.max(10, Math.round((starterTotalPacks * share) / 100));
    }

    const defaultColorComp =
      concept.colorCombinations?.join(' + ') ||
      (prodProfile.brandCode === 'NA_TELE'
        ? 'Телесный беж / Молочный / Графит'
        : prodProfile.brandCode === 'AKUSHA'
        ? 'Молочный нубук / Песочный / Тёмно-синий'
        : prodProfile.brandCode === 'LISKANI'
        ? 'Тёплый лён / Графит блэкаут'
        : '2 × тёмно-синие + 1 × чёрные + 1 × терракотовые');

    const defaultMaterialRu =
      concept.samples?.[0]?.materialAndComposition ||
      cleanTechPackText(
        concept.techPack?.ru?.compositionAndDensity,
        prodProfile.defaultMaterialRu
      );

    const starterPacksSum = Object.values(defaultStarterPacks).reduce((s, v) => s + v, 0);

    const currentOrder = orders[0] || {
      id: 'po-default',
      orderNumber: `PO-2027-01`,
      factoryName: defaultBrandFactoryName,
      contactPerson: 'Менеджер производства',
      approvedSampleVersion: concept.samples?.[0]?.versionCode || 'Версия 1',
      internalStatus: 'order_prep' as const,
      materialAndColors: defaultMaterialRu,
      sizeBreakdown: defaultStarterPacks,
      packsBySize: defaultStarterPacks,
      unitsPerPack: packUnits,
      packColorComposition: defaultColorComp,
      totalUnits: starterPacksSum * packUnits,
      packConfiguration: `${packUnits} ед. в комплекте`,
      packagingDetails: 'Фирменная упаковка со штрихкодом EAN-13 / Честный Знак',
      unitPrice: concept.plannedUnitCost || 320,
      currency: 'RUB' as const,
      plannedReadyDate: concept.targetLaunchDate || '2027-02-15',
      paymentTerms: '30% депозит / 70% перед отгрузкой',
      orderVersion: 1,
      approvedAt: new Date().toISOString().slice(0, 10),
      chineseVerified: true,
      qcNotes: 'AQL 1.5',
      logisticsTracking: '',
    };

    const packsMap: Record<string, number> =
      currentOrder.packsBySize && Object.keys(currentOrder.packsBySize).length > 0
        ? currentOrder.packsBySize
        : defaultStarterPacks;

    const effectiveSizes: string[] = [
      ...prodProfile.sizes,
      ...Object.keys(packsMap).filter(
        (k) => !prodProfile.sizes.includes(k) && (packsMap[k] || 0) > 0
      ),
    ];

    const unitsInOnePack =
      currentOrder.unitsPerPack && currentOrder.unitsPerPack > 0
        ? currentOrder.unitsPerPack
        : packUnits;

    const totalPacks = effectiveSizes.reduce((sum, sz) => sum + (packsMap[sz] || 0), 0);
    const totalPieces = totalPacks * unitsInOnePack;
    const totalOrderSum = totalPieces * (currentOrder.unitPrice || 0);

    const enMaterial = cleanTechPackText(
      concept.techPack?.en?.compositionAndDensity,
      prodProfile.defaultMaterialEn
    );
    const enConstruction = cleanTechPackText(
      concept.techPack?.en?.construction,
      prodProfile.defaultConstructionEn
    );
    const zhMaterial = cleanTechPackText(
      concept.techPack?.zh?.compositionAndDensity,
      prodProfile.defaultMaterialZh
    );
    const zhConstruction = cleanTechPackText(
      concept.techPack?.zh?.construction,
      prodProfile.defaultConstructionZh
    );

    const saveOrderPatch = (patch: Partial<typeof currentOrder>) => {
      const updated = {
        ...currentOrder,
        ...patch,
      };
      const nextPacks = updated.packsBySize || packsMap;
      const nextUnitsPerPack = updated.unitsPerPack || unitsInOnePack;
      const nextSizeKeys = [
        ...prodProfile.sizes,
        ...Object.keys(nextPacks).filter(
          (k) => !prodProfile.sizes.includes(k) && (nextPacks[k] || 0) > 0
        ),
      ];
      const calcPacks = nextSizeKeys.reduce((s, sz) => s + (nextPacks[sz] || 0), 0);
      updated.totalUnits = calcPacks * nextUnitsPerPack;

      const orderConceptPatch: Partial<ProductConcept> = {
        supplierName: updated.factoryName,
        packUnitsCount: nextUnitsPerPack,
        productionOrders: [updated, ...orders.slice(1)],
      };
      const nextConceptSnapshot: ProductConcept = {
        ...concept,
        ...orderConceptPatch,
      };
      onUpdateConcept(concept.id, orderConceptPatch);
      onSyncConcept?.(nextConceptSnapshot);
    };

    const handleConfirmProductionBatch = () => {
      const today = new Date().toISOString().slice(0, 10);
      saveOrderPatch({
        internalStatus:
          currentOrder.internalStatus === 'order_prep'
            ? 'order_placed'
            : currentOrder.internalStatus,
        approvedAt: today,
        packsBySize: packsMap,
        unitsPerPack: unitsInOnePack,
      });
      notify(
        'success',
        `✓ Производственная партия подтверждена и синхронизирована с Планом 2027`,
        `${totalPacks.toLocaleString('ru-RU')} (${prodProfile.packUnitLabelRu.toLowerCase()}) · ${totalPieces.toLocaleString('ru-RU')} (${prodProfile.itemsUnitLabelRu.toLowerCase()})`
      );
    };

    const handleExportFactoryPdf = () => {
      const nextVer = canEdit
        ? (currentOrder.orderVersion || 1) + (orders.length > 0 ? 1 : 0)
        : currentOrder.orderVersion || 1;
      if (canEdit) {
        const today = new Date().toISOString().slice(0, 10);
        saveOrderPatch({
          orderVersion: nextVer,
          approvedAt: today,
          internalStatus: 'order_placed',
        });
      }
      (exportConceptProductionPdf as any)(
        concept,
        {
          factoryName: currentOrder.factoryName,
          approvedSampleVersion: currentOrder.approvedSampleVersion,
          materialAndColors: currentOrder.materialAndColors,
          packColorComposition: currentOrder.packColorComposition || defaultColorComp,
          unitsPerPack: unitsInOnePack,
          packsBySize: packsMap,
          unitPrice: hasCostAccess ? currentOrder.unitPrice || 320 : 0,
          currency: currentOrder.currency || 'RUB',
          plannedReadyDate: currentOrder.plannedReadyDate || '2027-02-15',
          paymentTerms: currentOrder.paymentTerms || '30% депозит / 70% перед отгрузкой',
          orderVersion: nextVer,
        },
        {
          ...pdfBlocksConfig,
          multiCurrency: pdfBlocksConfig.multiCurrency && hasCostAccess,
          canViewCostPrice: hasCostAccess,
        }
      );
      notify(
        'success',
        `Выгружен PDF заказа v${nextVer} (RU / EN / ZH)`,
        `Итого: ${totalPacks.toLocaleString('ru-RU')} (${prodProfile.packUnitLabelRu.toLowerCase()}) · ${totalPieces.toLocaleString('ru-RU')} (${prodProfile.itemsUnitLabelRu.toLowerCase()})`
      );
    };

    const handleExportFactoryExcel = () => {
      if (!hasCostAccess) {
        notify('warning', 'Экспорт сметы Excel ограничен правами доступа к себестоимости');
        return;
      }
      const ver = currentOrder.orderVersion || 1;
      exportConceptProductionExcel(concept, {
        factoryName: currentOrder.factoryName,
        approvedSampleVersion: currentOrder.approvedSampleVersion,
        materialAndColors: currentOrder.materialAndColors,
        packColorComposition: currentOrder.packColorComposition || defaultColorComp,
        unitsPerPack: unitsInOnePack,
        packsBySize: packsMap,
        unitPrice: currentOrder.unitPrice || 320,
        currency: currentOrder.currency || 'RUB',
        plannedReadyDate: currentOrder.plannedReadyDate || '2027-02-15',
        paymentTerms: currentOrder.paymentTerms || '30% депозит / 70% перед отгрузкой',
        orderVersion: ver,
      });
      notify(
        'success',
        `Выгружена таблица Excel заказа v${ver} (.xlsx)`,
        `${prodProfile.sizeGridLabelRu} и расчёт партии`
      );
    };

    return (
      <div className="space-y-6 text-[15px]">
        {/* БЛОК 1: PRODUCTION ORDER / НАСТОЯЩИЙ ЗАКАЗ ПО ЦВЕТАМ, РАЗМЕРАМ И ФАБРИКЕ (Стр. 7 PDF) */}
        <div className="rounded-3xl border border-[#E8E8E5] bg-white p-6 md:p-8 space-y-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E8E8E5] pb-5">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-widest text-[#737373]">
                PRODUCTION ORDER / {currentOrder.internalStatus === 'order_prep' ? 'ЧЕРНОВИК' : 'УТВЕРЖДЁН'} · ВЕРСИЯ v{currentOrder.orderVersion || 1} · {prodProfile.sizeGridLabelRu}
              </div>
              <h3 className="text-[24px] font-bold text-[#171717] mt-1">
                {formatLabBrandLabel(concept.brandId)} · {concept.name} ({unitsInOnePack} ед.)
              </h3>
              <p className="text-[13px] text-[#737373] mt-0.5">
                Образец: <b>{currentOrder.approvedSampleVersion}</b> · Состав: <b>{currentOrder.materialAndColors}</b> · Дата согласования: <b>{currentOrder.approvedAt || '—'}</b>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {canEdit && (
                <button
                  type="button"
                  onClick={handleConfirmProductionBatch}
                  className="h-10 px-4 rounded-xl bg-[#16805D] hover:bg-[#116649] text-white text-[13px] font-bold transition cursor-pointer shadow-2xs"
                >
                  ✓ Подтвердить партию в План 2027
                </button>
              )}
              {concept.imageUrl && (
                <img
                  src={resolvePublicAssetUrl(concept.imageUrl)}
                  alt={concept.name}
                  className="h-16 w-16 rounded-2xl object-contain bg-[#F7F7F5] border border-[#E8E8E5] p-1.5"
                />
              )}
            </div>
          </div>

          {/* Параметры фабрики, сроков, упаковки и цены */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-[13px]">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#737373] mb-1">
                Фабрика (из справочника)
              </label>
              <select
                disabled={!canEdit}
                value={currentOrder.factoryName}
                onChange={(e) => saveOrderPatch({ factoryName: e.target.value })}
                className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 font-bold text-[#171717]"
              >
                <option value={defaultBrandFactoryName}>{defaultBrandFactoryName}</option>
                {FACTORY_DIRECTORY.map((f) => {
                  const label = `${f.name} (${f.country})`;
                  if (label === defaultBrandFactoryName) return null;
                  return (
                    <option key={f.name} value={label}>
                      {label}
                    </option>
                  );
                })}
                {currentOrder.factoryName &&
                  currentOrder.factoryName !== defaultBrandFactoryName &&
                  !FACTORY_DIRECTORY.some(
                    (f) => `${f.name} (${f.country})` === currentOrder.factoryName
                  ) && (
                    <option value={currentOrder.factoryName}>{currentOrder.factoryName}</option>
                  )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[#737373] mb-1">
                План готовности партии
              </label>
              <input
                type="date"
                disabled={!canEdit}
                value={currentOrder.plannedReadyDate}
                onChange={(e) => saveOrderPatch({ plannedReadyDate: e.target.value })}
                className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 font-bold text-[#171717]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[#737373] mb-1">
                Цена фабрики за 1 ед. и валюта
              </label>
              {hasCostAccess ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={!canEdit}
                    value={currentOrder.unitPrice ? String(currentOrder.unitPrice) : ''}
                    onChange={(e) =>
                      saveOrderPatch({
                        unitPrice: parseCleanNumber(e.target.value) ?? 0,
                      })
                    }
                    className="flex-1 h-10 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 font-bold text-[#171717]"
                  />
                  <select
                    disabled={!canEdit}
                    value={currentOrder.currency}
                    onChange={(e) =>
                      saveOrderPatch({
                        currency: e.target.value as 'RUB' | 'USD' | 'CNY',
                      })
                    }
                    className="w-20 h-10 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-2 font-bold"
                  >
                    <option value="RUB">RUB</option>
                    <option value="USD">USD</option>
                    <option value="CNY">CNY</option>
                  </select>
                </div>
              ) : (
                <div className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 flex items-center font-bold text-[#737373]">
                  Скрыто
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-[#737373] mb-1">
                Условия оплаты и упаковка
              </label>
              <input
                disabled={!canEdit}
                value={currentOrder.paymentTerms || '30% депозит / 70% перед отгрузкой'}
                onChange={(e) => saveOrderPatch({ paymentTerms: e.target.value })}
                className="w-full h-10 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5] px-3 font-medium text-[#171717]"
              />
            </div>
          </div>

          {/* Состав набора по цветам (Стр. 7 PDF) */}
          <div className="rounded-2xl bg-[#F7F7F5] border border-[#E8E8E5] p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-9">
              <label className="block text-[12px] font-bold text-[#737373] mb-1">
                Состав комплекта по цветам
              </label>
              <input
                disabled={!canEdit}
                value={currentOrder.packColorComposition || defaultColorComp}
                onChange={(e) =>
                  saveOrderPatch({ packColorComposition: e.target.value })
                }
                className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-white px-4 text-[15px] font-bold text-[#171717]"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-[12px] font-bold text-[#737373] mb-1">
                {prodProfile.itemsUnitLabelRu} в 1 наборе
              </label>
              <input
                type="text"
                inputMode="numeric"
                disabled={!canEdit}
                value={String(unitsInOnePack)}
                onChange={(e) => {
                  const v = parseCleanNumber(e.target.value);
                  saveOrderPatch({ unitsPerPack: v && v > 0 ? v : 1 });
                }}
                className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-white px-4 text-[15px] font-bold text-[#171717]"
              />
            </div>
          </div>

          {/* ТАБЛИЦА РАЗМЕРОВ БРЕНДА */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-[#E8E8E5] text-[13px] font-bold text-[#171717]">
                  <th className="py-3 px-4">Размер ({prodProfile.sizeGridLabelRu})</th>
                  <th className="py-3 px-4">{prodProfile.packUnitLabelRu}</th>
                  <th className="py-3 px-4">{prodProfile.itemsUnitLabelRu} (× {unitsInOnePack})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E8E5]">
                {effectiveSizes.map((sz, idx) => {
                  const packsCount = packsMap[sz] ?? 0;
                  const piecesCount = packsCount * unitsInOnePack;
                  return (
                    <tr
                      key={sz}
                      className={idx % 2 === 0 ? 'bg-[#F7F7F5]/60' : 'bg-white'}
                    >
                      <td className="py-2.5 px-4 font-bold text-[#171717] w-1/3">
                        {sz}
                      </td>
                      <td className="py-2 px-4 w-1/3">
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={!canEdit}
                          value={packsCount > 0 ? String(packsCount) : ''}
                          onChange={(e) => {
                            const nextVal = parseCleanNumber(e.target.value) ?? 0;
                            saveOrderPatch({
                              packsBySize: {
                                ...packsMap,
                                [sz]: nextVal,
                              },
                            });
                          }}
                          placeholder="0"
                          className="w-32 h-9 rounded-lg border border-[#E8E8E5] bg-white px-3 font-semibold text-[#171717]"
                        />
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-[#171717] w-1/3">
                        {piecesCount.toLocaleString('ru-RU')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#171717] text-[15px] font-bold text-[#171717] bg-[#F7F7F5]">
                  <td className="py-3.5 px-4">ИТОГО</td>
                  <td className="py-3.5 px-4">
                    {totalPacks.toLocaleString('ru-RU')} ({prodProfile.packUnitLabelRu.toLowerCase()})
                  </td>
                  <td className="py-3.5 px-4 text-[#D97745]">
                    {totalPieces.toLocaleString('ru-RU')} ({prodProfile.itemsUnitLabelRu.toLowerCase()}) · Сумма:{' '}
                    {hasCostAccess
                      ? `${totalOrderSum.toLocaleString('ru-RU')} ${currentOrder.currency}`
                      : 'Скрыто'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* БЛОК 2: КОНСТРУКТОР И ПРЕДПРОСМОТР PDF ДЛЯ ФАБРИКИ ПЕРЕД СКАЧИВАНИЕМ */}
        <div className="rounded-3xl border border-[#E8E8E5] bg-white p-6 md:p-8 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-widest text-[#B85D35]">
                КОНСТРУКТОР PDF ДЛЯ ФАБРИКИ · НАСТРОЙТЕ СОСТАВ ДОКУМЕНТА ПЕРЕД СКАЧИВАНИЕМ
              </div>
              <h4 className="text-[19px] font-bold text-[#171717] mt-0.5">
                Единый заказ на русском, английском и китайском (RU / EN / ZH)
              </h4>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setInlinePdfConstructorOpen(true)}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-[#1E3A5F] hover:bg-[#162C49] text-white text-[13px] font-bold transition cursor-pointer shadow-xs"
              >
                <Printer className="h-4 w-4" />
                <span>Настроить и скачать PDF (Конструктор PDF)</span>
              </button>
              <button
                type="button"
                onClick={handleExportFactoryPdf}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-[#D8D1C5] bg-white hover:bg-[#FAF8F5] text-[#171717] text-[13px] font-semibold transition cursor-pointer"
                title="Быстрое скачивание PDF со всеми выбранными блоками"
              >
                <FileDown className="h-4 w-4 text-[#B85D35]" />
                <span>Быстрый PDF</span>
              </button>
              {hasCostAccess && (
                <button
                  type="button"
                  onClick={handleExportFactoryExcel}
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-[#EAE6DF] bg-[#FAF8F5] hover:border-[#181715] text-[#181715] text-[13px] font-semibold transition cursor-pointer"
                >
                  <FileDown className="h-4 w-4 text-[#7A756D]" />
                  <span>Скачать Excel (.xlsx)</span>
                </button>
              )}
            </div>
          </div>

          {/* ИНТЕРАКТИВНЫЙ ВЫБОР ТОГО, ЧТО ОТОБРАЗИТЬ В PDF ПЕРЕД ВЫГРУЗКОЙ */}
          <div className="rounded-2xl bg-[#FAF8F5] border border-[#E5E0D5] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold text-[#1D1D1F]">
                Выберите блоки, которые нужно отобразить в PDF:
              </span>
              <button
                type="button"
                onClick={() => setInlinePdfConstructorOpen(true)}
                className="text-[12px] font-semibold text-[#1E3A5F] hover:underline cursor-pointer"
              >
                Открыть полный визуальный конструктор листа А4 →
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                { key: 'ruSection' as const, label: 'Секция RU (Русский)' },
                { key: 'enSection' as const, label: 'Секция EN (English)' },
                { key: 'zhSection' as const, label: 'Секция ZH (Крупный 中文)' },
                { key: 'photosFrontBack' as const, label: 'Фото (Спереди + Сзади)' },
                ...(hasCostAccess
                  ? [{ key: 'multiCurrency' as const, label: 'Валюты (CNY / USD / RUB)' }]
                  : []),
                {
                  key: 'sizeMatrix' as const,
                  label: `Размеры (${prodProfile.sizes[0]}–${prodProfile.sizes[prodProfile.sizes.length - 1]})`,
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] font-semibold cursor-pointer transition ${
                    pdfBlocksConfig[item.key]
                      ? 'bg-white border-[#C8A97E] text-[#1D1D1F] shadow-2xs'
                      : 'bg-[#F2EFE9]/60 border-[#E5E0D5] text-[#7A756D]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={pdfBlocksConfig[item.key]}
                    onChange={(e) =>
                      setPdfBlocksConfig((prev) => ({
                        ...prev,
                        [item.key]: e.target.checked,
                      }))
                    }
                    className="h-3.5 w-3.5 accent-[#1E3A5F] rounded cursor-pointer"
                  />
                  <span className="truncate">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[12px]">
            {/* RU */}
            {pdfBlocksConfig.ruSection && (
              <div className="rounded-2xl border border-[#E8E8E5] bg-[#F7F7F5]/60 p-4 space-y-2.5">
                <span className="inline-block px-2.5 py-1 rounded-md bg-[#FDF3EB] text-[#D97745] font-bold">
                  RU
                </span>
                <div className="font-bold text-[14px] text-[#171717]">
                  ЗАКАЗ НА ПРОИЗВОДСТВО
                </div>
                <div className="space-y-1 text-[#525252] border-t border-[#E8E8E5] pt-2">
                  <div>Модель: <b>{concept.name}</b> ({currentOrder.approvedSampleVersion})</div>
                  <div>Фабрика: <b>{currentOrder.factoryName}</b></div>
                  <div>Состав: <b>{cleanTechPackText(currentOrder.materialAndColors, prodProfile.defaultMaterialRu)}</b></div>
                  <div>Сетка: <b>{prodProfile.sizeGridLabelRu}</b></div>
                  <div>Комплект: <b>{currentOrder.packColorComposition || defaultColorComp}</b></div>
                  {pdfBlocksConfig.sizeMatrix && (
                    <div>Тираж: <b>{totalPacks.toLocaleString('ru-RU')} ({prodProfile.packUnitLabelRu.toLowerCase()}) / {totalPieces.toLocaleString('ru-RU')} ({prodProfile.itemsUnitLabelRu.toLowerCase()})</b></div>
                  )}
                  <div>Готовность: <b>{currentOrder.plannedReadyDate}</b></div>
                </div>
              </div>
            )}

            {/* EN */}
            {pdfBlocksConfig.enSection && (
              <div className="rounded-2xl border border-[#E8E8E5] bg-[#F7F7F5]/60 p-4 space-y-2.5">
                <span className="inline-block px-2.5 py-1 rounded-md bg-[#FDF3EB] text-[#D97745] font-bold">
                  EN
                </span>
                <div className="font-bold text-[14px] text-[#171717]">
                  PRODUCTION ORDER
                </div>
                <div className="space-y-1 text-[#525252] border-t border-[#E8E8E5] pt-2">
                  <div>Style: <b>{concept.code} · {concept.name}</b></div>
                  <div>Construction: <b>{enConstruction}</b></div>
                  <div>Factory: <b>{currentOrder.factoryName}</b></div>
                  <div>Fabric: <b>{enMaterial}</b></div>
                  <div>Size Grid: <b>{prodProfile.sizeGridLabelEn} ({unitsInOnePack}-Pack)</b></div>
                  {pdfBlocksConfig.sizeMatrix && (
                    <div>Total Qty: <b>{totalPacks.toLocaleString('en-US')} packs / {totalPieces.toLocaleString('en-US')} units</b></div>
                  )}
                  <div>Ready Date: <b>{currentOrder.plannedReadyDate}</b></div>
                </div>
              </div>
            )}

            {/* ZH */}
            {pdfBlocksConfig.zhSection && (
              <div className="rounded-2xl border border-[#E8E8E5] bg-[#F7F7F5]/60 p-4 space-y-2.5">
                <span className="inline-block px-2.5 py-1 rounded-md bg-[#FDF3EB] text-[#D97745] font-bold">
                  ZH · КРУПНЫЙ КИТАЙСКИЙ
                </span>
                <div className="font-bold text-[16px] text-[#171717]">
                  生产订单 (PRODUCTION ORDER)
                </div>
                <div className="space-y-1 text-[#525252] border-t border-[#E8E8E5] pt-2">
                  <div className="text-[14px] font-bold text-[#171717]">款号: {concept.code} ({currentOrder.approvedSampleVersion})</div>
                  <div>版型工艺: <b>{zhConstruction}</b></div>
                  <div>工厂: <b>{currentOrder.factoryName}</b></div>
                  <div className="text-[13.5px] font-bold text-[#171717]">面料成分: {zhMaterial}</div>
                  <div>尺码及包装: <b>{prodProfile.sizeGridLabelZh} · 每组 {unitsInOnePack} 件</b></div>
                  {pdfBlocksConfig.sizeMatrix && (
                    <div className="text-[13.5px] font-bold text-[#B85D35]">订单总量: {totalPacks} 组 / 共 {totalPieces} 件</div>
                  )}
                  <div>交货日期: <b>{currentOrder.plannedReadyDate}</b></div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E8E8E5] text-[13px]">
            <label className="inline-flex items-center gap-2 font-semibold text-[#171717] cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={currentOrder.chineseVerified ?? true}
                onChange={(e) => saveOrderPatch({ chineseVerified: e.target.checked })}
                className="h-4 w-4 accent-[#D97745]"
              />
              <span>
                Китайские материалы и формулировки проверены перед отправкой. Числа и таблицы едины для всех трёх частей.
              </span>
            </label>

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  let updatedConcept = concept;
                  if (orders.length === 0) {
                    const orderPatch: Partial<ProductConcept> = {
                      supplierName: currentOrder.factoryName,
                      productionOrders: [currentOrder],
                    };
                    updatedConcept = {
                      ...concept,
                      ...orderPatch,
                    };
                    onUpdateConcept(concept.id, orderPatch);
                  }
                  onSyncConcept?.(updatedConcept);
                  onChangeStageWithGate(updatedConcept, 'LAUNCH');
                }}
                className="h-10 px-5 rounded-xl bg-[#111111] text-white font-bold cursor-pointer"
              >
                Перейти к Запуску (07 Запуск) →
              </button>
            )}
          </div>
        </div>

        {/* МОДАЛЬНОЕ ОКНО ПОЛНОГО КОНСТРУКТОРА PDF С ПРЕДПРОСМОТРОМ ЛИСТА А4 */}
        {inlinePdfConstructorOpen && (
          <PdfConstructorModal
            concept={concept}
            initialBlocksConfig={{
              ...pdfBlocksConfig,
              multiCurrency: pdfBlocksConfig.multiCurrency && hasCostAccess,
            }}
            onClose={() => setInlinePdfConstructorOpen(false)}
            onSaveToConcept={(patch) => {
              const nextConceptSnapshot: ProductConcept = {
                ...concept,
                ...patch,
              };
              if (canEdit) {
                onUpdateConcept(concept.id, patch);
                onSyncConcept?.(nextConceptSnapshot);
              }
              notify('success', 'PDF-спецификация настроена и скачана');
            }}
          />
        )}
      </div>
    );
  }

  // ===========================================================================
  // ЭТАП 07: ЗАПУСК (Стр. 8 PDF и Сценарий №8 — Только ссылка, дата старта и статус «В продаже»)
  // ===========================================================================
  if (activeTab === 'launch') {
    const isInSale = concept.launchSalesStatus === 'in_sale';

    return (
      <div className="space-y-6 text-[15px]">
        <div className="rounded-3xl border border-[#E8E8E5] bg-white p-6 md:p-8 space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#FDF3EB] text-[#D97745] text-[12px] font-bold mb-2">
              07 ЗАПУСК
            </div>
            <h3 className="text-[22px] font-bold text-[#171717]">
              Завершение разработки и старт продаж
            </h3>
            <p className="text-[14px] text-[#737373] mt-0.5">
              Только ссылка на карточку товара, дата фактического старта и статус «В продаже». Дополнительный комментарий — по желанию.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[14px]">
            <div className="md:col-span-2">
              <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                Ссылка на карточку товара на маркетплейсе (Wildberries / Ozon)
              </label>
              <input
                disabled={!canEdit}
                value={
                  concept.marketplaceProductUrl ||
                  concept.referenceLinks?.[0] ||
                  ''
                }
                onChange={(e) =>
                  onUpdateConcept(concept.id, {
                    marketplaceProductUrl: e.target.value,
                  })
                }
                placeholder="https://www.wildberries.ru/catalog/..."
                className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5]/60 px-3.5 font-medium"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                Дата фактического старта продаж
              </label>
              <input
                type="date"
                disabled={!canEdit}
                value={concept.actualLaunchDate || concept.targetLaunchDate || '2027-03-01'}
                onChange={(e) =>
                  onUpdateConcept(concept.id, {
                    actualLaunchDate: e.target.value,
                  })
                }
                className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5]/60 px-3.5 font-bold"
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                Статус запуска
              </label>
              <div className="flex h-11 rounded-xl bg-[#F7F7F5] p-1 border border-[#E8E8E5]">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    onUpdateConcept(concept.id, { launchSalesStatus: 'prep' })
                  }
                  className={`flex-1 rounded-lg text-[13px] font-bold transition cursor-pointer ${
                    !isInSale ? 'bg-white text-[#171717] shadow-2xs' : 'text-[#737373]'
                  }`}
                >
                  Подготовка
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    const launchedConcept: ProductConcept = {
                      ...concept,
                      launchSalesStatus: 'in_sale',
                      stage: 'LAUNCH',
                    };
                    onUpdateConcept(concept.id, {
                      launchSalesStatus: 'in_sale',
                      stage: 'LAUNCH',
                    });
                    onSyncToScenarioCatalog?.(launchedConcept);
                  }}
                  className={`flex-1 rounded-lg text-[13px] font-bold transition cursor-pointer ${
                    isInSale
                      ? 'bg-[#16805D] text-white shadow-2xs'
                      : 'text-[#737373]'
                  }`}
                >
                  В продаже ✓
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[12px] font-semibold text-[#737373] mb-1">
                Дополнительный комментарий (по желанию)
              </label>
              <input
                disabled={!canEdit}
                value={concept.launchNote || ''}
                onChange={(e) =>
                  onUpdateConcept(concept.id, { launchNote: e.target.value })
                }
                placeholder="Первая партия принята на склад Коледино, карточка активна..."
                className="w-full h-11 rounded-xl border border-[#E8E8E5] bg-[#F7F7F5]/60 px-3.5"
              />
            </div>
          </div>

          {/* Зелёное правило со Стр. 8 PDF + Кнопка связи с Каталогом */}
          <div className="rounded-2xl bg-[#E8F5E9]/70 border border-[#16805D]/30 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-[14px] font-bold text-[#16805D]">
                Результаты продаж — не здесь. После старта модель связывается с каталогом.
              </div>
              <div className="text-[13px] text-[#525252]">
                {linkedProduct
                  ? `✓ Модель связана с карточкой в Каталоге SKU (${linkedProduct.sku} · ${linkedProduct.name})`
                  : 'Нажмите кнопку справа, чтобы зафиксировать старт продаж и связать модель с Каталогом.'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {linkedScenarioModelCode || linkedProduct ? (
                <>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        onSyncToScenarioCatalog?.({
                          ...concept,
                          launchSalesStatus: 'in_sale',
                          stage: 'LAUNCH',
                        });
                      }}
                      className="h-11 px-4 rounded-xl bg-[#F3EFE8] hover:bg-[#E7E1D6] border border-[#D4CDC2] text-[#171717] text-[12.5px] font-bold cursor-pointer transition"
                    >
                      Обновить в Каталоге ({linkedScenarioModelCode || linkedProduct?.sku})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onNavigateToSection('product-catalog', {
                        productId:
                          concept.linkedScenarioModelId ||
                          linkedScenarioModelCode ||
                          linkedProduct?.id ||
                          concept.code,
                        brandId: normalizeLabBrandCode(concept.brandId),
                      })
                    }
                    className="h-11 px-5 rounded-xl bg-[#16805D] hover:bg-[#116649] text-white text-[13px] font-bold cursor-pointer transition"
                  >
                    Открыть в 01 · Продукт →
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigateToSection('launch-calendar', {
                        brandId: normalizeLabBrandCode(concept.brandId),
                      })
                    }
                    className="h-11 px-5 rounded-xl bg-[#111111] hover:opacity-90 text-white text-[13px] font-bold cursor-pointer transition"
                  >
                    Открыть в 02 · Продажи →
                  </button>
                </>
              ) : (
                canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      const launchedConcept: ProductConcept = {
                        ...concept,
                        launchSalesStatus: 'in_sale',
                        stage: 'LAUNCH',
                      };
                      onUpdateConcept(concept.id, {
                        launchSalesStatus: 'in_sale',
                        stage: 'LAUNCH',
                      });
                      onSyncToScenarioCatalog?.(launchedConcept);
                      onCreateProductFromConcept(concept.id);
                    }}
                    className="h-11 px-6 rounded-xl bg-[#111111] hover:bg-[#16805D] text-white text-[13px] font-bold transition cursor-pointer"
                  >
                    Зафиксировать старт продаж и связать с Каталогом →
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // ИСТОРИЯ КЛЮЧЕВЫХ РЕШЕНИЙ И ИЗМЕНЕНИЙ
  // ===========================================================================
  return (
    <div className="rounded-2xl border border-[#E8E8E5] bg-white p-6 space-y-4 text-[14px]">
      <div>
        <h3 className="text-[18px] font-bold text-[#171717]">
          История ключевых решений и переходов по этапам
        </h3>
        <p className="text-[13px] text-[#737373]">
          Сохраняется отдельно от текущего статуса — кто, когда и почему принял решение
        </p>
      </div>

      <div className="divide-y divide-[#E8E8E5]">
        {(concept.stageHistory || []).map((h) => (
          <div key={h.id} className="py-3.5 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-[#171717]">{h.reason}</div>
              <div className="text-[12px] text-[#737373] mt-0.5">{h.authorName}</div>
            </div>
            <span className="text-[12px] text-[#737373] shrink-0">{h.timestamp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
