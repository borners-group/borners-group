'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  Lock,
  Plus,
  RotateCcw,
  Split,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import {
  canUserEditBrand,
  canUserViewCostPrice,
  canUserViewFinance,
} from '@/lib/finance';
import type { GrowthScenarioDef, ScenarioModelSpec } from '@/lib/scenarioData';
import {
  BRAND_UNIT_CONFIGS,
  type CanonicalBrandCode,
  getScenariosForBrand,
  normalizePortfolioBrandCode,
} from '@/lib/unifiedBusinessEngine';
import {
  type ChronologicalCashEvent,
  type CustomCashOperationRecord,
  type OperationPaymentStatus,
  type PaymentTrancheSpec,
  addDaysToIsoDate,
  formatIsoDateHumanRu,
} from '@/lib/investmentScheduleEngine';
import { useInvestmentSchedule } from '@/lib/useInvestmentSchedule';

function fmtMln(valRub: number): string {
  const abs = Math.abs(valRub);
  if (abs === 0) return '0,00 млн ₽';
  if (abs < 100_000) {
    return `${Math.round(valRub).toLocaleString('ru-RU')} ₽`;
  }
  const sign = valRub < 0 ? '−' : '';
  return `${sign}${(abs / 1_000_000).toFixed(2).replace('.', ',')} млн ₽`;
}

function fmtRub(valRub: number): string {
  return `${Math.round(valRub).toLocaleString('ru-RU')} ₽`;
}

