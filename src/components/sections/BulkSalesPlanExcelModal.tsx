'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import type { ScenarioModelSpec } from '@/lib/scenarioData';
import {
  buildBulkTemplateSheets,
  buildXlsxBytes,
  detectRecommendedImportMode,
  detectSpreadsheetColumns,
  parseSpreadsheetBuffer,
  previewBulkSpreadsheetImport,
  type BulkImportPreviewResult,
  type BulkTemplateMode,
  type BulkVolumeMetric,
  type ParsedSpreadsheet,
} from '@/lib/bulkSalesPlanExcel';
import { LISKANI_2027_SCENARIO_ID } from '@/lib/liskaniAssortment2027';
import { matchesBrandFilter } from '@/lib/unifiedBusinessEngine';

interface BulkSalesPlanExcelModalProps {
  open: boolean;
  onClose: () => void;
  models: ScenarioModelSpec[];
  scenarioId: number;
  selectedScenarioByBrand?: Partial<Record<string, number | null>>;
  scenarioTitle: string;
  brandScope: string;
  brandDisplayLabel: string;
  initialMode?: BulkTemplateMode;
  hasCost: boolean;
  hasFinance: boolean;
  canEditModel: (model: ScenarioModelSpec) => boolean;
  onApplyModels: (
    updatedModels: ScenarioModelSpec[],
    preview: BulkImportPreviewResult
  ) => void;
  notify?: (
    type: 'success' | 'warning' | 'error',
    title: string,
    detail?: string
  ) => void;
}

function fmtRub(val: number): string {
  const rounded = Math.round(val * 100) / 100;
  const hasDec = Math.abs(rounded - Math.round(rounded)) > 0.005;
  return `${rounded.toLocaleString('ru-RU', {
    minimumFractionDigits: hasDec ? 2 : 0,
    maximumFractionDigits: hasDec ? 2 : 0,
  })} ₽`;
}