function shiftIsoDateToNextMonth(dateIso: string, targetYear = 2027): string {
  const m = (dateIso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return `${targetYear}-02-15`;
  let yr = Number(m[1]);
  let mo = Number(m[2]); // 1..12
  const day = Math.min(28, Math.max(1, Number(m[3])));
  if (yr < targetYear) {
    // Для предоплат Q1 конца 2026 года перенос на следующий месяц в календаре 2027 переводит платёж в Февраль 2027
    yr = targetYear;
    mo = 2;
  } else {
    mo += 1;
    if (mo > 12) {
      mo = 12;
    }
  }
  return `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface InvestmentSchedulePanelProps {
  models: ScenarioModelSpec[];
  scenarios: GrowthScenarioDef[];
  activeScenario: GrowthScenarioDef;
  brandFilter: string;
  selectedScenarioByBrand?: Partial<Record<CanonicalBrandCode | 'LISCANI', number | null>>;
  includeGroupPortfolioInS1?: boolean;
  onSelectBrandFilter?: (brand: string) => void;
  onSelectScenarioId?: (scenarioId: number, brandOverride?: string) => void;
  onOpenBatchInProcurement?: (modelId: string, brandCode?: CanonicalBrandCode) => void;
  initialFocusOpKey?: string | null;
  initialExpandedMonthIdx?: number | null;
  isModal?: boolean;
  onCloseModal?: () => void;
}

const BRAND_PILLS: { code: 'ALL' | CanonicalBrandCode; label: string }[] = [
  { code: 'ALL', label: 'BORNERS GROUP (Все 5)' },
  { code: 'BORNERS', label: 'BORNERS' },
  { code: 'FUKAI', label: 'FUKAI' },
  { code: 'AKUSHA', label: 'AKUSHA' },
  { code: 'LISKANI', label: 'LISCANI' },
  { code: 'NA_TELE', label: 'НА ТЕЛЕ' },
];

export function InvestmentSchedulePanel({
  models,
  scenarios,
  activeScenario,
  brandFilter,
  selectedScenarioByBrand,
  includeGroupPortfolioInS1,
  onSelectBrandFilter,
  onSelectScenarioId,
  onOpenBatchInProcurement,
  initialFocusOpKey,
  initialExpandedMonthIdx,
  isModal = false,
  onCloseModal,
}: InvestmentSchedulePanelProps) {
  const { currentUser, navigateTo } = usePlatform();
  const hasFinance = canUserViewFinance(currentUser);
  const hasCost = canUserViewCostPrice(currentUser);
  const authorName = currentUser?.fullName || 'Владелец';

  const normBrand =
    !brandFilter || brandFilter === 'ALL' ? 'ALL' : normalizePortfolioBrandCode(brandFilter);
  const canEdit =
    hasFinance &&
    hasCost &&
    (normBrand === 'ALL'
      ? (['BORNERS', 'FUKAI', 'AKUSHA', 'LISKANI', 'NA_TELE'] as const).some((c) =>
          canUserEditBrand(currentUser, c)
        )
      : canUserEditBrand(currentUser, normBrand));

  const {
    ledgerState,
    schedule,
    resetPreview,
    updateGlobalSettings,
    updatePaymentOperation,
    updateBatchTerms,
    undoOperationOverride,
    saveCapitalInjection,
    removeCapitalInjection,
    saveCustomCashOperation,
    removeCustomCashOperation,
    confirmResetToAutoPlan,
  } = useInvestmentSchedule({
    models,
    scenarios,
    activeScenario,
    brandFilter: normBrand,
    selectedScenarioByBrand,
    includeGroupPortfolioInS1,
  });

  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(() => {
    const init = new Set<number>();
    if (typeof initialExpandedMonthIdx === 'number' && initialExpandedMonthIdx >= 0) {
      init.add(initialExpandedMonthIdx);
    }
    return init;
  });

  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [showAddInvestmentForm, setShowAddInvestmentForm] = useState(false);
  const [showAddOperationForm, setShowAddOperationForm] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showResetPreviewModal, setShowResetPreviewModal] = useState(false);

  // Поля формы добавления собственной инвестиции
  const [injDateIso, setInjDateIso] = useState(`${schedule.scenarioYear}-01-10`);
  const [injAmountMln, setInjAmountMln] = useState('5');
  const [injTitle, setInjTitle] = useState('Собственный вклад учредителя на оборот');
  const [injStatus, setInjStatus] = useState<OperationPaymentStatus>('Запланировано');

  // Поля формы добавления планового расхода / операции
  const [opKind, setOpKind] = useState<'expense' | 'inflow'>('expense');
  const [opCategory, setOpCategory] =
    useState<CustomCashOperationRecord['category']>('opex');
  const [opDateIso, setOpDateIso] = useState(`${schedule.scenarioYear}-02-10`);
  const [opAmountMln, setOpAmountMln] = useState('1.5');
  const [opTitle, setOpTitle] = useState('Операционные расходы / ФОТ и склад');
  const [opSupplier, setOpSupplier] = useState('');
  const [opBatchKey, setOpBatchKey] = useState('');
  const [opStatus, setOpStatus] = useState<OperationPaymentStatus>('Запланировано');

  // Локальные черновики инспектора выбранной операции
  const selectedEvent: ChronologicalCashEvent | null = useMemo(() => {
    if (!selectedOpId) return null;
    return (
      schedule.allEvents.find((e) => e.id === selectedOpId || e.opKey === selectedOpId) ||
      null
    );
  }, [schedule.allEvents, selectedOpId]);

  const [editDateIso, setEditDateIso] = useState('');
  const [editAmountRub, setEditAmountRub] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editStatus, setEditStatus] = useState<OperationPaymentStatus>('Запланировано');
  const [editPrepayPct, setEditPrepayPct] = useState('30');
  const [editArrivalDateIso, setEditArrivalDateIso] = useState('');
  const [lockedEditConfirmed, setLockedEditConfirmed] = useState(false);
  const [splitModeOpen, setSplitModeOpen] = useState(false);
  const [splitDrafts, setSplitDrafts] = useState<PaymentTrancheSpec[]>([]);

  useEffect(() => {
    if (initialFocusOpKey) {
      const targetEv = schedule.allEvents.find(
        (e) => e.opKey === initialFocusOpKey || e.id === initialFocusOpKey
      );
      if (targetEv) {
        setExpandedMonths((prev) => new Set(prev).add(targetEv.calendarMonthIdx));
        setSelectedOpId(targetEv.id);
      }
    }
  }, [initialFocusOpKey, schedule.allEvents]);

  useEffect(() => {
    if (!selectedEvent) return;
    setEditDateIso(selectedEvent.dateIso);
    setEditAmountRub(String(selectedEvent.amountRub));
    setEditSupplier(
      selectedEvent.factoryName || selectedEvent.batchDetails?.factoryName || ''
    );
    setEditStatus(selectedEvent.status);
    setEditPrepayPct(String(selectedEvent.batchDetails?.prepaymentPct ?? 30));
    setEditArrivalDateIso(selectedEvent.batchDetails?.arrivalDateIso || '');
    setLockedEditConfirmed(false);
    setSplitModeOpen(false);
    const half1 = Math.round(selectedEvent.amountRub * 0.5);
    const half2 = Math.max(0, selectedEvent.amountRub - half1);
    setSplitDrafts([
      {
        id: 'tr-1',
        dateIso: selectedEvent.dateIso,
        amountRub: half1,
        label: 'Транш 1 (50%)',
        status: selectedEvent.status,
      },
      {
        id: 'tr-2',
        dateIso: addDaysToIsoDate(selectedEvent.dateIso, 21),
        amountRub: half2,
        label: 'Транш 2 (50%)',
        status: selectedEvent.status,
      },
    ]);
  }, [selectedEvent]);

  const availableBrandScenarios = useMemo(() => {
    if (normBrand === 'ALL') return [];
    return getScenariosForBrand(scenarios, normBrand, { onlyExplicitForNewBrands: false });
  }, [scenarios, normBrand]);

  const toggleMonthExpand = (mIdx: number) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(mIdx)) next.delete(mIdx);
      else next.add(mIdx);
      return next;
    });
  };

  const expandOrCollapseAll = () => {
    if (expandedMonths.size >= 6) {
      setExpandedMonths(new Set());
    } else {
      setExpandedMonths(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    }
  };

  const handleJumpToProcurementBatch = (
    modelId: string,
    brandCode?: CanonicalBrandCode
  ) => {
    if (onOpenBatchInProcurement) {
      onOpenBatchInProcurement(modelId, brandCode);
      if (onCloseModal) onCloseModal();
      return;
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('borners_procurement_subtab_v1', 'batches');
        window.localStorage.setItem('borners_procurement_selected_sku_v1', modelId);
        window.sessionStorage.setItem('borners_focus_procurement_sku_id', modelId);
      } catch {
        // ignore
      }
    }
    navigateTo(
      'roadmap-tasks',
      brandCode ? { brandId: brandCode } : undefined
    );
    if (onCloseModal) onCloseModal();
  };

  if (!hasFinance || !hasCost) {
    return (
      <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] p-6 text-center space-y-1.5">
        <div className="text-[14px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
          График инвестиций и движения денег ограничен правами роли
        </div>
        <p className="text-xs text-[#5C5953] dark:text-[#9A968E]">
          Для просмотра дат платежей фабрикам, реинвестирования с WB и потребности в капитале требуются права на финансы и себестоимость.
        </p>
      </div>
    );
  }

  const initialCashMlnValue =
    Math.round((schedule.initialCashRub / 1_000_000) * 100) / 100;
  const reserveMlnValue =
    Math.round((schedule.minCashReserveRub / 1_000_000) * 100) / 100;

  const wbDelaySelectValue = !schedule.wbPayoutScheduleSpecified
    ? 'unset'
    : String(schedule.wbPayoutDelayDays);

  return (
    <div
      data-testid="investment-schedule-root"
      className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] shadow-[0_1px_2px_rgba(20,20,19,0.04)] overflow-hidden"
    >
      {/* 1. ШАПКА КАЛЕНДАРЯ + ПЕРЕКЛЮЧАТЕЛЬ БРЕНДОВ И СЦЕНАРИЕВ */}
      <div className="border-b border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] px-5 py-4 space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#141413] dark:text-[#F5F4F0]">
                <Calendar className="h-3 w-3 text-[#15803D]" />
                <span>График инвестиций и движения денег · {schedule.scenarioYear}</span>
              </span>
              {schedule.manualOverridesCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/12 border border-amber-500/30 text-amber-800 dark:text-amber-300 font-mono text-[10.5px] font-semibold">
                  Ручных корректировок: {schedule.manualOverridesCount}
                </span>
              )}
              {schedule.lockedOperationsCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-[#15803D] dark:text-emerald-400 font-mono text-[10.5px] font-semibold">
                  <Lock className="h-2.5 w-2.5" />
                  <span>Защищено (Утв./Опл.): {schedule.lockedOperationsCount}</span>
                </span>
              )}
            </div>
            <h2 className="mt-1.5 text-[17px] sm:text-[18px] font-semibold tracking-[-0.015em] text-[#141413] dark:text-[#F5F4F0]">
              Когда, сколько и на какие закупки вложить деньги с учётом реинвестирования от WB
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <button
                  type="button"
                  data-testid="inv-add-capital-btn"
                  onClick={() => {
                    setShowAddInvestmentForm((v) => !v);
                    setShowAddOperationForm(false);
                  }}
                  className="h-8 px-3 rounded-lg bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Инвестиция</span>
                </button>
                <button
                  type="button"
                  data-testid="inv-add-expense-btn"
                  onClick={() => {
                    setShowAddOperationForm((v) => !v);
                    setShowAddInvestmentForm(false);
                  }}
                  className="h-8 px-3 rounded-lg bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#EFECE6] dark:hover:bg-[#282724] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-[#5C5953]" />
                  <span>+ Плановая операция</span>
                </button>
                <button
                  type="button"
                  data-testid="inv-reset-plan-btn"
                  disabled={resetPreview.willResetCount === 0}
                  onClick={() => setShowResetPreviewModal(true)}
                  className="h-8 px-3 rounded-lg bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#EFECE6] disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-[#5C5953]" />
                  <span>Вернуть расчёт по плану</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowHistoryDrawer((v) => !v)}
              className="h-8 px-2.5 rounded-lg bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413] text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <History className="h-3.5 w-3.5" />
              <span>История ({ledgerState.auditHistory.length})</span>
            </button>
            {isModal && onCloseModal && (
              <button
                type="button"
                aria-label="Закрыть график инвестиций"
                onClick={onCloseModal}
                className="h-8 w-8 rounded-lg bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] text-[#141413] dark:text-[#F5F4F0] inline-flex items-center justify-center cursor-pointer hover:bg-[#EFECE6]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Переключатель брендов и сценариев + исходные параметры капитала, резерва и сроков WB */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E4E1DA] dark:border-[#282724]">
          <div className="flex flex-wrap items-center gap-2">
            {onSelectBrandFilter && (
              <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-white dark:bg-[#151514] p-0.5 border border-[#E4E1DA] dark:border-[#282724]">
                {BRAND_PILLS.map((bp) => {
                  const isAct = normBrand === bp.code;
                  return (
                    <button
                      key={bp.code}
                      type="button"
                      onClick={() => onSelectBrandFilter(bp.code)}
                      className={`h-7 px-2.5 rounded-md text-[11.5px] font-medium cursor-pointer transition-colors ${
                        isAct
                          ? 'bg-[#141413] dark:bg-[#F5F4F0] text-white dark:text-[#141413]'
                          : 'text-[#5C5953] dark:text-[#9A968E] hover:text-[#141413]'
                      }`}
                    >
                      {bp.label}
                    </button>
                  );
                })}
              </div>
            )}

            {normBrand !== 'ALL' &&
              onSelectScenarioId &&
              availableBrandScenarios.length > 0 && (
                <select
                  aria-label="Сценарий продаж для расчёта инвестиций"
                  data-testid="inv-scenario-select"
                  value={activeScenario.id}
                  onChange={(e) =>
                    onSelectScenarioId(Number(e.target.value), normBrand)
                  }
                  className="h-8 px-2.5 rounded-lg bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] text-xs font-medium text-[#141413] dark:text-[#F5F4F0]"
                >
                  {availableBrandScenarios.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.title} ({sc.monthlyTargetMln} млн ₽/мес)
                    </option>
                  ))}
                </select>
              )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <label className="inline-flex items-center gap-1.5 text-[#5C5953] dark:text-[#9A968E]">
              <span>Капитал на старте:</span>
              <input
                type="number"
                min={0}
                step={0.5}
                disabled={!canEdit}
                aria-label="Первоначальный собственный капитал, млн ₽"
                data-testid="inv-initial-capital-input"
                value={initialCashMlnValue}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  updateGlobalSettings(
                    { initialCashRub: Math.round(val * 1_000_000) },
                    authorName
                  );
                }}
                className="w-20 h-7 px-2 rounded-md border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono font-semibold text-[#141413] dark:text-[#F5F4F0] text-right"
              />
              <span className="font-mono text-[11px]">млн ₽</span>
            </label>

            <label className="inline-flex items-center gap-1.5 text-[#5C5953] dark:text-[#9A968E]">
              <span>Неснижаемый резерв:</span>
              <input
                type="number"
                min={0}
                step={0.5}
                disabled={!canEdit}
                aria-label="Неснижаемый денежный резерв, млн ₽"
                data-testid="inv-min-reserve-input"
                value={reserveMlnValue}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  updateGlobalSettings(
                    { minCashReserveRub: Math.round(val * 1_000_000) },
                    authorName
                  );
                }}
                className="w-20 h-7 px-2 rounded-md border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono font-semibold text-[#141413] dark:text-[#F5F4F0] text-right"
              />
              <span className="font-mono text-[11px]">млн ₽</span>
            </label>

            <label className="inline-flex items-center gap-1.5 text-[#5C5953] dark:text-[#9A968E]">
              <span>Получение денег WB:</span>
              <select
                disabled={!canEdit}
                aria-label="Срок получения денег от WB"
                data-testid="inv-wb-delay-select"
                value={wbDelaySelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'unset') {
                    updateGlobalSettings(
                      { wbPayoutScheduleSpecified: false },
                      authorName
                    );
                  } else {
                    updateGlobalSettings(
                      {
                        wbPayoutScheduleSpecified: true,
                        wbPayoutDelayDays: Math.max(0, Number(v) || 0),
                      },
                      authorName
                    );
                  }
                }}
                className="h-7 px-2 rounded-md border border-[#E4E1DA] dark:border-[#282724] bg-white dark:bg-[#151514] font-mono text-[11.5px] font-semibold text-[#141413] dark:text-[#F5F4F0]"
              >
                <option value="0">0 дн. (15 и 30 числа)</option>
                <option value="7">Через 7 дней</option>
                <option value="14">Через 14 дней</option>
                <option value="21">Через 21 день</option>
                <option value="30">Через 30 дней (+1 мес.)</option>
                <option value="45">Через 45 дней</option>
                <option value="60">Через 60 дней (+2 мес.)</option>
                <option value="unset">Не задан (предупреждение)</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* 2. ЧЕСТНЫЕ ПРЕДУПРЕЖДЕНИЯ О ДАННЫХ, НЕХВАТКЕ ДЕНЕГ И РИСКЕ ДЕФИЦИТА ТОВАРА */}
        {schedule.dataWarnings.length > 0 && (
          <div className="space-y-2">
            {schedule.dataWarnings.map((w, i) => (
              <div
                key={`${w.code}-${i}`}
                className={`rounded-lg border px-3.5 py-2.5 flex items-start gap-2.5 text-xs ${
                  w.severity === 'danger'
                    ? 'bg-rose-500/8 border-rose-500/30 text-rose-900 dark:text-rose-200'
                    : 'bg-amber-500/8 border-amber-500/30 text-amber-950 dark:text-amber-200'
                }`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">{w.title}</div>
                  <div className="opacity-90 mt-0.5">{w.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. ОТВЕТЫ НА 5 ГЛАВНЫХ ВОПРОСОВ (РАЗДЕЛ 10) + 4 ПОКАЗАТЕЛЯ РЕИНВЕСТИРОВАНИЯ (РАЗДЕЛ 6) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 space-y-1">
            <div className="text-[11px] font-medium text-[#5C5953] dark:text-[#9A968E]">
              1. Всего уйдёт на закупки
            </div>
            <div className="font-mono text-lg font-semibold text-[#141413] dark:text-[#F5F4F0] tabular-nums">
              {fmtMln(schedule.totalProcurementCostRub)}
            </div>
            <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
              Партий: <strong>{schedule.batchesTotalCount}</strong> · Утв.:{' '}
              {fmtMln(schedule.approvedProcurementCostRub)}
            </div>
          </div>

          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 space-y-1">
            <div className="text-[11px] font-medium text-[#5C5953] dark:text-[#9A968E]">
              2. Вернётся от продаж WB на счёт
            </div>
            <div className="font-mono text-lg font-semibold text-[#141413] dark:text-[#F5F4F0] tabular-nums">
              {schedule.wbPayoutScheduleSpecified
                ? fmtMln(schedule.totalWbCashInflowRub)
                : 'Лаг WB не задан'}
            </div>
            <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
              Выручка: {fmtMln(schedule.totalGrossSalesRevenueRub)} · Прибыль:{' '}
              {fmtMln(schedule.totalAccrualOperatingProfitRub)}
            </div>
          </div>

          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 space-y-1">
            <div className="text-[11px] font-medium text-[#5C5953] dark:text-[#9A968E]">
              3. Реинвестирование из продаж
            </div>
            <div
              data-testid="inv-reinvested-value"
              className="font-mono text-lg font-semibold text-[#15803D] dark:text-emerald-400 tabular-nums"
            >
              {schedule.reinvestedFromSalesRub !== null
                ? `${fmtMln(schedule.reinvestedFromSalesRub)} (${schedule.reinvestedSharePct}%)`
                : 'Требуется срок WB'}
            </div>
            <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
              Профинансировано партий:{' '}
              <strong className="text-[#141413] dark:text-[#F5F4F0]">
                {schedule.batchesFundedBySalesCount} из {schedule.batchesTotalCount}
              </strong>
            </div>
          </div>

          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 space-y-1">
            <div className="text-[11px] font-medium text-[#5C5953] dark:text-[#9A968E]">
              4. Уже вложено / Запланировано своих
            </div>
            <div className="font-mono text-lg font-semibold text-[#141413] dark:text-[#F5F4F0] tabular-nums">
              {fmtMln(schedule.alreadyInvestedOwnMoneyRub + schedule.plannedUserInjectionsRub)}
            </div>
            <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
              Факт/Утв.: <strong>{fmtMln(schedule.alreadyInvestedOwnMoneyRub)}</strong>
              {schedule.plannedUserInjectionsRub > 0
                ? ` · План: +${fmtMln(schedule.plannedUserInjectionsRub)}`
                : ''}
            </div>
          </div>

          <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-3.5 space-y-1">
            <div className="text-[11px] font-medium text-[#5C5953] dark:text-[#9A968E]">
              5. Ещё потребуется вложить (Пик)
            </div>
            <div
              data-testid="inv-still-needed-value"
              className={`font-mono text-lg font-semibold tabular-nums ${
                schedule.additionalOwnMoneyStillNeededRub &&
                schedule.additionalOwnMoneyStillNeededRub > 0
                  ? 'text-[#B91C1C] dark:text-rose-400'
                  : 'text-[#15803D] dark:text-emerald-400'
              }`}
            >
              {schedule.additionalOwnMoneyStillNeededRub === null
                ? 'Не задан срок WB'
                : schedule.additionalOwnMoneyStillNeededRub > 0
                ? fmtMln(schedule.additionalOwnMoneyStillNeededRub)
                : '0 ₽ · Денег достаточно'}
            </div>
            <div className="text-[11px] text-[#5C5953] dark:text-[#9A968E]">
              {!schedule.wbPayoutScheduleSpecified ? (
                <span>Укажите срок выплат WB</span>
              ) : schedule.isAddedCapitalSufficientForSubsequentPayments ? (
                <span className="text-[#15803D] dark:text-emerald-400 font-medium">
                  ✓ Хватает на все последующие платежи
                </span>
              ) : (
                <span>
                  Пик нехватки:{' '}
                  <strong className="text-[#141413] dark:text-[#F5F4F0]">
                    {schedule.peakShortageDateHumanRu || 'Старт Q1'}
                  </strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Конкретные даты, когда нужно вложить собственные деньги (Пункт 5 Раздела 10 ТЗ) */}
        {schedule.wbPayoutScheduleSpecified &&
          schedule.datesRequiringOwnInjection.length > 0 && (
            <div className="rounded-lg border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6]/70 dark:bg-[#1D1C1A]/70 px-3.5 py-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[#141413] dark:text-[#F5F4F0]">
                Точные даты собственных вложений ({schedule.datesRequiringOwnInjection.length}):
              </span>
              {schedule.datesRequiringOwnInjection.slice(0, 6).map((dt) => (
                <span
                  key={dt.dateIso}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] font-mono text-[11px]"
                >
                  <strong className="text-[#141413] dark:text-[#F5F4F0]">
                    {dt.dateHumanRu}:
                  </strong>
                  <span className="text-[#B91C1C] dark:text-rose-400 font-semibold">
                    +{fmtMln(dt.amountRub)}
                  </span>
                </span>
              ))}
              {schedule.datesRequiringOwnInjection.length > 6 && (
                <span className="text-[#5C5953]">
                  и ещё {schedule.datesRequiringOwnInjection.length - 6} дат в таблице ниже
                </span>
              )}
            </div>
          )}

        {/* ФОРМА ДОБАВЛЕНИЯ СОБСТВЕННОЙ ИНВЕСТИЦИИ С ДАТОЙ (ТЕСТ 4 ТЗ) */}
        {showAddInvestmentForm && canEdit && (
          <div
            data-testid="inv-add-capital-form"
            className="rounded-xl border border-[#141413]/25 dark:border-[#F5F4F0]/25 bg-[#FAF9F6] dark:bg-[#1D1C1A] p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#141413] dark:text-[#F5F4F0]">
                Добавить собственную инвестицию с указанием даты
              </div>
              <button
                type="button"
                onClick={() => setShowAddInvestmentForm(false)}
                className="text-xs text-[#5C5953] hover:text-[#141413] cursor-pointer"
              >
                Закрыть ×
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <label className="space-y-1">
                <span className="text-[#5C5953]">Дата вложения</span>
                <input
                  type="date"
                  data-testid="inv-new-cap-date"
                  value={injDateIso}
                  onChange={(e) => setInjDateIso(e.target.value)}
                  className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white font-mono text-[#141413]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[#5C5953]">Сумма вложения (млн ₽)</span>
                <input
                  type="number"
                  min={0.05}
                  step={0.5}
                  data-testid="inv-new-cap-amount-mln"
                  value={injAmountMln}
                  onChange={(e) => setInjAmountMln(e.target.value)}
                  className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white font-mono font-semibold text-[#141413]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[#5C5953]">Статус (План / Факт)</span>
                <select
                  value={injStatus}
                  onChange={(e) => setInjStatus(e.target.value as OperationPaymentStatus)}
                  className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                >
                  <option value="Запланировано">Запланировано (в сценарии)</option>
                  <option value="Утверждено">Утверждено (общее)</option>
                  <option value="Оплачено">Оплачено / Внесено (факт)</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[#5C5953]">Комментарий / источник</span>
                <input
                  type="text"
                  value={injTitle}
                  onChange={(e) => setInjTitle(e.target.value)}
                  className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                data-testid="inv-submit-cap-btn"
                onClick={() => {
                  const rub = Math.round((Number(injAmountMln) || 0) * 1_000_000);
                  if (rub <= 0 || !injDateIso) return;
                  saveCapitalInjection(
                    {
                      id: `inj-${Date.now()}`,
                      dateIso: injDateIso,
                      amountRub: rub,
                      title: injTitle.trim() || 'Собственная инвестиция',
                      status: injStatus,
                      brandCode: normBrand,
                    },
                    schedule.activeScopeKey,
                    authorName
                  );
                  setShowAddInvestmentForm(false);
                }}
                className="h-8 px-4 rounded-lg bg-[#141413] text-white text-xs font-medium cursor-pointer"
              >
                Сохранить инвестицию
              </button>
            </div>
          </div>
        )}

        {/* ФОРМА ДОБАВЛЕНИЯ ПРОЧЕГО РАСХОДА ИЛИ ПЛАНОВОЙ ОПЕРАЦИИ */}
        {showAddOperationForm && canEdit && (
          <div className="rounded-xl border border-[#141413]/25 dark:border-[#F5F4F0]/25 bg-[#FAF9F6] dark:bg-[#1D1C1A] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#141413] dark:text-[#F5F4F0]">
                Добавить плановый расход или денежную операцию
              </div>
              <button
                type="button"
                onClick={() => setShowAddOperationForm(false)}
                className="text-xs text-[#5C5953] hover:text-[#141413] cursor-pointer"
              >
                Закрыть ×
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              <label className="space-y-1">
                <span className="text-[#5C5953]">Тип</span>
                <select
                  value={opKind}
                  onChange={(e) => {
                    const nextK = e.target.value as 'expense' | 'inflow';
                    setOpKind(nextK);
                    if (nextK === 'inflow') setOpCategory('other_inflow');
                    else setOpCategory('opex');
                  }}
                  className="w-full h-8.5 px-2 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                >
                  <option value="expense">Денежный расход (−)</option>
                  <option value="inflow">Прочее поступление (+)</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[#5C5953]">Статья</span>
                <select
                  value={opCategory}
                  onChange={(e) =>
                    setOpCategory(e.target.value as CustomCashOperationRecord['category'])
                  }
                  className="w-full h-8.5 px-2 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                >
                  <option value="opex">OPEX / Аренда / ФОТ</option>
                  <option value="tax">Налоги и взносы</option>
                  <option value="logistics_customs">Карго / Таможня / Логистика</option>
                  <option value="marketing_ext">Внешний маркетинг / Съёмки</option>
                  <option value="factory_extra">Доп. платёж фабрике по партии</option>
                  <option value="other_inflow">Прочее поступление (B2B / возврат)</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[#5C5953]">Дата</span>
                <input
                  type="date"
                  value={opDateIso}
                  onChange={(e) => setOpDateIso(e.target.value)}
                  className="w-full h-8.5 px-2 rounded-lg border border-[#E4E1DA] bg-white font-mono text-[#141413]"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[#5C5953]">Сумма (млн ₽)</span>
                <input
                  type="number"
                  min={0.01}
                  step={0.25}
                  value={opAmountMln}
                  onChange={(e) => setOpAmountMln(e.target.value)}
                  className="w-full h-8.5 px-2 rounded-lg border border-[#E4E1DA] bg-white font-mono font-semibold text-[#141413]"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[#5C5953]">Закупочная партия (необяз.)</span>
                <select
                  value={opBatchKey}
                  onChange={(e) => {
                    setOpBatchKey(e.target.value);
                    const b = schedule.batchesCatalog.find(
                      (x) => x.batchKey === e.target.value
                    );
                    if (b && !opSupplier) setOpSupplier(b.factoryName);
                  }}
                  className="w-full h-8.5 px-2 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                >
                  <option value="">Без привязки к партии</option>
                  {schedule.batchesCatalog.map((b) => (
                    <option key={b.batchKey} value={b.batchKey}>
                      {b.modelCode} · {b.coverageMonthsLabel} ({fmtMln(b.totalBatchCostRub)})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[#5C5953]">Статус</span>
                <select
                  value={opStatus}
                  onChange={(e) => setOpStatus(e.target.value as OperationPaymentStatus)}
                  className="w-full h-8.5 px-2 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                >
                  <option value="Запланировано">Запланировано</option>
                  <option value="Утверждено">Утверждено</option>
                  <option value="Оплачено">Оплачено</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <label className="space-y-1">
                <span className="text-[#5C5953]">Назначение операции</span>
                <input
                  type="text"
                  value={opTitle}
                  onChange={(e) => setOpTitle(e.target.value)}
                  className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[#5C5953]">Поставщик / контрагент</span>
                <input
                  type="text"
                  list="inv-suppliers-datalist"
                  value={opSupplier}
                  onChange={(e) => setOpSupplier(e.target.value)}
                  placeholder="Выберите фабрику или введите контрагента"
                  className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                />
                <datalist id="inv-suppliers-datalist">
                  {schedule.availableSuppliers.map((sup) => (
                    <option key={sup} value={sup} />
                  ))}
                </datalist>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const rub = Math.round((Number(opAmountMln) || 0) * 1_000_000);
                  if (rub <= 0 || !opDateIso) return;
                  saveCustomCashOperation(
                    {
                      id: `op-${Date.now()}`,
                      kind: opKind,
                      category: opCategory,
                      dateIso: opDateIso,
                      amountRub: rub,
                      title: opTitle.trim() || 'Плановая операция',
                      factoryName: opSupplier.trim() || undefined,
                      linkedBatchKey: opBatchKey || undefined,
                      status: opStatus,
                      brandCode: normBrand,
                    },
                    schedule.activeScopeKey,
                    authorName
                  );
                  setShowAddOperationForm(false);
                }}
                className="h-8 px-4 rounded-lg bg-[#141413] text-white text-xs font-medium cursor-pointer"
              >
                Добавить в календарь
              </button>
            </div>
          </div>
        )}

        {/* 4. ТАБЛИЦА КАЛЕНДАРЯ ДВИЖЕНИЯ ДЕНЕГ (6 ОБЯЗАТЕЛЬНЫХ СТОЛБЦОВ РАЗДЕЛА 3 ТЗ) */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C5953] dark:text-[#9A968E]">
            <span>
              Нажмите на любой месяц, чтобы раскрыть операции по конкретным датам, и на любой платёж фабрике — чтобы открыть закупочную партию и изменить условия.
            </span>
            <button
              type="button"
              onClick={expandOrCollapseAll}
              className="font-medium text-[#141413] dark:text-[#F5F4F0] hover:underline cursor-pointer"
            >
              {expandedMonths.size >= 6 ? 'Свернуть все месяцы' : 'Раскрыть все даты'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E4E1DA] dark:border-[#282724]">
            <table
              data-testid="investment-calendar-table"
              className="w-full min-w-[860px] border-collapse text-left text-xs"
            >
              <thead>
                <tr className="bg-[#FAF9F6] dark:bg-[#1D1C1A] border-b border-[#E4E1DA] dark:border-[#282724] text-[11px] uppercase tracking-wider text-[#5C5953] dark:text-[#9A968E]">
                  <th className="py-2.5 px-3.5 font-semibold">Период</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Поступления</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Платежи</th>
                  <th className="py-2.5 px-3 font-semibold text-right text-[#15803D] dark:text-emerald-400">
                    Реинвестирование
                  </th>
                  <th className="py-2.5 px-3 font-semibold text-right text-[#B91C1C] dark:text-rose-400">
                    Нужно вложить
                  </th>
                  <th className="py-2.5 px-3.5 font-semibold text-right">Остаток</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E1DA] dark:divide-[#282724]">
                {schedule.monthlyCalendarRows.map((mRow) => {
                  const isOpen = expandedMonths.has(mRow.monthIdx);
                  return (
                    <React.Fragment key={mRow.monthIdx}>
                      {/* Строка месяца */}
                      <tr
                        data-testid={`inv-month-row-${mRow.monthIdx}`}
                        onClick={() => toggleMonthExpand(mRow.monthIdx)}
                        className={`cursor-pointer transition-colors hover:bg-[#FAF9F6] dark:hover:bg-[#1D1C1A] ${
                          isOpen ? 'bg-[#FAF9F6]/80 dark:bg-[#1D1C1A]/80' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3.5 font-medium text-[#141413] dark:text-[#F5F4F0]">
                          <div className="flex items-center gap-2">
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 text-[#5C5953] shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-[#5C5953] shrink-0" />
                            )}
                            <span>{mRow.periodLabel}</span>
                            <span className="font-mono text-[10.5px] text-[#5C5953] dark:text-[#9A968E]">
                              ({mRow.events.length} опер.)
                            </span>
                            {mRow.hasManualOverrides && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-mono">
                                изм.
                              </span>
                            )}
                            {mRow.hasSupplyDeficit && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10px] font-mono">
                                дефицит SKU
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                          {mRow.inflowsRub > 0 ? `+${fmtMln(mRow.inflowsRub)}` : '0 ₽'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                          {mRow.outflowsRub > 0 ? `−${fmtMln(mRow.outflowsRub)}` : '0 ₽'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-[#15803D] dark:text-emerald-400">
                          {!schedule.wbPayoutScheduleSpecified
                            ? '—'
                            : mRow.reinvestedRub > 0
                            ? fmtMln(mRow.reinvestedRub)
                            : '0 ₽'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                          {!schedule.wbPayoutScheduleSpecified ? (
                            <span className="text-[#5C5953]">—</span>
                          ) : mRow.needToInvestRub > 0 ? (
                            <span className="text-[#B91C1C] dark:text-rose-400">
                              +{fmtMln(mRow.needToInvestRub)}
                            </span>
                          ) : (
                            <span className="text-[#5C5953] font-normal">0 ₽</span>
                          )}
                          {mRow.userCapitalInjectionsRub > 0 && (
                            <div className="text-[10px] font-normal text-[#15803D] dark:text-emerald-400">
                              внесено: +{fmtMln(mRow.userCapitalInjectionsRub)}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-semibold text-[#141413] dark:text-[#F5F4F0]">
                          {fmtMln(mRow.endingFreeCashRub)}
                        </td>
                      </tr>

                      {/* Детализация конкретных операций по датам внутри выбранного месяца */}
                      {isOpen &&
                        (mRow.events.length === 0 ? (
                          <tr className="bg-[#FAF9F6]/40 dark:bg-[#1D1C1A]/40">
                            <td
                              colSpan={6}
                              className="py-2.5 pl-10 pr-4 text-[11.5px] text-[#5C5953]"
                            >
                              В этом месяце нет плановых или фактических денежных операций.
                            </td>
                          </tr>
                        ) : (
                          mRow.events.map((ev) => {
                            const isSelected = selectedOpId === ev.id;
                            const isClickableOp =
                              ev.type === 'factory_payment' ||
                              ev.type === 'other_expense' ||
                              ev.type === 'other_inflow' ||
                              ev.type === 'capital_injection';
                            const statusBadgeTone =
                              ev.status === 'Оплачено'
                                ? 'bg-emerald-500/15 text-[#15803D] dark:text-emerald-300 border-emerald-500/30'
                                : ev.status === 'Утверждено'
                                ? 'bg-[#141413]/8 text-[#141413] dark:bg-white/10 dark:text-[#F5F4F0] border-[#141413]/20'
                                : 'bg-white dark:bg-[#151514] text-[#5C5953] border-[#E4E1DA] dark:border-[#282724]';

                            return (
                              <tr
                                key={ev.id}
                                data-testid={`inv-event-row-${ev.type}`}
                                onClick={() => {
                                  if (isClickableOp) {
                                    setSelectedOpId((prev) =>
                                      prev === ev.id ? null : ev.id
                                    );
                                  }
                                }}
                                className={`text-[11.5px] transition-colors ${
                                  isClickableOp
                                    ? 'cursor-pointer hover:bg-[#EFECE6]/60 dark:hover:bg-[#282724]/60'
                                    : 'bg-[#FAF9F6]/30 dark:bg-[#1D1C1A]/30'
                                } ${
                                  isSelected
                                    ? 'bg-amber-500/10 dark:bg-amber-500/15'
                                    : 'bg-[#FAF9F6]/45 dark:bg-[#1D1C1A]/40'
                                }`}
                              >
                                <td className="py-2 pl-9 pr-3">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono font-semibold text-[#141413] dark:text-[#F5F4F0]">
                                      {formatIsoDateHumanRu(ev.dateIso)}
                                    </span>
                                    {ev.type !== 'wb_inflow' && (
                                      <span
                                        className={`px-1.5 py-0.2 rounded border text-[10px] font-mono ${statusBadgeTone}`}
                                      >
                                        {ev.status}
                                      </span>
                                    )}
                                    {ev.isApprovedLocked && ev.type !== 'wb_inflow' && (
                                      <Lock className="h-3 w-3 text-[#5C5953]" />
                                    )}
                                    <span className="text-[#141413] dark:text-[#F5F4F0] font-medium">
                                      {ev.title}
                                    </span>
                                    {ev.factoryName && (
                                      <span className="text-[#5C5953] dark:text-[#9A968E]">
                                        · {ev.factoryName}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#15803D] dark:text-emerald-400">
                                  {ev.inflowRub > 0 ? `+${fmtRub(ev.inflowRub)}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                                  {ev.outflowRub > 0 ? `−${fmtRub(ev.outflowRub)}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#15803D] dark:text-emerald-400">
                                  {ev.reinvestedFromSalesRub > 0
                                    ? fmtRub(ev.reinvestedFromSalesRub)
                                    : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {ev.userCapitalInjectionRub > 0 ? (
                                    <span className="text-[#15803D] dark:text-emerald-400 font-semibold">
                                      вклад +{fmtRub(ev.userCapitalInjectionRub)}
                                    </span>
                                  ) : ev.needToInvestRub > 0 ? (
                                    <span className="text-[#B91C1C] dark:text-rose-400 font-semibold">
                                      +{fmtRub(ev.needToInvestRub)}
                                    </span>
                                  ) : (
                                    <span className="text-[#5C5953]">0 ₽</span>
                                  )}
                                </td>
                                <td className="py-2 px-3.5 text-right font-mono tabular-nums text-[#141413] dark:text-[#F5F4F0]">
                                  {fmtRub(ev.closingFreeCashRub)}
                                </td>
                              </tr>
                            );
                          })
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#FAF9F6] dark:bg-[#1D1C1A] border-t-2 border-[#E4E1DA] dark:border-[#282724] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                  <td className="py-3 px-3.5">ИТОГО ЗА ПЕРИОД ({schedule.scenarioYear})</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    +{fmtMln(
                      schedule.monthlyCalendarRows.reduce((s, r) => s + r.inflowsRub, 0)
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">
                    −{fmtMln(
                      schedule.monthlyCalendarRows.reduce((s, r) => s + r.outflowsRub, 0)
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-[#15803D] dark:text-emerald-400">
                    {schedule.reinvestedFromSalesRub !== null
                      ? fmtMln(schedule.reinvestedFromSalesRub)
                      : '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-[#B91C1C] dark:text-rose-400">
                    {schedule.additionalOwnMoneyStillNeededRub !== null
                      ? `+${fmtMln(schedule.additionalOwnMoneyStillNeededRub)}`
                      : '—'}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono tabular-nums">
                    {fmtMln(
                      schedule.monthlyCalendarRows[11]?.endingFreeCashRub ?? 0
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* 5. ИНСПЕКТОР СВЯЗАННОЙ ЗАКУПОЧНОЙ ПАРТИИ И РЕДАКТИРОВАНИЕ ИСХОДНОЙ ОПЕРАЦИИ (РАЗДЕЛ 3, 4, 5, 8 ТЗ) */}
        {selectedEvent && (
          <div
            data-testid="inv-operation-inspector"
            className="rounded-xl border border-[#141413]/30 dark:border-[#F5F4F0]/30 bg-[#FAF9F6] dark:bg-[#1D1C1A] p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E4E1DA] dark:border-[#282724] pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-white dark:bg-[#151514] border border-[#E4E1DA] font-mono text-[10.5px] font-semibold uppercase">
                    {selectedEvent.batchDetails
                      ? `Закупочная партия · ${selectedEvent.batchDetails.brandDisplayTitle}`
                      : selectedEvent.type === 'capital_injection'
                      ? 'Собственное вложение капитала'
                      : 'Денежная операция'}
                  </span>
                  <span className="font-mono text-xs font-semibold text-[#141413] dark:text-[#F5F4F0]">
                    Статус: {selectedEvent.status} (
                    {selectedEvent.isFactual ? 'Факт' : 'План'})
                  </span>
                </div>
                <h3 className="mt-1 text-[15px] font-semibold text-[#141413] dark:text-[#F5F4F0]">
                  {selectedEvent.title}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {selectedEvent.batchDetails && (
                  <button
                    type="button"
                    onClick={() =>
                      handleJumpToProcurementBatch(
                        selectedEvent.batchDetails!.modelId,
                        selectedEvent.batchDetails!.brandCode
                      )
                    }
                    className="h-8 px-3 rounded-lg bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] text-xs font-medium text-[#141413] dark:text-[#F5F4F0] inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#EFECE6]"
                  >
                    <span>Открыть в 03 · Закупки</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedOpId(null)}
                  className="h-8 px-2.5 rounded-lg bg-white dark:bg-[#151514] border border-[#E4E1DA] text-xs text-[#5C5953] cursor-pointer"
                >
                  Закрыть ×
                </button>
              </div>
            </div>

            {/* Паспорт закупочной партии (модель, количество, цена, сроки) */}
            {selectedEvent.batchDetails && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-white dark:bg-[#151514] border border-[#E4E1DA] dark:border-[#282724] p-3 text-xs">
                <div>
                  <div className="text-[#5C5953]">Модель SKU</div>
                  <div className="font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5">
                    {selectedEvent.batchDetails.modelCode} —{' '}
                    {selectedEvent.batchDetails.modelTitle}
                  </div>
                  <div className="text-[11px] text-[#5C5953]">
                    Поставщик: {selectedEvent.batchDetails.factoryName}
                  </div>
                </div>
                <div>
                  <div className="text-[#5C5953]">Количество и размеры</div>
                  <div className="font-mono font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5">
                    {selectedEvent.batchDetails.packsQty.toLocaleString('ru-RU')}{' '}
                    {selectedEvent.batchDetails.primaryUnitLabel}
                  </div>
                  {selectedEvent.batchDetails.sizeBreakdownText && (
                    <div className="text-[10.5px] font-mono text-[#5C5953] truncate">
                      {selectedEvent.batchDetails.sizeBreakdownText}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[#5C5953]">Себестоимость и сумма партии</div>
                  <div className="font-mono font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5">
                    {fmtRub(selectedEvent.batchDetails.unitCostRub)} / ед. ·{' '}
                    {fmtMln(selectedEvent.batchDetails.totalBatchCostRub)}
                  </div>
                  <div className="text-[11px] text-[#5C5953]">
                    Условия: {selectedEvent.batchDetails.prepaymentPct}% аванс /{' '}
                    {selectedEvent.batchDetails.balancePaymentPct}% доплата
                  </div>
                </div>
                <div>
                  <div className="text-[#5C5953]">Сроки заказа и поставки</div>
                  <div className="font-mono font-semibold text-[#141413] dark:text-[#F5F4F0] mt-0.5">
                    Заказ: {formatIsoDateHumanRu(selectedEvent.batchDetails.orderDateIso)}
                  </div>
                  <div className="font-mono text-[11px] text-[#5C5953]">
                    Приход: {formatIsoDateHumanRu(selectedEvent.batchDetails.arrivalDateIso)} (
                    {selectedEvent.batchDetails.totalLeadDays} дн.)
                  </div>
                </div>
              </div>
            )}

            {/* Защита утверждённых и фактических операций от случайного изменения */}
            {selectedEvent.isApprovedLocked && !lockedEditConfirmed && canEdit && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-950 dark:text-amber-200">
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>
                    Эта операция имеет защищённый статус{' '}
                    <strong>«{selectedEvent.status}»</strong> и не меняется при автоматическом пересчёте. Для ручной корректировки подтвердите действие (запишется в историю).
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="inv-unlock-approved-btn"
                  onClick={() => setLockedEditConfirmed(true)}
                  className="h-7.5 px-3 rounded-lg bg-[#141413] text-white font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>Подтвердить корректировку</span>
                </button>
              </div>
            )}

            {/* Редактирование платежа фабрике или партии */}
            {canEdit &&
              (!selectedEvent.isApprovedLocked || lockedEditConfirmed) &&
              selectedEvent.batchDetails && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Дата платежа</span>
                      <input
                        type="date"
                        data-testid="inv-edit-payment-date"
                        value={editDateIso}
                        onChange={(e) => setEditDateIso(e.target.value)}
                        className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white font-mono text-[#141413]"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Сумма платежа (₽)</span>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        data-testid="inv-edit-payment-amount"
                        value={editAmountRub}
                        onChange={(e) => setEditAmountRub(e.target.value)}
                        className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white font-mono font-semibold text-[#141413]"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Поставщик (фабрика)</span>
                      <input
                        type="text"
                        list="inv-suppliers-datalist-edit"
                        value={editSupplier}
                        onChange={(e) => setEditSupplier(e.target.value)}
                        className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                      />
                      <datalist id="inv-suppliers-datalist-edit">
                        {schedule.availableSuppliers.map((sup) => (
                          <option key={sup} value={sup} />
                        ))}
                      </datalist>
                    </label>

                    <label className="space-y-1">
                      <span className="text-[#5C5953]">Статус операции</span>
                      <select
                        data-testid="inv-edit-payment-status"
                        value={editStatus}
                        onChange={(e) =>
                          setEditStatus(e.target.value as OperationPaymentStatus)
                        }
                        className="w-full h-8.5 px-2.5 rounded-lg border border-[#E4E1DA] bg-white font-medium text-[#141413]"
                      >
                        <option value="Запланировано">Запланировано</option>
                        <option value="Утверждено">Утверждено</option>
                        <option value="Оплачено">Оплачено</option>
                      </select>
                    </label>

                    <div className="space-y-1">
                      <span className="text-[#5C5953] block">Быстрый перенос</span>
                      <button
                        type="button"
                        data-testid="inv-move-next-month-btn"
                        onClick={() => {
                          const shifted = shiftIsoDateToNextMonth(
                            selectedEvent.dateIso,
                            schedule.scenarioYear
                          );
                          updatePaymentOperation({
                            opKey: selectedEvent.opKey,
                            batchKey: selectedEvent.batchDetails!.batchKey,
                            scenarioScopeKey: selectedEvent.scenarioScopeKey,
                            isApprovedPo: selectedEvent.batchDetails!.isApprovedPo,
                            currentTitle: selectedEvent.purposeShort,
                            beforeSummary: `${formatIsoDateHumanRu(selectedEvent.dateIso)} · ${fmtRub(selectedEvent.amountRub)}`,
                            patch: { customDateIso: shifted, splitTranches: undefined },
                            author: authorName,
                          });
                          const nextMIdx = Math.max(
                            0,
                            Math.min(11, Number(shifted.slice(5, 7)) - 1)
                          );
                          setExpandedMonths((prev) => new Set(prev).add(nextMIdx));
                        }}
                        className="w-full h-8.5 px-2.5 rounded-lg bg-white hover:bg-[#EFECE6] border border-[#E4E1DA] text-[#141413] font-medium cursor-pointer"
                      >
                        Перенести на +1 мес. →
                      </button>
                    </div>
                  </div>

                  {/* Условия предоплаты/доплаты партии и дата самой поставки (с пересчётом дефицита) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#E4E1DA] dark:border-[#282724] text-xs">
                    <div className="space-y-1">
                      <span className="text-[#5C5953] block">
                        Условия предоплаты / доплаты фабрике (%)
                      </span>
                      <div className="flex items-center gap-1.5">
                        {[20, 30, 50, 100].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setEditPrepayPct(String(pct))}
                            className={`h-8 px-2.5 rounded-md border font-mono text-[11px] cursor-pointer ${
                              Number(editPrepayPct) === pct
                                ? 'bg-[#141413] text-white border-[#141413]'
                                : 'bg-white text-[#141413] border-[#E4E1DA]'
                            }`}
                          >
                            {pct}/{100 - pct}%
                          </button>
                        ))}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={editPrepayPct}
                          onChange={(e) => setEditPrepayPct(e.target.value)}
                          className="w-16 h-8 px-2 rounded-md border border-[#E4E1DA] bg-white font-mono text-right"
                        />
                      </div>
                    </div>

                    <label className="space-y-1">
                      <span className="text-[#5C5953] block">
                        Дата поставки партии на склад (пересчёт дефицита)
                      </span>
                      <input
                        type="date"
                        data-testid="inv-edit-arrival-date"
                        value={editArrivalDateIso}
                        onChange={(e) => setEditArrivalDateIso(e.target.value)}
                        className="w-full h-8 px-2.5 rounded-lg border border-[#E4E1DA] bg-white font-mono text-[#141413]"
                      />
                    </label>

                    <div className="flex items-end justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSplitModeOpen((v) => !v)}
                        className="h-8 px-3 rounded-lg bg-white border border-[#E4E1DA] text-[#141413] font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#EFECE6]"
                      >
                        <Split className="h-3.5 w-3.5" />
                        <span>Разбить платёж</span>
                      </button>
                      {selectedEvent.hasManualOverride && (
                        <button
                          type="button"
                          data-testid="inv-undo-single-btn"
                          onClick={() =>
                            undoOperationOverride({
                              opKey: selectedEvent.opKey,
                              batchKey: selectedEvent.batchDetails?.batchKey,
                              scenarioScopeKey: selectedEvent.scenarioScopeKey,
                              operationTitle: selectedEvent.purposeShort,
                              author: authorName,
                            })
                          }
                          className="h-8 px-3 rounded-lg bg-white border border-[#E4E1DA] text-[#5C5953] hover:text-[#141413] font-medium cursor-pointer"
                        >
                          ↺ По плану
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="inv-save-op-btn"
                        onClick={() => {
                          const bd = selectedEvent.batchDetails!;
                          const nextAmt = Math.max(0, Math.round(Number(editAmountRub) || 0));
                          const nextPrepayPct = Math.max(
                            0,
                            Math.min(100, Math.round(Number(editPrepayPct) || 0))
                          );

                          if (
                            nextPrepayPct !== bd.prepaymentPct ||
                            (editArrivalDateIso && editArrivalDateIso !== bd.arrivalDateIso) ||
                            (editSupplier.trim() && editSupplier.trim() !== bd.factoryName)
                          ) {
                            updateBatchTerms({
                              batchKey: bd.batchKey,
                              scenarioScopeKey: selectedEvent.scenarioScopeKey,
                              isApprovedPo: bd.isApprovedPo,
                              batchTitle: `Партия ${bd.modelCode} (${bd.coverageMonthsLabel})`,
                              beforeSummary: `Условия ${bd.prepaymentPct}/${bd.balancePaymentPct}% · приход ${formatIsoDateHumanRu(bd.arrivalDateIso)}`,
                              patch: {
                                customPrepaymentPct: nextPrepayPct,
                                customArrivalDateIso: editArrivalDateIso || undefined,
                                customFactoryName: editSupplier.trim() || undefined,
                              },
                              author: authorName,
                            });
                          }

                          const amountChangedExplicitly = nextAmt !== selectedEvent.amountRub;
                          updatePaymentOperation({
                            opKey: selectedEvent.opKey,
                            batchKey: bd.batchKey,
                            scenarioScopeKey: selectedEvent.scenarioScopeKey,
                            isApprovedPo: bd.isApprovedPo,
                            currentTitle: selectedEvent.purposeShort,
                            beforeSummary: `${formatIsoDateHumanRu(selectedEvent.dateIso)} · ${fmtRub(selectedEvent.amountRub)} (${selectedEvent.status})`,
                            patch: {
                              customDateIso: editDateIso || selectedEvent.dateIso,
                              customAmountRub: amountChangedExplicitly ? nextAmt : undefined,
                              customFactoryName: editSupplier.trim() || undefined,
                              status: editStatus,
                              splitTranches: undefined,
                            },
                            author: authorName,
                          });
                        }}
                        className="h-8 px-4 rounded-lg bg-[#141413] text-white font-medium cursor-pointer hover:opacity-90"
                      >
                        Сохранить
                      </button>
                    </div>
                  </div>

                  {/* Панель дробления одного платежа на несколько траншей */}
                  {splitModeOpen && (
                    <div className="rounded-lg border border-[#E4E1DA] bg-white p-3.5 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#141413]">
                          Разбить платёж ({fmtRub(selectedEvent.amountRub)}) на несколько частей
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSplitDrafts((prev) => [
                              ...prev,
                              {
                                id: `tr-${prev.length + 1}-${Date.now()}`,
                                dateIso: addDaysToIsoDate(
                                  prev[prev.length - 1]?.dateIso || selectedEvent.dateIso,
                                  14
                                ),
                                amountRub: 0,
                                label: `Транш ${prev.length + 1}`,
                                status: editStatus,
                              },
                            ])
                          }
                          className="text-[#141413] font-medium hover:underline cursor-pointer"
                        >
                          + Ещё часть
                        </button>
                      </div>
                      <div className="space-y-2">
                        {splitDrafts.map((tr, idx) => (
                          <div key={tr.id} className="grid grid-cols-12 gap-2 items-center">
                            <input
                              type="text"
                              value={tr.label}
                              onChange={(e) =>
                                setSplitDrafts((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, label: e.target.value } : x
                                  )
                                )
                              }
                              className="col-span-4 h-8 px-2 rounded border border-[#E4E1DA] text-[#141413]"
                            />
                            <input
                              type="date"
                              value={tr.dateIso}
                              onChange={(e) =>
                                setSplitDrafts((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, dateIso: e.target.value } : x
                                  )
                                )
                              }
                              className="col-span-4 h-8 px-2 rounded border border-[#E4E1DA] font-mono text-[#141413]"
                            />
                            <input
                              type="number"
                              min={0}
                              step={10000}
                              value={tr.amountRub}
                              onChange={(e) =>
                                setSplitDrafts((prev) =>
                                  prev.map((x, i) =>
                                    i === idx
                                      ? { ...x, amountRub: Number(e.target.value) || 0 }
                                      : x
                                  )
                                )
                              }
                              className="col-span-3 h-8 px-2 rounded border border-[#E4E1DA] font-mono text-right text-[#141413]"
                            />
                            <button
                              type="button"
                              disabled={splitDrafts.length <= 2}
                              onClick={() =>
                                setSplitDrafts((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="col-span-1 h-8 inline-flex items-center justify-center text-[#5C5953] hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono text-[11px] text-[#5C5953]">
                          Сумма частей:{' '}
                          <strong className="text-[#141413]">
                            {fmtRub(splitDrafts.reduce((s, x) => s + (x.amountRub || 0), 0))}
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const validTranches = splitDrafts.filter(
                              (t) => t.amountRub > 0 && Boolean(t.dateIso)
                            );
                            if (validTranches.length === 0) return;
                            updatePaymentOperation({
                              opKey: selectedEvent.opKey,
                              batchKey: selectedEvent.batchDetails!.batchKey,
                              scenarioScopeKey: selectedEvent.scenarioScopeKey,
                              isApprovedPo: selectedEvent.batchDetails!.isApprovedPo,
                              currentTitle: selectedEvent.purposeShort,
                              beforeSummary: `${formatIsoDateHumanRu(selectedEvent.dateIso)} · ${fmtRub(selectedEvent.amountRub)}`,
                              patch: {
                                splitTranches: validTranches,
                                status: editStatus,
                              },
                              author: authorName,
                            });
                            setSplitModeOpen(false);
                          }}
                          className="h-8 px-3.5 rounded-lg bg-[#141413] text-white font-medium cursor-pointer"
                        >
                          Применить разбивку
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* Управление пользовательской инвестицией или плановой операцией */}
            {canEdit &&
              (!selectedEvent.isApprovedLocked || lockedEditConfirmed) &&
              !selectedEvent.batchDetails && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      value={editDateIso}
                      onChange={(e) => setEditDateIso(e.target.value)}
                      className="h-8 px-2.5 rounded-lg border border-[#E4E1DA] bg-white font-mono text-[#141413]"
                    />
                    <input
                      type="number"
                      min={0}
                      step={50000}
                      value={editAmountRub}
                      onChange={(e) => setEditAmountRub(e.target.value)}
                      className="h-8 w-36 px-2.5 rounded-lg border border-[#E4E1DA] bg-white font-mono font-semibold text-[#141413]"
                    />
                    <select
                      value={editStatus}
                      onChange={(e) =>
                        setEditStatus(e.target.value as OperationPaymentStatus)
                      }
                      className="h-8 px-2.5 rounded-lg border border-[#E4E1DA] bg-white text-[#141413]"
                    >
                      <option value="Запланировано">Запланировано</option>
                      <option value="Утверждено">Утверждено</option>
                      <option value="Оплачено">Оплачено</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const cleanId = selectedEvent.opKey
                          .replace(/^cap-inj::/, '')
                          .replace(/^custom-op::/, '');
                        const nextAmt = Math.max(0, Math.round(Number(editAmountRub) || 0));
                        if (selectedEvent.type === 'capital_injection') {
                          saveCapitalInjection(
                            {
                              id: cleanId,
                              dateIso: editDateIso,
                              amountRub: nextAmt,
                              title: selectedEvent.title,
                              status: editStatus,
                              brandCode: selectedEvent.brandCode,
                            },
                            selectedEvent.scenarioScopeKey,
                            authorName
                          );
                        } else {
                          saveCustomCashOperation(
                            {
                              id: cleanId,
                              kind:
                                selectedEvent.type === 'other_inflow' ? 'inflow' : 'expense',
                              category:
                                selectedEvent.type === 'other_inflow'
                                  ? 'other_inflow'
                                  : 'opex',
                              dateIso: editDateIso,
                              amountRub: nextAmt,
                              title: selectedEvent.title,
                              factoryName: selectedEvent.factoryName,
                              status: editStatus,
                              brandCode: selectedEvent.brandCode,
                            },
                            selectedEvent.scenarioScopeKey,
                            authorName
                          );
                        }
                      }}
                      className="h-8 px-3.5 rounded-lg bg-[#141413] text-white font-medium cursor-pointer"
                    >
                      Обновить
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedEvent.type === 'capital_injection') {
                        removeCapitalInjection(
                          selectedEvent.opKey,
                          selectedEvent.title,
                          authorName
                        );
                      } else {
                        removeCustomCashOperation(
                          selectedEvent.opKey,
                          selectedEvent.title,
                          authorName
                        );
                      }
                      setSelectedOpId(null);
                    }}
                    className="h-8 px-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Удалить операцию</span>
                  </button>
                </div>
              )}
          </div>
        )}

        {/* 6. ЖУРНАЛ ИСТОРИИ ИЗМЕНЕНИЯ ДАТ И СУММ (РАЗДЕЛ 5 и 8 ТЗ) */}
        {showHistoryDrawer && (
          <div className="rounded-xl border border-[#E4E1DA] dark:border-[#282724] bg-[#FAF9F6] dark:bg-[#1D1C1A] p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-[#141413] dark:text-[#F5F4F0]">
                История изменения дат, сумм и статусов ({ledgerState.auditHistory.length})
              </span>
              <button
                type="button"
                onClick={() => setShowHistoryDrawer(false)}
                className="text-[#5C5953] hover:text-[#141413] cursor-pointer"
              >
                Скрыть ×
              </button>
            </div>
            {ledgerState.auditHistory.length === 0 ? (
              <p className="text-[#5C5953]">
                Ручных изменений пока нет — действует автоматический расчёт по плану продаж и закупочным партиям.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto divide-y divide-[#E4E1DA] dark:divide-[#282724]">
                {ledgerState.auditHistory.slice(0, 40).map((entry) => (
                  <div
                    key={entry.id}
                    className="py-2 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold text-[#141413] dark:text-[#F5F4F0]">
                        {entry.operationTitle}
                      </span>{' '}
                      <span className="text-[#5C5953]">
                        ({entry.beforeValue} →{' '}
                        <strong className="text-[#141413] dark:text-[#F5F4F0]">
                          {entry.afterValue}
                        </strong>
                        )
                      </span>
                    </div>
                    <span className="font-mono text-[10.5px] text-[#5C5953]">
                      {entry.author} · {entry.timestampIso.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 7. МОДАЛЬНОЕ ОКНО ПРЕДВАРИТЕЛЬНОГО ПРОСМОТРА «ВЕРНУТЬ РАСЧЁТ ПО ПЛАНУ» (РАЗДЕЛ 5 ТЗ) */}
      {showResetPreviewModal && (
        <div
          className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setShowResetPreviewModal(false)}
        >
          <div
            data-testid="inv-reset-preview-modal"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-xl border border-[#E4E1DA] bg-white p-5 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#5C5953]">
                  Предварительный просмотр изменений
                </div>
                <h3 className="text-base font-semibold text-[#141413] mt-0.5">
                  Вернуть автоматический расчёт по плану?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowResetPreviewModal(false)}
                className="text-[#5C5953] hover:text-[#141413] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3 flex items-center gap-2 text-[#15803D]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Утверждённые заказы фабрикам (<strong>«Утверждено»</strong>) и фактические платежи (<strong>«Оплачено»</strong>) защищены и изменены не будут ({resetPreview.preservedLockedCount} опер.).
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto rounded-lg border border-[#E4E1DA] divide-y divide-[#E4E1DA]">
              {resetPreview.items.map((it) => (
                <div key={it.key} className="p-2.5 space-y-0.5">
                  <div className="font-semibold text-[#141413]">{it.title}</div>
                  <div className="text-[#5C5953]">
                    Сейчас: <span className="font-mono text-amber-800">{it.currentSummary}</span>
                  </div>
                  <div className="text-[#5C5953]">
                    По плану: <span className="font-mono text-[#15803D]">{it.autoPlanSummary}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowResetPreviewModal(false)}
                className="h-8.5 px-3.5 rounded-lg border border-[#E4E1DA] bg-white text-[#141413] font-medium cursor-pointer"
              >
                Оставить ручные корректировки
              </button>
              <button
                type="button"
                data-testid="inv-confirm-reset-btn"
                onClick={() => {
                  confirmResetToAutoPlan(authorName);
                  setShowResetPreviewModal(false);
                }}
                className="h-8.5 px-4 rounded-lg bg-[#141413] text-white font-medium cursor-pointer"
              >
                Подтвердить возврат к плану ({resetPreview.willResetCount})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface InvestmentScheduleModalProps extends InvestmentSchedulePanelProps {
  open: boolean;
  onClose: () => void;
}

export function InvestmentScheduleModal({
  open,
  onClose,
  ...rest
}: InvestmentScheduleModalProps) {
  if (!open) return null;
  return (
    <div
      data-testid="investment-schedule-modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[2px] overflow-y-auto p-3 sm:p-6 flex items-start justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl my-4"
      >
        <InvestmentSchedulePanel {...rest} isModal onCloseModal={onClose} />
      </div>
    </div>
  );
}