function fmtMln(val: number): string {
  return `${(val / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
}

function fmtDeltaMln(before: number, after: number): string {
  const diff = after - before;
  if (Math.abs(diff) < 1) return 'без изменений';
  const sign = diff > 0 ? '+' : '−';
  return `${sign}${(Math.abs(diff) / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
}

export function BulkSalesPlanExcelModal({
  open,
  onClose,
  models,
  scenarioId,
  selectedScenarioByBrand,
  scenarioTitle,
  brandScope,
  brandDisplayLabel,
  initialMode,
  hasCost,
  hasFinance,
  canEditModel,
  onApplyModels,
  notify,
}: BulkSalesPlanExcelModalProps) {
  const hasLiskani269 = useMemo(
    () =>
      models.some(
        (m) => Array.isArray(m.liskaniSizeVariants) && m.liskaniSizeVariants.length > 0
      ),
    [models]
  );

  const defaultMode: BulkTemplateMode =
    initialMode ||
    (hasLiskani269 && brandScope.toUpperCase() === 'LISKANI'
      ? 'liskani_269'
      : 'brand_models');

  const [mode, setMode] = useState<BulkTemplateMode>(defaultMode);
  const [volumeMetric, setVolumeMetric] = useState<BulkVolumeMetric>('buyouts');
  const [parsedFile, setParsedFile] = useState<ParsedSpreadsheet | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [applyPrice, setApplyPrice] = useState(true);
  const [applyCost, setApplyCost] = useState(true);
  const [applyMonths, setApplyMonths] = useState(true);
  const [showUnmatchedDetails, setShowUnmatchedDetails] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readSeqRef = useRef(0);
  const isApplyingRef = useRef(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setParsedFile(null);
      setParseError(null);
      setIsParsing(false);
      setIsDragging(false);
      setShowUnmatchedDetails(false);
    } else {
      setMode(defaultMode);
    }
  }

  useEffect(() => {
    if (!open) {
      readSeqRef.current += 1;
      isApplyingRef.current = false;
      return;
    }
    isApplyingRef.current = false;
    if (typeof window === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const effectiveScenarioId =
    mode === 'liskani_269' ? LISKANI_2027_SCENARIO_ID : scenarioId;

  // Лёгкий подсчёт строк шаблона без генерации 269×21 ячеек на каждый рендер
  const templateRowsCount = useMemo(() => {
    if (mode === 'liskani_269') {
      return models.reduce(
        (sum, m) => sum + (Array.isArray(m.liskaniSizeVariants) ? m.liskaniSizeVariants.length : 0),
        0
      );
    }
    return models.filter(
      (m) => brandScope === 'ALL' || matchesBrandFilter(m, brandScope)
    ).length;
  }, [models, mode, brandScope]);

  const preview = useMemo<BulkImportPreviewResult | null>(() => {
    if (!parsedFile) return null;
    return previewBulkSpreadsheetImport({
      models,
      scenarioId: effectiveScenarioId,
      selectedScenarioByBrand,
      mode,
      brandScope,
      parsed: parsedFile,
      options: {
        volumeMetric,
        applyPrice,
        applyCost: hasCost && applyCost,
        applyMonths,
        canEditCost: hasCost,
        canEditModel,
      },
    });
  }, [
    parsedFile,
    models,
    effectiveScenarioId,
    selectedScenarioByBrand,
    mode,
    brandScope,
    volumeMetric,
    applyPrice,
    applyCost,
    applyMonths,
    hasCost,
    canEditModel,
  ]);

  if (!open) return null;

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const buildCurrentTemplate = () =>
    buildBulkTemplateSheets({
      models,
      scenarioId: effectiveScenarioId,
      selectedScenarioByBrand,
      mode,
      brandScope,
      volumeMetric,
      includeCost: hasCost,
      scenarioTitle,
    });

  const handleDownloadXlsx = () => {
    try {
      const templateMeta = buildCurrentTemplate();
      const bytes = buildXlsxBytes(templateMeta.sheets);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy.buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      triggerDownload(blob, `${templateMeta.fileBaseName}.xlsx`);
      notify?.(
        'success',
        `Шаблон Excel скачан (${templateMeta.rowsCount} SKU)`,
        mode === 'liskani_269'
          ? hasCost
            ? 'Содержит все 269 размерных SKU LISKANI: цены, себестоимость и 12 месяцев.'
            : 'Содержит все 269 размерных SKU LISKANI: цены и 12 месяцев.'
          : hasCost
          ? `Содержит ${templateMeta.rowsCount} карточек (${brandDisplayLabel}): цены, себестоимость и 12 месяцев.`
          : `Содержит ${templateMeta.rowsCount} карточек (${brandDisplayLabel}): цены и 12 месяцев.`
      );
    } catch {
      notify?.('error', 'Не удалось сформировать шаблон Excel (.xlsx)');
    }
  };

  const handleDownloadCsv = () => {
    try {
      const templateMeta = buildCurrentTemplate();
      const blob = new Blob([templateMeta.csvText], {
        type: 'text/csv;charset=utf-8',
      });
      triggerDownload(blob, `${templateMeta.fileBaseName}.csv`);
      notify?.('success', `Шаблон CSV скачан (${templateMeta.rowsCount} SKU)`);
    } catch {
      notify?.('error', 'Не удалось сформировать шаблон CSV');
    }
  };

  const handleReadFile = async (file: File) => {
    const seq = ++readSeqRef.current;
    setParseError(null);
    setShowUnmatchedDetails(false);
    setIsParsing(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (seq !== readSeqRef.current) return;
      const parsed = parseSpreadsheetBuffer(buf, file.name);
      if (seq !== readSeqRef.current) return;
      if (parsed.rows.length < 2) {
        setParseError('Файл пустой или содержит меньше 2 строк.');
        setParsedFile(null);
        return;
      }
      setParsedFile(parsed);

      // Быстрое автоопределение режима и метрики без двойного полного расчёта превью
      const recMode = detectRecommendedImportMode(models, parsed, mode);
      if (recMode !== mode && (recMode === 'brand_models' || hasLiskani269)) {
        setMode(recMode);
      }

      const detectedCols = detectSpreadsheetColumns(parsed.rows, parsed.metadata);
      if (detectedCols.detectedMetricHint) {
        setVolumeMetric(detectedCols.detectedMetricHint);
      }
    } catch (err) {
      if (seq !== readSeqRef.current) return;
      setParsedFile(null);
      setParseError(
        err instanceof Error
          ? err.message
          : 'Не удалось прочитать файл. Поддерживаются форматы .xlsx и .csv.'
      );
    } finally {
      if (seq === readSeqRef.current) {
        setIsParsing(false);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleReadFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await handleReadFile(file);
  };

  const handleApply = () => {
    if (isApplyingRef.current || !preview || preview.changedSkusCount === 0) return;
    isApplyingRef.current = true;
    try {
      onApplyModels(preview.updatedModels, preview);
      onClose();
    } finally {
      isApplyingRef.current = false;
    }
  };

  const unitWord = mode === 'liskani_269' ? 'компл.' : 'шт./пар';

  return (
    <div
      data-testid="bulk-excel-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-5"
    >
      <div className="w-full max-w-4xl bg-white dark:bg-[#151514] rounded-2xl border border-[#E4E1DA] dark:border-[#282724] shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Шапка */}
        <div className="px-5 sm:px-6 py-4 border-b border-[#E4E1DA] dark:border-[#282724] flex items-start justify-between gap-4 bg-[#FAF9F6] dark:bg-[#181715]">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#5C5953] dark:text-[#9E9A92]">
              <FileSpreadsheet className="h-3.5 w-3.5 text-[#15803D]" strokeWidth={1.75} />
              <span>Excel / CSV · Массовое обновление</span>
            </div>
            <h3 className="text-[18px] sm:text-[20px] font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5 tracking-[-0.01em]">
              Цены, себестоимость и помесячный план продаж (Янв–Дек)
            </h3>
            <p className="text-[12.5px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
              Скачайте шаблон с текущими данными, обновите нужные ячейки в Excel и загрузите обратно одним файлом.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно массового импорта"
            className="h-8 w-8 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#1D1C1A] flex items-center justify-center text-[#5C5953] hover:text-[#141413] dark:hover:text-[#F5F4F0] cursor-pointer shrink-0 transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Тело модалки */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {/* Переключатели режима и метрики */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {hasLiskani269 && (
              <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5953] dark:text-[#9E9A92]">
                  1. Уровень позиций
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMode('liskani_269')}
                    className={`h-9 px-2.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                      mode === 'liskani_269'
                        ? 'bg-[#141413] text-white dark:bg-[#F5F4F0] dark:text-[#141413]'
                        : 'bg-white dark:bg-[#151514] text-[#5C5953] dark:text-[#9E9A92] border border-[#E4E1DA] dark:border-[#282724] hover:text-[#141413]'
                    }`}
                  >
                    LISKANI · 269 размеров
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('brand_models')}
                    className={`h-9 px-2.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer truncate ${
                      mode === 'brand_models'
                        ? 'bg-[#141413] text-white dark:bg-[#F5F4F0] dark:text-[#141413]'
                        : 'bg-white dark:bg-[#151514] text-[#5C5953] dark:text-[#9E9A92] border border-[#E4E1DA] dark:border-[#282724] hover:text-[#141413]'
                    }`}
                  >
                    Карточки ({brandDisplayLabel})
                  </button>
                </div>
              </div>
            )}

            <div
              className={`rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3 space-y-2 ${
                !hasLiskani269 ? 'md:col-span-2' : ''
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5C5953] dark:text-[#9E9A92]">
                {hasLiskani269 ? '2.' : '1.'} Колонки Янв–Дек означают
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setVolumeMetric('buyouts')}
                  className={`h-9 px-2.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                    volumeMetric === 'buyouts'
                      ? 'bg-[#141413] text-white dark:bg-[#F5F4F0] dark:text-[#141413]'
                      : 'bg-white dark:bg-[#151514] text-[#5C5953] dark:text-[#9E9A92] border border-[#E4E1DA] dark:border-[#282724] hover:text-[#141413]'
                  }`}
                >
                  Выкупы (план продаж)
                </button>
                <button
                  type="button"
                  onClick={() => setVolumeMetric('orders')}
                  className={`h-9 px-2.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                    volumeMetric === 'orders'
                      ? 'bg-[#141413] text-white dark:bg-[#F5F4F0] dark:text-[#141413]'
                      : 'bg-white dark:bg-[#151514] text-[#5C5953] dark:text-[#9E9A92] border border-[#E4E1DA] dark:border-[#282724] hover:text-[#141413]'
                  }`}
                >
                  Заказы (шт./компл.)
                </button>
              </div>
            </div>
          </div>

          {/* ШАГ 1: Скачать шаблон */}
          <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] p-4 space-y-3 bg-white dark:bg-[#151514]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                  Шаг 1 · Скачать актуальный шаблон ({templateRowsCount} SKU)
                </div>
                <p className="text-[12px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                  Текущие цены, {hasCost ? 'себестоимость и ' : ''}план Янв–Дек уже подставлены. Баркоды и WB-артикулы защищены как текст.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadXlsx}
                  className="h-9 px-3.5 rounded-lg bg-[#141413] hover:bg-[#282724] dark:bg-[#F5F4F0] dark:hover:bg-[#E4E1DA] text-white dark:text-[#141413] text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>Скачать шаблон .xlsx</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="h-9 px-3 rounded-lg bg-[#FAF9F6] hover:bg-[#EFECE6] dark:bg-[#1D1C1A] dark:hover:bg-[#282724] text-[#141413] dark:text-[#F5F4F0] border border-[#E4E1DA] dark:border-[#282724] text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>Скачать .csv</span>
                </button>
              </div>
            </div>
          </div>

          {/* ШАГ 2: Загрузить файл */}
          <div className="space-y-3">
            <div className="text-[13.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
              Шаг 2 · Загрузить заполненный Excel (.xlsx) или CSV (.csv)
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-[#141413] bg-[#FAF9F6] dark:border-[#F5F4F0] dark:bg-[#1D1C1A]'
                  : 'border-[#D4D0C8] dark:border-[#34322E] hover:border-[#141413] dark:hover:border-[#9E9A92] bg-[#FAF9F6]/60 dark:bg-[#1D1C1A]/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="h-5 w-5 mx-auto text-[#5C5953] dark:text-[#9E9A92]" strokeWidth={1.75} />
              <div className="text-[13.5px] font-medium text-[#141413] dark:text-[#F5F4F0] mt-2">
                {isParsing
                  ? 'Читаю таблицу и сверяю артикулы…'
                  : parsedFile
                  ? `Загружен файл: ${parsedFile.fileName} (нажмите, чтобы выбрать другой)`
                  : 'Перетащите файл сюда или нажмите для выбора (.xlsx / .csv)'}
              </div>
              <div className="text-[11.5px] text-[#78746C] dark:text-[#9E9A92] mt-1">
                Подходит как полный шаблон с 12 месяцами, так и таблица только с ценами и себестоимостью — отсутствующие колонки не затрут текущие данные.
              </div>
            </div>

            {parseError && (
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-[12.5px] text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>

          {/* ШАГ 3: Предпросмотр «Было → Стало» */}
          {preview && (
            <div className="space-y-4 pt-1 border-t border-[#E4E1DA] dark:border-[#282724]">
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                <div className="text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#15803D]" strokeWidth={2} />
                  <span>Предпросмотр изменений «Было → Стало»</span>
                </div>

                {/* Какие поля применять */}
                <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyPrice && preview.detectedColumns.priceCol >= 0}
                      disabled={preview.detectedColumns.priceCol < 0}
                      onChange={(e) => setApplyPrice(e.target.checked)}
                    />
                    <span className={preview.detectedColumns.priceCol < 0 ? 'text-[#9E9A92]' : ''}>
                      Цены {preview.detectedColumns.priceCol >= 0 ? '✓' : '(нет в файле)'}
                    </span>
                  </label>

                  {hasCost ? (
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={applyCost && preview.detectedColumns.costCol >= 0}
                        disabled={preview.detectedColumns.costCol < 0}
                        onChange={(e) => setApplyCost(e.target.checked)}
                      />
                      <span className={preview.detectedColumns.costCol < 0 ? 'text-[#9E9A92]' : ''}>
                        Себестоимость {preview.detectedColumns.costCol >= 0 ? '✓' : '(нет в файле)'}
                      </span>
                    </label>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-800">
                      <Lock className="h-3 w-3" />
                      Себестоимость ограничена ролью
                    </span>
                  )}

                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyMonths && preview.detectedColumns.monthCols.size > 0}
                      disabled={preview.detectedColumns.monthCols.size === 0}
                      onChange={(e) => setApplyMonths(e.target.checked)}
                    />
                    <span
                      className={
                        preview.detectedColumns.monthCols.size === 0 ? 'text-[#9E9A92]' : ''
                      }
                    >
                      Месяцы:{' '}
                      {preview.detectedColumns.monthCols.size > 0
                        ? `${preview.detectedColumns.monthCols.size} мес. ✓`
                        : 'не заданы'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Сводные карточки дельт */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3">
                  <div className="text-[11px] text-[#78746C] dark:text-[#9E9A92]">Совпадение SKU</div>
                  <div className="font-display-num text-[17px] font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5">
                    {preview.matchedRowsCount} / {preview.totalDataRows}
                  </div>
                  <div className="text-[11px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                    Изменится: <strong>{preview.changedSkusCount}</strong>
                    {preview.priceChangedCount > 0 ? ` · цен ${preview.priceChangedCount}` : ''}
                    {preview.costChangedCount > 0 ? ` · себест. ${preview.costChangedCount}` : ''}
                    {preview.monthsChangedCount > 0 ? ` · план ${preview.monthsChangedCount}` : ''}
                  </div>
                </div>

                {hasFinance && (
                  <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3">
                    <div className="text-[11px] text-[#78746C] dark:text-[#9E9A92]">
                      Выкупы 2027 (выручка)
                    </div>
                    <div className="font-display-num text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5 flex items-center gap-1 flex-wrap">
                      <span>{fmtMln(preview.totalsBefore.annualBuyoutsRub)}</span>
                      <ArrowRight className="h-3 w-3 text-[#78746C]" />
                      <span className="text-[#15803D] dark:text-emerald-400">
                        {fmtMln(preview.totalsAfter.annualBuyoutsRub)}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                      {fmtDeltaMln(
                        preview.totalsBefore.annualBuyoutsRub,
                        preview.totalsAfter.annualBuyoutsRub
                      )}
                    </div>
                  </div>
                )}

                {hasCost && hasFinance && (
                  <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3">
                    <div className="text-[11px] text-[#78746C] dark:text-[#9E9A92]">
                      Себестоимость (COGS)
                    </div>
                    <div className="font-display-num text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5 flex items-center gap-1 flex-wrap">
                      <span>{fmtMln(preview.totalsBefore.annualCogsRub)}</span>
                      <ArrowRight className="h-3 w-3 text-[#78746C]" />
                      <span>{fmtMln(preview.totalsAfter.annualCogsRub)}</span>
                    </div>
                    <div className="text-[11px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                      Ср.: {fmtRub(preview.totalsBefore.weightedAvgCostRub)} →{' '}
                      {fmtRub(preview.totalsAfter.weightedAvgCostRub)}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3">
                  <div className="text-[11px] text-[#78746C] dark:text-[#9E9A92]">
                    Объём 2027 ({volumeMetric === 'orders' ? 'заказы' : 'выкупы'})
                  </div>
                  <div className="font-display-num text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5 flex items-center gap-1 flex-wrap">
                    <span>
                      {(volumeMetric === 'orders'
                        ? preview.totalsBefore.annualOrdersUnits
                        : preview.totalsBefore.annualBuyoutsUnits
                      ).toLocaleString('ru-RU')}
                    </span>
                    <ArrowRight className="h-3 w-3 text-[#78746C]" />
                    <span>
                      {(volumeMetric === 'orders'
                        ? preview.totalsAfter.annualOrdersUnits
                        : preview.totalsAfter.annualBuyoutsUnits
                      ).toLocaleString('ru-RU')}{' '}
                      {unitWord}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5C5953] dark:text-[#9E9A92] mt-0.5">
                    Заказов: {preview.totalsAfter.annualOrdersUnits.toLocaleString('ru-RU')} {unitWord}
                  </div>
                </div>
              </div>

              {/* Предупреждения о несопоставленных строках, дублях или правах */}
              {(preview.unmatchedRows.length > 0 ||
                preview.skippedNoPermissionCount > 0 ||
                preview.duplicateRowsSkipped > 0) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-[12px] text-amber-900 dark:text-amber-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-2 font-medium">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>
                        {preview.unmatchedRows.length > 0 &&
                          `Не сопоставлено строк: ${preview.unmatchedRows.length}. `}
                        {preview.duplicateRowsSkipped > 0 &&
                          `Объединено дублей SKU (взята последняя строка): ${preview.duplicateRowsSkipped}. `}
                        {preview.skippedNoPermissionCount > 0 &&
                          `Пропущено из-за прав доступа к бренду: ${preview.skippedNoPermissionCount}.`}
                      </span>
                    </div>
                    {preview.unmatchedRows.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowUnmatchedDetails((v) => !v)}
                        className="underline font-medium cursor-pointer"
                      >
                        {showUnmatchedDetails ? 'Скрыть список' : 'Показать строки'}
                      </button>
                    )}
                  </div>
                  {showUnmatchedDetails && preview.unmatchedRows.length > 0 && (
                    <div className="max-h-28 overflow-y-auto text-[11.5px] font-mono space-y-0.5 pt-1 border-t border-amber-200/70">
                      {preview.unmatchedRows.slice(0, 30).map((u) => (
                        <div key={`${u.rowNumber}-${u.label}`}>
                          Стр. {u.rowNumber}: {u.label} — {u.reason}
                        </div>
                      ))}
                      {preview.unmatchedRows.length > 30 && (
                        <div>… и ещё {preview.unmatchedRows.length - 30} строк</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Таблица превью изменений */}
              {preview.previewDiffRows.length > 0 ? (
                <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] overflow-hidden">
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead className="sticky top-0 bg-[#FAF9F6] dark:bg-[#1D1C1A] border-b border-[#E4E1DA] dark:border-[#282724] text-[10.5px] font-semibold uppercase tracking-wider text-[#78746C] dark:text-[#9E9A92]">
                        <tr>
                          <th className="py-2 px-3">Артикул / SKU</th>
                          <th className="py-2 px-3 text-right">Цена (было → стало)</th>
                          {hasCost && (
                            <th className="py-2 px-3 text-right">Себест. (было → стало)</th>
                          )}
                          <th className="py-2 px-3 text-right">План год (было → стало)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFECE6] dark:divide-[#282724]">
                        {preview.previewDiffRows.slice(0, 80).map((row) => {
                          const priceChanged = Math.abs(row.priceAfter - row.priceBefore) > 0.005;
                          const costChanged = Math.abs(row.costAfter - row.costBefore) > 0.005;
                          const unitsChanged =
                            row.annualUnitsAfter !== row.annualUnitsBefore ||
                            row.changedMonthsCount > 0;
                          return (
                            <tr
                              key={row.key}
                              className="hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A]/60"
                            >
                              <td className="py-2 px-3">
                                <div className="font-semibold text-[#141413] dark:text-[#F5F4F0] flex items-center gap-1.5">
                                  <span>{row.skuLabel}</span>
                                  {row.sellerSkuFixed && (
                                    <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[10px] font-mono">
                                      артикул заполнен
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[#78746C] dark:text-[#9E9A92]">
                                  {row.parentCode} · {row.subLabel}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right font-display-num whitespace-nowrap">
                                {priceChanged ? (
                                  <>
                                    <span className="text-[#78746C] line-through mr-1.5">
                                      {fmtRub(row.priceBefore)}
                                    </span>
                                    <span className="font-semibold text-[#141413] dark:text-[#F5F4F0]">
                                      {fmtRub(row.priceAfter)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[#78746C]">{fmtRub(row.priceBefore)}</span>
                                )}
                              </td>
                              {hasCost && (
                                <td className="py-2 px-3 text-right font-display-num whitespace-nowrap">
                                  {costChanged ? (
                                    <>
                                      <span className="text-[#78746C] line-through mr-1.5">
                                        {fmtRub(row.costBefore)}
                                      </span>
                                      <span className="font-semibold text-[#141413] dark:text-[#F5F4F0]">
                                        {fmtRub(row.costAfter)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-[#78746C]">{fmtRub(row.costBefore)}</span>
                                  )}
                                </td>
                              )}
                              <td className="py-2 px-3 text-right font-display-num whitespace-nowrap">
                                {unitsChanged ? (
                                  <>
                                    <span className="text-[#78746C] line-through mr-1.5">
                                      {row.annualUnitsBefore.toLocaleString('ru-RU')}
                                    </span>
                                    <span className="font-semibold text-[#15803D] dark:text-emerald-400">
                                      {row.annualUnitsAfter.toLocaleString('ru-RU')}
                                    </span>
                                    <span className="text-[10.5px] text-[#78746C] ml-1">
                                      ({row.changedMonthsCount} мес.)
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[#78746C]">
                                    {row.annualUnitsBefore.toLocaleString('ru-RU')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {preview.previewDiffRows.length > 80 && (
                    <div className="px-3 py-2 bg-[#FAF9F6] dark:bg-[#1D1C1A] border-t border-[#E4E1DA] dark:border-[#282724] text-[11.5px] text-[#5C5953] dark:text-[#9E9A92]">
                      Показаны первые 80 из {preview.previewDiffRows.length} изменённых позиций — при нажатии «Применить» обновятся все {preview.previewDiffRows.length}.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-4 text-center text-[12.5px] text-[#5C5953] dark:text-[#9E9A92]">
                  {preview.matchedRowsCount > 0
                    ? 'Все значения в файле совпадают с текущими данными платформы — изменений для применения нет.'
                    : 'Совпадающих SKU не найдено. Проверьте выбранный режим (269 размеров LISKANI или Карточки бренда).'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Подвал с кнопками */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#181715] flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11.5px] text-[#78746C] dark:text-[#9E9A92]">
            Изменения автоматически пересчитают карточки, закупки, P&amp;L и сохранятся в облако.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] hover:bg-[#EFECE6] dark:hover:bg-[#282724] text-[12.5px] font-medium text-[#141413] dark:text-[#F5F4F0] cursor-pointer transition-colors"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!preview || preview.changedSkusCount === 0}
              onClick={handleApply}
              className="h-9 px-4 rounded-lg bg-[#141413] hover:bg-[#282724] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-[#F5F4F0] dark:hover:bg-[#E4E1DA] text-white dark:text-[#141413] text-[12.5px] font-medium cursor-pointer transition-colors"
            >
              {preview && preview.changedSkusCount > 0
                ? `Применить изменения (${preview.changedSkusCount} SKU)`
                : 'Применить изменения'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
